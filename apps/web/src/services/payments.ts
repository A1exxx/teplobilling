import type { PGlite } from '@electric-sql/pglite'
import {
  calcPenalty,
  d,
  type DebtClaim,
  type PaymentEvent,
  type PenaltyResult,
} from '@teplobilling/billing-core'

// Политика пеней v1: ключевая ставка и cap — константы демо (в v2 — таблица key_rate по датам)
const PENALTY_POLICY = { keyRatePercent: '16', capPercent: '9.5' }

/** Срок оплаты требования: 15-е число месяца, следующего за расчетным (177-ФЗ, с 01.03.2026). */
function dueDateFor(year: number, month: number): string {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  return `${next.y}-${String(next.m).padStart(2, '0')}-15`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoPaymentsSummary {
  historyAccruals: number
  payments: number
  paidTotal: string
}

/**
 * Демо-история денег: копирует июльские начисления в закрытые май/июнь (история для сальдо)
 * и генерирует оплаты: ~83% платят всё, ~10% недоплачивают июнь, ~7% не платят —
 * появляются живые должники и пени по майскому сроку оплаты.
 */
export async function seedDemoPayments(pg: PGlite): Promise<DemoPaymentsSummary> {
  const existing = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM payment`)
  if ((existing.rows[0]?.n ?? 0) > 0) throw new Error('Оплаты уже загружены')

  const current = await pg.query<{ account_id: string; total: string; account_number: string }>(
    `SELECT ac.account_id, ac.total_amount::text AS total, a.account_number
     FROM accrual ac JOIN account a ON a.id = ac.account_id
     JOIN billing_period bp ON bp.id = ac.period_id
     WHERE ac.is_current AND bp.month = 7 AND bp.year = 2026`,
  )
  if (current.rows.length === 0) throw new Error('Сначала рассчитайте период (июль)')

  const periods = await pg.query<{ id: string; month: number }>(
    `SELECT id, month FROM billing_period WHERE year = 2026 AND month IN (5, 6)`,
  )
  const may = periods.rows.find((p) => p.month === 5)
  const june = periods.rows.find((p) => p.month === 6)
  if (!may || !june) throw new Error('Нет периодов мая/июня')

  const run = await pg.query<{ id: string }>(
    `INSERT INTO calc_run (tenant_id, period_id, status, engine_version, accounts_total, accounts_calculated, finished_at)
     SELECT tenant_id, $1, 'done', 'demo-history', $2, $2, now() FROM billing_period WHERE id = $1
     RETURNING id`,
    [may.id, current.rows.length],
  )
  const runId = (run.rows[0] as { id: string }).id

  const rnd = mulberry32(20260718)
  let historyAccruals = 0
  let payments = 0
  let paidTotal = d(0)

  await pg.exec('BEGIN')
  try {
    for (const row of current.rows) {
      // история начислений: май и июнь = те же суммы, что июль (лето, ГВС стабильна)
      for (const period of [may, june]) {
        await pg.query(
          `INSERT INTO accrual (tenant_id, account_id, period_id, calc_run_id, total_amount, doc_type)
           SELECT tenant_id, $1, $2, $3, $4, 'regular' FROM billing_period WHERE id = $2`,
          [row.account_id, period.id, runId, row.total],
        )
        historyAccruals += 1
      }

      const fate = rnd()
      const addPayment = async (amount: string, payDate: string) => {
        await pg.query(
          `INSERT INTO payment (tenant_id, account_id, amount, pay_date, source, doc_no)
           SELECT tenant_id, $1, $2, $3, 'demo', $4 FROM account WHERE id = $1`,
          [row.account_id, amount, payDate, `Д-${row.account_number}-${payDate.slice(5, 7)}`],
        )
        payments += 1
        paidTotal = paidTotal.plus(d(amount))
      }

      if (fate < 0.83) {
        // добросовестные: май и июнь оплачены полностью
        await addPayment(row.total, '2026-06-08')
        await addPayment(row.total, '2026-07-08')
      } else if (fate < 0.93) {
        // май полностью, июнь — 60%
        await addPayment(row.total, '2026-06-08')
        await addPayment(d(row.total).times('0.6').toFixed(2), '2026-07-10')
      }
      // остальные ~7% не платили вовсе — должники с майской просрочкой
    }
    await pg.exec('COMMIT')
  } catch (error) {
    await pg.exec('ROLLBACK')
    throw error
  }

  return { historyAccruals, payments, paidTotal: paidTotal.toFixed(2) }
}

export interface AccountMoney {
  claims: Array<{ periodLabel: string; dueDate: string; accrued: string; paid: string; outstanding: string }>
  payments: Array<{ pay_date: string; amount: string; source: string; doc_no: string | null }>
  balance: string
  penalty: PenaltyResult
}

/** Деньги одного ЛС: требования по периодам, оплаты, ФИФО-остатки, пеня на сегодня. */
export async function getAccountMoney(pg: PGlite, accountId: string): Promise<AccountMoney> {
  const [accruals, paymentsRes] = await Promise.all([
    pg.query<{ year: number; month: number; total: string }>(
      `SELECT bp.year, bp.month, ac.total_amount::text AS total
       FROM accrual ac JOIN billing_period bp ON bp.id = ac.period_id
       WHERE ac.account_id = $1 AND ac.is_current ORDER BY bp.year, bp.month`,
      [accountId],
    ),
    pg.query<{ pay_date: string; amount: string; source: string; doc_no: string | null }>(
      `SELECT pay_date::text AS pay_date, amount::text AS amount, source, doc_no
       FROM payment WHERE account_id = $1 ORDER BY pay_date`,
      [accountId],
    ),
  ])

  const claims: DebtClaim[] = accruals.rows.map((a) => ({
    periodLabel: `${a.year}-${String(a.month).padStart(2, '0')}`,
    dueDate: dueDateFor(a.year, a.month),
    amount: a.total,
  }))
  const events: PaymentEvent[] = paymentsRes.rows.map((p) => ({ date: p.pay_date, amount: p.amount }))
  const penalty = calcPenalty(claims, events, today(), PENALTY_POLICY)

  const accruedTotal = claims.reduce((s, c) => s.plus(d(c.amount)), d(0))
  const paidTotal = events.reduce((s, p) => s.plus(d(p.amount)), d(0))

  return {
    claims: penalty.claims.map((c) => ({
      periodLabel: c.periodLabel,
      dueDate: c.dueDate,
      accrued: c.claimAmount,
      paid: c.paidTotal,
      outstanding: c.outstanding,
    })),
    payments: paymentsRes.rows,
    balance: accruedTotal.minus(paidTotal).toFixed(2),
    penalty,
  }
}

export interface DebtorRow {
  account_id: string
  account_number: string
  address_text: string | null
  owner: string | null
  debt: string
  oldestDue: string
  overdueDays: number
  penalty: string
}

/** Должники: положительное сальдо, просрочка и расчетная пеня на сегодня. */
export async function listDebtors(pg: PGlite): Promise<DebtorRow[]> {
  const { rows } = await pg.query<{
    account_id: string
    account_number: string
    address_text: string | null
    owner: string | null
    year: number
    month: number
    total: string
  }>(
    `SELECT ac.account_id, a.account_number, b.address_text,
            COALESCE(c.full_name, c.last_name || ' ' || c.first_name || ' ' || c.middle_name) AS owner,
            bp.year, bp.month, ac.total_amount::text AS total
     FROM accrual ac
     JOIN account a ON a.id = ac.account_id
     JOIN premise p ON p.id = a.premise_id
     JOIN building b ON b.id = p.building_id
     JOIN billing_period bp ON bp.id = ac.period_id
     LEFT JOIN account_customer acc ON acc.account_id = a.id AND acc.role = 'owner' AND acc.date_to IS NULL
     LEFT JOIN customer c ON c.id = acc.customer_id
     WHERE ac.is_current ORDER BY a.account_number, bp.year, bp.month`,
  )
  const paymentsAll = await pg.query<{ account_id: string; pay_date: string; amount: string }>(
    `SELECT account_id, pay_date::text AS pay_date, amount::text AS amount FROM payment`,
  )
  const paymentsByAccount = new Map<string, PaymentEvent[]>()
  for (const p of paymentsAll.rows) {
    const list = paymentsByAccount.get(p.account_id) ?? []
    list.push({ date: p.pay_date, amount: p.amount })
    paymentsByAccount.set(p.account_id, list)
  }

  const byAccount = new Map<string, { meta: (typeof rows)[number]; claims: DebtClaim[] }>()
  for (const row of rows) {
    let entry = byAccount.get(row.account_id)
    if (!entry) {
      entry = { meta: row, claims: [] }
      byAccount.set(row.account_id, entry)
    }
    entry.claims.push({
      periodLabel: `${row.year}-${String(row.month).padStart(2, '0')}`,
      dueDate: dueDateFor(row.year, row.month),
      amount: row.total,
    })
  }

  const asOf = today()
  const debtors: DebtorRow[] = []
  for (const [accountId, { meta, claims }] of byAccount) {
    const events = paymentsByAccount.get(accountId) ?? []
    const result = calcPenalty(claims, events, asOf, PENALTY_POLICY)
    // должник = есть остаток по требованию с НАСТУПИВШИМ сроком оплаты
    const debtors_claims = result.claims.filter((c) => d(c.outstanding).gt(0) && c.dueDate < asOf)
    if (debtors_claims.length === 0) continue
    const debt = debtors_claims.reduce((s, c) => s.plus(d(c.outstanding)), d(0))
    const oldest = debtors_claims[0] as (typeof debtors_claims)[number]
    const overdueDays = Math.max(
      0,
      Math.round((Date.parse(asOf) - Date.parse(oldest.dueDate)) / 86_400_000),
    )
    debtors.push({
      account_id: accountId,
      account_number: meta.account_number,
      address_text: meta.address_text,
      owner: meta.owner,
      debt: debt.toFixed(2),
      oldestDue: oldest.dueDate,
      overdueDays,
      penalty: result.total,
    })
  }
  return debtors.sort((a, b) => Number(b.debt) - Number(a.debt))
}

export interface CsvImportResult {
  accepted: number
  acceptedTotal: string
  quarantine: Array<{ line: number; raw: string; error: string }>
}

/** Импорт реестра оплат CSV: "лицевой_счет;сумма;дата(ГГГГ-ММ-ДД)". Ошибочные строки — в карантин. */
export async function importPaymentsCsv(pg: PGlite, text: string): Promise<CsvImportResult> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const quarantine: CsvImportResult['quarantine'] = []
  let accepted = 0
  let acceptedTotal = d(0)

  const accounts = await pg.query<{ id: string; account_number: string }>(
    `SELECT id, account_number FROM account`,
  )
  const byNumber = new Map(accounts.rows.map((a) => [a.account_number, a.id]))

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string
    if (i === 0 && /лиц|счет|account/i.test(raw)) continue // заголовок
    const parts = raw.split(/[;,\t]/).map((s) => s.trim())
    const [accountNumber, amountRaw, dateRaw] = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '']
    const accountId = byNumber.get(accountNumber)
    if (!accountId) {
      quarantine.push({ line: i + 1, raw, error: `ЛС «${accountNumber}» не найден` })
      continue
    }
    const amount = amountRaw.replace(',', '.').replace(/\s/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      quarantine.push({ line: i + 1, raw, error: `Некорректная сумма «${amountRaw}»` })
      continue
    }
    const date = dateRaw || today()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      quarantine.push({ line: i + 1, raw, error: `Некорректная дата «${dateRaw}» (нужен ГГГГ-ММ-ДД)` })
      continue
    }
    await pg.query(
      `INSERT INTO payment (tenant_id, account_id, amount, pay_date, source)
       SELECT tenant_id, $1, $2, $3, 'csv' FROM account WHERE id = $1`,
      [accountId, amount, date],
    )
    accepted += 1
    acceptedTotal = acceptedTotal.plus(d(amount))
  }
  return { accepted, acceptedTotal: acceptedTotal.toFixed(2), quarantine }
}

export interface ClosePeriodResult {
  closed: { year: number; month: number }
  next: { year: number; month: number }
  snapshots: number
}

/** Закрытие рассчитанного периода: снапшот сальдо по каждому ЛС, статус closed, открытие следующего. */
export async function closePeriod(pg: PGlite): Promise<ClosePeriodResult> {
  const periodRes = await pg.query<{ id: string; year: number; month: number; tenant_id: string }>(
    `SELECT id, year, month, tenant_id FROM billing_period WHERE status = 'calculated'
     ORDER BY year, month LIMIT 1`,
  )
  const period = periodRes.rows[0]
  if (!period) throw new Error('Нет рассчитанного периода — сначала выполните расчет')

  const monthStart = `${period.year}-${String(period.month).padStart(2, '0')}-01`
  const next = period.month === 12 ? { year: period.year + 1, month: 1 } : { year: period.year, month: period.month + 1 }
  const nextStart = `${next.year}-${String(next.month).padStart(2, '0')}-01`

  await pg.exec('BEGIN')
  try {
    const snapshots = await pg.query<{ n: number }>(
      `WITH prior AS (
         SELECT account_id, closing FROM account_balance ab
         JOIN billing_period bp ON bp.id = ab.period_id
         WHERE (bp.year, bp.month) = (
           SELECT year, month FROM billing_period
           WHERE (year * 12 + month) < ($2 * 12 + $3) AND id IN (SELECT period_id FROM account_balance)
           ORDER BY year DESC, month DESC LIMIT 1)
       ),
       accrued AS (
         SELECT account_id, sum(total_amount) AS s FROM accrual
         WHERE period_id = $1 AND is_current GROUP BY account_id
       ),
       paid AS (
         SELECT account_id, sum(amount) AS s FROM payment
         WHERE pay_date >= $4::date AND pay_date < $5::date GROUP BY account_id
       )
       INSERT INTO account_balance (tenant_id, account_id, period_id, opening, accrued, paid, closing)
       SELECT a.tenant_id, a.id, $1,
              COALESCE(pr.closing, 0),
              COALESCE(ac.s, 0),
              COALESCE(pd.s, 0),
              COALESCE(pr.closing, 0) + COALESCE(ac.s, 0) - COALESCE(pd.s, 0)
       FROM account a
       LEFT JOIN prior pr ON pr.account_id = a.id
       LEFT JOIN accrued ac ON ac.account_id = a.id
       LEFT JOIN paid pd ON pd.account_id = a.id
       WHERE a.date_close IS NULL
       RETURNING 1 AS n`,
      [period.id, period.year, period.month, monthStart, nextStart],
    )
    await pg.query(`UPDATE billing_period SET status = 'closed' WHERE id = $1`, [period.id])
    await pg.query(
      `INSERT INTO billing_period (tenant_id, year, month, status)
       VALUES ($1, $2, $3, 'open')
       ON CONFLICT DO NOTHING`,
      [period.tenant_id, next.year, next.month],
    )
    await pg.exec('COMMIT')
    return {
      closed: { year: period.year, month: period.month },
      next,
      snapshots: snapshots.rows.length,
    }
  } catch (error) {
    await pg.exec('ROLLBACK')
    throw error
  }
}

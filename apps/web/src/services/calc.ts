import type { PGlite } from '@electric-sql/pglite'
import {
  calcAccount,
  d,
  type CalcInput,
  type CalcParams,
  type NormVersion,
  type PeriodRef,
  type TariffVersion,
} from '@teplobilling/billing-core'

// Параметры расчета v1 (в v2 переедут в reg_parameter с версиями по датам)
const PARAMS: CalcParams = {
  hotWaterUplift: '1.5',
  ipuTechnicallyPossible: true, // МКД: техвозможность установки ИПУ считаем подтвержденной
  heatingUniformK: '0.583333', // отопительный период 7 месяцев / 12
  minPeriodsForAverage: 3,
  vatRate: '0.20',
}

export interface CalcPeriodResult {
  calcRunId: string
  accounts: number
  linesTotal: number
  totalAmount: string
  errors: Array<{ account: string; error: string }>
}

interface AccountSnapshotRow {
  id: string
  account_number: string
  kind: 'residential' | 'legal'
  premise_id: string
  area: string | null
  building_id: string
  total_premises_area: string | null
  category_code: string | null
  hw_system: 'central_closed' | 'central_open' | 'none'
  heating_payment_mode: 'during_season' | 'uniform_year'
  residents: number
  owners: number
}

/** Пакетный расчет открытого периода: снапшот → чистое ядро → запись документами. */
export async function calcPeriod(pg: PGlite): Promise<CalcPeriodResult> {
  const periodRow = await pg.query<{ id: string; year: number; month: number }>(
    `SELECT id, year, month FROM billing_period WHERE status IN ('open','calculated') ORDER BY year, month LIMIT 1`,
  )
  const period = periodRow.rows[0]
  if (!period) throw new Error('Нет открытого расчетного периода')
  const periodRef: PeriodRef = { year: period.year, month: period.month }
  const isHeatingSeason = period.month >= 10 || period.month <= 4

  // Снапшот: 5 bulk-запросов на весь тираж
  const [accounts, tariffs, norms, meters, odpu] = await Promise.all([
    pg.query<AccountSnapshotRow>(
      `SELECT a.id, a.account_number, a.kind, p.id AS premise_id, p.total_area::text AS area,
              b.id AS building_id, b.total_premises_area::text AS total_premises_area,
              b.category_code, b.hw_system, b.heating_payment_mode,
              (SELECT count(*)::int FROM account_resident r
                WHERE r.account_id = a.id AND r.date_to IS NULL) AS residents,
              (SELECT count(*)::int FROM account_customer ac
                WHERE ac.account_id = a.id AND ac.role = 'owner' AND ac.date_to IS NULL) AS owners
       FROM account a
       JOIN premise p ON p.id = a.premise_id
       JOIN building b ON b.id = p.building_id
       WHERE a.date_close IS NULL`,
    ),
    pg.query<{
      service: 'heating' | 'hot_water'
      consumer_category: 'population' | 'other'
      component: 'single' | 'hw_cold_water' | 'hw_heat_energy'
      value: string
      vat_mode: 'included' | 'on_top' | 'none'
      valid_from: string
      valid_to: string | null
    }>(
      `SELECT service, consumer_category, component, value::text AS value, vat_mode,
              valid_from::text AS valid_from, valid_to::text AS valid_to FROM tariff`,
    ),
    pg.query<{
      kind: 'heating_gcal_m2' | 'hw_m3_person' | 'hw_heat_gcal_m3'
      category_code: string | null
      value: string
      valid_from: string
      valid_to: string | null
    }>(
      `SELECT kind, category_code, value::text AS value,
              valid_from::text AS valid_from, valid_to::text AS valid_to FROM norm`,
    ),
    pg.query<{
      premise_id: string
      status: 'active' | 'verification_expired' | 'broken' | 'removed'
      digits: number
      year: number
      month: number
      value: string | null
    }>(
      `SELECT m.premise_id, m.status, m.digits, bp.year, bp.month, r.value::text AS value
       FROM meter m
       LEFT JOIN meter_reading r ON r.meter_id = m.id AND r.status = 'accepted'
       LEFT JOIN billing_period bp ON bp.id = r.period_id
       WHERE m.kind = 'ipu_hw' AND m.status <> 'removed'
       ORDER BY m.premise_id, bp.year, bp.month`,
    ),
    pg.query<{ building_id: string; consumption: string }>(
      `SELECT m.building_id, r.consumption::text AS consumption
       FROM meter m
       JOIN meter_reading r ON r.meter_id = m.id AND r.status = 'accepted' AND r.period_id = $1
       WHERE m.kind = 'odpu_heat'`,
      [period.id],
    ),
  ])

  const tariffVersions: TariffVersion[] = tariffs.rows.map((t) => ({
    service: t.service,
    consumerCategory: t.consumer_category,
    component: t.component,
    value: t.value,
    vatMode: t.vat_mode,
    validFrom: t.valid_from,
    validTo: t.valid_to,
  }))
  const normVersions: NormVersion[] = norms.rows.map((n) => ({
    kind: n.kind,
    categoryCode: n.category_code,
    value: n.value,
    validFrom: n.valid_from,
    validTo: n.valid_to,
  }))

  const metersByPremise = new Map<string, { status: AccountSnapshotRow['kind'] extends never ? never : 'active' | 'verification_expired' | 'broken' | 'removed'; digits: number; readings: Array<{ period: PeriodRef; value: string }> }>()
  for (const row of meters.rows) {
    let entry = metersByPremise.get(row.premise_id)
    if (!entry) {
      entry = { status: row.status, digits: row.digits, readings: [] }
      metersByPremise.set(row.premise_id, entry)
    }
    if (row.value !== null && row.year !== null) {
      entry.readings.push({ period: { year: row.year, month: row.month }, value: row.value })
    }
  }
  const odpuByBuilding = new Map(odpu.rows.map((r) => [r.building_id, r.consumption]))

  // Журнал запуска
  const run = await pg.query<{ id: string }>(
    `INSERT INTO calc_run (tenant_id, period_id, accounts_total)
     SELECT tenant_id, $1, $2 FROM billing_period WHERE id = $1 RETURNING id`,
    [period.id, accounts.rows.length],
  )
  const calcRunId = (run.rows[0] as { id: string }).id

  const errors: Array<{ account: string; error: string }> = []
  let linesTotal = 0
  let grandTotal = d(0)
  let calculated = 0

  await pg.exec('BEGIN')
  try {
    // повторный расчет: прежние документы периода перестают быть актуальными
    await pg.query(`UPDATE accrual SET is_current = false WHERE period_id = $1 AND is_current`, [period.id])

    for (const row of accounts.rows) {
      try {
        const meter = metersByPremise.get(row.premise_id)
        const input: CalcInput = {
          period: periodRef,
          account: {
            accountNumber: row.account_number,
            kind: row.kind,
            area: row.area ?? '0',
            ownersCount: row.owners,
            occupancy:
              row.residents > 0
                ? [{ count: row.residents, dateFrom: '0000-01-01', dateTo: null }]
                : [],
            hotWaterMeter: meter ?? null,
          },
          house: {
            odpuConsumption: odpuByBuilding.get(row.building_id) ?? null,
            hasOdpu: odpuByBuilding.has(row.building_id),
            totalPremisesArea: row.total_premises_area ?? '1',
            categoryCode: row.category_code,
            hwSystem: row.hw_system,
            heatingPaymentMode: row.heating_payment_mode,
            isHeatingSeason,
          },
          tariffs: tariffVersions,
          norms: normVersions,
          params: PARAMS,
        }
        const result = calcAccount(input)

        const accrualRow = await pg.query<{ id: string }>(
          `INSERT INTO accrual (tenant_id, account_id, period_id, calc_run_id, total_amount)
           SELECT tenant_id, $1, $2, $3, $4 FROM billing_period WHERE id = $2 RETURNING id`,
          [row.id, period.id, calcRunId, result.total],
        )
        const accrualId = (accrualRow.rows[0] as { id: string }).id
        for (const line of result.lines) {
          await pg.query(
            `INSERT INTO accrual_line (tenant_id, accrual_id, service, component, method, line_kind,
               date_from, date_to, volume, unit, rate, amount, trace)
             SELECT tenant_id, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
             FROM accrual WHERE id = $1`,
            [
              accrualId,
              line.service,
              line.component,
              line.method,
              line.lineKind,
              line.dateFrom,
              line.dateTo,
              line.volume,
              line.unit,
              line.rate,
              line.amount,
              JSON.stringify(line.trace),
            ],
          )
        }
        linesTotal += result.lines.length
        grandTotal = grandTotal.plus(d(result.total))
        calculated += 1
      } catch (error) {
        errors.push({ account: row.account_number, error: String(error) })
      }
    }

    await pg.query(`UPDATE billing_period SET status = 'calculated' WHERE id = $1`, [period.id])
    await pg.query(
      `UPDATE calc_run SET status = 'done', accounts_calculated = $2, errors = $3, finished_at = now() WHERE id = $1`,
      [calcRunId, calculated, JSON.stringify(errors)],
    )
    await pg.exec('COMMIT')
  } catch (error) {
    await pg.exec('ROLLBACK')
    await pg.query(`UPDATE calc_run SET status = 'failed', errors = $2, finished_at = now() WHERE id = $1`, [
      calcRunId,
      JSON.stringify([{ account: '*', error: String(error) }]),
    ])
    throw error
  }

  return { calcRunId, accounts: calculated, linesTotal, totalAmount: grandTotal.toFixed(2), errors }
}

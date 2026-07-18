import { d, Decimal, roundKopecks } from './money'
import type { TraceStep } from './model'

/**
 * Пени физлиц по ч.14 ст.155 ЖК РФ (CALC-SPEC §1.5) — интервальный event-движок.
 * Дни 1-30 от срока оплаты — 0; 31-90 — 1/300 ставки в день; 91+ — 1/130.
 * Ставка = min(ключевая на дату расчета; cap 9,5% — ПП №329, до 01.01.2027).
 * Оплаты разносятся ФИФО по требованиям (ст. 319.1 ГК) и уменьшают остаток
 * со дня, СЛЕДУЮЩЕГО за днем оплаты; сам день оплаты входит в период по остатку до оплаты.
 * Никаких «долг × дни × ставка» одним умножением.
 */

export interface DebtClaim {
  /** Метка периода, например "2026-05" */
  periodLabel: string
  /** Срок оплаты (с 01.03.2026 по 177-ФЗ — 15-е число следующего месяца) */
  dueDate: string
  /** Сумма требования, руб */
  amount: string
}

export interface PaymentEvent {
  date: string
  amount: string
}

export interface PenaltyPolicy {
  /** Ключевая ставка ЦБ, % годовых, напр. "16" */
  keyRatePercent: string
  /** Потолок ставки для пеней, % (льгота до 01.01.2027), напр. "9.5"; null = без потолка */
  capPercent: string | null
}

export interface ClaimPenalty {
  periodLabel: string
  dueDate: string
  claimAmount: string
  paidTotal: string
  outstanding: string
  penalty: string
  trace: TraceStep[]
}

export interface PenaltyResult {
  asOf: string
  ratePercent: string
  total: string
  claims: ClaimPenalty[]
}

function toUtc(date: string): number {
  const [y, m, dd] = date.split('-').map(Number)
  return Date.UTC(y as number, (m as number) - 1, dd as number)
}

function addDays(date: string, days: number): string {
  const t = new Date(toUtc(date) + days * 86_400_000)
  return t.toISOString().slice(0, 10)
}

function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
}

interface Reduction {
  /** Остаток уменьшается начиная с этой даты (день, следующий за днем оплаты) */
  effectiveFrom: string
  amount: Decimal
}

/** ФИФО: оплаты гасят требования от старейшего; возвращает погашения по каждому требованию. */
export function allocatePaymentsFifo(
  claims: DebtClaim[],
  payments: PaymentEvent[],
): Map<string, Reduction[]> {
  const orderedClaims = [...claims].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const orderedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date))
  const remaining = new Map(orderedClaims.map((c) => [c.periodLabel, d(c.amount)]))
  const reductions = new Map<string, Reduction[]>(orderedClaims.map((c) => [c.periodLabel, []]))

  for (const payment of orderedPayments) {
    let left = d(payment.amount)
    for (const claim of orderedClaims) {
      if (left.lte(0)) break
      const rest = remaining.get(claim.periodLabel) as Decimal
      if (rest.lte(0)) continue
      const applied = Decimal.min(rest, left)
      remaining.set(claim.periodLabel, rest.minus(applied))
      left = left.minus(applied)
      reductions.get(claim.periodLabel)?.push({ effectiveFrom: addDays(payment.date, 1), amount: applied })
    }
    // переплата сверх всех требований пеней не касается
  }
  return reductions
}

/** Расчет пеней на дату asOf по всем требованиям с учетом частичных оплат. */
export function calcPenalty(
  claims: DebtClaim[],
  payments: PaymentEvent[],
  asOf: string,
  policy: PenaltyPolicy,
): PenaltyResult {
  const key = d(policy.keyRatePercent)
  const rate = policy.capPercent === null ? key : Decimal.min(key, d(policy.capPercent))
  const dailyBase = rate.div(100)
  const reductions = allocatePaymentsFifo(claims, payments)

  const result: ClaimPenalty[] = []
  let total = d(0)

  for (const claim of [...claims].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const claimReductions = reductions.get(claim.periodLabel) ?? []
    const paidTotal = claimReductions.reduce((s, r) => s.plus(r.amount), d(0))
    const trace: TraceStep[] = []

    // события: пороги 31-го и 91-го дня, каждое уменьшение остатка, конец расчета
    const day31 = addDays(claim.dueDate, 31)
    const day91 = addDays(claim.dueDate, 91)
    const cutSet = new Set<string>([day31, day91, addDays(asOf, 1)])
    for (const r of claimReductions) cutSet.add(r.effectiveFrom)
    const cuts = [...cutSet].filter((c) => c > day31 || c === day31).sort()

    let penalty = d(0)
    let prev = day31
    for (const cut of cuts) {
      if (cut <= prev) continue
      if (prev > asOf) break
      const to = cut > addDays(asOf, 1) ? addDays(asOf, 1) : cut
      const days = diffDays(prev, to)
      if (days > 0) {
        // остаток на интервале = требование минус погашения, вступившие в силу до начала интервала
        const reduced = claimReductions
          .filter((r) => r.effectiveFrom <= prev)
          .reduce((s, r) => s.plus(r.amount), d(0))
        const outstanding = d(claim.amount).minus(reduced)
        if (outstanding.gt(0)) {
          const fraction = prev >= day91 ? d(1).div(130) : d(1).div(300)
          const add = outstanding.times(dailyBase).times(fraction).times(days)
          penalty = penalty.plus(add)
          trace.push({
            rule: prev >= day91 ? '1/130 ставки (с 91-го дня)' : '1/300 ставки (31-90 день)',
            detail: `${days} дн. × остаток ${outstanding.toFixed(2)} × ${rate.toFixed(2)}%/${prev >= day91 ? '130' : '300'}`,
            values: { с: prev, по: addDays(to, -1), пеня: add.toFixed(4) },
          })
        }
      }
      prev = cut
    }

    const rounded = roundKopecks(penalty)
    const outstanding = d(claim.amount).minus(paidTotal)
    total = total.plus(rounded)
    result.push({
      periodLabel: claim.periodLabel,
      dueDate: claim.dueDate,
      claimAmount: d(claim.amount).toFixed(2),
      paidTotal: paidTotal.toFixed(2),
      outstanding: (outstanding.gt(0) ? outstanding : d(0)).toFixed(2),
      penalty: rounded.toFixed(2),
      trace,
    })
  }

  return { asOf, ratePercent: rate.toFixed(2), total: total.toFixed(2), claims: result }
}

import { describe, expect, it } from 'vitest'
import { calcPenalty, type DebtClaim } from '../src/penalty'

// Эталоны посчитаны независимо (Python decimal): ставка min(16%, cap 9.5%) = 9.5%.
const POLICY = { keyRatePercent: '16', capPercent: '9.5' }

const claim = (periodLabel: string, dueDate: string, amount: string): DebtClaim => ({
  periodLabel,
  dueDate,
  amount,
})

describe('Пени ч.14 ст.155 ЖК РФ — интервальный движок', () => {
  it('P1: без оплат — 60 дней 1/300 + 2 дня 1/130 (день оплаты/расчета включается)', () => {
    const result = calcPenalty([claim('2026-05', '2026-06-15', '1000')], [], '2026-09-15', POLICY)
    expect(result.ratePercent).toBe('9.50')
    expect(result.total).toBe('20.46')
    expect(result.claims[0]?.outstanding).toBe('1000.00')
  })

  it('P2: частичная оплата уменьшает базу со следующего дня', () => {
    const result = calcPenalty(
      [claim('2026-05', '2026-06-15', '1000')],
      [{ date: '2026-08-01', amount: '400' }],
      '2026-09-15',
      POLICY,
    )
    expect(result.total).toBe('14.43')
    expect(result.claims[0]?.paidTotal).toBe('400.00')
    expect(result.claims[0]?.outstanding).toBe('600.00')
  })

  it('P3: ФИФО — оплата гасит старейшее требование первым', () => {
    const result = calcPenalty(
      [claim('2026-06', '2026-07-15', '700'), claim('2026-05', '2026-06-15', '500')],
      [{ date: '2026-08-10', amount: '600' }],
      '2026-09-15',
      POLICY,
    )
    const may = result.claims.find((c) => c.periodLabel === '2026-05')
    const june = result.claims.find((c) => c.periodLabel === '2026-06')
    expect(may?.penalty).toBe('4.12')
    expect(may?.outstanding).toBe('0.00')
    expect(june?.penalty).toBe('6.08')
    expect(june?.outstanding).toBe('600.00')
    expect(result.total).toBe('10.20')
  })

  it('P4: границы льготного периода — 30-й день 0, 31-й день одна трехсотая', () => {
    const zero = calcPenalty([claim('2026-05', '2026-06-15', '1000')], [], '2026-07-15', POLICY)
    expect(zero.total).toBe('0.00')
    const first = calcPenalty([claim('2026-05', '2026-06-15', '1000')], [], '2026-07-16', POLICY)
    expect(first.total).toBe('0.32')
  })

  it('ставка без потолка — берется ключевая', () => {
    const result = calcPenalty(
      [claim('2026-05', '2026-06-15', '1000')],
      [],
      '2026-07-16',
      { keyRatePercent: '16', capPercent: null },
    )
    expect(result.ratePercent).toBe('16.00')
  })

  it('полная оплата до 31-го дня — пени нет; мораторий переплаты не создает отрицательных значений', () => {
    const result = calcPenalty(
      [claim('2026-05', '2026-06-15', '1000')],
      [{ date: '2026-07-01', amount: '1500' }],
      '2026-12-31',
      POLICY,
    )
    expect(result.total).toBe('0.00')
    expect(result.claims[0]?.outstanding).toBe('0.00')
  })
})

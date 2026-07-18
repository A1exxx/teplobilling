import Decimal from 'decimal.js'

// Политика точности ядра (docs/CALC-SPEC.md §2):
// промежуточные значения не округляются (precision 28),
// итог строки — копейки, ROUND_HALF_UP, ровно одна точка округления.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export { Decimal }

export type Money = Decimal

/** Итог строки в копейках-точности: единственная точка округления. */
export function roundKopecks(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

export function d(value: string | number | Decimal): Decimal {
  return new Decimal(value)
}

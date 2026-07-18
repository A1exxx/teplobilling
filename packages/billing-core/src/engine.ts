import { calcHeating } from './methods/heating'
import { calcHotWater } from './methods/hot-water'
import { d } from './money'
import type { CalcInput, CalcResult } from './model'

/** Расчет начислений одного лицевого счета за период: отопление + ГВС, строки с трейсом. */
export function calcAccount(input: CalcInput): CalcResult {
  const lines = [...calcHeating(input), ...calcHotWater(input)]
  const total = lines.reduce((sum, line) => sum.plus(d(line.amount)), d(0))
  return {
    accountNumber: input.account.accountNumber,
    period: input.period,
    lines,
    total: total.toFixed(2),
  }
}

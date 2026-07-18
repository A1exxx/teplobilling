import { d, roundKopecks } from '../money'
import {
  daysInMonth,
  periodEndExclusive,
  periodStart,
  resolveVersions,
  type AccrualLine,
  type CalcInput,
  type TraceStep,
} from '../model'
import { splitMonth } from '../splitter'

/**
 * Начисление за отопление (каталог H-*, CALC-SPEC §1.1).
 * Реализованные в v1 случаи: H-00 (вне сезона при оплате по факту — строк нет),
 * H-01 (ф.2: норматив в сезон), H-02 (ф.2(1): норматив × K равномерно за год),
 * H-04 (ф.3: доля объема ОДПУ по площади).
 * Для домов с ОДПУ при равномерной оплате без истории прошлого года применяется
 * H-02 с пометкой в трейсе (упрощение v1 до появления годовой истории — см. CALC-SPEC H-05).
 */
export function calcHeating(input: CalcInput): AccrualLine[] {
  const { account, house, period, params } = input
  const versions = resolveVersions(input.tariffs, input.norms)
  const category = account.kind === 'legal' ? 'other' : 'population'
  const days = daysInMonth(period)

  // H-00: вне отопительного периода при оплате «в отопительный период» начисления нет
  if (house.heatingPaymentMode === 'during_season' && !house.isHeatingSeason) return []

  const boundaries = input.tariffs.map((t) => t.validFrom).concat(input.norms.map((n) => n.validFrom))
  const segments = splitMonth(period, [{ count: 1, dateFrom: '0000-01-01', dateTo: null }], boundaries)

  const lines: AccrualLine[] = []

  for (const segment of segments) {
    const onDate = segment.dateFrom
    const tariff = versions.tariff('heating', 'single', category, onDate)
    if (!tariff) continue

    let volume: ReturnType<typeof d>
    const trace: TraceStep[] = []

    if (house.heatingPaymentMode === 'during_season' && house.hasOdpu && house.odpuConsumption !== null) {
      // H-04, ф.3: доля от объема ОДПУ пропорционально площади
      volume = d(house.odpuConsumption)
        .times(d(account.area))
        .div(d(house.totalPremisesArea))
        .times(segment.days)
        .div(days)
      trace.push({
        rule: 'ф.3 прил. 2 ПП 354',
        detail: 'Объем по ОДПУ × (площадь помещения / площадь всех помещений дома)',
        values: {
          V_ОДПУ_Гкал: house.odpuConsumption,
          S_помещения: account.area,
          S_дома: house.totalPremisesArea,
          объем_Гкал: volume.toString(),
        },
      })
    } else {
      const norm = versions.norm('heating_gcal_m2', house.categoryCode, onDate)
      if (!norm) continue
      if (house.heatingPaymentMode === 'uniform_year') {
        // H-02, ф.2(1): Si × NT × K
        volume = d(account.area).times(d(norm.value)).times(d(params.heatingUniformK)).times(segment.days).div(days)
        trace.push({
          rule: 'ф.2(1) прил. 2 ПП 354',
          detail: `Норматив × коэффициент периодичности K=${params.heatingUniformK} (оплата равномерно в течение года)`,
          values: { S_м2: account.area, норматив: norm.value, объем_Гкал: volume.toString() },
        })
        if (house.hasOdpu) {
          trace.push({
            rule: 'упрощение v1 (см. CALC-SPEC H-05)',
            detail: 'Дом с ОДПУ: до накопления годовой истории объем принят по нормативу × K; годовая корректировка по ф.3(4) сверит с фактом',
          })
        }
      } else {
        // H-01, ф.2: Si × NT в отопительный период
        volume = d(account.area).times(d(norm.value)).times(segment.days).div(days)
        trace.push({
          rule: 'ф.2 прил. 2 ПП 354',
          detail: 'Норматив на площадь помещения (оплата в отопительный период)',
          values: { S_м2: account.area, норматив: norm.value, объем_Гкал: volume.toString() },
        })
      }
    }

    const amount = roundKopecks(volume.times(d(tariff.value)))
    lines.push({
      service: 'heating',
      component: 'single',
      method:
        house.heatingPaymentMode === 'during_season' && house.hasOdpu && house.odpuConsumption !== null
          ? 'H-04_odpu_share'
          : house.heatingPaymentMode === 'uniform_year'
            ? 'H-02_norm_uniform'
            : 'H-01_norm_season',
      lineKind: 'accrual',
      dateFrom: segment.dateFrom,
      dateTo: segment.dateTo,
      volume: volume.toFixed(6),
      unit: 'Gcal',
      rate: tariff.value,
      amount: amount.toFixed(2),
      trace,
    })

    if (tariff.vatMode === 'on_top') {
      const vat = roundKopecks(amount.times(d(params.vatRate)))
      lines.push({
        service: 'heating',
        component: 'single',
        method: 'H-01_norm_season',
        lineKind: 'vat',
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        volume: '0',
        unit: 'Gcal',
        rate: params.vatRate,
        amount: vat.toFixed(2),
        trace: [{ rule: 'НДС', detail: `НДС ${d(params.vatRate).times(100).toFixed(0)}% сверх тарифа (категория «прочие потребители»)` }],
      })
    }
  }

  return lines
}

export { periodStart, periodEndExclusive }

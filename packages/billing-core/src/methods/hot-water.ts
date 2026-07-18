import { d, roundKopecks, type Decimal } from '../money'
import {
  daysInMonth,
  resolveVersions,
  type AccrualLine,
  type CalcInput,
  type MethodId,
  type TraceStep,
} from '../model'
import { splitMonth } from '../splitter'

interface VolumePlan {
  method: MethodId
  /** null = объем нормативный, считается по сегментам жильцов; иначе месячный факт/среднее */
  monthlyVolume: Decimal | null
  uplift: boolean
  trace: TraceStep[]
}

const periodIndex = (p: { year: number; month: number }) => p.year * 12 + p.month

/** Определение способа расчета объема ГВС (каталог W-*, CALC-SPEC §1.2). */
function planVolume(input: CalcInput): VolumePlan {
  const { account, params, period } = input
  const meter = account.hotWaterMeter
  const trace: TraceStep[] = []

  if (meter && meter.status === 'verification_expired') {
    trace.push({
      rule: 'п. 59(а), 60 ПП 354',
      detail: 'Межповерочный интервал ИПУ истек — прибор считается вышедшим из строя; расчет по нормативу с повышающим коэффициентом',
    })
    return { method: 'W-05_verification_expired', monthlyVolume: null, uplift: true, trace }
  }

  if (meter && meter.status === 'active') {
    const current = meter.readings.find((r) => periodIndex(r.period) === periodIndex(period))
    const prior = meter.readings
      .filter((r) => periodIndex(r.period) < periodIndex(period))
      .sort((a, b) => periodIndex(a.period) - periodIndex(b.period))

    if (current && prior.length > 0) {
      const prev = prior[prior.length - 1] as (typeof prior)[number]
      let volume = d(current.value).minus(d(prev.value))
      if (volume.isNegative()) {
        const rollover = d(10).pow(meter.digits)
        volume = volume.plus(rollover)
        trace.push({
          rule: 'переход через ноль',
          detail: `Показание уменьшилось — счетчик прошел через ноль (${meter.digits} разрядов)`,
          values: { прибавлено: rollover.toString() },
        })
      }
      trace.push({
        rule: 'п. 42 ПП 354, ф.1 (объем по ИПУ)',
        detail: 'Объем = разность показаний за расчетный период',
        values: { текущее: current.value, предыдущее: prev.value, объем_м3: volume.toString() },
      })
      return { method: 'W-01_meter', monthlyVolume: volume, uplift: false, trace }
    }

    if (prior.length >= params.minPeriodsForAverage + 1) {
      // среднемесячный: размах показаний / число межпериодных интервалов
      const first = prior[0] as (typeof prior)[number]
      const last = prior[prior.length - 1] as (typeof prior)[number]
      const spans = periodIndex(last.period) - periodIndex(first.period)
      const avg = d(last.value).minus(d(first.value)).div(spans)
      trace.push({
        rule: 'п. 59(б) ПП 354',
        detail: `Показания не переданы — расчет по среднемесячному объему за ${spans} мес. (не более 3 периодов подряд)`,
        values: { среднемесячный_м3: avg.toString() },
      })
      return { method: 'W-04_no_readings_avg', monthlyVolume: avg, uplift: false, trace }
    }

    trace.push({
      rule: 'п. 59(б), 60 ПП 354',
      detail: `Показания не переданы, истории прибора недостаточно для среднемесячного (менее ${params.minPeriodsForAverage} периодов) — расчет по нормативу без повышающего коэффициента`,
    })
    return { method: 'W-04_no_readings_norm', monthlyVolume: null, uplift: false, trace }
  }

  if (params.ipuTechnicallyPossible) {
    trace.push({
      rule: 'п. 42 ПП 354, ф.4 + Кпов',
      detail: 'ИПУ отсутствует при наличии технической возможности установки — норматив с повышающим коэффициентом',
    })
    return { method: 'W-02_norm_uplift', monthlyVolume: null, uplift: true, trace }
  }

  trace.push({
    rule: 'п. 42 ПП 354, ф.4',
    detail: 'ИПУ отсутствует, техническая возможность установки не подтверждена — норматив без коэффициента',
  })
  return { method: 'W-03_norm', monthlyVolume: null, uplift: false, trace }
}

/** Начисление за горячую воду: объем (W-*) → деньги (D-1 однокомпонентный / D-2 двухкомпонентный). */
export function calcHotWater(input: CalcInput): AccrualLine[] {
  const { account, house, period, params } = input
  const versions = resolveVersions(input.tariffs, input.norms)
  const category = account.kind === 'legal' ? 'other' : 'population'
  const days = daysInMonth(period)

  const plan = planVolume(input)
  let method = plan.method

  // Занятость: при нуле зарегистрированных нормативный расчет идет по собственникам (п. 56(2))
  let occupancy = account.occupancy
  const hasResidents = occupancy.some((o) => o.count > 0)
  if (plan.monthlyVolume === null && !hasResidents) {
    occupancy = [{ count: account.ownersCount, dateFrom: '0000-01-01', dateTo: null }]
    plan.trace.push({
      rule: 'п. 56(2) ПП 354',
      detail: `Зарегистрированных нет — расчет по числу собственников (${account.ownersCount})`,
    })
    if (plan.method === 'W-02_norm_uplift') method = 'W-07_by_owners'
  }

  // Сегментация месяца: границы жильцов + границы версий тарифов/нормативов внутри месяца
  const boundaries: string[] = []
  for (const t of input.tariffs) boundaries.push(t.validFrom)
  for (const n of input.norms) boundaries.push(n.validFrom)
  const segments = splitMonth(period, occupancy, boundaries)

  const lines: AccrualLine[] = []
  const upliftFactor = d(params.hotWaterUplift).minus(1)

  for (const segment of segments) {
    const onDate = segment.dateFrom
    const norm = versions.norm('hw_m3_person', null, onDate)
    const tariffSingle = versions.tariff('hot_water', 'single', category, onDate)
    const tariffCold = versions.tariff('hot_water', 'hw_cold_water', category, onDate)
    const tariffHeat = versions.tariff('hot_water', 'hw_heat_energy', category, onDate)
    const heatNorm = versions.norm('hw_heat_gcal_m3', null, onDate)

    if (!tariffSingle && !(tariffCold && tariffHeat)) continue // тариф ГВС для категории не установлен

    // Объем сегмента
    let volume: Decimal
    const segTrace: TraceStep[] = [...plan.trace]
    if (plan.monthlyVolume !== null) {
      volume = plan.monthlyVolume.times(segment.days).div(days)
      if (segments.length > 1) {
        segTrace.push({
          rule: 'пропорция дней',
          detail: `Доля месячного объема за ${segment.days} из ${days} дней`,
          values: { объем_м3: volume.toString() },
        })
      }
    } else {
      if (!norm || segment.occupancy === 0) continue
      volume = d(norm.value).times(segment.occupancy).times(segment.days).div(days)
      segTrace.push({
        rule: 'норматив',
        detail: `${segment.occupancy} чел. × ${norm.value} м³/чел × ${segment.days}/${days} дней`,
        values: { объем_м3: volume.toString() },
      })
    }

    const twoComponent = Boolean(tariffCold && tariffHeat)
    const carrierLabel = house.hwSystem === 'central_open' ? 'теплоноситель' : 'холодная вода'

    if (twoComponent && tariffCold && tariffHeat && heatNorm) {
      // D-2: компонент ХВ/теплоноситель
      lines.push({
        service: 'hot_water',
        component: 'hw_cold_water',
        method,
        lineKind: 'accrual',
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        volume: volume.toFixed(6),
        unit: 'm3',
        rate: tariffCold.value,
        amount: roundKopecks(volume.times(d(tariffCold.value))).toFixed(2),
        trace: [
          ...segTrace,
          {
            rule: 'ф.23 ПП 354, компонент 1',
            detail: `Компонент «${carrierLabel}»: объем × тариф компонента`,
            values: { тариф: tariffCold.value },
          },
        ],
      })
      if (plan.uplift) {
        lines.push({
          service: 'hot_water',
          component: 'hw_cold_water',
          method,
          lineKind: 'uplift',
          dateFrom: segment.dateFrom,
          dateTo: segment.dateTo,
          volume: volume.times(upliftFactor).toFixed(6),
          unit: 'm3',
          rate: tariffCold.value,
          amount: roundKopecks(volume.times(upliftFactor).times(d(tariffCold.value))).toFixed(2),
          trace: [
            {
              rule: 'п. 42 ПП 354 (Кпов)',
              detail: `Повышающий коэффициент ${params.hotWaterUplift} — только к компоненту холодной воды`,
            },
          ],
        })
      }
      // D-2: компонент тепловой энергии (Кпов не применяется)
      const heatVolume = volume.times(d(heatNorm.value))
      lines.push({
        service: 'hot_water',
        component: 'hw_heat_energy',
        method,
        lineKind: 'accrual',
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        volume: heatVolume.toFixed(6),
        unit: 'Gcal',
        rate: tariffHeat.value,
        amount: roundKopecks(heatVolume.times(d(tariffHeat.value))).toFixed(2),
        trace: [
          ...segTrace,
          {
            rule: 'ф.23 ПП 354, компонент 2',
            detail: `Тепло на подогрев: объем × ${heatNorm.value} Гкал/м³ (региональный норматив, НЕ фактический расход) × тариф`,
            values: { тариф: tariffHeat.value },
          },
        ],
      })
    } else if (tariffSingle) {
      lines.push({
        service: 'hot_water',
        component: 'single',
        method,
        lineKind: 'accrual',
        dateFrom: segment.dateFrom,
        dateTo: segment.dateTo,
        volume: volume.toFixed(6),
        unit: 'm3',
        rate: tariffSingle.value,
        amount: roundKopecks(volume.times(d(tariffSingle.value))).toFixed(2),
        trace: [...segTrace, { rule: 'однокомпонентный тариф', detail: 'объем × тариф ГВС' }],
      })
      if (plan.uplift) {
        lines.push({
          service: 'hot_water',
          component: 'single',
          method,
          lineKind: 'uplift',
          dateFrom: segment.dateFrom,
          dateTo: segment.dateTo,
          volume: volume.times(upliftFactor).toFixed(6),
          unit: 'm3',
          rate: tariffSingle.value,
          amount: roundKopecks(volume.times(upliftFactor).times(d(tariffSingle.value))).toFixed(2),
          trace: [{ rule: 'п. 42 ПП 354 (Кпов)', detail: `Повышающий коэффициент ${params.hotWaterUplift}` }],
        })
      }
    }
  }

  return lines
}

import type { Decimal } from './money'

/** Расчетный месяц. Дни считаются по фактическому календарю. */
export interface PeriodRef {
  year: number
  month: number // 1-12
}

export function daysInMonth(period: PeriodRef): number {
  return new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()
}

export function periodStart(period: PeriodRef): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}-01`
}

export function periodEndExclusive(period: PeriodRef): string {
  const next = period.month === 12 ? { year: period.year + 1, month: 1 } : { year: period.year, month: period.month + 1 }
  return periodStart(next)
}

export type ServiceCode = 'heating' | 'hot_water'
export type TariffComponent = 'single' | 'hw_cold_water' | 'hw_heat_energy'
export type ConsumerCategory = 'population' | 'other'

export interface TariffVersion {
  service: ServiceCode
  consumerCategory: ConsumerCategory
  component: TariffComponent
  /** руб за единицу (Гкал или м³) */
  value: string
  vatMode: 'included' | 'on_top' | 'none'
  validFrom: string // YYYY-MM-DD
  validTo: string | null
}

export type NormKind = 'heating_gcal_m2' | 'hw_m3_person' | 'hw_heat_gcal_m3'

export interface NormVersion {
  kind: NormKind
  categoryCode: string | null
  value: string
  validFrom: string
  validTo: string | null
}

export interface OccupancyInterval {
  /** Число зарегистрированных, действует [dateFrom, dateTo) */
  count: number
  dateFrom: string
  dateTo: string | null
}

export interface MeterReadingInfo {
  period: PeriodRef
  /** Кумулятивное показание, м³ */
  value: string
}

export interface HotWaterMeterInfo {
  status: 'active' | 'verification_expired' | 'broken' | 'removed'
  digits: number
  /** Принятые показания по периодам, включая текущий, по возрастанию периода */
  readings: MeterReadingInfo[]
}

export interface AccountInput {
  accountNumber: string
  kind: 'residential' | 'legal'
  /** Площадь помещения, м² */
  area: string
  ownersCount: number
  occupancy: OccupancyInterval[]
  hotWaterMeter: HotWaterMeterInfo | null
}

export interface HouseInput {
  /** Гкал по ОДПУ за расчетный месяц; null = ОДПУ нет или показаний нет */
  odpuConsumption: string | null
  hasOdpu: boolean
  /** Σ площадей всех помещений дома, м² */
  totalPremisesArea: string
  categoryCode: string | null
  hwSystem: 'central_closed' | 'central_open' | 'none'
  heatingPaymentMode: 'during_season' | 'uniform_year'
  /** Входит ли расчетный месяц в отопительный период */
  isHeatingSeason: boolean
}

export interface CalcParams {
  /** Повышающий коэффициент ГВС при отсутствии ИПУ при техвозможности (п.42), напр. "1.5" */
  hotWaterUplift: string
  /** Считаем ли техвозможность установки ИПУ подтвержденной (МКД по умолчанию — да) */
  ipuTechnicallyPossible: boolean
  /** K = месяцы отопительного периода / 12, для способа «равномерно за год», напр. "0.583333" (7/12) */
  heatingUniformK: string
  /** Минимум периодов истории для расчета по среднемесячному (п.59) */
  minPeriodsForAverage: number
  /** Ставка НДС для тарифов «сверху» (юрлица), напр. "0.20" */
  vatRate: string
}

export interface CalcInput {
  period: PeriodRef
  account: AccountInput
  house: HouseInput
  tariffs: TariffVersion[]
  norms: NormVersion[]
  params: CalcParams
}

export type MethodId =
  | 'H-01_norm_season' // ф.2: норматив, оплата в отопительный период
  | 'H-02_norm_uniform' // ф.2(1): норматив × K, равномерно за год
  | 'H-04_odpu_share' // ф.3: доля от объема ОДПУ по площади
  | 'H-00_off_season' // вне отопительного периода при оплате по сезону — 0
  | 'W-01_meter' // ИПУ: разность показаний
  | 'W-04_no_readings_norm' // непередача показаний, истории < минимума → норматив без Кпов
  | 'W-04_no_readings_avg' // непередача показаний → среднемесячный
  | 'W-02_norm_uplift' // нет ИПУ, техвозможность есть → норматив × Кпов
  | 'W-03_norm' // нет ИПУ, техвозможности нет → норматив
  | 'W-05_verification_expired' // истекла поверка → норматив × Кпов
  | 'W-07_by_owners' // нет зарегистрированных → по собственникам

export interface TraceStep {
  rule: string
  detail: string
  values?: Record<string, string>
}

export interface AccrualLine {
  service: ServiceCode
  component: TariffComponent
  method: MethodId
  lineKind: 'accrual' | 'uplift' | 'vat'
  dateFrom: string
  dateTo: string // exclusive
  volume: string
  unit: 'Gcal' | 'm3'
  rate: string
  amount: string // руб, копейки
  trace: TraceStep[]
}

export interface CalcResult {
  accountNumber: string
  period: PeriodRef
  lines: AccrualLine[]
  total: string
}

export interface ResolvedVersions {
  tariff: (service: ServiceCode, component: TariffComponent, category: ConsumerCategory, onDate: string) => TariffVersion | null
  norm: (kind: NormKind, categoryCode: string | null, onDate: string) => NormVersion | null
}

/** Версия справочника, действующая на дату (интервалы [validFrom, validTo]). */
export function resolveVersions(tariffs: TariffVersion[], norms: NormVersion[]): ResolvedVersions {
  const active = (from: string, to: string | null, onDate: string) => from <= onDate && (to === null || onDate <= to)
  return {
    tariff: (service, component, category, onDate) =>
      tariffs.find(
        (t) => t.service === service && t.component === component && t.consumerCategory === category && active(t.validFrom, t.validTo, onDate),
      ) ?? null,
    norm: (kind, categoryCode, onDate) =>
      norms.find((n) => n.kind === kind && n.categoryCode === categoryCode && active(n.validFrom, n.validTo, onDate)) ??
      norms.find((n) => n.kind === kind && n.categoryCode === null && active(n.validFrom, n.validTo, onDate)) ??
      null,
  }
}

export interface DaySegment {
  dateFrom: string // включительно
  dateTo: string // исключительно
  days: number
  occupancy: number
}

export type { Decimal }

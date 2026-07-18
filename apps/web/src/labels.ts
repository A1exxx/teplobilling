export const SERVICE_LABELS: Record<string, string> = {
  heating: 'Отопление',
  hot_water: 'Горячая вода',
}

export const COMPONENT_LABELS: Record<string, string> = {
  single: 'единый',
  hw_cold_water: 'компонент: холодная вода',
  hw_heat_energy: 'компонент: тепловая энергия',
}

export const CATEGORY_LABELS: Record<string, string> = {
  population: 'население',
  other: 'прочие потребители',
}

export const VAT_LABELS: Record<string, string> = {
  included: 'НДС в тарифе',
  on_top: 'НДС сверху',
  none: 'без НДС',
}

export const NORM_KIND_LABELS: Record<string, string> = {
  heating_gcal_m2: 'Отопление, Гкал/м² в месяц',
  hw_m3_person: 'ГВС, м³ на человека в месяц',
  hw_heat_gcal_m3: 'Тепло на подогрев, Гкал/м³',
}

export const HW_SYSTEM_LABELS: Record<string, string> = {
  central_closed: 'закрытая',
  central_open: 'открытая',
  none: 'нет ГВС',
}

export const HEATING_MODE_LABELS: Record<string, string> = {
  during_season: 'в отопительный период',
  uniform_year: 'равномерно за год (1/12)',
}

export const CATEGORY_CODE_LABELS: Record<string, string> = {
  mkd_do_1999: 'МКД до 1999 г.',
  mkd_posle_1999: 'МКД после 1999 г.',
}

export const METER_STATUS_LABELS: Record<string, string> = {
  active: 'исправен',
  verification_expired: 'истекла поверка',
  broken: 'неисправен',
  removed: 'снят',
}

export const METHOD_LABELS: Record<string, string> = {
  'H-01_norm_season': 'Отопление: норматив (в отопительный период), ф.2',
  'H-02_norm_uniform': 'Отопление: норматив × K (равномерно за год), ф.2(1)',
  'H-04_odpu_share': 'Отопление: доля от ОДПУ по площади, ф.3',
  'H-00_off_season': 'Отопление: вне отопительного периода',
  'W-01_meter': 'ГВС: по показаниям ИПУ',
  'W-02_norm_uplift': 'ГВС: норматив × Кпов 1,5 (ИПУ нет)',
  'W-03_norm': 'ГВС: норматив (техвозможности установки ИПУ нет)',
  'W-04_no_readings_norm': 'ГВС: показания не переданы — норматив (истории мало)',
  'W-04_no_readings_avg': 'ГВС: показания не переданы — среднемесячный (п.59)',
  'W-05_verification_expired': 'ГВС: истекла поверка — норматив × Кпов (п.59-60)',
  'W-07_by_owners': 'ГВС: по числу собственников (п.56(2))',
}

export const LINE_KIND_LABELS: Record<string, string> = {
  accrual: 'начисление',
  uplift: 'повышающий коэффициент',
  vat: 'НДС',
}

export const MONTH_LABELS = [
  '',
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

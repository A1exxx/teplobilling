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

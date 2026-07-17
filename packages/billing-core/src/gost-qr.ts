import Decimal from 'decimal.js'

/**
 * Строка платежного QR-кода по ГОСТ Р 56042-2014 для квитанции ЖКУ (п. 69 ПП №354).
 * Заголовок ST00012: формат 0001, кодировка 2 (UTF-8). Разделитель «|».
 * Sum по ГОСТ передается в копейках.
 */
export interface GostQrRequisites {
  /** Наименование получателя платежа */
  name: string
  /** Расчетный счет получателя, 20 цифр */
  personalAcc: string
  /** Наименование банка получателя */
  bankName: string
  /** БИК, 9 цифр */
  bic: string
  /** Корреспондентский счет банка, 20 цифр */
  correspAcc: string
  /** Сумма платежа в рублях (например "2412.07") — в QR уйдет в копейках */
  sumRubles?: string
  /** ИНН получателя */
  payeeInn?: string
  /** КПП получателя */
  kpp?: string
  /** Лицевой счет абонента */
  persAcc?: string
  /** Период оплаты в формате ММГГГГ */
  paymPeriod?: string
  /** Назначение платежа */
  purpose?: string
}

const HEADER = 'ST00012'
const SEPARATOR = '|'

/** Перевод суммы в рублях в целые копейки для поля Sum. */
export function rublesToKopecks(rubles: string): string {
  const amount = new Decimal(rubles)
  if (amount.isNegative()) {
    throw new Error(`Сумма не может быть отрицательной: ${rubles}`)
  }
  if (amount.decimalPlaces() > 2) {
    throw new Error(`Сумма содержит доли копейки: ${rubles}`)
  }
  return amount.times(100).toFixed(0)
}

function assertNoSeparator(field: string, value: string): void {
  if (value.includes(SEPARATOR)) {
    throw new Error(`Реквизит ${field} содержит символ-разделитель «${SEPARATOR}»: ${value}`)
  }
}

function requireField(field: string, value: string): string {
  if (value === '') {
    throw new Error(`Обязательный реквизит ${field} пуст`)
  }
  assertNoSeparator(field, value)
  return value
}

function requireDigits(field: string, value: string, length: number, label = field): string {
  if (!new RegExp(`^\\d{${length}}$`).test(value)) {
    throw new Error(`${label} должен состоять из ${length} цифр: «${value}» (${field})`)
  }
  return value
}

/** Собирает строку QR по ГОСТ Р 56042-2014: обязательные реквизиты в фиксированном порядке, затем дополнительные. */
export function buildGostQrString(requisites: GostQrRequisites): string {
  const pairs: Array<[string, string]> = [
    ['Name', requireField('Name', requisites.name)],
    ['PersonalAcc', requireDigits('PersonalAcc', requireField('PersonalAcc', requisites.personalAcc), 20)],
    ['BankName', requireField('BankName', requisites.bankName)],
    ['BIC', requireDigits('BIC', requireField('BIC', requisites.bic), 9, 'БИК')],
    ['CorrespAcc', requireDigits('CorrespAcc', requireField('CorrespAcc', requisites.correspAcc), 20)],
  ]

  const optional: Array<[string, string | undefined]> = [
    ['Sum', requisites.sumRubles === undefined ? undefined : rublesToKopecks(requisites.sumRubles)],
    ['PayeeINN', requisites.payeeInn],
    ['KPP', requisites.kpp],
    ['PersAcc', requisites.persAcc],
    ['PaymPeriod', requisites.paymPeriod],
    ['Purpose', requisites.purpose],
  ]
  for (const [key, value] of optional) {
    if (value !== undefined) {
      assertNoSeparator(key, value)
      pairs.push([key, value])
    }
  }

  return [HEADER, ...pairs.map(([key, value]) => `${key}=${value}`)].join(SEPARATOR)
}

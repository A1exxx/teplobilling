import { describe, expect, it } from 'vitest'
import { buildGostQrString, rublesToKopecks } from '../src/gost-qr'

// ГОСТ Р 56042-2014: строка платежного QR для квитанции.
// Заголовок ST00012 = формат 0001, кодировка 2 (UTF-8), разделитель «|».
// Обязательные реквизиты: Name, PersonalAcc (20 цифр), BankName, BIC (9 цифр), CorrespAcc (20 цифр).
// Sum — ВСЕГДА в копейках (1234.56 руб → 123456).

const requisites = {
  name: 'МУП "Тепловые сети"',
  personalAcc: '40702810900000012345',
  bankName: 'ПАО Сбербанк',
  bic: '044525225',
  correspAcc: '30101810400000000225',
}

describe('rublesToKopecks', () => {
  it('переводит рубли с копейками в целые копейки', () => {
    expect(rublesToKopecks('1234.56')).toBe('123456')
  })

  it('целые рубли — добавляет два нуля', () => {
    expect(rublesToKopecks('1500')).toBe('150000')
  })

  it('одна цифра после запятой — дополняет до копеек', () => {
    expect(rublesToKopecks('99.5')).toBe('9950')
  })

  it('ноль — "0"', () => {
    expect(rublesToKopecks('0')).toBe('0')
  })

  it('отвергает отрицательную сумму', () => {
    expect(() => rublesToKopecks('-1')).toThrow(/отрицательн/i)
  })

  it('отвергает дробные копейки', () => {
    expect(() => rublesToKopecks('10.001')).toThrow(/копе/i)
  })
})

describe('buildGostQrString', () => {
  it('собирает минимальную строку: заголовок + 5 обязательных реквизитов в фиксированном порядке', () => {
    expect(buildGostQrString(requisites)).toBe(
      'ST00012|Name=МУП "Тепловые сети"|PersonalAcc=40702810900000012345|BankName=ПАО Сбербанк|BIC=044525225|CorrespAcc=30101810400000000225',
    )
  })

  it('добавляет дополнительные реквизиты после обязательных, Sum — в копейках', () => {
    const qr = buildGostQrString({
      ...requisites,
      sumRubles: '2412.07',
      payeeInn: '3628001234',
      persAcc: '100200300',
      paymPeriod: '062026',
      purpose: 'Оплата ЖКУ за июнь 2026, ЛС 100200300',
    })
    expect(qr).toBe(
      'ST00012|Name=МУП "Тепловые сети"|PersonalAcc=40702810900000012345|BankName=ПАО Сбербанк|BIC=044525225|CorrespAcc=30101810400000000225' +
        '|Sum=241207|PayeeINN=3628001234|PersAcc=100200300|PaymPeriod=062026|Purpose=Оплата ЖКУ за июнь 2026, ЛС 100200300',
    )
  })

  it('отвергает БИК не из 9 цифр', () => {
    expect(() => buildGostQrString({ ...requisites, bic: '04452522' })).toThrow(/БИК/)
  })

  it('отвергает расчетный счет не из 20 цифр', () => {
    expect(() => buildGostQrString({ ...requisites, personalAcc: '123' })).toThrow(/PersonalAcc/)
  })

  it('отвергает корсчет не из 20 цифр', () => {
    expect(() => buildGostQrString({ ...requisites, correspAcc: '0' })).toThrow(/CorrespAcc/)
  })

  it('отвергает значение с разделителем «|»', () => {
    expect(() => buildGostQrString({ ...requisites, name: 'МУП|Тепло' })).toThrow(/разделител/i)
  })

  it('отвергает пустое обязательное поле', () => {
    expect(() => buildGostQrString({ ...requisites, bankName: '' })).toThrow(/BankName/)
  })
})

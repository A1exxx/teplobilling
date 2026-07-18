import { describe, expect, it } from 'vitest'
import { calcAccount } from '../src/engine'
import { d } from '../src/money'
import type { AccrualLine, CalcInput, HotWaterMeterInfo, TariffVersion } from '../src/model'

// Эталоны посчитаны НЕЗАВИСИМО (Python decimal, ROUND_HALF_UP) — см. коммит.
// Демо-справочники июля 2026: ХВ-компонент 49.19, ТЭ 2371.72, q_кр 0.0611,
// норматив ГВС 3.19 м³/чел, Кпов 1.5, отопление 0.0195/0.016 Гкал/м², K 7/12.

const TARIFFS: TariffVersion[] = [
  { service: 'heating', consumerCategory: 'population', component: 'single', value: '2280.50', vatMode: 'included', validFrom: '2026-01-01', validTo: '2026-06-30' },
  { service: 'heating', consumerCategory: 'population', component: 'single', value: '2371.72', vatMode: 'included', validFrom: '2026-07-01', validTo: null },
  { service: 'hot_water', consumerCategory: 'population', component: 'hw_cold_water', value: '49.19', vatMode: 'included', validFrom: '2026-07-01', validTo: null },
  { service: 'hot_water', consumerCategory: 'population', component: 'hw_heat_energy', value: '2371.72', vatMode: 'included', validFrom: '2026-07-01', validTo: null },
  { service: 'heating', consumerCategory: 'other', component: 'single', value: '2756.00', vatMode: 'on_top', validFrom: '2026-07-01', validTo: null },
]

const NORMS = [
  { kind: 'hw_m3_person' as const, categoryCode: null, value: '3.19', validFrom: '2017-07-01', validTo: null },
  { kind: 'hw_heat_gcal_m3' as const, categoryCode: null, value: '0.0611', validFrom: '2017-07-01', validTo: null },
  { kind: 'heating_gcal_m2' as const, categoryCode: 'mkd_do_1999', value: '0.0195', validFrom: '2017-07-01', validTo: null },
  { kind: 'heating_gcal_m2' as const, categoryCode: 'mkd_posle_1999', value: '0.016', validFrom: '2017-07-01', validTo: null },
]

const PARAMS = {
  hotWaterUplift: '1.5',
  ipuTechnicallyPossible: true,
  heatingUniformK: '0.583333',
  minPeriodsForAverage: 3,
  vatRate: '0.20',
}

function makeInput(overrides: {
  area?: string
  occupancy?: CalcInput['account']['occupancy']
  owners?: number
  meter?: HotWaterMeterInfo | null
  kind?: 'residential' | 'legal'
  house?: Partial<CalcInput['house']>
  period?: CalcInput['period']
  tariffs?: TariffVersion[]
  params?: Partial<CalcInput['params']>
}): CalcInput {
  return {
    period: overrides.period ?? { year: 2026, month: 7 },
    account: {
      accountNumber: '1000001',
      kind: overrides.kind ?? 'residential',
      area: overrides.area ?? '55.44',
      ownersCount: overrides.owners ?? 1,
      occupancy: overrides.occupancy ?? [{ count: 2, dateFrom: '2020-01-01', dateTo: null }],
      hotWaterMeter: overrides.meter ?? null,
    },
    house: {
      odpuConsumption: null,
      hasOdpu: false,
      totalPremisesArea: '1685.00',
      categoryCode: 'mkd_do_1999',
      hwSystem: 'central_closed',
      heatingPaymentMode: 'during_season',
      isHeatingSeason: false,
      ...overrides.house,
    },
    tariffs: overrides.tariffs ?? TARIFFS,
    norms: NORMS,
    params: { ...PARAMS, ...overrides.params },
  }
}

const byKind = (lines: AccrualLine[], component: string, kind: string) =>
  lines.find((l) => l.component === component && l.lineKind === kind)

describe('ГВС (W-каталог + двухкомпонентный ф.23)', () => {
  it('C1 W-02: нет ИПУ, 2 жильца — норматив с Кпов только на компонент ХВ', () => {
    const result = calcAccount(makeInput({}))
    const hw = result.lines.filter((l) => l.service === 'hot_water')
    expect(hw).toHaveLength(3)
    expect(byKind(hw, 'hw_cold_water', 'accrual')?.amount).toBe('313.83')
    expect(byKind(hw, 'hw_cold_water', 'uplift')?.amount).toBe('156.92')
    expect(byKind(hw, 'hw_heat_energy', 'accrual')?.amount).toBe('924.54')
    expect(byKind(hw, 'hw_heat_energy', 'uplift')).toBeUndefined()
    expect(hw[0]?.method).toBe('W-02_norm_uplift')
  })

  it('C2 W-01: ИПУ с показаниями — факт без Кпов', () => {
    const result = calcAccount(
      makeInput({
        meter: {
          status: 'active',
          digits: 5,
          readings: [
            { period: { year: 2026, month: 6 }, value: '150.000' },
            { period: { year: 2026, month: 7 }, value: '154.320' },
          ],
        },
      }),
    )
    const hw = result.lines.filter((l) => l.service === 'hot_water')
    expect(hw).toHaveLength(2)
    expect(byKind(hw, 'hw_cold_water', 'accrual')?.amount).toBe('212.50')
    expect(byKind(hw, 'hw_heat_energy', 'accrual')?.amount).toBe('626.02')
    expect(hw[0]?.method).toBe('W-01_meter')
  })

  it('C3: переход счетчика через ноль', () => {
    const result = calcAccount(
      makeInput({
        meter: {
          status: 'active',
          digits: 5,
          readings: [
            { period: { year: 2026, month: 6 }, value: '99998.5' },
            { period: { year: 2026, month: 7 }, value: '2.5' },
          ],
        },
      }),
    )
    const cold = byKind(result.lines, 'hw_cold_water', 'accrual')
    expect(d(cold?.volume ?? '0').toFixed(3)).toBe('4.000')
  })

  it('C4 W-04: показаний за месяц нет, истории мало — норматив БЕЗ Кпов', () => {
    const result = calcAccount(
      makeInput({
        meter: {
          status: 'active',
          digits: 5,
          readings: [
            { period: { year: 2026, month: 5 }, value: '100.0' },
            { period: { year: 2026, month: 6 }, value: '103.0' },
          ],
        },
      }),
    )
    const hw = result.lines.filter((l) => l.service === 'hot_water')
    expect(hw.map((l) => l.lineKind)).not.toContain('uplift')
    expect(byKind(hw, 'hw_cold_water', 'accrual')?.amount).toBe('313.83')
    expect(hw[0]?.method).toBe('W-04_no_readings_norm')
  })

  it('C5 W-04: показаний нет, истории достаточно — среднемесячный', () => {
    const readings = [1, 2, 3, 4, 5, 6].map((m, i) => ({
      period: { year: 2026, month: m },
      value: (10 + i * 3).toFixed(1), // равный расход 3.0 м³/мес
    }))
    const result = calcAccount(makeInput({ meter: { status: 'active', digits: 5, readings } }))
    const hw = result.lines.filter((l) => l.service === 'hot_water')
    expect(hw[0]?.method).toBe('W-04_no_readings_avg')
    expect(byKind(hw, 'hw_cold_water', 'accrual')?.amount).toBe('147.57')
    expect(byKind(hw, 'hw_heat_energy', 'accrual')?.amount).toBe('434.74')
  })

  it('C6 W-05: истекла поверка — норматив С Кпов', () => {
    const result = calcAccount(
      makeInput({ meter: { status: 'verification_expired', digits: 5, readings: [] } }),
    )
    const hw = result.lines.filter((l) => l.service === 'hot_water')
    expect(hw[0]?.method).toBe('W-05_verification_expired')
    expect(byKind(hw, 'hw_cold_water', 'uplift')?.amount).toBe('156.92')
  })

  it('C7 W-07/п.56(2): нет зарегистрированных — по собственникам', () => {
    const result = calcAccount(makeInput({ occupancy: [], owners: 1 }))
    const hw = result.lines.filter((l) => l.service === 'hot_water')
    expect(hw[0]?.method).toBe('W-07_by_owners')
    expect(byKind(hw, 'hw_cold_water', 'accrual')?.amount).toBe('156.92')
    expect(byKind(hw, 'hw_cold_water', 'uplift')?.amount).toBe('78.46')
    expect(byKind(hw, 'hw_heat_energy', 'accrual')?.amount).toBe('462.27')
  })

  it('C8 G-03: смена числа жильцов внутри месяца — пропорция фактических дней', () => {
    const result = calcAccount(
      makeInput({
        occupancy: [
          { count: 2, dateFrom: '2020-01-01', dateTo: '2026-07-16' },
          { count: 3, dateFrom: '2026-07-16', dateTo: null },
        ],
      }),
    )
    const cold = result.lines.filter((l) => l.component === 'hw_cold_water' && l.lineKind === 'accrual')
    expect(cold).toHaveLength(2)
    expect(cold[0]?.amount).toBe('151.85') // 15 дней × 2 чел
    expect(cold[1]?.amount).toBe('242.97') // 16 дней × 3 чел
    const heat = result.lines.filter((l) => l.component === 'hw_heat_energy' && l.lineKind === 'accrual')
    expect(heat[0]?.amount).toBe('447.36')
    expect(heat[1]?.amount).toBe('715.77')
  })

  it('C13 G-01: смена тарифа внутри месяца — сегменты по датам версий', () => {
    const custom: TariffVersion[] = [
      { service: 'hot_water', consumerCategory: 'population', component: 'single', value: '100.00', vatMode: 'included', validFrom: '2026-01-01', validTo: '2026-07-15' },
      { service: 'hot_water', consumerCategory: 'population', component: 'single', value: '200.00', vatMode: 'included', validFrom: '2026-07-16', validTo: null },
    ]
    const result = calcAccount(
      makeInput({
        tariffs: custom,
        occupancy: [{ count: 1, dateFrom: '2020-01-01', dateTo: null }],
        params: { ipuTechnicallyPossible: false },
      }),
    )
    const single = result.lines.filter((l) => l.component === 'single' && l.service === 'hot_water')
    expect(single).toHaveLength(2)
    expect(single[0]?.amount).toBe('154.35')
    expect(single[0]?.rate).toBe('100.00')
    expect(single[1]?.amount).toBe('329.29')
    expect(single[1]?.rate).toBe('200.00')
  })
})

describe('Отопление (H-каталог)', () => {
  it('C10 H-00: июль, оплата в отопительный период — строк нет', () => {
    const result = calcAccount(makeInput({ occupancy: [{ count: 0, dateFrom: '2020-01-01', dateTo: null }], owners: 0 }))
    expect(result.lines.filter((l) => l.service === 'heating')).toHaveLength(0)
  })

  it('C9 H-02: равномерно за год — норматив × K и летом', () => {
    const result = calcAccount(makeInput({ house: { heatingPaymentMode: 'uniform_year' } }))
    const heating = result.lines.filter((l) => l.service === 'heating')
    expect(heating).toHaveLength(1)
    expect(heating[0]?.method).toBe('H-02_norm_uniform')
    expect(heating[0]?.amount).toBe('1495.68')
  })

  it('C11 H-04: январь, дом с ОДПУ — доля по площади, тариф январской версии', () => {
    const result = calcAccount(
      makeInput({
        period: { year: 2026, month: 1 },
        area: '50',
        house: {
          hasOdpu: true,
          odpuConsumption: '120',
          totalPremisesArea: '1000.00',
          isHeatingSeason: true,
        },
      }),
    )
    const heating = result.lines.filter((l) => l.service === 'heating')
    expect(heating).toHaveLength(1)
    expect(heating[0]?.method).toBe('H-04_odpu_share')
    expect(heating[0]?.rate).toBe('2280.50')
    expect(heating[0]?.amount).toBe('13683.00')
  })

  it('C12: юрлицо — тариф «прочие», НДС сверху отдельной строкой', () => {
    const result = calcAccount(
      makeInput({
        kind: 'legal',
        area: '85',
        occupancy: [],
        owners: 0,
        house: { heatingPaymentMode: 'uniform_year' },
      }),
    )
    const heating = result.lines.filter((l) => l.service === 'heating')
    expect(heating).toHaveLength(2)
    expect(heating[0]?.amount).toBe('2664.71')
    expect(heating[1]?.lineKind).toBe('vat')
    expect(heating[1]?.amount).toBe('532.94')
  })
})

describe('Инварианты', () => {
  it('total = сумме строк; все суммы неотрицательны', () => {
    const inputs = [
      makeInput({}),
      makeInput({ occupancy: [], owners: 2 }),
      makeInput({ kind: 'legal', area: '85', occupancy: [], house: { heatingPaymentMode: 'uniform_year' } }),
    ]
    for (const input of inputs) {
      const result = calcAccount(input)
      const sum = result.lines.reduce((acc, l) => acc.plus(d(l.amount)), d(0))
      expect(sum.toFixed(2)).toBe(result.total)
      for (const line of result.lines) expect(d(line.amount).isNegative()).toBe(false)
    }
  })

  it('непрерывность: искусственный разрез месяца не меняет итог (± копейки на строку)', () => {
    const whole = calcAccount(makeInput({}))
    const cut = calcAccount(
      makeInput({
        occupancy: [
          { count: 2, dateFrom: '2020-01-01', dateTo: '2026-07-11' },
          { count: 2, dateFrom: '2026-07-11', dateTo: null },
        ],
      }),
    )
    const diff = d(whole.total).minus(d(cut.total)).abs()
    expect(diff.lte(d('0.03'))).toBe(true)
  })
})

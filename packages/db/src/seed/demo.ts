import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { v7 as uuidv7 } from 'uuid'
import * as s from '../schema'

/**
 * Демонстрационный контур: г. Красноозёрск, 10 домов, три схемы оснащения ПУ
 * (A: ОДПУ + ИПУ у части квартир; B: только ОДПУ; C: без приборов — норматив),
 * ~170 лицевых счетов, двухкомпонентный тариф ГВС, периоды май–июль 2026.
 * Данные детерминированы (PRNG с фиксированным сидом) — стабильны между запусками.
 */

export const DEMO_TENANT_ID = '018f0000-0000-7000-8000-0000000000d0'

export interface SeedSummary {
  buildings: number
  premises: number
  accounts: number
  residents: number
  meters: number
  readings: number
  tariffs: number
  norms: number
}

export async function isDemoSeeded(pg: PGlite): Promise<boolean> {
  const { rows } = await pg.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tenant WHERE id = $1',
    [DEMO_TENANT_ID],
  )
  return (rows[0]?.n ?? 0) > 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SURNAMES: Array<[string, string]> = [
  ['Заболоцкий', 'Заболоцкая'], ['Крамаренко', 'Крамаренко'], ['Ведерников', 'Ведерникова'],
  ['Пестряков', 'Пестрякова'], ['Голубев', 'Голубева'], ['Ситников', 'Ситникова'],
  ['Черкасов', 'Черкасова'], ['Малофеев', 'Малофеева'], ['Дорохов', 'Дорохова'],
  ['Щербинин', 'Щербинина'], ['Лукоянов', 'Лукоянова'], ['Праслов', 'Праслова'],
  ['Кожевников', 'Кожевникова'], ['Стрельцов', 'Стрельцова'], ['Бакланов', 'Бакланова'],
  ['Тюрин', 'Тюрина'], ['Одинцов', 'Одинцова'], ['Рогачёв', 'Рогачёва'],
  ['Землянский', 'Землянская'], ['Мещеряков', 'Мещерякова'], ['Волокитин', 'Волокитина'],
  ['Санников', 'Санникова'], ['Черепанов', 'Черепанова'], ['Аверин', 'Аверина'],
  ['Лихачёв', 'Лихачёва'], ['Терентьев', 'Терентьева'], ['Углов', 'Углова'],
  ['Насонов', 'Насонова'], ['Кудеяров', 'Кудеярова'], ['Ярцев', 'Ярцева'],
]
const MALE_NAMES = ['Андрей', 'Виктор', 'Геннадий', 'Дмитрий', 'Егор', 'Илья', 'Константин', 'Леонид', 'Михаил', 'Николай', 'Павел', 'Степан']
const FEMALE_NAMES = ['Алла', 'Валентина', 'Галина', 'Дарья', 'Елена', 'Жанна', 'Ирина', 'Лариса', 'Марина', 'Наталья', 'Оксана', 'Тамара']
const PATRONYMS: Array<[string, string]> = [
  ['Алексеевич', 'Алексеевна'], ['Борисович', 'Борисовна'], ['Валерьевич', 'Валерьевна'],
  ['Григорьевич', 'Григорьевна'], ['Дмитриевич', 'Дмитриевна'], ['Иванович', 'Ивановна'],
  ['Михайлович', 'Михайловна'], ['Петрович', 'Петровна'], ['Сергеевич', 'Сергеевна'],
  ['Фёдорович', 'Фёдоровна'],
]

interface BuildingMeta {
  street: number
  number: string
  floors: number
  year: number
  flats: number
  group: 'A' | 'B' | 'C'
  hwSystem: 'central_closed' | 'central_open'
  heatingMode: 'during_season' | 'uniform_year'
  nonResidential?: { name: string; area: string }
}

const BUILDINGS: BuildingMeta[] = [
  { street: 0, number: '3', floors: 5, year: 1987, flats: 30, group: 'A', hwSystem: 'central_closed', heatingMode: 'uniform_year', nonResidential: { name: 'магазин «Родник»', area: '85.00' } },
  { street: 0, number: '5', floors: 5, year: 1990, flats: 20, group: 'A', hwSystem: 'central_closed', heatingMode: 'uniform_year' },
  { street: 1, number: '12', floors: 9, year: 2005, flats: 36, group: 'A', hwSystem: 'central_closed', heatingMode: 'during_season', nonResidential: { name: 'офис ООО «Хлебный дом»', area: '120.00' } },
  { street: 1, number: '14', floors: 9, year: 2008, flats: 18, group: 'A', hwSystem: 'central_closed', heatingMode: 'during_season' },
  { street: 0, number: '7', floors: 2, year: 1965, flats: 8, group: 'B', hwSystem: 'central_open', heatingMode: 'during_season' },
  { street: 2, number: '2', floors: 3, year: 1978, flats: 12, group: 'B', hwSystem: 'central_open', heatingMode: 'during_season' },
  { street: 1, number: '8', floors: 4, year: 1982, flats: 16, group: 'B', hwSystem: 'central_open', heatingMode: 'during_season' },
  { street: 2, number: '4', floors: 2, year: 1958, flats: 8, group: 'C', hwSystem: 'central_closed', heatingMode: 'during_season' },
  { street: 2, number: '6', floors: 2, year: 1960, flats: 8, group: 'C', hwSystem: 'central_closed', heatingMode: 'during_season' },
  { street: 0, number: '11', floors: 3, year: 1972, flats: 12, group: 'C', hwSystem: 'central_closed', heatingMode: 'during_season' },
]

export async function seedDemo(pg: PGlite): Promise<SeedSummary> {
  if (await isDemoSeeded(pg)) {
    throw new Error('Демо-данные уже загружены')
  }
  const db = drizzle(pg, { schema: s })
  const rnd = mulberry32(20260718)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)] as T

  await db.insert(s.tenant).values({
    id: DEMO_TENANT_ID,
    name: 'МУП «Тепловые сети» г. Красноозёрска (демо)',
    inn: '6829012345',
    kpp: '682901001',
    ogrn: '1026801159330',
    legalAddress: 'Тамбовская обл., г. Красноозёрск, ул. Энергетиков, 1',
    bankName: 'ПАО Сбербанк',
    bic: '044525225',
    corrAccount: '30101810400000000225',
    settlementAccount: '40702810900000012345',
    director: 'Прохоров Валентин Кузьмич',
    phone: '+7 (475) 231-48-07',
  })

  const municipalityId = uuidv7()
  await db.insert(s.municipality).values({
    id: municipalityId,
    tenantId: DEMO_TENANT_ID,
    name: 'Красноозёрский городской округ',
    oktmo: '68701000',
  })

  const settlementId = uuidv7()
  await db.insert(s.settlement).values({
    id: settlementId,
    tenantId: DEMO_TENANT_ID,
    municipalityId,
    name: 'Красноозёрск',
    kind: 'город',
  })

  const streetNames = ['ул. Заводская', 'ул. Гагарина', 'пер. Тепличный']
  const streetIds = streetNames.map(() => uuidv7())
  await db.insert(s.street).values(
    streetNames.map((name, i) => ({
      id: streetIds[i] as string,
      tenantId: DEMO_TENANT_ID,
      settlementId,
      name,
    })),
  )

  // Периоды: май и июнь закрыты, июль открыт
  const periodIds = { 5: uuidv7(), 6: uuidv7(), 7: uuidv7() }
  await db.insert(s.billingPeriod).values([
    { id: periodIds[5], tenantId: DEMO_TENANT_ID, year: 2026, month: 5, status: 'closed' },
    { id: periodIds[6], tenantId: DEMO_TENANT_ID, year: 2026, month: 6, status: 'closed' },
    { id: periodIds[7], tenantId: DEMO_TENANT_ID, year: 2026, month: 7, status: 'open' },
  ])

  // Тарифы: версия с 01.01.2026 и индексация с 01.07.2026 (+4%)
  const tariffRows: Array<typeof s.tariff.$inferInsert> = []
  const tariffPlan: Array<{ service: 'heating' | 'hot_water'; category: 'population' | 'other'; component: 'single' | 'hw_cold_water' | 'hw_heat_energy'; v1: string; v2: string; vat: 'included' | 'on_top' }> = [
    { service: 'heating', category: 'population', component: 'single', v1: '2280.5000', v2: '2371.7200', vat: 'included' },
    { service: 'hot_water', category: 'population', component: 'hw_cold_water', v1: '47.3000', v2: '49.1900', vat: 'included' },
    { service: 'hot_water', category: 'population', component: 'hw_heat_energy', v1: '2280.5000', v2: '2371.7200', vat: 'included' },
    { service: 'heating', category: 'other', component: 'single', v1: '2650.0000', v2: '2756.0000', vat: 'on_top' },
  ]
  for (const t of tariffPlan) {
    tariffRows.push(
      { id: uuidv7(), tenantId: DEMO_TENANT_ID, service: t.service, consumerCategory: t.category, component: t.component, value: t.v1, vatMode: t.vat, docRef: 'Приказ УРТ Тамбовской обл. №118-т от 18.12.2025', validFrom: '2026-01-01', validTo: '2026-06-30' },
      { id: uuidv7(), tenantId: DEMO_TENANT_ID, service: t.service, consumerCategory: t.category, component: t.component, value: t.v2, vatMode: t.vat, docRef: 'Приказ УРТ Тамбовской обл. №74-т от 19.06.2026', validFrom: '2026-07-01', validTo: null },
    )
  }
  await db.insert(s.tariff).values(tariffRows)

  await db.insert(s.norm).values([
    { id: uuidv7(), tenantId: DEMO_TENANT_ID, kind: 'hw_m3_person', municipalityId, categoryCode: null, value: '3.190000', docRef: 'Приказ №90 от 30.05.2017', validFrom: '2017-07-01', validTo: null },
    { id: uuidv7(), tenantId: DEMO_TENANT_ID, kind: 'hw_heat_gcal_m3', municipalityId, categoryCode: null, value: '0.061100', docRef: 'Приказ №91 от 30.05.2017', validFrom: '2017-07-01', validTo: null },
    { id: uuidv7(), tenantId: DEMO_TENANT_ID, kind: 'heating_gcal_m2', municipalityId, categoryCode: 'mkd_do_1999', value: '0.019500', docRef: 'Приказ №92 от 30.05.2017', validFrom: '2017-07-01', validTo: null },
    { id: uuidv7(), tenantId: DEMO_TENANT_ID, kind: 'heating_gcal_m2', municipalityId, categoryCode: 'mkd_posle_1999', value: '0.016000', docRef: 'Приказ №92 от 30.05.2017', validFrom: '2017-07-01', validTo: null },
  ])

  // Юрлица-владельцы нежилых помещений
  const legalCustomers = [
    { id: uuidv7(), name: 'ИП Салтыкова Марина Витальевна', inn: '682901743210' },
    { id: uuidv7(), name: 'ООО «Хлебный дом "Красноозёрск"»', inn: '6829054321' },
  ]

  const buildingRows: Array<typeof s.building.$inferInsert> = []
  const premiseRows: Array<typeof s.premise.$inferInsert> = []
  const accountRows: Array<typeof s.account.$inferInsert> = []
  const customerRows: Array<typeof s.customer.$inferInsert> = []
  const accountCustomerRows: Array<typeof s.accountCustomer.$inferInsert> = []
  const residentRows: Array<typeof s.accountResident.$inferInsert> = []
  const meterRows: Array<typeof s.meter.$inferInsert> = []
  const readingRows: Array<typeof s.meterReading.$inferInsert> = []

  let accountSeq = 1000001
  let ipuSeq = 1
  let legalIdx = 0

  for (const meta of BUILDINGS) {
    const buildingId = uuidv7()
    const flatAreas: number[] = []
    for (let f = 0; f < meta.flats; f++) {
      flatAreas.push(Math.round((30.5 + rnd() * 44) * 100) / 100)
    }
    const nonResArea = meta.nonResidential ? Number(meta.nonResidential.area) : 0
    const residentialArea = flatAreas.reduce((a, b) => a + b, 0)
    const totalArea = Math.round((residentialArea + nonResArea) * 100) / 100

    buildingRows.push({
      id: buildingId,
      tenantId: DEMO_TENANT_ID,
      streetId: streetIds[meta.street] as string,
      number: meta.number,
      buildingKind: 'mkd',
      totalPremisesArea: totalArea.toFixed(2),
      residentialArea: residentialArea.toFixed(2),
      nonResidentialArea: nonResArea.toFixed(2),
      commonArea: (residentialArea * 0.18).toFixed(2),
      floors: meta.floors,
      buildYear: meta.year,
      hwSystem: meta.hwSystem,
      heatingPaymentMode: meta.heatingMode,
      categoryCode: meta.year < 1999 ? 'mkd_do_1999' : 'mkd_posle_1999',
      addressText: `г. Красноозёрск, ${streetNames[meta.street]}, д. ${meta.number}`,
    })

    // ОДПУ тепла у групп A и B
    if (meta.group !== 'C') {
      const odpuId = uuidv7()
      meterRows.push({
        id: odpuId,
        tenantId: DEMO_TENANT_ID,
        kind: 'odpu_heat',
        buildingId,
        serialNo: `ВКТ-7-${meta.number}${meta.street}${String(1000 + Math.floor(rnd() * 9000))}`,
        digits: 7,
        installDate: `${meta.year > 2000 ? meta.year + 2 : 2014}-09-15`,
        verificationIntervalMonths: 48,
        nextVerificationDate: '2027-09-15',
        status: 'active',
      })
      for (const m of [5, 6] as const) {
        readingRows.push({
          id: uuidv7(),
          tenantId: DEMO_TENANT_ID,
          meterId: odpuId,
          periodId: periodIds[m],
          consumption: (15 + rnd() * 25).toFixed(3),
          readingDate: `2026-0${m}-25`,
          source: 'operator',
          status: 'accepted',
        })
      }
    }

    for (let f = 1; f <= meta.flats; f++) {
      const premiseId = uuidv7()
      const area = flatAreas[f - 1] as number
      premiseRows.push({
        id: premiseId,
        tenantId: DEMO_TENANT_ID,
        buildingId,
        number: String(f),
        premiseKind: 'flat',
        totalArea: area.toFixed(2),
        floor: Math.min(meta.floors, 1 + Math.floor((f - 1) / Math.max(1, Math.ceil(meta.flats / meta.floors)))),
      })

      // владелец-физлицо
      const male = rnd() < 0.45
      const surname = pick(SURNAMES)[male ? 0 : 1]
      const firstName = male ? pick(MALE_NAMES) : pick(FEMALE_NAMES)
      const patronym = pick(PATRONYMS)[male ? 0 : 1]
      const customerId = uuidv7()
      customerRows.push({
        id: customerId,
        tenantId: DEMO_TENANT_ID,
        kind: 'person',
        lastName: surname,
        firstName,
        middleName: patronym,
      })

      const accountId = uuidv7()
      const openYear = 2016 + Math.floor(rnd() * 8)
      accountRows.push({
        id: accountId,
        tenantId: DEMO_TENANT_ID,
        accountNumber: String(accountSeq++),
        kind: 'residential',
        premiseId,
        dateOpen: `${openYear}-0${1 + Math.floor(rnd() * 9)}-15`,
      })
      accountCustomerRows.push({
        id: uuidv7(),
        tenantId: DEMO_TENANT_ID,
        accountId,
        customerId,
        role: 'owner',
        dateFrom: `${openYear}-0${1 + Math.floor(rnd() * 9)}-15`,
      })

      // зарегистрированные: ~10% пустых (п.56(2)), большинство 1-3
      const residentCount = rnd() < 0.1 ? 0 : 1 + Math.floor(rnd() * 3)
      for (let r = 0; r < residentCount; r++) {
        const rMale = r === 0 ? male : rnd() < 0.5
        residentRows.push({
          id: uuidv7(),
          tenantId: DEMO_TENANT_ID,
          accountId,
          fullName:
            r === 0
              ? `${surname} ${firstName} ${patronym}`
              : `${pick(SURNAMES)[rMale ? 0 : 1]} ${rMale ? pick(MALE_NAMES) : pick(FEMALE_NAMES)} ${pick(PATRONYMS)[rMale ? 0 : 1]}`,
          dateFrom: `${openYear}-10-01`,
        })
      }

      // ИПУ ГВС: ~60% квартир группы A; редкие кейсы истекшей/скорой поверки
      if (meta.group === 'A' && rnd() < 0.6) {
        const meterId = uuidv7()
        const fate = rnd()
        const status = fate < 0.05 ? 'verification_expired' : 'active'
        const nextVerification =
          fate < 0.05 ? '2026-03-01' : fate < 0.12 ? '2026-08-20' : `202${8 + Math.floor(rnd() * 2)}-0${1 + Math.floor(rnd() * 9)}-01`
        meterRows.push({
          id: meterId,
          tenantId: DEMO_TENANT_ID,
          kind: 'ipu_hw',
          premiseId,
          serialNo: `СГВ-15-${String(100000 + ipuSeq++)}`,
          digits: 5,
          installDate: '2020-06-01',
          verificationIntervalMonths: 72,
          nextVerificationDate: nextVerification,
          status,
        })
        const base = 80 + rnd() * 800
        const mayConsumption = 2 + rnd() * 4
        const juneConsumption = 2 + rnd() * 4
        readingRows.push({
          id: uuidv7(),
          tenantId: DEMO_TENANT_ID,
          meterId,
          periodId: periodIds[5],
          value: base.toFixed(3),
          readingDate: '2026-05-23',
          source: 'operator',
          status: 'accepted',
        })
        if (status === 'active') {
          readingRows.push({
            id: uuidv7(),
            tenantId: DEMO_TENANT_ID,
            meterId,
            periodId: periodIds[6],
            value: (base + mayConsumption + juneConsumption).toFixed(3),
            readingDate: '2026-06-24',
            source: 'operator',
            status: 'accepted',
          })
        }
      }
    }

    // нежилое помещение с юрлицом
    if (meta.nonResidential) {
      const premiseId = uuidv7()
      premiseRows.push({
        id: premiseId,
        tenantId: DEMO_TENANT_ID,
        buildingId,
        number: `Н${legalIdx + 1}`,
        premiseKind: 'non_residential',
        totalArea: meta.nonResidential.area,
        floor: 1,
      })
      const legal = legalCustomers[legalIdx++] as { id: string; name: string; inn: string }
      customerRows.push({
        id: legal.id,
        tenantId: DEMO_TENANT_ID,
        kind: 'legal',
        fullName: legal.name,
        inn: legal.inn,
      })
      const accountId = uuidv7()
      accountRows.push({
        id: accountId,
        tenantId: DEMO_TENANT_ID,
        accountNumber: String(accountSeq++),
        kind: 'legal',
        premiseId,
        dateOpen: '2019-01-01',
      })
      accountCustomerRows.push({
        id: uuidv7(),
        tenantId: DEMO_TENANT_ID,
        accountId,
        customerId: legal.id,
        role: 'owner',
        dateFrom: '2019-01-01',
      })
    }
  }

  const chunk = async <T,>(rows: T[], insert: (part: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 200) {
      await insert(rows.slice(i, i + 200))
    }
  }

  await db.insert(s.building).values(buildingRows)
  await chunk(premiseRows, (part) => db.insert(s.premise).values(part))
  await chunk(customerRows, (part) => db.insert(s.customer).values(part))
  await chunk(accountRows, (part) => db.insert(s.account).values(part))
  await chunk(accountCustomerRows, (part) => db.insert(s.accountCustomer).values(part))
  await chunk(residentRows, (part) => db.insert(s.accountResident).values(part))
  await chunk(meterRows, (part) => db.insert(s.meter).values(part))
  await chunk(readingRows, (part) => db.insert(s.meterReading).values(part))

  return {
    buildings: buildingRows.length,
    premises: premiseRows.length,
    accounts: accountRows.length,
    residents: residentRows.length,
    meters: meterRows.length,
    readings: readingRows.length,
    tariffs: tariffRows.length,
    norms: 4,
  }
}

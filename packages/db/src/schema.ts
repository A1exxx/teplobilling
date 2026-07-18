import { sql } from 'drizzle-orm'
import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Сквозные принципы (docs/SPEC.md): PK = UUID (v7 генерируется приложением),
// tenant_id на всех таблицах (готовность к мультиаренде при single-tenant деплое),
// деньги numeric(14,2), тарифы numeric(12,4), объемы numeric(14,6).

export const buildingKind = pgEnum('building_kind', ['mkd', 'private', 'non_residential'])
export const hwSystem = pgEnum('hw_system', ['central_closed', 'central_open', 'none'])
export const heatingPaymentMode = pgEnum('heating_payment_mode', ['during_season', 'uniform_year'])
export const premiseKind = pgEnum('premise_kind', ['flat', 'room', 'non_residential'])
export const accountKind = pgEnum('account_kind', ['residential', 'legal'])
export const periodStatus = pgEnum('period_status', [
  'open',
  'calculating',
  'calculated',
  'approved',
  'closed',
])

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const tenant = pgTable('tenant', {
  id: id(),
  name: text('name').notNull(),
  inn: text('inn'),
  kpp: text('kpp'),
  ogrn: text('ogrn'),
  legalAddress: text('legal_address'),
  bankName: text('bank_name'),
  bic: text('bic'),
  corrAccount: text('corr_account'),
  settlementAccount: text('settlement_account'),
  director: text('director'),
  phone: text('phone'),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
})

export const settlement = pgTable('settlement', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
  name: text('name').notNull(),
  kind: text('kind'),
  oktmo: text('oktmo'),
  garGuid: text('gar_guid'),
  createdAt: createdAt(),
})

export const street = pgTable('street', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
  settlementId: uuid('settlement_id').notNull().references(() => settlement.id),
  name: text('name').notNull(),
  garGuid: text('gar_guid'),
  createdAt: createdAt(),
})

export const building = pgTable('building', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
  streetId: uuid('street_id').notNull().references(() => street.id),
  number: text('number').notNull(),
  buildingKind: buildingKind('building_kind').notNull().default('mkd'),
  garHouseGuid: text('gar_house_guid'),
  cadastralNo: text('cadastral_no'),
  totalPremisesArea: numeric('total_premises_area', { precision: 12, scale: 2 }),
  residentialArea: numeric('residential_area', { precision: 12, scale: 2 }),
  nonResidentialArea: numeric('non_residential_area', { precision: 12, scale: 2 }),
  commonArea: numeric('common_area', { precision: 12, scale: 2 }),
  floors: integer('floors'),
  buildYear: integer('build_year'),
  hwSystem: hwSystem('hw_system').notNull().default('central_closed'),
  heatingPaymentMode: heatingPaymentMode('heating_payment_mode').notNull().default('during_season'),
  addressText: text('address_text'),
  createdAt: createdAt(),
})

export const premise = pgTable('premise', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
  buildingId: uuid('building_id').notNull().references(() => building.id),
  number: text('number').notNull(),
  premiseKind: premiseKind('premise_kind').notNull().default('flat'),
  totalArea: numeric('total_area', { precision: 10, scale: 2 }),
  livingArea: numeric('living_area', { precision: 10, scale: 2 }),
  floor: integer('floor'),
  createdAt: createdAt(),
})

export const account = pgTable(
  'account',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
    accountNumber: text('account_number').notNull(),
    kind: accountKind('kind').notNull(),
    premiseId: uuid('premise_id').references(() => premise.id),
    dateOpen: date('date_open').notNull(),
    dateClose: date('date_close'),
    ownershipShare: numeric('ownership_share', { precision: 5, scale: 4 }).notNull().default('1'),
    gisEls: text('gis_els'),
    gisZhkuId: text('gis_zhku_id'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('account_number_per_tenant').on(table.tenantId, table.accountNumber)],
)

export const billingPeriod = pgTable(
  'billing_period',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    status: periodStatus('status').notNull().default('open'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('billing_period_per_tenant').on(table.tenantId, table.year, table.month)],
)

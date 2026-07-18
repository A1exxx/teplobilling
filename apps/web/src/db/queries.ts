import type { PGlite } from '@electric-sql/pglite'

export interface AccountRow {
  id: string
  account_number: string
  kind: 'residential' | 'legal'
  premise_number: string
  total_area: string | null
  address_text: string | null
  owner: string | null
  residents: number
  ipu_status: 'active' | 'verification_expired' | 'broken' | 'removed' | null
}

export async function listAccounts(
  pg: PGlite,
  search: string,
  limit: number,
  offset: number,
): Promise<{ rows: AccountRow[]; total: number }> {
  const where = `
    FROM account a
    JOIN premise p ON p.id = a.premise_id
    JOIN building b ON b.id = p.building_id
    LEFT JOIN account_customer ac ON ac.account_id = a.id AND ac.role = 'owner' AND ac.date_to IS NULL
    LEFT JOIN customer c ON c.id = ac.customer_id
    WHERE ($1 = '' OR a.account_number ILIKE '%' || $1 || '%'
      OR b.address_text ILIKE '%' || $1 || '%'
      OR c.last_name ILIKE '%' || $1 || '%'
      OR c.full_name ILIKE '%' || $1 || '%')`

  const [data, count] = await Promise.all([
    pg.query<AccountRow>(
      `SELECT a.id, a.account_number, a.kind, p.number AS premise_number, p.total_area,
              b.address_text,
              COALESCE(c.full_name, c.last_name || ' ' || c.first_name || ' ' || c.middle_name) AS owner,
              (SELECT count(*)::int FROM account_resident r
                WHERE r.account_id = a.id AND r.date_to IS NULL) AS residents,
              (SELECT m.status FROM meter m
                WHERE m.premise_id = p.id AND m.kind = 'ipu_hw' AND m.status <> 'removed'
                ORDER BY m.created_at DESC LIMIT 1) AS ipu_status
       ${where}
       ORDER BY a.account_number
       LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    ),
    pg.query<{ total: number }>(`SELECT count(*)::int AS total ${where}`, [search]),
  ])
  return { rows: data.rows, total: count.rows[0]?.total ?? 0 }
}

export interface AccountCard {
  account: {
    id: string
    account_number: string
    kind: string
    date_open: string
    total_area: string | null
    premise_number: string
    premise_kind: string
    address_text: string | null
    floors: number | null
    hw_system: string
    heating_payment_mode: string
    owner: string | null
    owner_kind: string | null
    owner_inn: string | null
  }
  residents: Array<{ full_name: string; date_from: string; date_to: string | null }>
  meters: Array<{
    id: string
    serial_no: string
    kind: string
    status: string
    next_verification_date: string | null
    last_value: string | null
    last_period: string | null
  }>
}

export async function getAccountCard(pg: PGlite, accountId: string): Promise<AccountCard | null> {
  const head = await pg.query<AccountCard['account']>(
    `SELECT a.id, a.account_number, a.kind, a.date_open::text AS date_open, p.total_area, p.number AS premise_number,
            p.premise_kind, b.address_text, b.floors, b.hw_system, b.heating_payment_mode,
            COALESCE(c.full_name, c.last_name || ' ' || c.first_name || ' ' || c.middle_name) AS owner,
            c.kind AS owner_kind, c.inn AS owner_inn
     FROM account a
     JOIN premise p ON p.id = a.premise_id
     JOIN building b ON b.id = p.building_id
     LEFT JOIN account_customer ac ON ac.account_id = a.id AND ac.role = 'owner' AND ac.date_to IS NULL
     LEFT JOIN customer c ON c.id = ac.customer_id
     WHERE a.id = $1`,
    [accountId],
  )
  const account = head.rows[0]
  if (!account) return null

  const [residents, meters] = await Promise.all([
    pg.query<AccountCard['residents'][number]>(
      `SELECT full_name, date_from::text AS date_from, date_to::text AS date_to FROM account_resident
       WHERE account_id = $1 ORDER BY date_from`,
      [accountId],
    ),
    pg.query<AccountCard['meters'][number]>(
      `SELECT m.id, m.serial_no, m.kind, m.status, m.next_verification_date::text AS next_verification_date,
              r.value::text AS last_value,
              (bp.month || '.' || bp.year) AS last_period
       FROM meter m
       LEFT JOIN LATERAL (
         SELECT value, period_id FROM meter_reading
         WHERE meter_id = m.id AND status = 'accepted'
         ORDER BY entered_at DESC LIMIT 1
       ) r ON true
       LEFT JOIN billing_period bp ON bp.id = r.period_id
       WHERE m.premise_id = (SELECT premise_id FROM account WHERE id = $1)
       ORDER BY m.created_at`,
      [accountId],
    ),
  ])
  return { account, residents: residents.rows, meters: meters.rows }
}

export interface BuildingRow {
  id: string
  address_text: string | null
  building_kind: string
  floors: number | null
  build_year: number | null
  category_code: string | null
  total_premises_area: string | null
  common_area: string | null
  hw_system: string
  heating_payment_mode: string
  has_odpu: boolean
  premises: number
  accounts: number
}

export async function listBuildings(pg: PGlite): Promise<BuildingRow[]> {
  const { rows } = await pg.query<BuildingRow>(
    `SELECT b.id, b.address_text, b.building_kind, b.floors, b.build_year, b.category_code,
            b.total_premises_area, b.common_area, b.hw_system, b.heating_payment_mode,
            EXISTS (SELECT 1 FROM meter m WHERE m.building_id = b.id AND m.kind = 'odpu_heat'
                    AND m.status <> 'removed') AS has_odpu,
            (SELECT count(*)::int FROM premise p WHERE p.building_id = b.id) AS premises,
            (SELECT count(*)::int FROM account a JOIN premise p ON p.id = a.premise_id
              WHERE p.building_id = b.id AND a.date_close IS NULL) AS accounts
     FROM building b
     ORDER BY b.address_text`,
  )
  return rows
}

export interface TariffRow {
  service: string
  consumer_category: string
  component: string
  value: string
  vat_mode: string
  doc_ref: string | null
  valid_from: string
  valid_to: string | null
}

export async function listTariffs(pg: PGlite): Promise<TariffRow[]> {
  const { rows } = await pg.query<TariffRow>(
    `SELECT service, consumer_category, component, value::text, vat_mode, doc_ref,
            valid_from::text AS valid_from, valid_to::text AS valid_to
     FROM tariff ORDER BY service, consumer_category, component, valid_from DESC`,
  )
  return rows
}

export interface NormRow {
  kind: string
  category_code: string | null
  value: string
  doc_ref: string | null
  valid_from: string
  valid_to: string | null
}

export async function listNorms(pg: PGlite): Promise<NormRow[]> {
  const { rows } = await pg.query<NormRow>(
    `SELECT kind, category_code, value::text, doc_ref,
            valid_from::text AS valid_from, valid_to::text AS valid_to
     FROM norm ORDER BY kind, category_code NULLS FIRST, valid_from DESC`,
  )
  return rows
}

export interface Stats {
  accounts: number
  buildings: number
  openPeriod: { year: number; month: number } | null
  readingsEntered: number
  activeIpu: number
}

export async function getStats(pg: PGlite): Promise<Stats> {
  const [acc, bld, period] = await Promise.all([
    pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM account WHERE date_close IS NULL`),
    pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM building`),
    pg.query<{ id: string; year: number; month: number }>(
      `SELECT id, year, month FROM billing_period WHERE status = 'open' ORDER BY year, month LIMIT 1`,
    ),
  ])
  const open = period.rows[0] ?? null
  let readingsEntered = 0
  let activeIpu = 0
  if (open) {
    const [entered, ipu] = await Promise.all([
      pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM meter_reading r
         JOIN meter m ON m.id = r.meter_id
         WHERE r.period_id = $1 AND r.status = 'accepted' AND m.kind = 'ipu_hw'`,
        [open.id],
      ),
      pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM meter WHERE kind = 'ipu_hw' AND status = 'active'`,
      ),
    ])
    readingsEntered = entered.rows[0]?.n ?? 0
    activeIpu = ipu.rows[0]?.n ?? 0
  }
  return {
    accounts: acc.rows[0]?.n ?? 0,
    buildings: bld.rows[0]?.n ?? 0,
    openPeriod: open ? { year: open.year, month: open.month } : null,
    readingsEntered,
    activeIpu,
  }
}

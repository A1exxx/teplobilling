import type { PGlite } from '@electric-sql/pglite'

export interface ReadingRow {
  meter_id: string
  premise_number: string
  account_number: string
  serial_no: string
  digits: number
  meter_status: string
  prev_value: string | null
  current_value: string | null
}

/** Квартиры дома с ИПУ ГВС: предыдущее принятое показание и показание текущего периода. */
export async function listReadingRows(
  pg: PGlite,
  buildingId: string,
  periodId: string,
): Promise<ReadingRow[]> {
  const { rows } = await pg.query<ReadingRow>(
    `SELECT m.id AS meter_id, p.number AS premise_number, a.account_number,
            m.serial_no, m.digits, m.status AS meter_status,
            prev.value::text AS prev_value, cur.value::text AS current_value
     FROM meter m
     JOIN premise p ON p.id = m.premise_id
     LEFT JOIN account a ON a.premise_id = p.id AND a.date_close IS NULL
     LEFT JOIN LATERAL (
       SELECT r.value FROM meter_reading r
       JOIN billing_period bp ON bp.id = r.period_id
       JOIN billing_period target ON target.id = $2
       WHERE r.meter_id = m.id AND r.status = 'accepted'
         AND (bp.year * 12 + bp.month) < (target.year * 12 + target.month)
       ORDER BY bp.year DESC, bp.month DESC LIMIT 1
     ) prev ON true
     LEFT JOIN LATERAL (
       SELECT r.value FROM meter_reading r
       WHERE r.meter_id = m.id AND r.period_id = $2 AND r.status = 'accepted'
       LIMIT 1
     ) cur ON true
     WHERE m.kind = 'ipu_hw' AND m.status <> 'removed' AND p.building_id = $1
     ORDER BY length(p.number), p.number`,
    [buildingId, periodId],
  )
  return rows
}

/** Принять показание: обновляет существующее принятое за период или создает новое. */
export async function saveReading(
  pg: PGlite,
  meterId: string,
  periodId: string,
  value: string,
): Promise<void> {
  const existing = await pg.query<{ id: string }>(
    `SELECT id FROM meter_reading WHERE meter_id = $1 AND period_id = $2 AND status = 'accepted'`,
    [meterId, periodId],
  )
  const row = existing.rows[0]
  if (row) {
    await pg.query(`UPDATE meter_reading SET value = $2, entered_at = now() WHERE id = $1`, [row.id, value])
  } else {
    await pg.query(
      `INSERT INTO meter_reading (tenant_id, meter_id, period_id, value, reading_date, source, status)
       SELECT m.tenant_id, m.id, $2, $3, current_date, 'operator', 'accepted' FROM meter m WHERE m.id = $1`,
      [meterId, periodId, value],
    )
  }
}

export interface OpenPeriodInfo {
  id: string
  year: number
  month: number
  status: string
}

export async function getWorkingPeriod(pg: PGlite): Promise<OpenPeriodInfo | null> {
  const { rows } = await pg.query<OpenPeriodInfo>(
    `SELECT id, year, month, status FROM billing_period
     WHERE status IN ('open','calculated') ORDER BY year, month LIMIT 1`,
  )
  return rows[0] ?? null
}

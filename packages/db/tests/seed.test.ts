import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { loadMigrations } from '../src/migrations-manifest'
import { runMigrations } from '../src/migrate'
import { isDemoSeeded, seedDemo } from '../src/seed/demo'

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite()
  await runMigrations(pg, loadMigrations())
  return pg
}

describe('seedDemo — демо-данные пилотного контура', () => {
  it('наполняет базу: 10 домов, 3 схемы приборов учета, ~170 ЛС, тарифы и нормативы', async () => {
    const pg = await freshDb()
    expect(await isDemoSeeded(pg)).toBe(false)

    const summary = await seedDemo(pg)

    expect(summary.buildings).toBe(10)
    expect(summary.premises).toBeGreaterThanOrEqual(160)
    expect(summary.accounts).toBe(summary.premises)
    expect(summary.tariffs).toBeGreaterThanOrEqual(8)
    expect(summary.norms).toBeGreaterThanOrEqual(4)
    expect(summary.readings).toBeGreaterThan(0)
    expect(await isDemoSeeded(pg)).toBe(true)
    await pg.close()
  })

  it('повторный запуск отвергается — база уже наполнена', async () => {
    const pg = await freshDb()
    await seedDemo(pg)
    await expect(seedDemo(pg)).rejects.toThrow(/уже/i)
    await pg.close()
  })

  it('инварианты данных: владельцы, схемы ПУ по группам домов, нулевые жильцы для п.56(2)', async () => {
    const pg = await freshDb()
    await seedDemo(pg)

    // у каждого ЛС есть владелец
    const orphans = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM account a
       WHERE NOT EXISTS (SELECT 1 FROM account_customer ac WHERE ac.account_id = a.id AND ac.role = 'owner')`,
    )
    expect(orphans.rows[0]?.n).toBe(0)

    // ОДПУ тепла ровно у 7 домов (группы A и B), у группы C — ни одного
    const odpu = await pg.query<{ n: number }>(
      `SELECT count(DISTINCT building_id)::int AS n FROM meter WHERE kind = 'odpu_heat'`,
    )
    expect(odpu.rows[0]?.n).toBe(7)

    // ИПУ ГВС есть только в домах группы A (4 дома)
    const ipuBuildings = await pg.query<{ n: number }>(
      `SELECT count(DISTINCT p.building_id)::int AS n
       FROM meter m JOIN premise p ON p.id = m.premise_id
       WHERE m.kind = 'ipu_hw'`,
    )
    expect(ipuBuildings.rows[0]?.n).toBe(4)

    // есть счетчики с истекшей поверкой (кейс W-05)
    const expired = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM meter WHERE status = 'verification_expired'`,
    )
    expect(expired.rows[0]?.n).toBeGreaterThanOrEqual(2)

    // есть жилые ЛС без зарегистрированных (кейс п.56(2))
    const zeroResidents = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM account a
       WHERE a.kind = 'residential'
         AND NOT EXISTS (SELECT 1 FROM account_resident r WHERE r.account_id = a.id AND r.date_to IS NULL)`,
    )
    expect(zeroResidents.rows[0]?.n).toBeGreaterThanOrEqual(5)

    // площадь дома = сумме площадей помещений (первый дом)
    const balance = await pg.query<{ ok: boolean }>(
      `SELECT (b.total_premises_area = sum(p.total_area)) AS ok
       FROM building b JOIN premise p ON p.building_id = b.id
       GROUP BY b.id, b.total_premises_area LIMIT 1`,
    )
    expect(balance.rows[0]?.ok).toBe(true)

    // показания ИПУ: июньский кумулятив строго больше майского (счетчик не крутится назад)
    const monotonic = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM meter_reading r5
       JOIN billing_period p5 ON p5.id = r5.period_id AND p5.month = 5
       JOIN meter_reading r6 ON r6.meter_id = r5.meter_id
       JOIN billing_period p6 ON p6.id = r6.period_id AND p6.month = 6
       WHERE r5.value >= r6.value`,
    )
    expect(monotonic.rows[0]?.n).toBe(0)

    // три расчетных периода: май/июнь закрыты, июль открыт
    const periods = await pg.query<{ month: number; status: string }>(
      `SELECT month, status FROM billing_period ORDER BY month`,
    )
    expect(periods.rows).toEqual([
      { month: 5, status: 'closed' },
      { month: 6, status: 'closed' },
      { month: 7, status: 'open' },
    ])
    await pg.close()
  })
})

import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { loadMigrations } from '../src/migrations-manifest'
import { runMigrations } from '../src/migrate'

// Миграции должны накатываться на чистую PGlite (тот же движок, что в браузере)
// и быть идемпотентными: повторный прогон ничего не ломает и ничего не применяет заново.

describe('runMigrations на чистой PGlite', () => {
  it('создает все таблицы ядра и ведет журнал _migrations', async () => {
    const pg = new PGlite()
    const migrations = loadMigrations()
    expect(migrations.length).toBeGreaterThan(0)

    const applied = await runMigrations(pg, migrations)
    expect(applied).toBe(migrations.length)

    const { rows } = await pg.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
    const tables = rows.map((r) => r.table_name)
    for (const expected of [
      '_migrations',
      'tenant',
      'municipality',
      'settlement',
      'street',
      'building',
      'premise',
      'account',
      'customer',
      'account_customer',
      'account_resident',
      'meter',
      'meter_reading',
      'tariff',
      'norm',
      'billing_period',
    ]) {
      expect(tables).toContain(expected)
    }
    await pg.close()
  })

  it('partial unique: два принятых показания одного счетчика за период невозможны', async () => {
    const pg = new PGlite()
    await runMigrations(pg, loadMigrations())
    await pg.exec(`
      INSERT INTO tenant (id, name) VALUES ('018f0000-0000-7000-8000-00000000000a', 'МУП Тест');
      INSERT INTO billing_period (id, tenant_id, year, month)
        VALUES ('018f0000-0000-7000-8000-00000000000b', '018f0000-0000-7000-8000-00000000000a', 2026, 7);
      INSERT INTO meter (id, tenant_id, kind, serial_no, digits)
        VALUES ('018f0000-0000-7000-8000-00000000000c', '018f0000-0000-7000-8000-00000000000a', 'ipu_hw', 'X-1', 5);
      INSERT INTO meter_reading (id, tenant_id, meter_id, period_id, value, source, status)
        VALUES ('018f0000-0000-7000-8000-00000000000d', '018f0000-0000-7000-8000-00000000000a',
                '018f0000-0000-7000-8000-00000000000c', '018f0000-0000-7000-8000-00000000000b', 123.456, 'operator', 'accepted');
    `)
    await expect(
      pg.exec(`
        INSERT INTO meter_reading (id, tenant_id, meter_id, period_id, value, source, status)
          VALUES ('018f0000-0000-7000-8000-00000000000e', '018f0000-0000-7000-8000-00000000000a',
                  '018f0000-0000-7000-8000-00000000000c', '018f0000-0000-7000-8000-00000000000b', 124, 'operator', 'accepted');
      `),
    ).rejects.toThrow(/duplicate key|unique/i)
    // отклоненное показание при этом сосуществует спокойно
    await pg.exec(`
      INSERT INTO meter_reading (id, tenant_id, meter_id, period_id, value, source, status)
        VALUES ('018f0000-0000-7000-8000-00000000000f', '018f0000-0000-7000-8000-00000000000a',
                '018f0000-0000-7000-8000-00000000000c', '018f0000-0000-7000-8000-00000000000b', 125, 'operator', 'rejected');
    `)
    await pg.close()
  })

  it('повторный прогон идемпотентен (0 новых применений)', async () => {
    const pg = new PGlite()
    const migrations = loadMigrations()
    await runMigrations(pg, migrations)
    const appliedSecondTime = await runMigrations(pg, migrations)
    expect(appliedSecondTime).toBe(0)
    await pg.close()
  })

  it('базовые констрейнты живут: уникальность номера ЛС в рамках tenant', async () => {
    const pg = new PGlite()
    await runMigrations(pg, loadMigrations())

    await pg.exec(`
      INSERT INTO tenant (id, name) VALUES ('018f0000-0000-7000-8000-000000000001', 'МУП Тест');
      INSERT INTO account (id, tenant_id, account_number, kind, date_open)
        VALUES ('018f0000-0000-7000-8000-000000000002', '018f0000-0000-7000-8000-000000000001', '100200300', 'residential', '2026-01-01');
    `)
    await expect(
      pg.exec(`
        INSERT INTO account (id, tenant_id, account_number, kind, date_open)
          VALUES ('018f0000-0000-7000-8000-000000000003', '018f0000-0000-7000-8000-000000000001', '100200300', 'residential', '2026-02-01');
      `),
    ).rejects.toThrow(/duplicate key|unique/i)
    await pg.close()
  })
})

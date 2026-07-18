import type { PGlite } from '@electric-sql/pglite'

export interface MigrationEntry {
  /** Имя файла миграции — ключ идемпотентности, порядок задается сортировкой по имени */
  name: string
  sql: string
}

/**
 * Прогоняет миграции по порядку имен, журналируя примененные в _migrations.
 * Один и тот же раннер работает в браузере (PGlite/IndexedDB) и в тестах (PGlite in-memory).
 * Возвращает число примененных в этом запуске миграций.
 */
export async function runMigrations(pg: PGlite, migrations: MigrationEntry[]): Promise<number> {
  await pg.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  )
  const { rows } = await pg.query<{ name: string }>('SELECT name FROM _migrations')
  const done = new Set(rows.map((r) => r.name))

  let applied = 0
  for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(migration.name)) continue
    await pg.exec(migration.sql)
    await pg.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name])
    applied += 1
  }
  return applied
}

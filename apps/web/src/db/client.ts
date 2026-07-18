import { PGlite } from '@electric-sql/pglite'
import { loadMigrations, runMigrations } from '@teplobilling/db'

export interface DbStatus {
  tables: number
  migrationsApplied: number
  migrationsTotal: number
}

let dbPromise: Promise<{ pg: PGlite; status: DbStatus }> | null = null

/** Единственная точка входа к БД: PGlite поверх IndexedDB + прогон миграций при старте. */
export function getDb(): Promise<{ pg: PGlite; status: DbStatus }> {
  dbPromise ??= initDb()
  return dbPromise
}

async function initDb(): Promise<{ pg: PGlite; status: DbStatus }> {
  const pg = new PGlite('idb://teplobilling')
  const migrations = loadMigrations()
  const applied = await runMigrations(pg, migrations)
  const { rows } = await pg.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  )
  return {
    pg,
    status: {
      tables: rows[0]?.count ?? 0,
      migrationsApplied: applied,
      migrationsTotal: migrations.length,
    },
  }
}

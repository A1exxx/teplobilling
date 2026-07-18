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

/** Резервная копия: скачивание всей БД одним файлом (tar.gz каталога данных PGlite). */
export async function exportDbBackup(): Promise<void> {
  const { pg } = await getDb()
  const dump = await pg.dumpDataDir('gzip')
  const url = URL.createObjectURL(dump)
  const link = document.createElement('a')
  link.href = url
  link.download = `teplobilling-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Восстановление из копии: заменяет текущую базу содержимым файла и перезагружает приложение.
 * Вызывается только по явному действию пользователя (Popconfirm в UI).
 */
export async function restoreDbBackup(file: File): Promise<void> {
  const current = await getDb()
  await current.pg.close()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('/pglite/teplobilling')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(new Error('Не удалось удалить текущую базу'))
    req.onblocked = () => reject(new Error('База занята другой вкладкой — закройте другие вкладки приложения'))
  })
  const restored = new PGlite('idb://teplobilling', { loadDataDir: file })
  await restored.query('SELECT 1')
  await restored.close()
  window.location.reload()
}

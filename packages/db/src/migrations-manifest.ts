import type { MigrationEntry } from './migrate'

// Vite/Vitest собирают все сгенерированные drizzle-kit миграции как сырые строки.
// В браузере и в тестах манифест один и тот же — источник правды один.
const files = import.meta.glob('../migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function loadMigrations(): MigrationEntry[] {
  return Object.entries(files)
    .map(([path, sql]) => ({ name: path.split('/').at(-1) ?? path, sql }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

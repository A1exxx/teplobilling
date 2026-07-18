import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env['CI'] ? 1 : 0,
  // Каждый тест поднимает PGlite (WASM) и гоняет расчет 170 ЛС — параллельные
  // воркеры дерутся за CPU и флейкают; серийный прогон стабилен.
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199/teplobilling/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @teplobilling/web dev --port 5199 --strictPort',
    url: 'http://localhost:5199/teplobilling/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})

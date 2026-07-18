import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('#/')
})

test('S-shell-01: загрузка и монитор периода', async ({ page }) => {
  await expect(page.getByText('Теплобиллинг', { exact: true })).toBeVisible()
  await expect(page.getByText('МУП «Тепловые сети»', { exact: false })).toBeVisible()
  await expect(page.getByText('База пуста — начните с демо-данных')).toBeVisible()
})

test('S-shell-02: PGlite инициализируется', async ({ page }) => {
  const tables = page.getByTestId('db-tables')
  await expect(tables).toBeVisible({ timeout: 30_000 })
  const count = Number(await tables.textContent())
  expect(count).toBeGreaterThanOrEqual(16)
  await expect(page.getByText('PostgreSQL (PGlite) в браузере')).toBeVisible()
})

test('S-shell-03: навигация по разделам', async ({ page }) => {
  await page.getByRole('menuitem', { name: 'Ввод показаний' }).click()
  await expect(page).toHaveURL(/#\/readings$/)
  await expect(page.getByRole('heading', { name: 'Ввод показаний' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Ввод показаний' })).toHaveClass(
    /ant-menu-item-selected/,
  )
})

test('S-shell-04: кнопка демо-данных наполняет базу', async ({ page }) => {
  const button = page.getByTestId('seed-demo-button')
  await expect(button).toBeEnabled({ timeout: 30_000 })
  await button.click()
  await expect(page.getByText('Демо-данные загружены', { exact: false })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId('seeded-tag')).toBeVisible()
  await expect(page.getByTestId('stat-accounts')).toContainText('170')
})

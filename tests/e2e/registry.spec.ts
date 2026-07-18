import { expect, test } from '@playwright/test'
import { seedViaUi } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedViaUi(page)
})

test('S-reg-01: реестр ЛС показывает 170 демо-счетов', async ({ page }) => {
  await page.goto('#/accounts')
  await expect(page.getByText('всего: 170')).toBeVisible({ timeout: 15_000 })
  const rows = page.locator('[data-testid="accounts-table"] tbody tr')
  await expect(rows.first()).toBeVisible()
})

test('S-reg-02: поиск сужает реестр', async ({ page }) => {
  await page.goto('#/accounts')
  await expect(page.getByText('всего: 170')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('accounts-search').locator('input').fill('Заводская, д. 3')
  await page.getByTestId('accounts-search').locator('input').press('Enter')
  await expect(page.getByText('всего: 31')).toBeVisible({ timeout: 15_000 })
})

test('S-reg-03: клик по строке открывает карточку ЛС', async ({ page }) => {
  await page.goto('#/accounts')
  const firstRow = page.locator('[data-testid="accounts-table"] tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.click()
  await expect(page.getByTestId('account-card')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /Лицевой счет №/ })).toBeVisible()
  await expect(page.getByText('Приборы учета')).toBeVisible()
})

test('S-reg-04: реестр домов — 10 домов с паспортом', async ({ page }) => {
  await page.goto('#/buildings')
  const rows = page.locator('[data-testid="buildings-table"] tbody tr')
  await expect(rows).toHaveCount(10, { timeout: 15_000 })
  await rows.first().click()
  await expect(page.getByText('Площадь общего имущества')).toBeVisible()
})

test('S-reg-05: тарифы и нормативы с версиями', async ({ page }) => {
  await page.goto('#/tariffs')
  await expect(page.locator('[data-testid="tariffs-table"] tbody tr')).toHaveCount(8, {
    timeout: 15_000,
  })
  await expect(page.locator('[data-testid="norms-table"] tbody tr')).toHaveCount(4)
  await expect(page.getByText('действует').first()).toBeVisible()
})

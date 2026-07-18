import { expect, type Page } from '@playwright/test'

/** Наполняет чистую браузерную БД демо-данными через UI монитора периода. */
export async function seedViaUi(page: Page): Promise<void> {
  await page.goto('#/')
  const button = page.getByTestId('seed-demo-button')
  await expect(button).toBeEnabled({ timeout: 30_000 })
  await button.click()
  await expect(page.getByTestId('seeded-tag')).toBeVisible({ timeout: 30_000 })
}

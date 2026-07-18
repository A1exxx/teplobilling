import { expect, test } from '@playwright/test'
import { seedViaUi } from './helpers'

test('S-money-01: деньги end-to-end — оплаты, должники с пеней, закрытие периода, выгрузки', async ({ page }) => {
  test.setTimeout(300_000)
  await seedViaUi(page)

  // расчет июля
  await page.getByTestId('calc-period-button').click()
  await expect(page.getByText('Рассчитано 170 ЛС', { exact: false })).toBeVisible({ timeout: 180_000 })

  // демо-оплаты: история май-июнь + 310 оплат
  await page.goto('#/payments')
  await page.getByTestId('seed-payments-button').click()
  await expect(page.getByText('История создана', { exact: false })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('payments-count')).toContainText('310')

  // должники: только просроченные требования, с пеней
  await page.goto('#/debtors')
  await expect(page.getByText(/Должников: \d+ · долг/)).toBeVisible({ timeout: 60_000 })
  const headline = await page.locator('.ant-alert').first().textContent()
  expect(headline).toMatch(/Должников: (2\d|3\d) ·/) // ~17% из 170
  expect(headline).toContain('пени на сегодня')

  // сальдо в карточке должника
  const firstDebtor = page.locator('[data-testid="debtors-table"] tbody tr.ant-table-row').first()
  await firstDebtor.dblclick()
  await expect(page.getByTestId('account-card')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('tab', { name: 'Платежи и сальдо' }).click()
  await expect(page.getByTestId('balance-value')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('задолженность')).toBeVisible()

  // закрытие периода → август
  await page.goto('#/')
  await page.getByTestId('close-period-button').click()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByText('закрыт (170 снапшотов', { exact: false })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('period-status')).toContainText('Август', { timeout: 30_000 })

  // выгрузка ведомости за закрытый июль
  await page.goto('#/documents')
  const download = page.waitForEvent('download')
  await page.getByTestId('export-sheet').click()
  expect((await download).suggestedFilename()).toMatch(/vedomost-2026-07\.csv/)
})

import { expect, test } from '@playwright/test'
import { seedViaUi } from './helpers'

test('S-flow-01: полный цикл — расчет периода, начисления с трейсом, квитанция с QR', async ({ page }) => {
  test.setTimeout(240_000)
  await seedViaUi(page)

  // Расчет периода
  const calcButton = page.getByTestId('calc-period-button')
  await expect(calcButton).toBeVisible()
  await calcButton.click()
  await expect(page.getByText('Рассчитано 170 ЛС', { exact: false })).toBeVisible({ timeout: 180_000 })
  await expect(page.getByTestId('period-status')).toContainText('рассчитан')
  await expect(page.getByTestId('stat-accrued')).toBeVisible()

  // Начисления в карточке ЛС + след расчета
  await page.goto('#/accounts')
  const firstRow = page.locator('[data-testid="accounts-table"] tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.click()
  await expect(page.getByTestId('accrual-total')).toBeVisible({ timeout: 15_000 })
  const lineRows = page.locator('[data-testid="accrual-lines"] tbody tr.ant-table-row')
  expect(await lineRows.count()).toBeGreaterThanOrEqual(2)
  await page.locator('[data-testid="accrual-lines"] .ant-table-row-expand-icon').first().click()
  await expect(page.getByText('ПП 354', { exact: false }).first()).toBeVisible()

  // Квитанция
  await page.getByTestId('open-receipt').click()
  await expect(page.getByTestId('receipt-sheet')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('ПЛАТЕЖНЫЙ ДОКУМЕНТ', { exact: false })).toBeVisible()
  await expect(page.getByTestId('receipt-qr')).toBeVisible()
  await expect(page.getByTestId('receipt-total')).not.toBeEmpty()
})

test('S-read-01: ввод показаний — валидация «не меньше предыдущего» и принятие', async ({ page }) => {
  test.setTimeout(120_000)
  await seedViaUi(page)

  await page.goto('#/readings')
  const table = page.getByTestId('readings-table')
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })

  const firstInput = table.locator('tbody tr').first().locator('input')
  const prevText = await table.locator('tbody tr').first().locator('td').nth(4).textContent()
  const prev = Number((prevText ?? '0').replace(',', '.'))

  // меньше предыдущего — кнопка блокируется, подсвечена ошибка
  await firstInput.fill(String(Math.max(0, prev - 1)))
  await expect(page.getByTestId('readings-save')).toBeDisabled()
  await expect(page.getByText('меньше предыдущих', { exact: false })).toBeVisible()

  // корректное значение — принимается
  await firstInput.fill((prev + 3.5).toFixed(3))
  await expect(page.getByTestId('readings-save')).toBeEnabled()
  await page.getByTestId('readings-save').click()
  await expect(page.getByText('Принято показаний: 1')).toBeVisible({ timeout: 60_000 })
  await expect(table.locator('tbody tr').first().getByText('да')).toBeVisible()
})

import type { PGlite } from '@electric-sql/pglite'
import { COMPONENT_LABELS, LINE_KIND_LABELS, SERVICE_LABELS } from '../labels'

/** CSV с BOM и «;» — открывается русским Excel без танцев с кодировками. */
function downloadCsv(filename: string, rows: string[][]): void {
  const body = rows.map((r) => r.map((c) => (c.includes(';') || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

interface PeriodPick {
  id: string
  year: number
  month: number
}

async function latestCalculatedPeriod(pg: PGlite): Promise<PeriodPick> {
  const { rows } = await pg.query<PeriodPick>(
    `SELECT DISTINCT bp.id, bp.year, bp.month
     FROM billing_period bp JOIN accrual ac ON ac.period_id = bp.id AND ac.is_current
     ORDER BY bp.year DESC, bp.month DESC LIMIT 1`,
  )
  const period = rows[0]
  if (!period) throw new Error('Нет рассчитанных периодов — сначала выполните расчет')
  return period
}

/** Ведомость начислений: построчно по услугам, для бухгалтерии и сверок. */
export async function exportAccrualSheet(pg: PGlite): Promise<string> {
  const period = await latestCalculatedPeriod(pg)
  const { rows } = await pg.query<{
    account_number: string
    address_text: string | null
    premise_number: string
    owner: string | null
    service: string
    component: string
    line_kind: string
    volume: string
    unit: string
    rate: string
    amount: string
  }>(
    `SELECT a.account_number, b.address_text, p.number AS premise_number,
            COALESCE(c.full_name, c.last_name || ' ' || c.first_name || ' ' || c.middle_name) AS owner,
            l.service, l.component, l.line_kind, l.volume::text AS volume, l.unit,
            l.rate::text AS rate, l.amount::text AS amount
     FROM accrual_line l
     JOIN accrual ac ON ac.id = l.accrual_id AND ac.is_current AND ac.period_id = $1
     JOIN account a ON a.id = ac.account_id
     JOIN premise p ON p.id = a.premise_id
     JOIN building b ON b.id = p.building_id
     LEFT JOIN account_customer acc ON acc.account_id = a.id AND acc.role = 'owner' AND acc.date_to IS NULL
     LEFT JOIN customer c ON c.id = acc.customer_id
     ORDER BY a.account_number, l.service, l.component`,
    [period.id],
  )
  const table: string[][] = [
    ['Лицевой счет', 'Адрес', 'Помещение', 'Плательщик', 'Услуга', 'Вид строки', 'Объем', 'Ед.', 'Тариф', 'Сумма, руб'],
    ...rows.map((r) => [
      r.account_number,
      r.address_text ?? '',
      r.premise_number,
      r.owner ?? '',
      `${SERVICE_LABELS[r.service] ?? r.service}${r.component !== 'single' ? ` (${COMPONENT_LABELS[r.component]})` : ''}`,
      LINE_KIND_LABELS[r.line_kind] ?? r.line_kind,
      Number(r.volume).toFixed(4),
      r.unit === 'Gcal' ? 'Гкал' : 'м3',
      Number(r.rate).toFixed(2),
      Number(r.amount).toFixed(2),
    ]),
  ]
  const name = `vedomost-${period.year}-${String(period.month).padStart(2, '0')}.csv`
  downloadCsv(name, table)
  return name
}

/** Реестр для 1С:Бухгалтерии: свод по ЛС и услугам за период. */
export async function export1cRegistry(pg: PGlite): Promise<string> {
  const period = await latestCalculatedPeriod(pg)
  const { rows } = await pg.query<{
    account_number: string
    kind: string
    service: string
    total: string
  }>(
    `SELECT a.account_number, a.kind, l.service, sum(l.amount)::text AS total
     FROM accrual_line l
     JOIN accrual ac ON ac.id = l.accrual_id AND ac.is_current AND ac.period_id = $1
     JOIN account a ON a.id = ac.account_id
     GROUP BY a.account_number, a.kind, l.service
     ORDER BY a.account_number, l.service`,
    [period.id],
  )
  const periodLabel = `${String(period.month).padStart(2, '0')}.${period.year}`
  const table: string[][] = [
    ['Период', 'Лицевой счет', 'Категория', 'Услуга', 'Сумма начисления, руб', 'Счет учета'],
    ...rows.map((r) => [
      periodLabel,
      r.account_number,
      r.kind === 'legal' ? 'юрлицо' : 'население',
      SERVICE_LABELS[r.service] ?? r.service,
      Number(r.total).toFixed(2),
      r.kind === 'legal' ? '62.01' : '62.31',
    ]),
  ]
  const name = `1c-nachisleniya-${period.year}-${String(period.month).padStart(2, '0')}.csv`
  downloadCsv(name, table)
  return name
}

/** Реестр платежных документов для ГИС ЖКХ (структура полей; маппинг на официальный xlsx-шаблон — при пилоте). */
export async function exportGisRegistry(pg: PGlite): Promise<string> {
  const period = await latestCalculatedPeriod(pg)
  const { rows } = await pg.query<{
    account_number: string
    gis_els: string | null
    gis_zhku_id: string | null
    address_text: string | null
    premise_number: string
    total: string
  }>(
    `SELECT a.account_number, a.gis_els, a.gis_zhku_id, b.address_text, p.number AS premise_number,
            ac.total_amount::text AS total
     FROM accrual ac
     JOIN account a ON a.id = ac.account_id
     JOIN premise p ON p.id = a.premise_id
     JOIN building b ON b.id = p.building_id
     WHERE ac.is_current AND ac.period_id = $1
     ORDER BY a.account_number`,
    [period.id],
  )
  const table: string[][] = [
    ['Номер ЛС', 'ЕЛС ГИС ЖКХ', 'Идентификатор ЖКУ', 'Адрес помещения', 'Период', 'Итого к оплате, руб'],
    ...rows.map((r) => [
      r.account_number,
      r.gis_els ?? '(будет присвоен ГИС ЖКХ)',
      r.gis_zhku_id ?? '',
      `${r.address_text ?? ''}, ${r.premise_number}`,
      `${String(period.month).padStart(2, '0')}.${period.year}`,
      Number(r.total).toFixed(2),
    ]),
  ]
  const name = `gis-zhkh-pd-${period.year}-${String(period.month).padStart(2, '0')}.csv`
  downloadCsv(name, table)
  return name
}

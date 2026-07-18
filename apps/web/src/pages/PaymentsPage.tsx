import { ImportOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { App, Alert, Button, Card, Col, Row, Statistic, Table, Tag, Typography, Upload } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getDb } from '../db/client'
import { importPaymentsCsv, seedDemoPayments, type CsvImportResult } from '../services/payments'

interface PaymentListRow {
  id: string
  pay_date: string
  account_number: string
  owner: string | null
  amount: string
  source: string
  doc_no: string | null
}

export function PaymentsPage() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<PaymentListRow[]>([])
  const [totals, setTotals] = useState<{ count: number; sum: string }>({ count: 0, sum: '0' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [importReport, setImportReport] = useState<CsvImportResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { pg } = await getDb()
    const [list, agg] = await Promise.all([
      pg.query<PaymentListRow>(
        `SELECT p.id, p.pay_date::text AS pay_date, a.account_number,
                COALESCE(c.full_name, c.last_name || ' ' || c.first_name || ' ' || c.middle_name) AS owner,
                p.amount::text AS amount, p.source, p.doc_no
         FROM payment p
         JOIN account a ON a.id = p.account_id
         LEFT JOIN account_customer ac ON ac.account_id = a.id AND ac.role = 'owner' AND ac.date_to IS NULL
         LEFT JOIN customer c ON c.id = ac.customer_id
         ORDER BY p.pay_date DESC, a.account_number LIMIT 300`,
      ),
      pg.query<{ count: number; sum: string | null }>(
        `SELECT count(*)::int AS count, sum(amount)::text AS sum FROM payment`,
      ),
    ])
    setRows(list.rows)
    setTotals({ count: agg.rows[0]?.count ?? 0, sum: agg.rows[0]?.sum ?? '0' })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const seedPayments = async () => {
    setBusy(true)
    try {
      const { pg } = await getDb()
      const summary = await seedDemoPayments(pg)
      message.success(
        `История создана: ${summary.historyAccruals} начислений (май–июнь), ${summary.payments} оплат на ${Number(summary.paidTotal).toLocaleString('ru-RU')} ₽`,
      )
      await load()
    } catch (error) {
      message.error(String(error))
    } finally {
      setBusy(false)
    }
  }

  const importCsv = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const { pg } = await getDb()
      const result = await importPaymentsCsv(pg, text)
      setImportReport(result)
      message.success(`Импорт: принято ${result.accepted}, в карантине ${result.quarantine.length}`)
      await load()
    } catch (error) {
      message.error(String(error))
    } finally {
      setBusy(false)
    }
    return false
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Платежи
        </Typography.Title>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={busy}
            onClick={() => void seedPayments()}
            data-testid="seed-payments-button"
          >
            Сымитировать оплаты (демо)
          </Button>
          <Upload
            accept=".csv,.txt"
            showUploadList={false}
            beforeUpload={(file) => void importCsv(file)}
          >
            <Button icon={<ImportOutlined />} loading={busy} data-testid="import-csv-button">
              Импорт реестра CSV
            </Button>
          </Upload>
          <Typography.Text type="secondary" style={{ alignSelf: 'center' }}>
            Формат CSV: «лицевой_счет;сумма;дата» — ошибочные строки попадают в карантин
          </Typography.Text>
        </div>
      </Col>

      {importReport && importReport.quarantine.length > 0 && (
        <Col span={24}>
          <Alert
            type="warning"
            showIcon
            closable
            onClose={() => setImportReport(null)}
            title={`Карантин импорта: ${importReport.quarantine.length} строк не принято`}
            description={
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {importReport.quarantine.slice(0, 8).map((q) => (
                  <li key={q.line}>
                    строка {q.line}: {q.error} — <code>{q.raw}</code>
                  </li>
                ))}
                {importReport.quarantine.length > 8 && <li>…и еще {importReport.quarantine.length - 8}</li>}
              </ul>
            }
          />
        </Col>
      )}

      <Col span={24}>
        <Card size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Оплат всего" value={totals.count} data-testid="payments-count" />
            </Col>
            <Col span={8}>
              <Statistic
                title="Сумма оплат, ₽"
                value={Number(totals.sum ?? 0)}
                precision={2}
                valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </Col>
          </Row>
        </Card>
      </Col>

      <Col span={24}>
        <Table<PaymentListRow>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          data-testid="payments-table"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'Оплат нет — сымитируйте демо-оплаты или импортируйте реестр' }}
          columns={[
            { title: 'Дата', dataIndex: 'pay_date', width: 110 },
            { title: '№ ЛС', dataIndex: 'account_number', width: 110 },
            { title: 'Плательщик', dataIndex: 'owner', ellipsis: true },
            {
              title: 'Сумма, ₽',
              dataIndex: 'amount',
              align: 'right',
              width: 120,
              render: (v: string) => (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(2)}</span>
              ),
            },
            {
              title: 'Источник',
              dataIndex: 'source',
              width: 110,
              render: (v: string) => <Tag>{v === 'demo' ? 'демо' : v === 'csv' ? 'реестр CSV' : 'вручную'}</Tag>,
            },
            { title: 'Документ', dataIndex: 'doc_no', width: 140 },
          ]}
        />
      </Col>
    </Row>
  )
}

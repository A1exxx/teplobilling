import { Alert, List, Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDb } from '../db/client'
import { getAccountMoney, listDebtors, type DebtorRow } from '../services/payments'

function PenaltyDetail({ accountId }: { accountId: string }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAccountMoney>> | null>(null)

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      setDetail(await getAccountMoney(pg, accountId))
    })()
  }, [accountId])

  if (!detail) return null
  const debtClaims = detail.penalty.claims.filter((c) => Number(c.outstanding) > 0 || Number(c.penalty) > 0)
  return (
    <div style={{ maxWidth: 860 }}>
      <Table
        size="small"
        rowKey="periodLabel"
        pagination={false}
        dataSource={debtClaims}
        columns={[
          { title: 'Период', dataIndex: 'periodLabel', width: 100 },
          { title: 'Срок оплаты', dataIndex: 'dueDate', width: 120 },
          { title: 'Начислено', dataIndex: 'claimAmount', align: 'right' },
          { title: 'Оплачено', dataIndex: 'paidTotal', align: 'right' },
          { title: 'Остаток', dataIndex: 'outstanding', align: 'right', render: (v: string) => <b>{v}</b> },
          { title: 'Пеня, ₽', dataIndex: 'penalty', align: 'right', render: (v: string) => <b>{v}</b> },
        ]}
      />
      {debtClaims.some((c) => c.trace.length > 0) && (
        <List
          size="small"
          header={<Typography.Text type="secondary">Разбивка пени по интервалам (ставка {detail.penalty.ratePercent}%, льготный потолок 9,5% — ПП №329)</Typography.Text>}
          dataSource={debtClaims.flatMap((c) => c.trace.map((t) => ({ period: c.periodLabel, ...t })))}
          renderItem={(step) => (
            <List.Item style={{ paddingBlock: 2 }}>
              <Typography.Text style={{ fontSize: 12 }}>
                <Tag style={{ marginInlineEnd: 6 }}>{step.period}</Tag>
                <b>{step.rule}:</b> {step.detail}
                {step.values && (
                  <Typography.Text type="secondary"> ({step.values['с']} — {step.values['по']})</Typography.Text>
                )}
              </Typography.Text>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}

export function DebtorsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<DebtorRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      setRows(await listDebtors(pg))
      setLoading(false)
    })()
  }, [])

  const totalDebt = rows.reduce((s, r) => s + Number(r.debt), 0)
  const totalPenalty = rows.reduce((s, r) => s + Number(r.penalty), 0)

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Должники и пени
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title={
          loading
            ? 'Считаем должников и пени…'
            : `Должников: ${rows.length} · долг ${totalDebt.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽ · пени на сегодня ${totalPenalty.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽`
        }
        description="Пеня считается по ч.14 ст.155 ЖК РФ: 1–30 день — 0, 31–90 — 1/300 ставки в день, с 91-го — 1/130; частичные оплаты уменьшают базу со следующего дня (разбивка — в раскрытии строки). Срок оплаты — 15-е число следующего месяца (177-ФЗ)."
      />
      <Table<DebtorRow>
        size="small"
        rowKey="account_id"
        loading={loading}
        dataSource={rows}
        data-testid="debtors-table"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: 'Должников нет — либо оплаты еще не загружены, либо все оплатили' }}
        expandable={{ expandedRowRender: (record) => <PenaltyDetail accountId={record.account_id} /> }}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onDoubleClick: () => navigate(`/accounts/${record.account_id}`),
        })}
        columns={[
          { title: '№ ЛС', dataIndex: 'account_number', width: 110 },
          { title: 'Адрес', dataIndex: 'address_text', ellipsis: true },
          { title: 'Должник', dataIndex: 'owner', ellipsis: true },
          {
            title: 'Долг, ₽',
            dataIndex: 'debt',
            align: 'right',
            width: 120,
            render: (v: string) => (
              <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Number(v).toFixed(2)}
              </Typography.Text>
            ),
          },
          { title: 'Старейший срок', dataIndex: 'oldestDue', width: 130 },
          {
            title: 'Просрочка',
            dataIndex: 'overdueDays',
            width: 110,
            render: (v: number) =>
              v > 90 ? <Tag color="error">{v} дн.</Tag> : v > 30 ? <Tag color="warning">{v} дн.</Tag> : <Tag>{v} дн.</Tag>,
          },
          {
            title: 'Пеня, ₽',
            dataIndex: 'penalty',
            align: 'right',
            width: 110,
            render: (v: string) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(2)}</span>,
          },
        ]}
      />
    </div>
  )
}

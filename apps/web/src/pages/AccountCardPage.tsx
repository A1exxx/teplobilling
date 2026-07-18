import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import { Button, Card, Col, Descriptions, Empty, List, Result, Row, Skeleton, Table, Tabs, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDb } from '../db/client'
import { getAccountAccrual, getAccountCard, type AccountCard, type AccrualView } from '../db/queries'
import { getAccountMoney } from '../services/payments'
import {
  COMPONENT_LABELS,
  HEATING_MODE_LABELS,
  HW_SYSTEM_LABELS,
  LINE_KIND_LABELS,
  METER_STATUS_LABELS,
  METHOD_LABELS,
  MONTH_LABELS,
  SERVICE_LABELS,
} from '../labels'

function AccrualsTab({ accountId }: { accountId: string }) {
  const navigate = useNavigate()
  const [view, setView] = useState<AccrualView | null | 'loading'>('loading')

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      setView(await getAccountAccrual(pg, accountId))
    })()
  }, [accountId])

  if (view === 'loading') return <Skeleton active paragraph={{ rows: 4 }} />
  if (!view)
    return (
      <Empty description="Начислений еще нет — запустите расчет периода на «Мониторе периода»" />
    )

  return (
    <div data-testid="accruals-tab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Typography.Text strong>
          {MONTH_LABELS[view.periodMonth]} {view.periodYear}
        </Typography.Text>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <Typography.Text strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }} data-testid="accrual-total">
            Итого: {Number(view.totalAmount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
          </Typography.Text>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => navigate(`/receipt/${accountId}`)}
            data-testid="open-receipt"
          >
            Квитанция
          </Button>
        </div>
      </div>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={view.lines}
        data-testid="accrual-lines"
        expandable={{
          rowExpandable: (record) => record.trace.length > 0,
          expandedRowRender: (record) => (
            <List
              size="small"
              dataSource={record.trace}
              renderItem={(step) => (
                <List.Item style={{ paddingBlock: 4 }}>
                  <Typography.Text>
                    <Typography.Text strong>{step.rule}.</Typography.Text> {step.detail}
                    {step.values && (
                      <Typography.Text type="secondary">
                        {' '}
                        {Object.entries(step.values)
                          .map(([k, v]) => `${k} = ${v}`)
                          .join('; ')}
                      </Typography.Text>
                    )}
                  </Typography.Text>
                </List.Item>
              )}
            />
          ),
        }}
        columns={[
          {
            title: 'Услуга',
            render: (_, r) =>
              `${SERVICE_LABELS[r.service] ?? r.service}${r.component !== 'single' ? ` (${COMPONENT_LABELS[r.component]})` : ''}`,
          },
          { title: 'Вид', dataIndex: 'line_kind', width: 110, render: (v: string) => LINE_KIND_LABELS[v] ?? v },
          { title: 'Способ расчета', dataIndex: 'method', render: (v: string) => METHOD_LABELS[v] ?? v },
          {
            title: 'Объем',
            align: 'right',
            width: 130,
            render: (_, r) =>
              Number(r.volume) > 0 ? (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Number(r.volume).toFixed(4)} {r.unit === 'Gcal' ? 'Гкал' : 'м³'}
                </span>
              ) : (
                '—'
              ),
          },
          {
            title: 'Тариф, ₽',
            dataIndex: 'rate',
            align: 'right',
            width: 110,
            render: (v: string) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(2)}</span>,
          },
          {
            title: 'Сумма, ₽',
            dataIndex: 'amount',
            align: 'right',
            width: 110,
            render: (v: string) => (
              <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Number(v).toFixed(2)}
              </Typography.Text>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
        Разверните строку, чтобы увидеть след расчета: формула, входные данные и шаги — основа ответа
        на любой вопрос абонента «откуда эта цифра».
      </Typography.Paragraph>
    </div>
  )
}

function MoneyTab({ accountId }: { accountId: string }) {
  const [money, setMoney] = useState<Awaited<ReturnType<typeof getAccountMoney>> | null>(null)

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      setMoney(await getAccountMoney(pg, accountId))
    })()
  }, [accountId])

  if (!money) return <Skeleton active paragraph={{ rows: 4 }} />
  const balance = Number(money.balance)

  return (
    <div data-testid="money-tab">
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap' }}>
        <Typography.Text strong style={{ fontSize: 16 }} data-testid="balance-value">
          Сальдо:{' '}
          <span style={{ fontVariantNumeric: 'tabular-nums', color: balance > 0 ? '#b42318' : '#0f766e' }}>
            {balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
          </span>
        </Typography.Text>
        {balance > 0 ? <Tag color="error">задолженность</Tag> : <Tag color="success">долга нет</Tag>}
        {Number(money.penalty.total) > 0 && (
          <Typography.Text type="danger">
            Пени на сегодня: {money.penalty.total} ₽ (ставка {money.penalty.ratePercent}%)
          </Typography.Text>
        )}
      </div>
      <Table
        size="small"
        rowKey="periodLabel"
        pagination={false}
        dataSource={money.claims}
        columns={[
          { title: 'Период', dataIndex: 'periodLabel', width: 100 },
          { title: 'Срок оплаты', dataIndex: 'dueDate', width: 120 },
          { title: 'Начислено, ₽', dataIndex: 'accrued', align: 'right' },
          { title: 'Оплачено (ФИФО), ₽', dataIndex: 'paid', align: 'right' },
          {
            title: 'Остаток, ₽',
            dataIndex: 'outstanding',
            align: 'right',
            render: (v: string) =>
              Number(v) > 0 ? <Typography.Text strong type="danger">{v}</Typography.Text> : v,
          },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 16 }}>
        Оплаты
      </Typography.Title>
      <Table
        size="small"
        rowKey={(r) => `${r.pay_date}-${r.amount}-${r.doc_no ?? ''}`}
        pagination={false}
        dataSource={money.payments}
        locale={{ emptyText: 'Оплат не было' }}
        columns={[
          { title: 'Дата', dataIndex: 'pay_date', width: 120 },
          {
            title: 'Сумма, ₽',
            dataIndex: 'amount',
            align: 'right',
            width: 130,
            render: (v: string) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(2)}</span>,
          },
          { title: 'Источник', dataIndex: 'source', width: 120 },
          { title: 'Документ', dataIndex: 'doc_no' },
        ]}
      />
    </div>
  )
}

export function AccountCardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [card, setCard] = useState<AccountCard | null | 'loading'>('loading')

  useEffect(() => {
    if (!id) return
    void (async () => {
      const { pg } = await getDb()
      setCard(await getAccountCard(pg, id))
    })()
  }, [id])

  if (card === 'loading') return <Skeleton active paragraph={{ rows: 8 }} />
  if (!card)
    return (
      <Result
        status="404"
        title="Лицевой счет не найден"
        extra={<Button onClick={() => navigate('/accounts')}>К реестру</Button>}
      />
    )

  const a = card.account
  return (
    <div data-testid="account-card">
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingInlineStart: 0, marginBottom: 8 }}
        onClick={() => navigate('/accounts')}
      >
        К реестру
      </Button>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Лицевой счет № {a.account_number}{' '}
        {a.kind === 'legal' && <Tag color="geekblue">юрлицо</Tag>}
      </Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Помещение и дом" size="small">
            <Descriptions
              column={1}
              size="small"
              items={[
                {
                  key: 'addr',
                  label: 'Адрес',
                  children: `${a.address_text ?? ''}, ${a.kind === 'legal' ? 'пом.' : 'кв.'} ${a.premise_number}`,
                },
                { key: 'area', label: 'Площадь', children: a.total_area ? `${a.total_area} м²` : '—' },
                { key: 'open', label: 'ЛС открыт', children: a.date_open },
                {
                  key: 'hw',
                  label: 'Система ГВС',
                  children: HW_SYSTEM_LABELS[a.hw_system] ?? a.hw_system,
                },
                {
                  key: 'heat',
                  label: 'Оплата отопления',
                  children: HEATING_MODE_LABELS[a.heating_payment_mode] ?? a.heating_payment_mode,
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Владелец" size="small">
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'owner', label: a.owner_kind === 'legal' ? 'Организация' : 'ФИО', children: a.owner ?? '—' },
                ...(a.owner_inn ? [{ key: 'inn', label: 'ИНН', children: a.owner_inn }] : []),
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={`Зарегистрированные (${card.residents.filter((r) => !r.date_to).length})`} size="small">
            <Table
              size="small"
              rowKey="full_name"
              pagination={false}
              dataSource={card.residents}
              locale={{ emptyText: 'Никто не зарегистрирован — расчет ГВС по числу собственников (п. 56(2))' }}
              columns={[
                { title: 'ФИО', dataIndex: 'full_name' },
                { title: 'С даты', dataIndex: 'date_from', width: 110 },
                {
                  title: 'Статус',
                  dataIndex: 'date_to',
                  width: 100,
                  render: (v: string | null) => (v ? <Tag>снят {v}</Tag> : <Tag color="success">активен</Tag>),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Приборы учета" size="small">
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={card.meters}
              locale={{ emptyText: 'Приборов нет — начисление по нормативу' }}
              columns={[
                { title: 'Заводской №', dataIndex: 'serial_no' },
                {
                  title: 'Статус',
                  dataIndex: 'status',
                  width: 140,
                  render: (v: string) => (
                    <Tag color={v === 'active' ? 'success' : v === 'verification_expired' ? 'error' : 'default'}>
                      {METER_STATUS_LABELS[v] ?? v}
                    </Tag>
                  ),
                },
                { title: 'Поверка до', dataIndex: 'next_verification_date', width: 110 },
                {
                  title: 'Последнее показание',
                  dataIndex: 'last_value',
                  align: 'right',
                  render: (v: string | null, r) =>
                    v ? (
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {Number(v).toFixed(3)} <Typography.Text type="secondary">({r.last_period})</Typography.Text>
                      </span>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card size="small">
            <Tabs
              items={[
                {
                  key: 'accruals',
                  label: 'Начисления',
                  children: <AccrualsTab accountId={a.id} />,
                },
                {
                  key: 'payments',
                  label: 'Платежи и сальдо',
                  children: <MoneyTab accountId={a.id} />,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

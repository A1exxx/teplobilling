import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Col, Descriptions, Result, Row, Skeleton, Table, Tabs, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDb } from '../db/client'
import { getAccountCard, type AccountCard } from '../db/queries'
import { HEATING_MODE_LABELS, HW_SYSTEM_LABELS, METER_STATUS_LABELS } from '../labels'

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
                  children: (
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      История начислений со следом расчета «объяснить начисление» появится в фазе Ф2.
                    </Typography.Paragraph>
                  ),
                },
                {
                  key: 'payments',
                  label: 'Платежи и сальдо',
                  children: (
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Оплаты, задолженность и пени появятся в фазе Ф5.
                    </Typography.Paragraph>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

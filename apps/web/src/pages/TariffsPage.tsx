import { Card, Col, Row, Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { getDb } from '../db/client'
import { listNorms, listTariffs, type NormRow, type TariffRow } from '../db/queries'
import {
  CATEGORY_CODE_LABELS,
  CATEGORY_LABELS,
  COMPONENT_LABELS,
  NORM_KIND_LABELS,
  SERVICE_LABELS,
  VAT_LABELS,
} from '../labels'

const activityTag = (validTo: string | null) =>
  validTo === null ? <Tag color="success">действует</Tag> : <Tag>до {validTo}</Tag>

export function TariffsPage() {
  const [tariffs, setTariffs] = useState<TariffRow[]>([])
  const [norms, setNorms] = useState<NormRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      const [t, n] = await Promise.all([listTariffs(pg), listNorms(pg)])
      setTariffs(t)
      setNorms(n)
      setLoading(false)
    })()
  }, [])

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Тарифы и нормативы
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ maxWidth: '65ch' }}>
          Все значения версионируются датами действия: расчет за любой месяц использует версию,
          действовавшую в том месяце. Редактирование появится вместе с ролью старшего оператора.
        </Typography.Paragraph>
      </Col>
      <Col span={24}>
        <Card title="Тарифы" size="small">
          <Table<TariffRow>
            size="small"
            rowKey={(r) => `${r.service}-${r.consumer_category}-${r.component}-${r.valid_from}`}
            loading={loading}
            dataSource={tariffs}
            pagination={false}
            data-testid="tariffs-table"
            columns={[
              { title: 'Услуга', dataIndex: 'service', render: (v: string) => SERVICE_LABELS[v] ?? v },
              { title: 'Категория', dataIndex: 'consumer_category', render: (v: string) => CATEGORY_LABELS[v] ?? v },
              { title: 'Компонент', dataIndex: 'component', render: (v: string) => COMPONENT_LABELS[v] ?? v },
              {
                title: 'Значение, ₽',
                dataIndex: 'value',
                align: 'right',
                render: (v: string) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(2)}</span>
                ),
              },
              { title: 'НДС', dataIndex: 'vat_mode', render: (v: string) => VAT_LABELS[v] ?? v },
              { title: 'С даты', dataIndex: 'valid_from', width: 110 },
              { title: 'Статус', dataIndex: 'valid_to', width: 120, render: activityTag },
              { title: 'Основание', dataIndex: 'doc_ref', ellipsis: true },
            ]}
          />
        </Card>
      </Col>
      <Col span={24}>
        <Card title="Нормативы потребления" size="small">
          <Table<NormRow>
            size="small"
            rowKey={(r) => `${r.kind}-${r.category_code ?? ''}-${r.valid_from}`}
            loading={loading}
            dataSource={norms}
            pagination={false}
            data-testid="norms-table"
            columns={[
              { title: 'Норматив', dataIndex: 'kind', render: (v: string) => NORM_KIND_LABELS[v] ?? v },
              {
                title: 'Категория дома',
                dataIndex: 'category_code',
                render: (v: string | null) => (v ? (CATEGORY_CODE_LABELS[v] ?? v) : '—'),
              },
              {
                title: 'Значение',
                dataIndex: 'value',
                align: 'right',
                render: (v: string) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toFixed(4)}</span>
                ),
              },
              { title: 'С даты', dataIndex: 'valid_from', width: 110 },
              { title: 'Статус', dataIndex: 'valid_to', width: 120, render: activityTag },
              { title: 'Основание', dataIndex: 'doc_ref', ellipsis: true },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}

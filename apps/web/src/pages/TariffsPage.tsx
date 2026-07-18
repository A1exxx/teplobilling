import { PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Table, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
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

interface NewTariffForm {
  service: 'heating' | 'hot_water'
  consumerCategory: 'population' | 'other'
  component: 'single' | 'hw_cold_water' | 'hw_heat_energy'
  value: number
  validFrom: Dayjs
  docRef?: string
}

export function TariffsPage() {
  const { message } = App.useApp()
  const [tariffs, setTariffs] = useState<TariffRow[]>([])
  const [norms, setNorms] = useState<NormRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm<NewTariffForm>()

  const load = useCallback(async () => {
    const { pg } = await getDb()
    const [t, n] = await Promise.all([listTariffs(pg), listNorms(pg)])
    setTariffs(t)
    setNorms(n)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createVersion = async (values: NewTariffForm) => {
    const { pg } = await getDb()
    const validFrom = values.validFrom.format('YYYY-MM-DD')
    const dayBefore = values.validFrom.subtract(1, 'day').format('YYYY-MM-DD')
    await pg.exec('BEGIN')
    try {
      // действующая версия закрывается днем раньше новой (версии не пересекаются)
      await pg.query(
        `UPDATE tariff SET valid_to = $4
         WHERE service = $1 AND consumer_category = $2 AND component = $3
           AND valid_to IS NULL AND valid_from < $5`,
        [values.service, values.consumerCategory, values.component, dayBefore, validFrom],
      )
      await pg.query(
        `INSERT INTO tariff (tenant_id, service, consumer_category, component, value, vat_mode, doc_ref, valid_from)
         SELECT id, $1, $2, $3, $4, $5, $6, $7 FROM tenant LIMIT 1`,
        [
          values.service,
          values.consumerCategory,
          values.component,
          values.value.toFixed(4),
          values.consumerCategory === 'other' ? 'on_top' : 'included',
          values.docRef ?? null,
          validFrom,
        ],
      )
      await pg.exec('COMMIT')
    } catch (error) {
      await pg.exec('ROLLBACK')
      throw error
    }
    message.success(`Новая версия тарифа действует с ${validFrom}; прежняя закрыта ${dayBefore}`)
    setModalOpen(false)
    form.resetFields()
    await load()
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Тарифы и нормативы
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ maxWidth: '65ch' }}>
          Все значения версионируются датами действия: расчет за любой месяц использует версию,
          действовавшую в том месяце.
        </Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} data-testid="new-tariff-button">
          Новая версия тарифа
        </Button>
        <Modal
          title="Новая версия тарифа"
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={() => form.submit()}
          okText="Сохранить"
          cancelText="Отмена"
          destroyOnHidden
        >
          <Form<NewTariffForm>
            form={form}
            layout="vertical"
            onFinish={(values) => void createVersion(values)}
            initialValues={{ service: 'heating', consumerCategory: 'population', component: 'single', validFrom: dayjs().add(1, 'day') }}
          >
            <Form.Item name="service" label="Услуга" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'heating', label: 'Отопление' },
                  { value: 'hot_water', label: 'Горячая вода' },
                ]}
              />
            </Form.Item>
            <Form.Item name="consumerCategory" label="Категория потребителя" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'population', label: 'население (НДС в тарифе)' },
                  { value: 'other', label: 'прочие потребители (НДС сверху)' },
                ]}
              />
            </Form.Item>
            <Form.Item name="component" label="Компонент" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'single', label: 'единый' },
                  { value: 'hw_cold_water', label: 'ГВС: компонент холодной воды' },
                  { value: 'hw_heat_energy', label: 'ГВС: компонент тепловой энергии' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="value"
              label="Значение, руб (за Гкал или м³)"
              rules={[{ required: true, message: 'Укажите значение' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0.0001} step={0.01} data-testid="tariff-value-input" />
            </Form.Item>
            <Form.Item
              name="validFrom"
              label="Действует с даты"
              rules={[{ required: true, message: 'Укажите дату' }]}
              extra="Действующая версия будет автоматически закрыта днем раньше"
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="docRef" label="Основание (приказ РЭК)">
              <Input placeholder="Например: Приказ УРТ №120-т от 01.12.2026" />
            </Form.Item>
          </Form>
        </Modal>
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

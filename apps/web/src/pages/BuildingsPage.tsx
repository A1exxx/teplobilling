import { Descriptions, Drawer, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { getDb } from '../db/client'
import { listBuildings, type BuildingRow } from '../db/queries'
import { CATEGORY_CODE_LABELS, HEATING_MODE_LABELS, HW_SYSTEM_LABELS } from '../labels'

export function BuildingsPage() {
  const [rows, setRows] = useState<BuildingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<BuildingRow | null>(null)

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      setRows(await listBuildings(pg))
      setLoading(false)
    })()
  }, [])

  const columns: ColumnsType<BuildingRow> = [
    { title: 'Адрес', dataIndex: 'address_text' },
    { title: 'Этажей', dataIndex: 'floors', width: 80, align: 'right' },
    { title: 'Год', dataIndex: 'build_year', width: 70, align: 'right' },
    {
      title: 'Площадь, м²',
      dataIndex: 'total_premises_area',
      width: 120,
      align: 'right',
      render: (v: string | null) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>,
    },
    {
      title: 'Система ГВС',
      dataIndex: 'hw_system',
      width: 120,
      render: (v: string) => (
        <Tag color={v === 'central_open' ? 'gold' : 'default'}>{HW_SYSTEM_LABELS[v] ?? v}</Tag>
      ),
    },
    {
      title: 'ОДПУ тепла',
      dataIndex: 'has_odpu',
      width: 110,
      render: (v: boolean) => (v ? <Tag color="success">есть</Tag> : <Tag>нет — норматив</Tag>),
    },
    { title: 'Помещений', dataIndex: 'premises', width: 100, align: 'right' },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Дома
      </Typography.Title>
      <Table<BuildingRow>
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        data-testid="buildings-table"
        locale={{ emptyText: 'Домов нет — загрузите демо-данные на «Мониторе периода»' }}
        onRow={(record) => ({ style: { cursor: 'pointer' }, onClick: () => setSelected(record) })}
      />
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.address_text ?? ''}
        width={480}
      >
        {selected && (
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'kind', label: 'Тип', children: selected.building_kind === 'mkd' ? 'многоквартирный дом' : selected.building_kind },
              { key: 'floors', label: 'Этажей', children: selected.floors ?? '—' },
              { key: 'year', label: 'Год постройки', children: selected.build_year ?? '—' },
              {
                key: 'cat',
                label: 'Категория (норматив отопления)',
                children: selected.category_code ? (CATEGORY_CODE_LABELS[selected.category_code] ?? selected.category_code) : '—',
              },
              { key: 'area', label: 'Площадь всех помещений', children: `${selected.total_premises_area} м²` },
              { key: 'moc', label: 'Площадь общего имущества', children: `${selected.common_area} м²` },
              { key: 'hw', label: 'Система ГВС', children: HW_SYSTEM_LABELS[selected.hw_system] ?? selected.hw_system },
              {
                key: 'mode',
                label: 'Оплата отопления',
                children: HEATING_MODE_LABELS[selected.heating_payment_mode] ?? selected.heating_payment_mode,
              },
              {
                key: 'odpu',
                label: 'ОДПУ тепла',
                children: selected.has_odpu ? 'установлен' : 'нет — расчет по нормативу',
              },
              { key: 'premises', label: 'Помещений / ЛС', children: `${selected.premises} / ${selected.accounts}` },
            ]}
          />
        )}
      </Drawer>
    </div>
  )
}

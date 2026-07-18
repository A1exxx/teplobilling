import { App, Button, Empty, InputNumber, Select, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDb } from '../db/client'
import { listBuildings, type BuildingRow } from '../db/queries'
import {
  getWorkingPeriod,
  listReadingRows,
  saveReading,
  type OpenPeriodInfo,
  type ReadingRow,
} from '../services/readings'
import { MONTH_LABELS } from '../labels'

export function ReadingsPage() {
  const { message } = App.useApp()
  const [buildings, setBuildings] = useState<BuildingRow[]>([])
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [period, setPeriod] = useState<OpenPeriodInfo | null>(null)
  const [rows, setRows] = useState<ReadingRow[]>([])
  const [draft, setDraft] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const { pg } = await getDb()
      const [blds, p] = await Promise.all([listBuildings(pg), getWorkingPeriod(pg)])
      setBuildings(blds)
      setPeriod(p)
      const withIpu = blds.find((b) => b.has_ipu) ?? blds[0]
      if (withIpu) setBuildingId(withIpu.id)
    })()
  }, [])

  const load = useCallback(async () => {
    if (!buildingId || !period) return
    setLoading(true)
    const { pg } = await getDb()
    setRows(await listReadingRows(pg, buildingId, period.id))
    setDraft({})
    setLoading(false)
  }, [buildingId, period])

  useEffect(() => {
    void load()
  }, [load])

  const invalid = useMemo(() => {
    const bad = new Set<string>()
    for (const row of rows) {
      const value = draft[row.meter_id]
      if (value !== null && value !== undefined && row.prev_value !== null && value < Number(row.prev_value)) {
        bad.add(row.meter_id)
      }
    }
    return bad
  }, [rows, draft])

  const pendingCount = Object.values(draft).filter((v) => v !== null && v !== undefined).length

  const saveAll = async () => {
    if (!period) return
    setSaving(true)
    const { pg } = await getDb()
    let saved = 0
    for (const row of rows) {
      const value = draft[row.meter_id]
      if (value === null || value === undefined || invalid.has(row.meter_id)) continue
      await saveReading(pg, row.meter_id, period.id, String(value))
      saved += 1
    }
    setSaving(false)
    message.success(`Принято показаний: ${saved}`)
    await load()
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Ввод показаний ИПУ ГВС
        {period && (
          <Tag color="processing" style={{ marginInlineStart: 12 }}>
            {MONTH_LABELS[period.month]} {period.year}
          </Tag>
        )}
      </Typography.Title>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <Select
          style={{ minWidth: 340 }}
          value={buildingId}
          onChange={setBuildingId}
          options={buildings.map((b) => ({ value: b.id, label: b.address_text }))}
          placeholder="Выберите дом"
          data-testid="readings-building-select"
        />
        <Button
          type="primary"
          disabled={pendingCount === 0 || invalid.size > 0}
          loading={saving}
          onClick={() => void saveAll()}
          data-testid="readings-save"
        >
          Принять показания ({pendingCount})
        </Button>
        {invalid.size > 0 && (
          <Typography.Text type="danger">
            Есть значения меньше предыдущих — исправьте перед сохранением
          </Typography.Text>
        )}
      </div>
      <Table<ReadingRow>
        size="small"
        rowKey="meter_id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        data-testid="readings-table"
        locale={{
          emptyText: (
            <Empty description="В этом доме нет индивидуальных приборов учета — начисление идет по нормативу" />
          ),
        }}
        columns={[
          { title: 'Кв.', dataIndex: 'premise_number', width: 70 },
          { title: '№ ЛС', dataIndex: 'account_number', width: 110 },
          { title: 'Прибор (зав. №)', dataIndex: 'serial_no' },
          {
            title: 'Статус',
            dataIndex: 'meter_status',
            width: 130,
            render: (v: string) =>
              v === 'active' ? <Tag color="success">исправен</Tag> : <Tag color="error">истекла поверка</Tag>,
          },
          {
            title: 'Предыдущее, м³',
            dataIndex: 'prev_value',
            align: 'right',
            width: 140,
            render: (v: string | null) => (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v ? Number(v).toFixed(3) : '—'}</span>
            ),
          },
          {
            title: 'Новое показание, м³',
            width: 190,
            render: (_, row) => {
              const accepted = row.current_value !== null && draft[row.meter_id] === undefined
              return (
                <InputNumber
                  style={{ width: 160 }}
                  min={0}
                  step={0.001}
                  {...(invalid.has(row.meter_id) ? { status: 'error' as const } : {})}
                  placeholder={accepted ? Number(row.current_value).toFixed(3) : 'введите'}
                  value={draft[row.meter_id] ?? (row.current_value !== null ? Number(row.current_value) : null)}
                  disabled={row.meter_status !== 'active'}
                  onChange={(value) => setDraft((prev) => ({ ...prev, [row.meter_id]: value }))}
                />
              )
            },
          },
          {
            title: 'Принято',
            dataIndex: 'current_value',
            width: 100,
            render: (v: string | null) => (v !== null ? <Tag color="success">да</Tag> : <Tag>нет</Tag>),
          },
        ]}
      />
    </div>
  )
}

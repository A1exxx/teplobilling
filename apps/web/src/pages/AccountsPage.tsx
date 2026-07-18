import { App, Button, Empty, Input, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDb } from '../db/client'
import { listAccounts, type AccountRow } from '../db/queries'
import { seedDemo } from '@teplobilling/db'

const PAGE_SIZE = 20

export function AccountsPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [rows, setRows] = useState<AccountRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async (query: string, pageNo: number) => {
    setLoading(true)
    const { pg } = await getDb()
    const result = await listAccounts(pg, query, PAGE_SIZE, (pageNo - 1) * PAGE_SIZE)
    setRows(result.rows)
    setTotal(result.total)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(search, page)
  }, [load, search, page])

  const columns: ColumnsType<AccountRow> = [
    {
      title: '№ ЛС',
      dataIndex: 'account_number',
      width: 110,
      render: (v: string) => (
        <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: 'Адрес',
      dataIndex: 'address_text',
      render: (v: string | null, r) => `${v ?? ''}, ${r.kind === 'legal' ? 'пом.' : 'кв.'} ${r.premise_number}`,
    },
    { title: 'Владелец', dataIndex: 'owner', ellipsis: true },
    {
      title: 'Тип',
      dataIndex: 'kind',
      width: 90,
      render: (v: string) => (v === 'legal' ? <Tag color="geekblue">юрлицо</Tag> : 'жилой'),
    },
    {
      title: 'Площадь, м²',
      dataIndex: 'total_area',
      width: 110,
      align: 'right',
      render: (v: string | null) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v ?? '—'}</span>
      ),
    },
    { title: 'Прожив.', dataIndex: 'residents', width: 80, align: 'right' },
    {
      title: 'ИПУ ГВС',
      dataIndex: 'ipu_status',
      width: 130,
      render: (v: AccountRow['ipu_status']) => {
        if (!v) return <Tag>нет — норматив</Tag>
        if (v === 'active') return <Tag color="success">есть</Tag>
        if (v === 'verification_expired') return <Tag color="error">истекла поверка</Tag>
        return <Tag color="warning">{v}</Tag>
      },
    },
  ]

  const seedNow = async () => {
    setSeeding(true)
    try {
      const { pg } = await getDb()
      const summary = await seedDemo(pg)
      message.success(`Демо-данные загружены: ${summary.buildings} домов, ${summary.accounts} ЛС`)
      await load(search, 1)
      setPage(1)
    } catch (error) {
      message.error(String(error))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Лицевые счета
      </Typography.Title>
      <Input.Search
        placeholder="Номер ЛС, адрес или фамилия владельца"
        allowClear
        style={{ maxWidth: 420, marginBottom: 12 }}
        onSearch={(v) => {
          setPage(1)
          setSearch(v.trim())
        }}
        data-testid="accounts-search"
      />
      <Table<AccountRow>
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        data-testid="accounts-table"
        locale={{
          emptyText: (
            <Empty description="Лицевых счетов пока нет">
              <Button type="primary" loading={seeding} onClick={() => void seedNow()}>
                Наполнить демо-данными
              </Button>
            </Empty>
          ),
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          showTotal: (t) => `всего: ${t}`,
          onChange: setPage,
        }}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => navigate(`/accounts/${record.id}`),
        })}
      />
    </div>
  )
}

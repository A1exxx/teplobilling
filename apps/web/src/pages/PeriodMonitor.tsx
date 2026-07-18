import { DatabaseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Descriptions, Row, Skeleton, Statistic, Tag } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { seedDemo } from '@teplobilling/db'
import { getDb, type DbStatus } from '../db/client'
import { getStats, type Stats } from '../db/queries'
import { MONTH_LABELS } from '../labels'

type DbState = { kind: 'loading' } | { kind: 'ready'; status: DbStatus } | { kind: 'error'; message: string }

export function PeriodMonitor() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [db, setDb] = useState<DbState>({ kind: 'loading' })
  const [stats, setStats] = useState<Stats | null>(null)
  const [seeding, setSeeding] = useState(false)

  const refresh = useCallback(async () => {
    const { pg } = await getDb()
    setStats(await getStats(pg))
  }, [])

  useEffect(() => {
    let cancelled = false
    getDb()
      .then(async ({ status, pg }) => {
        if (cancelled) return
        setDb({ kind: 'ready', status })
        setStats(await getStats(pg))
      })
      .catch((error: unknown) => {
        if (!cancelled) setDb({ kind: 'error', message: String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const seedNow = async () => {
    setSeeding(true)
    try {
      const { pg } = await getDb()
      const summary = await seedDemo(pg)
      message.success(
        `Демо-данные загружены: ${summary.buildings} домов, ${summary.accounts} лицевых счетов`,
      )
      await refresh()
    } catch (error) {
      message.error(String(error))
    } finally {
      setSeeding(false)
    }
  }

  const seeded = (stats?.accounts ?? 0) > 0

  return (
    <Row gutter={[16, 16]}>
      {!seeded && (
        <Col span={24}>
          <Alert
            type="info"
            showIcon
            title="База пуста — начните с демо-данных"
            description="Кнопка ниже наполнит базу демонстрационным контуром: город Красноозёрск, 10 домов с тремя схемами приборов учета, ~170 лицевых счетов, двухкомпонентные тарифы ГВС. Все данные останутся в вашем браузере."
          />
        </Col>
      )}

      <Col xs={24} lg={12}>
        <Card
          title={
            <>
              <ThunderboltOutlined style={{ marginInlineEnd: 8 }} />
              Расчетный период
              {stats?.openPeriod && (
                <Tag color="processing" style={{ marginInlineStart: 12 }}>
                  {MONTH_LABELS[stats.openPeriod.month]} {stats.openPeriod.year} · открыт
                </Tag>
              )}
            </>
          }
        >
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Лицевых счетов" value={stats?.accounts ?? 0} data-testid="stat-accounts" />
            </Col>
            <Col span={8}>
              <Statistic title="Домов" value={stats?.buildings ?? 0} />
            </Col>
            <Col span={8}>
              <Statistic
                title="Показания ИПУ за период"
                value={stats?.readingsEntered ?? 0}
                suffix={`/ ${stats?.activeIpu ?? 0}`}
              />
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {!seeded ? (
              <Button
                type="primary"
                loading={seeding}
                disabled={db.kind !== 'ready'}
                data-testid="seed-demo-button"
                onClick={() => void seedNow()}
              >
                Наполнить демо-данными
              </Button>
            ) : (
              <>
                <Tag color="success" style={{ alignSelf: 'center' }} data-testid="seeded-tag">
                  демо-данные загружены
                </Tag>
                <Button onClick={() => navigate('/accounts')}>К реестру лицевых счетов</Button>
              </>
            )}
          </div>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card
          title={
            <>
              <DatabaseOutlined style={{ marginInlineEnd: 8 }} />
              База данных
            </>
          }
          data-testid="db-status-card"
        >
          {db.kind === 'loading' && <Skeleton active paragraph={{ rows: 3 }} data-testid="db-loading" />}
          {db.kind === 'error' && (
            <Alert type="error" title="БД не инициализировалась" description={db.message} />
          )}
          {db.kind === 'ready' && (
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'engine', label: 'Движок', children: 'PostgreSQL (PGlite) в браузере' },
                { key: 'storage', label: 'Хранилище', children: 'IndexedDB — данные не покидают компьютер' },
                {
                  key: 'tables',
                  label: 'Таблиц создано',
                  children: <span data-testid="db-tables">{db.status.tables}</span>,
                },
                {
                  key: 'migrations',
                  label: 'Миграции',
                  children: `${db.status.migrationsTotal} всего, применено при этом запуске: ${db.status.migrationsApplied}`,
                },
              ]}
            />
          )}
        </Card>
      </Col>
    </Row>
  )
}

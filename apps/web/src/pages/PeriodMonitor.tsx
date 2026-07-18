import { CalculatorOutlined, DatabaseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Descriptions, Row, Skeleton, Statistic, Tag } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { seedDemo } from '@teplobilling/db'
import { getDb, type DbStatus } from '../db/client'
import { getStats, type Stats } from '../db/queries'
import { calcPeriod } from '../services/calc'
import { MONTH_LABELS } from '../labels'

type DbState = { kind: 'loading' } | { kind: 'ready'; status: DbStatus } | { kind: 'error'; message: string }

export function PeriodMonitor() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [db, setDb] = useState<DbState>({ kind: 'loading' })
  const [stats, setStats] = useState<Stats | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [calculating, setCalculating] = useState(false)

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

  const calcNow = async () => {
    setCalculating(true)
    try {
      const { pg } = await getDb()
      const result = await calcPeriod(pg)
      const rub = Number(result.totalAmount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
      message.success(
        `Рассчитано ${result.accounts} ЛС, ${result.linesTotal} строк, начислено ${rub} ₽` +
          (result.errors.length > 0 ? `, ошибок: ${result.errors.length}` : ''),
      )
      await refresh()
    } catch (error) {
      message.error(String(error))
    } finally {
      setCalculating(false)
    }
  }

  const seeded = (stats?.accounts ?? 0) > 0
  const calculated = stats?.openPeriod?.status === 'calculated'

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
                <Tag
                  color={calculated ? 'success' : 'processing'}
                  style={{ marginInlineStart: 12 }}
                  data-testid="period-status"
                >
                  {MONTH_LABELS[stats.openPeriod.month]} {stats.openPeriod.year} ·{' '}
                  {calculated ? 'рассчитан' : 'открыт'}
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
          {stats?.accruedTotal && (
            <Statistic
              title="Начислено за период, ₽"
              value={Number(stats.accruedTotal)}
              precision={2}
              style={{ marginTop: 12 }}
              valueStyle={{ fontVariantNumeric: 'tabular-nums', color: '#0f766e' }}
              data-testid="stat-accrued"
            />
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
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
                <Button
                  type="primary"
                  icon={<CalculatorOutlined />}
                  loading={calculating}
                  data-testid="calc-period-button"
                  onClick={() => void calcNow()}
                >
                  {calculated ? 'Пересчитать период' : 'Рассчитать период'}
                </Button>
                <Button onClick={() => navigate('/readings')}>Ввод показаний</Button>
                <Button onClick={() => navigate('/accounts')}>Реестр ЛС</Button>
                <Tag color="success" style={{ alignSelf: 'center' }} data-testid="seeded-tag">
                  демо-данные загружены
                </Tag>
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

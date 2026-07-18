import { DatabaseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Descriptions, Row, Skeleton, Statistic } from 'antd'
import { useEffect, useState } from 'react'
import { getDb, type DbStatus } from '../db/client'

type DbState = { kind: 'loading' } | { kind: 'ready'; status: DbStatus } | { kind: 'error'; message: string }

export function PeriodMonitor() {
  const { message } = App.useApp()
  const [db, setDb] = useState<DbState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    getDb()
      .then(({ status }) => {
        if (!cancelled) setDb({ kind: 'ready', status })
      })
      .catch((error: unknown) => {
        if (!cancelled) setDb({ kind: 'error', message: String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Alert
          type="info"
          showIcon
          title="Каркас продукта (фаза Ф0)"
          description="Это первая живая сборка: база данных уже работает прямо в браузере, разделы наполняются по фазам плана. Демо-данные и расчет появятся в Ф1–Ф2."
        />
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

      <Col xs={24} lg={12}>
        <Card
          title={
            <>
              <ThunderboltOutlined style={{ marginInlineEnd: 8 }} />
              Расчетный период
            </>
          }
        >
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Лицевых счетов" value={0} style={{ fontVariantNumeric: 'tabular-nums' }} />
            </Col>
            <Col span={8}>
              <Statistic title="Показаний введено" value={0} suffix="/ 0" />
            </Col>
            <Col span={8}>
              <Statistic title="Начислено, ₽" value={0} precision={2} />
            </Col>
          </Row>
          <Button
            type="primary"
            style={{ marginTop: 16 }}
            data-testid="seed-demo-button"
            disabled={db.kind !== 'ready'}
            onClick={() =>
              message.info('Демо-данные (10 домов, 3 схемы приборов учета) появятся в фазе Ф1')
            }
          >
            Наполнить демо-данными
          </Button>
        </Card>
      </Col>
    </Row>
  )
}

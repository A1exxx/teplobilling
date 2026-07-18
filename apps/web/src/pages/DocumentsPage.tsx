import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  FileExcelOutlined,
  FileProtectOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { App, Button, Card, Col, Popconfirm, Row, Typography } from 'antd'
import { useState } from 'react'
import { exportDbBackup, getDb, restoreDbBackup } from '../db/client'
import { export1cRegistry, exportAccrualSheet, exportGisRegistry } from '../services/exports'

export function DocumentsPage() {
  const { message } = App.useApp()
  const [busy, setBusy] = useState<string | null>(null)

  const run = (key: string, action: () => Promise<string | void>, success?: string) => {
    void (async () => {
      setBusy(key)
      try {
        const result = await action()
        message.success(success ?? `Файл сформирован: ${String(result)}`)
      } catch (error) {
        message.error(String(error))
      } finally {
        setBusy(null)
      }
    })()
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Документы и выгрузки
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ maxWidth: '70ch' }}>
          Все файлы формируются по последнему рассчитанному периоду и открываются в Excel
          (CSV с разделителем «;»). Квитанции печатаются из карточки лицевого счета.
        </Typography.Paragraph>
      </Col>

      <Col xs={24} lg={8}>
        <Card title={<><FileTextOutlined style={{ marginInlineEnd: 8 }} />Ведомость начислений</>} size="small">
          <Typography.Paragraph type="secondary">
            Построчно: ЛС, услуга, объем, тариф, сумма — для сверки и бухгалтерии.
          </Typography.Paragraph>
          <Button
            type="primary"
            loading={busy === 'sheet'}
            data-testid="export-sheet"
            onClick={() => run('sheet', async () => exportAccrualSheet((await getDb()).pg))}
          >
            Скачать CSV
          </Button>
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title={<><FileExcelOutlined style={{ marginInlineEnd: 8 }} />Реестр для 1С</>} size="small">
          <Typography.Paragraph type="secondary">
            Свод начислений по ЛС и услугам со счетами учета (62.31 население / 62.01 юрлица).
          </Typography.Paragraph>
          <Button
            loading={busy === '1c'}
            data-testid="export-1c"
            onClick={() => run('1c', async () => export1cRegistry((await getDb()).pg))}
          >
            Скачать CSV
          </Button>
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title={<><FileProtectOutlined style={{ marginInlineEnd: 8 }} />Реестр для ГИС ЖКХ</>} size="small">
          <Typography.Paragraph type="secondary">
            Платежные документы периода: ЛС, ЕЛС, адрес, итог. Маппинг на официальный
            xlsx-шаблон ГИС ЖКХ — на пилоте.
          </Typography.Paragraph>
          <Button
            loading={busy === 'gis'}
            data-testid="export-gis"
            onClick={() => run('gis', async () => exportGisRegistry((await getDb()).pg))}
          >
            Скачать CSV
          </Button>
        </Card>
      </Col>

      <Col span={24}>
        <Card title="Резервная копия базы" size="small">
          <Typography.Paragraph type="secondary" style={{ maxWidth: '70ch' }}>
            База живет в вашем браузере. Скачивайте копию после каждого расчетного месяца — файл
            можно перенести на другой компьютер и восстановить там.
          </Typography.Paragraph>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={busy === 'backup'}
              data-testid="backup-download"
              onClick={() => run('backup', () => exportDbBackup(), 'Копия базы скачана')}
            >
              Скачать копию БД
            </Button>
            <Popconfirm
              title="Восстановить базу из копии?"
              description="Текущие данные в браузере будут ПОЛНОСТЬЮ заменены содержимым файла. Продолжить?"
              okText="Восстановить"
              cancelText="Отмена"
              onConfirm={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.tar.gz,.tgz,application/gzip'
                input.onchange = () => {
                  const file = input.files?.[0]
                  if (!file) return
                  run('restore', () => restoreDbBackup(file), 'База восстановлена — перезагрузка')
                }
                input.click()
              }}
            >
              <Button icon={<CloudUploadOutlined />} loading={busy === 'restore'} data-testid="backup-restore">
                Восстановить из копии
              </Button>
            </Popconfirm>
          </div>
        </Card>
      </Col>
    </Row>
  )
}

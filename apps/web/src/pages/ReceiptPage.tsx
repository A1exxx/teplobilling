import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import { buildGostQrString } from '@teplobilling/billing-core'
import { Button, Result, Skeleton } from 'antd'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDb } from '../db/client'
import {
  getAccountAccrual,
  getAccountCard,
  getTenantRequisites,
  type AccountCard,
  type AccrualView,
  type TenantRequisites,
} from '../db/queries'
import { COMPONENT_LABELS, LINE_KIND_LABELS, MONTH_LABELS, SERVICE_LABELS } from '../labels'

interface ReceiptData {
  card: AccountCard
  accrual: AccrualView
  tenant: TenantRequisites
  qrString: string | null
}

const rub = (v: string) => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2 })

/** Квитанция: обязательные реквизиты п.69 ПП 354 + QR по ГОСТ Р 56042-2014. Печать через браузер. */
export function ReceiptPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ReceiptData | null | 'loading'>('loading')
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const { pg } = await getDb()
      const [card, accrual, tenant] = await Promise.all([
        getAccountCard(pg, id),
        getAccountAccrual(pg, id),
        getTenantRequisites(pg),
      ])
      if (!card || !accrual || !tenant) {
        setData(null)
        return
      }
      let qrString: string | null = null
      if (tenant.settlement_account && tenant.bic && tenant.bank_name && tenant.corr_account) {
        qrString = buildGostQrString({
          name: tenant.name,
          personalAcc: tenant.settlement_account,
          bankName: tenant.bank_name,
          bic: tenant.bic,
          correspAcc: tenant.corr_account,
          sumRubles: accrual.totalAmount,
          ...(tenant.inn ? { payeeInn: tenant.inn } : {}),
          ...(tenant.kpp ? { kpp: tenant.kpp } : {}),
          persAcc: card.account.account_number,
          paymPeriod: `${String(accrual.periodMonth).padStart(2, '0')}${accrual.periodYear}`,
          purpose: `Оплата ЖКУ за ${MONTH_LABELS[accrual.periodMonth]?.toLowerCase()} ${accrual.periodYear}, ЛС ${card.account.account_number}`,
        })
      }
      setData({ card, accrual, tenant, qrString })
    })()
  }, [id])

  useEffect(() => {
    if (data === 'loading' || data === null || !data.qrString || !qrCanvasRef.current) return
    void QRCode.toCanvas(qrCanvasRef.current, data.qrString, { width: 132, margin: 1 })
  }, [data])

  if (data === 'loading') return <Skeleton active style={{ maxWidth: 720, margin: '24px auto' }} />
  if (!data)
    return (
      <Result
        status="warning"
        title="Квитанцию сформировать нельзя"
        subTitle="Нет начисления за период или реквизитов организации. Запустите расчет периода."
        extra={<Button onClick={() => navigate(-1)}>Назад</Button>}
      />
    )

  const { card, accrual, tenant } = data
  const a = card.account
  const services = accrual.lines

  return (
    <div style={{ background: '#eef1f4', minHeight: '100dvh', paddingBlock: 16 }} className="receipt-wrap">
      <style>{`
        .receipt-sheet { width: 720px; margin: 0 auto; background: #fdfdfc; color: #1c2733;
          padding: 28px 32px; font-size: 13px; line-height: 1.45; border: 1px solid #d5dbe1; }
        .receipt-sheet h1 { font-size: 15px; margin: 0 0 2px; }
        .receipt-sheet table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .receipt-sheet th, .receipt-sheet td { border: 1px solid #9aa4ad; padding: 4px 6px; }
        .receipt-sheet th { background: #f0f2f4; font-weight: 600; text-align: left; }
        .receipt-sheet td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .receipt-actions { width: 720px; margin: 0 auto 12px; display: flex; gap: 8px; }
        @media print {
          .receipt-actions { display: none; }
          .receipt-wrap { background: #fff !important; padding: 0 !important; }
          .receipt-sheet { border: none; width: auto; }
          body { background: #fff; }
        }
      `}</style>
      <div className="receipt-actions">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/accounts/${id ?? ''}`)}>
          К карточке
        </Button>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()} data-testid="print-receipt">
          Печать
        </Button>
      </div>

      <div className="receipt-sheet" data-testid="receipt-sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1>ПЛАТЕЖНЫЙ ДОКУМЕНТ за {MONTH_LABELS[accrual.periodMonth]?.toLowerCase()} {accrual.periodYear} г.</h1>
            <div><b>{tenant.name}</b></div>
            <div>ИНН {tenant.inn ?? '—'}{tenant.kpp ? ` / КПП ${tenant.kpp}` : ''} · {tenant.legal_address ?? ''}</div>
            <div>
              {tenant.bank_name}, БИК {tenant.bic}, р/с {tenant.settlement_account}, к/с {tenant.corr_account}
            </div>
            {tenant.phone && <div>Телефон: {tenant.phone}</div>}
          </div>
          {data.qrString && (
            <div style={{ textAlign: 'center' }}>
              <canvas ref={qrCanvasRef} data-testid="receipt-qr" />
              <div style={{ fontSize: 10, color: '#5b6873' }}>ГОСТ Р 56042-2014</div>
            </div>
          )}
        </div>

        <table>
          <tbody>
            <tr>
              <th style={{ width: '32%' }}>Лицевой счет</th>
              <td className="num"><b>{a.account_number}</b></td>
              <th style={{ width: '18%' }}>Площадь</th>
              <td className="num">{a.total_area ?? '—'} м²</td>
            </tr>
            <tr>
              <th>Плательщик</th>
              <td colSpan={3}>{a.owner ?? '—'}</td>
            </tr>
            <tr>
              <th>Адрес</th>
              <td colSpan={3}>
                {a.address_text}, {a.kind === 'legal' ? 'пом.' : 'кв.'} {a.premise_number}
              </td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Вид услуги</th>
              <th style={{ width: '14%' }}>Объем</th>
              <th style={{ width: '10%' }}>Ед.</th>
              <th style={{ width: '13%' }}>Тариф, руб.</th>
              <th style={{ width: '15%' }}>Начислено, руб.</th>
            </tr>
          </thead>
          <tbody>
            {services.map((line) => (
              <tr key={line.id}>
                <td>
                  {SERVICE_LABELS[line.service] ?? line.service}
                  {line.component !== 'single' ? ` — ${COMPONENT_LABELS[line.component]}` : ''}
                  {line.line_kind !== 'accrual' ? ` (${LINE_KIND_LABELS[line.line_kind]})` : ''}
                </td>
                <td className="num">{Number(line.volume) > 0 ? Number(line.volume).toFixed(4) : '—'}</td>
                <td>{Number(line.volume) > 0 ? (line.unit === 'Gcal' ? 'Гкал' : 'м³') : ''}</td>
                <td className="num">{rub(line.rate)}</td>
                <td className="num">{rub(line.amount)}</td>
              </tr>
            ))}
            <tr>
              <th colSpan={4}>ИТОГО К ОПЛАТЕ</th>
              <td className="num" data-testid="receipt-total">
                <b>{rub(accrual.totalAmount)}</b>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 10, fontSize: 11, color: '#48545e' }}>
          Расчет выполнен по Правилам предоставления коммунальных услуг (ПП РФ №354). Способ расчета каждой
          строки и исходные данные доступны в карточке лицевого счета («след расчета»). Оплата по QR-коду —
          в приложении вашего банка. Демонстрационный документ: реквизиты и данные вымышлены.
        </div>
      </div>
    </div>
  )
}

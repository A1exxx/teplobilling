import {
  BankOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  FormOutlined,
  HomeOutlined,
  PercentageOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Layout, Menu, Tag, Typography } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Монитор периода' },
  { key: '/accounts', icon: <TeamOutlined />, label: 'Лицевые счета' },
  { key: '/readings', icon: <FormOutlined />, label: 'Ввод показаний' },
  { key: '/buildings', icon: <HomeOutlined />, label: 'Дома' },
  { key: '/tariffs', icon: <PercentageOutlined />, label: 'Тарифы и нормативы' },
  { key: '/payments', icon: <WalletOutlined />, label: 'Платежи' },
  { key: '/debtors', icon: <ExclamationCircleOutlined />, label: 'Должники и пени' },
  { key: '/legal', icon: <BankOutlined />, label: 'Юридические лица' },
  { key: '/documents', icon: <FileTextOutlined />, label: 'Документы' },
]

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <Layout style={{ minHeight: '100dvh' }}>
      <Layout.Sider width={232} breakpoint="lg" collapsedWidth={64} theme="dark">
        <div style={{ padding: '14px 16px 10px' }}>
          <Typography.Text
            strong
            style={{ color: '#f8fafc', fontSize: 16, letterSpacing: '-0.01em' }}
          >
            Теплобиллинг
          </Typography.Text>
          <div>
            <Typography.Text style={{ color: '#94a3b8', fontSize: 12 }}>
              отопление · ГВС · ПП №354
            </Typography.Text>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: '#fbfcfd',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: 24,
          }}
        >
          <Typography.Text strong>МУП «Тепловые сети» — демонстрационный контур</Typography.Text>
          <Tag color="processing" style={{ marginInlineEnd: 0 }}>
            в разработке · Ф0
          </Tag>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
        <Layout.Footer
          style={{ paddingBlock: 12, color: '#64748b', fontSize: 12, textAlign: 'center' }}
        >
          Теплобиллинг v0.1 · данные хранятся локально в вашем браузере (PGlite / IndexedDB)
        </Layout.Footer>
      </Layout>
    </Layout>
  )
}

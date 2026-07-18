import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

dayjs.locale('ru')

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root не найден')

createRoot(rootElement).render(
  <StrictMode>
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: antdTheme.compactAlgorithm,
        token: {
          colorPrimary: '#0f766e',
          colorInfo: '#0f766e',
          colorLink: '#0f766e',
          borderRadius: 6,
          fontFamily:
            "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PT Sans', sans-serif",
        },
        components: {
          Layout: {
            siderBg: '#132538',
            triggerBg: '#0e1c2b',
          },
          Menu: {
            darkItemBg: '#132538',
            darkItemSelectedBg: '#0f766e',
            darkSubMenuItemBg: '#0e1c2b',
          },
        },
      }}
    >
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)

import { createHashRouter } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AccountCardPage } from './pages/AccountCardPage'
import { AccountsPage } from './pages/AccountsPage'
import { BuildingsPage } from './pages/BuildingsPage'
import { DebtorsPage } from './pages/DebtorsPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { PeriodMonitor } from './pages/PeriodMonitor'
import { ReadingsPage } from './pages/ReadingsPage'
import { ReceiptPage } from './pages/ReceiptPage'
import { StubPage } from './pages/StubPage'
import { TariffsPage } from './pages/TariffsPage'

// Hash-роутинг: GitHub Pages не умеет SPA-fallback для глубоких ссылок
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <PeriodMonitor /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'accounts/:id', element: <AccountCardPage /> },
      { path: 'buildings', element: <BuildingsPage /> },
      { path: 'tariffs', element: <TariffsPage /> },
      { path: 'readings', element: <ReadingsPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'debtors', element: <DebtorsPage /> },
      {
        path: 'legal',
        element: (
          <StubPage
            title="Юридические лица"
            phase="Ф6"
            details="Договоры теплоснабжения, точки поставки, договорные объемы Гкал, счета с НДС, пени по закону «О теплоснабжении»."
          />
        ),
      },
      { path: 'documents', element: <DocumentsPage /> },
    ],
  },
  // Квитанция — печатная страница вне операторского layout
  { path: '/receipt/:id', element: <ReceiptPage /> },
])

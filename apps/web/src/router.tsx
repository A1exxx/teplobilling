import { createHashRouter } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AccountCardPage } from './pages/AccountCardPage'
import { AccountsPage } from './pages/AccountsPage'
import { BuildingsPage } from './pages/BuildingsPage'
import { PeriodMonitor } from './pages/PeriodMonitor'
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
      {
        path: 'readings',
        element: (
          <StubPage
            title="Ввод показаний"
            phase="Ф3"
            details="Excel-подобная таблица по дому или улице: вставка диапазона из буфера, контроль «не меньше предыдущего», подсветка аномального расхода."
          />
        ),
      },
      {
        path: 'payments',
        element: (
          <StubPage
            title="Платежи"
            phase="Ф5"
            details="Импорт реестров банка и кассы с карантином ошибочных строк, разнесение по лицевым счетам, сальдо по услугам и периодам."
          />
        ),
      },
      {
        path: 'debtors',
        element: (
          <StubPage
            title="Должники и пени"
            phase="Ф5"
            details="Задолженность по срокам, начисление пеней по ст. 155 ЖК РФ с учетом частичных оплат, моратории и рассрочки."
          />
        ),
      },
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
      {
        path: 'documents',
        element: (
          <StubPage
            title="Документы"
            phase="Ф4"
            details="Квитанции по примерной форме Минстроя с QR-кодом ГОСТ Р 56042-2014, ведомости в Excel, выгрузки для ГИС ЖКХ и 1С."
          />
        ),
      },
    ],
  },
])

import { createHashRouter } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { PeriodMonitor } from './pages/PeriodMonitor'
import { StubPage } from './pages/StubPage'

// Hash-роутинг: GitHub Pages не умеет SPA-fallback для глубоких ссылок
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <PeriodMonitor /> },
      {
        path: 'accounts',
        element: (
          <StubPage
            title="Реестр лицевых счетов"
            phase="Ф1"
            details="Поиск и фильтры по адресу и номеру ЛС, карточка счета с историей начислений, показаний и платежей, раскрытие следа расчета «объяснить начисление»."
          />
        ),
      },
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
        path: 'buildings',
        element: (
          <StubPage
            title="Дома"
            phase="Ф1"
            details="Паспорт дома: площади, этажность, система ГВС (открытая/закрытая), общедомовые приборы, способ оплаты отопления, отопительные сезоны."
          />
        ),
      },
      {
        path: 'tariffs',
        element: (
          <StubPage
            title="Тарифы и нормативы"
            phase="Ф2"
            details="Версии тарифов и нормативов с датами действия на таймлайне: отопление, компоненты ГВС, нормативы потребления и подогрева, ключевая ставка для пеней."
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

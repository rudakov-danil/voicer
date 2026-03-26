import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useState } from 'react'

export function AppLayout() {
  const [period, setPeriod] = useState(30)
  const location = useLocation()

  const pageTitles: Record<string, string> = {
    '/dashboard': 'Обзор',
    '/conversations': 'Разговоры',
    '/team': 'Команда',
    '/scripts': 'Скрипты',
    '/analytics': 'Аналитика',
    '/intelligence': 'Разведка',
    '/training': 'Обучение',
    '/compliance': 'Комплаенс',
    '/settings': 'Настройки'
  }

  const currentTitle = pageTitles[location.pathname] || 'VoiceIQ'

  return (
    <>
      <Sidebar />
      <div className="main">
        <Topbar title={currentTitle} onPeriodChange={setPeriod} period={period} />
        <div className="content">
          <Outlet context={{ period }} />
        </div>
      </div>
    </>
  )
}

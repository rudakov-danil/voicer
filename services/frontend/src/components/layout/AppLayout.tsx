import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { VoicerLogo } from '@/components/VoicerLogo'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Toaster } from '@/components/ui/Toast'
import { t, isEn, setLang } from '@/i18n'
import { Suspense, useState } from 'react'

const PAGES_WITH_PERIOD = new Set<string>([
  '/dashboard',
  '/conversations',
  '/team',
  '/analytics',
  '/compliance',
])

export function AppLayout() {
  const [period, setPeriod] = useState(30)
  const [menuOpen, setMenuOpen] = useState(false)
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
    '/settings': 'Настройки',
    '/admin': 'Администрирование',
  }

  const currentTitle = pageTitles[location.pathname] || 'Voicer'
  const showPeriod = PAGES_WITH_PERIOD.has(location.pathname)
  // У страницы разговора своя шапка: крошки, тема, вердикт
  const ownHeader = location.pathname.startsWith('/conversations/')

  return (
    <>
      <Sidebar period={period} />
      <div className="main">
        {/* Мобильная шапка (до 760 px): сайдбар прячется, разделы — в выпадающем меню */}
        <header className="mobile-bar">
          <Link className="brand" to="/dashboard" onClick={() => setMenuOpen(false)}>
            <VoicerLogo size={18} />
            <span className="brand-name" translate="no">{t('Войсер')}</span>
          </Link>
          <button type="button" className="lang-btn" translate="no" onClick={() => setLang(isEn ? 'ru' : 'en')}
            aria-label={isEn ? 'Переключить на русский' : 'Switch to English'}>{isEn ? 'RU' : 'EN'}</button>
          <button type="button" className="btn-icon" aria-label={t('Меню')} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </header>
        {menuOpen && (
          <div className="mobile-nav">
            <Sidebar period={period} mobile onNavigate={() => setMenuOpen(false)} />
          </div>
        )}
        {!ownHeader && (
          <Topbar
            title={currentTitle}
            onPeriodChange={setPeriod}
            period={period}
            showPeriod={showPeriod}
          />
        )}
        <div className="content">
          <Suspense fallback={<div className="page-loading" role="status">{t('Загрузка...')}</div>}>
            <Outlet context={{ period, setPeriod }} />
          </Suspense>
        </div>
      </div>
      <Toaster />
    </>
  )
}

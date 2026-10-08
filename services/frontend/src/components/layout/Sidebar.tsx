import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutGrid,
  AudioLines,
  Users,
  ScrollText,
  ShieldAlert,
  BarChart3,
  Settings as SettingsIcon,
  Wrench,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useOrganization } from '@/lib/terms'
import { VoicerLogo } from '@/components/VoicerLogo'
import { t, isEn, setLang } from '@/i18n'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

const MAIN: NavItem[] = [
  { path: '/dashboard', label: 'Обзор', icon: LayoutGrid },
  { path: '/conversations', label: 'Разговоры', icon: AudioLines },
  { path: '/team', label: 'Команда', icon: Users },
  { path: '/scripts', label: 'Скрипты', icon: ScrollText },
]

const CONTROL: NavItem[] = [
  { path: '/compliance', label: 'Комплаенс', icon: ShieldAlert },
  { path: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { path: '/settings', label: 'Настройки', icon: SettingsIcon },
]

const ADMIN: NavItem = { path: '/admin', label: 'Администрирование', icon: Wrench }

const ROLE_LABELS: Record<string, string> = {
  director: 'Директор',
  admin: 'Админ',
  rop: 'РОП',
  manager: 'Менеджер',
}

function initials(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: org } = useOrganization()

  const isAdmin = user?.role === 'director' || user?.role === 'admin'
  const control = isAdmin ? [...CONTROL, ADMIN] : CONTROL
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')

  const renderItem = (item: NavItem) => {
    const active = location.pathname === item.path
    return (
      <button
        key={item.path}
        type="button"
        className="nav-item"
        aria-current={active ? 'page' : undefined}
        title={t(item.label)}
        onClick={() => navigate(item.path)}
      >
        <item.icon aria-hidden="true" />
        <span>{t(item.label)}</span>
      </button>
    )
  }

  return (
    <aside className="sidebar" aria-label={t('Навигация')}>
      <a className="brand" href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard') }}>
        <VoicerLogo size={18} />
        <span className="brand-name" translate="no">{t('Войсер')}</span>
      </a>

      {org && (
        <div className="org-switch">
          <span className="org-logo" aria-hidden="true" translate="no">{initials(org.name) || 'V'}</span>
          <div className="ellipsis">
            <div className="org-name ellipsis" translate="no">{org.name}</div>
            <div className="org-unit ellipsis">{t('Розница')}</div>
          </div>
        </div>
      )}

      <nav className="nav" aria-label={t('Разделы')}>
        {MAIN.map(renderItem)}
        <div className="nav-label">{t('Контроль')}</div>
        {control.map(renderItem)}
      </nav>

      <div className="sidebar-foot">
        <div className="me">
          <span className="avatar" aria-hidden="true" translate="no">{initials(fullName) || '?'}</span>
          <div className="me-meta">
            <div className="me-name ellipsis" translate="no">{fullName || user?.email}</div>
            <div className="me-role">{t(ROLE_LABELS[user?.role ?? ''] ?? 'Менеджер')}</div>
          </div>
          <button
            type="button"
            className="lang-btn"
            translate="no"
            aria-label={isEn ? 'Переключить на русский' : 'Switch to English'}
            title={isEn ? 'Переключить на русский' : 'Switch to English'}
            onClick={() => setLang(isEn ? 'ru' : 'en')}
          >
            {isEn ? 'RU' : 'EN'}
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t('Выйти')}
            title={t('Выйти')}
            onClick={() => { logout(); navigate('/login') }}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  )
}

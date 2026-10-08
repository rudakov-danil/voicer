import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { adminApi } from '@/api/admin'
import type { ConversationView } from '@/types'
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
import { t, L, isEn, setLang, plural } from '@/i18n'

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

// Подборки разговоров (ui-concept: блок «Подборки» в сайдбаре) — ведут в список с фильтром
const VIEWS: Array<{ id: ConversationView; label: string; dot: string }> = [
  { id: 'attention', label: 'Требуют внимания', dot: 'var(--crit)' },
  { id: 'violations', label: 'Нарушения', dot: 'var(--crit)' },
  { id: 'competitor', label: 'Ушли к конкурентам', dot: 'var(--warn)' },
  { id: 'no_upsell', label: 'Без допродажи', dot: 'var(--accent)' },
]

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

export function Sidebar({ period }: { period: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: org } = useOrganization()
  // Счётчики подборок — тем же запросом, что вкладки над списком разговоров
  const { data: counts } = useQuery({
    queryKey: ['conversations', 'sidebar-counts', period],
    queryFn: () => dashboardApi.getConversations({ limit: 1, period, with_counts: true }),
    select: (d) => d.view_counts,
    staleTime: 60_000,
  })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60_000 })
  const storeCount = (stores?.items || []).filter((s: any) => s.is_active !== false).length
  const currentView = new URLSearchParams(location.search).get('view')

  const isAdmin = user?.role === 'director' || user?.role === 'admin'
  const control = isAdmin ? [...CONTROL, ADMIN] : CONTROL
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')

  const renderItem = (item: NavItem) => {
    // На «Разговорах» с подборкой подсвечена подборка, а не пункт меню
    const active = location.pathname === item.path && !(item.path === '/conversations' && currentView)
    const count = item.path === '/conversations' ? counts?.total : undefined
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
        {count != null && <span className="nav-count">{count.toLocaleString()}</span>}
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
            <div className="org-unit ellipsis">
              {storeCount ? L(`${storeCount} ${plural(storeCount, ['магазин', 'магазина', 'магазинов'], ['', ''])}`, `${storeCount} store${storeCount === 1 ? '' : 's'}`) : t('Розница')}
            </div>
          </div>
        </div>
      )}

      <nav className="nav" aria-label={t('Разделы')}>
        {MAIN.map(renderItem)}
        <div className="nav-label">{t('Контроль')}</div>
        {control.map(renderItem)}
        <div className="nav-label">{t('Подборки')}</div>
        {VIEWS.map((v) => {
          const n = counts?.[v.id]
          const active = location.pathname === '/conversations' && currentView === v.id
          return (
            <button key={v.id} type="button" className="nav-item nav-view" aria-current={active ? 'page' : undefined}
              title={t(v.label)} onClick={() => navigate(`/conversations?view=${v.id}`)}>
              <span className="nav-dot" style={{ background: v.dot }} aria-hidden="true" />
              <span>{t(v.label)}</span>
              {n != null && <span className="nav-count">{n.toLocaleString()}</span>}
            </button>
          )
        })}
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

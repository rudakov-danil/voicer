import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi, periodRange } from '@/api/dashboard'
import { adminApi } from '@/api/admin'
import { clinicApi, type VisitView } from '@/api/clinic'
import type { ConversationView } from '@/types'
import {
  LayoutGrid,
  AudioLines,
  PackagePlus,
  PackageSearch,
  Coins,
  Users,
  ScrollText,
  ShieldAlert,
  BarChart3,
  Settings as SettingsIcon,
  Wrench,
  LogOut,
  Stethoscope,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useOrganization, useTerms } from '@/lib/terms'
import { VoicerLogo } from '@/components/VoicerLogo'
import { t, L, isEn, setLang, plural } from '@/i18n'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

const MAIN: NavItem[] = [
  { path: '/dashboard', label: 'Обзор', icon: LayoutGrid },
  { path: '/upsells', label: 'Допродажи', icon: PackagePlus },
  { path: '/motivation', label: 'Мотивация', icon: Coins },
  { path: '/conversations', label: 'Разговоры', icon: AudioLines },
  { path: '/team', label: 'Команда', icon: Users },
  { path: '/scripts', label: 'Скрипты', icon: ScrollText },
]

// Спрос на товары, которых не оказалось, и список к закупке — у аптек
const DEMAND: NavItem = { path: '/demand', label: 'Спрос', icon: PackageSearch }

const CONTROL: NavItem[] = [
  { path: '/compliance', label: 'Комплаенс', icon: ShieldAlert },
  { path: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { path: '/settings', label: 'Настройки', icon: SettingsIcon },
]

const ADMIN: NavItem = { path: '/admin', label: 'Администрирование', icon: Wrench }

// Клиники: без продаж и скриптов — приёмы, врачи и общие правила контроля качества
const CLINIC_MAIN: NavItem[] = [
  { path: '/clinic', label: 'Обзор', icon: LayoutGrid },
  { path: '/visits', label: 'Приёмы', icon: Stethoscope },
  { path: '/doctors', label: 'Врачи', icon: Users },
]
const CLINIC_CONTROL: NavItem[] = [
  { path: '/quality-rules', label: 'Правила контроля', icon: ShieldCheck },
  { path: '/settings', label: 'Настройки', icon: SettingsIcon },
]
const CLINIC_VIEWS: Array<{ id: VisitView; label: string; dot: string }> = [
  { id: 'fraud', label: 'Сигналы фрода', dot: 'var(--crit)' },
  { id: 'issues', label: 'Нарушения', dot: 'var(--warn)' },
  { id: 'low', label: 'Низкое качество', dot: 'var(--warn)' },
  { id: 'draft', label: 'Протокол не подтверждён', dot: 'var(--accent)' },
]

// Подборки разговоров (ui-concept: блок «Подборки» в сайдбаре) — ведут в список с фильтром
const VIEWS: Array<{ id: ConversationView; label: string; dot: string }> = [
  { id: 'attention', label: 'Требуют внимания', dot: 'var(--crit)' },
  { id: 'violations', label: 'Нарушения', dot: 'var(--crit)' },
  { id: 'competitor', label: 'Ушли к конкурентам', dot: 'var(--warn)' },
  { id: 'no_upsell', label: 'Без допродажи', dot: 'var(--accent)' },
  { id: 'unmet_demand', label: 'Нет в наличии', dot: 'var(--warn)' },
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

/** Сайдбар; mobile — только навигация для выпадающего меню мобильной шапки. */
export function Sidebar({ period, mobile, onNavigate }: { period: number; mobile?: boolean; onNavigate?: () => void }) {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const navigate = (to: string) => { routerNavigate(to); onNavigate?.() }
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: org } = useOrganization()
  const terms = useTerms()
  // У кофеен и аптек главный раздел — допродажи: он первым в меню; у аптек следом — «Спрос»
  const base = terms.offersFirst ? [MAIN[1], MAIN[0], ...MAIN.slice(2)] : MAIN
  const main = terms.isClinic ? CLINIC_MAIN : terms.tracksDemand ? [base[0], DEMAND, ...base.slice(1)] : base
  // Счётчики подборок — тем же запросом, что вкладки над списком разговоров
  const { data: counts } = useQuery({
    queryKey: ['conversations', 'sidebar-counts', period],
    queryFn: () => dashboardApi.getConversations({ limit: 1, period, with_counts: true }),
    select: (d) => d.view_counts,
    staleTime: 60_000,
    enabled: !!org && !terms.isClinic,
  })
  // У клиник подборки — по приёмам, тот же период, что в шапке
  const { data: clinicCounts } = useQuery({
    queryKey: ['clinic-visits', 'sidebar-counts', period],
    queryFn: () => clinicApi.visits({ ...periodRange(period - 1), limit: 1, with_counts: true }),
    select: (d) => d.counts,
    staleTime: 60_000,
    enabled: terms.isClinic,
  })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60_000 })
  const storeCount = (stores?.items || []).filter((s: any) => s.is_active !== false).length
  const currentView = new URLSearchParams(location.search).get('view')

  const isAdmin = user?.role === 'director' || user?.role === 'admin'
  const controlBase = terms.isClinic ? CLINIC_CONTROL : CONTROL
  const control = isAdmin ? [...controlBase, ADMIN] : controlBase
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')

  const renderItem = (item: NavItem) => {
    // На «Разговорах» с подборкой подсвечена подборка, а не пункт меню; у клиник карточка приёма
    // и страница врача подсвечивают свой раздел
    const inSection = terms.isClinic && location.pathname.startsWith(`${item.path}/`)
    const active = (location.pathname === item.path || inSection) && !((item.path === '/conversations' || item.path === '/visits') && currentView)
    const count = item.path === '/conversations' ? counts?.total : item.path === '/visits' ? clinicCounts?.all : undefined
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

  const nav = (
    <nav className="nav" aria-label={t('Разделы')}>
      {main.map(renderItem)}
      <div className="nav-label">{t('Контроль')}</div>
      {control.map(renderItem)}
      <div className="nav-label">{t('Подборки')}</div>
      {terms.isClinic && CLINIC_VIEWS.map((v) => {
        const n = clinicCounts?.[v.id]
        const active = location.pathname === '/visits' && currentView === v.id
        return (
          <button key={v.id} type="button" className="nav-item nav-view" aria-current={active ? 'page' : undefined}
            title={t(v.label)} onClick={() => navigate(`/visits?view=${v.id}`)}>
            <span className="nav-dot" style={{ background: v.dot }} aria-hidden="true" />
            <span>{t(v.label)}</span>
            {n != null && <span className="nav-count">{n.toLocaleString()}</span>}
          </button>
        )
      })}
      {!terms.isClinic && VIEWS.filter((v) => !(terms.offersFirst && v.id === 'competitor') && (v.id !== 'unmet_demand' || terms.tracksDemand)).map((v) => {
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
  )
  if (mobile) return nav

  return (
    <aside className="sidebar" aria-label={t('Навигация')}>
      <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
        <VoicerLogo size={18} />
        <span className="brand-name" translate="no">{t('Войсер')}</span>
      </a>

      {org && (
        <div className="org-switch">
          <span className="org-logo" aria-hidden="true" translate="no">{initials(org.name) || 'V'}</span>
          <div className="ellipsis">
            <div className="org-name ellipsis" translate="no">{org.name}</div>
            <div className="org-unit ellipsis">
              {storeCount ? L(`${storeCount} ${plural(storeCount, terms.storeForms, ['', ''])}`, `${storeCount} ${terms.isCafe ? 'location' : terms.isPharmacy ? 'pharmac' : terms.isClinic ? 'clinic' : 'store'}${terms.isPharmacy ? (storeCount === 1 ? 'y' : 'ies') : storeCount === 1 ? '' : 's'}`) : t(terms.isCafe ? 'Кофейни' : terms.isPharmacy ? 'Аптеки' : terms.isClinic ? 'Клиники' : 'Розница')}
            </div>
          </div>
        </div>
      )}

      {nav}

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
            onClick={() => { logout(); routerNavigate('/login') }}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronRight } from 'lucide-react'
import { notificationsApi, type DashboardNotification } from '@/api/notifications'
import { t, L, locale } from '@/i18n'

const PERIOD_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 180, label: '6 мес' },
  { value: 365, label: 'Год' },
]

interface TopbarProps {
  title: string
  subtitle?: string
  onPeriodChange?: (period: number) => void
  period?: number
  /** Hide the period select on pages where it doesn't apply. */
  showPeriod?: boolean
}

export function Topbar({ title, subtitle, onPeriodChange, period = 30, showPeriod = true }: TopbarProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const { data: notifications = [] } = useQuery<DashboardNotification[]>({
    queryKey: ['dashboard-notifications'],
    queryFn: () => notificationsApi.list({ limit: 20 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (popRef.current?.contains(target)) return
      if (btnRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unreadCount = notifications.length

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <h1 className="page-title">{t(title)}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>

        <div className="topbar-right">
          {showPeriod && onPeriodChange && (
            <div className="seg" role="group" aria-label={t('Период')}>
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={o.value === period}
                  onClick={() => onPeriodChange(o.value)}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <button
              ref={btnRef}
              type="button"
              className="icon-btn"
              onClick={() => setOpen((v) => !v)}
              aria-label={t('Уведомления')}
              aria-expanded={open}
            >
              <Bell size={16} aria-hidden="true" />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>

            {open && (
              <div
                ref={popRef}
                className="popover"
                style={{ top: 'calc(100% + 6px)', right: 0, width: 360, maxHeight: 480, overflowY: 'auto' }}
              >
                <div className="popover-head">{t('Уведомления')}</div>
                {notifications.length === 0 ? (
                  <div className="popover-empty">{t('Нет активных уведомлений')}</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.conversation_id}
                      type="button"
                      className="popover-item"
                      onClick={() => {
                        setOpen(false)
                        navigate(`/conversations?conv=${n.conversation_id}`)
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                          background: n.severity === 'high' ? 'var(--crit)' : n.severity === 'medium' ? 'var(--warn)' : 'var(--ink-4)',
                        }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 2 }} translate="no">
                          {n.seller_name || '—'}
                          {n.store_name && <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {n.store_name}</span>}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
                          {n.reasons.map(t).join(' · ')}
                        </span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>
                          {new Date(n.session_date).toLocaleDateString(locale)}
                          {typeof n.overall_score === 'number' && (
                            <span> · {L('скор', 'score')} {Math.round(n.overall_score)}%</span>
                          )}
                        </span>
                      </span>
                      <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0, marginTop: 4 }} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

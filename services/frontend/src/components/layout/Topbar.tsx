import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronDown, ChevronRight } from 'lucide-react'
import { notificationsApi, type DashboardNotification } from '@/api/notifications'

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
      const t = e.target as Node
      if (popRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
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
    <div className="topbar">
      <div className="topbar-left">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      <div className="topbar-right">
        {showPeriod && onPeriodChange && (
          <div className="period-pill">
            <span className="period-pill-value">
              {period === 7 ? '7 дней' : period === 90 ? '90 дней' : '30 дней'}
            </span>
            <ChevronDown size={14} className="period-pill-chevron" />
            <select
              value={period}
              onChange={(e) => onPeriodChange(parseInt(e.target.value))}
              aria-label="Период"
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <button
            ref={btnRef}
            className="icon-btn"
            onClick={() => setOpen((v) => !v)}
            aria-label="Уведомления"
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          {open && (
            <div
              ref={popRef}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: 360, maxHeight: 480, overflow: 'auto',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
                zIndex: 1200, display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
                Уведомления
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Нет активных уведомлений
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.conversation_id}
                    onClick={() => {
                      setOpen(false)
                      navigate(`/conversations?conv=${n.conversation_id}`)
                    }}
                    style={{
                      background: 'transparent', border: 'none', textAlign: 'left',
                      padding: '12px 14px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                      background: n.severity === 'high' ? 'var(--danger)' : n.severity === 'medium' ? 'var(--warning)' : 'var(--text-muted)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                        {n.seller_name || '—'}
                        {n.store_name && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {n.store_name}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {n.reasons.join(' · ')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(n.session_date).toLocaleDateString('ru-RU')}
                        {typeof n.overall_score === 'number' && (
                          <span> · скор {Math.round(n.overall_score)}%</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

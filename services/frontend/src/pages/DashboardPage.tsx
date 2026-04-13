import { useOutletContext, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { LineChartWidget } from '@/components/charts/LineChartWidget'
import { BarChartWidget } from '@/components/charts/BarChartWidget'
import { DonutChartWidget } from '@/components/charts/DonutChartWidget'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { AlertCircle, Info } from 'lucide-react'

interface OutletContext {
  period: number
}

const OUTCOME_COLORS: Record<string, string> = {
  purchase: '#16A34A',
  deferred: '#D97706',
  price_objection: '#DC2626',
  competitor: '#7C3AED',
  unknown: '#94A3B8',
}

const OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Покупка',
  deferred: 'Отложил',
  price_objection: 'Ценовой отказ',
  competitor: 'Ушёл к конкурентам',
  unknown: 'Не определён',
}

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1']

export function DashboardPage() {
  const { period } = useOutletContext<OutletContext>()
  const navigate = useNavigate()

  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview', period],
    queryFn: () => dashboardApi.getOverview({ period }),
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations-recent', period],
    queryFn: () => dashboardApi.getConversations({ page: 1, limit: 8 }),
  })

  const { data: sellers } = useQuery({
    queryKey: ['sellers-for-dashboard'],
    queryFn: () => dashboardApi.getSellers(),
  })

  if (isLoading) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>
  }

  // Compute store scores from sellers data
  const storeMap = new Map<string, { total: number; count: number; name: string }>()
  sellers?.forEach((s: any) => {
    const key = s.store_name || s.store_id || 'unknown'
    const existing = storeMap.get(key) || { total: 0, count: 0, name: s.store_name || s.store_id || key }
    existing.total += s.avg_score || 0
    existing.count++
    storeMap.set(key, existing)
  })
  const storesChartData = Array.from(storeMap.values()).map((data) => ({
    label: data.name,
    value: Math.round(data.total / data.count),
  }))

  // Conversations by day
  const conversationsByDayData = (overview?.conversations_by_day || overview?.daily_stats || []).map((d: any) => ({
    label: new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    value: d.count ?? d.total ?? 0,
  }))

  // Outcomes donut
  const outcomesDonutData = (overview?.outcomes || []).map((o) => ({
    name: OUTCOME_LABELS[o.outcome] || o.outcome,
    value: o.count,
    color: OUTCOME_COLORS[o.outcome] || '#94A3B8',
  }))

  // Avg check
  const avgCheck = overview?.avg_check || 0

  return (
    <div>
      {/* Metrics */}
      <div className="metrics-grid fade-in">
        <div className="metric-card">
          <div className="metric-label">Разговоров за период</div>
          <div className="metric-value">{(overview?.total_conversations || 0).toLocaleString('ru-RU')}</div>
          <div className="metric-change up">↑ 12%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Средний скоринг скрипта</div>
          <div className="metric-value">{Math.round(overview?.avg_score || 0)}%</div>
          <div className="metric-change up">↑ 3%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Конверсия в покупку</div>
          <div className="metric-value">{Math.round((overview?.conversion_rate || 0) * 100)}%</div>
          <div className="metric-change up">↑ 5%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Средний чек</div>
          <div className="metric-value">
            {avgCheck > 0 ? avgCheck.toLocaleString('ru-RU') : '—'} ₽
          </div>
          <div className="metric-change up">↑ 8%</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid-2 fade-in">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Разговоры по дням</div>
              <div className="card-subtitle">Количество записанных разговоров</div>
            </div>
          </div>
          <LineChartWidget data={conversationsByDayData} />
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Скоринг скриптов</div>
              <div className="card-subtitle">Средний балл по магазинам</div>
            </div>
          </div>
          <BarChartWidget data={storesChartData} />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid-2 fade-in">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Исходы разговоров</div>
              <div className="card-subtitle">Распределение за период</div>
            </div>
          </div>
          {outcomesDonutData.length > 0 ? (
            <DonutChartWidget data={outcomesDonutData} />
          ) : (
            <div className="empty-state"><p>Нет данных за период</p></div>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Оповещения</div>
              <div className="card-subtitle">Требуют внимания</div>
            </div>
          </div>
          <div className="alert-list">
            {(overview?.alerts || []).length === 0 && (
              <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Нет активных оповещений
              </div>
            )}
            {(overview?.alerts || []).map((alert, i) => (
              <div key={i} className={`alert-item ${alert.severity}`}>
                {alert.severity === 'info' ? (
                  <Info className="alert-icon" size={20} />
                ) : (
                  <AlertCircle className="alert-icon" size={20} />
                )}
                <div className="alert-text" dangerouslySetInnerHTML={{ __html: alert.message }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="card fade-in">
        <div className="card-header">
          <div className="card-title">Последние разговоры</div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/conversations')}>
            Все разговоры →
          </button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Дата и время</th>
                <th>Продавец</th>
                <th>Магазин</th>
                <th>Длительность</th>
                <th>Тема</th>
                <th>Скоринг</th>
                <th>Исход</th>
              </tr>
            </thead>
            <tbody>
              {(conversations?.items || []).map((c, idx) => {
                const mins = Math.floor((c.duration_seconds || 0) / 60)
                const secs = (c.duration_seconds || 0) % 60
                const dateSource = c.analyzed_at || c.recorded_at || c.session_date || ''
                const dateObj = dateSource ? new Date(dateSource) : null
                const dateStr = dateObj
                  ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                  : '—'
                const timeStr = dateObj
                  ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                  : ''
                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                return (
                  <tr key={c.id} onClick={() => navigate('/conversations')} style={{ cursor: 'pointer' }}>
                    <td>
                      {dateStr}{' '}
                      <span style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
                    </td>
                    <td>
                      <div className="seller-cell">
                        <div className="avatar" style={{ background: color }}>
                          {((c as any).seller_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="name">{(c as any).seller_name || c.seller_id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{(c as any).store_name || c.store_id}</td>
                    <td>{mins}:{String(secs).padStart(2, '0')}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.topic || '—'}</td>
                    <td><ScoreBadge score={c.overall_score} /></td>
                    <td><OutcomeTag outcome={c.outcome} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

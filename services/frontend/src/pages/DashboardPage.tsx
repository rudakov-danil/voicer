import { useOutletContext, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { LineChartWidget } from '@/components/charts/LineChartWidget'
import { BarChartWidget } from '@/components/charts/BarChartWidget'
import { DonutChartWidget } from '@/components/charts/DonutChartWidget'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { AlertCircle, TrendingUp, TrendingDown, Info } from 'lucide-react'

interface OutletContext {
  period: number
}

export function DashboardPage() {
  const { period } = useOutletContext<OutletContext>()
  const navigate = useNavigate()

  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview', period],
    queryFn: () => dashboardApi.getOverview({ period })
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations-recent', period],
    queryFn: () => dashboardApi.getConversations({
      page: 1,
      limit: 8
    })
  })

  if (isLoading) {
    return <div style={{ padding: '20px' }}>Загрузка...</div>
  }

  const metricsData = [
    {
      label: 'Разговоров за период',
      value: overview?.total_conversations || 0,
      trend: 12
    },
    {
      label: 'Средний скоринг скрипта',
      value: Math.round(overview?.avg_score || 0),
      trend: 3,
      suffix: '%'
    },
    {
      label: 'Конверсия в покупку',
      value: Math.round((overview?.conversion_rate || 0) * 100),
      trend: 5,
      suffix: '%'
    },
    {
      label: 'Средний чек',
      value: 0,
      trend: 8,
      prefix: '₽',
      format: true
    }
  ]

  const outcomesChartData = (overview?.outcomes || []).map((o) => ({
    label: o.outcome,
    value: o.count
  }))

  const storesChartData: {label: string, value: number}[] = []

  const conversationsByDayData = (overview?.daily_stats || []).map((d) => ({
    label: d.date,
    value: d.total
  }))

  const outcomesDonutData: {name: string, value: number, color: string}[] = []

  return (
    <div>
      <div className="metrics-grid fade-in">
        {metricsData.map((metric, i) => (
          <div key={i} className="metric-card">
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">
              {metric.prefix && metric.prefix}
              {metric.format
                ? metric.value.toLocaleString('ru-RU')
                : metric.value}
              {metric.suffix && metric.suffix}
            </div>
            <div
              className={`metric-change ${metric.trend > 0 ? 'up' : metric.trend < 0 ? 'down' : ''}`}
              style={{
                backgroundColor: metric.trend > 0 ? 'var(--success-light)' : metric.trend < 0 ? 'var(--danger-light)' : 'var(--bg)',
                color: metric.trend > 0 ? 'var(--success)' : metric.trend < 0 ? 'var(--danger)' : 'var(--text-muted)'
              }}
            >
              {metric.trend > 0 ? '↑' : metric.trend < 0 ? '↓' : '—'} {Math.abs(metric.trend)}%
            </div>
          </div>
        ))}
      </div>

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

      <div className="grid-2 fade-in">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Исходы разговоров</div>
              <div className="card-subtitle">Распределение за период</div>
            </div>
          </div>
          <DonutChartWidget data={outcomesDonutData} />
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Оповещения</div>
              <div className="card-subtitle">Требуют внимания</div>
            </div>
          </div>
          <div className="alert-list">
            {(overview?.alerts || []).map((alert, i) => (
              <div key={i} className={`alert-item ${alert.severity}`}>
                {alert.severity === 'danger' && <AlertCircle className="alert-icon" size={20} />}
                {alert.severity === 'warning' && <AlertCircle className="alert-icon" size={20} />}
                {alert.severity === 'info' && <Info className="alert-icon" size={20} />}
                <div className="alert-text">{alert.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card fade-in">
        <div className="card-header">
          <div>
            <div className="card-title">Последние разговоры</div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/conversations')}>
            Все разговоры →
          </button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Продавец</th>
                <th>Магазин</th>
                <th>Длит.</th>
                <th>Скоринг</th>
                <th>Исход</th>
              </tr>
            </thead>
            <tbody>
              {(conversations?.items || []).map((c) => {
                const durationMinutes = Math.floor((c.duration_seconds || 0) / 60)
                const durationSeconds = (c.duration_seconds || 0) % 60
                const dateSource = c.analyzed_at || c.recorded_at || c.session_date || ''
                const dateStr = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short'
                }) : '—'
                const timeStr = (c.analyzed_at || c.recorded_at) ? new Date(c.analyzed_at || c.recorded_at!).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit'
                }) : ''
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/conversations/${c.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{dateStr} {timeStr}</td>
                    <td>
                      <div className="seller-cell">
                        <div className="avatar" style={{ background: '#3B82F6' }}>
                          {c.seller_id[0]}
                        </div>
                        <div className="name">{c.seller_id}</div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.store_id}</td>
                    <td>{durationMinutes}:{String(durationSeconds).padStart(2, '0')}</td>
                    <td>
                      <ScoreBadge score={c.overall_score} />
                    </td>
                    <td>
                      <OutcomeTag outcome={c.outcome} />
                    </td>
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

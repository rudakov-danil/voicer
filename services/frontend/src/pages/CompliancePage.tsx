import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { BarChartWidget } from '@/components/charts/BarChartWidget'

interface OutletContext { period: number }

export function CompliancePage() {
  const { period } = useOutletContext<OutletContext>()

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations-compliance', period],
    queryFn: () => dashboardApi.getConversations({ limit: 200 }),
  })

  const items = conversations?.items ?? []
  const total = items.length
  const withViolations = items.filter((c) => c.has_violations)
  const compliant = items.filter((c) => c.compliance_ok !== false && !c.has_violations)
  const complianceRate = total > 0 ? (compliant.length / total) * 100 : 0

  // Group violations by outcome to show patterns
  const violationsByOutcome: Record<string, number> = {}
  withViolations.forEach((c) => {
    const key = c.outcome || 'unknown'
    violationsByOutcome[key] = (violationsByOutcome[key] || 0) + 1
  })

  const outcomeLabels: Record<string, string> = {
    purchase: 'Покупка', deferred: 'Отложено', price_objection: 'Цена',
    competitor: 'Конкурент', unknown: 'Неизвестно',
  }

  const violationChartData = Object.entries(violationsByOutcome)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      label: outcomeLabels[key] || key,
      value: count,
    }))

  // Recent violations list
  const recentViolations = withViolations
    .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
    .slice(0, 20)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div>
      {/* Metrics */}
      <div className="metrics-grid fade-in">
        <div className="metric-card">
          <div className="metric-label">Уровень соответствия</div>
          <div className="metric-value">{complianceRate.toFixed(0)}%</div>
          <div className="metric-change up" style={{
            background: complianceRate >= 90 ? 'var(--success-light)' : 'var(--warning-light)',
            color: complianceRate >= 90 ? 'var(--success)' : 'var(--warning)',
          }}>
            {complianceRate >= 90 ? 'Хорошо' : 'Требует внимания'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Проверено разговоров</div>
          <div className="metric-value">{total}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Нарушений найдено</div>
          <div className="metric-value" style={{ color: withViolations.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {withViolations.length}
          </div>
        </div>
      </div>

      <div className="grid-2 fade-in">
        {/* Violations by outcome chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Нарушения по результату</div>
              <div className="card-subtitle">Как нарушения связаны с исходом разговора</div>
            </div>
          </div>
          {violationChartData.length > 0 ? (
            <BarChartWidget
              data={violationChartData}
              color="#EF4444"
              height={220}
            />
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Нарушений не найдено
            </div>
          )}
        </div>

        {/* Compliance summary card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Сводка</div>
              <div className="card-subtitle">Статус комплаенса</div>
            </div>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>Без нарушений</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{compliant.length}</span>
              </div>
              <div style={{
                height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden',
              }}>
                <div style={{
                  width: total > 0 ? `${(compliant.length / total) * 100}%` : '0%',
                  height: '100%', background: 'var(--success)', borderRadius: 4,
                }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>С нарушениями</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>{withViolations.length}</span>
              </div>
              <div style={{
                height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden',
              }}>
                <div style={{
                  width: total > 0 ? `${(withViolations.length / total) * 100}%` : '0%',
                  height: '100%', background: 'var(--danger)', borderRadius: 4,
                }} />
              </div>
            </div>

            <div style={{
              padding: '12px', background: 'var(--bg)', borderRadius: 8, marginTop: 16,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Общий уровень комплаенса
              </div>
              <div style={{
                fontSize: 28, fontWeight: 700,
                color: complianceRate >= 90 ? 'var(--success)' : complianceRate >= 70 ? 'var(--warning)' : 'var(--danger)',
              }}>
                {complianceRate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent violations table */}
      <div className="card fade-in" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Последние нарушения</div>
            <div className="card-subtitle">Разговоры с обнаруженными нарушениями</div>
          </div>
        </div>

        {recentViolations.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нарушений не найдено — отличная работа!
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тема</th>
                <th>Оценка</th>
                <th>Результат</th>
              </tr>
            </thead>
            <tbody>
              {recentViolations.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.session_date).toLocaleDateString('ru-RU')}</td>
                  <td>{c.topic || '—'}</td>
                  <td>
                    <span style={{
                      color: c.overall_score >= 70 ? 'var(--success)' : c.overall_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                      fontWeight: 600,
                    }}>
                      {c.overall_score.toFixed(0)}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{
                      background: 'var(--danger-light)', color: 'var(--danger)',
                    }}>
                      {outcomeLabels[c.outcome] || c.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

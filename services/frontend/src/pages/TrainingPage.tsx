import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'

interface OutletContext { period: number }

export function TrainingPage() {
  const { period } = useOutletContext<OutletContext>()

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['sellers'],
    queryFn: () => dashboardApi.getSellers(),
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations-training', period],
    queryFn: () => dashboardApi.getConversations({ limit: 100, score_min: 85 }),
  })

  // Newcomers: sellers with few conversations (< 20) — proxy for new hires
  const newcomers = sellers
    .filter((s) => (s.conversations_count ?? 0) < 20 && (s.conversations_count ?? 0) > 0)
    .sort((a, b) => (a.conversations_count ?? 0) - (b.conversations_count ?? 0))

  // Best conversations for learning
  const bestConversations = (conversations?.items ?? [])
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, 10)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div>
      {/* Newcomer Progress */}
      <div className="card fade-in" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Новички</div>
            <div className="card-subtitle">Продавцы с менее чем 20 разговорами</div>
          </div>
          <div className="badge">{newcomers.length}</div>
        </div>

        {newcomers.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет новичков в обучении
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Продавец</th>
                <th>Разговоров</th>
                <th>Средний балл</th>
                <th>Конверсия</th>
                <th>Слабое место</th>
                <th>Прогресс</th>
              </tr>
            </thead>
            <tbody>
              {newcomers.map((s) => {
                const score = s.avg_score ?? 0
                const progress = Math.min(100, ((s.conversations_count ?? 0) / 20) * 100)
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</td>
                    <td>{s.conversations_count ?? 0}</td>
                    <td>
                      <span style={{
                        color: score >= 70 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)',
                        fontWeight: 600,
                      }}>
                        {score.toFixed(0)}
                      </span>
                    </td>
                    <td>{((s.conversion_rate ?? 0) * 100).toFixed(0)}%</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {s.weakest_step || '—'}
                    </td>
                    <td style={{ width: 140 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <div style={{
                          flex: 1, height: 6, background: 'var(--bg)',
                          borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${progress}%`, height: '100%',
                            background: progress >= 80 ? 'var(--success)' : 'var(--primary)',
                            borderRadius: 3, transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 32 }}>
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Best Conversations for Learning */}
      <div className="card fade-in">
        <div className="card-header">
          <div>
            <div className="card-title">Лучшие разговоры для обучения</div>
            <div className="card-subtitle">Разговоры с оценкой 85+ — отличные примеры</div>
          </div>
        </div>

        {bestConversations.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет записей с высоким баллом
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тема</th>
                <th>Оценка</th>
                <th>Результат</th>
                <th>Длительность</th>
              </tr>
            </thead>
            <tbody>
              {bestConversations.map((c) => {
                const outcomeLabels: Record<string, string> = {
                  purchase: 'Покупка', deferred: 'Отложено', price_objection: 'Возражение по цене',
                  competitor: 'Конкурент', unknown: 'Неизвестно',
                }
                const outcomeColors: Record<string, string> = {
                  purchase: 'var(--success)', deferred: 'var(--warning)',
                  price_objection: 'var(--danger)', competitor: 'var(--primary)',
                }
                return (
                  <tr key={c.id}>
                    <td>{new Date(c.session_date).toLocaleDateString('ru-RU')}</td>
                    <td>{c.topic || '—'}</td>
                    <td>
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                        {c.overall_score.toFixed(0)}
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{
                        background: `${outcomeColors[c.outcome] || 'var(--text-muted)'}20`,
                        color: outcomeColors[c.outcome] || 'var(--text-muted)',
                      }}>
                        {outcomeLabels[c.outcome] || c.outcome}
                      </span>
                    </td>
                    <td>
                      {c.duration_seconds
                        ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, '0')}`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

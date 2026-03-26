import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { useState } from 'react'

export function ConversationsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data: conversations } = useQuery({
    queryKey: ['conversations', page],
    queryFn: () => dashboardApi.getConversations({
      page,
      limit: 20
    })
  })

  return (
    <div>
      <div className="card fade-in">
        <div className="card-header">
          <div>
            <div className="card-title">Все разговоры</div>
            <div className="card-subtitle">
              Всего: {conversations?.total || 0}
            </div>
          </div>
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
                const durationMinutes = Math.floor(c.duration_seconds / 60)
                const durationSeconds = c.duration_seconds % 60
                const dateStr = new Date(c.recorded_at).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short'
                })
                const timeStr = new Date(c.recorded_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit'
                })
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

        <div style={{ padding: '16px 0', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Предыдущая
          </button>
          <span style={{ margin: '0 12px', color: 'var(--text-muted)' }}>
            Страница {page}
          </span>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setPage(page + 1)}
            disabled={!conversations || conversations.items.length < 20}
          >
            Следующая
          </button>
        </div>
      </div>
    </div>
  )
}

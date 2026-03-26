import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { Drawer } from '@/components/Drawer'
import { useState } from 'react'

function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['conversation-detail', conversationId],
    queryFn: () => dashboardApi.getConversationDetail(conversationId)
  })

  if (isLoading) return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>
  if (!data) return null

  const c = data.conversation

  const outcomeLabels: Record<string, string> = {
    purchase: 'Покупка',
    deferred: 'Отложил',
    price_objection: 'Возражение по цене',
    competitor: 'Ушёл к конкуренту',
    unknown: 'Неизвестно'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div className="metric-card" style={{ flex: 1, minWidth: '120px' }}>
          <div className="metric-label">Скоринг</div>
          <div className="metric-value" style={{ fontSize: '28px' }}>{Math.round(c.overall_score)}%</div>
        </div>
        <div className="metric-card" style={{ flex: 1, minWidth: '120px' }}>
          <div className="metric-label">Исход</div>
          <div style={{ marginTop: '8px' }}><OutcomeTag outcome={c.outcome} /></div>
        </div>
        {c.topic && (
          <div className="metric-card" style={{ flex: 1, minWidth: '120px' }}>
            <div className="metric-label">Тема</div>
            <div style={{ marginTop: '8px', fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{c.topic}</div>
          </div>
        )}
      </div>

      {c.script_results?.map((sr: any, i: number) => (
        <div key={i} className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{sr.script_name}</div>
            <ScoreBadge score={sr.script_score} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {sr.step_scores?.map((step: any, j: number) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: step.detected ? 'var(--success)' : 'var(--danger)'
                }} />
                <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{step.step_name}</div>
                <div style={{ fontSize: '13px', color: step.detected ? 'var(--success)' : 'var(--text-muted)', fontWeight: 500 }}>
                  {step.detected ? `${Math.round(step.score)}%` : '—'}
                </div>
              </div>
            ))}
          </div>

          {sr.violations?.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Нарушения:</div>
              {sr.violations.map((v: string, k: number) => (
                <div key={k} style={{
                  fontSize: '12px', color: 'var(--danger)',
                  background: 'var(--danger-light)', borderRadius: '6px',
                  padding: '6px 10px', marginBottom: '4px'
                }}>
                  {v}
                </div>
              ))}
            </div>
          )}

          {sr.step_scores?.filter((s: any) => s.evidence).map((step: any, j: number) => (
            <div key={j} style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{step.step_name}:</div>
              <div style={{
                fontSize: '12px', color: 'var(--text)',
                background: 'var(--bg)', borderRadius: '6px',
                padding: '8px 10px', fontStyle: 'italic'
              }}>
                {step.evidence}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function ConversationsPage() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: conversations } = useQuery({
    queryKey: ['conversations', page],
    queryFn: () => dashboardApi.getConversations({ page, limit: 20 })
  })

  const selectedConversation = conversations?.items.find(c => c.id === selectedId)

  return (
    <div>
      <div className="card fade-in">
        <div className="card-header">
          <div>
            <div className="card-title">Все разговоры</div>
            <div className="card-subtitle">Всего: {conversations?.total || 0}</div>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Продавец</th>
                <th>Тема</th>
                <th>Скоринг</th>
                <th>Исход</th>
              </tr>
            </thead>
            <tbody>
              {(conversations?.items || []).map((c) => {
                const date = c.analyzed_at
                  ? new Date(c.analyzed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                  : c.session_date || '—'
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{ cursor: 'pointer', background: selectedId === c.id ? 'var(--hover)' : '' }}
                  >
                    <td>{date}</td>
                    <td>
                      <div className="seller-cell">
                        <div className="avatar" style={{ background: '#3B82F6' }}>
                          {(c.seller_id || '?')[0].toUpperCase()}
                        </div>
                        <div className="name" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {c.seller_id?.slice(0, 8)}...
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      {(c as any).topic || '—'}
                    </td>
                    <td><ScoreBadge score={c.overall_score} /></td>
                    <td><OutcomeTag outcome={c.outcome} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '16px 0', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
            Предыдущая
          </button>
          <span style={{ margin: '0 12px', color: 'var(--text-muted)' }}>Страница {page}</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(page + 1)} disabled={!conversations || conversations.items.length < 20}>
            Следующая
          </button>
        </div>
      </div>

      <Drawer
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={selectedConversation ? `Разговор ${new Date(selectedConversation.analyzed_at || selectedConversation.session_date).toLocaleDateString('ru-RU')} · ${Math.round(selectedConversation.overall_score)}%` : 'Разговор'}
      >
        {selectedId && <ConversationDetail conversationId={selectedId} />}
      </Drawer>
    </div>
  )
}

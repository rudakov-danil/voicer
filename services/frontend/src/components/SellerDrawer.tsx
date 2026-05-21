import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { dashboardApi } from '@/api/dashboard'
import { Drawer } from '@/components/Drawer'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { AlertCircle, Info, ExternalLink } from 'lucide-react'

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981']

interface SellerDrawerProps {
  sellerId: string | null
  onClose: () => void
  period?: number
}

interface SellerDetail {
  seller: {
    id: string
    first_name?: string
    last_name?: string
    store_id?: string | null
    store_name?: string | null
  }
  stats: {
    total_conversations: number
    avg_score: number
    conversion_rate: number
    strong_count: number
    compliance_violations_count: number
    score_trend: number
  }
  stage_breakdown: Array<{
    script_id: string | null
    script_name: string
    script_full_name?: string | null
    steps: Array<{ step_name: string; avg_score: number; sample_count?: number }>
  }>
  recent_conversations: Array<{
    id: string
    session_date: string
    topic?: string | null
    overall_score: number | null
    outcome?: string | null
    duration_seconds?: number | null
  }>
  recommendations: Array<{ severity: 'info' | 'warning'; text: string }>
  score_chart: Array<{ date: string; avg_score: number }>
}

export function SellerDrawer({ sellerId, onClose, period }: SellerDrawerProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery<SellerDetail>({
    queryKey: ['seller-detail', sellerId, period],
    queryFn: () => dashboardApi.getSellerDetail(sellerId!, { period }) as Promise<SellerDetail>,
    enabled: !!sellerId,
  })

  const profile = data?.seller
  const stats = data?.stats

  const displayName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Без имени'
    : 'Профиль продавца'

  return (
    <Drawer isOpen={!!sellerId} onClose={onClose} title={displayName}>
      {isLoading && <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>}
      {data && profile && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Avatar + Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: AVATAR_COLORS[(profile.first_name?.charCodeAt(0) || 0) % AVATAR_COLORS.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '20px', fontWeight: 700,
            }}>
              {(profile.first_name?.[0] || '?')}{(profile.last_name?.[0] || '')}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {profile.store_name || '—'}
              </div>
            </div>
          </div>

          {/* 4 Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Конверсия</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>
                {Math.round((stats.conversion_rate || 0) * 100)}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                разговоров с покупкой
              </div>
            </div>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Скоринг скрипта</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>
                {Math.round(stats.avg_score || 0)}%
              </div>
              {stats.score_trend !== 0 && (
                <div className={`metric-change ${stats.score_trend > 0 ? 'up' : 'down'}`}>
                  {stats.score_trend > 0 ? '↑' : '↓'} {Math.abs(stats.score_trend)}% vs пред.
                </div>
              )}
            </div>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Сильных разговоров</div>
              <div className="metric-value" style={{ fontSize: '22px', color: 'var(--success)' }}>
                {stats.strong_count}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                скоринг ≥ 70%
              </div>
            </div>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Нарушений комплаенса</div>
              <div className="metric-value" style={{
                fontSize: '22px',
                color: stats.compliance_violations_count > 0 ? 'var(--danger)' : 'var(--text)',
              }}>
                {stats.compliance_violations_count}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                в {stats.total_conversations} разговорах
              </div>
            </div>
          </div>

          {/* Step scores — сгруппированы по скрипту */}
          {data.stage_breakdown.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                Этапы скрипта — зоны развития
              </div>
              {data.stage_breakdown.map((group) => (
                <div key={group.script_id || '_'} style={{ marginBottom: 16 }}>
                  {data.stage_breakdown.length > 1 && (
                    <div
                      title={group.script_full_name || undefined}
                      style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: 0.4,
                        marginBottom: 6, paddingBottom: 4,
                        borderBottom: '1px solid var(--border-light)',
                      }}
                    >
                      {group.script_name}
                    </div>
                  )}
                  {group.steps.map((step, i) => {
                    const score = Math.round(step.avg_score || 0)
                    const barColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '8px 0', borderBottom: '1px solid var(--border-light)',
                      }}>
                        <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>
                          {step.step_name}
                        </div>
                        <div style={{ width: '120px' }}>
                          <div className="progress-bar" style={{ height: '6px' }}>
                            <div className={`progress-bar-fill ${barColor}`} style={{ width: `${score}%` }} />
                          </div>
                        </div>
                        <div style={{
                          width: '36px', fontSize: '13px', fontWeight: 600, textAlign: 'right',
                          color: score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)',
                        }}>
                          {score}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                Рекомендации по развитию
              </div>
              <div className="alert-list">
                {data.recommendations.map((rec, i) => (
                  <div key={i} className={`alert-item ${rec.severity}`}>
                    {rec.severity === 'warning' ? (
                      <AlertCircle className="alert-icon" size={16} />
                    ) : (
                      <Info className="alert-icon" size={16} />
                    )}
                    <div className="alert-text" style={{ fontSize: '12px' }}>{rec.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent conversations */}
          {data.recent_conversations.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                Последние разговоры
              </div>
              {data.recent_conversations.map((conv) => {
                const dur = conv.duration_seconds || 0
                const mins = Math.floor(dur / 60)
                const secs = dur % 60
                const date = new Date(conv.session_date).toLocaleDateString('ru-RU')
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      onClose()
                      navigate(`/conversations?conv=${conv.id}`)
                    }}
                    style={{
                      background: 'transparent', border: 'none', textAlign: 'left',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 8, padding: '10px 0', width: '100%',
                      borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.topic || 'Без темы'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {date}{dur > 0 ? ` · ${mins}:${String(secs).padStart(2, '0')}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <ScoreBadge score={conv.overall_score || 0} />
                      {conv.outcome && <OutcomeTag outcome={conv.outcome as any} />}
                      <ExternalLink size={13} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { Drawer } from '@/components/Drawer'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { AlertCircle, Info } from 'lucide-react'

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981']

interface SellerDrawerProps {
  sellerId: string | null
  onClose: () => void
}

export function SellerDrawer({ sellerId, onClose }: SellerDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['seller-detail', sellerId],
    queryFn: () => dashboardApi.getSellerDetail(sellerId!),
    enabled: !!sellerId,
  })

  const seller = data

  return (
    <Drawer
      isOpen={!!sellerId}
      onClose={onClose}
      title={seller ? `${seller.first_name} ${seller.last_name}` : 'Профиль продавца'}
    >
      {isLoading && <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>}
      {seller && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Avatar + Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: AVATAR_COLORS[(seller.first_name?.charCodeAt(0) || 0) % AVATAR_COLORS.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '20px', fontWeight: 700,
            }}>
              {(seller.first_name?.[0] || '')}{(seller.last_name?.[0] || '')}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                {seller.first_name} {seller.last_name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {seller.store_name || seller.store_id}
              </div>
            </div>
          </div>

          {/* 4 Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Конверсия</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>
                {Math.round((seller.conversion_rate || 0) * 100)}%
              </div>
              {seller.score_trend !== undefined && (
                <div className={`metric-change ${seller.score_trend > 0 ? 'up' : 'down'}`}>
                  {seller.score_trend > 0 ? '↑' : '↓'} {Math.abs(seller.score_trend)}%
                </div>
              )}
            </div>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Скоринг скрипта</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>
                {Math.round(seller.avg_score || 0)}%
              </div>
            </div>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Средний чек</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>
                {(seller.avg_check || 0).toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="metric-card" style={{ padding: '14px' }}>
              <div className="metric-label">Разговоров</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>
                {seller.conversations_count || seller.total_conversations || 0}
              </div>
            </div>
          </div>

          {/* Step scores */}
          {seller.step_scores && seller.step_scores.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                Этапы скрипта — зоны развития
              </div>
              {seller.step_scores.map((step: any, i: number) => {
                const score = Math.round(step.score || step.avg_score || 0)
                const barColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '8px 0', borderBottom: '1px solid var(--border-light)',
                  }}>
                    <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>
                      {step.name || step.step_name}
                    </div>
                    <div style={{ width: '120px' }}>
                      <div className="progress-bar" style={{ height: '6px' }}>
                        <div className={`progress-bar-fill ${barColor}`} style={{ width: `${score}%` }} />
                      </div>
                    </div>
                    <div style={{ width: '36px', fontSize: '13px', fontWeight: 600, textAlign: 'right',
                      color: score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)' }}>
                      {score}%
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recommendations */}
          {seller.recommendations && seller.recommendations.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                Рекомендации по развитию
              </div>
              <div className="alert-list">
                {seller.recommendations.map((rec: any, i: number) => (
                  <div key={i} className={`alert-item ${rec.severity || 'info'}`}>
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
          {seller.recent_conversations && seller.recent_conversations.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
                Последние разговоры
              </div>
              {seller.recent_conversations.map((conv: any, i: number) => {
                const mins = Math.floor((conv.duration_seconds || 0) / 60)
                const secs = (conv.duration_seconds || 0) % 60
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid var(--border-light)',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                        {conv.topic || 'Разговор'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {conv.date} · {mins}:{String(secs).padStart(2, '0')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ScoreBadge score={conv.score} />
                      <OutcomeTag outcome={conv.outcome} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

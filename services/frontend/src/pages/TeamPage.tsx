import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { dashboardApi } from '@/api/dashboard'
import { SellerDrawer } from '@/components/SellerDrawer'
import { ScoreBadge } from '@/components/ScoreBadge'
import { useState } from 'react'

interface OutletContext { period: number }

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1']

export function TeamPage() {
  const { period } = useOutletContext<OutletContext>()
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const { data: sellers } = useQuery({
    queryKey: ['sellers', period],
    queryFn: () => dashboardApi.getSellers({ period }),
  })

  const sorted = (sellers || []).slice().sort((a, b) => (b.conversion_rate || 0) - (a.conversion_rate || 0))
  const total = sellers?.length || 0
  const avgScore = total ? Math.round(sellers!.reduce((s, x) => s + (x.avg_score || 0), 0) / total) : 0
  const maxConv = sorted[0]?.conversion_rate || 0
  const minConv = sorted[sorted.length - 1]?.conversion_rate || 0
  const maxPct = Math.round(maxConv * 100)
  const minPct = Math.round(minConv * 100)
  const spreadLabel = sorted.length >= 2 ? `${maxPct}% / ${minPct}%` : sorted.length === 1 ? `${maxPct}%` : '—'

  // Store aggregation
  const storeMap = new Map<string, { name: string; count: number; totalScore: number; totalConv: number; totalCheck: number }>()
  sellers?.forEach((s) => {
    const key = s.store_name || s.store_id
    const e = storeMap.get(key) || { name: key, count: 0, totalScore: 0, totalConv: 0, totalCheck: 0 }
    e.count++
    e.totalScore += s.avg_score || 0
    e.totalConv += s.conversion_rate || 0
    storeMap.set(key, e)
  })

  return (
    <div>
      {/* Metrics */}
      <div className="metrics-grid fade-in" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="metric-card">
          <div className="metric-label">Продавцов в сети</div>
          <div className="metric-value">{total}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Средний скоринг</div>
          <div className="metric-value">{avgScore}%</div>
          <div className="metric-change up">↑ 3%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Разброс конверсии (лучший/худший)</div>
          <div className="metric-value" style={{ fontSize: 22 }}>{spreadLabel}</div>
        </div>
      </div>

      <div className="grid-2 fade-in">
        {/* Leaderboard */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Рейтинг по конверсии</div>
            </div>
          </div>
          <div>
            {sorted.map((seller, i) => {
              const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'other'
              const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
              const convPct = Math.round((seller.conversion_rate || 0) * 100)
              return (
                <div
                  key={seller.id}
                  className="leaderboard-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedSellerId(seller.id)}
                >
                  <div className={`leaderboard-rank ${rankClass}`}>{i + 1}</div>
                  <div className="avatar" style={{
                    background: color, width: 36, height: 36, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '12px', fontWeight: 600, flexShrink: 0,
                  }}>
                    {seller.first_name[0]}{seller.last_name[0]}
                  </div>
                  <div className="leaderboard-info">
                    <div className="leaderboard-name">
                      {seller.first_name} {seller.last_name}
                    </div>
                    <div className="leaderboard-store">{seller.store_name || seller.store_id}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="leaderboard-score" style={{
                      color: convPct >= 35 ? 'var(--success)' : convPct >= 25 ? 'var(--warning)' : 'var(--danger)',
                    }}>
                      {convPct}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {seller.conversations_count || 0} разг.
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Store Comparison */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Сравнение по магазинам</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Магазин</th>
                  <th>Продавцов</th>
                  <th>Ср. скоринг</th>
                  <th>Ср. конверсия</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(storeMap.entries()).map(([storeId, data]) => (
                  <tr key={storeId}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{storeId}</td>
                    <td>{data.count}</td>
                    <td><ScoreBadge score={Math.round(data.totalScore / data.count)} /></td>
                    <td>{Math.round((data.totalConv / data.count) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SellerDrawer sellerId={selectedSellerId} onClose={() => setSelectedSellerId(null)} period={period} />
    </div>
  )
}

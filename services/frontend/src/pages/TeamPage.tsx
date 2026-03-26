import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { useNavigate } from 'react-router-dom'

export function TeamPage() {
  const navigate = useNavigate()

  const { data: sellers } = useQuery({
    queryKey: ['sellers'],
    queryFn: () => dashboardApi.getSellers()
  })

  return (
    <div>
      <div className="metrics-grid fade-in">
        <div className="metric-card">
          <div className="metric-label">Всего продавцов</div>
          <div className="metric-value">{sellers?.length || 0}</div>
          <div className="metric-change up" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            ↑ 4%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Средний скоринг</div>
          <div className="metric-value">
            {sellers
              ? Math.round(
                  sellers.reduce((sum, s) => sum + (s.avg_score || 0), 0) / sellers.length
                )
              : 0}
            %
          </div>
          <div className="metric-change up" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            ↑ 2%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Разброс конверсии</div>
          <div className="metric-value">18%</div>
          <div className="metric-change down" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            ↓ 3%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Разговоров всего</div>
          <div className="metric-value">
            {sellers
              ? sellers.reduce((sum, s) => sum + (s.conversations_count || 0), 0)
              : 0}
          </div>
          <div className="metric-change up" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            ↑ 8%
          </div>
        </div>
      </div>

      <div className="grid-2 fade-in">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Лучшие продавцы</div>
              <div className="card-subtitle">По среднему скорингу</div>
            </div>
          </div>
          <div style={{ paddingTop: '12px' }}>
            {sellers?.slice().sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0)).slice(0, 10).map((seller, i) => {
              const rankColors = ['#FEF3C7', '#F1F5F9', '#FED7AA']
              const rankTextColors = ['#B45309', '#475569', '#C2410C']
              return (
                <div key={seller.id} className="leaderboard-item">
                  <div
                    className="leaderboard-rank"
                    style={{
                      background: rankColors[i] || 'var(--bg)',
                      color: rankTextColors[i] || 'var(--text-muted)'
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="leaderboard-info">
                    <div className="leaderboard-name">
                      {seller.first_name} {seller.last_name}
                    </div>
                    <div className="leaderboard-store">{seller.store_id}</div>
                  </div>
                  <div className="leaderboard-score">{Math.round(seller.avg_score || 0)}%</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Сравнение по магазинам</div>
              <div className="card-subtitle">Ключевые метрики</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>Магазин</th>
                  <th>Продавцов</th>
                  <th>Скор</th>
                  <th>Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {sellers?.reduce((acc, seller) => {
                  const store = acc.find((s) => s.store_id === seller.store_id)
                  if (store) {
                    store.count++
                    store.totalScore += seller.avg_score || 0
                    store.totalConversion += seller.conversion_rate || 0
                  } else {
                    acc.push({
                      store_id: seller.store_id,
                      count: 1,
                      totalScore: seller.avg_score || 0,
                      totalConversion: seller.conversion_rate || 0
                    })
                  }
                  return acc
                }, [] as any[])?.map((store) => (
                  <tr key={store.store_id}>
                    <td>{store.store_id}</td>
                    <td>{store.count}</td>
                    <td>{Math.round(store.totalScore / store.count)}%</td>
                    <td>{Math.round((store.totalConversion / store.count) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

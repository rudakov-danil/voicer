import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import { LineChartWidget } from '@/components/charts/LineChartWidget'

interface OutletContext { period: number }

const SENTIMENT_LABELS: Record<string, string> = {
  negative: 'Негатив', positive: 'Позитив', mixed: 'Смешанный', neutral: 'Нейтрал',
}
const SENTIMENT_COLORS: Record<string, string> = {
  negative: 'var(--danger)', positive: 'var(--success)', mixed: 'var(--warning)', neutral: 'var(--text-muted)',
}

export function IntelligencePage() {
  const [activeTab, setActiveTab] = useState('competitors')
  const { period } = useOutletContext<OutletContext>()

  return (
    <div>
      <div className="tabs fade-in">
        {[
          { key: 'competitors', label: 'Конкуренты' },
          { key: 'topics', label: 'Тренды' },
          { key: 'voc', label: 'Голос клиента' },
        ].map((tab) => (
          <button key={tab.key} className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'competitors' && <CompetitorsTab period={period} />}
      {activeTab === 'topics' && <TopicsTab period={period} />}
      {activeTab === 'voc' && <VocTab period={period} />}
    </div>
  )
}

function CompetitorsTab({ period }: { period: number }) {
  const { data: competitors } = useQuery({
    queryKey: ['competitors', period],
    queryFn: () => analyticsApi.getCompetitors({ period }),
  })

  const chartData = (competitors || []).slice(0, 4).map((c) => ({
    label: c.name, value: c.mentions,
  }))

  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Упоминания конкурентов</div>
            <div className="card-subtitle">Автоматическое извлечение из разговоров</div>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Конкурент</th><th>Упоминания</th><th>Тренд (нед.)</th><th>Тональность</th></tr></thead>
            <tbody>
              {(competitors || []).map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{c.name}</td>
                  <td>{c.mentions}</td>
                  <td style={{ color: c.trend > 0 ? 'var(--success)' : c.trend < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {c.trend > 0 ? '+' : ''}{c.trend}%
                  </td>
                  <td><span style={{ color: SENTIMENT_COLORS[c.sentiment] }}>{SENTIMENT_LABELS[c.sentiment]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Динамика упоминаний</div></div>
        {chartData.length > 0 ? <LineChartWidget data={chartData} /> : <div className="empty-state"><p>Данные появятся после анализа</p></div>}
      </div>
    </div>
  )
}

function TopicsTab({ period }: { period: number }) {
  const { data: topics } = useQuery({
    queryKey: ['topics', period],
    queryFn: () => analyticsApi.getTopicTrends({ period }),
  })

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-header">
          <div><div className="card-title">Трендовые темы</div><div className="card-subtitle">Что обсуждают клиенты</div></div>
        </div>
        {(topics || []).map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 500, color: 'var(--text)' }}>{t.topic}</span>
              {t.is_hot && <span className="tag tag-danger" style={{ marginLeft: 8, fontSize: '10px', padding: '1px 6px' }}>HOT</span>}
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginRight: 16 }}>{t.mentions} упоминаний</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: t.trend > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
              {t.trend > 0 ? '+' : ''}{t.trend}%
            </span>
          </div>
        ))}
        {(!topics || topics.length === 0) && <div className="empty-state"><p>Данные появятся после анализа</p></div>}
      </div>
    </div>
  )
}

function VocTab({ period }: { period: number }) {
  const { data: demand } = useQuery({ queryKey: ['unmet-demand', period], queryFn: () => analyticsApi.getUnmetDemand({ period }) })
  const { data: feedback } = useQuery({ queryKey: ['product-feedback', period], queryFn: () => analyticsApi.getProductFeedback({ period }) })

  return (
    <div className="fade-in">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Неудовлетворённый спрос</div><div className="card-subtitle">Что клиенты ищут, но не находят</div></div>
          </div>
          {(demand || []).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{d.rank}</div>
              <div style={{ flex: 1, fontSize: '13.5px', color: 'var(--text)' }}>{d.description}</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.mentions} упом.</span>
            </div>
          ))}
          {(!demand || demand.length === 0) && <div className="empty-state"><p>Данные появятся после анализа</p></div>}
        </div>
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Обратная связь по продуктам</div><div className="card-subtitle">Что хвалят и критикуют клиенты</div></div>
          </div>
          {(feedback || []).map((f, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{f.product}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {f.pros.map((p, j) => <span key={j} className="tag tag-success">+ {p}</span>)}
                {f.cons.map((c, j) => <span key={j} className="tag tag-danger">− {c}</span>)}
              </div>
            </div>
          ))}
          {(!feedback || feedback.length === 0) && <div className="empty-state"><p>Данные появятся после анализа</p></div>}
        </div>
      </div>
    </div>
  )
}

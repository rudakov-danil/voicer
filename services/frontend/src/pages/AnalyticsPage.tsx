import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import { DonutChartWidget } from '@/components/charts/DonutChartWidget'
import { BarChartWidget } from '@/components/charts/BarChartWidget'
import { LineChartWidget } from '@/components/charts/LineChartWidget'

interface OutletContext { period: number }

const OBJECTION_COLORS: Record<string, string> = {
  price: '#EF4444', not_ready: '#F59E0B', competitors: '#3B82F6',
  functionality: '#8B5CF6', quality: '#EC4899', trust: '#10B981', timing: '#6366F1',
}
const OBJECTION_LABELS: Record<string, string> = {
  price: 'Цена', not_ready: 'Не готов сейчас', competitors: 'Конкуренты',
  functionality: 'Функционал', quality: 'Качество', trust: 'Доверие', timing: 'Сроки',
}

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('objections')
  const { period } = useOutletContext<OutletContext>()

  return (
    <div>
      <div className="tabs fade-in">
        {['objections', 'conversion', 'sentiment'].map((tab) => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}>
            {tab === 'objections' ? 'Возражения' : tab === 'conversion' ? 'Конверсия' : 'Сентимент'}
          </button>
        ))}
      </div>

      {activeTab === 'objections' && <ObjectionsTab period={period} />}
      {activeTab === 'conversion' && <ConversionTab period={period} />}
      {activeTab === 'sentiment' && <SentimentTab period={period} />}
    </div>
  )
}

function ObjectionsTab({ period }: { period: number }) {
  const { data: distribution } = useQuery({
    queryKey: ['objections-dist', period],
    queryFn: () => analyticsApi.getObjectionsDistribution({ period }),
  })

  const { data: correlation } = useQuery({
    queryKey: ['objections-corr', period],
    queryFn: () => analyticsApi.getObjectionsCorrelation({ period }),
  })

  const donutData = (distribution || []).map((d) => ({
    name: OBJECTION_LABELS[d.type] || d.type,
    value: d.count,
    color: OBJECTION_COLORS[d.type] || '#94A3B8',
  }))

  const maxCount = Math.max(...(distribution || []).map((d) => d.count), 1)

  return (
    <div className="fade-in">
      <div className="grid-2">
        {/* Distribution bars */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Распределение возражений</div>
              <div className="card-subtitle">Топ-7 типов за период</div>
            </div>
          </div>
          {(distribution || []).map((d, i) => (
            <div key={i} className="objection-row">
              <div className="objection-label">{OBJECTION_LABELS[d.type] || d.type}</div>
              <div className="objection-bar-wrap">
                <div className="objection-bar-fill"
                  style={{
                    width: `${(d.count / maxCount) * 100}%`,
                    background: OBJECTION_COLORS[d.type] || '#94A3B8',
                  }}
                />
              </div>
              <div className="objection-count">{d.count}</div>
            </div>
          ))}
          {(!distribution || distribution.length === 0) && (
            <div className="empty-state"><p>Нет данных о возражениях</p></div>
          )}
        </div>

        {/* Donut */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Возражения по типу</div>
              <div className="card-subtitle">Круговая диаграмма</div>
            </div>
          </div>
          {donutData.length > 0 ? (
            <DonutChartWidget data={donutData} />
          ) : (
            <div className="empty-state"><p>Нет данных</p></div>
          )}
        </div>
      </div>

      {/* Correlation table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Корреляция возражений с исходом продажи</div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Тип возражения</th>
                <th>Всего</th>
                <th>Покупка</th>
                <th>Отказ</th>
                <th>Конверсия после возражения</th>
                <th>Лучшая техника</th>
              </tr>
            </thead>
            <tbody>
              {(correlation || []).map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{OBJECTION_LABELS[c.type] || c.type}</td>
                  <td>{c.total}</td>
                  <td>{c.purchases}</td>
                  <td>{c.refusals}</td>
                  <td style={{
                    fontWeight: 600,
                    color: c.conversion_after >= 40 ? 'var(--success)' : c.conversion_after >= 25 ? 'var(--warning)' : 'var(--danger)',
                  }}>{c.conversion_after}%</td>
                  <td>
                    <span className="tag tag-primary">{c.best_technique}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ConversionTab({ period }: { period: number }) {
  const { data: funnel } = useQuery({
    queryKey: ['conversion-funnel', period],
    queryFn: () => analyticsApi.getConversionFunnel({ period }),
  })

  const { data: byStore } = useQuery({
    queryKey: ['conversion-store', period],
    queryFn: () => analyticsApi.getConversionByStore({ period }),
  })

  const storeChartData = (byStore || []).map((s) => ({
    label: s.store_name,
    value: Math.round(s.conversion_rate * 100),
  }))

  const FUNNEL_COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE']

  return (
    <div className="fade-in">
      <div className="grid-2">
        {/* Funnel */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Воронка конверсии</div>
          </div>
          {(funnel || []).map((stage, i) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
                fontSize: '13px',
              }}>
                <span style={{ color: 'var(--text)' }}>{stage.stage}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {stage.count.toLocaleString('ru-RU')} ({stage.percentage}%)
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill"
                  style={{ width: `${stage.percentage}%`, background: FUNNEL_COLORS[i] || '#2563EB' }}
                />
              </div>
            </div>
          ))}
          {(!funnel || funnel.length === 0) && (
            <div className="empty-state"><p>Данные появятся после анализа</p></div>
          )}
        </div>

        {/* By Store */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Конверсия по магазинам</div>
          </div>
          {storeChartData.length > 0 ? (
            <BarChartWidget data={storeChartData} />
          ) : (
            <div className="empty-state"><p>Данные появятся после анализа</p></div>
          )}
        </div>
      </div>
    </div>
  )
}

function SentimentTab({ period }: { period: number }) {
  const { data: sentiment } = useQuery({
    queryKey: ['sentiment', period],
    queryFn: () => analyticsApi.getSentiment({ period }),
  })

  const { data: trend } = useQuery({
    queryKey: ['sentiment-trend', period],
    queryFn: () => analyticsApi.getSentimentTrend({ period }),
  })

  const pos = sentiment?.positive || 0
  const neu = sentiment?.neutral || 0
  const neg = sentiment?.negative || 0
  const total = pos + neu + neg || 1

  return (
    <div className="fade-in">
      {/* Distribution */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Распределение сентимента</div>
            <div className="card-subtitle">По всем разговорам за период</div>
          </div>
        </div>
        <div className="sentiment-bar" style={{ height: '12px', marginBottom: '12px' }}>
          <div className="sentiment-positive" style={{ width: `${(pos / total) * 100}%` }} />
          <div className="sentiment-neutral" style={{ width: `${(neu / total) * 100}%` }} />
          <div className="sentiment-negative" style={{ width: `${(neg / total) * 100}%` }} />
        </div>
        <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
          <span>● <span style={{ color: 'var(--success)' }}>Позитивный {Math.round((pos / total) * 100)}%</span></span>
          <span>● <span style={{ color: 'var(--text-muted)' }}>Нейтральный {Math.round((neu / total) * 100)}%</span></span>
          <span>● <span style={{ color: 'var(--danger)' }}>Негативный {Math.round((neg / total) * 100)}%</span></span>
        </div>
      </div>

      {/* Trend */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Динамика сентимента по неделям</div>
        </div>
        {trend && trend.length > 0 ? (
          <LineChartWidget
            data={trend.map((t) => ({ label: t.week, value: t.positive }))}
            color="#16A34A"
          />
        ) : (
          <div className="empty-state"><p>Данные появятся после анализа</p></div>
        )}
      </div>
    </div>
  )
}

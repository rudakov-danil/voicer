import { useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTerms } from '@/lib/terms'
import { outcomeColor, outcomeLabel } from '@/lib/outcomes'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import { DonutChartWidget } from '@/components/charts/DonutChartWidget'
import { BarChartWidget } from '@/components/charts/BarChartWidget'

interface OutletContext { period: number }

function InfoTooltip({ children }: { children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const tooltipWidth = 260
    let left = r.left + r.width / 2 - tooltipWidth / 2
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8))
    setCoords({ top: r.bottom + 8, left })
  }
  const hide = () => setCoords(null)

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'var(--border)',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'help',
          outline: 'none',
        }}
      >?</span>
      {coords && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 10000,
            width: 260,
            padding: '10px 12px',
            background: 'var(--bg-card)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.5,
            textAlign: 'left',
            textTransform: 'none',
            letterSpacing: 'normal',
            whiteSpace: 'normal',
            pointerEvents: 'none',
          }}
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  )
}

const OBJECTION_COLORS: Record<string, string> = {
  price: '#EF4444', not_ready: '#F59E0B', competitors: '#3B82F6',
  functionality: '#8B5CF6', quality: '#EC4899', trust: '#10B981', timing: '#6366F1',
}
const OBJECTION_LABELS: Record<string, string> = {
  price: 'Цена', not_ready: 'Не готов сейчас', competitors: 'Конкуренты',
  functionality: 'Функционал', quality: 'Качество', trust: 'Доверие', timing: 'Сроки',
}

const FUNNEL_COLORS = ['#5873EC', '#7890F6', '#97ADFC', '#B4C4FF', '#D2DCFF', '#12A150']

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
      {activeTab === 'sentiment' && <SentimentTab />}
    </div>
  )
}

function ObjectionsTab({ period }: { period: number }) {
  const { data: distribution } = useQuery({
    queryKey: ['objections-dist', period],
    queryFn: () => analyticsApi.getObjectionsDistribution({ period }),
  })

  const { data: resolution } = useQuery({
    queryKey: ['objections-resolution', period],
    queryFn: () => analyticsApi.getObjectionsResolution({ period }),
  })

  const { data: impact } = useQuery({
    queryKey: ['objections-impact', period],
    queryFn: () => analyticsApi.getObjectionsImpact({ period }),
  })

  const donutData = (distribution || []).map((d) => ({
    name: OBJECTION_LABELS[d.type] || d.type,
    value: d.count,
    color: OBJECTION_COLORS[d.type] || '#94A3B8',
  }))
  const maxCount = Math.max(...(distribution || []).map((d) => d.count), 1)
  const baseline = impact?.baseline_conversion ?? 0

  return (
    <div className="fade-in">
      <div className="grid-2">
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

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Возражения по типу</div>
              <div className="card-subtitle">Круговая диаграмма</div>
            </div>
          </div>
          {donutData.length > 0 ? (
            <DonutChartWidget data={donutData} valueSuffix=" шт." />
          ) : (
            <div className="empty-state"><p>Нет данных</p></div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">% отработанных возражений по типу</div>
            <div className="card-subtitle">Сколько возражений из этой категории удалось закрыть</div>
          </div>
        </div>
        {(resolution || []).map((r, i) => (
          <div key={i} className="objection-row">
            <div className="objection-label">{OBJECTION_LABELS[r.type] || r.type}</div>
            <div className="objection-bar-wrap">
              <div className="objection-bar-fill"
                style={{
                  width: `${r.resolution_rate}%`,
                  background: r.resolution_rate >= 70 ? 'var(--success)'
                    : r.resolution_rate >= 40 ? 'var(--warning)' : 'var(--danger)',
                }}
              />
            </div>
            <div className="objection-count" style={{ minWidth: 90, textAlign: 'right' }}>
              {r.resolved}/{r.total} ({r.resolution_rate}%)
            </div>
          </div>
        ))}
        {(!resolution || resolution.length === 0) && (
          <div className="empty-state"><p>Данные появятся после анализа</p></div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Влияние возражения на сделку</div>
            <div className="card-subtitle">
              Конверсия в покупку среди разговоров с этим возражением
              {baseline > 0 && <> · базовая конверсия по периоду: <b>{baseline}%</b></>}
            </div>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Тип возражения</th>
                <th>Разговоров</th>
                <th>Покупка</th>
                <th>Отказ</th>
                <th>Конверсия</th>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    Отклонение от базы
                    <InfoTooltip>
                      На сколько <b>процентных пунктов</b> (п.п.) конверсия по разговорам с этим возражением отличается от базовой по периоду.
                      <br /><br />
                      <span style={{ color: 'var(--success)' }}>+</span> — возражение не мешает,
                      {' '}<span style={{ color: 'var(--danger)' }}>−</span> — режет конверсию.
                    </InfoTooltip>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(impact?.items || []).map((c, i) => {
                const delta = c.conversion - baseline
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{OBJECTION_LABELS[c.type] || c.type}</td>
                    <td>{c.conversations}</td>
                    <td>{c.purchases}</td>
                    <td>{c.refusals}</td>
                    <td style={{
                      fontWeight: 600,
                      color: c.conversion >= 40 ? 'var(--success)' : c.conversion >= 20 ? 'var(--warning)' : 'var(--danger)',
                    }}>{c.conversion}%</td>
                    <td style={{
                      fontWeight: 600,
                      color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)',
                    }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)} п.п.</td>
                  </tr>
                )
              })}
              {(!impact?.items || impact.items.length === 0) && (
                <tr><td colSpan={6}><div className="empty-state"><p>Данные появятся после анализа</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ConversionTab({ period }: { period: number }) {
  const terms = useTerms()
  const { data: funnel } = useQuery({
    queryKey: ['conversion-funnel', period],
    queryFn: () => analyticsApi.getConversionFunnel({ period }),
  })
  const { data: byStore } = useQuery({
    queryKey: ['conversion-store', period],
    queryFn: () => analyticsApi.getConversionByStore({ period }),
  })
  const { data: bySeller } = useQuery({
    queryKey: ['conversion-seller', period],
    queryFn: () => analyticsApi.getConversionBySeller({ period }),
  })
  const { data: outcomes } = useQuery({
    queryKey: ['conversion-outcomes', period],
    queryFn: () => analyticsApi.getConversionOutcomes({ period }),
  })
  const { data: handling } = useQuery({
    queryKey: ['conversion-handling', period],
    queryFn: () => analyticsApi.getObjectionHandlingImpact({ period }),
  })

  const storeChartData = (byStore || []).map((s) => ({
    label: s.store_name,
    value: Math.round(s.conversion_rate * 100),
  }))
  const sellerChartData = (bySeller || []).map((s) => ({
    label: s.seller_name,
    value: Math.round(s.conversion_rate * 100),
  }))
  const outcomeDonut = (outcomes || []).map((o) => ({
    name: outcomeLabel(o.outcome),
    value: o.count,
    color: outcomeColor(o.outcome),
  }))

  const handlingRows: { key: keyof NonNullable<typeof handling>; label: string; tone: string }[] = [
    { key: 'no_objections', label: 'Без возражений', tone: 'var(--text-muted)' },
    { key: 'all_resolved', label: 'Все возражения отработаны', tone: 'var(--success)' },
    { key: 'some_unresolved', label: 'Есть неотработанные', tone: 'var(--danger)' },
  ]

  return (
    <div className="fade-in">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Воронка конверсии</div>
            <div className="card-subtitle">Этапы разговора — % от всех разговоров</div>
          </div>
          {(funnel || []).map((stage, i) => (
            <div key={i} style={{ marginBottom: '12px', opacity: stage.count === 0 ? 0.45 : 1 }}>
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
                  style={{
                    width: `${Math.max(stage.percentage, 2)}%`,
                    background: FUNNEL_COLORS[i] || '#5873EC',
                  }}
                />
              </div>
            </div>
          ))}
          {(!funnel || funnel.length === 0) && (
            <div className="empty-state"><p>Данные появятся после анализа</p></div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Распределение исходов</div>
              <div className="card-subtitle">Чем заканчиваются разговоры</div>
            </div>
          </div>
          {outcomeDonut.length > 0 ? (
            <DonutChartWidget data={outcomeDonut} valueSuffix=" шт." />
          ) : (
            <div className="empty-state"><p>Данные появятся после анализа</p></div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Конверсия {terms.isTelephony ? 'по отделам' : 'по магазинам'}</div>
              <div className="card-subtitle">% покупок от всех разговоров</div>
            </div>
          </div>
          {storeChartData.length > 0 ? (
            <BarChartWidget data={storeChartData} valueLabel="Конверсия" valueSuffix="%" />
          ) : (
            <div className="empty-state"><p>Данные появятся после анализа</p></div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Конверсия по продавцам</div>
              <div className="card-subtitle">Топ-10 — % покупок</div>
            </div>
          </div>
          {sellerChartData.length > 0 ? (
            <BarChartWidget data={sellerChartData} valueLabel="Конверсия" valueSuffix="%" />
          ) : (
            <div className="empty-state"><p>Данные появятся после анализа</p></div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Влияние работы с возражениями</div>
            <div className="card-subtitle">Конверсия в зависимости от того, как продавец отработал возражения</div>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Группа</th>
                <th>Разговоров</th>
                <th>Покупка</th>
                <th>Конверсия</th>
              </tr>
            </thead>
            <tbody>
              {handlingRows.map(({ key, label, tone }) => {
                const bucket = handling?.[key]
                const rate = bucket ? Math.round(bucket.conversion_rate * 100) : 0
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 500, color: tone }}>{label}</td>
                    <td>{bucket?.total ?? 0}</td>
                    <td>{bucket?.purchases ?? 0}</td>
                    <td style={{ fontWeight: 600, color: tone }}>{rate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SentimentTab() {
  return (
    <div className="fade-in">
      <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
        <div className="card-title" style={{ fontSize: '20px', marginBottom: '8px' }}>
          Скоро будет
        </div>
        <div className="card-subtitle" style={{ maxWidth: '480px', margin: '0 auto' }}>
          Анализ тональности разговоров и динамики настроений клиентов появится
          в ближайшем обновлении.
        </div>
      </div>
    </div>
  )
}

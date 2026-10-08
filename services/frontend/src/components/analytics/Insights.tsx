import { useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { pct } from '@/components/ui/Spark'
import type { InsightsData, TrendsData } from '@/types'
import { t, L, locale, plural } from '@/i18n'

/* Блоки «Аналитики» по концепту (ui-concept/analytics.html). */

const dec = (v: number, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const SERIES = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--seq-6)', 'var(--warn)', 'var(--ink-3)']
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
// translate="no" для имён в SVG: в типах React у SVG-элементов этого атрибута нет
const NO_TR = { translate: 'no' } as Record<string, string>

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function useInsights(period: number) {
  return useQuery({ queryKey: ['insights', period], queryFn: () => dashboardApi.getInsights(period) })
}

/* ─── Конверсия по магазинам за 12 недель ───────────────────────────────── */
export function StoreConversion({ trends }: { trends?: TrendsData }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const stores = (trends?.stores || []).map((s, i) => ({
    name: s.store_name || '—',
    color: SERIES[i % SERIES.length],
    conv: s.purchases.map((p, k) => pct(p, s.scorable[k])),
  }))
  const vals = stores.flatMap((s) => s.conv).filter((v): v is number => v != null)
  const lo = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 2) / 5) * 5) : 0
  const hi = vals.length ? Math.min(100, Math.ceil((Math.max(...vals) + 2) / 5) * 5) : 100
  const H = 230, top = 8, bottom = 22, right = 120
  const n = trends?.weeks.length || 12
  const X = (i: number) => 34 + (i / Math.max(1, n - 1)) * (w - 34 - right)
  const Y = (v: number) => top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - top - bottom)
  const grid = [lo, (lo + hi) / 2, hi]
  const label = (i: number) => new Date(`${trends!.weeks[i]}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  // Подписи на конце линий не должны налезать друг на друга
  const ends = stores.map((s) => {
    const idx = s.conv.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()
    return idx != null ? { ...s, i: idx, v: s.conv[idx]!, y: Y(s.conv[idx]!) } : null
  }).filter(Boolean).sort((a, b) => a!.y - b!.y) as Array<{ name: string; color: string; i: number; v: number; y: number }>
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 26) ends[k].y = ends[k - 1].y + 26

  return (
    <section className="panel" aria-labelledby="sc-title">
      <div className="panel-head">
        <div>
          <h2 id="sc-title" className="panel-title">{t('Конверсия в покупку по магазинам')}</h2>
          <div className="panel-sub">{t('Доля разговоров, которые закончились покупкой, по неделям')}</div>
        </div>
        <span className="legend">
          {stores.map((s) => <span key={s.name} className="legend-item"><span className="key-bar" style={{ background: s.color, height: 2 }} /><span translate="no">{s.name}</span></span>)}
        </span>
      </div>
      <div className="panel-body">
        <div ref={ref} className="an-chart" style={{ height: H }}>
          {w > 0 && trends && (
            <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={L('Конверсия магазинов по неделям', 'Store conversion by week')}>
              {grid.map((v) => (
                <g key={v}><line x1={34} x2={w - right} y1={Y(v)} y2={Y(v)} className="lc-grid" /><text x={0} y={Y(v) + 4} className="lc-lbl">{Math.round(v)} %</text></g>
              ))}
              {stores.map((s) => {
                const d = s.conv.map((v, i) => (v != null ? [X(i), Y(v)] : null)).filter(Boolean)
                  .map((p, i) => `${i ? 'L' : 'M'}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join('')
                return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              })}
              {ends.map((e) => (
                <g key={e.name}>
                  <circle cx={X(e.i)} cy={Y(e.v)} r={3.5} fill={e.color} stroke="var(--panel)" strokeWidth={2} />
                  <text x={w - right + 10} y={e.y + 4} className="lc-endlbl">{dec(e.v)} %</text>
                  <text x={w - right + 10} y={e.y + 16} className="lc-lbl" {...NO_TR}>{e.name.length > 18 ? `${e.name.slice(0, 17)}…` : e.name}</text>
                </g>
              ))}
              {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
                <text key={i} x={X(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="lc-lbl">{label(i)}</text>
              ))}
            </svg>
          )}
        </div>
      </div>
    </section>
  )
}

/* ─── Что влияет на покупку ─────────────────────────────────────────────── */
export function Drivers({ data }: { data?: InsightsData }) {
  const items = data?.drivers || []
  return (
    <section className="panel" aria-labelledby="dr-title">
      <div className="panel-head">
        <div>
          <h2 id="dr-title" className="panel-title">{t('Что влияет на покупку')}</h2>
          <div className="panel-sub">{t('Конверсия, когда условие выполнено, и когда нет')}</div>
        </div>
      </div>
      <div className="panel-body">
        {items.length === 0 && <p className="muted">{t('Мало разговоров, чтобы сравнивать.')}</p>}
        {items.map((d) => (
          <div key={d.key} className="drv">
            <div className="drv-label" translate={d.key.startsWith('step:') ? 'no' : undefined}>{d.key.startsWith('step:') ? L(d.label, `Stage “${d.key.slice(5)}” done`) : t(d.label)}</div>
            <div className="drv-row">
              <span className="db-track" role="img" aria-label={L(`${dec(d.with)} % против ${dec(d.without)} %`, `${d.with.toFixed(1)}% vs ${d.without.toFixed(1)}%`)}>
                <span className="db-line" style={{ left: `${Math.min(d.with, d.without)}%`, width: `${Math.abs(d.with - d.without)}%` }} />
                <span className="db-dot is-team" style={{ left: `${d.without}%` }} />
                <span className="db-dot is-me" style={{ left: `${d.with}%` }} />
              </span>
              <span className="drv-val"><b>{dec(d.with)}&nbsp;%</b> <span className="muted">{L(`против ${dec(d.without)} %`, `vs ${d.without.toFixed(1)}%`)}</span></span>
            </div>
            <div className="drv-note">
              <span className={d.diff >= 0 ? 'is-good' : 'is-bad'}>{d.diff >= 0 ? '+' : '−'}{dec(Math.abs(d.diff))}&nbsp;{L('п. п.', 'pp')}</span>
              {' · '}{L(`в ${d.share} % разговоров`, `in ${d.share}% of conversations`)}
            </div>
          </div>
        ))}
      </div>
      <div className="panel-foot">
        <span className="legend">
          <span className="legend-item"><span className="db-key is-me" />{t('условие выполнено')}</span>
          <span className="legend-item"><span className="db-key is-team" />{t('не выполнено')}</span>
        </span>
      </div>
    </section>
  )
}

/* ─── Где уходят покупатели: сколько разговоров прошли этапы по порядку ──── */
export function Funnel({ data }: { data?: InsightsData }) {
  const f = data?.funnel
  return (
    <section className="panel" aria-labelledby="fn-title">
      <div className="panel-head">
        <div>
          <h2 id="fn-title" className="panel-title">{t('Где уходят покупатели')}</h2>
          <div className="panel-sub">{t('Сколько разговоров прошли этапы скрипта по порядку (балл этапа 50+)')}</div>
        </div>
      </div>
      <div className="panel-body">
        {!f ? <p className="muted">{t('За период нет разговоров, оценённых по скрипту.')}</p> : (
          <>
            <FunnelRow label={t('Разговор начат')} count={f.total} total={f.total} />
            {f.steps.map((s) => (
              <div key={s.step}>
                {s.lost > 0 && (
                  <div className="fn-drop">
                    <span className="fn-lost">−{s.lost}</span>
                    <span>{L(`Не выполнен этап «${s.step}»`, `Stage “${s.step}” not done`)}{s.hint ? <span className="muted" translate="no"> — {s.hint}</span> : null}</span>
                  </div>
                )}
                <FunnelRow label={s.step} count={s.count} total={f.total} translate />
              </div>
            ))}
            <FunnelRow label={t('Покупка')} count={f.purchases} total={f.total} won
              note={L(`из них после всех этапов — ${f.purchases_after_all_steps}`, `${f.purchases_after_all_steps} after all stages`)} />
          </>
        )}
      </div>
    </section>
  )
}

function FunnelRow({ label, count, total, won, note, translate }: { label: string; count: number; total: number; won?: boolean; note?: string; translate?: boolean }) {
  return (
    <div className="fn-row">
      <span className="fn-label" translate={translate ? 'no' : undefined}>{label}{note && <span className="fn-note">{note}</span>}</span>
      <span className="fn-bar"><span className={won ? 'is-won' : ''} style={{ width: `${total ? Math.max(1, (count / total) * 100) : 0}%` }} /></span>
      <b className="fn-n">{count.toLocaleString(locale)}</b>
    </div>
  )
}

/* ─── Нагрузка по часам ─────────────────────────────────────────────────── */
export function HourlyLoad({ data }: { data?: InsightsData }) {
  const cells = data?.hourly || []
  const hours = cells.map((c) => c.hour)
  const h0 = Math.min(10, ...hours)
  const h1 = Math.max(21, ...hours)
  const cols = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
  const at = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c]))
  const max = Math.max(1, ...cells.map((c) => c.per_week))
  const totalN = cells.reduce((a, c) => a + c.count, 0)
  const avgConv = totalN ? cells.reduce((a, c) => a + (c.conversion ?? 0) * c.count, 0) / totalN : 0
  const weak = (c: { count: number; conversion: number | null }) => c.count >= 3 && c.conversion != null && c.conversion < avgConv - 10
  const band = (v: number) => Math.min(6, 1 + Math.floor((v / max) * 5.999))
  const busiest = [...cells].sort((a, b) => b.per_week - a.per_week)[0]
  const fmt = (v: number) => (v >= 10 ? Math.round(v).toString() : dec(v))
  return (
    <section className="panel" aria-labelledby="hr-title">
      <div className="panel-head">
        <div>
          <h2 id="hr-title" className="panel-title">{t('Нагрузка по часам')}</h2>
          <div className="panel-sub">{L(`Разговоров в час, в среднем за неделю · красная рамка — конверсия ниже ${Math.max(0, Math.round(avgConv - 10))} %`, `Conversations per hour, weekly average · red frame — conversion below ${Math.max(0, Math.round(avgConv - 10))}%`)}</div>
        </div>
      </div>
      <div className="panel-body">
        {cells.length === 0 ? <p className="muted">{t('Нет данных за период')}</p> : (
          <>
            <div className="heat-wrap">
              <table className="heat hourly">
                <thead><tr><th className="row-h" scope="col"><span className="sr-only">{t('День')}</span></th>{cols.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>
                  {DAYS.map((d, i) => (
                    <tr key={d}>
                      <td className="name">{t(d)}</td>
                      {cols.map((h) => {
                        const c = at.get(`${i + 1}:${h}`)
                        if (!c) return <td key={h} className="cell is-empty" />
                        return (
                          <td key={h} className={`cell b${band(c.per_week)} ${weak(c) ? 'is-crit' : ''}`} tabIndex={0}
                            title={`${t(d)}, ${h}:00–${h + 1}:00 · ${c.count} ${plural(c.count, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}${c.conversion != null ? L(` · конверсия ${Math.round(c.conversion)} %`, ` · conversion ${Math.round(c.conversion)}%`) : ''}`}>
                            {fmt(c.per_week)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {busiest && (
              <div className={`an-note ${weak(busiest) ? 'is-crit' : ''}`}>
                {L(
                  `Больше всего разговоров — ${DAYS[busiest.dow - 1].toLowerCase()}, ${busiest.hour}:00–${busiest.hour + 1}:00: ${fmt(busiest.per_week)} в неделю${busiest.conversion != null ? `, конверсия ${Math.round(busiest.conversion)} % при средней ${Math.round(avgConv)} %` : ''}.`,
                  `Busiest hour: ${t(DAYS[busiest.dow - 1])}, ${busiest.hour}:00–${busiest.hour + 1}:00 with ${fmt(busiest.per_week)} a week${busiest.conversion != null ? `, conversion ${Math.round(busiest.conversion)}% vs ${Math.round(avgConv)}% on average` : ''}.`,
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ─── Что отвечают на «дорого» ──────────────────────────────────────────── */
export function PriceAnswers({ data }: { data?: InsightsData }) {
  const items = (data?.price_answers || []).filter((a) => a.conversion != null)
  const base = (() => {
    const n = items.reduce((a, x) => a + x.conversations, 0)
    return n ? items.reduce((a, x) => a + (x.conversion ?? 0) * x.conversations, 0) / n : 0
  })()
  const worst = items.filter((a) => a.label !== 'Нет ответа' && a.conversations >= 2).sort((a, b) => (a.conversion ?? 0) - (b.conversion ?? 0))[0]
  return (
    <section className="panel" aria-labelledby="pa-title">
      <div className="panel-head">
        <div>
          <h2 id="pa-title" className="panel-title">{t('Что отвечают на «дорого»')}</h2>
          <div className="panel-sub">{t('Конверсия после ответа продавца. Ответы сгруппированы по ключевым словам из разбора ИИ')}</div>
        </div>
      </div>
      <div className="panel-body">
        {items.length === 0 && <p className="muted">{t('Возражений о цене за период нет.')}</p>}
        {items.map((a) => (
          <div key={a.label} className="pa-row">
            <span>
              <span className="pa-label">{t(a.label)}</span>
              <span className="muted pa-n">{a.times} {plural(a.times, ['раз', 'раза', 'раз'], ['time', 'times'])}</span>
            </span>
            <span className="pa-bar"><span className={(a.conversion ?? 0) < base ? 'is-low' : ''} style={{ width: `${Math.max(2, a.conversion ?? 0)}%` }} /></span>
            <b className="pa-val">{dec(a.conversion ?? 0)}&nbsp;%</b>
          </div>
        ))}
      </div>
      {worst && (worst.conversion ?? 0) < base && (
        <div className="panel-foot">
          <span>{L(`«${worst.label}» работает хуже всего: ${dec(worst.conversion ?? 0)} % при средней ${dec(base)} %.`, `“${t(worst.label)}” works worst: ${(worst.conversion ?? 0).toFixed(1)}% vs ${base.toFixed(1)}% on average.`)}</span>
        </div>
      )}
    </section>
  )
}

/* ─── Кто больше говорит — меньше продаёт ───────────────────────────────── */
export function TalkScatter({ data }: { data?: InsightsData }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const pts = (data?.talk || []).filter((p) => p.conversion != null && p.conversations >= 2)
  const H = 260, left = 36, bottom = 26, top = 10, right = 12
  const xs = pts.map((p) => p.talk_share)
  const ys = pts.map((p) => p.conversion as number)
  const x0 = Math.min(40, Math.floor((Math.min(...xs, 50) - 5) / 5) * 5)
  const x1 = Math.max(75, Math.ceil((Math.max(...xs, 60) + 5) / 5) * 5)
  const y0 = Math.max(0, Math.floor((Math.min(...ys, 50) - 5) / 10) * 10)
  const y1 = Math.min(100, Math.ceil((Math.max(...ys, 0) + 5) / 10) * 10)
  const X = (v: number) => left + ((v - x0) / Math.max(1, x1 - x0)) * (w - left - right)
  const Y = (v: number) => top + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - top - bottom)
  // Линия тренда — наименьшие квадраты
  const trend = (() => {
    if (pts.length < 3) return null
    const n = pts.length
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
    if (!sxx) return null
    const k = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx
    return { k, b: my - k * mx }
  })()
  const short = (name: string | null) => {
    const [f, l] = (name || '').split(/\s+/)
    return l ? `${f} ${l[0]}.` : f || '—'
  }
  return (
    <section className="panel" aria-labelledby="ts-title">
      <div className="panel-head">
        <div>
          <h2 id="ts-title" className="panel-title">{t('Кто больше говорит — меньше продаёт')}</h2>
          <div className="panel-sub">{t('Доля речи продавца и его конверсия за период')}</div>
        </div>
      </div>
      <div className="panel-body">
        <div ref={ref} className="an-chart" style={{ height: H }}>
          {w > 0 && pts.length > 0 && (
            <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={L('Доля речи и конверсия по продавцам', 'Talk share and conversion by seller')}>
              <rect x={X(Math.max(40, x0))} y={top} width={X(Math.min(60, x1)) - X(Math.max(40, x0))} height={H - top - bottom} className="ts-norm" />
              <text x={X(Math.max(40, x0)) + 6} y={top + 14} className="ts-norm-lbl">{t('Норма 40–60 %')}</text>
              {[y0, (y0 + y1) / 2, y1].map((v) => (
                <g key={v}><line x1={left} x2={w - right} y1={Y(v)} y2={Y(v)} className="lc-grid" /><text x={0} y={Y(v) + 4} className="lc-lbl">{Math.round(v)} %</text></g>
              ))}
              {[x0, (x0 + x1) / 2, x1].map((v) => (
                <text key={v} x={X(v)} y={H - 6} textAnchor="middle" className="lc-lbl">{Math.round(v)} %</text>
              ))}
              {trend && <line x1={X(x0)} y1={Y(Math.max(y0, Math.min(y1, trend.k * x0 + trend.b)))} x2={X(x1)} y2={Y(Math.max(y0, Math.min(y1, trend.k * x1 + trend.b)))} className="ts-trend" />}
              {pts.map((p) => (
                <g key={p.seller_id}>
                  <title>{`${p.name}: ${L('говорит', 'talks')} ${Math.round(p.talk_share)} %, ${L('конверсия', 'conversion')} ${Math.round(p.conversion!)} %, ${p.conversations} ${plural(p.conversations, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}`}</title>
                  <circle cx={X(p.talk_share)} cy={Y(p.conversion!)} r={4.5} className="ts-dot" />
                  <text x={X(p.talk_share) + 8} y={Y(p.conversion!) + 4} className="ts-lbl" {...NO_TR}>{short(p.name)}</text>
                </g>
              ))}
            </svg>
          )}
          {pts.length === 0 && <p className="muted">{t('Мало разговоров с разметкой речи.')}</p>}
        </div>
        <div className="an-axis-note">{t('доля речи продавца →')}</div>
      </div>
    </section>
  )
}

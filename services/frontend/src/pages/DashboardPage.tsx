import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, TriangleAlert, OctagonAlert, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { analyticsApi } from '@/api/analytics'
import { outcomeColor, outcomeLabel } from '@/lib/outcomes'
import { initials } from '@/lib/format'
import { Meter } from '@/components/ui/Meter'
import { Spark, Delta, pct, lastAndDelta } from '@/components/ui/Spark'
import { Pulse } from '@/components/dashboard/Pulse'
import { ReviewQueue } from '@/components/dashboard/ReviewQueue'
import { useObjectionTypeLabel } from '@/components/conversation/shared'
import type { TrendsData } from '@/types'
import { t, L, locale, plural } from '@/i18n'

/* «Обзор» по концепту (ui-concept/dashboard.html). Период из шапки действует на очередь,
   показатели, исходы, нарушения, этапы и возражения; пульс — всегда последняя неделя,
   ряды и движение в команде — 12 недель. Блоков о бейджах нет: телеметрии бейджей
   и док-станций пока нет. */

interface OutletContext { period: number; setPeriod: (p: number) => void }

const dec = (v: number, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const PP = ' п. п.'

export function DashboardPage() {
  const { period, setPeriod } = useOutletContext<OutletContext>()
  const navigate = useNavigate()

  const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: () => dashboardApi.getTrends({ weeks: 12 }) })

  return (
    <div className="dash">
      <Pulse onOpenAttention={() => { setPeriod(7); navigate('/conversations?view=attention') }} />

      <div className="dash-a">
        <ReviewQueue period={period} />
        <div className="stack">
          <Kpis period={period} trends={trends} />
          <Outcomes period={period} />
          <Violations period={period} />
        </div>
      </div>

      <div className="dash-b">
        <Stores trends={trends} />
        <Objections period={period} />
      </div>

      <div className="dash-c">
        <Losses period={period} />
        <Movers period={period} trends={trends} />
      </div>
    </div>
  )
}

/* ─── Показатели: значение за период, изменение к прошлому такому же периоду, ряд за 12 недель ── */
function Kpis({ period, trends }: { period: number; trends?: TrendsData }) {
  const { data: cur } = useQuery({ queryKey: ['dashboard-overview', period], queryFn: () => dashboardApi.getOverview({ period }) })
  const { data: prev } = useQuery({ queryKey: ['dashboard-overview', period, 'prev'], queryFn: () => dashboardApi.getOverview({ period, previous: true }) })
  const net = trends?.network
  const weekly = (num: number[], den: number[]) => num.map((n, i) => pct(n, den[i]))

  const conv = cur ? cur.conversion_rate * 100 : null
  const convPrev = prev && prev.total_conversations ? prev.conversion_rate * 100 : null
  const score = cur && cur.total_conversations ? cur.avg_score : null
  const scorePrev = prev && prev.total_conversations ? prev.avg_score : null
  const sell = cur ? pct(cur.sell_done ?? 0, cur.sell_need ?? 0) : null
  const sellPrev = prev ? pct(prev.sell_done ?? 0, prev.sell_need ?? 0) : null
  const obj = cur ? pct(cur.objections_resolved ?? 0, cur.objections_total ?? 0) : null
  const objPrev = prev ? pct(prev.objections_resolved ?? 0, prev.objections_total ?? 0) : null
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null)

  const kpis = [
    {
      label: 'Конверсия в покупку', value: conv != null ? dec(conv) : '—', unit: conv != null ? '%' : '',
      delta: <Delta value={diff(conv, convPrev)} unit={PP} digits={1} />,
      spark: net ? weekly(net.purchases, net.scorable) : [],
      note: cur ? L(`${cur.purchases ?? 0} из ${cur.total_conversations}`, `${cur.purchases ?? 0} of ${cur.total_conversations}`) : '',
    },
    {
      label: 'Балл по скрипту', value: score != null ? String(Math.round(score)) : '—', unit: '',
      delta: <Delta value={diff(score, scorePrev)} />,
      spark: net?.avg_score || [],
      note: t('из 100'),
    },
    {
      label: 'Допродажа предложена', value: sell != null ? String(Math.round(sell)) : '—', unit: sell != null ? '%' : '',
      delta: <Delta value={diff(sell, sellPrev)} unit={PP} />,
      spark: net ? weekly(net.sell_done, net.sell_need) : [],
      note: cur?.sell_need ? L(`${cur.sell_need} ${plural(cur.sell_need, ['разговор', 'разговора', 'разговоров'], ['', ''])} с правилом`, `${cur.sell_need} with a rule`) : t('правило не срабатывало'),
    },
    {
      label: 'Возражения отработаны', value: obj != null ? String(Math.round(obj)) : '—', unit: obj != null ? '%' : '',
      delta: <Delta value={diff(obj, objPrev)} unit={PP} />,
      spark: net ? weekly(net.objections_resolved, net.objections) : [],
      note: cur ? L(`${cur.objections_total ?? 0} ${plural(cur.objections_total ?? 0, ['возражение', 'возражения', 'возражений'], ['', ''])}`, `${cur.objections_total ?? 0} objections`) : '',
    },
  ]
  return (
    <div className="kpi-grid">
      {kpis.map((k) => (
        <section key={k.label} className="panel" aria-label={t(k.label)}>
          <div className="kpi">
            <div className="kpi-label">{t(k.label)}</div>
            <div className="kpi-row">
              <div className="kpi-value">{k.value}{k.unit && <small>&nbsp;{k.unit}</small>}</div>
              <Spark values={k.spark} label={L('Динамика за 12 недель', 'Trend over 12 weeks')} />
            </div>
            <div className="kpi-foot">{k.delta}<span>{k.note}</span></div>
          </div>
        </section>
      ))}
    </div>
  )
}

/* ─── Чем заканчиваются разговоры ─────────────────────────────────────────── */
function Outcomes({ period }: { period: number }) {
  const { data } = useQuery({ queryKey: ['dashboard-overview', period], queryFn: () => dashboardApi.getOverview({ period }) })
  const outs = (data?.outcomes || []).map((o) => ({ key: o.outcome || 'unknown', n: o.count }))
  const total = outs.reduce((a, o) => a + o.n, 0)
  return (
    <section className="panel outcomes" aria-labelledby="out-title">
      <div className="spread">
        <h2 id="out-title" className="panel-title">{t('Чем заканчиваются разговоры')}</h2>
        <span className="muted" style={{ fontSize: 12.5 }}>{total.toLocaleString(locale)} {plural(total, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}</span>
      </div>
      {total > 0 ? (
        <>
          <div className="stackbar" role="img" aria-label={outs.map((o) => `${t(outcomeLabel(o.key))} ${Math.round((o.n / total) * 100)}%`).join(', ')}>
            {outs.map((o) => (
              <span key={o.key} style={{ width: `${(o.n / total) * 100}%`, background: outcomeColor(o.key) }} title={`${t(outcomeLabel(o.key))}: ${o.n}`} />
            ))}
          </div>
          <div className="ob-grid">
            {outs.map((o) => (
              <div key={o.key} className="ob-item">
                <span className="key-bar" style={{ background: outcomeColor(o.key) }} />
                <span className="ellipsis">{t(outcomeLabel(o.key))}</span>
                <b>{Math.round((o.n / total) * 100)}&nbsp;%<span className="muted">{o.n}</span></b>
              </div>
            ))}
          </div>
        </>
      ) : <p className="muted" style={{ marginTop: 10 }}>{t('Нет данных за период')}</p>}
    </section>
  )
}

/* ─── Нарушения по правилам ──────────────────────────────────────────────── */
function Violations({ period }: { period: number }) {
  const { data } = useQuery({ queryKey: ['violations-by-rule', period], queryFn: () => dashboardApi.getViolationsByRule({ period }) })
  const items = data?.items || []
  return (
    <section className="panel" aria-labelledby="vio-title">
      <div className="panel-head">
        <div>
          <h2 id="vio-title" className="panel-title">{t('Нарушения за период')}</h2>
          <div className="panel-sub">
            {data ? L(`${data.conversations} ${plural(data.conversations, ['разговор', 'разговора', 'разговоров'], ['', ''])} · правила общения с покупателями`, `${data.conversations} conversations · customer communication rules`) : ''}
          </div>
        </div>
        <Link className="link" to="/compliance">{t('Комплаенс')}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <div className="panel-body" style={{ paddingTop: 8 }}>
        {items.length === 0 && <p className="muted">{t('Нарушений за период нет.')}</p>}
        {items.slice(0, 5).map((v) => {
          const d = v.count - v.prev
          return (
            <div key={v.rule_id} className="vio">
              <span className={`q-sev vio-sev ${v.severity === 'high' ? 'is-crit' : 'is-warn'}`} aria-hidden="true">
                {v.severity === 'high' ? <OctagonAlert size={15} /> : <TriangleAlert size={15} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="vio-rule" translate="no">{v.rule_title}</div>
                <div className="vio-ops">
                  {v.sellers.map((n) => <span key={n} className="avatar" title={n} translate="no">{initials(n)}</span>)}
                  <span className="ellipsis" translate="no">{v.sellers.join(', ')}{v.sellers_count > v.sellers.length ? L(` и ещё ${v.sellers_count - v.sellers.length}`, ` and ${v.sellers_count - v.sellers.length} more`) : ''}</span>
                </div>
              </div>
              <div className="vio-num">
                <span className="display">{v.count}</span>
                {d > 0 ? <span className="delta is-bad"><ArrowUpRight aria-hidden="true" />+{d}</span>
                  : d < 0 ? <span className="delta is-good"><ArrowDownRight aria-hidden="true" />−{-d}</span>
                  : <span className="delta is-flat">{t('как в прошлом периоде')}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ─── Магазины: конверсия и балл за 12 недель ────────────────────────────── */
function Stores({ trends }: { trends?: TrendsData }) {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const rows = (trends?.stores || []).map((s) => {
    const conv = s.purchases.map((p, i) => pct(p, s.scorable[i]))
    const { delta } = lastAndDelta(conv)
    const scored = s.avg_score.map((v, i) => (v != null ? [v, s.scorable[i]] : null)).filter(Boolean) as Array<[number, number]>
    const w = sum(scored.map((x) => x[1]))
    return {
      ...s,
      conv, delta,
      total: sum(s.total),
      conversion: pct(sum(s.purchases), sum(s.scorable)),
      score: w ? sum(scored.map(([v, n]) => v * n)) / w : null,
    }
  }).sort((a, b) => (b.conversion ?? -1) - (a.conversion ?? -1))

  return (
    <section className="panel" aria-labelledby="st-title">
      <div className="panel-head">
        <div>
          <h2 id="st-title" className="panel-title">{t('Магазины')}</h2>
          <div className="panel-sub">{t('Конверсия и балл за 12 недель, изменение к предыдущей неделе с разговорами')}</div>
        </div>
        <Link className="link" to="/team">{t('Команда')}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <div className="panel-body" style={{ paddingTop: 6 }}>
        <div className="table-wrap">
          <table className="table st-table">
            <thead><tr>
              <th scope="col">{t('Магазин')}</th>
              <th scope="col">{t('Конверсия')}</th>
              <th scope="col">{t('Балл')}</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={3} className="muted">{t('Нет данных за 12 недель')}</td></tr>}
              {rows.map((s) => (
                <tr key={s.store_id}>
                  <td className="st-name">
                    <b translate="no">{s.store_name || '—'}</b>
                    <span>{s.total} {plural(s.total, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}</span>
                  </td>
                  <td>
                    <div className="st-conv">
                      <div>
                        <span className="display">{s.conversion != null ? dec(s.conversion) : '—'}<small>&nbsp;%</small></span>
                        <Delta value={s.delta} unit={PP} digits={1} />
                      </div>
                      <Spark values={s.conv} width={60} height={26} />
                    </div>
                  </td>
                  <td><Meter score={s.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ─── Где теряем баллы ───────────────────────────────────────────────────── */
function Losses({ period }: { period: number }) {
  const { data } = useQuery({ queryKey: ['step-losses', period], queryFn: () => dashboardApi.getStepLosses({ period }) })
  const steps = [...(data?.steps || [])].sort((a, b) => b.weak_share - a.weak_share)
  const maxShare = Math.max(1, ...steps.map((s) => s.weak_share))
  return (
    <section className="panel" aria-labelledby="loss-title">
      <div className="panel-head">
        <div>
          <h2 id="loss-title" className="panel-title">{t('Где теряем баллы')}</h2>
          <div className="panel-sub">
            {data?.script ? <><span translate="no">{data.script.name}</span> · {t('этапы, пропущенные или слабые (балл ниже 50)')}</> : t('Этапы скрипта, пропущенные или слабые (балл ниже 50)')}
          </div>
        </div>
        <Link className="link" to="/scripts">{t('Скрипт')}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <div className="panel-body">
        {steps.length === 0 && <p className="muted">{t('За период нет разговоров, оценённых по скрипту.')}</p>}
        {steps.map((s) => (
          <div key={s.name} className="loss">
            <div className="loss-name">
              <span className="ellipsis" translate="no">{s.name}</span>
              {s.weight != null && <span className="tag tag-neutral">{L(`вес ${dec(s.weight, 2)}`, `weight ${s.weight.toFixed(2)}`)}</span>}
              {!s.required && <span className="tag tag-neutral">{t('необязательный')}</span>}
            </div>
            <div className="loss-val">{Math.round(s.weak_share)}<small>&nbsp;%</small></div>
            <div className="loss-bar" role="img" aria-label={L(`Пропущен или слабый в ${Math.round(s.weak_share)} % разговоров`, `Missed or weak in ${Math.round(s.weak_share)}% of conversations`)}>
              <span style={{ width: `${(s.weak_share / maxShare) * 100}%` }} />
            </div>
            {s.hint && <div className="loss-hint" translate="no">{s.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─── Возражения: доля разговоров, отработка, конверсия к средней ─────────── */
function Objections({ period }: { period: number }) {
  const objectionLabel = useObjectionTypeLabel()
  const { data: impact } = useQuery({ queryKey: ['objections-impact', period], queryFn: () => analyticsApi.getObjectionsImpact({ period }) })
  const { data: resolution } = useQuery({ queryKey: ['objections-resolution', period], queryFn: () => analyticsApi.getObjectionsResolution({ period }) })
  const { data: overview } = useQuery({ queryKey: ['dashboard-overview', period], queryFn: () => dashboardApi.getOverview({ period }) })
  const base = impact?.baseline_conversion ?? 0
  const total = overview?.total_conversations || 0
  const items = (impact?.items || []).map((o: any) => ({
    ...o,
    resolved: (resolution || []).find((r: any) => r.type === o.type)?.resolution_rate ?? null,
  }))
  const maxShare = Math.max(1, ...items.map((o: any) => o.conversations))
  return (
    <section className="panel" aria-labelledby="obj-title">
      <div className="panel-head">
        <div>
          <h2 id="obj-title" className="panel-title">{t('Возражения покупателей')}</h2>
          <div className="panel-sub">{L(`Как часто звучат и что делают с конверсией (в среднем ${dec(base)} %)`, `How often they come up and what they do to conversion (average ${base.toFixed(1)}%)`)}</div>
        </div>
      </div>
      <div className="panel-body" style={{ paddingTop: 6 }}>
        {items.length === 0 ? <p className="muted">{t('Возражений за период нет.')}</p> : (
          <div className="table-wrap">
            <table className="table obj-table">
              <thead><tr>
                <th scope="col">{t('Возражение')}</th>
                <th scope="col">{t('Доля разговоров')}</th>
                <th scope="col" className="t-right col-hide-s">{t('Отработано')}</th>
                <th scope="col" className="t-right">{t('Конверсия')}</th>
              </tr></thead>
              <tbody>
                {items.map((o: any) => {
                  const share = total ? (o.conversations / total) * 100 : 0
                  const diff = o.conversion - base
                  const len = Math.min(46, (Math.abs(diff) / 20) * 46)
                  return (
                    <tr key={o.type}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{t(objectionLabel(o.type))}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{o.conversations} {plural(o.conversations, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}</div>
                      </td>
                      <td>
                        <div className="share">
                          <span className="share-bar"><span style={{ width: `${(o.conversations / maxShare) * 100}%` }} /></span>
                          <span className="num">{Math.round(share)}&nbsp;%</span>
                        </div>
                      </td>
                      <td className="t-right t-num col-hide-s">{o.resolved != null ? `${Math.round(o.resolved)} %` : '—'}</td>
                      <td>
                        <div className="dv" role="img" aria-label={L(`Конверсия ${dec(o.conversion)} %, ${diff >= 0 ? 'выше' : 'ниже'} средней на ${dec(Math.abs(diff))} п. п.`, `Conversion ${o.conversion.toFixed(1)}%, ${Math.abs(diff).toFixed(1)} pp ${diff >= 0 ? 'above' : 'below'} average`)}>
                          <span className="dv-track" aria-hidden="true"><span className={`dv-bar ${diff >= 0 ? 'is-up' : 'is-down'}`} style={{ width: len }} /></span>
                          <span className="dv-val">{dec(o.conversion)}&nbsp;%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

/* ─── Кто растёт, кто проседает: балл по неделям ─────────────────────────── */
function Movers({ period, trends }: { period: number; trends?: TrendsData }) {
  const { data: sellers } = useQuery({ queryKey: ['sellers-for-dashboard', period], queryFn: () => dashboardApi.getSellers({ period }) })
  const weak = new Map((sellers || []).map((s: any) => [s.id, s.weakest_step]))
  const withDelta = (trends?.sellers || [])
    .map((s) => ({ ...s, ...lastAndDelta(s.avg_score) }))
    .filter((s) => s.delta != null && Math.round(s.delta) !== 0)
  const up = [...withDelta].filter((s) => s.delta! > 0).sort((a, b) => b.delta! - a.delta!).slice(0, 3)
  const down = [...withDelta].filter((s) => s.delta! < 0).sort((a, b) => a.delta! - b.delta!).slice(0, 3)
  const col = (title: string, icon: JSX.Element, list: typeof withDelta, isDown: boolean) => (
    <div className="movers-col">
      <div className="movers-h">{icon}{t(title)}</div>
      {list.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>{t('Нет изменений за последние недели')}</div>}
      {list.map((s) => {
        const w = weak.get(s.seller_id)
        return (
          <Link key={s.seller_id} className="mv" to={`/team?seller=${s.seller_id}`}>
            <span className="person">
              <span className="avatar" aria-hidden="true" translate="no">{initials(s.seller_name) || '?'}</span>
              <span style={{ minWidth: 0 }}>
                <span className="person-name" translate="no">{s.seller_name || '—'}</span>
                <span className="person-sub">
                  {isDown && w ? <>{t('Слабое место:')} <span translate="no">{String(w).toLowerCase()}</span></> : <span translate="no">{s.store_name}</span>}
                </span>
              </span>
            </span>
            <Spark values={s.avg_score} width={64} height={26} />
            <Delta value={s.delta} />
          </Link>
        )
      })}
    </div>
  )
  return (
    <section className="panel" aria-labelledby="mv-title">
      <div className="panel-head">
        <div>
          <h2 id="mv-title" className="panel-title">{t('Кто растёт, кто проседает')}</h2>
          <div className="panel-sub">{t('Балл по скрипту за 12 недель, изменение к предыдущей неделе с разговорами')}</div>
        </div>
        <Link className="link" to="/team">{t('Команда')}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <div className="movers is-stacked">
        {col('Растут', <TrendingUp size={14} aria-hidden="true" />, up, false)}
        {col('Проседают', <TrendingDown size={14} aria-hidden="true" />, down, true)}
      </div>
    </section>
  )
}

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareQuote } from 'lucide-react'
import { upsellsApi, type UpsellOverview } from '@/api/upsells'
import { analyticsApi } from '@/api/analytics'
import { useTerms } from '@/lib/terms'
import { initials } from '@/lib/format'
import { useObjectionTypeLabel } from '@/components/conversation/shared'
import { MoneyTile, Hint, MetricTile, PlanChip, METRIC, W, bestTechnique, num, ordersOf, offersOf, pct, pp, rub, techniqueLabel, times } from '@/components/upsells/metrics'
import { L, t, locale, plural } from '@/i18n'
import '@/styles/upsells.css'

/* Аналитика допродаж за период: что происходит с предложениями в сети, где и у кого проседает,
   какие приёмы работают. Для кофеен это и есть раздел «Аналитика»; в рознице — вкладка «Итоги»
   на экране «Допродажи». Данные — разбор предложений (dashboard /upsell/overview). */

const DAY_MS = 86_400_000
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDay = (iso: string) => new Date(`${iso}T00:00:00`)
const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => parseDay(iso).toLocaleDateString(locale, opts)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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

type Seller = UpsellOverview['sellers'][number]

/** Сводка группирует по «бариста + точка»: строки одного человека из разных точек склеиваем */
function mergeSellers(rows: Seller[]): Seller[] {
  const by = new Map<string, Seller>()
  for (const r of rows) {
    const m = by.get(r.seller_id)
    if (!m) { by.set(r.seller_id, { ...r }); continue }
    m.orders += r.orders; m.with_offer += r.with_offer; m.offers += r.offers; m.accepted += r.accepted; m.shifts += r.shifts
  }
  return [...by.values()].map((m) => {
    const rate = m.orders ? m.with_offer / m.orders : null
    return { ...m, attempt_rate: rate, acceptance_rate: m.offers ? m.accepted / m.offers : null,
      accepted_per_shift: m.shifts ? Math.round((m.accepted / m.shifts) * 10) / 10 : null,
      plan_met: rate != null && rate >= m.attempt_rate_target }
  }).sort((a, b) => (b.attempt_rate ?? 0) - (a.attempt_rate ?? 0))
}

export function UpsellAnalytics({ days, store }: { days: number; store?: string }) {
  const terms = useTerms()
  const to = isoDay(new Date())
  const from = isoDay(new Date(Date.now() - (days - 1) * DAY_MS))
  const prevTo = isoDay(new Date(Date.now() - days * DAY_MS))
  const prevFrom = isoDay(new Date(Date.now() - (2 * days - 1) * DAY_MS))
  const { data, isLoading, isError } = useQuery({
    queryKey: ['upsell-overview', store ?? 'all', from, to],
    queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: from, date_to: to }),
  })
  const { data: prev } = useQuery({
    queryKey: ['upsell-overview', store ?? 'all', prevFrom, prevTo],
    queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: prevFrom, date_to: prevTo }),
  })
  if (isError) return <div className="panel up-empty">{L('Не удалось загрузить данные. Обновите страницу.', 'Could not load the data. Refresh the page.')}</div>
  if (isLoading || !data) return <div className="page-loading" role="status">{t('Загрузка...')}</div>

  const s = data.totals
  if (s.orders === 0) {
    return (
      <div className="panel up-empty">
        {L(`За ${days} ${plural(days, ['день', 'дня', 'дней'], ['', ''])} разобранных ${W().ordersGen} нет. Разбор допродаж делается для разговоров, записанных после 13 октября 2026 года.`,
          `No analysed orders in the last ${days} days. The add-on review covers conversations recorded after October 13, 2026.`)}
      </div>
    )
  }
  const p = prev?.totals
  const target = data.plan.attempt_rate_target
  const delta = (a: number | null | undefined, b: number | null | undefined) =>
    a != null && b != null && p && p.orders ? Math.round((a - b) * 100) : null
  const dAttempt = delta(s.attempt_rate, p?.attempt_rate)
  const dAccept = delta(s.acceptance_rate, p?.acceptance_rate)
  const shifts = data.sellers.reduce((a, x) => a + x.shifts, 0)

  return (
    <div className="ua">
      <section className="panel ua-kpis" aria-label={L('Итоги за период', 'Period summary')}>
        <div className="ua-period">
          {L(`${fmtDay(data.period.from, { day: 'numeric', month: 'long' })} — ${fmtDay(data.period.to, { day: 'numeric', month: 'long' })} · ${num(s.orders)} ${plural(s.orders, W().order, ['', ''])}`,
            `${fmtDay(data.period.from, { day: 'numeric', month: 'long' })} – ${fmtDay(data.period.to, { day: 'numeric', month: 'long' })} · ${num(s.orders)} orders`)}
          <Hint metric="orders" />
        </div>
        <div className="m-tiles">
          <MetricTile metric="attempt" value={pct(s.attempt_rate)} base={L(`${num(s.with_offer)} ${ordersOf(s.orders)}`, `${num(s.with_offer)} ${ordersOf(s.orders)}`)}>
            <PlanChip value={s.attempt_rate} target={target} />
            {dAttempt != null && <span className="m-delta">{L(`${pp(dAttempt)} к прошлым ${days} дням`, `${pp(dAttempt)} vs previous ${days} days`)}</span>}
          </MetricTile>
          <MetricTile metric="acceptance" value={pct(s.acceptance_rate)} base={`${num(s.accepted)} ${offersOf(s.offers)}`}>
            {dAccept != null && <span className="m-delta">{L(`${pp(dAccept)} к прошлым ${days} дням`, `${pp(dAccept)} vs previous ${days} days`)}</span>}
          </MetricTile>
          <MoneyTile s={s} />
          <MetricTile metric="accepted" value={num(s.accepted)}
            base={shifts ? L(`≈ ${(s.accepted / shifts).toFixed(1).replace('.', ',')} за смену`, `≈ ${(s.accepted / shifts).toFixed(1)} per shift`) : undefined}>
            {data.plan.accepted_per_shift != null && <span className="m-delta">{L(`план — ${data.plan.accepted_per_shift} за смену`, `plan: ${data.plan.accepted_per_shift} per shift`)}</span>}
          </MetricTile>
        </div>
      </section>

      <Trend data={data} target={target} />
      <Hours data={data} target={target} />

      <div className="ua-cols">
        <Stores data={data} title={t(terms.storePlural)} />
        <Techniques data={data} />
      </div>

      <Sellers data={data} title={t(terms.sellerPlural)} column={t(terms.seller)} />

      <div className="ua-cols">
        <Items data={data} />
        <Refusals days={days} store={store} />
      </div>

      {data.missed.length > 0 && <Missed data={data} />}
    </div>
  )
}

/* Динамика по дням: доля заказов с предложением и доля согласий, план — подписанной линией */
function Trend({ data, target }: { data: UpsellOverview; target: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const points = data.days.filter((d) => d.orders > 0)
  const H = 220, top = 16, bottom = 26, left = 40, right = 92
  const width = Math.max(w, 320)
  const X = (i: number) => left + (points.length > 1 ? (i / (points.length - 1)) * (width - left - right) : 0)
  const Y = (v: number) => top + (1 - v) * (H - top - bottom)
  const line = (key: 'attempt_rate' | 'acceptance_rate') =>
    points.map((d, i) => (d[key] == null ? '' : `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(d[key]!).toFixed(1)}`)).join(' ')
  const step = Math.max(1, Math.ceil(points.length / 7))
  const first = points.slice(0, 7), last = points.slice(-7)
  const avg = (arr: typeof points) => {
    const o = arr.reduce((a, d) => a + d.orders, 0)
    return o ? arr.reduce((a, d) => a + d.with_offer, 0) / o : null
  }
  const a0 = avg(first), a1 = avg(last)
  const story = points.length >= 14 && a0 != null && a1 != null
    ? L(`За период доля ${W().ordersGen} с предложением ${a1 >= a0 ? 'выросла' : 'снизилась'}: ${pct(a0)} в первую неделю, ${pct(a1)} в последнюю.`,
      `Over the period the share of orders with an offer ${a1 >= a0 ? 'grew' : 'fell'}: ${pct(a0)} in the first week, ${pct(a1)} in the last.`)
    : null
  const last1 = points[points.length - 1]
  // Подпись плана справа не должна наезжать на подписи последних значений
  const ends = last1 ? [Y(last1.attempt_rate ?? 0), Y(last1.acceptance_rate ?? 0)] : []
  let planY = Y(target) + 4
  if (ends.some((y) => Math.abs(y + 4 - planY) < 14)) planY = Math.min(...ends, Y(target)) - 12
  return (
    <section className="panel ua-card" aria-labelledby="ua-trend">
      <div className="panel-head">
        <div>
          <h2 id="ua-trend" className="panel-title">{L('Динамика по дням', 'Day by day')}</h2>
          <div className="panel-sub">{story}</div>
        </div>
        <div className="ua-legend">
          <span><i className="ua-key is-attempt" />{L(...METRIC.attempt.title)}</span>
          <span><i className="ua-key is-accept" />{L(...METRIC.acceptance.title)}</span>
          <span><i className="ua-key is-plan" />{L('План', 'Plan')}</span>
        </div>
      </div>
      <div ref={ref} className="ua-chart">
        {w > 0 && (
          <svg width={width} height={H} role="img"
            aria-label={L(`Доля ${W().ordersGen} с предложением и доля согласий по дням, план ${pct(target)}`, `Offer share and acceptance by day, plan ${pct(target)}`)}>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line x1={left} x2={width - right} y1={Y(v)} y2={Y(v)} className="ua-grid" />
                <text x={left - 8} y={Y(v) + 4} className="ua-axis" textAnchor="end">{Math.round(v * 100)}%</text>
              </g>
            ))}
            <line x1={left} x2={width - right} y1={Y(target)} y2={Y(target)} className="ua-plan" />
            <text x={width - right + 8} y={planY} className="ua-plan-lbl">{L(`план ${pct(target)}`, `plan ${pct(target)}`)}</text>
            <path d={line('acceptance_rate')} className="ua-line is-accept" />
            <path d={line('attempt_rate')} className="ua-line is-attempt" />
            {points.map((d, i) => (
              <g key={d.date}>
                <circle cx={X(i)} cy={Y(d.attempt_rate ?? 0)} r={3} className="ua-dot is-attempt">
                  <title>{L(`${fmtDay(d.date)}: предлагали в ${pct(d.attempt_rate)} (${d.with_offer} ${ordersOf(d.orders)}), согласились ${pct(d.acceptance_rate)}`,
                    `${fmtDay(d.date)}: offered in ${pct(d.attempt_rate)} (${d.with_offer} ${ordersOf(d.orders)}), accepted ${pct(d.acceptance_rate)}`)}</title>
                </circle>
                {i % step === 0 && <text x={X(i)} y={H - 6} className="ua-axis" textAnchor="middle">{fmtDay(d.date)}</text>}
              </g>
            ))}
            {last1 && (
              <>
                <text x={X(points.length - 1) + 8} y={Y(last1.attempt_rate ?? 0) + 4} className="ua-end is-attempt">{pct(last1.attempt_rate)}</text>
                <text x={X(points.length - 1) + 8} y={Y(last1.acceptance_rate ?? 0) + 4} className="ua-end is-accept">{pct(last1.acceptance_rate)}</text>
              </>
            )}
          </svg>
        )}
      </div>
    </section>
  )
}

/* По часам: в пик предлагать забывают — это главный повод для разговора с командой */
function Hours({ data, target }: { data: UpsellOverview; target: number }) {
  const hours = data.hours.filter((h) => h.orders > 0)
  if (!hours.length) return null
  const busiest = [...hours].sort((a, b) => b.orders - a.orders).slice(0, 3).map((h) => h.hour)
  const sum = (arr: typeof hours) => {
    const o = arr.reduce((a, h) => a + h.orders, 0)
    return o ? arr.reduce((a, h) => a + (h.attempt_rate ?? 0) * h.orders, 0) / o : null
  }
  const peak = sum(hours.filter((h) => busiest.includes(h.hour)))
  const rest = sum(hours.filter((h) => !busiest.includes(h.hour)))
  const gap = peak != null && rest != null ? Math.round((rest - peak) * 100) : 0
  const maxOrders = Math.max(...hours.map((h) => h.orders))
  return (
    <section className="panel ua-card" aria-labelledby="ua-hours">
      <div className="panel-head">
        <div>
          <h2 id="ua-hours" className="panel-title">{L('По часам', 'By hour')}</h2>
          <div className="panel-sub">
            {gap >= 3
              ? L(`В самые загруженные часы (${busiest.sort((a, b) => a - b).map((h) => `${h}:00`).join(', ')}) предлагают реже: ${pct(peak)} против ${pct(rest)} в остальное время.`,
                `At the busiest hours (${busiest.sort((a, b) => a - b).map((h) => `${h}:00`).join(', ')}) offers drop: ${pct(peak)} vs ${pct(rest)} the rest of the day.`)
              : L(`Столбик — доля ${W().ordersGen} с предложением в этот час, подпись снизу — сколько их было.`, 'Bar: share of orders with an offer in that hour; below: number of orders.')}
          </div>
        </div>
      </div>
      <ol className="ua-hours">
        {hours.map((h) => {
          const below = (h.attempt_rate ?? 0) < target
          return (
            <li key={h.hour} title={L(`${h.hour}:00 — ${h.orders} ${W().ordersGen}, предлагали в ${pct(h.attempt_rate)}`, `${h.hour}:00 — ${h.orders} orders, offered in ${pct(h.attempt_rate)}`)}>
              <span className="ua-hour-val">{pct(h.attempt_rate)}</span>
              <span className="ua-hour-bar">
                <i className={below ? 'is-below' : 'is-met'} style={{ height: `${Math.max(4, (h.attempt_rate ?? 0) * 100)}%` }} />
                <b className="ua-hour-plan" style={{ bottom: `${target * 100}%` }} aria-hidden="true" />
              </span>
              <span className="ua-hour-h">{h.hour}:00</span>
              <span className={`ua-hour-n${busiest.includes(h.hour) ? ' is-peak' : ''}`} style={{ opacity: 0.45 + 0.55 * (h.orders / maxOrders) }}>{h.orders}</span>
            </li>
          )
        })}
      </ol>
      <p className="ua-note">
        <span className="ua-note-key"><i className="ua-key is-plan" />{L(`план ${pct(target)}`, `plan ${pct(target)}`)}</span>
        <span className="ua-note-key"><i className="ua-key is-met" />{L('план выполнен', 'plan met')}</span>
        <span className="ua-note-key"><i className="ua-key is-below" />{L('ниже плана', 'below plan')}</span>
        <span>{L(`Под часом — число ${W().ordersGen}, жирным — самые загруженные часы.`, 'Under each hour: number of orders; bold: busiest hours.')}</span>
      </p>
    </section>
  )
}

function Stores({ data, title }: { data: UpsellOverview; title: string }) {
  const terms = useTerms()
  if (data.stores.length < 2) return null
  return (
    <section className="panel ua-card" aria-labelledby="ua-stores">
      <div className="panel-head"><div><h2 id="ua-stores" className="panel-title">{title}</h2>
        <div className="panel-sub">{L(`Доля ${W().ordersGen} с предложением и план, который действует ${terms.inStore}`, 'Share of orders with an offer and the plan set for each location')}</div></div></div>
      <ul className="ua-rows">
        {data.stores.map((x) => (
          <li key={x.store_id}>
            <div className="ua-row-main">
              <b translate="no">{x.store_name}</b>
              <span className="ua-row-sub">{L(`${num(x.orders)} ${W().ordersGen} · согласились ${pct(x.acceptance_rate)}${x.upsell_revenue_n ? ` · допродажи на ${rub(x.upsell_revenue)}` : ''}`,
                `${num(x.orders)} orders · accepted ${pct(x.acceptance_rate)}${x.upsell_revenue_n ? ` · add-ons ${rub(x.upsell_revenue)}` : ''}`)}</span>
            </div>
            <div className="ua-row-side">
              <span className="ua-row-val">{pct(x.attempt_rate)}</span>
              <PlanChip value={x.attempt_rate} target={x.attempt_rate_target} compact />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Techniques({ data }: { data: UpsellOverview }) {
  const rows = data.techniques.filter((x) => x.offers > 0)
  if (!rows.length) return null
  const generic = rows.find((x) => x.technique === 'generic')
  const best = bestTechnique(rows)
  const ratio = generic?.acceptance_rate && best?.acceptance_rate ? best.acceptance_rate / generic.acceptance_rate : null
  const maxRate = Math.max(...rows.map((x) => x.acceptance_rate ?? 0), 0.01)
  return (
    <section className="panel ua-card" aria-labelledby="ua-tech">
      <div className="panel-head"><div><h2 id="ua-tech" className="panel-title">{L('Как предлагают', 'How offers are made')}</h2>
        <div className="panel-sub">{ratio && ratio >= 1.5 && best
          ? L(`Приём «${techniqueLabel(best.technique)}» срабатывает ${times(ratio)} чаще, чем «Что-нибудь ещё?».`, `“${techniqueLabel(best.technique)}” works ${times(ratio)} more often than “Anything else?”.`)
          : L('Доля согласий по каждому приёму', 'Acceptance by technique')}</div></div></div>
      <ul className="ua-bars">
        {[...rows].sort((a, b) => (b.acceptance_rate ?? 0) - (a.acceptance_rate ?? 0)).map((x) => (
          <li key={x.technique}>
            <span className="ua-bar-name">{techniqueLabel(x.technique)}</span>
            <span className="ua-bar"><i className={x.technique === 'generic' ? 'is-weak' : ''} style={{ width: `${((x.acceptance_rate ?? 0) / maxRate) * 100}%` }} /></span>
            <span className="ua-bar-val">{pct(x.acceptance_rate)}<small>{L(` · ${num(x.accepted)} из ${num(x.offers)}`, ` · ${num(x.accepted)} of ${num(x.offers)}`)}</small></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Sellers({ data, title, column }: { data: UpsellOverview; title: string; column: string }) {
  const terms = useTerms()
  const rows = useMemo(() => mergeSellers(data.sellers), [data])
  const perShift = data.plan.accepted_per_shift
  return (
    <section className="panel ua-card" aria-labelledby="ua-sellers">
      <div className="panel-head"><div><h2 id="ua-sellers" className="panel-title">{title}</h2>
        <div className="panel-sub">{L(`Отсортировано по доле ${W().ordersGen} с предложением. Рядом — план сотрудника или ${terms.storeForms[1] === 'аптеки' ? 'его аптеки' : terms.storeForms[1] === 'точки' ? 'его точки' : 'его магазина'}.`, 'Sorted by share of orders with an offer, next to each person’s plan.')}</div></div></div>
      <div className="table-wrapper">
        <table className="ua-table">
          <thead><tr>
            <th>{column}</th>
            <th className="ua-num">{L('Смен', 'Shifts')}</th>
            <th className="ua-num">{L('Заказов', 'Orders')}</th>
            <th>{L(...METRIC.attempt.title)}<Hint metric="attempt" /></th>
            <th className="ua-num">{L(...METRIC.acceptance.title)}<Hint metric="acceptance" /></th>
            <th className="ua-num">{L('Допродаж за смену', 'Add-ons per shift')}<Hint metric="accepted" /></th>
          </tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.seller_id}>
                <td><span className="ua-who"><span className="avatar" aria-hidden="true" translate="no">{initials(x.name) || '?'}</span>
                  <span><b translate="no">{x.name}</b><small translate="no">{x.store_name}</small></span></span></td>
                <td className="ua-num">{x.shifts}</td>
                <td className="ua-num">{num(x.orders)}</td>
                <td><span className="ua-attempt"><b>{pct(x.attempt_rate)}</b><PlanChip value={x.attempt_rate} target={x.attempt_rate_target} compact /></span></td>
                <td className="ua-num">{pct(x.acceptance_rate)}</td>
                <td className="ua-num">
                  <span className={perShift != null && x.accepted_per_shift != null && x.accepted_per_shift >= perShift ? 'ua-ok' : undefined}>
                    {x.accepted_per_shift != null ? String(x.accepted_per_shift).replace('.', L(',', '.')) : '—'}
                  </span>
                  {perShift != null && <small className="ua-of">{L(` · план ${perShift}`, ` · plan ${perShift}`)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Items({ data }: { data: UpsellOverview }) {
  const focus = new Set(data.focus.map((f) => f.item))
  const rows = data.items.filter((x) => x.item !== 'что-нибудь ещё').slice(0, 8)
  if (!rows.length) return null
  return (
    <section className="panel ua-card" aria-labelledby="ua-items">
      <div className="panel-head"><div><h2 id="ua-items" className="panel-title">{L('Что предлагают и что берут', 'What is offered and taken')}</h2>
        <div className="panel-sub">{L(`Сколько раз предлагали и сколько раз ${W().customer} согласился`, 'How often it was offered and accepted')}</div></div></div>
      <ul className="ua-rows">
        {rows.map((x) => (
          <li key={x.item}>
            <div className="ua-row-main"><b translate="no">{cap(x.item)}</b>{focus.has(x.item) && <span className="ua-focus">{L('товар дня', 'item of the day')}</span>}</div>
            <div className="ua-row-side"><span className="ua-row-val">{pct(x.acceptance_rate)}</span><small>{L(`${num(x.accepted)} из ${num(x.offers)}`, `${num(x.accepted)} of ${num(x.offers)}`)}</small></div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* Почему отказываются: возражения гостей и как на них ответили */
function Refusals({ days, store }: { days: number; store?: string }) {
  const label = useObjectionTypeLabel()
  const { data } = useQuery({
    queryKey: ['objections-resolution', days, store ?? 'all'],
    queryFn: () => analyticsApi.getObjectionsResolution({ period: days, store_id: store }),
  })
  const rows = (data || []).filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 6)
  if (!rows.length) return null
  const total = rows.reduce((a, x) => a + x.total, 0)
  return (
    <section className="panel ua-card" aria-labelledby="ua-refusals">
      <div className="panel-head"><div><h2 id="ua-refusals" className="panel-title">{L('Почему отказываются', 'Why guests decline')}</h2>
        <div className="panel-sub">{L(`Причины, которые ${W().customer} назвал вслух, и как часто ${W().seller} отвечал спокойно, без давления`, 'Reasons guests gave and how often staff responded calmly, without pressure')}</div></div></div>
      <ul className="ua-rows">
        {rows.map((x) => (
          <li key={x.type}>
            <div className="ua-row-main"><b>{t(label(x.type))}</b><span className="ua-row-sub">{L(`ответили хорошо в ${pct(x.resolution_rate > 1 ? x.resolution_rate / 100 : x.resolution_rate)}`, `handled well in ${pct(x.resolution_rate > 1 ? x.resolution_rate / 100 : x.resolution_rate)}`)}</span></div>
            <div className="ua-row-side"><span className="ua-row-val">{pct(x.total / total)}</span><small>{num(x.total)}</small></div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Missed({ data }: { data: UpsellOverview }) {
  return (
    <section className="panel ua-card" aria-labelledby="ua-missed">
      <div className="panel-head"><div><h2 id="ua-missed" className="panel-title">{L('Упущенные возможности', 'Missed opportunities')}</h2>
        <div className="panel-sub">{L(`Последние ${W().orders} без предложения и что можно было сказать — готовые фразы для разбора с командой`, 'Recent orders without an offer and what could have been said')}</div></div></div>
      <ul className="up-convs ua-missed">
        {data.missed.slice(0, 6).map((m) => (
          <li key={m.conversation_id}>
            <Link to={`/conversations/${m.conversation_id}`} className="up-conv">
              <span className="up-conv-time">{fmtDay(m.session_date)}</span>
              <span className="up-conv-main">
                <span className="up-conv-topic"><span className="ellipsis" translate="no">{[m.seller_name, m.items.join(', ')].filter(Boolean).join(' · ')}</span></span>
                {m.missed && <span className="ua-missed-why" translate="no">{m.missed}</span>}
                {m.better_phrase && <span className="up-better"><MessageSquareQuote size={13} aria-hidden="true" />{L('Можно было: ', 'Could say: ')}<span translate="no">«{m.better_phrase}»</span></span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Play } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { adminApi } from '@/api/admin'
import { useTerms } from '@/lib/terms'
import { initials } from '@/lib/format'
import { Meter } from '@/components/ui/Meter'
import { Spark, Delta, pct, lastAndDelta } from '@/components/ui/Spark'
import { Fingerprint, clock } from '@/components/ui/Fingerprint'
import { OutcomeTag } from '@/components/OutcomeTag'
import type { Seller, SellerBenchmark, TrendsData } from '@/types'
import { t, L, locale, plural } from '@/i18n'

/* «Команда» по концепту (ui-concept/team.html): магазины-фильтры, рейтинг продавцов
   и профиль выбранного: балл за 12 недель против медианы сети, этапы скрипта,
   зоны развития с лучшим примером в сети, план разбора и последние разговоры. */

interface OutletContext { period: number }
type SortKey = 'conversion' | 'score' | 'delta'

const dec = (v: number, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export function TeamPage() {
  const { period } = useOutletContext<OutletContext>()
  const terms = useTerms()
  const [searchParams, setSearchParams] = useSearchParams()
  const [store, setStore] = useState<string>('')
  const [sort, setSort] = useState<SortKey>('conversion')

  const { data: sellers } = useQuery({ queryKey: ['sellers', period], queryFn: () => dashboardApi.getSellers({ period }) })
  const { data: allSellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() })
  const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: () => dashboardApi.getTrends({ weeks: 12 }) })

  const trendBySeller = useMemo(() => new Map((trends?.sellers || []).map((s) => [s.seller_id, s])), [trends])

  // Карточки магазинов: сеть и каждый магазин за период
  const storeCards = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; sellers: Seller[] }>()
    for (const s of sellers || []) {
      const g = groups.get(s.store_id) || { id: s.store_id, name: s.store_name || '—', sellers: [] }
      g.sellers.push(s)
      groups.set(s.store_id, g)
    }
    const agg = (list: Seller[]) => {
      const scorable = list.reduce((a, s) => a + (s.scorable || 0), 0)
      const purchases = list.reduce((a, s) => a + (s.purchases || 0), 0)
      const n = list.reduce((a, s) => a + (s.conversations_count || 0), 0)
      const score = n ? list.reduce((a, s) => a + (s.avg_score || 0) * (s.conversations_count || 0), 0) / n : null
      return { conversion: pct(purchases, scorable), score, sellers: list.length }
    }
    return [
      { id: '', name: t('Все магазины'), ...agg(sellers || []) },
      ...[...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((g) => ({ id: g.id, name: g.name, ...agg(g.sellers) })),
    ]
  }, [sellers])

  const rows = useMemo(() => {
    const list = (sellers || []).filter((s) => !store || s.store_id === store).map((s) => {
      const tr = trendBySeller.get(s.id)
      return { ...s, spark: tr?.avg_score || [], delta: tr ? lastAndDelta(tr.avg_score).delta : null }
    })
    const key = (s: (typeof list)[number]) =>
      sort === 'conversion' ? s.conversion_rate ?? -1 : sort === 'score' ? s.avg_score ?? -1 : s.delta ?? -999
    return list.sort((a, b) => key(b) - key(a))
  }, [sellers, store, sort, trendBySeller])

  // Продавцы без разговоров за период — внизу рейтинга
  const silent = (allSellers?.items || []).filter((s: any) =>
    s.is_active !== false && (!store || s.store_id === store) && !(sellers || []).some((x) => x.id === s.id))

  const selectedId = searchParams.get('seller') || rows[0]?.id || null
  const select = (id: string) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('seller', id); return n }, { replace: true })
  const selected = (sellers || []).find((s) => s.id === selectedId) || null
  const maxConv = Math.max(0.01, ...rows.map((r) => r.conversion_rate || 0))

  return (
    <div className="team">
      <div className="stores" role="group" aria-label={t('Магазины')}>
        {storeCards.map((c) => (
          <button key={c.id || 'all'} type="button" className="store-card" aria-pressed={store === c.id} onClick={() => setStore(c.id)}>
            <span className="store-card-top">
              <span className="store-card-name ellipsis" translate={c.id ? 'no' : undefined}>{c.name}</span>
              {!c.id && <span className="store-card-city">{t('сеть')}</span>}
            </span>
            <span className="store-card-nums">
              <span><span className="display">{c.conversion != null ? dec(c.conversion) : '—'}<small>&nbsp;%</small></span><span className="lbl">{t('конверсия')}</span></span>
              <span><span className="display">{c.score != null ? Math.round(c.score) : '—'}</span><span className="lbl">{t('балл')}</span></span>
            </span>
            <span className="store-card-foot">
              {c.sellers} {plural(c.sellers, ['продавец', 'продавца', 'продавцов'], ['seller', 'sellers'])}
            </span>
          </button>
        ))}
      </div>

      <div className="team-grid">
        <section className="panel" aria-labelledby="lb-title">
          <div className="lb-head">
            <div>
              <h2 id="lb-title" className="panel-title">{L(`Рейтинг: ${terms.sellerPlural.toLowerCase()}`, 'Seller ranking')}</h2>
              <div className="panel-sub">
                {L(`${rows.length} с разговорами за период`, `${rows.length} with conversations in the period`)}
                {silent.length > 0 && L(` · ${silent.length} без данных`, ` · ${silent.length} without data`)}
              </div>
            </div>
            <div className="seg" role="group" aria-label={t('Сортировка рейтинга')}>
              {([['conversion', 'Конверсия'], ['score', 'Балл'], ['delta', 'Динамика']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{t(label)}</button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="table lb-table">
              <thead><tr>
                <th scope="col">#</th>
                <th scope="col">{terms.seller}</th>
                <th scope="col">{t('Конверсия')}</th>
                <th scope="col">{t('Балл')}</th>
                <th scope="col">{t('12 недель')}</th>
              </tr></thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id} aria-selected={s.id === selectedId} tabIndex={0}
                    onClick={() => select(s.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id) } }}>
                    <td className={`rank ${i < 3 ? 'is-top' : ''}`}>{i + 1}</td>
                    <td>
                      <span className="person">
                        <span className="avatar" aria-hidden="true" translate="no">{initials(`${s.first_name} ${s.last_name}`)}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="person-name" translate="no">{s.first_name} {s.last_name}</span>
                          <span className="person-sub"><span translate="no">{s.store_name}</span> · {s.conversations_count} {plural(s.conversations_count || 0, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <div className="conv-cell">
                        <span className="conv-val">{dec((s.conversion_rate || 0) * 100)}&nbsp;%</span>
                        <span className="conv-bar" aria-hidden="true"><span style={{ width: `${((s.conversion_rate || 0) / maxConv) * 100}%` }} /></span>
                      </div>
                    </td>
                    <td><Meter score={s.avg_score} /></td>
                    <td>
                      <span className="lb-trend">
                        <Spark values={s.spark} width={52} height={26} />
                        <Delta value={s.delta} />
                      </span>
                    </td>
                  </tr>
                ))}
                {silent.map((s: any) => (
                  <tr key={s.id} className="nodata">
                    <td className="rank">—</td>
                    <td>
                      <span className="person">
                        <span className="avatar" aria-hidden="true" translate="no">{initials(`${s.first_name} ${s.last_name}`)}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="person-name" translate="no">{s.first_name} {s.last_name}</span>
                          <span className="person-sub" translate="no">{s.store_name}</span>
                        </span>
                      </span>
                    </td>
                    <td colSpan={3}>{t('Нет разговоров за период')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selected ? <Profile seller={selected} period={period} trends={trends} /> : (
          <section className="panel"><div className="empty"><p>{t('Нет продавцов с разговорами за период.')}</p></div></section>
        )}
      </div>
    </div>
  )
}

/* ─── Профиль продавца ──────────────────────────────────────────────────── */
function Profile({ seller, period, trends }: { seller: Seller; period: number; trends?: TrendsData }) {
  const name = `${seller.first_name} ${seller.last_name}`.trim()
  const { data: bench } = useQuery({
    queryKey: ['seller-benchmark', seller.id, period],
    queryFn: () => dashboardApi.getSellerBenchmark(seller.id, period),
  })
  const tr = trends?.sellers.find((s) => s.seller_id === seller.id)
  const delta = tr ? lastAndDelta(tr.avg_score).delta : null
  const months = bench?.seller_since ? Math.max(0, Math.round((Date.now() - new Date(bench.seller_since).getTime()) / (30.4 * 86400_000))) : null
  const zones = (bench?.zones || []).map((z) => bench!.steps.find((s) => s.name === z)!).filter(Boolean)

  return (
    <section className="panel profile" aria-label={L(`Профиль: ${name}`, `Profile: ${name}`)}>
      <div className="pf-head">
        <span className="avatar avatar-lg" aria-hidden="true" translate="no">{initials(name)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="pf-name" translate="no">{name}</div>
          <div className="pf-sub">
            <span translate="no">{seller.store_name}</span>
            {months != null && <> · {months < 1 ? t('в команде меньше месяца') : L(`в команде ${months} мес.`, `on the team ${months} mo`)}</>}
          </div>
        </div>
      </div>

      <div className="pf-kpis">
        <div className="pf-kpi"><span className="display">{dec((seller.conversion_rate || 0) * 100)}<small>&nbsp;%</small></span><span className="lbl">{t('конверсия')}</span></div>
        <div className="pf-kpi">
          <span className="display">{seller.avg_score != null ? Math.round(seller.avg_score) : '—'}</span>
          <span className="lbl">{t('балл')}{delta != null && Math.round(delta) !== 0 ? L(` · ${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))} за неделю`, ` · ${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))} this week`) : ''}</span>
        </div>
        <div className="pf-kpi"><span className="display">{seller.conversations_count ?? 0}</span><span className="lbl">{plural(seller.conversations_count || 0, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}</span></div>
        <div className={`pf-kpi ${seller.with_violations ? 'is-crit' : ''}`}><span className="display">{seller.with_violations ?? 0}</span><span className="lbl">{t('с нарушениями')}</span></div>
      </div>

      {trends && tr && <ScoreChart trends={trends} sellerId={seller.id} name={seller.first_name} />}

      {bench && bench.steps.length > 0 && (
        <div className="pf-sec">
          <div className="pf-sec-h">
            <h3>{t('По этапам скрипта')}</h3>
            <span className="legend">
              <span className="legend-item"><span className="db-key is-me" />{seller.first_name}</span>
              <span className="legend-item"><span className="db-key is-team" />{t('медиана сети')}</span>
            </span>
          </div>
          <StepDots steps={bench.steps} />
        </div>
      )}

      {bench && bench.steps.length > 0 && zones.length === 0 && (
        <div className="pf-sec">
          <div className="pf-sec-h"><h3>{t('Зоны развития')}</h3></div>
          <p className="muted" style={{ fontSize: 13 }}>{t('Слабых этапов нет: по всем этапам балл 90 и выше.')}</p>
        </div>
      )}
      {zones.length > 0 && (
        <div className="pf-sec">
          <div className="pf-sec-h"><h3>{t('Зоны развития')}</h3><span className="muted" style={{ fontSize: 12 }}>{t('от слабого к сильному')}</span></div>
          {zones.map((z) => (
            <div key={z.name} className="zone">
              <div className="zone-top"><b translate="no">{z.name}</b><Meter score={z.seller} /></div>
              {z.hint && <p translate="no">{z.hint}</p>}
              <div className="zone-best">
                {z.best.seller_id !== seller.id && z.best.score > z.seller ? (
                  <><span className="avatar" aria-hidden="true" translate="no">{initials(z.best.name)}</span>
                    <span>{t('Лучше всех в сети —')} <span translate="no">{z.best.name}</span>, {Math.round(z.best.score)}</span></>
                ) : <span>{t('Лучший результат в сети на этом этапе')}</span>}
                {z.example && (
                  <Link className="link" style={{ marginLeft: 'auto' }} to={`/conversations/${z.example.conversation_id}${z.example.t != null ? `?t=${Math.max(0, z.example.t - 1)}` : ''}`}
                    title={`«${z.example.evidence}»`}>
                    <Play size={13} aria-hidden="true" />{t('Послушать пример')}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CoachingPlan sellerId={seller.id} />
      <RecentConversations sellerId={seller.id} period={period} />
    </section>
  )
}

/* Балл за 12 недель: продавец против медианы сети */
function ScoreChart({ trends, sellerId, name }: { trends: TrendsData; sellerId: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const me = trends.sellers.find((s) => s.seller_id === sellerId)!.avg_score
  const team = trends.weeks.map((_, i) => median(trends.sellers.map((s) => s.avg_score[i]).filter((v): v is number => v != null)))
  const vals = [...me, ...team].filter((v): v is number => v != null)
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10)
  const hi = Math.min(100, Math.ceil((Math.max(...vals) + 5) / 10) * 10)
  const H = 150, top = 8, bottom = 22, right = 30
  const X = (i: number) => (i / (trends.weeks.length - 1)) * (w - right)
  const Y = (v: number) => top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - top - bottom)
  const line = (series: Array<number | null>) => series
    .map((v, i) => (v != null ? [X(i), Y(v)] : null)).filter(Boolean)
    .map((p, i) => `${i ? 'L' : 'M'}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join('')
  const lastIdx = (series: Array<number | null>) => series.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()
  const meLast = lastIdx(me)
  const teamLast = lastIdx(team)
  const weekLabel = (i: number) => new Date(`${trends.weeks[i]}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  return (
    <div className="pf-sec">
      <div className="pf-sec-h">
        <h3>{t('Балл за 12 недель')}</h3>
        <span className="legend">
          <span className="legend-item"><span className="key-bar" style={{ background: 'var(--seller)', height: 2 }} /><span translate="no">{name}</span></span>
          <span className="legend-item"><span className="key-bar" style={{ background: 'var(--ink-4)', height: 2 }} />{t('медиана сети')}</span>
        </span>
      </div>
      <div ref={ref} className="lc">
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={L('Балл по неделям: продавец и медиана сети', 'Weekly score: seller and network median')}>
            {[lo, hi].map((v) => (
              <g key={v}><line x1={0} x2={w - right} y1={Y(v)} y2={Y(v)} className="lc-grid" /><text x={0} y={Y(v) - 4} className="lc-lbl">{v}</text></g>
            ))}
            <path d={line(team)} className="lc-team" />
            <path d={line(me)} className="lc-me" />
            {teamLast != null && <circle cx={X(teamLast)} cy={Y(team[teamLast]!)} r={3.5} className="lc-end-team" />}
            {meLast != null && <>
              <circle cx={X(meLast)} cy={Y(me[meLast]!)} r={4} className="lc-end" />
              <text x={X(meLast) + 8} y={Y(me[meLast]!) + 4} className="lc-endlbl">{Math.round(me[meLast]!)}</text>
            </>}
            {[0, Math.floor((trends.weeks.length - 1) / 2), trends.weeks.length - 1].map((i) => (
              <text key={i} x={X(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === trends.weeks.length - 1 ? 'end' : 'middle'} className="lc-lbl">{weekLabel(i)}</text>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}

/* Этапы: точка продавца и точка медианы сети на одной шкале */
function StepDots({ steps }: { steps: SellerBenchmark['steps'] }) {
  const vals = steps.flatMap((s) => [s.seller, s.median ?? s.seller])
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10)
  const hi = 100
  const pos = (v: number) => `${((v - lo) / Math.max(1, hi - lo)) * 100}%`
  return (
    <>
      {steps.map((s) => {
        const gap = s.median != null ? Math.round(s.seller - s.median) : null
        const a = Math.min(s.seller, s.median ?? s.seller)
        const b = Math.max(s.seller, s.median ?? s.seller)
        return (
          <div key={s.name} className="db-row">
            <span className="db-name" translate="no">{s.name}</span>
            <span className="db-track" role="img" aria-label={L(`${s.name}: ${Math.round(s.seller)}, медиана сети ${s.median != null ? Math.round(s.median) : '—'}`, `${s.name}: ${Math.round(s.seller)}, network median ${s.median != null ? Math.round(s.median) : '—'}`)}>
              <span className="db-line" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />
              {s.median != null && <span className="db-dot is-team" style={{ left: pos(s.median) }} />}
              <span className="db-dot is-me" style={{ left: pos(s.seller) }} />
            </span>
            <span className={`db-gap ${gap != null && gap < 0 ? 'is-bad' : gap ? 'is-good' : ''}`}>{gap == null ? '—' : gap > 0 ? `+${gap}` : gap < 0 ? `−${-gap}` : '0'}</span>
          </div>
        )
      })}
      <div className="db-scale"><span /><div><span>{lo}</span><span>{Math.round((lo + hi) / 2)}</span><span>{hi}</span></div><span /></div>
    </>
  )
}
/* План разбора: разговоры и комментарии руководителей из карточки разговора */
function CoachingPlan({ sellerId }: { sellerId: string }) {
  const queryClient = useQueryClient()
  const { data: items = [] } = useQuery({
    queryKey: ['coaching', 'seller', sellerId],
    queryFn: () => dashboardApi.listCoaching({ seller_id: sellerId, status: 'open' }),
  })
  const done = useMutation({
    mutationFn: (id: string) => dashboardApi.setCoachingStatus(id, 'done'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coaching'] }),
  })
  // Один разговор — одна строка, комментарии к нему — под ней
  const byConv = new Map<string, typeof items>()
  for (const it of items) byConv.set(it.conversation_id, [...(byConv.get(it.conversation_id) || []), it])
  return (
    <div className="pf-sec">
      <div className="pf-sec-h"><h3>{t('План разбора')}</h3><span className="muted" style={{ fontSize: 12 }}>{byConv.size ? L(`${byConv.size} ${plural(byConv.size, ['разговор', 'разговора', 'разговоров'], ['', ''])}`, `${byConv.size} conversations`) : ''}</span></div>
      {byConv.size === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>{t('Пусто. Добавить разговор можно кнопкой «Разобрать с продавцом» в его карточке.')}</p>
      ) : [...byConv.entries()].map(([convId, list]) => {
        const head = list[0]
        return (
          <div key={convId} className="plan-item">
            <div className="plan-top">
              <Link to={`/conversations/${convId}`} className="plan-topic ellipsis" translate="no">{head.topic || t('Разговор без темы')}</Link>
              <span className="muted">{head.session_date ? new Date(`${head.session_date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''}</span>
            </div>
            {list.filter((c) => c.comment).map((c) => (
              <div key={c.id} className="plan-note">
                {c.moment_seconds != null && (
                  <Link className="mono plan-at" to={`/conversations/${convId}?t=${Math.max(0, c.moment_seconds - 1)}`}>{clock(c.moment_seconds)}</Link>
                )}
                <span translate="no">{c.comment}</span>
                <span className="muted"> — <span translate="no">{c.author_name}</span></span>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => list.forEach((c) => done.mutate(c.id))}>
              <Check size={13} aria-hidden="true" />{t('Разобрано')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* Последние разговоры продавца с «отпечатком» */
function RecentConversations({ sellerId, period }: { sellerId: string; period: number }) {
  const { data } = useQuery({
    queryKey: ['conversations', 'seller-recent', sellerId, period],
    queryFn: () => dashboardApi.getConversations({ seller_id: sellerId, limit: 5, period }),
  })
  const items: any[] = data?.items || []
  const ids = items.map((r) => r.id as string)
  const { data: fps } = useQuery({
    queryKey: ['fingerprints', ids.join(',')],
    queryFn: () => dashboardApi.getFingerprints(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  return (
    <div className="pf-sec">
      <div className="pf-sec-h">
        <h3>{t('Последние разговоры')}</h3>
        <Link className="link" to="/conversations">{t('Все')}<ArrowRight size={13} aria-hidden="true" /></Link>
      </div>
      {items.length === 0 && <p className="muted" style={{ fontSize: 13 }}>{t('Нет разговоров за период')}</p>}
      {items.map((r) => {
        const d = new Date(r.recorded_at || r.analyzed_at || r.session_date)
        return (
          <Link key={r.id} className="rc" to={`/conversations/${r.id}`}>
            <span className="rc-time"><b>{d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</b><span>{d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span></span>
            <span className="ellipsis" translate={r.topic ? 'no' : undefined}>{r.topic || t('Без темы')}</span>
            <span className="fp-row"><Fingerprint data={fps?.[r.id]} height={26} marks={false} /><span className="fp-dur">{r.duration_seconds ? clock(r.duration_seconds) : '—'}</span></span>
            <OutcomeTag outcome={r.outcome || 'unknown'} />
          </Link>
        )
      })}
    </div>
  )
}

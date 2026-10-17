import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BarChart3, CalendarDays, Check, ClipboardCheck, Eye, MessageSquareQuote, Minus, Sparkles, Target, ThumbsUp, Trash2, X } from 'lucide-react'
import { upsellsApi, type SellerShift, type UpsellOverview, type UpsellPlanRow } from '@/api/upsells'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useTerms } from '@/lib/terms'
import { initials } from '@/lib/format'
import { Drawer } from '@/components/Drawer'
import { StampCard } from '@/components/upsells/StampCard'
import { MoneyTile, Hint, MetricTile, PlanChip, W, bestTechnique, num, ordersN, ordersOf, offersOf, pct, rub, techniqueLabel } from '@/components/upsells/metrics'
import { UpsellAnalytics } from '@/components/analytics/UpsellAnalytics'
import { L, t, plural, locale } from '@/i18n'
import '@/styles/upsells.css'

/* «Допродажи» — операционный экран смены: как команда предлагает сегодня, кому нужна подсказка
   прямо сейчас и что сказать. Метрики и их определения — общие (components/upsells/metrics).
   Итоги за период: у кофеен — раздел «Аналитика», в рознице — вкладка здесь же.
   Состояние в адресе: ?tab=period&day=&store=&seller= — ссылку можно открыть на телефоне. */

const DAY_MS = 86_400_000
const DEFAULT_TARGET = 0.7

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDay = (iso: string) => new Date(`${iso}T00:00:00`)
const shiftDay = (iso: string, days: number) => isoDay(new Date(parseDay(iso).getTime() + days * DAY_MS))
const fmtDay = (iso: string) => parseDay(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
const quoted = (s: string) => {
  const q = s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')
  return L(`«${q}»`, `“${q}”`)
}
const RESPONSE: Record<string, [string, string]> = {
  accepted: ['взяли', 'accepted'],
  declined: ['отказ', 'declined'],
  no_answer: ['без ответа', 'no answer'],
}

/** Сколько заказов подряд с предложением нужно, чтобы доля дошла до плана: (w + n) / (o + n) ≥ t */
function ordersToPlan(orders: number, withOffer: number, target: number) {
  if (target >= 1) return null
  return Math.max(1, Math.ceil((target * orders - withOffer) / (1 - target) - 1e-9))
}

type OverviewSeller = UpsellOverview['sellers'][number]

/** Сводка группирует по паре «сотрудник + точка» — строки одного человека склеиваем */
function mergeSellers(rows: OverviewSeller[]): OverviewSeller[] {
  const bySeller = new Map<string, OverviewSeller>()
  for (const r of rows) {
    const m = bySeller.get(r.seller_id)
    if (!m) { bySeller.set(r.seller_id, { ...r }); continue }
    m.orders += r.orders
    m.with_offer += r.with_offer
    m.offers += r.offers
    m.accepted += r.accepted
    m.shifts = Math.max(m.shifts, r.shifts)
  }
  return [...bySeller.values()].map((m) => {
    const rate = m.orders ? m.with_offer / m.orders : null
    return { ...m, attempt_rate: rate, acceptance_rate: m.offers ? m.accepted / m.offers : null, plan_met: rate != null && rate >= m.attempt_rate_target }
  }).sort((a, b) => (b.attempt_rate ?? 0) - (a.attempt_rate ?? 0))
}

export function UpsellsPage() {
  const [params, setParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const terms = useTerms()
  // У кофеен итоги за период живут в «Аналитике»; в рознице — вкладкой здесь
  const tab = !terms.offersFirst && params.get('tab') === 'period' ? 'period' : 'day'
  const today = isoDay(new Date())
  const day = params.get('day') || today
  const store = params.get('store') || undefined
  const days = Number(params.get('days')) || 30
  const [planOpen, setPlanOpen] = useState(false)

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const canPickStore = user?.role !== 'manager'
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60_000 })
  const activeStores = (stores?.items || []).filter((s) => s.is_active !== false)

  return (
    <div className="up">
      <div className="up-toolbar">
        {!terms.offersFirst && (
          <div className="seg" role="group" aria-label={L('Раздел', 'View')}>
            <button type="button" aria-pressed={tab === 'day'} onClick={() => set({ tab: undefined })}>{L('Смена', 'Shift')}</button>
            <button type="button" aria-pressed={tab === 'period'} onClick={() => set({ tab: 'period' })}>{L('Итоги за период', 'Period summary')}</button>
          </div>
        )}
        {tab === 'day' ? (
          <>
            <div className="seg" role="group" aria-label={L('День', 'Day')}>
              <button type="button" aria-pressed={day === today} onClick={() => set({ day: undefined })}>{L('Сегодня', 'Today')}</button>
              <button type="button" aria-pressed={day === shiftDay(today, -1)} onClick={() => set({ day: shiftDay(today, -1) })}>{L('Вчера', 'Yesterday')}</button>
            </div>
            <label className="up-date">
              <CalendarDays size={15} aria-hidden="true" />
              <span className="sr-only">{L('Выбрать день', 'Pick a day')}</span>
              <input type="date" value={day} max={today} onChange={(e) => set({ day: e.target.value && e.target.value !== today ? e.target.value : undefined })} />
            </label>
          </>
        ) : (
          <div className="seg" role="group" aria-label={L('Период', 'Period')}>
            {[7, 30, 90].map((n) => (
              <button key={n} type="button" aria-pressed={days === n} onClick={() => set({ days: n === 30 ? undefined : String(n) })}>
                {L(`${n} дней`, `${n} days`)}
              </button>
            ))}
          </div>
        )}
        {canPickStore && activeStores.length > 1 && (
          <select className="select-pill" value={store ?? ''} aria-label={t(terms.store)}
            onChange={(e) => set({ store: e.target.value || undefined, seller: undefined })}>
            <option value="">{t(terms.allStores)}</option>
            {activeStores.map((s) => <option key={s.id} value={s.id} translate="no">{s.name}</option>)}
          </select>
        )}
        <span className="up-toolbar-gap" />
        {terms.offersFirst && (
          <Link className="btn btn-ghost" to="/analytics"><BarChart3 size={15} aria-hidden="true" />{L('Итоги за период', 'Period summary')}</Link>
        )}
        <button type="button" className="btn btn-outline" onClick={() => setPlanOpen(true)}>
          <Target size={15} aria-hidden="true" />{L('План смены', 'Shift plan')}
        </button>
      </div>

      {tab === 'day'
        ? <DayView day={day} today={today} store={store} sellerParam={params.get('seller')}
            onSeller={(id) => set({ seller: id })} onDay={(d) => set({ day: d === today ? undefined : d })} />
        : <UpsellAnalytics days={days} store={store} />}

      <PlanDrawer open={planOpen} onClose={() => setPlanOpen(false)} stores={activeStores} storeFilter={store} />
    </div>
  )
}

/* ─── Смена: команда за день и смена выбранного сотрудника ─────────────────── */
function DayView({ day, today, store, sellerParam, onSeller, onDay }: {
  day: string; today: string; store?: string; sellerParam: string | null; onSeller: (id: string) => void; onDay: (day: string) => void
}) {
  const terms = useTerms()
  const { data: team, isLoading, isError } = useQuery({
    queryKey: ['upsell-overview', store ?? 'all', day, day],
    queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: day, date_to: day }),
  })
  const { data: roster } = useQuery({
    queryKey: ['admin-sellers', store ?? 'all', 'active'],
    queryFn: () => adminApi.getSellers({ store_id: store, is_active: true, limit: 200 }),
    staleTime: 5 * 60_000,
  })
  // Какой приём лучше всего работает у команды за 30 дней — для совета в карточке смены.
  // Ключ совпадает с «Аналитикой», поэтому данные берутся из кэша, если раздел уже открывали.
  const from30 = shiftDay(today, -29)
  const { data: month } = useQuery({
    queryKey: ['upsell-overview', store ?? 'all', from30, today],
    queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: from30, date_to: today }),
    staleTime: 10 * 60_000,
  })
  const best = month ? bestTechnique(month.techniques) : undefined
  // Последний день с заказами — куда отправить из пустого «сегодня» (утро до первых записей)
  const lastDay = month?.days.filter((x) => x.orders > 0 && x.date < day).pop()?.date
  const teamSellers = useMemo(() => mergeSellers(team?.sellers || []), [team])
  // Сначала те, у кого в этот день были заказы, затем остальные сотрудники
  const sellers = useMemo(() => {
    const seen = new Set(teamSellers.map((s) => s.seller_id))
    const rest = (roster?.items || [])
      .filter((s) => !seen.has(s.id))
      .map((s) => ({ seller_id: s.id, name: `${s.first_name} ${s.last_name}`.trim(), store_name: s.store_name ?? null, row: null as null | OverviewSeller }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
    return [...teamSellers.map((s) => ({ seller_id: s.seller_id, name: s.name || '', store_name: s.store_name, row: s })), ...rest]
  }, [teamSellers, roster])
  const selectedId = (sellerParam && sellers.some((s) => s.seller_id === sellerParam) ? sellerParam : undefined) || sellers[0]?.seller_id

  if (isError) return <div className="panel up-empty">{L('Не удалось загрузить данные. Обновите страницу.', 'Could not load the data. Refresh the page.')}</div>
  if (isLoading || !team) return <div className="page-loading" role="status">{t('Загрузка...')}</div>

  const s = team.totals
  const target = team.plan.attempt_rate_target
  const perShift = team.plan.accepted_per_shift
  return (
    <>
      <section className="panel up-band" aria-label={L('Команда за день', 'Team for the day')}>
        <div className="up-band-head">
          <h2 className="up-band-title">{day === today ? L('Смена сегодня', 'Today’s shift') : L(`Смена ${fmtDay(day)}`, `Shift on ${fmtDay(day)}`)}</h2>
          <span className="up-band-sub">
            {s.orders
              ? L(`${ordersN(s.orders)} разобрано`, `${ordersN(s.orders)} analysed`)
              : day === today ? L(`Разобранных ${W().ordersGen} пока нет`, 'No analysed orders yet') : L(`Разобранных ${W().ordersGen} нет`, 'No analysed orders')}
            <Hint metric="orders" />
          </span>
        </div>
        {s.orders > 0 ? (
          <div className="m-tiles">
            <MetricTile metric="attempt" value={pct(s.attempt_rate)} base={`${num(s.with_offer)} ${ordersOf(s.orders)}`}>
              <PlanChip value={s.attempt_rate} target={target} />
            </MetricTile>
            <MetricTile metric="acceptance" value={pct(s.acceptance_rate)} base={`${num(s.accepted)} ${offersOf(s.offers)}`} />
            <MoneyTile s={s} />
          </div>
        ) : (
<div className="up-band-empty">
                      <p className="up-band-note">{L('Разбор появляется через несколько минут после того, как запись смены выгружена: с бейджа, приложения сотрудника или вручную.',
            'The review appears a few minutes after the shift recording is uploaded: from a badge, the mobile recorder or manually.')}</p>
            {lastDay && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onDay(lastDay)}>
                {L(`Открыть смену ${fmtDay(lastDay)}`, `Open the shift on ${fmtDay(lastDay)}`)}<ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>

      {sellers.length === 0 ? (
        <div className="panel up-empty">
          {L('Сотрудников пока нет.', 'There are no employees yet.')}{' '}
          <Link to="/admin">{L('Добавить в администрировании', 'Add them in Administration')}</Link>
        </div>
      ) : (
        <div className={`up-grid${sellerParam ? ' is-picked' : ''}`}>
          <section className="panel up-list" aria-labelledby="up-list-title">
            <div className="panel-head"><div>
              <h2 id="up-list-title" className="panel-title">{terms.offersFirst ? t(terms.sellerPlural) : L('Сотрудники', 'Employees')}</h2>
              <div className="panel-sub">{L('Предлагали · допродажи за смену', 'Offered · add-ons this shift')}</div>
            </div></div>
            <ul>
              {sellers.map((x) => (
                <li key={x.seller_id}>
                  <button type="button" className="up-seller" aria-current={x.seller_id === selectedId ? 'true' : undefined} onClick={() => onSeller(x.seller_id)}>
                    <span className="avatar" aria-hidden="true" translate="no">{initials(x.name) || '?'}</span>
                    <span className="up-seller-main">
                      <span className="up-seller-name ellipsis" translate="no">{x.name || L('Без имени', 'Unnamed')}</span>
                      <span className="up-seller-meta ellipsis">
                        {x.row ? `${x.row.with_offer} ${ordersOf(x.row.orders)}` : day === today ? L(`Сегодня не на смене или ${W().ordersGen} нет`, 'Off shift or no orders today') : L(`Смены не было или ${W().ordersGen} нет`, 'No shift or no orders')}
                      </span>
                    </span>
                    {x.row && (
                      <span className="up-seller-side">
                        <span className="up-seller-rate">{pct(x.row.attempt_rate)}</span>
                        <PlanChip value={x.row.attempt_rate} target={x.row.attempt_rate_target} compact />
                        <span className="up-seller-acc">
                          {perShift ? L(`допродаж ${x.row.accepted} из ${perShift}`, `${x.row.accepted} of ${perShift} add-ons`) : L(`допродаж ${x.row.accepted}`, `${x.row.accepted} add-ons`)}
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selectedId && <ShiftPanel sellerId={selectedId} day={day} today={today}
            best={best?.acceptance_rate != null ? { technique: best.technique, rate: best.acceptance_rate } : undefined} />}
        </div>
      )}
    </>
  )
}

function ShiftPanel({ sellerId, day, today, best }: {
  sellerId: string; day: string; today: string; best?: { technique: string; rate: number }
}) {
  const terms = useTerms()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['upsell-shift', sellerId, day],
    queryFn: () => upsellsApi.getShift(sellerId, day),
    retry: (count, error: any) => error?.response?.status !== 404 && count < 1,
  })
  // На узком экране список стоит над карточкой — после выбора сотрудника прокручиваем к ней
  const ref = useRef<HTMLElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (!window.matchMedia('(max-width: 1100px)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [sellerId])

  if (isError) return <section ref={ref} className="panel up-me up-empty">{L('Не удалось загрузить смену сотрудника.', 'Could not load this shift.')}</section>
  if (isLoading || !data) return <section ref={ref} className="panel up-me"><div className="page-loading" role="status">{t('Загрузка...')}</div></section>

  const { progress, today: d, focus } = data
  const name = `${data.seller.first_name} ${data.seller.last_name}`.trim()
  const target = progress.attempt_rate_target
  const accTarget = progress.accepted_target
  const times = data.orders.map((o) => o.time).filter(Boolean).sort() as string[]

  // Одна подсказка «что сделать сейчас» — вместо набора разрозненных чисел
  let action: string
  let tone: 'good' | 'warn' | 'idle' = 'idle'
  if (!d.orders) {
    action = d.pending_recordings
      ? L(`${d.pending_recordings} ${plural(d.pending_recordings, ['запись', 'записи', 'записей'], ['', ''])} ещё разбирается — ${W().orders} появятся через несколько минут.`, `${d.pending_recordings} recordings are still being analysed.`)
      : day === today ? L(`Сегодня ${W().ordersGen} пока нет.`, 'No orders yet today.') : L(`В этот день ${W().ordersGen} нет.`, 'No orders on this day.')
  } else if (!(progress.attempt_rate != null && Math.round(progress.attempt_rate * 100) >= Math.round(target * 100))) {
    // «Выполнен» считаем по округлённым процентам — как PlanChip, чтобы плитка и подсказка не спорили
    const need = ordersToPlan(d.orders, d.with_offer, target)
    tone = 'warn'
    action = need == null
      ? L(`Обсудите с сотрудником, как предлагать подходящую допродажу ${W().inEach}.`, 'Discuss with the employee how to make a suitable offer in each order.')
      : need === 1
        ? L(`Чтобы выйти на план ${pct(target)}, потренируйте с сотрудником предложение для ${W().next}.`, `To reach the ${pct(target)} plan, offer an add-on in the next order.`)
        : L(`Чтобы выйти на план ${pct(target)}, обсудите с сотрудником предложения в следующих ${need} ${plural(need, W().orderLoc, ['', ''])} подряд.`,
          `To reach the ${pct(target)} plan, offer an add-on in the next ${ordersN(need)} in a row.`)
  } else if (accTarget && progress.accepted < accTarget) {
    tone = 'warn'
    const left = accTarget - progress.accepted
    action = L(`План по предложениям выполнен. До плана смены — ещё ${left} ${plural(left, ['допродажа', 'допродажи', 'допродаж'], ['', ''])}.`,
      `Offer plan met. ${left} more add-ons to the shift plan.`)
      + (best ? L(` Потренируйте с сотрудником приём «${techniqueLabel(best.technique)}»: у команды доля согласий с ним ${pct(best.rate)}.`, `Practise the ${techniqueLabel(best.technique)} technique with the employee; the team's acceptance rate is ${pct(best.rate)}.`) : '')
  } else {
    tone = 'good'
    action = accTarget ? L('Оба плана смены выполнены. Отметьте результат сотрудника на встрече.', 'Both shift plans are met. Recognise the employee’s result.') : L('План по предложениям выполнен. Похвалите сотрудника за результат.', 'The offer plan is met. Recognise the employee’s result.')
  }

  return (
    <section ref={ref} className="panel up-me" aria-labelledby="up-me-name">
      <header className="up-me-head">
        <span className="avatar avatar-lg" aria-hidden="true" translate="no">{initials(name) || '?'}</span>
        <div className="up-me-who">
          <h2 id="up-me-name" className="up-me-name" translate="no">{name}</h2>
          <div className="up-me-store">
            <span translate="no">{data.seller.store_name}</span>
            {times.length > 0 && <> · {L(`${W().orders} с ${times[0]} до ${times[times.length - 1]}`, `orders ${times[0]}–${times[times.length - 1]}`)}</>}
          </div>
        </div>
        <div className="up-me-day">{day === today ? L('Сегодня', 'Today') : fmtDay(day)}</div>
      </header>

      <p className={`up-action is-${tone}`}>
        {tone === 'warn' ? <Target size={18} aria-hidden="true" /> : tone === 'good' ? <Check size={18} aria-hidden="true" /> : <CalendarDays size={18} aria-hidden="true" />}
        <span>{action}</span>
      </p>

      {d.orders > 0 && (
        <div className="m-tiles up-me-tiles">
          <MetricTile metric="attempt" value={pct(progress.attempt_rate)} base={`${num(d.with_offer)} ${ordersOf(d.orders)}`}>
            <PlanChip value={progress.attempt_rate} target={target} />
          </MetricTile>
          <MetricTile metric="acceptance" value={pct(d.acceptance_rate)} base={`${num(d.accepted)} ${offersOf(d.offers)}`} />
          <MoneyTile s={d} />
        </div>
      )}

      {d.orders > 0 && (accTarget || progress.accepted > 0) && (
        <div className="up-stamps">
          <div className="up-stamps-head">
            <span>{accTarget
              ? L(`Допродажи за смену: ${progress.accepted} из ${accTarget} по плану`, `Add-ons this shift: ${progress.accepted} of ${accTarget} planned`)
              : L(`Допродажи за смену: ${progress.accepted}`, `Add-ons this shift: ${progress.accepted}`)}</span>
            <Hint metric="accepted" />
          </div>
          <StampCard filled={progress.accepted} total={accTarget} size="lg"
            label={accTarget ? L(`${progress.accepted} из ${accTarget} допродаж по плану смены`, `${progress.accepted} of ${accTarget} planned add-ons`) : L(`${progress.accepted} допродаж`, `${progress.accepted} add-ons`)} />
          <p className="up-stamps-note">{L(`Кружок — ${W().customer} согласился на предложение. Пустые — сколько осталось до плана.`, 'A filled circle is an accepted offer; empty ones are what is left to the plan.')}</p>
        </div>
      )}

      {focus.items.length > 0 && (
        <p className="up-focus-line">
          <Sparkles size={15} aria-hidden="true" />
          {L('Товар дня — ', 'Item of the day: ')}<b translate="no">{focus.items.join(', ')}</b>
          {focus.offered ? L(`: предлагали ${focus.offered} ${plural(focus.offered, ['раз', 'раза', 'раз'], ['', ''])}, взяли ${focus.accepted}`, `: offered ${focus.offered} times, accepted ${focus.accepted}`)
            : L(': сегодня ещё не предлагали', ': not offered yet today')}
        </p>
      )}

      <Report sellerId={sellerId} day={day} hasOrders={d.orders > 0} name={data.seller.first_name} />

      {data.best_phrase && (
        <div className="up-sec">
          <div className="up-sec-head"><h3>{L('Удачная фраза смены', 'A phrase that worked')}</h3></div>
          <figure className="tip-quote is-best">
            <blockquote translate="no">{quoted(data.best_phrase.quote)}</blockquote>
            <figcaption>
              {L(`${W().customer[0].toUpperCase() + W().customer.slice(1)} согласился · `, 'Accepted · ')}<span translate="no">{data.best_phrase.item}</span> · {techniqueLabel(data.best_phrase.technique)}
            </figcaption>
          </figure>
        </div>
      )}

      {data.orders.length > 0 && <Orders orders={data.orders} isCafe={terms.isCafe} />}
    </section>
  )
}

/* Отчёт руководителю о сотруднике: что видно по разговорам — наблюдения с цифрами и цитатами
   и один шаг на разборе. Это не советы сотруднику: у него свои подсказки в приложении. */
function Report({ sellerId, day, hasOrders, name }: { sellerId: string; day: string; hasOrders: boolean; name: string }) {
  // Отчёт пишет LLM; сервер держит его в кэше на день и пересчитывает, только когда появились новые разговоры
  const { data, isLoading, isError } = useQuery({
    queryKey: ['upsell-tips-manager', sellerId, day],
    queryFn: () => upsellsApi.getTips(sellerId, day),
    enabled: hasOrders,
    staleTime: 5 * 60_000,
    retry: false,
  })
  if (!hasOrders) return null
  const tips = data?.tips
  const focus = tips?.focus?.replace(/^\s*На разборе:\s*/i, '')
  return (
    <div className="up-sec">
      <div className="up-sec-head">
        <h3>{L(`Что видно по разговорам: ${name}`, `What the conversations show: ${name}`)}</h3>
        {data?.based_on ? <span>{L(`по ${data.based_on} ${plural(data.based_on, W().orderDat, ['', ''])}${data.period === 'week' ? ' за неделю' : ' за смену'}`, `based on ${ordersN(data.based_on)}`)}</span> : null}
      </div>
      {isLoading ? (
        <p className="up-none">{L('Готовим разбор…', 'Preparing the review…')}</p>
      ) : isError || !tips ? (
        <p className="up-none">{L('Разбор сейчас недоступен. Обновите страницу позже.', 'The review is unavailable right now. Try again later.')}</p>
      ) : (
        <>
          {tips.praise && (
            <p className="up-report-good"><ThumbsUp size={15} aria-hidden="true" /><span translate="no">{tips.praise}</span></p>
          )}
          <ul className="up-tips">
            {(tips.tips || []).slice(0, 3).map((tip, i) => (
              <li key={i} className="tip">
                <span className="tip-ico" aria-hidden="true"><Eye size={16} /></span>
                <div className="tip-body" translate="no">
                  {tip.title && <div className="tip-title"><b>{tip.title}</b></div>}
                  {tip.text && <div className="tip-text">{tip.text}</div>}
                  {tip.quote && (
                    <figure className="tip-quote"><blockquote>{quoted(tip.quote)}</blockquote>
                      <figcaption>{L('Из разговора', 'From the conversation')}</figcaption></figure>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {focus && (
            <p className="up-report-step"><ClipboardCheck size={15} aria-hidden="true" />
              <span><b>{L('На разборе: ', 'At the review: ')}</b><span translate="no">{focus}</span></span></p>
          )}
        </>
      )}
    </div>
  )
}

function Orders({ orders, isCafe }: { orders: SellerShift['orders']; isCafe: boolean }) {
  const [all, setAll] = useState(false)
  const shown = all ? orders : orders.slice(0, 8)
  return (
    <div className="up-sec">
      <div className="up-sec-head">
        <h3>{L(`${W().orders[0].toUpperCase() + W().orders.slice(1)} смены`, 'Orders of the shift')}</h3>
        <span className="up-legend">
          <span className="up-chip is-accepted"><Check size={11} strokeWidth={3} aria-hidden="true" />{L('взяли', 'accepted')}</span>
          <span className="up-chip is-declined"><X size={11} strokeWidth={3} aria-hidden="true" />{L('отказ', 'declined')}</span>
          <span className="up-chip is-none"><Minus size={11} strokeWidth={3} aria-hidden="true" />{L('не предложили', 'no offer')}</span>
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="up-none">{L(`Пока нет разобранных ${W().ordersGen}.`, 'No analysed orders yet.')}</p>
      ) : (
        <>
          <ul className="up-convs">
            {shown.map((o) => (
              <li key={o.conversation_id}>
                <Link to={`/conversations/${o.conversation_id}`} className="up-conv">
                  <span className="up-conv-time">{o.time || '—'}</span>
                  <span className="up-conv-main">
                    <span className="up-conv-topic">
                      <span className="ellipsis" translate="no">{o.items.length ? o.items.join(', ') : (isCafe ? L('Заказ', 'Order') : L('Покупка', 'Purchase'))}</span>
                      {o.check_total != null && <span className="up-check">{rub(o.check_total)}</span>}
                    </span>
                    <span className="up-conv-rules" translate="no">
                      {o.offers.filter((x) => x.technique !== 'generic').length === 0 && (
                        <span className="up-chip is-none"><Minus size={11} strokeWidth={3} aria-hidden="true" />{L('ничего не предложили', 'nothing offered')}</span>
                      )}
                      {o.offers.map((x, i) => (
                        <span key={i} className={`up-chip is-${x.technique === 'generic' ? 'generic' : x.response}`}
                          title={`${RESPONSE[x.response] ? L(...RESPONSE[x.response]) : ''} · ${techniqueLabel(x.technique)}`}>
                          {x.response === 'accepted' ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : x.response === 'declined' ? <X size={11} strokeWidth={3} aria-hidden="true" /> : null}
                          {x.technique === 'generic' ? L('«что-нибудь ещё?»', '“anything else?”') : x.item}
                        </span>
                      ))}
                    </span>
                    {o.better_phrase && (
                      <span className="up-better">
                        <MessageSquareQuote size={13} aria-hidden="true" />{L('Можно было: ', 'Could say: ')}<span translate="no">{quoted(o.better_phrase)}</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {orders.length > shown.length && (
            <button type="button" className="btn btn-ghost btn-sm up-more" onClick={() => setAll(true)}>
              {L(`Показать все ${orders.length}`, `Show all ${orders.length}`)}<ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ─── План смены ────────────────────────────────────────────────────────────── */
type Scope = 'org' | 'store' | 'seller'

function PlanDrawer({ open, onClose, stores, storeFilter }: {
  open: boolean; onClose: () => void; stores: Array<{ id: string; name: string }>; storeFilter?: string
}) {
  const user = useAuthStore((s) => s.user)
  const terms = useTerms()
  const queryClient = useQueryClient()
  const canOrg = user?.role === 'director' || user?.role === 'admin'
  const [scope, setScope] = useState<Scope>(canOrg ? 'org' : 'store')
  const [storeId, setStoreId] = useState<string>(storeFilter || user?.store_id || '')
  const [sellerId, setSellerId] = useState('')
  const [rate, setRate] = useState('')
  const [accepted, setAccepted] = useState('')
  const [focus, setFocus] = useState('')
  const [error, setError] = useState('')

  const { data: plans } = useQuery({ queryKey: ['upsell-plans'], queryFn: () => upsellsApi.getPlans(), enabled: open })
  // Все сотрудники сети — для подписей в списке планов; в выборе — только выбранного магазина
  const { data: roster } = useQuery({
    queryKey: ['admin-sellers', 'all', 'active'],
    queryFn: () => adminApi.getSellers({ is_active: true, limit: 200 }),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const storeSellers = (roster?.items || []).filter((s) => s.store_id === storeId)
  const sellerName = (id: string | null) => {
    const s = (roster?.items || []).find((x) => x.id === id)
    return s ? `${s.first_name} ${s.last_name}` : L('Сотрудник', 'Employee')
  }
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? t(terms.store)

  const current: UpsellPlanRow | undefined = (plans?.items || []).find((p) =>
    scope === 'org' ? !p.store_id && !p.seller_id
      : scope === 'store' ? p.store_id === storeId && !p.seller_id
        : !!sellerId && p.seller_id === sellerId)

  // Форма показывает план выбранного уровня, если он уже задан
  useEffect(() => {
    setError('')
    setRate(current?.attempt_rate_target != null ? String(Math.round(current.attempt_rate_target * 100)) : '')
    setAccepted(current?.accepted_per_shift != null ? String(current.accepted_per_shift) : '')
    setFocus((current?.focus_items || []).join(', '))
  }, [current?.id, scope, storeId, sellerId, open])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['upsell-plans'] })
    queryClient.invalidateQueries({ queryKey: ['upsell-overview'] })
    queryClient.invalidateQueries({ queryKey: ['upsell-shift'] })
  }
  const save = useMutation({
    mutationFn: () => {
      const r = rate.trim() === '' ? null : Number(rate) / 100
      const a = accepted.trim() === '' ? null : Number(accepted)
      if (r != null && (Number.isNaN(r) || r < 0 || r > 1)) throw new Error(L(`Доля ${W().ordersGen} — от 0 до 100 %`, 'The share must be between 0 and 100%'))
      if (a != null && (Number.isNaN(a) || a < 0 || !Number.isInteger(a))) throw new Error(L('Принятые за смену — целое число', 'Accepted per shift must be a whole number'))
      return upsellsApi.savePlan({
        store_id: scope === 'store' ? storeId : null,
        seller_id: scope === 'seller' ? sellerId : null,
        attempt_rate_target: r,
        accepted_per_shift: a,
        focus_items: focus.split(',').map((x) => x.trim()).filter(Boolean),
      })
    },
    onSuccess: () => { setError(''); invalidate() },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || L('Не удалось сохранить план', 'Could not save the plan')),
  })
  const remove = useMutation({
    mutationFn: (id: string) => upsellsApi.deletePlan(id),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.response?.data?.detail || L('Не удалось удалить план', 'Could not remove the plan')),
  })

  // Пустой план ничего не задаёт — чтобы снять план, есть «Удалить»
  const filled = rate.trim() !== '' || accepted.trim() !== '' || focus.trim() !== ''
  const ready = filled && (scope === 'org' || (scope === 'store' && !!storeId) || (scope === 'seller' && !!sellerId))
  const defaultRate = Math.round((plans?.default_attempt_rate_target ?? DEFAULT_TARGET) * 100)

  return (
    <Drawer isOpen={open} onClose={onClose} title={L('План смены', 'Shift plan')}>
      <div className="plan-form">
        <p className="plan-intro">
          {L(`План задаётся для всей сети, ${terms.storeForms[1]} или ${terms.offersFirst ? terms.sellerGen : 'сотрудника'} — действует самый частный. Без плана цель — предложение в ${defaultRate} % ${W().ordersGen}. Сотрудник видит план во вкладке «Моя смена» приложения сотрудника.`,
            `Set a plan for the whole network, a store or an employee — the most specific one applies. Without a plan the goal is an offer in ${defaultRate}% of orders. Employees see it in the “My shift” tab of the mobile recorder.`)}
        </p>
        <div className="seg" role="group" aria-label={L('Для кого', 'Applies to')}>
          {canOrg && <button type="button" aria-pressed={scope === 'org'} onClick={() => setScope('org')}>{L('Вся сеть', 'Network')}</button>}
          <button type="button" aria-pressed={scope === 'store'} onClick={() => setScope('store')}>{t(terms.store)}</button>
          <button type="button" aria-pressed={scope === 'seller'} onClick={() => setScope('seller')}>{terms.offersFirst ? t(terms.seller) : L('Сотрудник', 'Employee')}</button>
        </div>
        {scope !== 'org' && (
          <label className="form-group">
            <span className="form-label">{t(terms.store)}</span>
            <select className="form-input" value={storeId} onChange={(e) => { setStoreId(e.target.value); setSellerId('') }}>
              <option value="">{t(terms.storeChoose)}</option>
              {stores.map((s) => <option key={s.id} value={s.id} translate="no">{s.name}</option>)}
            </select>
          </label>
        )}
        {scope === 'seller' && (
          <label className="form-group">
            <span className="form-label">{L('Сотрудник', 'Employee')}</span>
            <select className="form-input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} disabled={!storeId}>
              <option value="">{L('Выберите сотрудника', 'Choose an employee')}</option>
              {storeSellers.map((s) => <option key={s.id} value={s.id} translate="no">{s.first_name} {s.last_name}</option>)}
            </select>
          </label>
        )}
        <label className="form-group">
          <span className="form-label">{L(`${W().ordersGen[0].toUpperCase() + W().ordersGen.slice(1)} с предложением, %`, 'Orders with an offer, %')}</span>
          <input className="form-input" type="number" inputMode="numeric" min={0} max={100} placeholder={String(defaultRate)} value={rate} onChange={(e) => setRate(e.target.value)} />
          <span className="form-hint">{L('Пусто — действует план уровнем выше', 'Empty — the plan one level up applies')}</span>
        </label>
        <label className="form-group">
          <span className="form-label">{L('Принятых допродаж за смену', 'Accepted add-ons per shift')}</span>
          <input className="form-input" type="number" inputMode="numeric" min={0} placeholder={L('не задано', 'not set')} value={accepted} onChange={(e) => setAccepted(e.target.value)} />
        </label>
        <label className="form-group">
          <span className="form-label">{L('Товар дня', 'Item of the day')}</span>
          <input className="form-input" type="text" placeholder={L('Например: тыквенный латте, круассан', 'E.g. pumpkin latte, croissant')} value={focus} onChange={(e) => setFocus(e.target.value)} />
          <span className="form-hint">{L('Через запятую, до 10 позиций. Анализ отмечает, предлагали ли его.', 'Comma-separated, up to 10. The analysis marks whether it was offered.')}</span>
        </label>
        {error && <p className="plan-error" role="alert">{error}</p>}
        <div className="plan-actions">
          <button type="button" className="btn btn-primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? L('Сохраняем…', 'Saving…') : L('Сохранить план', 'Save plan')}
          </button>
          {current && (
            <button type="button" className="btn btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate(current.id)}>
              <Trash2 size={15} aria-hidden="true" />{L('Удалить', 'Remove')}
            </button>
          )}
          {save.isSuccess && !save.isPending && !error && <span className="plan-saved"><Check size={14} aria-hidden="true" />{L('Сохранено', 'Saved')}</span>}
        </div>

        {(plans?.items || []).length > 0 && (
          <div className="plan-list">
            <h3>{L('Заданные планы', 'Plans set')}</h3>
            <ul>
              {(plans?.items || []).map((p) => (
                <li key={p.id}>
                  <span className="plan-scope" translate="no">
                    {p.seller_id ? sellerName(p.seller_id) : p.store_id ? storeName(p.store_id) : L('Вся сеть', 'Network')}
                  </span>
                  <span className="plan-vals">
                    {[
                      p.attempt_rate_target != null ? L(`${Math.round(p.attempt_rate_target * 100)} % ${W().ordersGen}`, `${Math.round(p.attempt_rate_target * 100)}% of orders`) : null,
                      p.accepted_per_shift != null ? L(`${p.accepted_per_shift} за смену`, `${p.accepted_per_shift} per shift`) : null,
                      p.focus_items.length ? p.focus_items.join(', ') : null,
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  )
}

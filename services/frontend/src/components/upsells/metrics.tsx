import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react'
import { L, locale, plural } from '@/i18n'
// Стили m-* живут в upsells.css: метрики используются и вне экрана допродаж (обзор)
import '@/styles/upsells.css'

/* Метрики допродаж: одни определения и одна подача на всех экранах (смена, аналитика, обзор).
   Принципы (ресерч, 13.10.2026): у метрики простое название, значение, база «из скольких»
   и сравнение с планом словами; формула — в подсказке «?», а не в голове пользователя. */

export type MetricKey = 'orders' | 'attempt' | 'acceptance' | 'accepted' | 'check' | 'plan' | 'revenue' | 'avgCheck'

/* Слова отрасли: в кофейне — заказ, гость и бариста; в аптеке — покупка, покупатель и фармацевт.
   Отрасль ставится в AppLayout (setIndustry) до отрисовки страниц — как и валюта. */
type Kind = 'cafe' | 'pharmacy' | 'retail'
type Forms = [string, string, string]
interface Words {
  /** 1 заказ, 2 заказа, 5 заказов */
  order: Forms
  /** из 1 заказа, из 5 заказов */
  orderGen: Forms
  /** по 1 заказу, по 5 заказам */
  orderDat: Forms
  /** в 1 заказе, в 5 заказах */
  orderLoc: Forms
  /** «заказы с 8:05 до 9:37» */
  orders: string
  /** «доля заказов», «нет заказов» */
  ordersGen: string
  /** «в каждом заказе» */
  inEach: string
  /** «для следующего заказа» */
  next: string
  customer: string
  seller: string
}
const WORDS: Record<Kind, Words> = {
  cafe: {
    order: ['заказ', 'заказа', 'заказов'], orderGen: ['заказа', 'заказов', 'заказов'], orderDat: ['заказу', 'заказам', 'заказам'],
    orderLoc: ['заказе', 'заказах', 'заказах'], orders: 'заказы', ordersGen: 'заказов', inEach: 'в каждом заказе', next: 'следующего заказа',
    customer: 'гость', seller: 'бариста',
  },
  pharmacy: {
    order: ['покупка', 'покупки', 'покупок'], orderGen: ['покупки', 'покупок', 'покупок'], orderDat: ['покупке', 'покупкам', 'покупкам'],
    orderLoc: ['покупке', 'покупках', 'покупках'], orders: 'покупки', ordersGen: 'покупок', inEach: 'в каждой покупке', next: 'следующей покупки',
    customer: 'покупатель', seller: 'фармацевт',
  },
  retail: {
    order: ['заказ', 'заказа', 'заказов'], orderGen: ['заказа', 'заказов', 'заказов'], orderDat: ['заказу', 'заказам', 'заказам'],
    orderLoc: ['заказе', 'заказах', 'заказах'], orders: 'заказы', ordersGen: 'заказов', inEach: 'в каждом заказе', next: 'следующего заказа',
    customer: 'покупатель', seller: 'продавец',
  },
}
let kind: Kind = 'cafe'
export function setIndustry(industry?: string | null) {
  kind = industry === 'pharmacy' ? 'pharmacy' : industry === 'coffee' ? 'cafe' : 'retail'
}
export const W = () => WORDS[kind]
/** «22 заказа» / «22 покупки» */
export const ordersN = (n: number) => L(`${num(n)} ${plural(n, WORDS[kind].order, ['', ''])}`, `${num(n)} ${n === 1 ? 'order' : 'orders'}`)

export const METRIC: Record<MetricKey, { title: [string, string]; hint: [string, string] }> = {
  orders: {
    title: ['Заказы', 'Orders'],
    hint: ['Разговоры у стойки, где гость что-то заказал. Считаются только разобранные записи — разбор готов через несколько минут после выгрузки.',
      'Counter conversations where the guest ordered something. Only analysed recordings count — the analysis is ready a few minutes after upload.'],
  },
  attempt: {
    title: ['Предлагали', 'Offered'],
    hint: ['Доля заказов, где бариста предложил хотя бы одну конкретную позицию сверх заказа: больший объём, добавку, выпечку, товар дня или карту. «Что-нибудь ещё?» не считается — это не предложение.',
      'Share of orders where the barista offered at least one specific extra: a larger size, an add-on, a pastry, the item of the day or the card. “Anything else?” does not count.'],
  },
  acceptance: {
    title: ['Согласились', 'Accepted'],
    hint: ['Доля предложений, на которые гость согласился.', 'Share of offers the guest accepted.'],
  },
  accepted: {
    title: ['Допродажи', 'Add-ons sold'],
    hint: ['Сколько раз гость согласился на предложение. План смены задаёт, сколько допродаж нужно за смену.',
      'How many times a guest accepted an offer. The shift plan sets how many are needed per shift.'],
  },
  check: {
    title: ['Чек с допродажей', 'Check with an add-on'],
    hint: ['Средний чек заказов, где гость согласился хотя бы на одно предложение. Под ним — средний чек остальных заказов: разница показывает, сколько приносит допродажа.',
      'Average check of orders where the guest accepted at least one offer. Below it is the average check of all other orders: the difference is what add-ons bring.'],
  },
  revenue: {
    title: ['Допродажи принесли', 'Add-ons brought'],
    hint: ['Сумма того, на что гость согласился после предложения, по цене, названной в разговоре. За больший объём считается доплата. Карта лояльности денег не добавляет.',
      'The total of what guests accepted after an offer, at the price named in the conversation. For a larger size, the extra charge. A loyalty card adds nothing.'],
  },
  avgCheck: {
    title: ['Средний чек', 'Average check'],
    hint: ['Средняя сумма заказа за выбранный день. Сравнение чеков с допродажей и без появится, когда в каждой группе наберётся хотя бы 10 заказов, — на меньшем числе разница случайна.',
      'Average order total for the day. The with/without comparison appears once each group has at least 10 orders.'],
  },
  plan: {
    title: ['План', 'Plan'],
    hint: ['Цель руководителя: доля заказов с предложением и число допродаж за смену. Меняется кнопкой «План смены».',
      'The manager’s target: share of orders with an offer and add-ons per shift. Change it with the “Shift plan” button.'],
  },
}

/** Те же определения словами аптеки и обычной розницы */
const HINTS: Partial<Record<Kind, Partial<Record<MetricKey, [string, string]>>>> = {
  pharmacy: {
    orders: ['Разговоры у кассы, где покупатель что-то купил. Считаются только разобранные записи — разбор готов через несколько минут после выгрузки.',
      'Counter conversations that ended with a purchase. Only analysed recordings count.'],
    attempt: ['Доля покупок, где фармацевт предложил хотя бы одну конкретную позицию сверх просьбы: упаковку побольше, средство к лечению, товар дня или карту. «Что-нибудь ещё?» не считается — это не предложение.',
      'Share of purchases where the pharmacist offered at least one specific extra: a bigger pack, something for the treatment, the item of the day or the card. “Anything else?” does not count.'],
    acceptance: ['Доля предложений, на которые покупатель согласился.', 'Share of offers the customer accepted.'],
    accepted: ['Сколько раз покупатель согласился на предложение. План смены задаёт, сколько допродаж нужно за смену.',
      'How many times a customer accepted an offer. The shift plan sets how many are needed per shift.'],
    check: ['Средний чек покупок, где покупатель согласился хотя бы на одно предложение. Под ним — средний чек остальных покупок: разница показывает, сколько приносит допродажа.',
      'Average check of purchases with an accepted offer; below it, all other purchases. The difference is what add-ons bring.'],
    plan: ['Цель руководителя: доля покупок с предложением и число допродаж за смену. Меняется кнопкой «План смены».',
      'The manager’s target: share of purchases with an offer and add-ons per shift.'],
    revenue: ['Сумма того, на что покупатель согласился после предложения, по цене, названной в разговоре. За упаковку побольше считается доплата. Карта лояльности денег не добавляет.',
      'The total of what customers accepted after an offer, at the price named in the conversation.'],
    avgCheck: ['Средняя сумма покупки за выбранный день. Сравнение чеков с допродажей и без появится, когда в каждой группе наберётся хотя бы 10 покупок, — на меньшем числе разница случайна.',
      'Average purchase total for the day. The with/without comparison appears once each group has at least 10 purchases.'],
  },
  retail: {
    orders: ['Разговоры, где покупатель что-то купил. Считаются только разобранные записи.', 'Conversations that ended with a purchase. Only analysed recordings count.'],
    attempt: ['Доля заказов, где продавец предложил хотя бы один конкретный товар или услугу сверх покупки. «Что-нибудь ещё?» не считается — это не предложение.',
      'Share of orders where the seller offered at least one specific extra. “Anything else?” does not count.'],
    acceptance: ['Доля предложений, на которые покупатель согласился.', 'Share of offers the customer accepted.'],
    accepted: ['Сколько раз покупатель согласился на предложение. План смены задаёт, сколько допродаж нужно за смену.',
      'How many times a customer accepted an offer.'],
    check: ['Средний чек заказов, где покупатель согласился хотя бы на одно предложение. Под ним — средний чек остальных: разница показывает, сколько приносит допродажа.',
      'Average check of orders with an accepted offer; below it, all other orders.'],
  },
}
const hintOf = (metric: MetricKey) => HINTS[kind]?.[metric] ?? METRIC[metric].hint

export const pct = (v: number | null | undefined) => (v == null ? '—' : L(`${Math.round(v * 100)} %`, `${Math.round(v * 100)}%`))
/** Валюта сети (auth.organizations.currency): ставится в AppLayout до отрисовки страниц */
const CURRENCY_SIGN: Record<string, string> = { RUB: '₽', KZT: '₸', UZS: 'сум', KGS: 'сом', BYN: 'Br', USD: '$', EUR: '€' }
let currencySign = '₽'
export function setCurrency(code?: string | null) { currencySign = CURRENCY_SIGN[code || 'RUB'] || '₽' }
export const currency = () => currencySign
/** Деньги в валюте сети: «3 450 ₸». Имя историческое — раньше были только рубли */
export const rub = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v).toLocaleString(locale)} ${currencySign}`)
export const pp = (v: number) => L(`${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} п. п.`, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} pp`)
export const num = (n: number) => n.toLocaleString(locale)
export const ordersOf = (n: number) => L(`из ${num(n)} ${plural(n, WORDS[kind].orderGen, ['', ''])}`, `of ${num(n)} ${n === 1 ? 'order' : 'orders'}`)
export const offersOf = (n: number) => L(`из ${num(n)} ${plural(n, ['предложения', 'предложений', 'предложений'], ['', ''])}`, `of ${num(n)} ${n === 1 ? 'offer' : 'offers'}`)
/** «в 5 раз», «в 3 раза», «в 1,5 раза» */
export const times = (x: number) => {
  const r = x >= 3 ? Math.round(x) : Math.round(x * 10) / 10
  return Number.isInteger(r)
    ? L(`в ${r} ${plural(r, ['раз', 'раза', 'раз'], ['', ''])}`, `${r}×`)
    : L(`в ${String(r).replace('.', ',')} раза`, `${r}×`)
}

/** Подсказка «?»: открывается наведением, кликом и с клавиатуры, закрывается Esc */
export function Hint({ metric, text }: { metric?: MetricKey; text?: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const body = text ?? (metric ? L(...hintOf(metric)) : null)
  useEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const width = 300
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 12, window.innerWidth - width - 8)) })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button ref={ref} type="button" className="m-hint" aria-label={L('Что это значит', 'What does it mean')}
        aria-describedby={open ? id : undefined} aria-expanded={open}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}>
        <CircleHelp aria-hidden="true" />
      </button>
      {open && pos && createPortal(<div id={id} role="tooltip" className="m-hint-pop" style={{ top: pos.top, left: pos.left }}>{body}</div>, document.body)}
    </>
  )
}

/** Сравнение с планом: план всегда назван числом, статус — значком и цветом.
    Полная форма — «план 70 % выполнен» / «ниже плана 70 %», краткая (в списках) — «план 70 %». */
export function PlanChip({ value, target, compact }: { value: number | null | undefined; target: number | null | undefined; compact?: boolean }) {
  if (value == null || target == null) return null
  const met = Math.round(value * 100) >= Math.round(target * 100)
  return (
    <span className={`m-plan ${met ? 'is-met' : 'is-below'}`}>
      {met ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
      {compact
        ? <>{L(`план ${pct(target)}`, `plan ${pct(target)}`)}<span className="sr-only">{met ? L(' выполнен', ' met') : L(' не выполнен', ' not met')}</span></>
        : (met ? L(`план ${pct(target)} выполнен`, `plan ${pct(target)} met`) : L(`ниже плана ${pct(target)}`, `below the ${pct(target)} plan`))}
    </span>
  )
}

/** Плитка метрики: название с «?», значение, база и строка сравнения */
export function MetricTile({ metric, value, base, children }: { metric: MetricKey; value: ReactNode; base?: ReactNode; children?: ReactNode }) {
  return (
    <div className="m-tile">
      <div className="m-tile-title">{L(...METRIC[metric].title)}<Hint metric={metric} /></div>
      <div className="m-tile-value">{value}</div>
      {base && <div className="m-tile-base">{base}</div>}
      {children && <div className="m-tile-extra">{children}</div>}
    </div>
  )
}

/** Деньги от допродаж и чек. Главное — сколько принесли сами допродажи (сумма принятых предложений
    по цене из разговора). Средние чеки «с допродажей» и «без» сравниваем только на выборке от
    MIN_CHECKS покупок в каждой группе: на одной покупке разница случайна и вводит в заблуждение. */
export interface MoneyStats {
  accepted: number
  upsell_revenue?: number | null
  upsell_revenue_n?: number
  avg_check_with_upsell: number | null
  avg_check_without: number | null
  checks_with_n?: number
  checks_without_n?: number
  avg_check?: number | null
}
const MIN_CHECKS = 10
const sales = (n: number) => L(`${num(n)} ${plural(n, ['допродажа', 'допродажи', 'допродаж'], ['', ''])}`, `${num(n)} add-on${n === 1 ? '' : 's'}`)

export function MoneyTile({ s }: { s: MoneyStats }) {
  const enough = (s.checks_with_n ?? 0) >= MIN_CHECKS && (s.checks_without_n ?? 0) >= MIN_CHECKS
  const compare = enough && s.avg_check_with_upsell != null && s.avg_check_without != null
    ? L(`средний чек с допродажей — ${rub(s.avg_check_with_upsell)}, без — ${rub(s.avg_check_without)}`,
      `average check with an add-on ${rub(s.avg_check_with_upsell)}, without ${rub(s.avg_check_without)}`)
    : null
  const n = s.upsell_revenue_n ?? 0
  if (s.upsell_revenue != null && n > 0) {
    return (
      <MetricTile metric="revenue" value={rub(s.upsell_revenue)}
        base={n >= s.accepted
          ? L(`за ${sales(n)}`, `from ${sales(n)}`)
          : L(`за ${sales(n)} из ${num(s.accepted)}: у остальных цена не прозвучала`, `from ${num(n)} of ${num(s.accepted)}; no price for the rest`)}>
        {compare && <span className="m-delta">{compare}</span>}
      </MetricTile>
    )
  }
  if (compare) {
    const diff = Math.round(s.avg_check_with_upsell!) - Math.round(s.avg_check_without!)
    return (
      <MetricTile metric="check" value={rub(s.avg_check_with_upsell)}
        base={L(`без допродажи — ${rub(s.avg_check_without)}`, `without an add-on: ${rub(s.avg_check_without)}`)}>
        {diff > 0 && <span className="m-delta is-good">{L(`на ${rub(diff)} больше`, `${rub(diff)} more`)}</span>}
      </MetricTile>
    )
  }
  const all = (s.checks_with_n ?? 0) + (s.checks_without_n ?? 0)
  return (
    <MetricTile metric="avgCheck" value={rub(s.avg_check ?? null)}
      base={all ? L(`по ${num(all)} ${plural(all, W().orderDat, ['', ''])}`, `across ${num(all)} orders`) : undefined}>
      {all > 0 && <span className="m-delta">{L(`с допродажей сравним, когда наберётся ${MIN_CHECKS} таких ${W().ordersGen}`, `comparison appears after ${MIN_CHECKS} orders with an add-on`)}</span>}
    </MetricTile>
  )
}

export const TECHNIQUE: Record<string, [string, string]> = {
  generic: ['«Что-нибудь ещё?»', '“Anything else?”'],
  specific: ['Конкретный товар', 'Specific item'],
  choice: ['Выбор из двух', 'Choice of two'],
  benefit: ['С аргументом', 'With a reason'],
  promo: ['Акция или комбо', 'Promo or combo'],
}
export const techniqueLabel = (code: string) => (TECHNIQUE[code] ? L(...TECHNIQUE[code]) : code)

/** Совет по приёму — с примером для кофейни или магазина */
type TipKind = 'cafe' | 'pharmacy' | 'retail'
const TECHNIQUE_TIP: Record<string, Record<TipKind, [string, string]>> = {
  specific: { cafe: ['называйте конкретную позицию: «круассан к кофе?»', 'name a specific item: “a croissant with your coffee?”'],
    pharmacy: ['называйте конкретный товар: «спрей для горла к таблеткам возьмёте?»', 'name a specific item: “a throat spray with the tablets?”'],
    retail: ['называйте конкретный товар: «защитное стекло к телефону?»', 'name a specific item: “a screen protector for the phone?”'] },
  choice: { cafe: ['предлагайте выбор из двух: «круассан или маффин?»', 'offer a choice of two: “croissant or muffin?”'],
    pharmacy: ['предлагайте выбор: «спрей или пастилки для горла?»', 'offer a choice: “a throat spray or lozenges?”'],
    retail: ['предлагайте выбор из двух: «чехол или стекло?»', 'offer a choice of two: “a case or a screen protector?”'] },
  benefit: { cafe: ['добавляйте причину: «круассаны только из печи — взять к кофе?»', 'add a reason: “croissants are fresh from the oven — want one?”'],
    pharmacy: ['объясняйте пользу: «с антибиотиком пробиотик защитит кишечник»', 'explain the benefit: “a probiotic protects the gut during antibiotics”'],
    retail: ['добавляйте причину: «стекло убережёт экран, если телефон упадёт»', 'add a reason: “a protector saves the screen if the phone falls”'] },
  promo: { cafe: ['напоминайте про акции и комбо: «с круассаном выйдет дешевле»', 'mention promos and combos: “it’s cheaper with a croissant”'],
    pharmacy: ['напоминайте про акции: «вторая упаковка витаминов со скидкой»', 'mention promos: “the second pack of vitamins is discounted”'],
    retail: ['напоминайте про акции и комплекты: «в комплекте выйдет дешевле»', 'mention promos and bundles: “it’s cheaper as a bundle”'] },
}
export const techniqueTip = (code: string, kind: TipKind) => {
  const tip = TECHNIQUE_TIP[code]
  return tip ? L(...tip[kind]) : null
}

/** Приём, на который соглашаются чаще всего (без «Что-нибудь ещё?» и на достаточной выборке) */
export function bestTechnique<T extends { technique: string; offers: number; acceptance_rate: number | null }>(rows: T[], minOffers = 20): T | undefined {
  return rows.filter((x) => x.technique !== 'generic' && x.offers >= minOffers && x.acceptance_rate != null)
    .sort((a, b) => (b.acceptance_rate ?? 0) - (a.acceptance_rate ?? 0))[0]
}

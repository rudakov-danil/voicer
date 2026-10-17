import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Download, MessageSquareQuote, PackageSearch } from 'lucide-react'
import { demandApi, type DemandItem, type DemandOutcome, type DemandOverview, type DemandStatus } from '@/api/demand'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useTerms } from '@/lib/terms'
import { Drawer } from '@/components/Drawer'
import { Hint, num, pct } from '@/components/upsells/metrics'
import { toast } from '@/components/ui/Toast'
import { L, t, locale, plural } from '@/i18n'
import '@/styles/upsells.css'
import '@/styles/demand.css'

/* «Спрос» — что покупатели просили, а этого не оказалось, и список к закупке.
   Источник — разбор разговоров: «Нурофен есть?» — «Закончился» становится просьбой с исходом
   (купил аналог, заказали, ушёл без покупки). Руководитель решает по каждой позиции:
   в закупку, заказано или не закупаем, и выгружает список в Excel.
   Состояние в адресе: ?days=&store=&status= — ссылкой можно поделиться с закупщиком. */

const DAY_MS = 86_400_000
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
const quoted = (s: string) => L(`«${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}»`, `“${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}”`)
// «Садыхан · Абая» → «Абая»: в узких колонках название сети повторяется у каждой аптеки
const shortStore = (name: string | null) => (name && name.includes(' · ') ? name.split(' · ').slice(1).join(' · ') : name || '—')
const timesN = (n: number) => `${num(n)} ${plural(n, ['раз', 'раза', 'раз'], ['time', 'times'])}`

const STATUS: Record<DemandStatus, [string, string]> = {
  new: ['Новое', 'New'],
  to_order: ['В закупку', 'To order'],
  ordered: ['Заказано', 'Ordered'],
  ignored: ['Не закупаем', 'Not buying'],
}
const STATUS_ORDER: DemandStatus[] = ['new', 'to_order', 'ordered', 'ignored']
const OUTCOME: Record<DemandOutcome, [string, string]> = {
  substituted: ['купил аналог', 'bought an analog'],
  ordered: ['заказали', 'ordered'],
  lost: ['ушёл без покупки', 'left without it'],
  unknown: ['неясно', 'unclear'],
}
const CATEGORY: Record<string, [string, string]> = {
  rx: ['Рецептурный', 'Prescription'],
  otc: ['Без рецепта', 'OTC'],
  supplement: ['БАД и витамины', 'Supplements'],
  medical: ['Медизделия', 'Medical devices'],
  cosmetics: ['Косметика и гигиена', 'Cosmetics'],
  baby: ['Детское', 'Baby'],
}

export function DemandPage() {
  const terms = useTerms()
  const user = useAuthStore((s) => s.user)
  const [params, setParams] = useSearchParams()
  const days = Number(params.get('days')) || 30
  const store = params.get('store') || undefined
  const filter = (params.get('status') as DemandStatus | null) || null
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const range = useMemo(() => ({
    store_id: store,
    date_from: isoDay(new Date(Date.now() - (days - 1) * DAY_MS)),
    date_to: isoDay(new Date()),
  }), [days, store])
  const queryKey = ['demand', range.store_id ?? 'all', range.date_from, range.date_to]
  const { data, isLoading, isError } = useQuery({ queryKey, queryFn: () => demandApi.get(range) })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60_000 })
  const activeStores = (stores?.items || []).filter((s) => s.is_active !== false)

  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: demandApi.save,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey })
      const prev = qc.getQueryData<DemandOverview>(queryKey)
      if (prev) {
        qc.setQueryData<DemandOverview>(queryKey, {
          ...prev,
          items: prev.items.map((x) => (x.key === v.key ? { ...x, status: v.status, note: v.note ?? x.note } : x)),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev)
      toast(L('Не удалось сохранить решение. Попробуйте ещё раз.', 'Could not save the decision. Try again.'))
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  })
  const decide = (item: DemandItem, status: DemandStatus, note?: string | null) =>
    save.mutate({ key: item.key, title: item.title, status, note: note === undefined ? item.note : note })

  const exportList = async () => {
    setExporting(true)
    try {
      await demandApi.download({ ...range, status: filter ?? undefined })
    } catch {
      toast(L('Не удалось выгрузить список. Попробуйте ещё раз.', 'Could not export the list. Try again.'))
    } finally {
      setExporting(false)
    }
  }

  const canPickStore = user?.role !== 'manager'
  const items = data?.items || []
  const counts = STATUS_ORDER.reduce((a, s) => ({ ...a, [s]: items.filter((x) => x.status === s).length }), {} as Record<DemandStatus, number>)
  const shown = filter ? items.filter((x) => x.status === filter) : items
  const open = items.find((x) => x.key === openKey) || null

  return (
    <div className="dm">
      <div className="up-toolbar">
        <div className="seg" role="group" aria-label={L('Период', 'Period')}>
          {[7, 30, 90].map((n) => (
            <button key={n} type="button" aria-pressed={days === n} onClick={() => set({ days: n === 30 ? undefined : String(n) })}>
              {L(`${n} дней`, `${n} days`)}
            </button>
          ))}
        </div>
        {canPickStore && activeStores.length > 1 && (
          <select className="select-pill" value={store ?? ''} aria-label={t(terms.store)} onChange={(e) => set({ store: e.target.value || undefined })}>
            <option value="">{t(terms.allStores)}</option>
            {activeStores.map((s) => <option key={s.id} value={s.id} translate="no">{s.name}</option>)}
          </select>
        )}
        <span className="up-toolbar-gap" />
        <button type="button" className="btn btn-outline" onClick={exportList} disabled={exporting || !items.length}>
          <Download size={15} aria-hidden="true" />
          {filter === 'to_order' ? L('Выгрузить список к закупке', 'Export the order list') : L('Выгрузить в Excel', 'Export to Excel')}
        </button>
      </div>

      {isError ? (
        <div className="panel up-empty">{L('Не удалось загрузить спрос. Обновите страницу.', 'Could not load demand. Refresh the page.')}</div>
      ) : isLoading || !data ? (
        <div className="page-loading" role="status">{t('Загрузка...')}</div>
      ) : data.totals.requests === 0 && items.length === 0 ? (
        <div className="panel dm-empty">
          <PackageSearch size={28} aria-hidden="true" />
          <h2>{L('Пока никто не спросил того, чего нет', 'Nobody has asked for a missing item yet')}</h2>
          <p>{L(`Как только в разговоре прозвучит «Нурофен есть?» — «Закончился», просьба появится здесь: сколько раз спрашивали, в каких ${terms.storeForms[2]}, купили ли аналог. Отсюда её можно отправить в закупку.`,
            'As soon as a conversation has “Do you have Nurofen?” — “Sold out”, the request appears here with how often it was asked, where, and whether an analog was bought.')}</p>
        </div>
      ) : (
        <>
          <Summary data={data} days={days} />
          <div className="dm-grid">
            <section className="panel dm-list" aria-labelledby="dm-list-title">
              <div className="panel-head">
                <div>
                  <h2 id="dm-list-title" className="panel-title">{L('Чего не хватило', 'What was missing')}</h2>
                  <div className="panel-sub">{L('Позиции по числу запросов. Решение по позиции сохраняется сразу и попадает в выгрузку.',
                    'Items by number of requests. A decision is saved at once and goes into the export.')}</div>
                </div>
              </div>
              <div className="tabs dm-tabs" role="tablist" aria-label={L('Решение', 'Decision')}>
                <button type="button" role="tab" aria-selected={!filter} className={`tab ${!filter ? 'active' : ''}`} onClick={() => set({ status: undefined })}>
                  {L('Все', 'All')}<span className="count">{items.length}</span>
                </button>
                {STATUS_ORDER.map((s) => (
                  <button key={s} type="button" role="tab" aria-selected={filter === s} className={`tab ${filter === s ? 'active' : ''}`} onClick={() => set({ status: s })}>
                    {L(...STATUS[s])}<span className="count">{counts[s]}</span>
                  </button>
                ))}
              </div>
              {shown.length === 0 ? (
                <p className="dm-none">{filter === 'to_order'
                  ? L('В закупку пока ничего не отправлено. Откройте позицию из «Новых» и выберите «В закупку».', 'Nothing is marked to order yet.')
                  : L('Здесь пусто.', 'Nothing here.')}</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dm-table">
                    <thead>
                      <tr>
                        <th>{L('Товар', 'Item')}</th>
                        <th className="dm-num">{L('Запросов', 'Requests')}<Hint text={L('Сколько раз покупатели спросили этот товар, а его не было. Ниже — за последние 7 дней.', 'How many times customers asked for it while it was missing. Below: the last 7 days.')} /></th>
                        <th className="dm-num">{L('Ушли без покупки', 'Left without')}<Hint text={L('Покупатель не взял ни аналог, ни заказ — эти продажи ушли в другую аптеку.', 'The customer took neither an analog nor an order — the sale went elsewhere.')} /></th>
                        <th>{L('Чем заменяли', 'Substitute')}</th>
                        <th>{L('Решение', 'Decision')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((x) => <Row key={x.key} item={x} onOpen={() => setOpenKey(x.key)} onDecide={(s) => decide(x, s)} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <Recent data={data} onOpen={(key) => setOpenKey(key)} />
          </div>
        </>
      )}

      <ItemDrawer item={open} recent={data?.recent || []} days={days} onClose={() => setOpenKey(null)}
        onSave={(status, note) => open && decide(open, status, note)} />
    </div>
  )
}

/* Итоги: сколько просили, сколько ушло, сколько закрыли аналогом, что уже в закупке */
function Summary({ data, days }: { data: DemandOverview; days: number }) {
  const s = data.totals
  return (
    <section className="panel up-band" aria-label={L('Итоги за период', 'Period summary')}>
      <div className="up-band-head">
        <h2 className="up-band-title">{L(`Спрос за ${days} дней`, `Demand over ${days} days`)}</h2>
        <span className="up-band-sub">
          {L(`${num(s.items)} ${plural(s.items, ['позиция', 'позиции', 'позиций'], ['', ''])} · в ${num(s.conversations)} ${plural(s.conversations, ['разговоре', 'разговорах', 'разговорах'], ['', ''])} из ${num(s.all_conversations)}`,
            `${num(s.items)} items · in ${num(s.conversations)} of ${num(s.all_conversations)} conversations`)}
          <Hint text={L('Считаются просьбы из разобранных разговоров: покупатель назвал товар, а его не оказалось в наличии или в ассортименте.', 'Requests from analysed conversations: the customer named an item that was out of stock or not carried.')} />
        </span>
      </div>
      <div className="m-tiles">
        <div className="m-tile">
          <div className="m-tile-title">{L('Спросили, а не было', 'Asked, not in stock')}<Hint text={L('Каждая просьба — отдельно: если в одном разговоре спросили два товара, это две просьбы.', 'Each request counts: two missing items in one conversation are two requests.')} /></div>
          <div className="m-tile-value">{num(s.requests)}</div>
          <div className="m-tile-base">{L(`${plural(s.requests, ['просьба', 'просьбы', 'просьб'], ['request', 'requests'])} покупателей`, 'customer requests')}</div>
        </div>
        <div className="m-tile">
          <div className="m-tile-title">{L('Ушли без покупки', 'Left without it')}<Hint text={L('Ни аналога, ни заказа: покупатель пошёл искать в другую аптеку.', 'No analog and no order: the customer went to look elsewhere.')} /></div>
          <div className="m-tile-value">{num(s.lost)}</div>
          <div className="m-tile-base">{L(`${pct(s.requests ? s.lost / s.requests : null)} просьб`, `${pct(s.requests ? s.lost / s.requests : null)} of requests`)}</div>
        </div>
        <div className="m-tile">
          <div className="m-tile-title">{L('Купили аналог', 'Bought an analog')}<Hint text={L('Фармацевт предложил замену с тем же действием, и покупатель согласился. Ещё часть — заказали к нужному дню.', 'The pharmacist offered a substitute and the customer agreed; some were ordered for later.')} /></div>
          <div className="m-tile-value">{num(s.substituted)}</div>
          <div className="m-tile-base">{L(`${pct(s.requests ? s.substituted / s.requests : null)} просьб · заказали ещё ${num(s.ordered)}`, `${pct(s.requests ? s.substituted / s.requests : null)} · ${num(s.ordered)} more ordered`)}</div>
        </div>
        <div className="m-tile">
          <div className="m-tile-title">{L('В закупку', 'To order')}<Hint text={L('Позиции, которые вы отметили «В закупку». Их можно выгрузить в Excel для поставщика.', 'Items you marked “To order”. Export them to Excel for the supplier.')} /></div>
          <div className="m-tile-value">{num(s.to_order)}</div>
          <div className="m-tile-base">{L(`из ${num(data.items.length)} ${plural(data.items.length, ['позиции', 'позиций', 'позиций'], ['', ''])} в списке`, `of ${num(data.items.length)} items`)}</div>
        </div>
      </div>
    </section>
  )
}

function Row({ item: x, onOpen, onDecide }: { item: DemandItem; onOpen: () => void; onDecide: (s: DemandStatus) => void }) {
  const analog = x.analogs[0]
  const growing = x.last7 >= 2 && x.last7 > x.prev7
  return (
    <tr className="dm-row">
      <td>
        <button type="button" className="dm-item" onClick={onOpen} aria-label={L(`${x.title}: подробнее`, `${x.title}: details`)}>
          <b translate="no">{x.title}</b>
          <span className="dm-item-meta">
            {CATEGORY[x.category] && <span className="dm-cat">{L(...CATEGORY[x.category])}</span>}
            {x.not_carried > 0 && x.not_carried >= x.requests / 2 && <span className="dm-cat is-warn">{L('нет в ассортименте', 'not carried')}</span>}
            {x.stores.length > 0 && (
              <span translate="no">{x.stores.length > 1
                ? L(`чаще всего — ${shortStore(x.stores[0].store_name)}, ${x.stores[0].requests} из ${x.requests}`, `mostly ${shortStore(x.stores[0].store_name)}, ${x.stores[0].requests} of ${x.requests}`)
                : shortStore(x.stores[0].store_name)}</span>
            )}
            {x.last_at && <span>{L(`последний ${fmtDay(x.last_at)}`, `last ${fmtDay(x.last_at)}`)}</span>}
          </span>
        </button>
      </td>
      <td className="dm-num">
        <b>{num(x.requests)}</b>
        <small className={growing ? 'is-up' : undefined}>
          {growing && <ArrowUpRight size={12} aria-hidden="true" />}{L(`за 7 дней: ${x.last7}`, `7 days: ${x.last7}`)}
        </small>
      </td>
      <td className="dm-num"><b className={x.lost ? 'dm-lost' : undefined}>{num(x.lost)}</b></td>
      <td>
        {analog
          ? <span className="dm-analog"><span translate="no">{analog.name}</span><small>{L(`взяли ${analog.taken} из ${analog.offered}`, `taken ${analog.taken} of ${analog.offered}`)}</small></span>
          : <span className="dm-muted">{L('аналог не предлагали', 'no analog offered')}</span>}
      </td>
      <td>
        <select className={`dm-status is-${x.status}`} value={x.status} aria-label={L(`Решение по «${x.title}»`, `Decision for ${x.title}`)}
          onChange={(e) => onDecide(e.target.value as DemandStatus)}>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{L(...STATUS[s])}</option>)}
        </select>
      </td>
    </tr>
  )
}

/* Лента последних просьб: цифры списка проверяются по живым разговорам */
function Recent({ data, onOpen }: { data: DemandOverview; onOpen: (key: string) => void }) {
  const rows = data.recent.slice(0, 12)
  if (!rows.length) return null
  return (
    <section className="panel dm-feed" aria-labelledby="dm-feed-title">
      <div className="panel-head"><div>
        <h2 id="dm-feed-title" className="panel-title">{L('Последние просьбы', 'Latest requests')}</h2>
        <div className="panel-sub">{L('Как это звучало у кассы — откройте разговор, чтобы послушать', 'How it sounded at the counter — open the conversation to listen')}</div>
      </div></div>
      <ul className="dm-feed-list">
        {rows.map((r, i) => (
          <li key={`${r.conversation_id}-${i}`}>
            <div className="dm-feed-top">
              <button type="button" className="dm-feed-item" onClick={() => onOpen(r.key)} translate="no">{r.item}</button>
              <span className={`dm-outcome is-${r.outcome}`}>{L(...OUTCOME[r.outcome])}</span>
            </div>
            {r.quote && <p className="dm-quote" translate="no">{quoted(r.quote)}</p>}
            <Link className="dm-feed-meta" to={`/conversations/${r.conversation_id}`}>
              {fmtDay(r.session_date)}{r.time ? `, ${r.time}` : ''} · <span translate="no">{[r.store_name, r.seller_name].filter(Boolean).join(' · ')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ItemDrawer({ item, recent, days, onClose, onSave }: {
  item: DemandItem | null
  recent: DemandOverview['recent']
  days: number
  onClose: () => void
  onSave: (status: DemandStatus, note: string | null) => void
}) {
  const terms = useTerms()
  const [note, setNote] = useState<string | null>(null)
  const requests = item ? recent.filter((r) => r.key === item.key).slice(0, 6) : []
  const value = note ?? item?.note ?? ''
  return (
    <Drawer isOpen={!!item} onClose={() => { setNote(null); onClose() }} title={item?.title || ''}>
      {item && (
        <div className="dm-drawer">
          <p className="dm-drawer-lead">
            {L(`За ${days} дней спросили ${timesN(item.requests)}: ${item.lost} ушли без покупки, ${item.substituted} купили аналог${item.ordered ? `, ${item.ordered} заказали` : ''}.`,
              `Asked ${item.requests} times in ${days} days: ${item.lost} left without it, ${item.substituted} bought an analog${item.ordered ? `, ${item.ordered} ordered` : ''}.`)}
          </p>

          <div className="dm-sec">
            <h3>{L('Решение', 'Decision')}</h3>
            <div className="seg dm-seg" role="group" aria-label={L('Решение', 'Decision')}>
              {STATUS_ORDER.map((s) => (
                <button key={s} type="button" aria-pressed={item.status === s} onClick={() => onSave(s, value.trim() || null)}>{L(...STATUS[s])}</button>
              ))}
            </div>
            <label className="dm-note">
              <span>{L('Комментарий для закупки', 'Note for purchasing')}</span>
              <textarea rows={2} value={value} maxLength={1000}
                placeholder={L('Например: брать 20 упаковок, поставщик — основной', 'E.g. order 20 packs from the main supplier')}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => { if (note != null && note !== (item.note ?? '')) onSave(item.status, note.trim() || null) }} />
            </label>
          </div>

          {item.stores.length > 0 && (
            <div className="dm-sec">
              <h3>{L(`По ${terms.isPharmacy ? 'аптекам' : 'магазинам'}`, 'By location')}</h3>
              <ul className="dm-bars">
                {item.stores.map((s) => (
                  <li key={s.store_id}>
                    <span translate="no">{s.store_name}</span>
                    <span className="dm-bar"><i style={{ width: `${(s.requests / item.stores[0].requests) * 100}%` }} /></span>
                    <b>{s.requests}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="dm-sec">
            <h3>{L('Чем заменяли', 'Substitutes')}</h3>
            {item.analogs.length
              ? <ul className="dm-analogs">{item.analogs.map((a) => (
                <li key={a.name}><span translate="no">{a.name}</span><small>{L(`предлагали ${timesN(a.offered)}, взяли ${a.taken}`, `offered ${a.offered}, taken ${a.taken}`)}</small></li>
              ))}</ul>
              : <p className="dm-muted">{L('Аналог не предлагали ни разу — стоит напомнить команде про замену по действующему веществу.', 'No analog was ever offered — remind the team about substitutes.')}</p>}
          </div>

          {requests.length > 0 && (
            <div className="dm-sec">
              <h3>{L('Как спрашивали', 'How it was asked')}</h3>
              <ul className="dm-quotes">
                {requests.map((r, i) => (
                  <li key={`${r.conversation_id}-${i}`}>
                    {r.quote && <p className="dm-quote" translate="no">{quoted(r.quote)}</p>}
                    {r.seller_quote && <p className="dm-answer" translate="no"><MessageSquareQuote size={13} aria-hidden="true" />{quoted(r.seller_quote)}</p>}
                    <Link className="dm-feed-meta" to={`/conversations/${r.conversation_id}`}>
                      {fmtDay(r.session_date)}{r.time ? `, ${r.time}` : ''} · <span translate="no">{[r.store_name, r.seller_name].filter(Boolean).join(' · ')}</span>
                      {' · '}<span className={`dm-outcome is-${r.outcome}`}>{L(...OUTCOME[r.outcome])}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { outcomeColor, outcomeLabel } from '@/lib/outcomes'
import { useTerms } from '@/lib/terms'
import { W } from '@/components/upsells/metrics'
import { t, L, locale, plural } from '@/i18n'

/* «День продавца» (ui-concept/conversation.html): где этот разговор среди остальных
   разговоров продавца за день. Блоки — разговоры, цвет — исход. */

const hhmm = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
const hoursOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600

function duration(sec: number) {
  const m = Math.round(sec / 60)
  const h = Math.floor(m / 60)
  return h ? L(`${h} ч ${m % 60} мин`, `${h} h ${m % 60} min`) : L(`${m} мин`, `${m} min`)
}

export function SellerDayPanel({ conversationId }: { conversationId: string }) {
  const terms = useTerms()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const { data } = useQuery({
    queryKey: ['seller-day', conversationId],
    queryFn: () => dashboardApi.getSellerDay(conversationId),
    staleTime: 60_000,
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [data])

  if (!data || data.items.length === 0) return null

  const items = data.items.map((it) => {
    const start = new Date(it.started_at)
    return { ...it, start, from: hoursOf(start), len: Math.max(1, it.duration_seconds || 60) / 3600 }
  })
  // Шкала: обычный день магазина 10–22, шире — если разговоры за его пределами
  const first = Math.min(...items.map((i) => i.from))
  const last = Math.max(...items.map((i) => i.from + i.len))
  const X0 = Math.min(10, Math.floor(first))
  const X1 = Math.max(22, Math.ceil(last))
  const h = 64
  const x = (hr: number) => ((hr - X0) / (X1 - X0)) * w
  const step = w < 460 ? 4 : 2
  const ticks: number[] = []
  for (let hr = X0; hr <= X1; hr += step) ticks.push(hr)
  // Последняя подпись — всегда конец шкалы; слишком близкую к нему промежуточную заменяем, чтобы не наезжали
  if (ticks[ticks.length - 1] !== X1) {
    if (x(X1) - x(ticks[ticks.length - 1]) < 44) ticks[ticks.length - 1] = X1
    else ticks.push(X1)
  }

  const n = items.length
  const won = items.filter((i) => i.outcome === 'purchase').length
  const talk = items.reduce((a, i) => a + (i.duration_seconds || 0), 0)
  const day = new Date(`${data.date}T00:00:00`)
  const convWord = plural(n, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])
  const wonWord = plural(won, ['покупка', 'покупки', 'покупок'], ['purchase', 'purchases'])
  // В кофейне покупкой заканчивается почти каждый разговор — считаем заказы, а не «покупки»
  const label = terms.offersFirst
    ? L(`За день ${n} ${plural(n, W().order, ['', ''])}`, `${n} orders this day`)
    : L(`За день ${n} ${convWord}, ${won} ${wonWord}`, `${n} ${convWord} this day, ${won} ${wonWord}`)

  return (
    <section className="panel" aria-labelledby="cv-day-title">
      <div className="panel-head">
        <div>
          <h2 id="cv-day-title" className="panel-title">{terms.isCafe ? t('День бариста') : terms.isPharmacy ? L('День фармацевта', 'Pharmacist’s day') : t('День продавца')}</h2>
          <div className="panel-sub">
            {L(`Все разговоры ${terms.sellerGen} за ${day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`,
              `All of the ${terms.sellerLower[1]}’s conversations on ${day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`)}
          </div>
        </div>
      </div>
      <div className="panel-body">
        <div ref={ref} className="cv-day">
          {w > 0 && (
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
              <line className="cv-day-axis" x1={0} x2={w} y1={42.5} y2={42.5} />
              {ticks.map((hr) => (
                <text key={hr} className="cv-day-lbl" x={x(hr)} y={58} textAnchor={hr === X0 ? 'start' : hr === X1 ? 'end' : 'middle'}>{`${hr}:00`}</text>
              ))}
              {items.map((it) => {
                const bx = x(it.from)
                const bw = Math.max(4, x(it.from + it.len) - bx)
                const title = `${hhmm(it.start)} · ${duration(it.duration_seconds || 0)} · ${t(outcomeLabel(it.outcome || 'unknown'))}`
                return (
                  <g key={it.id}>
                    <rect
                      className={`cv-day-blk ${it.is_current ? '' : 'is-link'}`}
                      x={bx} y={16} width={bw} height={18} rx={1.5}
                      fill={outcomeColor(it.outcome || 'unknown')}
                      tabIndex={it.is_current ? -1 : 0}
                      role={it.is_current ? undefined : 'link'}
                      aria-label={title}
                      onClick={() => !it.is_current && navigate(`/conversations/${it.id}`)}
                      onKeyDown={(e) => { if (!it.is_current && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(`/conversations/${it.id}`) } }}
                    >
                      <title>{title}</title>
                    </rect>
                    {it.is_current && (
                      <>
                        <rect className="cv-day-now" x={bx - 3} y={12} width={bw + 6} height={26} rx={4} />
                        <text className="cv-day-now-lbl" x={Math.min(Math.max(bx + bw / 2, 40), w - 40)} y={8} textAnchor="middle">{t('этот разговор')}</text>
                      </>
                    )}
                  </g>
                )
              })}
            </svg>
          )}
        </div>
        <div className="cv-day-stats">
          {terms.offersFirst ? (
            <span><b>{n}</b> {plural(n, W().order, ['order', 'orders'])}</span>
          ) : (
            <>
              <span><b>{n}</b> {convWord}</span>
              <span><b>{won}</b> {wonWord}</span>
            </>
          )}
          <span>{L('в разговорах ', '')}<b>{duration(talk)}</b>{L('', ' talking')}</span>
        </div>
      </div>
    </section>
  )
}

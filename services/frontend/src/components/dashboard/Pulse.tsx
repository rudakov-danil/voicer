import { useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Table2 } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { t, L, locale, plural } from '@/i18n'

/* Пульс недели (ui-concept/dashboard.html → .pulse): разговоры по получасам за 7 дней,
   красным — требующие внимания. Получасы по времени магазинов (бэкенд, LOCAL_TZ). */

const DAY_FROM = 20 // 10:00 — обычное открытие магазина
const DAY_TO = 44 // 22:00

const hhmm = (bin: number) => `${Math.floor(bin / 2)}:${bin % 2 ? '30' : '00'}`
const hours = (sec: number) => Math.round(sec / 3600)

export function Pulse({ onOpenAttention }: { onOpenAttention: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [showTable, setShowTable] = useState(false)
  const { data } = useQuery({ queryKey: ['pulse'], queryFn: () => dashboardApi.getPulse({ days: 7 }) })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const days = data?.days || []
  const allBins = days.flatMap((d) => d.bins.map((b) => b[0]))
  const binFrom = Math.min(DAY_FROM, ...allBins)
  const binTo = Math.max(DAY_TO, ...allBins.map((b) => b + 1))
  const BINS = binTo - binFrom
  const peak = Math.max(1, ...days.flatMap((d) => d.bins.map((b) => b[1])))
  const max = Math.max(4, Math.ceil(peak / 2) * 2)

  const H = 180
  const axisH = 26
  const top = 10
  const plotH = H - axisH - top
  const gap = w < 700 ? 6 : 14
  const slot = days.length ? Math.max(0, (w - gap * (days.length - 1)) / (days.length * BINS)) : 0
  const bw = Math.max(1.5, Math.min(5, slot - 2))
  const y = (v: number) => top + plotH - (v / max) * plotH
  const today = data?.date_to
  const nowBin = (() => { const d = new Date(); return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0) })()

  const dateLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts)
  const range = data ? `${dateLabel(data.date_from, { day: 'numeric', month: 'short' })} – ${dateLabel(data.date_to, { day: 'numeric', month: 'long' })}` : ''
  const tot = data?.totals
  const convWord = plural(tot?.conversations ?? 0, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])

  return (
    <section className="console pulse" aria-labelledby="pulse-title">
      <div className="pulse-head">
        <div>
          <div className="eyebrow">{L(`Неделя · ${range}`, `Week · ${range}`)}</div>
          <h2 id="pulse-title" className="pulse-title">
            {tot ? <>
              {tot.conversations.toLocaleString(locale)} {L(`${convWord} с покупателями`, `${convWord} with customers`)}{' '}
              <em>{L(`· ${hours(tot.talk_seconds)} ч разговоров`, `· ${hours(tot.talk_seconds)} h of talking`)}</em>
            </> : t('Загрузка...')}
          </h2>
        </div>
        {tot && (
          <button type="button" className="pulse-attn" onClick={onOpenAttention}>
            <span className="pulse-attn-num">{tot.attention}</span>
            <span className="pulse-attn-label">
              {plural(tot.attention, ['требует внимания', 'требуют внимания', 'требуют внимания'], ['needs attention', 'need attention'])}
              <span>
                {`${tot.violations} ${plural(tot.violations, ['с нарушением', 'с нарушениями', 'с нарушениями'], ['with a violation', 'with violations'])}, `}
                {L(`${tot.low_score} с низким баллом`, `${tot.low_score} with a low score`)}
              </span>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div ref={ref} className="pulse-chart">
        {w > 0 && data && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img"
            aria-label={L(`Разговоры по получасам за неделю: всего ${tot!.conversations}, требуют внимания ${tot!.attention}.`, `Conversations per half hour this week: ${tot!.conversations} in total, ${tot!.attention} need attention.`)}>
            {[max / 2, max].map((v) => (
              <g key={v}>
                <line x1={0} x2={w} y1={y(v)} y2={y(v)} className="p-grid" />
                <text x={w} y={y(v) - 4} textAnchor="end" className="p-label">{v}</text>
              </g>
            ))}
            <line x1={0} x2={w} y1={y(0) + 0.5} y2={y(0) + 0.5} className="p-grid" />
            {days.map((day, di) => {
              const gx = di * (BINS * slot + gap)
              const isToday = day.date === today
              const byBin = new Map(day.bins.map((b) => [b[0], b]))
              const dayName = dateLabel(day.date, { weekday: 'short' })
              const dayNum = new Date(`${day.date}T00:00:00`).getDate()
              return (
                <g key={day.date}>
                  {isToday && day.total === 0 ? (
                    <>
                      {Array.from({ length: Math.max(0, Math.min(BINS, nowBin - binFrom + 1)) }, (_, i) => (
                        <rect key={i} x={gx + i * slot + (slot - bw) / 2} y={y(0) - 3} width={bw} height={3} rx={1} className="p-idle" />
                      ))}
                      <text x={gx + BINS * slot} y={y(0) - 24} textAnchor="end" className="p-label">{t('разговоров пока нет')}</text>
                    </>
                  ) : (
                    Array.from({ length: BINS }, (_, i) => {
                      const b = byBin.get(binFrom + i)
                      if (!b) return null
                      const [, n, f] = b
                      const normal = n - f
                      const x = gx + i * slot + (slot - bw) / 2
                      const title = `${dayName} ${dayNum}, ${hhmm(binFrom + i)}–${hhmm(binFrom + i + 1)} · ${n} ${plural(n, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}${f ? L(` · ${f} требуют внимания`, ` · ${f} need attention`) : ''}`
                      return (
                        <g key={i} className={`p-col ${f ? 'is-link' : ''}`} onClick={f ? onOpenAttention : undefined}>
                          <title>{title}</title>
                          {normal > 0 && <rect x={x} y={y(normal)} width={bw} height={Math.max(1, y(0) - y(normal))} rx={Math.min(2, bw / 2)} className="pb" />}
                          {f > 0 && <rect x={x} y={y(n) - 2} width={bw} height={y(normal) - y(n)} rx={Math.min(2, bw / 2)} className="pf" />}
                          <rect x={gx + i * slot} y={top} width={slot} height={plotH} className="p-hit" />
                        </g>
                      )
                    })
                  )}
                  <text x={gx} y={H - 6} className="p-label">
                    <tspan className="p-label-strong">{dayName} </tspan>
                    {w >= 640 && <tspan>{isToday && day.total === 0 ? `${dayNum} · ${t('сегодня')}` : `${dayNum}  ·  ${day.total}`}</tspan>}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <div className="pulse-foot">
        <div className="legend" aria-hidden="true">
          <span className="legend-item"><span className="key-bar" style={{ background: 'var(--console-bar)' }} />{L(`Разговоры за 30 минут, ${hhmm(binFrom)}–${hhmm(binTo)}`, `Conversations per 30 minutes, ${hhmm(binFrom)}–${hhmm(binTo)}`)}</span>
          <span className="legend-item"><span className="key-bar" style={{ background: 'var(--console-signal)' }} />{t('Требуют внимания')}</span>
        </div>
        <button type="button" className="btn btn-sm" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
          <Table2 size={14} aria-hidden="true" />{showTable ? t('Скрыть таблицу') : t('Показать таблицей')}
        </button>
      </div>
      {showTable && data && (
        <table className="pulse-table">
          <caption className="sr-only">{t('Разговоры по дням недели')}</caption>
          <thead><tr>
            <th scope="col">{t('День')}</th>
            <th scope="col" className="num">{t('Разговоров')}</th>
            <th scope="col" className="num">{t('Требуют внимания')}</th>
            <th scope="col" className="num">{t('Пиковый получас')}</th>
          </tr></thead>
          <tbody>
            {days.map((d) => {
              const peakBin = d.bins.reduce((a, b) => (b[1] > (a?.[1] ?? 0) ? b : a), null as null | [number, number, number])
              return (
                <tr key={d.date}>
                  <td>{dateLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="num">{d.total}</td>
                  <td className="num">{d.flagged}</td>
                  <td className="num">{peakBin ? `${hhmm(peakBin[0])}–${hhmm(peakBin[0] + 1)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

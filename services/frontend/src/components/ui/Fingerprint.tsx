import { useLayoutEffect, useRef, useState } from 'react'
import type { FingerprintData, FingerprintMark } from '@/types'
import { L, t } from '@/i18n'

/* «Отпечаток» разговора (ui-concept/assets/voicer.js → V.fingerprint).
   Две дорожки: продавец над осью (кобальт), покупатель под осью (серый).
   Сверху метки: ▼ нарушение, ◆ возражение (контур — отработано), ● предложение допродажи. */

const MARK_LABEL: Record<FingerprintMark['k'], string> = {
  crit: 'нарушение',
  'crit-mid': 'нарушение средней важности',
  warn: 'возражение не отработано',
  'warn-ok': 'возражение отработано',
  ok: 'предложение допродажи',
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface FingerprintProps {
  data?: FingerprintData | null
  height?: number
  /** Показывать метки событий над дорожками */
  marks?: boolean
  /** Подпись метки во всплывающей подсказке (например, тип возражения по-русски) */
  markTitle?: (m: FingerprintMark) => string
}

export function Fingerprint({ data, height = 34, marks: showMarks = true, markTitle }: FingerprintProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const h = height
  const markBand = showMarks ? 8 : 0
  const laneH = Math.floor((h - markBand - 2) / 2)
  const sTop = markBand
  const axis = sTop + laneH + 1
  const cTop = axis + 1

  let body = null
  let label = ''
  if (data && w > 0) {
    const x = (sec: number) => (sec / data.dur) * w
    const marks = showMarks ? data.marks : []
    label = [
      L(`Разговор ${clock(data.dur)}`, `Conversation ${clock(data.dur)}`),
      data.talk != null ? L(`продавец говорит ${data.talk} %`, `seller talks ${data.talk}%`) : '',
      marks.map((m) => t(MARK_LABEL[m.k])).join(', '),
    ].filter(Boolean).join('; ')
    body = (
      <>
        <rect x={0} y={axis} width={w} height={1} className="fp-axis" />
        {data.segs.map(([s, e, lane], i) => {
          const sw = Math.max(1.4, x(e) - x(s) - 0.6)
          return (
            <rect
              key={i}
              x={x(s).toFixed(2)}
              y={lane === 's' ? sTop : cTop}
              width={sw.toFixed(2)}
              height={laneH}
              rx={Math.min(2, sw / 2)}
              className={lane === 's' ? 'fp-s' : lane === 'c' ? 'fp-c' : 'fp-u'}
            />
          )
        })}
        {marks.map((m, i) => {
          const mx = Math.min(w - 4, Math.max(4, m.t * w))
          const title = markTitle ? markTitle(m) : t(MARK_LABEL[m.k])
          return (
            <g key={`m${i}`}>
              <title>{`${clock(m.t * data.dur)} · ${title}`}</title>
              <rect x={mx - 0.5} y={markBand - 1} width={1} height={h - markBand + 1} className={`fp-tick fp-${m.k}`} />
              {m.k === 'crit' || m.k === 'crit-mid' ? (
                <path d={`M${mx - 4},0.5 L${mx + 4},0.5 L${mx},6.5 Z`} className={`fp-mark fp-${m.k}`} />
              ) : m.k === 'ok' ? (
                <circle cx={mx} cy={3.5} r={3} className="fp-mark fp-ok" />
              ) : (
                <path d={`M${mx},0.5 L${mx + 3.4},3.6 L${mx},6.7 L${mx - 3.4},3.6 Z`} className={`fp-mark fp-${m.k}`} />
              )}
            </g>
          )
        })}
      </>
    )
  } else if (w > 0) {
    // Нет транскрипта — только ось, чтобы строки таблицы не прыгали
    body = <rect x={0} y={axis} width={w} height={1} className="fp-axis" />
  }

  return (
    <div ref={ref} className="fp-box" style={{ height: h }}>
      {w > 0 && (
        <svg
          className="fp"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role={data ? 'img' : undefined}
          aria-label={label || undefined}
          aria-hidden={data ? undefined : true}
        >
          {body}
        </svg>
      )}
    </div>
  )
}

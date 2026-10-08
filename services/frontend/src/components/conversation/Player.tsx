import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { clock } from '@/components/ui/Fingerprint'
import { L, t } from '@/i18n'

/* Плеер-консоль карточки разговора (ui-concept/conversation.html):
   дорожки «Этапы», «Продавец», «Покупатель», «События» и линейка времени.
   Волна — настоящая (декодируем аудио), разведённая по дорожкам по таймкодам реплик. */

export interface PlayerSegment { start: number; end: number; lane: 's' | 'c' | 'u' }
export interface PlayerStage { start: number; end: number; n: number; title: string; score: number | null }
export interface PlayerEvent { t: number; kind: 'crit' | 'crit-mid' | 'warn' | 'warn-ok' | 'ok'; label: string }

export interface PlayerHandle {
  seek: (sec: number, play?: boolean) => void
}

interface PlayerProps {
  src?: string
  duration: number
  segments: PlayerSegment[]
  stages: PlayerStage[]
  events: PlayerEvent[]
  sourceLabel?: string
  /** Состояние аудио, если его нельзя слушать: «загружается», «недоступно», «без аудио» */
  audioNote?: string
  onTime?: (sec: number) => void
}

const SPEEDS = [1, 1.5, 2]
// Длинные записи не декодируем целиком — это дорого по памяти; рисуем реплики полосами
const MAX_WAVE_SEC = 20 * 60

/** Пики громкости по корзинам (0..1) из аудио — для волны на дорожках. */
function useAudioPeaks(src: string | undefined, duration: number, buckets = 1200) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  useEffect(() => {
    setPeaks(null)
    if (!src || !duration || duration > MAX_WAVE_SEC) return
    let cancelled = false
    ;(async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer()
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        const ctx: AudioContext = new Ctx()
        const audio = await ctx.decodeAudioData(buf)
        ctx.close().catch(() => {})
        const len = audio.length
        const size = Math.max(1, Math.floor(len / buckets))
        const out = new Float32Array(buckets)
        const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
        for (let b = 0; b < buckets; b++) {
          let sum = 0
          const from = b * size
          const to = Math.min(len, from + size)
          for (let i = from; i < to; i += 16) {
            let v = 0
            for (const ch of channels) v += Math.abs(ch[i])
            sum += (v / channels.length) ** 2
          }
          out[b] = Math.sqrt(sum / Math.max(1, (to - from) / 16))
        }
        // Нормируем по 97-му перцентилю, чтобы единичные щелчки не сплющивали волну
        const sorted = Array.from(out).sort((a, b) => a - b)
        const ref = sorted[Math.floor(sorted.length * 0.97)] || 1
        for (let b = 0; b < buckets; b++) out[b] = Math.min(1, out[b] / ref)
        if (!cancelled) setPeaks(out)
      } catch {
        /* волны не будет — останутся полосы реплик */
      }
    })()
    return () => { cancelled = true }
  }, [src, duration, buckets])
  return peaks
}

/** Шаг линейки: не больше 9 отметок и не теснее 56 px между подписями. */
function rulerStep(duration: number, width: number): number {
  const steps = [10, 15, 30, 60, 120, 300, 600, 900, 1800]
  return steps.find((s) => duration / s <= 9 && (width <= 0 || (width * s) / duration >= 56)) ?? 3600
}

export const ConversationPlayer = forwardRef<PlayerHandle, PlayerProps>(function ConversationPlayer(
  { src, duration, segments, stages, events, sourceLabel, audioNote, onTime },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [skipPauses, setSkipPauses] = useState(true)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const peaks = useAudioPeaks(src, duration)

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dur = Math.max(duration, segments.length ? segments[segments.length - 1].end : 0, 1)
  const x = useCallback((sec: number) => (sec / dur) * w, [dur, w])

  const seek = useCallback((sec: number, play = false) => {
    const a = audioRef.current
    const target = Math.max(0, Math.min(dur, sec))
    setTime(target)
    onTime?.(target)
    if (!a) return
    a.currentTime = target
    if (play) a.play().catch(() => {})
  }, [dur, onTime])

  useImperativeHandle(ref, () => ({ seek }), [seek])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a || !src) return
    if (a.paused) a.play().catch(() => {}); else a.pause()
  }, [src])

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed }, [speed, src])

  // Пробел — пауза/старт, ←/→ — на 5 секунд (если фокус не в поле ввода)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowLeft') seek((audioRef.current?.currentTime ?? time) - 5)
      else if (e.key === 'ArrowRight') seek((audioRef.current?.currentTime ?? time) + 5)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, seek, time])

  const onTimeUpdate = () => {
    const a = audioRef.current
    if (!a) return
    let now = a.currentTime
    // Пропуск пауз: между репликами дольше 1,5 с прыгаем к следующей
    if (skipPauses && !a.paused && segments.length) {
      const inside = segments.some((s) => now >= s.start - 0.2 && now <= s.end + 0.3)
      if (!inside) {
        const next = segments.find((s) => s.start > now)
        if (next && next.start - now > 1.5) { a.currentTime = next.start - 0.2; now = a.currentTime }
      }
    }
    setTime(now)
    onTime?.(now)
  }

  // Волна по дорожкам: столбик 2 px через 1 px, высота — громкость в этот момент
  const bars = useMemo(() => {
    if (!w) return { s: [] as JSX.Element[], c: [] as JSX.Element[] }
    const laneH = 44
    const step = 3
    const out = { s: [] as JSX.Element[], c: [] as JSX.Element[] }
    let si = 0
    for (let px = 0; px < w; px += step) {
      const sec = ((px + 1) / w) * dur
      while (si < segments.length && segments[si].end < sec) si++
      const seg = segments[si]
      if (!seg || seg.start > sec) continue
      const lane = seg.lane === 's' ? 's' : 'c'
      const amp = peaks ? peaks[Math.min(peaks.length - 1, Math.floor((sec / dur) * peaks.length))] : 0.55
      const h = Math.max(2, Math.round(amp * (laneH - 4)))
      out[lane].push(
        <rect key={px} x={px} y={(laneH - h) / 2} width={2} height={h} rx={1} className={`wv wv-${lane}${seg.lane === 'u' ? ' wv-dim' : ''}`} />,
      )
    }
    return out
  }, [w, dur, segments, peaks])

  const step = rulerStep(dur, w)
  const ticks: number[] = []
  for (let s = 0; s <= dur; s += step) ticks.push(s)

  const evGlyph = (kind: PlayerEvent['kind'], cx: number) => {
    if (kind === 'crit' || kind === 'crit-mid') return <path d={`M${cx - 4.5},${8} L${cx + 4.5},${8} L${cx},${16} Z`} className={`fp-mark fp-${kind}`} />
    if (kind === 'ok') return <circle cx={cx} cy={12} r={4} className="fp-mark fp-ok" />
    return <path d={`M${cx},${7.5} L${cx + 4.5},${12} L${cx},${16.5} L${cx - 4.5},${12} Z`} className={`fp-mark fp-${kind}`} />
  }

  // Позиция курсора над дорожками (левее — колонка подписей)
  const areaX = (e: React.MouseEvent) => {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r) return null
    const px = e.clientX - r.left
    return px >= 0 && px <= r.width ? px : null
  }

  return (
    <section className="console cv-player" aria-label={t('Плеер')}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="cv-transport">
        <button type="button" className="cv-play" onClick={toggle} disabled={!src} aria-label={playing ? t('Пауза') : t('Слушать')}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" className="btn-icon" onClick={() => seek(time - 10)} aria-label={t('Назад на 10 секунд')} title={t('Назад на 10 секунд')}>
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <button type="button" className="btn-icon" onClick={() => seek(time + 10)} aria-label={t('Вперёд на 10 секунд')} title={t('Вперёд на 10 секунд')}>
          <RotateCw size={16} aria-hidden="true" />
        </button>
        <div className="cv-clock" aria-live="off">{clock(time)} <span>/ {clock(dur)}</span></div>
        <div className="seg" role="group" aria-label={t('Скорость')}>
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {L(`${String(s).replace('.', ',')}×`, `${s}×`)}
            </button>
          ))}
        </div>
        <button type="button" role="switch" aria-checked={skipPauses} className="cv-switch" onClick={() => setSkipPauses((v) => !v)}>
          <span className="cv-switch-track" aria-hidden="true" />
          {t('Пропускать паузы')}
        </button>
        <div className="cv-transport-right">
          {audioNote && <span>{audioNote}</span>}
          {sourceLabel && <span className="cv-src">{sourceLabel}</span>}
        </div>
      </div>

      <div
        className="cv-tracks"
        onClick={(e) => { const px = areaX(e); if (px != null) seek((px / Math.max(1, w)) * dur) }}
        onMouseMove={(e) => setHoverX(areaX(e))}
        onMouseLeave={() => setHoverX(null)}
      >
        <div className="cv-track-label">{t('Этапы')}</div>
        <div className="cv-lane cv-lane-steps">
          <svg aria-hidden={stages.length ? undefined : true}>
            {stages.map((st) => {
              const x0 = x(st.start)
              const sw = Math.max(18, x(st.end) - x0 - 3)
              const low = st.score != null && st.score < 60
              return (
                <g key={`${st.n}-${st.start}`} className="cv-ev" role="button" tabIndex={0}
                  aria-label={`${st.n}. ${st.title} — ${clock(st.start)}`}
                  onClick={(e) => { e.stopPropagation(); seek(st.start, true) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') seek(st.start, true) }}>
                  <title>{`${st.n}. ${st.title}${st.score != null ? ` · ${Math.round(st.score)}` : ''}`}</title>
                  <rect x={x0} y={2} width={sw} height={24} rx={6} className={`cv-chap ${time >= st.start && time < st.end ? 'is-now' : ''}`} />
                  <clipPath id={`chap-${st.n}-${Math.round(st.start)}`}><rect x={x0} y={2} width={sw - 4} height={24} /></clipPath>
                  <text x={x0 + 8} y={18} className="cv-chap-lbl" clipPath={`url(#chap-${st.n}-${Math.round(st.start)})`}>
                    {sw > 70 ? `${st.n} · ${st.title}` : String(st.n)}
                  </text>
                  {st.score != null && sw > 150 && (
                    <text x={x0 + sw - 8} y={18} textAnchor="end" className={`cv-chap-score ${low ? 'is-low' : ''}`}>{Math.round(st.score)}</text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="cv-track-label"><span className="key-bar" style={{ background: 'var(--seller)' }} />{t('Продавец')}</div>
        <div className="cv-lane"><svg aria-hidden="true">{bars.s}</svg></div>

        <div className="cv-track-label"><span className="key-bar" style={{ background: 'var(--client)' }} />{t('Покупатель')}</div>
        <div className="cv-lane"><svg aria-hidden="true">{bars.c}</svg></div>

        <div className="cv-track-label">{t('События')}</div>
        <div className="cv-lane cv-lane-events">
          <svg>
            {events.map((ev, i) => {
              const cx = Math.min(w - 10, Math.max(10, x(ev.t)))
              return (
                <g key={i} className="cv-ev" role="button" tabIndex={0} aria-label={`${clock(ev.t)} · ${ev.label}`}
                  onClick={(e) => { e.stopPropagation(); seek(ev.t - 1, true) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') seek(ev.t - 1, true) }}>
                  <title>{`${clock(ev.t)} · ${ev.label}`}</title>
                  <circle cx={cx} cy={12} r={10} className="cv-ev-bg" />
                  {evGlyph(ev.kind, cx)}
                </g>
              )
            })}
          </svg>
        </div>

        <div />
        <div className="cv-lane cv-lane-ruler">
          <svg aria-hidden="true">
            {ticks.map((s) => (
              <g key={s}>
                <line x1={x(s)} x2={x(s)} y1={0} y2={4} className="cv-ruler-tick" />
                <text x={x(s)} y={15} textAnchor={s === 0 ? 'start' : 'middle'} className="cv-ruler-lbl">{clock(s)}</text>
              </g>
            ))}
          </svg>
        </div>

        <div ref={areaRef} className="cv-tracks-area" aria-hidden="true">
          <div className="cv-playhead" style={{ left: x(time) }} />
          {hoverX != null && <div className="cv-hover-line" style={{ left: hoverX }} />}
        </div>
      </div>
    </section>
  )
})

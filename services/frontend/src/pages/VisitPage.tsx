import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, CircleCheck, Copy, OctagonAlert, TriangleAlert } from 'lucide-react'
import { clinicApi, type VisitCheck } from '@/api/clinic'
import { recorderApi } from '@/api/recorder'
import { ConversationPlayer, type PlayerEvent, type PlayerHandle } from '@/components/conversation/Player'
import { locateQuote } from '@/components/conversation/shared'
import { clock } from '@/components/ui/Fingerprint'
import { toast } from '@/components/ui/Toast'
import { CATEGORY, HINT, PROTOCOL_STATUS, ProtocolSections, STATUS, Score, SignalChip, StatusIcon, Tile, minutes, protocolText } from '@/components/clinic/shared'
import { L, t } from '@/i18n'

/* Карточка приёма: главное для главврача, протокол (черновик ИИ и версия врача), проверка по
   правилам с цитатами и расшифровка. Цитата ведёт к реплике: место находим по совпадению слов. */

const LANE: Record<string, 's' | 'c' | 'u'> = { seller: 's', customer: 'c', client: 'c' }

export function VisitPage() {
  const { id = '' } = useParams()
  const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-visit', id], queryFn: () => clinicApi.visit(id), enabled: !!id })
  const [version, setVersion] = useState<'final' | 'draft'>('final')
  const [focus, setFocus] = useState<number | null>(null)
  const [audioUrl, setAudioUrl] = useState<string>()
  const [audioState, setAudioState] = useState<'none' | 'loading' | 'ready' | 'missing'>('loading')
  const playerRef = useRef<PlayerHandle>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const segments = useMemo(() => (data?.segments || []).filter((s) => s.start_ms != null).map((s) => ({
    start: (s.start_ms || 0) / 1000, end: (s.end_ms ?? s.start_ms ?? 0) / 1000,
    lane: LANE[s.speaker_role] || 'u', text: s.text, role: s.speaker_role,
  })), [data])
  const items = useMemo(() => [...(data?.violations || []), ...(data?.checks || [])], [data])
  // Где в расшифровке прозвучала цитата каждого правила
  const located = useMemo(() => items.map((c) => (c.quote ? locateQuote(c.quote, segments) : -1)), [items, segments])
  const hits = useMemo(() => {
    const m = new Map<number, 'crit' | 'warn'>()
    items.forEach((c, i) => {
      const idx = located[i]
      if (idx < 0 || c.kind !== 'forbidden') return
      m.set(idx, c.category === 'fraud' || c.severity === 'high' ? 'crit' : 'warn')
    })
    return m
  }, [items, located])

  useEffect(() => {
    setAudioUrl(undefined)
    if (!data) return
    if (!data.visit.recording_id || data.visit.source === 'transcript') { setAudioState('none'); return }
    setAudioState('loading')
    let url: string | undefined
    let cancelled = false
    recorderApi.getAudioBlobUrl(data.visit.recording_id)
      .then((u) => { if (cancelled) URL.revokeObjectURL(u); else { url = u; setAudioUrl(u); setAudioState('ready') } })
      .catch(() => { if (!cancelled) setAudioState('missing') })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [data])

  if (isError) return <div className="cl-visit"><div className="panel up-empty">{L('Приём не найден или недоступен.', 'The visit was not found or is not available.')}</div></div>
  if (isLoading || !data) return <div className="page-loading" role="status">{t('Загрузка...')}</div>

  const v = data.visit
  const p = data.protocol
  const hasFinal = !!p?.final
  const shownVersion = hasFinal && version === 'final' ? p!.final : p?.draft ?? null
  const duration = v.duration_sec || (segments.length ? segments[segments.length - 1].end : 0)
  const events: PlayerEvent[] = items.flatMap((c, i) => {
    const idx = located[i]
    if (idx < 0 || c.kind !== 'forbidden') return []
    return [{ t: segments[idx].start, kind: c.category === 'fraud' ? 'crit' : 'warn', label: c.title } as PlayerEvent]
  })
  const fraud = data.violations.filter((x) => x.category === 'fraud')
  const noteTone = fraud.length ? 'is-crit' : data.violations.length ? 'is-warn' : v.note && /полностью/.test(v.note) ? 'is-good' : 'is-warn'
  const NoteIcon = fraud.length ? OctagonAlert : noteTone === 'is-good' ? CircleCheck : TriangleAlert

  const jump = (idx: number) => {
    if (idx < 0) return
    setFocus(idx)
    playerRef.current?.seek(segments[idx].start)
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const copy = async () => {
    const header = [L('Протокол приёма', 'Visit note'), v.when, v.seller_name, v.specialty].filter(Boolean).join(' · ')
    try {
      await navigator.clipboard.writeText(protocolText(data.fields, shownVersion, header))
      toast(L('Протокол скопирован — вставьте его в МИС.', 'The note is copied — paste it into the EMR.'))
    } catch {
      toast(L('Не удалось скопировать. Выделите текст протокола вручную.', 'Could not copy. Select the note text manually.'))
    }
  }

  return (
    <div className="cl-visit">
      <nav className="cl-crumbs" aria-label={L('Навигация', 'Breadcrumbs')}>
        <Link to="/visits">{L('Приёмы', 'Visits')}</Link><ChevronRight aria-hidden="true" /><span>{v.when}</span>
      </nav>
      <header className="cl-visit-head">
        <div>
          <h1 className="cl-visit-title" translate="no">{v.is_visit ? (v.reason || L('Приём', 'Visit')) : L('Не приём пациента', 'Not a patient visit')}</h1>
          <div className="cl-visit-meta">
            <span translate="no">{v.seller_name}{v.specialty ? `, ${v.specialty.toLowerCase()}` : ''}</span>
            <span translate="no">{v.store_name}</span>
            <span>{minutes(v.duration_sec)}</span>
            {v.visit_type && <span>{v.visit_type === 'follow_up' ? L('повторный приём', 'follow-up visit') : L('первичный приём', 'first visit')}</span>}
          </div>
        </div>
        {v.is_visit && (
          <div className="cl-visit-scores">
            <Tile title={L('Сервис', 'Service')} hint={HINT.service} value={<Score value={v.service} />} />
            <Tile title={L('Компетентность', 'Competence')} hint={HINT.competence} value={<Score value={v.competence} />} />
          </div>
        )}
      </header>
      {v.note && <div className={`cl-note ${noteTone}`}><NoteIcon aria-hidden="true" /><span>{v.note}</span></div>}
      {!v.checks_done && v.is_visit && (
        <div className="cl-note is-warn"><TriangleAlert aria-hidden="true" />
          <span>{L('Проверка по правилам не удалась — запустите повторный анализ записи.', 'The rule check failed — re-run the analysis.')}</span></div>
      )}

      {segments.length > 0 && (
        <ConversationPlayer ref={playerRef} src={audioUrl} duration={duration} segments={segments} stages={[]} events={events}
          sourceLabel={v.source === 'mobile' ? L('Приложение врача', 'Doctor app') : undefined}
          audioNote={audioState === 'loading' ? t('Аудио загружается…') : audioState === 'missing' ? t('Аудиозапись недоступна') : audioState === 'none' ? t('Без аудио') : undefined} />
      )}

      <div className="cl-visit-grid">
        <section className="panel" aria-labelledby="cl-proto">
          <div className="panel-head cl-proto-head">
            <div>
              <h2 id="cl-proto" className="panel-title">{L('Протокол приёма', 'Visit note')}</h2>
              <div className="cl-proto-state">
                {p && <span>{L(...(PROTOCOL_STATUS[p.status] || [p.status, p.status]))}</span>}
                {p?.status === 'confirmed' && p.confirmed_at && (
                  <span>{new Date(p.confirmed_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{p.confirmed_by_name ? ` · ${p.confirmed_by_name}` : ''}</span>
                )}
              </div>
            </div>
            <div className="cl-toolbar">
              {hasFinal && (
                <div className="seg" role="group" aria-label={L('Версия протокола', 'Note version')}>
                  <button type="button" aria-pressed={version === 'final'} onClick={() => setVersion('final')}>{L('Версия врача', 'Doctor’s version')}</button>
                  <button type="button" aria-pressed={version === 'draft'} onClick={() => setVersion('draft')}>{L('Черновик ИИ', 'AI draft')}</button>
                </div>
              )}
              {shownVersion && (
                <button type="button" className="btn btn-outline btn-sm" onClick={copy}><Copy size={14} aria-hidden="true" />{L('Скопировать', 'Copy')}</button>
              )}
            </div>
          </div>
          <div className="cl-panel-body">
            {!v.is_visit ? (
              <p className="cl-muted">{L('В записи нет приёма пациента — протокол не составляется.', 'The recording has no patient visit, so no note is drafted.')}</p>
            ) : (
              <ProtocolSections fields={data.fields} protocol={shownVersion}
                empty={p?.status === 'failed' ? L('Черновик составить не удалось. Запустите повторный анализ записи.', 'The draft could not be made. Re-run the analysis.')
                  : L('Протокол ещё готовится.', 'The note is being prepared.')} />
            )}
            {v.is_visit && shownVersion && (
              <p className="cl-disclaimer">{L('Черновик составлен ИИ только по тому, что прозвучало на приёме. Врач проверяет и подтверждает его в приложении.',
                'The draft is made by AI only from what was said in the visit. The doctor reviews and confirms it in the app.')}</p>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="cl-checks">
          <div className="panel-head">
            <div>
              <h2 id="cl-checks" className="panel-title">{L('Проверка по правилам', 'Rule check')}</h2>
              <div className="panel-sub">{L('Нажмите на цитату — откроется место в расшифровке.', 'Click a quote to open its place in the transcript.')}</div>
            </div>
          </div>
          <div className="cl-panel-body">
            {data.violations.length > 0 && (
              <>
                <h3 className="cl-group-title">{L('Не должно быть', 'Must not happen')}</h3>
                <ul className="cl-checks">
                  {data.violations.map((c, i) => <CheckRow key={`v${i}`} c={c} idx={located[i]} onJump={jump} />)}
                </ul>
              </>
            )}
            {(['service', 'competence'] as const).map((cat) => {
              const rows = data.checks.map((c, i) => ({ c, idx: located[data.violations.length + i] })).filter((x) => x.c.category === cat)
              if (!rows.length) return null
              return (
                <div key={cat}>
                  <h3 className="cl-group-title">{L(...CATEGORY[cat])}</h3>
                  <ul className="cl-checks">
                    {rows.sort((a, b) => order(a.c) - order(b.c)).map(({ c, idx }, i) => <CheckRow key={`${cat}${i}`} c={c} idx={idx} onJump={jump} />)}
                  </ul>
                </div>
              )
            })}
            {!items.length && <p className="cl-muted">{L('Проверок по правилам нет.', 'No rule checks.')}</p>}
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="cl-tr">
        <div className="panel-head">
          <div>
            <h2 id="cl-tr" className="panel-title">{L('Расшифровка', 'Transcript')}</h2>
            <div className="panel-sub">{L('Реплики, где сработал запрет, выделены.', 'Lines where a prohibition was triggered are highlighted.')}</div>
          </div>
        </div>
        <div className="cl-panel-body">
          <ol className="cl-transcript" ref={listRef}>
            {segments.map((s, i) => (
              <li key={i} data-idx={i} className={`cl-line ${s.role === 'seller' ? 'is-doctor' : 'is-patient'}${hits.has(i) ? ` is-hit${hits.get(i) === 'crit' ? ' is-crit' : ''}` : ''}${focus === i ? ' is-focus' : ''}`}>
                <span className="cl-line-time">{clock(s.start)}</span>
                <span className="cl-line-who">{s.role === 'seller' ? L('Врач', 'Doctor') : s.role === 'unknown' ? '—' : L('Пациент', 'Patient')}</span>
                <span translate="no">{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}

// Сначала то, что не выполнено: так главврач видит проблемы первыми
const order = (c: VisitCheck) => ({ missed: 0, partial: 1, met: 2, na: 3, violated: -1 }[c.status] ?? 4)

function CheckRow({ c, idx, onJump }: { c: VisitCheck; idx: number; onJump: (idx: number) => void }) {
  const forbidden = c.kind === 'forbidden'
  return (
    <li className="cl-check">
      <StatusIcon status={c.status} />
      <div>
        <div className="cl-check-title">
          {forbidden ? <SignalChip title={c.title} category={c.category} severity={c.severity} /> : <span translate="no">{c.title}</span>}
          {!forbidden && <span className="cl-check-status">{L(...STATUS[c.status].label)}</span>}
        </div>
        {c.comment && <div className="cl-check-comment" translate="no">{c.comment}</div>}
        {c.quote && (idx >= 0
          ? <button type="button" className={`cl-quote ${forbidden ? 'is-crit' : 'is-good'}`} onClick={() => onJump(idx)} translate="no">«{c.quote}»</button>
          : <span className={`cl-quote ${forbidden ? 'is-crit' : 'is-good'}`} translate="no">«{c.quote}»</span>)}
      </div>
    </li>
  )
}

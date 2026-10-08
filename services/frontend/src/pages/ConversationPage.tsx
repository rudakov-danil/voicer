import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, Link2, Trash2, Search, X, ShieldAlert, MessageCircleWarning, CircleCheck,
  CircleX, Sparkles, RefreshCw, Loader, ShoppingBag, AlertCircle,
} from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { analyticsApi } from '@/api/analytics'
import { recorderApi } from '@/api/recorder'
import { OutcomeTag } from '@/components/OutcomeTag'
import { Meter } from '@/components/ui/Meter'
import { clock } from '@/components/ui/Fingerprint'
import { highlightSegmentText } from '@/components/scripts/conversationHelpers'
import {
  ConversationPlayer, type PlayerHandle, type PlayerSegment, type PlayerStage, type PlayerEvent,
} from '@/components/conversation/Player'
import {
  CALL_CATEGORY_LABELS, ClientHistory, SummaryMarkdown, BLOCK_STATUS_META,
  locateQuote, useConversationAnalysis, useObjectionTypeLabel,
} from '@/components/conversation/shared'
import { t, L, locale } from '@/i18n'

/* Карточка разговора по концепту (ui-concept/conversation.html): шапка с вердиктом,
   плеер-консоль с дорожками, расшифровка с пометками на полях и разбор справа.
   Возражения, нарушения и доказательства этапов хранятся цитатами — их место в
   разговоре находим по совпадению слов (locateQuote). */

const LANE: Record<string, 's' | 'c' | 'u'> = { seller: 's', customer: 'c', client: 'c' }
const PAUSE_SEC = 10

interface Note {
  kind: 'crit' | 'warn' | 'good'
  title: string
  body?: string
  quote?: string
}

function initialsOf(name?: string | null) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function fmtWeight(w: number | null | undefined) {
  if (w == null) return ''
  return L(`вес ${w.toFixed(2).replace('.', ',')}`, `weight ${w.toFixed(2)}`)
}

export function ConversationPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const objectionLabel = useObjectionTypeLabel()
  const playerRef = useRef<PlayerHandle>(null)
  const trRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(0)
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [audioState, setAudioState] = useState<'none' | 'loading' | 'ready' | 'missing'>('loading')
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['conversation-detail', id],
    queryFn: () => dashboardApi.getConversationDetail(id),
    enabled: !!id,
  })

  const c: any = data?.conversation || {}
  const rawSegments: any[] = data?.transcript?.segments || []
  const segments = useMemo(
    () => rawSegments
      .filter((s) => s.start_ms != null)
      .map((s) => ({
        start: (s.start_ms || 0) / 1000,
        end: (s.end_ms ?? s.start_ms ?? 0) / 1000,
        lane: LANE[(s.speaker_role || '').toLowerCase()] || 'u',
        text: s.text || '',
      })),
    [rawSegments],
  )
  const { highlightRules, upsellResults, crosssellResults } = useConversationAnalysis(c, rawSegments)

  // Аудио — blob с авторизацией
  useEffect(() => {
    setAudioUrl(undefined)
    if (!data) return
    if (!c.recording_id || c.source === 'transcript') { setAudioState('none'); return }
    setAudioState('loading')
    let url: string | undefined
    let cancelled = false
    recorderApi.getAudioBlobUrl(c.recording_id)
      .then((u) => { if (cancelled) URL.revokeObjectURL(u); else { url = u; setAudioUrl(u); setAudioState('ready') } })
      .catch(() => { if (!cancelled) setAudioState('missing') })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, c.recording_id, c.source])

  const duration = Number(c.duration_seconds) || (segments.length ? segments[segments.length - 1].end : 0)
  const scriptResult = (c.script_results || []).find((sr: any) => sr.was_applied !== false) || (c.script_results || [])[0]
  const steps: any[] = scriptResult?.step_scores || []
  const blocks: any[] = scriptResult?.block_results || []
  const isFulltext = scriptResult?.script_type === 'fulltext' && blocks.length > 0
  const objections: any[] = c.objections || []
  const violations: any[] = c.compliance_violations || []

  // ── Где что прозвучало ────────────────────────────────────────────────────
  const located = useMemo(() => {
    const seg = segments
    const at = (quote: string) => locateQuote(quote || '', seg)
    const stagesRaw: Array<{ idx: number; n: number; title: string; score: number | null; weight: number | null }> = []
    if (isFulltext) {
      blocks.forEach((b: any, i: number) => {
        if (b.status === 'missed' || b.status === 'not_applicable') return
        const idx = at(b.quote || '')
        if (idx >= 0) stagesRaw.push({ idx, n: i + 1, title: b.title, score: null, weight: null })
      })
    } else {
      steps.forEach((s: any, i: number) => {
        const idx = at(s.evidence || '')
        if (idx >= 0) stagesRaw.push({ idx, n: i + 1, title: s.step_name, score: Number(s.score ?? 0), weight: s.weight ?? null })
      })
    }
    stagesRaw.sort((a, b) => a.idx - b.idx)
    const stages: PlayerStage[] = stagesRaw.map((s, i) => ({
      start: seg[s.idx].start,
      end: i + 1 < stagesRaw.length ? seg[stagesRaw[i + 1].idx].start : duration,
      n: s.n,
      title: s.title,
      score: s.score,
    }))
    const stageAt = new Map<number, (typeof stagesRaw)[number]>()
    stagesRaw.forEach((s) => { if (!stageAt.has(s.idx)) stageAt.set(s.idx, s) })

    const notes = new Map<number, Note[]>()
    const events: PlayerEvent[] = []
    const push = (idx: number, note: Note, ev: PlayerEvent['kind'], label: string) => {
      if (idx < 0) return
      notes.set(idx, [...(notes.get(idx) || []), note])
      events.push({ t: seg[idx].start, kind: ev, label })
    }
    violations.forEach((v: any) => {
      const high = (v.severity || '').toLowerCase() === 'high'
      push(at(v.evidence), {
        kind: 'crit',
        title: `${v.rule_title}${high ? '' : ` · ${t('средняя важность')}`}`,
        body: v.explanation,
      }, high ? 'crit' : 'crit-mid', v.rule_title)
    })
    objections.forEach((o: any) => {
      const label = objectionLabel(o.type)
      push(at(o.raw_text), {
        kind: o.is_resolved ? 'good' : 'warn',
        title: L(`Возражение «${label}» — ${o.is_resolved ? 'отработано' : 'без ответа'}`, `Objection “${t(label)}” — ${o.is_resolved ? 'handled' : 'unanswered'}`),
        body: o.resolution_technique || undefined,
      }, o.is_resolved ? 'warn-ok' : 'warn', L(`возражение «${label}»`, `objection “${t(label)}”`))
    })
    for (const [results, kind] of [[upsellResults, 'Апсейл'], [crosssellResults, 'Кросс-сейл']] as const) {
      for (const r of results) {
        const offers: Record<string, string[]> = r.offer_quotes || {}
        const firstQuote = Object.values(offers).flat().find((q) => typeof q === 'string')
        const required = (r.required_offers || []).length
        const offered = (r.offered_items || []).length
        if (!firstQuote) continue
        push(at(firstQuote), {
          kind: offered >= required ? 'good' : 'warn',
          title: L(`${kind} · ${offered} из ${required} по правилу «${r.trigger_product}»`, `${t(kind)} · ${offered} of ${required} for “${r.trigger_product}”`),
          body: (r.missed_items || []).length ? L(`Не предложено: ${r.missed_items.join(', ')}`, `Not offered: ${r.missed_items.join(', ')}`) : undefined,
        }, 'ok', t('предложение допродажи'))
      }
    }
    events.sort((a, b) => a.t - b.t)
    return { stages, stageAt, notes, events }
  }, [segments, isFulltext, blocks, steps, violations, objections, upsellResults, crosssellResults, duration, objectionLabel])

  const playerSegments: PlayerSegment[] = useMemo(() => segments.map(({ start, end, lane }) => ({ start, end, lane })), [segments])

  // Текущая реплика — для подсветки и «Следовать»
  const nowIdx = useMemo(() => {
    let idx = -1
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= now + 0.05) idx = i; else break
    }
    return idx
  }, [segments, now])

  useEffect(() => {
    if (!follow || nowIdx < 0 || !trRef.current) return
    const el = trRef.current.querySelector<HTMLElement>(`[data-seg="${nowIdx}"]`)
    if (!el) return
    const box = trRef.current
    const top = el.offsetTop - box.offsetTop
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 80) {
      box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: 'smooth' })
    }
  }, [nowIdx, follow])

  // Ссылка на момент: /conversations/:id?t=125
  useEffect(() => {
    const ts = Number(searchParams.get('t'))
    if (ts > 0 && segments.length) setTimeout(() => playerRef.current?.seek(ts), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.length])

  const copyMoment = async () => {
    const url = `${window.location.origin}/conversations/${id}?t=${Math.round(now)}`
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt(t('Ссылка на момент'), url) }
  }

  const handleDelete = async () => {
    if (!window.confirm(t('Удалить этот диалог? Действие необратимо — разговор, транскрипт и запись будут удалены.'))) return
    setDeleting(true)
    try {
      await analyticsApi.deleteConversation(id)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      navigate('/conversations', { replace: true })
    } catch {
      alert(t('Не удалось удалить диалог. Попробуйте ещё раз.'))
      setDeleting(false)
    }
  }

  if (isLoading) return <div className="cv-page"><div className="muted" style={{ padding: 24 }}>{t('Загрузка...')}</div></div>
  if (isError || !data) {
    return (
      <div className="cv-page">
        <div className="empty">
          <h3>{t('Разговор не найден')}</h3>
          <p>{t('Возможно, он удалён или недоступен вашей роли.')}</p>
          <Link className="btn btn-sm" to="/conversations">{t('К списку разговоров')}</Link>
        </div>
      </div>
    )
  }

  const when = c.recorded_at || c.analyzed_at || c.session_date
  const whenDate = when ? new Date(when) : null
  const notScored = c.is_scorable === false
  const score = c.overall_score != null ? Math.round(c.overall_score) : null
  const upsell = (() => {
    let done = 0, need = 0
    for (const r of [...upsellResults, ...crosssellResults]) {
      const req = (r.required_offers || []).length
      need += req
      done += Math.min((r.offered_items || []).length, req)
    }
    return need ? [done, need] as const : null
  })()
  const q = query.trim().toLowerCase()
  const isCall = !!c.call_direction || (c.source || '').startsWith('call')
  const sourceLabel = c.source === 'badge' ? t('Бейдж · вырезан из записи смены')
    : c.source === 'transcript' ? t('Загружен текстом — без аудио')
    : isCall ? (c.call_direction === 'inbound' ? t('Входящий звонок') : t('Исходящий звонок'))
    : t('Загруженное аудио')

  // Разбор балла: ширина — вес этапа, заливка — балл
  const weightSum = steps.reduce((a, s) => a + (s.weight ?? 0), 0) || steps.length || 1
  const lost = steps
    .map((s) => ({ name: s.step_name, lost: ((s.weight ?? 1 / steps.length) * (100 - Number(s.score ?? 0))) }))
    .sort((a, b) => b.lost - a.lost)[0]

  return (
    <div className="cv-page">
      <nav className="cv-crumbs" aria-label={t('Навигация')}>
        <Link to="/conversations">{t('Разговоры')}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span translate="no">{c.store_name || '—'}</span>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{whenDate ? `${whenDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}, ${whenDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}` : '—'}</span>
      </nav>

      <header className="cv-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="cv-title" translate={c.topic ? 'no' : undefined}>{c.topic || t('Разговор без темы')}</h1>
          <div className="cv-meta">
            <span className="person">
              <span className="avatar" aria-hidden="true" translate="no">{initialsOf(c.seller_name)}</span>
              <span>
                <span className="person-name" translate="no">{c.seller_name || '—'}</span>
                <span className="person-sub" translate="no">{c.store_name}</span>
              </span>
            </span>
            <span className="cv-dot" aria-hidden="true">·</span>
            <span>{whenDate ? whenDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + whenDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            <span className="cv-dot" aria-hidden="true">·</span>
            <span className="mono">{clock(duration)}</span>
            {c.client_phone && <><span className="cv-dot" aria-hidden="true">·</span><span className="mono" translate="no">{c.client_phone}</span></>}
          </div>
        </div>
        <div>
          <div className="cv-verdict">
            <div className="cv-card">
              <div className="cv-card-label">
                {t('Исход')}{c.outcome_confidence != null && L(` · уверенность ${Math.round(c.outcome_confidence * 100)} %`, ` · confidence ${Math.round(c.outcome_confidence * 100)}%`)}
              </div>
              <OutcomeTag outcome={c.outcome || 'unknown'} />
            </div>
            <div className="cv-card">
              <div className="cv-card-label">{t('Балл по скрипту')}</div>
              <div className="cv-card-value">{notScored || score == null ? '—' : <>{score} <small>/ 100</small></>}</div>
            </div>
            <div className={`cv-card ${violations.length ? 'is-crit' : ''}`}>
              <div className="cv-card-label">{t('Нарушения')}</div>
              <div className="cv-card-value">{violations.length}</div>
            </div>
            <div className="cv-card">
              <div className="cv-card-label">{t('Допродажа')}</div>
              <div className="cv-card-value">{upsell ? <>{upsell[0]} <small>{L(`из ${upsell[1]}`, `of ${upsell[1]}`)}</small></> : '—'}</div>
            </div>
          </div>
          <div className="cv-actions">
            <button type="button" className="btn" onClick={copyMoment}>
              <Link2 size={15} aria-hidden="true" />{copied ? t('Ссылка скопирована') : t('Ссылка на момент')}
            </button>
            <button type="button" className="btn btn-ghost cv-danger" onClick={handleDelete} disabled={deleting}>
              <Trash2 size={15} aria-hidden="true" />{deleting ? t('Удаление…') : t('Удалить')}
            </button>
          </div>
        </div>
      </header>

      {notScored && (
        <div className="search-note" style={{ background: 'var(--panel-2)' }}>
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            {L(
              `Звонок отнесён к категории «${CALL_CATEGORY_LABELS[c.call_category] || c.call_category || 'нецелевой'}» и не оценивается по скрипту — он не влияет на рейтинг.`,
              `The call is categorised as “${t(CALL_CATEGORY_LABELS[c.call_category] || c.call_category || 'нецелевой')}” and isn’t scored against the script — it doesn’t affect the rating.`,
            )}
          </span>
        </div>
      )}

      <ConversationPlayer
        ref={playerRef}
        src={audioUrl}
        duration={duration}
        segments={playerSegments}
        stages={located.stages}
        events={located.events}
        sourceLabel={sourceLabel}
        audioNote={audioState === 'loading' ? t('Аудио загружается…') : audioState === 'missing' ? t('Аудиозапись недоступна') : audioState === 'none' ? t('Без аудио') : undefined}
        onTime={setNow}
      />

      <div className="cv-grid">
        <div className="cv-main">
          <section className="panel">
            <div className="cv-tr-head">
              <div>
                <h2 className="panel-title">{t('Расшифровка')}</h2>
                <div className="panel-sub">{L(`${segments.length} реплик · роли размечены автоматически`, `${segments.length} turns · roles detected automatically`)}</div>
              </div>
              <div className="cv-tr-tools">
                <label className="input" style={{ height: 30, width: 210 }}>
                  <Search size={14} aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Найти в разговоре…')} aria-label={t('Найти в разговоре…')} />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label={t('Очистить')}><X size={13} /></button>}
                </label>
                <button type="button" role="switch" aria-checked={follow} className="cv-switch" onClick={() => setFollow((v) => !v)}>
                  <span className="cv-switch-track" aria-hidden="true" />{t('Следовать')}
                </button>
              </div>
            </div>
            <div className="cv-transcript" ref={trRef}>
              {segments.length === 0 && <div className="empty"><p>{t('Расшифровки нет.')}</p></div>}
              {segments.map((seg, i) => {
                const prev = segments[i - 1]
                const gap = prev ? seg.start - prev.end : 0
                const stage = located.stageAt.get(i)
                const notes = located.notes.get(i) || []
                const hit = q && seg.text.toLowerCase().includes(q)
                const who = seg.lane === 's' ? (isCall ? t('Оператор') : t('Продавец')) : seg.lane === 'c' ? t('Покупатель') : '—'
                return (
                  <div key={i}>
                    {gap >= PAUSE_SEC && (
                      <div className="cv-gap">{L(`Пауза ${Math.round(gap)} с`, `Pause ${Math.round(gap)} s`)}</div>
                    )}
                    <div
                      data-seg={i}
                      className={`cv-line is-${seg.lane} ${i === nowIdx ? 'is-now' : ''} ${q && !hit ? 'is-dim' : ''}`}
                    >
                      {stage && (
                        <span className="cv-step-chip">
                          <b>{stage.n}</b><span translate="no">{stage.title}</span>
                          {stage.score != null && <span className={`sc ${stage.score < 60 ? 'is-low' : ''}`}>{Math.round(stage.score)}</span>}
                        </span>
                      )}
                      <button type="button" className="cv-tc" onClick={() => playerRef.current?.seek(seg.start, true)} aria-label={L(`Слушать с ${clock(seg.start)}`, `Play from ${clock(seg.start)}`)}>
                        {clock(seg.start)}
                      </button>
                      <span className="cv-who">{who}</span>
                      <span className="cv-txt" translate="no">
                        {q && hit ? <SearchMark text={seg.text} q={q} /> : highlightSegmentText(seg.text, seg.lane === 's' ? highlightRules : highlightRules.filter((r) => !r.kind.startsWith('upsell-') && !r.kind.startsWith('crosssell-')))}
                      </span>
                      {notes.map((n, k) => (
                        <div key={k} className={`cv-note is-${n.kind}`}>
                          <div className="cv-note-title">
                            {n.kind === 'crit' ? <ShieldAlert size={14} aria-hidden="true" /> : n.kind === 'warn' ? <MessageCircleWarning size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
                            <span>{n.title}</span>
                          </div>
                          {n.body && <div translate="no">{n.body}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <DynamicsPanel c={c} segments={segments} />
        </div>

        <aside className="cv-side">
          <SummaryPanel conversationId={id} cached={c.summary} />

          {scriptResult && !notScored && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">
                    {isFulltext ? t('Покрытие скрипта') : t('Скрипт')}: {score ?? '—'} {L('из 100', 'of 100')}
                  </h2>
                  <div className="panel-sub" translate="no">{scriptResult.script_name}</div>
                </div>
              </div>
              <div className="panel-body">
                {!isFulltext && steps.length > 0 && (
                  <>
                    <div className="cv-wbar" aria-hidden="true">
                      {steps.map((s, i) => (
                        <div key={i} className={`cv-wseg ${Number(s.score ?? 0) < 60 ? 'is-low' : ''}`}
                          style={{ flex: `${(s.weight ?? 1 / steps.length) / weightSum} 1 0` }}
                          title={`${s.step_name}: ${Math.round(Number(s.score ?? 0))}`}>
                          <span style={{ width: `${Math.max(0, Math.min(100, Number(s.score ?? 0)))}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="cv-wbar-note">
                      {L('Ширина — вес этапа, заливка — балл.', 'Width is the stage weight, fill is the score.')}
                      {lost && lost.lost > 0.5 && L(` Больше всего баллов потеряно на этапе «${lost.name}».`, ` Most points were lost at “${lost.name}”.`)}
                    </div>
                  </>
                )}
                {!isFulltext && steps.map((s, i) => {
                  const idx = locateQuote(s.evidence || '', segments)
                  return (
                    <div key={i} className="cv-step-line">
                      <span className="cv-step-n">{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="cv-step-name"><span translate="no">{s.step_name}</span><span className="cv-step-w">{fmtWeight(s.weight)}</span></div>
                        {s.evidence && <div className="cv-step-note" translate="no">«{s.evidence}»</div>}
                        {idx >= 0 && (
                          <button type="button" className="cv-step-go" onClick={() => playerRef.current?.seek(segments[idx].start, true)}>▶ {clock(segments[idx].start)}</button>
                        )}
                      </div>
                      <Meter score={s.score} />
                    </div>
                  )
                })}
                {isFulltext && blocks.map((b: any, i: number) => {
                  const meta = BLOCK_STATUS_META[b.status] || BLOCK_STATUS_META.missed
                  const idx = b.quote ? locateQuote(b.quote, segments) : -1
                  const tone = b.status === 'spoken' ? 'is-good' : b.status === 'paraphrased' ? 'is-warn' : b.status === 'missed' ? 'is-crit' : 'is-plain'
                  return (
                    <div key={b.block_id || i} className="cv-step-line">
                      <span className="cv-step-n">{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="cv-step-name">
                          <span translate="no">{b.title}</span>
                          {!b.is_mandatory && <span className="cv-step-w">{t('ситуативный')}</span>}
                        </div>
                        {b.quote && <div className="cv-step-note" translate="no">«{b.quote}»</div>}
                        {b.comment && <div className="cv-step-note" translate="no">{b.comment}</div>}
                        {idx >= 0 && (
                          <button type="button" className="cv-step-go" onClick={() => playerRef.current?.seek(segments[idx].start, true)}>▶ {clock(segments[idx].start)}</button>
                        )}
                      </div>
                      <span className={`flag ${tone}`}>{t(meta.label)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {(upsellResults.length > 0 || crosssellResults.length > 0) && (
            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">{t('Допродажа')}</h2></div>
              <div className="panel-body">
                {[...upsellResults.map((r) => ['Апсейл', r] as const), ...crosssellResults.map((r) => ['Кросс-сейл', r] as const)].map(([kind, r], i) => (
                  <div key={i} className="cv-offer-group">
                    <div className="cv-offer-head">
                      <ShoppingBag size={14} aria-hidden="true" />
                      <span>{t(kind)} · <span translate="no">{r.trigger_product}</span></span>
                    </div>
                    {(r.required_offers || []).map((item: string) => {
                      const yes = (r.offered_items || []).includes(item)
                      return (
                        <div key={item} className={`cv-offer ${yes ? 'is-yes' : 'is-no'}`}>
                          {yes ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
                          <span translate="no">{item}</span>
                          <span className="muted">{yes ? t('предложено') : t('не предложено')}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(objections.length > 0 || violations.length > 0) && (
            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">{t('Возражения и нарушения')}</h2></div>
              <div className="panel-body cv-moments">
                {[
                  ...violations.map((v: any) => ({ key: `v${v.id}`, quote: v.evidence, kind: (v.severity === 'high' ? 'crit' : 'crit-mid') as PlayerEvent['kind'], title: v.rule_title, sub: v.explanation })),
                  ...objections.map((o: any, i: number) => ({ key: `o${i}`, quote: o.raw_text, kind: (o.is_resolved ? 'warn-ok' : 'warn') as PlayerEvent['kind'], title: L(`Возражение «${objectionLabel(o.type)}»`, `Objection “${t(objectionLabel(o.type))}”`), sub: o.is_resolved ? (o.resolution_technique || t('Отработано')) : t('Без ответа') })),
                ].map((m) => {
                  const idx = locateQuote(m.quote || '', segments)
                  return (
                    <div key={m.key} className="cv-moment">
                      <button type="button" className="cv-step-go" disabled={idx < 0} onClick={() => idx >= 0 && playerRef.current?.seek(segments[idx].start, true)}>
                        {idx >= 0 ? clock(segments[idx].start) : '—'}
                      </button>
                      <span className={`mk is-${m.kind}`} aria-hidden="true" />
                      <div style={{ minWidth: 0 }}>
                        <div className="cv-step-name">{m.title}</div>
                        {m.quote && <div className="cv-step-note" translate="no">«{m.quote}»</div>}
                        {m.sub && <div className="cv-step-note" translate="no">{m.sub}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <ClientHistory conversationId={id} onSelect={(other) => navigate(`/conversations/${other}`)} />
        </aside>
      </div>
    </div>
  )
}

function SearchMark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="cv-search-hit">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

/** Итог разговора — резюме LLM. Готовое приходит в карточке; составляем по кнопке. */
function SummaryPanel({ conversationId, cached }: { conversationId: string; cached?: string | null }) {
  const [summary, setSummary] = useState<string | null>(cached || null)
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'no-transcript'>('idle')
  useEffect(() => { setSummary(cached || null); setState('idle') }, [conversationId, cached])

  const generate = async (force: boolean) => {
    setState('loading')
    try {
      const res = await analyticsApi.getConversationSummary(conversationId, force)
      setSummary(res?.summary || null)
      setState('idle')
    } catch (e: any) {
      setState(e?.response?.status === 422 ? 'no-transcript' : 'error')
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={15} aria-hidden="true" style={{ color: 'var(--accent)' }} />{t('Итог разговора')}
        </h2>
        {summary && (
          <button type="button" className="btn-icon" onClick={() => generate(true)} disabled={state === 'loading'} title={t('Сгенерировать резюме заново')} aria-label={t('Сгенерировать резюме заново')}>
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="panel-body">
        {state === 'loading' ? (
          <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader size={14} aria-hidden="true" />{t('ИИ составляет резюме диалога...')}</div>
        ) : summary ? (
          <div translate="no"><SummaryMarkdown text={summary} /></div>
        ) : state === 'no-transcript' ? (
          <div className="muted">{t('Для этого разговора нет транскрипта — резюме недоступно.')}</div>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 10 }}>{t('Короткий разбор: что произошло, что сработало и что поправить.')}</p>
            {state === 'error' && <p style={{ color: 'var(--crit-ink)', marginBottom: 10 }}>{t('Не удалось сгенерировать резюме. Попробуйте ещё раз позже.')}</p>}
            <button type="button" className="btn btn-sm" onClick={() => generate(false)}><Sparkles size={13} aria-hidden="true" />{t('Составить резюме')}</button>
          </>
        )}
        {summary && <div className="cv-step-note" style={{ marginTop: 10 }}>{t('Резюме составлено ИИ на основе транскрипта. Может содержать неточности.')}</div>}
      </div>
    </section>
  )
}

/** Динамика: кто сколько говорил, перебивания, монолог, тишина. */
function DynamicsPanel({ c, segments }: { c: any; segments: Array<{ start: number; end: number; lane: string }> }) {
  const seller = segments.filter((s) => s.lane === 's').reduce((a, s) => a + (s.end - s.start), 0)
  const customer = segments.filter((s) => s.lane === 'c').reduce((a, s) => a + (s.end - s.start), 0)
  const share = c.talk_ratio != null ? Math.round(c.talk_ratio * 100) : (seller + customer ? Math.round((seller / (seller + customer)) * 100) : null)
  if (share == null) return null
  const tooMuch = share > 65
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{t('Динамика разговора')}</h2>
          <div className="panel-sub">{t('Доля времени речи сотрудника. Ориентир для продаж — 40–60%')}</div>
        </div>
      </div>
      <div className="panel-body">
        <div className="cv-talk" aria-hidden="true">
          <span style={{ flex: share }} />
          <span style={{ flex: 100 - share }} />
        </div>
        <div className="cv-talk-legend">
          <span>{t('Продавец')} <b>{share} %</b></span>
          <span>{t('Покупатель')} <b>{100 - share} %</b></span>
        </div>
        {tooMuch && <div className="cv-talk-note"><AlertCircle size={14} aria-hidden="true" />{t('Продавец говорит больше нормы — покупатель мало рассказал о задаче.')}</div>}
        <div className="cv-dyn-grid">
          <div className="cv-dyn" title={t('Сколько раз стороны перебивали друг друга')}>
            <b>{c.interruptions_count ?? '—'}</b><span>{t('Перебивания')}</span>
          </div>
          <div className="cv-dyn" title={t('Самый длинный непрерывный монолог сотрудника')}>
            <b>{c.longest_monologue_seconds != null ? clock(c.longest_monologue_seconds) : '—'}</b><span>{t('Макс. монолог')}</span>
          </div>
          <div className="cv-dyn" title={t('Доля пауз без речи от длительности разговора')}>
            <b>{c.silence_ratio != null ? `${Math.round(c.silence_ratio * 100)} %` : '—'}</b><span>{t('Тишина')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { adminApi } from '@/api/admin'
import { recorderApi } from '@/api/recorder'
import { scriptsApi } from '@/api/scripts'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { Drawer } from '@/components/Drawer'
import { AudioPlayer } from '@/components/AudioPlayer'
import { AudioUploadModal } from '@/components/AudioUpload'
import { TranscriptUploadModal } from '@/components/TranscriptUpload'
import { CallUploadModal } from '@/components/CallUpload'
import { useTerms } from '@/lib/terms'
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useSearchParams, useOutletContext } from 'react-router-dom'
import { Upload, CheckCircle, Clock, Loader, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, X, FileText, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { MultiSelect } from '@/components/scripts/MultiSelect'
import {
  avatarColorFor,
  highlightSegmentText,
  highlightRulesForSell,
  analyzeSell,
  type HighlightRule,
} from '@/components/scripts/conversationHelpers'

type SortBy  = 'date' | 'name' | 'duration' | 'store'
type SortDir = 'asc' | 'desc'

const OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Покупка',
  deferred: 'Отложено',
  price_refusal: 'Отказ по цене',
  competitor: 'Ушёл к конкурентам',
  unknown: 'Не определён',
}

// Исходы звонков (телефония) — добавляются к фильтру для telephony-организаций
const TELEPHONY_OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Продажа / заявка',
  appointment: 'Встреча назначена',
  callback: 'Перезвон',
  deferred: 'Думает',
  refusal: 'Отказ',
  transfer: 'Перевод звонка',
  non_target: 'Нецелевой',
  voicemail: 'Недозвон',
  unknown: 'Не определён',
}

function DirectionIcon({ direction }: { direction?: string | null }) {
  if (direction === 'inbound') return <PhoneIncoming size={13} style={{ color: 'var(--success)', flexShrink: 0 }} aria-label="Входящий" />
  if (direction === 'outbound') return <PhoneOutgoing size={13} style={{ color: '#6366F1', flexShrink: 0 }} aria-label="Исходящий" />
  return null
}

const OBJECTION_TYPE_LABELS: Record<string, string> = {
  price: 'Цена',
  quality: 'Качество',
  competitors: 'Конкуренты',
  timing: 'Время',
  trust: 'Доверие',
  not_ready: 'Не готов',
  functionality: 'Функциональность',
}

/** Лейблы типов возражений: настраиваемый справочник организации поверх стандартных. */
function useObjectionTypeLabel(): (type: string | undefined | null) => string {
  const { data: types } = useQuery({
    queryKey: ['objection-types'],
    queryFn: () => scriptsApi.listObjectionTypes(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const map = useMemo(() => {
    const m: Record<string, string> = { ...OBJECTION_TYPE_LABELS }
    for (const t of (types || [])) m[t.code] = t.label
    return m
  }, [types])
  return useCallback(
    (type: string | undefined | null) => (!type ? 'Возражение' : (map[type] || type)),
    [map],
  )
}

// ─── Sell badges ──────────────────────────────────────────────────────────────
// Метрика — "продавец УПОМЯНУЛ апсейл/кросс-сейл", а не "клиент купил".
// Это часть KPI продавца: попытка допродажи засчитывается, даже если клиент отказался.
type SellAnalysisStatus = { status: string; matched: number; total: number; missed: string[] }

function makeSellBadge(kind: 'upsell' | 'crosssell') {
  const noRulesTitle = kind === 'upsell'
    ? 'Правила апсейла не настроены для этого скрипта — система не знает, что считать апсейлом. Добавьте правила в разделе Скрипты.'
    : 'Правила кросс-сейла не настроены — система не знает, что считать кросс-сейлом. Добавьте правила в разделе Скрипты.'
  return function Badge({ analysis }: { analysis: SellAnalysisStatus }) {
    if (analysis.status === 'complete' || analysis.status === 'partial') return (
      <span
        className="tag tag-success"
        title={analysis.status === 'partial' && analysis.missed.length
          ? `Упомянуто ${analysis.matched} из ${analysis.total}. Пропущено: ${analysis.missed.join(', ')}`
          : `Упомянуто ${analysis.matched} из ${Math.max(analysis.total, analysis.matched)}`}
      >
        Да
      </span>
    )
    if (analysis.status === 'missed') return <span className="tag tag-danger">Нет</span>
    return (
      <span
        className="tag tag-neutral"
        title={noRulesTitle}
        style={{ cursor: 'help' }}
      >
        Правил нет
      </span>
    )
  }
}

const SellBadge = makeSellBadge('upsell')
const CrossSellBadge = makeSellBadge('crosssell')

function HighlightLegend() {
  return (
    <div className="hl-legend">
      <span className="hl-pill hl-pill--script">По тексту</span>
      <span className="hl-pill hl-pill--paraphrased">Своими словами</span>
      <span className="hl-pill hl-pill--upsell">Апсейл</span>
      <span className="hl-pill hl-pill--crosssell">Кросс-сейл</span>
      <span className="hl-pill hl-pill--objection">Возражение</span>
    </div>
  )
}

// ─── Pipeline status badge ────────────────────────────────────────────────────
function PipelineStatus({ status }: { status: string }) {
  if (status === 'processing') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:500, background:'rgba(245,158,11,0.12)', color:'#F59E0B' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:'#F59E0B', display:'inline-block', animation:'viq-pulse 1.4s ease-in-out infinite' }} />
      Транскрибация...
    </span>
  )
  if (status === 'transcribed') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:500, background:'rgba(99,102,241,0.12)', color:'#6366F1' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:'#6366F1', display:'inline-block', animation:'viq-pulse 1.4s ease-in-out 0.3s infinite' }} />
      Анализируется...
    </span>
  )
  if (status === 'failed') return (
    <span style={{ padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:500, background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕ Ошибка</span>
  )
  return null
}

// ─── Detailed card for in-progress recording ─────────────────────────────────
function RecordingDetail({ recording }: { recording: any }) {
  const status = recording.status as string
  const sellerName = recording.seller_name || '—'
  const sellerColorKey = recording.seller_id || recording.seller_name || ''
  const storeName = recording.store_name || '—'
  const dateObj = recording.started_at ? new Date(recording.started_at) : null
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' }) : '—'
  const timeStr = dateObj ? dateObj.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) : ''
  const mins = Math.floor((recording.duration_seconds || 0) / 60)
  const secs = (recording.duration_seconds || 0) % 60

  // Pipeline steps based on status progression
  // processing → transcribed → diarized → analyzed
  const isFailed  = status === 'failed'
  const isDiarized = ['diarized', 'analyzed'].includes(status)
  const isAnalyzed = status === 'analyzed'

  const steps = [
    { key:'upload',     label:'Загрузка файла',             done: true },
    { key:'transcribe', label:'Транскрибация (Whisper)',     done: status !== 'processing' },
    { key:'diarize',    label:'Распределение ролей',         done: isDiarized },
    { key:'analyze',    label:'Анализ соответствия скрипту', done: isAnalyzed },
  ]
  const currentStep = status === 'processing' ? 'transcribe'
    : status === 'transcribed' ? 'diarize'
    : status === 'diarized'    ? 'analyze'
    : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Seller + Store card */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg)', borderRadius:'var(--radius)' }}>
        <div style={{ width:44, height:44, borderRadius:'50%', background:avatarColorFor(sellerColorKey), display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:16, flexShrink:0 }}>
          {sellerName[0]?.toUpperCase() || '?'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:600, color:'var(--text)', fontSize:15 }}>{sellerName}</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:2 }}>{storeName}</div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <span className="tag tag-neutral">📅 {dateStr}, {timeStr}</span>
        {recording.duration_seconds
          ? <span className="tag tag-neutral">⏱ {mins}:{String(secs).padStart(2,'0')}</span>
          : <span className="tag tag-neutral" style={{ color:'var(--text-muted)' }}>Длительность определяется...</span>
        }
        {recording.file_size_bytes && (
          <span className="tag tag-neutral">💾 {(recording.file_size_bytes / 1024 / 1024).toFixed(1)} МБ</span>
        )}
      </div>

      {/* Pipeline progress */}
      <div>
        <div style={{ fontWeight:600, color:'var(--text)', marginBottom:12, fontSize:14 }}>Статус обработки</div>
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {steps.map((step, i) => {
            const isActive = step.key === currentStep && !isFailed
            const isFail   = isFailed && step.key === currentStep
            const isDone   = step.done && !isFailed
            const isPending = !step.done && step.key !== currentStep

            return (
              <div key={step.key} style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                {/* Icon + connector */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:24 }}>
                  <div style={{
                    width:24, height:24, borderRadius:'50%', flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background: isDone ? 'var(--success)' : isActive ? '#6366F1' : isFail ? 'var(--danger)' : 'var(--border)',
                    color: (isDone || isActive || isFail) ? 'white' : 'var(--text-muted)',
                    fontSize:13, fontWeight:700,
                  }}>
                    {isDone  && <CheckCircle size={14} />}
                    {isActive && <Loader size={14} style={{ animation:'viq-spin 1s linear infinite' }} />}
                    {isFail  && <AlertCircle size={14} />}
                    {isPending && <Clock size={14} />}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ width:2, flex:1, minHeight:20, background: isDone ? 'var(--success)' : 'var(--border)', margin:'2px 0' }} />
                  )}
                </div>

                {/* Label */}
                <div style={{ paddingBottom: i < steps.length - 1 ? 16 : 0, paddingTop:3 }}>
                  <div style={{
                    fontSize:14, fontWeight: isActive ? 600 : 400,
                    color: isDone ? 'var(--text)' : isActive ? '#6366F1' : isFail ? 'var(--danger)' : 'var(--text-muted)',
                  }}>
                    {step.label}
                    {isActive && <span style={{ marginLeft:6, fontSize:12, fontWeight:400, color:'var(--text-muted)' }}>— в процессе</span>}
                    {isDone   && <span style={{ marginLeft:6, fontSize:12, fontWeight:400, color:'var(--success)' }}>— готово</span>}
                    {isFail   && <span style={{ marginLeft:6, fontSize:12, fontWeight:400, color:'var(--danger)' }}>— ошибка</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error message */}
      {isFailed && recording.error_message && (
        <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', borderRadius:'var(--radius)', color:'var(--danger)', fontSize:13 }}>
          {recording.error_message}
        </div>
      )}

      {/* Hint */}
      {!isFailed && (
        <div style={{ fontSize:12, color:'var(--text-muted)', paddingTop:4 }}>
          Страница обновляется каждые 5 секунд — статус изменится автоматически.
        </div>
      )}
    </div>
  )
}

// ─── Fulltext script coverage (блочное покрытие полнотекстового скрипта) ─────
const BLOCK_STATUS_META: Record<string, { icon: string; cls: string; label: string }> = {
  spoken: { icon: '✓', cls: 'done', label: 'произнесён по тексту' },
  paraphrased: { icon: '~', cls: 'partial', label: 'своими словами' },
  missed: { icon: '✕', cls: 'missed', label: 'пропущен' },
  // Ситуация не возникла — блок закономерно не нужен, не штрафуем (нейтрально)
  not_applicable: { icon: '–', cls: 'na', label: 'не требовался' },
}

function FulltextCoverage({ scriptResult, score, sColor, shortName }: {
  scriptResult: any
  score: number
  sColor: string
  shortName: string
}) {
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const blocks: any[] = scriptResult.block_results || []
  // Знаменатель — блоки, которые реально требовались (без not_applicable):
  // обязательные всегда + ситуативные, чья ситуация возникла
  const required = blocks.filter(b => b.status !== 'not_applicable')
  const okCount = required.filter(b => b.status === 'spoken' || b.status === 'paraphrased').length
  const naCount = blocks.length - required.length

  return (
    <div>
      <div style={{ fontWeight:600, color:'var(--text)', marginBottom:4 }} title={scriptResult.script_name || ''}>
        Покрытие скрипта{shortName ? ` («${shortName}»)` : ''} — {score}%
      </div>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8 }}>
        Проговорено {okCount} из {required.length} нужных блоков
        {naCount > 0 && <span> · {naCount} не требовалось</span>}
      </div>
      <div className="progress-bar" style={{ marginBottom:12 }}>
        <div className={`progress-bar-fill ${sColor}`} style={{ width:`${score}%` }} />
      </div>
      <ul className="checklist">
        {blocks.map((b: any) => {
          const meta = BLOCK_STATUS_META[b.status] || BLOCK_STATUS_META.missed
          const isOpen = openBlock === b.block_id
          return (
            <li key={b.block_id} className="checklist-item"
              style={{ flexDirection:'column', alignItems:'stretch', cursor:'pointer' }}
              onClick={() => setOpenBlock(isOpen ? null : b.block_id)}
            >
              <div style={{ display:'flex', alignItems:'center', gap:10, width:'100%' }}>
                <div className={`check-icon ${meta.cls}`}>{meta.icon}</div>
                <span className={`checklist-text ${meta.cls}`} style={{ flex:1 }}>
                  {b.title}
                  {!b.is_mandatory && (
                    <span style={{ marginLeft:6, fontSize:11, color:'var(--text-muted)' }}>· ситуативный</span>
                  )}
                </span>
                <span className={`checklist-score ${meta.cls}`} style={{ whiteSpace:'nowrap' }}>{meta.label}</span>
              </div>
              {isOpen && (
                <div style={{
                  marginTop:8, marginLeft:30, padding:'10px 12px',
                  background:'var(--bg)', borderRadius:'var(--radius)', fontSize:12.5, lineHeight:1.5,
                }}>
                  {b.text && (
                    <div style={{ color:'var(--text-secondary)' }}>
                      <span style={{ fontWeight:600, color:'var(--text-muted)', fontSize:11 }}>СКРИПТ: </span>
                      {b.text}
                    </div>
                  )}
                  {b.quote && (
                    <div style={{ marginTop:6, color:'var(--success)' }}>
                      <span style={{ fontWeight:600, fontSize:11 }}>СКАЗАНО: </span>
                      «{b.quote}»
                    </div>
                  )}
                  {b.comment && (
                    <div style={{ marginTop:6, color:'var(--text-muted)', fontStyle:'italic' }}>{b.comment}</div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Full conversation detail (analyzed) ─────────────────────────────────────
function ConversationDetail({ conversationId }: { conversationId: string }) {
  const objectionTypeLabel = useObjectionTypeLabel()
  const { data, isLoading } = useQuery({
    queryKey: ['conversation-detail', conversationId],
    queryFn: () => dashboardApi.getConversationDetail(conversationId),
  })

  const { data: upsellRules } = useQuery({
    queryKey: ['upsell-rules-all'],
    queryFn: () => scriptsApi.listUpsellRules(),
  })
  const { data: crossSellRules } = useQuery({
    queryKey: ['cross-sell-rules-all'],
    queryFn: () => scriptsApi.listCrossSellRules(),
  })

  const [audioTime, setAudioTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | undefined>()

  // ─── Безопасные derived-значения для хуков ниже (работают и при !data) ──────
  const c: any = data?.conversation || data || {}
  const transcript: any = data?.transcript || {}
  const segments: any[] = transcript.segments || c.segments || data?.segments || []
  const scriptResults: any[] = c.script_results || data?.script_results || []
  const objections: any[] = c.objections || data?.objections || []
  const storeId: string | undefined = c.store_id
  const sellerId: string | undefined = c.seller_id

  // LLM-результаты по апсейл/кросс-сейл из бэкенда: список объектов с цитатами для подсветки.
  const upsellResults: any[] = Array.isArray(c.upsell_results) ? c.upsell_results : []
  const crosssellResults: any[] = Array.isArray(c.crosssell_results) ? c.crosssell_results : []

  // Анализ кросс-сейла предпочитает LLM-результат с бэка; для старых разговоров (где
  // crosssell_results=NULL) фолбэк на клиентский подстрочный матч по правилам.
  const crossSellAnalysis = useMemo(() => {
    if (c.has_crosssell !== null && c.has_crosssell !== undefined && crosssellResults.length > 0) {
      // Собираем агрегаты из LLM-результата.
      let total = 0, matched = 0
      const missed: string[] = []
      for (const r of crosssellResults) {
        const required: string[] = r.required_offers || []
        const offered: string[] = r.offered_items || []
        total += required.length
        matched += offered.length
        for (const m of (r.missed_items || [])) missed.push(m)
      }
      let status: 'no-trigger' | 'complete' | 'partial' | 'missed' = 'no-trigger'
      if (crosssellResults.length > 0) {
        if (total === 0) status = 'complete'
        else if (matched === total) status = 'complete'
        else if (matched === 0) status = 'missed'
        else status = 'partial'
      }
      return { triggered: true, matched, total, missed, status }
    }
    return analyzeSell(crossSellRules as any, segments, storeId, sellerId)
  }, [c.has_crosssell, crosssellResults, crossSellRules, segments, storeId, sellerId])

  // Анализ апсейла — симметрично кросс-сейлу: предпочитаем LLM-результат с бэка,
  // фолбэк на клиентский матч по правилам. Раньше для апсейла фолбэка не было,
  // поэтому при has_upsell=null показывалось "Правил нет", даже когда триггеры
  // и офферы реально были в транскрипте.
  const upsellAnalysis = useMemo(() => {
    if (c.has_upsell !== null && c.has_upsell !== undefined && upsellResults.length > 0) {
      let total = 0, matched = 0
      const missed: string[] = []
      for (const r of upsellResults) {
        const required: string[] = r.required_offers || []
        const offered: string[] = r.offered_items || []
        total += required.length
        matched += offered.length
        for (const m of (r.missed_items || [])) missed.push(m)
      }
      let status: 'no-trigger' | 'complete' | 'partial' | 'missed' = 'no-trigger'
      if (upsellResults.length > 0) {
        if (total === 0) status = 'complete'
        else if (matched === total) status = 'complete'
        else if (matched === 0) status = 'missed'
        else status = 'partial'
      }
      return { triggered: true, matched, total, missed, status }
    }
    return analyzeSell(upsellRules as any, segments, storeId, sellerId)
  }, [c.has_upsell, upsellResults, upsellRules, segments, storeId, sellerId])

  const highlightRules: HighlightRule[] = useMemo(() => {
    const rules: HighlightRule[] = []
    for (const sr of scriptResults) {
      // Полнотекстовый скрипт: подсвечиваем цитаты оператора, подтверждающие блоки.
      // spoken → зелёный (по тексту), paraphrased → жёлтый (своими словами).
      for (const b of (sr.block_results || [])) {
        const quote = (b.quote || '').trim()
        if (quote.length < 3 || b.status === 'missed' || b.status === 'not_applicable') continue
        rules.push({
          text: quote,
          kind: b.status === 'spoken' ? 'script-done' : 'script-partial',
          tooltip: `Блок «${b.title}» — ${b.status === 'spoken' ? 'произнесён по тексту' : 'своими словами'}`,
        })
      }
      for (const step of (sr.step_scores || sr.steps || [])) {
        const evidence = (step.evidence || '').trim()
        if (!evidence) continue
        const rawScore = Number(step.score ?? 0)
        const isDetected = step.detected !== false && (rawScore > 0 || step.detected)
        // Зелёным подсвечиваем только этапы, реально выполненные (≥70%).
        // Частично выполненные не подсвечиваем — иначе вводит в заблуждение.
        if (!isDetected || rawScore < 70) continue
        rules.push({
          text: evidence,
          kind: 'script-done',
          tooltip: `Этап «${step.step_name || step.name}» — выполнен (${Math.round(rawScore)}%)`,
        })
      }
    }
    for (const obj of objections) {
      const raw = (obj?.raw_text || '').trim()
      if (raw.length < 3) continue
      rules.push({
        text: raw,
        kind: obj.is_resolved ? 'objection-resolved' : 'objection-unresolved',
        tooltip: `Возражение${obj.type ? `: ${obj.type}` : ''} — ${obj.is_resolved ? 'закрыто' : 'не закрыто'}`,
      })
    }

    // Цитаты из LLM-результатов апсейла/кросс-сейла — LLM уже сам устойчив к опечаткам
    // транскрибации и возвращает ДОСЛОВНЫЕ цитаты из текста. Подсвечиваем их.
    const pushSellQuotes = (results: any[], kind: 'upsell' | 'crosssell') => {
      const triggerKind = kind === 'upsell' ? 'upsell-trigger' : 'crosssell-trigger'
      const offerKind = kind === 'upsell' ? 'upsell-offer' : 'crosssell-offer'
      const label = kind === 'upsell' ? 'Апсейл' : 'Кросс-сейл'
      for (const r of results) {
        const product = r.trigger_product || ''
        for (const q of (r.trigger_quotes || [])) {
          if (typeof q === 'string' && q.trim().length >= 3) {
            rules.push({ text: q, kind: triggerKind as any, tooltip: `${label}: триггер «${product}»` })
          }
        }
        const offerQuotes: Record<string, string[]> = r.offer_quotes || {}
        for (const offer in offerQuotes) {
          for (const q of (offerQuotes[offer] || [])) {
            if (typeof q === 'string' && q.trim().length >= 3) {
              rules.push({ text: q, kind: offerKind as any, tooltip: `${label}: предложение «${offer}»` })
            }
          }
        }
      }
    }
    if (upsellResults.length > 0) {
      pushSellQuotes(upsellResults, 'upsell')
    } else {
      // Фолбэк для старых разговоров без LLM-цитат — берём правила и ищем подстроку.
      rules.push(...highlightRulesForSell(upsellRules as any, storeId, 'upsell', sellerId))
    }
    if (crosssellResults.length > 0) {
      pushSellQuotes(crosssellResults, 'crosssell')
    } else {
      rules.push(...highlightRulesForSell(crossSellRules as any, storeId, 'crosssell', sellerId))
    }
    return rules
  }, [scriptResults, objections, upsellResults, crosssellResults, upsellRules, crossSellRules, storeId])

  const recordingId = data?.conversation?.recording_id || data?.recording_id
  useEffect(() => {
    if (!recordingId) return
    let revokedUrl: string | undefined
    let cancelled = false
    recorderApi.getAudioBlobUrl(recordingId)
      .then(url => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        revokedUrl = url
        setAudioUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (revokedUrl) URL.revokeObjectURL(revokedUrl)
    }
  }, [recordingId])

  if (isLoading) return <div style={{ padding:'20px', color:'var(--text-muted)' }}>Загрузка...</div>
  if (!data) return null

  const sellerName = c.seller_name || c.seller_id || '?'
  const storeName = c.store_name || c.store_id || ''

  const mins = Math.floor((c.duration_seconds || 0) / 60)
  const secs = (c.duration_seconds || 0) % 60
  const dateSource = c.analyzed_at || c.recorded_at || c.session_date || ''
  const dateStr = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' }) : '—'
  const timeStr = dateSource ? new Date(dateSource).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) : ''
  const overallScore = Math.round(c.overall_score || 0)
  const sellerColorKey = c.seller_id || sellerName

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Seller card */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg)', borderRadius:'var(--radius)' }}>
        <div className="avatar" style={{ background:avatarColorFor(sellerColorKey), width:44, height:44, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:16 }}>
          {sellerName[0].toUpperCase()}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:600, color:'var(--text)', fontSize:15 }}>{sellerName}</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:2 }}>{storeName}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{dateStr}</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{timeStr} · {mins}:{String(secs).padStart(2,'0')}</div>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <OutcomeTag outcome={c.outcome} />
        {c.call_direction && (
          <span className="tag tag-neutral" style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
            <DirectionIcon direction={c.call_direction} />
            {c.call_direction === 'inbound' ? 'Входящий' : 'Исходящий'}
          </span>
        )}
        {c.client_phone && (
          <span className="tag tag-neutral" style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
            <Phone size={12} /> {c.client_phone}
          </span>
        )}
        {c.topic && <span className="tag tag-neutral">{c.topic}</span>}
        {c.compliance_ok !== undefined && (
          <span className={`tag ${c.compliance_ok ? 'tag-success' : 'tag-danger'}`}>
            Комплаенс: {c.compliance_ok ? 'OK' : 'Нарушение'}
          </span>
        )}
      </div>

      {/* Метрики динамики разговора (считаются из таймкодов, есть не у всех записей) */}
      {c.talk_ratio !== null && c.talk_ratio !== undefined && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
          {[
            {
              label: 'Речь сотрудника',
              value: `${Math.round(c.talk_ratio * 100)}%`,
              hint: 'Доля времени речи сотрудника. Ориентир для продаж — 40–60%',
              warn: c.talk_ratio > 0.75 || c.talk_ratio < 0.25,
            },
            {
              label: 'Перебивания',
              value: String(c.interruptions_count ?? '—'),
              hint: 'Сколько раз стороны перебивали друг друга',
              warn: (c.interruptions_count ?? 0) >= 5,
            },
            {
              label: 'Макс. монолог',
              value: c.longest_monologue_seconds != null ? `${c.longest_monologue_seconds}с` : '—',
              hint: 'Самый длинный непрерывный монолог сотрудника',
              warn: (c.longest_monologue_seconds ?? 0) >= 90,
            },
            {
              label: 'Тишина',
              value: c.silence_ratio != null ? `${Math.round(c.silence_ratio * 100)}%` : '—',
              hint: 'Доля пауз без речи от длительности разговора',
              warn: (c.silence_ratio ?? 0) >= 0.3,
            },
          ].map((m) => (
            <div key={m.label} title={m.hint} style={{
              padding:'10px 12px', background:'var(--bg)', borderRadius:'var(--radius)',
              textAlign:'center', cursor:'help',
            }}>
              <div style={{ fontSize:16, fontWeight:700, color: m.warn ? 'var(--danger)' : 'var(--text)' }}>{m.value}</div>
              <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Script Scoring */}
      {scriptResults.map((sr: any, i: number) => {
        const score = Math.round(sr.script_score || sr.total_score || 0)
        const sColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
        const shortName = (sr.script_short_name || '').trim()

        // Полнотекстовый скрипт: вместо этапов показываем покрытие по блокам
        if (sr.script_type === 'fulltext' && Array.isArray(sr.block_results) && sr.block_results.length > 0) {
          return (
            <FulltextCoverage key={i} scriptResult={sr} score={score} sColor={sColor} shortName={shortName} />
          )
        }
        return (
          <div key={i}>
            <div
              style={{ fontWeight:600, color:'var(--text)', marginBottom:8 }}
              title={sr.script_name || ''}
            >
              Скоринг скрипта{shortName ? ` («${shortName}»)` : ''} — {score}%
            </div>
            <div className="progress-bar" style={{ marginBottom:12 }}>
              <div className={`progress-bar-fill ${sColor}`} style={{ width:`${score}%` }} />
            </div>
            <ul className="checklist">
              {(sr.step_scores || sr.steps || []).map((step: any, j: number) => {
                const rawScore = Number(step.score ?? 0)
                const stepScore = Math.round(rawScore)
                const isDetected = step.detected !== false && (rawScore > 0 || step.detected)
                // ≥70 — выполнен, 40-69 — частично, <40 / не detected — провален
                const status: 'done' | 'partial' | 'missed' =
                  !isDetected || rawScore < 40 ? 'missed'
                  : rawScore < 70 ? 'partial'
                  : 'done'
                const icon = status === 'done' ? '✓' : status === 'partial' ? '~' : '✕'
                return (
                  <li key={j} className="checklist-item">
                    <div className={`check-icon ${status}`}>{icon}</div>
                    <span className={`checklist-text ${status}`}>{step.step_name || step.name}</span>
                    <span className={`checklist-score ${status}`}>{stepScore}%</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {/* Objections — дедуплицируем по типу: одно и то же возражение, повторённое
          несколько раз, отображается одним тегом. Русские названия типов. */}
      {objections.length > 0 && (() => {
        const seen = new Set<string>()
        const uniqueTypes: string[] = []
        for (const o of objections) {
          const t = (o.type || '').toString()
          if (t && !seen.has(t)) {
            seen.add(t)
            uniqueTypes.push(t)
          }
        }
        if (!uniqueTypes.length) return null
        return (
          <div>
            <div style={{ fontWeight:600, color:'var(--text)', marginBottom:8 }}>Обнаруженные возражения</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {uniqueTypes.map((t) => (
                <span key={t} className="tag tag-danger">{objectionTypeLabel(t)}</span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Up-sell / Cross-sell summary */}
      <div className="sell-summary">
        <div className="sell-summary-item">
          <div className="sell-summary-label">Апсейл</div>
          <SellBadge analysis={upsellAnalysis} />
        </div>
        <div className="sell-summary-item">
          <div className="sell-summary-label">Кросс-сейл</div>
          <CrossSellBadge analysis={crossSellAnalysis} />
        </div>
      </div>

      {/* Audio */}
      <div>
        <div style={{ fontWeight:600, color:'var(--text)', marginBottom:8 }}>Аудиозапись</div>
        <AudioPlayer src={audioUrl} duration={c.duration_seconds} onTimeUpdate={setAudioTime} />
      </div>

      {/* Transcript */}
      {segments.length > 0 && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontWeight:600, color:'var(--text)' }}>Транскрипт</div>
            <HighlightLegend />
          </div>
          <div className="transcript">
            {segments.map((seg: any, i: number) => {
              const role = (seg.speaker_role || '').toLowerCase()
              const isSeller = role === 'seller'
              const isClient = role === 'client' || role === 'customer'
              const startSec = seg.start_time || (seg.start_ms ?? 0) / 1000
              const m = Math.floor(startSec / 60)
              const s = Math.floor(startSec % 60)
              const timeStr = `${m}:${String(s).padStart(2, '0')}`
              const isCall = !!c.call_direction || (c.source || '').startsWith('call')
              const speakerLabel = isSeller ? (isCall ? 'Оператор' : 'Продавец') : isClient ? 'Клиент' : '—'
              const speakerClass = isSeller ? 'seller' : isClient ? 'client' : 'unknown'
              // Апсейл/кросс-сейл — действия продавца, поэтому их подсветку (триггер и
              // предложение) показываем только в репликах продавца. У клиента триггер-продукт
              // может прозвучать (он сам упомянул товар), но это не работа менеджера —
              // согласуется с analyzeSell, который тоже считает только речь продавца.
              // Возражения и шаги скрипта не трогаем — они валидны для обеих сторон.
              const segRules = isSeller
                ? highlightRules
                : highlightRules.filter(
                    (r) => !r.kind.startsWith('upsell-') && !r.kind.startsWith('crosssell-')
                  )
              return (
                <div key={i} className="transcript-line">
                  <span className="transcript-time">{timeStr}</span>
                  <span className={`transcript-speaker ${speakerClass}`}>
                    {speakerLabel}
                  </span>
                  <span className="transcript-text">
                    {highlightSegmentText(seg.text, segRules)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
        <button className="btn btn-outline btn-sm">В обучение</button>
        <button className="btn btn-outline btn-sm">Экспорт</button>
        <button className="btn btn-outline btn-sm" style={{ color:'var(--danger)' }}>Отметить нарушение</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
interface OutletContext { period: number }

export function ConversationsPage() {
  const { period } = useOutletContext<OutletContext>()
  const terms = useTerms()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(() => searchParams.get('conv'))
  const [selectedRec, setSelectedRec] = useState<any | null>(null)

  useEffect(() => {
    const conv = searchParams.get('conv')
    if (conv && conv !== selectedConvId) setSelectedConvId(conv)
    if (!conv && selectedConvId) setSelectedConvId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const [showUpload, setShowUpload] = useState(false)
  const [showTranscriptUpload, setShowTranscriptUpload] = useState(false)
  const [showCallUpload, setShowCallUpload] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sort, setSort] = useState<{ by: SortBy; dir: SortDir }>({ by: 'date', dir: 'desc' })
  const [filters, setFilters] = useState({
    store_id: '', seller_id: '', outcome: '', direction: '', source: '',
    score_min: undefined as number | undefined,
    score_max: undefined as number | undefined,
  })

  const toggleSort = useCallback((by: SortBy) => {
    setSort(prev => prev.by === by
      ? { by, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { by, dir: by === 'date' || by === 'duration' ? 'desc' : 'asc' }
    )
  }, [])

  const { data: conversations, dataUpdatedAt: convAt } = useQuery({
    queryKey: ['conversations', page, filters, period],
    queryFn: () => dashboardApi.getConversations({
      page, limit: 20,
      store_id: filters.store_id || undefined,
      seller_id: filters.seller_id || undefined,
      outcome: filters.outcome || undefined,
      direction: filters.direction || undefined,
      source: filters.source || undefined,
      score_min: filters.score_min,
      score_max: filters.score_max,
      period,
    }),
    refetchInterval: 5000,
  })

  const { data: recordingsData, dataUpdatedAt: recAt } = useQuery({
    queryKey: ['recordings-status'],
    queryFn: () => recorderApi.getRecordings({ limit: 50 }),
    refetchInterval: 5000,
  })

  const { data: stores } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => adminApi.getStores(),
  })

  useEffect(() => {
    if (convAt || recAt) setLastUpdated(new Date())
  }, [convAt, recAt])

  const analyzedIds = new Set(
    (conversations?.items || []).map((c: any) => c.recording_id).filter(Boolean)
  )
  const pendingRows = (recordingsData?.items || []).filter((r: any) => !analyzedIds.has(r.id))

  // Unified sorted rows
  type UnifiedRow = { _type: 'pending' | 'analyzed'; _date: number; _name: string; _duration: number; _store: string; [k: string]: any }
  const allRows: UnifiedRow[] = [
    ...pendingRows.map((r: any) => ({
      _type: 'pending' as const,
      _date: r.started_at ? new Date(r.started_at).getTime() : 0,
      _name: (r.seller_name || '').toLowerCase(),
      _duration: r.duration_seconds || 0,
      _store: (r.store_name || '').toLowerCase(),
      ...r,
    })),
    ...(conversations?.items || []).map((c: any) => ({
      _type: 'analyzed' as const,
      _date: new Date(c.analyzed_at || c.recorded_at || c.session_date || 0).getTime(),
      _name: (c.seller_name || '').toLowerCase(),
      _duration: c.duration_seconds || 0,
      _store: (c.store_name || '').toLowerCase(),
      ...c,
    })),
  ]
  const sortedRows = [...allRows].sort((a, b) => {
    let v = 0
    if      (sort.by === 'date')     v = a._date     - b._date
    else if (sort.by === 'name')     v = a._name.localeCompare(b._name, 'ru')
    else if (sort.by === 'duration') v = a._duration  - b._duration
    else if (sort.by === 'store')    v = a._store.localeCompare(b._store, 'ru')
    return sort.dir === 'asc' ? v : -v
  })

  const handleScoreFilter = (v: string) => {
    if (v === '80+') setFilters(p => ({ ...p, score_min:80, score_max:undefined }))
    else if (v === '60-79') setFilters(p => ({ ...p, score_min:60, score_max:79 }))
    else if (v === '<60') setFilters(p => ({ ...p, score_min:undefined, score_max:59 }))
    else setFilters(p => ({ ...p, score_min:undefined, score_max:undefined }))
    setPage(1)
  }

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : null

  // ─── Filter metadata ───────────────────────────────────────────────────────
  const scoreValue =
    filters.score_min === 80 ? '80+' :
    filters.score_min === 60 && filters.score_max === 79 ? '60-79' :
    filters.score_max === 59 ? '<60' : ''
  const sortLabels: Record<string, string> = {
    date_desc: 'Сначала новые',
    date_asc:  'Сначала старые',
    name_asc:  'Имя А→Я',
    name_desc: 'Имя Я→А',
    duration_desc: 'Длинные сначала',
    duration_asc:  'Короткие сначала',
    store_asc:  'Магазин А→Я',
    store_desc: 'Магазин Я→А',
  }
  const sortKey = `${sort.by}_${sort.dir}`
  const sortActive = sortKey !== 'date_desc'

  const hasActiveFilters = !!(filters.store_id || filters.outcome || filters.direction || filters.source || scoreValue || sortActive)
  const resetAll = () => {
    setFilters({ store_id:'', seller_id:'', outcome:'', direction:'', source:'', score_min:undefined, score_max:undefined })
    setSort({ by:'date', dir:'desc' })
    setPage(1)
  }

  const drawerTitle = selectedConvId
    ? `Разговор #${selectedConvId.slice(0,8)}`
    : selectedRec
    ? `Запись #${String(selectedRec.id).slice(0,8)}`
    : ''

  return (
    <div>
      <style>{`
        @keyframes viq-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.8)} }
        @keyframes viq-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Filter toolbar */}
      <div className="filter-toolbar fade-in">
        <div className="filter-cell">
          <MultiSelect
            single
            options={(stores?.items || []).map((s: any) => ({ id: s.id, label: s.name }))}
            selected={filters.store_id ? [filters.store_id] : ['']}
            onChange={(ids) => { setFilters(p => ({ ...p, store_id: ids[0] === '' ? '' : ids[0] })); setPage(1) }}
            prependOption={{ id: '', label: terms.allStores }}
            placeholder={terms.allStores}
          />
        </div>

        <div className="filter-cell">
          <MultiSelect
            single
            options={Object.entries(terms.isTelephony ? TELEPHONY_OUTCOME_LABELS : OUTCOME_LABELS).map(([k, l]) => ({ id: k, label: l }))}
            selected={filters.outcome ? [filters.outcome] : ['']}
            onChange={(ids) => { setFilters(p => ({ ...p, outcome: ids[0] === '' ? '' : ids[0] })); setPage(1) }}
            prependOption={{ id: '', label: 'Все исходы' }}
            placeholder="Все исходы"
          />
        </div>

        {terms.isTelephony && (
          <div className="filter-cell">
            <MultiSelect
              single
              options={[
                { id: 'inbound', label: 'Входящие' },
                { id: 'outbound', label: 'Исходящие' },
              ]}
              selected={filters.direction ? [filters.direction] : ['']}
              onChange={(ids) => { setFilters(p => ({ ...p, direction: ids[0] === '' ? '' : ids[0] })); setPage(1) }}
              prependOption={{ id: '', label: 'Все направления' }}
              placeholder="Все направления"
            />
          </div>
        )}

        {terms.isTelephony && (
          <div className="filter-cell">
            <MultiSelect
              single
              options={[
                { id: 'calls', label: 'Звонки (все)' },
                { id: 'call_webhook', label: 'Звонки из АТС' },
                { id: 'call_manual', label: 'Звонки (вручную)' },
                { id: 'manual', label: 'Загруженное аудио' },
                { id: 'transcript', label: 'Транскрипты' },
              ]}
              selected={filters.source ? [filters.source] : ['']}
              onChange={(ids) => { setFilters(p => ({ ...p, source: ids[0] === '' ? '' : ids[0] })); setPage(1) }}
              prependOption={{ id: '', label: 'Все источники' }}
              placeholder="Все источники"
            />
          </div>
        )}

        <div className="filter-cell">
          <MultiSelect
            single
            options={[
              { id: '80+', label: 'Скоринг 80%+' },
              { id: '60-79', label: 'Скоринг 60–79%' },
              { id: '<60', label: 'Скоринг < 60%' },
            ]}
            selected={scoreValue ? [scoreValue] : ['']}
            onChange={(ids) => handleScoreFilter(ids[0] === '' ? '' : ids[0])}
            prependOption={{ id: '', label: 'Любой скоринг' }}
            placeholder="Любой скоринг"
          />
        </div>

        <div className="filter-cell">
          <MultiSelect
            single
            options={Object.entries(sortLabels).map(([k, l]) => ({ id: k, label: l }))}
            selected={[sortKey]}
            onChange={(ids) => {
              const [by, dir] = (ids[0] || 'date_desc').split('_') as [SortBy, SortDir]
              setSort({ by, dir })
            }}
            placeholder="Сортировка"
          />
        </div>

        {hasActiveFilters && (
          <button className="filter-clear" onClick={resetAll} title="Сбросить все фильтры">
            <X size={12} /> Сбросить
          </button>
        )}

        <div style={{ flex:1 }} />

        <div className="filter-meta">
          <span className="filter-meta-strong">{(conversations?.total || 0) + pendingRows.length}</span>
          <span>записей</span>
          {lastUpdatedStr && (
            <>
              <span className="filter-meta-divider" />
              <span className="live-dot" />
              <span>обновлено {lastUpdatedStr}</span>
            </>
          )}
        </div>

        <button
          className="btn btn-sm"
          onClick={() => setShowTranscriptUpload(true)}
          title="Загрузить готовый размеченный диалог — для тестов скоринга и апсейла без аудио"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          <FileText size={14} /> Загрузка транскрибации
        </button>
        <button className="btn btn-sm btn-primary-gradient" onClick={() => setShowUpload(true)}>
          <Upload size={14} /> Загрузить аудио
        </button>
        {terms.isTelephony && (
          <button className="btn btn-sm btn-primary-gradient" onClick={() => setShowCallUpload(true)}
            title="Загрузить запись телефонного звонка с метаданными (направление, номер клиента)">
            <Phone size={14} /> Загрузить звонок
          </button>
        )}
      </div>

      <AudioUploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploadComplete={() => {}} />
      <TranscriptUploadModal open={showTranscriptUpload} onClose={() => setShowTranscriptUpload(false)} onUploadComplete={() => {}} />
      <CallUploadModal open={showCallUpload} onClose={() => setShowCallUpload(false)} onUploadComplete={() => {}} />

      {/* Table */}
      <div className="card fade-in">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                {(['date','name','store','duration'] as const).map(col => {
                  const labels: Record<SortBy, string> = { date:'Дата и время', name:terms.seller, store:terms.store, duration:'Длительность' }
                  const active = sort.by === col
                  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                  return (
                    <th key={col} onClick={() => toggleSort(col)} style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        {labels[col]}
                        <Icon size={12} style={{ opacity: active ? 1 : 0.3, color: active ? 'var(--primary)' : 'inherit' }} />
                      </span>
                    </th>
                  )
                })}
                <th>Тема</th>
                <th style={{ textAlign: 'center' }}>Скоринг</th>
                <th style={{ textAlign: 'center' }}>Апсейл</th>
                <th style={{ textAlign: 'center' }}>Кросс-сейл</th>
                <th style={{ textAlign: 'center' }}>Исход / Статус</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const dateObj = row._date ? new Date(row._date) : null
                const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day:'numeric', month:'short' }) : '—'
                const timeStr = dateObj ? dateObj.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) : ''
                const mins = Math.floor(row._duration / 60)
                const secs = row._duration % 60
                const durStr = row._duration ? `${mins}:${String(secs).padStart(2,'0')}` : '—'

                if (row._type === 'pending') {
                  const sellerName = row.seller_name || '—'
                  return (
                    <tr key={row.id}
                      onClick={() => { setSelectedRec(row); setSelectedConvId(null) }}
                      style={{ cursor:'pointer', background:'var(--bg)', opacity:.92,
                        outline: selectedRec?.id === row.id ? '1px solid var(--primary)' : undefined }}
                    >
                      <td>{dateStr} <span style={{ color:'var(--text-muted)' }}>{timeStr}</span></td>
                      <td>
                        <div className="seller-cell">
                          <div className="avatar" style={{ background:'#94A3B8' }}>{sellerName[0]?.toUpperCase() || '?'}</div>
                          <div className="name">{sellerName}</div>
                        </div>
                      </td>
                      <td style={{ color:'var(--text-muted)' }}>{row.store_name || '—'}</td>
                      <td style={{ color:'var(--text-muted)' }}>{durStr}</td>
                      <td>—</td>
                      <td style={{ textAlign:'center' }}>—</td>
                      <td style={{ textAlign:'center' }}>—</td>
                      <td style={{ textAlign:'center' }}>—</td>
                      <td style={{ textAlign:'center' }}><PipelineStatus status={row.status} /></td>
                    </tr>
                  )
                }

                const color = avatarColorFor(row.seller_id || row.seller_name)
                return (
                  <tr key={row.id}
                    onClick={() => { setSelectedConvId(row.id); setSelectedRec(null) }}
                    style={{ cursor:'pointer', background: selectedConvId === row.id ? 'var(--bg-active)' : undefined }}
                  >
                    <td>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}
                        title={row.client_phone ? `${row.call_direction === 'inbound' ? 'Входящий' : 'Исходящий'} · ${row.client_phone}` : undefined}>
                        {row.call_direction && <DirectionIcon direction={row.call_direction} />}
                        {dateStr} <span style={{ color:'var(--text-muted)' }}>{timeStr}</span>
                      </span>
                    </td>
                    <td>
                      <div className="seller-cell">
                        <div className="avatar" style={{ background:color }}>{(row.seller_name || '?')[0].toUpperCase()}</div>
                        <div className="name">{row.seller_name || row.seller_id}</div>
                      </div>
                    </td>
                    <td style={{ color:'var(--text-muted)' }}>{row.store_name || row.store_id}</td>
                    <td>{durStr}</td>
                    <td style={{ color:'var(--text-secondary)' }}>{row.topic || '—'}</td>
                    <td style={{ textAlign:'center' }}><ScoreBadge score={row.overall_score} /></td>
                    <td style={{ textAlign:'center' }}>
                      {row.has_upsell === true
                        ? <span className="tag tag-success">Да</span>
                        : <span className="tag tag-danger">Нет</span>}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {row.has_crosssell === true
                        ? <span className="tag tag-success">Да</span>
                        : <span className="tag tag-danger">Нет</span>}
                    </td>
                    <td style={{ textAlign:'center' }}><OutcomeTag outcome={row.outcome} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'16px', textAlign:'center', borderTop:'1px solid var(--border)' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(Math.max(1, page-1))} disabled={page===1}>← Назад</button>
          <span style={{ margin:'0 16px', color:'var(--text-muted)', fontSize:13 }}>Страница {page}</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(page+1)} disabled={!conversations || conversations.items.length < 20}>Вперёд →</button>
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        isOpen={!!(selectedConvId || selectedRec)}
        onClose={() => {
          setSelectedConvId(null)
          setSelectedRec(null)
          if (searchParams.get('conv')) {
            const next = new URLSearchParams(searchParams)
            next.delete('conv')
            setSearchParams(next, { replace: true })
          }
        }}
        title={drawerTitle}
      >
        {selectedConvId && <ConversationDetail conversationId={selectedConvId} />}
        {selectedRec && !selectedConvId && <RecordingDetail recording={selectedRec} />}
      </Drawer>
    </div>
  )
}

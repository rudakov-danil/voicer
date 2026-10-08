import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { analyticsApi } from '@/api/analytics'
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
import { useState, useEffect, useCallback, useMemo, Fragment, type ReactNode } from 'react'
import { useSearchParams, useOutletContext, useNavigate } from 'react-router-dom'
import {
  OUTCOME_LABELS,
  TELEPHONY_OUTCOME_LABELS,
  CALL_CATEGORY_LABELS,
  DirectionIcon,
  useObjectionTypeLabel,
} from '@/components/conversation/shared'
import { Upload, CheckCircle, Clock, Loader, AlertCircle, ArrowDown, History, X, FileText, Phone, PhoneIncoming, PhoneOutgoing, Sparkles, RefreshCw, ChevronRight, Trash2, Search, ShieldAlert, MessageCircleWarning } from 'lucide-react'
import { Fingerprint, clock } from '@/components/ui/Fingerprint'
import { Meter, UpsellDots } from '@/components/ui/Meter'
import type { ConversationView, FingerprintMark } from '@/types'
import { t, L, locale } from '@/i18n'
import { MultiSelect } from '@/components/scripts/MultiSelect'
import { QuickView } from '@/components/conversation/QuickView'
import {
  avatarColorFor,
  highlightSegmentText,
  highlightRulesForSell,
  analyzeSell,
  type HighlightRule,
} from '@/components/scripts/conversationHelpers'

type SortBy  = 'date' | 'name' | 'duration' | 'store'
type SortDir = 'asc' | 'desc'

// ─── Pipeline status badge ────────────────────────────────────────────────────
// Флаги концепта, без бесконечной пульсации: статус обновляется опросом списка.
function PipelineStatus({ status }: { status: string }) {
  if (status === 'processing' || status === 'uploaded' || status === 'pending') return (
    <span className="flag is-warn"><Loader aria-hidden="true" />Транскрибация...</span>
  )
  if (status === 'transcribed') return (
    <span className="flag is-info"><Sparkles aria-hidden="true" />Анализируется...</span>
  )
  if (status === 'failed') return (
    <span className="flag is-crit"><AlertCircle aria-hidden="true" />Ошибка</span>
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

// ─── Вложенные строки группы: прежние звонки того же клиента ──────────────────
function GroupChildRows({ conversationId, selectedConvId, onSelect }: {
  conversationId: string
  selectedConvId: string | null
  onSelect: (id: string) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-history', conversationId],
    queryFn: () => dashboardApi.getClientHistory(conversationId),
    staleTime: 60 * 1000,
  })
  // Показываем в группе все звонки клиента, КРОМЕ текущего представителя (он — родительская строка)
  const children = (data?.items || []).filter((it) => !it.is_current)

  if (isLoading) return (
    <tr>
      <td colSpan={9} style={{ padding: '8px 16px 8px 52px', color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg)' }}>
        Загрузка истории…
      </td>
    </tr>
  )
  if (!children.length) return null

  return (
    <>
      {children.map((it) => {
        const d = it.session_date ? new Date(it.session_date) : null
        const dateStr = d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'
        const mins = Math.floor((it.duration_seconds || 0) / 60)
        const secs = (it.duration_seconds || 0) % 60
        const durStr = it.duration_seconds ? `${mins}:${String(secs).padStart(2, '0')}` : '—'
        return (
          <tr key={it.id}
            onClick={() => onSelect(it.id)}
            style={{ cursor: 'pointer', background: selectedConvId === it.id ? 'var(--bg-active)' : 'var(--bg)' }}
          >
            <td style={{ paddingLeft: 52 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                <DirectionIcon direction={it.call_direction} />
                {dateStr}
              </span>
            </td>
            <td style={{ color: 'var(--text-muted)' }}>{it.seller_name || '—'}</td>
            <td style={{ color: 'var(--text-muted)' }}>{it.store_name || '—'}</td>
            <td style={{ color: 'var(--text-muted)' }}>{durStr}</td>
            <td style={{ color: 'var(--text-secondary)' }}>{it.topic || '—'}</td>
            <td style={{ textAlign: 'center' }}>
              {it.is_scorable === false
                ? <span className="tag tag-neutral" title={`Категория: ${CALL_CATEGORY_LABELS[it.call_category || ''] || it.call_category || 'нецелевой'}. Не влияет на рейтинг.`}>Не оценивается</span>
                : it.overall_score != null ? <ScoreBadge score={it.overall_score} /> : '—'}
            </td>
            <td style={{ textAlign: 'center' }}>
              {it.is_scorable === false ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                : it.has_upsell === true ? <span className="tag tag-success">Да</span>
                : it.has_upsell === false ? <span className="tag tag-danger">Нет</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={{ textAlign: 'center' }}>
              {it.is_scorable === false ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                : it.has_crosssell === true ? <span className="tag tag-success">Да</span>
                : it.has_crosssell === false ? <span className="tag tag-danger">Нет</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
            <td style={{ textAlign: 'center' }}><OutcomeTag outcome={it.outcome || 'unknown'} /></td>
          </tr>
        )
      })}
    </>
  )
}

// Номера страниц с многоточиями: 1 … 4 5 6 … 50
function buildPageList(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  const start = Math.max(2, current - 1)
  const end = Math.min(totalPages - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < totalPages - 2) pages.push('…')
  pages.push(totalPages)
  return pages
}

// ─── Main page ────────────────────────────────────────────────────────────────
interface OutletContext { period: number }

// Подборки над таблицей: ключ API → подпись и «тревожность» счётчика
const VIEWS: Array<{ id: '' | ConversationView; label: string; alert?: boolean }> = [
  { id: '', label: 'Все' },
  { id: 'attention', label: 'Требуют внимания', alert: true },
  { id: 'violations', label: 'Нарушения', alert: true },
  { id: 'price_open', label: '«Дорого» без ответа' },
  { id: 'competitor', label: 'Ушли к конкурентам' },
  { id: 'no_upsell', label: 'Без допродажи' },
]

function initialsOf(name?: string | null): string {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/** Подсветка найденной фразы в реплике. */
function HitText({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (!q || i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export function ConversationsPage() {
  const { period } = useOutletContext<OutletContext>()
  const terms = useTerms()
  const objectionLabel = useObjectionTypeLabel()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const navigate = useNavigate()
  const openConversation = useCallback((id: string) => navigate(`/conversations/${id}`), [navigate])
  const [selectedRec, setSelectedRec] = useState<any | null>(null)
  // Быстрый просмотр: ?open=<id> — на него можно сослаться
  const quickId = searchParams.get('open')
  const setQuick = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('open', id); else next.delete('open')
      return next
    }, { replace: true })
  }, [setSearchParams])
  const closeQuick = useCallback(() => setQuick(null), [setQuick])

  // Подборка и фраза живут в адресе: на них ссылаются «Обзор» и оповещения
  const view = (searchParams.get('view') || '') as '' | ConversationView
  const q = searchParams.get('q') || ''
  const [qInput, setQInput] = useState(q)
  const setParam = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      return next
    }, { replace: true })
    setPage(1)
  }, [setSearchParams])
  // Поиск по фразе — с небольшой задержкой после ввода
  useEffect(() => {
    const id = setTimeout(() => { if (qInput.trim() !== q) setParam('q', qInput.trim()) }, 400)
    return () => clearTimeout(id)
  }, [qInput, q, setParam])

  // Старые ссылки вида /conversations?conv=<id> (оповещения, обзор) ведут на страницу разговора
  useEffect(() => {
    const conv = searchParams.get('conv')
    if (conv) navigate(`/conversations/${conv}`, { replace: true })
  }, [searchParams, navigate])
  const [showUpload, setShowUpload] = useState(false)
  const [showTranscriptUpload, setShowTranscriptUpload] = useState(false)
  const [showCallUpload, setShowCallUpload] = useState(false)
  const [sort, setSort] = useState<{ by: SortBy; dir: SortDir }>({ by: 'date', dir: 'desc' })
  // Группировка звонков по клиенту (только для телефонии; контур сейчас отключён)
  const groupByPhone = terms.isTelephony
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])
  const [filters, setFilters] = useState({
    store_id: '', seller_id: '', outcome: '', direction: '', source: '',
    score_min: undefined as number | undefined,
    score_max: undefined as number | undefined,
  })

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', page, pageSize, filters, period, groupByPhone, view, q],
    queryFn: () => dashboardApi.getConversations({
      page, limit: pageSize,
      store_id: filters.store_id || undefined,
      seller_id: filters.seller_id || undefined,
      outcome: filters.outcome || undefined,
      direction: filters.direction || undefined,
      source: filters.source || undefined,
      score_min: filters.score_min,
      score_max: filters.score_max,
      group_by_phone: groupByPhone,
      view: view || undefined,
      q: q || undefined,
      with_counts: true,
      period,
    }),
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  })

  const { data: recordingsData } = useQuery({
    queryKey: ['recordings-status'],
    queryFn: () => recorderApi.getRecordings({ limit: 50 }),
    refetchInterval: 5000,
  })

  const { data: stores } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => adminApi.getStores(),
  })

  // «Отпечатки» строк текущей страницы — одним запросом; данные разговора не меняются
  const convIds = (conversations?.items || []).map((c: any) => c.id as string)
  const { data: fingerprints } = useQuery({
    queryKey: ['fingerprints', convIds.join(',')],
    queryFn: () => dashboardApi.getFingerprints(convIds),
    enabled: convIds.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })

  const analyzedIds = new Set(
    (conversations?.items || []).map((c: any) => c.recording_id).filter(Boolean)
  )
  // «Ожидающие» — записи, ещё не ставшие разговором. Проанализированные (status='analyzed')
  // исключаем: раньше такая запись, чей разговор не попал в текущую страницу/период,
  // ошибочно показывалась как «Анализируется…». Статус 'failed' оставляем — это реальная ошибка.
  // Показываем только на 1-й странице «Всех» без поиска, чтобы не мешали подборкам.
  const pendingRows = page === 1 && !view && !q
    ? (recordingsData?.items || []).filter((r: any) => !analyzedIds.has(r.id) && r.status !== 'analyzed')
    : []

  const totalItems = conversations?.total || 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  // Если после удаления страниц стало меньше — не зависаем на пустой странице
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages])

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
      _date: new Date(c.recorded_at || c.analyzed_at || c.session_date || 0).getTime(),
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
    store_asc:  `${terms.store} А→Я`,
    store_desc: `${terms.store} Я→А`,
  }
  const sortKey = `${sort.by}_${sort.dir}`
  const sortActive = sortKey !== 'date_desc'

  const hasActiveFilters = !!(filters.store_id || filters.outcome || filters.direction || filters.source || scoreValue || sortActive)
  const resetAll = () => {
    setFilters({ store_id:'', seller_id:'', outcome:'', direction:'', source:'', score_min:undefined, score_max:undefined })
    setSort({ by:'date', dir:'desc' })
    setPage(1)
  }

  const drawerTitle = selectedRec ? `Запись #${String(selectedRec.id).slice(0,8)}` : ''

  const counts = conversations?.view_counts
  const markTitle = (m: FingerprintMark) => {
    if (m.k === 'warn' || m.k === 'warn-ok') {
      const what = t(objectionLabel(m.label))
      return m.k === 'warn' ? L(`возражение «${what}» не отработано`, `objection “${what}” unanswered`) : L(`возражение «${what}» отработано`, `objection “${what}” handled`)
    }
    if (m.k === 'ok') return t('предложение допродажи')
    return m.label ? t(m.label) : t('нарушение')
  }

  const fmtTime = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  return (
    <div>
      {/* Подборки */}
      <div className="views-bar">
        <div className="tabs" role="tablist" aria-label={t('Подборки разговоров')}>
          {VIEWS.map((v) => {
            const n = counts ? (v.id ? counts[v.id] : counts.total) : undefined
            return (
              <button
                key={v.id || 'all'}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                className={`tab ${view === v.id ? 'active' : ''}`}
                onClick={() => setParam('view', v.id)}
              >
                {t(v.label)}
                {n != null && <span className={`count ${v.alert && n > 0 ? 'is-alert' : ''}`}>{n.toLocaleString(locale)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Поиск по фразе и фильтры */}
      <div className="conv-filters">
        <label className="input">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t('Фраза из разговора, например «заменим на новый»')}
            aria-label={t('Поиск по фразам из разговоров')}
          />
          {qInput && (
            <button type="button" className="btn-icon" style={{ width: 22, height: 22 }} onClick={() => setQInput('')} aria-label={t('Очистить')}>
              <X size={13} />
            </button>
          )}
        </label>

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
          <button className="filter-clear" onClick={resetAll} title={t('Сбросить все фильтры')}>
            <X size={12} /> Сбросить
          </button>
        )}

        <div className="conv-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setShowTranscriptUpload(true)}
            title={t('Загрузить готовый размеченный диалог — для тестов скоринга и апсейла без аудио')}
          >
            <FileText size={14} /> Загрузка транскрибации
          </button>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <Upload size={14} /> Загрузить аудио
          </button>
          {terms.isTelephony && (
            <button className="btn btn-primary" onClick={() => setShowCallUpload(true)}
              title={t('Загрузить запись телефонного звонка с метаданными (направление, номер клиента)')}>
              <Phone size={14} /> Загрузить звонок
            </button>
          )}
        </div>
      </div>

      {q && (
        <div className="search-note" role="status">
          <Search size={16} aria-hidden="true" />
          <span>
            {L('Фраза', 'Phrase')} <b translate="no">«{q}»</b> — {L(`нашлась в ${totalItems} разговорах`, `found in ${totalItems} conversations`)}
          </span>
          <button className="btn btn-sm" onClick={() => setQInput('')}>{t('Сбросить')}</button>
        </div>
      )}

      <AudioUploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploadComplete={() => {}} />
      <TranscriptUploadModal open={showTranscriptUpload} onClose={() => setShowTranscriptUpload(false)} onUploadComplete={() => {}} />
      <CallUploadModal open={showCallUpload} onClose={() => setShowCallUpload(false)} onUploadComplete={() => {}} />

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {!isLoading && sortedRows.length === 0 ? (
          <div className="empty">
            <h3>{q || view ? t('Ничего не нашлось') : t('Разговоров пока нет')}</h3>
            <p>{q || view ? t('Попробуйте другую фразу, подборку или период.') : t('Записи появятся после выгрузки бейджей или загрузки аудио.')}</p>
            {(q || view) && (
              <button className="btn btn-sm" onClick={() => { setQInput(''); setParam('view', '') }}>{t('Показать все разговоры')}</button>
            )}
          </div>
        ) : (
        <div className="table-wrapper">
          <table className="conv-table">
            <thead>
              <tr>
                <th className="c-when">{t('Когда')}</th>
                <th className="c-seller">{terms.seller}</th>
                <th className="c-topic">{t('Тема и события')}</th>
                <th className="c-fp">{t('Разговор')}</th>
                <th className="c-score">{t('Балл')}</th>
                <th className="c-up">{t('Допродажа')}</th>
                <th className="c-out">{t('Исход')}</th>
                <th className="c-go"><span className="sr-only">{t('Открыть')}</span></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const dateObj = row._date ? new Date(row._date) : null
                const durStr = row._duration ? clock(row._duration) : '—'

                if (row._type === 'pending') {
                  const sellerName = row.seller_name || '—'
                  return (
                    <tr key={row.id}
                      onClick={() => setSelectedRec(row)}
                      className={selectedRec?.id === row.id ? 'is-selected' : undefined}
                    >
                      <td className="c-when">{dateObj ? <><b>{fmtTime(dateObj)}</b><span>{fmtDate(dateObj)}</span></> : '—'}</td>
                      <td className="c-seller">
                        <span className="person">
                          <span className="avatar" aria-hidden="true" translate="no">{initialsOf(row.seller_name)}</span>
                          <span className="ellipsis">
                            <span className="person-name ellipsis" translate="no">{sellerName}</span>
                            {row.store_name && <span className="person-sub ellipsis" translate="no">{row.store_name}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="c-topic"><div className="topic-title is-empty">{t('Разговор обрабатывается')}</div></td>
                      <td className="c-fp"><div className="fp-row"><Fingerprint data={null} /><span className="fp-dur">{durStr}</span></div></td>
                      <td className="c-score"><span className="muted">—</span></td>
                      <td className="c-up"><span className="muted">—</span></td>
                      <td className="c-out"><PipelineStatus status={row.status} /></td>
                      <td className="c-go"><ChevronRight size={16} /></td>
                    </tr>
                  )
                }

                const groupCount = row.group_count || 1
                const isExpanded = expandedGroups.has(row.id)
                const notScored = row.is_scorable === false
                return (
                  <Fragment key={row.id}>
                  <tr
                    tabIndex={0}
                    className={quickId === row.id ? 'is-selected' : undefined}
                    aria-label={L(`${row.topic || 'Разговор'}, ${row.seller_name || ''}. Открыть быстрый просмотр`, `${row.topic || 'Conversation'}, ${row.seller_name || ''}. Open quick view`)}
                    onClick={(e) => {
                      // Ctrl/⌘-клик — сразу полная карточка, обычный — быстрый просмотр
                      if (e.metaKey || e.ctrlKey) { window.open(`/conversations/${row.id}`, '_blank'); return }
                      setQuick(row.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQuick(row.id) }
                    }}
                  >
                    <td className="c-when">
                      <span style={{ display:'inline-flex', alignItems:'flex-start', gap:6 }}
                        title={row.client_phone ? `${row.call_direction === 'inbound' ? 'Входящий' : 'Исходящий'} · ${row.client_phone}` : undefined}>
                        {groupCount > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroup(row.id) }}
                            title={`${groupCount} звонков от этого клиента`}
                            style={{ display:'inline-flex', alignItems:'center', gap:1, color:'var(--accent)', flexShrink:0 }}
                          >
                            <ChevronRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform .15s' }} />
                            <span style={{ fontSize:11, fontWeight:700 }}>{groupCount}</span>
                          </button>
                        )}
                        {terms.isTelephony && row.call_direction && <DirectionIcon direction={row.call_direction} />}
                        <span>{dateObj ? <><b>{fmtTime(dateObj)}</b><span>{fmtDate(dateObj)}</span></> : '—'}</span>
                      </span>
                    </td>
                    <td className="c-seller">
                      <span className="person">
                        <span className="avatar" aria-hidden="true" translate="no">{initialsOf(row.seller_name)}</span>
                        <span className="ellipsis">
                          <span className="person-name ellipsis" translate="no">{row.seller_name || '—'}</span>
                          {row.store_name && <span className="person-sub ellipsis" translate="no">{row.store_name}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="c-topic">
                      <div className={`topic-title ${row.topic ? '' : 'is-empty'}`} translate={row.topic ? 'no' : undefined}>{row.topic || t('Без темы')}</div>
                      {(row.top_violation || row.open_objection || notScored) && (
                        <div className="topic-flags">
                          {row.top_violation && (
                            <span className={`flag ${row.top_violation_severity === 'high' ? 'is-crit' : 'is-warn'}`}>
                              <ShieldAlert aria-hidden="true" />{row.top_violation}
                            </span>
                          )}
                          {row.open_objection && (
                            <span className="flag is-warn">
                              <MessageCircleWarning aria-hidden="true" />
                              {L(`«${objectionLabel(row.open_objection)}» без ответа`, `“${t(objectionLabel(row.open_objection))}” unanswered`)}
                            </span>
                          )}
                          {notScored && (
                            <span className="flag is-plain" title={`Категория: ${CALL_CATEGORY_LABELS[row.call_category] || row.call_category || 'нецелевой'}. Не влияет на рейтинг.`}>
                              Не оценивается
                            </span>
                          )}
                        </div>
                      )}
                      {row.hit && (
                        <div className="hit">
                          <span className="mono">{clock(row.hit.t)}</span>
                          <span translate="no">«<HitText text={row.hit.text} q={q} />»</span>
                        </div>
                      )}
                    </td>
                    <td className="c-fp">
                      <div className="fp-row">
                        <Fingerprint data={fingerprints?.[row.id]} markTitle={markTitle} />
                        <span className="fp-dur">{durStr}</span>
                      </div>
                    </td>
                    <td className="c-score">{notScored ? <span className="muted">—</span> : <Meter score={row.overall_score} />}</td>
                    <td className="c-up">{notScored ? <span className="muted">—</span> : <UpsellDots value={row.upsell} />}</td>
                    <td className="c-out"><OutcomeTag outcome={row.outcome} /></td>
                    <td className="c-go"><ChevronRight size={16} /></td>
                  </tr>
                  {isExpanded && groupCount > 1 && (
                    <GroupChildRows
                      conversationId={row.id}
                      selectedConvId={null}
                      onSelect={openConversation}
                    />
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
        <div className="table-foot">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span>{t('Показывать:')}</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="select-pill"
              style={{ height: 30 }}
            >
              {[20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>{L(`· всего ${totalItems}`, `· ${totalItems} total`)}</span>
          </div>

          <nav className="pager" aria-label={t('Страницы')}>
            <button onClick={() => setPage(Math.max(1, page-1))} disabled={page===1} aria-label={t('Назад')}>←</button>
            {buildPageList(page, totalPages).map((p, i) => (
              p === '…'
                ? <span key={`e${i}`} style={{ padding:'0 4px' }}>…</span>
                : <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button onClick={() => setPage(Math.min(totalPages, page+1))} disabled={page>=totalPages} aria-label={t('Вперёд')}>→</button>
          </nav>
        </div>
      </div>

      <QuickView
        id={quickId}
        row={(conversations?.items || []).find((c: any) => c.id === quickId)}
        fingerprint={quickId ? fingerprints?.[quickId] : null}
        markTitle={markTitle}
        onClose={closeQuick}
      />

      {/* Запись ещё обрабатывается — короткая карточка статуса */}
      <Drawer isOpen={!!selectedRec} onClose={() => setSelectedRec(null)} title={drawerTitle}>
        {selectedRec && <RecordingDetail recording={selectedRec} />}
      </Drawer>
    </div>
  )
}

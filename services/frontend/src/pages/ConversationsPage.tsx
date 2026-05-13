import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { adminApi } from '@/api/admin'
import { recorderApi } from '@/api/recorder'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { Drawer } from '@/components/Drawer'
import { AudioPlayer } from '@/components/AudioPlayer'
import { AudioUploadModal } from '@/components/AudioUpload'
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Upload, CheckCircle, Clock, Loader, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, Store, Target, Award, ArrowDownUp, ChevronDown, X } from 'lucide-react'

// Подсвечивает в тексте сегмента вхождения raw_text возражений.
// Цвет: зелёный если возражение закрыто, красный если нет.
function renderTranscriptText(text: string, objections: any[]): ReactNode {
  if (!text || !objections || !objections.length) return text

  type Range = { start: number; end: number; resolved: boolean; type: string }
  const ranges: Range[] = []
  const lower = text.toLowerCase()

  for (const obj of objections) {
    const raw = ((obj?.raw_text || '') as string).trim()
    if (raw.length < 3) continue
    const needle = raw.toLowerCase()
    let pos = 0
    while ((pos = lower.indexOf(needle, pos)) !== -1) {
      ranges.push({ start: pos, end: pos + raw.length, resolved: !!obj.is_resolved, type: obj.type || '' })
      pos += raw.length
    }
  }
  if (!ranges.length) return text

  ranges.sort((a, b) => a.start - b.start)
  const merged: Range[] = []
  for (const r of ranges) {
    if (merged.length && r.start < merged[merged.length - 1].end) continue
    merged.push(r)
  }

  const parts: ReactNode[] = []
  let cursor = 0
  merged.forEach((r, i) => {
    if (cursor < r.start) parts.push(text.slice(cursor, r.start))
    const cls = r.resolved ? 'objection-mark resolved' : 'objection-mark unresolved'
    const tip = `Возражение${r.type ? `: ${r.type}` : ''} — ${r.resolved ? 'закрыто' : 'не закрыто'}`
    parts.push(
      <mark key={`m-${i}`} className={cls} title={tip}>
        {text.slice(r.start, r.end)}
      </mark>
    )
    cursor = r.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

type SortBy  = 'date' | 'name' | 'duration' | 'store'
type SortDir = 'asc' | 'desc'

const OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Покупка',
  deferred: 'Отложил',
  price_objection: 'Ценовой отказ',
  competitor: 'Ушёл к конкурентам',
  unknown: 'Не определён',
}

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1']

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
        <div style={{ width:44, height:44, borderRadius:'50%', background:AVATAR_COLORS[0], display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:16, flexShrink:0 }}>
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

// ─── Full conversation detail (analyzed) ─────────────────────────────────────
function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['conversation-detail', conversationId],
    queryFn: () => dashboardApi.getConversationDetail(conversationId),
  })

  const [audioTime, setAudioTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | undefined>()

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

  const c = data.conversation || data
  const transcript = data.transcript || {}
  const segments = transcript.segments || c.segments || data.segments || []
  const scriptResults = c.script_results || data.script_results || []
  const objections = c.objections || data.objections || []
  const sellerName = c.seller_name || c.seller_id || '?'
  const storeName = c.store_name || c.store_id || ''

  const mins = Math.floor((c.duration_seconds || 0) / 60)
  const secs = (c.duration_seconds || 0) % 60
  const dateSource = c.analyzed_at || c.recorded_at || c.session_date || ''
  const dateStr = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' }) : '—'
  const timeStr = dateSource ? new Date(dateSource).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) : ''
  const overallScore = Math.round(c.overall_score || 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Seller card */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg)', borderRadius:'var(--radius)' }}>
        <div className="avatar" style={{ background:AVATAR_COLORS[0], width:44, height:44, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:16 }}>
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
        {c.topic && <span className="tag tag-neutral">{c.topic}</span>}
        {c.compliance_ok !== undefined && (
          <span className={`tag ${c.compliance_ok ? 'tag-success' : 'tag-danger'}`}>
            Комплаенс: {c.compliance_ok ? 'OK' : 'Нарушение'}
          </span>
        )}
      </div>

      {/* Script Scoring */}
      {scriptResults.map((sr: any, i: number) => {
        const score = Math.round(sr.script_score || sr.total_score || 0)
        const sColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
        return (
          <div key={i}>
            <div style={{ fontWeight:600, color:'var(--text)', marginBottom:8 }}>Скоринг скрипта — {score}%</div>
            <div className="progress-bar" style={{ marginBottom:12 }}>
              <div className={`progress-bar-fill ${sColor}`} style={{ width:`${score}%` }} />
            </div>
            <ul className="checklist">
              {(sr.step_scores || sr.steps || []).map((step: any, j: number) => {
                const detected = step.detected !== false && (step.score > 0 || step.detected)
                return (
                  <li key={j} className="checklist-item">
                    <div className={`check-icon ${detected ? 'done' : 'missed'}`}>{detected ? '✓' : '✕'}</div>
                    <span className={`checklist-text ${detected ? 'done' : 'missed'}`}>{step.step_name || step.name}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {/* Objections */}
      {objections.length > 0 && (
        <div>
          <div style={{ fontWeight:600, color:'var(--text)', marginBottom:8 }}>Возражения клиента</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {objections.map((o: any, i: number) => (
              <span key={i} className="tag tag-warning">{o.type || o.text}</span>
            ))}
          </div>
        </div>
      )}

      {/* Audio */}
      <div>
        <div style={{ fontWeight:600, color:'var(--text)', marginBottom:8 }}>Аудиозапись</div>
        <AudioPlayer src={audioUrl} duration={c.duration_seconds} onTimeUpdate={setAudioTime} />
      </div>

      {/* Transcript */}
      {segments.length > 0 && (
        <div>
          <div style={{ fontWeight:600, color:'var(--text)', marginBottom:12 }}>Транскрипт</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {(() => {
              // Группируем подряд идущие реплики одного спикера
              const groups: { role: string; segs: any[] }[] = []
              for (const seg of segments) {
                const role = seg.speaker_role || 'unknown'
                if (groups.length > 0 && groups[groups.length - 1].role === role) {
                  groups[groups.length - 1].segs.push(seg)
                } else {
                  groups.push({ role, segs: [seg] })
                }
              }
              return groups.map((group, gi) => {
                const isSeller = group.role === 'seller'
                const firstSeg = group.segs[0]
                const startSec = firstSeg.start_time || (firstSeg.start_ms ?? 0) / 1000
                const m = Math.floor(startSec / 60)
                const s = Math.floor(startSec % 60)
                const timeStr = `${m}:${String(s).padStart(2,'0')}`
                return (
                  <div key={gi} style={{ display:'flex', flexDirection:'column', alignItems: isSeller ? 'flex-start' : 'flex-end', gap:4 }}>
                    {/* Метка спикера + время */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text-muted)', paddingLeft: isSeller ? 4 : 0, paddingRight: isSeller ? 0 : 4 }}>
                      {isSeller && <span style={{ fontWeight:600, color:'#6366F1' }}>Продавец</span>}
                      {!isSeller && <span style={{ fontWeight:600, color:'#10B981' }}>Клиент</span>}
                      <span>{timeStr}</span>
                    </div>
                    {/* Пузыри реплик */}
                    <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems: isSeller ? 'flex-start' : 'flex-end', maxWidth:'75%' }}>
                      {group.segs.map((seg, si) => (
                        <div key={si} style={{
                          padding:'8px 12px',
                          borderRadius: isSeller
                            ? (si === 0 ? '4px 16px 16px 16px' : '4px 16px 16px 4px')
                            : (si === 0 ? '16px 4px 16px 16px' : '16px 4px 4px 16px'),
                          background: isSeller ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                          border: `1px solid ${isSeller ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)'}`,
                          color:'var(--text)',
                          fontSize:13,
                          lineHeight:1.5,
                        }}>
                          {renderTranscriptText(seg.text, objections)}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
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
export function ConversationsPage() {
  const [page, setPage] = useState(1)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [selectedRec, setSelectedRec] = useState<any | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sort, setSort] = useState<{ by: SortBy; dir: SortDir }>({ by: 'date', dir: 'desc' })
  const [filters, setFilters] = useState({
    store_id: '', seller_id: '', outcome: '',
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
    queryKey: ['conversations', page, filters],
    queryFn: () => dashboardApi.getConversations({
      page, limit: 20,
      store_id: filters.store_id || undefined,
      seller_id: filters.seller_id || undefined,
      outcome: filters.outcome || undefined,
      score_min: filters.score_min,
      score_max: filters.score_max,
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

  // ─── Filter pill metadata ──────────────────────────────────────────────────
  const storeLabel = filters.store_id
    ? (stores?.items || []).find((s: any) => s.id === filters.store_id)?.name || 'Магазин'
    : 'Все магазины'
  const outcomeLabel = filters.outcome ? OUTCOME_LABELS[filters.outcome] || filters.outcome : 'Любой исход'
  const scoreValue =
    filters.score_min === 80 ? '80+' :
    filters.score_min === 60 && filters.score_max === 79 ? '60-79' :
    filters.score_max === 59 ? '<60' : ''
  const scoreLabel =
    scoreValue === '80+'   ? 'Скоринг 80%+' :
    scoreValue === '60-79' ? 'Скоринг 60–79%' :
    scoreValue === '<60'   ? 'Скоринг <60%' : 'Любой скоринг'
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
  const sortLabel = sortLabels[sortKey] || 'Сортировка'
  const sortActive = sortKey !== 'date_desc'

  const hasActiveFilters = !!(filters.store_id || filters.outcome || scoreValue || sortActive)
  const resetAll = () => {
    setFilters({ store_id:'', seller_id:'', outcome:'', score_min:undefined, score_max:undefined })
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
        {/* Store filter */}
        <label className={`filter-pill ${filters.store_id ? 'active' : ''}`}>
          <Store size={14} className="filter-pill-icon" />
          <span className="filter-pill-value">{storeLabel}</span>
          <ChevronDown size={13} className="filter-pill-chevron" />
          <select value={filters.store_id} onChange={e => { setFilters(p => ({ ...p, store_id:e.target.value })); setPage(1) }} aria-label="Магазин">
            <option value="">Все магазины</option>
            {(stores?.items || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        {/* Outcome filter */}
        <label className={`filter-pill ${filters.outcome ? 'active' : ''}`}>
          <Target size={14} className="filter-pill-icon" />
          <span className="filter-pill-value">{outcomeLabel}</span>
          <ChevronDown size={13} className="filter-pill-chevron" />
          <select value={filters.outcome} onChange={e => { setFilters(p => ({ ...p, outcome:e.target.value })); setPage(1) }} aria-label="Исход">
            <option value="">Все исходы</option>
            {Object.entries(OUTCOME_LABELS).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>

        {/* Score filter */}
        <label className={`filter-pill ${scoreValue ? 'active' : ''}`}>
          <Award size={14} className="filter-pill-icon" />
          <span className="filter-pill-value">{scoreLabel}</span>
          <ChevronDown size={13} className="filter-pill-chevron" />
          <select value={scoreValue} onChange={e => handleScoreFilter(e.target.value)} aria-label="Скоринг">
            <option value="">Любой скоринг</option>
            <option value="80+">80%+ — отличный</option>
            <option value="60-79">60–79% — средний</option>
            <option value="<60">&lt;60% — слабый</option>
          </select>
        </label>

        {/* Sort */}
        <label className={`filter-pill ${sortActive ? 'active' : ''}`}>
          <ArrowDownUp size={14} className="filter-pill-icon" />
          <span className="filter-pill-value">{sortLabel}</span>
          <ChevronDown size={13} className="filter-pill-chevron" />
          <select value={sortKey} onChange={e => {
            const [by, dir] = e.target.value.split('_') as [SortBy, SortDir]
            setSort({ by, dir })
          }} aria-label="Сортировка">
            {Object.entries(sortLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>

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

        <button className="btn btn-sm btn-primary-gradient" onClick={() => setShowUpload(true)}>
          <Upload size={14} /> Загрузить аудио
        </button>
      </div>

      <AudioUploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploadComplete={() => {}} />

      {/* Table */}
      <div className="card fade-in">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                {(['date','name','store','duration'] as const).map(col => {
                  const labels: Record<SortBy, string> = { date:'Дата и время', name:'Продавец', store:'Магазин', duration:'Длительность' }
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
                <th>Скоринг</th>
                <th>Апсейл</th>
                <th>Исход / Статус</th>
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
                      <td>—</td><td>—</td><td />
                      <td><PipelineStatus status={row.status} /></td>
                    </tr>
                  )
                }

                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                return (
                  <tr key={row.id}
                    onClick={() => { setSelectedConvId(row.id); setSelectedRec(null) }}
                    style={{ cursor:'pointer', background: selectedConvId === row.id ? 'var(--bg-active)' : undefined }}
                  >
                    <td>{dateStr} <span style={{ color:'var(--text-muted)' }}>{timeStr}</span></td>
                    <td>
                      <div className="seller-cell">
                        <div className="avatar" style={{ background:color }}>{(row.seller_name || '?')[0].toUpperCase()}</div>
                        <div className="name">{row.seller_name || row.seller_id}</div>
                      </div>
                    </td>
                    <td style={{ color:'var(--text-muted)' }}>{row.store_name || row.store_id}</td>
                    <td>{durStr}</td>
                    <td style={{ color:'var(--text-secondary)' }}>{row.topic || '—'}</td>
                    <td><ScoreBadge score={row.overall_score} /></td>
                    <td>
                      {row.has_upsell !== undefined && (
                        <span className={`tag ${row.has_upsell ? 'tag-success' : 'tag-neutral'}`}>
                          {row.has_upsell ? 'Да' : 'Нет'}
                        </span>
                      )}
                    </td>
                    <td><OutcomeTag outcome={row.outcome} /></td>
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
      <Drawer isOpen={!!(selectedConvId || selectedRec)} onClose={() => { setSelectedConvId(null); setSelectedRec(null) }} title={drawerTitle}>
        {selectedConvId && <ConversationDetail conversationId={selectedConvId} />}
        {selectedRec && !selectedConvId && <RecordingDetail recording={selectedRec} />}
      </Drawer>
    </div>
  )
}

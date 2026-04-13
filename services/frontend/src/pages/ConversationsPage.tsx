import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { adminApi } from '@/api/admin'
import { ScoreBadge } from '@/components/ScoreBadge'
import { OutcomeTag } from '@/components/OutcomeTag'
import { Drawer } from '@/components/Drawer'
import { AudioPlayer } from '@/components/AudioPlayer'
import { AudioUploadModal } from '@/components/AudioUpload'
import { useState, useEffect } from 'react'
import { Upload } from 'lucide-react'
import { recorderApi } from '@/api/recorder'

const OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Покупка',
  deferred: 'Отложил',
  price_objection: 'Ценовой отказ',
  competitor: 'Ушёл к конкурентам',
  unknown: 'Не определён',
}

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1']

function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['conversation-detail', conversationId],
    queryFn: () => dashboardApi.getConversationDetail(conversationId),
  })

  const [audioTime, setAudioTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | undefined>()

  const recordingId = data?.conversation?.recording_id || data?.recording_id
  useEffect(() => {
    if (recordingId) {
      recorderApi.getAudioUrl(recordingId).then(setAudioUrl).catch(() => {})
    }
  }, [recordingId])

  if (isLoading) return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>
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
  const dateStr = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—'
  const timeStr = dateSource ? new Date(dateSource).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit',
  }) : ''

  const overallScore = Math.round(c.overall_score || 0)
  const scoreColor = overallScore >= 80 ? 'var(--success)' : overallScore >= 60 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Meta tags */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span className="tag tag-neutral">{dateStr} {timeStr}</span>
        <span className="tag tag-neutral">{mins}:{String(secs).padStart(2, '0')}</span>
        <OutcomeTag outcome={c.outcome} />
        {c.compliance_ok !== undefined && (
          <span className={`tag ${c.compliance_ok ? 'tag-success' : 'tag-danger'}`}>
            Комплаенс: {c.compliance_ok ? 'OK' : 'Нарушение'}
          </span>
        )}
      </div>

      {/* Seller card */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)',
      }}>
        <div className="avatar" style={{
          background: AVATAR_COLORS[0], width: 40, height: 40, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 600, fontSize: '14px',
        }}>
          {sellerName[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{sellerName}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{storeName}</div>
        </div>
        {c.topic && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{c.topic}</div>
        )}
      </div>

      {/* Script Scoring */}
      {scriptResults.map((sr: any, i: number) => {
        const score = Math.round(sr.script_score || sr.total_score || 0)
        const sColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
        return (
          <div key={i}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
              Скоринг скрипта — {score}%
            </div>
            <div className="progress-bar" style={{ marginBottom: '12px' }}>
              <div className={`progress-bar-fill ${sColor}`} style={{ width: `${score}%` }} />
            </div>
            <ul className="checklist">
              {(sr.step_scores || sr.steps || []).map((step: any, j: number) => {
                const detected = step.detected !== false && (step.score > 0 || step.detected)
                return (
                  <li key={j} className="checklist-item">
                    <div className={`check-icon ${detected ? 'done' : 'missed'}`}>
                      {detected ? '✓' : '✕'}
                    </div>
                    <span className={`checklist-text ${detected ? 'done' : 'missed'}`}>
                      {step.step_name || step.name}
                    </span>
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
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
            Обнаруженные возражения
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {objections.map((o: any, i: number) => (
              <span key={i} className="tag tag-warning">{o.type || o.text}</span>
            ))}
          </div>
        </div>
      )}

      {/* Audio Player */}
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Аудиозапись</div>
        <AudioPlayer src={audioUrl} duration={c.duration_seconds} onTimeUpdate={setAudioTime} />
      </div>

      {/* Transcript */}
      {segments.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Транскрипт</div>
          <div className="transcript">
            {segments.map((seg: any, i: number) => {
              const startSec = (seg.start_time || seg.start_ms / 1000 || 0)
              const m = Math.floor(startSec / 60)
              const s = Math.floor(startSec % 60)
              const isSeller = seg.speaker_role === 'seller'
              return (
                <div key={i} className="transcript-line">
                  <div className="transcript-time">{m}:{String(s).padStart(2, '0')}</div>
                  <div className={`transcript-speaker ${isSeller ? 'seller' : 'client'}`}>
                    {isSeller ? 'Продавец' : 'Клиент'}
                  </div>
                  <div className="transcript-text">{seg.text}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-outline btn-sm">В обучение</button>
        <button className="btn btn-outline btn-sm">Экспорт</button>
        <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }}>Отметить нарушение</button>
      </div>
    </div>
  )
}

export function ConversationsPage() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [filters, setFilters] = useState({
    store_id: '',
    seller_id: '',
    outcome: '',
    score_min: undefined as number | undefined,
    score_max: undefined as number | undefined,
  })

  const { data: stores } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => adminApi.getStores(),
  })

  const { data: conversations, refetch } = useQuery({
    queryKey: ['conversations', page, filters],
    queryFn: () =>
      dashboardApi.getConversations({
        page,
        limit: 20,
        store_id: filters.store_id || undefined,
        seller_id: filters.seller_id || undefined,
        outcome: filters.outcome || undefined,
        score_min: filters.score_min,
        score_max: filters.score_max,
      }),
  })

  const handleScoreFilter = (value: string) => {
    if (value === '80+') setFilters((p) => ({ ...p, score_min: 80, score_max: undefined }))
    else if (value === '60-79') setFilters((p) => ({ ...p, score_min: 60, score_max: 79 }))
    else if (value === '<60') setFilters((p) => ({ ...p, score_min: undefined, score_max: 59 }))
    else setFilters((p) => ({ ...p, score_min: undefined, score_max: undefined }))
    setPage(1)
  }

  return (
    <div>
      {/* Filter Bar */}
      <div className="filter-bar fade-in">
        <select
          value={filters.store_id}
          onChange={(e) => { setFilters((p) => ({ ...p, store_id: e.target.value })); setPage(1) }}
        >
          <option value="">Все магазины</option>
          {(stores?.items || []).map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filters.outcome}
          onChange={(e) => { setFilters((p) => ({ ...p, outcome: e.target.value })); setPage(1) }}
        >
          <option value="">Все исходы</option>
          {Object.entries(OUTCOME_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          onChange={(e) => handleScoreFilter(e.target.value)}
        >
          <option value="">Любой скоринг</option>
          <option value="80+">80%+</option>
          <option value="60-79">60–79%</option>
          <option value="<60">&lt; 60%</option>
        </select>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {conversations?.total || 0} разговоров
        </span>

        <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}>
          <Upload size={14} /> Загрузить аудио
        </button>
      </div>

      {/* Upload Modal */}
      <AudioUploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploadComplete={() => refetch()} />

      {/* Table */}
      <div className="card fade-in">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Дата и время</th>
                <th>Продавец</th>
                <th>Магазин</th>
                <th>Длительность</th>
                <th>Тема</th>
                <th>Скоринг</th>
                <th>Апсейл</th>
                <th>Исход</th>
              </tr>
            </thead>
            <tbody>
              {(conversations?.items || []).map((c, idx) => {
                const mins = Math.floor((c.duration_seconds || 0) / 60)
                const secs = (c.duration_seconds || 0) % 60
                const dateSource = c.analyzed_at || c.recorded_at || c.session_date || ''
                const dateObj = dateSource ? new Date(dateSource) : null
                const dateStr = dateObj
                  ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                  : '—'
                const timeStr = dateObj
                  ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                  : ''
                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length]

                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      cursor: 'pointer',
                      background: selectedId === c.id ? 'var(--bg-active)' : undefined,
                    }}
                  >
                    <td>{dateStr} <span style={{ color: 'var(--text-muted)' }}>{timeStr}</span></td>
                    <td>
                      <div className="seller-cell">
                        <div className="avatar" style={{ background: color }}>
                          {((c as any).seller_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="name">{(c as any).seller_name || c.seller_id}</div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{(c as any).store_name || c.store_id}</td>
                    <td>{mins}:{String(secs).padStart(2, '0')}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.topic || '—'}</td>
                    <td><ScoreBadge score={c.overall_score} /></td>
                    <td>
                      {c.has_upsell !== undefined && (
                        <span className={`tag ${c.has_upsell ? 'tag-success' : 'tag-neutral'}`}>
                          {c.has_upsell ? 'Да' : 'Нет'}
                        </span>
                      )}
                    </td>
                    <td><OutcomeTag outcome={c.outcome} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
            ← Назад
          </button>
          <span style={{ margin: '0 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Страница {page}
          </span>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setPage(page + 1)}
            disabled={!conversations || conversations.items.length < 20}
          >
            Вперёд →
          </button>
        </div>
      </div>

      {/* Detail Drawer */}
      <Drawer
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={selectedId ? `Разговор #${selectedId.slice(0, 8)}` : 'Разговор'}
      >
        {selectedId && <ConversationDetail conversationId={selectedId} />}
      </Drawer>
    </div>
  )
}

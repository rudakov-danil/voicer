/* Общие части карточки разговора: справочники, резюме, покрытие блоков, история клиента,
   подсветки транскрипта и анализ допродажи. Используются страницей разговора и списком. */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useCallback, type ReactNode } from 'react'
import { PhoneIncoming, PhoneOutgoing, History, ArrowDown, Loader, RefreshCw, Sparkles } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { analyticsApi } from '@/api/analytics'
import { scriptsApi } from '@/api/scripts'
import { OutcomeTag } from '@/components/OutcomeTag'
import { ScoreBadge } from '@/components/ScoreBadge'
import {
  highlightRulesForSell,
  analyzeSell,
  type HighlightRule,
} from '@/components/scripts/conversationHelpers'

export const OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Покупка',
  deferred: 'Отложено',
  price_refusal: 'Отказ по цене',
  competitor: 'Ушёл к конкурентам',
  unknown: 'Не определён',
}

// Исходы звонков (телефония) — добавляются к фильтру для telephony-организаций
export const TELEPHONY_OUTCOME_LABELS: Record<string, string> = {
  purchase: 'Продажа / заявка',
  appointment: 'Встреча назначена',
  callback: 'Перезвон',
  deferred: 'Думает',
  refusal: 'Отказ',
  transfer: 'Перевод звонка',
  non_target: 'Нецелевой',
  voicemail: 'Недозвон',
  resolved: 'Вопрос решён',
  unknown: 'Не определён',
}

// Категории обращения (телефония) — для учёта нецелевых/сервисных звонков
export const CALL_CATEGORY_LABELS: Record<string, string> = {
  sales: 'Продажный',
  service: 'Сервисный',
  non_target: 'Нецелевой',
  other: 'Прочее',
}

export function DirectionIcon({ direction }: { direction?: string | null }) {
  if (direction === 'inbound') return <PhoneIncoming size={13} style={{ color: 'var(--success)', flexShrink: 0 }} aria-label="Входящий" />
  if (direction === 'outbound') return <PhoneOutgoing size={13} style={{ color: '#6366F1', flexShrink: 0 }} aria-label="Исходящий" />
  return null
}

export const OBJECTION_TYPE_LABELS: Record<string, string> = {
  price: 'Цена',
  quality: 'Качество',
  competitors: 'Конкуренты',
  timing: 'Время',
  trust: 'Доверие',
  not_ready: 'Не готов',
  functionality: 'Функциональность',
}

/** Лейблы типов возражений: настраиваемый справочник организации поверх стандартных. */
export function useObjectionTypeLabel(): (type: string | undefined | null) => string {
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

export function HighlightLegend() {
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


// ─── Fulltext script coverage (блочное покрытие полнотекстового скрипта) ─────
export const BLOCK_STATUS_META: Record<string, { icon: string; cls: string; label: string }> = {
  spoken: { icon: '✓', cls: 'done', label: 'произнесён по тексту' },
  paraphrased: { icon: '~', cls: 'partial', label: 'своими словами' },
  missed: { icon: '✕', cls: 'missed', label: 'пропущен' },
  // Ситуация не возникла — блок закономерно не нужен, не штрафуем (нейтрально)
  not_applicable: { icon: '–', cls: 'na', label: 'не требовался' },
}

export function FulltextCoverage({ scriptResult, score, sColor, shortName }: {
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

// ─── Lightweight Markdown renderer for AI summary ────────────────────────────
// Резюме приходит в лёгком Markdown: **жирный** инлайн + маркеры «- ». Без внешних
// зависимостей: разбиваем на строки, поддерживаем **bold** и списки.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${keyBase}-${i}`} style={{ color: 'var(--text)' }}>{p.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{p}</span>
  )
}

export function SummaryMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let bullets: ReactNode[] = []
  const flushBullets = () => {
    if (bullets.length) {
      out.push(<ul key={`ul-${out.length}`} style={{ margin: '4px 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{bullets}</ul>)
      bullets = []
    }
  }
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) { flushBullets(); return }
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/)
    if (bulletMatch) {
      bullets.push(<li key={`li-${i}`} style={{ lineHeight: 1.5 }}>{renderInline(bulletMatch[1], `li-${i}`)}</li>)
    } else {
      flushBullets()
      out.push(<p key={`p-${i}`} style={{ margin: '0 0 8px', lineHeight: 1.55 }}>{renderInline(line, `p-${i}`)}</p>)
    }
  })
  flushBullets()
  return <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{out}</div>
}

// ─── История обращений с того же номера клиента ──────────────────────────────
export function ClientHistory({ conversationId, onSelect }: {
  conversationId: string
  onSelect?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['client-history', conversationId],
    queryFn: () => dashboardApi.getClientHistory(conversationId),
    staleTime: 60 * 1000,
    retry: 1,
  })
  const items = data?.items || []
  // Показываем блок только если у клиента есть ДРУГИЕ обращения помимо текущего
  if (items.length < 2) return null

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13,
        }}
      >
        <History size={15} style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 600 }}>История обращений</span>
        {data?.client_phone && <span style={{ color: 'var(--text-muted)' }}>· {data.client_phone}</span>}
        <span className="tag tag-neutral" style={{ marginLeft: 'auto' }}>{items.length}</span>
        <ArrowDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it) => {
            const d = it.session_date ? new Date(it.session_date) : null
            const dateStr = d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
            const mins = Math.floor((it.duration_seconds || 0) / 60)
            const secs = (it.duration_seconds || 0) % 60
            return (
              <div
                key={it.id}
                onClick={() => { if (!it.is_current && onSelect) onSelect(it.id) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                  borderTop: '1px solid var(--border)',
                  cursor: it.is_current ? 'default' : 'pointer',
                  background: it.is_current ? 'var(--bg-active, rgba(99,102,241,0.08))' : 'transparent',
                }}
              >
                <DirectionIcon direction={it.call_direction} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {dateStr}
                    {it.is_current && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>· текущий</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.topic || '—'}{it.seller_name ? ` · ${it.seller_name}` : ''}{it.duration_seconds ? ` · ${mins}:${String(secs).padStart(2, '0')}` : ''}
                  </div>
                </div>
                <OutcomeTag outcome={it.outcome || 'unknown'} />
                {it.overall_score != null && <ScoreBadge score={it.overall_score} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Вкладка «Резюме диалога» (генерируется LLM по запросу) ───────────────────
export function SummaryTab({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient()
  const [regenerating, setRegenerating] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['conversation-summary', conversationId],
    queryFn: () => analyticsApi.getConversationSummary(conversationId),
    staleTime: Infinity,
    retry: false,
  })

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const fresh = await analyticsApi.getConversationSummary(conversationId, true)
      qc.setQueryData(['conversation-summary', conversationId], fresh)
    } catch { /* ошибка отобразится ниже при повторном рендере, оставляем прошлое резюме */ }
    finally { setRegenerating(false) }
  }

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 20px', color: 'var(--text-muted)', justifyContent: 'center' }}>
      <Loader size={16} style={{ animation: 'viq-spin 1s linear infinite' }} />
      ИИ составляет резюме диалога...
    </div>
  )

  if (isError && !data) {
    const status = (error as any)?.response?.status
    const msg = status === 422
      ? 'Для этого разговора нет транскрипта — резюме недоступно.'
      : 'Не удалось сгенерировать резюме. Попробуйте ещё раз позже.'
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{msg}</div>
        {status !== 422 && (
          <button className="btn btn-outline btn-sm" onClick={regenerate} disabled={regenerating}>
            <RefreshCw size={13} style={regenerating ? { animation: 'viq-spin 1s linear infinite' } : undefined} /> Повторить
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={15} style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Резюме диалога</span>
        <button
          className="btn btn-outline btn-sm"
          onClick={regenerate}
          disabled={regenerating}
          title="Сгенерировать резюме заново"
          style={{ marginLeft: 'auto' }}
        >
          <RefreshCw size={13} style={regenerating ? { animation: 'viq-spin 1s linear infinite' } : undefined} />
          {regenerating ? 'Обновление...' : 'Обновить'}
        </button>
      </div>
      {data?.summary && (
        <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
          <SummaryMarkdown text={data.summary} />
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Резюме составлено ИИ на основе транскрипта. Может содержать неточности.
      </div>
    </div>
  )
}


// ─── Анализ разговора: допродажа и подсветки транскрипта ──────────────────────
// Метрика допродажи — «продавец УПОМЯНУЛ апсейл/кросс-сейл», а не «клиент купил».
export type SellStatus = 'no-trigger' | 'complete' | 'partial' | 'missed'
export interface SellAnalysis { triggered: boolean; matched: number; total: number; missed: string[]; status: SellStatus | string }

function sellFromResults(results: any[]): SellAnalysis {
  let total = 0, matched = 0
  const missed: string[] = []
  for (const r of results) {
    const required: string[] = r.required_offers || []
    const offered: string[] = r.offered_items || []
    total += required.length
    matched += offered.length
    for (const m of (r.missed_items || [])) missed.push(m)
  }
  let status: SellStatus = 'no-trigger'
  if (results.length > 0) {
    if (total === 0 || matched === total) status = 'complete'
    else if (matched === 0) status = 'missed'
    else status = 'partial'
  }
  return { triggered: true, matched, total, missed, status }
}

/** Допродажа и правила подсветки для детальной карточки. LLM-результаты с бэкенда
 *  в приоритете; для старых разговоров без них — клиентский матч по правилам. */
export function useConversationAnalysis(c: any, segments: any[]) {
  const { data: upsellRules } = useQuery({
    queryKey: ['upsell-rules-all'],
    queryFn: () => scriptsApi.listUpsellRules(),
  })
  const { data: crossSellRules } = useQuery({
    queryKey: ['cross-sell-rules-all'],
    queryFn: () => scriptsApi.listCrossSellRules(),
  })

  const scriptResults: any[] = c?.script_results || []
  const objections: any[] = c?.objections || []
  const storeId: string | undefined = c?.store_id
  const sellerId: string | undefined = c?.seller_id
  const upsellResults: any[] = Array.isArray(c?.upsell_results) ? c.upsell_results : []
  const crosssellResults: any[] = Array.isArray(c?.crosssell_results) ? c.crosssell_results : []

  const upsellAnalysis: SellAnalysis = useMemo(() => {
    if (c?.has_upsell != null && upsellResults.length > 0) return sellFromResults(upsellResults)
    return analyzeSell(upsellRules as any, segments, storeId, sellerId)
  }, [c?.has_upsell, upsellResults, upsellRules, segments, storeId, sellerId])

  const crossSellAnalysis: SellAnalysis = useMemo(() => {
    if (c?.has_crosssell != null && crosssellResults.length > 0) return sellFromResults(crosssellResults)
    return analyzeSell(crossSellRules as any, segments, storeId, sellerId)
  }, [c?.has_crosssell, crosssellResults, crossSellRules, segments, storeId, sellerId])

  const highlightRules: HighlightRule[] = useMemo(() => {
    const rules: HighlightRule[] = []
    for (const sr of scriptResults) {
      // Полнотекстовый скрипт: цитаты, подтверждающие блоки. spoken — по тексту, paraphrased — своими словами.
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
        // Подсвечиваем только реально выполненные этапы (≥70%) — частичные вводят в заблуждение
        if (!isDetected || rawScore < 70) continue
        rules.push({ text: evidence, kind: 'script-done', tooltip: `Этап «${step.step_name || step.name}» — выполнен (${Math.round(rawScore)}%)` })
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
    // Цитаты LLM по апсейлу/кросс-сейлу — дословные, устойчивые к опечаткам транскрибации
    const pushSellQuotes = (results: any[], kind: 'upsell' | 'crosssell') => {
      const label = kind === 'upsell' ? 'Апсейл' : 'Кросс-сейл'
      for (const r of results) {
        const product = r.trigger_product || ''
        for (const q of (r.trigger_quotes || [])) {
          if (typeof q === 'string' && q.trim().length >= 3) rules.push({ text: q, kind: `${kind}-trigger` as any, tooltip: `${label}: триггер «${product}»` })
        }
        const offerQuotes: Record<string, string[]> = r.offer_quotes || {}
        for (const offer in offerQuotes) {
          for (const q of (offerQuotes[offer] || [])) {
            if (typeof q === 'string' && q.trim().length >= 3) rules.push({ text: q, kind: `${kind}-offer` as any, tooltip: `${label}: предложение «${offer}»` })
          }
        }
      }
    }
    if (upsellResults.length > 0) pushSellQuotes(upsellResults, 'upsell')
    else rules.push(...highlightRulesForSell(upsellRules as any, storeId, 'upsell', sellerId))
    if (crosssellResults.length > 0) pushSellQuotes(crosssellResults, 'crosssell')
    else rules.push(...highlightRulesForSell(crossSellRules as any, storeId, 'crosssell', sellerId))
    return rules
  }, [scriptResults, objections, upsellResults, crosssellResults, upsellRules, crossSellRules, storeId, sellerId])

  return { highlightRules, upsellAnalysis, crossSellAnalysis, upsellResults, crosssellResults }
}

// ─── Где в разговоре прозвучала цитата ───────────────────────────────────────
// Возражения, нарушения и доказательства этапов хранятся цитатами без таймкода —
// ищем реплику с наибольшим совпадением слов (как dashboard-service/app/fingerprint.py).
const WORD = /[0-9a-zа-яё]+/gi
function tokens(text: string): Set<string> {
  return new Set(((text || '').toLowerCase().replace(/ё/g, 'е').match(WORD) || []).filter((w) => w.length > 2))
}

/** Индекс реплики, где прозвучала цитата, или -1. */
export function locateQuote(quote: string, segments: Array<{ text: string }>): number {
  const q = tokens(quote)
  if (!q.size) return -1
  let best = -1
  let bestScore = 0
  segments.forEach((seg, i) => {
    const st = tokens(seg.text)
    if (!st.size) return
    let matched = 0
    q.forEach((w) => { if (st.has(w)) matched++ })
    if (!matched) return
    const score = matched >= 3 || matched === q.size ? matched / Math.min(q.size, st.size) : matched / q.size
    if (score > bestScore) { best = i; bestScore = score }
  })
  return bestScore >= 0.6 ? best : -1
}

export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(fn, [])
}

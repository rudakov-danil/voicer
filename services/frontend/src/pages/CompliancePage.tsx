import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Shield, Plus, Trash2, Edit3, Check, X, AlertTriangle,
  MessageSquareOff, Smile, UserCheck, Lock, Sparkles, BookOpen,
  HandMetal, Scale, ShieldAlert, Megaphone, Clock, Heart,
  ExternalLink, ChevronDown, ChevronRight,
} from 'lucide-react'
import {
  complianceApi,
  type ComplianceRule, type Severity,
  type ComplianceSummary, type ScriptIssuesSummary, type ScriptIssue,
} from '@/api/compliance'

// ─── Готовые шаблоны (для быстрого создания) ────────────────────────────────

interface PresetRule {
  id: string
  title: string
  description: string
  severity: Severity
  icon: typeof Shield
  keywords: string[]
}

const PRESET_RULES: PresetRule[] = [
  {
    id: 'no-profanity',
    title: 'Без нецензурной лексики и оскорблений',
    description: 'Запрещено использование ругательств, сленга и оскорбительных выражений в адрес клиента, коллег или конкурентов. Сюда же относятся пренебрежительные и обесценивающие высказывания, унижение клиента или его выбора.',
    severity: 'high', icon: MessageSquareOff,
    keywords: ['ругательство', 'мат', 'нецензур', 'оскорб', 'унижен', 'пренебреж', 'обесцен'],
  },
  {
    id: 'no-conflict',
    title: 'Не вступать в конфликт с клиентом',
    description: 'При недовольстве клиента сохранять спокойный тон, не повышать голос, не переходить на личности и не использовать сарказм.',
    severity: 'high', icon: HandMetal,
    keywords: ['конфликт', 'хамство', 'сарказм', 'грубость'],
  },
  {
    id: 'no-pressure',
    title: 'Не давить на клиента',
    description: 'Не использовать манипулятивные техники, угрозы дефицита, чувство вины. Клиент должен иметь возможность спокойно принять решение.',
    severity: 'medium', icon: Scale,
    keywords: ['давление', 'манипуляция', 'дефицит', 'агрессия'],
  },
  {
    id: 'no-false-promises',
    title: 'Не давать ложных обещаний',
    description: 'Не обещать скидки, сроки доставки, характеристики товара или акции, которые не подтверждены компанией.',
    severity: 'high', icon: ShieldAlert,
    keywords: ['ложь', 'недостоверно', 'обещание', 'гарантия'],
  },
  {
    id: 'no-competitor-bashing',
    title: 'Не критиковать конкурентов',
    description: 'Не отзываться негативно о других магазинах, брендах или производителях. Обсуждать только преимущества собственного предложения.',
    severity: 'medium', icon: Shield,
    keywords: ['конкурент', 'другой магазин'],
  },
  {
    id: 'greeting',
    title: 'Представиться и поприветствовать',
    description: 'В начале разговора назвать своё имя, магазин и поздороваться с клиентом.',
    severity: 'low', icon: Smile,
    keywords: ['приветствие', 'представление'],
  },
  {
    id: 'use-client-name',
    title: 'Обращаться к клиенту по имени',
    description: 'Если клиент представился — использовать его имя в разговоре. Это формирует доверие и персональный подход.',
    severity: 'low', icon: UserCheck,
    keywords: ['по имени'],
  },
  {
    id: 'no-interrupt',
    title: 'Не перебивать клиента',
    description: 'Дать клиенту договорить мысль, не прерывать его вопросом или ответом. Делать паузу перед своей репликой.',
    severity: 'medium', icon: Clock,
    keywords: ['перебивание', 'прерывание'],
  },
  {
    id: 'no-pii-disclosure',
    title: 'Соблюдать конфиденциальность',
    description: 'Не разглашать персональные данные других клиентов, не упоминать суммы или историю покупок третьих лиц.',
    severity: 'high', icon: Lock,
    keywords: ['персональные данные', 'конфиденциальность'],
  },
  {
    id: 'polite-farewell',
    title: 'Вежливое прощание',
    description: 'Поблагодарить клиента за визит/обращение, пожелать хорошего дня, попрощаться даже если клиент ничего не купил.',
    severity: 'low', icon: Heart,
    keywords: ['прощание', 'благодарность'],
  },
  {
    id: 'no-jargon',
    title: 'Объяснять без сложного жаргона',
    description: 'Избегать узкоспециальных терминов без пояснения. Если используете термин — поясните его простыми словами.',
    severity: 'low', icon: Megaphone,
    keywords: ['жаргон', 'термин'],
  },
  {
    id: 'no-misleading',
    title: 'Не вводить клиента в заблуждение',
    description: 'Не искажать характеристики товара, не умалчивать о существенных условиях покупки (комиссии, сроки, ограничения).',
    severity: 'high', icon: AlertTriangle,
    keywords: ['заблуждение', 'искажение', 'обман'],
  },
]

const severityMeta: Record<Severity, { label: string; color: string; bg: string }> = {
  high:   { label: 'Высокая',  color: 'var(--danger)',     bg: 'var(--danger-light)'  },
  medium: { label: 'Средняя',  color: 'var(--warning)',    bg: 'var(--warning-light)' },
  low:    { label: 'Низкая',   color: 'var(--text-muted)', bg: 'var(--bg)'            },
}

// ─── Мелкие плашки (без класса .badge — у него глобальный position:absolute) ─

function SeverityPill({ severity }: { severity: Severity }) {
  const m = severityMeta[severity]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
      background: m.bg, color: m.color, lineHeight: 1.4,
    }}>
      {m.label}
    </span>
  )
}

function TagPill({ children, color = 'var(--text-muted)', bg = 'var(--bg)' }: {
  children: React.ReactNode; color?: string; bg?: string;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontSize: 10, fontWeight: 500, letterSpacing: 0.2,
      background: bg, color, lineHeight: 1.4,
    }}>
      {children}
    </span>
  )
}

// ─── Карточка правила ──────────────────────────────────────────────────────

function RuleCard({
  rule, onPatch, onDelete, isCustom,
}: {
  rule: ComplianceRule
  onPatch: (data: Partial<ComplianceRule>) => void
  onDelete: () => void
  isCustom: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(rule.title)
  const [description, setDescription] = useState(rule.description)
  const [severity, setSeverity] = useState<Severity>(rule.severity)
  const [keywords, setKeywords] = useState((rule.keywords || []).join(', '))

  const commit = () => {
    const t = title.trim()
    if (!t) { setTitle(rule.title); setEditing(false); return }
    const kws = keywords.split(',').map((k) => k.trim()).filter(Boolean)
    onPatch({ title: t, description: description.trim(), severity, keywords: kws })
    setEditing(false)
  }
  const cancel = () => {
    setTitle(rule.title)
    setDescription(rule.description)
    setSeverity(rule.severity)
    setKeywords((rule.keywords || []).join(', '))
    setEditing(false)
  }

  const sev = severityMeta[rule.severity]

  return (
    <div style={{
      padding: 16,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      opacity: rule.is_active ? 1 : 0.65,
      borderLeft: `3px solid ${sev.color}`,
    }}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название правила" autoFocus />
          <textarea
            className="form-input" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Подробное описание того, что считается нарушением"
            rows={3} style={{ resize: 'vertical', minHeight: 70 }}
          />
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Подсказки для LLM (через запятую) — опциональные ключевые слова, на которые LLM обратит внимание
            </label>
            <input
              className="form-input" value={keywords} onChange={(e) => setKeywords(e.target.value)}
              placeholder="например: ругательств, мат, оскорб"
              style={{ fontSize: 12.5 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Важность:</label>
            {(['high', 'medium', 'low'] as Severity[]).map((s) => (
              <button key={s} type="button" onClick={() => setSeverity(s)} style={{
                cursor: 'pointer',
                background: severity === s ? severityMeta[s].bg : 'transparent',
                color: severityMeta[s].color,
                border: `1px solid ${severityMeta[s].color}`,
                padding: '3px 10px', fontSize: 11, borderRadius: 999,
              }}>{severityMeta[s].label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button className="btn btn-outline btn-sm" onClick={cancel} type="button"><X size={13} /> Отмена</button>
            <button className="btn btn-primary btn-sm" onClick={commit} type="button"><Check size={13} /> Сохранить</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{rule.title}</h4>
              <SeverityPill severity={rule.severity} />
              {isCustom && <TagPill>Пользовательское</TagPill>}
            </div>
            {rule.description && (
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{rule.description}</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div
              className={`toggle-switch ${rule.is_active ? 'on' : ''}`}
              onClick={() => onPatch({ is_active: !rule.is_active })}
              title={rule.is_active ? 'Активно' : 'Отключено'}
            />
            <button className="btn-icon" onClick={() => setEditing(true)} title="Редактировать"><Edit3 size={14} /></button>
            <button
              className="btn-icon"
              onClick={() => { if (confirm(`Удалить правило «${rule.title}»?`)) onDelete() }}
              title="Удалить"
              style={{ color: 'var(--danger)' }}
            ><Trash2 size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Форма добавления ───────────────────────────────────────────────────────

function AddRuleForm({ onAdd, onCancel, busy }: {
  onAdd: (rule: { title: string; description: string; severity: Severity; keywords: string[]; is_active: boolean }) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [keywords, setKeywords] = useState('')

  const submit = () => {
    const t = title.trim()
    if (!t) return
    onAdd({
      title: t,
      description: description.trim(),
      severity,
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      is_active: true,
    })
    setTitle(''); setDescription(''); setSeverity('medium'); setKeywords('')
  }

  return (
    <div style={{
      padding: 16, border: '1px dashed var(--primary)',
      background: 'rgba(37,99,235,0.03)', borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Plus size={16} style={{ color: 'var(--primary)' }} />
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Новое правило</h4>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: «Не использовать обращение „мужчина/женщина“»" autoFocus />
        <textarea
          className="form-input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Опишите, что считать нарушением — LLM использует это описание при проверке диалогов"
          rows={3} style={{ resize: 'vertical', minHeight: 70 }}
        />
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Подсказки для LLM (через запятую) — опционально
          </label>
          <input className="form-input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="например: ругательств, мат, оскорб" style={{ fontSize: 12.5 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Важность:</label>
          {(['high', 'medium', 'low'] as Severity[]).map((s) => (
            <button key={s} type="button" onClick={() => setSeverity(s)} style={{
              cursor: 'pointer',
              background: severity === s ? severityMeta[s].bg : 'transparent',
              color: severityMeta[s].color, border: `1px solid ${severityMeta[s].color}`,
              padding: '3px 10px', fontSize: 11, borderRadius: 999,
            }}>{severityMeta[s].label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" onClick={onCancel} type="button"><X size={13} /> Отмена</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!title.trim() || busy} type="button">
            <Check size={13} /> {busy ? 'Сохраняем…' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Карточка пресета ──────────────────────────────────────────────────────

function PresetCard({ preset, onAdd, busy }: { preset: PresetRule; onAdd: () => void; busy?: boolean }) {
  const Icon = preset.icon
  const sev = severityMeta[preset.severity]
  return (
    <div onClick={() => !busy && onAdd()} style={{
      padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', cursor: busy ? 'wait' : 'pointer',
      transition: 'transform 0.08s, border-color 0.1s, box-shadow 0.1s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.08)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 32, height: 32, flexShrink: 0,
          background: sev.bg, color: sev.color, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon size={16} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0, marginBottom: 3, lineHeight: 1.3 }}>{preset.title}</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>{preset.description}</p>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: sev.color, fontWeight: 500 }}>{sev.label} важность</span>
            <span style={{ fontSize: 11, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Plus size={12} /> Добавить
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Аналитика ─────────────────────────────────────────────────────────────

const severityRank: Record<Severity, number> = { high: 3, medium: 2, low: 1 }

const OBJECTION_TYPE_LABELS: Record<string, string> = {
  price: 'Цена',
  quality: 'Качество',
  competitors: 'Конкуренты',
  timing: 'Время',
  trust: 'Доверие',
  not_ready: 'Не готов',
  functionality: 'Функциональность',
}

function objectionTypeLabel(type: string | undefined | null): string {
  if (!type) return ''
  return OBJECTION_TYPE_LABELS[type] || type
}

// Универсальная структура для группировки фактов разных типов по разговору.
interface GroupedFact {
  // Уникальный ключ внутри карточки разговора (для React key).
  key: string
  // Severity для левой полосы карточки разговора и плашки.
  severity: Severity
  // Заголовок факта (название правила / название скрипта / тип возражения).
  title: string
  // Подзаголовок (опц.): тип факта (например, «Скрипт», «Возражение») или комментарий.
  badge?: { label: string; color: string; bg: string }
  // Цитата (для compliance: evidence; для script: сам текст; для objection: raw_text).
  evidence?: string
  // Объяснение от LLM (для compliance).
  explanation?: string
}

interface GroupedConversation {
  conversation_id: string
  session_date: string
  seller_name?: string | null
  store_name?: string | null
  topic?: string | null
  outcome?: string | null
  facts: GroupedFact[]
  worst_severity: Severity
}

function groupCompliance(items: ComplianceSummary['recent']): GroupedConversation[] {
  const byConv = new Map<string, GroupedConversation>()
  for (const v of items) {
    let g = byConv.get(v.conversation_id)
    if (!g) {
      g = {
        conversation_id: v.conversation_id, session_date: v.session_date,
        seller_name: v.seller_name, store_name: v.store_name,
        topic: v.topic, outcome: v.outcome,
        facts: [], worst_severity: v.severity,
      }
      byConv.set(v.conversation_id, g)
    }
    g.facts.push({
      key: v.id, severity: v.severity, title: v.rule_title,
      evidence: v.evidence, explanation: v.explanation,
    })
    if (severityRank[v.severity] > severityRank[g.worst_severity]) g.worst_severity = v.severity
  }
  return Array.from(byConv.values())
}

function groupScriptIssues(items: ScriptIssue[]): GroupedConversation[] {
  const byConv = new Map<string, GroupedConversation>()
  let counter = 0
  for (const it of items) {
    let g = byConv.get(it.conversation_id)
    if (!g) {
      g = {
        conversation_id: it.conversation_id, session_date: it.session_date,
        seller_name: it.seller_name, store_name: it.store_name,
        topic: it.topic, outcome: it.outcome,
        // Все script-issues визуально показываем как warning-severity (оранжевый).
        facts: [], worst_severity: 'medium',
      }
      byConv.set(it.conversation_id, g)
    }
    const isObjection = it.kind === 'objection'
    g.facts.push({
      key: `${it.conversation_id}-${counter++}`,
      severity: 'medium',
      title: isObjection
        ? (() => {
            const ru = objectionTypeLabel(it.objection_type)
            return `Неотработанное возражение${ru ? ` · ${ru}` : ''}`
          })()
        : (it.script_name || 'Скрипт продаж'),
      badge: isObjection
        ? { label: 'Возражение', color: 'var(--warning)', bg: 'var(--warning-light)' }
        : { label: 'Скрипт', color: 'var(--text-muted)', bg: 'var(--bg)' },
      evidence: it.text,
    })
  }
  return Array.from(byConv.values())
}

function GroupedConversationCard({ g, onOpen, expanded, onToggle }: {
  g: GroupedConversation
  onOpen: () => void
  expanded: boolean
  onToggle: () => void
}) {
  const worstColor = severityMeta[g.worst_severity].color
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      borderLeft: `3px solid ${worstColor}`,
      background: 'var(--bg-card)', overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 88 }}>
          {new Date(g.session_date).toLocaleDateString('ru-RU')}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.seller_name || '—'}
            {g.store_name && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {g.store_name}</span>}
          </div>
          {g.topic && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Тема: {g.topic}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            title={g.facts.length === 1 ? '1 нарушение' : `${g.facts.length} нарушений`}
            style={{
              minWidth: 24, height: 22, padding: '0 8px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: worstColor,
              background: severityMeta[g.worst_severity].bg,
              borderRadius: 999,
            }}
          >
            ×{g.facts.length}
          </span>
          <button
            className="btn-icon" title="Открыть разговор"
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            style={{ color: 'var(--primary)' }}
          ><ExternalLink size={14} /></button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '4px 14px 14px 42px', borderTop: '1px dashed var(--border-light)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {g.facts.map((f) => (
              <div key={f.key} style={{
                padding: 10, background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                borderLeft: `2px solid ${severityMeta[f.severity].color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {f.badge ? (
                    <TagPill color={f.badge.color} bg={f.badge.bg}>{f.badge.label}</TagPill>
                  ) : (
                    <SeverityPill severity={f.severity} />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{f.title}</span>
                </div>
                {f.evidence && (
                  <div style={{ fontSize: 12.5, fontStyle: 'italic', color: 'var(--text)', marginBottom: 3 }}>
                    «{f.evidence}»
                  </div>
                )}
                {f.explanation && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{f.explanation}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ComplianceAnalytics({ period }: { period: number }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [violationsTab, setViolationsTab] = useState<'compliance' | 'scripts'>('compliance')

  const { data: compData, isLoading: compLoading } = useQuery<ComplianceSummary>({
    queryKey: ['compliance-summary', period],
    queryFn: () => complianceApi.getSummary({ recent_limit: 100, period }),
    staleTime: 30_000,
  })

  const { data: scriptData, isLoading: scriptLoading } = useQuery<ScriptIssuesSummary>({
    queryKey: ['script-issues-summary', period],
    queryFn: () => complianceApi.getScriptIssuesSummary({ recent_limit: 150, period }),
    staleTime: 30_000,
  })

  const complianceGroups = useMemo(() => compData ? groupCompliance(compData.recent) : [], [compData])
  const scriptGroups = useMemo(() => scriptData ? groupScriptIssues(scriptData.recent) : [], [scriptData])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (compLoading || scriptLoading || !compData || !scriptData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="spinner" />
      </div>
    )
  }

  const data = compData
  const totalConv = data.totals.total_conversations
  const convWith = data.totals.conversations_with_violations
  const facts = data.totals.total_violations
  const maxCount = Math.max(1, ...data.by_rule.map((r) => r.count))
  const scriptIssuesTotal =
    scriptData.totals.script_violations_count + scriptData.totals.unresolved_objections_count
  const visibleGroups = violationsTab === 'compliance' ? complianceGroups : scriptGroups

  return (
    <div>
      {/* Метрики */}
      <div className="metrics-grid fade-in" style={{ marginBottom: 20 }}>
        <div className="metric-card">
          <div className="metric-label">Проверено разговоров</div>
          <div className="metric-value">{totalConv}</div>
          {convWith > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {convWith} с нарушениями комплаенса
            </div>
          )}
        </div>
        <div className="metric-card">
          <div className="metric-label">Нарушения комплаенса</div>
          <div className="metric-value" style={{ color: 'var(--danger)' }}>{facts}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            в {convWith} разг. · {data.by_rule.length} правил
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Нарушения скриптов и возражения</div>
          <div className="metric-value" style={{ color: 'var(--warning)' }}>{scriptIssuesTotal}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {scriptData.totals.script_violations_count} по скриптам · {scriptData.totals.unresolved_objections_count} возражений
          </div>
        </div>
      </div>

      {/* Распределение по правилам */}
      <div className="card fade-in" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Какие правила нарушаются чаще</div>
            <div className="card-subtitle">
              {data.by_rule.length === 0
                ? 'Нарушений комплаенса пока нет — LLM ничего не зафиксировал по активным правилам.'
                : 'LLM проверяет каждый разговор против списка ваших активных правил.'}
            </div>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {data.by_rule.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>
              Нарушений за период не найдено.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.by_rule.map((r) => {
                const sev = severityMeta[r.severity]
                const pct = (r.count / maxCount) * 100
                return (
                  <div key={r.rule_id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <SeverityPill severity={r.severity} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.rule_title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                        <b style={{ color: sev.color }}>{r.count}</b> в {r.affected_conversations} разг.
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, background: sev.color, borderRadius: 3,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Последние нарушения — сгруппированы по разговорам, с сабтабами */}
      <div className="card fade-in">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="card-title">Последние нарушения по разговорам</div>
            <div className="card-subtitle">
              {violationsTab === 'compliance'
                ? 'Факты, помеченные LLM как нарушения ваших правил коммуникации. Кликните на строку для деталей.'
                : 'Замечания LLM по скриптам продаж и неотработанные возражения — то, что не относится к комплаенсу.'}
            </div>
          </div>
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setViolationsTab('compliance')}
              style={{
                background: violationsTab === 'compliance' ? 'var(--bg-card)' : 'transparent',
                border: 'none', padding: '5px 12px', fontSize: 12, borderRadius: 6,
                cursor: 'pointer', fontWeight: violationsTab === 'compliance' ? 500 : 400,
                color: violationsTab === 'compliance' ? 'var(--text)' : 'var(--text-muted)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Комплаенс
              <span style={{
                background: violationsTab === 'compliance' ? 'var(--danger-light)' : 'var(--bg)',
                color: 'var(--danger)', borderRadius: 999, padding: '0 6px',
                fontSize: 10, fontWeight: 600,
              }}>{facts}</span>
            </button>
            <button
              onClick={() => setViolationsTab('scripts')}
              style={{
                background: violationsTab === 'scripts' ? 'var(--bg-card)' : 'transparent',
                border: 'none', padding: '5px 12px', fontSize: 12, borderRadius: 6,
                cursor: 'pointer', fontWeight: violationsTab === 'scripts' ? 500 : 400,
                color: violationsTab === 'scripts' ? 'var(--text)' : 'var(--text-muted)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Скрипты и возражения
              <span style={{
                background: violationsTab === 'scripts' ? 'var(--warning-light)' : 'var(--bg)',
                color: 'var(--warning)', borderRadius: 999, padding: '0 6px',
                fontSize: 10, fontWeight: 600,
              }}>{scriptIssuesTotal}</span>
            </button>
          </div>
        </div>
        {visibleGroups.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {violationsTab === 'compliance'
              ? 'Нарушений комплаенса за период не зафиксировано.'
              : 'Замечаний по скриптам и неотработанных возражений за период не зафиксировано.'}
          </div>
        ) : (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleGroups.map((g) => (
              <GroupedConversationCard
                key={`${violationsTab}-${g.conversation_id}`}
                g={g}
                expanded={expanded.has(`${violationsTab}-${g.conversation_id}`)}
                onToggle={() => toggleExpanded(`${violationsTab}-${g.conversation_id}`)}
                onOpen={() => navigate(`/conversations?conv=${g.conversation_id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Вкладка «Правила» ─────────────────────────────────────────────────────

function RulesTab() {
  const qc = useQueryClient()
  const [addingCustom, setAddingCustom] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const { data: rules = [], isLoading } = useQuery<ComplianceRule[]>({
    queryKey: ['compliance-rules'],
    queryFn: () => complianceApi.listRules(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['compliance-rules'] })

  const createMut = useMutation({
    mutationFn: (data: { title: string; description: string; severity: Severity; keywords: string[]; is_active: boolean }) =>
      complianceApi.createRule(data),
    onSuccess: () => { invalidate(); setAddingCustom(false) },
  })

  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ComplianceRule> }) => complianceApi.patchRule(id, data),
    onSuccess: invalidate,
  })

  const delMut = useMutation({
    mutationFn: (id: string) => complianceApi.deleteRule(id),
    onSuccess: invalidate,
  })

  const addedTitles = useMemo(() => new Set(rules.map((r) => r.title.toLowerCase().trim())), [rules])
  const activeRules = rules.filter((r) => r.is_active)
  const highRules = activeRules.filter((r) => r.severity === 'high')
  const availablePresets = PRESET_RULES.filter((p) => !addedTitles.has(p.title.toLowerCase().trim()))

  const filtered = rules.filter((r) => {
    if (filter === 'active') return r.is_active
    if (filter === 'inactive') return !r.is_active
    return true
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div>
      <div className="metrics-grid fade-in" style={{ marginBottom: 20 }}>
        <div className="metric-card">
          <div className="metric-label">Всего правил</div>
          <div className="metric-value">{rules.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Активных</div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>{activeRules.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Критичных</div>
          <div className="metric-value" style={{ color: 'var(--danger)' }}>{highRules.length}</div>
        </div>
      </div>

      <div className="card fade-in" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Действующие правила</div>
            <div className="card-subtitle">
              {rules.length === 0
                ? 'Пока правил нет. Добавьте первое — справа есть готовые шаблоны.'
                : 'Эти правила LLM проверяет в каждом разговоре. Отключите ненужные или измените важность.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2 }}>
              {(['all', 'active', 'inactive'] as const).map((f) => (
                <button
                  key={f} onClick={() => setFilter(f)}
                  style={{
                    background: filter === f ? 'var(--bg-card)' : 'transparent',
                    border: 'none', padding: '4px 10px', fontSize: 12, borderRadius: 6,
                    cursor: 'pointer', color: filter === f ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: filter === f ? 500 : 400,
                  }}
                >
                  {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Отключённые'}
                </button>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setAddingCustom(true)} disabled={addingCustom}>
              <Plus size={14} /> Своё правило
            </button>
          </div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {addingCustom && (
            <AddRuleForm
              busy={createMut.isPending}
              onAdd={(data) => createMut.mutate(data)}
              onCancel={() => setAddingCustom(false)}
            />
          )}

          {filtered.length === 0 && !addingCustom && (
            <div className="empty-state-card" style={{ margin: '8px 0' }}>
              <Shield size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
              <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                {rules.length === 0
                  ? 'Здесь будут отображаться правила коммуникации'
                  : filter === 'active' ? 'Нет активных правил' : 'Нет отключённых правил'}
              </p>
              {rules.length === 0 && (
                <button className="btn btn-primary btn-sm" onClick={() => setAddingCustom(true)}>
                  <Plus size={12} /> Добавить правило
                </button>
              )}
            </div>
          )}

          {filtered.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              isCustom={!PRESET_RULES.some((p) => p.title.toLowerCase().trim() === r.title.toLowerCase().trim())}
              onPatch={(data) => patchMut.mutate({ id: r.id, data })}
              onDelete={() => delMut.mutate(r.id)}
            />
          ))}
        </div>
      </div>

      {availablePresets.length > 0 && (
        <div className="card fade-in">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                Шаблоны правил
              </div>
              <div className="card-subtitle">
                Готовые правила на основе типичной практики розничных продаж. Кликните, чтобы добавить.
              </div>
            </div>
          </div>
          <div style={{
            padding: 16, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
          }}>
            {availablePresets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                busy={createMut.isPending}
                onAdd={() => createMut.mutate({
                  title: p.title,
                  description: p.description,
                  severity: p.severity,
                  keywords: p.keywords,
                  is_active: true,
                })}
              />
            ))}
          </div>
        </div>
      )}

      {availablePresets.length === 0 && rules.length > 0 && (
        <div className="card fade-in" style={{ padding: 20, textAlign: 'center' }}>
          <BookOpen size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Все готовые шаблоны добавлены. Можете создать своё правило кнопкой выше.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Главная страница ──────────────────────────────────────────────────────

interface OutletContext { period: number }

export function CompliancePage() {
  const { period } = useOutletContext<OutletContext>()
  const [tab, setTab] = useState<'rules' | 'analytics'>('rules')

  return (
    <div>
      <div className="fade-in" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={20} style={{ color: 'var(--primary)' }} />
          Правила коммуникации
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Общие правила поведения продавца в разговоре с клиентом. LLM проверяет каждый диалог и помечает нарушения с привязкой к конкретному правилу.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {([
          { id: 'rules', label: 'Правила' },
          { id: 'analytics', label: 'Аналитика нарушений' },
        ] as const).map((t) => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', border: 'none',
              padding: '10px 16px', fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
              marginBottom: -1, cursor: 'pointer',
            }}>{t.label}</button>
          )
        })}
      </div>

      {tab === 'rules' && <RulesTab />}
      {tab === 'analytics' && <ComplianceAnalytics period={period} />}
    </div>
  )
}

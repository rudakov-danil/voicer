import { useMemo, useState } from 'react'
import { ComplianceKpis, ViolationJournal, RulesOverview, useComplianceSummary } from '@/components/compliance/Journal'
import { t } from '@/i18n'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  Shield, Plus, Trash2, Edit3, Check, X, AlertTriangle,
  MessageSquareOff, Smile, UserCheck, Lock, Sparkles, BookOpen,
  HandMetal, Scale, ShieldAlert, Megaphone, Clock, Heart,
} from 'lucide-react'
import {
  complianceApi,
  type ComplianceRule, type Severity,
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
  const { data: summary } = useComplianceSummary(period)
  const { data: rules = [] } = useQuery<ComplianceRule[]>({ queryKey: ['compliance-rules'], queryFn: () => complianceApi.listRules() })
  const manage = () => document.getElementById('cp-manage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div>
      <ComplianceKpis period={period} summary={summary} rules={rules} />
      <div className="cp-grid">
        <ViolationJournal summary={summary} />
        <RulesOverview rules={rules} summary={summary} onManage={manage} />
      </div>

      <section id="cp-manage" className="cp-manage">
        <h2 className="an-section">{t('Управление правилами')}</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {t('ИИ проверяет каждый разговор по активным правилам и помечает нарушения с цитатой.')}
        </p>
        <RulesTab />
      </section>
    </div>
  )
}

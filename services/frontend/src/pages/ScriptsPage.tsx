import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsApi } from '@/api/scripts'
import { adminApi } from '@/api/admin'
import { dashboardApi } from '@/api/dashboard'
import type { ScriptTemplate, ScriptStep, UpsellRule } from '@/types'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  CheckSquare, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  Save, X, Store as StoreIcon, User as UserIcon, Sparkles, BookOpen, PlayCircle, Loader,
  BarChart3, History, MapPin, Edit3, RotateCcw, GitCompare,
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

const emptyStep = (order: number): ScriptStep => ({
  name: 'Новый этап',
  description: '',
  weight: 0.1,
  order,
  is_required: true,
  recommendation_text: '',
  example_phrases: [],
})

function normalizeWeights(steps: ScriptStep[]): ScriptStep[] {
  const sum = steps.reduce((acc, s) => acc + (s.weight || 0), 0)
  if (sum === 0 || steps.length === 0) {
    const equal = +(1 / Math.max(steps.length, 1)).toFixed(3)
    return steps.map((s) => ({ ...s, weight: equal }))
  }
  const scaled = steps.map((s) => ({ ...s, weight: +(s.weight / sum).toFixed(3) }))
  const drift = +(1 - scaled.reduce((a, s) => a + s.weight, 0)).toFixed(3)
  if (drift !== 0 && scaled.length > 0) {
    scaled[scaled.length - 1].weight = +(scaled[scaled.length - 1].weight + drift).toFixed(3)
  }
  return scaled
}

// ─── Chip multi-select ────────────────────────────────────────────────────────

function ChipMultiSelect({
  selected, options, getLabel, placeholder, onAdd, onRemove,
}: {
  selected: string[]
  options: { id: string; label: string }[]
  getLabel: (id: string) => string
  placeholder: string
  onAdd: (id: string) => void
  onRemove: (id: string) => void
}) {
  const available = options.filter((o) => !selected.includes(o.id))
  const disabled = available.length === 0
  const selectRef = useRef<HTMLSelectElement>(null)

  const openPicker = () => {
    const el = selectRef.current
    if (!el || disabled) return
    // Современный API — открывает дроп без фокуса
    if (typeof (el as any).showPicker === 'function') {
      try { (el as any).showPicker(); return } catch {}
    }
    // Fallback: фокус (на части браузеров откроет автоматически)
    el.focus()
  }

  return (
    <div
      className={`chip-field ${disabled ? 'chip-field--disabled' : ''}`}
      onClick={openPicker}
      role="combobox"
      aria-haspopup="listbox"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault()
          openPicker()
        }
      }}
    >
      {selected.length === 0 && <span className="chip-placeholder">{placeholder}</span>}
      {selected.map((id) => (
        <span key={id} className="chip" onClick={(e) => e.stopPropagation()}>
          {getLabel(id)}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(id) }}
            aria-label="Убрать"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <select
        ref={selectRef}
        className="chip-field-select"
        value=""
        disabled={disabled}
        onChange={(e) => { if (e.target.value) onAdd(e.target.value) }}
        aria-label={placeholder}
      >
        <option value="" />
        {available.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({
  step, index, totalSteps, onChange, onDelete, onMoveUp, onMoveDown,
}: {
  step: ScriptStep
  index: number
  totalSteps: number
  onChange: (s: ScriptStep) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')

  const addPhrase = () => {
    const p = newPhrase.trim()
    if (!p) return
    onChange({ ...step, example_phrases: [...(step.example_phrases || []), p] })
    setNewPhrase('')
  }
  const removePhrase = (i: number) => {
    onChange({ ...step, example_phrases: (step.example_phrases || []).filter((_, idx) => idx !== i) })
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '12px', marginBottom: 10, background: 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', color: 'var(--text-muted)' }}>
          <button className="btn-icon" onClick={onMoveUp} disabled={index === 0} title="Выше" style={{ padding: 2 }}>
            <ChevronUp size={14} />
          </button>
          <GripVertical size={14} style={{ alignSelf: 'center', opacity: 0.5 }} />
          <button className="btn-icon" onClick={onMoveDown} disabled={index === totalSteps - 1} title="Ниже" style={{ padding: 2 }}>
            <ChevronDown size={14} />
          </button>
        </div>

        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>{index + 1}</div>

        <input
          className="form-input"
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder="Название этапа"
          style={{ flex: 1 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            className="form-input"
            type="number" step={1} min={0} max={100}
            value={Math.round(step.weight * 100)}
            onChange={(e) => onChange({ ...step, weight: Number(e.target.value) / 100 })}
            title="Вес этапа в процентах"
            style={{ width: 64, padding: '6px 8px', fontSize: 13 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
        </div>

        <div
          className={`toggle-switch ${step.is_required ? 'on' : ''}`}
          title={step.is_required ? 'Обязательный этап' : 'Опциональный'}
          onClick={() => onChange({ ...step, is_required: !step.is_required })}
        />

        <button className="btn btn-outline btn-sm" onClick={() => setExpanded((v) => !v)} title="Описание, фразы, рекомендации">
          {expanded ? <><ChevronUp size={12} style={{ marginRight: 3 }} />Скрыть</> : <><ChevronDown size={12} style={{ marginRight: 3 }} />Детали</>}
        </button>

        <button className="btn-icon" onClick={onDelete} title="Удалить этап" style={{ color: 'var(--danger)' }}>
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingLeft: 56, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label">
              Описание этапа (попадает в промт LLM — критично для точности)
            </label>
            <textarea
              className="form-input"
              value={step.description || ''}
              onChange={(e) => onChange({ ...step, description: e.target.value })}
              placeholder="Что именно должен сделать продавец на этом этапе"
              rows={2}
            />
          </div>

          <div>
            <label className="field-label">
              Эталонные фразы (примеры идеального выполнения — LLM ориентируется на них)
            </label>
            <div className="chip-field" style={{ marginBottom: 6 }}>
              {(step.example_phrases || []).length === 0 && (
                <span className="chip-empty">Фраз пока нет</span>
              )}
              {(step.example_phrases || []).map((p, i) => (
                <span key={i} className="chip">
                  «{p}»
                  <button type="button" onClick={() => removePhrase(i)} aria-label="Удалить">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase() } }}
                placeholder="Добавить пример и Enter"
                style={{ flex: 1 }}
              />
              <button className="btn btn-outline btn-sm" onClick={addPhrase}>Добавить</button>
            </div>
          </div>

          <div>
            <label className="field-label">
              Рекомендация продавцу (что подсказать, если этап провален)
            </label>
            <textarea
              className="form-input"
              value={step.recommendation_text || ''}
              onChange={(e) => onChange({ ...step, recommendation_text: e.target.value })}
              placeholder="Подсказка для персонального отчёта"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Assignments block (lifted to top) ───────────────────────────────────────

function AssignmentsBlock({ templateId }: { templateId: string }) {
  const queryClient = useQueryClient()

  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data: sellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() })
  const { data: storeAssignments } = useQuery({
    queryKey: ['store-assignments', templateId],
    queryFn: () => scriptsApi.listStoreAssignments({ template_id: templateId }),
  })
  const { data: sellerAssignments } = useQuery({
    queryKey: ['seller-assignments', templateId],
    queryFn: () => scriptsApi.listSellerAssignments({ template_id: templateId }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['store-assignments', templateId] })
    queryClient.invalidateQueries({ queryKey: ['seller-assignments', templateId] })
    queryClient.invalidateQueries({ queryKey: ['script-template-detail', templateId] })
  }

  const addStore = useMutation({
    mutationFn: (store_id: string) => scriptsApi.assignToStore({ store_id, template_id: templateId, is_mandatory: true }),
    onSuccess: invalidate,
  })
  const removeStoreByStoreId = useMutation({
    mutationFn: async (store_id: string) => {
      const a = (storeAssignments || []).find((x: any) => x.store_id === store_id)
      if (!a) return
      await scriptsApi.removeStoreAssignment(a.id)
    },
    onSuccess: invalidate,
  })
  const addSeller = useMutation({
    mutationFn: (seller_id: string) => scriptsApi.assignToSeller({ seller_id, template_id: templateId, is_mandatory: true }),
    onSuccess: invalidate,
  })
  const removeSellerBySellerId = useMutation({
    mutationFn: async (seller_id: string) => {
      const a = (sellerAssignments || []).find((x: any) => x.seller_id === seller_id)
      if (!a) return
      await scriptsApi.removeSellerAssignment(a.id)
    },
    onSuccess: invalidate,
  })

  const selectedStoreIds = (storeAssignments || []).map((a: any) => a.store_id)
  const selectedSellerIds = (sellerAssignments || []).map((a: any) => a.seller_id)
  const storeOptions = (stores?.items || []).map((s: any) => ({ id: s.id, label: s.name }))
  const sellerOptions = (sellers?.items || []).map((s: any) => ({
    id: s.id,
    label: `${s.first_name} ${s.last_name}`.trim() || s.id.slice(0, 8),
  }))

  const storeName = (id: string) =>
    storeOptions.find((o) => o.id === id)?.label || id.slice(0, 8)
  const sellerName = (id: string) =>
    sellerOptions.find((o) => o.id === id)?.label || id.slice(0, 8)

  return (
    <div className="assignments-card">
      <div className="assignments-title">
        <StoreIcon size={14} /> Где применяется
      </div>

      <div style={{ marginBottom: 10 }}>
        <label className="field-label">Магазины (скрипт будет применяться ко всем разговорам в этих магазинах)</label>
        <ChipMultiSelect
          selected={selectedStoreIds}
          options={storeOptions}
          getLabel={storeName}
          placeholder="Кликните, чтобы выбрать магазин"
          onAdd={(id) => addStore.mutate(id)}
          onRemove={(id) => removeStoreByStoreId.mutate(id)}
        />
      </div>

      <div>
        <label className="field-label">Отдельные продавцы (опционально — если нужны конкретные люди, а не все из магазина)</label>
        <ChipMultiSelect
          selected={selectedSellerIds}
          options={sellerOptions}
          getLabel={sellerName}
          placeholder="Кликните, чтобы выбрать продавца (опционально)"
          onAdd={(id) => addSeller.mutate(id)}
          onRemove={(id) => removeSellerBySellerId.mutate(id)}
        />
      </div>
    </div>
  )
}

// ─── Template editor ─────────────────────────────────────────────────────────

function TemplateEditor({
  template, onSaved,
}: {
  template: ScriptTemplate | null
  onSaved?: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const isNew = !template?.id

  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [steps, setSteps] = useState<ScriptStep[]>(template?.steps || [])
  const [showTestDialog, setShowTestDialog] = useState(false)

  useEffect(() => {
    setName(template?.name || '')
    setDescription(template?.description || '')
    setSteps(template?.steps || [])
  }, [template?.id])

  const weightsSum = useMemo(() => steps.reduce((a, s) => a + (s.weight || 0), 0), [steps])
  const weightsOk = Math.abs(weightsSum - 1) < 0.005

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Контекст и scope больше не настраиваются — всегда без фильтра, всегда org_level
      const payload = { name, description, scope: 'org_level' as const, context_description: null, steps }
      if (isNew) return scriptsApi.createTemplate(payload)
      return scriptsApi.replaceTemplate(template!.id, payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', saved.id] })
      onSaved?.(saved.id)
    },
  })

  const addStep = () => setSteps((prev) => [...prev, emptyStep(prev.length + 1)])
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i))
  const updateStep = (i: number, s: ScriptStep) =>
    setSteps((prev) => prev.map((p, idx) => (idx === i ? s : p)))
  const move = (i: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((s, k) => ({ ...s, order: k + 1 }))
    })
  }

  return (
    <div>
      {isNew && (
        <div style={{
          fontSize: 12.5, color: 'var(--text-muted)',
          padding: '8px 12px', marginBottom: 16,
          background: 'var(--bg)', borderRadius: 'var(--radius)',
          border: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <StoreIcon size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
          После сохранения сможете назначить скрипт магазинам и продавцам на вкладке «Назначения».
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label className="field-label">Название скрипта</label>
        <input
          className="form-input"
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Например: Стандартный скрипт продаж бытовой техники"
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label className="field-label">Описание (для команды, не для LLM)</label>
        <textarea
          className="form-input"
          value={description || ''} onChange={(e) => setDescription(e.target.value)}
          rows={2} placeholder="Краткое описание — для чего этот скрипт"
        />
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>Этапы</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: weightsOk ? 'var(--success)' : 'var(--danger)' }}>
            Сумма весов: {Math.round(weightsSum * 100)}% {weightsOk ? '✓' : '(должно быть 100%)'}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => setSteps(normalizeWeights(steps))} disabled={steps.length === 0} title="Автоматически привести веса к 100%">
            Нормализовать
          </button>
          <button className="btn btn-outline btn-sm" onClick={addStep}>
            <Plus size={12} /> Этап
          </button>
        </div>
      </div>

      <div>
        {steps.map((s, i) => (
          <StepRow
            key={s.id || `tmp-${i}`}
            step={s} index={i} totalSteps={steps.length}
            onChange={(next) => updateStep(i, next)}
            onDelete={() => removeStep(i)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
          />
        ))}
        {steps.length === 0 && (
          <div className="empty-state" style={{ padding: 20 }}>Этапов пока нет. Нажмите «+ Этап»</div>
        )}
      </div>

      <div style={{
        display: 'flex', gap: 10,
        margin: '20px -20px -18px',
        padding: '12px 20px',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg)',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
      }}>
        <button
          className="btn btn-primary" onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim() || steps.length === 0 || !weightsOk}
        >
          <Save size={14} /> {saveMutation.isPending ? 'Сохранение...' : (isNew ? 'Создать скрипт' : 'Сохранить изменения')}
        </button>
        <button
          className="btn btn-outline"
          disabled={steps.length === 0}
          onClick={() => setShowTestDialog(true)}
          title="Прогнать черновик через LLM на реальной записи, ничего не сохраняя"
        >
          <PlayCircle size={14} /> Тест на записи
        </button>
      </div>

      {showTestDialog && (
        <LiveTestDialog
          draft={{ name: name || 'Черновик', steps }}
          onClose={() => setShowTestDialog(false)}
        />
      )}
    </div>
  )
}

// ─── Upsell rules table ──────────────────────────────────────────────────────

function UpsellRulesTable() {
  const queryClient = useQueryClient()
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data: rules } = useQuery({
    queryKey: ['upsell-rules'],
    queryFn: () => scriptsApi.listUpsellRules(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['upsell-rules'] })

  const createMut = useMutation({
    mutationFn: () => scriptsApi.createUpsellRule({
      store_id: null,
      trigger_product: 'Новый продукт',
      required_offers: [],
      is_active: false,
    }),
    onSuccess: invalidate,
  })
  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => scriptsApi.patchUpsellRule(id, data),
    onSuccess: invalidate,
  })
  const delMut = useMutation({
    mutationFn: (id: string) => scriptsApi.deleteUpsellRule(id),
    onSuccess: invalidate,
  })

  return (
    <div className="card fade-in" style={{ marginTop: 24 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Правила апсейла</div>
          <div className="card-subtitle">
            LLM проверяет каждый разговор: если продавец обсуждал триггер-продукт, он должен был предложить указанные дополнения.{' '}
            <span style={{ opacity: 0.7 }}>Поля редактируются прямо в таблице — сохраняется автоматически.</span>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => createMut.mutate()}>
          <Plus size={14} /> Правило
        </button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Триггер-продукт</th>
              <th>Обязательные предложения</th>
              <th style={{ minWidth: 200 }}>Магазин</th>
              <th style={{ width: 90 }}>Активно</th>
              <th style={{ width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {(rules || []).map((r: UpsellRule) => (
              <UpsellRuleRow
                key={r.id} rule={r}
                stores={stores?.items || []}
                onPatch={(data) => patchMut.mutate({ id: r.id, data })}
                onDelete={() => { if (confirm('Удалить правило?')) delMut.mutate(r.id) }}
              />
            ))}
            {(!rules || rules.length === 0) && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                Правил пока нет. Добавьте первое — LLM начнёт автоматически отмечать разговоры, где продавец забыл предложить апсейл.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UpsellRuleRow({ rule, stores, onPatch, onDelete }: {
  rule: UpsellRule
  stores: any[]
  onPatch: (data: Partial<UpsellRule>) => void
  onDelete: () => void
}) {
  const [trigger, setTrigger] = useState(rule.trigger_product)
  const [offers, setOffers] = useState(rule.required_offers.join(', '))
  const [saved, setSaved] = useState(false)

  useEffect(() => setTrigger(rule.trigger_product), [rule.trigger_product])
  useEffect(() => setOffers(rule.required_offers.join(', ')), [rule.required_offers])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  const commitTrigger = () => {
    const v = trigger.trim()
    if (v && v !== rule.trigger_product) { onPatch({ trigger_product: v }); flash() }
  }
  const commitOffers = () => {
    const arr = offers.split(',').map((s) => s.trim()).filter(Boolean)
    const same = arr.length === rule.required_offers.length &&
      arr.every((o, i) => o === rule.required_offers[i])
    if (!same) { onPatch({ required_offers: arr }); flash() }
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>
        <input
          className="form-input"
          value={trigger} onChange={(e) => setTrigger(e.target.value)} onBlur={commitTrigger}
          style={{ padding: '6px 10px' }}
        />
      </td>
      <td>
        <input
          className="form-input"
          value={offers} onChange={(e) => setOffers(e.target.value)} onBlur={commitOffers}
          placeholder="через запятую"
          style={{ padding: '6px 10px' }}
        />
      </td>
      <td>
        <select
          className="form-select"
          value={rule.store_id || ''}
          onChange={(e) => onPatch({ store_id: (e.target.value || null) as any })}
          style={{ padding: '6px 30px 6px 10px', fontSize: 12.5 }}
        >
          <option value="">Все магазины (по умолчанию)</option>
          {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td>
        <div className={`toggle-switch ${rule.is_active ? 'on' : ''}`}
          onClick={() => { onPatch({ is_active: !rule.is_active }); flash() }} />
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          {saved && <span style={{ fontSize: 11, color: 'var(--success)', whiteSpace: 'nowrap' }}>✓ Сохранено</span>}
          <button className="btn-icon" onClick={onDelete} title="Удалить" style={{ color: 'var(--danger)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Library / AI generation dialog ──────────────────────────────────────────

function LibraryDialog({
  onClose, onCreated, onUseDraft,
}: {
  onClose: () => void
  onCreated: (newId: string) => void
  onUseDraft: (draft: { name: string; description: string | null; steps: ScriptStep[] }) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'library' | 'ai'>('library')

  const { data: presets } = useQuery({
    queryKey: ['library-presets'],
    queryFn: () => scriptsApi.listLibrary(),
    enabled: tab === 'library',
  })

  const createFromPresetMut = useMutation({
    mutationFn: (id: string) => scriptsApi.createFromPreset(id),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      onCreated(created.id)
      onClose()
    },
  })

  // AI generation
  const [topic, setTopic] = useState('')
  const [industry, setIndustry] = useState('')
  const [extraNotes, setExtraNotes] = useState('')

  const generateMut = useMutation({
    mutationFn: () => scriptsApi.generateWithAi({
      topic, industry: industry || undefined, extra_notes: extraNotes || undefined,
    }),
    onSuccess: (draft) => {
      onUseDraft(draft)
      onClose()
    },
  })

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-card modal-card--wide">
        <div className="modal-header">
          <div className="modal-title">Создание скрипта</div>
          <button className="btn-icon" onClick={onClose} title="Закрыть"><X size={16} /></button>
        </div>
        <div className="modal-tabs">
          <div className={`modal-tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>
            <BookOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Из готового шаблона
          </div>
          <div className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            <Sparkles size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Сгенерировать с AI
          </div>
        </div>

        <div className="modal-body">
          {tab === 'library' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Выберите отраслевой шаблон — будет создан как черновик, который можно адаптировать.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(presets || []).map((p: any) => (
                  <div key={p.id} className="preset-card" onClick={() => createFromPresetMut.mutate(p.id)}>
                    <div className="preset-name">{p.name}</div>
                    <div className="preset-meta">{p.step_count} этапов · {p.industry}</div>
                    <div className="preset-desc">{p.description}</div>
                  </div>
                ))}
                {(!presets || presets.length === 0) && (
                  <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                    Загрузка...
                  </div>
                )}
              </div>
              {createFromPresetMut.isPending && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Создание...</div>
              )}
            </>
          )}

          {tab === 'ai' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Опишите задачу — LLM соберёт черновик скрипта (этапы, веса, эталонные фразы).
                Вы сможете подредактировать его перед сохранением.
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label">Тема скрипта</label>
                <input
                  className="form-input"
                  value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="Например: продажа смартфонов в розничном магазине"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label">Индустрия / категория (опционально)</label>
                <input
                  className="form-input"
                  value={industry} onChange={(e) => setIndustry(e.target.value)}
                  placeholder="электроника, одежда, мебель, парфюмерия..."
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label">Дополнительные пожелания (опционально)</label>
                <textarea
                  className="form-input"
                  value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="Например: акцент на работе с возражением 'дорого', обязательно предлагать рассрочку"
                  rows={3}
                />
              </div>
              {generateMut.isError && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
                  Не удалось сгенерировать. Попробуйте ещё раз или уточните описание.
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {tab === 'ai' ? (
            <>
              <button className="btn btn-outline" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                disabled={!topic.trim() || generateMut.isPending}
                onClick={() => generateMut.mutate()}
              >
                {generateMut.isPending ? (
                  <><Loader size={14} className="spin" /> Генерация...</>
                ) : (
                  <><Sparkles size={14} /> Сгенерировать</>
                )}
              </button>
            </>
          ) : (
            <button className="btn btn-outline" onClick={onClose}>Закрыть</button>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─── Live-test dialog ────────────────────────────────────────────────────────

function LiveTestDialog({
  draft, onClose,
}: {
  draft: { name: string; steps: ScriptStep[] }
  onClose: () => void
}) {
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<typeof scriptsApi.testScript>> | null>(null)

  const { data: convs, isLoading: convsLoading } = useQuery({
    queryKey: ['recent-conversations-for-test'],
    queryFn: () => dashboardApi.getConversations({ limit: 30 }),
  })

  const testMut = useMutation({
    mutationFn: (recording_id: string) => scriptsApi.testScript({
      recording_id, name: draft.name || 'Черновик', steps: draft.steps,
    }),
    onSuccess: (r) => setResult(r),
  })

  const items = (convs?.items || []) as any[]

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-card modal-card--wide">
        <div className="modal-header">
          <div className="modal-title">
            <PlayCircle size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Тест скрипта на реальной записи
          </div>
          <button className="btn-icon" onClick={onClose} title="Закрыть"><X size={16} /></button>
        </div>

        <div className="modal-body">
          {!result && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Выберите запись — черновик скрипта прогонится через LLM, результат не сохранится в БД.
              </div>
              {convsLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                {items.map((c: any) => {
                  const isSelected = recordingId === c.recording_id
                  const date = c.analyzed_at || c.session_date
                  return (
                    <div
                      key={c.id}
                      className="preset-card"
                      onClick={() => setRecordingId(c.recording_id)}
                      style={{
                        borderColor: isSelected ? 'var(--primary)' : undefined,
                        background: isSelected ? 'rgba(37,99,235,0.04)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div className="preset-name">{c.seller_name || '—'} · {c.store_name || '—'}</div>
                        <div className="preset-meta">{date ? new Date(date).toLocaleString('ru-RU') : ''}</div>
                      </div>
                      <div className="preset-meta">{c.topic || 'без темы'} · скоринг {c.overall_score ?? '—'}%</div>
                    </div>
                  )
                })}
                {(!convsLoading && items.length === 0) && (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                    Записей пока нет — загрузите аудио на странице «Разговоры».
                  </div>
                )}
              </div>
              {testMut.isError && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 12 }}>
                  Ошибка теста. Попробуйте другую запись.
                </div>
              )}
            </>
          )}

          {result && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>
                  {result.overall_score}%
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Итоговый взвешенный скоринг · сегментов в транскрипте: {result.segment_count}
                </div>
              </div>

              <div style={{ fontWeight: 600, marginBottom: 8 }}>По этапам:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {result.step_scores.map((s, i) => (
                  <div key={i} style={{
                    padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    background: 'var(--bg-card)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 500 }}>{s.step_name}</div>
                      <div style={{
                        color: s.score >= 70 ? 'var(--success)' : s.score >= 40 ? '#F59E0B' : 'var(--danger)',
                        fontWeight: 600, fontSize: 14,
                      }}>{s.score}% (вес {s.weight})</div>
                    </div>
                    {s.evidence && (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        «{s.evidence}»
                      </div>
                    )}
                    {!s.detected && (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)' }}>
                        Не обнаружен в разговоре
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {result.violations.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Нарушения:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.violations.map((v, i) => (
                      <span key={i} className="tag tag-danger">{v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!result ? (
            <>
              <button className="btn btn-outline" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                disabled={!recordingId || testMut.isPending}
                onClick={() => recordingId && testMut.mutate(recordingId)}
              >
                {testMut.isPending ? (
                  <><Loader size={14} className="spin" /> Прогон... (до 30 сек)</>
                ) : (
                  <><PlayCircle size={14} /> Запустить тест</>
                )}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-outline" onClick={() => setResult(null)}>← Другая запись</button>
              <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─── Analytics panel ─────────────────────────────────────────────────────────

function AnalyticsPanel({ templateId }: { templateId: string }) {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useQuery({
    queryKey: ['template-analytics', templateId, days],
    queryFn: () => scriptsApi.getTemplateAnalytics(templateId, { days }),
    enabled: !!templateId,
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Сводка по применениям скрипта за период
        </div>
        <select
          className="form-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ width: 130, padding: '6px 30px 6px 10px', fontSize: 12.5 }}
        >
          <option value={7}>7 дней</option>
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
          <option value={365}>Год</option>
        </select>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>}

      {data && data.conversation_count === 0 && (
        <div className="empty-state" style={{ padding: 24 }}>
          Скрипт ещё не применялся к разговорам за выбранный период.
        </div>
      )}

      {data && data.conversation_count > 0 && (
        <>
          {/* Заголовочные метрики */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Разговоров</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{data.conversation_count}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Средний скоринг</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>
                {data.avg_script_score != null ? `${data.avg_script_score}%` : '—'}
              </div>
            </div>
            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Сильных (≥70%)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>
                {data.strong_conversation_count}
              </div>
            </div>
          </div>

          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>По этапам:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.per_step.map((s) => {
              const color = s.pass_rate >= 70 ? 'var(--success)' : s.pass_rate >= 40 ? '#F59E0B' : 'var(--danger)'
              return (
                <div key={s.step_id} style={{
                  padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg-card)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.step_name}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color }}>
                      {s.pass_rate}% pass · {s.avg_score} ср.балл
                    </div>
                  </div>
                  <div style={{
                    height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.max(2, s.pass_rate)}%`, height: '100%',
                      background: color, transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Обнаружен {s.detected_count} из {s.total_count} раз ({s.detection_rate}%)
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Versions panel ──────────────────────────────────────────────────────────

function VersionsPanel({ templateId, onRestored }: { templateId: string; onRestored: () => void }) {
  const queryClient = useQueryClient()
  const [showCompare, setShowCompare] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([])

  const { data: versions } = useQuery({
    queryKey: ['template-versions', templateId],
    queryFn: () => scriptsApi.listVersions(templateId),
    enabled: !!templateId,
  })

  const restoreMut = useMutation({
    mutationFn: (n: number) => scriptsApi.restoreVersion(templateId, n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', templateId] })
      queryClient.invalidateQueries({ queryKey: ['template-versions', templateId] })
      queryClient.invalidateQueries({ queryKey: ['template-analytics', templateId] })
      onRestored()
    },
  })

  const toggleCompare = (n: number) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n)
      if (prev.length >= 2) return [prev[1], n]
      return [...prev, n]
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Каждое сохранение создаёт версию. Можно восстановить любую или сравнить две.
        </div>
        <button
          className="btn btn-outline btn-sm"
          disabled={selectedForCompare.length !== 2}
          onClick={() => setShowCompare(true)}
        >
          <GitCompare size={14} /> Сравнить ({selectedForCompare.length}/2)
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(versions || []).map((v, i) => {
          const isCurrent = i === 0
          const checked = selectedForCompare.includes(v.version_number)
          return (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              background: checked ? 'rgba(37,99,235,0.04)' : 'var(--bg-card)',
              borderColor: checked ? 'var(--primary)' : 'var(--border)',
            }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleCompare(v.version_number)}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>
                  v{v.version_number} {isCurrent && <span style={{ color: 'var(--success)', fontSize: 11, marginLeft: 6 }}>· текущая</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(v.created_at).toLocaleString('ru-RU')} · {v.note || 'без примечания'}
                </div>
              </div>
              {!isCurrent && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => { if (confirm(`Восстановить v${v.version_number}? Текущее состояние сохранится как новая версия.`)) restoreMut.mutate(v.version_number) }}
                  title="Восстановить"
                >
                  <RotateCcw size={13} /> Восстановить
                </button>
              )}
            </div>
          )
        })}
        {(!versions || versions.length === 0) && (
          <div className="empty-state" style={{ padding: 16 }}>История версий пуста.</div>
        )}
      </div>

      {showCompare && selectedForCompare.length === 2 && (
        <CompareDialog
          templateId={templateId}
          versionA={Math.min(...selectedForCompare)}
          versionB={Math.max(...selectedForCompare)}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}

// ─── Compare dialog ──────────────────────────────────────────────────────────

function CompareDialog({ templateId, versionA, versionB, onClose }: {
  templateId: string; versionA: number; versionB: number; onClose: () => void
}) {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useQuery({
    queryKey: ['template-compare', templateId, versionA, versionB, days],
    queryFn: () => scriptsApi.compareVersions(templateId, versionA, versionB, days),
  })

  const renderColumn = (v: any, label: string) => (
    <div style={{
      flex: 1, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      background: 'var(--bg-card)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{label} (v{v.version_number})</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Разговоров</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{v.conversation_count}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Средний скоринг</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--primary)' }}>
        {v.avg_script_score != null ? `${v.avg_script_score}%` : '—'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Сильных (≥70%)</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--success)' }}>{v.strong_count}</div>
    </div>
  )

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-card modal-card--wide">
        <div className="modal-header">
          <div className="modal-title">
            <GitCompare size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Сравнение версий v{versionA} ↔ v{versionB}
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Метрики посчитаны только по разговорам, заскоренным конкретной версией.
            </div>
            <select
              className="form-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ width: 130, padding: '6px 30px 6px 10px', fontSize: 12.5 }}
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
              <option value={365}>Год</option>
            </select>
          </div>

          {isLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>}
          {data && (
            <div style={{ display: 'flex', gap: 12 }}>
              {renderColumn(data.version_a, 'Версия A')}
              {renderColumn(data.version_b, 'Версия B')}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─── Safe modal overlay (prevents close on drag-out) ────────────────────────────

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const downTarget = React.useRef<EventTarget | null>(null)
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { downTarget.current = e.target }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downTarget.current === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

// ─── Editor dialog (модалка вокруг TemplateEditor) ───────────────────────────

function EditorDialog({
  template, isNew, draftInfo, onClose, onSaved,
}: {
  template: ScriptTemplate | null
  isNew: boolean
  draftInfo?: { fromAi?: boolean }
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [resetKey, setResetKey] = useState(0)
  return (
    <div className="modal-overlay">
      <div
        className="modal-card modal-card--wide"
        style={{ maxWidth: 920, maxHeight: '92vh' }}
      >
        <div className="modal-header">
          <div className="modal-title">
            {isNew
              ? (draftInfo?.fromAi ? 'AI-черновик скрипта' : 'Новый скрипт')
              : (template?.name || 'Редактирование скрипта')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isNew && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setResetKey((k) => k + 1)}
                title="Сбросить все поля формы"
              >
                Очистить
              </button>
            )}
            <button className="btn-icon" onClick={onClose} title="Закрыть"><X size={16} /></button>
          </div>
        </div>
        <div className="modal-body">
          <TemplateEditor
            key={isNew ? (draftInfo?.fromAi ? `ai-${resetKey}` : `new-${resetKey}`) : (template?.id || 'none')}
            template={template}
            onSaved={(id) => onSaved(id)}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Right panel with tabs ───────────────────────────────────────────────────

type RightTab = 'analytics' | 'versions' | 'assignments'

function SelectedScriptPanel({ template, onEdit }: { template: ScriptTemplate; onEdit: () => void }) {
  const [tab, setTab] = useState<RightTab>('analytics')

  return (
    <div className="card" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
      <div className="card-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">{template.name}</div>
          <div className="card-subtitle">{template.description || '—'}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onEdit}>
          <Edit3 size={14} /> Редактировать
        </button>
      </div>

      <div className="modal-tabs" style={{ margin: '0 -20px 16px', padding: '0 20px' }}>
        <div className={`modal-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>
          <BarChart3 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Аналитика
        </div>
        <div className={`modal-tab ${tab === 'versions' ? 'active' : ''}`} onClick={() => setTab('versions')}>
          <History size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Версии
        </div>
        <div className={`modal-tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>
          <MapPin size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Назначения
        </div>
      </div>

      {tab === 'analytics' && <AnalyticsPanel templateId={template.id} />}
      {tab === 'versions' && <VersionsPanel templateId={template.id} onRestored={() => setTab('analytics')} />}
      {tab === 'assignments' && <AssignmentsBlock templateId={template.id} />}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ScriptsPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)

  // Editor modal state
  const [editorMode, setEditorMode] = useState<null | 'new' | 'edit' | 'ai'>(null)
  const [aiDraft, setAiDraft] = useState<{ name: string; description: string | null; steps: ScriptStep[] } | null>(null)

  const { data: templates } = useQuery({
    queryKey: ['script-templates'],
    queryFn: () => scriptsApi.getTemplates(),
  })

  const { data: selectedDetail } = useQuery({
    queryKey: ['script-template-detail', selectedId],
    queryFn: () => scriptsApi.getTemplate(selectedId!),
    enabled: !!selectedId,
  })

  const patchMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      scriptsApi.patchTemplate(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['script-template-detail', selectedId] })
    },
  })

  // Какой template подаём в редактор: edit → текущий выбранный, ai → черновик, new → пустой
  const editorTemplate: ScriptTemplate | null =
    editorMode === 'ai' && aiDraft
      ? { id: '', name: aiDraft.name, is_active: true, steps: aiDraft.steps, description: aiDraft.description || '' }
      : editorMode === 'new'
        ? { id: '', name: '', is_active: true, steps: [], description: '' }
        : editorMode === 'edit'
          ? (selectedDetail || null)
          : null

  const closeEditor = () => {
    setEditorMode(null)
    setAiDraft(null)
  }

  const handleEditorSaved = (newId: string) => {
    queryClient.invalidateQueries({ queryKey: ['script-templates'] })
    if (newId) {
      setSelectedId(newId)
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', newId] })
    }
    closeEditor()
  }

  const handlePresetCreated = (newId: string) => {
    setSelectedId(newId)
    queryClient.invalidateQueries({ queryKey: ['script-templates'] })
  }

  const handleAiDraft = (draft: { name: string; description: string | null; steps: ScriptStep[] }) => {
    setAiDraft(draft)
    setEditorMode('ai')
    setSelectedId(null)
  }

  return (
    <div>
      <div className="grid-2 fade-in" style={{ alignItems: 'start' }}>
        {/* Левая колонка: список */}
        <div className="card" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
          <div className="card-header">
            <div className="card-title">Шаблоны скриптов</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowLibrary(true)}
                title="Готовые шаблоны или генерация через AI"
              >
                <Sparkles size={14} /> Шаблон / AI
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setEditorMode('new'); setAiDraft(null); setSelectedId(null) }}
              >
                <Plus size={14} /> Новый
              </button>
            </div>
          </div>
          <div>
            {(templates || []).map((t) => (
              <div
                key={t.id}
                className="list-item"
                onClick={() => setSelectedId(t.id)}
                style={{ background: selectedId === t.id ? 'var(--bg-active)' : undefined }}
              >
                <div className="list-item-icon" style={{
                  background: t.is_active ? 'var(--success-light)' : 'var(--bg)',
                  color: t.is_active ? 'var(--success)' : 'var(--text-muted)',
                }}>
                  <CheckSquare size={18} />
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">{t.name}</div>
                  <div className="list-item-desc">
                    {t.steps?.length || 0} этапов · {t.is_active ? 'Активен' : 'Черновик'}
                  </div>
                </div>
                <div className="list-item-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    className={`toggle-switch ${t.is_active ? 'on' : ''}`}
                    onClick={(e) => { e.stopPropagation(); patchMut.mutate({ id: t.id, is_active: !t.is_active }) }}
                    title={t.is_active ? 'Активен' : 'Черновик'}
                  />
                </div>
              </div>
            ))}
            {(!templates || templates.length === 0) && (
              <div className="empty-state"><p>Нет шаблонов скриптов</p></div>
            )}
          </div>
        </div>

        {/* Правая колонка: панель выбранного скрипта с табами */}
        {selectedDetail
          ? <SelectedScriptPanel template={selectedDetail} onEdit={() => setEditorMode('edit')} />
          : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div className="empty-state" style={{ textAlign: 'center', padding: 24 }}>
                <BookOpen size={36} style={{ color: 'var(--text-muted)', marginBottom: 12, opacity: 0.4 }} />
                <p style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Выберите скрипт из списка</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Здесь появятся аналитика, история версий и настройки назначений.
                </p>
              </div>
            </div>
          )
        }
      </div>

      <UpsellRulesTable />

      {/* Модалки */}
      {editorMode && (
        <EditorDialog
          template={editorTemplate}
          isNew={editorMode !== 'edit'}
          draftInfo={{ fromAi: editorMode === 'ai' }}
          onClose={closeEditor}
          onSaved={handleEditorSaved}
        />
      )}

      {showLibrary && (
        <LibraryDialog
          onClose={() => setShowLibrary(false)}
          onCreated={handlePresetCreated}
          onUseDraft={handleAiDraft}
        />
      )}
    </div>
  )
}

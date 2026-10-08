import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsApi } from '@/api/scripts'
import { useTerms } from '@/lib/terms'
import { adminApi } from '@/api/admin'
import { dashboardApi } from '@/api/dashboard'
import type { ScriptTemplate, ScriptStep, UpsellRule, CrossSellRule } from '@/types'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  CheckSquare, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  Save, X, PlayCircle, Loader, BarChart3, History, MapPin, Edit3, RotateCcw,
  GitCompare, Sparkles, BookOpen, HelpCircle, Command, Check, FileText, FileUp,
} from 'lucide-react'

import { MultiSelect } from '@/components/scripts/MultiSelect'
import { HelpTooltip } from '@/components/scripts/HelpTooltip'
import { HelpModal } from '@/components/scripts/HelpModal'
import { HeatmapStrip } from '@/components/scripts/HeatmapStrip'
import { StructuralDiff } from '@/components/scripts/StructuralDiff'
import { CommandPalette } from '@/components/scripts/CommandPalette'
import { SkeletonScriptCard, SkeletonAnalyticsRow } from '@/components/scripts/Skeleton'

// ─── helpers ─────────────────────────────────────────────────────────────────

const emptyStep = (order: number): ScriptStep => ({
  name: 'Новый этап',
  description: '',
  weight: 0.1,
  order,
  is_required: true,
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

// ─── Step row (без блока «Рекомендация продавцу») ────────────────────────────

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
    <div className="step-card">
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

        <div className="step-number">{index + 1}</div>

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

        <button className="btn btn-outline btn-sm" onClick={() => setExpanded((v) => !v)} title="Описание и фразы">
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
              Эталонные фразы (примеры идеального выполнения)
            </label>
            <div className="chip-field" style={{ marginBottom: 6 }}>
              {(step.example_phrases || []).length === 0 && (
                <span className="chip-placeholder">Фраз пока нет</span>
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
        </div>
      )}
    </div>
  )
}

// ─── AssignmentsBlock ────────────────────────────────────────────────────────

function AssignmentsBlock({ template }: { template: ScriptTemplate }) {
  const queryClient = useQueryClient()
  const templateId = template.id
  const terms = useTerms()

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
    queryClient.invalidateQueries({ queryKey: ['script-templates'] })
  }

  const bulkStoresMut = useMutation({
    mutationFn: (ids: string[]) => scriptsApi.bulkSetStoreAssignments(templateId, ids),
    onSuccess: invalidate,
  })
  const bulkSellersMut = useMutation({
    mutationFn: (ids: string[]) => scriptsApi.bulkSetSellerAssignments(templateId, ids),
    onSuccess: invalidate,
  })
  const patchAllStoresMut = useMutation({
    mutationFn: (v: boolean) => scriptsApi.patchTemplate(templateId, { applies_to_all_stores: v }),
    onSuccess: invalidate,
  })

  const selectedStoreIds = (storeAssignments || []).map((a: any) => a.store_id)
  const selectedSellerIds = (sellerAssignments || []).map((a: any) => a.seller_id)
  const storeOptions = (stores?.items || []).map((s: any) => ({ id: s.id, label: s.name }))

  const allStores = !!template.applies_to_all_stores

  // Список продавцов фильтруется по выбранным магазинам, чтобы нельзя было
  // случайно назначить менеджера, не относящегося к скриптовому магазину.
  // Если включено "все магазины" — фильтрация не применяется.
  const selectedStoreIdSet = new Set(selectedStoreIds)
  const sellerOptions = (sellers?.items || [])
    .filter((s: any) => allStores || (s.store_id && selectedStoreIdSet.has(s.store_id)))
    .map((s: any) => ({
      id: s.id,
      label: `${s.first_name} ${s.last_name}`.trim() || s.id.slice(0, 8),
      sublabel: s.store_name,
    }))

  return (
    <div className="assignments-card">
      <div className="assignments-title">
        <MapPin size={14} /> Где применяется
        <HelpTooltip content={
          <div style={{ maxWidth: 280 }}>
            Назначьте скрипт <strong>{terms.isTelephony ? 'отделу' : 'магазину'}</strong> — он автоматически применится ко всем разговорам в этом {terms.isTelephony ? 'отделе' : 'магазине'}.
            Можно дополнительно указать <strong>конкретных продавцов</strong>, если скрипт нужен только им.
          </div>
        } />
      </div>

      <div className="all-stores-toggle">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={allStores}
            onChange={(e) => patchAllStoresMut.mutate(e.target.checked)}
          />
          <span>
            <strong>Применить ко всем {terms.isTelephony ? 'отделам' : 'магазинам'} организации</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
              Если включено — индивидуальный список ниже игнорируется, скрипт работает везде.
            </span>
          </span>
        </label>
      </div>

      <div style={{ marginBottom: 12, opacity: allStores ? 0.5 : 1, pointerEvents: allStores ? 'none' : 'auto' }}>
        <label className="field-label">{terms.storePlural}</label>
        <MultiSelect
          options={storeOptions}
          selected={selectedStoreIds}
          onChange={(ids) => bulkStoresMut.mutate(ids)}
          placeholder={`Выберите один или несколько ${terms.isTelephony ? 'отделов' : 'магазинов'}`}
          selectAllLabel={`Выбрать все ${terms.storePlural.toLowerCase()}`}
        />
      </div>

      <div>
        <label className="field-label">
          Отдельные продавцы (опционально)
          <HelpTooltip content={`Нужно, если скрипт обязателен не для всего ${terms.isTelephony ? 'отдела' : 'магазина'}, а только для конкретных людей.`} />
        </label>
        <MultiSelect
          options={sellerOptions}
          selected={selectedSellerIds}
          onChange={(ids) => bulkSellersMut.mutate(ids)}
          placeholder="Выберите продавцов (опционально)"
          selectAllLabel="Выбрать всех"
        />
      </div>
    </div>
  )
}

// ─── Template editor ─────────────────────────────────────────────────────────

function TemplateEditor({
  template, onSaved, onShowHelp,
}: {
  template: ScriptTemplate | null
  onSaved?: (id: string) => void
  onShowHelp: () => void
}) {
  const queryClient = useQueryClient()
  const terms = useTerms()
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
      // short_name автогенерируется на бэке (LLM + heuristic), фронт его не задаёт
      const payload = {
        name,
        description,
        scope: 'org_level' as const,
        context_description: null,
        steps,
      }
      if (isNew) return scriptsApi.createTemplate(payload)
      return scriptsApi.replaceTemplate(template!.id, payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', saved.id] })
      queryClient.invalidateQueries({ queryKey: ['template-versions', saved.id] })
      queryClient.invalidateQueries({ queryKey: ['template-analytics', saved.id] })
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
    <div className="editor-flex">
      <div className="editor-body">
        {isNew && (
          <div className="editor-hint">
            <BookOpen size={13} />
            <span>
              Сначала задайте этапы и сохраните — потом сможете назначить скрипт {terms.isTelephony ? 'отделам' : 'магазинам'} и протестировать на реальной записи.
            </span>
            <button className="btn btn-outline btn-sm" onClick={onShowHelp} style={{ marginLeft: 'auto' }}>
              <HelpCircle size={12} /> Помощь
            </button>
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>Этапы</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: weightsOk ? 'var(--success)' : 'var(--danger)' }}>
              Сумма весов: {Math.round(weightsSum * 100)}% {weightsOk ? '✓' : '(должно быть 100%)'}
            </span>
            <button className="btn btn-outline btn-sm" onClick={() => setSteps(normalizeWeights(steps))} disabled={steps.length === 0} title="Привести веса к 100%">
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
            <div className="empty-state-card">
              <BookOpen size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
              <p style={{ marginBottom: 12 }}>Этапов пока нет</p>
              <button className="btn btn-primary btn-sm" onClick={addStep}>
                <Plus size={12} /> Добавить первый этап
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="editor-footer-sticky">
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {weightsOk
            ? <>Готово к сохранению</>
            : <>⚠ Веса должны давать в сумме 100%</>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-outline"
            disabled={steps.length === 0}
            onClick={() => setShowTestDialog(true)}
            title="Прогнать черновик через LLM на реальной записи"
          >
            <PlayCircle size={14} /> Тест на записи
          </button>
          <button
            className="btn btn-primary" onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim() || steps.length === 0 || !weightsOk}
          >
            <Save size={14} /> {saveMutation.isPending ? 'Сохранение…' : (isNew ? 'Создать скрипт' : 'Сохранить')}
          </button>
        </div>
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

// ─── Upsell / Cross-sell rules ───────────────────────────────────────────────

function RulesTable({ kind }: { kind: 'upsell' | 'crosssell' }) {
  const queryClient = useQueryClient()
  const isUpsell = kind === 'upsell'
  const terms = useTerms()
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data: sellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() })

  const queryKey = isUpsell ? ['upsell-rules'] : ['cross-sell-rules']
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => isUpsell
      ? await scriptsApi.listUpsellRules()
      : await scriptsApi.listCrossSellRules(),
  })
  const rules: Array<UpsellRule | CrossSellRule> = (data as Array<UpsellRule | CrossSellRule> | undefined) || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey })
  const createMut = useMutation({
    mutationFn: () => (isUpsell ? scriptsApi.createUpsellRule : scriptsApi.createCrossSellRule)({
      store_ids: [],
      seller_ids: [],
      trigger_product: 'Новый продукт',
      required_offers: [],
      is_active: false,
    }),
    onSuccess: invalidate,
  })
  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      isUpsell ? scriptsApi.patchUpsellRule(id, data) : scriptsApi.patchCrossSellRule(id, data),
    onSuccess: invalidate,
  })
  const delMut = useMutation({
    mutationFn: (id: string) => isUpsell ? scriptsApi.deleteUpsellRule(id) : scriptsApi.deleteCrossSellRule(id),
    onSuccess: invalidate,
  })

  return (
    <div className="card fade-in">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isUpsell ? 'Правила апсейла' : 'Правила кросс-сейла'}
            <HelpTooltip
              size={14}
              content={
                <div style={{ maxWidth: 280 }}>
                  {isUpsell ? (
                    <>
                      <strong>Апсейл</strong> — продажа более дорогой версии того же продукта.<br />
                      Пример: клиент пришёл за iPhone 15 — продавец предлагает 15 Pro.
                    </>
                  ) : (
                    <>
                      <strong>Кросс-сейл</strong> — предложение сопутствующих товаров к основной покупке.<br />
                      Пример: клиент берёт ноутбук — продавец обязан предложить сумку и мышь.
                    </>
                  )}
                </div>
              }
            />
          </div>
          <div className="card-subtitle">
            LLM проверяет каждый разговор: если упомянут триггер-продукт — должны быть предложены указанные товары.
            <span style={{ opacity: 0.7 }}> Сохраняется автоматически при потере фокуса поля.</span>
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
              <th>{isUpsell ? 'Обязательные предложения' : 'Сопутствующие товары'}</th>
              <th style={{ minWidth: 200 }}>{terms.storePlural}</th>
              <th style={{ minWidth: 200 }}>Менеджеры</th>
              <th style={{ width: 90 }}>Активно</th>
              <th style={{ width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {rules.map((r: UpsellRule | CrossSellRule) => (
              <RuleRow
                key={r.id} rule={r}
                stores={stores?.items || []}
                sellers={sellers?.items || []}
                onPatch={(data) => patchMut.mutate({ id: r.id, data })}
                onDelete={() => { if (confirm('Удалить правило?')) delMut.mutate(r.id) }}
              />
            ))}
            {isLoading && rules.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 12 }}><SkeletonAnalyticsRow /></td></tr>
            )}
            {!isLoading && rules.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                {isUpsell
                  ? 'Правил апсейла пока нет. Добавьте первое — LLM начнёт отмечать разговоры, где продавец забыл предложить апсейл.'
                  : 'Правил кросс-сейла пока нет. Например: к ноутбуку — сумка и мышь.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RuleRow({ rule, stores, sellers, onPatch, onDelete }: {
  rule: UpsellRule | CrossSellRule
  stores: any[]
  sellers: any[]
  onPatch: (data: any) => void
  onDelete: () => void
}) {
  const [trigger, setTrigger] = useState(rule.trigger_product)
  const terms = useTerms()
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

  const storeOptions = stores.map((s) => ({ id: s.id, label: s.name }))
  const selectedStoreIds = rule.store_ids || []
  // Менеджеры фильтруются по выбранным магазинам (если магазины заданы)
  const sellerPool = selectedStoreIds.length
    ? sellers.filter((s) => selectedStoreIds.includes(s.store_id))
    : sellers
  const sellerOptions = sellerPool.map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name}` }))
  const selectedSellerIds = rule.seller_ids || []

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
        <MultiSelect
          options={storeOptions}
          selected={selectedStoreIds}
          onChange={(ids) => {
            // При смене магазинов отбрасываем менеджеров, которых больше нет в покрытых магазинах
            const allowed = ids.length
              ? sellers.filter((s) => ids.includes(s.store_id)).map((s) => s.id)
              : sellers.map((s) => s.id)
            const nextSellers = selectedSellerIds.filter((id) => allowed.includes(id))
            const patch: any = { store_ids: ids }
            if (nextSellers.length !== selectedSellerIds.length) patch.seller_ids = nextSellers
            onPatch(patch)
            flash()
          }}
          selectAllLabel={terms.allStores}
          placeholder={terms.allStores}
        />
      </td>
      <td>
        <MultiSelect
          options={sellerOptions}
          selected={selectedSellerIds}
          onChange={(ids) => { onPatch({ seller_ids: ids }); flash() }}
          selectAllLabel="Все менеджеры"
          placeholder="Все менеджеры"
        />
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

// ─── Objection types (настраиваемый справочник типов возражений) ─────────────

function ObjectionTypesTable() {
  const queryClient = useQueryClient()
  const { data: items, isLoading } = useQuery({
    queryKey: ['objection-types'],
    queryFn: () => scriptsApi.listObjectionTypes(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['objection-types'] })
  const createMut = useMutation({ mutationFn: scriptsApi.createObjectionType, onSuccess: invalidate })
  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => scriptsApi.patchObjectionType(id, data),
    onSuccess: invalidate,
  })
  const deleteMut = useMutation({ mutationFn: scriptsApi.deleteObjectionType, onSuccess: invalidate })

  const [newLabel, setNewLabel] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const addType = () => {
    if (!newLabel.trim()) return
    createMut.mutate({
      label: newLabel.trim(),
      description: newDescription.trim(),
    }, {
      onSuccess: () => { setNewLabel(''); setNewDescription('') },
    })
  }

  if (isLoading) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Загрузка...</div>

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        AI классифицирует возражения клиентов по этим типам. Добавьте свои отраслевые типы —
        описание подсказывает AI, когда применять тип. Стандартные типы нельзя удалить,
        но можно выключить или переименовать.
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>Тип</th>
              <th>Описание (когда применять)</th>
              <th style={{ width: 70 }}>Активен</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((t) => (
              <ObjectionTypeRow
                key={t.id}
                item={t}
                onPatch={(data) => patchMut.mutate({ id: t.id, data })}
                onDelete={() => {
                  if (confirm(`Удалить тип «${t.label}»?`)) deleteMut.mutate(t.id)
                }}
              />
            ))}
            {/* Строка добавления */}
            <tr>
              <td>
                <input className="form-input" placeholder="Новый тип..." value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)} style={{ padding: '6px 10px' }} />
              </td>
              <td>
                <input className="form-input" placeholder="Когда применять" value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)} style={{ padding: '6px 10px' }} />
              </td>
              <td colSpan={2}>
                <button className="btn btn-primary btn-sm" onClick={addType}
                  disabled={!newLabel.trim() || createMut.isPending}>
                  <Plus size={12} /> {createMut.isPending ? '...' : 'Добавить'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {createMut.isError && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
          {(createMut.error as any)?.response?.data?.detail || 'Не удалось добавить тип'}
        </div>
      )}
    </div>
  )
}

function ObjectionTypeRow({ item, onPatch, onDelete }: {
  item: { id: string; code: string; label: string; description: string; example_phrases: string[]; is_default: boolean; is_active: boolean }
  onPatch: (data: any) => void
  onDelete: () => void
}) {
  const [label, setLabel] = useState(item.label)
  const [description, setDescription] = useState(item.description)
  const [saved, setSaved] = useState(false)

  useEffect(() => setLabel(item.label), [item.label])
  useEffect(() => setDescription(item.description), [item.description])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  const commitLabel = () => {
    const v = label.trim()
    if (v && v !== item.label) { onPatch({ label: v }); flash() }
  }
  const commitDescription = () => {
    if (description.trim() !== item.description) { onPatch({ description: description.trim() }); flash() }
  }

  return (
    <tr style={{ opacity: item.is_active ? 1 : 0.55 }}>
      <td>
        <input className="form-input" value={label}
          onChange={(e) => setLabel(e.target.value)} onBlur={commitLabel}
          style={{ padding: '6px 10px', fontWeight: 500 }} />
        {item.is_default && (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 2 }}>
            стандартный
          </div>
        )}
      </td>
      <td>
        <input className="form-input" value={description}
          onChange={(e) => setDescription(e.target.value)} onBlur={commitDescription}
          style={{ padding: '6px 10px' }} />
      </td>
      <td>
        <div className={`toggle-switch ${item.is_active ? 'on' : ''}`}
          onClick={() => { onPatch({ is_active: !item.is_active }); flash() }} />
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          {saved && <span style={{ fontSize: 11, color: 'var(--success)', whiteSpace: 'nowrap' }}>✓</span>}
          {!item.is_default && (
            <button className="btn-icon" onClick={onDelete} title="Удалить" style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── LibraryDialog ───────────────────────────────────────────────────────────

const INDUSTRY_LABELS: Record<string, string> = {
  electronics: 'Электроника',
  clothing: 'Одежда',
  cosmetics: 'Косметика и парфюмерия',
  furniture: 'Мебель',
  telecom: 'Связь и телеком',
  generic: 'Универсальный',
}

function industryLabel(value: string | undefined | null): string {
  if (!value) return ''
  return INDUSTRY_LABELS[value] || value
}

export interface DocDraft {
  name: string
  description: string
  full_text: string | null
  source_document_name: string | null
  blocks: { title: string; text: string; block_type: string; is_mandatory: boolean }[]
}

function LibraryDialog({
  onClose, onCreated, onUseDraft, onUseDocDraft,
}: {
  onClose: () => void
  onCreated: (newId: string) => void
  onUseDraft: (draft: { name: string; description: string | null; steps: ScriptStep[] }) => void
  onUseDocDraft: (draft: DocDraft) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'library' | 'ai' | 'document'>('library')
  const docFileRef = useRef<HTMLInputElement>(null)
  const [docFile, setDocFile] = useState<File | null>(null)

  const importMut = useMutation({
    mutationFn: (file: File) => scriptsApi.importDocument(file),
    onSuccess: (draft) => {
      onUseDocDraft({
        name: draft.name_suggestion,
        description: draft.description_suggestion,
        full_text: draft.full_text,
        source_document_name: draft.file_name,
        blocks: draft.blocks,
      })
      onClose()
    },
  })

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
          <div className={`modal-tab ${tab === 'document' ? 'active' : ''}`} onClick={() => setTab('document')}>
            <FileText size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Из документа
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
                    <div className="preset-meta">{p.step_count} этапов · {industryLabel(p.industry)}</div>
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
                Опишите задачу — LLM соберёт черновик скрипта (этапы, веса, фразы).
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
                  placeholder="Например: акцент на возражении 'дорого', обязательно предлагать рассрочку"
                  rows={3}
                />
              </div>
              {generateMut.isError && (
                <div style={{
                  fontSize: 12, color: 'var(--danger)', marginTop: 8,
                  padding: '8px 10px', background: 'var(--danger-light)',
                  borderRadius: 6,
                }}>
                  {(() => {
                    const err = generateMut.error as any
                    const detail = err?.response?.data?.detail
                    const status = err?.response?.status
                    if (detail) {
                      return `Ошибка${status ? ` (${status})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
                    }
                    if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
                      return 'Таймаут запроса к LLM. Попробуйте уточнить тему и сгенерировать ещё раз.'
                    }
                    return err?.message || 'Не удалось сгенерировать. Попробуйте ещё раз или уточните описание.'
                  })()}
                </div>
              )}
            </>
          )}

          {tab === 'document' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Загрузите ваш полный скрипт документом (DOCX, PDF, RTF, TXT) — AI разобьёт его на блоки,
                по которым система будет отслеживать, что сотрудник проговорил клиенту.
                Перед сохранением вы сможете поправить разбивку.
              </div>
              <input
                ref={docFileRef} type="file" accept=".docx,.pdf,.rtf,.txt,.md"
                style={{ display: 'none' }}
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              />
              <div
                style={{
                  border: '2px dashed var(--border)', borderRadius: 8,
                  padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                }}
                onClick={() => docFileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) setDocFile(f)
                }}
              >
                <FileUp size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
                {docFile ? (
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                    {docFile.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      · {(docFile.size / 1024).toFixed(0)} КБ</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                      Перетащите документ или нажмите для выбора
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      DOCX, PDF, RTF, TXT · до 20 МБ
                    </div>
                  </>
                )}
              </div>
              {importMut.isPending && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader size={13} className="spin" /> AI разбирает документ на блоки — это может занять до минуты...
                </div>
              )}
              {importMut.isError && (
                <div style={{
                  fontSize: 12, color: 'var(--danger)', marginTop: 12,
                  padding: '8px 10px', background: 'var(--danger-light)', borderRadius: 6,
                }}>
                  {(() => {
                    const err = importMut.error as any
                    const detail = err?.response?.data?.detail
                    return typeof detail === 'string' ? detail : (err?.message || 'Не удалось импортировать документ')
                  })()}
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
          ) : tab === 'document' ? (
            <>
              <button className="btn btn-outline" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                disabled={!docFile || importMut.isPending}
                onClick={() => docFile && importMut.mutate(docFile)}
              >
                {importMut.isPending ? (
                  <><Loader size={14} className="spin" /> Импорт...</>
                ) : (
                  <><FileUp size={14} /> Импортировать</>
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

// ─── Fulltext editor (полнотекстовый скрипт из документа) ────────────────────

const BLOCK_TYPE_LABELS: Record<string, string> = {
  greeting: 'Приветствие',
  identification: 'Представление',
  need_discovery: 'Потребности',
  presentation: 'Презентация',
  offer: 'Предложение',
  objection_response: 'Возражение',
  closing: 'Завершение',
  other: 'Блок',
}

interface EditableBlock {
  key: string
  title: string
  text: string
  block_type: string
  is_mandatory: boolean
}

function FulltextEditorDialog({
  initial, templateId, onClose, onSaved,
}: {
  initial: {
    name: string
    description: string
    full_text: string | null
    source_document_name: string | null
    blocks: { title: string; text: string; block_type: string; is_mandatory: boolean }[]
  }
  templateId: string | null // null = создание нового
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description || '')
  const [blocks, setBlocks] = useState<EditableBlock[]>(
    initial.blocks.map((b, i) => ({ key: `b-${i}`, title: b.title, text: b.text, block_type: b.block_type || 'other', is_mandatory: b.is_mandatory !== false }))
  )

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description,
        scope: 'org_level' as const,
        context_description: null,
        script_type: 'fulltext' as const,
        steps: [],
        blocks: blocks.map((b, i) => ({
          title: b.title || `Блок ${i + 1}`,
          text: b.text,
          block_type: b.block_type,
          is_mandatory: b.is_mandatory,
          block_order: i + 1,
        })),
        full_text: initial.full_text,
        source_document_name: initial.source_document_name,
      }
      if (templateId) return scriptsApi.replaceTemplate(templateId, payload)
      return scriptsApi.createTemplate(payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', saved.id] })
      onSaved(saved.id)
    },
  })

  const update = (key: string, patch: Partial<EditableBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)))
  const remove = (key: string) => setBlocks((prev) => prev.filter((b) => b.key !== key))
  const move = (idx: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  const addBlock = () =>
    setBlocks((prev) => [...prev, { key: `n-${Date.now()}`, title: `Блок ${prev.length + 1}`, text: '', block_type: 'other', is_mandatory: true }])

  const mandatoryCount = blocks.filter((b) => b.is_mandatory).length

  return (
    <div className="modal-overlay">
      <div className="modal-card editor-modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <FileText size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {templateId ? 'Полнотекстовый скрипт' : 'Импорт полнотекстового скрипта'}
            {initial.source_document_name && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
                из {initial.source_document_name}
              </span>
            )}
          </div>
          <button className="btn-icon" onClick={onClose} title="Закрыть"><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {initial.source_document_name ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              AI разбил документ на блоки. Проверьте разбивку: <strong>обязательные</strong> блоки нужны
              в каждом разговоре. <strong>Ситуативные</strong> (ответы на возражения, ветки «если клиент…»)
              учитываются в балле, только если ситуация реально возникла — если клиент её не затронул,
              блок не штрафуется. Текст блока сравнивается с речью сотрудника дословно и по смыслу.
            </div>
          ) : (
            <div style={{
              fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5,
              padding: '10px 12px', background: 'var(--bg)', borderRadius: 8,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <FileUp size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
              <span>
                Полнотекстовый скрипт: добавьте блоки — фразы и секции, которые сотрудник должен
                проговорить. <strong>Если у вас есть готовый файл скрипта</strong> (DOCX, PDF, RTF, TXT) —
                быстрее загрузить его через «AI / Шаблон» → вкладка «Из документа»: AI разобьёт текст
                на блоки автоматически.
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="field-label">Название скрипта</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Описание</label>
              <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>
              Блоки скрипта
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                {blocks.length} всего · {mandatoryCount} обязательных
              </span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={addBlock}><Plus size={12} /> Блок</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {blocks.map((b, i) => (
              <div key={b.key} style={{
                border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
                background: b.is_mandatory ? 'transparent' : 'var(--bg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                    minWidth: 18, textAlign: 'center',
                  }}>{i + 1}</span>
                  <input
                    className="form-input"
                    value={b.title}
                    onChange={(e) => update(b.key, { title: e.target.value })}
                    style={{ flex: 1, padding: '5px 10px', fontWeight: 500 }}
                    placeholder="Название блока"
                  />
                  <select
                    className="form-input"
                    value={b.block_type}
                    onChange={(e) => update(b.key, { block_type: e.target.value })}
                    style={{ width: 140, padding: '5px 8px', fontSize: 12 }}
                  >
                    {Object.entries(BLOCK_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <label className="checkbox-row" style={{ fontSize: 12, whiteSpace: 'nowrap', gap: 5 }}
                    title="Обязательный — нужен всегда. Снимите галочку для ситуативных блоков (ответ на возражение): они оцениваются, только если ситуация возникла в разговоре.">
                    <input type="checkbox" checked={b.is_mandatory}
                      onChange={(e) => update(b.key, { is_mandatory: e.target.checked })} />
                    Обязательный
                  </label>
                  <button className="btn-icon" onClick={() => move(i, -1)} disabled={i === 0} title="Выше">
                    <ChevronUp size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="Ниже">
                    <ChevronDown size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => remove(b.key)} title="Удалить" style={{ color: 'var(--danger)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  className="form-input"
                  value={b.text}
                  onChange={(e) => update(b.key, { text: e.target.value })}
                  rows={Math.min(6, Math.max(2, Math.ceil(b.text.length / 90)))}
                  style={{ fontSize: 13, lineHeight: 1.5 }}
                  placeholder="Текст, который сотрудник должен проговорить"
                />
              </div>
            ))}
            {blocks.length === 0 && (
              <div className="empty-state-card">
                <FileText size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                <p style={{ marginBottom: 12 }}>Блоков нет — добавьте хотя бы один</p>
              </div>
            )}
          </div>

          {saveMut.isError && (
            <div style={{
              fontSize: 12, color: 'var(--danger)', marginTop: 12,
              padding: '8px 10px', background: 'var(--danger-light)', borderRadius: 6,
            }}>
              {(() => {
                const err = saveMut.error as any
                const detail = err?.response?.data?.detail
                if (detail?.message) return detail.message
                return typeof detail === 'string' ? detail : (err?.message || 'Не удалось сохранить')
              })()}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Отмена</button>
          <button
            className="btn btn-primary"
            disabled={saveMut.isPending || !name.trim() || blocks.length === 0 || blocks.some((b) => !b.text.trim())}
            onClick={() => saveMut.mutate()}
          >
            <Save size={14} /> {saveMut.isPending ? 'Сохранение…' : (templateId ? 'Сохранить' : 'Создать скрипт')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── LiveTestDialog ──────────────────────────────────────────────────────────

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
                  Итоговый взвешенный скоринг · сегментов: {result.segment_count}
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

// ─── Analytics ───────────────────────────────────────────────────────────────

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
          <option value={180}>6 месяцев</option>
          <option value={365}>Год</option>
        </select>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonAnalyticsRow />
          <SkeletonAnalyticsRow />
          <SkeletonAnalyticsRow />
        </div>
      )}

      {data && data.conversation_count === 0 && (
        <div className="empty-state-card">
          <BarChart3 size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p>Скрипт ещё не применялся к разговорам за выбранный период.</p>
        </div>
      )}

      {data && data.conversation_count > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <div className="metric-tile">
              <div className="metric-tile-label">Разговоров</div>
              <div className="metric-tile-value">{data.conversation_count}</div>
            </div>
            <div className="metric-tile">
              <div className="metric-tile-label">
                Средний скоринг
                <HelpTooltip content="Средний взвешенный балл по всем этапам скрипта, агрегированный по разговорам за период." />
              </div>
              <div className="metric-tile-value" style={{ color: 'var(--primary)' }}>
                {data.avg_script_score != null ? `${data.avg_script_score}%` : '—'}
              </div>
            </div>
            <div className="metric-tile">
              <div className="metric-tile-label">Сильных (≥70%)</div>
              <div className="metric-tile-value" style={{ color: 'var(--success)' }}>
                {data.strong_conversation_count}
              </div>
            </div>
          </div>

          <HeatmapStrip rows={data.per_step} />

          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {(data as any).script_type === 'fulltext' ? 'Детально по блокам' : 'Детально по этапам'}
            <HelpTooltip content={
              (data as any).script_type === 'fulltext' ? (
                <div style={{ maxWidth: 280 }}>
                  <strong>%</strong> — доля разговоров, где блок прозвучал (по тексту или своими словами).<br />
                  Ситуативные блоки помечены отдельно — они не входят в балл покрытия.
                </div>
              ) : (
                <div style={{ maxWidth: 280 }}>
                  <strong>%</strong> — доля разговоров, где этап выполнен (LLM-оценка ≥ 50 из 100).<br />
                  <strong>Обнаружен</strong> — этап идентифицирован в разговоре, даже если выполнен слабо.
                </div>
              )
            } />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.per_step.map((s) => {
              const isFulltext = (data as any).script_type === 'fulltext'
              const na = (s as any).not_applicable_count || 0
              // pass_rate=null — блок/этап ни разу не требовался за период
              if (s.pass_rate == null) {
                return (
                  <div key={s.step_id} className="step-analytics" style={{ borderLeft: '3px solid var(--border)', opacity: 0.7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.step_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>не встречался</div>
                    </div>
                    {na > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Ситуация не возникала в {na} разговорах
                      </div>
                    )}
                  </div>
                )
              }
              const color = s.pass_rate >= 70 ? 'var(--success)' : s.pass_rate >= 40 ? '#F59E0B' : 'var(--danger)'
              return (
                <div key={s.step_id} className="step-analytics" style={{ borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.step_name}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color }}>
                      {s.pass_rate}%
                    </div>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.max(2, s.pass_rate)}%`, background: color }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {isFulltext
                      ? `Прозвучал ${s.detected_count} из ${s.total_count} раз, где требовался${na ? ` · не требовался ${na} раз` : ''}`
                      : `Обнаружен ${s.detected_count} из ${s.total_count} раз (${s.detection_rate}%)`}
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

// ─── Versions ────────────────────────────────────────────────────────────────

function VersionsPanel({ templateId, onRestored }: { templateId: string; onRestored: () => void }) {
  const queryClient = useQueryClient()
  const [showCompare, setShowCompare] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([])

  const { data: versions, isLoading } = useQuery({
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

  const compareHint = selectedForCompare.length === 0
    ? 'Отметьте 2 версии — кликом по плитке или по чекбоксу — чтобы сравнить.'
    : selectedForCompare.length === 1
      ? 'Выбрана 1 версия. Отметьте ещё одну, чтобы открыть сравнение.'
      : 'Можно сравнить выбранные версии.'

  return (
    <div>
      <div className="versions-toolbar">
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {compareHint}
          <HelpTooltip content={
            <div style={{ maxWidth: 280 }}>
              Каждое сохранение создаёт новую версию. Чтобы открыть структурный diff и сравнение метрик —
              отметьте <strong>ровно две</strong> версии (кликом по строке или по чекбоксу).
            </div>
          } />
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={selectedForCompare.length !== 2}
          onClick={() => setShowCompare(true)}
        >
          <GitCompare size={14} /> Сравнить ({selectedForCompare.length}/2)
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonAnalyticsRow />
          <SkeletonAnalyticsRow />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(versions || []).map((v, i) => {
          const isCurrent = i === 0
          const checked = selectedForCompare.includes(v.version_number)
          return (
            <div
              key={v.id}
              className={`version-row ${checked ? 'version-row--checked' : ''}`}
              onClick={() => toggleCompare(v.version_number)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCompare(v.version_number) } }}
            >
              <span
                className={`big-check ${checked ? 'big-check--on' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleCompare(v.version_number) }}
                aria-label="Отметить версию для сравнения"
                role="checkbox"
                aria-checked={checked}
              >
                {checked && <Check size={14} strokeWidth={3} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                  v{v.version_number}
                  {isCurrent && <span className="badge badge-success" style={{ marginLeft: 8 }}>текущая</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(v.created_at).toLocaleString('ru-RU')} · {v.note || 'без примечания'}
                </div>
              </div>
              {!isCurrent && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Восстановить v${v.version_number}? Текущее состояние сохранится как новая версия.`)) restoreMut.mutate(v.version_number)
                  }}
                >
                  <RotateCcw size={13} /> Восстановить
                </button>
              )}
            </div>
          )
        })}
        {!isLoading && (!versions || versions.length === 0) && (
          <div className="empty-state-card">
            <History size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p>История версий пуста. Сохраните изменения — появится первая запись.</p>
          </div>
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

function CompareDialog({ templateId, versionA, versionB, onClose }: {
  templateId: string; versionA: number; versionB: number; onClose: () => void
}) {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useQuery({
    queryKey: ['template-compare', templateId, versionA, versionB, days],
    queryFn: () => scriptsApi.compareVersions(templateId, versionA, versionB, days),
  })

  const renderColumn = (v: any, label: string) => (
    <div className="compare-col">
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
              Метрики посчитаны по разговорам, заскоренным конкретной версией.
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
              <option value={180}>6 месяцев</option>
              <option value={365}>Год</option>
            </select>
          </div>

          {isLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>}
          {data && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {renderColumn(data.version_a, 'Версия A')}
              {renderColumn(data.version_b, 'Версия B')}
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            Структурный diff
            <HelpTooltip content="Сравнение этапов двух версий: что добавлено, удалено и изменено (вес, обязательность, описание, фразы)." />
          </div>
          <StructuralDiff templateId={templateId} versionA={versionA} versionB={versionB} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─── ModalOverlay ────────────────────────────────────────────────────────────

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

// ─── EditorDialog ────────────────────────────────────────────────────────────

function EditorDialog({
  template, isNew, draftInfo, onClose, onSaved, onSwitchToFulltext,
}: {
  template: ScriptTemplate | null
  isNew: boolean
  draftInfo?: { fromAi?: boolean }
  onClose: () => void
  onSaved: (id: string) => void
  onSwitchToFulltext?: () => void
}) {
  const [resetKey, setResetKey] = useState(0)
  const [showHelp, setShowHelp] = useState(false)

  // Переключатель типа — только при создании нового скрипта вручную
  const showTypeSwitch = isNew && !draftInfo?.fromAi && !!onSwitchToFulltext

  return (
    <div className="modal-overlay">
      <div
        className="modal-card editor-modal-card"
      >
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isNew
              ? (draftInfo?.fromAi ? 'AI-черновик скрипта' : 'Новый скрипт')
              : (template?.name || 'Редактирование скрипта')}
            {showTypeSwitch && (
              <span style={{ display: 'inline-flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--bg-card)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', fontWeight: 600, fontSize: 12 }}
                  title="Скрипт из этапов с весами — классический режим"
                >
                  Этапный
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 12 }}
                  onClick={onSwitchToFulltext}
                  title="Скрипт из блоков подробного текста — отслеживание дословного покрытия"
                >
                  <FileText size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Полнотекстовый
                </button>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowHelp(true)}
              title="Подсказка по полям и составлению скриптов"
            >
              <HelpCircle size={13} /> Помощь
            </button>
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
        <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <TemplateEditor
            key={isNew ? (draftInfo?.fromAi ? `ai-${resetKey}` : `new-${resetKey}`) : (template?.id || 'none')}
            template={template}
            onSaved={(id) => onSaved(id)}
            onShowHelp={() => setShowHelp(true)}
          />
        </div>
      </div>
      {showHelp && <HelpModal mode="editor" onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ─── Selected script main panel (tabs) ───────────────────────────────────────

type RightTab = 'analytics' | 'versions' | 'assignments'

function SelectedScriptPanel({
  template, onEdit, initialTab,
}: {
  template: ScriptTemplate
  onEdit: () => void
  initialTab?: RightTab
}) {
  const [tab, setTab] = useState<RightTab>(initialTab || 'analytics')
  useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])

  return (
    <div className="main-card">
      <div className="main-card-header">
        <div>
          <div className="main-title">
            {template.name}
            {template.is_active
              ? <span className="badge badge-success">Активен</span>
              : <span className="badge badge-muted">Черновик</span>}
            {template.script_type === 'fulltext' && (
              <span className="badge badge-muted" title={`Полнотекстовый скрипт${template.source_document_name ? ` из ${template.source_document_name}` : ''} — отслеживание покрытия по блокам`}>
                <FileText size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                Полнотекстовый · {(template.blocks || []).length} блоков
              </span>
            )}
          </div>
          <div className="main-subtitle">{template.description || 'Без описания'}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onEdit}>
          <Edit3 size={14} /> Редактировать
        </button>
      </div>

      <div className="modal-tabs main-tabs">
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

      <div className="main-card-body">
        {tab === 'analytics' && <AnalyticsPanel templateId={template.id} />}
        {tab === 'versions' && <VersionsPanel templateId={template.id} onRestored={() => setTab('analytics')} />}
        {tab === 'assignments' && <AssignmentsBlock template={template} />}
      </div>
    </div>
  )
}

// ─── Sidebar: scripts list with pill filters + inline rename ─────────────────

type ListFilter = 'all' | 'active' | 'drafts'

function ScriptsSidebar({
  templates, selectedId, onSelect, onCreate, onOpenLibrary, onDeleted, isLoading,
}: {
  templates: ScriptTemplate[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onOpenLibrary: () => void
  onDeleted: (id: string) => void
  isLoading: boolean
}) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ListFilter>('all')
  const terms = useTerms()
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const patchMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      scriptsApi.patchTemplate(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
    },
  })

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      scriptsApi.patchTemplate(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['script-template-detail', selectedId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => scriptsApi.deleteTemplate(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      onDeleted(deletedId)
    },
  })

  const filtered = useMemo(() => {
    if (filter === 'active') return templates.filter((t) => t.is_active)
    if (filter === 'drafts') return templates.filter((t) => !t.is_active)
    return templates
  }, [templates, filter])

  const counts = {
    all: templates.length,
    active: templates.filter((t) => t.is_active).length,
    drafts: templates.filter((t) => !t.is_active).length,
  }

  const commitRename = (id: string) => {
    const v = editName.trim()
    if (v) renameMut.mutate({ id, name: v })
    setEditId(null)
  }

  return (
    <div className="sidebar-card">
      <div className="sidebar-card-header">
        <div className="sidebar-card-title">Скрипты</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={onOpenLibrary}
            title="Готовые отраслевые шаблоны или генерация скрипта через AI"
          >
            <Sparkles size={13} /> AI / Шаблон
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={onCreate}
            title="Создать новый скрипт с нуля"
          >
            <Plus size={13} /> Новый
          </button>
        </div>
      </div>

      <div className="pill-filters">
        <button className={`pill ${filter === 'all' ? 'pill--active' : ''}`} onClick={() => setFilter('all')}>
          Все <span className="pill-count">{counts.all}</span>
        </button>
        <button className={`pill ${filter === 'active' ? 'pill--active' : ''}`} onClick={() => setFilter('active')}>
          Активные <span className="pill-count">{counts.active}</span>
        </button>
        <button className={`pill ${filter === 'drafts' ? 'pill--active' : ''}`} onClick={() => setFilter('drafts')}>
          Черновики <span className="pill-count">{counts.drafts}</span>
        </button>
      </div>

      <div className="scripts-list">
        {isLoading && (
          <>
            <SkeletonScriptCard /><SkeletonScriptCard /><SkeletonScriptCard />
          </>
        )}
        {!isLoading && filtered.map((t) => (
          <div
            key={t.id}
            className={`script-item ${selectedId === t.id ? 'script-item--selected' : ''}`}
            onClick={() => editId !== t.id && onSelect(t.id)}
            onDoubleClick={() => { setEditId(t.id); setEditName(t.name) }}
          >
            <div className={`script-item-icon ${t.is_active ? 'is-active' : 'is-draft'}`}>
              <CheckSquare size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editId === t.id ? (
                <input
                  className="form-input form-input--inline"
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(t.id) }
                    if (e.key === 'Escape') setEditId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="script-item-title">{t.name}</div>
              )}
              <div className="script-item-meta">
                {t.script_type === 'fulltext'
                  ? `${(t as any).block_count ?? t.blocks?.length ?? 0} блоков · текст`
                  : `${(t as any).step_count ?? t.steps?.length ?? 0} этапов`}
                {' · '}{t.is_active ? 'Активен' : 'Черновик'}
                {t.applies_to_all_stores && ` · ${terms.allStores.toLowerCase()}`}
              </div>
            </div>
            <div className="script-item-actions">
              <div
                className={`toggle-switch ${t.is_active ? 'on' : ''}`}
                onClick={(e) => { e.stopPropagation(); patchMut.mutate({ id: t.id, is_active: !t.is_active }) }}
                title={t.is_active ? 'Активен' : 'Черновик'}
              />
              <button
                className="btn-icon script-item-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Удалить скрипт «${t.name}»? Все его этапы, версии и назначения будут удалены безвозвратно.`)) {
                    deleteMut.mutate(t.id)
                  }
                }}
                title="Удалить скрипт"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="empty-state-card" style={{ margin: 12 }}>
            <BookOpen size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ marginBottom: 12, fontSize: 13 }}>
              {filter === 'all' ? 'Скриптов пока нет' : filter === 'active' ? 'Нет активных скриптов' : 'Нет черновиков'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={onCreate}>
                <Plus size={12} /> С нуля
              </button>
              <button className="btn btn-outline btn-sm" onClick={onOpenLibrary}>
                <Sparkles size={12} /> Из библиотеки / AI
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-card-footer">
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <Command size={11} style={{ verticalAlign: 'middle' }} /> + K — быстрая навигация
        </span>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ScriptsPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [forcedTab, setForcedTab] = useState<RightTab | undefined>(undefined)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showRulesHelp, setShowRulesHelp] = useState(false)
  const [rulesTab, setRulesTab] = useState<'upsell' | 'crosssell' | 'objections'>('upsell')

  const [editorMode, setEditorMode] = useState<null | 'new' | 'edit' | 'ai'>(null)
  const [aiDraft, setAiDraft] = useState<{ name: string; description: string | null; steps: ScriptStep[] } | null>(null)
  const [docDraft, setDocDraft] = useState<DocDraft | null>(null)

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['script-templates'],
    queryFn: () => scriptsApi.getTemplates(),
  })

  const { data: selectedDetail } = useQuery({
    queryKey: ['script-template-detail', selectedId],
    queryFn: () => scriptsApi.getTemplate(selectedId!),
    enabled: !!selectedId,
  })

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
      queryClient.invalidateQueries({ queryKey: ['template-versions', newId] })
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

  const handleDocDraft = (draft: DocDraft) => {
    setDocDraft(draft)
    setSelectedId(null)
  }

  // Редактирование существующего fulltext-скрипта идёт через FulltextEditorDialog
  const editingFulltext = editorMode === 'edit' && selectedDetail?.script_type === 'fulltext'

  return (
    <div className="scripts-page">
      <div className="scripts-layout">
        <ScriptsSidebar
          templates={templates || []}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setForcedTab(undefined) }}
          onCreate={() => { setEditorMode('new'); setAiDraft(null); setSelectedId(null) }}
          onOpenLibrary={() => setShowLibrary(true)}
          onDeleted={(id) => { if (id === selectedId) setSelectedId(null) }}
          isLoading={templatesLoading}
        />

        {selectedDetail ? (
          <SelectedScriptPanel
            template={selectedDetail}
            onEdit={() => setEditorMode('edit')}
            initialTab={forcedTab}
          />
        ) : (
          <div className="main-card main-card--empty">
            <div className="empty-state-card">
              <BookOpen size={36} style={{ color: 'var(--text-muted)', marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Выберите скрипт из списка</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
                Здесь появятся аналитика, история версий и настройки назначений.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-primary btn-sm" onClick={() => { setEditorMode('new'); setAiDraft(null) }}>
                  <Plus size={12} /> Создать скрипт
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setShowLibrary(true)}>
                  <Sparkles size={12} /> Шаблоны / AI
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rules-section">
        <div className="rules-tabs">
          <div
            className={`rules-tab ${rulesTab === 'upsell' ? 'rules-tab--active' : ''}`}
            onClick={() => setRulesTab('upsell')}
          >
            Апсейл
            <HelpTooltip content="Продажа более дорогой версии того же продукта (iPhone 15 → 15 Pro)." />
          </div>
          <div
            className={`rules-tab ${rulesTab === 'crosssell' ? 'rules-tab--active' : ''}`}
            onClick={() => setRulesTab('crosssell')}
          >
            Кросс-сейл
            <HelpTooltip content="Предложение сопутствующих товаров к основной покупке (ноутбук → сумка, мышь)." />
          </div>
          <div
            className={`rules-tab ${rulesTab === 'objections' ? 'rules-tab--active' : ''}`}
            onClick={() => setRulesTab('objections')}
          >
            Типы возражений
            <HelpTooltip content="Справочник типов, по которым AI классифицирует возражения клиентов. Добавьте свои отраслевые типы с примерами фраз." />
          </div>
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowRulesHelp(true)}>
            <HelpCircle size={12} /> Подробнее
          </button>
        </div>

        {rulesTab === 'upsell' && <RulesTable kind="upsell" />}
        {rulesTab === 'crosssell' && <RulesTable kind="crosssell" />}
        {rulesTab === 'objections' && <ObjectionTypesTable />}
      </div>

      <CommandPalette
        scripts={(templates || []).map((t) => ({ id: t.id, name: t.name, is_active: t.is_active }))}
        onCreate={() => { setEditorMode('new'); setAiDraft(null); setSelectedId(null) }}
        onOpenLibrary={() => setShowLibrary(true)}
        onSelectScript={(id) => { setSelectedId(id); setForcedTab('analytics') }}
        onJumpAssignments={(id) => { setSelectedId(id); setForcedTab('assignments') }}
      />

      {editorMode && !editingFulltext && (
        <EditorDialog
          template={editorTemplate}
          isNew={editorMode !== 'edit'}
          draftInfo={{ fromAi: editorMode === 'ai' }}
          onClose={closeEditor}
          onSaved={handleEditorSaved}
          onSwitchToFulltext={() => {
            closeEditor()
            setDocDraft({ name: '', description: '', full_text: null, source_document_name: null, blocks: [] })
          }}
        />
      )}

      {editingFulltext && selectedDetail && (
        <FulltextEditorDialog
          templateId={selectedDetail.id}
          initial={{
            name: selectedDetail.name,
            description: selectedDetail.description || '',
            full_text: selectedDetail.full_text || null,
            source_document_name: selectedDetail.source_document_name || null,
            blocks: (selectedDetail.blocks || []).map((b) => ({
              title: b.title, text: b.text, block_type: b.block_type, is_mandatory: b.is_mandatory,
            })),
          }}
          onClose={closeEditor}
          onSaved={handleEditorSaved}
        />
      )}

      {docDraft && (
        <FulltextEditorDialog
          templateId={null}
          initial={docDraft}
          onClose={() => setDocDraft(null)}
          onSaved={(id) => { setDocDraft(null); handleEditorSaved(id) }}
        />
      )}

      {showLibrary && (
        <LibraryDialog
          onClose={() => setShowLibrary(false)}
          onCreated={handlePresetCreated}
          onUseDraft={handleAiDraft}
          onUseDocDraft={handleDocDraft}
        />
      )}

      {showRulesHelp && <HelpModal mode="rules" onClose={() => setShowRulesHelp(false)} />}
    </div>
  )
}

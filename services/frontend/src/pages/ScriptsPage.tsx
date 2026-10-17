import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsApi } from '@/api/scripts'
import { useTerms } from '@/lib/terms'
import { adminApi } from '@/api/admin'
import { dashboardApi } from '@/api/dashboard'
import type { ScriptTemplate, ScriptStep, UpsellRule, CrossSellRule, ScriptBreakdownData } from '@/types'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  CheckSquare, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  Save, X, PlayCircle, Loader, BarChart3, History, MapPin, Edit3, RotateCcw,
  GitCompare, Sparkles, BookOpen, HelpCircle, Command, Check, FileText, FileUp, Lightbulb, Minus,
} from 'lucide-react'

import { MultiSelect } from '@/components/scripts/MultiSelect'
import { HelpTooltip } from '@/components/scripts/HelpTooltip'
import { HelpModal } from '@/components/scripts/HelpModal'
import { ScoreFormula, SellerHeatmap, w2, type StepStat } from '@/components/scripts/ScriptBreakdown'
import { Meter } from '@/components/ui/Meter'
import { PageActions, PageSubtitle } from '@/components/layout/PageHeader'
import { t, L, locale, plural } from '@/i18n'
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
                      <strong>Апсейл</strong> — {terms.isCafe ? 'больший объём или более дорогой напиток.' : terms.isPharmacy ? 'упаковка побольше на курс или форма быстрого действия.' : 'продажа более дорогой версии того же продукта.'}<br />
                      {terms.isCafe ? 'Пример: гость заказал капучино 0,3 — бариста предлагает 0,4.' : terms.isPharmacy ? 'Пример: покупатель берёт ибупрофен 10 таблеток — фармацевт предлагает упаковку 20, на курс она выгоднее.' : 'Пример: клиент пришёл за iPhone 15 — продавец предлагает 15 Pro.'}
                    </>
                  ) : (
                    <>
                      <strong>Кросс-сейл</strong> — {terms.isCafe ? 'еда или добавка к напитку.' : terms.isPharmacy ? 'то, что усиливает лечение или нужно к покупке.' : 'предложение сопутствующих товаров к основной покупке.'}<br />
                      {terms.isCafe ? 'Пример: к кофе бариста предлагает круассан или сироп.' : terms.isPharmacy ? 'Пример: к средству от простуды фармацевт предлагает спрей для горла.' : 'Пример: клиент берёт ноутбук — продавец обязан предложить сумку и мышь.'}
                    </>
                  )}
                </div>
              }
            />
          </div>
          <div className="card-subtitle">
            {terms.isCafe
              ? 'Проверяется в каждом разговоре: если гость заказал триггер-продукт, бариста должен предложить указанные позиции.'
              : `Проверяется в каждом разговоре: если упомянут триггер-продукт, ${terms.sellerLower[0]} должен предложить указанные товары.`}
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
              <th style={{ minWidth: 150 }}>{terms.storePlural}</th>
              <th style={{ minWidth: 140 }}>{terms.sellerPlural}</th>
              <th style={{ width: 72 }}>Активно</th>
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
                  ? `Правил апсейла пока нет. Добавьте первое — анализ начнёт отмечать разговоры, где ${terms.sellerLower[0]} не предложил апсейл.`
                  : `Правил кросс-сейла пока нет. Например: ${terms.isCafe ? 'к кофе — круассан или сироп' : terms.isPharmacy ? 'к средству от простуды — спрей для горла' : 'к ноутбуку — сумка и мышь'}.`}
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
          selectAllLabel={`Все ${terms.sellerPlural.toLowerCase()}`}
          placeholder={`Все ${terms.sellerPlural.toLowerCase()}`}
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
                        color: s.score >= 70 ? 'var(--success)' : s.score >= 40 ? 'var(--warn)' : 'var(--danger)',
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

// ─── Вид скрипта (ui-concept/scripts.html) ───────────────────────────────────

type ScriptTab = 'stages' | 'sellers' | 'assignments'

const WEIGHT_STEP = 0.05
const round2 = (v: number) => Math.round(v * 100) / 100
const stepKey = (s: ScriptStep, i: number) => s.id || `i${i}`

interface OutletContext { period: number }

function ScriptView({
  template, period, initialTab, onEdit, onDeleted,
}: {
  template: ScriptTemplate
  period: number
  initialTab?: ScriptTab
  onEdit: () => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const terms = useTerms()
  const isFulltext = template.script_type === 'fulltext'
  const [tab, setTab] = useState<ScriptTab>(initialTab || 'stages')
  const [showVersions, setShowVersions] = useState(false)
  const [showTest, setShowTest] = useState(false)
  useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])
  useEffect(() => { setTab(initialTab || 'stages') }, [template.id])

  const { data: analytics } = useQuery({
    queryKey: ['template-analytics', template.id, period],
    queryFn: () => scriptsApi.getTemplateAnalytics(template.id, { days: period }),
  })
  const { data: breakdown } = useQuery({
    queryKey: ['script-breakdown', template.id, period],
    queryFn: () => dashboardApi.getScriptBreakdown(template.id, period),
    enabled: !isFulltext,
  })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })

  const stat = useMemo(
    () => new Map<string, StepStat>((analytics?.per_step || []).map((p: any) => [p.step_name, p])),
    [analytics],
  )

  const patchMut = useMutation({
    mutationFn: (is_active: boolean) => scriptsApi.patchTemplate(template.id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', template.id] })
    },
  })
  const deleteMut = useMutation({
    mutationFn: () => scriptsApi.deleteTemplate(template.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['script-templates'] }); onDeleted() },
  })

  // Охват: на всю сеть, на магазины или на отдельных продавцов
  const storeNames = (template.assigned_stores || [])
    .map((a) => (stores?.items || []).find((s: any) => s.id === a.store_id)?.name)
    .filter(Boolean) as string[]
  const scope = template.applies_to_all_stores
    ? t('Уровень сети')
    : storeNames.length
      ? (storeNames.length <= 2 ? storeNames.join(', ') : L(`${storeNames.length} магазина`, `${storeNames.length} stores`))
      : (template.assigned_sellers || []).length
        ? L(`${template.assigned_sellers!.length} продавцов`, `${template.assigned_sellers!.length} sellers`)
        : t('Не назначен')

  const tabs: Array<{ id: ScriptTab; label: string; count?: number }> = [
    { id: 'stages', label: isFulltext ? 'Блоки скрипта' : 'Этапы и веса' },
    ...(!isFulltext ? [{ id: 'sellers' as const, label: terms.isCafe ? 'Выполнение по бариста' : terms.isPharmacy ? 'Выполнение по фармацевтам' : 'Выполнение по продавцам' }] : []),
    { id: 'assignments', label: 'Назначения' },
  ]

  return (
    <section className="panel sc-view">
      <div className="sc-head">
        <div className="sc-title-row">
          <div style={{ minWidth: 0 }}>
            <h2 className="sc-title" translate="no">{template.name}</h2>
            {template.description && <p className="sc-desc" translate="no">{template.description}</p>}
          </div>
          <div className="sc-actions">
            <button type="button" className="btn" onClick={() => setShowVersions(true)}>
              <History size={15} aria-hidden="true" />{t('Версии')}
            </button>
            {!isFulltext && (
              <button type="button" className="btn" onClick={() => setShowTest(true)} title={t('Прогнать черновик через LLM на реальной записи')}>
                <PlayCircle size={15} aria-hidden="true" />{t('Тест на записи')}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onEdit}>
              <Edit3 size={15} aria-hidden="true" />{t('Редактировать')}
            </button>
          </div>
        </div>
        <div className="sc-chips">
          <button type="button" className="flag is-info sc-chip-btn" onClick={() => setTab('assignments')} title={t('Назначения')}>
            <MapPin aria-hidden="true" /><span translate={storeNames.length ? 'no' : undefined}>{scope}</span>
          </button>
          <button
            type="button" role="switch" aria-checked={template.is_active}
            className={`flag ${template.is_active ? 'is-good' : 'is-plain'} sc-chip-btn`}
            onClick={() => patchMut.mutate(!template.is_active)}
            title={template.is_active ? t('Деактивировать') : t('Активировать')}
          >
            <span className={`sc-dot ${template.is_active ? 'is-on' : ''}`} aria-hidden="true" />
            {template.is_active ? t('Активен') : t('Черновик')}
          </button>
          {isFulltext && (
            <span className="flag is-plain" title={template.source_document_name || undefined}>
              <FileText aria-hidden="true" />{L(`Полнотекстовый · ${(template.blocks || []).length} блоков`, `Full-text · ${(template.blocks || []).length} blocks`)}
            </span>
          )}
          {analytics && analytics.conversation_count > 0 && (
            <span className="flag is-plain">
              {L(`${analytics.conversation_count.toLocaleString(locale)} ${plural(analytics.conversation_count, ['разговор', 'разговора', 'разговоров'], ['', ''])} за период · средний балл ${analytics.avg_script_score != null ? Math.round(analytics.avg_script_score) : '—'}`,
                `${analytics.conversation_count.toLocaleString(locale)} conversations in period · average ${analytics.avg_script_score != null ? Math.round(analytics.avg_script_score) : '—'}`)}
            </span>
          )}
        </div>
        <div className="tabs sc-tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id}
              className={`tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
              {t(x.label)}{x.count ? <span className="count">{L(`${x.count} ${plural(x.count, ['правило', 'правила', 'правил'], ['', ''])}`, `${x.count} ${x.count === 1 ? 'rule' : 'rules'}`)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="sc-body">
        {tab === 'stages' && (isFulltext
          ? <BlocksTab template={template} stat={stat} />
          : <StagesTab template={template} stat={stat} breakdown={breakdown} />)}
        {tab === 'sellers' && (breakdown ? <SellerHeatmap data={breakdown} /> : <div className="muted">{t('Загрузка...')}</div>)}
        {tab === 'assignments' && <AssignmentsBlock template={template} />}

        <div className="sc-danger-zone">
          <button
            type="button" className="btn btn-ghost cv-danger"
            onClick={() => {
              if (confirm(L(`Удалить скрипт «${template.name}»? Все его этапы, версии и назначения будут удалены безвозвратно.`,
                `Delete script “${template.name}”? All its stages, versions and assignments will be permanently removed.`))) deleteMut.mutate()
            }}
          >
            <Trash2 size={14} aria-hidden="true" />{t('Удалить скрипт')}
          </button>
          {!template.is_active && <span className="muted" style={{ fontSize: 12.5 }}>{L(`Черновик не оценивает разговоры, пока не активирован. Назначьте его ${terms.isTelephony ? 'отделам' : 'магазинам'} и включите.`, 'A draft doesn’t score conversations until activated. Assign it and switch it on.')}</span>}
        </div>
      </div>

      {showVersions && (
        <ModalOverlay onClose={() => setShowVersions(false)}>
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <div className="modal-title">{t('Версии')} · <span translate="no">{template.name}</span></div>
              <button className="btn-icon" onClick={() => setShowVersions(false)} aria-label={t('Закрыть')}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <VersionsPanel templateId={template.id} onRestored={() => setShowVersions(false)} />
            </div>
          </div>
        </ModalOverlay>
      )}
      {showTest && <LiveTestDialog draft={{ name: template.name, steps: template.steps }} onClose={() => setShowTest(false)} />}
    </section>
  )
}

/** Этапы и веса: формула балла, этапы с весом-степпером, советом, лучшим примером и статистикой. */
function StagesTab({ template, stat, breakdown }: {
  template: ScriptTemplate
  stat: Map<string, StepStat>
  breakdown?: ScriptBreakdownData
}) {
  const queryClient = useQueryClient()
  const terms = useTerms()
  const initial = useMemo(
    () => Object.fromEntries(template.steps.map((s, i) => [stepKey(s, i), round2(s.weight || 0)])),
    [template],
  )
  const [weights, setWeights] = useState<Record<string, number>>(initial)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  useEffect(() => { setWeights(initial); setInputs({}) }, [initial])

  const dirty = template.steps.some((s, i) => weights[stepKey(s, i)] !== initial[stepKey(s, i)])
  const sum = round2(Object.values(weights).reduce((a, v) => a + v, 0))
  const sumOk = Math.abs(sum - 1) < 0.011
  const byName = new Map((breakdown?.steps || []).map((b) => [b.name, b]))

  const setW = (key: string, v: number) => {
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(1, round2(v))) }))
    setInputs((prev) => { const n = { ...prev }; delete n[key]; return n })
  }
  const normalize = () => {
    const norm = normalizeWeights(template.steps.map((s, i) => ({ ...s, weight: weights[stepKey(s, i)] })))
    setWeights(Object.fromEntries(norm.map((s, i) => [stepKey(s, i), round2(s.weight)])))
  }

  const saveMut = useMutation({
    mutationFn: () => scriptsApi.replaceTemplate(template.id, {
      name: template.name,
      description: template.description ?? null,
      scope: template.scope || 'org_level',
      context_description: template.context_description ?? null,
      steps: template.steps.map((s, i) => ({ ...s, weight: weights[stepKey(s, i)] })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', template.id] })
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      queryClient.invalidateQueries({ queryKey: ['template-versions', template.id] })
      queryClient.invalidateQueries({ queryKey: ['script-breakdown', template.id] })
    },
  })

  if (template.steps.length === 0) {
    return <div className="empty"><p>{t('Этапов пока нет')}</p></div>
  }

  return (
    <>
      <ScoreFormula
        steps={template.steps.map((s, i) => ({ name: s.name, weight: weights[stepKey(s, i)] }))}
        stat={stat}
      />

      {(dirty || !sumOk) && (
        <div className={`sc-savebar ${sumOk ? '' : 'is-bad'}`} role="status">
          <span>
            {sumOk
              ? t('Веса изменены. Сохранение создаст новую версию скрипта.')
              : L(`Сумма весов ${w2(sum)} — должна быть 1,00.`, `Weights sum to ${sum.toFixed(2)} — must be 1.00.`)}
          </span>
          {!sumOk && <button type="button" className="btn btn-sm" onClick={normalize}>{t('Нормализовать')}</button>}
          {dirty && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setWeights(initial); setInputs({}) }}>{t('Отменить')}</button>}
          {dirty && (
            <button type="button" className="btn btn-sm btn-primary" disabled={!sumOk || saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Save size={13} aria-hidden="true" />{saveMut.isPending ? t('Сохранение...') : t('Сохранить')}
            </button>
          )}
          {saveMut.isError && <span style={{ color: 'var(--crit-ink)' }}>{t('Не удалось сохранить')}</span>}
        </div>
      )}

      {template.steps.map((s, i) => {
        const key = stepKey(s, i)
        const st = stat.get(s.name)
        const b = byName.get(s.name)
        const skip = st?.pass_rate != null ? Math.round(100 - st.pass_rate) : null
        const hint = s.recommendation_text || b?.hint
        return (
          <div key={key} className="step">
            <span className="step-num">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="step-top">
                <span className="step-name" translate="no">{s.name}</span>
                <span className="tag tag-neutral">{s.is_required ? t('обязательный') : t('по ситуации')}</span>
              </div>
              {s.description && <p className="step-desc" translate="no">{s.description}</p>}
              {hint && (
                <div className="step-rec"><Lightbulb size={15} aria-hidden="true" /><span><b>{terms.isCafe ? t('Совет бариста:') : terms.isPharmacy ? L('Совет фармацевту:', 'Tip for the pharmacist:') : t('Совет продавцу:')}</b> <span translate="no">{hint}</span></span></div>
              )}
            </div>
            <div className="step-side">
              <div className="wctl">
                <label htmlFor={`w-${key}`}>{t('Вес в балле')}</label>
                <span className="stepper">
                  <button type="button" aria-label={t('Уменьшить вес')} onClick={() => setW(key, weights[key] - WEIGHT_STEP)}><Minus size={13} /></button>
                  <input
                    id={`w-${key}`}
                    inputMode="decimal"
                    value={inputs[key] ?? w2(weights[key])}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value.replace(',', '.'))
                      if (Number.isFinite(v)) setW(key, v > 1 ? v / 100 : v)
                      else setInputs((prev) => { const n = { ...prev }; delete n[key]; return n })
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  />
                  <button type="button" aria-label={t('Увеличить вес')} onClick={() => setW(key, weights[key] + WEIGHT_STEP)}><Plus size={13} /></button>
                </span>
              </div>
              <div className="stat-mini">
                <div className="row"><span>{t('Средний балл')}</span><Meter score={st?.avg_score ?? null} /></div>
                <div className="row"><span>{t('Пропускают')}</span><b className={skip != null && skip >= 25 ? 'is-bad' : ''}>{skip != null ? `${skip} %` : '—'}</b></div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

/** Полнотекстовый скрипт: блоки текста и как часто они звучат. */
function BlocksTab({ template, stat }: { template: ScriptTemplate; stat: Map<string, StepStat> }) {
  const blocks = [...(template.blocks || [])].sort((a, b) => a.block_order - b.block_order)
  if (!blocks.length) return <div className="empty"><p>{t('Блоков нет — добавьте хотя бы один')}</p></div>
  return (
    <>
      <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
        {t('Процент — доля разговоров, где блок прозвучал (по тексту или своими словами). Ситуативные блоки не входят в балл покрытия.')}
      </p>
      {blocks.map((b, i) => {
        const st = stat.get(b.title)
        const rate = st?.pass_rate
        return (
          <div key={b.id || i} className="step">
            <span className="step-num">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="step-top">
                <span className="step-name" translate="no">{b.title}</span>
                <span className="tag tag-neutral">{b.is_mandatory ? t('обязательный') : t('ситуативный')}</span>
              </div>
              <p className="step-desc sc-clamp" translate="no">{b.text}</p>
            </div>
            <div className="step-side">
              <div className="stat-mini">
                <div className="row"><span>{t('Прозвучал')}</span><b className={rate != null && rate < 50 ? 'is-bad' : ''}>{rate != null ? `${Math.round(rate)} %` : '—'}</b></div>
                <div className="row"><span>{t('Разговоров')}</span><b>{st?.total_count ?? '—'}</b></div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

// ─── Список скриптов слева: карточки ──────────────────────────────────────────

function ScriptCard({ template, selected, period, onSelect }: {
  template: ScriptTemplate & { seller_count?: number }
  selected: boolean
  period: number
  onSelect: () => void
}) {
  const isFulltext = template.script_type === 'fulltext'
  const { data } = useQuery({
    queryKey: ['template-analytics', template.id, period],
    queryFn: () => scriptsApi.getTemplateAnalytics(template.id, { days: period }),
    staleTime: 60_000,
  })
  const parts = [
    isFulltext
      ? L(`${template.block_count ?? 0} блоков · текст`, `${template.block_count ?? 0} blocks · text`)
      : L(`${template.step_count ?? 0} этапов`, `${template.step_count ?? 0} stages`),
    template.seller_count ? L(`${template.seller_count} продавцов`, `${template.seller_count} sellers`) : null,
  ].filter(Boolean)
  return (
    <button type="button" className="rail-card" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
      <span className="rail-name" translate="no">{template.name}</span>
      <span className="rail-meta">{parts.join(' · ')}</span>
      {template.description && !selected && <span className="rail-ctx" translate="no">{template.description}</span>}
      <span className="rail-foot">
        {!template.is_active
          ? <><span className="flag is-plain">{t('Черновик')}</span><span className="muted" style={{ fontSize: 12 }}>{t('не оценивает разговоры')}</span></>
          : data && data.conversation_count > 0
            ? <><Meter score={data.avg_script_score} /><span className="muted" style={{ fontSize: 12 }}>{t('средний балл')}</span></>
            : <span className="muted" style={{ fontSize: 12 }}>{t('Нет разговоров за период')}</span>}
      </span>
    </button>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

/* Правила допродажи и типы возражений — уровень организации, а не скрипта: LLM проверяет их
   в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить магазинами и продавцами. */
type OrgRulesTab = 'upsell' | 'crosssell' | 'objections'

function OrgRules() {
  const terms = useTerms()
  const [tab, setTab] = useState<OrgRulesTab>('upsell')
  const { data: upsellRules } = useQuery({ queryKey: ['upsell-rules'], queryFn: () => scriptsApi.listUpsellRules() })
  const { data: crossRules } = useQuery({ queryKey: ['cross-sell-rules'], queryFn: () => scriptsApi.listCrossSellRules() })
  const tabs: Array<{ id: OrgRulesTab; label: string; count?: number }> = [
    { id: 'upsell', label: 'Апсейл', count: upsellRules?.length },
    { id: 'crosssell', label: 'Кросс-сейл', count: crossRules?.length },
    { id: 'objections', label: 'Типы возражений' },
  ]
  return (
    <section className="panel sc-view sc-org" aria-labelledby="sc-org-title">
      <div className="sc-head">
        <h2 id="sc-org-title" className="sc-title">{t('Правила для всех скриптов')}</h2>
        <p className="sc-desc">{terms.isCafe
          ? L('Допродажа и возражения проверяются в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить точками и бариста.', 'Add-on sales and objections are checked in every conversation, whatever script applies. A rule can be limited to locations and baristas.')
          : terms.isPharmacy
          ? L('Допродажа и возражения проверяются в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить аптеками и фармацевтами.', 'Add-on sales and objections are checked in every conversation, whatever script applies. A rule can be limited to pharmacies and pharmacists.')
          : t('Допродажа и возражения проверяются в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить магазинами и продавцами.')}</p>
        <div className="tabs sc-tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id}
              className={`tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
              {t(x.label)}{x.count ? <span className="count">{L(`${x.count} ${plural(x.count, ['правило', 'правила', 'правил'], ['', ''])}`, `${x.count} ${x.count === 1 ? 'rule' : 'rules'}`)}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="sc-body">
        <div className="sc-stack">
          {tab === 'upsell' && <RulesTable kind="upsell" />}
          {tab === 'crosssell' && <RulesTable kind="crosssell" />}
          {tab === 'objections' && <ObjectionTypesTable />}
        </div>
      </div>
    </section>
  )
}

export function ScriptsPage() {
  const queryClient = useQueryClient()
  const { period } = useOutletContext<OutletContext>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [forcedTab, setForcedTab] = useState<ScriptTab | undefined>(undefined)
  const [showLibrary, setShowLibrary] = useState(false)

  const [editorMode, setEditorMode] = useState<null | 'new' | 'edit' | 'ai'>(null)
  const [aiDraft, setAiDraft] = useState<{ name: string; description: string | null; steps: ScriptStep[] } | null>(null)
  const [docDraft, setDocDraft] = useState<DocDraft | null>(null)

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['script-templates'],
    queryFn: () => scriptsApi.getTemplates(),
  })

  // Активные — первыми; без выбора открываем первый скрипт, как в концепте
  const sorted = useMemo(
    () => [...(templates || [])].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [templates],
  )
  useEffect(() => {
    if (!selectedId && !editorMode && !docDraft && sorted.length) setSelectedId(sorted[0].id)
    if (selectedId && templates && !templates.some((x) => x.id === selectedId)) setSelectedId(sorted[0]?.id ?? null)
  }, [sorted, selectedId, templates, editorMode, docDraft])

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
  }

  const handleDocDraft = (draft: DocDraft) => setDocDraft(draft)

  const startNew = () => { setEditorMode('new'); setAiDraft(null) }

  // Редактирование существующего fulltext-скрипта идёт через FulltextEditorDialog
  const editingFulltext = editorMode === 'edit' && selectedDetail?.script_type === 'fulltext'

  const total = templates?.length || 0
  const active = (templates || []).filter((x) => x.is_active).length

  return (
    <div className="scripts-page">
      <PageSubtitle>
        {L(
          `${total} скриптов · ${active} активных · оценка каждого разговора по этапам`,
          `${total} scripts · ${active} active · every conversation scored stage by stage`,
        )}
      </PageSubtitle>
      <PageActions>
        <button type="button" className="btn" onClick={() => setShowLibrary(true)} title={t('Готовые отраслевые шаблоны или генерация скрипта через AI')}>
          <Sparkles size={15} aria-hidden="true" />{t('Шаблоны и AI')}
        </button>
        <button type="button" className="btn btn-primary" onClick={startNew}>
          <Plus size={15} aria-hidden="true" />{t('Новый скрипт')}
        </button>
      </PageActions>

      <div className="sc-grid">
        <nav className="rail" aria-label={t('Скрипты')}>
          {templatesLoading && <><SkeletonScriptCard /><SkeletonScriptCard /></>}
          {sorted.map((x) => (
            <ScriptCard
              key={x.id}
              template={x}
              selected={x.id === selectedId}
              period={period}
              onSelect={() => { setSelectedId(x.id); setForcedTab(undefined) }}
            />
          ))}
          <button type="button" className="rail-add" onClick={startNew}>
            <Plus size={15} aria-hidden="true" />{t('Новый скрипт')}
          </button>
        </nav>

        {selectedDetail ? (
          <ScriptView
            template={selectedDetail}
            period={period}
            initialTab={forcedTab}
            onEdit={() => setEditorMode('edit')}
            onDeleted={() => setSelectedId(null)}
          />
        ) : !templatesLoading && total === 0 ? (
          <section className="panel">
            <div className="empty">
              <BookOpen size={32} aria-hidden="true" style={{ color: 'var(--ink-4)', margin: '0 auto 10px' }} />
              <h3>{t('Скриптов пока нет')}</h3>
              <p>{t('Скрипт — это список этапов, которые продавец должен пройти в разговоре. Начните с готового шаблона или опишите задачу — AI соберёт черновик.')}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setShowLibrary(true)}><Sparkles size={14} aria-hidden="true" />{t('Шаблоны и AI')}</button>
                <button className="btn" onClick={startNew}><Plus size={14} aria-hidden="true" />{t('С нуля')}</button>
              </div>
            </div>
          </section>
        ) : (
          <section className="panel"><div className="empty"><p className="muted">{t('Загрузка...')}</p></div></section>
        )}
      </div>

      <OrgRules />

      <CommandPalette
        scripts={(templates || []).map((x) => ({ id: x.id, name: x.name, is_active: x.is_active }))}
        onCreate={startNew}
        onOpenLibrary={() => setShowLibrary(true)}
        onSelectScript={(id) => { setSelectedId(id); setForcedTab('stages') }}
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
    </div>
  )
}

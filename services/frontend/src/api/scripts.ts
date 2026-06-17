import apiClient from './client'
import type { ScriptTemplate, ScriptStep, UpsellRule, CrossSellRule } from '@/types'

function normalizeStep(s: any): ScriptStep {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    weight: typeof s.weight === 'number' ? s.weight : Number(s.weight),
    order: s.step_order ?? s.order,
    is_required: !!s.is_required,
    recommendation_text: s.recommendation_text ?? null,
    example_phrases: Array.isArray(s.example_phrases) ? s.example_phrases : [],
  }
}

export interface ObjectionTypeItem {
  id: string
  code: string
  label: string
  description: string
  example_phrases: string[]
  is_default: boolean
  is_active: boolean
}

export interface ScriptBlock {
  id?: string
  title: string
  text: string
  block_type: string
  is_mandatory: boolean
  block_order: number
}

function normalizeBlock(b: any): ScriptBlock {
  return {
    id: b.id,
    title: b.title,
    text: b.text,
    block_type: b.block_type || 'other',
    is_mandatory: b.is_mandatory !== false,
    block_order: b.block_order ?? 0,
  }
}

function normalizeTemplate(d: any): ScriptTemplate {
  return {
    id: d.id,
    name: d.name,
    short_name: d.short_name ?? null,
    description: d.description ?? null,
    scope: d.scope,
    context_description: d.context_description ?? null,
    is_active: !!d.is_active,
    applies_to_all_stores: !!d.applies_to_all_stores,
    script_type: d.script_type || 'staged',
    full_text: d.full_text ?? null,
    source_document_name: d.source_document_name ?? null,
    blocks: (d.blocks || []).map(normalizeBlock).sort((a: ScriptBlock, b: ScriptBlock) => a.block_order - b.block_order),
    steps: (d.steps || []).map(normalizeStep).sort((a: ScriptStep, b: ScriptStep) => a.order - b.order),
    assigned_sellers: d.assigned_sellers || [],
    assigned_stores: d.assigned_stores || [],
  }
}

// Сервер ожидает block_order по порядку массива
function blocksForServer(blocks: ScriptBlock[]) {
  return blocks.map((b, i) => ({
    title: b.title,
    text: b.text,
    block_type: b.block_type || 'other',
    is_mandatory: b.is_mandatory,
    block_order: i + 1,
  }))
}

// Сервер ожидает step_order вместо order
function stepsForServer(steps: ScriptStep[]) {
  return steps.map((s, i) => ({
    name: s.name,
    description: s.description || null,
    weight: s.weight,
    is_required: s.is_required,
    step_order: i + 1,
    recommendation_text: s.recommendation_text || null,
    example_phrases: s.example_phrases || [],
  }))
}

export const scriptsApi = {
  getTemplates: async (): Promise<ScriptTemplate[]> => {
    const response = await apiClient.get<{ items: any[]; total: number }>('/api/v1/scripts/templates')
    // Список не содержит steps/blocks — сохраняем счётчики с бэка для сайдбара
    return (response.data.items || []).map((d) => ({
      ...normalizeTemplate(d),
      step_count: d.step_count ?? 0,
      block_count: d.block_count ?? 0,
    }))
  },

  getTemplate: async (id: string): Promise<ScriptTemplate> => {
    const response = await apiClient.get<any>(`/api/v1/scripts/templates/${id}`)
    return normalizeTemplate(response.data)
  },

  createTemplate: async (data: {
    name: string
    short_name?: string | null
    description?: string | null
    scope?: 'org_level' | 'manager_level'
    context_description?: string | null
    steps: ScriptStep[]
    script_type?: 'staged' | 'fulltext'
    blocks?: ScriptBlock[]
    full_text?: string | null
    source_document_name?: string | null
  }) => {
    const body = {
      name: data.name,
      short_name: data.short_name ?? null,
      description: data.description ?? null,
      scope: data.scope || 'org_level',
      context_description: data.context_description ?? null,
      script_type: data.script_type || 'staged',
      steps: stepsForServer(data.steps),
      blocks: blocksForServer(data.blocks || []),
      full_text: data.full_text ?? null,
      source_document_name: data.source_document_name ?? null,
    }
    const response = await apiClient.post<any>('/api/v1/scripts/templates', body)
    return normalizeTemplate(response.data)
  },

  // Полная замена шаблона (PUT) — для редактора, который шлёт весь объект
  replaceTemplate: async (id: string, data: {
    name: string
    short_name?: string | null
    description?: string | null
    scope?: 'org_level' | 'manager_level'
    context_description?: string | null
    steps: ScriptStep[]
    blocks?: ScriptBlock[]
    full_text?: string | null
    source_document_name?: string | null
  }) => {
    const body = {
      name: data.name,
      short_name: data.short_name ?? null,
      description: data.description ?? null,
      scope: data.scope || 'org_level',
      context_description: data.context_description ?? null,
      steps: stepsForServer(data.steps),
      blocks: blocksForServer(data.blocks || []),
      full_text: data.full_text ?? null,
      source_document_name: data.source_document_name ?? null,
    }
    const response = await apiClient.put<any>(`/api/v1/scripts/templates/${id}`, body)
    return normalizeTemplate(response.data)
  },

  // ─── Типы возражений (настраиваемый справочник организации) ───────────────

  listObjectionTypes: async (onlyActive = false) => {
    const response = await apiClient.get<{ items: ObjectionTypeItem[]; total: number }>(
      '/api/v1/scripts/objection-types',
      { params: onlyActive ? { only_active: true } : undefined },
    )
    return response.data.items
  },

  createObjectionType: async (data: {
    label: string
    code?: string
    description?: string
    example_phrases?: string[]
    is_active?: boolean
  }) => {
    const response = await apiClient.post<ObjectionTypeItem>('/api/v1/scripts/objection-types', data)
    return response.data
  },

  patchObjectionType: async (id: string, data: {
    label?: string
    description?: string
    example_phrases?: string[]
    is_active?: boolean
  }) => {
    const response = await apiClient.patch<ObjectionTypeItem>(`/api/v1/scripts/objection-types/${id}`, data)
    return response.data
  },

  deleteObjectionType: async (id: string) => {
    await apiClient.delete(`/api/v1/scripts/objection-types/${id}`)
  },

  // Импорт документа скрипта (DOCX/PDF/RTF/TXT) → черновик блоков для предпросмотра
  importDocument: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<{
      file_name: string
      full_text: string
      name_suggestion: string
      description_suggestion: string
      blocks: { title: string; text: string; block_type: string; is_mandatory: boolean }[]
    }>('/api/v1/scripts/templates/import-document', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // LLM-структуризация большого документа может быть долгой
    })
    return response.data
  },

  patchTemplate: async (id: string, data: {
    name?: string
    description?: string | null
    is_active?: boolean
    applies_to_all_stores?: boolean
  }) => {
    const response = await apiClient.patch<any>(`/api/v1/scripts/templates/${id}`, data)
    return normalizeTemplate(response.data)
  },

  deleteTemplate: async (id: string) => {
    await apiClient.delete(`/api/v1/scripts/templates/${id}`)
  },

  // --- Назначения на магазины ---
  listStoreAssignments: async (params: { store_id?: string; template_id?: string } = {}) => {
    const response = await apiClient.get<{ items: any[]; total: number }>('/api/v1/scripts/store-assignments', { params })
    return response.data.items
  },

  assignToStore: async (data: { store_id: string; template_id: string; is_mandatory?: boolean }) => {
    const response = await apiClient.post<any>('/api/v1/scripts/store-assignments', {
      store_id: data.store_id,
      template_id: data.template_id,
      is_mandatory: !!data.is_mandatory,
    })
    return response.data
  },

  removeStoreAssignment: async (assignment_id: string) => {
    await apiClient.delete(`/api/v1/scripts/store-assignments/${assignment_id}`)
  },

  bulkSetStoreAssignments: async (template_id: string, store_ids: string[]) => {
    const response = await apiClient.post<any>('/api/v1/scripts/store-assignments/bulk-set', {
      template_id, store_ids,
    })
    return response.data
  },

  bulkSetSellerAssignments: async (template_id: string, seller_ids: string[]) => {
    const response = await apiClient.post<any>('/api/v1/scripts/assignments/bulk-set', {
      template_id, seller_ids,
    })
    return response.data
  },

  // --- Назначения на продавцов (оставляем существующую API) ---
  assignToSeller: async (data: { seller_id: string; template_id: string; is_mandatory?: boolean }) => {
    const response = await apiClient.post<any>('/api/v1/scripts/assignments', {
      seller_id: data.seller_id,
      template_id: data.template_id,
      is_mandatory: !!data.is_mandatory,
    })
    return response.data
  },

  removeSellerAssignment: async (assignment_id: string) => {
    await apiClient.delete(`/api/v1/scripts/assignments/${assignment_id}`)
  },

  listSellerAssignments: async (params: { seller_id?: string; template_id?: string } = {}) => {
    const response = await apiClient.get<{ items: any[]; total: number }>('/api/v1/scripts/assignments', { params })
    return response.data.items
  },

  // --- Upsell rules ---
  listUpsellRules: async (params: { store_id?: string; include_org_default?: boolean } = {}) => {
    const response = await apiClient.get<{ items: UpsellRule[]; total: number }>('/api/v1/scripts/upsell-rules', { params })
    return response.data.items
  },

  createUpsellRule: async (data: {
    store_ids?: string[]
    seller_ids?: string[]
    trigger_product: string
    required_offers: string[]
    is_active?: boolean
  }) => {
    const response = await apiClient.post<UpsellRule>('/api/v1/scripts/upsell-rules', {
      store_ids: data.store_ids ?? [],
      seller_ids: data.seller_ids ?? [],
      trigger_product: data.trigger_product,
      required_offers: data.required_offers,
      is_active: data.is_active ?? true,
    })
    return response.data
  },

  patchUpsellRule: async (id: string, data: Partial<{
    store_ids: string[]
    seller_ids: string[]
    trigger_product: string
    required_offers: string[]
    is_active: boolean
  }>) => {
    const response = await apiClient.patch<UpsellRule>(`/api/v1/scripts/upsell-rules/${id}`, data)
    return response.data
  },

  deleteUpsellRule: async (id: string) => {
    await apiClient.delete(`/api/v1/scripts/upsell-rules/${id}`)
  },

  // --- Cross-sell rules ---
  listCrossSellRules: async (params: { store_id?: string; include_org_default?: boolean } = {}) => {
    const response = await apiClient.get<{ items: CrossSellRule[]; total: number }>('/api/v1/scripts/cross-sell-rules', { params })
    return response.data.items
  },

  createCrossSellRule: async (data: {
    store_ids?: string[]
    seller_ids?: string[]
    trigger_product: string
    required_offers: string[]
    is_active?: boolean
  }) => {
    const response = await apiClient.post<CrossSellRule>('/api/v1/scripts/cross-sell-rules', {
      store_ids: data.store_ids ?? [],
      seller_ids: data.seller_ids ?? [],
      trigger_product: data.trigger_product,
      required_offers: data.required_offers,
      is_active: data.is_active ?? true,
    })
    return response.data
  },

  patchCrossSellRule: async (id: string, data: Partial<{
    store_ids: string[]
    seller_ids: string[]
    trigger_product: string
    required_offers: string[]
    is_active: boolean
  }>) => {
    const response = await apiClient.patch<CrossSellRule>(`/api/v1/scripts/cross-sell-rules/${id}`, data)
    return response.data
  },

  deleteCrossSellRule: async (id: string) => {
    await apiClient.delete(`/api/v1/scripts/cross-sell-rules/${id}`)
  },

  // --- Library ---
  listLibrary: async () => {
    const response = await apiClient.get<{ items: any[] }>('/api/v1/scripts/library')
    return response.data.items
  },

  getLibraryPreset: async (preset_id: string) => {
    const response = await apiClient.get<any>(`/api/v1/scripts/library/${preset_id}`)
    return response.data
  },

  createFromPreset: async (preset_id: string) => {
    const response = await apiClient.post<any>(`/api/v1/scripts/library/${preset_id}/create`)
    return normalizeTemplateRaw(response.data)
  },

  generateWithAi: async (data: { topic: string; industry?: string; extra_notes?: string }) => {
    const response = await apiClient.post<any>('/api/v1/scripts/library/generate', data)
    // Возвращает черновик (без id, не сохранён): { name, description, steps: [...] }
    return {
      name: response.data.name as string,
      description: (response.data.description as string | null) ?? null,
      steps: ((response.data.steps as any[]) || []).map((s, i): ScriptStep => ({
        name: s.name,
        description: s.description ?? null,
        weight: Number(s.weight),
        order: s.step_order ?? i + 1,
        is_required: !!s.is_required,
        recommendation_text: s.recommendation_text ?? null,
        example_phrases: s.example_phrases || [],
      })),
    }
  },

  // --- Versions ---
  listVersions: async (template_id: string) => {
    const response = await apiClient.get<{ items: any[] }>(`/api/v1/scripts/templates/${template_id}/versions`)
    return response.data.items as Array<{
      id: string; template_id: string; version_number: number;
      note?: string | null; created_by: string; created_at: string;
    }>
  },

  getVersion: async (template_id: string, version_number: number) => {
    const response = await apiClient.get<any>(`/api/v1/scripts/templates/${template_id}/versions/${version_number}`)
    return response.data
  },

  restoreVersion: async (template_id: string, version_number: number) => {
    const response = await apiClient.post<any>(`/api/v1/scripts/templates/${template_id}/versions/${version_number}/restore`)
    return normalizeTemplateRaw(response.data)
  },

  // --- Step analytics ---
  getTemplateAnalytics: async (template_id: string, params: { days?: number; version_id?: string } = {}) => {
    const response = await apiClient.get<any>(`/api/v1/scripts/templates/${template_id}/analytics`, { params })
    return response.data as {
      template_id: string
      period_days: number
      conversation_count: number
      avg_script_score: number | null
      strong_conversation_count: number
      weak_conversation_count: number
      per_step: Array<{
        step_id: string; step_name: string;
        avg_score: number; total_count: number;
        pass_count: number; pass_rate: number;
        detected_count: number; detection_rate: number;
      }>
    }
  },

  compareVersions: async (template_id: string, version_a: number, version_b: number, days = 30) => {
    const response = await apiClient.get<any>(`/api/v1/scripts/templates/${template_id}/compare`, {
      params: { version_a, version_b, days },
    })
    return response.data
  },

  // --- Live test ---
  testScript: async (data: {
    recording_id: string
    name: string
    steps: ScriptStep[]
  }) => {
    const response = await apiClient.post<any>('/api/v1/scripts/test', {
      recording_id: data.recording_id,
      name: data.name,
      steps: data.steps.map((s, i) => ({
        id: s.id || null,
        name: s.name,
        description: s.description ?? null,
        weight: s.weight,
        is_required: s.is_required,
        step_order: i + 1,
        example_phrases: s.example_phrases || [],
      })),
    })
    return response.data as {
      overall_score: number
      step_scores: Array<{
        step_id: string; step_name: string; score: number;
        detected: boolean; evidence: string; weight: number;
      }>
      violations: string[]
      segment_count: number
    }
  },
}

function normalizeTemplateRaw(d: any) {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? null,
    scope: d.scope,
    context_description: d.context_description ?? null,
    is_active: !!d.is_active,
    steps: (d.steps || []).map((s: any, i: number) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      weight: typeof s.weight === 'number' ? s.weight : Number(s.weight),
      order: s.step_order ?? i + 1,
      is_required: !!s.is_required,
      recommendation_text: s.recommendation_text ?? null,
      example_phrases: s.example_phrases || [],
    })),
    assigned_sellers: d.assigned_sellers || [],
    assigned_stores: d.assigned_stores || [],
  }
}

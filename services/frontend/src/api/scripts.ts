import apiClient from './client'
import type { ScriptTemplate, ScriptStep, UpsellRule } from '@/types'

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

function normalizeTemplate(d: any): ScriptTemplate {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? null,
    scope: d.scope,
    context_description: d.context_description ?? null,
    is_active: !!d.is_active,
    steps: (d.steps || []).map(normalizeStep).sort((a: ScriptStep, b: ScriptStep) => a.order - b.order),
    assigned_sellers: d.assigned_sellers || [],
    assigned_stores: d.assigned_stores || [],
  }
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
    return (response.data.items || []).map(normalizeTemplate)
  },

  getTemplate: async (id: string): Promise<ScriptTemplate> => {
    const response = await apiClient.get<any>(`/api/v1/scripts/templates/${id}`)
    return normalizeTemplate(response.data)
  },

  createTemplate: async (data: {
    name: string
    description?: string | null
    scope?: 'org_level' | 'manager_level'
    context_description?: string | null
    steps: ScriptStep[]
  }) => {
    const body = {
      name: data.name,
      description: data.description ?? null,
      scope: data.scope || 'org_level',
      context_description: data.context_description ?? null,
      steps: stepsForServer(data.steps),
    }
    const response = await apiClient.post<any>('/api/v1/scripts/templates', body)
    return normalizeTemplate(response.data)
  },

  // Полная замена шаблона (PUT) — для редактора, который шлёт весь объект
  replaceTemplate: async (id: string, data: {
    name: string
    description?: string | null
    scope?: 'org_level' | 'manager_level'
    context_description?: string | null
    steps: ScriptStep[]
  }) => {
    const body = {
      name: data.name,
      description: data.description ?? null,
      scope: data.scope || 'org_level',
      context_description: data.context_description ?? null,
      steps: stepsForServer(data.steps),
    }
    const response = await apiClient.put<any>(`/api/v1/scripts/templates/${id}`, body)
    return normalizeTemplate(response.data)
  },

  patchTemplate: async (id: string, data: { name?: string; description?: string | null; is_active?: boolean }) => {
    const response = await apiClient.patch<any>(`/api/v1/scripts/templates/${id}`, data)
    return normalizeTemplate(response.data)
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
    store_id?: string | null
    trigger_product: string
    required_offers: string[]
    is_active?: boolean
  }) => {
    const response = await apiClient.post<UpsellRule>('/api/v1/scripts/upsell-rules', {
      store_id: data.store_id ?? null,
      trigger_product: data.trigger_product,
      required_offers: data.required_offers,
      is_active: data.is_active ?? true,
    })
    return response.data
  },

  patchUpsellRule: async (id: string, data: Partial<{
    store_id: string | null
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

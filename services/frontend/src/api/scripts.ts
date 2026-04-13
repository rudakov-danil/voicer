import apiClient from './client'
import type { ScriptTemplate } from '@/types'

export const scriptsApi = {
  getTemplates: async () => {
    const response = await apiClient.get<{ items: any[]; total: number }>('/api/v1/scripts/templates')
    return response.data.items as ScriptTemplate[]
  },

  getTemplate: async (id: string) => {
    const response = await apiClient.get<any>(`/api/v1/scripts/templates/${id}`)
    const d = response.data
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      is_active: d.is_active,
      steps: (d.steps || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        weight: s.weight,
        order: s.step_order,
        is_required: s.is_required,
        recommendation_text: s.recommendation_text,
      })),
    } as ScriptTemplate
  },

  createTemplate: async (data: Omit<ScriptTemplate, 'id'>) => {
    const response = await apiClient.post<ScriptTemplate>('/api/v1/scripts/templates', data)
    return response.data
  },

  updateTemplate: async (id: string, data: Partial<ScriptTemplate>) => {
    const response = await apiClient.patch<ScriptTemplate>(`/api/v1/scripts/templates/${id}`, data)
    return response.data
  }
}

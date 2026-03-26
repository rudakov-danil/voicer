import apiClient from './client'
import type { ScriptTemplate } from '@/types'

export const scriptsApi = {
  getTemplates: async () => {
    const response = await apiClient.get<ScriptTemplate[]>('/api/v1/scripts/templates')
    return response.data
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

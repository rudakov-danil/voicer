import apiClient from './client'
import type { DashboardOverview, Conversation, Seller } from '@/types'

export const dashboardApi = {
  getOverview: async (params: {
    period?: number
    store_id?: string
  }) => {
    const response = await apiClient.get<DashboardOverview>('/api/v1/dashboard/overview', { params })
    return response.data
  },

  getConversations: async (params: {
    page?: number
    limit?: number
    store_id?: string
    seller_id?: string
    outcome?: string
    score_min?: number
    score_max?: number
  }) => {
    const response = await apiClient.get<{
      items: Conversation[]
      total: number
      page: number
      limit: number
    }>('/api/v1/dashboard/conversations', { params })
    return response.data
  },

  getConversationDetail: async (conversationId: string) => {
    const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}`)
    return response.data
  },

  getSellers: async (params?: { store_id?: string }) => {
    const response = await apiClient.get<{items: any[], total: number}>('/api/v1/dashboard/sellers', { params })
    return (response.data.items || []).map((s: any) => ({
      id: s.seller_id,
      first_name: s.first_name || '',
      last_name: s.last_name || '',
      store_id: s.store_id || '',
      is_active: true,
      avg_score: s.avg_score,
      conversion_rate: s.conversion_rate,
      conversations_count: s.total_conversations,
      weakest_step: s.weakest_step,
      score_trend: s.score_trend
    })) as Seller[]
  },

  getSellerDetail: async (sellerId: string) => {
    const response = await apiClient.get(`/api/v1/dashboard/sellers/${sellerId}/detail`)
    return response.data
  }
}

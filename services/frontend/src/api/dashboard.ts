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
    const response = await apiClient.get<Seller[]>('/api/v1/dashboard/sellers', { params })
    return response.data
  },

  getSellerDetail: async (sellerId: string) => {
    const response = await apiClient.get(`/api/v1/dashboard/sellers/${sellerId}/detail`)
    return response.data
  }
}

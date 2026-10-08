import apiClient from './client'
import type { DashboardOverview, Conversation, Seller, ConversationView, FingerprintData, CoachingItem, SellerDay } from '@/types'

export const dashboardApi = {
  getOverview: async (params: {
    period?: number
    store_id?: string
  }) => {
    // Backend expects date_from/date_to, not period
    const days = params.period || 30
    const dateTo = new Date()
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)
    const apiParams: Record<string, string> = {
      date_from: dateFrom.toISOString().split('T')[0],
      date_to: dateTo.toISOString().split('T')[0],
    }
    if (params.store_id) apiParams.store_id = params.store_id
    const response = await apiClient.get<DashboardOverview>('/api/v1/dashboard/overview', { params: apiParams })
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
    period?: number
    date_from?: string
    date_to?: string
    direction?: string
    source?: string
    client_phone?: string
    group_by_phone?: boolean
    view?: ConversationView
    q?: string
    with_counts?: boolean
  }) => {
    const apiParams: Record<string, any> = { ...params }
    if (params.period && !params.date_from && !params.date_to) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - params.period)
      apiParams.date_from = from.toISOString().split('T')[0]
      apiParams.date_to = to.toISOString().split('T')[0]
    }
    delete apiParams.period
    // Бэкенд принимает offset, а не page — конвертируем, иначе всегда возвращается 1-я страница.
    const limit = params.limit || 20
    apiParams.limit = limit
    apiParams.offset = Math.max(0, ((params.page || 1) - 1) * limit)
    delete apiParams.page
    if (!apiParams.q) delete apiParams.q
    if (!apiParams.view) delete apiParams.view
    const response = await apiClient.get<{
      items: Conversation[]
      total: number
      view_counts?: Record<'total' | ConversationView, number>
    }>('/api/v1/dashboard/conversations', { params: apiParams })
    return response.data
  },

  /** «Отпечатки» разговоров для списка — одним запросом на страницу. */
  getFingerprints: async (ids: string[]) => {
    if (!ids.length) return {} as Record<string, FingerprintData>
    const response = await apiClient.get<{ items: Record<string, FingerprintData> }>(
      '/api/v1/dashboard/conversations/fingerprints',
      { params: { ids: ids.join(',') } },
    )
    return response.data.items
  },

  getConversationDetail: async (conversationId: string) => {
    const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}`)
    return response.data
  },

  // История обращений с того же номера клиента (группировка звонков по номеру)
  getClientHistory: async (conversationId: string) => {
    const response = await apiClient.get<{
      client_phone: string | null
      items: Array<{
        id: string
        session_date: string
        analyzed_at: string | null
        overall_score: number | null
        outcome: string | null
        topic: string | null
        is_scorable: boolean | null
        call_category: string | null
        has_upsell: boolean | null
        has_crosssell: boolean | null
        duration_seconds: number | null
        call_direction: string | null
        seller_name: string | null
        store_name: string | null
        is_current: boolean
      }>
      total: number
    }>(`/api/v1/dashboard/conversations/${conversationId}/history`)
    return response.data
  },

  /** «День продавца»: разговоры продавца за ту же дату, бейдж и запись смены. */
  getSellerDay: async (conversationId: string) => {
    const response = await apiClient.get<SellerDay>(`/api/v1/dashboard/conversations/${conversationId}/day`)
    return response.data
  },

  /** План разбора с продавцом и комментарии руководителя к разговору. */
  getCoaching: async (conversationId: string) => {
    const response = await apiClient.get<{ items: CoachingItem[] }>(`/api/v1/dashboard/conversations/${conversationId}/coaching`)
    return response.data.items
  },

  addCoaching: async (conversationId: string, body: { comment?: string; moment_seconds?: number | null } = {}) => {
    const response = await apiClient.post<CoachingItem>(`/api/v1/dashboard/conversations/${conversationId}/coaching`, body)
    return response.data
  },

  setCoachingStatus: async (itemId: string, status: 'open' | 'done') => {
    const response = await apiClient.patch<CoachingItem>(`/api/v1/dashboard/coaching/${itemId}`, { status })
    return response.data
  },

  deleteCoaching: async (itemId: string) => {
    await apiClient.delete(`/api/v1/dashboard/coaching/${itemId}`)
  },

  listCoaching: async (params: { seller_id?: string; status?: 'open' | 'done'; limit?: number } = {}) => {
    const response = await apiClient.get<{ items: CoachingItem[] }>('/api/v1/dashboard/coaching', { params })
    return response.data.items
  },

  getSellers: async (params?: { store_id?: string; period?: number; date_from?: string; date_to?: string }) => {
    const apiParams: Record<string, string> = {}
    if (params?.store_id) apiParams.store_id = params.store_id
    if (params?.date_from) apiParams.date_from = params.date_from
    if (params?.date_to) apiParams.date_to = params.date_to
    if (params?.period && !params.date_from && !params.date_to) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - params.period)
      apiParams.date_from = from.toISOString().split('T')[0]
      apiParams.date_to = to.toISOString().split('T')[0]
    }
    const response = await apiClient.get<{items: any[], total: number}>('/api/v1/dashboard/sellers', { params: apiParams })
    return (response.data.items || []).map((s: any) => ({
      id: s.seller_id,
      first_name: s.first_name || '',
      last_name: s.last_name || '',
      store_id: s.store_id || '',
      store_name: s.store_name || '',
      is_active: true,
      avg_score: s.avg_score,
      conversion_rate: s.conversion_rate,
      conversations_count: s.total_conversations,
      weakest_step: s.weakest_step,
      score_trend: s.score_trend
    })) as Seller[]
  },

  getSellerDetail: async (sellerId: string, params?: { period?: number; date_from?: string; date_to?: string }) => {
    const apiParams: Record<string, string> = {}
    if (params?.date_from) apiParams.date_from = params.date_from
    if (params?.date_to) apiParams.date_to = params.date_to
    if (params?.period && !params.date_from && !params.date_to) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - params.period)
      apiParams.date_from = from.toISOString().split('T')[0]
      apiParams.date_to = to.toISOString().split('T')[0]
    }
    const response = await apiClient.get(`/api/v1/dashboard/sellers/${sellerId}/detail`, { params: apiParams })
    return response.data
  }
}

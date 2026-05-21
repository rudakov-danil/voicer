import apiClient from './client'

export interface DashboardNotification {
  conversation_id: string
  session_date: string
  overall_score: number | null
  outcome?: string | null
  topic?: string | null
  seller_name?: string | null
  store_name?: string | null
  compliance_violations_count: number
  below_threshold: boolean
  severity: 'high' | 'medium' | 'low'
  reasons: string[]
}

export interface NotificationsResponse {
  items: DashboardNotification[]
  total: number
  score_threshold: number
  period_days: number
}

export const notificationsApi = {
  list: async (params: { limit?: number; days?: number; store_id?: string } = {}): Promise<DashboardNotification[]> => {
    const res = await apiClient.get<NotificationsResponse>('/api/v1/dashboard/notifications', { params })
    return res.data.items
  },

  listFull: async (params: { limit?: number; days?: number; store_id?: string } = {}): Promise<NotificationsResponse> => {
    const res = await apiClient.get<NotificationsResponse>('/api/v1/dashboard/notifications', { params })
    return res.data
  },
}

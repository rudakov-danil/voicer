import apiClient from './client'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  user: {
    id: string
    email: string
    role: string
    first_name: string
    last_name: string
    organization_id: string
    store_id: string | null
  }
}

export interface OrganizationInfo {
  id: string
  name: string
  slug: string
  org_type: 'retail' | 'telephony'
  /** Отрасль: coffee | electronics | clothing | cosmetics | furniture | telecom | generic; null — не задана */
  industry?: string | null
  /** Валюта цен (RUB, KZT, …); null — рубли */
  currency?: string | null
  /** Часовой пояс сети для графиков по часам (Asia/Almaty); null — Москва */
  timezone?: string | null
}

export const authApi = {
  login: async (data: LoginRequest) => {
    const response = await apiClient.post<LoginResponse>('/api/v1/auth/login', data)
    return response.data
  },

  refresh: async (refreshToken: string) => {
    const response = await apiClient.post<LoginResponse>('/api/v1/auth/refresh', {
      refresh_token: refreshToken
    })
    return response.data
  },

  getOrganization: async () => {
    const response = await apiClient.get<OrganizationInfo>('/api/v1/auth/organization')
    return response.data
  },

  updateOrganization: async (data: { org_type?: 'retail' | 'telephony'; industry?: string | null; currency?: string | null; timezone?: string | null }) => {
    const response = await apiClient.patch('/api/v1/auth/organization', data)
    return response.data
  }
}

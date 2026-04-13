import apiClient from './client'
import type { Store, Seller, Device, User } from '@/types'

interface PaginatedResponse<T> { items: T[]; total: number }

export const adminApi = {
  // Stores
  getStores: async () => {
    const response = await apiClient.get<PaginatedResponse<Store & { seller_count?: number; device_count?: number }>>('/api/v1/admin/stores')
    return response.data
  },

  createStore: async (data: { name: string; address?: string }) => {
    const response = await apiClient.post<Store>('/api/v1/admin/stores', data)
    return response.data
  },

  updateStore: async (id: string, data: Partial<{ name: string; address: string; is_active: boolean }>) => {
    const response = await apiClient.patch<Store>(`/api/v1/admin/stores/${id}`, data)
    return response.data
  },

  // Sellers
  getSellers: async (params?: { store_id?: string }) => {
    const response = await apiClient.get<PaginatedResponse<Seller & { store_name?: string }>>('/api/v1/admin/sellers', { params })
    return response.data
  },

  createSeller: async (data: { store_id: string; first_name: string; last_name: string }) => {
    const response = await apiClient.post<Seller>('/api/v1/admin/sellers', data)
    return response.data
  },

  updateSeller: async (id: string, data: Partial<{ first_name: string; last_name: string; is_active: boolean }>) => {
    const response = await apiClient.patch<Seller>(`/api/v1/admin/sellers/${id}`, data)
    return response.data
  },

  // Devices
  getDevices: async (params?: { store_id?: string }) => {
    const response = await apiClient.get<PaginatedResponse<Device>>('/api/v1/admin/devices', { params })
    return response.data
  },

  createDevice: async (data: { store_id: string; seller_id?: string; serial_number: string; model: string }) => {
    const response = await apiClient.post<Device>('/api/v1/admin/devices', data)
    return response.data
  },

  updateDevice: async (id: string, data: Partial<{ seller_id?: string; store_id?: string; is_active: boolean }>) => {
    const response = await apiClient.patch<Device>(`/api/v1/admin/devices/${id}`, data)
    return response.data
  },

  // Users
  getUsers: async () => {
    const response = await apiClient.get<PaginatedResponse<User & { is_active: boolean; created_at: string }>>('/api/v1/auth/users')
    return response.data
  },

  createUser: async (data: { email: string; password: string; role: string; first_name: string; last_name: string; store_id?: string }) => {
    const response = await apiClient.post<User>('/api/v1/auth/users', data)
    return response.data
  },

  updateUser: async (id: string, data: Partial<User & { is_active: boolean }>) => {
    const response = await apiClient.patch<User>(`/api/v1/auth/users/${id}`, data)
    return response.data
  },

  // Privacy Settings
  getPrivacySettings: async () => {
    const response = await apiClient.get('/api/v1/admin/settings/privacy')
    return response.data
  },

  updatePrivacySettings: async (data: { retention_days: number; anonymize_transcripts: boolean; consent_required: boolean }) => {
    const response = await apiClient.put('/api/v1/admin/settings/privacy', data)
    return response.data
  },

  // Alert Settings
  getAlertSettings: async () => {
    const response = await apiClient.get('/api/v1/admin/settings/alerts')
    return response.data
  },

  updateAlertSettings: async (data: { score_threshold: number; no_activity_hours: number; email_recipients: string[]; is_active: boolean }) => {
    const response = await apiClient.put('/api/v1/admin/settings/alerts', data)
    return response.data
  },
}

import apiClient from './client'
import type { Store, Seller } from '@/types'

export const adminApi = {
  getStores: async () => {
    const response = await apiClient.get<Store[]>('/api/v1/admin/stores')
    return response.data
  },

  createStore: async (data: Omit<Store, 'id'>) => {
    const response = await apiClient.post<Store>('/api/v1/admin/stores', data)
    return response.data
  },

  updateStore: async (id: string, data: Partial<Store>) => {
    const response = await apiClient.patch<Store>(`/api/v1/admin/stores/${id}`, data)
    return response.data
  },

  getSellers: async () => {
    const response = await apiClient.get<Seller[]>('/api/v1/admin/sellers')
    return response.data
  },

  createSeller: async (data: Omit<Seller, 'id'>) => {
    const response = await apiClient.post<Seller>('/api/v1/admin/sellers', data)
    return response.data
  },

  updateSeller: async (id: string, data: Partial<Seller>) => {
    const response = await apiClient.patch<Seller>(`/api/v1/admin/sellers/${id}`, data)
    return response.data
  },

  getDevices: async () => {
    const response = await apiClient.get('/api/v1/admin/devices')
    return response.data
  }
}

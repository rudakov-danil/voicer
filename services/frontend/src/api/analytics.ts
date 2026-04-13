import apiClient from './client'
import type {
  ObjectionDistribution,
  ObjectionCorrelation,
  ConversionFunnel,
  ConversionByStore,
  SentimentData,
  SentimentTrend,
  CompetitorMention,
  TopicTrend,
  UnmetDemand,
  ProductFeedback,
} from '@/types'

export const analyticsApi = {
  getObjectionsDistribution: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ObjectionDistribution[]>(
      '/api/v1/dashboard/objections/distribution',
      { params }
    )
    return response.data
  },

  getObjectionsCorrelation: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ObjectionCorrelation[]>(
      '/api/v1/dashboard/objections/techniques',
      { params }
    )
    return response.data
  },

  getConversionFunnel: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ConversionFunnel[]>(
      '/api/v1/dashboard/conversion/funnel',
      { params }
    )
    return response.data
  },

  getConversionByStore: async (params?: { period?: number }) => {
    const response = await apiClient.get<ConversionByStore[]>(
      '/api/v1/dashboard/conversion/by-store',
      { params }
    )
    return response.data
  },

  getSentiment: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<SentimentData>(
      '/api/v1/dashboard/sentiment',
      { params }
    )
    return response.data
  },

  getSentimentTrend: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<SentimentTrend[]>(
      '/api/v1/dashboard/sentiment/trend',
      { params }
    )
    return response.data
  },

  getCompetitors: async (params?: { period?: number }) => {
    const response = await apiClient.get<CompetitorMention[]>(
      '/api/v1/dashboard/intelligence/competitors',
      { params }
    )
    return response.data
  },

  getTopicTrends: async (params?: { period?: number }) => {
    const response = await apiClient.get<TopicTrend[]>(
      '/api/v1/dashboard/intelligence/topics',
      { params }
    )
    return response.data
  },

  getUnmetDemand: async (params?: { period?: number }) => {
    const response = await apiClient.get<UnmetDemand[]>(
      '/api/v1/dashboard/intelligence/unmet-demand',
      { params }
    )
    return response.data
  },

  getProductFeedback: async (params?: { period?: number }) => {
    const response = await apiClient.get<ProductFeedback[]>(
      '/api/v1/dashboard/intelligence/product-feedback',
      { params }
    )
    return response.data
  },
}

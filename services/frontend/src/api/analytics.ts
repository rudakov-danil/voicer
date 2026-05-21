import apiClient from './client'
import type {
  ObjectionDistribution,
  ObjectionResolution,
  ObjectionImpact,
  ConversionFunnel,
  ConversionByStore,
  ConversionBySeller,
  OutcomeDistribution,
  ObjectionHandlingImpact,
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

  getObjectionsResolution: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ObjectionResolution[]>(
      '/api/v1/dashboard/objections/resolution',
      { params }
    )
    return response.data
  },

  getObjectionsImpact: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ObjectionImpact>(
      '/api/v1/dashboard/objections/impact',
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

  getConversionBySeller: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ConversionBySeller[]>(
      '/api/v1/dashboard/conversion/by-seller',
      { params }
    )
    return response.data
  },

  getConversionOutcomes: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<OutcomeDistribution[]>(
      '/api/v1/dashboard/conversion/outcomes',
      { params }
    )
    return response.data
  },

  getObjectionHandlingImpact: async (params?: { period?: number; store_id?: string }) => {
    const response = await apiClient.get<ObjectionHandlingImpact>(
      '/api/v1/dashboard/conversion/objection-handling-impact',
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

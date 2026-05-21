import apiClient from './client';
export const analyticsApi = {
    getObjectionsDistribution: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/objections/distribution', { params });
        return response.data;
    },
    getObjectionsResolution: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/objections/resolution', { params });
        return response.data;
    },
    getObjectionsImpact: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/objections/impact', { params });
        return response.data;
    },
    getConversionFunnel: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/conversion/funnel', { params });
        return response.data;
    },
    getConversionByStore: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/conversion/by-store', { params });
        return response.data;
    },
    getConversionBySeller: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/conversion/by-seller', { params });
        return response.data;
    },
    getConversionOutcomes: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/conversion/outcomes', { params });
        return response.data;
    },
    getObjectionHandlingImpact: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/conversion/objection-handling-impact', { params });
        return response.data;
    },
    getSentiment: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/sentiment', { params });
        return response.data;
    },
    getSentimentTrend: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/sentiment/trend', { params });
        return response.data;
    },
    getCompetitors: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/intelligence/competitors', { params });
        return response.data;
    },
    getTopicTrends: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/intelligence/topics', { params });
        return response.data;
    },
    getUnmetDemand: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/intelligence/unmet-demand', { params });
        return response.data;
    },
    getProductFeedback: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/intelligence/product-feedback', { params });
        return response.data;
    },
};

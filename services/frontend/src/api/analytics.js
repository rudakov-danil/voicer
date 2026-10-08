import apiClient from './client';
export const analyticsApi = {
    // Резюме диалога от LLM. Первый вызов генерирует и кэширует, далее возвращает кэш.
    // force=true — перегенерировать. Идёт напрямую в analytics-engine.
    getConversationSummary: async (conversationId, force = false) => {
        const response = await apiClient.post(`/api/v1/analytics/conversations/${conversationId}/summary${force ? '?force=true' : ''}`, undefined, 
        // Генерация через внешний LLM бывает долгой — даём запас, чтобы браузер не
        // оборвал запрос раньше бэкенда (иначе ошибка при уже идущей генерации).
        { timeout: 180000 });
        return response.data;
    },
    // Полное удаление диалога (разговор + транскрипт + запись)
    deleteConversation: async (conversationId) => {
        const response = await apiClient.delete(`/api/v1/analytics/conversations/${conversationId}`);
        return response.data;
    },
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

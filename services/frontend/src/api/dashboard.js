import apiClient from './client';
export const dashboardApi = {
    getOverview: async (params) => {
        // Backend expects date_from/date_to, not period
        const days = params.period || 30;
        const dateTo = new Date();
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - days);
        const apiParams = {
            date_from: dateFrom.toISOString().split('T')[0],
            date_to: dateTo.toISOString().split('T')[0],
        };
        if (params.store_id)
            apiParams.store_id = params.store_id;
        const response = await apiClient.get('/api/v1/dashboard/overview', { params: apiParams });
        return response.data;
    },
    getConversations: async (params) => {
        const apiParams = { ...params };
        if (params.period && !params.date_from && !params.date_to) {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - params.period);
            apiParams.date_from = from.toISOString().split('T')[0];
            apiParams.date_to = to.toISOString().split('T')[0];
        }
        delete apiParams.period;
        const response = await apiClient.get('/api/v1/dashboard/conversations', { params: apiParams });
        return response.data;
    },
    getConversationDetail: async (conversationId) => {
        const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}`);
        return response.data;
    },
    getSellers: async (params) => {
        const apiParams = {};
        if (params?.store_id)
            apiParams.store_id = params.store_id;
        if (params?.date_from)
            apiParams.date_from = params.date_from;
        if (params?.date_to)
            apiParams.date_to = params.date_to;
        if (params?.period && !params.date_from && !params.date_to) {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - params.period);
            apiParams.date_from = from.toISOString().split('T')[0];
            apiParams.date_to = to.toISOString().split('T')[0];
        }
        const response = await apiClient.get('/api/v1/dashboard/sellers', { params: apiParams });
        return (response.data.items || []).map((s) => ({
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
        }));
    },
    getSellerDetail: async (sellerId, params) => {
        const apiParams = {};
        if (params?.date_from)
            apiParams.date_from = params.date_from;
        if (params?.date_to)
            apiParams.date_to = params.date_to;
        if (params?.period && !params.date_from && !params.date_to) {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - params.period);
            apiParams.date_from = from.toISOString().split('T')[0];
            apiParams.date_to = to.toISOString().split('T')[0];
        }
        const response = await apiClient.get(`/api/v1/dashboard/sellers/${sellerId}/detail`, { params: apiParams });
        return response.data;
    }
};

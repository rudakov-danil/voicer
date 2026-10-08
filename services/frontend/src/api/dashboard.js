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
        // Бэкенд принимает offset, а не page — конвертируем, иначе всегда возвращается 1-я страница.
        const limit = params.limit || 20;
        apiParams.limit = limit;
        apiParams.offset = Math.max(0, ((params.page || 1) - 1) * limit);
        delete apiParams.page;
        if (!apiParams.q)
            delete apiParams.q;
        if (!apiParams.view)
            delete apiParams.view;
        const response = await apiClient.get('/api/v1/dashboard/conversations', { params: apiParams });
        return response.data;
    },
    /** «Отпечатки» разговоров для списка — одним запросом на страницу. */
    getFingerprints: async (ids) => {
        if (!ids.length)
            return {};
        const response = await apiClient.get('/api/v1/dashboard/conversations/fingerprints', { params: { ids: ids.join(',') } });
        return response.data.items;
    },
    getConversationDetail: async (conversationId) => {
        const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}`);
        return response.data;
    },
    // История обращений с того же номера клиента (группировка звонков по номеру)
    getClientHistory: async (conversationId) => {
        const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}/history`);
        return response.data;
    },
    /** «День продавца»: разговоры продавца за ту же дату, бейдж и запись смены. */
    getSellerDay: async (conversationId) => {
        const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}/day`);
        return response.data;
    },
    /** План разбора с продавцом и комментарии руководителя к разговору. */
    getCoaching: async (conversationId) => {
        const response = await apiClient.get(`/api/v1/dashboard/conversations/${conversationId}/coaching`);
        return response.data.items;
    },
    addCoaching: async (conversationId, body = {}) => {
        const response = await apiClient.post(`/api/v1/dashboard/conversations/${conversationId}/coaching`, body);
        return response.data;
    },
    setCoachingStatus: async (itemId, status) => {
        const response = await apiClient.patch(`/api/v1/dashboard/coaching/${itemId}`, { status });
        return response.data;
    },
    deleteCoaching: async (itemId) => {
        await apiClient.delete(`/api/v1/dashboard/coaching/${itemId}`);
    },
    listCoaching: async (params = {}) => {
        const response = await apiClient.get('/api/v1/dashboard/coaching', { params });
        return response.data.items;
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

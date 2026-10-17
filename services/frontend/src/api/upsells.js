import apiClient from './client';
export const upsellsApi = {
    getShift: async (sellerId, day) => {
        const response = await apiClient.get(`/api/v1/dashboard/sellers/${sellerId}/shift`, { params: { day } });
        return response.data;
    },
    getOverview: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/upsell/overview', { params });
        return response.data;
    },
    getPlans: async () => {
        const response = await apiClient.get('/api/v1/dashboard/upsell/plans');
        return response.data;
    },
    savePlan: async (data) => {
        const response = await apiClient.put('/api/v1/dashboard/upsell/plans', data);
        return response.data;
    },
    deletePlan: async (id) => {
        await apiClient.delete(`/api/v1/dashboard/upsell/plans/${id}`);
    },
    /** Советы по разговорам (LLM). Сервер кэширует их на день и пересчитывает только при новых разговорах. */
    getTips: async (sellerId, day) => {
        const response = await apiClient.post(`/api/v1/analytics/sellers/${sellerId}/tips`, null, { params: { day, audience: "manager" }, timeout: 120000 });
        return response.data;
    },
};
export const verticalsApi = {
    list: async () => {
        const response = await apiClient.get('/api/v1/scripts/verticals');
        return response.data.items;
    },
    install: async (code) => {
        const response = await apiClient.post(`/api/v1/scripts/verticals/${code}/install`, { activate_script: true, set_industry: true });
        return response.data;
    },
};

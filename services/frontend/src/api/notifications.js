import apiClient from './client';
export const notificationsApi = {
    list: async (params = {}) => {
        const res = await apiClient.get('/api/v1/dashboard/notifications', { params });
        return res.data.items;
    },
    listFull: async (params = {}) => {
        const res = await apiClient.get('/api/v1/dashboard/notifications', { params });
        return res.data;
    },
};

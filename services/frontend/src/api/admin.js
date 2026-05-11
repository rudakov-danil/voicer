import apiClient from './client';
export const adminApi = {
    // Stores
    getStores: async () => {
        const response = await apiClient.get('/api/v1/admin/stores');
        return response.data;
    },
    createStore: async (data) => {
        const response = await apiClient.post('/api/v1/admin/stores', data);
        return response.data;
    },
    updateStore: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/admin/stores/${id}`, data);
        return response.data;
    },
    // Sellers
    getSellers: async (params) => {
        const response = await apiClient.get('/api/v1/admin/sellers', { params });
        return response.data;
    },
    createSeller: async (data) => {
        const response = await apiClient.post('/api/v1/admin/sellers', data);
        return response.data;
    },
    updateSeller: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/admin/sellers/${id}`, data);
        return response.data;
    },
    // Devices
    getDevices: async (params) => {
        const response = await apiClient.get('/api/v1/admin/devices', { params });
        return response.data;
    },
    createDevice: async (data) => {
        const response = await apiClient.post('/api/v1/admin/devices', data);
        return response.data;
    },
    updateDevice: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/admin/devices/${id}`, data);
        return response.data;
    },
    // Users
    getUsers: async () => {
        const response = await apiClient.get('/api/v1/auth/users');
        return response.data;
    },
    createUser: async (data) => {
        const response = await apiClient.post('/api/v1/auth/users', data);
        return response.data;
    },
    updateUser: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/auth/users/${id}`, data);
        return response.data;
    },
    // Privacy Settings
    getPrivacySettings: async () => {
        const response = await apiClient.get('/api/v1/admin/settings/privacy');
        return response.data;
    },
    updatePrivacySettings: async (data) => {
        const response = await apiClient.put('/api/v1/admin/settings/privacy', data);
        return response.data;
    },
    // Alert Settings
    getAlertSettings: async () => {
        const response = await apiClient.get('/api/v1/admin/settings/alerts');
        return response.data;
    },
    updateAlertSettings: async (data) => {
        const response = await apiClient.put('/api/v1/admin/settings/alerts', data);
        return response.data;
    },
};

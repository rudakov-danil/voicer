import apiClient from './client';
export const authApi = {
    login: async (data) => {
        const response = await apiClient.post('/api/v1/auth/login', data);
        return response.data;
    },
    refresh: async (refreshToken) => {
        const response = await apiClient.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken
        });
        return response.data;
    },
    getOrganization: async () => {
        const response = await apiClient.get('/api/v1/auth/organization');
        return response.data;
    },
    updateOrganization: async (data) => {
        const response = await apiClient.patch('/api/v1/auth/organization', data);
        return response.data;
    }
};

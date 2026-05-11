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
    }
};

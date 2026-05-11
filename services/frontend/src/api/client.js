import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
});
apiClient.interceptors.request.use((config) => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});
apiClient.interceptors.response.use((response) => response, async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        try {
            const refreshToken = useAuthStore.getState().refreshToken;
            const resp = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/refresh`, {
                refresh_token: refreshToken
            });
            const { access_token, refresh_token } = resp.data;
            useAuthStore.getState().setTokens(access_token, refresh_token);
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            return apiClient(originalRequest);
        }
        catch {
            useAuthStore.getState().logout();
            window.location.href = '/login';
        }
    }
    return Promise.reject(error);
});
export default apiClient;

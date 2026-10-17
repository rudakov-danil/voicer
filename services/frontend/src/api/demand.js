import apiClient from './client';
export const demandApi = {
    get: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/demand', { params });
        return response.data;
    },
    save: async (data) => {
        const response = await apiClient.put('/api/v1/dashboard/demand/items', data);
        return response.data;
    },
    /** CSV для Excel: скачивается файлом */
    download: async (params) => {
        const response = await apiClient.get('/api/v1/dashboard/demand/export', { params, responseType: 'blob' });
        const name = /filename="([^"]+)"/.exec(String(response.headers['content-disposition'] || ''))?.[1] || 'spros.csv';
        const url = URL.createObjectURL(response.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
};

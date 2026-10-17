import apiClient from './client';
const BASE = '/api/v1/dashboard/clinic';
export const clinicApi = {
    overview: async (params) => (await apiClient.get(`${BASE}/overview`, { params })).data,
    visits: async (params) => (await apiClient.get(`${BASE}/visits`, { params })).data,
    visit: async (id) => (await apiClient.get(`${BASE}/visits/${id}`)).data,
    doctor: async (id, params) => (await apiClient.get(`${BASE}/doctors/${id}`, { params })).data,
    setSpecialty: async (id, specialty) => (await apiClient.put(`${BASE}/doctors/${id}`, { specialty })).data,
    rules: async () => (await apiClient.get(`${BASE}/rules`)).data,
    saveRules: async (items) => (await apiClient.put(`${BASE}/rules`, { items })).data,
    // Приложение врача: одноразовая ссылка подключения (тот же механизм, что у сотрудников кофеен)
    invite: async (seller_id) => (await apiClient.post('/api/v1/auth/mobile/invitations', { seller_id })).data,
    revoke: async (seller_id) => { await apiClient.delete(`/api/v1/auth/mobile/accounts/${seller_id}`); },
};

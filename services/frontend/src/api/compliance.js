import apiClient from './client';
export const complianceApi = {
    listRules: async () => {
        const res = await apiClient.get('/api/v1/scripts/compliance-rules');
        return res.data.items;
    },
    createRule: async (data) => {
        const res = await apiClient.post('/api/v1/scripts/compliance-rules', data);
        return res.data;
    },
    patchRule: async (id, data) => {
        const res = await apiClient.patch(`/api/v1/scripts/compliance-rules/${id}`, data);
        return res.data;
    },
    deleteRule: async (id) => {
        await apiClient.delete(`/api/v1/scripts/compliance-rules/${id}`);
    },
    getSummary: async (params = {}) => {
        const apiParams = { ...params };
        if (params.period && !params.date_from && !params.date_to) {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - params.period);
            apiParams.date_from = from.toISOString().split('T')[0];
            apiParams.date_to = to.toISOString().split('T')[0];
        }
        delete apiParams.period;
        const res = await apiClient.get('/api/v1/dashboard/compliance/summary', { params: apiParams });
        return res.data;
    },
    getScriptIssuesSummary: async (params = {}) => {
        const apiParams = { ...params };
        if (params.period && !params.date_from && !params.date_to) {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - params.period);
            apiParams.date_from = from.toISOString().split('T')[0];
            apiParams.date_to = to.toISOString().split('T')[0];
        }
        delete apiParams.period;
        const res = await apiClient.get('/api/v1/dashboard/compliance/script-issues-summary', { params: apiParams });
        return res.data;
    },
};

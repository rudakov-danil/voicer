import apiClient from './client';
export const scriptsApi = {
    getTemplates: async () => {
        const response = await apiClient.get('/api/v1/scripts/templates');
        return response.data.items;
    },
    getTemplate: async (id) => {
        const response = await apiClient.get(`/api/v1/scripts/templates/${id}`);
        const d = response.data;
        return {
            id: d.id,
            name: d.name,
            description: d.description,
            is_active: d.is_active,
            steps: (d.steps || []).map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                weight: s.weight,
                order: s.step_order,
                is_required: s.is_required,
                recommendation_text: s.recommendation_text,
            })),
        };
    },
    createTemplate: async (data) => {
        const response = await apiClient.post('/api/v1/scripts/templates', data);
        return response.data;
    },
    updateTemplate: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/scripts/templates/${id}`, data);
        return response.data;
    }
};

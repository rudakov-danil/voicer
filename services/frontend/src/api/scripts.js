import apiClient from './client';
function normalizeStep(s) {
    return {
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        weight: typeof s.weight === 'number' ? s.weight : Number(s.weight),
        order: s.step_order ?? s.order,
        is_required: !!s.is_required,
        recommendation_text: s.recommendation_text ?? null,
        example_phrases: Array.isArray(s.example_phrases) ? s.example_phrases : [],
    };
}
function normalizeTemplate(d) {
    return {
        id: d.id,
        name: d.name,
        description: d.description ?? null,
        scope: d.scope,
        context_description: d.context_description ?? null,
        is_active: !!d.is_active,
        steps: (d.steps || []).map(normalizeStep).sort((a, b) => a.order - b.order),
        assigned_sellers: d.assigned_sellers || [],
        assigned_stores: d.assigned_stores || [],
    };
}
// Сервер ожидает step_order вместо order
function stepsForServer(steps) {
    return steps.map((s, i) => ({
        name: s.name,
        description: s.description || null,
        weight: s.weight,
        is_required: s.is_required,
        step_order: i + 1,
        recommendation_text: s.recommendation_text || null,
        example_phrases: s.example_phrases || [],
    }));
}
export const scriptsApi = {
    getTemplates: async () => {
        const response = await apiClient.get('/api/v1/scripts/templates');
        return (response.data.items || []).map(normalizeTemplate);
    },
    getTemplate: async (id) => {
        const response = await apiClient.get(`/api/v1/scripts/templates/${id}`);
        return normalizeTemplate(response.data);
    },
    createTemplate: async (data) => {
        const body = {
            name: data.name,
            description: data.description ?? null,
            scope: data.scope || 'org_level',
            context_description: data.context_description ?? null,
            steps: stepsForServer(data.steps),
        };
        const response = await apiClient.post('/api/v1/scripts/templates', body);
        return normalizeTemplate(response.data);
    },
    // Полная замена шаблона (PUT) — для редактора, который шлёт весь объект
    replaceTemplate: async (id, data) => {
        const body = {
            name: data.name,
            description: data.description ?? null,
            scope: data.scope || 'org_level',
            context_description: data.context_description ?? null,
            steps: stepsForServer(data.steps),
        };
        const response = await apiClient.put(`/api/v1/scripts/templates/${id}`, body);
        return normalizeTemplate(response.data);
    },
    patchTemplate: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/scripts/templates/${id}`, data);
        return normalizeTemplate(response.data);
    },
    // --- Назначения на магазины ---
    listStoreAssignments: async (params = {}) => {
        const response = await apiClient.get('/api/v1/scripts/store-assignments', { params });
        return response.data.items;
    },
    assignToStore: async (data) => {
        const response = await apiClient.post('/api/v1/scripts/store-assignments', {
            store_id: data.store_id,
            template_id: data.template_id,
            is_mandatory: !!data.is_mandatory,
        });
        return response.data;
    },
    removeStoreAssignment: async (assignment_id) => {
        await apiClient.delete(`/api/v1/scripts/store-assignments/${assignment_id}`);
    },
    // --- Назначения на продавцов (оставляем существующую API) ---
    assignToSeller: async (data) => {
        const response = await apiClient.post('/api/v1/scripts/assignments', {
            seller_id: data.seller_id,
            template_id: data.template_id,
            is_mandatory: !!data.is_mandatory,
        });
        return response.data;
    },
    removeSellerAssignment: async (assignment_id) => {
        await apiClient.delete(`/api/v1/scripts/assignments/${assignment_id}`);
    },
    listSellerAssignments: async (params = {}) => {
        const response = await apiClient.get('/api/v1/scripts/assignments', { params });
        return response.data.items;
    },
    // --- Upsell rules ---
    listUpsellRules: async (params = {}) => {
        const response = await apiClient.get('/api/v1/scripts/upsell-rules', { params });
        return response.data.items;
    },
    createUpsellRule: async (data) => {
        const response = await apiClient.post('/api/v1/scripts/upsell-rules', {
            store_id: data.store_id ?? null,
            trigger_product: data.trigger_product,
            required_offers: data.required_offers,
            is_active: data.is_active ?? true,
        });
        return response.data;
    },
    patchUpsellRule: async (id, data) => {
        const response = await apiClient.patch(`/api/v1/scripts/upsell-rules/${id}`, data);
        return response.data;
    },
    deleteUpsellRule: async (id) => {
        await apiClient.delete(`/api/v1/scripts/upsell-rules/${id}`);
    },
    // --- Library ---
    listLibrary: async () => {
        const response = await apiClient.get('/api/v1/scripts/library');
        return response.data.items;
    },
    getLibraryPreset: async (preset_id) => {
        const response = await apiClient.get(`/api/v1/scripts/library/${preset_id}`);
        return response.data;
    },
    createFromPreset: async (preset_id) => {
        const response = await apiClient.post(`/api/v1/scripts/library/${preset_id}/create`);
        return normalizeTemplateRaw(response.data);
    },
    generateWithAi: async (data) => {
        const response = await apiClient.post('/api/v1/scripts/library/generate', data);
        // Возвращает черновик (без id, не сохранён): { name, description, steps: [...] }
        return {
            name: response.data.name,
            description: response.data.description ?? null,
            steps: (response.data.steps || []).map((s, i) => ({
                name: s.name,
                description: s.description ?? null,
                weight: Number(s.weight),
                order: s.step_order ?? i + 1,
                is_required: !!s.is_required,
                recommendation_text: s.recommendation_text ?? null,
                example_phrases: s.example_phrases || [],
            })),
        };
    },
    // --- Versions ---
    listVersions: async (template_id) => {
        const response = await apiClient.get(`/api/v1/scripts/templates/${template_id}/versions`);
        return response.data.items;
    },
    getVersion: async (template_id, version_number) => {
        const response = await apiClient.get(`/api/v1/scripts/templates/${template_id}/versions/${version_number}`);
        return response.data;
    },
    restoreVersion: async (template_id, version_number) => {
        const response = await apiClient.post(`/api/v1/scripts/templates/${template_id}/versions/${version_number}/restore`);
        return normalizeTemplateRaw(response.data);
    },
    // --- Step analytics ---
    getTemplateAnalytics: async (template_id, params = {}) => {
        const response = await apiClient.get(`/api/v1/scripts/templates/${template_id}/analytics`, { params });
        return response.data;
    },
    compareVersions: async (template_id, version_a, version_b, days = 30) => {
        const response = await apiClient.get(`/api/v1/scripts/templates/${template_id}/compare`, {
            params: { version_a, version_b, days },
        });
        return response.data;
    },
    // --- Live test ---
    testScript: async (data) => {
        const response = await apiClient.post('/api/v1/scripts/test', {
            recording_id: data.recording_id,
            name: data.name,
            steps: data.steps.map((s, i) => ({
                id: s.id || null,
                name: s.name,
                description: s.description ?? null,
                weight: s.weight,
                is_required: s.is_required,
                step_order: i + 1,
                example_phrases: s.example_phrases || [],
            })),
        });
        return response.data;
    },
};
function normalizeTemplateRaw(d) {
    return {
        id: d.id,
        name: d.name,
        description: d.description ?? null,
        scope: d.scope,
        context_description: d.context_description ?? null,
        is_active: !!d.is_active,
        steps: (d.steps || []).map((s, i) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? null,
            weight: typeof s.weight === 'number' ? s.weight : Number(s.weight),
            order: s.step_order ?? i + 1,
            is_required: !!s.is_required,
            recommendation_text: s.recommendation_text ?? null,
            example_phrases: s.example_phrases || [],
        })),
        assigned_sellers: d.assigned_sellers || [],
        assigned_stores: d.assigned_stores || [],
    };
}

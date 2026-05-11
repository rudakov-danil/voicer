import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi } from '@/api/scripts';
import { useState, useEffect } from 'react';
import { CheckSquare, Plus } from 'lucide-react';
const UPSELL_RULES = [
    { product: 'Смартфон', upsell: 'Расширенная гарантия, чехол, защитное стекло', active: true },
    { product: 'Ноутбук', upsell: 'Расширенная гарантия, сумка, мышь', active: true },
    { product: 'Телевизор', upsell: 'Кронштейн, HDMI-кабель, саундбар', active: true },
    { product: 'Стиральная машина', upsell: 'Расширенная гарантия, средства для ухода', active: false },
];
export function ScriptsPage() {
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState(null);
    const [editSteps, setEditSteps] = useState([]);
    const { data: templates } = useQuery({
        queryKey: ['script-templates'],
        queryFn: () => scriptsApi.getTemplates(),
    });
    const { data: selectedDetail } = useQuery({
        queryKey: ['script-template-detail', selectedId],
        queryFn: () => scriptsApi.getTemplate(selectedId),
        enabled: !!selectedId,
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => scriptsApi.updateTemplate(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', selectedId] });
        },
    });
    const selected = selectedDetail || templates?.find((t) => t.id === selectedId);
    const selectTemplate = (t) => {
        setSelectedId(t.id);
    };
    // Update editSteps when selectedDetail loads or changes
    useEffect(() => {
        if (selectedDetail?.steps) {
            const steps = (selectedDetail.steps || [])
                .sort((a, b) => a.order - b.order)
                .map((s) => ({ id: s.id, name: s.name, weight: s.weight, enabled: s.is_required }));
            setEditSteps(steps);
        }
    }, [selectedDetail]);
    const toggleStep = (index) => {
        setEditSteps((prev) => prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s)));
    };
    const handleSave = () => {
        if (!selectedId)
            return;
        updateMutation.mutate({
            id: selectedId,
            data: {
                steps: editSteps.map((s, i) => ({
                    id: s.id,
                    name: s.name,
                    weight: s.weight,
                    order: i + 1,
                    is_required: s.enabled,
                })),
            },
        });
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "grid-2 fade-in", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("div", { className: "card-title", children: "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }), _jsxs("button", { className: "btn btn-primary btn-sm", children: [_jsx(Plus, { size: 14 }), " \u041D\u043E\u0432\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D"] })] }), _jsxs("div", { children: [(templates || []).map((t) => (_jsxs("div", { className: "list-item", onClick: () => selectTemplate(t), style: {
                                            background: selectedId === t.id ? 'var(--bg-active)' : undefined,
                                        }, children: [_jsx("div", { className: "list-item-icon", style: {
                                                    background: t.is_active ? 'var(--success-light)' : 'var(--bg)',
                                                    color: t.is_active ? 'var(--success)' : 'var(--text-muted)',
                                                }, children: _jsx(CheckSquare, { size: 18 }) }), _jsxs("div", { className: "list-item-content", children: [_jsx("div", { className: "list-item-title", children: t.name }), _jsxs("div", { className: "list-item-desc", children: [t.steps?.length || 0, " \u044D\u0442\u0430\u043F\u043E\u0432 \u00B7 ", t.is_active ? 'Активен' : 'Черновик'] })] }), _jsx("div", { className: "list-item-meta", children: _jsx("span", { className: `tag ${t.is_active ? 'tag-success' : 'tag-neutral'}`, children: t.is_active ? 'Активен' : 'Черновик' }) })] }, t.id))), (!templates || templates.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0448\u0430\u0431\u043B\u043E\u043D\u043E\u0432 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }) }))] })] }), _jsx("div", { className: "card", children: selected ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsxs("div", { className: "card-title", children: ["\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0441\u043A\u0440\u0438\u043F\u0442: ", selected.name] }), _jsx("div", { className: "card-subtitle", children: "\u0427\u0435\u043A-\u043B\u0438\u0441\u0442 \u044D\u0442\u0430\u043F\u043E\u0432 \u043F\u0440\u043E\u0434\u0430\u0436\u0438 \u0441 \u0432\u0435\u0441\u0430\u043C\u0438 \u0434\u043B\u044F \u0441\u043A\u043E\u0440\u0438\u043D\u0433\u0430" })] }) }), _jsx("div", { children: editSteps.map((step, i) => (_jsxs("div", { style: {
                                            display: 'flex', alignItems: 'center', gap: '14px',
                                            padding: '14px 0', borderBottom: '1px solid var(--border-light)',
                                        }, children: [_jsx("div", { style: {
                                                    width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)',
                                                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '13px', fontWeight: 700, flexShrink: 0,
                                                }, children: i + 1 }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 500, color: 'var(--text)', fontSize: '13.5px' }, children: step.name }), _jsxs("div", { style: { fontSize: '12px', color: 'var(--text-muted)' }, children: ["\u0412\u0435\u0441: ", Math.round(step.weight * 100), "%"] })] }), _jsx("div", { className: `toggle-switch ${step.enabled ? 'on' : ''}`, onClick: () => toggleStep(i) })] }, step.id))) }), _jsx("div", { style: { paddingTop: '16px' }, children: _jsx("button", { className: "btn btn-primary", onClick: handleSave, disabled: updateMutation.isPending, children: updateMutation.isPending ? 'Сохранение...' : 'Сохранить изменения' }) })] })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043A\u0440\u0438\u043F\u0442 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 \u0441\u043B\u0435\u0432\u0430" }) })) })] }), _jsxs("div", { className: "card fade-in", style: { marginTop: '24px' }, children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0430\u043F\u0441\u0435\u0439\u043B\u0430" }), _jsx("div", { className: "card-subtitle", children: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u043E\u0432" })] }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041F\u0440\u043E\u0434\u0443\u043A\u0442" }), _jsx("th", { children: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" })] }) }), _jsx("tbody", { children: UPSELL_RULES.map((rule, i) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: rule.product }), _jsx("td", { style: { color: 'var(--text-secondary)' }, children: rule.upsell }), _jsx("td", { children: _jsx("span", { className: `tag ${rule.active ? 'tag-success' : 'tag-warning'}`, children: rule.active ? 'Активно' : 'Черновик' }) })] }, i))) })] }) })] })] }));
}

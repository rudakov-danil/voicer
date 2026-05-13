import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi } from '@/api/scripts';
import { adminApi } from '@/api/admin';
import { dashboardApi } from '@/api/dashboard';
import { useState, useEffect, useMemo, useRef } from 'react';
import { CheckSquare, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Save, X, Store as StoreIcon, Sparkles, BookOpen, PlayCircle, Loader, BarChart3, History, MapPin, Edit3, RotateCcw, GitCompare, } from 'lucide-react';
// ─── helpers ─────────────────────────────────────────────────────────────────
const emptyStep = (order) => ({
    name: 'Новый этап',
    description: '',
    weight: 0.1,
    order,
    is_required: true,
    recommendation_text: '',
    example_phrases: [],
});
function normalizeWeights(steps) {
    const sum = steps.reduce((acc, s) => acc + (s.weight || 0), 0);
    if (sum === 0 || steps.length === 0) {
        const equal = +(1 / Math.max(steps.length, 1)).toFixed(3);
        return steps.map((s) => ({ ...s, weight: equal }));
    }
    const scaled = steps.map((s) => ({ ...s, weight: +(s.weight / sum).toFixed(3) }));
    const drift = +(1 - scaled.reduce((a, s) => a + s.weight, 0)).toFixed(3);
    if (drift !== 0 && scaled.length > 0) {
        scaled[scaled.length - 1].weight = +(scaled[scaled.length - 1].weight + drift).toFixed(3);
    }
    return scaled;
}
// ─── Chip multi-select ────────────────────────────────────────────────────────
function ChipMultiSelect({ selected, options, getLabel, placeholder, onAdd, onRemove, }) {
    const available = options.filter((o) => !selected.includes(o.id));
    const disabled = available.length === 0;
    const selectRef = useRef(null);
    const openPicker = () => {
        const el = selectRef.current;
        if (!el || disabled)
            return;
        // Современный API — открывает дроп без фокуса
        if (typeof el.showPicker === 'function') {
            try {
                el.showPicker();
                return;
            }
            catch { }
        }
        // Fallback: фокус (на части браузеров откроет автоматически)
        el.focus();
    };
    return (_jsxs("div", { className: `chip-field ${disabled ? 'chip-field--disabled' : ''}`, onClick: openPicker, role: "combobox", "aria-haspopup": "listbox", tabIndex: disabled ? -1 : 0, onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                openPicker();
            }
        }, children: [selected.length === 0 && _jsx("span", { className: "chip-placeholder", children: placeholder }), selected.map((id) => (_jsxs("span", { className: "chip", onClick: (e) => e.stopPropagation(), children: [getLabel(id), _jsx("button", { type: "button", onClick: (e) => { e.stopPropagation(); onRemove(id); }, "aria-label": "\u0423\u0431\u0440\u0430\u0442\u044C", children: _jsx(X, { size: 12 }) })] }, id))), _jsxs("select", { ref: selectRef, className: "chip-field-select", value: "", disabled: disabled, onChange: (e) => { if (e.target.value)
                    onAdd(e.target.value); }, "aria-label": placeholder, children: [_jsx("option", { value: "" }), available.map((o) => _jsx("option", { value: o.id, children: o.label }, o.id))] })] }));
}
// ─── Step row ─────────────────────────────────────────────────────────────────
function StepRow({ step, index, totalSteps, onChange, onDelete, onMoveUp, onMoveDown, }) {
    const [expanded, setExpanded] = useState(false);
    const [newPhrase, setNewPhrase] = useState('');
    const addPhrase = () => {
        const p = newPhrase.trim();
        if (!p)
            return;
        onChange({ ...step, example_phrases: [...(step.example_phrases || []), p] });
        setNewPhrase('');
    };
    const removePhrase = (i) => {
        onChange({ ...step, example_phrases: (step.example_phrases || []).filter((_, idx) => idx !== i) });
    };
    return (_jsxs("div", { style: {
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '12px', marginBottom: 10, background: 'var(--bg-card)',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', color: 'var(--text-muted)' }, children: [_jsx("button", { className: "btn-icon", onClick: onMoveUp, disabled: index === 0, title: "\u0412\u044B\u0448\u0435", style: { padding: 2 }, children: _jsx(ChevronUp, { size: 14 }) }), _jsx(GripVertical, { size: 14, style: { alignSelf: 'center', opacity: 0.5 } }), _jsx("button", { className: "btn-icon", onClick: onMoveDown, disabled: index === totalSteps - 1, title: "\u041D\u0438\u0436\u0435", style: { padding: 2 }, children: _jsx(ChevronDown, { size: 14 }) })] }), _jsx("div", { style: {
                            width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)',
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }, children: index + 1 }), _jsx("input", { className: "form-input", value: step.name, onChange: (e) => onChange({ ...step, name: e.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u044D\u0442\u0430\u043F\u0430", style: { flex: 1 } }), _jsx("input", { className: "form-input", type: "number", step: 0.01, min: 0, max: 1, value: step.weight, onChange: (e) => onChange({ ...step, weight: Number(e.target.value) }), title: "\u0412\u0435\u0441 (\u0434\u043E\u043B\u044F \u043E\u0442 1.000)", style: { width: 80, padding: '6px 10px', fontSize: 13 } }), _jsx("div", { className: `toggle-switch ${step.is_required ? 'on' : ''}`, title: step.is_required ? 'Обязательный этап' : 'Опциональный', onClick: () => onChange({ ...step, is_required: !step.is_required }) }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setExpanded((v) => !v), children: expanded ? 'Свернуть' : 'Подробно' }), _jsx("button", { className: "btn-icon", onClick: onDelete, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0430\u043F", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) })] }), expanded && (_jsxs("div", { style: { marginTop: 14, paddingLeft: 56, display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u044D\u0442\u0430\u043F\u0430 (\u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u0432 \u043F\u0440\u043E\u043C\u0442 LLM \u2014 \u043A\u0440\u0438\u0442\u0438\u0447\u043D\u043E \u0434\u043B\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438)" }), _jsx("textarea", { className: "form-input", value: step.description || '', onChange: (e) => onChange({ ...step, description: e.target.value }), placeholder: "\u0427\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u043D\u0430 \u044D\u0442\u043E\u043C \u044D\u0442\u0430\u043F\u0435", rows: 2 })] }), _jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0435 \u0444\u0440\u0430\u0437\u044B (\u043F\u0440\u0438\u043C\u0435\u0440\u044B \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u2014 LLM \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043D\u0430 \u043D\u0438\u0445)" }), _jsxs("div", { className: "chip-field", style: { marginBottom: 6 }, children: [(step.example_phrases || []).length === 0 && (_jsx("span", { className: "chip-empty", children: "\u0424\u0440\u0430\u0437 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442" })), (step.example_phrases || []).map((p, i) => (_jsxs("span", { className: "chip", children: ["\u00AB", p, "\u00BB", _jsx("button", { type: "button", onClick: () => removePhrase(i), "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 11 }) })] }, i)))] }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("input", { className: "form-input", value: newPhrase, onChange: (e) => setNewPhrase(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addPhrase();
                                        } }, placeholder: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u0438\u043C\u0435\u0440 \u0438 Enter", style: { flex: 1 } }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: addPhrase, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u044F \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0443 (\u0447\u0442\u043E \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u0430\u0442\u044C, \u0435\u0441\u043B\u0438 \u044D\u0442\u0430\u043F \u043F\u0440\u043E\u0432\u0430\u043B\u0435\u043D)" }), _jsx("textarea", { className: "form-input", value: step.recommendation_text || '', onChange: (e) => onChange({ ...step, recommendation_text: e.target.value }), placeholder: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430 \u0434\u043B\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043E\u0442\u0447\u0451\u0442\u0430", rows: 2 })] })] }))] }));
}
// ─── Assignments block (lifted to top) ───────────────────────────────────────
function AssignmentsBlock({ templateId }) {
    const queryClient = useQueryClient();
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data: sellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() });
    const { data: storeAssignments } = useQuery({
        queryKey: ['store-assignments', templateId],
        queryFn: () => scriptsApi.listStoreAssignments({ template_id: templateId }),
    });
    const { data: sellerAssignments } = useQuery({
        queryKey: ['seller-assignments', templateId],
        queryFn: () => scriptsApi.listSellerAssignments({ template_id: templateId }),
    });
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['store-assignments', templateId] });
        queryClient.invalidateQueries({ queryKey: ['seller-assignments', templateId] });
        queryClient.invalidateQueries({ queryKey: ['script-template-detail', templateId] });
    };
    const addStore = useMutation({
        mutationFn: (store_id) => scriptsApi.assignToStore({ store_id, template_id: templateId, is_mandatory: true }),
        onSuccess: invalidate,
    });
    const removeStoreByStoreId = useMutation({
        mutationFn: async (store_id) => {
            const a = (storeAssignments || []).find((x) => x.store_id === store_id);
            if (!a)
                return;
            await scriptsApi.removeStoreAssignment(a.id);
        },
        onSuccess: invalidate,
    });
    const addSeller = useMutation({
        mutationFn: (seller_id) => scriptsApi.assignToSeller({ seller_id, template_id: templateId, is_mandatory: true }),
        onSuccess: invalidate,
    });
    const removeSellerBySellerId = useMutation({
        mutationFn: async (seller_id) => {
            const a = (sellerAssignments || []).find((x) => x.seller_id === seller_id);
            if (!a)
                return;
            await scriptsApi.removeSellerAssignment(a.id);
        },
        onSuccess: invalidate,
    });
    const selectedStoreIds = (storeAssignments || []).map((a) => a.store_id);
    const selectedSellerIds = (sellerAssignments || []).map((a) => a.seller_id);
    const storeOptions = (stores?.items || []).map((s) => ({ id: s.id, label: s.name }));
    const sellerOptions = (sellers?.items || []).map((s) => ({
        id: s.id,
        label: `${s.first_name} ${s.last_name}`.trim() || s.id.slice(0, 8),
    }));
    const storeName = (id) => storeOptions.find((o) => o.id === id)?.label || id.slice(0, 8);
    const sellerName = (id) => sellerOptions.find((o) => o.id === id)?.label || id.slice(0, 8);
    return (_jsxs("div", { className: "assignments-card", children: [_jsxs("div", { className: "assignments-title", children: [_jsx(StoreIcon, { size: 14 }), " \u0413\u0434\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F"] }), _jsxs("div", { style: { marginBottom: 10 }, children: [_jsx("label", { className: "field-label", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D\u044B (\u0441\u043A\u0440\u0438\u043F\u0442 \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C\u0441\u044F \u043A\u043E \u0432\u0441\u0435\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C \u0432 \u044D\u0442\u0438\u0445 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430\u0445)" }), _jsx(ChipMultiSelect, { selected: selectedStoreIds, options: storeOptions, getLabel: storeName, placeholder: "\u041A\u043B\u0438\u043A\u043D\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D", onAdd: (id) => addStore.mutate(id), onRemove: (id) => removeStoreByStoreId.mutate(id) })] }), _jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u044B (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E \u2014 \u0435\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u044B \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u043B\u044E\u0434\u0438, \u0430 \u043D\u0435 \u0432\u0441\u0435 \u0438\u0437 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430)" }), _jsx(ChipMultiSelect, { selected: selectedSellerIds, options: sellerOptions, getLabel: sellerName, placeholder: "\u041A\u043B\u0438\u043A\u043D\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)", onAdd: (id) => addSeller.mutate(id), onRemove: (id) => removeSellerBySellerId.mutate(id) })] })] }));
}
// ─── Template editor ─────────────────────────────────────────────────────────
function TemplateEditor({ template, onSaved, }) {
    const queryClient = useQueryClient();
    const isNew = !template?.id;
    const [name, setName] = useState(template?.name || '');
    const [description, setDescription] = useState(template?.description || '');
    const [steps, setSteps] = useState(template?.steps || []);
    const [showTestDialog, setShowTestDialog] = useState(false);
    useEffect(() => {
        setName(template?.name || '');
        setDescription(template?.description || '');
        setSteps(template?.steps || []);
    }, [template?.id]);
    const weightsSum = useMemo(() => steps.reduce((a, s) => a + (s.weight || 0), 0), [steps]);
    const weightsOk = Math.abs(weightsSum - 1) < 0.005;
    const saveMutation = useMutation({
        mutationFn: async () => {
            // Контекст и scope больше не настраиваются — всегда без фильтра, всегда org_level
            const payload = { name, description, scope: 'org_level', context_description: null, steps };
            if (isNew)
                return scriptsApi.createTemplate(payload);
            return scriptsApi.replaceTemplate(template.id, payload);
        },
        onSuccess: (saved) => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', saved.id] });
            onSaved?.(saved.id);
        },
    });
    const addStep = () => setSteps((prev) => [...prev, emptyStep(prev.length + 1)]);
    const removeStep = (i) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
    const updateStep = (i, s) => setSteps((prev) => prev.map((p, idx) => (idx === i ? s : p)));
    const move = (i, dir) => {
        setSteps((prev) => {
            const next = [...prev];
            const j = i + dir;
            if (j < 0 || j >= next.length)
                return prev;
            [next[i], next[j]] = [next[j], next[i]];
            return next.map((s, k) => ({ ...s, order: k + 1 }));
        });
    };
    return (_jsxs("div", { children: [isNew && (_jsxs("div", { className: "assignments-card", style: { opacity: 0.7, marginBottom: 14 }, children: [_jsxs("div", { className: "assignments-title", children: [_jsx(StoreIcon, { size: 14 }), " \u0413\u0434\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F"] }), _jsx("div", { style: { fontSize: 12.5, color: 'var(--text-muted)' }, children: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0441\u043A\u0440\u0438\u043F\u0442 \u2014 \u0437\u0430\u0442\u0435\u043C \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B \u0438 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432 \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \u00AB\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F\u00BB." })] })), _jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("label", { className: "field-label", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("input", { className: "form-input", value: name, onChange: (e) => setName(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439 \u0441\u043A\u0440\u0438\u043F\u0442 \u043F\u0440\u043E\u0434\u0430\u0436 \u0431\u044B\u0442\u043E\u0432\u043E\u0439 \u0442\u0435\u0445\u043D\u0438\u043A\u0438" })] }), _jsxs("div", { style: { marginBottom: 18 }, children: [_jsx("label", { className: "field-label", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 (\u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u043D\u0435 \u0434\u043B\u044F LLM)" }), _jsx("textarea", { className: "form-input", value: description || '', onChange: (e) => setDescription(e.target.value), rows: 2, placeholder: "\u041A\u0440\u0430\u0442\u043A\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u2014 \u0434\u043B\u044F \u0447\u0435\u0433\u043E \u044D\u0442\u043E\u0442 \u0441\u043A\u0440\u0438\u043F\u0442" })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)' }, children: "\u042D\u0442\u0430\u043F\u044B" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsxs("span", { style: { fontSize: 12, color: weightsOk ? 'var(--success)' : 'var(--danger)' }, children: ["\u0421\u0443\u043C\u043C\u0430 \u0432\u0435\u0441\u043E\u0432: ", weightsSum.toFixed(3), " ", weightsOk ? '✓' : '(должно быть 1.000)'] }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setSteps(normalizeWeights(steps)), disabled: steps.length === 0, children: "\u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u0442\u044C" }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: addStep, children: [_jsx(Plus, { size: 12 }), " \u042D\u0442\u0430\u043F"] })] })] }), _jsxs("div", { children: [steps.map((s, i) => (_jsx(StepRow, { step: s, index: i, totalSteps: steps.length, onChange: (next) => updateStep(i, next), onDelete: () => removeStep(i), onMoveUp: () => move(i, -1), onMoveDown: () => move(i, 1) }, s.id || `tmp-${i}`))), steps.length === 0 && (_jsx("div", { className: "empty-state", style: { padding: 20 }, children: "\u042D\u0442\u0430\u043F\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB+ \u042D\u0442\u0430\u043F\u00BB" }))] }), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 16 }, children: [_jsxs("button", { className: "btn btn-primary", onClick: () => saveMutation.mutate(), disabled: saveMutation.isPending || !name.trim() || steps.length === 0 || !weightsOk, children: [_jsx(Save, { size: 14 }), " ", saveMutation.isPending ? 'Сохранение...' : (isNew ? 'Создать скрипт' : 'Сохранить изменения')] }), _jsxs("button", { className: "btn btn-outline", disabled: steps.length === 0, onClick: () => setShowTestDialog(true), title: "\u041F\u0440\u043E\u0433\u043D\u0430\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0447\u0435\u0440\u0435\u0437 LLM \u043D\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438, \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044F", children: [_jsx(PlayCircle, { size: 14 }), " \u0422\u0435\u0441\u0442 \u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u0438"] })] }), showTestDialog && (_jsx(LiveTestDialog, { draft: { name: name || 'Черновик', steps }, onClose: () => setShowTestDialog(false) }))] }));
}
// ─── Upsell rules table ──────────────────────────────────────────────────────
function UpsellRulesTable() {
    const queryClient = useQueryClient();
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data: rules } = useQuery({
        queryKey: ['upsell-rules'],
        queryFn: () => scriptsApi.listUpsellRules(),
    });
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['upsell-rules'] });
    const createMut = useMutation({
        mutationFn: () => scriptsApi.createUpsellRule({
            store_id: null,
            trigger_product: 'Новый продукт',
            required_offers: [],
            is_active: false,
        }),
        onSuccess: invalidate,
    });
    const patchMut = useMutation({
        mutationFn: ({ id, data }) => scriptsApi.patchUpsellRule(id, data),
        onSuccess: invalidate,
    });
    const delMut = useMutation({
        mutationFn: (id) => scriptsApi.deleteUpsellRule(id),
        onSuccess: invalidate,
    });
    return (_jsxs("div", { className: "card fade-in", style: { marginTop: 24 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0430\u043F\u0441\u0435\u0439\u043B\u0430" }), _jsx("div", { className: "card-subtitle", children: "LLM \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u043A\u0430\u0436\u0434\u044B\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440: \u0435\u0441\u043B\u0438 \u043F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u043E\u0431\u0441\u0443\u0436\u0434\u0430\u043B \u0442\u0440\u0438\u0433\u0433\u0435\u0440-\u043F\u0440\u043E\u0434\u0443\u043A\u0442, \u043E\u043D \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u043B \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F." })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: () => createMut.mutate(), children: [_jsx(Plus, { size: 14 }), " \u041F\u0440\u0430\u0432\u0438\u043B\u043E"] })] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0422\u0440\u0438\u0433\u0433\u0435\u0440-\u043F\u0440\u043E\u0434\u0443\u043A\u0442" }), _jsx("th", { children: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F" }), _jsx("th", { style: { minWidth: 200 }, children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsx("th", { style: { width: 90 }, children: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E" }), _jsx("th", { style: { width: 50 } })] }) }), _jsxs("tbody", { children: [(rules || []).map((r) => (_jsx(UpsellRuleRow, { rule: r, stores: stores?.items || [], onPatch: (data) => patchMut.mutate({ id: r.id, data }), onDelete: () => { if (confirm('Удалить правило?'))
                                        delMut.mutate(r.id); } }, r.id))), (!rules || rules.length === 0) && (_jsx("tr", { children: _jsx("td", { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 20 }, children: "\u041F\u0440\u0430\u0432\u0438\u043B \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043F\u0435\u0440\u0432\u043E\u0435 \u2014 LLM \u043D\u0430\u0447\u043D\u0451\u0442 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043E\u0442\u043C\u0435\u0447\u0430\u0442\u044C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B, \u0433\u0434\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u0437\u0430\u0431\u044B\u043B \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0430\u043F\u0441\u0435\u0439\u043B." }) }))] })] }) })] }));
}
function UpsellRuleRow({ rule, stores, onPatch, onDelete }) {
    const [trigger, setTrigger] = useState(rule.trigger_product);
    const [offers, setOffers] = useState(rule.required_offers.join(', '));
    useEffect(() => setTrigger(rule.trigger_product), [rule.trigger_product]);
    useEffect(() => setOffers(rule.required_offers.join(', ')), [rule.required_offers]);
    const commitTrigger = () => {
        const v = trigger.trim();
        if (v && v !== rule.trigger_product)
            onPatch({ trigger_product: v });
    };
    const commitOffers = () => {
        const arr = offers.split(',').map((s) => s.trim()).filter(Boolean);
        const same = arr.length === rule.required_offers.length &&
            arr.every((o, i) => o === rule.required_offers[i]);
        if (!same)
            onPatch({ required_offers: arr });
    };
    return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500 }, children: _jsx("input", { className: "form-input", value: trigger, onChange: (e) => setTrigger(e.target.value), onBlur: commitTrigger, style: { padding: '6px 10px' } }) }), _jsx("td", { children: _jsx("input", { className: "form-input", value: offers, onChange: (e) => setOffers(e.target.value), onBlur: commitOffers, placeholder: "\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E", style: { padding: '6px 10px' } }) }), _jsx("td", { children: _jsxs("select", { className: "form-select", value: rule.store_id || '', onChange: (e) => onPatch({ store_id: (e.target.value || null) }), style: { padding: '6px 30px 6px 10px', fontSize: 12.5 }, children: [_jsx("option", { value: "", children: "\u0412\u0441\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] }) }), _jsx("td", { children: _jsx("div", { className: `toggle-switch ${rule.is_active ? 'on' : ''}`, onClick: () => onPatch({ is_active: !rule.is_active }) }) }), _jsx("td", { children: _jsx("button", { className: "btn-icon", onClick: onDelete, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) }) })] }));
}
// ─── Library / AI generation dialog ──────────────────────────────────────────
function LibraryDialog({ onClose, onCreated, onUseDraft, }) {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState('library');
    const { data: presets } = useQuery({
        queryKey: ['library-presets'],
        queryFn: () => scriptsApi.listLibrary(),
        enabled: tab === 'library',
    });
    const createFromPresetMut = useMutation({
        mutationFn: (id) => scriptsApi.createFromPreset(id),
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            onCreated(created.id);
            onClose();
        },
    });
    // AI generation
    const [topic, setTopic] = useState('');
    const [industry, setIndustry] = useState('');
    const [extraNotes, setExtraNotes] = useState('');
    const generateMut = useMutation({
        mutationFn: () => scriptsApi.generateWithAi({
            topic, industry: industry || undefined, extra_notes: extraNotes || undefined,
        }),
        onSuccess: (draft) => {
            onUseDraft(draft);
            onClose();
        },
    });
    return (_jsx("div", { className: "modal-overlay", onClick: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsx("div", { className: "modal-title", children: "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("button", { className: "btn-icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-tabs", children: [_jsxs("div", { className: `modal-tab ${tab === 'library' ? 'active' : ''}`, onClick: () => setTab('library'), children: [_jsx(BookOpen, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0418\u0437 \u0433\u043E\u0442\u043E\u0432\u043E\u0433\u043E \u0448\u0430\u0431\u043B\u043E\u043D\u0430"] }), _jsxs("div", { className: `modal-tab ${tab === 'ai' ? 'active' : ''}`, onClick: () => setTab('ai'), children: [_jsx(Sparkles, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441 AI"] })] }), _jsxs("div", { className: "modal-body", children: [tab === 'library' && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0440\u0430\u0441\u043B\u0435\u0432\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u2014 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D \u043A\u0430\u043A \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043C\u043E\u0436\u043D\u043E \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C." }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, children: [(presets || []).map((p) => (_jsxs("div", { className: "preset-card", onClick: () => createFromPresetMut.mutate(p.id), children: [_jsx("div", { className: "preset-name", children: p.name }), _jsxs("div", { className: "preset-meta", children: [p.step_count, " \u044D\u0442\u0430\u043F\u043E\u0432 \u00B7 ", p.industry] }), _jsx("div", { className: "preset-desc", children: p.description })] }, p.id))), (!presets || presets.length === 0) && (_jsx("div", { style: { gridColumn: '1 / -1', color: 'var(--text-muted)', textAlign: 'center', padding: 20 }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }))] }), createFromPresetMut.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }, children: "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435..." }))] })), tab === 'ai' && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }, children: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u2014 LLM \u0441\u043E\u0431\u0435\u0440\u0451\u0442 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043A\u0440\u0438\u043F\u0442\u0430 (\u044D\u0442\u0430\u043F\u044B, \u0432\u0435\u0441\u0430, \u044D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0435 \u0444\u0440\u0430\u0437\u044B). \u0412\u044B \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u043E\u0434\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u043F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C." }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "field-label", children: "\u0422\u0435\u043C\u0430 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("input", { className: "form-input", value: topic, onChange: (e) => setTopic(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043F\u0440\u043E\u0434\u0430\u0436\u0430 \u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D\u043E\u0432 \u0432 \u0440\u043E\u0437\u043D\u0438\u0447\u043D\u043E\u043C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435" })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "field-label", children: "\u0418\u043D\u0434\u0443\u0441\u0442\u0440\u0438\u044F / \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), _jsx("input", { className: "form-input", value: industry, onChange: (e) => setIndustry(e.target.value), placeholder: "\u044D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u0438\u043A\u0430, \u043E\u0434\u0435\u0436\u0434\u0430, \u043C\u0435\u0431\u0435\u043B\u044C, \u043F\u0430\u0440\u0444\u044E\u043C\u0435\u0440\u0438\u044F..." })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "field-label", children: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u0436\u0435\u043B\u0430\u043D\u0438\u044F (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), _jsx("textarea", { className: "form-input", value: extraNotes, onChange: (e) => setExtraNotes(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0430\u043A\u0446\u0435\u043D\u0442 \u043D\u0430 \u0440\u0430\u0431\u043E\u0442\u0435 \u0441 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C '\u0434\u043E\u0440\u043E\u0433\u043E', \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0442\u044C \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0443", rows: 3 })] }), generateMut.isError && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 8 }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435." }))] }))] }), _jsx("div", { className: "modal-footer", children: tab === 'ai' ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary", disabled: !topic.trim() || generateMut.isPending, onClick: () => generateMut.mutate(), children: generateMut.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader, { size: 14, className: "spin" }), " \u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F..."] })) : (_jsxs(_Fragment, { children: [_jsx(Sparkles, { size: 14 }), " \u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C"] })) })] })) : (_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })) })] }) }));
}
// ─── Live-test dialog ────────────────────────────────────────────────────────
function LiveTestDialog({ draft, onClose, }) {
    const [recordingId, setRecordingId] = useState(null);
    const [result, setResult] = useState(null);
    const { data: convs, isLoading: convsLoading } = useQuery({
        queryKey: ['recent-conversations-for-test'],
        queryFn: () => dashboardApi.getConversations({ limit: 30 }),
    });
    const testMut = useMutation({
        mutationFn: (recording_id) => scriptsApi.testScript({
            recording_id, name: draft.name || 'Черновик', steps: draft.steps,
        }),
        onSuccess: (r) => setResult(r),
    });
    const items = (convs?.items || []);
    return (_jsx("div", { className: "modal-overlay", onClick: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", children: [_jsx(PlayCircle, { size: 16, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0422\u0435\u0441\u0442 \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u043D\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438"] }), _jsx("button", { className: "btn-icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-body", children: [!result && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043F\u0438\u0441\u044C \u2014 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u043F\u0440\u043E\u0433\u043E\u043D\u0438\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 LLM, \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u0411\u0414." }), convsLoading && _jsx("div", { style: { color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }, children: [items.map((c) => {
                                            const isSelected = recordingId === c.recording_id;
                                            const date = c.analyzed_at || c.session_date;
                                            return (_jsxs("div", { className: "preset-card", onClick: () => setRecordingId(c.recording_id), style: {
                                                    borderColor: isSelected ? 'var(--primary)' : undefined,
                                                    background: isSelected ? 'rgba(37,99,235,0.04)' : undefined,
                                                }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsxs("div", { className: "preset-name", children: [c.seller_name || '—', " \u00B7 ", c.store_name || '—'] }), _jsx("div", { className: "preset-meta", children: date ? new Date(date).toLocaleString('ru-RU') : '' })] }), _jsxs("div", { className: "preset-meta", children: [c.topic || 'без темы', " \u00B7 \u0441\u043A\u043E\u0440\u0438\u043D\u0433 ", c.overall_score ?? '—', "%"] })] }, c.id));
                                        }), (!convsLoading && items.length === 0) && (_jsx("div", { style: { color: 'var(--text-muted)', textAlign: 'center', padding: 20 }, children: "\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u2014 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0430\u0443\u0434\u0438\u043E \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u00AB\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B\u00BB." }))] }), testMut.isError && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 12 }, children: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0442\u0435\u0441\u0442\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C." }))] })), result && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }, children: [_jsxs("div", { style: { fontSize: 28, fontWeight: 700, color: 'var(--primary)' }, children: [result.overall_score, "%"] }), _jsxs("div", { style: { color: 'var(--text-muted)', fontSize: 12 }, children: ["\u0418\u0442\u043E\u0433\u043E\u0432\u044B\u0439 \u0432\u0437\u0432\u0435\u0448\u0435\u043D\u043D\u044B\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433 \u00B7 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u043E\u0432 \u0432 \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442\u0435: ", result.segment_count] })] }), _jsx("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "\u041F\u043E \u044D\u0442\u0430\u043F\u0430\u043C:" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }, children: result.step_scores.map((s, i) => (_jsxs("div", { style: {
                                            padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                                            background: 'var(--bg-card)',
                                        }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("div", { style: { fontWeight: 500 }, children: s.step_name }), _jsxs("div", { style: {
                                                            color: s.score >= 70 ? 'var(--success)' : s.score >= 40 ? '#F59E0B' : 'var(--danger)',
                                                            fontWeight: 600, fontSize: 14,
                                                        }, children: [s.score, "% (\u0432\u0435\u0441 ", s.weight, ")"] })] }), s.evidence && (_jsxs("div", { style: { marginTop: 4, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }, children: ["\u00AB", s.evidence, "\u00BB"] })), !s.detected && (_jsx("div", { style: { marginTop: 4, fontSize: 12, color: 'var(--danger)' }, children: "\u041D\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D \u0432 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435" }))] }, i))) }), result.violations.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F:" }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: result.violations.map((v, i) => (_jsx("span", { className: "tag tag-danger", children: v }, i))) })] }))] }))] }), _jsx("div", { className: "modal-footer", children: !result ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary", disabled: !recordingId || testMut.isPending, onClick: () => recordingId && testMut.mutate(recordingId), children: testMut.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader, { size: 14, className: "spin" }), " \u041F\u0440\u043E\u0433\u043E\u043D... (\u0434\u043E 30 \u0441\u0435\u043A)"] })) : (_jsxs(_Fragment, { children: [_jsx(PlayCircle, { size: 14 }), " \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0442\u0435\u0441\u0442"] })) })] })) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: () => setResult(null), children: "\u2190 \u0414\u0440\u0443\u0433\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C" }), _jsx("button", { className: "btn btn-primary", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })) })] }) }));
}
// ─── Analytics panel ─────────────────────────────────────────────────────────
function AnalyticsPanel({ templateId }) {
    const [days, setDays] = useState(30);
    const { data, isLoading } = useQuery({
        queryKey: ['template-analytics', templateId, days],
        queryFn: () => scriptsApi.getTemplateAnalytics(templateId, { days }),
        enabled: !!templateId,
    });
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)' }, children: "\u0421\u0432\u043E\u0434\u043A\u0430 \u043F\u043E \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u044F\u043C \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsxs("select", { className: "form-select", value: days, onChange: (e) => setDays(Number(e.target.value)), style: { width: 130, padding: '6px 30px 6px 10px', fontSize: 12.5 }, children: [_jsx("option", { value: 7, children: "7 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 30, children: "30 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 90, children: "90 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 365, children: "\u0413\u043E\u0434" })] })] }), isLoading && _jsx("div", { style: { color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }), data && data.conversation_count === 0 && (_jsx("div", { className: "empty-state", style: { padding: 24 }, children: "\u0421\u043A\u0440\u0438\u043F\u0442 \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u043B\u0441\u044F \u043A \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434." })), data && data.conversation_count > 0 && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }, children: [_jsxs("div", { style: { padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)' }, children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, color: 'var(--text)' }, children: data.conversation_count })] }), _jsxs("div", { style: { padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)' }, children: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' }, children: data.avg_script_score != null ? `${data.avg_script_score}%` : '—' })] }), _jsxs("div", { style: { padding: 12, background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)' }, children: "\u0421\u0438\u043B\u044C\u043D\u044B\u0445 (\u226570%)" }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, color: 'var(--success)' }, children: data.strong_conversation_count })] })] }), _jsx("div", { style: { fontWeight: 600, marginBottom: 8, fontSize: 13 }, children: "\u041F\u043E \u044D\u0442\u0430\u043F\u0430\u043C:" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: data.per_step.map((s) => {
                            const color = s.pass_rate >= 70 ? 'var(--success)' : s.pass_rate >= 40 ? '#F59E0B' : 'var(--danger)';
                            return (_jsxs("div", { style: {
                                    padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                                    background: 'var(--bg-card)',
                                }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 500 }, children: s.step_name }), _jsxs("div", { style: { fontSize: 13, fontWeight: 600, color }, children: [s.pass_rate, "% pass \u00B7 ", s.avg_score, " \u0441\u0440.\u0431\u0430\u043B\u043B"] })] }), _jsx("div", { style: {
                                            height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden',
                                        }, children: _jsx("div", { style: {
                                                width: `${Math.max(2, s.pass_rate)}%`, height: '100%',
                                                background: color, transition: 'width 0.3s',
                                            } }) }), _jsxs("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }, children: ["\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D ", s.detected_count, " \u0438\u0437 ", s.total_count, " \u0440\u0430\u0437 (", s.detection_rate, "%)"] })] }, s.step_id));
                        }) })] }))] }));
}
// ─── Versions panel ──────────────────────────────────────────────────────────
function VersionsPanel({ templateId, onRestored }) {
    const queryClient = useQueryClient();
    const [showCompare, setShowCompare] = useState(false);
    const [selectedForCompare, setSelectedForCompare] = useState([]);
    const { data: versions } = useQuery({
        queryKey: ['template-versions', templateId],
        queryFn: () => scriptsApi.listVersions(templateId),
        enabled: !!templateId,
    });
    const restoreMut = useMutation({
        mutationFn: (n) => scriptsApi.restoreVersion(templateId, n),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', templateId] });
            queryClient.invalidateQueries({ queryKey: ['template-versions', templateId] });
            queryClient.invalidateQueries({ queryKey: ['template-analytics', templateId] });
            onRestored();
        },
    });
    const toggleCompare = (n) => {
        setSelectedForCompare((prev) => {
            if (prev.includes(n))
                return prev.filter((x) => x !== n);
            if (prev.length >= 2)
                return [prev[1], n];
            return [...prev, n];
        });
    };
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)' }, children: "\u041A\u0430\u0436\u0434\u043E\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0432\u0435\u0440\u0441\u0438\u044E. \u041C\u043E\u0436\u043D\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043B\u044E\u0431\u0443\u044E \u0438\u043B\u0438 \u0441\u0440\u0430\u0432\u043D\u0438\u0442\u044C \u0434\u0432\u0435." }), _jsxs("button", { className: "btn btn-outline btn-sm", disabled: selectedForCompare.length !== 2, onClick: () => setShowCompare(true), children: [_jsx(GitCompare, { size: 14 }), " \u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C (", selectedForCompare.length, "/2)"] })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: [(versions || []).map((v, i) => {
                        const isCurrent = i === 0;
                        const checked = selectedForCompare.includes(v.version_number);
                        return (_jsxs("div", { style: {
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                                background: checked ? 'rgba(37,99,235,0.04)' : 'var(--bg-card)',
                                borderColor: checked ? 'var(--primary)' : 'var(--border)',
                            }, children: [_jsx("input", { type: "checkbox", checked: checked, onChange: () => toggleCompare(v.version_number) }), _jsxs("div", { style: { flex: 1 }, children: [_jsxs("div", { style: { fontWeight: 500, fontSize: 13 }, children: ["v", v.version_number, " ", isCurrent && _jsx("span", { style: { color: 'var(--success)', fontSize: 11, marginLeft: 6 }, children: "\u00B7 \u0442\u0435\u043A\u0443\u0449\u0430\u044F" })] }), _jsxs("div", { style: { fontSize: 11, color: 'var(--text-muted)' }, children: [new Date(v.created_at).toLocaleString('ru-RU'), " \u00B7 ", v.note || 'без примечания'] })] }), !isCurrent && (_jsxs("button", { className: "btn btn-outline btn-sm", onClick: () => { if (confirm(`Восстановить v${v.version_number}? Текущее состояние сохранится как новая версия.`))
                                        restoreMut.mutate(v.version_number); }, title: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C", children: [_jsx(RotateCcw, { size: 13 }), " \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C"] }))] }, v.id));
                    }), (!versions || versions.length === 0) && (_jsx("div", { className: "empty-state", style: { padding: 16 }, children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0432\u0435\u0440\u0441\u0438\u0439 \u043F\u0443\u0441\u0442\u0430." }))] }), showCompare && selectedForCompare.length === 2 && (_jsx(CompareDialog, { templateId: templateId, versionA: Math.min(...selectedForCompare), versionB: Math.max(...selectedForCompare), onClose: () => setShowCompare(false) }))] }));
}
// ─── Compare dialog ──────────────────────────────────────────────────────────
function CompareDialog({ templateId, versionA, versionB, onClose }) {
    const [days, setDays] = useState(30);
    const { data, isLoading } = useQuery({
        queryKey: ['template-compare', templateId, versionA, versionB, days],
        queryFn: () => scriptsApi.compareVersions(templateId, versionA, versionB, days),
    });
    const renderColumn = (v, label) => (_jsxs("div", { style: {
            flex: 1, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            background: 'var(--bg-card)',
        }, children: [_jsxs("div", { style: { fontWeight: 600, marginBottom: 12 }, children: [label, " (v", v.version_number, ")"] }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("div", { style: { fontSize: 26, fontWeight: 700 }, children: v.conversation_count }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }, children: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("div", { style: { fontSize: 22, fontWeight: 600, color: 'var(--primary)' }, children: v.avg_script_score != null ? `${v.avg_script_score}%` : '—' }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }, children: "\u0421\u0438\u043B\u044C\u043D\u044B\u0445 (\u226570%)" }), _jsx("div", { style: { fontSize: 18, fontWeight: 600, color: 'var(--success)' }, children: v.strong_count })] }));
    return (_jsx("div", { className: "modal-overlay", onClick: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", children: [_jsx(GitCompare, { size: 16, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0432\u0435\u0440\u0441\u0438\u0439 v", versionA, " \u2194 v", versionB] }), _jsx("button", { className: "btn-icon", onClick: onClose, children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-body", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u041C\u0435\u0442\u0440\u0438\u043A\u0438 \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C, \u0437\u0430\u0441\u043A\u043E\u0440\u0435\u043D\u043D\u044B\u043C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439." }), _jsxs("select", { className: "form-select", value: days, onChange: (e) => setDays(Number(e.target.value)), style: { width: 130, padding: '6px 30px 6px 10px', fontSize: 12.5 }, children: [_jsx("option", { value: 7, children: "7 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 30, children: "30 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 90, children: "90 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 365, children: "\u0413\u043E\u0434" })] })] }), isLoading && _jsx("div", { style: { color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }), data && (_jsxs("div", { style: { display: 'flex', gap: 12 }, children: [renderColumn(data.version_a, 'Версия A'), renderColumn(data.version_b, 'Версия B')] }))] }), _jsx("div", { className: "modal-footer", children: _jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }) })] }) }));
}
// ─── Editor dialog (модалка вокруг TemplateEditor) ───────────────────────────
function EditorDialog({ template, isNew, draftInfo, onClose, onSaved, }) {
    return (_jsx("div", { className: "modal-overlay", onClick: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", onClick: (e) => e.stopPropagation(), style: { maxWidth: 920, maxHeight: '92vh' }, children: [_jsxs("div", { className: "modal-header", children: [_jsx("div", { className: "modal-title", children: isNew
                                ? (draftInfo?.fromAi ? 'AI-черновик скрипта' : 'Новый скрипт')
                                : (template?.name || 'Редактирование скрипта') }), _jsx("button", { className: "btn-icon", onClick: onClose, children: _jsx(X, { size: 16 }) })] }), _jsx("div", { className: "modal-body", style: { paddingBottom: 0 }, children: _jsx(TemplateEditor, { template: template, onSaved: (id) => onSaved(id) }, isNew ? (draftInfo?.fromAi ? 'ai' : 'new') : (template?.id || 'none')) })] }) }));
}
function SelectedScriptPanel({ template, onEdit }) {
    const [tab, setTab] = useState('analytics');
    return (_jsxs("div", { className: "card", style: { maxHeight: '78vh', overflowY: 'auto' }, children: [_jsxs("div", { className: "card-header", style: { alignItems: 'flex-start' }, children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: template.name }), _jsx("div", { className: "card-subtitle", children: template.description || '—' })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: onEdit, children: [_jsx(Edit3, { size: 14 }), " \u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"] })] }), _jsxs("div", { className: "modal-tabs", style: { margin: '0 -20px 16px', padding: '0 20px' }, children: [_jsxs("div", { className: `modal-tab ${tab === 'analytics' ? 'active' : ''}`, onClick: () => setTab('analytics'), children: [_jsx(BarChart3, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), " \u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430"] }), _jsxs("div", { className: `modal-tab ${tab === 'versions' ? 'active' : ''}`, onClick: () => setTab('versions'), children: [_jsx(History, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), " \u0412\u0435\u0440\u0441\u0438\u0438"] }), _jsxs("div", { className: `modal-tab ${tab === 'assignments' ? 'active' : ''}`, onClick: () => setTab('assignments'), children: [_jsx(MapPin, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), " \u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F"] })] }), tab === 'analytics' && _jsx(AnalyticsPanel, { templateId: template.id }), tab === 'versions' && _jsx(VersionsPanel, { templateId: template.id, onRestored: () => setTab('analytics') }), tab === 'assignments' && _jsx(AssignmentsBlock, { templateId: template.id })] }));
}
// ─── Main page ───────────────────────────────────────────────────────────────
export function ScriptsPage() {
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState(null);
    const [showLibrary, setShowLibrary] = useState(false);
    // Editor modal state
    const [editorMode, setEditorMode] = useState(null);
    const [aiDraft, setAiDraft] = useState(null);
    const { data: templates } = useQuery({
        queryKey: ['script-templates'],
        queryFn: () => scriptsApi.getTemplates(),
    });
    const { data: selectedDetail } = useQuery({
        queryKey: ['script-template-detail', selectedId],
        queryFn: () => scriptsApi.getTemplate(selectedId),
        enabled: !!selectedId,
    });
    const patchMut = useMutation({
        mutationFn: ({ id, is_active }) => scriptsApi.patchTemplate(id, { is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            if (selectedId)
                queryClient.invalidateQueries({ queryKey: ['script-template-detail', selectedId] });
        },
    });
    // Какой template подаём в редактор: edit → текущий выбранный, ai → черновик, new → пустой
    const editorTemplate = editorMode === 'ai' && aiDraft
        ? { id: '', name: aiDraft.name, is_active: true, steps: aiDraft.steps, description: aiDraft.description || '' }
        : editorMode === 'new'
            ? { id: '', name: '', is_active: true, steps: [], description: '' }
            : editorMode === 'edit'
                ? (selectedDetail || null)
                : null;
    const closeEditor = () => {
        setEditorMode(null);
        setAiDraft(null);
    };
    const handleEditorSaved = (newId) => {
        queryClient.invalidateQueries({ queryKey: ['script-templates'] });
        if (newId) {
            setSelectedId(newId);
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', newId] });
        }
        closeEditor();
    };
    const handlePresetCreated = (newId) => {
        setSelectedId(newId);
        queryClient.invalidateQueries({ queryKey: ['script-templates'] });
    };
    const handleAiDraft = (draft) => {
        setAiDraft(draft);
        setEditorMode('ai');
        setSelectedId(null);
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "grid-2 fade-in", style: { alignItems: 'start' }, children: [_jsxs("div", { className: "card", style: { maxHeight: '78vh', overflowY: 'auto' }, children: [_jsxs("div", { className: "card-header", children: [_jsx("div", { className: "card-title", children: "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsxs("button", { className: "btn btn-outline btn-sm", onClick: () => setShowLibrary(true), title: "\u0413\u043E\u0442\u043E\u0432\u044B\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u044B \u0438\u043B\u0438 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u0447\u0435\u0440\u0435\u0437 AI", children: [_jsx(Sparkles, { size: 14 }), " \u0428\u0430\u0431\u043B\u043E\u043D / AI"] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: () => { setEditorMode('new'); setAiDraft(null); setSelectedId(null); }, children: [_jsx(Plus, { size: 14 }), " \u041F\u0443\u0441\u0442\u043E\u0439"] })] })] }), _jsxs("div", { children: [(templates || []).map((t) => (_jsxs("div", { className: "list-item", onClick: () => setSelectedId(t.id), style: { background: selectedId === t.id ? 'var(--bg-active)' : undefined }, children: [_jsx("div", { className: "list-item-icon", style: {
                                                    background: t.is_active ? 'var(--success-light)' : 'var(--bg)',
                                                    color: t.is_active ? 'var(--success)' : 'var(--text-muted)',
                                                }, children: _jsx(CheckSquare, { size: 18 }) }), _jsxs("div", { className: "list-item-content", children: [_jsx("div", { className: "list-item-title", children: t.name }), _jsxs("div", { className: "list-item-desc", children: [t.steps?.length || 0, " \u044D\u0442\u0430\u043F\u043E\u0432 \u00B7 ", t.is_active ? 'Активен' : 'Черновик'] })] }), _jsx("div", { className: "list-item-meta", style: { display: 'flex', alignItems: 'center', gap: 8 }, children: _jsx("div", { className: `toggle-switch ${t.is_active ? 'on' : ''}`, onClick: (e) => { e.stopPropagation(); patchMut.mutate({ id: t.id, is_active: !t.is_active }); }, title: t.is_active ? 'Активен' : 'Черновик' }) })] }, t.id))), (!templates || templates.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0448\u0430\u0431\u043B\u043E\u043D\u043E\u0432 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }) }))] })] }), selectedDetail
                        ? _jsx(SelectedScriptPanel, { template: selectedDetail, onEdit: () => setEditorMode('edit') })
                        : (_jsx("div", { className: "card", style: { maxHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx("div", { className: "empty-state", style: { textAlign: 'center', padding: 24 }, children: _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043A\u0440\u0438\u043F\u0442 \u0441\u043B\u0435\u0432\u0430, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0443, \u0432\u0435\u0440\u0441\u0438\u0438 \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F." }) }) }))] }), _jsx(UpsellRulesTable, {}), editorMode && (_jsx(EditorDialog, { template: editorTemplate, isNew: editorMode !== 'edit', draftInfo: { fromAi: editorMode === 'ai' }, onClose: closeEditor, onSaved: handleEditorSaved })), showLibrary && (_jsx(LibraryDialog, { onClose: () => setShowLibrary(false), onCreated: handlePresetCreated, onUseDraft: handleAiDraft }))] }));
}

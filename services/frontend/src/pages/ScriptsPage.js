import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi } from '@/api/scripts';
import { useTerms } from '@/lib/terms';
import { adminApi } from '@/api/admin';
import { dashboardApi } from '@/api/dashboard';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Save, X, PlayCircle, Loader, History, MapPin, Edit3, RotateCcw, GitCompare, Sparkles, BookOpen, HelpCircle, Check, FileText, FileUp, Lightbulb, Minus, } from 'lucide-react';
import { MultiSelect } from '@/components/scripts/MultiSelect';
import { HelpTooltip } from '@/components/scripts/HelpTooltip';
import { HelpModal } from '@/components/scripts/HelpModal';
import { ScoreFormula, SellerHeatmap, w2 } from '@/components/scripts/ScriptBreakdown';
import { Meter } from '@/components/ui/Meter';
import { PageActions, PageSubtitle } from '@/components/layout/PageHeader';
import { t, L, locale, plural } from '@/i18n';
import { StructuralDiff } from '@/components/scripts/StructuralDiff';
import { CommandPalette } from '@/components/scripts/CommandPalette';
import { SkeletonScriptCard, SkeletonAnalyticsRow } from '@/components/scripts/Skeleton';
// ─── helpers ─────────────────────────────────────────────────────────────────
const emptyStep = (order) => ({
    name: 'Новый этап',
    description: '',
    weight: 0.1,
    order,
    is_required: true,
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
// ─── Step row (без блока «Рекомендация продавцу») ────────────────────────────
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
    return (_jsxs("div", { className: "step-card", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', color: 'var(--text-muted)' }, children: [_jsx("button", { className: "btn-icon", onClick: onMoveUp, disabled: index === 0, title: "\u0412\u044B\u0448\u0435", style: { padding: 2 }, children: _jsx(ChevronUp, { size: 14 }) }), _jsx(GripVertical, { size: 14, style: { alignSelf: 'center', opacity: 0.5 } }), _jsx("button", { className: "btn-icon", onClick: onMoveDown, disabled: index === totalSteps - 1, title: "\u041D\u0438\u0436\u0435", style: { padding: 2 }, children: _jsx(ChevronDown, { size: 14 }) })] }), _jsx("div", { className: "step-number", children: index + 1 }), _jsx("input", { className: "form-input", value: step.name, onChange: (e) => onChange({ ...step, name: e.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u044D\u0442\u0430\u043F\u0430", style: { flex: 1 } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("input", { className: "form-input", type: "number", step: 1, min: 0, max: 100, value: Math.round(step.weight * 100), onChange: (e) => onChange({ ...step, weight: Number(e.target.value) / 100 }), title: "\u0412\u0435\u0441 \u044D\u0442\u0430\u043F\u0430 \u0432 \u043F\u0440\u043E\u0446\u0435\u043D\u0442\u0430\u0445", style: { width: 64, padding: '6px 8px', fontSize: 13 } }), _jsx("span", { style: { fontSize: 13, color: 'var(--text-muted)' }, children: "%" })] }), _jsx("div", { className: `toggle-switch ${step.is_required ? 'on' : ''}`, title: step.is_required ? 'Обязательный этап' : 'Опциональный', onClick: () => onChange({ ...step, is_required: !step.is_required }) }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setExpanded((v) => !v), title: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438 \u0444\u0440\u0430\u0437\u044B", children: expanded ? _jsxs(_Fragment, { children: [_jsx(ChevronUp, { size: 12, style: { marginRight: 3 } }), "\u0421\u043A\u0440\u044B\u0442\u044C"] }) : _jsxs(_Fragment, { children: [_jsx(ChevronDown, { size: 12, style: { marginRight: 3 } }), "\u0414\u0435\u0442\u0430\u043B\u0438"] }) }), _jsx("button", { className: "btn-icon", onClick: onDelete, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0430\u043F", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) })] }), expanded && (_jsxs("div", { style: { marginTop: 14, paddingLeft: 56, display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u044D\u0442\u0430\u043F\u0430 (\u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u0432 \u043F\u0440\u043E\u043C\u0442 LLM \u2014 \u043A\u0440\u0438\u0442\u0438\u0447\u043D\u043E \u0434\u043B\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438)" }), _jsx("textarea", { className: "form-input", value: step.description || '', onChange: (e) => onChange({ ...step, description: e.target.value }), placeholder: "\u0427\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u043D\u0430 \u044D\u0442\u043E\u043C \u044D\u0442\u0430\u043F\u0435", rows: 2 })] }), _jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0435 \u0444\u0440\u0430\u0437\u044B (\u043F\u0440\u0438\u043C\u0435\u0440\u044B \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F)" }), _jsxs("div", { className: "chip-field", style: { marginBottom: 6 }, children: [(step.example_phrases || []).length === 0 && (_jsx("span", { className: "chip-placeholder", children: "\u0424\u0440\u0430\u0437 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442" })), (step.example_phrases || []).map((p, i) => (_jsxs("span", { className: "chip", children: ["\u00AB", p, "\u00BB", _jsx("button", { type: "button", onClick: () => removePhrase(i), "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 11 }) })] }, i)))] }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("input", { className: "form-input", value: newPhrase, onChange: (e) => setNewPhrase(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addPhrase();
                                        } }, placeholder: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u0438\u043C\u0435\u0440 \u0438 Enter", style: { flex: 1 } }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: addPhrase, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] })] })] }))] }));
}
// ─── AssignmentsBlock ────────────────────────────────────────────────────────
function AssignmentsBlock({ template }) {
    const queryClient = useQueryClient();
    const templateId = template.id;
    const terms = useTerms();
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
        queryClient.invalidateQueries({ queryKey: ['script-templates'] });
    };
    const bulkStoresMut = useMutation({
        mutationFn: (ids) => scriptsApi.bulkSetStoreAssignments(templateId, ids),
        onSuccess: invalidate,
    });
    const bulkSellersMut = useMutation({
        mutationFn: (ids) => scriptsApi.bulkSetSellerAssignments(templateId, ids),
        onSuccess: invalidate,
    });
    const patchAllStoresMut = useMutation({
        mutationFn: (v) => scriptsApi.patchTemplate(templateId, { applies_to_all_stores: v }),
        onSuccess: invalidate,
    });
    const selectedStoreIds = (storeAssignments || []).map((a) => a.store_id);
    const selectedSellerIds = (sellerAssignments || []).map((a) => a.seller_id);
    const storeOptions = (stores?.items || []).map((s) => ({ id: s.id, label: s.name }));
    const allStores = !!template.applies_to_all_stores;
    // Список продавцов фильтруется по выбранным магазинам, чтобы нельзя было
    // случайно назначить менеджера, не относящегося к скриптовому магазину.
    // Если включено "все магазины" — фильтрация не применяется.
    const selectedStoreIdSet = new Set(selectedStoreIds);
    const sellerOptions = (sellers?.items || [])
        .filter((s) => allStores || (s.store_id && selectedStoreIdSet.has(s.store_id)))
        .map((s) => ({
        id: s.id,
        label: `${s.first_name} ${s.last_name}`.trim() || s.id.slice(0, 8),
        sublabel: s.store_name,
    }));
    return (_jsxs("div", { className: "assignments-card", children: [_jsxs("div", { className: "assignments-title", children: [_jsx(MapPin, { size: 14 }), " \u0413\u0434\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F", _jsx(HelpTooltip, { content: _jsxs("div", { style: { maxWidth: 280 }, children: ["\u041D\u0430\u0437\u043D\u0430\u0447\u044C\u0442\u0435 \u0441\u043A\u0440\u0438\u043F\u0442 ", _jsx("strong", { children: terms.isTelephony ? 'отделу' : 'магазину' }), " \u2014 \u043E\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u043A\u043E \u0432\u0441\u0435\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C \u0432 \u044D\u0442\u043E\u043C ", terms.isTelephony ? 'отделе' : 'магазине', ". \u041C\u043E\u0436\u043D\u043E \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C ", _jsx("strong", { children: "\u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0445 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432" }), ", \u0435\u0441\u043B\u0438 \u0441\u043A\u0440\u0438\u043F\u0442 \u043D\u0443\u0436\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u043C."] }) })] }), _jsx("div", { className: "all-stores-toggle", children: _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { type: "checkbox", checked: allStores, onChange: (e) => patchAllStoresMut.mutate(e.target.checked) }), _jsxs("span", { children: [_jsxs("strong", { children: ["\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u043A\u043E \u0432\u0441\u0435\u043C ", terms.isTelephony ? 'отделам' : 'магазинам', " \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438"] }), _jsx("span", { style: { fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 2 }, children: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u2014 \u0438\u043D\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u043D\u0438\u0436\u0435 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442\u0441\u044F, \u0441\u043A\u0440\u0438\u043F\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0432\u0435\u0437\u0434\u0435." })] })] }) }), _jsxs("div", { style: { marginBottom: 12, opacity: allStores ? 0.5 : 1, pointerEvents: allStores ? 'none' : 'auto' }, children: [_jsx("label", { className: "field-label", children: terms.storePlural }), _jsx(MultiSelect, { options: storeOptions, selected: selectedStoreIds, onChange: (ids) => bulkStoresMut.mutate(ids), placeholder: `Выберите один или несколько ${terms.isTelephony ? 'отделов' : 'магазинов'}`, selectAllLabel: `Выбрать все ${terms.storePlural.toLowerCase()}` })] }), _jsxs("div", { children: [_jsxs("label", { className: "field-label", children: ["\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u044B (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)", _jsx(HelpTooltip, { content: `Нужно, если скрипт обязателен не для всего ${terms.isTelephony ? 'отдела' : 'магазина'}, а только для конкретных людей.` })] }), _jsx(MultiSelect, { options: sellerOptions, selected: selectedSellerIds, onChange: (ids) => bulkSellersMut.mutate(ids), placeholder: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)", selectAllLabel: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0435\u0445" })] })] }));
}
// ─── Template editor ─────────────────────────────────────────────────────────
function TemplateEditor({ template, onSaved, onShowHelp, }) {
    const queryClient = useQueryClient();
    const terms = useTerms();
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
            // short_name автогенерируется на бэке (LLM + heuristic), фронт его не задаёт
            const payload = {
                name,
                description,
                scope: 'org_level',
                context_description: null,
                steps,
            };
            if (isNew)
                return scriptsApi.createTemplate(payload);
            return scriptsApi.replaceTemplate(template.id, payload);
        },
        onSuccess: (saved) => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', saved.id] });
            queryClient.invalidateQueries({ queryKey: ['template-versions', saved.id] });
            queryClient.invalidateQueries({ queryKey: ['template-analytics', saved.id] });
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
    return (_jsxs("div", { className: "editor-flex", children: [_jsxs("div", { className: "editor-body", children: [isNew && (_jsxs("div", { className: "editor-hint", children: [_jsx(BookOpen, { size: 13 }), _jsxs("span", { children: ["\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u044D\u0442\u0430\u043F\u044B \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u2014 \u043F\u043E\u0442\u043E\u043C \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442 ", terms.isTelephony ? 'отделам' : 'магазинам', " \u0438 \u043F\u0440\u043E\u0442\u0435\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438."] }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: onShowHelp, style: { marginLeft: 'auto' }, children: [_jsx(HelpCircle, { size: 12 }), " \u041F\u043E\u043C\u043E\u0449\u044C"] })] })), _jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("label", { className: "field-label", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("input", { className: "form-input", value: name, onChange: (e) => setName(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439 \u0441\u043A\u0440\u0438\u043F\u0442 \u043F\u0440\u043E\u0434\u0430\u0436 \u0431\u044B\u0442\u043E\u0432\u043E\u0439 \u0442\u0435\u0445\u043D\u0438\u043A\u0438" })] }), _jsxs("div", { style: { marginBottom: 18 }, children: [_jsx("label", { className: "field-label", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 (\u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u043D\u0435 \u0434\u043B\u044F LLM)" }), _jsx("textarea", { className: "form-input", value: description || '', onChange: (e) => setDescription(e.target.value), rows: 2, placeholder: "\u041A\u0440\u0430\u0442\u043A\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u2014 \u0434\u043B\u044F \u0447\u0435\u0433\u043E \u044D\u0442\u043E\u0442 \u0441\u043A\u0440\u0438\u043F\u0442" })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)' }, children: "\u042D\u0442\u0430\u043F\u044B" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsxs("span", { style: { fontSize: 12, color: weightsOk ? 'var(--success)' : 'var(--danger)' }, children: ["\u0421\u0443\u043C\u043C\u0430 \u0432\u0435\u0441\u043E\u0432: ", Math.round(weightsSum * 100), "% ", weightsOk ? '✓' : '(должно быть 100%)'] }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setSteps(normalizeWeights(steps)), disabled: steps.length === 0, title: "\u041F\u0440\u0438\u0432\u0435\u0441\u0442\u0438 \u0432\u0435\u0441\u0430 \u043A 100%", children: "\u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u0442\u044C" }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: addStep, children: [_jsx(Plus, { size: 12 }), " \u042D\u0442\u0430\u043F"] })] })] }), _jsxs("div", { children: [steps.map((s, i) => (_jsx(StepRow, { step: s, index: i, totalSteps: steps.length, onChange: (next) => updateStep(i, next), onDelete: () => removeStep(i), onMoveUp: () => move(i, -1), onMoveDown: () => move(i, 1) }, s.id || `tmp-${i}`))), steps.length === 0 && (_jsxs("div", { className: "empty-state-card", children: [_jsx(BookOpen, { size: 28, style: { opacity: 0.4, marginBottom: 8 } }), _jsx("p", { style: { marginBottom: 12 }, children: "\u042D\u0442\u0430\u043F\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442" }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: addStep, children: [_jsx(Plus, { size: 12 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u0439 \u044D\u0442\u0430\u043F"] })] }))] })] }), _jsxs("div", { className: "editor-footer-sticky", children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: weightsOk
                            ? _jsx(_Fragment, { children: "\u0413\u043E\u0442\u043E\u0432\u043E \u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044E" })
                            : _jsx(_Fragment, { children: "\u26A0 \u0412\u0435\u0441\u0430 \u0434\u043E\u043B\u0436\u043D\u044B \u0434\u0430\u0432\u0430\u0442\u044C \u0432 \u0441\u0443\u043C\u043C\u0435 100%" }) }), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsxs("button", { className: "btn btn-outline", disabled: steps.length === 0, onClick: () => setShowTestDialog(true), title: "\u041F\u0440\u043E\u0433\u043D\u0430\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0447\u0435\u0440\u0435\u0437 LLM \u043D\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438", children: [_jsx(PlayCircle, { size: 14 }), " \u0422\u0435\u0441\u0442 \u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u0438"] }), _jsxs("button", { className: "btn btn-primary", onClick: () => saveMutation.mutate(), disabled: saveMutation.isPending || !name.trim() || steps.length === 0 || !weightsOk, children: [_jsx(Save, { size: 14 }), " ", saveMutation.isPending ? 'Сохранение…' : (isNew ? 'Создать скрипт' : 'Сохранить')] })] })] }), showTestDialog && (_jsx(LiveTestDialog, { draft: { name: name || 'Черновик', steps }, onClose: () => setShowTestDialog(false) }))] }));
}
// ─── Upsell / Cross-sell rules ───────────────────────────────────────────────
function RulesTable({ kind }) {
    const queryClient = useQueryClient();
    const isUpsell = kind === 'upsell';
    const terms = useTerms();
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data: sellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() });
    const queryKey = isUpsell ? ['upsell-rules'] : ['cross-sell-rules'];
    const { data, isLoading } = useQuery({
        queryKey,
        queryFn: async () => isUpsell
            ? await scriptsApi.listUpsellRules()
            : await scriptsApi.listCrossSellRules(),
    });
    const rules = data || [];
    const invalidate = () => queryClient.invalidateQueries({ queryKey });
    const createMut = useMutation({
        mutationFn: () => (isUpsell ? scriptsApi.createUpsellRule : scriptsApi.createCrossSellRule)({
            store_ids: [],
            seller_ids: [],
            trigger_product: 'Новый продукт',
            required_offers: [],
            is_active: false,
        }),
        onSuccess: invalidate,
    });
    const patchMut = useMutation({
        mutationFn: ({ id, data }) => isUpsell ? scriptsApi.patchUpsellRule(id, data) : scriptsApi.patchCrossSellRule(id, data),
        onSuccess: invalidate,
    });
    const delMut = useMutation({
        mutationFn: (id) => isUpsell ? scriptsApi.deleteUpsellRule(id) : scriptsApi.deleteCrossSellRule(id),
        onSuccess: invalidate,
    });
    return (_jsxs("div", { className: "card fade-in", children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsxs("div", { className: "card-title", style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [isUpsell ? 'Правила апсейла' : 'Правила кросс-сейла', _jsx(HelpTooltip, { size: 14, content: _jsx("div", { style: { maxWidth: 280 }, children: isUpsell ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: "\u0410\u043F\u0441\u0435\u0439\u043B" }), " \u2014 ", terms.isCafe ? 'больший объём или более дорогой напиток.' : terms.isPharmacy ? 'упаковка побольше на курс или форма быстрого действия.' : 'продажа более дорогой версии того же продукта.', _jsx("br", {}), terms.isCafe ? 'Пример: гость заказал капучино 0,3 — бариста предлагает 0,4.' : terms.isPharmacy ? 'Пример: покупатель берёт ибупрофен 10 таблеток — фармацевт предлагает упаковку 20, на курс она выгоднее.' : 'Пример: клиент пришёл за iPhone 15 — продавец предлагает 15 Pro.'] })) : (_jsxs(_Fragment, { children: [_jsx("strong", { children: "\u041A\u0440\u043E\u0441\u0441-\u0441\u0435\u0439\u043B" }), " \u2014 ", terms.isCafe ? 'еда или добавка к напитку.' : terms.isPharmacy ? 'то, что усиливает лечение или нужно к покупке.' : 'предложение сопутствующих товаров к основной покупке.', _jsx("br", {}), terms.isCafe ? 'Пример: к кофе бариста предлагает круассан или сироп.' : terms.isPharmacy ? 'Пример: к средству от простуды фармацевт предлагает спрей для горла.' : 'Пример: клиент берёт ноутбук — продавец обязан предложить сумку и мышь.'] })) }) })] }), _jsxs("div", { className: "card-subtitle", children: [terms.isCafe
                                        ? 'Проверяется в каждом разговоре: если гость заказал триггер-продукт, бариста должен предложить указанные позиции.'
                                        : `Проверяется в каждом разговоре: если упомянут триггер-продукт, ${terms.sellerLower[0]} должен предложить указанные товары.`, _jsx("span", { style: { opacity: 0.7 }, children: " \u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u0440\u0438 \u043F\u043E\u0442\u0435\u0440\u0435 \u0444\u043E\u043A\u0443\u0441\u0430 \u043F\u043E\u043B\u044F." })] })] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: () => createMut.mutate(), children: [_jsx(Plus, { size: 14 }), " \u041F\u0440\u0430\u0432\u0438\u043B\u043E"] })] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0422\u0440\u0438\u0433\u0433\u0435\u0440-\u043F\u0440\u043E\u0434\u0443\u043A\u0442" }), _jsx("th", { children: isUpsell ? 'Обязательные предложения' : 'Сопутствующие товары' }), _jsx("th", { style: { minWidth: 150 }, children: terms.storePlural }), _jsx("th", { style: { minWidth: 140 }, children: terms.sellerPlural }), _jsx("th", { style: { width: 72 }, children: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E" }), _jsx("th", { style: { width: 50 } })] }) }), _jsxs("tbody", { children: [rules.map((r) => (_jsx(RuleRow, { rule: r, stores: stores?.items || [], sellers: sellers?.items || [], onPatch: (data) => patchMut.mutate({ id: r.id, data }), onDelete: () => { if (confirm('Удалить правило?'))
                                        delMut.mutate(r.id); } }, r.id))), isLoading && rules.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 12 }, children: _jsx(SkeletonAnalyticsRow, {}) }) })), !isLoading && rules.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-muted)', padding: 20 }, children: isUpsell
                                            ? `Правил апсейла пока нет. Добавьте первое — анализ начнёт отмечать разговоры, где ${terms.sellerLower[0]} не предложил апсейл.`
                                            : `Правил кросс-сейла пока нет. Например: ${terms.isCafe ? 'к кофе — круассан или сироп' : terms.isPharmacy ? 'к средству от простуды — спрей для горла' : 'к ноутбуку — сумка и мышь'}.` }) }))] })] }) })] }));
}
function RuleRow({ rule, stores, sellers, onPatch, onDelete }) {
    const [trigger, setTrigger] = useState(rule.trigger_product);
    const terms = useTerms();
    const [offers, setOffers] = useState(rule.required_offers.join(', '));
    const [saved, setSaved] = useState(false);
    useEffect(() => setTrigger(rule.trigger_product), [rule.trigger_product]);
    useEffect(() => setOffers(rule.required_offers.join(', ')), [rule.required_offers]);
    const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };
    const commitTrigger = () => {
        const v = trigger.trim();
        if (v && v !== rule.trigger_product) {
            onPatch({ trigger_product: v });
            flash();
        }
    };
    const commitOffers = () => {
        const arr = offers.split(',').map((s) => s.trim()).filter(Boolean);
        const same = arr.length === rule.required_offers.length &&
            arr.every((o, i) => o === rule.required_offers[i]);
        if (!same) {
            onPatch({ required_offers: arr });
            flash();
        }
    };
    const storeOptions = stores.map((s) => ({ id: s.id, label: s.name }));
    const selectedStoreIds = rule.store_ids || [];
    // Менеджеры фильтруются по выбранным магазинам (если магазины заданы)
    const sellerPool = selectedStoreIds.length
        ? sellers.filter((s) => selectedStoreIds.includes(s.store_id))
        : sellers;
    const sellerOptions = sellerPool.map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name}` }));
    const selectedSellerIds = rule.seller_ids || [];
    return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500 }, children: _jsx("input", { className: "form-input", value: trigger, onChange: (e) => setTrigger(e.target.value), onBlur: commitTrigger, style: { padding: '6px 10px' } }) }), _jsx("td", { children: _jsx("input", { className: "form-input", value: offers, onChange: (e) => setOffers(e.target.value), onBlur: commitOffers, placeholder: "\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E", style: { padding: '6px 10px' } }) }), _jsx("td", { children: _jsx(MultiSelect, { options: storeOptions, selected: selectedStoreIds, onChange: (ids) => {
                        // При смене магазинов отбрасываем менеджеров, которых больше нет в покрытых магазинах
                        const allowed = ids.length
                            ? sellers.filter((s) => ids.includes(s.store_id)).map((s) => s.id)
                            : sellers.map((s) => s.id);
                        const nextSellers = selectedSellerIds.filter((id) => allowed.includes(id));
                        const patch = { store_ids: ids };
                        if (nextSellers.length !== selectedSellerIds.length)
                            patch.seller_ids = nextSellers;
                        onPatch(patch);
                        flash();
                    }, selectAllLabel: terms.allStores, placeholder: terms.allStores }) }), _jsx("td", { children: _jsx(MultiSelect, { options: sellerOptions, selected: selectedSellerIds, onChange: (ids) => { onPatch({ seller_ids: ids }); flash(); }, selectAllLabel: `Все ${terms.sellerPlural.toLowerCase()}`, placeholder: `Все ${terms.sellerPlural.toLowerCase()}` }) }), _jsx("td", { children: _jsx("div", { className: `toggle-switch ${rule.is_active ? 'on' : ''}`, onClick: () => { onPatch({ is_active: !rule.is_active }); flash(); } }) }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }, children: [saved && _jsx("span", { style: { fontSize: 11, color: 'var(--success)', whiteSpace: 'nowrap' }, children: "\u2713 \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E" }), _jsx("button", { className: "btn-icon", onClick: onDelete, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) })] }) })] }));
}
// ─── Objection types (настраиваемый справочник типов возражений) ─────────────
function ObjectionTypesTable() {
    const queryClient = useQueryClient();
    const { data: items, isLoading } = useQuery({
        queryKey: ['objection-types'],
        queryFn: () => scriptsApi.listObjectionTypes(),
    });
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['objection-types'] });
    const createMut = useMutation({ mutationFn: scriptsApi.createObjectionType, onSuccess: invalidate });
    const patchMut = useMutation({
        mutationFn: ({ id, data }) => scriptsApi.patchObjectionType(id, data),
        onSuccess: invalidate,
    });
    const deleteMut = useMutation({ mutationFn: scriptsApi.deleteObjectionType, onSuccess: invalidate });
    const [newLabel, setNewLabel] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const addType = () => {
        if (!newLabel.trim())
            return;
        createMut.mutate({
            label: newLabel.trim(),
            description: newDescription.trim(),
        }, {
            onSuccess: () => { setNewLabel(''); setNewDescription(''); },
        });
    };
    if (isLoading)
        return _jsx("div", { style: { padding: 20, color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    return (_jsxs("div", { className: "card", style: { padding: 16 }, children: [_jsx("div", { style: { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }, children: "AI \u043A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u0435\u0442 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u043F\u043E \u044D\u0442\u0438\u043C \u0442\u0438\u043F\u0430\u043C. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0441\u0432\u043E\u0438 \u043E\u0442\u0440\u0430\u0441\u043B\u0435\u0432\u044B\u0435 \u0442\u0438\u043F\u044B \u2014 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 AI, \u043A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C \u0442\u0438\u043F. \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u0442\u0438\u043F\u044B \u043D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C, \u043D\u043E \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C." }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: 220 }, children: "\u0422\u0438\u043F" }), _jsx("th", { children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 (\u043A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C)" }), _jsx("th", { style: { width: 70 }, children: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D" }), _jsx("th", { style: { width: 50 } })] }) }), _jsxs("tbody", { children: [(items || []).map((t) => (_jsx(ObjectionTypeRow, { item: t, onPatch: (data) => patchMut.mutate({ id: t.id, data }), onDelete: () => {
                                        if (confirm(`Удалить тип «${t.label}»?`))
                                            deleteMut.mutate(t.id);
                                    } }, t.id))), _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { className: "form-input", placeholder: "\u041D\u043E\u0432\u044B\u0439 \u0442\u0438\u043F...", value: newLabel, onChange: (e) => setNewLabel(e.target.value), style: { padding: '6px 10px' } }) }), _jsx("td", { children: _jsx("input", { className: "form-input", placeholder: "\u041A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C", value: newDescription, onChange: (e) => setNewDescription(e.target.value), style: { padding: '6px 10px' } }) }), _jsx("td", { colSpan: 2, children: _jsxs("button", { className: "btn btn-primary btn-sm", onClick: addType, disabled: !newLabel.trim() || createMut.isPending, children: [_jsx(Plus, { size: 12 }), " ", createMut.isPending ? '...' : 'Добавить'] }) })] })] })] }) }), createMut.isError && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 8 }, children: createMut.error?.response?.data?.detail || 'Не удалось добавить тип' }))] }));
}
function ObjectionTypeRow({ item, onPatch, onDelete }) {
    const [label, setLabel] = useState(item.label);
    const [description, setDescription] = useState(item.description);
    const [saved, setSaved] = useState(false);
    useEffect(() => setLabel(item.label), [item.label]);
    useEffect(() => setDescription(item.description), [item.description]);
    const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };
    const commitLabel = () => {
        const v = label.trim();
        if (v && v !== item.label) {
            onPatch({ label: v });
            flash();
        }
    };
    const commitDescription = () => {
        if (description.trim() !== item.description) {
            onPatch({ description: description.trim() });
            flash();
        }
    };
    return (_jsxs("tr", { style: { opacity: item.is_active ? 1 : 0.55 }, children: [_jsxs("td", { children: [_jsx("input", { className: "form-input", value: label, onChange: (e) => setLabel(e.target.value), onBlur: commitLabel, style: { padding: '6px 10px', fontWeight: 500 } }), item.is_default && (_jsx("div", { style: { fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 2 }, children: "\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439" }))] }), _jsx("td", { children: _jsx("input", { className: "form-input", value: description, onChange: (e) => setDescription(e.target.value), onBlur: commitDescription, style: { padding: '6px 10px' } }) }), _jsx("td", { children: _jsx("div", { className: `toggle-switch ${item.is_active ? 'on' : ''}`, onClick: () => { onPatch({ is_active: !item.is_active }); flash(); } }) }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }, children: [saved && _jsx("span", { style: { fontSize: 11, color: 'var(--success)', whiteSpace: 'nowrap' }, children: "\u2713" }), !item.is_default && (_jsx("button", { className: "btn-icon", onClick: onDelete, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) }))] }) })] }));
}
// ─── LibraryDialog ───────────────────────────────────────────────────────────
const INDUSTRY_LABELS = {
    electronics: 'Электроника',
    clothing: 'Одежда',
    cosmetics: 'Косметика и парфюмерия',
    furniture: 'Мебель',
    telecom: 'Связь и телеком',
    generic: 'Универсальный',
};
function industryLabel(value) {
    if (!value)
        return '';
    return INDUSTRY_LABELS[value] || value;
}
function LibraryDialog({ onClose, onCreated, onUseDraft, onUseDocDraft, }) {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState('library');
    const docFileRef = useRef(null);
    const [docFile, setDocFile] = useState(null);
    const importMut = useMutation({
        mutationFn: (file) => scriptsApi.importDocument(file),
        onSuccess: (draft) => {
            onUseDocDraft({
                name: draft.name_suggestion,
                description: draft.description_suggestion,
                full_text: draft.full_text,
                source_document_name: draft.file_name,
                blocks: draft.blocks,
            });
            onClose();
        },
    });
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
    return (_jsx(ModalOverlay, { onClose: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", children: [_jsxs("div", { className: "modal-header", children: [_jsx("div", { className: "modal-title", children: "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("button", { className: "btn-icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-tabs", children: [_jsxs("div", { className: `modal-tab ${tab === 'library' ? 'active' : ''}`, onClick: () => setTab('library'), children: [_jsx(BookOpen, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0418\u0437 \u0433\u043E\u0442\u043E\u0432\u043E\u0433\u043E \u0448\u0430\u0431\u043B\u043E\u043D\u0430"] }), _jsxs("div", { className: `modal-tab ${tab === 'ai' ? 'active' : ''}`, onClick: () => setTab('ai'), children: [_jsx(Sparkles, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441 AI"] }), _jsxs("div", { className: `modal-tab ${tab === 'document' ? 'active' : ''}`, onClick: () => setTab('document'), children: [_jsx(FileText, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0418\u0437 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430"] })] }), _jsxs("div", { className: "modal-body", children: [tab === 'library' && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0440\u0430\u0441\u043B\u0435\u0432\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u2014 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D \u043A\u0430\u043A \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043C\u043E\u0436\u043D\u043E \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C." }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, children: [(presets || []).map((p) => (_jsxs("div", { className: "preset-card", onClick: () => createFromPresetMut.mutate(p.id), children: [_jsx("div", { className: "preset-name", children: p.name }), _jsxs("div", { className: "preset-meta", children: [p.step_count, " \u044D\u0442\u0430\u043F\u043E\u0432 \u00B7 ", industryLabel(p.industry)] }), _jsx("div", { className: "preset-desc", children: p.description })] }, p.id))), (!presets || presets.length === 0) && (_jsx("div", { style: { gridColumn: '1 / -1', color: 'var(--text-muted)', textAlign: 'center', padding: 20 }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }))] }), createFromPresetMut.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }, children: "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435..." }))] })), tab === 'ai' && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }, children: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u2014 LLM \u0441\u043E\u0431\u0435\u0440\u0451\u0442 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043A\u0440\u0438\u043F\u0442\u0430 (\u044D\u0442\u0430\u043F\u044B, \u0432\u0435\u0441\u0430, \u0444\u0440\u0430\u0437\u044B). \u0412\u044B \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u043E\u0434\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u043F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C." }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "field-label", children: "\u0422\u0435\u043C\u0430 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("input", { className: "form-input", value: topic, onChange: (e) => setTopic(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043F\u0440\u043E\u0434\u0430\u0436\u0430 \u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D\u043E\u0432 \u0432 \u0440\u043E\u0437\u043D\u0438\u0447\u043D\u043E\u043C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435" })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "field-label", children: "\u0418\u043D\u0434\u0443\u0441\u0442\u0440\u0438\u044F / \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), _jsx("input", { className: "form-input", value: industry, onChange: (e) => setIndustry(e.target.value), placeholder: "\u044D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u0438\u043A\u0430, \u043E\u0434\u0435\u0436\u0434\u0430, \u043C\u0435\u0431\u0435\u043B\u044C, \u043F\u0430\u0440\u0444\u044E\u043C\u0435\u0440\u0438\u044F..." })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "field-label", children: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u0436\u0435\u043B\u0430\u043D\u0438\u044F (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), _jsx("textarea", { className: "form-input", value: extraNotes, onChange: (e) => setExtraNotes(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0430\u043A\u0446\u0435\u043D\u0442 \u043D\u0430 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0438 '\u0434\u043E\u0440\u043E\u0433\u043E', \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0442\u044C \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0443", rows: 3 })] }), generateMut.isError && (_jsx("div", { style: {
                                        fontSize: 12, color: 'var(--danger)', marginTop: 8,
                                        padding: '8px 10px', background: 'var(--danger-light)',
                                        borderRadius: 6,
                                    }, children: (() => {
                                        const err = generateMut.error;
                                        const detail = err?.response?.data?.detail;
                                        const status = err?.response?.status;
                                        if (detail) {
                                            return `Ошибка${status ? ` (${status})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
                                        }
                                        if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
                                            return 'Таймаут запроса к LLM. Попробуйте уточнить тему и сгенерировать ещё раз.';
                                        }
                                        return err?.message || 'Не удалось сгенерировать. Попробуйте ещё раз или уточните описание.';
                                    })() }))] })), tab === 'document' && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0432\u0430\u0448 \u043F\u043E\u043B\u043D\u044B\u0439 \u0441\u043A\u0440\u0438\u043F\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u043C (DOCX, PDF, RTF, TXT) \u2014 AI \u0440\u0430\u0437\u043E\u0431\u044C\u0451\u0442 \u0435\u0433\u043E \u043D\u0430 \u0431\u043B\u043E\u043A\u0438, \u043F\u043E \u043A\u043E\u0442\u043E\u0440\u044B\u043C \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0431\u0443\u0434\u0435\u0442 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u0442\u044C, \u0447\u0442\u043E \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043F\u0440\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B \u043A\u043B\u0438\u0435\u043D\u0442\u0443. \u041F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C \u0432\u044B \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0437\u0431\u0438\u0432\u043A\u0443." }), _jsx("input", { ref: docFileRef, type: "file", accept: ".docx,.pdf,.rtf,.txt,.md", style: { display: 'none' }, onChange: (e) => setDocFile(e.target.files?.[0] || null) }), _jsxs("div", { style: {
                                        border: '2px dashed var(--border)', borderRadius: 8,
                                        padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                                    }, onClick: () => docFileRef.current?.click(), onDragOver: (e) => e.preventDefault(), onDrop: (e) => {
                                        e.preventDefault();
                                        const f = e.dataTransfer.files[0];
                                        if (f)
                                            setDocFile(f);
                                    }, children: [_jsx(FileUp, { size: 32, style: { color: 'var(--text-muted)', marginBottom: 10 } }), docFile ? (_jsxs("div", { style: { fontSize: 14, fontWeight: 500, color: 'var(--text)' }, children: [docFile.name, " ", _jsxs("span", { style: { color: 'var(--text-muted)', fontWeight: 400 }, children: ["\u00B7 ", (docFile.size / 1024).toFixed(0), " \u041A\u0411"] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }, children: "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0438\u043B\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430" }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }, children: "DOCX, PDF, RTF, TXT \u00B7 \u0434\u043E 20 \u041C\u0411" })] }))] }), importMut.isPending && (_jsxs("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Loader, { size: 13, className: "spin" }), " AI \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0430 \u0431\u043B\u043E\u043A\u0438 \u2014 \u044D\u0442\u043E \u043C\u043E\u0436\u0435\u0442 \u0437\u0430\u043D\u044F\u0442\u044C \u0434\u043E \u043C\u0438\u043D\u0443\u0442\u044B..."] })), importMut.isError && (_jsx("div", { style: {
                                        fontSize: 12, color: 'var(--danger)', marginTop: 12,
                                        padding: '8px 10px', background: 'var(--danger-light)', borderRadius: 6,
                                    }, children: (() => {
                                        const err = importMut.error;
                                        const detail = err?.response?.data?.detail;
                                        return typeof detail === 'string' ? detail : (err?.message || 'Не удалось импортировать документ');
                                    })() }))] }))] }), _jsx("div", { className: "modal-footer", children: tab === 'ai' ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary", disabled: !topic.trim() || generateMut.isPending, onClick: () => generateMut.mutate(), children: generateMut.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader, { size: 14, className: "spin" }), " \u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F..."] })) : (_jsxs(_Fragment, { children: [_jsx(Sparkles, { size: 14 }), " \u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C"] })) })] })) : tab === 'document' ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary", disabled: !docFile || importMut.isPending, onClick: () => docFile && importMut.mutate(docFile), children: importMut.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader, { size: 14, className: "spin" }), " \u0418\u043C\u043F\u043E\u0440\u0442..."] })) : (_jsxs(_Fragment, { children: [_jsx(FileUp, { size: 14 }), " \u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"] })) })] })) : (_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })) })] }) }));
}
// ─── Fulltext editor (полнотекстовый скрипт из документа) ────────────────────
const BLOCK_TYPE_LABELS = {
    greeting: 'Приветствие',
    identification: 'Представление',
    need_discovery: 'Потребности',
    presentation: 'Презентация',
    offer: 'Предложение',
    objection_response: 'Возражение',
    closing: 'Завершение',
    other: 'Блок',
};
function FulltextEditorDialog({ initial, templateId, onClose, onSaved, }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(initial.name);
    const [description, setDescription] = useState(initial.description || '');
    const [blocks, setBlocks] = useState(initial.blocks.map((b, i) => ({ key: `b-${i}`, title: b.title, text: b.text, block_type: b.block_type || 'other', is_mandatory: b.is_mandatory !== false })));
    const saveMut = useMutation({
        mutationFn: async () => {
            const payload = {
                name,
                description,
                scope: 'org_level',
                context_description: null,
                script_type: 'fulltext',
                steps: [],
                blocks: blocks.map((b, i) => ({
                    title: b.title || `Блок ${i + 1}`,
                    text: b.text,
                    block_type: b.block_type,
                    is_mandatory: b.is_mandatory,
                    block_order: i + 1,
                })),
                full_text: initial.full_text,
                source_document_name: initial.source_document_name,
            };
            if (templateId)
                return scriptsApi.replaceTemplate(templateId, payload);
            return scriptsApi.createTemplate(payload);
        },
        onSuccess: (saved) => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', saved.id] });
            onSaved(saved.id);
        },
    });
    const update = (key, patch) => setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
    const remove = (key) => setBlocks((prev) => prev.filter((b) => b.key !== key));
    const move = (idx, dir) => {
        setBlocks((prev) => {
            const next = [...prev];
            const j = idx + dir;
            if (j < 0 || j >= next.length)
                return prev;
            [next[idx], next[j]] = [next[j], next[idx]];
            return next;
        });
    };
    const addBlock = () => setBlocks((prev) => [...prev, { key: `n-${Date.now()}`, title: `Блок ${prev.length + 1}`, text: '', block_type: 'other', is_mandatory: true }]);
    const mandatoryCount = blocks.filter((b) => b.is_mandatory).length;
    return (_jsx("div", { className: "modal-overlay", children: _jsxs("div", { className: "modal-card editor-modal-card", children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", children: [_jsx(FileText, { size: 16, style: { marginRight: 6, verticalAlign: 'middle' } }), templateId ? 'Полнотекстовый скрипт' : 'Импорт полнотекстового скрипта', initial.source_document_name && (_jsxs("span", { style: { fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }, children: ["\u0438\u0437 ", initial.source_document_name] }))] }), _jsx("button", { className: "btn-icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-body", style: { display: 'flex', flexDirection: 'column', gap: 0 }, children: [initial.source_document_name ? (_jsxs("div", { style: { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }, children: ["AI \u0440\u0430\u0437\u0431\u0438\u043B \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0430 \u0431\u043B\u043E\u043A\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0437\u0431\u0438\u0432\u043A\u0443: ", _jsx("strong", { children: "\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435" }), " \u0431\u043B\u043E\u043A\u0438 \u043D\u0443\u0436\u043D\u044B \u0432 \u043A\u0430\u0436\u0434\u043E\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435. ", _jsx("strong", { children: "\u0421\u0438\u0442\u0443\u0430\u0442\u0438\u0432\u043D\u044B\u0435" }), " (\u043E\u0442\u0432\u0435\u0442\u044B \u043D\u0430 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F, \u0432\u0435\u0442\u043A\u0438 \u00AB\u0435\u0441\u043B\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u2026\u00BB) \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0432 \u0431\u0430\u043B\u043B\u0435, \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F \u0440\u0435\u0430\u043B\u044C\u043D\u043E \u0432\u043E\u0437\u043D\u0438\u043A\u043B\u0430 \u2014 \u0435\u0441\u043B\u0438 \u043A\u043B\u0438\u0435\u043D\u0442 \u0435\u0451 \u043D\u0435 \u0437\u0430\u0442\u0440\u043E\u043D\u0443\u043B, \u0431\u043B\u043E\u043A \u043D\u0435 \u0448\u0442\u0440\u0430\u0444\u0443\u0435\u0442\u0441\u044F. \u0422\u0435\u043A\u0441\u0442 \u0431\u043B\u043E\u043A\u0430 \u0441\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0441 \u0440\u0435\u0447\u044C\u044E \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430 \u0434\u043E\u0441\u043B\u043E\u0432\u043D\u043E \u0438 \u043F\u043E \u0441\u043C\u044B\u0441\u043B\u0443."] })) : (_jsxs("div", { style: {
                                fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5,
                                padding: '10px 12px', background: 'var(--bg)', borderRadius: 8,
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                            }, children: [_jsx(FileUp, { size: 15, style: { flexShrink: 0, marginTop: 1, color: 'var(--primary)' } }), _jsxs("span", { children: ["\u041F\u043E\u043B\u043D\u043E\u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0441\u043A\u0440\u0438\u043F\u0442: \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A\u0438 \u2014 \u0444\u0440\u0430\u0437\u044B \u0438 \u0441\u0435\u043A\u0446\u0438\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u0440\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C. ", _jsx("strong", { children: "\u0415\u0441\u043B\u0438 \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), " (DOCX, PDF, RTF, TXT) \u2014 \u0431\u044B\u0441\u0442\u0440\u0435\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0435\u0433\u043E \u0447\u0435\u0440\u0435\u0437 \u00ABAI / \u0428\u0430\u0431\u043B\u043E\u043D\u00BB \u2192 \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u00AB\u0418\u0437 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u00BB: AI \u0440\u0430\u0437\u043E\u0431\u044C\u0451\u0442 \u0442\u0435\u043A\u0441\u0442 \u043D\u0430 \u0431\u043B\u043E\u043A\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."] })] })), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 12, marginBottom: 16 }, children: [_jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsx("input", { className: "form-input", value: name, onChange: (e) => setName(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "field-label", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("input", { className: "form-input", value: description, onChange: (e) => setDescription(e.target.value) })] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, children: [_jsxs("div", { style: { fontWeight: 600, color: 'var(--text)' }, children: ["\u0411\u043B\u043E\u043A\u0438 \u0441\u043A\u0440\u0438\u043F\u0442\u0430", _jsxs("span", { style: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }, children: [blocks.length, " \u0432\u0441\u0435\u0433\u043E \u00B7 ", mandatoryCount, " \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0445"] })] }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: addBlock, children: [_jsx(Plus, { size: 12 }), " \u0411\u043B\u043E\u043A"] })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [blocks.map((b, i) => (_jsxs("div", { style: {
                                        border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
                                        background: b.is_mandatory ? 'transparent' : 'var(--bg)',
                                    }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }, children: [_jsx("span", { style: {
                                                        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                                                        minWidth: 18, textAlign: 'center',
                                                    }, children: i + 1 }), _jsx("input", { className: "form-input", value: b.title, onChange: (e) => update(b.key, { title: e.target.value }), style: { flex: 1, padding: '5px 10px', fontWeight: 500 }, placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0431\u043B\u043E\u043A\u0430" }), _jsx("select", { className: "form-input", value: b.block_type, onChange: (e) => update(b.key, { block_type: e.target.value }), style: { width: 140, padding: '5px 8px', fontSize: 12 }, children: Object.entries(BLOCK_TYPE_LABELS).map(([k, l]) => _jsx("option", { value: k, children: l }, k)) }), _jsxs("label", { className: "checkbox-row", style: { fontSize: 12, whiteSpace: 'nowrap', gap: 5 }, title: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u2014 \u043D\u0443\u0436\u0435\u043D \u0432\u0441\u0435\u0433\u0434\u0430. \u0421\u043D\u0438\u043C\u0438\u0442\u0435 \u0433\u0430\u043B\u043E\u0447\u043A\u0443 \u0434\u043B\u044F \u0441\u0438\u0442\u0443\u0430\u0442\u0438\u0432\u043D\u044B\u0445 \u0431\u043B\u043E\u043A\u043E\u0432 (\u043E\u0442\u0432\u0435\u0442 \u043D\u0430 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435): \u043E\u043D\u0438 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u044E\u0442\u0441\u044F, \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F \u0432\u043E\u0437\u043D\u0438\u043A\u043B\u0430 \u0432 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435.", children: [_jsx("input", { type: "checkbox", checked: b.is_mandatory, onChange: (e) => update(b.key, { is_mandatory: e.target.checked }) }), "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439"] }), _jsx("button", { className: "btn-icon", onClick: () => move(i, -1), disabled: i === 0, title: "\u0412\u044B\u0448\u0435", children: _jsx(ChevronUp, { size: 14 }) }), _jsx("button", { className: "btn-icon", onClick: () => move(i, 1), disabled: i === blocks.length - 1, title: "\u041D\u0438\u0436\u0435", children: _jsx(ChevronDown, { size: 14 }) }), _jsx("button", { className: "btn-icon", onClick: () => remove(b.key), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) })] }), _jsx("textarea", { className: "form-input", value: b.text, onChange: (e) => update(b.key, { text: e.target.value }), rows: Math.min(6, Math.max(2, Math.ceil(b.text.length / 90))), style: { fontSize: 13, lineHeight: 1.5 }, placeholder: "\u0422\u0435\u043A\u0441\u0442, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u0440\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C" })] }, b.key))), blocks.length === 0 && (_jsxs("div", { className: "empty-state-card", children: [_jsx(FileText, { size: 28, style: { opacity: 0.4, marginBottom: 8 } }), _jsx("p", { style: { marginBottom: 12 }, children: "\u0411\u043B\u043E\u043A\u043E\u0432 \u043D\u0435\u0442 \u2014 \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D" })] }))] }), saveMut.isError && (_jsx("div", { style: {
                                fontSize: 12, color: 'var(--danger)', marginTop: 12,
                                padding: '8px 10px', background: 'var(--danger-light)', borderRadius: 6,
                            }, children: (() => {
                                const err = saveMut.error;
                                const detail = err?.response?.data?.detail;
                                if (detail?.message)
                                    return detail.message;
                                return typeof detail === 'string' ? detail : (err?.message || 'Не удалось сохранить');
                            })() }))] }), _jsxs("div", { className: "modal-footer", children: [_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsxs("button", { className: "btn btn-primary", disabled: saveMut.isPending || !name.trim() || blocks.length === 0 || blocks.some((b) => !b.text.trim()), onClick: () => saveMut.mutate(), children: [_jsx(Save, { size: 14 }), " ", saveMut.isPending ? 'Сохранение…' : (templateId ? 'Сохранить' : 'Создать скрипт')] })] })] }) }));
}
// ─── LiveTestDialog ──────────────────────────────────────────────────────────
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
    return (_jsx(ModalOverlay, { onClose: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", children: [_jsx(PlayCircle, { size: 16, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0422\u0435\u0441\u0442 \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u043D\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438"] }), _jsx("button", { className: "btn-icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-body", children: [!result && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043F\u0438\u0441\u044C \u2014 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u043F\u0440\u043E\u0433\u043E\u043D\u0438\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 LLM, \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u0411\u0414." }), convsLoading && _jsx("div", { style: { color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }, children: [items.map((c) => {
                                            const isSelected = recordingId === c.recording_id;
                                            const date = c.analyzed_at || c.session_date;
                                            return (_jsxs("div", { className: "preset-card", onClick: () => setRecordingId(c.recording_id), style: {
                                                    borderColor: isSelected ? 'var(--primary)' : undefined,
                                                    background: isSelected ? 'rgba(37,99,235,0.04)' : undefined,
                                                }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsxs("div", { className: "preset-name", children: [c.seller_name || '—', " \u00B7 ", c.store_name || '—'] }), _jsx("div", { className: "preset-meta", children: date ? new Date(date).toLocaleString('ru-RU') : '' })] }), _jsxs("div", { className: "preset-meta", children: [c.topic || 'без темы', " \u00B7 \u0441\u043A\u043E\u0440\u0438\u043D\u0433 ", c.overall_score ?? '—', "%"] })] }, c.id));
                                        }), (!convsLoading && items.length === 0) && (_jsx("div", { style: { color: 'var(--text-muted)', textAlign: 'center', padding: 20 }, children: "\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u2014 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0430\u0443\u0434\u0438\u043E \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u00AB\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B\u00BB." }))] }), testMut.isError && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 12 }, children: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0442\u0435\u0441\u0442\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C." }))] })), result && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }, children: [_jsxs("div", { style: { fontSize: 28, fontWeight: 700, color: 'var(--primary)' }, children: [result.overall_score, "%"] }), _jsxs("div", { style: { color: 'var(--text-muted)', fontSize: 12 }, children: ["\u0418\u0442\u043E\u0433\u043E\u0432\u044B\u0439 \u0432\u0437\u0432\u0435\u0448\u0435\u043D\u043D\u044B\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433 \u00B7 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u043E\u0432: ", result.segment_count] })] }), _jsx("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "\u041F\u043E \u044D\u0442\u0430\u043F\u0430\u043C:" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }, children: result.step_scores.map((s, i) => (_jsxs("div", { style: {
                                            padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                                            background: 'var(--bg-card)',
                                        }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("div", { style: { fontWeight: 500 }, children: s.step_name }), _jsxs("div", { style: {
                                                            color: s.score >= 70 ? 'var(--success)' : s.score >= 40 ? 'var(--warn)' : 'var(--danger)',
                                                            fontWeight: 600, fontSize: 14,
                                                        }, children: [s.score, "% (\u0432\u0435\u0441 ", s.weight, ")"] })] }), s.evidence && (_jsxs("div", { style: { marginTop: 4, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }, children: ["\u00AB", s.evidence, "\u00BB"] })), !s.detected && (_jsx("div", { style: { marginTop: 4, fontSize: 12, color: 'var(--danger)' }, children: "\u041D\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D \u0432 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435" }))] }, i))) }), result.violations.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F:" }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: result.violations.map((v, i) => (_jsx("span", { className: "tag tag-danger", children: v }, i))) })] }))] }))] }), _jsx("div", { className: "modal-footer", children: !result ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { className: "btn btn-primary", disabled: !recordingId || testMut.isPending, onClick: () => recordingId && testMut.mutate(recordingId), children: testMut.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader, { size: 14, className: "spin" }), " \u041F\u0440\u043E\u0433\u043E\u043D... (\u0434\u043E 30 \u0441\u0435\u043A)"] })) : (_jsxs(_Fragment, { children: [_jsx(PlayCircle, { size: 14 }), " \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0442\u0435\u0441\u0442"] })) })] })) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-outline", onClick: () => setResult(null), children: "\u2190 \u0414\u0440\u0443\u0433\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C" }), _jsx("button", { className: "btn btn-primary", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })) })] }) }));
}
// ─── Versions ────────────────────────────────────────────────────────────────
function VersionsPanel({ templateId, onRestored }) {
    const queryClient = useQueryClient();
    const [showCompare, setShowCompare] = useState(false);
    const [selectedForCompare, setSelectedForCompare] = useState([]);
    const { data: versions, isLoading } = useQuery({
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
    const compareHint = selectedForCompare.length === 0
        ? 'Отметьте 2 версии — кликом по плитке или по чекбоксу — чтобы сравнить.'
        : selectedForCompare.length === 1
            ? 'Выбрана 1 версия. Отметьте ещё одну, чтобы открыть сравнение.'
            : 'Можно сравнить выбранные версии.';
    return (_jsxs("div", { children: [_jsxs("div", { className: "versions-toolbar", children: [_jsxs("div", { style: { fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }, children: [compareHint, _jsx(HelpTooltip, { content: _jsxs("div", { style: { maxWidth: 280 }, children: ["\u041A\u0430\u0436\u0434\u043E\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u043D\u043E\u0432\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E. \u0427\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u043D\u044B\u0439 diff \u0438 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043C\u0435\u0442\u0440\u0438\u043A \u2014 \u043E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 ", _jsx("strong", { children: "\u0440\u043E\u0432\u043D\u043E \u0434\u0432\u0435" }), " \u0432\u0435\u0440\u0441\u0438\u0438 (\u043A\u043B\u0438\u043A\u043E\u043C \u043F\u043E \u0441\u0442\u0440\u043E\u043A\u0435 \u0438\u043B\u0438 \u043F\u043E \u0447\u0435\u043A\u0431\u043E\u043A\u0441\u0443)."] }) })] }), _jsxs("button", { className: "btn btn-primary btn-sm", disabled: selectedForCompare.length !== 2, onClick: () => setShowCompare(true), children: [_jsx(GitCompare, { size: 14 }), " \u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C (", selectedForCompare.length, "/2)"] })] }), isLoading && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsx(SkeletonAnalyticsRow, {}), _jsx(SkeletonAnalyticsRow, {})] })), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [(versions || []).map((v, i) => {
                        const isCurrent = i === 0;
                        const checked = selectedForCompare.includes(v.version_number);
                        return (_jsxs("div", { className: `version-row ${checked ? 'version-row--checked' : ''}`, onClick: () => toggleCompare(v.version_number), role: "button", tabIndex: 0, onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                toggleCompare(v.version_number);
                            } }, children: [_jsx("span", { className: `big-check ${checked ? 'big-check--on' : ''}`, onClick: (e) => { e.stopPropagation(); toggleCompare(v.version_number); }, "aria-label": "\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u0432\u0435\u0440\u0441\u0438\u044E \u0434\u043B\u044F \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F", role: "checkbox", "aria-checked": checked, children: checked && _jsx(Check, { size: 14, strokeWidth: 3 }) }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontWeight: 600, fontSize: 13.5 }, children: ["v", v.version_number, isCurrent && _jsx("span", { className: "badge badge-success", style: { marginLeft: 8 }, children: "\u0442\u0435\u043A\u0443\u0449\u0430\u044F" })] }), _jsxs("div", { style: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }, children: [new Date(v.created_at).toLocaleString('ru-RU'), " \u00B7 ", v.note || 'без примечания'] })] }), !isCurrent && (_jsxs("button", { className: "btn btn-outline btn-sm", onClick: (e) => {
                                        e.stopPropagation();
                                        if (confirm(`Восстановить v${v.version_number}? Текущее состояние сохранится как новая версия.`))
                                            restoreMut.mutate(v.version_number);
                                    }, children: [_jsx(RotateCcw, { size: 13 }), " \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C"] }))] }, v.id));
                    }), !isLoading && (!versions || versions.length === 0) && (_jsxs("div", { className: "empty-state-card", children: [_jsx(History, { size: 24, style: { opacity: 0.4, marginBottom: 8 } }), _jsx("p", { children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0432\u0435\u0440\u0441\u0438\u0439 \u043F\u0443\u0441\u0442\u0430. \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u2014 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u0435\u0440\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C." })] }))] }), showCompare && selectedForCompare.length === 2 && (_jsx(CompareDialog, { templateId: templateId, versionA: Math.min(...selectedForCompare), versionB: Math.max(...selectedForCompare), onClose: () => setShowCompare(false) }))] }));
}
function CompareDialog({ templateId, versionA, versionB, onClose }) {
    const [days, setDays] = useState(30);
    const { data, isLoading } = useQuery({
        queryKey: ['template-compare', templateId, versionA, versionB, days],
        queryFn: () => scriptsApi.compareVersions(templateId, versionA, versionB, days),
    });
    const renderColumn = (v, label) => (_jsxs("div", { className: "compare-col", children: [_jsxs("div", { style: { fontWeight: 600, marginBottom: 12 }, children: [label, " (v", v.version_number, ")"] }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("div", { style: { fontSize: 26, fontWeight: 700 }, children: v.conversation_count }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }, children: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("div", { style: { fontSize: 22, fontWeight: 600, color: 'var(--primary)' }, children: v.avg_script_score != null ? `${v.avg_script_score}%` : '—' }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }, children: "\u0421\u0438\u043B\u044C\u043D\u044B\u0445 (\u226570%)" }), _jsx("div", { style: { fontSize: 18, fontWeight: 600, color: 'var(--success)' }, children: v.strong_count })] }));
    return (_jsx(ModalOverlay, { onClose: onClose, children: _jsxs("div", { className: "modal-card modal-card--wide", children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", children: [_jsx(GitCompare, { size: 16, style: { marginRight: 6, verticalAlign: 'middle' } }), "\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0432\u0435\u0440\u0441\u0438\u0439 v", versionA, " \u2194 v", versionB] }), _jsx("button", { className: "btn-icon", onClick: onClose, children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "modal-body", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u041C\u0435\u0442\u0440\u0438\u043A\u0438 \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043D\u044B \u043F\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C, \u0437\u0430\u0441\u043A\u043E\u0440\u0435\u043D\u043D\u044B\u043C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439." }), _jsxs("select", { className: "form-select", value: days, onChange: (e) => setDays(Number(e.target.value)), style: { width: 130, padding: '6px 30px 6px 10px', fontSize: 12.5 }, children: [_jsx("option", { value: 7, children: "7 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 30, children: "30 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 90, children: "90 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 180, children: "6 \u043C\u0435\u0441\u044F\u0446\u0435\u0432" }), _jsx("option", { value: 365, children: "\u0413\u043E\u0434" })] })] }), isLoading && _jsx("div", { style: { color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }), data && (_jsxs("div", { style: { display: 'flex', gap: 12, marginBottom: 16 }, children: [renderColumn(data.version_a, 'Версия A'), renderColumn(data.version_b, 'Версия B')] })), _jsxs("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }, children: ["\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u043D\u044B\u0439 diff", _jsx(HelpTooltip, { content: "\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u0430\u043F\u043E\u0432 \u0434\u0432\u0443\u0445 \u0432\u0435\u0440\u0441\u0438\u0439: \u0447\u0442\u043E \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E, \u0443\u0434\u0430\u043B\u0435\u043D\u043E \u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043E (\u0432\u0435\u0441, \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C, \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435, \u0444\u0440\u0430\u0437\u044B)." })] }), _jsx(StructuralDiff, { templateId: templateId, versionA: versionA, versionB: versionB })] }), _jsx("div", { className: "modal-footer", children: _jsx("button", { className: "btn btn-outline", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }) })] }) }));
}
// ─── ModalOverlay ────────────────────────────────────────────────────────────
function ModalOverlay({ onClose, children }) {
    const downTarget = React.useRef(null);
    return (_jsx("div", { className: "modal-overlay", onMouseDown: (e) => { downTarget.current = e.target; }, onClick: (e) => {
            if (e.target === e.currentTarget && downTarget.current === e.currentTarget)
                onClose();
        }, children: children }));
}
// ─── EditorDialog ────────────────────────────────────────────────────────────
function EditorDialog({ template, isNew, draftInfo, onClose, onSaved, onSwitchToFulltext, }) {
    const [resetKey, setResetKey] = useState(0);
    const [showHelp, setShowHelp] = useState(false);
    // Переключатель типа — только при создании нового скрипта вручную
    const showTypeSwitch = isNew && !draftInfo?.fromAi && !!onSwitchToFulltext;
    return (_jsxs("div", { className: "modal-overlay", children: [_jsxs("div", { className: "modal-card editor-modal-card", children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [isNew
                                        ? (draftInfo?.fromAi ? 'AI-черновик скрипта' : 'Новый скрипт')
                                        : (template?.name || 'Редактирование скрипта'), showTypeSwitch && (_jsxs("span", { style: { display: 'inline-flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 3 }, children: [_jsx("button", { className: "btn btn-sm", style: { background: 'var(--bg-card)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', fontWeight: 600, fontSize: 12 }, title: "\u0421\u043A\u0440\u0438\u043F\u0442 \u0438\u0437 \u044D\u0442\u0430\u043F\u043E\u0432 \u0441 \u0432\u0435\u0441\u0430\u043C\u0438 \u2014 \u043A\u043B\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0440\u0435\u0436\u0438\u043C", children: "\u042D\u0442\u0430\u043F\u043D\u044B\u0439" }), _jsxs("button", { className: "btn btn-sm", style: { background: 'transparent', color: 'var(--text-muted)', fontSize: 12 }, onClick: onSwitchToFulltext, title: "\u0421\u043A\u0440\u0438\u043F\u0442 \u0438\u0437 \u0431\u043B\u043E\u043A\u043E\u0432 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430 \u2014 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u0434\u043E\u0441\u043B\u043E\u0432\u043D\u043E\u0433\u043E \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F", children: [_jsx(FileText, { size: 12, style: { marginRight: 4, verticalAlign: 'middle' } }), "\u041F\u043E\u043B\u043D\u043E\u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439"] })] }))] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsxs("button", { className: "btn btn-outline btn-sm", onClick: () => setShowHelp(true), title: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430 \u043F\u043E \u043F\u043E\u043B\u044F\u043C \u0438 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u044E \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432", children: [_jsx(HelpCircle, { size: 13 }), " \u041F\u043E\u043C\u043E\u0449\u044C"] }), isNew && (_jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setResetKey((k) => k + 1), title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u043F\u043E\u043B\u044F \u0444\u043E\u0440\u043C\u044B", children: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C" })), _jsx("button", { className: "btn-icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 16 }) })] })] }), _jsx("div", { className: "modal-body", style: { padding: 0, display: 'flex', flexDirection: 'column' }, children: _jsx(TemplateEditor, { template: template, onSaved: (id) => onSaved(id), onShowHelp: () => setShowHelp(true) }, isNew ? (draftInfo?.fromAi ? `ai-${resetKey}` : `new-${resetKey}`) : (template?.id || 'none')) })] }), showHelp && _jsx(HelpModal, { mode: "editor", onClose: () => setShowHelp(false) })] }));
}
const WEIGHT_STEP = 0.05;
const round2 = (v) => Math.round(v * 100) / 100;
const stepKey = (s, i) => s.id || `i${i}`;
function ScriptView({ template, period, initialTab, onEdit, onDeleted, }) {
    const queryClient = useQueryClient();
    const terms = useTerms();
    const isFulltext = template.script_type === 'fulltext';
    const [tab, setTab] = useState(initialTab || 'stages');
    const [showVersions, setShowVersions] = useState(false);
    const [showTest, setShowTest] = useState(false);
    useEffect(() => { if (initialTab)
        setTab(initialTab); }, [initialTab]);
    useEffect(() => { setTab(initialTab || 'stages'); }, [template.id]);
    const { data: analytics } = useQuery({
        queryKey: ['template-analytics', template.id, period],
        queryFn: () => scriptsApi.getTemplateAnalytics(template.id, { days: period }),
    });
    const { data: breakdown } = useQuery({
        queryKey: ['script-breakdown', template.id, period],
        queryFn: () => dashboardApi.getScriptBreakdown(template.id, period),
        enabled: !isFulltext,
    });
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const stat = useMemo(() => new Map((analytics?.per_step || []).map((p) => [p.step_name, p])), [analytics]);
    const patchMut = useMutation({
        mutationFn: (is_active) => scriptsApi.patchTemplate(template.id, { is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', template.id] });
        },
    });
    const deleteMut = useMutation({
        mutationFn: () => scriptsApi.deleteTemplate(template.id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['script-templates'] }); onDeleted(); },
    });
    // Охват: на всю сеть, на магазины или на отдельных продавцов
    const storeNames = (template.assigned_stores || [])
        .map((a) => (stores?.items || []).find((s) => s.id === a.store_id)?.name)
        .filter(Boolean);
    const scope = template.applies_to_all_stores
        ? t('Уровень сети')
        : storeNames.length
            ? (storeNames.length <= 2 ? storeNames.join(', ') : L(`${storeNames.length} магазина`, `${storeNames.length} stores`))
            : (template.assigned_sellers || []).length
                ? L(`${template.assigned_sellers.length} продавцов`, `${template.assigned_sellers.length} sellers`)
                : t('Не назначен');
    const tabs = [
        { id: 'stages', label: isFulltext ? 'Блоки скрипта' : 'Этапы и веса' },
        ...(!isFulltext ? [{ id: 'sellers', label: terms.isCafe ? 'Выполнение по бариста' : terms.isPharmacy ? 'Выполнение по фармацевтам' : 'Выполнение по продавцам' }] : []),
        { id: 'assignments', label: 'Назначения' },
    ];
    return (_jsxs("section", { className: "panel sc-view", children: [_jsxs("div", { className: "sc-head", children: [_jsxs("div", { className: "sc-title-row", children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("h2", { className: "sc-title", translate: "no", children: template.name }), template.description && _jsx("p", { className: "sc-desc", translate: "no", children: template.description })] }), _jsxs("div", { className: "sc-actions", children: [_jsxs("button", { type: "button", className: "btn", onClick: () => setShowVersions(true), children: [_jsx(History, { size: 15, "aria-hidden": "true" }), t('Версии')] }), !isFulltext && (_jsxs("button", { type: "button", className: "btn", onClick: () => setShowTest(true), title: t('Прогнать черновик через LLM на реальной записи'), children: [_jsx(PlayCircle, { size: 15, "aria-hidden": "true" }), t('Тест на записи')] })), _jsxs("button", { type: "button", className: "btn btn-primary", onClick: onEdit, children: [_jsx(Edit3, { size: 15, "aria-hidden": "true" }), t('Редактировать')] })] })] }), _jsxs("div", { className: "sc-chips", children: [_jsxs("button", { type: "button", className: "flag is-info sc-chip-btn", onClick: () => setTab('assignments'), title: t('Назначения'), children: [_jsx(MapPin, { "aria-hidden": "true" }), _jsx("span", { translate: storeNames.length ? 'no' : undefined, children: scope })] }), _jsxs("button", { type: "button", role: "switch", "aria-checked": template.is_active, className: `flag ${template.is_active ? 'is-good' : 'is-plain'} sc-chip-btn`, onClick: () => patchMut.mutate(!template.is_active), title: template.is_active ? t('Деактивировать') : t('Активировать'), children: [_jsx("span", { className: `sc-dot ${template.is_active ? 'is-on' : ''}`, "aria-hidden": "true" }), template.is_active ? t('Активен') : t('Черновик')] }), isFulltext && (_jsxs("span", { className: "flag is-plain", title: template.source_document_name || undefined, children: [_jsx(FileText, { "aria-hidden": "true" }), L(`Полнотекстовый · ${(template.blocks || []).length} блоков`, `Full-text · ${(template.blocks || []).length} blocks`)] })), analytics && analytics.conversation_count > 0 && (_jsx("span", { className: "flag is-plain", children: L(`${analytics.conversation_count.toLocaleString(locale)} ${plural(analytics.conversation_count, ['разговор', 'разговора', 'разговоров'], ['', ''])} за период · средний балл ${analytics.avg_script_score != null ? Math.round(analytics.avg_script_score) : '—'}`, `${analytics.conversation_count.toLocaleString(locale)} conversations in period · average ${analytics.avg_script_score != null ? Math.round(analytics.avg_script_score) : '—'}`) }))] }), _jsx("div", { className: "tabs sc-tabs", role: "tablist", children: tabs.map((x) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": tab === x.id, className: `tab ${tab === x.id ? 'active' : ''}`, onClick: () => setTab(x.id), children: [t(x.label), x.count ? _jsx("span", { className: "count", children: L(`${x.count} ${plural(x.count, ['правило', 'правила', 'правил'], ['', ''])}`, `${x.count} ${x.count === 1 ? 'rule' : 'rules'}`) }) : null] }, x.id))) })] }), _jsxs("div", { className: "sc-body", children: [tab === 'stages' && (isFulltext
                        ? _jsx(BlocksTab, { template: template, stat: stat })
                        : _jsx(StagesTab, { template: template, stat: stat, breakdown: breakdown })), tab === 'sellers' && (breakdown ? _jsx(SellerHeatmap, { data: breakdown }) : _jsx("div", { className: "muted", children: t('Загрузка...') })), tab === 'assignments' && _jsx(AssignmentsBlock, { template: template }), _jsxs("div", { className: "sc-danger-zone", children: [_jsxs("button", { type: "button", className: "btn btn-ghost cv-danger", onClick: () => {
                                    if (confirm(L(`Удалить скрипт «${template.name}»? Все его этапы, версии и назначения будут удалены безвозвратно.`, `Delete script “${template.name}”? All its stages, versions and assignments will be permanently removed.`)))
                                        deleteMut.mutate();
                                }, children: [_jsx(Trash2, { size: 14, "aria-hidden": "true" }), t('Удалить скрипт')] }), !template.is_active && _jsx("span", { className: "muted", style: { fontSize: 12.5 }, children: L(`Черновик не оценивает разговоры, пока не активирован. Назначьте его ${terms.isTelephony ? 'отделам' : 'магазинам'} и включите.`, 'A draft doesn’t score conversations until activated. Assign it and switch it on.') })] })] }), showVersions && (_jsx(ModalOverlay, { onClose: () => setShowVersions(false), children: _jsxs("div", { className: "modal-card modal-card--wide", children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { className: "modal-title", children: [t('Версии'), " \u00B7 ", _jsx("span", { translate: "no", children: template.name })] }), _jsx("button", { className: "btn-icon", onClick: () => setShowVersions(false), "aria-label": t('Закрыть'), children: _jsx(X, { size: 16 }) })] }), _jsx("div", { className: "modal-body", children: _jsx(VersionsPanel, { templateId: template.id, onRestored: () => setShowVersions(false) }) })] }) })), showTest && _jsx(LiveTestDialog, { draft: { name: template.name, steps: template.steps }, onClose: () => setShowTest(false) })] }));
}
/** Этапы и веса: формула балла, этапы с весом-степпером, советом, лучшим примером и статистикой. */
function StagesTab({ template, stat, breakdown }) {
    const queryClient = useQueryClient();
    const terms = useTerms();
    const initial = useMemo(() => Object.fromEntries(template.steps.map((s, i) => [stepKey(s, i), round2(s.weight || 0)])), [template]);
    const [weights, setWeights] = useState(initial);
    const [inputs, setInputs] = useState({});
    useEffect(() => { setWeights(initial); setInputs({}); }, [initial]);
    const dirty = template.steps.some((s, i) => weights[stepKey(s, i)] !== initial[stepKey(s, i)]);
    const sum = round2(Object.values(weights).reduce((a, v) => a + v, 0));
    const sumOk = Math.abs(sum - 1) < 0.011;
    const byName = new Map((breakdown?.steps || []).map((b) => [b.name, b]));
    const setW = (key, v) => {
        setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(1, round2(v))) }));
        setInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
    };
    const normalize = () => {
        const norm = normalizeWeights(template.steps.map((s, i) => ({ ...s, weight: weights[stepKey(s, i)] })));
        setWeights(Object.fromEntries(norm.map((s, i) => [stepKey(s, i), round2(s.weight)])));
    };
    const saveMut = useMutation({
        mutationFn: () => scriptsApi.replaceTemplate(template.id, {
            name: template.name,
            description: template.description ?? null,
            scope: template.scope || 'org_level',
            context_description: template.context_description ?? null,
            steps: template.steps.map((s, i) => ({ ...s, weight: weights[stepKey(s, i)] })),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['script-template-detail', template.id] });
            queryClient.invalidateQueries({ queryKey: ['script-templates'] });
            queryClient.invalidateQueries({ queryKey: ['template-versions', template.id] });
            queryClient.invalidateQueries({ queryKey: ['script-breakdown', template.id] });
        },
    });
    if (template.steps.length === 0) {
        return _jsx("div", { className: "empty", children: _jsx("p", { children: t('Этапов пока нет') }) });
    }
    return (_jsxs(_Fragment, { children: [_jsx(ScoreFormula, { steps: template.steps.map((s, i) => ({ name: s.name, weight: weights[stepKey(s, i)] })), stat: stat }), (dirty || !sumOk) && (_jsxs("div", { className: `sc-savebar ${sumOk ? '' : 'is-bad'}`, role: "status", children: [_jsx("span", { children: sumOk
                            ? t('Веса изменены. Сохранение создаст новую версию скрипта.')
                            : L(`Сумма весов ${w2(sum)} — должна быть 1,00.`, `Weights sum to ${sum.toFixed(2)} — must be 1.00.`) }), !sumOk && _jsx("button", { type: "button", className: "btn btn-sm", onClick: normalize, children: t('Нормализовать') }), dirty && _jsx("button", { type: "button", className: "btn btn-sm btn-ghost", onClick: () => { setWeights(initial); setInputs({}); }, children: t('Отменить') }), dirty && (_jsxs("button", { type: "button", className: "btn btn-sm btn-primary", disabled: !sumOk || saveMut.isPending, onClick: () => saveMut.mutate(), children: [_jsx(Save, { size: 13, "aria-hidden": "true" }), saveMut.isPending ? t('Сохранение...') : t('Сохранить')] })), saveMut.isError && _jsx("span", { style: { color: 'var(--crit-ink)' }, children: t('Не удалось сохранить') })] })), template.steps.map((s, i) => {
                const key = stepKey(s, i);
                const st = stat.get(s.name);
                const b = byName.get(s.name);
                const skip = st?.pass_rate != null ? Math.round(100 - st.pass_rate) : null;
                const hint = s.recommendation_text || b?.hint;
                return (_jsxs("div", { className: "step", children: [_jsx("span", { className: "step-num", children: i + 1 }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "step-top", children: [_jsx("span", { className: "step-name", translate: "no", children: s.name }), _jsx("span", { className: "tag tag-neutral", children: s.is_required ? t('обязательный') : t('по ситуации') })] }), s.description && _jsx("p", { className: "step-desc", translate: "no", children: s.description }), hint && (_jsxs("div", { className: "step-rec", children: [_jsx(Lightbulb, { size: 15, "aria-hidden": "true" }), _jsxs("span", { children: [_jsx("b", { children: terms.isCafe ? t('Совет бариста:') : terms.isPharmacy ? L('Совет фармацевту:', 'Tip for the pharmacist:') : t('Совет продавцу:') }), " ", _jsx("span", { translate: "no", children: hint })] })] }))] }), _jsxs("div", { className: "step-side", children: [_jsxs("div", { className: "wctl", children: [_jsx("label", { htmlFor: `w-${key}`, children: t('Вес в балле') }), _jsxs("span", { className: "stepper", children: [_jsx("button", { type: "button", "aria-label": t('Уменьшить вес'), onClick: () => setW(key, weights[key] - WEIGHT_STEP), children: _jsx(Minus, { size: 13 }) }), _jsx("input", { id: `w-${key}`, inputMode: "decimal", value: inputs[key] ?? w2(weights[key]), onChange: (e) => setInputs((prev) => ({ ...prev, [key]: e.target.value })), onBlur: (e) => {
                                                        const v = parseFloat(e.target.value.replace(',', '.'));
                                                        if (Number.isFinite(v))
                                                            setW(key, v > 1 ? v / 100 : v);
                                                        else
                                                            setInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
                                                    }, onKeyDown: (e) => { if (e.key === 'Enter')
                                                        e.target.blur(); } }), _jsx("button", { type: "button", "aria-label": t('Увеличить вес'), onClick: () => setW(key, weights[key] + WEIGHT_STEP), children: _jsx(Plus, { size: 13 }) })] })] }), _jsxs("div", { className: "stat-mini", children: [_jsxs("div", { className: "row", children: [_jsx("span", { children: t('Средний балл') }), _jsx(Meter, { score: st?.avg_score ?? null })] }), _jsxs("div", { className: "row", children: [_jsx("span", { children: t('Пропускают') }), _jsx("b", { className: skip != null && skip >= 25 ? 'is-bad' : '', children: skip != null ? `${skip} %` : '—' })] })] })] })] }, key));
            })] }));
}
/** Полнотекстовый скрипт: блоки текста и как часто они звучат. */
function BlocksTab({ template, stat }) {
    const blocks = [...(template.blocks || [])].sort((a, b) => a.block_order - b.block_order);
    if (!blocks.length)
        return _jsx("div", { className: "empty", children: _jsx("p", { children: t('Блоков нет — добавьте хотя бы один') }) });
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "muted", style: { fontSize: 13, marginBottom: 6 }, children: t('Процент — доля разговоров, где блок прозвучал (по тексту или своими словами). Ситуативные блоки не входят в балл покрытия.') }), blocks.map((b, i) => {
                const st = stat.get(b.title);
                const rate = st?.pass_rate;
                return (_jsxs("div", { className: "step", children: [_jsx("span", { className: "step-num", children: i + 1 }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "step-top", children: [_jsx("span", { className: "step-name", translate: "no", children: b.title }), _jsx("span", { className: "tag tag-neutral", children: b.is_mandatory ? t('обязательный') : t('ситуативный') })] }), _jsx("p", { className: "step-desc sc-clamp", translate: "no", children: b.text })] }), _jsx("div", { className: "step-side", children: _jsxs("div", { className: "stat-mini", children: [_jsxs("div", { className: "row", children: [_jsx("span", { children: t('Прозвучал') }), _jsx("b", { className: rate != null && rate < 50 ? 'is-bad' : '', children: rate != null ? `${Math.round(rate)} %` : '—' })] }), _jsxs("div", { className: "row", children: [_jsx("span", { children: t('Разговоров') }), _jsx("b", { children: st?.total_count ?? '—' })] })] }) })] }, b.id || i));
            })] }));
}
// ─── Список скриптов слева: карточки ──────────────────────────────────────────
function ScriptCard({ template, selected, period, onSelect }) {
    const isFulltext = template.script_type === 'fulltext';
    const { data } = useQuery({
        queryKey: ['template-analytics', template.id, period],
        queryFn: () => scriptsApi.getTemplateAnalytics(template.id, { days: period }),
        staleTime: 60000,
    });
    const parts = [
        isFulltext
            ? L(`${template.block_count ?? 0} блоков · текст`, `${template.block_count ?? 0} blocks · text`)
            : L(`${template.step_count ?? 0} этапов`, `${template.step_count ?? 0} stages`),
        template.seller_count ? L(`${template.seller_count} продавцов`, `${template.seller_count} sellers`) : null,
    ].filter(Boolean);
    return (_jsxs("button", { type: "button", className: "rail-card", "aria-current": selected ? 'true' : undefined, onClick: onSelect, children: [_jsx("span", { className: "rail-name", translate: "no", children: template.name }), _jsx("span", { className: "rail-meta", children: parts.join(' · ') }), template.description && !selected && _jsx("span", { className: "rail-ctx", translate: "no", children: template.description }), _jsx("span", { className: "rail-foot", children: !template.is_active
                    ? _jsxs(_Fragment, { children: [_jsx("span", { className: "flag is-plain", children: t('Черновик') }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: t('не оценивает разговоры') })] })
                    : data && data.conversation_count > 0
                        ? _jsxs(_Fragment, { children: [_jsx(Meter, { score: data.avg_script_score }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: t('средний балл') })] })
                        : _jsx("span", { className: "muted", style: { fontSize: 12 }, children: t('Нет разговоров за период') }) })] }));
}
function OrgRules() {
    const terms = useTerms();
    const [tab, setTab] = useState('upsell');
    const { data: upsellRules } = useQuery({ queryKey: ['upsell-rules'], queryFn: () => scriptsApi.listUpsellRules() });
    const { data: crossRules } = useQuery({ queryKey: ['cross-sell-rules'], queryFn: () => scriptsApi.listCrossSellRules() });
    const tabs = [
        { id: 'upsell', label: 'Апсейл', count: upsellRules?.length },
        { id: 'crosssell', label: 'Кросс-сейл', count: crossRules?.length },
        { id: 'objections', label: 'Типы возражений' },
    ];
    return (_jsxs("section", { className: "panel sc-view sc-org", "aria-labelledby": "sc-org-title", children: [_jsxs("div", { className: "sc-head", children: [_jsx("h2", { id: "sc-org-title", className: "sc-title", children: t('Правила для всех скриптов') }), _jsx("p", { className: "sc-desc", children: terms.isCafe
                            ? L('Допродажа и возражения проверяются в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить точками и бариста.', 'Add-on sales and objections are checked in every conversation, whatever script applies. A rule can be limited to locations and baristas.')
                            : terms.isPharmacy
                                ? L('Допродажа и возражения проверяются в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить аптеками и фармацевтами.', 'Add-on sales and objections are checked in every conversation, whatever script applies. A rule can be limited to pharmacies and pharmacists.')
                                : t('Допродажа и возражения проверяются в каждом разговоре, какой бы скрипт ни применялся. Правило можно ограничить магазинами и продавцами.') }), _jsx("div", { className: "tabs sc-tabs", role: "tablist", children: tabs.map((x) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": tab === x.id, className: `tab ${tab === x.id ? 'active' : ''}`, onClick: () => setTab(x.id), children: [t(x.label), x.count ? _jsx("span", { className: "count", children: L(`${x.count} ${plural(x.count, ['правило', 'правила', 'правил'], ['', ''])}`, `${x.count} ${x.count === 1 ? 'rule' : 'rules'}`) }) : null] }, x.id))) })] }), _jsx("div", { className: "sc-body", children: _jsxs("div", { className: "sc-stack", children: [tab === 'upsell' && _jsx(RulesTable, { kind: "upsell" }), tab === 'crosssell' && _jsx(RulesTable, { kind: "crosssell" }), tab === 'objections' && _jsx(ObjectionTypesTable, {})] }) })] }));
}
export function ScriptsPage() {
    const queryClient = useQueryClient();
    const { period } = useOutletContext();
    const [selectedId, setSelectedId] = useState(null);
    const [forcedTab, setForcedTab] = useState(undefined);
    const [showLibrary, setShowLibrary] = useState(false);
    const [editorMode, setEditorMode] = useState(null);
    const [aiDraft, setAiDraft] = useState(null);
    const [docDraft, setDocDraft] = useState(null);
    const { data: templates, isLoading: templatesLoading } = useQuery({
        queryKey: ['script-templates'],
        queryFn: () => scriptsApi.getTemplates(),
    });
    // Активные — первыми; без выбора открываем первый скрипт, как в концепте
    const sorted = useMemo(() => [...(templates || [])].sort((a, b) => Number(b.is_active) - Number(a.is_active)), [templates]);
    useEffect(() => {
        if (!selectedId && !editorMode && !docDraft && sorted.length)
            setSelectedId(sorted[0].id);
        if (selectedId && templates && !templates.some((x) => x.id === selectedId))
            setSelectedId(sorted[0]?.id ?? null);
    }, [sorted, selectedId, templates, editorMode, docDraft]);
    const { data: selectedDetail } = useQuery({
        queryKey: ['script-template-detail', selectedId],
        queryFn: () => scriptsApi.getTemplate(selectedId),
        enabled: !!selectedId,
    });
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
            queryClient.invalidateQueries({ queryKey: ['template-versions', newId] });
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
    };
    const handleDocDraft = (draft) => setDocDraft(draft);
    const startNew = () => { setEditorMode('new'); setAiDraft(null); };
    // Редактирование существующего fulltext-скрипта идёт через FulltextEditorDialog
    const editingFulltext = editorMode === 'edit' && selectedDetail?.script_type === 'fulltext';
    const total = templates?.length || 0;
    const active = (templates || []).filter((x) => x.is_active).length;
    return (_jsxs("div", { className: "scripts-page", children: [_jsx(PageSubtitle, { children: L(`${total} скриптов · ${active} активных · оценка каждого разговора по этапам`, `${total} scripts · ${active} active · every conversation scored stage by stage`) }), _jsxs(PageActions, { children: [_jsxs("button", { type: "button", className: "btn", onClick: () => setShowLibrary(true), title: t('Готовые отраслевые шаблоны или генерация скрипта через AI'), children: [_jsx(Sparkles, { size: 15, "aria-hidden": "true" }), t('Шаблоны и AI')] }), _jsxs("button", { type: "button", className: "btn btn-primary", onClick: startNew, children: [_jsx(Plus, { size: 15, "aria-hidden": "true" }), t('Новый скрипт')] })] }), _jsxs("div", { className: "sc-grid", children: [_jsxs("nav", { className: "rail", "aria-label": t('Скрипты'), children: [templatesLoading && _jsxs(_Fragment, { children: [_jsx(SkeletonScriptCard, {}), _jsx(SkeletonScriptCard, {})] }), sorted.map((x) => (_jsx(ScriptCard, { template: x, selected: x.id === selectedId, period: period, onSelect: () => { setSelectedId(x.id); setForcedTab(undefined); } }, x.id))), _jsxs("button", { type: "button", className: "rail-add", onClick: startNew, children: [_jsx(Plus, { size: 15, "aria-hidden": "true" }), t('Новый скрипт')] })] }), selectedDetail ? (_jsx(ScriptView, { template: selectedDetail, period: period, initialTab: forcedTab, onEdit: () => setEditorMode('edit'), onDeleted: () => setSelectedId(null) })) : !templatesLoading && total === 0 ? (_jsx("section", { className: "panel", children: _jsxs("div", { className: "empty", children: [_jsx(BookOpen, { size: 32, "aria-hidden": "true", style: { color: 'var(--ink-4)', margin: '0 auto 10px' } }), _jsx("h3", { children: t('Скриптов пока нет') }), _jsx("p", { children: t('Скрипт — это список этапов, которые продавец должен пройти в разговоре. Начните с готового шаблона или опишите задачу — AI соберёт черновик.') }), _jsxs("div", { style: { display: 'flex', gap: 8, justifyContent: 'center' }, children: [_jsxs("button", { className: "btn btn-primary", onClick: () => setShowLibrary(true), children: [_jsx(Sparkles, { size: 14, "aria-hidden": "true" }), t('Шаблоны и AI')] }), _jsxs("button", { className: "btn", onClick: startNew, children: [_jsx(Plus, { size: 14, "aria-hidden": "true" }), t('С нуля')] })] })] }) })) : (_jsx("section", { className: "panel", children: _jsx("div", { className: "empty", children: _jsx("p", { className: "muted", children: t('Загрузка...') }) }) }))] }), _jsx(OrgRules, {}), _jsx(CommandPalette, { scripts: (templates || []).map((x) => ({ id: x.id, name: x.name, is_active: x.is_active })), onCreate: startNew, onOpenLibrary: () => setShowLibrary(true), onSelectScript: (id) => { setSelectedId(id); setForcedTab('stages'); }, onJumpAssignments: (id) => { setSelectedId(id); setForcedTab('assignments'); } }), editorMode && !editingFulltext && (_jsx(EditorDialog, { template: editorTemplate, isNew: editorMode !== 'edit', draftInfo: { fromAi: editorMode === 'ai' }, onClose: closeEditor, onSaved: handleEditorSaved, onSwitchToFulltext: () => {
                    closeEditor();
                    setDocDraft({ name: '', description: '', full_text: null, source_document_name: null, blocks: [] });
                } })), editingFulltext && selectedDetail && (_jsx(FulltextEditorDialog, { templateId: selectedDetail.id, initial: {
                    name: selectedDetail.name,
                    description: selectedDetail.description || '',
                    full_text: selectedDetail.full_text || null,
                    source_document_name: selectedDetail.source_document_name || null,
                    blocks: (selectedDetail.blocks || []).map((b) => ({
                        title: b.title, text: b.text, block_type: b.block_type, is_mandatory: b.is_mandatory,
                    })),
                }, onClose: closeEditor, onSaved: handleEditorSaved })), docDraft && (_jsx(FulltextEditorDialog, { templateId: null, initial: docDraft, onClose: () => setDocDraft(null), onSaved: (id) => { setDocDraft(null); handleEditorSaved(id); } })), showLibrary && (_jsx(LibraryDialog, { onClose: () => setShowLibrary(false), onCreated: handlePresetCreated, onUseDraft: handleAiDraft, onUseDocDraft: handleDocDraft }))] }));
}

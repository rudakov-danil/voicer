import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { ComplianceKpis, ViolationJournal, RulesOverview, useComplianceSummary } from '@/components/compliance/Journal';
import { t } from '@/i18n';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Shield, Plus, Trash2, Edit3, Check, X, AlertTriangle, MessageSquareOff, Smile, UserCheck, Lock, Sparkles, BookOpen, HandMetal, Scale, ShieldAlert, Megaphone, Clock, Heart, } from 'lucide-react';
import { complianceApi, } from '@/api/compliance';
const PRESET_RULES = [
    {
        id: 'no-profanity',
        title: 'Без нецензурной лексики и оскорблений',
        description: 'Запрещено использование ругательств, сленга и оскорбительных выражений в адрес клиента, коллег или конкурентов. Сюда же относятся пренебрежительные и обесценивающие высказывания, унижение клиента или его выбора.',
        severity: 'high', icon: MessageSquareOff,
        keywords: ['ругательство', 'мат', 'нецензур', 'оскорб', 'унижен', 'пренебреж', 'обесцен'],
    },
    {
        id: 'no-conflict',
        title: 'Не вступать в конфликт с клиентом',
        description: 'При недовольстве клиента сохранять спокойный тон, не повышать голос, не переходить на личности и не использовать сарказм.',
        severity: 'high', icon: HandMetal,
        keywords: ['конфликт', 'хамство', 'сарказм', 'грубость'],
    },
    {
        id: 'no-pressure',
        title: 'Не давить на клиента',
        description: 'Не использовать манипулятивные техники, угрозы дефицита, чувство вины. Клиент должен иметь возможность спокойно принять решение.',
        severity: 'medium', icon: Scale,
        keywords: ['давление', 'манипуляция', 'дефицит', 'агрессия'],
    },
    {
        id: 'no-false-promises',
        title: 'Не давать ложных обещаний',
        description: 'Не обещать скидки, сроки доставки, характеристики товара или акции, которые не подтверждены компанией.',
        severity: 'high', icon: ShieldAlert,
        keywords: ['ложь', 'недостоверно', 'обещание', 'гарантия'],
    },
    {
        id: 'no-competitor-bashing',
        title: 'Не критиковать конкурентов',
        description: 'Не отзываться негативно о других магазинах, брендах или производителях. Обсуждать только преимущества собственного предложения.',
        severity: 'medium', icon: Shield,
        keywords: ['конкурент', 'другой магазин'],
    },
    {
        id: 'greeting',
        title: 'Представиться и поприветствовать',
        description: 'В начале разговора назвать своё имя, магазин и поздороваться с клиентом.',
        severity: 'low', icon: Smile,
        keywords: ['приветствие', 'представление'],
    },
    {
        id: 'use-client-name',
        title: 'Обращаться к клиенту по имени',
        description: 'Если клиент представился — использовать его имя в разговоре. Это формирует доверие и персональный подход.',
        severity: 'low', icon: UserCheck,
        keywords: ['по имени'],
    },
    {
        id: 'no-interrupt',
        title: 'Не перебивать клиента',
        description: 'Дать клиенту договорить мысль, не прерывать его вопросом или ответом. Делать паузу перед своей репликой.',
        severity: 'medium', icon: Clock,
        keywords: ['перебивание', 'прерывание'],
    },
    {
        id: 'no-pii-disclosure',
        title: 'Соблюдать конфиденциальность',
        description: 'Не разглашать персональные данные других клиентов, не упоминать суммы или историю покупок третьих лиц.',
        severity: 'high', icon: Lock,
        keywords: ['персональные данные', 'конфиденциальность'],
    },
    {
        id: 'polite-farewell',
        title: 'Вежливое прощание',
        description: 'Поблагодарить клиента за визит/обращение, пожелать хорошего дня, попрощаться даже если клиент ничего не купил.',
        severity: 'low', icon: Heart,
        keywords: ['прощание', 'благодарность'],
    },
    {
        id: 'no-jargon',
        title: 'Объяснять без сложного жаргона',
        description: 'Избегать узкоспециальных терминов без пояснения. Если используете термин — поясните его простыми словами.',
        severity: 'low', icon: Megaphone,
        keywords: ['жаргон', 'термин'],
    },
    {
        id: 'no-misleading',
        title: 'Не вводить клиента в заблуждение',
        description: 'Не искажать характеристики товара, не умалчивать о существенных условиях покупки (комиссии, сроки, ограничения).',
        severity: 'high', icon: AlertTriangle,
        keywords: ['заблуждение', 'искажение', 'обман'],
    },
];
const severityMeta = {
    high: { label: 'Высокая', color: 'var(--danger)', bg: 'var(--danger-light)' },
    medium: { label: 'Средняя', color: 'var(--warning)', bg: 'var(--warning-light)' },
    low: { label: 'Низкая', color: 'var(--text-muted)', bg: 'var(--bg)' },
};
// ─── Мелкие плашки (без класса .badge — у него глобальный position:absolute) ─
function SeverityPill({ severity }) {
    const m = severityMeta[severity];
    return (_jsx("span", { style: {
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 8px', borderRadius: 999,
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
            background: m.bg, color: m.color, lineHeight: 1.4,
        }, children: m.label }));
}
function TagPill({ children, color = 'var(--text-muted)', bg = 'var(--bg)' }) {
    return (_jsx("span", { style: {
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 8px', borderRadius: 999,
            fontSize: 10, fontWeight: 500, letterSpacing: 0.2,
            background: bg, color, lineHeight: 1.4,
        }, children: children }));
}
// ─── Карточка правила ──────────────────────────────────────────────────────
function RuleCard({ rule, onPatch, onDelete, isCustom, }) {
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(rule.title);
    const [description, setDescription] = useState(rule.description);
    const [severity, setSeverity] = useState(rule.severity);
    const [keywords, setKeywords] = useState((rule.keywords || []).join(', '));
    const commit = () => {
        const t = title.trim();
        if (!t) {
            setTitle(rule.title);
            setEditing(false);
            return;
        }
        const kws = keywords.split(',').map((k) => k.trim()).filter(Boolean);
        onPatch({ title: t, description: description.trim(), severity, keywords: kws });
        setEditing(false);
    };
    const cancel = () => {
        setTitle(rule.title);
        setDescription(rule.description);
        setSeverity(rule.severity);
        setKeywords((rule.keywords || []).join(', '));
        setEditing(false);
    };
    const sev = severityMeta[rule.severity];
    return (_jsx("div", { style: {
            padding: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            opacity: rule.is_active ? 1 : 0.65,
            borderLeft: `3px solid ${sev.color}`,
        }, children: editing ? (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsx("input", { className: "form-input", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430", autoFocus: true }), _jsx("textarea", { className: "form-input", value: description, onChange: (e) => setDescription(e.target.value), placeholder: "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435\u043C", rows: 3, style: { resize: 'vertical', minHeight: 70 } }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }, children: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u0434\u043B\u044F LLM (\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E) \u2014 \u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u043A\u043B\u044E\u0447\u0435\u0432\u044B\u0435 \u0441\u043B\u043E\u0432\u0430, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0435 LLM \u043E\u0431\u0440\u0430\u0442\u0438\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u0435" }), _jsx("input", { className: "form-input", value: keywords, onChange: (e) => setKeywords(e.target.value), placeholder: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0440\u0443\u0433\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432, \u043C\u0430\u0442, \u043E\u0441\u043A\u043E\u0440\u0431", style: { fontSize: 12.5 } })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, children: [_jsx("label", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u0412\u0430\u0436\u043D\u043E\u0441\u0442\u044C:" }), ['high', 'medium', 'low'].map((s) => (_jsx("button", { type: "button", onClick: () => setSeverity(s), style: {
                                cursor: 'pointer',
                                background: severity === s ? severityMeta[s].bg : 'transparent',
                                color: severityMeta[s].color,
                                border: `1px solid ${severityMeta[s].color}`,
                                padding: '3px 10px', fontSize: 11, borderRadius: 999,
                            }, children: severityMeta[s].label }, s))), _jsx("div", { style: { flex: 1 } }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: cancel, type: "button", children: [_jsx(X, { size: 13 }), " \u041E\u0442\u043C\u0435\u043D\u0430"] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: commit, type: "button", children: [_jsx(Check, { size: 13 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] })] })) : (_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 12 }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }, children: [_jsx("h4", { style: { fontSize: 14, fontWeight: 600, margin: 0 }, children: rule.title }), _jsx(SeverityPill, { severity: rule.severity }), isCustom && _jsx(TagPill, { children: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0435" })] }), rule.description && (_jsx("p", { style: { fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }, children: rule.description }))] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }, children: [_jsx("div", { className: `toggle-switch ${rule.is_active ? 'on' : ''}`, onClick: () => onPatch({ is_active: !rule.is_active }), title: rule.is_active ? 'Активно' : 'Отключено' }), _jsx("button", { className: "btn-icon", onClick: () => setEditing(true), title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C", children: _jsx(Edit3, { size: 14 }) }), _jsx("button", { className: "btn-icon", onClick: () => { if (confirm(`Удалить правило «${rule.title}»?`))
                                onDelete(); }, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", style: { color: 'var(--danger)' }, children: _jsx(Trash2, { size: 14 }) })] })] })) }));
}
// ─── Форма добавления ───────────────────────────────────────────────────────
function AddRuleForm({ onAdd, onCancel, busy }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState('medium');
    const [keywords, setKeywords] = useState('');
    const submit = () => {
        const t = title.trim();
        if (!t)
            return;
        onAdd({
            title: t,
            description: description.trim(),
            severity,
            keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
            is_active: true,
        });
        setTitle('');
        setDescription('');
        setSeverity('medium');
        setKeywords('');
    };
    return (_jsxs("div", { style: {
            padding: 16, border: '1px dashed var(--primary)',
            background: 'rgba(37,99,235,0.03)', borderRadius: 'var(--radius-lg)',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }, children: [_jsx(Plus, { size: 16, style: { color: 'var(--primary)' } }), _jsx("h4", { style: { fontSize: 14, fontWeight: 600, margin: 0 }, children: "\u041D\u043E\u0432\u043E\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043E" })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsx("input", { className: "form-input", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u00AB\u041D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u201E\u043C\u0443\u0436\u0447\u0438\u043D\u0430/\u0436\u0435\u043D\u0449\u0438\u043D\u0430\u201C\u00BB", autoFocus: true }), _jsx("textarea", { className: "form-input", value: description, onChange: (e) => setDescription(e.target.value), placeholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435, \u0447\u0442\u043E \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435\u043C \u2014 LLM \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u044D\u0442\u043E \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 \u0434\u0438\u0430\u043B\u043E\u0433\u043E\u0432", rows: 3, style: { resize: 'vertical', minHeight: 70 } }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }, children: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u0434\u043B\u044F LLM (\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E) \u2014 \u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E" }), _jsx("input", { className: "form-input", value: keywords, onChange: (e) => setKeywords(e.target.value), placeholder: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0440\u0443\u0433\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432, \u043C\u0430\u0442, \u043E\u0441\u043A\u043E\u0440\u0431", style: { fontSize: 12.5 } })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, children: [_jsx("label", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u0412\u0430\u0436\u043D\u043E\u0441\u0442\u044C:" }), ['high', 'medium', 'low'].map((s) => (_jsx("button", { type: "button", onClick: () => setSeverity(s), style: {
                                    cursor: 'pointer',
                                    background: severity === s ? severityMeta[s].bg : 'transparent',
                                    color: severityMeta[s].color, border: `1px solid ${severityMeta[s].color}`,
                                    padding: '3px 10px', fontSize: 11, borderRadius: 999,
                                }, children: severityMeta[s].label }, s))), _jsx("div", { style: { flex: 1 } }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: onCancel, type: "button", children: [_jsx(X, { size: 13 }), " \u041E\u0442\u043C\u0435\u043D\u0430"] }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: submit, disabled: !title.trim() || busy, type: "button", children: [_jsx(Check, { size: 13 }), " ", busy ? 'Сохраняем…' : 'Добавить'] })] })] })] }));
}
// ─── Карточка пресета ──────────────────────────────────────────────────────
function PresetCard({ preset, onAdd, busy }) {
    const Icon = preset.icon;
    const sev = severityMeta[preset.severity];
    return (_jsx("div", { onClick: () => !busy && onAdd(), style: {
            padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', cursor: busy ? 'wait' : 'pointer',
            transition: 'transform 0.08s, border-color 0.1s, box-shadow 0.1s',
        }, onMouseEnter: (e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.08)'; }, onMouseLeave: (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 10 }, children: [_jsx("div", { style: {
                        width: 32, height: 32, flexShrink: 0,
                        background: sev.bg, color: sev.color, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }, children: _jsx(Icon, { size: 16 }) }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("h4", { style: { fontSize: 13, fontWeight: 600, margin: 0, marginBottom: 3, lineHeight: 1.3 }, children: preset.title }), _jsx("p", { style: { fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }, children: preset.description }), _jsxs("div", { style: { marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs("span", { style: { fontSize: 10, color: sev.color, fontWeight: 500 }, children: [sev.label, " \u0432\u0430\u0436\u043D\u043E\u0441\u0442\u044C"] }), _jsxs("span", { style: { fontSize: 11, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }, children: [_jsx(Plus, { size: 12 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] })] })] }) }));
}
function RulesTab() {
    const qc = useQueryClient();
    const [addingCustom, setAddingCustom] = useState(false);
    const [filter, setFilter] = useState('all');
    const { data: rules = [], isLoading } = useQuery({
        queryKey: ['compliance-rules'],
        queryFn: () => complianceApi.listRules(),
    });
    const invalidate = () => qc.invalidateQueries({ queryKey: ['compliance-rules'] });
    const createMut = useMutation({
        mutationFn: (data) => complianceApi.createRule(data),
        onSuccess: () => { invalidate(); setAddingCustom(false); },
    });
    const patchMut = useMutation({
        mutationFn: ({ id, data }) => complianceApi.patchRule(id, data),
        onSuccess: invalidate,
    });
    const delMut = useMutation({
        mutationFn: (id) => complianceApi.deleteRule(id),
        onSuccess: invalidate,
    });
    const addedTitles = useMemo(() => new Set(rules.map((r) => r.title.toLowerCase().trim())), [rules]);
    const activeRules = rules.filter((r) => r.is_active);
    const highRules = activeRules.filter((r) => r.severity === 'high');
    const availablePresets = PRESET_RULES.filter((p) => !addedTitles.has(p.title.toLowerCase().trim()));
    const filtered = rules.filter((r) => {
        if (filter === 'active')
            return r.is_active;
        if (filter === 'inactive')
            return !r.is_active;
        return true;
    });
    if (isLoading) {
        return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '60px 0' }, children: _jsx("div", { className: "spinner" }) }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "metrics-grid fade-in", style: { marginBottom: 20 }, children: [_jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0412\u0441\u0435\u0433\u043E \u043F\u0440\u0430\u0432\u0438\u043B" }), _jsx("div", { className: "metric-value", children: rules.length })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445" }), _jsx("div", { className: "metric-value", style: { color: 'var(--success)' }, children: activeRules.length })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u041A\u0440\u0438\u0442\u0438\u0447\u043D\u044B\u0445" }), _jsx("div", { className: "metric-value", style: { color: 'var(--danger)' }, children: highRules.length })] })] }), _jsxs("div", { className: "card fade-in", style: { marginBottom: 20 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430" }), _jsx("div", { className: "card-subtitle", children: rules.length === 0
                                            ? 'Пока правил нет. Добавьте первое — справа есть готовые шаблоны.'
                                            : 'Эти правила LLM проверяет в каждом разговоре. Отключите ненужные или измените важность.' })] }), _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx("div", { style: { display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2 }, children: ['all', 'active', 'inactive'].map((f) => (_jsx("button", { onClick: () => setFilter(f), style: {
                                                background: filter === f ? 'var(--bg-card)' : 'transparent',
                                                border: 'none', padding: '4px 10px', fontSize: 12, borderRadius: 6,
                                                cursor: 'pointer', color: filter === f ? 'var(--text)' : 'var(--text-muted)',
                                                fontWeight: filter === f ? 500 : 400,
                                            }, children: f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Отключённые' }, f))) }), _jsxs("button", { className: "btn btn-primary btn-sm", onClick: () => setAddingCustom(true), disabled: addingCustom, children: [_jsx(Plus, { size: 14 }), " \u0421\u0432\u043E\u0451 \u043F\u0440\u0430\u0432\u0438\u043B\u043E"] })] })] }), _jsxs("div", { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }, children: [addingCustom && (_jsx(AddRuleForm, { busy: createMut.isPending, onAdd: (data) => createMut.mutate(data), onCancel: () => setAddingCustom(false) })), filtered.length === 0 && !addingCustom && (_jsxs("div", { className: "empty-state-card", style: { margin: '8px 0' }, children: [_jsx(Shield, { size: 28, style: { opacity: 0.4, marginBottom: 8 } }), _jsx("p", { style: { marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }, children: rules.length === 0
                                            ? 'Здесь будут отображаться правила коммуникации'
                                            : filter === 'active' ? 'Нет активных правил' : 'Нет отключённых правил' }), rules.length === 0 && (_jsxs("button", { className: "btn btn-primary btn-sm", onClick: () => setAddingCustom(true), children: [_jsx(Plus, { size: 12 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u0438\u043B\u043E"] }))] })), filtered.map((r) => (_jsx(RuleCard, { rule: r, isCustom: !PRESET_RULES.some((p) => p.title.toLowerCase().trim() === r.title.toLowerCase().trim()), onPatch: (data) => patchMut.mutate({ id: r.id, data }), onDelete: () => delMut.mutate(r.id) }, r.id)))] })] }), availablePresets.length > 0 && (_jsxs("div", { className: "card fade-in", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsxs("div", { className: "card-title", style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(Sparkles, { size: 16, style: { color: 'var(--primary)' } }), "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u043F\u0440\u0430\u0432\u0438\u043B"] }), _jsx("div", { className: "card-subtitle", children: "\u0413\u043E\u0442\u043E\u0432\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0442\u0438\u043F\u0438\u0447\u043D\u043E\u0439 \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0438 \u0440\u043E\u0437\u043D\u0438\u0447\u043D\u044B\u0445 \u043F\u0440\u043E\u0434\u0430\u0436. \u041A\u043B\u0438\u043A\u043D\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C." })] }) }), _jsx("div", { style: {
                            padding: 16, display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
                        }, children: availablePresets.map((p) => (_jsx(PresetCard, { preset: p, busy: createMut.isPending, onAdd: () => createMut.mutate({
                                title: p.title,
                                description: p.description,
                                severity: p.severity,
                                keywords: p.keywords,
                                is_active: true,
                            }) }, p.id))) })] })), availablePresets.length === 0 && rules.length > 0 && (_jsxs("div", { className: "card fade-in", style: { padding: 20, textAlign: 'center' }, children: [_jsx(BookOpen, { size: 24, style: { opacity: 0.4, marginBottom: 8 } }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-muted)', margin: 0 }, children: "\u0412\u0441\u0435 \u0433\u043E\u0442\u043E\u0432\u044B\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u044B \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B. \u041C\u043E\u0436\u0435\u0442\u0435 \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0432\u043E\u0451 \u043F\u0440\u0430\u0432\u0438\u043B\u043E \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u0432\u044B\u0448\u0435." })] }))] }));
}
export function CompliancePage() {
    const { period } = useOutletContext();
    const { data: summary } = useComplianceSummary(period);
    const { data: rules = [] } = useQuery({ queryKey: ['compliance-rules'], queryFn: () => complianceApi.listRules() });
    const manage = () => document.getElementById('cp-manage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return (_jsxs("div", { children: [_jsx(ComplianceKpis, { period: period, summary: summary, rules: rules }), _jsxs("div", { className: "cp-grid", children: [_jsx(ViolationJournal, { summary: summary }), _jsx(RulesOverview, { rules: rules, summary: summary, onManage: manage })] }), _jsxs("section", { id: "cp-manage", className: "cp-manage", children: [_jsx("h2", { className: "an-section", children: t('Управление правилами') }), _jsx("p", { className: "muted", style: { fontSize: 13, marginBottom: 14 }, children: t('ИИ проверяет каждый разговор по активным правилам и помечает нарушения с цитатой.') }), _jsx(RulesTab, {})] })] }));
}

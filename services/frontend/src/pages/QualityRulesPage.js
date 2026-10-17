import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { clinicApi } from '@/api/clinic';
import { toast } from '@/components/ui/Toast';
import { CATEGORY, SEVERITY } from '@/components/clinic/shared';
import { L, t } from '@/i18n';
/* Правила контроля качества клиники: по ним ИИ проверяет каждый приём. «Должно быть» дают баллы
   сервиса и компетентности, «Не должно быть» — нарушения и сигналы фрода. Скриптов у клиник нет. */
const GROUPS = [
    { id: 'service', about: ['Как врач общается с пациентом: приветствие, объяснения, следующий шаг.', 'How the doctor communicates: greeting, explanations, next step.'] },
    { id: 'competence', about: ['Полнота приёма: анамнез, осмотр, обоснованность назначений, предупреждения.', 'Completeness: history, examination, justified prescriptions, warnings.'] },
    { id: 'fraud', about: ['Чего не должно быть никогда: увод пациента, оплата мимо кассы, лишние услуги, справки без оснований.', 'What must never happen: diverting patients, off-the-books payments, unnecessary services, unjustified certificates.'] },
];
let seq = 0;
const withKey = (r) => ({ ...r, key: r.id || `new-${++seq}` });
export function QualityRulesPage() {
    const qc = useQueryClient();
    const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-rules'], queryFn: clinicApi.rules });
    const [draft, setDraft] = useState([]);
    useEffect(() => { if (data)
        setDraft(data.items.map(withKey)); }, [data]);
    const dirty = useMemo(() => JSON.stringify(draft.map(({ key, ...r }) => r)) !== JSON.stringify((data?.items || []).map((r) => ({ ...r }))), [draft, data]);
    const save = useMutation({
        mutationFn: () => clinicApi.saveRules(draft.map(({ key, ...r }) => ({
            id: r.id, category: r.category, kind: r.category === 'fraud' ? 'forbidden' : r.kind, title: r.title.trim(),
            description: r.description.trim(), severity: r.severity, is_active: r.is_active,
        }))),
        onSuccess: (res) => { qc.setQueryData(['clinic-rules'], res); toast(L('Правила сохранены. Они действуют для новых приёмов.', 'Rules saved. They apply to new visits.')); },
        onError: (e) => toast(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : L('Не удалось сохранить правила.', 'Could not save the rules.')),
    });
    if (isError)
        return _jsx("div", { className: "panel up-empty", children: L('Не удалось загрузить правила. Обновите страницу.', 'Could not load the rules. Refresh the page.') });
    if (isLoading || !data)
        return _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') });
    const can = data.can_edit;
    const update = (key, patch) => setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const invalid = draft.some((r) => !r.title.trim());
    return (_jsxs("div", { className: "cl cl-rules", children: [_jsxs("p", { className: "cl-muted", style: { maxWidth: '90ch' }, children: [L('По этим правилам ИИ проверяет каждый приём и даёт цитату-доказательство. Правила «должно быть» складываются в баллы сервиса и компетентности, «не должно быть» — в нарушения и сигналы фрода. Изменения действуют для новых приёмов; прошлые оценки не пересчитываются.', 'The AI checks every visit against these rules and quotes the evidence. “Must” rules make up the service and competence scores, “must not” rules become violations and fraud signals. Changes apply to new visits; past scores are not recalculated.'), !can && L(' Править правила могут директор и администратор.', ' Only a director or an admin can edit the rules.')] }), _jsxs("p", { className: "cl-muted", children: [L('Для правил компетентности используйте ', 'For competence rules, use the '), _jsx("a", { href: "https://nrchd.kz/clinical-protocols?locale=ru", target: "_blank", rel: "noopener noreferrer", children: L('клинические протоколы МЗ РК', 'Kazakhstan Ministry of Health clinical protocols') }), L('. В описании правила укажите название, год и нужный фрагмент протокола.', '. Include the protocol title, year and relevant excerpt in the rule description.')] }), GROUPS.map((g) => {
                const rows = draft.filter((r) => r.category === g.id);
                return (_jsxs("section", { className: "panel", "aria-labelledby": `cl-rules-${g.id}`, children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsxs("h2", { id: `cl-rules-${g.id}`, className: "panel-title", children: [L(...CATEGORY[g.id]), " \u00B7 ", rows.length] }), _jsx("div", { className: "panel-sub", children: L(...g.about) })] }), can && (_jsxs("button", { type: "button", className: "btn btn-outline btn-sm", disabled: draft.length >= 60, onClick: () => setDraft((rs) => [...rs, withKey({ category: g.id, kind: g.id === 'fraud' ? 'forbidden' : 'required', title: '', description: '', severity: g.id === 'fraud' ? 'high' : 'medium', is_active: true })]), children: [_jsx(Plus, { size: 14, "aria-hidden": "true" }), L('Добавить правило', 'Add a rule')] }))] }), _jsxs("div", { className: "cl-panel-body", children: [rows.length === 0 && _jsx("p", { className: "cl-muted", children: L('Правил нет.', 'No rules.') }), rows.map((r) => (_jsxs("div", { className: `cl-rule${r.is_active ? '' : ' is-off'}`, children: [_jsx("div", { className: "cl-rule-main", children: can ? (_jsxs(_Fragment, { children: [_jsx("input", { className: "cl-rule-title", value: r.title, maxLength: 255, placeholder: L('Название правила', 'Rule title'), "aria-label": L('Название правила', 'Rule title'), onChange: (e) => update(r.key, { title: e.target.value }) }), _jsx("textarea", { className: "cl-rule-desc", value: r.description, maxLength: 2000, placeholder: L('Что именно проверять — так ИИ поймёт правило точнее', 'What exactly to check — helps the AI apply the rule'), "aria-label": L('Описание правила', 'Rule description'), onChange: (e) => update(r.key, { description: e.target.value }) })] })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "cl-rule-ro-title", translate: "no", children: r.title }), _jsx("span", { className: "cl-rule-ro-desc", translate: "no", children: r.description })] })) }), _jsxs("div", { className: "cl-rule-side", children: [g.id !== 'fraud' && (can ? (_jsxs("select", { className: "select-pill", value: r.kind, "aria-label": L('Вид правила', 'Rule kind'), onChange: (e) => update(r.key, { kind: e.target.value }), children: [_jsx("option", { value: "required", children: L('Должно быть', 'Must') }), _jsx("option", { value: "forbidden", children: L('Не должно быть', 'Must not') })] })) : _jsx("span", { className: "cl-cat", children: r.kind === 'required' ? L('Должно быть', 'Must') : L('Не должно быть', 'Must not') })), (g.id === 'fraud' || r.kind === 'forbidden') && (can ? (_jsx("select", { className: "select-pill", value: r.severity, "aria-label": L('Важность', 'Severity'), onChange: (e) => update(r.key, { severity: e.target.value }), children: ['high', 'medium', 'low'].map((s) => _jsx("option", { value: s, children: L(...SEVERITY[s]) }, s)) })) : _jsx("span", { className: "cl-cat", children: L(...SEVERITY[r.severity]) })), can && (_jsxs("label", { className: "cl-toggle", children: [_jsx("input", { type: "checkbox", checked: r.is_active, onChange: (e) => update(r.key, { is_active: e.target.checked }) }), L('Проверять', 'Active')] })), can && (_jsx("button", { type: "button", className: "btn-icon", "aria-label": L(`Удалить правило ${r.title}`, `Delete rule ${r.title}`), onClick: () => setDraft((rs) => rs.filter((x) => x.key !== r.key)), children: _jsx(Trash2, { size: 16, "aria-hidden": "true" }) }))] })] }, r.key)))] })] }, g.id));
            }), can && dirty && (_jsxs("div", { className: "cl-savebar", children: [_jsx("button", { type: "button", className: "btn btn-primary", disabled: save.isPending || invalid, onClick: () => save.mutate(), children: save.isPending ? L('Сохраняем…', 'Saving…') : L('Сохранить правила', 'Save rules') }), _jsx("button", { type: "button", className: "btn btn-ghost", disabled: save.isPending, onClick: () => setDraft(data.items.map(withKey)), children: L('Отменить изменения', 'Discard changes') }), invalid && _jsx("span", { className: "cl-muted", children: L('У каждого правила должно быть название.', 'Every rule needs a title.') })] }))] }));
}

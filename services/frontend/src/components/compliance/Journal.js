import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OctagonAlert, TriangleAlert, Info, Play } from 'lucide-react';
import { complianceApi } from '@/api/compliance';
import { dashboardApi } from '@/api/dashboard';
import { clock } from '@/components/ui/Fingerprint';
import { Delta } from '@/components/ui/Spark';
import { initials } from '@/lib/format';
import { t, L, locale, plural } from '@/i18n';
const reviewOf = (r) => (r === 'done' ? 'done' : r === 'open' ? 'planned' : 'waiting');
const REVIEW = {
    waiting: { label: 'Ждёт разбора', tone: 'is-crit' },
    planned: { label: 'В плане разбора', tone: 'is-info' },
    done: { label: 'Разобрано', tone: 'is-good' },
};
export function useComplianceSummary(period) {
    return useQuery({ queryKey: ['compliance-summary', period], queryFn: () => complianceApi.getSummary({ period, recent_limit: 200 }) });
}
/* ─── Показатели ─────────────────────────────────────────────────────────── */
export function ComplianceKpis({ period, summary, rules }) {
    const { data: prev } = useQuery({
        queryKey: ['compliance-summary', period, 'prev'],
        queryFn: () => {
            const to = new Date();
            to.setDate(to.getDate() - period - 1);
            const from = new Date(to);
            from.setDate(from.getDate() - period);
            const iso = (d) => d.toISOString().split('T')[0];
            return complianceApi.getSummary({ date_from: iso(from), date_to: iso(to), recent_limit: 1 });
        },
    });
    const tot = summary?.totals;
    const clean = tot && tot.total_conversations ? (1 - tot.conversations_with_violations / tot.total_conversations) * 100 : null;
    const waiting = new Map();
    for (const v of summary?.recent || [])
        if (reviewOf(v.review) === 'waiting')
            waiting.set(v.conversation_id, v.session_date);
    const oldest = [...waiting.values()].sort()[0];
    const oldestDays = oldest ? Math.max(0, Math.round((Date.now() - new Date(`${oldest}T00:00:00`).getTime()) / 86400000)) : null;
    const active = rules.filter((r) => r.is_active).length;
    return (_jsxs("div", { className: "cp-kpis", children: [_jsx("section", { className: "panel", children: _jsxs("div", { className: "kpi", children: [_jsx("div", { className: "kpi-label", children: t('Нарушений за период') }), _jsx("div", { className: "kpi-value", children: tot?.total_violations ?? '—' }), _jsxs("div", { className: "kpi-foot", children: [tot && prev && _jsx(Delta, { value: tot.total_violations - prev.totals.total_violations, goodWhenUp: false }), _jsx("span", { children: t('к прошлому периоду') })] })] }) }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "kpi", children: [_jsx("div", { className: "kpi-label", children: t('Разговоров без нарушений') }), _jsxs("div", { className: "kpi-value", children: [clean != null ? clean.toLocaleString(locale, { maximumFractionDigits: 1 }) : '—', _jsx("small", { children: "\u00A0%" })] }), _jsx("div", { className: "kpi-foot", children: _jsx("span", { children: tot ? L(`из ${tot.total_conversations}`, `of ${tot.total_conversations}`) : '' }) })] }) }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "kpi", children: [_jsx("div", { className: "kpi-label", children: t('Ждут разбора') }), _jsx("div", { className: "kpi-value", children: waiting.size }), _jsx("div", { className: "kpi-foot", children: _jsx("span", { children: oldestDays != null
                                    ? L(`${plural(waiting.size, ['разговор', 'разговора', 'разговоров'], ['', ''])}, самое старое — ${oldestDays} ${plural(oldestDays, ['день', 'дня', 'дней'], ['', ''])}`, `conversation${waiting.size === 1 ? '' : 's'}, oldest — ${oldestDays} day${oldestDays === 1 ? '' : 's'}`)
                                    : t('все нарушения взяты в разбор') }) })] }) }), _jsx("section", { className: "panel", children: _jsxs("div", { className: "kpi", children: [_jsx("div", { className: "kpi-label", children: t('Активных правил') }), _jsx("div", { className: "kpi-value", children: active }), _jsx("div", { className: "kpi-foot", children: _jsx("span", { children: L(`из ${rules.length}`, `of ${rules.length}`) }) })] }) })] }));
}
/* ─── Журнал нарушений ──────────────────────────────────────────────────── */
export function ViolationJournal({ summary }) {
    const [tab, setTab] = useState('all');
    const items = summary?.recent || [];
    const ids = [...new Set(items.map((v) => v.conversation_id))].slice(0, 100);
    const { data: fps } = useQuery({
        queryKey: ['fingerprints', ids.join(',')],
        queryFn: () => dashboardApi.getFingerprints(ids),
        enabled: ids.length > 0,
        staleTime: 5 * 60 * 1000,
    });
    const count = (r) => items.filter((v) => reviewOf(v.review) === r).length;
    const shown = items.filter((v) => tab === 'all' || reviewOf(v.review) === tab);
    const momentOf = (v) => {
        const fp = fps?.[v.conversation_id];
        const m = fp?.marks.find((x) => (x.k === 'crit' || x.k === 'crit-mid') && x.label === v.rule_title);
        return fp && m ? Math.max(0, Math.round(m.t * fp.dur)) : null;
    };
    return (_jsxs("section", { className: "panel", "aria-labelledby": "jr-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "jr-title", className: "panel-title", children: t('Журнал нарушений') }), _jsx("div", { className: "panel-sub", children: t('Каждая запись ведёт к моменту разговора') })] }) }), _jsx("div", { className: "cp-chips", role: "group", "aria-label": t('Фильтр журнала'), children: [['all', 'Все', items.length], ['waiting', 'Ждут разбора', count('waiting')], ['planned', 'В плане разбора', count('planned')], ['done', 'Разобрано', count('done')]].map(([k, label, n]) => (_jsxs("button", { type: "button", className: "chip", "aria-pressed": tab === k, onClick: () => setTab(k), children: [t(label), " ", _jsx("span", { className: "muted", children: n })] }, k))) }), shown.length === 0 ? _jsx("div", { className: "empty", style: { padding: '32px 18px' }, children: _jsx("p", { children: t('Нарушений нет.') }) }) : (_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table jr-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('Когда') }), _jsx("th", { scope: "col", children: t('Продавец') }), _jsx("th", { scope: "col", children: t('Правило и цитата') }), _jsx("th", { scope: "col", children: t('Статус') })] }) }), _jsx("tbody", { children: shown.map((v) => {
                                const d = new Date(v.recorded_at || `${v.session_date}T00:00:00`);
                                const at = momentOf(v);
                                const rv = REVIEW[reviewOf(v.review)];
                                return (_jsxs("tr", { children: [_jsxs("td", { className: "jr-when", children: [v.recorded_at && _jsx("b", { children: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }), _jsx("span", { children: d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) })] }), _jsx("td", { children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(v.seller_name) || '?' }), _jsxs("span", { style: { minWidth: 0 }, children: [_jsx("span", { className: "person-name", translate: "no", children: v.seller_name || '—' }), _jsx("span", { className: "person-sub", translate: "no", children: v.store_name })] })] }) }), _jsxs("td", { className: "jr-rule", children: [_jsx("b", { translate: "no", children: v.rule_title }), v.evidence && _jsxs("blockquote", { className: "q-quote", translate: "no", children: ["\u00AB", v.evidence, "\u00BB"] })] }), _jsxs("td", { className: "jr-status", children: [_jsx("span", { className: `flag ${rv.tone}`, children: t(rv.label) }), _jsxs(Link, { className: "btn btn-sm", to: `/conversations/${v.conversation_id}${at != null ? `?t=${Math.max(0, at - 1)}` : ''}`, "aria-label": at != null ? L(`Прослушать с ${clock(at)}`, `Listen from ${clock(at)}`) : t('Открыть разговор'), children: [_jsx(Play, { size: 13, "aria-hidden": "true" }), _jsx("span", { className: "mono", children: at != null ? clock(at) : t('Открыть') })] })] })] }, v.id));
                            }) })] }) }))] }));
}
/* ─── Правила: важность, число нарушений за период, включение ───────────── */
export function RulesOverview({ rules, summary, onManage }) {
    const qc = useQueryClient();
    const toggle = useMutation({
        mutationFn: (r) => complianceApi.patchRule(r.id, { is_active: !r.is_active }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance-rules'] }),
    });
    const counts = new Map((summary?.by_rule || []).map((b) => [b.rule_id, b.affected_conversations]));
    const rank = { high: 3, medium: 2, low: 1 };
    const sorted = [...rules].sort((a, b) => (rank[b.severity] - rank[a.severity]) || ((counts.get(b.id) || 0) - (counts.get(a.id) || 0)));
    return (_jsxs("section", { className: "panel", "aria-labelledby": "rl-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "rl-title", className: "panel-title", children: t('Правила') }), _jsx("div", { className: "panel-sub", children: t('Сначала — высокая важность · число — разговоры с нарушением за период') })] }), _jsx("button", { type: "button", className: "link", onClick: onManage, children: t('Изменить') })] }), _jsxs("div", { className: "panel-body", children: [sorted.length === 0 && _jsx("p", { className: "muted", children: t('Правил пока нет.') }), sorted.map((r) => {
                        const n = counts.get(r.id) || 0;
                        return (_jsxs("div", { className: `rl ${r.is_active ? '' : 'is-off'}`, children: [_jsx("span", { className: `q-sev vio-sev ${r.severity === 'high' ? 'is-crit' : r.severity === 'medium' ? 'is-warn' : 'is-plain'}`, "aria-hidden": "true", children: r.severity === 'high' ? _jsx(OctagonAlert, { size: 15 }) : r.severity === 'medium' ? _jsx(TriangleAlert, { size: 15 }) : _jsx(Info, { size: 15 }) }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: "rl-title", translate: "no", children: r.title }), r.description && _jsx("div", { className: "rl-desc", translate: "no", children: r.description }), _jsxs("div", { className: "rl-meta", children: [_jsx("span", { className: "tag tag-neutral", children: r.keywords?.length ? t('Словарь + ИИ') : t('ИИ по смыслу') }), _jsx("span", { className: n ? 'rl-n is-bad' : 'rl-n', children: n }), " ", t('за период')] })] }), _jsx("button", { type: "button", role: "switch", "aria-checked": r.is_active, className: "cv-switch", "aria-label": r.is_active ? t('Выключить правило') : t('Включить правило'), onClick: () => toggle.mutate(r), disabled: toggle.isPending, children: _jsx("span", { className: "cv-switch-track", "aria-hidden": "true" }) })] }, r.id));
                    })] })] }));
}

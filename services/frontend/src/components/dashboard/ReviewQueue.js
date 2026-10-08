import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { OctagonAlert, TriangleAlert, Play, ArrowRight } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { Fingerprint, clock } from '@/components/ui/Fingerprint';
import { useObjectionTypeLabel } from '@/components/conversation/shared';
import { initials } from '@/lib/format';
import { t, L, locale, plural } from '@/i18n';
/* Очередь на разбор (ui-concept/dashboard.html → #queue): сначала нарушения правил
   общения, потом разговоры с низким баллом. Цитата и момент — из нарушения или
   неотработанного возражения; момент находим по меткам «отпечатка». */
const TABS = [
    { id: 'attention', label: 'Все' },
    { id: 'violations', label: 'Нарушения' },
    { id: 'low_score', label: 'Низкий балл' },
];
const SHOW = 5;
function momentOf(row, fp) {
    if (!fp)
        return null;
    const marks = fp.marks;
    const m = row.top_violation
        ? marks.find((x) => (x.k === 'crit' || x.k === 'crit-mid') && x.label === row.top_violation) || marks.find((x) => x.k === 'crit' || x.k === 'crit-mid')
        : marks.find((x) => x.k === 'warn') || marks.find((x) => x.k === 'crit' || x.k === 'crit-mid');
    return m ? Math.max(0, Math.round(m.t * fp.dur)) : null;
}
export function ReviewQueue({ period }) {
    const [tab, setTab] = useState('attention');
    const objectionLabel = useObjectionTypeLabel();
    const { data } = useQuery({
        queryKey: ['review-queue', period, tab],
        queryFn: () => dashboardApi.getConversations({ view: tab, order: 'risk', limit: SHOW, period, with_counts: true }),
        placeholderData: (prev) => prev,
    });
    const items = data?.items || [];
    const ids = items.map((r) => r.id);
    const { data: fps } = useQuery({
        queryKey: ['fingerprints', ids.join(',')],
        queryFn: () => dashboardApi.getFingerprints(ids),
        enabled: ids.length > 0,
        staleTime: 5 * 60 * 1000,
    });
    const counts = data?.view_counts;
    const total = counts?.[tab] ?? data?.total ?? 0;
    const rest = Math.max(0, total - items.length);
    return (_jsxs("section", { className: "panel", "aria-labelledby": "queue-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "queue-title", className: "panel-title", children: t('Очередь на разбор') }), _jsx("div", { className: "panel-sub", children: t('Сначала — нарушения правил общения, потом разговоры с низким баллом') })] }), _jsx("div", { className: "seg", role: "group", "aria-label": t('Фильтр очереди'), children: TABS.map((tb) => (_jsxs("button", { type: "button", "aria-pressed": tab === tb.id, onClick: () => setTab(tb.id), children: [t(tb.label), counts ? ` · ${counts[tb.id] ?? 0}` : ''] }, tb.id))) })] }), items.length === 0 ? (_jsx("div", { className: "empty", style: { padding: '28px 18px' }, children: _jsx("p", { children: data ? t('За период нет разговоров, требующих разбора.') : t('Загрузка...') }) })) : (_jsx("ul", { className: "queue-list", children: items.map((r) => {
                    const fp = fps?.[r.id];
                    const at = momentOf(r, fp);
                    const crit = r.top_violation_severity === 'high';
                    const when = new Date(r.recorded_at || r.analyzed_at || r.session_date);
                    const quote = r.top_violation_evidence || r.open_objection_text;
                    return (_jsxs("li", { className: "q-item", children: [_jsxs("span", { className: `q-sev ${crit ? 'is-crit' : 'is-warn'}`, title: crit ? t('Высокий риск') : t('Нужен разбор'), children: [crit ? _jsx(OctagonAlert, { "aria-hidden": "true" }) : _jsx(TriangleAlert, { "aria-hidden": "true" }), _jsx("span", { className: "sr-only", children: crit ? t('Высокий риск') : t('Нужен разбор') })] }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: "q-reason", children: r.top_violation ? (_jsxs(_Fragment, { children: [_jsx("b", { translate: "no", children: r.top_violation }), _jsxs("span", { className: "muted", children: [" \u00B7 ", r.compliance_violations_count > 1 ? L(`${r.compliance_violations_count} нарушения`, `${r.compliance_violations_count} violations`) : t('нарушение')] })] })) : (_jsxs(_Fragment, { children: [_jsx("b", { children: L(`Балл ${Math.round(r.overall_score)} из 100`, `Score ${Math.round(r.overall_score)} of 100`) }), r.weakest_step && _jsxs("span", { className: "muted", children: [" \u00B7 ", t('слабее всего:'), " ", _jsx("span", { translate: "no", children: r.weakest_step })] })] })) }), quote && _jsxs("blockquote", { className: "q-quote", translate: "no", children: ["\u00AB", quote, "\u00BB"] }), !r.top_violation && !quote && r.open_objection && (_jsx("div", { className: "q-quote", children: L(`Возражение «${objectionLabel(r.open_objection)}» без ответа`, `Objection “${t(objectionLabel(r.open_objection))}” unanswered`) })), _jsxs("div", { className: "q-meta", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(r.seller_name) || '?' }), _jsx("b", { translate: "no", children: r.seller_name || '—' }), r.store_name && _jsx("span", { translate: "no", children: r.store_name }), _jsx("span", { "aria-hidden": "true", children: "\u00B7" }), _jsxs("span", { children: [when.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }), ", ", when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })] })] })] }), _jsxs("div", { className: "q-side", children: [_jsxs("div", { className: "fp-row", children: [_jsx(Fingerprint, { data: fp, height: 30 }), _jsx("span", { className: "fp-dur", children: r.duration_seconds ? clock(r.duration_seconds) : '—' })] }), _jsxs("div", { className: "q-actions", children: [at != null && (_jsxs(Link, { className: "btn btn-sm", to: `/conversations/${r.id}?t=${Math.max(0, at - 1)}`, "aria-label": L(`Прослушать с ${clock(at)}`, `Listen from ${clock(at)}`), children: [_jsx(Play, { size: 13, "aria-hidden": "true" }), _jsx("span", { className: "mono", children: clock(at) })] })), _jsx(Link, { className: "btn btn-sm btn-ghost", to: `/conversations/${r.id}`, children: t('Открыть') })] })] })] }, r.id));
                }) })), _jsxs("div", { className: "panel-foot", children: [_jsx("span", { children: rest > 0 ? L(`Ещё ${rest} ${plural(rest, ['разговор', 'разговора', 'разговоров'], ['', ''])} в очереди`, `${rest} more in the queue`) : t('Это вся очередь за период') }), _jsxs(Link, { className: "link", to: `/conversations?view=${tab}`, children: [t('Открыть всю очередь'), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] })] })] }));
}

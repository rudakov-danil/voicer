import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { clinicApi } from '@/api/clinic';
import { adminApi } from '@/api/admin';
import { useAuthStore } from '@/store/authStore';
import { useTerms } from '@/lib/terms';
import { num } from '@/components/upsells/metrics';
import { ProtocolBadge, Score, SignalChip, minutes, useClinicRange } from '@/components/clinic/shared';
import { L, locale, t } from '@/i18n';
/* Приёмы: список с протоколом, баллами и сигналами. Подборки — как в сайдбаре:
   ?view=fraud|issues|low|draft. Фильтры и поиск — в адресе, ссылкой можно поделиться. */
const VIEWS = [
    { id: 'all', label: ['Все', 'All'] },
    { id: 'fraud', label: ['Сигналы фрода', 'Fraud signals'] },
    { id: 'issues', label: ['Нарушения', 'Violations'] },
    { id: 'low', label: ['Низкое качество', 'Low quality'], hint: ['Сервис или компетентность ниже 50 % — выполнено меньше половины правил', 'Service or competence below 50% — fewer than half of the rules done'] },
    { id: 'draft', label: ['Протокол не подтверждён', 'Note not confirmed'] },
    { id: 'non_visit', label: ['Не приём', 'Not a visit'] },
];
const PAGE = 50;
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
export function VisitsPage() {
    const terms = useTerms();
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const view = params.get('view') || 'all';
    const store = params.get('store') || '';
    const seller = params.get('seller') || '';
    const [q, setQ] = useState(params.get('q') || '');
    const [limit, setLimit] = useState(PAGE);
    const range = useClinicRange(store);
    const set = (patch) => {
        const next = new URLSearchParams(params);
        for (const [k, v] of Object.entries(patch)) {
            if (v)
                next.set(k, v);
            else
                next.delete(k);
        }
        setParams(next, { replace: true });
        setLimit(PAGE);
    };
    // Поиск — с паузой, чтобы не дёргать сервер на каждую букву
    useEffect(() => {
        const id = setTimeout(() => { if ((params.get('q') || '') !== q.trim())
            set({ q: q.trim() || undefined }); }, 350);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);
    const query = { ...range, view, seller_id: seller || undefined, q: params.get('q') || undefined, limit, with_counts: true };
    const { data, isLoading, isError, isFetching } = useQuery({
        queryKey: ['clinic-visits', query],
        queryFn: () => clinicApi.visits(query),
        placeholderData: keepPreviousData,
    });
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60000 });
    const { data: sellers } = useQuery({
        queryKey: ['admin-sellers', store],
        queryFn: () => adminApi.getSellers({ store_id: store || undefined, is_active: true, limit: 200 }),
        staleTime: 5 * 60000,
    });
    const activeStores = (stores?.items || []).filter((s) => s.is_active !== false);
    const counts = data?.counts;
    return (_jsxs("div", { className: "cl", children: [_jsx("div", { className: "tabs", role: "tablist", "aria-label": L('Подборки', 'Views'), children: VIEWS.filter((v) => v.id !== 'non_visit' || (counts?.non_visit ?? 0) > 0).map((v) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": view === v.id, className: `tab ${view === v.id ? 'active' : ''}`, title: v.hint ? L(...v.hint) : undefined, onClick: () => set({ view: v.id === 'all' ? undefined : v.id }), children: [L(...v.label), counts && _jsx("span", { className: "count", children: num(counts[v.id] ?? 0) })] }, v.id))) }), _jsxs("div", { className: "cl-toolbar", children: [user?.role !== 'manager' && activeStores.length > 1 && (_jsxs("select", { className: "select-pill", value: store, "aria-label": t(terms.store), onChange: (e) => set({ store: e.target.value || undefined, seller: undefined }), children: [_jsx("option", { value: "", children: t(terms.allStores) }), activeStores.map((s) => _jsx("option", { value: s.id, translate: "no", children: s.name }, s.id))] })), _jsxs("select", { className: "select-pill", value: seller, "aria-label": L('Врач', 'Doctor'), onChange: (e) => set({ seller: e.target.value || undefined }), children: [_jsx("option", { value: "", children: L('Все врачи', 'All doctors') }), (sellers?.items || []).map((s) => _jsxs("option", { value: s.id, translate: "no", children: [s.first_name, " ", s.last_name] }, s.id))] }), _jsxs("label", { className: "cl-search", children: [_jsx(Search, { "aria-hidden": "true" }), _jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: L('Причина, диагноз или врач', 'Reason, diagnosis or doctor'), "aria-label": L('Поиск по приёмам', 'Search visits') })] })] }), _jsx("section", { className: "panel", children: isError ? (_jsx("div", { className: "up-empty", children: L('Не удалось загрузить приёмы. Обновите страницу.', 'Could not load visits. Refresh the page.') })) : isLoading || !data ? (_jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') })) : data.items.length === 0 ? (_jsx("div", { className: "up-empty", children: L('Приёмов с такими условиями нет.', 'No visits match these filters.') })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "cl-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: L('Когда', 'When') }), _jsx("th", { scope: "col", children: L('Врач', 'Doctor') }), _jsx("th", { scope: "col", children: L('Причина и диагноз', 'Reason and diagnosis') }), _jsx("th", { scope: "col", className: "t-num", children: L('Длит.', 'Length') }), _jsx("th", { scope: "col", className: "t-num", children: L('Сервис', 'Service') }), _jsx("th", { scope: "col", className: "t-num", children: L('Компет.', 'Compet.') }), _jsx("th", { scope: "col", children: L('Сигналы', 'Signals') }), _jsx("th", { scope: "col", children: L('Протокол', 'Note') })] }) }), _jsx("tbody", { children: data.items.map((v) => (_jsxs("tr", { tabIndex: 0, onClick: () => navigate(`/visits/${v.conversation_id}`), onKeyDown: (e) => { if (e.key === 'Enter')
                                                navigate(`/visits/${v.conversation_id}`); }, children: [_jsxs("td", { className: "cl-time", children: [v.time, _jsx("span", { children: fmtDay(v.session_date) })] }), _jsx("td", { children: _jsxs("div", { className: "cl-who", children: [_jsx("b", { translate: "no", children: v.seller_name }), _jsx("span", { translate: "no", children: v.store_name })] }) }), _jsx("td", { children: _jsxs("div", { className: "cl-reason", children: [_jsx("b", { translate: "no", children: v.is_visit ? (v.reason || '—') : L('Не приём пациента', 'Not a patient visit') }), v.diagnosis && v.diagnosis !== v.reason && _jsx("span", { translate: "no", children: v.diagnosis })] }) }), _jsx("td", { className: "t-num", children: minutes(v.duration_sec) }), _jsx("td", { className: "t-num", children: _jsx(Score, { value: v.service }) }), _jsx("td", { className: "t-num", children: _jsx(Score, { value: v.competence }) }), _jsx("td", { children: v.signals.length ? _jsx("div", { className: "cl-signals", children: v.signals.map((x, i) => _jsx(SignalChip, { ...x }, i)) }) : _jsx("span", { className: "cl-muted", children: "\u2014" }) }), _jsx("td", { children: _jsx(ProtocolBadge, { status: v.is_visit ? v.protocol_status : null }) })] }, v.conversation_id))) })] }) }), data.total > data.items.length && limit < 200 && (_jsx("div", { className: "cl-more", children: _jsx("button", { type: "button", className: "btn btn-outline", disabled: isFetching, onClick: () => setLimit((n) => Math.min(200, n + PAGE)), children: L(`Показать ещё · ${num(data.items.length)} из ${num(data.total)}`, `Show more · ${num(data.items.length)} of ${num(data.total)}`) }) }))] })) })] }));
}

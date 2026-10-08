import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Play } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { adminApi } from '@/api/admin';
import { useTerms } from '@/lib/terms';
import { initials } from '@/lib/format';
import { Meter } from '@/components/ui/Meter';
import { Spark, Delta, pct, lastAndDelta } from '@/components/ui/Spark';
import { Fingerprint, clock } from '@/components/ui/Fingerprint';
import { OutcomeTag } from '@/components/OutcomeTag';
import { t, L, locale, plural } from '@/i18n';
const dec = (v, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
function median(values) {
    const v = [...values].sort((a, b) => a - b);
    if (!v.length)
        return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function TeamPage() {
    const { period } = useOutletContext();
    const terms = useTerms();
    const [searchParams, setSearchParams] = useSearchParams();
    const [store, setStore] = useState('');
    const [sort, setSort] = useState('conversion');
    const { data: sellers } = useQuery({ queryKey: ['sellers', period], queryFn: () => dashboardApi.getSellers({ period }) });
    const { data: allSellers } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() });
    const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: () => dashboardApi.getTrends({ weeks: 12 }) });
    const trendBySeller = useMemo(() => new Map((trends?.sellers || []).map((s) => [s.seller_id, s])), [trends]);
    // Карточки магазинов: сеть и каждый магазин за период
    const storeCards = useMemo(() => {
        const groups = new Map();
        for (const s of sellers || []) {
            const g = groups.get(s.store_id) || { id: s.store_id, name: s.store_name || '—', sellers: [] };
            g.sellers.push(s);
            groups.set(s.store_id, g);
        }
        const agg = (list) => {
            const scorable = list.reduce((a, s) => a + (s.scorable || 0), 0);
            const purchases = list.reduce((a, s) => a + (s.purchases || 0), 0);
            const n = list.reduce((a, s) => a + (s.conversations_count || 0), 0);
            const score = n ? list.reduce((a, s) => a + (s.avg_score || 0) * (s.conversations_count || 0), 0) / n : null;
            return { conversion: pct(purchases, scorable), score, sellers: list.length };
        };
        return [
            { id: '', name: t('Все магазины'), ...agg(sellers || []) },
            ...[...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((g) => ({ id: g.id, name: g.name, ...agg(g.sellers) })),
        ];
    }, [sellers]);
    const rows = useMemo(() => {
        const list = (sellers || []).filter((s) => !store || s.store_id === store).map((s) => {
            const tr = trendBySeller.get(s.id);
            return { ...s, spark: tr?.avg_score || [], delta: tr ? lastAndDelta(tr.avg_score).delta : null };
        });
        const key = (s) => sort === 'conversion' ? s.conversion_rate ?? -1 : sort === 'score' ? s.avg_score ?? -1 : s.delta ?? -999;
        return list.sort((a, b) => key(b) - key(a));
    }, [sellers, store, sort, trendBySeller]);
    // Продавцы без разговоров за период — внизу рейтинга
    const silent = (allSellers?.items || []).filter((s) => s.is_active !== false && (!store || s.store_id === store) && !(sellers || []).some((x) => x.id === s.id));
    const selectedId = searchParams.get('seller') || rows[0]?.id || null;
    const select = (id) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('seller', id); return n; }, { replace: true });
    const selected = (sellers || []).find((s) => s.id === selectedId) || null;
    const maxConv = Math.max(0.01, ...rows.map((r) => r.conversion_rate || 0));
    return (_jsxs("div", { className: "team", children: [_jsx("div", { className: "stores", role: "group", "aria-label": t('Магазины'), children: storeCards.map((c) => (_jsxs("button", { type: "button", className: "store-card", "aria-pressed": store === c.id, onClick: () => setStore(c.id), children: [_jsxs("span", { className: "store-card-top", children: [_jsx("span", { className: "store-card-name ellipsis", translate: c.id ? 'no' : undefined, children: c.name }), !c.id && _jsx("span", { className: "store-card-city", children: t('сеть') })] }), _jsxs("span", { className: "store-card-nums", children: [_jsxs("span", { children: [_jsxs("span", { className: "display", children: [c.conversion != null ? dec(c.conversion) : '—', _jsx("small", { children: "\u00A0%" })] }), _jsx("span", { className: "lbl", children: t('конверсия') })] }), _jsxs("span", { children: [_jsx("span", { className: "display", children: c.score != null ? Math.round(c.score) : '—' }), _jsx("span", { className: "lbl", children: t('балл') })] })] }), _jsxs("span", { className: "store-card-foot", children: [c.sellers, " ", plural(c.sellers, ['продавец', 'продавца', 'продавцов'], ['seller', 'sellers'])] })] }, c.id || 'all'))) }), _jsxs("div", { className: "team-grid", children: [_jsxs("section", { className: "panel", "aria-labelledby": "lb-title", children: [_jsxs("div", { className: "lb-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "lb-title", className: "panel-title", children: L(`Рейтинг: ${terms.sellerPlural.toLowerCase()}`, 'Seller ranking') }), _jsxs("div", { className: "panel-sub", children: [L(`${rows.length} с разговорами за период`, `${rows.length} with conversations in the period`), silent.length > 0 && L(` · ${silent.length} без данных`, ` · ${silent.length} without data`)] })] }), _jsx("div", { className: "seg", role: "group", "aria-label": t('Сортировка рейтинга'), children: [['conversion', 'Конверсия'], ['score', 'Балл'], ['delta', 'Динамика']].map(([k, label]) => (_jsx("button", { type: "button", "aria-pressed": sort === k, onClick: () => setSort(k), children: t(label) }, k))) })] }), _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table lb-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "#" }), _jsx("th", { scope: "col", children: terms.seller }), _jsx("th", { scope: "col", children: t('Конверсия') }), _jsx("th", { scope: "col", children: t('Балл') }), _jsx("th", { scope: "col", children: t('12 недель') })] }) }), _jsxs("tbody", { children: [rows.map((s, i) => (_jsxs("tr", { "aria-selected": s.id === selectedId, tabIndex: 0, onClick: () => select(s.id), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        select(s.id);
                                                    } }, children: [_jsx("td", { className: `rank ${i < 3 ? 'is-top' : ''}`, children: i + 1 }), _jsx("td", { children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(`${s.first_name} ${s.last_name}`) }), _jsxs("span", { style: { minWidth: 0 }, children: [_jsxs("span", { className: "person-name", translate: "no", children: [s.first_name, " ", s.last_name] }), _jsxs("span", { className: "person-sub", children: [_jsx("span", { translate: "no", children: s.store_name }), " \u00B7 ", s.conversations_count, " ", plural(s.conversations_count || 0, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])] })] })] }) }), _jsx("td", { children: _jsxs("div", { className: "conv-cell", children: [_jsxs("span", { className: "conv-val", children: [dec((s.conversion_rate || 0) * 100), "\u00A0%"] }), _jsx("span", { className: "conv-bar", "aria-hidden": "true", children: _jsx("span", { style: { width: `${((s.conversion_rate || 0) / maxConv) * 100}%` } }) })] }) }), _jsx("td", { children: _jsx(Meter, { score: s.avg_score }) }), _jsx("td", { children: _jsxs("span", { className: "lb-trend", children: [_jsx(Spark, { values: s.spark, width: 52, height: 26 }), _jsx(Delta, { value: s.delta })] }) })] }, s.id))), silent.map((s) => (_jsxs("tr", { className: "nodata", children: [_jsx("td", { className: "rank", children: "\u2014" }), _jsx("td", { children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(`${s.first_name} ${s.last_name}`) }), _jsxs("span", { style: { minWidth: 0 }, children: [_jsxs("span", { className: "person-name", translate: "no", children: [s.first_name, " ", s.last_name] }), _jsx("span", { className: "person-sub", translate: "no", children: s.store_name })] })] }) }), _jsx("td", { colSpan: 3, children: t('Нет разговоров за период') })] }, s.id)))] })] }) })] }), selected ? _jsx(Profile, { seller: selected, period: period, trends: trends }) : (_jsx("section", { className: "panel", children: _jsx("div", { className: "empty", children: _jsx("p", { children: t('Нет продавцов с разговорами за период.') }) }) }))] })] }));
}
/* ─── Профиль продавца ──────────────────────────────────────────────────── */
function Profile({ seller, period, trends }) {
    const name = `${seller.first_name} ${seller.last_name}`.trim();
    const { data: bench } = useQuery({
        queryKey: ['seller-benchmark', seller.id, period],
        queryFn: () => dashboardApi.getSellerBenchmark(seller.id, period),
    });
    const tr = trends?.sellers.find((s) => s.seller_id === seller.id);
    const delta = tr ? lastAndDelta(tr.avg_score).delta : null;
    const months = bench?.seller_since ? Math.max(0, Math.round((Date.now() - new Date(bench.seller_since).getTime()) / (30.4 * 86400000))) : null;
    const zones = (bench?.zones || []).map((z) => bench.steps.find((s) => s.name === z)).filter(Boolean);
    return (_jsxs("section", { className: "panel profile", "aria-label": L(`Профиль: ${name}`, `Profile: ${name}`), children: [_jsxs("div", { className: "pf-head", children: [_jsx("span", { className: "avatar avatar-lg", "aria-hidden": "true", translate: "no", children: initials(name) }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: "pf-name", translate: "no", children: name }), _jsxs("div", { className: "pf-sub", children: [_jsx("span", { translate: "no", children: seller.store_name }), months != null && _jsxs(_Fragment, { children: [" \u00B7 ", months < 1 ? t('в команде меньше месяца') : L(`в команде ${months} мес.`, `on the team ${months} mo`)] })] })] })] }), _jsxs("div", { className: "pf-kpis", children: [_jsxs("div", { className: "pf-kpi", children: [_jsxs("span", { className: "display", children: [dec((seller.conversion_rate || 0) * 100), _jsx("small", { children: "\u00A0%" })] }), _jsx("span", { className: "lbl", children: t('конверсия') })] }), _jsxs("div", { className: "pf-kpi", children: [_jsx("span", { className: "display", children: seller.avg_score != null ? Math.round(seller.avg_score) : '—' }), _jsxs("span", { className: "lbl", children: [t('балл'), delta != null && Math.round(delta) !== 0 ? L(` · ${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))} за неделю`, ` · ${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))} this week`) : ''] })] }), _jsxs("div", { className: "pf-kpi", children: [_jsx("span", { className: "display", children: seller.conversations_count ?? 0 }), _jsx("span", { className: "lbl", children: plural(seller.conversations_count || 0, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations']) })] }), _jsxs("div", { className: `pf-kpi ${seller.with_violations ? 'is-crit' : ''}`, children: [_jsx("span", { className: "display", children: seller.with_violations ?? 0 }), _jsx("span", { className: "lbl", children: t('с нарушениями') })] })] }), trends && tr && _jsx(ScoreChart, { trends: trends, sellerId: seller.id, name: seller.first_name }), bench && bench.steps.length > 0 && (_jsxs("div", { className: "pf-sec", children: [_jsxs("div", { className: "pf-sec-h", children: [_jsx("h3", { children: t('По этапам скрипта') }), _jsxs("span", { className: "legend", children: [_jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "db-key is-me" }), seller.first_name] }), _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "db-key is-team" }), t('медиана сети')] })] })] }), _jsx(StepDots, { steps: bench.steps })] })), bench && bench.steps.length > 0 && zones.length === 0 && (_jsxs("div", { className: "pf-sec", children: [_jsx("div", { className: "pf-sec-h", children: _jsx("h3", { children: t('Зоны развития') }) }), _jsx("p", { className: "muted", style: { fontSize: 13 }, children: t('Слабых этапов нет: по всем этапам балл 90 и выше.') })] })), zones.length > 0 && (_jsxs("div", { className: "pf-sec", children: [_jsxs("div", { className: "pf-sec-h", children: [_jsx("h3", { children: t('Зоны развития') }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: t('от слабого к сильному') })] }), zones.map((z) => (_jsxs("div", { className: "zone", children: [_jsxs("div", { className: "zone-top", children: [_jsx("b", { translate: "no", children: z.name }), _jsx(Meter, { score: z.seller })] }), z.hint && _jsx("p", { translate: "no", children: z.hint }), _jsxs("div", { className: "zone-best", children: [z.best.seller_id !== seller.id && z.best.score > z.seller ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(z.best.name) }), _jsxs("span", { children: [t('Лучше всех в сети —'), " ", _jsx("span", { translate: "no", children: z.best.name }), ", ", Math.round(z.best.score)] })] })) : _jsx("span", { children: t('Лучший результат в сети на этом этапе') }), z.example && (_jsxs(Link, { className: "link", style: { marginLeft: 'auto' }, to: `/conversations/${z.example.conversation_id}${z.example.t != null ? `?t=${Math.max(0, z.example.t - 1)}` : ''}`, title: `«${z.example.evidence}»`, children: [_jsx(Play, { size: 13, "aria-hidden": "true" }), t('Послушать пример')] }))] })] }, z.name)))] })), _jsx(CoachingPlan, { sellerId: seller.id }), _jsx(RecentConversations, { sellerId: seller.id, period: period })] }));
}
/* Балл за 12 недель: продавец против медианы сети */
function ScoreChart({ trends, sellerId, name }) {
    const ref = useRef(null);
    const [w, setW] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        setW(Math.round(el.getBoundingClientRect().width));
        const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const me = trends.sellers.find((s) => s.seller_id === sellerId).avg_score;
    const team = trends.weeks.map((_, i) => median(trends.sellers.map((s) => s.avg_score[i]).filter((v) => v != null)));
    const vals = [...me, ...team].filter((v) => v != null);
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...vals) + 5) / 10) * 10);
    const H = 150, top = 8, bottom = 22, right = 30;
    const X = (i) => (i / (trends.weeks.length - 1)) * (w - right);
    const Y = (v) => top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - top - bottom);
    const line = (series) => series
        .map((v, i) => (v != null ? [X(i), Y(v)] : null)).filter(Boolean)
        .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const lastIdx = (series) => series.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
    const meLast = lastIdx(me);
    const teamLast = lastIdx(team);
    const weekLabel = (i) => new Date(`${trends.weeks[i]}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return (_jsxs("div", { className: "pf-sec", children: [_jsxs("div", { className: "pf-sec-h", children: [_jsx("h3", { children: t('Балл за 12 недель') }), _jsxs("span", { className: "legend", children: [_jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: 'var(--seller)', height: 2 } }), _jsx("span", { translate: "no", children: name })] }), _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: 'var(--ink-4)', height: 2 } }), t('медиана сети')] })] })] }), _jsx("div", { ref: ref, className: "lc", children: w > 0 && (_jsxs("svg", { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": L('Балл по неделям: продавец и медиана сети', 'Weekly score: seller and network median'), children: [[lo, hi].map((v) => (_jsxs("g", { children: [_jsx("line", { x1: 0, x2: w - right, y1: Y(v), y2: Y(v), className: "lc-grid" }), _jsx("text", { x: 0, y: Y(v) - 4, className: "lc-lbl", children: v })] }, v))), _jsx("path", { d: line(team), className: "lc-team" }), _jsx("path", { d: line(me), className: "lc-me" }), teamLast != null && _jsx("circle", { cx: X(teamLast), cy: Y(team[teamLast]), r: 3.5, className: "lc-end-team" }), meLast != null && _jsxs(_Fragment, { children: [_jsx("circle", { cx: X(meLast), cy: Y(me[meLast]), r: 4, className: "lc-end" }), _jsx("text", { x: X(meLast) + 8, y: Y(me[meLast]) + 4, className: "lc-endlbl", children: Math.round(me[meLast]) })] }), [0, Math.floor((trends.weeks.length - 1) / 2), trends.weeks.length - 1].map((i) => (_jsx("text", { x: X(i), y: H - 4, textAnchor: i === 0 ? 'start' : i === trends.weeks.length - 1 ? 'end' : 'middle', className: "lc-lbl", children: weekLabel(i) }, i)))] })) })] }));
}
/* Этапы: точка продавца и точка медианы сети на одной шкале */
function StepDots({ steps }) {
    const vals = steps.flatMap((s) => [s.seller, s.median ?? s.seller]);
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10);
    const hi = 100;
    const pos = (v) => `${((v - lo) / Math.max(1, hi - lo)) * 100}%`;
    return (_jsxs(_Fragment, { children: [steps.map((s) => {
                const gap = s.median != null ? Math.round(s.seller - s.median) : null;
                const a = Math.min(s.seller, s.median ?? s.seller);
                const b = Math.max(s.seller, s.median ?? s.seller);
                return (_jsxs("div", { className: "db-row", children: [_jsx("span", { className: "db-name", translate: "no", children: s.name }), _jsxs("span", { className: "db-track", role: "img", "aria-label": L(`${s.name}: ${Math.round(s.seller)}, медиана сети ${s.median != null ? Math.round(s.median) : '—'}`, `${s.name}: ${Math.round(s.seller)}, network median ${s.median != null ? Math.round(s.median) : '—'}`), children: [_jsx("span", { className: "db-line", style: { left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` } }), s.median != null && _jsx("span", { className: "db-dot is-team", style: { left: pos(s.median) } }), _jsx("span", { className: "db-dot is-me", style: { left: pos(s.seller) } })] }), _jsx("span", { className: `db-gap ${gap != null && gap < 0 ? 'is-bad' : gap ? 'is-good' : ''}`, children: gap == null ? '—' : gap > 0 ? `+${gap}` : gap < 0 ? `−${-gap}` : '0' })] }, s.name));
            }), _jsxs("div", { className: "db-scale", children: [_jsx("span", {}), _jsxs("div", { children: [_jsx("span", { children: lo }), _jsx("span", { children: Math.round((lo + hi) / 2) }), _jsx("span", { children: hi })] }), _jsx("span", {})] })] }));
}
/* План разбора: разговоры и комментарии руководителей из карточки разговора */
function CoachingPlan({ sellerId }) {
    const queryClient = useQueryClient();
    const { data: items = [] } = useQuery({
        queryKey: ['coaching', 'seller', sellerId],
        queryFn: () => dashboardApi.listCoaching({ seller_id: sellerId, status: 'open' }),
    });
    const done = useMutation({
        mutationFn: (id) => dashboardApi.setCoachingStatus(id, 'done'),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coaching'] }),
    });
    // Один разговор — одна строка, комментарии к нему — под ней
    const byConv = new Map();
    for (const it of items)
        byConv.set(it.conversation_id, [...(byConv.get(it.conversation_id) || []), it]);
    return (_jsxs("div", { className: "pf-sec", children: [_jsxs("div", { className: "pf-sec-h", children: [_jsx("h3", { children: t('План разбора') }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: byConv.size ? L(`${byConv.size} ${plural(byConv.size, ['разговор', 'разговора', 'разговоров'], ['', ''])}`, `${byConv.size} conversations`) : '' })] }), byConv.size === 0 ? (_jsx("p", { className: "muted", style: { fontSize: 13 }, children: t('Пусто. Добавить разговор можно кнопкой «Разобрать с продавцом» в его карточке.') })) : [...byConv.entries()].map(([convId, list]) => {
                const head = list[0];
                return (_jsxs("div", { className: "plan-item", children: [_jsxs("div", { className: "plan-top", children: [_jsx(Link, { to: `/conversations/${convId}`, className: "plan-topic ellipsis", translate: "no", children: head.topic || t('Разговор без темы') }), _jsx("span", { className: "muted", children: head.session_date ? new Date(`${head.session_date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '' })] }), list.filter((c) => c.comment).map((c) => (_jsxs("div", { className: "plan-note", children: [c.moment_seconds != null && (_jsx(Link, { className: "mono plan-at", to: `/conversations/${convId}?t=${Math.max(0, c.moment_seconds - 1)}`, children: clock(c.moment_seconds) })), _jsx("span", { translate: "no", children: c.comment }), _jsxs("span", { className: "muted", children: [" \u2014 ", _jsx("span", { translate: "no", children: c.author_name })] })] }, c.id))), _jsxs("button", { type: "button", className: "btn btn-sm btn-ghost", onClick: () => list.forEach((c) => done.mutate(c.id)), children: [_jsx(Check, { size: 13, "aria-hidden": "true" }), t('Разобрано')] })] }, convId));
            })] }));
}
/* Последние разговоры продавца с «отпечатком» */
function RecentConversations({ sellerId, period }) {
    const { data } = useQuery({
        queryKey: ['conversations', 'seller-recent', sellerId, period],
        queryFn: () => dashboardApi.getConversations({ seller_id: sellerId, limit: 5, period }),
    });
    const items = data?.items || [];
    const ids = items.map((r) => r.id);
    const { data: fps } = useQuery({
        queryKey: ['fingerprints', ids.join(',')],
        queryFn: () => dashboardApi.getFingerprints(ids),
        enabled: ids.length > 0,
        staleTime: 5 * 60 * 1000,
    });
    return (_jsxs("div", { className: "pf-sec", children: [_jsxs("div", { className: "pf-sec-h", children: [_jsx("h3", { children: t('Последние разговоры') }), _jsxs(Link, { className: "link", to: "/conversations", children: [t('Все'), _jsx(ArrowRight, { size: 13, "aria-hidden": "true" })] })] }), items.length === 0 && _jsx("p", { className: "muted", style: { fontSize: 13 }, children: t('Нет разговоров за период') }), items.map((r) => {
                const d = new Date(r.recorded_at || r.analyzed_at || r.session_date);
                return (_jsxs(Link, { className: "rc", to: `/conversations/${r.id}`, children: [_jsxs("span", { className: "rc-time", children: [_jsx("b", { children: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }), _jsx("span", { children: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })] }), _jsx("span", { className: "ellipsis", translate: r.topic ? 'no' : undefined, children: r.topic || t('Без темы') }), _jsxs("span", { className: "fp-row", children: [_jsx(Fingerprint, { data: fps?.[r.id], height: 26, marks: false }), _jsx("span", { className: "fp-dur", children: r.duration_seconds ? clock(r.duration_seconds) : '—' })] }), _jsx(OutcomeTag, { outcome: r.outcome || 'unknown' })] }, r.id));
            })] }));
}

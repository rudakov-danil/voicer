import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareQuote } from 'lucide-react';
import { upsellsApi } from '@/api/upsells';
import { analyticsApi } from '@/api/analytics';
import { useTerms } from '@/lib/terms';
import { initials } from '@/lib/format';
import { useObjectionTypeLabel } from '@/components/conversation/shared';
import { MoneyTile, Hint, MetricTile, PlanChip, METRIC, W, bestTechnique, num, ordersOf, offersOf, pct, pp, rub, techniqueLabel, times } from '@/components/upsells/metrics';
import { L, t, locale, plural } from '@/i18n';
import '@/styles/upsells.css';
/* Аналитика допродаж за период: что происходит с предложениями в сети, где и у кого проседает,
   какие приёмы работают. Для кофеен это и есть раздел «Аналитика»; в рознице — вкладка «Итоги»
   на экране «Допродажи». Данные — разбор предложений (dashboard /upsell/overview). */
const DAY_MS = 86400000;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const fmtDay = (iso, opts = { day: 'numeric', month: 'short' }) => parseDay(iso).toLocaleDateString(locale, opts);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function useWidth() {
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
    return [ref, w];
}
/** Сводка группирует по «бариста + точка»: строки одного человека из разных точек склеиваем */
function mergeSellers(rows) {
    const by = new Map();
    for (const r of rows) {
        const m = by.get(r.seller_id);
        if (!m) {
            by.set(r.seller_id, { ...r });
            continue;
        }
        m.orders += r.orders;
        m.with_offer += r.with_offer;
        m.offers += r.offers;
        m.accepted += r.accepted;
        m.shifts += r.shifts;
    }
    return [...by.values()].map((m) => {
        const rate = m.orders ? m.with_offer / m.orders : null;
        return { ...m, attempt_rate: rate, acceptance_rate: m.offers ? m.accepted / m.offers : null,
            accepted_per_shift: m.shifts ? Math.round((m.accepted / m.shifts) * 10) / 10 : null,
            plan_met: rate != null && rate >= m.attempt_rate_target };
    }).sort((a, b) => (b.attempt_rate ?? 0) - (a.attempt_rate ?? 0));
}
export function UpsellAnalytics({ days, store }) {
    const terms = useTerms();
    const to = isoDay(new Date());
    const from = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
    const prevTo = isoDay(new Date(Date.now() - days * DAY_MS));
    const prevFrom = isoDay(new Date(Date.now() - (2 * days - 1) * DAY_MS));
    const { data, isLoading, isError } = useQuery({
        queryKey: ['upsell-overview', store ?? 'all', from, to],
        queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: from, date_to: to }),
    });
    const { data: prev } = useQuery({
        queryKey: ['upsell-overview', store ?? 'all', prevFrom, prevTo],
        queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: prevFrom, date_to: prevTo }),
    });
    if (isError)
        return _jsx("div", { className: "panel up-empty", children: L('Не удалось загрузить данные. Обновите страницу.', 'Could not load the data. Refresh the page.') });
    if (isLoading || !data)
        return _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') });
    const s = data.totals;
    if (s.orders === 0) {
        return (_jsx("div", { className: "panel up-empty", children: L(`За ${days} ${plural(days, ['день', 'дня', 'дней'], ['', ''])} разобранных ${W().ordersGen} нет. Разбор допродаж делается для разговоров, записанных после 13 октября 2026 года.`, `No analysed orders in the last ${days} days. The add-on review covers conversations recorded after October 13, 2026.`) }));
    }
    const p = prev?.totals;
    const target = data.plan.attempt_rate_target;
    const delta = (a, b) => a != null && b != null && p && p.orders ? Math.round((a - b) * 100) : null;
    const dAttempt = delta(s.attempt_rate, p?.attempt_rate);
    const dAccept = delta(s.acceptance_rate, p?.acceptance_rate);
    const shifts = data.sellers.reduce((a, x) => a + x.shifts, 0);
    return (_jsxs("div", { className: "ua", children: [_jsxs("section", { className: "panel ua-kpis", "aria-label": L('Итоги за период', 'Period summary'), children: [_jsxs("div", { className: "ua-period", children: [L(`${fmtDay(data.period.from, { day: 'numeric', month: 'long' })} — ${fmtDay(data.period.to, { day: 'numeric', month: 'long' })} · ${num(s.orders)} ${plural(s.orders, W().order, ['', ''])}`, `${fmtDay(data.period.from, { day: 'numeric', month: 'long' })} – ${fmtDay(data.period.to, { day: 'numeric', month: 'long' })} · ${num(s.orders)} orders`), _jsx(Hint, { metric: "orders" })] }), _jsxs("div", { className: "m-tiles", children: [_jsxs(MetricTile, { metric: "attempt", value: pct(s.attempt_rate), base: L(`${num(s.with_offer)} ${ordersOf(s.orders)}`, `${num(s.with_offer)} ${ordersOf(s.orders)}`), children: [_jsx(PlanChip, { value: s.attempt_rate, target: target }), dAttempt != null && _jsx("span", { className: "m-delta", children: L(`${pp(dAttempt)} к прошлым ${days} дням`, `${pp(dAttempt)} vs previous ${days} days`) })] }), _jsx(MetricTile, { metric: "acceptance", value: pct(s.acceptance_rate), base: `${num(s.accepted)} ${offersOf(s.offers)}`, children: dAccept != null && _jsx("span", { className: "m-delta", children: L(`${pp(dAccept)} к прошлым ${days} дням`, `${pp(dAccept)} vs previous ${days} days`) }) }), _jsx(MoneyTile, { s: s }), _jsx(MetricTile, { metric: "accepted", value: num(s.accepted), base: shifts ? L(`≈ ${(s.accepted / shifts).toFixed(1).replace('.', ',')} за смену`, `≈ ${(s.accepted / shifts).toFixed(1)} per shift`) : undefined, children: data.plan.accepted_per_shift != null && _jsx("span", { className: "m-delta", children: L(`план — ${data.plan.accepted_per_shift} за смену`, `plan: ${data.plan.accepted_per_shift} per shift`) }) })] })] }), _jsx(Trend, { data: data, target: target }), _jsx(Hours, { data: data, target: target }), _jsxs("div", { className: "ua-cols", children: [_jsx(Stores, { data: data, title: t(terms.storePlural) }), _jsx(Techniques, { data: data })] }), _jsx(Sellers, { data: data, title: t(terms.sellerPlural), column: t(terms.seller) }), _jsxs("div", { className: "ua-cols", children: [_jsx(Items, { data: data }), _jsx(Refusals, { days: days, store: store })] }), data.missed.length > 0 && _jsx(Missed, { data: data })] }));
}
/* Динамика по дням: доля заказов с предложением и доля согласий, план — подписанной линией */
function Trend({ data, target }) {
    const [ref, w] = useWidth();
    const points = data.days.filter((d) => d.orders > 0);
    const H = 220, top = 16, bottom = 26, left = 40, right = 92;
    const width = Math.max(w, 320);
    const X = (i) => left + (points.length > 1 ? (i / (points.length - 1)) * (width - left - right) : 0);
    const Y = (v) => top + (1 - v) * (H - top - bottom);
    const line = (key) => points.map((d, i) => (d[key] == null ? '' : `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(d[key]).toFixed(1)}`)).join(' ');
    const step = Math.max(1, Math.ceil(points.length / 7));
    const first = points.slice(0, 7), last = points.slice(-7);
    const avg = (arr) => {
        const o = arr.reduce((a, d) => a + d.orders, 0);
        return o ? arr.reduce((a, d) => a + d.with_offer, 0) / o : null;
    };
    const a0 = avg(first), a1 = avg(last);
    const story = points.length >= 14 && a0 != null && a1 != null
        ? L(`За период доля ${W().ordersGen} с предложением ${a1 >= a0 ? 'выросла' : 'снизилась'}: ${pct(a0)} в первую неделю, ${pct(a1)} в последнюю.`, `Over the period the share of orders with an offer ${a1 >= a0 ? 'grew' : 'fell'}: ${pct(a0)} in the first week, ${pct(a1)} in the last.`)
        : null;
    const last1 = points[points.length - 1];
    // Подпись плана справа не должна наезжать на подписи последних значений
    const ends = last1 ? [Y(last1.attempt_rate ?? 0), Y(last1.acceptance_rate ?? 0)] : [];
    let planY = Y(target) + 4;
    if (ends.some((y) => Math.abs(y + 4 - planY) < 14))
        planY = Math.min(...ends, Y(target)) - 12;
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-trend", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "ua-trend", className: "panel-title", children: L('Динамика по дням', 'Day by day') }), _jsx("div", { className: "panel-sub", children: story })] }), _jsxs("div", { className: "ua-legend", children: [_jsxs("span", { children: [_jsx("i", { className: "ua-key is-attempt" }), L(...METRIC.attempt.title)] }), _jsxs("span", { children: [_jsx("i", { className: "ua-key is-accept" }), L(...METRIC.acceptance.title)] }), _jsxs("span", { children: [_jsx("i", { className: "ua-key is-plan" }), L('План', 'Plan')] })] })] }), _jsx("div", { ref: ref, className: "ua-chart", children: w > 0 && (_jsxs("svg", { width: width, height: H, role: "img", "aria-label": L(`Доля ${W().ordersGen} с предложением и доля согласий по дням, план ${pct(target)}`, `Offer share and acceptance by day, plan ${pct(target)}`), children: [[0, 0.25, 0.5, 0.75, 1].map((v) => (_jsxs("g", { children: [_jsx("line", { x1: left, x2: width - right, y1: Y(v), y2: Y(v), className: "ua-grid" }), _jsxs("text", { x: left - 8, y: Y(v) + 4, className: "ua-axis", textAnchor: "end", children: [Math.round(v * 100), "%"] })] }, v))), _jsx("line", { x1: left, x2: width - right, y1: Y(target), y2: Y(target), className: "ua-plan" }), _jsx("text", { x: width - right + 8, y: planY, className: "ua-plan-lbl", children: L(`план ${pct(target)}`, `plan ${pct(target)}`) }), _jsx("path", { d: line('acceptance_rate'), className: "ua-line is-accept" }), _jsx("path", { d: line('attempt_rate'), className: "ua-line is-attempt" }), points.map((d, i) => (_jsxs("g", { children: [_jsx("circle", { cx: X(i), cy: Y(d.attempt_rate ?? 0), r: 3, className: "ua-dot is-attempt", children: _jsx("title", { children: L(`${fmtDay(d.date)}: предлагали в ${pct(d.attempt_rate)} (${d.with_offer} ${ordersOf(d.orders)}), согласились ${pct(d.acceptance_rate)}`, `${fmtDay(d.date)}: offered in ${pct(d.attempt_rate)} (${d.with_offer} ${ordersOf(d.orders)}), accepted ${pct(d.acceptance_rate)}`) }) }), i % step === 0 && _jsx("text", { x: X(i), y: H - 6, className: "ua-axis", textAnchor: "middle", children: fmtDay(d.date) })] }, d.date))), last1 && (_jsxs(_Fragment, { children: [_jsx("text", { x: X(points.length - 1) + 8, y: Y(last1.attempt_rate ?? 0) + 4, className: "ua-end is-attempt", children: pct(last1.attempt_rate) }), _jsx("text", { x: X(points.length - 1) + 8, y: Y(last1.acceptance_rate ?? 0) + 4, className: "ua-end is-accept", children: pct(last1.acceptance_rate) })] }))] })) })] }));
}
/* По часам: в пик предлагать забывают — это главный повод для разговора с командой */
function Hours({ data, target }) {
    const hours = data.hours.filter((h) => h.orders > 0);
    if (!hours.length)
        return null;
    const busiest = [...hours].sort((a, b) => b.orders - a.orders).slice(0, 3).map((h) => h.hour);
    const sum = (arr) => {
        const o = arr.reduce((a, h) => a + h.orders, 0);
        return o ? arr.reduce((a, h) => a + (h.attempt_rate ?? 0) * h.orders, 0) / o : null;
    };
    const peak = sum(hours.filter((h) => busiest.includes(h.hour)));
    const rest = sum(hours.filter((h) => !busiest.includes(h.hour)));
    const gap = peak != null && rest != null ? Math.round((rest - peak) * 100) : 0;
    const maxOrders = Math.max(...hours.map((h) => h.orders));
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-hours", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-hours", className: "panel-title", children: L('По часам', 'By hour') }), _jsx("div", { className: "panel-sub", children: gap >= 3
                                ? L(`В самые загруженные часы (${busiest.sort((a, b) => a - b).map((h) => `${h}:00`).join(', ')}) предлагают реже: ${pct(peak)} против ${pct(rest)} в остальное время.`, `At the busiest hours (${busiest.sort((a, b) => a - b).map((h) => `${h}:00`).join(', ')}) offers drop: ${pct(peak)} vs ${pct(rest)} the rest of the day.`)
                                : L(`Столбик — доля ${W().ordersGen} с предложением в этот час, подпись снизу — сколько их было.`, 'Bar: share of orders with an offer in that hour; below: number of orders.') })] }) }), _jsx("ol", { className: "ua-hours", children: hours.map((h) => {
                    const below = (h.attempt_rate ?? 0) < target;
                    return (_jsxs("li", { title: L(`${h.hour}:00 — ${h.orders} ${W().ordersGen}, предлагали в ${pct(h.attempt_rate)}`, `${h.hour}:00 — ${h.orders} orders, offered in ${pct(h.attempt_rate)}`), children: [_jsx("span", { className: "ua-hour-val", children: pct(h.attempt_rate) }), _jsxs("span", { className: "ua-hour-bar", children: [_jsx("i", { className: below ? 'is-below' : 'is-met', style: { height: `${Math.max(4, (h.attempt_rate ?? 0) * 100)}%` } }), _jsx("b", { className: "ua-hour-plan", style: { bottom: `${target * 100}%` }, "aria-hidden": "true" })] }), _jsxs("span", { className: "ua-hour-h", children: [h.hour, ":00"] }), _jsx("span", { className: `ua-hour-n${busiest.includes(h.hour) ? ' is-peak' : ''}`, style: { opacity: 0.45 + 0.55 * (h.orders / maxOrders) }, children: h.orders })] }, h.hour));
                }) }), _jsxs("p", { className: "ua-note", children: [_jsxs("span", { className: "ua-note-key", children: [_jsx("i", { className: "ua-key is-plan" }), L(`план ${pct(target)}`, `plan ${pct(target)}`)] }), _jsxs("span", { className: "ua-note-key", children: [_jsx("i", { className: "ua-key is-met" }), L('план выполнен', 'plan met')] }), _jsxs("span", { className: "ua-note-key", children: [_jsx("i", { className: "ua-key is-below" }), L('ниже плана', 'below plan')] }), _jsx("span", { children: L(`Под часом — число ${W().ordersGen}, жирным — самые загруженные часы.`, 'Under each hour: number of orders; bold: busiest hours.') })] })] }));
}
function Stores({ data, title }) {
    const terms = useTerms();
    if (data.stores.length < 2)
        return null;
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-stores", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-stores", className: "panel-title", children: title }), _jsx("div", { className: "panel-sub", children: L(`Доля ${W().ordersGen} с предложением и план, который действует ${terms.inStore}`, 'Share of orders with an offer and the plan set for each location') })] }) }), _jsx("ul", { className: "ua-rows", children: data.stores.map((x) => (_jsxs("li", { children: [_jsxs("div", { className: "ua-row-main", children: [_jsx("b", { translate: "no", children: x.store_name }), _jsx("span", { className: "ua-row-sub", children: L(`${num(x.orders)} ${W().ordersGen} · согласились ${pct(x.acceptance_rate)}${x.upsell_revenue_n ? ` · допродажи на ${rub(x.upsell_revenue)}` : ''}`, `${num(x.orders)} orders · accepted ${pct(x.acceptance_rate)}${x.upsell_revenue_n ? ` · add-ons ${rub(x.upsell_revenue)}` : ''}`) })] }), _jsxs("div", { className: "ua-row-side", children: [_jsx("span", { className: "ua-row-val", children: pct(x.attempt_rate) }), _jsx(PlanChip, { value: x.attempt_rate, target: x.attempt_rate_target, compact: true })] })] }, x.store_id))) })] }));
}
function Techniques({ data }) {
    const rows = data.techniques.filter((x) => x.offers > 0);
    if (!rows.length)
        return null;
    const generic = rows.find((x) => x.technique === 'generic');
    const best = bestTechnique(rows);
    const ratio = generic?.acceptance_rate && best?.acceptance_rate ? best.acceptance_rate / generic.acceptance_rate : null;
    const maxRate = Math.max(...rows.map((x) => x.acceptance_rate ?? 0), 0.01);
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-tech", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-tech", className: "panel-title", children: L('Как предлагают', 'How offers are made') }), _jsx("div", { className: "panel-sub", children: ratio && ratio >= 1.5 && best
                                ? L(`Приём «${techniqueLabel(best.technique)}» срабатывает ${times(ratio)} чаще, чем «Что-нибудь ещё?».`, `“${techniqueLabel(best.technique)}” works ${times(ratio)} more often than “Anything else?”.`)
                                : L('Доля согласий по каждому приёму', 'Acceptance by technique') })] }) }), _jsx("ul", { className: "ua-bars", children: [...rows].sort((a, b) => (b.acceptance_rate ?? 0) - (a.acceptance_rate ?? 0)).map((x) => (_jsxs("li", { children: [_jsx("span", { className: "ua-bar-name", children: techniqueLabel(x.technique) }), _jsx("span", { className: "ua-bar", children: _jsx("i", { className: x.technique === 'generic' ? 'is-weak' : '', style: { width: `${((x.acceptance_rate ?? 0) / maxRate) * 100}%` } }) }), _jsxs("span", { className: "ua-bar-val", children: [pct(x.acceptance_rate), _jsx("small", { children: L(` · ${num(x.accepted)} из ${num(x.offers)}`, ` · ${num(x.accepted)} of ${num(x.offers)}`) })] })] }, x.technique))) })] }));
}
function Sellers({ data, title, column }) {
    const terms = useTerms();
    const rows = useMemo(() => mergeSellers(data.sellers), [data]);
    const perShift = data.plan.accepted_per_shift;
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-sellers", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-sellers", className: "panel-title", children: title }), _jsx("div", { className: "panel-sub", children: L(`Отсортировано по доле ${W().ordersGen} с предложением. Рядом — план сотрудника или ${terms.storeForms[1] === 'аптеки' ? 'его аптеки' : terms.storeForms[1] === 'точки' ? 'его точки' : 'его магазина'}.`, 'Sorted by share of orders with an offer, next to each person’s plan.') })] }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "ua-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: column }), _jsx("th", { className: "ua-num", children: L('Смен', 'Shifts') }), _jsx("th", { className: "ua-num", children: L('Заказов', 'Orders') }), _jsxs("th", { children: [L(...METRIC.attempt.title), _jsx(Hint, { metric: "attempt" })] }), _jsxs("th", { className: "ua-num", children: [L(...METRIC.acceptance.title), _jsx(Hint, { metric: "acceptance" })] }), _jsxs("th", { className: "ua-num", children: [L('Допродаж за смену', 'Add-ons per shift'), _jsx(Hint, { metric: "accepted" })] })] }) }), _jsx("tbody", { children: rows.map((x) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("span", { className: "ua-who", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(x.name) || '?' }), _jsxs("span", { children: [_jsx("b", { translate: "no", children: x.name }), _jsx("small", { translate: "no", children: x.store_name })] })] }) }), _jsx("td", { className: "ua-num", children: x.shifts }), _jsx("td", { className: "ua-num", children: num(x.orders) }), _jsx("td", { children: _jsxs("span", { className: "ua-attempt", children: [_jsx("b", { children: pct(x.attempt_rate) }), _jsx(PlanChip, { value: x.attempt_rate, target: x.attempt_rate_target, compact: true })] }) }), _jsx("td", { className: "ua-num", children: pct(x.acceptance_rate) }), _jsxs("td", { className: "ua-num", children: [_jsx("span", { className: perShift != null && x.accepted_per_shift != null && x.accepted_per_shift >= perShift ? 'ua-ok' : undefined, children: x.accepted_per_shift != null ? String(x.accepted_per_shift).replace('.', L(',', '.')) : '—' }), perShift != null && _jsx("small", { className: "ua-of", children: L(` · план ${perShift}`, ` · plan ${perShift}`) })] })] }, x.seller_id))) })] }) })] }));
}
function Items({ data }) {
    const focus = new Set(data.focus.map((f) => f.item));
    const rows = data.items.filter((x) => x.item !== 'что-нибудь ещё').slice(0, 8);
    if (!rows.length)
        return null;
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-items", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-items", className: "panel-title", children: L('Что предлагают и что берут', 'What is offered and taken') }), _jsx("div", { className: "panel-sub", children: L(`Сколько раз предлагали и сколько раз ${W().customer} согласился`, 'How often it was offered and accepted') })] }) }), _jsx("ul", { className: "ua-rows", children: rows.map((x) => (_jsxs("li", { children: [_jsxs("div", { className: "ua-row-main", children: [_jsx("b", { translate: "no", children: cap(x.item) }), focus.has(x.item) && _jsx("span", { className: "ua-focus", children: L('товар дня', 'item of the day') })] }), _jsxs("div", { className: "ua-row-side", children: [_jsx("span", { className: "ua-row-val", children: pct(x.acceptance_rate) }), _jsx("small", { children: L(`${num(x.accepted)} из ${num(x.offers)}`, `${num(x.accepted)} of ${num(x.offers)}`) })] })] }, x.item))) })] }));
}
/* Почему отказываются: возражения гостей и как на них ответили */
function Refusals({ days, store }) {
    const label = useObjectionTypeLabel();
    const { data } = useQuery({
        queryKey: ['objections-resolution', days, store ?? 'all'],
        queryFn: () => analyticsApi.getObjectionsResolution({ period: days, store_id: store }),
    });
    const rows = (data || []).filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 6);
    if (!rows.length)
        return null;
    const total = rows.reduce((a, x) => a + x.total, 0);
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-refusals", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-refusals", className: "panel-title", children: L('Почему отказываются', 'Why guests decline') }), _jsx("div", { className: "panel-sub", children: L(`Причины, которые ${W().customer} назвал вслух, и как часто ${W().seller} отвечал спокойно, без давления`, 'Reasons guests gave and how often staff responded calmly, without pressure') })] }) }), _jsx("ul", { className: "ua-rows", children: rows.map((x) => (_jsxs("li", { children: [_jsxs("div", { className: "ua-row-main", children: [_jsx("b", { children: t(label(x.type)) }), _jsx("span", { className: "ua-row-sub", children: L(`ответили хорошо в ${pct(x.resolution_rate > 1 ? x.resolution_rate / 100 : x.resolution_rate)}`, `handled well in ${pct(x.resolution_rate > 1 ? x.resolution_rate / 100 : x.resolution_rate)}`) })] }), _jsxs("div", { className: "ua-row-side", children: [_jsx("span", { className: "ua-row-val", children: pct(x.total / total) }), _jsx("small", { children: num(x.total) })] })] }, x.type))) })] }));
}
function Missed({ data }) {
    return (_jsxs("section", { className: "panel ua-card", "aria-labelledby": "ua-missed", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ua-missed", className: "panel-title", children: L('Упущенные возможности', 'Missed opportunities') }), _jsx("div", { className: "panel-sub", children: L(`Последние ${W().orders} без предложения и что можно было сказать — готовые фразы для разбора с командой`, 'Recent orders without an offer and what could have been said') })] }) }), _jsx("ul", { className: "up-convs ua-missed", children: data.missed.slice(0, 6).map((m) => (_jsx("li", { children: _jsxs(Link, { to: `/conversations/${m.conversation_id}`, className: "up-conv", children: [_jsx("span", { className: "up-conv-time", children: fmtDay(m.session_date) }), _jsxs("span", { className: "up-conv-main", children: [_jsx("span", { className: "up-conv-topic", children: _jsx("span", { className: "ellipsis", translate: "no", children: [m.seller_name, m.items.join(', ')].filter(Boolean).join(' · ') }) }), m.missed && _jsx("span", { className: "ua-missed-why", translate: "no", children: m.missed }), m.better_phrase && _jsxs("span", { className: "up-better", children: [_jsx(MessageSquareQuote, { size: 13, "aria-hidden": "true" }), L('Можно было: ', 'Could say: '), _jsxs("span", { translate: "no", children: ["\u00AB", m.better_phrase, "\u00BB"] })] })] })] }) }, m.conversation_id))) })] }));
}

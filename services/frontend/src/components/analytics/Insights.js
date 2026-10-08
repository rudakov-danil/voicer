import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { pct } from '@/components/ui/Spark';
import { t, L, locale, plural } from '@/i18n';
/* Блоки «Аналитики» по концепту (ui-concept/analytics.html). */
const dec = (v, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const SERIES = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--seq-6)', 'var(--warn)', 'var(--ink-3)'];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// translate="no" для имён в SVG: в типах React у SVG-элементов этого атрибута нет
const NO_TR = { translate: 'no' };
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
export function useInsights(period) {
    return useQuery({ queryKey: ['insights', period], queryFn: () => dashboardApi.getInsights(period) });
}
/* ─── Конверсия по магазинам за 12 недель ───────────────────────────────── */
export function StoreConversion({ trends }) {
    const [ref, w] = useWidth();
    const stores = (trends?.stores || []).map((s, i) => ({
        name: s.store_name || '—',
        color: SERIES[i % SERIES.length],
        conv: s.purchases.map((p, k) => pct(p, s.scorable[k])),
    }));
    const vals = stores.flatMap((s) => s.conv).filter((v) => v != null);
    const lo = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 2) / 5) * 5) : 0;
    const hi = vals.length ? Math.min(100, Math.ceil((Math.max(...vals) + 2) / 5) * 5) : 100;
    const H = 230, top = 8, bottom = 22, right = 120;
    const n = trends?.weeks.length || 12;
    const X = (i) => 34 + (i / Math.max(1, n - 1)) * (w - 34 - right);
    const Y = (v) => top + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - top - bottom);
    const grid = [lo, (lo + hi) / 2, hi];
    const label = (i) => new Date(`${trends.weeks[i]}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    // Подписи на конце линий не должны налезать друг на друга
    const ends = stores.map((s) => {
        const idx = s.conv.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
        return idx != null ? { ...s, i: idx, v: s.conv[idx], y: Y(s.conv[idx]) } : null;
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++)
        if (ends[k].y - ends[k - 1].y < 26)
            ends[k].y = ends[k - 1].y + 26;
    return (_jsxs("section", { className: "panel", "aria-labelledby": "sc-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "sc-title", className: "panel-title", children: t('Конверсия в покупку по магазинам') }), _jsx("div", { className: "panel-sub", children: t('Доля разговоров, которые закончились покупкой, по неделям') })] }), _jsx("span", { className: "legend", children: stores.map((s) => _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: s.color, height: 2 } }), _jsx("span", { translate: "no", children: s.name })] }, s.name)) })] }), _jsx("div", { className: "panel-body", children: _jsx("div", { ref: ref, className: "an-chart", style: { height: H }, children: w > 0 && trends && (_jsxs("svg", { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": L('Конверсия магазинов по неделям', 'Store conversion by week'), children: [grid.map((v) => (_jsxs("g", { children: [_jsx("line", { x1: 34, x2: w - right, y1: Y(v), y2: Y(v), className: "lc-grid" }), _jsxs("text", { x: 0, y: Y(v) + 4, className: "lc-lbl", children: [Math.round(v), " %"] })] }, v))), stores.map((s) => {
                                const d = s.conv.map((v, i) => (v != null ? [X(i), Y(v)] : null)).filter(Boolean)
                                    .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
                                return _jsx("path", { d: d, fill: "none", stroke: s.color, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }, s.name);
                            }), ends.map((e) => (_jsxs("g", { children: [_jsx("circle", { cx: X(e.i), cy: Y(e.v), r: 3.5, fill: e.color, stroke: "var(--panel)", strokeWidth: 2 }), _jsxs("text", { x: w - right + 10, y: e.y + 4, className: "lc-endlbl", children: [dec(e.v), " %"] }), _jsx("text", { x: w - right + 10, y: e.y + 16, className: "lc-lbl", ...NO_TR, children: e.name.length > 18 ? `${e.name.slice(0, 17)}…` : e.name })] }, e.name))), [0, Math.floor((n - 1) / 2), n - 1].map((i) => (_jsx("text", { x: X(i), y: H - 4, textAnchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', className: "lc-lbl", children: label(i) }, i)))] })) }) })] }));
}
/* ─── Что влияет на покупку ─────────────────────────────────────────────── */
export function Drivers({ data }) {
    const items = data?.drivers || [];
    return (_jsxs("section", { className: "panel", "aria-labelledby": "dr-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "dr-title", className: "panel-title", children: t('Что влияет на покупку') }), _jsx("div", { className: "panel-sub", children: t('Конверсия, когда условие выполнено, и когда нет') })] }) }), _jsxs("div", { className: "panel-body", children: [items.length === 0 && _jsx("p", { className: "muted", children: t('Мало разговоров, чтобы сравнивать.') }), items.map((d) => (_jsxs("div", { className: "drv", children: [_jsx("div", { className: "drv-label", translate: d.key.startsWith('step:') ? 'no' : undefined, children: d.key.startsWith('step:') ? L(d.label, `Stage “${d.key.slice(5)}” done`) : t(d.label) }), _jsxs("div", { className: "drv-row", children: [_jsxs("span", { className: "db-track", role: "img", "aria-label": L(`${dec(d.with)} % против ${dec(d.without)} %`, `${d.with.toFixed(1)}% vs ${d.without.toFixed(1)}%`), children: [_jsx("span", { className: "db-line", style: { left: `${Math.min(d.with, d.without)}%`, width: `${Math.abs(d.with - d.without)}%` } }), _jsx("span", { className: "db-dot is-team", style: { left: `${d.without}%` } }), _jsx("span", { className: "db-dot is-me", style: { left: `${d.with}%` } })] }), _jsxs("span", { className: "drv-val", children: [_jsxs("b", { children: [dec(d.with), "\u00A0%"] }), " ", _jsx("span", { className: "muted", children: L(`против ${dec(d.without)} %`, `vs ${d.without.toFixed(1)}%`) })] })] }), _jsxs("div", { className: "drv-note", children: [_jsxs("span", { className: d.diff >= 0 ? 'is-good' : 'is-bad', children: [d.diff >= 0 ? '+' : '−', dec(Math.abs(d.diff)), "\u00A0", L('п. п.', 'pp')] }), ' · ', L(`в ${d.share} % разговоров`, `in ${d.share}% of conversations`)] })] }, d.key)))] }), _jsx("div", { className: "panel-foot", children: _jsxs("span", { className: "legend", children: [_jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "db-key is-me" }), t('условие выполнено')] }), _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "db-key is-team" }), t('не выполнено')] })] }) })] }));
}
/* ─── Где уходят покупатели: сколько разговоров прошли этапы по порядку ──── */
export function Funnel({ data }) {
    const f = data?.funnel;
    return (_jsxs("section", { className: "panel", "aria-labelledby": "fn-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "fn-title", className: "panel-title", children: t('Где уходят покупатели') }), _jsx("div", { className: "panel-sub", children: t('Сколько разговоров прошли этапы скрипта по порядку (балл этапа 50+)') })] }) }), _jsx("div", { className: "panel-body", children: !f ? _jsx("p", { className: "muted", children: t('За период нет разговоров, оценённых по скрипту.') }) : (_jsxs(_Fragment, { children: [_jsx(FunnelRow, { label: t('Разговор начат'), count: f.total, total: f.total }), f.steps.map((s) => (_jsxs("div", { children: [s.lost > 0 && (_jsxs("div", { className: "fn-drop", children: [_jsxs("span", { className: "fn-lost", children: ["\u2212", s.lost] }), _jsxs("span", { children: [L(`Не выполнен этап «${s.step}»`, `Stage “${s.step}” not done`), s.hint ? _jsxs("span", { className: "muted", translate: "no", children: [" \u2014 ", s.hint] }) : null] })] })), _jsx(FunnelRow, { label: s.step, count: s.count, total: f.total, translate: true })] }, s.step))), _jsx(FunnelRow, { label: t('Покупка'), count: f.purchases, total: f.total, won: true, note: L(`из них после всех этапов — ${f.purchases_after_all_steps}`, `${f.purchases_after_all_steps} after all stages`) })] })) })] }));
}
function FunnelRow({ label, count, total, won, note, translate }) {
    return (_jsxs("div", { className: "fn-row", children: [_jsxs("span", { className: "fn-label", translate: translate ? 'no' : undefined, children: [label, note && _jsx("span", { className: "fn-note", children: note })] }), _jsx("span", { className: "fn-bar", children: _jsx("span", { className: won ? 'is-won' : '', style: { width: `${total ? Math.max(1, (count / total) * 100) : 0}%` } }) }), _jsx("b", { className: "fn-n", children: count.toLocaleString(locale) })] }));
}
/* ─── Нагрузка по часам ─────────────────────────────────────────────────── */
export function HourlyLoad({ data }) {
    const cells = data?.hourly || [];
    const hours = cells.map((c) => c.hour);
    const h0 = Math.min(10, ...hours);
    const h1 = Math.max(21, ...hours);
    const cols = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
    const at = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c]));
    const max = Math.max(1, ...cells.map((c) => c.per_week));
    const totalN = cells.reduce((a, c) => a + c.count, 0);
    const avgConv = totalN ? cells.reduce((a, c) => a + (c.conversion ?? 0) * c.count, 0) / totalN : 0;
    const weak = (c) => c.count >= 3 && c.conversion != null && c.conversion < avgConv - 10;
    const band = (v) => Math.min(6, 1 + Math.floor((v / max) * 5.999));
    const busiest = [...cells].sort((a, b) => b.per_week - a.per_week)[0];
    const fmt = (v) => (v >= 10 ? Math.round(v).toString() : dec(v));
    return (_jsxs("section", { className: "panel", "aria-labelledby": "hr-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "hr-title", className: "panel-title", children: t('Нагрузка по часам') }), _jsx("div", { className: "panel-sub", children: L(`Разговоров в час, в среднем за неделю · красная рамка — конверсия ниже ${Math.max(0, Math.round(avgConv - 10))} %`, `Conversations per hour, weekly average · red frame — conversion below ${Math.max(0, Math.round(avgConv - 10))}%`) })] }) }), _jsx("div", { className: "panel-body", children: cells.length === 0 ? _jsx("p", { className: "muted", children: t('Нет данных за период') }) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "heat-wrap", children: _jsxs("table", { className: "heat hourly", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "row-h", scope: "col", children: _jsx("span", { className: "sr-only", children: t('День') }) }), cols.map((h) => _jsx("th", { scope: "col", children: h }, h))] }) }), _jsx("tbody", { children: DAYS.map((d, i) => (_jsxs("tr", { children: [_jsx("td", { className: "name", children: t(d) }), cols.map((h) => {
                                                    const c = at.get(`${i + 1}:${h}`);
                                                    if (!c)
                                                        return _jsx("td", { className: "cell is-empty" }, h);
                                                    return (_jsx("td", { className: `cell b${band(c.per_week)} ${weak(c) ? 'is-crit' : ''}`, tabIndex: 0, title: `${t(d)}, ${h}:00–${h + 1}:00 · ${c.count} ${plural(c.count, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}${c.conversion != null ? L(` · конверсия ${Math.round(c.conversion)} %`, ` · conversion ${Math.round(c.conversion)}%`) : ''}`, children: fmt(c.per_week) }, h));
                                                })] }, d))) })] }) }), busiest && (_jsx("div", { className: `an-note ${weak(busiest) ? 'is-crit' : ''}`, children: L(`Больше всего разговоров — ${DAYS[busiest.dow - 1].toLowerCase()}, ${busiest.hour}:00–${busiest.hour + 1}:00: ${fmt(busiest.per_week)} в неделю${busiest.conversion != null ? `, конверсия ${Math.round(busiest.conversion)} % при средней ${Math.round(avgConv)} %` : ''}.`, `Busiest hour: ${t(DAYS[busiest.dow - 1])}, ${busiest.hour}:00–${busiest.hour + 1}:00 with ${fmt(busiest.per_week)} a week${busiest.conversion != null ? `, conversion ${Math.round(busiest.conversion)}% vs ${Math.round(avgConv)}% on average` : ''}.`) }))] })) })] }));
}
/* ─── Что отвечают на «дорого» ──────────────────────────────────────────── */
export function PriceAnswers({ data }) {
    const items = (data?.price_answers || []).filter((a) => a.conversion != null);
    const base = (() => {
        const n = items.reduce((a, x) => a + x.conversations, 0);
        return n ? items.reduce((a, x) => a + (x.conversion ?? 0) * x.conversations, 0) / n : 0;
    })();
    const worst = items.filter((a) => a.label !== 'Нет ответа' && a.conversations >= 2).sort((a, b) => (a.conversion ?? 0) - (b.conversion ?? 0))[0];
    return (_jsxs("section", { className: "panel", "aria-labelledby": "pa-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "pa-title", className: "panel-title", children: t('Что отвечают на «дорого»') }), _jsx("div", { className: "panel-sub", children: t('Конверсия после ответа продавца. Ответы сгруппированы по ключевым словам из разбора ИИ') })] }) }), _jsxs("div", { className: "panel-body", children: [items.length === 0 && _jsx("p", { className: "muted", children: t('Возражений о цене за период нет.') }), items.map((a) => (_jsxs("div", { className: "pa-row", children: [_jsxs("span", { children: [_jsx("span", { className: "pa-label", children: t(a.label) }), _jsxs("span", { className: "muted pa-n", children: [a.times, " ", plural(a.times, ['раз', 'раза', 'раз'], ['time', 'times'])] })] }), _jsx("span", { className: "pa-bar", children: _jsx("span", { className: (a.conversion ?? 0) < base ? 'is-low' : '', style: { width: `${Math.max(2, a.conversion ?? 0)}%` } }) }), _jsxs("b", { className: "pa-val", children: [dec(a.conversion ?? 0), "\u00A0%"] })] }, a.label)))] }), worst && (worst.conversion ?? 0) < base && (_jsx("div", { className: "panel-foot", children: _jsx("span", { children: L(`«${worst.label}» работает хуже всего: ${dec(worst.conversion ?? 0)} % при средней ${dec(base)} %.`, `“${t(worst.label)}” works worst: ${(worst.conversion ?? 0).toFixed(1)}% vs ${base.toFixed(1)}% on average.`) }) }))] }));
}
/* ─── Кто больше говорит — меньше продаёт ───────────────────────────────── */
export function TalkScatter({ data }) {
    const [ref, w] = useWidth();
    const pts = (data?.talk || []).filter((p) => p.conversion != null && p.conversations >= 2);
    const H = 260, left = 36, bottom = 26, top = 10, right = 12;
    const xs = pts.map((p) => p.talk_share);
    const ys = pts.map((p) => p.conversion);
    const x0 = Math.min(40, Math.floor((Math.min(...xs, 50) - 5) / 5) * 5);
    const x1 = Math.max(75, Math.ceil((Math.max(...xs, 60) + 5) / 5) * 5);
    const y0 = Math.max(0, Math.floor((Math.min(...ys, 50) - 5) / 10) * 10);
    const y1 = Math.min(100, Math.ceil((Math.max(...ys, 0) + 5) / 10) * 10);
    const X = (v) => left + ((v - x0) / Math.max(1, x1 - x0)) * (w - left - right);
    const Y = (v) => top + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - top - bottom);
    // Линия тренда — наименьшие квадраты
    const trend = (() => {
        if (pts.length < 3)
            return null;
        const n = pts.length;
        const mx = xs.reduce((a, b) => a + b, 0) / n;
        const my = ys.reduce((a, b) => a + b, 0) / n;
        const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
        if (!sxx)
            return null;
        const k = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
        return { k, b: my - k * mx };
    })();
    const short = (name) => {
        const [f, l] = (name || '').split(/\s+/);
        return l ? `${f} ${l[0]}.` : f || '—';
    };
    return (_jsxs("section", { className: "panel", "aria-labelledby": "ts-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "ts-title", className: "panel-title", children: t('Кто больше говорит — меньше продаёт') }), _jsx("div", { className: "panel-sub", children: t('Доля речи продавца и его конверсия за период') })] }) }), _jsxs("div", { className: "panel-body", children: [_jsxs("div", { ref: ref, className: "an-chart", style: { height: H }, children: [w > 0 && pts.length > 0 && (_jsxs("svg", { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": L('Доля речи и конверсия по продавцам', 'Talk share and conversion by seller'), children: [_jsx("rect", { x: X(Math.max(40, x0)), y: top, width: X(Math.min(60, x1)) - X(Math.max(40, x0)), height: H - top - bottom, className: "ts-norm" }), _jsx("text", { x: X(Math.max(40, x0)) + 6, y: top + 14, className: "ts-norm-lbl", children: t('Норма 40–60 %') }), [y0, (y0 + y1) / 2, y1].map((v) => (_jsxs("g", { children: [_jsx("line", { x1: left, x2: w - right, y1: Y(v), y2: Y(v), className: "lc-grid" }), _jsxs("text", { x: 0, y: Y(v) + 4, className: "lc-lbl", children: [Math.round(v), " %"] })] }, v))), [x0, (x0 + x1) / 2, x1].map((v) => (_jsxs("text", { x: X(v), y: H - 6, textAnchor: "middle", className: "lc-lbl", children: [Math.round(v), " %"] }, v))), trend && _jsx("line", { x1: X(x0), y1: Y(Math.max(y0, Math.min(y1, trend.k * x0 + trend.b))), x2: X(x1), y2: Y(Math.max(y0, Math.min(y1, trend.k * x1 + trend.b))), className: "ts-trend" }), pts.map((p) => (_jsxs("g", { children: [_jsx("title", { children: `${p.name}: ${L('говорит', 'talks')} ${Math.round(p.talk_share)} %, ${L('конверсия', 'conversion')} ${Math.round(p.conversion)} %, ${p.conversations} ${plural(p.conversations, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}` }), _jsx("circle", { cx: X(p.talk_share), cy: Y(p.conversion), r: 4.5, className: "ts-dot" }), _jsx("text", { x: X(p.talk_share) + 8, y: Y(p.conversion) + 4, className: "ts-lbl", ...NO_TR, children: short(p.name) })] }, p.seller_id)))] })), pts.length === 0 && _jsx("p", { className: "muted", children: t('Мало разговоров с разметкой речи.') })] }), _jsx("div", { className: "an-axis-note", children: t('доля речи продавца →') })] })] }));
}

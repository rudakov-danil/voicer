import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, TriangleAlert, OctagonAlert, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { analyticsApi } from '@/api/analytics';
import { outcomeColor, outcomeLabel } from '@/lib/outcomes';
import { initials } from '@/lib/format';
import { Meter } from '@/components/ui/Meter';
import { Spark, Delta, pct, lastAndDelta } from '@/components/ui/Spark';
import { Pulse } from '@/components/dashboard/Pulse';
import { ReviewQueue } from '@/components/dashboard/ReviewQueue';
import { useObjectionTypeLabel } from '@/components/conversation/shared';
import { t, L, locale, plural } from '@/i18n';
const dec = (v, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const PP = ' п. п.';
export function DashboardPage() {
    const { period, setPeriod } = useOutletContext();
    const navigate = useNavigate();
    const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: () => dashboardApi.getTrends({ weeks: 12 }) });
    return (_jsxs("div", { className: "dash", children: [_jsx(Pulse, { onOpenAttention: () => { setPeriod(7); navigate('/conversations?view=attention'); } }), _jsxs("div", { className: "dash-a", children: [_jsx(ReviewQueue, { period: period }), _jsxs("div", { className: "stack", children: [_jsx(Kpis, { period: period, trends: trends }), _jsx(Outcomes, { period: period }), _jsx(Violations, { period: period })] })] }), _jsxs("div", { className: "dash-b", children: [_jsx(Stores, { trends: trends }), _jsx(Objections, { period: period })] }), _jsxs("div", { className: "dash-c", children: [_jsx(Losses, { period: period }), _jsx(Movers, { period: period, trends: trends })] })] }));
}
/* ─── Показатели: значение за период, изменение к прошлому такому же периоду, ряд за 12 недель ── */
function Kpis({ period, trends }) {
    const { data: cur } = useQuery({ queryKey: ['dashboard-overview', period], queryFn: () => dashboardApi.getOverview({ period }) });
    const { data: prev } = useQuery({ queryKey: ['dashboard-overview', period, 'prev'], queryFn: () => dashboardApi.getOverview({ period, previous: true }) });
    const net = trends?.network;
    const weekly = (num, den) => num.map((n, i) => pct(n, den[i]));
    const conv = cur ? cur.conversion_rate * 100 : null;
    const convPrev = prev && prev.total_conversations ? prev.conversion_rate * 100 : null;
    const score = cur && cur.total_conversations ? cur.avg_score : null;
    const scorePrev = prev && prev.total_conversations ? prev.avg_score : null;
    const sell = cur ? pct(cur.sell_done ?? 0, cur.sell_need ?? 0) : null;
    const sellPrev = prev ? pct(prev.sell_done ?? 0, prev.sell_need ?? 0) : null;
    const obj = cur ? pct(cur.objections_resolved ?? 0, cur.objections_total ?? 0) : null;
    const objPrev = prev ? pct(prev.objections_resolved ?? 0, prev.objections_total ?? 0) : null;
    const diff = (a, b) => (a != null && b != null ? a - b : null);
    const kpis = [
        {
            label: 'Конверсия в покупку', value: conv != null ? dec(conv) : '—', unit: conv != null ? '%' : '',
            delta: _jsx(Delta, { value: diff(conv, convPrev), unit: PP, digits: 1 }),
            spark: net ? weekly(net.purchases, net.scorable) : [],
            note: cur ? L(`${cur.purchases ?? 0} из ${cur.total_conversations}`, `${cur.purchases ?? 0} of ${cur.total_conversations}`) : '',
        },
        {
            label: 'Балл по скрипту', value: score != null ? String(Math.round(score)) : '—', unit: '',
            delta: _jsx(Delta, { value: diff(score, scorePrev) }),
            spark: net?.avg_score || [],
            note: t('из 100'),
        },
        {
            label: 'Допродажа предложена', value: sell != null ? String(Math.round(sell)) : '—', unit: sell != null ? '%' : '',
            delta: _jsx(Delta, { value: diff(sell, sellPrev), unit: PP }),
            spark: net ? weekly(net.sell_done, net.sell_need) : [],
            note: cur?.sell_need ? L(`${cur.sell_need} ${plural(cur.sell_need, ['разговор', 'разговора', 'разговоров'], ['', ''])} с правилом`, `${cur.sell_need} with a rule`) : t('правило не срабатывало'),
        },
        {
            label: 'Возражения отработаны', value: obj != null ? String(Math.round(obj)) : '—', unit: obj != null ? '%' : '',
            delta: _jsx(Delta, { value: diff(obj, objPrev), unit: PP }),
            spark: net ? weekly(net.objections_resolved, net.objections) : [],
            note: cur ? L(`${cur.objections_total ?? 0} ${plural(cur.objections_total ?? 0, ['возражение', 'возражения', 'возражений'], ['', ''])}`, `${cur.objections_total ?? 0} objections`) : '',
        },
    ];
    return (_jsx("div", { className: "kpi-grid", children: kpis.map((k) => (_jsx("section", { className: "panel", "aria-label": t(k.label), children: _jsxs("div", { className: "kpi", children: [_jsx("div", { className: "kpi-label", children: t(k.label) }), _jsxs("div", { className: "kpi-row", children: [_jsxs("div", { className: "kpi-value", children: [k.value, k.unit && _jsxs("small", { children: ["\u00A0", k.unit] })] }), _jsx(Spark, { values: k.spark, label: L('Динамика за 12 недель', 'Trend over 12 weeks') })] }), _jsxs("div", { className: "kpi-foot", children: [k.delta, _jsx("span", { children: k.note })] })] }) }, k.label))) }));
}
/* ─── Чем заканчиваются разговоры ─────────────────────────────────────────── */
function Outcomes({ period }) {
    const { data } = useQuery({ queryKey: ['dashboard-overview', period], queryFn: () => dashboardApi.getOverview({ period }) });
    const outs = (data?.outcomes || []).map((o) => ({ key: o.outcome || 'unknown', n: o.count }));
    const total = outs.reduce((a, o) => a + o.n, 0);
    return (_jsxs("section", { className: "panel outcomes", "aria-labelledby": "out-title", children: [_jsxs("div", { className: "spread", children: [_jsx("h2", { id: "out-title", className: "panel-title", children: t('Чем заканчиваются разговоры') }), _jsxs("span", { className: "muted", style: { fontSize: 12.5 }, children: [total.toLocaleString(locale), " ", plural(total, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])] })] }), total > 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "stackbar", role: "img", "aria-label": outs.map((o) => `${t(outcomeLabel(o.key))} ${Math.round((o.n / total) * 100)}%`).join(', '), children: outs.map((o) => (_jsx("span", { style: { width: `${(o.n / total) * 100}%`, background: outcomeColor(o.key) }, title: `${t(outcomeLabel(o.key))}: ${o.n}` }, o.key))) }), _jsx("div", { className: "ob-grid", children: outs.map((o) => (_jsxs("div", { className: "ob-item", children: [_jsx("span", { className: "key-bar", style: { background: outcomeColor(o.key) } }), _jsx("span", { className: "ellipsis", children: t(outcomeLabel(o.key)) }), _jsxs("b", { children: [Math.round((o.n / total) * 100), "\u00A0%", _jsx("span", { className: "muted", children: o.n })] })] }, o.key))) })] })) : _jsx("p", { className: "muted", style: { marginTop: 10 }, children: t('Нет данных за период') })] }));
}
/* ─── Нарушения по правилам ──────────────────────────────────────────────── */
function Violations({ period }) {
    const { data } = useQuery({ queryKey: ['violations-by-rule', period], queryFn: () => dashboardApi.getViolationsByRule({ period }) });
    const items = data?.items || [];
    return (_jsxs("section", { className: "panel", "aria-labelledby": "vio-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "vio-title", className: "panel-title", children: t('Нарушения за период') }), _jsx("div", { className: "panel-sub", children: data ? L(`${data.conversations} ${plural(data.conversations, ['разговор', 'разговора', 'разговоров'], ['', ''])} · правила общения с покупателями`, `${data.conversations} conversations · customer communication rules`) : '' })] }), _jsxs(Link, { className: "link", to: "/compliance", children: [t('Комплаенс'), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] })] }), _jsxs("div", { className: "panel-body", style: { paddingTop: 8 }, children: [items.length === 0 && _jsx("p", { className: "muted", children: t('Нарушений за период нет.') }), items.slice(0, 5).map((v) => {
                        const d = v.count - v.prev;
                        return (_jsxs("div", { className: "vio", children: [_jsx("span", { className: `q-sev vio-sev ${v.severity === 'high' ? 'is-crit' : 'is-warn'}`, "aria-hidden": "true", children: v.severity === 'high' ? _jsx(OctagonAlert, { size: 15 }) : _jsx(TriangleAlert, { size: 15 }) }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: "vio-rule", translate: "no", children: v.rule_title }), _jsxs("div", { className: "vio-ops", children: [v.sellers.map((n) => _jsx("span", { className: "avatar", title: n, translate: "no", children: initials(n) }, n)), _jsxs("span", { className: "ellipsis", translate: "no", children: [v.sellers.join(', '), v.sellers_count > v.sellers.length ? L(` и ещё ${v.sellers_count - v.sellers.length}`, ` and ${v.sellers_count - v.sellers.length} more`) : ''] })] })] }), _jsxs("div", { className: "vio-num", children: [_jsx("span", { className: "display", children: v.count }), d > 0 ? _jsxs("span", { className: "delta is-bad", children: [_jsx(ArrowUpRight, { "aria-hidden": "true" }), "+", d] })
                                            : d < 0 ? _jsxs("span", { className: "delta is-good", children: [_jsx(ArrowDownRight, { "aria-hidden": "true" }), "\u2212", -d] })
                                                : _jsx("span", { className: "delta is-flat", children: t('как в прошлом периоде') })] })] }, v.rule_id));
                    })] })] }));
}
/* ─── Магазины: конверсия и балл за 12 недель ────────────────────────────── */
function Stores({ trends }) {
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const rows = (trends?.stores || []).map((s) => {
        const conv = s.purchases.map((p, i) => pct(p, s.scorable[i]));
        const { delta } = lastAndDelta(conv);
        const scored = s.avg_score.map((v, i) => (v != null ? [v, s.scorable[i]] : null)).filter(Boolean);
        const w = sum(scored.map((x) => x[1]));
        return {
            ...s,
            conv, delta,
            total: sum(s.total),
            conversion: pct(sum(s.purchases), sum(s.scorable)),
            score: w ? sum(scored.map(([v, n]) => v * n)) / w : null,
        };
    }).sort((a, b) => (b.conversion ?? -1) - (a.conversion ?? -1));
    return (_jsxs("section", { className: "panel", "aria-labelledby": "st-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "st-title", className: "panel-title", children: t('Магазины') }), _jsx("div", { className: "panel-sub", children: t('Конверсия и балл за 12 недель, изменение к предыдущей неделе с разговорами') })] }), _jsxs(Link, { className: "link", to: "/team", children: [t('Команда'), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] })] }), _jsx("div", { className: "panel-body", style: { paddingTop: 6 }, children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table st-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('Магазин') }), _jsx("th", { scope: "col", children: t('Конверсия') }), _jsx("th", { scope: "col", children: t('Балл') })] }) }), _jsxs("tbody", { children: [rows.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 3, className: "muted", children: t('Нет данных за 12 недель') }) }), rows.map((s) => (_jsxs("tr", { children: [_jsxs("td", { className: "st-name", children: [_jsx("b", { translate: "no", children: s.store_name || '—' }), _jsxs("span", { children: [s.total, " ", plural(s.total, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])] })] }), _jsx("td", { children: _jsxs("div", { className: "st-conv", children: [_jsxs("div", { children: [_jsxs("span", { className: "display", children: [s.conversion != null ? dec(s.conversion) : '—', _jsx("small", { children: "\u00A0%" })] }), _jsx(Delta, { value: s.delta, unit: PP, digits: 1 })] }), _jsx(Spark, { values: s.conv, width: 60, height: 26 })] }) }), _jsx("td", { children: _jsx(Meter, { score: s.score }) })] }, s.store_id)))] })] }) }) })] }));
}
/* ─── Где теряем баллы ───────────────────────────────────────────────────── */
function Losses({ period }) {
    const { data } = useQuery({ queryKey: ['step-losses', period], queryFn: () => dashboardApi.getStepLosses({ period }) });
    const steps = [...(data?.steps || [])].sort((a, b) => b.weak_share - a.weak_share);
    const maxShare = Math.max(1, ...steps.map((s) => s.weak_share));
    return (_jsxs("section", { className: "panel", "aria-labelledby": "loss-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "loss-title", className: "panel-title", children: t('Где теряем баллы') }), _jsx("div", { className: "panel-sub", children: data?.script ? _jsxs(_Fragment, { children: [_jsx("span", { translate: "no", children: data.script.name }), " \u00B7 ", t('этапы, пропущенные или слабые (балл ниже 50)')] }) : t('Этапы скрипта, пропущенные или слабые (балл ниже 50)') })] }), _jsxs(Link, { className: "link", to: "/scripts", children: [t('Скрипт'), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] })] }), _jsxs("div", { className: "panel-body", children: [steps.length === 0 && _jsx("p", { className: "muted", children: t('За период нет разговоров, оценённых по скрипту.') }), steps.map((s) => (_jsxs("div", { className: "loss", children: [_jsxs("div", { className: "loss-name", children: [_jsx("span", { className: "ellipsis", translate: "no", children: s.name }), s.weight != null && _jsx("span", { className: "tag tag-neutral", children: L(`вес ${dec(s.weight, 2)}`, `weight ${s.weight.toFixed(2)}`) }), !s.required && _jsx("span", { className: "tag tag-neutral", children: t('необязательный') })] }), _jsxs("div", { className: "loss-val", children: [Math.round(s.weak_share), _jsx("small", { children: "\u00A0%" })] }), _jsx("div", { className: "loss-bar", role: "img", "aria-label": L(`Пропущен или слабый в ${Math.round(s.weak_share)} % разговоров`, `Missed or weak in ${Math.round(s.weak_share)}% of conversations`), children: _jsx("span", { style: { width: `${(s.weak_share / maxShare) * 100}%` } }) }), s.hint && _jsx("div", { className: "loss-hint", translate: "no", children: s.hint })] }, s.name)))] })] }));
}
/* ─── Возражения: доля разговоров, отработка, конверсия к средней ─────────── */
function Objections({ period }) {
    const objectionLabel = useObjectionTypeLabel();
    const { data: impact } = useQuery({ queryKey: ['objections-impact', period], queryFn: () => analyticsApi.getObjectionsImpact({ period }) });
    const { data: resolution } = useQuery({ queryKey: ['objections-resolution', period], queryFn: () => analyticsApi.getObjectionsResolution({ period }) });
    const { data: overview } = useQuery({ queryKey: ['dashboard-overview', period], queryFn: () => dashboardApi.getOverview({ period }) });
    const base = impact?.baseline_conversion ?? 0;
    const total = overview?.total_conversations || 0;
    const items = (impact?.items || []).map((o) => ({
        ...o,
        resolved: (resolution || []).find((r) => r.type === o.type)?.resolution_rate ?? null,
    }));
    const maxShare = Math.max(1, ...items.map((o) => o.conversations));
    return (_jsxs("section", { className: "panel", "aria-labelledby": "obj-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "obj-title", className: "panel-title", children: t('Возражения покупателей') }), _jsx("div", { className: "panel-sub", children: L(`Как часто звучат и что делают с конверсией (в среднем ${dec(base)} %)`, `How often they come up and what they do to conversion (average ${base.toFixed(1)}%)`) })] }) }), _jsx("div", { className: "panel-body", style: { paddingTop: 6 }, children: items.length === 0 ? _jsx("p", { className: "muted", children: t('Возражений за период нет.') }) : (_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table obj-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('Возражение') }), _jsx("th", { scope: "col", children: t('Доля разговоров') }), _jsx("th", { scope: "col", className: "t-right col-hide-s", children: t('Отработано') }), _jsx("th", { scope: "col", className: "t-right", children: t('Конверсия') })] }) }), _jsx("tbody", { children: items.map((o) => {
                                    const share = total ? (o.conversations / total) * 100 : 0;
                                    const diff = o.conversion - base;
                                    const len = Math.min(46, (Math.abs(diff) / 20) * 46);
                                    return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("div", { style: { fontWeight: 500 }, children: t(objectionLabel(o.type)) }), _jsxs("div", { className: "muted", style: { fontSize: 12 }, children: [o.conversations, " ", plural(o.conversations, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])] })] }), _jsx("td", { children: _jsxs("div", { className: "share", children: [_jsx("span", { className: "share-bar", children: _jsx("span", { style: { width: `${(o.conversations / maxShare) * 100}%` } }) }), _jsxs("span", { className: "num", children: [Math.round(share), "\u00A0%"] })] }) }), _jsx("td", { className: "t-right t-num col-hide-s", children: o.resolved != null ? `${Math.round(o.resolved)} %` : '—' }), _jsx("td", { children: _jsxs("div", { className: "dv", role: "img", "aria-label": L(`Конверсия ${dec(o.conversion)} %, ${diff >= 0 ? 'выше' : 'ниже'} средней на ${dec(Math.abs(diff))} п. п.`, `Conversion ${o.conversion.toFixed(1)}%, ${Math.abs(diff).toFixed(1)} pp ${diff >= 0 ? 'above' : 'below'} average`), children: [_jsx("span", { className: "dv-track", "aria-hidden": "true", children: _jsx("span", { className: `dv-bar ${diff >= 0 ? 'is-up' : 'is-down'}`, style: { width: len } }) }), _jsxs("span", { className: "dv-val", children: [dec(o.conversion), "\u00A0%"] })] }) })] }, o.type));
                                }) })] }) })) })] }));
}
/* ─── Кто растёт, кто проседает: балл по неделям ─────────────────────────── */
function Movers({ period, trends }) {
    const { data: sellers } = useQuery({ queryKey: ['sellers-for-dashboard', period], queryFn: () => dashboardApi.getSellers({ period }) });
    const weak = new Map((sellers || []).map((s) => [s.id, s.weakest_step]));
    const withDelta = (trends?.sellers || [])
        .map((s) => ({ ...s, ...lastAndDelta(s.avg_score) }))
        .filter((s) => s.delta != null && Math.round(s.delta) !== 0);
    const up = [...withDelta].filter((s) => s.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const down = [...withDelta].filter((s) => s.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    const col = (title, icon, list, isDown) => (_jsxs("div", { className: "movers-col", children: [_jsxs("div", { className: "movers-h", children: [icon, t(title)] }), list.length === 0 && _jsx("div", { className: "muted", style: { fontSize: 12.5, padding: '8px 0' }, children: t('Нет изменений за последние недели') }), list.map((s) => {
                const w = weak.get(s.seller_id);
                return (_jsxs(Link, { className: "mv", to: `/team?seller=${s.seller_id}`, children: [_jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(s.seller_name) || '?' }), _jsxs("span", { style: { minWidth: 0 }, children: [_jsx("span", { className: "person-name", translate: "no", children: s.seller_name || '—' }), _jsx("span", { className: "person-sub", children: isDown && w ? _jsxs(_Fragment, { children: [t('Слабое место:'), " ", _jsx("span", { translate: "no", children: String(w).toLowerCase() })] }) : _jsx("span", { translate: "no", children: s.store_name }) })] })] }), _jsx(Spark, { values: s.avg_score, width: 64, height: 26 }), _jsx(Delta, { value: s.delta })] }, s.seller_id));
            })] }));
    return (_jsxs("section", { className: "panel", "aria-labelledby": "mv-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "mv-title", className: "panel-title", children: t('Кто растёт, кто проседает') }), _jsx("div", { className: "panel-sub", children: t('Балл по скрипту за 12 недель, изменение к предыдущей неделе с разговорами') })] }), _jsxs(Link, { className: "link", to: "/team", children: [t('Команда'), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] })] }), _jsxs("div", { className: "movers is-stacked", children: [col('Растут', _jsx(TrendingUp, { size: 14, "aria-hidden": "true" }), up, false), col('Проседают', _jsx(TrendingDown, { size: 14, "aria-hidden": "true" }), down, true)] })] }));
}

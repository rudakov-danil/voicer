import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Table2 } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { t, L, locale, plural } from '@/i18n';
/* Пульс недели (ui-concept/dashboard.html → .pulse): разговоры по получасам за 7 дней,
   красным — требующие внимания. Получасы по времени магазинов (бэкенд, LOCAL_TZ). */
const DAY_FROM = 20; // 10:00 — обычное открытие магазина
const DAY_TO = 44; // 22:00
const hhmm = (bin) => `${Math.floor(bin / 2)}:${bin % 2 ? '30' : '00'}`;
const hours = (sec) => Math.round(sec / 3600);
export function Pulse({ onOpenAttention }) {
    const ref = useRef(null);
    const [w, setW] = useState(0);
    const [showTable, setShowTable] = useState(false);
    const { data } = useQuery({ queryKey: ['pulse'], queryFn: () => dashboardApi.getPulse({ days: 7 }) });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        setW(Math.round(el.getBoundingClientRect().width));
        const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const days = data?.days || [];
    const allBins = days.flatMap((d) => d.bins.map((b) => b[0]));
    const binFrom = Math.min(DAY_FROM, ...allBins);
    const binTo = Math.max(DAY_TO, ...allBins.map((b) => b + 1));
    const BINS = binTo - binFrom;
    const peak = Math.max(1, ...days.flatMap((d) => d.bins.map((b) => b[1])));
    const max = Math.max(4, Math.ceil(peak / 2) * 2);
    const H = 180;
    const axisH = 26;
    const top = 10;
    const plotH = H - axisH - top;
    const gap = w < 700 ? 6 : 14;
    const slot = days.length ? Math.max(0, (w - gap * (days.length - 1)) / (days.length * BINS)) : 0;
    const bw = Math.max(1.5, Math.min(5, slot - 2));
    const y = (v) => top + plotH - (v / max) * plotH;
    const today = data?.date_to;
    const nowBin = (() => { const d = new Date(); return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0); })();
    const dateLabel = (iso, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts);
    const range = data ? `${dateLabel(data.date_from, { day: 'numeric', month: 'short' })} – ${dateLabel(data.date_to, { day: 'numeric', month: 'long' })}` : '';
    const tot = data?.totals;
    const convWord = plural(tot?.conversations ?? 0, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations']);
    return (_jsxs("section", { className: "console pulse", "aria-labelledby": "pulse-title", children: [_jsxs("div", { className: "pulse-head", children: [_jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: L(`Неделя · ${range}`, `Week · ${range}`) }), _jsx("h2", { id: "pulse-title", className: "pulse-title", children: tot ? _jsxs(_Fragment, { children: [tot.conversations.toLocaleString(locale), " ", L(`${convWord} с покупателями`, `${convWord} with customers`), ' ', _jsx("em", { children: L(`· ${hours(tot.talk_seconds)} ч разговоров`, `· ${hours(tot.talk_seconds)} h of talking`) })] }) : t('Загрузка...') })] }), tot && (_jsxs("button", { type: "button", className: "pulse-attn", onClick: onOpenAttention, children: [_jsx("span", { className: "pulse-attn-num", children: tot.attention }), _jsxs("span", { className: "pulse-attn-label", children: [plural(tot.attention, ['требует внимания', 'требуют внимания', 'требуют внимания'], ['needs attention', 'need attention']), _jsxs("span", { children: [`${tot.violations} ${plural(tot.violations, ['с нарушением', 'с нарушениями', 'с нарушениями'], ['with a violation', 'with violations'])}, `, L(`${tot.low_score} с низким баллом`, `${tot.low_score} with a low score`)] })] }), _jsx(ArrowRight, { size: 18, "aria-hidden": "true" })] }))] }), _jsx("div", { ref: ref, className: "pulse-chart", children: w > 0 && data && (_jsxs("svg", { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": L(`Разговоры по получасам за неделю: всего ${tot.conversations}, требуют внимания ${tot.attention}.`, `Conversations per half hour this week: ${tot.conversations} in total, ${tot.attention} need attention.`), children: [[max / 2, max].map((v) => (_jsxs("g", { children: [_jsx("line", { x1: 0, x2: w, y1: y(v), y2: y(v), className: "p-grid" }), _jsx("text", { x: w, y: y(v) - 4, textAnchor: "end", className: "p-label", children: v })] }, v))), _jsx("line", { x1: 0, x2: w, y1: y(0) + 0.5, y2: y(0) + 0.5, className: "p-grid" }), days.map((day, di) => {
                            const gx = di * (BINS * slot + gap);
                            const isToday = day.date === today;
                            const byBin = new Map(day.bins.map((b) => [b[0], b]));
                            const dayName = dateLabel(day.date, { weekday: 'short' });
                            const dayNum = new Date(`${day.date}T00:00:00`).getDate();
                            return (_jsxs("g", { children: [isToday && day.total === 0 ? (_jsxs(_Fragment, { children: [Array.from({ length: Math.max(0, Math.min(BINS, nowBin - binFrom + 1)) }, (_, i) => (_jsx("rect", { x: gx + i * slot + (slot - bw) / 2, y: y(0) - 3, width: bw, height: 3, rx: 1, className: "p-idle" }, i))), _jsx("text", { x: gx + BINS * slot, y: y(0) - 24, textAnchor: "end", className: "p-label", children: t('разговоров пока нет') })] })) : (Array.from({ length: BINS }, (_, i) => {
                                        const b = byBin.get(binFrom + i);
                                        if (!b)
                                            return null;
                                        const [, n, f] = b;
                                        const normal = n - f;
                                        const x = gx + i * slot + (slot - bw) / 2;
                                        const title = `${dayName} ${dayNum}, ${hhmm(binFrom + i)}–${hhmm(binFrom + i + 1)} · ${n} ${plural(n, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations'])}${f ? L(` · ${f} требуют внимания`, ` · ${f} need attention`) : ''}`;
                                        return (_jsxs("g", { className: `p-col ${f ? 'is-link' : ''}`, onClick: f ? onOpenAttention : undefined, children: [_jsx("title", { children: title }), normal > 0 && _jsx("rect", { x: x, y: y(normal), width: bw, height: Math.max(1, y(0) - y(normal)), rx: Math.min(2, bw / 2), className: "pb" }), f > 0 && _jsx("rect", { x: x, y: y(n) - 2, width: bw, height: y(normal) - y(n), rx: Math.min(2, bw / 2), className: "pf" }), _jsx("rect", { x: gx + i * slot, y: top, width: slot, height: plotH, className: "p-hit" })] }, i));
                                    })), _jsxs("text", { x: gx, y: H - 6, className: "p-label", children: [_jsxs("tspan", { className: "p-label-strong", children: [dayName, " "] }), w >= 640 && _jsx("tspan", { children: isToday && day.total === 0 ? `${dayNum} · ${t('сегодня')}` : `${dayNum}  ·  ${day.total}` })] })] }, day.date));
                        })] })) }), _jsxs("div", { className: "pulse-foot", children: [_jsxs("div", { className: "legend", "aria-hidden": "true", children: [_jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: 'var(--console-bar)' } }), L(`Разговоры за 30 минут, ${hhmm(binFrom)}–${hhmm(binTo)}`, `Conversations per 30 minutes, ${hhmm(binFrom)}–${hhmm(binTo)}`)] }), _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: 'var(--console-signal)' } }), t('Требуют внимания')] })] }), _jsxs("button", { type: "button", className: "btn btn-sm", "aria-expanded": showTable, onClick: () => setShowTable((v) => !v), children: [_jsx(Table2, { size: 14, "aria-hidden": "true" }), showTable ? t('Скрыть таблицу') : t('Показать таблицей')] })] }), showTable && data && (_jsxs("table", { className: "pulse-table", children: [_jsx("caption", { className: "sr-only", children: t('Разговоры по дням недели') }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('День') }), _jsx("th", { scope: "col", className: "num", children: t('Разговоров') }), _jsx("th", { scope: "col", className: "num", children: t('Требуют внимания') }), _jsx("th", { scope: "col", className: "num", children: t('Пиковый получас') })] }) }), _jsx("tbody", { children: days.map((d) => {
                            const peakBin = d.bins.reduce((a, b) => (b[1] > (a?.[1] ?? 0) ? b : a), null);
                            return (_jsxs("tr", { children: [_jsx("td", { children: dateLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' }) }), _jsx("td", { className: "num", children: d.total }), _jsx("td", { className: "num", children: d.flagged }), _jsx("td", { className: "num", children: peakBin ? `${hhmm(peakBin[0])}–${hhmm(peakBin[0] + 1)}` : '—' })] }, d.date));
                        }) })] }))] }));
}

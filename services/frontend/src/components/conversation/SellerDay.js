import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { outcomeColor, outcomeLabel } from '@/lib/outcomes';
import { t, L, locale, plural } from '@/i18n';
/* «День продавца» (ui-concept/conversation.html): где этот разговор в смене.
   Полоса — часы смены, блоки — разговоры продавца за день, цвет — исход.
   Смена и выгрузка известны, только если запись пришла с бейджа кусками. */
const hhmm = (d) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
const hoursOf = (d) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
function duration(sec) {
    const m = Math.round(sec / 60);
    const h = Math.floor(m / 60);
    return h ? L(`${h} ч ${m % 60} мин`, `${h} h ${m % 60} min`) : L(`${m} мин`, `${m} min`);
}
export function SellerDayPanel({ conversationId }) {
    const navigate = useNavigate();
    const ref = useRef(null);
    const [w, setW] = useState(0);
    const { data } = useQuery({
        queryKey: ['seller-day', conversationId],
        queryFn: () => dashboardApi.getSellerDay(conversationId),
        staleTime: 60000,
    });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        setW(Math.round(el.getBoundingClientRect().width));
        const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [data]);
    if (!data || data.items.length === 0)
        return null;
    const items = data.items.map((it) => {
        const start = new Date(it.started_at);
        return { ...it, start, from: hoursOf(start), len: Math.max(1, it.duration_seconds || 60) / 3600 };
    });
    const shiftStart = data.shift ? new Date(data.shift.start) : null;
    const shiftEnd = data.shift ? new Date(data.shift.end) : null;
    // Шкала: обычный день магазина 10–22, шире — если смена или разговоры за его пределами
    const first = Math.min(...items.map((i) => i.from), shiftStart ? hoursOf(shiftStart) : 24);
    const last = Math.max(...items.map((i) => i.from + i.len), shiftEnd ? hoursOf(shiftEnd) : 0);
    const X0 = Math.min(10, Math.floor(first));
    const X1 = Math.max(22, Math.ceil(last));
    const h = 64;
    const x = (hr) => ((hr - X0) / (X1 - X0)) * w;
    const step = w < 460 ? 4 : 2;
    const ticks = [];
    for (let hr = X0; hr <= X1; hr += step)
        ticks.push(hr);
    if (ticks[ticks.length - 1] !== X1)
        ticks.push(X1);
    const n = items.length;
    const won = items.filter((i) => i.outcome === 'purchase').length;
    const talk = items.reduce((a, i) => a + (i.duration_seconds || 0), 0);
    const shiftSec = shiftStart && shiftEnd ? (shiftEnd.getTime() - shiftStart.getTime()) / 1000 : 0;
    const day = new Date(`${data.date}T00:00:00`);
    const convWord = plural(n, ['разговор', 'разговора', 'разговоров'], ['conversation', 'conversations']);
    const wonWord = plural(won, ['покупка', 'покупки', 'покупок'], ['purchase', 'purchases']);
    const label = L(`За день ${n} ${convWord}, ${won} ${wonWord}`, `${n} ${convWord} this day, ${won} ${wonWord}`);
    return (_jsxs("section", { className: "panel", "aria-labelledby": "cv-day-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "cv-day-title", className: "panel-title", children: t('День продавца') }), _jsx("div", { className: "panel-sub", children: data.shift
                                ? L(`Разговоры, которые Войсер вырезал из записи смены ${day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`, `Conversations Voicer cut from the ${day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })} shift recording`)
                                : L(`Все разговоры продавца за ${day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`, `All of the seller’s conversations on ${day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`) })] }) }), _jsxs("div", { className: "panel-body", children: [_jsx("div", { ref: ref, className: "cv-day", children: w > 0 && (_jsxs("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": label, children: [shiftStart && shiftEnd && (_jsx("rect", { className: "cv-day-shift", x: x(hoursOf(shiftStart)), y: 14, width: Math.max(2, x(hoursOf(shiftEnd)) - x(hoursOf(shiftStart))), height: 22, rx: 5 })), _jsx("line", { className: "cv-day-axis", x1: 0, x2: w, y1: 42.5, y2: 42.5 }), ticks.map((hr) => (_jsx("text", { className: "cv-day-lbl", x: x(hr), y: 58, textAnchor: hr === X0 ? 'start' : hr === X1 ? 'end' : 'middle', children: `${hr}:00` }, hr))), items.map((it) => {
                                    const bx = x(it.from);
                                    const bw = Math.max(4, x(it.from + it.len) - bx);
                                    const title = `${hhmm(it.start)} · ${duration(it.duration_seconds || 0)} · ${t(outcomeLabel(it.outcome || 'unknown'))}`;
                                    return (_jsxs("g", { children: [_jsx("rect", { className: `cv-day-blk ${it.is_current ? '' : 'is-link'}`, x: bx, y: 16, width: bw, height: 18, rx: 1.5, fill: outcomeColor(it.outcome || 'unknown'), tabIndex: it.is_current ? -1 : 0, role: it.is_current ? undefined : 'link', "aria-label": title, onClick: () => !it.is_current && navigate(`/conversations/${it.id}`), onKeyDown: (e) => { if (!it.is_current && (e.key === 'Enter' || e.key === ' ')) {
                                                    e.preventDefault();
                                                    navigate(`/conversations/${it.id}`);
                                                } }, children: _jsx("title", { children: title }) }), it.is_current && (_jsxs(_Fragment, { children: [_jsx("rect", { className: "cv-day-now", x: bx - 3, y: 12, width: bw + 6, height: 26, rx: 4 }), _jsx("text", { className: "cv-day-now-lbl", x: Math.min(Math.max(bx + bw / 2, 40), w - 40), y: 8, textAnchor: "middle", children: t('этот разговор') })] }))] }, it.id));
                                })] })) }), _jsxs("div", { className: "cv-day-stats", children: [_jsxs("span", { children: [_jsx("b", { children: n }), " ", convWord] }), _jsxs("span", { children: [_jsx("b", { children: won }), " ", wonWord] }), _jsx("span", { children: shiftSec > 0
                                    ? _jsxs(_Fragment, { children: [L('в разговорах ', ''), _jsx("b", { children: duration(talk) }), L(` из ${duration(shiftSec)} смены`, ` talking out of a ${duration(shiftSec)} shift`)] })
                                    : _jsxs(_Fragment, { children: [L('в разговорах ', ''), _jsx("b", { children: duration(talk) }), L('', ' talking')] }) })] }), _jsxs("dl", { className: "cv-rec-list", children: [data.badge ? (_jsxs(_Fragment, { children: [_jsx("dt", { children: t('Бейдж') }), _jsxs("dd", { children: [_jsx("span", { className: "mono", translate: "no", children: data.badge.serial_number }), data.badge.model && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("span", { translate: "no", children: data.badge.model })] })] })] })) : (_jsxs(_Fragment, { children: [_jsx("dt", { children: t('Источник') }), _jsx("dd", { children: data.source === 'transcript' ? t('Загружен текстом — без аудио') : t('Запись загружена вручную') })] })), shiftStart && shiftEnd && (_jsxs(_Fragment, { children: [_jsx("dt", { children: t('Смена') }), _jsx("dd", { children: L(`запись с ${hhmm(shiftStart)} до ${hhmm(shiftEnd)}`, `recorded ${hhmm(shiftStart)}–${hhmm(shiftEnd)}`) })] })), data.uploaded_at && (_jsxs(_Fragment, { children: [_jsx("dt", { children: t('Выгрузка') }), _jsx("dd", { children: new Date(data.uploaded_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })] }))] })] })] }));
}

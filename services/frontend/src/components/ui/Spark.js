import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { L, t } from '@/i18n';
/* Спарклайн и дельта (ui-concept/assets/voicer.js → V.spark, V.delta). */
/** Линия по значениям; null — нет данных (разрыв линии). Последний отрезок — акцентом. */
export function Spark({ values, width = 96, height = 34, label }) {
    const pad = 4;
    const vals = values.filter((v) => v != null);
    if (vals.length < 2)
        return _jsx("span", { className: "spark-empty", style: { width, height }, "aria-hidden": "true" });
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const X = (i) => pad + (i / (values.length - 1)) * (width - pad * 2);
    const Y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
    // Недели без данных пропускаем: линия идёт от точки к точке, а не обрывается
    const pts = values.map((v, i) => (v != null ? [X(i), Y(v)] : null)).filter(Boolean);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    // Последний отрезок и точка — акцентом, если у последней недели есть данные
    const hasLast = values[values.length - 1] != null;
    const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
    return (_jsxs("svg", { className: "spark", viewBox: `0 0 ${width} ${height}`, width: width, height: height, role: label ? 'img' : undefined, "aria-label": label, "aria-hidden": label ? undefined : true, children: [_jsx("path", { d: d, className: "spark-line" }), hasLast && _jsx("path", { d: `M${a[0]},${a[1]}L${b[0]},${b[1]}`, className: "spark-now" }), hasLast && _jsx("circle", { cx: b[0], cy: b[1], r: 3, className: "spark-dot" })] }));
}
/** Изменение с подписью: «+1,4 п. п.», зелёное — если в лучшую сторону. */
export function Delta({ value, unit = '', digits = 0, goodWhenUp = true }) {
    if (value == null)
        return null;
    const rounded = Number(value.toFixed(digits));
    if (!rounded)
        return _jsx("span", { className: "delta is-flat", children: t('без изменений') });
    const up = rounded > 0;
    const good = up === goodWhenUp;
    const num = Math.abs(rounded).toFixed(digits);
    const text = L(`${up ? '+' : '−'}${num.replace('.', ',')}${unit}`, `${up ? '+' : '−'}${num}${unit === ' п. п.' ? ' pp' : unit}`);
    return (_jsxs("span", { className: `delta ${good ? 'is-good' : 'is-bad'}`, children: [up ? _jsx(ArrowUpRight, { "aria-hidden": "true" }) : _jsx(ArrowDownRight, { "aria-hidden": "true" }), text] }));
}
/** Доля в процентах или null, если знаменатель пустой. */
export const pct = (num, den) => (den ? (num / den) * 100 : null);
/** Последнее значение ряда и изменение к предыдущему непустому. */
export function lastAndDelta(series) {
    const idx = series.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
    if (!idx.length)
        return { last: null, delta: null };
    const last = series[idx[idx.length - 1]];
    const prev = idx.length > 1 ? series[idx[idx.length - 2]] : null;
    return { last, delta: prev != null ? last - prev : null };
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { L, t } from '@/i18n';
/** Балл по скрипту: 10 сегментов, как индикатор уровня. Ниже 60 — красный, 60–79 — приглушённый. */
export function Meter({ score }) {
    if (score == null) {
        return (_jsx("span", { className: "meter is-na", title: t('Нет оценки'), children: _jsx("span", { className: "meter-val", children: "\u2014" }) }));
    }
    const v = Math.round(score);
    const on = Math.round(v / 10);
    const cls = v < 60 ? 'is-low' : v < 80 ? 'is-mid' : '';
    return (_jsxs("span", { className: `meter ${cls}`, role: "img", "aria-label": L(`Балл ${v} из 100`, `Score ${v} of 100`), children: [_jsx("span", { className: "meter-track", "aria-hidden": "true", children: Array.from({ length: 10 }, (_, i) => _jsx("i", { className: i < on ? 'on' : undefined }, i)) }), _jsx("span", { className: "meter-val", children: v })] }));
}
/** Допродажа: точки «предложено из положенного по правилу». */
export function UpsellDots({ value }) {
    if (!value) {
        return _jsx("span", { className: "muted", title: t('Правило допродажи не сработало'), children: "\u2014" });
    }
    const [done, need] = value;
    const cls = done === need ? 'is-full' : done === 0 ? 'is-none' : '';
    return (_jsxs("span", { className: `upsell ${cls}`, role: "img", "aria-label": L(`Допродажа: ${done} из ${need}`, `Add-on sale: ${done} of ${need}`), children: [_jsx("span", { className: "upsell-dots", "aria-hidden": "true", children: Array.from({ length: Math.min(need, 8) }, (_, i) => _jsx("i", { className: i < done ? 'on' : undefined }, i)) }), L(`${done} из ${need}`, `${done} of ${need}`)] }));
}

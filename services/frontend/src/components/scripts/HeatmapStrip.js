import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { HelpTooltip } from './HelpTooltip';
/** Тёмная синяя — высокий pass_rate, светлая — низкий, красная — критический. */
function cellColor(pass) {
    if (pass >= 80)
        return 'var(--success)';
    if (pass >= 60)
        return '#34D399';
    if (pass >= 40)
        return '#FBBF24';
    if (pass >= 20)
        return '#F97316';
    return 'var(--danger)';
}
function cellOpacity(pass) {
    return Math.max(0.25, Math.min(1, 0.25 + (pass / 100) * 0.75));
}
export function HeatmapStrip({ rows }) {
    if (!rows.length)
        return null;
    return (_jsxs("div", { className: "heatmap-strip", children: [_jsx("div", { className: "heatmap-header", children: _jsxs("div", { className: "heatmap-title", children: ["\u0422\u0435\u043F\u043B\u043E\u0432\u0430\u044F \u043A\u0430\u0440\u0442\u0430 \u044D\u0442\u0430\u043F\u043E\u0432", _jsx(HelpTooltip, { content: _jsxs("div", { style: { maxWidth: 280 }, children: ["\u0426\u0432\u0435\u0442 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 ", _jsx("strong", { children: "% \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u044D\u0442\u0430\u043F\u0430" }), ". \u0417\u0435\u043B\u0451\u043D\u044B\u0439 \u2014 \u044D\u0442\u0430\u043F \u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F, \u043A\u0440\u0430\u0441\u043D\u044B\u0439 \u2014 \u043C\u0430\u0441\u0441\u043E\u0432\u043E \u043F\u0440\u043E\u0432\u0430\u043B\u0438\u0432\u0430\u0435\u0442\u0441\u044F, \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F.", _jsxs("div", { style: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { width: 12, height: 12, background: 'var(--danger)', borderRadius: 2 } }), _jsx("span", { style: { fontSize: 11 }, children: "0\u201320%" }), _jsx("span", { style: { width: 12, height: 12, background: '#F97316', borderRadius: 2, marginLeft: 8 } }), _jsx("span", { style: { fontSize: 11 }, children: "20\u201340%" }), _jsx("span", { style: { width: 12, height: 12, background: '#FBBF24', borderRadius: 2, marginLeft: 8 } }), _jsx("span", { style: { fontSize: 11 }, children: "40\u201360%" }), _jsx("span", { style: { width: 12, height: 12, background: '#34D399', borderRadius: 2, marginLeft: 8 } }), _jsx("span", { style: { fontSize: 11 }, children: "60\u201380%" }), _jsx("span", { style: { width: 12, height: 12, background: 'var(--success)', borderRadius: 2, marginLeft: 8 } }), _jsx("span", { style: { fontSize: 11 }, children: "80\u2013100%" })] })] }) })] }) }), _jsx("div", { className: "heatmap-cells", children: rows.map((r, i) => (_jsxs("div", { className: "heatmap-cell", style: {
                        background: cellColor(r.pass_rate),
                        opacity: cellOpacity(r.pass_rate),
                    }, title: `${r.step_name}: ${r.pass_rate}% выполнения · ${r.avg_score} ср. балл`, children: [_jsxs("div", { className: "heatmap-cell-value", children: [Math.round(r.pass_rate), "%"] }), _jsx("div", { className: "heatmap-cell-name", children: r.step_name })] }, i))) })] }));
}

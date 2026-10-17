import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Meter } from '@/components/ui/Meter';
import { initials } from '@/lib/format';
import { useTerms } from '@/lib/terms';
import { t, L, locale } from '@/i18n';
const band = (v) => (v < 50 ? 1 : v < 60 ? 2 : v < 70 ? 3 : v < 80 ? 4 : v < 90 ? 5 : 6);
export const w2 = (w) => w.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «Как складывается балл разговора»: ширина — вес этапа, заливка — средний балл. */
export function ScoreFormula({ steps, stat }) {
    const weightSum = steps.reduce((a, s) => a + (s.weight ?? 0), 0);
    return (_jsxs("div", { className: "formula", children: [_jsxs("div", { className: "formula-h", children: [_jsx("h3", { children: t('Как складывается балл разговора') }), _jsx("span", { className: `wsum ${Math.abs(weightSum - 1) < 0.011 ? 'is-ok' : 'is-bad'}`, children: L(`Сумма весов ${w2(weightSum)}`, `Weights sum to ${weightSum.toFixed(2)}`) })] }), _jsx("div", { className: "fbar", role: "img", "aria-label": steps.map((s) => `${s.name}: ${L('вес', 'weight')} ${s.weight ?? '—'}, ${L('средний балл', 'average')} ${stat.get(s.name)?.avg_score ?? '—'}`).join('; '), children: steps.map((s) => {
                    const avg = stat.get(s.name)?.avg_score;
                    return (_jsx("div", { className: "fseg", style: { flex: `${Math.max(0.04, s.weight ?? 0)} 1 0` }, title: `${s.name}: ${avg != null ? Math.round(avg) : '—'}`, children: _jsx("div", { className: "fseg-fill", style: { height: `${Math.max(0, Math.min(100, avg ?? 0))}%` } }) }, s.name));
                }) }), _jsx("div", { className: "flabels", children: steps.map((s, i) => {
                    const avg = stat.get(s.name)?.avg_score;
                    return (_jsxs("div", { style: { flex: `${Math.max(0.04, s.weight ?? 0)} 1 0` }, children: [_jsxs("b", { translate: "no", children: [i + 1, " \u00B7 ", s.name] }), _jsxs("span", { children: [s.weight != null ? w2(s.weight) : '—', " \u00D7 ", avg != null ? Math.round(avg) : '—'] })] }, s.name));
                }) }), _jsx("div", { className: "formula-note", children: t('Ширина — вес этапа, заливка — средний балл этапа за период. Балл разговора — сумма «вес × балл» по всем этапам.') })] }));
}
/** Тепловая карта: продавец × этап, внизу — медиана сети. */
export function SellerHeatmap({ data }) {
    const terms = useTerms();
    const steps = data.steps;
    if (data.sellers.length === 0) {
        return _jsx("div", { className: "empty", children: _jsx("p", { children: t('Скрипт ещё не применялся к разговорам за выбранный период.') }) });
    }
    return (_jsxs("div", { className: "formula", children: [_jsxs("div", { className: "formula-h", children: [_jsx("h3", { children: terms.isCafe ? L('Выполнение по бариста', 'Performance by barista') : terms.isPharmacy ? L('Выполнение по фармацевтам', 'Performance by pharmacist') : t('Выполнение по продавцам') }), _jsx("span", { className: "muted", style: { fontSize: 12.5 }, children: t('средний балл этапа за период') })] }), _jsx("div", { className: "heat-wrap", children: _jsxs("table", { className: "heat", children: [_jsx("caption", { className: "sr-only", children: t('Средний балл этапов скрипта по продавцам') }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "row-h", scope: "col", children: t(terms.seller) }), steps.map((s, i) => (_jsxs("th", { scope: "col", title: s.name, children: [i + 1, _jsx("br", {}), _jsx("span", { className: "heat-step", translate: "no", children: s.name }), s.weight != null && _jsxs(_Fragment, { children: [_jsx("br", {}), _jsxs("span", { className: "mono", children: [L('вес', 'wt'), " ", w2(s.weight)] })] })] }, s.name))), _jsx("th", { scope: "col", style: { textAlign: 'right' }, children: t('Итог') })] }) }), _jsxs("tbody", { children: [data.sellers.map((r) => (_jsxs("tr", { children: [_jsx("td", { className: "name", children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(r.seller_name) }), _jsxs("span", { children: [_jsx("span", { className: "person-name", translate: "no", children: r.seller_name || '—' }), _jsx("span", { className: "person-sub", children: L(`${r.conversations} разг.`, `${r.conversations} conv.`) })] })] }) }), steps.map((s) => {
                                            const v = r.steps[s.name];
                                            return v == null
                                                ? _jsx("td", { className: "cell is-empty", children: "\u2014" }, s.name)
                                                : _jsx("td", { className: `cell b${band(v)} ${v < 50 ? 'is-crit' : ''}`, tabIndex: 0, title: `${r.seller_name} · ${s.name}: ${Math.round(v)}`, children: Math.round(v) }, s.name);
                                        }), _jsx("td", { className: "total", children: _jsx(Meter, { score: r.script_score }) })] }, r.seller_id))), _jsxs("tr", { className: "heat-median", children: [_jsx("td", { className: "name", children: _jsx("span", { className: "muted", children: t('Медиана сети') }) }), steps.map((s) => _jsx("td", { className: "cell is-median", children: s.median != null ? Math.round(s.median) : '—' }, s.name)), _jsx("td", {})] })] })] }) }), _jsxs("div", { className: "scale", "aria-hidden": "true", children: [_jsx("span", { children: t('Балл этапа') }), _jsxs("div", { children: [_jsx("div", { className: "scale-bar", children: [1, 2, 3, 4, 5, 6].map((b) => _jsx("span", { className: `b${b}` }, b)) }), _jsxs("div", { className: "scale-lbls", children: [_jsx("span", { children: "<50" }), _jsx("span", { children: "50" }), _jsx("span", { children: "60" }), _jsx("span", { children: "70" }), _jsx("span", { children: "80" }), _jsx("span", { children: "90+" })] })] }), _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { boxShadow: 'inset 0 0 0 2px var(--crit)', background: 'transparent' } }), t('ниже 50 — нужен разбор')] })] })] }));
}
/** Лучший пример этапа в сети: цитата и переход к моменту записи. */
export function StepExample({ example }) {
    return (_jsxs("div", { className: "step-best", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(example.seller_name) }), _jsxs("span", { children: [t('Лучший пример —'), " ", _jsx("span", { translate: "no", children: example.seller_name }), ", ", Math.round(example.score), ":"] }), _jsxs("span", { className: "step-quote", translate: "no", children: ["\u00AB", example.evidence, "\u00BB"] }), _jsxs(Link, { className: "link", to: `/conversations/${example.conversation_id}${example.t != null ? `?t=${Math.max(0, example.t - 1)}` : ''}`, children: [_jsx(Play, { size: 13, "aria-hidden": "true" }), t('Послушать')] })] }));
}

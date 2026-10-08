import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { outcomeLabel } from '@/lib/outcomes';
/** Исход разговора: форма значка + подпись (не только цвет), как в концепте. */
const OUTCOME_GLYPH = {
    purchase: 'is-win',
    deferred: 'is-pending',
    price_refusal: 'is-lost',
    competitor: 'is-gone',
    // Исходы телефонии
    appointment: 'is-win',
    resolved: 'is-win',
    callback: 'is-pending',
    refusal: 'is-lost',
};
export function OutcomeTag({ outcome }) {
    const glyph = OUTCOME_GLYPH[outcome] || 'is-neutral';
    return (_jsxs("span", { className: `outcome ${glyph}`, children: [_jsx("span", { className: "outcome-glyph", "aria-hidden": "true" }), outcomeLabel(outcome)] }));
}

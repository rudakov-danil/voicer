import { jsx as _jsx } from "react/jsx-runtime";
export function OutcomeTag({ outcome }) {
    const outcomesMap = {
        purchase: { label: 'Покупка', class: 'tag-success' },
        deferred: { label: 'Отложил', class: 'tag-warning' },
        price_objection: { label: 'Ценовой отказ', class: 'tag-danger' },
        competitor: { label: 'Ушёл к конкурентам', class: 'tag-purple' },
        unknown: { label: 'Не определён', class: 'tag-neutral' }
    };
    const config = outcomesMap[outcome] || outcomesMap.unknown;
    return _jsx("span", { className: `tag ${config.class}`, children: config.label });
}

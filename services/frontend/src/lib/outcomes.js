// Единый справочник исходов разговора: ритейл + телефония.
// Раньше словари дублировались по страницам, и на аналитике набор отставал —
// телефонийные исходы (appointment, resolved, …) падали в легенду латиницей.
export const OUTCOME_LABELS = {
    // Ритейл
    purchase: 'Покупка',
    deferred: 'Отложено',
    price_refusal: 'Отказ по цене',
    competitor: 'Ушёл к конкурентам',
    // Телефония
    appointment: 'Встреча назначена',
    callback: 'Перезвон',
    refusal: 'Отказ',
    transfer: 'Перевод звонка',
    non_target: 'Нецелевой',
    voicemail: 'Недозвон',
    resolved: 'Вопрос решён',
    // Общее
    unknown: 'Не определён',
};
export const OUTCOME_COLORS = {
    // Палитра концепта: зелёный — покупка, янтарный — отложено,
    // оранжевый — потеря по цене, красный (риск) — ушёл к конкурентам.
    purchase: '#12A150',
    deferred: '#E8A317',
    price_refusal: '#E8743B',
    competitor: '#E5484D',
    // «Встреча назначена» — кобальт (не зелёный), чтобы не было засилья зелёного.
    // «Вопрос решён» — приглушённый тёмно-зелёный, отличимый от «Покупки».
    appointment: '#2E5BFF',
    resolved: '#0B7A3B',
    callback: '#E8A317',
    refusal: '#E5484D',
    transfer: '#7890F6',
    // Три «серых» исхода разведены по светлоте, иначе в легенде неразличимы.
    non_target: '#5F6778',
    voicemail: '#D6DAE1',
    unknown: '#9AA1AE',
};
export function outcomeLabel(outcome) {
    return OUTCOME_LABELS[outcome] || outcome;
}
export function outcomeColor(outcome) {
    return OUTCOME_COLORS[outcome] || OUTCOME_COLORS.unknown;
}

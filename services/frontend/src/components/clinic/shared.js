import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CircleCheck, CircleDot, CircleX, Minus, OctagonAlert, TriangleAlert } from 'lucide-react';
import { periodRange } from '@/api/dashboard';
import { Hint, num, pct } from '@/components/upsells/metrics';
import { L, plural } from '@/i18n';
import '@/styles/clinic.css';
/* Общее для экранов клиник: подписи, статусы правил, протокол приёма, определения метрик.
   Определения одни на всех экранах (см. память «понятные метрики»): у цифры — база и «?». */
export const CATEGORY = {
    service: ['Сервис', 'Service'],
    competence: ['Компетентность', 'Competence'],
    fraud: ['Фрод', 'Fraud'],
};
export const STATUS = {
    met: { label: ['Выполнено', 'Done'], cls: 'is-good' },
    partial: { label: ['Частично', 'Partly'], cls: 'is-warn' },
    missed: { label: ['Не выполнено', 'Missed'], cls: 'is-crit' },
    na: { label: ['Не применимо', 'Not applicable'], cls: 'is-na' },
    violated: { label: ['Нарушение', 'Violation'], cls: 'is-crit' },
};
export const SEVERITY = {
    high: ['Серьёзное', 'High'],
    medium: ['Среднее', 'Medium'],
    low: ['Низкое', 'Low'],
};
export function StatusIcon({ status }) {
    const Icon = status === 'met' ? CircleCheck : status === 'partial' ? CircleDot : status === 'na' ? Minus : CircleX;
    return _jsx(Icon, { className: `cl-status-ico ${STATUS[status].cls}`, "aria-label": L(...STATUS[status].label) });
}
/** Доля 0..1 с тоном: 80 % и выше — хорошо, от 50 % — внимание, ниже — плохо. Число всегда видно. */
export function Score({ value, title }) {
    if (value == null)
        return _jsx("span", { className: "cl-score is-none", title: title, children: "\u2014" });
    const tone = value >= 0.8 ? 'is-good' : value >= 0.5 ? 'is-warn' : 'is-crit';
    return _jsx("span", { className: `cl-score ${tone}`, title: title, children: pct(value) });
}
export function SignalChip({ title, category, severity }) {
    const fraud = category === 'fraud';
    return (_jsxs("span", { className: `cl-signal ${fraud ? 'is-fraud' : 'is-issue'} sev-${severity}`, children: [fraud ? _jsx(OctagonAlert, { "aria-hidden": "true" }) : _jsx(TriangleAlert, { "aria-hidden": "true" }), title] }));
}
export const PROTOCOL_STATUS = {
    draft: ['Черновик ИИ', 'AI draft'],
    confirmed: ['Подтверждён врачом', 'Confirmed by doctor'],
    failed: ['Не составлен', 'Not drafted'],
};
export function ProtocolBadge({ status }) {
    if (!status)
        return _jsx("span", { className: "cl-proto-badge is-none", children: "\u2014" });
    return _jsx("span", { className: `cl-proto-badge is-${status}`, children: L(...(PROTOCOL_STATUS[status] || [status, status])) });
}
/** Протокол как в медкарте: только заполненные разделы, в порядке медкарты */
export function ProtocolSections({ fields, protocol, empty }) {
    const rows = fields.filter(([k]) => protocol?.[k]);
    if (!rows.length)
        return _jsx("p", { className: "cl-muted", children: empty ?? L('Протокол пуст.', 'The note is empty.') });
    return (_jsx("dl", { className: "cl-protocol", children: rows.map(([k, label]) => (_jsxs("div", { className: "cl-protocol-row", children: [_jsx("dt", { children: label }), _jsx("dd", { translate: "no", children: protocol[k] })] }, k))) }));
}
/** Текст протокола для вставки в МИС */
export function protocolText(fields, protocol, header) {
    const body = fields.filter(([k]) => protocol?.[k]).map(([k, label]) => `${label}: ${protocol[k]}`).join('\n\n');
    return header ? `${header}\n\n${body}` : body;
}
export const minutes = (sec) => sec == null ? '—' : L(`${Math.max(1, Math.round(sec / 60))} мин`, `${Math.max(1, Math.round(sec / 60))} min`);
export const visitsN = (n) => L(`${num(n)} ${plural(n, ['приём', 'приёма', 'приёмов'], ['', ''])}`, `${num(n)} visit${n === 1 ? '' : 's'}`);
export const visitsOf = (n) => L(`из ${num(n)} ${plural(n, ['приёма', 'приёмов', 'приёмов'], ['', ''])}`, `of ${num(n)} visits`);
/** «на 59 приёмах из 2 600» — база для сигналов */
export const onVisits = (part, total) => L(`на ${num(part)} ${plural(part, ['приёме', 'приёмах', 'приёмах'], ['', ''])} из ${num(total)}`, `in ${num(part)} of ${num(total)} visits`);
export const signalsN = (n) => L(`${num(n)} ${plural(n, ['сигнал', 'сигнала', 'сигналов'], ['', ''])}`, `${num(n)} signal${n === 1 ? '' : 's'}`);
/** Определения метрик клиник — одни на всех экранах */
export const HINT = {
    visits: L('Записи, в которых ИИ нашёл приём пациента. Длительность — от начала до конца записи.', 'Recordings where the AI found a patient visit. Duration is from the start to the end of the recording.'),
    service: L('Доля выполненных правил группы «Сервис» на приёме: выполнено — 1, частично — ½, не выполнено — 0. «Не применимо» не входит. Среднее по приёмам.', 'Share of “Service” rules done in a visit: done = 1, partly = ½, missed = 0; not applicable is excluded. Averaged over visits.'),
    competence: L('Доля выполненных правил группы «Компетентность»: сбор анамнеза, осмотр, обоснованность назначений, предупреждения. Считается так же, как сервис. Это подсказка ИИ для главврача, а не экспертиза качества медпомощи.', 'Share of “Competence” rules done: history, examination, justified prescriptions, warnings. Counted like service. An AI hint for the head doctor, not a formal quality review.'),
    fraud: L('Сколько раз на приёмах прозвучало то, что запрещают правила группы «Фрод»: увод пациента, оплата мимо кассы, лишние услуги, справки без оснований. У каждого сигнала есть цитата — проверьте её по записи.', 'How many times visits contained what the “Fraud” rules forbid: diverting patients, off-the-books payments, unnecessary services, unjustified certificates. Each signal has a quote — check it against the recording.'),
    issues: L('Сработавшие запреты групп «Сервис» и «Компетентность»: грубость, нарушение врачебной тайны и другие правила «не должно быть».', 'Triggered prohibitions in the “Service” and “Competence” groups: rudeness, breach of confidentiality and other “must not” rules.'),
    protocols: L('Доля приёмов, где врач проверил черновик протокола от ИИ и подтвердил его в приложении.', 'Share of visits where the doctor reviewed the AI draft note and confirmed it in the app.'),
};
export function Tile({ title, hint, value, base, children }) {
    return (_jsxs("div", { className: "m-tile", children: [_jsxs("div", { className: "m-tile-title", children: [title, _jsx(Hint, { text: hint })] }), _jsx("div", { className: "m-tile-value", children: value }), base && _jsx("div", { className: "m-tile-base", children: base }), children && _jsx("div", { className: "m-tile-extra", children: children })] }));
}
/** Период из шапки (7/30/90 дней…) → date_from/date_to */
export function useClinicRange(store) {
    const ctx = useOutletContext();
    const period = ctx?.period ?? 30;
    return useMemo(() => ({ ...periodRange(period - 1), store_id: store || undefined }), [period, store]);
}
/** «17.10» → для подписи недели */
export const weekLabel = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

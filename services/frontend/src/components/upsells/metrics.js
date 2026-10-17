import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import { L, locale, plural } from '@/i18n';
// Стили m-* живут в upsells.css: метрики используются и вне экрана допродаж (обзор)
import '@/styles/upsells.css';
const WORDS = {
    cafe: {
        order: ['заказ', 'заказа', 'заказов'], orderGen: ['заказа', 'заказов', 'заказов'], orderDat: ['заказу', 'заказам', 'заказам'],
        orderLoc: ['заказе', 'заказах', 'заказах'], orders: 'заказы', ordersGen: 'заказов', inEach: 'в каждом заказе', next: 'следующего заказа',
        customer: 'гость', seller: 'бариста',
    },
    pharmacy: {
        order: ['покупка', 'покупки', 'покупок'], orderGen: ['покупки', 'покупок', 'покупок'], orderDat: ['покупке', 'покупкам', 'покупкам'],
        orderLoc: ['покупке', 'покупках', 'покупках'], orders: 'покупки', ordersGen: 'покупок', inEach: 'в каждой покупке', next: 'следующей покупки',
        customer: 'покупатель', seller: 'фармацевт',
    },
    retail: {
        order: ['заказ', 'заказа', 'заказов'], orderGen: ['заказа', 'заказов', 'заказов'], orderDat: ['заказу', 'заказам', 'заказам'],
        orderLoc: ['заказе', 'заказах', 'заказах'], orders: 'заказы', ordersGen: 'заказов', inEach: 'в каждом заказе', next: 'следующего заказа',
        customer: 'покупатель', seller: 'продавец',
    },
};
let kind = 'cafe';
export function setIndustry(industry) {
    kind = industry === 'pharmacy' ? 'pharmacy' : industry === 'coffee' ? 'cafe' : 'retail';
}
export const W = () => WORDS[kind];
/** «22 заказа» / «22 покупки» */
export const ordersN = (n) => L(`${num(n)} ${plural(n, WORDS[kind].order, ['', ''])}`, `${num(n)} ${n === 1 ? 'order' : 'orders'}`);
export const METRIC = {
    orders: {
        title: ['Заказы', 'Orders'],
        hint: ['Разговоры у стойки, где гость что-то заказал. Считаются только разобранные записи — разбор готов через несколько минут после выгрузки.',
            'Counter conversations where the guest ordered something. Only analysed recordings count — the analysis is ready a few minutes after upload.'],
    },
    attempt: {
        title: ['Предлагали', 'Offered'],
        hint: ['Доля заказов, где бариста предложил хотя бы одну конкретную позицию сверх заказа: больший объём, добавку, выпечку, товар дня или карту. «Что-нибудь ещё?» не считается — это не предложение.',
            'Share of orders where the barista offered at least one specific extra: a larger size, an add-on, a pastry, the item of the day or the card. “Anything else?” does not count.'],
    },
    acceptance: {
        title: ['Согласились', 'Accepted'],
        hint: ['Доля предложений, на которые гость согласился.', 'Share of offers the guest accepted.'],
    },
    accepted: {
        title: ['Допродажи', 'Add-ons sold'],
        hint: ['Сколько раз гость согласился на предложение. План смены задаёт, сколько допродаж нужно за смену.',
            'How many times a guest accepted an offer. The shift plan sets how many are needed per shift.'],
    },
    check: {
        title: ['Чек с допродажей', 'Check with an add-on'],
        hint: ['Средний чек заказов, где гость согласился хотя бы на одно предложение. Под ним — средний чек остальных заказов: разница показывает, сколько приносит допродажа.',
            'Average check of orders where the guest accepted at least one offer. Below it is the average check of all other orders: the difference is what add-ons bring.'],
    },
    revenue: {
        title: ['Допродажи принесли', 'Add-ons brought'],
        hint: ['Сумма того, на что гость согласился после предложения, по цене, названной в разговоре. За больший объём считается доплата. Карта лояльности денег не добавляет.',
            'The total of what guests accepted after an offer, at the price named in the conversation. For a larger size, the extra charge. A loyalty card adds nothing.'],
    },
    avgCheck: {
        title: ['Средний чек', 'Average check'],
        hint: ['Средняя сумма заказа за выбранный день. Сравнение чеков с допродажей и без появится, когда в каждой группе наберётся хотя бы 10 заказов, — на меньшем числе разница случайна.',
            'Average order total for the day. The with/without comparison appears once each group has at least 10 orders.'],
    },
    plan: {
        title: ['План', 'Plan'],
        hint: ['Цель руководителя: доля заказов с предложением и число допродаж за смену. Меняется кнопкой «План смены».',
            'The manager’s target: share of orders with an offer and add-ons per shift. Change it with the “Shift plan” button.'],
    },
};
/** Те же определения словами аптеки и обычной розницы */
const HINTS = {
    pharmacy: {
        orders: ['Разговоры у кассы, где покупатель что-то купил. Считаются только разобранные записи — разбор готов через несколько минут после выгрузки.',
            'Counter conversations that ended with a purchase. Only analysed recordings count.'],
        attempt: ['Доля покупок, где фармацевт предложил хотя бы одну конкретную позицию сверх просьбы: упаковку побольше, средство к лечению, товар дня или карту. «Что-нибудь ещё?» не считается — это не предложение.',
            'Share of purchases where the pharmacist offered at least one specific extra: a bigger pack, something for the treatment, the item of the day or the card. “Anything else?” does not count.'],
        acceptance: ['Доля предложений, на которые покупатель согласился.', 'Share of offers the customer accepted.'],
        accepted: ['Сколько раз покупатель согласился на предложение. План смены задаёт, сколько допродаж нужно за смену.',
            'How many times a customer accepted an offer. The shift plan sets how many are needed per shift.'],
        check: ['Средний чек покупок, где покупатель согласился хотя бы на одно предложение. Под ним — средний чек остальных покупок: разница показывает, сколько приносит допродажа.',
            'Average check of purchases with an accepted offer; below it, all other purchases. The difference is what add-ons bring.'],
        plan: ['Цель руководителя: доля покупок с предложением и число допродаж за смену. Меняется кнопкой «План смены».',
            'The manager’s target: share of purchases with an offer and add-ons per shift.'],
        revenue: ['Сумма того, на что покупатель согласился после предложения, по цене, названной в разговоре. За упаковку побольше считается доплата. Карта лояльности денег не добавляет.',
            'The total of what customers accepted after an offer, at the price named in the conversation.'],
        avgCheck: ['Средняя сумма покупки за выбранный день. Сравнение чеков с допродажей и без появится, когда в каждой группе наберётся хотя бы 10 покупок, — на меньшем числе разница случайна.',
            'Average purchase total for the day. The with/without comparison appears once each group has at least 10 purchases.'],
    },
    retail: {
        orders: ['Разговоры, где покупатель что-то купил. Считаются только разобранные записи.', 'Conversations that ended with a purchase. Only analysed recordings count.'],
        attempt: ['Доля заказов, где продавец предложил хотя бы один конкретный товар или услугу сверх покупки. «Что-нибудь ещё?» не считается — это не предложение.',
            'Share of orders where the seller offered at least one specific extra. “Anything else?” does not count.'],
        acceptance: ['Доля предложений, на которые покупатель согласился.', 'Share of offers the customer accepted.'],
        accepted: ['Сколько раз покупатель согласился на предложение. План смены задаёт, сколько допродаж нужно за смену.',
            'How many times a customer accepted an offer.'],
        check: ['Средний чек заказов, где покупатель согласился хотя бы на одно предложение. Под ним — средний чек остальных: разница показывает, сколько приносит допродажа.',
            'Average check of orders with an accepted offer; below it, all other orders.'],
    },
};
const hintOf = (metric) => HINTS[kind]?.[metric] ?? METRIC[metric].hint;
export const pct = (v) => (v == null ? '—' : L(`${Math.round(v * 100)} %`, `${Math.round(v * 100)}%`));
/** Валюта сети (auth.organizations.currency): ставится в AppLayout до отрисовки страниц */
const CURRENCY_SIGN = { RUB: '₽', KZT: '₸', UZS: 'сум', KGS: 'сом', BYN: 'Br', USD: '$', EUR: '€' };
let currencySign = '₽';
export function setCurrency(code) { currencySign = CURRENCY_SIGN[code || 'RUB'] || '₽'; }
export const currency = () => currencySign;
/** Деньги в валюте сети: «3 450 ₸». Имя историческое — раньше были только рубли */
export const rub = (v) => (v == null ? '—' : `${Math.round(v).toLocaleString(locale)} ${currencySign}`);
export const pp = (v) => L(`${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} п. п.`, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} pp`);
export const num = (n) => n.toLocaleString(locale);
export const ordersOf = (n) => L(`из ${num(n)} ${plural(n, WORDS[kind].orderGen, ['', ''])}`, `of ${num(n)} ${n === 1 ? 'order' : 'orders'}`);
export const offersOf = (n) => L(`из ${num(n)} ${plural(n, ['предложения', 'предложений', 'предложений'], ['', ''])}`, `of ${num(n)} ${n === 1 ? 'offer' : 'offers'}`);
/** «в 5 раз», «в 3 раза», «в 1,5 раза» */
export const times = (x) => {
    const r = x >= 3 ? Math.round(x) : Math.round(x * 10) / 10;
    return Number.isInteger(r)
        ? L(`в ${r} ${plural(r, ['раз', 'раза', 'раз'], ['', ''])}`, `${r}×`)
        : L(`в ${String(r).replace('.', ',')} раза`, `${r}×`);
};
/** Подсказка «?»: открывается наведением, кликом и с клавиатуры, закрывается Esc */
export function Hint({ metric, text }) {
    const id = useId();
    const ref = useRef(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const body = text ?? (metric ? L(...hintOf(metric)) : null);
    useEffect(() => {
        if (!open || !ref.current)
            return;
        const r = ref.current.getBoundingClientRect();
        const width = 300;
        setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 12, window.innerWidth - width - 8)) });
        const onKey = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: ref, type: "button", className: "m-hint", "aria-label": L('Что это значит', 'What does it mean'), "aria-describedby": open ? id : undefined, "aria-expanded": open, onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false), onFocus: () => setOpen(true), onBlur: () => setOpen(false), onClick: (e) => { e.stopPropagation(); setOpen((v) => !v); }, children: _jsx(CircleHelp, { "aria-hidden": "true" }) }), open && pos && createPortal(_jsx("div", { id: id, role: "tooltip", className: "m-hint-pop", style: { top: pos.top, left: pos.left }, children: body }), document.body)] }));
}
/** Сравнение с планом: план всегда назван числом, статус — значком и цветом.
    Полная форма — «план 70 % выполнен» / «ниже плана 70 %», краткая (в списках) — «план 70 %». */
export function PlanChip({ value, target, compact }) {
    if (value == null || target == null)
        return null;
    const met = Math.round(value * 100) >= Math.round(target * 100);
    return (_jsxs("span", { className: `m-plan ${met ? 'is-met' : 'is-below'}`, children: [met ? _jsx(CircleCheck, { "aria-hidden": "true" }) : _jsx(TriangleAlert, { "aria-hidden": "true" }), compact
                ? _jsxs(_Fragment, { children: [L(`план ${pct(target)}`, `plan ${pct(target)}`), _jsx("span", { className: "sr-only", children: met ? L(' выполнен', ' met') : L(' не выполнен', ' not met') })] })
                : (met ? L(`план ${pct(target)} выполнен`, `plan ${pct(target)} met`) : L(`ниже плана ${pct(target)}`, `below the ${pct(target)} plan`))] }));
}
/** Плитка метрики: название с «?», значение, база и строка сравнения */
export function MetricTile({ metric, value, base, children }) {
    return (_jsxs("div", { className: "m-tile", children: [_jsxs("div", { className: "m-tile-title", children: [L(...METRIC[metric].title), _jsx(Hint, { metric: metric })] }), _jsx("div", { className: "m-tile-value", children: value }), base && _jsx("div", { className: "m-tile-base", children: base }), children && _jsx("div", { className: "m-tile-extra", children: children })] }));
}
const MIN_CHECKS = 10;
const sales = (n) => L(`${num(n)} ${plural(n, ['допродажа', 'допродажи', 'допродаж'], ['', ''])}`, `${num(n)} add-on${n === 1 ? '' : 's'}`);
export function MoneyTile({ s }) {
    const enough = (s.checks_with_n ?? 0) >= MIN_CHECKS && (s.checks_without_n ?? 0) >= MIN_CHECKS;
    const compare = enough && s.avg_check_with_upsell != null && s.avg_check_without != null
        ? L(`средний чек с допродажей — ${rub(s.avg_check_with_upsell)}, без — ${rub(s.avg_check_without)}`, `average check with an add-on ${rub(s.avg_check_with_upsell)}, without ${rub(s.avg_check_without)}`)
        : null;
    const n = s.upsell_revenue_n ?? 0;
    if (s.upsell_revenue != null && n > 0) {
        return (_jsx(MetricTile, { metric: "revenue", value: rub(s.upsell_revenue), base: n >= s.accepted
                ? L(`за ${sales(n)}`, `from ${sales(n)}`)
                : L(`за ${sales(n)} из ${num(s.accepted)}: у остальных цена не прозвучала`, `from ${num(n)} of ${num(s.accepted)}; no price for the rest`), children: compare && _jsx("span", { className: "m-delta", children: compare }) }));
    }
    if (compare) {
        const diff = Math.round(s.avg_check_with_upsell) - Math.round(s.avg_check_without);
        return (_jsx(MetricTile, { metric: "check", value: rub(s.avg_check_with_upsell), base: L(`без допродажи — ${rub(s.avg_check_without)}`, `without an add-on: ${rub(s.avg_check_without)}`), children: diff > 0 && _jsx("span", { className: "m-delta is-good", children: L(`на ${rub(diff)} больше`, `${rub(diff)} more`) }) }));
    }
    const all = (s.checks_with_n ?? 0) + (s.checks_without_n ?? 0);
    return (_jsx(MetricTile, { metric: "avgCheck", value: rub(s.avg_check ?? null), base: all ? L(`по ${num(all)} ${plural(all, W().orderDat, ['', ''])}`, `across ${num(all)} orders`) : undefined, children: all > 0 && _jsx("span", { className: "m-delta", children: L(`с допродажей сравним, когда наберётся ${MIN_CHECKS} таких ${W().ordersGen}`, `comparison appears after ${MIN_CHECKS} orders with an add-on`) }) }));
}
export const TECHNIQUE = {
    generic: ['«Что-нибудь ещё?»', '“Anything else?”'],
    specific: ['Конкретный товар', 'Specific item'],
    choice: ['Выбор из двух', 'Choice of two'],
    benefit: ['С аргументом', 'With a reason'],
    promo: ['Акция или комбо', 'Promo or combo'],
};
export const techniqueLabel = (code) => (TECHNIQUE[code] ? L(...TECHNIQUE[code]) : code);
const TECHNIQUE_TIP = {
    specific: { cafe: ['называйте конкретную позицию: «круассан к кофе?»', 'name a specific item: “a croissant with your coffee?”'],
        pharmacy: ['называйте конкретный товар: «спрей для горла к таблеткам возьмёте?»', 'name a specific item: “a throat spray with the tablets?”'],
        retail: ['называйте конкретный товар: «защитное стекло к телефону?»', 'name a specific item: “a screen protector for the phone?”'] },
    choice: { cafe: ['предлагайте выбор из двух: «круассан или маффин?»', 'offer a choice of two: “croissant or muffin?”'],
        pharmacy: ['предлагайте выбор: «спрей или пастилки для горла?»', 'offer a choice: “a throat spray or lozenges?”'],
        retail: ['предлагайте выбор из двух: «чехол или стекло?»', 'offer a choice of two: “a case or a screen protector?”'] },
    benefit: { cafe: ['добавляйте причину: «круассаны только из печи — взять к кофе?»', 'add a reason: “croissants are fresh from the oven — want one?”'],
        pharmacy: ['объясняйте пользу: «с антибиотиком пробиотик защитит кишечник»', 'explain the benefit: “a probiotic protects the gut during antibiotics”'],
        retail: ['добавляйте причину: «стекло убережёт экран, если телефон упадёт»', 'add a reason: “a protector saves the screen if the phone falls”'] },
    promo: { cafe: ['напоминайте про акции и комбо: «с круассаном выйдет дешевле»', 'mention promos and combos: “it’s cheaper with a croissant”'],
        pharmacy: ['напоминайте про акции: «вторая упаковка витаминов со скидкой»', 'mention promos: “the second pack of vitamins is discounted”'],
        retail: ['напоминайте про акции и комплекты: «в комплекте выйдет дешевле»', 'mention promos and bundles: “it’s cheaper as a bundle”'] },
};
export const techniqueTip = (code, kind) => {
    const tip = TECHNIQUE_TIP[code];
    return tip ? L(...tip[kind]) : null;
};
/** Приём, на который соглашаются чаще всего (без «Что-нибудь ещё?» и на достаточной выборке) */
export function bestTechnique(rows, minOffers = 20) {
    return rows.filter((x) => x.technique !== 'generic' && x.offers >= minOffers && x.acceptance_rate != null)
        .sort((a, b) => (b.acceptance_rate ?? 0) - (a.acceptance_rate ?? 0))[0];
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, MessageSquareQuote, Minus, X } from 'lucide-react';
import { L } from '@/i18n';
import { rub } from '@/components/upsells/metrics';
import '@/styles/upsells.css';
const TECHNIQUE = {
    generic: ['общий вопрос «Что-нибудь ещё?»', 'generic “Anything else?”'],
    specific: ['конкретный товар', 'specific item'],
    choice: ['выбор из вариантов', 'choice of options'],
    benefit: ['с аргументом', 'with a reason'],
    promo: ['акция или комбо', 'promo or combo'],
};
const RESPONSE = {
    accepted: ['Взяли', 'Accepted'],
    declined: ['Отказались', 'Declined'],
    no_answer: ['Без ответа', 'No answer'],
};
const quoted = (s) => {
    const q = s.replace(/^[«"“\s]+|[»"”\s]+$/g, '');
    return L(`«${q}»`, `“${q}”`);
};
export function OffersReview({ data, onSeek }) {
    if (!data.order_taken)
        return null;
    return (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: L('Разбор допродажи', 'Add-on review') }), _jsxs("div", { className: "panel-sub", children: [data.offers_count
                                    ? L(`Предложений: ${data.offers_count}, взяли ${data.offers_accepted ?? 0}`, `${data.offers_count} offers, ${data.offers_accepted ?? 0} accepted`)
                                    : L('Ничего не предложили', 'Nothing was offered'), data.check_total != null && L(` · чек ${rub(data.check_total)}`, ` · check ${rub(data.check_total)}`)] })] }) }), _jsxs("div", { className: "panel-body cv-offers", children: [data.order_items.length > 0 && (_jsxs("p", { className: "cv-offers-order", children: [L('Заказ: ', 'Order: '), _jsx("span", { translate: "no", children: data.order_items.join(', ') })] })), data.offers.map((o, i) => (_jsxs("div", { className: `cv-offer2 is-${o.response}`, children: [_jsx("span", { className: "cv-offer2-ico", "aria-hidden": "true", children: o.response === 'accepted' ? _jsx(Check, { size: 14, strokeWidth: 2.75 }) : o.response === 'declined' ? _jsx(X, { size: 14, strokeWidth: 2.75 }) : _jsx(Minus, { size: 14, strokeWidth: 2.75 }) }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "cv-offer2-head", children: [_jsx("b", { translate: "no", children: o.item }), _jsx("span", { className: "cv-offer2-state", children: L(...(RESPONSE[o.response] ?? ['', ''])) }), o.is_focus && _jsx("span", { className: "up-chip is-accepted", children: L('товар дня', 'item of the day') })] }), _jsx("div", { className: "cv-offer2-meta", children: TECHNIQUE[o.technique] ? L(...TECHNIQUE[o.technique]) : o.technique }), o.quote && (_jsx("button", { type: "button", className: "cv-offer2-quote", onClick: () => onSeek?.(o.quote), disabled: !onSeek, title: L('Перейти к моменту', 'Jump to the moment'), children: _jsx("span", { translate: "no", children: quoted(o.quote) }) })), o.customer_quote && _jsxs("div", { className: "cv-offer2-reply", children: [L('Ответ: ', 'Reply: '), _jsx("span", { translate: "no", children: quoted(o.customer_quote) })] })] })] }, i))), data.missed && _jsxs("p", { className: "up-missed", children: [_jsx("b", { children: L('Упущено: ', 'Missed: ') }), _jsx("span", { translate: "no", children: data.missed })] }), data.better_phrase && (_jsxs("p", { className: "up-better", children: [_jsx(MessageSquareQuote, { size: 13, "aria-hidden": "true" }), L('Можно было сказать: ', 'Could have said: '), _jsx("span", { translate: "no", children: quoted(data.better_phrase) })] }))] })] }));
}

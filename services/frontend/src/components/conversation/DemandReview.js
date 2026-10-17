import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { ArrowRight, MessageSquareQuote } from 'lucide-react';
import { L } from '@/i18n';
import '@/styles/demand.css';
/** «Не было в наличии» в карточке разговора: что покупатель просил, что ответили и чем закончилось.
 *  Эти просьбы собираются в раздел «Спрос» — оттуда руководитель отправляет позицию в закупку. */
const OUTCOME = {
    substituted: ['купил аналог', 'bought an analog'],
    ordered: ['заказали', 'ordered'],
    lost: ['ушёл без покупки', 'left without it'],
    unknown: ['исход неясен', 'outcome unclear'],
};
const quoted = (s) => L(`«${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}»`, `“${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}”`);
export function DemandReview({ items, onSeek }) {
    if (!items.length)
        return null;
    return (_jsxs("section", { className: "panel cv-demand", "aria-labelledby": "cv-demand-title", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "cv-demand-title", className: "panel-title", children: L('Не было в наличии', 'Out of stock') }), _jsx("div", { className: "panel-sub", children: L('Что покупатель просил, а этого не оказалось. Просьба уже в разделе «Спрос» — оттуда её отправляют в закупку.', 'What the customer asked for and did not get. The request is already in Demand, where it can be sent to purchasing.') })] }), _jsxs(Link, { className: "link", to: "/demand", children: [L('Спрос', 'Demand'), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] })] }), _jsx("ul", { className: "cv-demand-list", children: items.map((d, i) => (_jsxs("li", { children: [_jsxs("div", { className: "cv-demand-top", children: [_jsx("b", { translate: "no", children: d.item }), _jsx("span", { className: "dm-cat", children: d.reason === 'not_carried' ? L('не держим', 'not carried') : L('закончился', 'sold out') }), _jsx("span", { className: `dm-outcome is-${d.outcome}`, children: L(...OUTCOME[d.outcome]) })] }), d.analog && _jsxs("div", { className: "cv-demand-analog", children: [L('Предложили взамен: ', 'Offered instead: '), _jsx("span", { translate: "no", children: d.analog })] }), d.quote && (_jsx("button", { type: "button", className: "cv-demand-quote", onClick: () => onSeek(d.quote), title: L('Перейти к моменту', 'Jump to the moment'), children: _jsx("span", { translate: "no", children: quoted(d.quote) }) })), d.seller_quote && (_jsxs("p", { className: "dm-answer", translate: "no", children: [_jsx(MessageSquareQuote, { size: 13, "aria-hidden": "true" }), quoted(d.seller_quote)] }))] }, i))) })] }));
}

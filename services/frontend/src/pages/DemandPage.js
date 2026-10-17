import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Download, MessageSquareQuote, PackageSearch } from 'lucide-react';
import { demandApi } from '@/api/demand';
import { adminApi } from '@/api/admin';
import { useAuthStore } from '@/store/authStore';
import { useTerms } from '@/lib/terms';
import { Drawer } from '@/components/Drawer';
import { Hint, num, pct } from '@/components/upsells/metrics';
import { toast } from '@/components/ui/Toast';
import { L, t, locale, plural } from '@/i18n';
import '@/styles/upsells.css';
import '@/styles/demand.css';
/* «Спрос» — что покупатели просили, а этого не оказалось, и список к закупке.
   Источник — разбор разговоров: «Нурофен есть?» — «Закончился» становится просьбой с исходом
   (купил аналог, заказали, ушёл без покупки). Руководитель решает по каждой позиции:
   в закупку, заказано или не закупаем, и выгружает список в Excel.
   Состояние в адресе: ?days=&store=&status= — ссылкой можно поделиться с закупщиком. */
const DAY_MS = 86400000;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDay = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
const quoted = (s) => L(`«${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}»`, `“${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}”`);
// «Садыхан · Абая» → «Абая»: в узких колонках название сети повторяется у каждой аптеки
const shortStore = (name) => (name && name.includes(' · ') ? name.split(' · ').slice(1).join(' · ') : name || '—');
const timesN = (n) => `${num(n)} ${plural(n, ['раз', 'раза', 'раз'], ['time', 'times'])}`;
const STATUS = {
    new: ['Новое', 'New'],
    to_order: ['В закупку', 'To order'],
    ordered: ['Заказано', 'Ordered'],
    ignored: ['Не закупаем', 'Not buying'],
};
const STATUS_ORDER = ['new', 'to_order', 'ordered', 'ignored'];
const OUTCOME = {
    substituted: ['купил аналог', 'bought an analog'],
    ordered: ['заказали', 'ordered'],
    lost: ['ушёл без покупки', 'left without it'],
    unknown: ['неясно', 'unclear'],
};
const CATEGORY = {
    rx: ['Рецептурный', 'Prescription'],
    otc: ['Без рецепта', 'OTC'],
    supplement: ['БАД и витамины', 'Supplements'],
    medical: ['Медизделия', 'Medical devices'],
    cosmetics: ['Косметика и гигиена', 'Cosmetics'],
    baby: ['Детское', 'Baby'],
};
export function DemandPage() {
    const terms = useTerms();
    const user = useAuthStore((s) => s.user);
    const [params, setParams] = useSearchParams();
    const days = Number(params.get('days')) || 30;
    const store = params.get('store') || undefined;
    const filter = params.get('status') || null;
    const [openKey, setOpenKey] = useState(null);
    const [exporting, setExporting] = useState(false);
    const set = (patch) => {
        const next = new URLSearchParams(params);
        for (const [k, v] of Object.entries(patch)) {
            if (v)
                next.set(k, v);
            else
                next.delete(k);
        }
        setParams(next, { replace: true });
    };
    const range = useMemo(() => ({
        store_id: store,
        date_from: isoDay(new Date(Date.now() - (days - 1) * DAY_MS)),
        date_to: isoDay(new Date()),
    }), [days, store]);
    const queryKey = ['demand', range.store_id ?? 'all', range.date_from, range.date_to];
    const { data, isLoading, isError } = useQuery({ queryKey, queryFn: () => demandApi.get(range) });
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60000 });
    const activeStores = (stores?.items || []).filter((s) => s.is_active !== false);
    const qc = useQueryClient();
    const save = useMutation({
        mutationFn: demandApi.save,
        onMutate: async (v) => {
            await qc.cancelQueries({ queryKey });
            const prev = qc.getQueryData(queryKey);
            if (prev) {
                qc.setQueryData(queryKey, {
                    ...prev,
                    items: prev.items.map((x) => (x.key === v.key ? { ...x, status: v.status, note: v.note ?? x.note } : x)),
                });
            }
            return { prev };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.prev)
                qc.setQueryData(queryKey, ctx.prev);
            toast(L('Не удалось сохранить решение. Попробуйте ещё раз.', 'Could not save the decision. Try again.'));
        },
        onSettled: () => qc.invalidateQueries({ queryKey }),
    });
    const decide = (item, status, note) => save.mutate({ key: item.key, title: item.title, status, note: note === undefined ? item.note : note });
    const exportList = async () => {
        setExporting(true);
        try {
            await demandApi.download({ ...range, status: filter ?? undefined });
        }
        catch {
            toast(L('Не удалось выгрузить список. Попробуйте ещё раз.', 'Could not export the list. Try again.'));
        }
        finally {
            setExporting(false);
        }
    };
    const canPickStore = user?.role !== 'manager';
    const items = data?.items || [];
    const counts = STATUS_ORDER.reduce((a, s) => ({ ...a, [s]: items.filter((x) => x.status === s).length }), {});
    const shown = filter ? items.filter((x) => x.status === filter) : items;
    const open = items.find((x) => x.key === openKey) || null;
    return (_jsxs("div", { className: "dm", children: [_jsxs("div", { className: "up-toolbar", children: [_jsx("div", { className: "seg", role: "group", "aria-label": L('Период', 'Period'), children: [7, 30, 90].map((n) => (_jsx("button", { type: "button", "aria-pressed": days === n, onClick: () => set({ days: n === 30 ? undefined : String(n) }), children: L(`${n} дней`, `${n} days`) }, n))) }), canPickStore && activeStores.length > 1 && (_jsxs("select", { className: "select-pill", value: store ?? '', "aria-label": t(terms.store), onChange: (e) => set({ store: e.target.value || undefined }), children: [_jsx("option", { value: "", children: t(terms.allStores) }), activeStores.map((s) => _jsx("option", { value: s.id, translate: "no", children: s.name }, s.id))] })), _jsx("span", { className: "up-toolbar-gap" }), _jsxs("button", { type: "button", className: "btn btn-outline", onClick: exportList, disabled: exporting || !items.length, children: [_jsx(Download, { size: 15, "aria-hidden": "true" }), filter === 'to_order' ? L('Выгрузить список к закупке', 'Export the order list') : L('Выгрузить в Excel', 'Export to Excel')] })] }), isError ? (_jsx("div", { className: "panel up-empty", children: L('Не удалось загрузить спрос. Обновите страницу.', 'Could not load demand. Refresh the page.') })) : isLoading || !data ? (_jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') })) : data.totals.requests === 0 && items.length === 0 ? (_jsxs("div", { className: "panel dm-empty", children: [_jsx(PackageSearch, { size: 28, "aria-hidden": "true" }), _jsx("h2", { children: L('Пока никто не спросил того, чего нет', 'Nobody has asked for a missing item yet') }), _jsx("p", { children: L(`Как только в разговоре прозвучит «Нурофен есть?» — «Закончился», просьба появится здесь: сколько раз спрашивали, в каких ${terms.storeForms[2]}, купили ли аналог. Отсюда её можно отправить в закупку.`, 'As soon as a conversation has “Do you have Nurofen?” — “Sold out”, the request appears here with how often it was asked, where, and whether an analog was bought.') })] })) : (_jsxs(_Fragment, { children: [_jsx(Summary, { data: data, days: days }), _jsxs("div", { className: "dm-grid", children: [_jsxs("section", { className: "panel dm-list", "aria-labelledby": "dm-list-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "dm-list-title", className: "panel-title", children: L('Чего не хватило', 'What was missing') }), _jsx("div", { className: "panel-sub", children: L('Позиции по числу запросов. Решение по позиции сохраняется сразу и попадает в выгрузку.', 'Items by number of requests. A decision is saved at once and goes into the export.') })] }) }), _jsxs("div", { className: "tabs dm-tabs", role: "tablist", "aria-label": L('Решение', 'Decision'), children: [_jsxs("button", { type: "button", role: "tab", "aria-selected": !filter, className: `tab ${!filter ? 'active' : ''}`, onClick: () => set({ status: undefined }), children: [L('Все', 'All'), _jsx("span", { className: "count", children: items.length })] }), STATUS_ORDER.map((s) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": filter === s, className: `tab ${filter === s ? 'active' : ''}`, onClick: () => set({ status: s }), children: [L(...STATUS[s]), _jsx("span", { className: "count", children: counts[s] })] }, s)))] }), shown.length === 0 ? (_jsx("p", { className: "dm-none", children: filter === 'to_order'
                                            ? L('В закупку пока ничего не отправлено. Откройте позицию из «Новых» и выберите «В закупку».', 'Nothing is marked to order yet.')
                                            : L('Здесь пусто.', 'Nothing here.') })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { className: "dm-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: L('Товар', 'Item') }), _jsxs("th", { className: "dm-num", children: [L('Запросов', 'Requests'), _jsx(Hint, { text: L('Сколько раз покупатели спросили этот товар, а его не было. Ниже — за последние 7 дней.', 'How many times customers asked for it while it was missing. Below: the last 7 days.') })] }), _jsxs("th", { className: "dm-num", children: [L('Ушли без покупки', 'Left without'), _jsx(Hint, { text: L('Покупатель не взял ни аналог, ни заказ — эти продажи ушли в другую аптеку.', 'The customer took neither an analog nor an order — the sale went elsewhere.') })] }), _jsx("th", { children: L('Чем заменяли', 'Substitute') }), _jsx("th", { children: L('Решение', 'Decision') })] }) }), _jsx("tbody", { children: shown.map((x) => _jsx(Row, { item: x, onOpen: () => setOpenKey(x.key), onDecide: (s) => decide(x, s) }, x.key)) })] }) }))] }), _jsx(Recent, { data: data, onOpen: (key) => setOpenKey(key) })] })] })), _jsx(ItemDrawer, { item: open, recent: data?.recent || [], days: days, onClose: () => setOpenKey(null), onSave: (status, note) => open && decide(open, status, note) })] }));
}
/* Итоги: сколько просили, сколько ушло, сколько закрыли аналогом, что уже в закупке */
function Summary({ data, days }) {
    const s = data.totals;
    return (_jsxs("section", { className: "panel up-band", "aria-label": L('Итоги за период', 'Period summary'), children: [_jsxs("div", { className: "up-band-head", children: [_jsx("h2", { className: "up-band-title", children: L(`Спрос за ${days} дней`, `Demand over ${days} days`) }), _jsxs("span", { className: "up-band-sub", children: [L(`${num(s.items)} ${plural(s.items, ['позиция', 'позиции', 'позиций'], ['', ''])} · в ${num(s.conversations)} ${plural(s.conversations, ['разговоре', 'разговорах', 'разговорах'], ['', ''])} из ${num(s.all_conversations)}`, `${num(s.items)} items · in ${num(s.conversations)} of ${num(s.all_conversations)} conversations`), _jsx(Hint, { text: L('Считаются просьбы из разобранных разговоров: покупатель назвал товар, а его не оказалось в наличии или в ассортименте.', 'Requests from analysed conversations: the customer named an item that was out of stock or not carried.') })] })] }), _jsxs("div", { className: "m-tiles", children: [_jsxs("div", { className: "m-tile", children: [_jsxs("div", { className: "m-tile-title", children: [L('Спросили, а не было', 'Asked, not in stock'), _jsx(Hint, { text: L('Каждая просьба — отдельно: если в одном разговоре спросили два товара, это две просьбы.', 'Each request counts: two missing items in one conversation are two requests.') })] }), _jsx("div", { className: "m-tile-value", children: num(s.requests) }), _jsx("div", { className: "m-tile-base", children: L(`${plural(s.requests, ['просьба', 'просьбы', 'просьб'], ['request', 'requests'])} покупателей`, 'customer requests') })] }), _jsxs("div", { className: "m-tile", children: [_jsxs("div", { className: "m-tile-title", children: [L('Ушли без покупки', 'Left without it'), _jsx(Hint, { text: L('Ни аналога, ни заказа: покупатель пошёл искать в другую аптеку.', 'No analog and no order: the customer went to look elsewhere.') })] }), _jsx("div", { className: "m-tile-value", children: num(s.lost) }), _jsx("div", { className: "m-tile-base", children: L(`${pct(s.requests ? s.lost / s.requests : null)} просьб`, `${pct(s.requests ? s.lost / s.requests : null)} of requests`) })] }), _jsxs("div", { className: "m-tile", children: [_jsxs("div", { className: "m-tile-title", children: [L('Купили аналог', 'Bought an analog'), _jsx(Hint, { text: L('Фармацевт предложил замену с тем же действием, и покупатель согласился. Ещё часть — заказали к нужному дню.', 'The pharmacist offered a substitute and the customer agreed; some were ordered for later.') })] }), _jsx("div", { className: "m-tile-value", children: num(s.substituted) }), _jsx("div", { className: "m-tile-base", children: L(`${pct(s.requests ? s.substituted / s.requests : null)} просьб · заказали ещё ${num(s.ordered)}`, `${pct(s.requests ? s.substituted / s.requests : null)} · ${num(s.ordered)} more ordered`) })] }), _jsxs("div", { className: "m-tile", children: [_jsxs("div", { className: "m-tile-title", children: [L('В закупку', 'To order'), _jsx(Hint, { text: L('Позиции, которые вы отметили «В закупку». Их можно выгрузить в Excel для поставщика.', 'Items you marked “To order”. Export them to Excel for the supplier.') })] }), _jsx("div", { className: "m-tile-value", children: num(s.to_order) }), _jsx("div", { className: "m-tile-base", children: L(`из ${num(data.items.length)} ${plural(data.items.length, ['позиции', 'позиций', 'позиций'], ['', ''])} в списке`, `of ${num(data.items.length)} items`) })] })] })] }));
}
function Row({ item: x, onOpen, onDecide }) {
    const analog = x.analogs[0];
    const growing = x.last7 >= 2 && x.last7 > x.prev7;
    return (_jsxs("tr", { className: "dm-row", children: [_jsx("td", { children: _jsxs("button", { type: "button", className: "dm-item", onClick: onOpen, "aria-label": L(`${x.title}: подробнее`, `${x.title}: details`), children: [_jsx("b", { translate: "no", children: x.title }), _jsxs("span", { className: "dm-item-meta", children: [CATEGORY[x.category] && _jsx("span", { className: "dm-cat", children: L(...CATEGORY[x.category]) }), x.not_carried > 0 && x.not_carried >= x.requests / 2 && _jsx("span", { className: "dm-cat is-warn", children: L('нет в ассортименте', 'not carried') }), x.stores.length > 0 && (_jsx("span", { translate: "no", children: x.stores.length > 1
                                        ? L(`чаще всего — ${shortStore(x.stores[0].store_name)}, ${x.stores[0].requests} из ${x.requests}`, `mostly ${shortStore(x.stores[0].store_name)}, ${x.stores[0].requests} of ${x.requests}`)
                                        : shortStore(x.stores[0].store_name) })), x.last_at && _jsx("span", { children: L(`последний ${fmtDay(x.last_at)}`, `last ${fmtDay(x.last_at)}`) })] })] }) }), _jsxs("td", { className: "dm-num", children: [_jsx("b", { children: num(x.requests) }), _jsxs("small", { className: growing ? 'is-up' : undefined, children: [growing && _jsx(ArrowUpRight, { size: 12, "aria-hidden": "true" }), L(`за 7 дней: ${x.last7}`, `7 days: ${x.last7}`)] })] }), _jsx("td", { className: "dm-num", children: _jsx("b", { className: x.lost ? 'dm-lost' : undefined, children: num(x.lost) }) }), _jsx("td", { children: analog
                    ? _jsxs("span", { className: "dm-analog", children: [_jsx("span", { translate: "no", children: analog.name }), _jsx("small", { children: L(`взяли ${analog.taken} из ${analog.offered}`, `taken ${analog.taken} of ${analog.offered}`) })] })
                    : _jsx("span", { className: "dm-muted", children: L('аналог не предлагали', 'no analog offered') }) }), _jsx("td", { children: _jsx("select", { className: `dm-status is-${x.status}`, value: x.status, "aria-label": L(`Решение по «${x.title}»`, `Decision for ${x.title}`), onChange: (e) => onDecide(e.target.value), children: STATUS_ORDER.map((s) => _jsx("option", { value: s, children: L(...STATUS[s]) }, s)) }) })] }));
}
/* Лента последних просьб: цифры списка проверяются по живым разговорам */
function Recent({ data, onOpen }) {
    const rows = data.recent.slice(0, 12);
    if (!rows.length)
        return null;
    return (_jsxs("section", { className: "panel dm-feed", "aria-labelledby": "dm-feed-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "dm-feed-title", className: "panel-title", children: L('Последние просьбы', 'Latest requests') }), _jsx("div", { className: "panel-sub", children: L('Как это звучало у кассы — откройте разговор, чтобы послушать', 'How it sounded at the counter — open the conversation to listen') })] }) }), _jsx("ul", { className: "dm-feed-list", children: rows.map((r, i) => (_jsxs("li", { children: [_jsxs("div", { className: "dm-feed-top", children: [_jsx("button", { type: "button", className: "dm-feed-item", onClick: () => onOpen(r.key), translate: "no", children: r.item }), _jsx("span", { className: `dm-outcome is-${r.outcome}`, children: L(...OUTCOME[r.outcome]) })] }), r.quote && _jsx("p", { className: "dm-quote", translate: "no", children: quoted(r.quote) }), _jsxs(Link, { className: "dm-feed-meta", to: `/conversations/${r.conversation_id}`, children: [fmtDay(r.session_date), r.time ? `, ${r.time}` : '', " \u00B7 ", _jsx("span", { translate: "no", children: [r.store_name, r.seller_name].filter(Boolean).join(' · ') })] })] }, `${r.conversation_id}-${i}`))) })] }));
}
function ItemDrawer({ item, recent, days, onClose, onSave }) {
    const terms = useTerms();
    const [note, setNote] = useState(null);
    const requests = item ? recent.filter((r) => r.key === item.key).slice(0, 6) : [];
    const value = note ?? item?.note ?? '';
    return (_jsx(Drawer, { isOpen: !!item, onClose: () => { setNote(null); onClose(); }, title: item?.title || '', children: item && (_jsxs("div", { className: "dm-drawer", children: [_jsx("p", { className: "dm-drawer-lead", children: L(`За ${days} дней спросили ${timesN(item.requests)}: ${item.lost} ушли без покупки, ${item.substituted} купили аналог${item.ordered ? `, ${item.ordered} заказали` : ''}.`, `Asked ${item.requests} times in ${days} days: ${item.lost} left without it, ${item.substituted} bought an analog${item.ordered ? `, ${item.ordered} ordered` : ''}.`) }), _jsxs("div", { className: "dm-sec", children: [_jsx("h3", { children: L('Решение', 'Decision') }), _jsx("div", { className: "seg dm-seg", role: "group", "aria-label": L('Решение', 'Decision'), children: STATUS_ORDER.map((s) => (_jsx("button", { type: "button", "aria-pressed": item.status === s, onClick: () => onSave(s, value.trim() || null), children: L(...STATUS[s]) }, s))) }), _jsxs("label", { className: "dm-note", children: [_jsx("span", { children: L('Комментарий для закупки', 'Note for purchasing') }), _jsx("textarea", { rows: 2, value: value, maxLength: 1000, placeholder: L('Например: брать 20 упаковок, поставщик — основной', 'E.g. order 20 packs from the main supplier'), onChange: (e) => setNote(e.target.value), onBlur: () => { if (note != null && note !== (item.note ?? ''))
                                        onSave(item.status, note.trim() || null); } })] })] }), item.stores.length > 0 && (_jsxs("div", { className: "dm-sec", children: [_jsx("h3", { children: L(`По ${terms.isPharmacy ? 'аптекам' : 'магазинам'}`, 'By location') }), _jsx("ul", { className: "dm-bars", children: item.stores.map((s) => (_jsxs("li", { children: [_jsx("span", { translate: "no", children: s.store_name }), _jsx("span", { className: "dm-bar", children: _jsx("i", { style: { width: `${(s.requests / item.stores[0].requests) * 100}%` } }) }), _jsx("b", { children: s.requests })] }, s.store_id))) })] })), _jsxs("div", { className: "dm-sec", children: [_jsx("h3", { children: L('Чем заменяли', 'Substitutes') }), item.analogs.length
                            ? _jsx("ul", { className: "dm-analogs", children: item.analogs.map((a) => (_jsxs("li", { children: [_jsx("span", { translate: "no", children: a.name }), _jsx("small", { children: L(`предлагали ${timesN(a.offered)}, взяли ${a.taken}`, `offered ${a.offered}, taken ${a.taken}`) })] }, a.name))) })
                            : _jsx("p", { className: "dm-muted", children: L('Аналог не предлагали ни разу — стоит напомнить команде про замену по действующему веществу.', 'No analog was ever offered — remind the team about substitutes.') })] }), requests.length > 0 && (_jsxs("div", { className: "dm-sec", children: [_jsx("h3", { children: L('Как спрашивали', 'How it was asked') }), _jsx("ul", { className: "dm-quotes", children: requests.map((r, i) => (_jsxs("li", { children: [r.quote && _jsx("p", { className: "dm-quote", translate: "no", children: quoted(r.quote) }), r.seller_quote && _jsxs("p", { className: "dm-answer", translate: "no", children: [_jsx(MessageSquareQuote, { size: 13, "aria-hidden": "true" }), quoted(r.seller_quote)] }), _jsxs(Link, { className: "dm-feed-meta", to: `/conversations/${r.conversation_id}`, children: [fmtDay(r.session_date), r.time ? `, ${r.time}` : '', " \u00B7 ", _jsx("span", { translate: "no", children: [r.store_name, r.seller_name].filter(Boolean).join(' · ') }), ' · ', _jsx("span", { className: `dm-outcome is-${r.outcome}`, children: L(...OUTCOME[r.outcome]) })] })] }, `${r.conversation_id}-${i}`))) })] }))] })) }));
}

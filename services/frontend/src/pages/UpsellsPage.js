import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BarChart3, CalendarDays, Check, ClipboardCheck, Eye, MessageSquareQuote, Minus, Sparkles, Target, ThumbsUp, Trash2, X } from 'lucide-react';
import { upsellsApi } from '@/api/upsells';
import { adminApi } from '@/api/admin';
import { useAuthStore } from '@/store/authStore';
import { useTerms } from '@/lib/terms';
import { initials } from '@/lib/format';
import { Drawer } from '@/components/Drawer';
import { StampCard } from '@/components/upsells/StampCard';
import { MoneyTile, Hint, MetricTile, PlanChip, W, bestTechnique, num, ordersN, ordersOf, offersOf, pct, rub, techniqueLabel } from '@/components/upsells/metrics';
import { UpsellAnalytics } from '@/components/analytics/UpsellAnalytics';
import { L, t, plural, locale } from '@/i18n';
import '@/styles/upsells.css';
/* «Допродажи» — операционный экран смены: как команда предлагает сегодня, кому нужна подсказка
   прямо сейчас и что сказать. Метрики и их определения — общие (components/upsells/metrics).
   Итоги за период: у кофеен — раздел «Аналитика», в рознице — вкладка здесь же.
   Состояние в адресе: ?tab=period&day=&store=&seller= — ссылку можно открыть на телефоне. */
const DAY_MS = 86400000;
const DEFAULT_TARGET = 0.7;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const shiftDay = (iso, days) => isoDay(new Date(parseDay(iso).getTime() + days * DAY_MS));
const fmtDay = (iso) => parseDay(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
const quoted = (s) => {
    const q = s.replace(/^[«"“\s]+|[»"”\s]+$/g, '');
    return L(`«${q}»`, `“${q}”`);
};
const RESPONSE = {
    accepted: ['взяли', 'accepted'],
    declined: ['отказ', 'declined'],
    no_answer: ['без ответа', 'no answer'],
};
/** Сколько заказов подряд с предложением нужно, чтобы доля дошла до плана: (w + n) / (o + n) ≥ t */
function ordersToPlan(orders, withOffer, target) {
    if (target >= 1)
        return null;
    return Math.max(1, Math.ceil((target * orders - withOffer) / (1 - target) - 1e-9));
}
/** Сводка группирует по паре «сотрудник + точка» — строки одного человека склеиваем */
function mergeSellers(rows) {
    const bySeller = new Map();
    for (const r of rows) {
        const m = bySeller.get(r.seller_id);
        if (!m) {
            bySeller.set(r.seller_id, { ...r });
            continue;
        }
        m.orders += r.orders;
        m.with_offer += r.with_offer;
        m.offers += r.offers;
        m.accepted += r.accepted;
        m.shifts = Math.max(m.shifts, r.shifts);
    }
    return [...bySeller.values()].map((m) => {
        const rate = m.orders ? m.with_offer / m.orders : null;
        return { ...m, attempt_rate: rate, acceptance_rate: m.offers ? m.accepted / m.offers : null, plan_met: rate != null && rate >= m.attempt_rate_target };
    }).sort((a, b) => (b.attempt_rate ?? 0) - (a.attempt_rate ?? 0));
}
export function UpsellsPage() {
    const [params, setParams] = useSearchParams();
    const user = useAuthStore((s) => s.user);
    const terms = useTerms();
    // У кофеен итоги за период живут в «Аналитике»; в рознице — вкладкой здесь
    const tab = !terms.offersFirst && params.get('tab') === 'period' ? 'period' : 'day';
    const today = isoDay(new Date());
    const day = params.get('day') || today;
    const store = params.get('store') || undefined;
    const days = Number(params.get('days')) || 30;
    const [planOpen, setPlanOpen] = useState(false);
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
    const canPickStore = user?.role !== 'manager';
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60000 });
    const activeStores = (stores?.items || []).filter((s) => s.is_active !== false);
    return (_jsxs("div", { className: "up", children: [_jsxs("div", { className: "up-toolbar", children: [!terms.offersFirst && (_jsxs("div", { className: "seg", role: "group", "aria-label": L('Раздел', 'View'), children: [_jsx("button", { type: "button", "aria-pressed": tab === 'day', onClick: () => set({ tab: undefined }), children: L('Смена', 'Shift') }), _jsx("button", { type: "button", "aria-pressed": tab === 'period', onClick: () => set({ tab: 'period' }), children: L('Итоги за период', 'Period summary') })] })), tab === 'day' ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "seg", role: "group", "aria-label": L('День', 'Day'), children: [_jsx("button", { type: "button", "aria-pressed": day === today, onClick: () => set({ day: undefined }), children: L('Сегодня', 'Today') }), _jsx("button", { type: "button", "aria-pressed": day === shiftDay(today, -1), onClick: () => set({ day: shiftDay(today, -1) }), children: L('Вчера', 'Yesterday') })] }), _jsxs("label", { className: "up-date", children: [_jsx(CalendarDays, { size: 15, "aria-hidden": "true" }), _jsx("span", { className: "sr-only", children: L('Выбрать день', 'Pick a day') }), _jsx("input", { type: "date", value: day, max: today, onChange: (e) => set({ day: e.target.value && e.target.value !== today ? e.target.value : undefined }) })] })] })) : (_jsx("div", { className: "seg", role: "group", "aria-label": L('Период', 'Period'), children: [7, 30, 90].map((n) => (_jsx("button", { type: "button", "aria-pressed": days === n, onClick: () => set({ days: n === 30 ? undefined : String(n) }), children: L(`${n} дней`, `${n} days`) }, n))) })), canPickStore && activeStores.length > 1 && (_jsxs("select", { className: "select-pill", value: store ?? '', "aria-label": t(terms.store), onChange: (e) => set({ store: e.target.value || undefined, seller: undefined }), children: [_jsx("option", { value: "", children: t(terms.allStores) }), activeStores.map((s) => _jsx("option", { value: s.id, translate: "no", children: s.name }, s.id))] })), _jsx("span", { className: "up-toolbar-gap" }), terms.offersFirst && (_jsxs(Link, { className: "btn btn-ghost", to: "/analytics", children: [_jsx(BarChart3, { size: 15, "aria-hidden": "true" }), L('Итоги за период', 'Period summary')] })), _jsxs("button", { type: "button", className: "btn btn-outline", onClick: () => setPlanOpen(true), children: [_jsx(Target, { size: 15, "aria-hidden": "true" }), L('План смены', 'Shift plan')] })] }), tab === 'day'
                ? _jsx(DayView, { day: day, today: today, store: store, sellerParam: params.get('seller'), onSeller: (id) => set({ seller: id }), onDay: (d) => set({ day: d === today ? undefined : d }) })
                : _jsx(UpsellAnalytics, { days: days, store: store }), _jsx(PlanDrawer, { open: planOpen, onClose: () => setPlanOpen(false), stores: activeStores, storeFilter: store })] }));
}
/* ─── Смена: команда за день и смена выбранного сотрудника ─────────────────── */
function DayView({ day, today, store, sellerParam, onSeller, onDay }) {
    const terms = useTerms();
    const { data: team, isLoading, isError } = useQuery({
        queryKey: ['upsell-overview', store ?? 'all', day, day],
        queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: day, date_to: day }),
    });
    const { data: roster } = useQuery({
        queryKey: ['admin-sellers', store ?? 'all', 'active'],
        queryFn: () => adminApi.getSellers({ store_id: store, is_active: true, limit: 200 }),
        staleTime: 5 * 60000,
    });
    // Какой приём лучше всего работает у команды за 30 дней — для совета в карточке смены.
    // Ключ совпадает с «Аналитикой», поэтому данные берутся из кэша, если раздел уже открывали.
    const from30 = shiftDay(today, -29);
    const { data: month } = useQuery({
        queryKey: ['upsell-overview', store ?? 'all', from30, today],
        queryFn: () => upsellsApi.getOverview({ store_id: store, date_from: from30, date_to: today }),
        staleTime: 10 * 60000,
    });
    const best = month ? bestTechnique(month.techniques) : undefined;
    // Последний день с заказами — куда отправить из пустого «сегодня» (утро до первых записей)
    const lastDay = month?.days.filter((x) => x.orders > 0 && x.date < day).pop()?.date;
    const teamSellers = useMemo(() => mergeSellers(team?.sellers || []), [team]);
    // Сначала те, у кого в этот день были заказы, затем остальные сотрудники
    const sellers = useMemo(() => {
        const seen = new Set(teamSellers.map((s) => s.seller_id));
        const rest = (roster?.items || [])
            .filter((s) => !seen.has(s.id))
            .map((s) => ({ seller_id: s.id, name: `${s.first_name} ${s.last_name}`.trim(), store_name: s.store_name ?? null, row: null }))
            .sort((a, b) => a.name.localeCompare(b.name, locale));
        return [...teamSellers.map((s) => ({ seller_id: s.seller_id, name: s.name || '', store_name: s.store_name, row: s })), ...rest];
    }, [teamSellers, roster]);
    const selectedId = (sellerParam && sellers.some((s) => s.seller_id === sellerParam) ? sellerParam : undefined) || sellers[0]?.seller_id;
    if (isError)
        return _jsx("div", { className: "panel up-empty", children: L('Не удалось загрузить данные. Обновите страницу.', 'Could not load the data. Refresh the page.') });
    if (isLoading || !team)
        return _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') });
    const s = team.totals;
    const target = team.plan.attempt_rate_target;
    const perShift = team.plan.accepted_per_shift;
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel up-band", "aria-label": L('Команда за день', 'Team for the day'), children: [_jsxs("div", { className: "up-band-head", children: [_jsx("h2", { className: "up-band-title", children: day === today ? L('Смена сегодня', 'Today’s shift') : L(`Смена ${fmtDay(day)}`, `Shift on ${fmtDay(day)}`) }), _jsxs("span", { className: "up-band-sub", children: [s.orders
                                        ? L(`${ordersN(s.orders)} разобрано`, `${ordersN(s.orders)} analysed`)
                                        : day === today ? L(`Разобранных ${W().ordersGen} пока нет`, 'No analysed orders yet') : L(`Разобранных ${W().ordersGen} нет`, 'No analysed orders'), _jsx(Hint, { metric: "orders" })] })] }), s.orders > 0 ? (_jsxs("div", { className: "m-tiles", children: [_jsx(MetricTile, { metric: "attempt", value: pct(s.attempt_rate), base: `${num(s.with_offer)} ${ordersOf(s.orders)}`, children: _jsx(PlanChip, { value: s.attempt_rate, target: target }) }), _jsx(MetricTile, { metric: "acceptance", value: pct(s.acceptance_rate), base: `${num(s.accepted)} ${offersOf(s.offers)}` }), _jsx(MoneyTile, { s: s })] })) : (_jsxs("div", { className: "up-band-empty", children: [_jsx("p", { className: "up-band-note", children: L('Разбор появляется через несколько минут после того, как запись смены выгружена: с бейджа, приложения сотрудника или вручную.', 'The review appears a few minutes after the shift recording is uploaded: from a badge, the mobile recorder or manually.') }), lastDay && (_jsxs("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => onDay(lastDay), children: [L(`Открыть смену ${fmtDay(lastDay)}`, `Open the shift on ${fmtDay(lastDay)}`), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] }))] }))] }), sellers.length === 0 ? (_jsxs("div", { className: "panel up-empty", children: [L('Сотрудников пока нет.', 'There are no employees yet.'), ' ', _jsx(Link, { to: "/admin", children: L('Добавить в администрировании', 'Add them in Administration') })] })) : (_jsxs("div", { className: `up-grid${sellerParam ? ' is-picked' : ''}`, children: [_jsxs("section", { className: "panel up-list", "aria-labelledby": "up-list-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "up-list-title", className: "panel-title", children: terms.offersFirst ? t(terms.sellerPlural) : L('Сотрудники', 'Employees') }), _jsx("div", { className: "panel-sub", children: L('Предлагали · допродажи за смену', 'Offered · add-ons this shift') })] }) }), _jsx("ul", { children: sellers.map((x) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "up-seller", "aria-current": x.seller_id === selectedId ? 'true' : undefined, onClick: () => onSeller(x.seller_id), children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(x.name) || '?' }), _jsxs("span", { className: "up-seller-main", children: [_jsx("span", { className: "up-seller-name ellipsis", translate: "no", children: x.name || L('Без имени', 'Unnamed') }), _jsx("span", { className: "up-seller-meta ellipsis", children: x.row ? `${x.row.with_offer} ${ordersOf(x.row.orders)}` : day === today ? L(`Сегодня не на смене или ${W().ordersGen} нет`, 'Off shift or no orders today') : L(`Смены не было или ${W().ordersGen} нет`, 'No shift or no orders') })] }), x.row && (_jsxs("span", { className: "up-seller-side", children: [_jsx("span", { className: "up-seller-rate", children: pct(x.row.attempt_rate) }), _jsx(PlanChip, { value: x.row.attempt_rate, target: x.row.attempt_rate_target, compact: true }), _jsx("span", { className: "up-seller-acc", children: perShift ? L(`допродаж ${x.row.accepted} из ${perShift}`, `${x.row.accepted} of ${perShift} add-ons`) : L(`допродаж ${x.row.accepted}`, `${x.row.accepted} add-ons`) })] }))] }) }, x.seller_id))) })] }), selectedId && _jsx(ShiftPanel, { sellerId: selectedId, day: day, today: today, best: best?.acceptance_rate != null ? { technique: best.technique, rate: best.acceptance_rate } : undefined })] }))] }));
}
function ShiftPanel({ sellerId, day, today, best }) {
    const terms = useTerms();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['upsell-shift', sellerId, day],
        queryFn: () => upsellsApi.getShift(sellerId, day),
        retry: (count, error) => error?.response?.status !== 404 && count < 1,
    });
    // На узком экране список стоит над карточкой — после выбора сотрудника прокручиваем к ней
    const ref = useRef(null);
    const first = useRef(true);
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        if (!window.matchMedia('(max-width: 1100px)').matches)
            return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, [sellerId]);
    if (isError)
        return _jsx("section", { ref: ref, className: "panel up-me up-empty", children: L('Не удалось загрузить смену сотрудника.', 'Could not load this shift.') });
    if (isLoading || !data)
        return _jsx("section", { ref: ref, className: "panel up-me", children: _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') }) });
    const { progress, today: d, focus } = data;
    const name = `${data.seller.first_name} ${data.seller.last_name}`.trim();
    const target = progress.attempt_rate_target;
    const accTarget = progress.accepted_target;
    const times = data.orders.map((o) => o.time).filter(Boolean).sort();
    // Одна подсказка «что сделать сейчас» — вместо набора разрозненных чисел
    let action;
    let tone = 'idle';
    if (!d.orders) {
        action = d.pending_recordings
            ? L(`${d.pending_recordings} ${plural(d.pending_recordings, ['запись', 'записи', 'записей'], ['', ''])} ещё разбирается — ${W().orders} появятся через несколько минут.`, `${d.pending_recordings} recordings are still being analysed.`)
            : day === today ? L(`Сегодня ${W().ordersGen} пока нет.`, 'No orders yet today.') : L(`В этот день ${W().ordersGen} нет.`, 'No orders on this day.');
    }
    else if (!(progress.attempt_rate != null && Math.round(progress.attempt_rate * 100) >= Math.round(target * 100))) {
        // «Выполнен» считаем по округлённым процентам — как PlanChip, чтобы плитка и подсказка не спорили
        const need = ordersToPlan(d.orders, d.with_offer, target);
        tone = 'warn';
        action = need == null
            ? L(`Обсудите с сотрудником, как предлагать подходящую допродажу ${W().inEach}.`, 'Discuss with the employee how to make a suitable offer in each order.')
            : need === 1
                ? L(`Чтобы выйти на план ${pct(target)}, потренируйте с сотрудником предложение для ${W().next}.`, `To reach the ${pct(target)} plan, offer an add-on in the next order.`)
                : L(`Чтобы выйти на план ${pct(target)}, обсудите с сотрудником предложения в следующих ${need} ${plural(need, W().orderLoc, ['', ''])} подряд.`, `To reach the ${pct(target)} plan, offer an add-on in the next ${ordersN(need)} in a row.`);
    }
    else if (accTarget && progress.accepted < accTarget) {
        tone = 'warn';
        const left = accTarget - progress.accepted;
        action = L(`План по предложениям выполнен. До плана смены — ещё ${left} ${plural(left, ['допродажа', 'допродажи', 'допродаж'], ['', ''])}.`, `Offer plan met. ${left} more add-ons to the shift plan.`)
            + (best ? L(` Потренируйте с сотрудником приём «${techniqueLabel(best.technique)}»: у команды доля согласий с ним ${pct(best.rate)}.`, `Practise the ${techniqueLabel(best.technique)} technique with the employee; the team's acceptance rate is ${pct(best.rate)}.`) : '');
    }
    else {
        tone = 'good';
        action = accTarget ? L('Оба плана смены выполнены. Отметьте результат сотрудника на встрече.', 'Both shift plans are met. Recognise the employee’s result.') : L('План по предложениям выполнен. Похвалите сотрудника за результат.', 'The offer plan is met. Recognise the employee’s result.');
    }
    return (_jsxs("section", { ref: ref, className: "panel up-me", "aria-labelledby": "up-me-name", children: [_jsxs("header", { className: "up-me-head", children: [_jsx("span", { className: "avatar avatar-lg", "aria-hidden": "true", translate: "no", children: initials(name) || '?' }), _jsxs("div", { className: "up-me-who", children: [_jsx("h2", { id: "up-me-name", className: "up-me-name", translate: "no", children: name }), _jsxs("div", { className: "up-me-store", children: [_jsx("span", { translate: "no", children: data.seller.store_name }), times.length > 0 && _jsxs(_Fragment, { children: [" \u00B7 ", L(`${W().orders} с ${times[0]} до ${times[times.length - 1]}`, `orders ${times[0]}–${times[times.length - 1]}`)] })] })] }), _jsx("div", { className: "up-me-day", children: day === today ? L('Сегодня', 'Today') : fmtDay(day) })] }), _jsxs("p", { className: `up-action is-${tone}`, children: [tone === 'warn' ? _jsx(Target, { size: 18, "aria-hidden": "true" }) : tone === 'good' ? _jsx(Check, { size: 18, "aria-hidden": "true" }) : _jsx(CalendarDays, { size: 18, "aria-hidden": "true" }), _jsx("span", { children: action })] }), d.orders > 0 && (_jsxs("div", { className: "m-tiles up-me-tiles", children: [_jsx(MetricTile, { metric: "attempt", value: pct(progress.attempt_rate), base: `${num(d.with_offer)} ${ordersOf(d.orders)}`, children: _jsx(PlanChip, { value: progress.attempt_rate, target: target }) }), _jsx(MetricTile, { metric: "acceptance", value: pct(d.acceptance_rate), base: `${num(d.accepted)} ${offersOf(d.offers)}` }), _jsx(MoneyTile, { s: d })] })), d.orders > 0 && (accTarget || progress.accepted > 0) && (_jsxs("div", { className: "up-stamps", children: [_jsxs("div", { className: "up-stamps-head", children: [_jsx("span", { children: accTarget
                                    ? L(`Допродажи за смену: ${progress.accepted} из ${accTarget} по плану`, `Add-ons this shift: ${progress.accepted} of ${accTarget} planned`)
                                    : L(`Допродажи за смену: ${progress.accepted}`, `Add-ons this shift: ${progress.accepted}`) }), _jsx(Hint, { metric: "accepted" })] }), _jsx(StampCard, { filled: progress.accepted, total: accTarget, size: "lg", label: accTarget ? L(`${progress.accepted} из ${accTarget} допродаж по плану смены`, `${progress.accepted} of ${accTarget} planned add-ons`) : L(`${progress.accepted} допродаж`, `${progress.accepted} add-ons`) }), _jsx("p", { className: "up-stamps-note", children: L(`Кружок — ${W().customer} согласился на предложение. Пустые — сколько осталось до плана.`, 'A filled circle is an accepted offer; empty ones are what is left to the plan.') })] })), focus.items.length > 0 && (_jsxs("p", { className: "up-focus-line", children: [_jsx(Sparkles, { size: 15, "aria-hidden": "true" }), L('Товар дня — ', 'Item of the day: '), _jsx("b", { translate: "no", children: focus.items.join(', ') }), focus.offered ? L(`: предлагали ${focus.offered} ${plural(focus.offered, ['раз', 'раза', 'раз'], ['', ''])}, взяли ${focus.accepted}`, `: offered ${focus.offered} times, accepted ${focus.accepted}`)
                        : L(': сегодня ещё не предлагали', ': not offered yet today')] })), _jsx(Report, { sellerId: sellerId, day: day, hasOrders: d.orders > 0, name: data.seller.first_name }), data.best_phrase && (_jsxs("div", { className: "up-sec", children: [_jsx("div", { className: "up-sec-head", children: _jsx("h3", { children: L('Удачная фраза смены', 'A phrase that worked') }) }), _jsxs("figure", { className: "tip-quote is-best", children: [_jsx("blockquote", { translate: "no", children: quoted(data.best_phrase.quote) }), _jsxs("figcaption", { children: [L(`${W().customer[0].toUpperCase() + W().customer.slice(1)} согласился · `, 'Accepted · '), _jsx("span", { translate: "no", children: data.best_phrase.item }), " \u00B7 ", techniqueLabel(data.best_phrase.technique)] })] })] })), data.orders.length > 0 && _jsx(Orders, { orders: data.orders, isCafe: terms.isCafe })] }));
}
/* Отчёт руководителю о сотруднике: что видно по разговорам — наблюдения с цифрами и цитатами
   и один шаг на разборе. Это не советы сотруднику: у него свои подсказки в приложении. */
function Report({ sellerId, day, hasOrders, name }) {
    // Отчёт пишет LLM; сервер держит его в кэше на день и пересчитывает, только когда появились новые разговоры
    const { data, isLoading, isError } = useQuery({
        queryKey: ['upsell-tips-manager', sellerId, day],
        queryFn: () => upsellsApi.getTips(sellerId, day),
        enabled: hasOrders,
        staleTime: 5 * 60000,
        retry: false,
    });
    if (!hasOrders)
        return null;
    const tips = data?.tips;
    const focus = tips?.focus?.replace(/^\s*На разборе:\s*/i, '');
    return (_jsxs("div", { className: "up-sec", children: [_jsxs("div", { className: "up-sec-head", children: [_jsx("h3", { children: L(`Что видно по разговорам: ${name}`, `What the conversations show: ${name}`) }), data?.based_on ? _jsx("span", { children: L(`по ${data.based_on} ${plural(data.based_on, W().orderDat, ['', ''])}${data.period === 'week' ? ' за неделю' : ' за смену'}`, `based on ${ordersN(data.based_on)}`) }) : null] }), isLoading ? (_jsx("p", { className: "up-none", children: L('Готовим разбор…', 'Preparing the review…') })) : isError || !tips ? (_jsx("p", { className: "up-none", children: L('Разбор сейчас недоступен. Обновите страницу позже.', 'The review is unavailable right now. Try again later.') })) : (_jsxs(_Fragment, { children: [tips.praise && (_jsxs("p", { className: "up-report-good", children: [_jsx(ThumbsUp, { size: 15, "aria-hidden": "true" }), _jsx("span", { translate: "no", children: tips.praise })] })), _jsx("ul", { className: "up-tips", children: (tips.tips || []).slice(0, 3).map((tip, i) => (_jsxs("li", { className: "tip", children: [_jsx("span", { className: "tip-ico", "aria-hidden": "true", children: _jsx(Eye, { size: 16 }) }), _jsxs("div", { className: "tip-body", translate: "no", children: [tip.title && _jsx("div", { className: "tip-title", children: _jsx("b", { children: tip.title }) }), tip.text && _jsx("div", { className: "tip-text", children: tip.text }), tip.quote && (_jsxs("figure", { className: "tip-quote", children: [_jsx("blockquote", { children: quoted(tip.quote) }), _jsx("figcaption", { children: L('Из разговора', 'From the conversation') })] }))] })] }, i))) }), focus && (_jsxs("p", { className: "up-report-step", children: [_jsx(ClipboardCheck, { size: 15, "aria-hidden": "true" }), _jsxs("span", { children: [_jsx("b", { children: L('На разборе: ', 'At the review: ') }), _jsx("span", { translate: "no", children: focus })] })] }))] }))] }));
}
function Orders({ orders, isCafe }) {
    const [all, setAll] = useState(false);
    const shown = all ? orders : orders.slice(0, 8);
    return (_jsxs("div", { className: "up-sec", children: [_jsxs("div", { className: "up-sec-head", children: [_jsx("h3", { children: L(`${W().orders[0].toUpperCase() + W().orders.slice(1)} смены`, 'Orders of the shift') }), _jsxs("span", { className: "up-legend", children: [_jsxs("span", { className: "up-chip is-accepted", children: [_jsx(Check, { size: 11, strokeWidth: 3, "aria-hidden": "true" }), L('взяли', 'accepted')] }), _jsxs("span", { className: "up-chip is-declined", children: [_jsx(X, { size: 11, strokeWidth: 3, "aria-hidden": "true" }), L('отказ', 'declined')] }), _jsxs("span", { className: "up-chip is-none", children: [_jsx(Minus, { size: 11, strokeWidth: 3, "aria-hidden": "true" }), L('не предложили', 'no offer')] })] })] }), orders.length === 0 ? (_jsx("p", { className: "up-none", children: L(`Пока нет разобранных ${W().ordersGen}.`, 'No analysed orders yet.') })) : (_jsxs(_Fragment, { children: [_jsx("ul", { className: "up-convs", children: shown.map((o) => (_jsx("li", { children: _jsxs(Link, { to: `/conversations/${o.conversation_id}`, className: "up-conv", children: [_jsx("span", { className: "up-conv-time", children: o.time || '—' }), _jsxs("span", { className: "up-conv-main", children: [_jsxs("span", { className: "up-conv-topic", children: [_jsx("span", { className: "ellipsis", translate: "no", children: o.items.length ? o.items.join(', ') : (isCafe ? L('Заказ', 'Order') : L('Покупка', 'Purchase')) }), o.check_total != null && _jsx("span", { className: "up-check", children: rub(o.check_total) })] }), _jsxs("span", { className: "up-conv-rules", translate: "no", children: [o.offers.filter((x) => x.technique !== 'generic').length === 0 && (_jsxs("span", { className: "up-chip is-none", children: [_jsx(Minus, { size: 11, strokeWidth: 3, "aria-hidden": "true" }), L('ничего не предложили', 'nothing offered')] })), o.offers.map((x, i) => (_jsxs("span", { className: `up-chip is-${x.technique === 'generic' ? 'generic' : x.response}`, title: `${RESPONSE[x.response] ? L(...RESPONSE[x.response]) : ''} · ${techniqueLabel(x.technique)}`, children: [x.response === 'accepted' ? _jsx(Check, { size: 11, strokeWidth: 3, "aria-hidden": "true" }) : x.response === 'declined' ? _jsx(X, { size: 11, strokeWidth: 3, "aria-hidden": "true" }) : null, x.technique === 'generic' ? L('«что-нибудь ещё?»', '“anything else?”') : x.item] }, i)))] }), o.better_phrase && (_jsxs("span", { className: "up-better", children: [_jsx(MessageSquareQuote, { size: 13, "aria-hidden": "true" }), L('Можно было: ', 'Could say: '), _jsx("span", { translate: "no", children: quoted(o.better_phrase) })] }))] })] }) }, o.conversation_id))) }), orders.length > shown.length && (_jsxs("button", { type: "button", className: "btn btn-ghost btn-sm up-more", onClick: () => setAll(true), children: [L(`Показать все ${orders.length}`, `Show all ${orders.length}`), _jsx(ArrowRight, { size: 14, "aria-hidden": "true" })] }))] }))] }));
}
function PlanDrawer({ open, onClose, stores, storeFilter }) {
    const user = useAuthStore((s) => s.user);
    const terms = useTerms();
    const queryClient = useQueryClient();
    const canOrg = user?.role === 'director' || user?.role === 'admin';
    const [scope, setScope] = useState(canOrg ? 'org' : 'store');
    const [storeId, setStoreId] = useState(storeFilter || user?.store_id || '');
    const [sellerId, setSellerId] = useState('');
    const [rate, setRate] = useState('');
    const [accepted, setAccepted] = useState('');
    const [focus, setFocus] = useState('');
    const [error, setError] = useState('');
    const { data: plans } = useQuery({ queryKey: ['upsell-plans'], queryFn: () => upsellsApi.getPlans(), enabled: open });
    // Все сотрудники сети — для подписей в списке планов; в выборе — только выбранного магазина
    const { data: roster } = useQuery({
        queryKey: ['admin-sellers', 'all', 'active'],
        queryFn: () => adminApi.getSellers({ is_active: true, limit: 200 }),
        enabled: open,
        staleTime: 5 * 60000,
    });
    const storeSellers = (roster?.items || []).filter((s) => s.store_id === storeId);
    const sellerName = (id) => {
        const s = (roster?.items || []).find((x) => x.id === id);
        return s ? `${s.first_name} ${s.last_name}` : L('Сотрудник', 'Employee');
    };
    const storeName = (id) => stores.find((s) => s.id === id)?.name ?? t(terms.store);
    const current = (plans?.items || []).find((p) => scope === 'org' ? !p.store_id && !p.seller_id
        : scope === 'store' ? p.store_id === storeId && !p.seller_id
            : !!sellerId && p.seller_id === sellerId);
    // Форма показывает план выбранного уровня, если он уже задан
    useEffect(() => {
        setError('');
        setRate(current?.attempt_rate_target != null ? String(Math.round(current.attempt_rate_target * 100)) : '');
        setAccepted(current?.accepted_per_shift != null ? String(current.accepted_per_shift) : '');
        setFocus((current?.focus_items || []).join(', '));
    }, [current?.id, scope, storeId, sellerId, open]);
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['upsell-plans'] });
        queryClient.invalidateQueries({ queryKey: ['upsell-overview'] });
        queryClient.invalidateQueries({ queryKey: ['upsell-shift'] });
    };
    const save = useMutation({
        mutationFn: () => {
            const r = rate.trim() === '' ? null : Number(rate) / 100;
            const a = accepted.trim() === '' ? null : Number(accepted);
            if (r != null && (Number.isNaN(r) || r < 0 || r > 1))
                throw new Error(L(`Доля ${W().ordersGen} — от 0 до 100 %`, 'The share must be between 0 and 100%'));
            if (a != null && (Number.isNaN(a) || a < 0 || !Number.isInteger(a)))
                throw new Error(L('Принятые за смену — целое число', 'Accepted per shift must be a whole number'));
            return upsellsApi.savePlan({
                store_id: scope === 'store' ? storeId : null,
                seller_id: scope === 'seller' ? sellerId : null,
                attempt_rate_target: r,
                accepted_per_shift: a,
                focus_items: focus.split(',').map((x) => x.trim()).filter(Boolean),
            });
        },
        onSuccess: () => { setError(''); invalidate(); },
        onError: (e) => setError(e?.response?.data?.detail || e?.message || L('Не удалось сохранить план', 'Could not save the plan')),
    });
    const remove = useMutation({
        mutationFn: (id) => upsellsApi.deletePlan(id),
        onSuccess: invalidate,
        onError: (e) => setError(e?.response?.data?.detail || L('Не удалось удалить план', 'Could not remove the plan')),
    });
    // Пустой план ничего не задаёт — чтобы снять план, есть «Удалить»
    const filled = rate.trim() !== '' || accepted.trim() !== '' || focus.trim() !== '';
    const ready = filled && (scope === 'org' || (scope === 'store' && !!storeId) || (scope === 'seller' && !!sellerId));
    const defaultRate = Math.round((plans?.default_attempt_rate_target ?? DEFAULT_TARGET) * 100);
    return (_jsx(Drawer, { isOpen: open, onClose: onClose, title: L('План смены', 'Shift plan'), children: _jsxs("div", { className: "plan-form", children: [_jsx("p", { className: "plan-intro", children: L(`План задаётся для всей сети, ${terms.storeForms[1]} или ${terms.offersFirst ? terms.sellerGen : 'сотрудника'} — действует самый частный. Без плана цель — предложение в ${defaultRate} % ${W().ordersGen}. Сотрудник видит план во вкладке «Моя смена» приложения сотрудника.`, `Set a plan for the whole network, a store or an employee — the most specific one applies. Without a plan the goal is an offer in ${defaultRate}% of orders. Employees see it in the “My shift” tab of the mobile recorder.`) }), _jsxs("div", { className: "seg", role: "group", "aria-label": L('Для кого', 'Applies to'), children: [canOrg && _jsx("button", { type: "button", "aria-pressed": scope === 'org', onClick: () => setScope('org'), children: L('Вся сеть', 'Network') }), _jsx("button", { type: "button", "aria-pressed": scope === 'store', onClick: () => setScope('store'), children: t(terms.store) }), _jsx("button", { type: "button", "aria-pressed": scope === 'seller', onClick: () => setScope('seller'), children: terms.offersFirst ? t(terms.seller) : L('Сотрудник', 'Employee') })] }), scope !== 'org' && (_jsxs("label", { className: "form-group", children: [_jsx("span", { className: "form-label", children: t(terms.store) }), _jsxs("select", { className: "form-input", value: storeId, onChange: (e) => { setStoreId(e.target.value); setSellerId(''); }, children: [_jsx("option", { value: "", children: t(terms.storeChoose) }), stores.map((s) => _jsx("option", { value: s.id, translate: "no", children: s.name }, s.id))] })] })), scope === 'seller' && (_jsxs("label", { className: "form-group", children: [_jsx("span", { className: "form-label", children: L('Сотрудник', 'Employee') }), _jsxs("select", { className: "form-input", value: sellerId, onChange: (e) => setSellerId(e.target.value), disabled: !storeId, children: [_jsx("option", { value: "", children: L('Выберите сотрудника', 'Choose an employee') }), storeSellers.map((s) => _jsxs("option", { value: s.id, translate: "no", children: [s.first_name, " ", s.last_name] }, s.id))] })] })), _jsxs("label", { className: "form-group", children: [_jsx("span", { className: "form-label", children: L(`${W().ordersGen[0].toUpperCase() + W().ordersGen.slice(1)} с предложением, %`, 'Orders with an offer, %') }), _jsx("input", { className: "form-input", type: "number", inputMode: "numeric", min: 0, max: 100, placeholder: String(defaultRate), value: rate, onChange: (e) => setRate(e.target.value) }), _jsx("span", { className: "form-hint", children: L('Пусто — действует план уровнем выше', 'Empty — the plan one level up applies') })] }), _jsxs("label", { className: "form-group", children: [_jsx("span", { className: "form-label", children: L('Принятых допродаж за смену', 'Accepted add-ons per shift') }), _jsx("input", { className: "form-input", type: "number", inputMode: "numeric", min: 0, placeholder: L('не задано', 'not set'), value: accepted, onChange: (e) => setAccepted(e.target.value) })] }), _jsxs("label", { className: "form-group", children: [_jsx("span", { className: "form-label", children: L('Товар дня', 'Item of the day') }), _jsx("input", { className: "form-input", type: "text", placeholder: L('Например: тыквенный латте, круассан', 'E.g. pumpkin latte, croissant'), value: focus, onChange: (e) => setFocus(e.target.value) }), _jsx("span", { className: "form-hint", children: L('Через запятую, до 10 позиций. Анализ отмечает, предлагали ли его.', 'Comma-separated, up to 10. The analysis marks whether it was offered.') })] }), error && _jsx("p", { className: "plan-error", role: "alert", children: error }), _jsxs("div", { className: "plan-actions", children: [_jsx("button", { type: "button", className: "btn btn-primary", disabled: !ready || save.isPending, onClick: () => save.mutate(), children: save.isPending ? L('Сохраняем…', 'Saving…') : L('Сохранить план', 'Save plan') }), current && (_jsxs("button", { type: "button", className: "btn btn-ghost", disabled: remove.isPending, onClick: () => remove.mutate(current.id), children: [_jsx(Trash2, { size: 15, "aria-hidden": "true" }), L('Удалить', 'Remove')] })), save.isSuccess && !save.isPending && !error && _jsxs("span", { className: "plan-saved", children: [_jsx(Check, { size: 14, "aria-hidden": "true" }), L('Сохранено', 'Saved')] })] }), (plans?.items || []).length > 0 && (_jsxs("div", { className: "plan-list", children: [_jsx("h3", { children: L('Заданные планы', 'Plans set') }), _jsx("ul", { children: (plans?.items || []).map((p) => (_jsxs("li", { children: [_jsx("span", { className: "plan-scope", translate: "no", children: p.seller_id ? sellerName(p.seller_id) : p.store_id ? storeName(p.store_id) : L('Вся сеть', 'Network') }), _jsx("span", { className: "plan-vals", children: [
                                            p.attempt_rate_target != null ? L(`${Math.round(p.attempt_rate_target * 100)} % ${W().ordersGen}`, `${Math.round(p.attempt_rate_target * 100)}% of orders`) : null,
                                            p.accepted_per_shift != null ? L(`${p.accepted_per_shift} за смену`, `${p.accepted_per_shift} per shift`) : null,
                                            p.focus_items.length ? p.focus_items.join(', ') : null,
                                        ].filter(Boolean).join(' · ') || '—' })] }, p.id))) })] }))] }) }));
}

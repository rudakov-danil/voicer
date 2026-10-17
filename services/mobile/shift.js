// «Моя смена»: план и прогресс по допродажам, серия, советы по своим разговорам, лента заказов.
// Данные сервера выводятся только через textContent — никакого innerHTML.
import {request, session} from './api.js';
import {withoutPrices} from './content.js';

const TECHNIQUE = {generic:'«Что-нибудь ещё?»', specific:'Конкретный товар', choice:'Выбор из двух', benefit:'С аргументом', promo:'Акция или комбо'};
const REFRESH_MS = 2 * 60 * 1000;
let ctx, timer, loading = false;

const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const localDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
function bar(value, target, tone) {
  const wrap = el('div', 'bar');
  const fill = el('i', tone ? `tone-${tone}` : '');
  fill.style.width = `${Math.min(100, Math.max(0, (value || 0) * 100))}%`;
  wrap.append(fill);
  if (target != null) {
    const mark = el('b'); mark.style.left = `${Math.min(100, target * 100)}%`; mark.title = `План ${pct(target)}`;
    wrap.append(mark);
  }
  return wrap;
}
function kpi(value, label, hint) {
  const tile = el('div', 'kpi');
  tile.append(el('span', 'kpi-value', value), el('span', 'kpi-label', label));
  if (hint) tile.append(el('span', 'kpi-hint', hint));
  return tile;
}

function planCard(data) {
  const {progress, today, week, team} = data;
  const card = el('div', 'card plan-card');
  card.append(el('p', 'eyebrow', 'ПЛАН СМЕНЫ'));
  const met = progress.attempt_rate_met && (!progress.accepted_target || progress.accepted >= progress.accepted_target);
  const head = el('div', 'plan-main');
  head.append(el('span', 'plan-value', pct(progress.attempt_rate)), el('span', 'plan-caption', 'заказов с предложением'));
  card.append(head, bar(progress.attempt_rate, progress.attempt_rate_target, met ? 'good' : 'warn'));
  let note;
  if (!today.orders) note = `Цель — предложение в ${pct(progress.attempt_rate_target)} заказов. Первые заказы появятся после разбора записи.`;
  else if (progress.attempt_rate_met) note = met ? `План ${pct(progress.attempt_rate_target)} выполнен. Держите темп!` : `Доля предложений достигла ${pct(progress.attempt_rate_target)}. Цель по принятым допродажам ещё впереди.`;
  else if (progress.attempt_rate_target >= 1) note = 'Цель — предложение в каждом заказе. Предлагайте каждому следующему гостю.';
  else {
    // Сколько заказов подряд с предложением нужно, чтобы доля дошла до плана: (w + n) / (o + n) ≥ t
    const t = progress.attempt_rate_target;
    const need = Math.max(1, Math.ceil((t * today.orders - today.with_offer) / (1 - t) - 1e-9));
    note = `До плана ${pct(t)}: предложите в ${need} ${plural(need, 'заказе', 'заказах', 'заказах')} подряд.`;
  }
  card.append(el('p', 'small muted plan-note', note));
  if (progress.accepted_target) {
    const row = el('div', 'plan-second');
    row.append(el('span', '', `Принятые допродажи: ${progress.accepted} из ${progress.accepted_target}`));
    card.append(row, bar(progress.accepted_pct, null, progress.accepted >= progress.accepted_target ? 'good' : ''));
  }
  const compare = [];
  if (week.attempt_rate != null && today.orders) {
    const diff = Math.round(((progress.attempt_rate || 0) - week.attempt_rate) * 100);
    compare.push(diff === 0 ? 'как обычно за неделю' : `${diff > 0 ? '+' : ''}${diff} п. к прошлой неделе`);
  }

  if (compare.length) card.append(el('p', 'small plan-compare', compare.join(' · ')));
  return card;
}

function kpiGrid(today) {
  const grid = el('div', 'kpis');
  grid.append(
    kpi(String(today.orders), plural(today.orders, 'заказ', 'заказа', 'заказов'), today.pending_recordings ? `ещё ${today.pending_recordings} в разборе` : null),
    kpi(String(today.with_offer), 'с предложением'),
    kpi(String(today.accepted), 'гости согласились', today.offers ? `из ${today.offers} ${plural(today.offers, 'предложения', 'предложений', 'предложений')}` : null),
    kpi(pct(today.acceptance_rate), 'конверсия предложений'),
  );
  return [grid];
}

function streakRow(streak) {
  if (!streak.best) return null;
  const row = el('div', 'streak');
  const fire = streak.current >= 3;
  const text = streak.current
    ? `Серия: ${streak.current} ${plural(streak.current, 'заказ', 'заказа', 'заказов')} подряд с предложением`
    : 'Серия прервалась — начните новую';
  row.append(el('span', fire ? 'streak-chip hot' : 'streak-chip',
    streak.best > streak.current ? `${text} · рекорд ${streak.best}` : text));
  return row;
}

function focusCard(focus) {
  if (!focus.items?.length) return null;
  const card = el('div', 'card focus-card');
  const items = focus.items.map(withoutPrices).filter(Boolean);
  if (!items.length) return null;
  card.append(el('p', 'eyebrow', 'ТОВАР ДНЯ'), el('p', 'focus-items', items.join(', ')));
  card.append(el('p', 'small muted', focus.offered
    ? `Предложено ${focus.offered} ${plural(focus.offered, 'раз', 'раза', 'раз')}, согласились ${focus.accepted}`
    : 'Сегодня ещё не предлагали — начните со следующего гостя'));
  return card;
}

function tipsCard() {
  const card = el('div', 'card tips-card'); card.id = 'tips-card';
  card.append(el('p', 'eyebrow', 'СОВЕТЫ ПО ВАШИМ РАЗГОВОРАМ'), el('p', 'small muted', 'Готовим советы…'));
  return card;
}
function fillTips(card, result) {
  card.replaceChildren(el('p', 'eyebrow', result.period === 'week' ? 'СОВЕТЫ ПО РАЗГОВОРАМ ЗА НЕДЕЛЮ' : 'СОВЕТЫ ПО ВАШИМ РАЗГОВОРАМ'));
  const tips = result.tips;
  if (!tips) { card.append(el('p', 'small muted', 'Советы появятся после первых разобранных заказов.')); return; }
  const focus = withoutPrices(tips.focus), praise = withoutPrices(tips.praise);
  if (focus) card.append(el('p', 'tips-focus', focus));
  if (praise) card.append(el('p', 'tips-praise', praise));
  for (const tip of tips.tips || []) {
    const title = withoutPrices(tip.title), text = withoutPrices(tip.text), phrase = withoutPrices(tip.phrase);
    if (!text && !phrase) continue;
    const item = el('div', 'tip');
    if (title) item.append(el('p', 'tip-title', title));
    if (text) item.append(el('p', 'tip-text', text));
    if (phrase) item.append(el('p', 'tip-phrase', `«${phrase.replace(/^[«"]|[»"]$/g, '')}»`));
    card.append(item);
  }
  if (card.childElementCount === 1) card.append(el('p', 'small muted', 'Пока нет советов по предложению товаров. Они появятся после следующих разобранных разговоров.'));
}

function bestCard(best) {
  if (!best || !withoutPrices(best.quote)) return null;
  const card = el('div', 'card best-card');
  card.append(el('p', 'eyebrow', 'ЛУЧШАЯ ФРАЗА СМЕНЫ'), el('p', 'best-quote', `«${best.quote}»`));
  const customerQuote = withoutPrices(best.customer_quote);
  card.append(el('p', 'small muted', [withoutPrices(best.item), TECHNIQUE[best.technique], customerQuote ? `гость: «${customerQuote}»` : null].filter(Boolean).join(' · ')));
  return card;
}

function orderItem(order) {
  const item = el('article', 'order');
  const head = el('div', 'order-head');
  head.append(el('span', 'order-time', order.time || ''), el('span', 'order-items', order.items.map(withoutPrices).filter(Boolean).join(', ') || 'Заказ'));
  item.append(head);
  if (!order.offers.length) {
    item.append(el('p', 'offer none', 'Без предложения'));
  }
  for (const offer of order.offers) {
    const label = offer.response === 'accepted' ? 'Взяли' : offer.response === 'declined' ? 'Отказ' : 'Без ответа';
    const line = el('p', `offer ${offer.response}`);
    line.append(el('span', 'offer-state', label), el('span', '', ` ${withoutPrices(offer.item) || 'Предложение'}`));
    if (offer.is_focus) line.append(el('span', 'offer-tag', 'товар дня'));
    if (offer.technique === 'generic') line.append(el('span', 'offer-tag weak', 'общий вопрос'));
    item.append(line);
    if (withoutPrices(offer.quote)) item.append(el('p', 'offer-quote', `«${offer.quote}»`));
  }
  if (withoutPrices(order.missed)) {
    const missed = el('p', 'order-missed');
    missed.append(el('b', '', 'Упущено: '), document.createTextNode(order.missed));
    item.append(missed);
  }
  if (withoutPrices(order.better_phrase)) item.append(el('p', 'order-phrase', `Попробуйте: «${order.better_phrase.replace(/^[«"]|[»"]$/g, '')}»`));
  return item;
}

function render(data, {stale} = {}) {
  const root = ctx.root; root.replaceChildren();
  const sub = el('div', 'shift-head');
  const who = `${data.seller.first_name} ${data.seller.last_name}`.trim();
  sub.append(el('p', 'small muted', [who, data.seller.store_name, stale ? `сохранено ${stale}` : null].filter(Boolean).join(' · ')));
  const refresh = el('button', 'text-button', 'Обновить'); refresh.type = 'button';
  refresh.addEventListener('click', () => load());
  sub.append(refresh); root.append(sub);
  if(data.is_demo) root.append(el("p","demo-notice","Демо-данные Coffee Shop · смены и начисления вымышлены"));

  const coins=el('button','coins-preview');coins.type='button';coins.append(el('b','','Мои монеты ◉'),el('span','','Баланс и начисления →'));coins.addEventListener('click',() => document.getElementById('tab-coins-button').click());
  root.append(coins,planCard(data), ...kpiGrid(data.today));
  if(data.today.orders > 0 && data.today.orders < 10) root.append(el('p','small muted','Пока мало заказов для устойчивых выводов. Прогресс обновляется по мере разбора смены.'));
  for (const node of [streakRow(data.streak), focusCard(data.focus)]) if (node) root.append(node);
  const tips = tipsCard(); root.append(tips);
  const best = bestCard(data.best_phrase); if (best) root.append(best);

  const section = el('section', 'orders-section');
  const heading = el('div', 'section-heading'); heading.append(el('h2', '', 'Заказы за смену'));
  section.append(heading);
  if (!data.orders.length) section.append(el('div', 'empty', data.today.pending_recordings ? 'Записи разбираются — заказы появятся здесь через несколько минут' : 'Пока нет разобранных заказов. Запишите смену во вкладке «Запись».'));
  for (const order of data.orders) section.append(orderItem(order));
  root.append(section);
  return tips;
}

// Сервер пересчитывает советы сам, когда появились новые разговоры; иначе отдаёт кэш
async function loadTips(card, sellerId, day) {
  try {
    const result = await request(`/api/v1/analytics/sellers/${sellerId}/tips?day=${day}&audience=employee`, {method:'POST',timeoutMs:120000});
    if (ctx.sellerId() !== sellerId) return;
    fillTips(card, result);
  } catch {
    if (ctx.sellerId() === sellerId) card.replaceChildren(el('p', 'eyebrow', 'СОВЕТЫ ПО ВАШИМ РАЗГОВОРАМ'), el('p', 'small muted', 'Советы сейчас недоступны. Обновите позже.'));
  }
}

export async function load() {
  if (!ctx || loading || ctx.root.hidden) return;
  const sellerId = ctx.sellerId();
  if (!sellerId) { ctx.root.replaceChildren(el('div', 'empty', 'Выберите себя в списке «Сотрудник» выше.')); return; }
  const day = localDay(new Date());
  const cacheKey = `voicer-shift:${session?.user.organization_id}:${session?.user.id}:${sellerId}:${day}`;
  loading = true;
  try {
    const data = await request(`/api/v1/dashboard/sellers/${sellerId}/shift?day=${day}`);
    if (ctx.sellerId() !== sellerId) return;
    try { localStorage.setItem(cacheKey, JSON.stringify({at: Date.now(), data})); } catch {}
    const tips = render(data);
    request(`/api/v1/dashboard/coins/sellers/${sellerId}?day=${day}`).then(coins=>{
      if(ctx.sellerId()!==sellerId || ctx.root.hidden)return;
      const button=ctx.root.querySelector('.coins-preview');
      if(button){button.firstChild.textContent=`${coins.balance.toLocaleString('ru-RU')} монет ◉`;button.lastChild.textContent=coins.pending ? `${coins.pending} на подтверждении →` : 'Баланс и начисления →';}
    }).catch(()=>{});
    if (data.today.orders) loadTips(tips, sellerId, day);
    else fillTips(tips, {tips:null});
  } catch (error) {
    let cached; try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch {}
    if (cached && ctx.sellerId() === sellerId) {
      const tips = render(cached.data, {stale: new Date(cached.at).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})});
      tips.replaceChildren(el('p', 'eyebrow', 'СОВЕТЫ ПО ВАШИМ РАЗГОВОРАМ'), el('p', 'small muted', 'Нет связи — советы обновятся, когда появится сеть.'));
    } else {
      ctx.root.replaceChildren(el('div', 'empty', error.status === 404 ? 'Нет доступа к данным этого сотрудника.' : 'Не удалось загрузить смену. Проверьте связь.'));
      const retry=el('button','text-button','Обновить');retry.type='button';retry.addEventListener('click',()=>load());ctx.root.append(retry);
    }
  } finally { loading = false; }
}

export function initShift({root, sellerId}) {
  ctx = {root, sellerId};
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
}
export function showShift(visible) {
  clearInterval(timer);
  if (visible) { load(); timer = setInterval(() => load(), REFRESH_MS); }
}

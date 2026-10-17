// «Протокол» (режим врача клиники): приёмы за день, черновик протокола от ИИ, правка и подтверждение.
// Данные сервера выводятся только через textContent — никакого innerHTML.
import {request, session} from './api.js';

const REFRESH_MS = 30 * 1000;
let ctx, timer, loading = false, data = null, day = null, openId = null, editing = false;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const button = (cls, text, onClick) => {
  const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onClick); return b;
};
const localDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const owner = () => session ? `${session.user.organization_id}:${session.user.id}` : 'none';
const draftKey = id => `voicer-protocol-edit:${owner()}:${id}`;
const minutes = sec => sec ? `${Math.max(1, Math.round(sec / 60))} мин` : '';
const shiftDay = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d); };
function dayLabel(iso) {
  const today = localDay(new Date());
  if (iso === today) return 'Сегодня';
  if (iso === shiftDay(today, -1)) return 'Вчера';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', weekday: 'short'});
}
function message(text) {
  const box = document.getElementById('message');
  if (!box) return;
  box.textContent = text; box.hidden = false;
  setTimeout(() => { box.hidden = true; }, 8000);
}

// Стадия приёма словами — врачу важно, можно ли уже проверять протокол
function stageText(item) {
  const p = item.protocol;
  if (item.stage === 'processing') return ['Составляем протокол…', 'wait'];
  if (item.stage === 'failed') return ['Запись не обработана — сообщите руководителю', 'bad'];
  if (item.stage === 'non_visit') return ['Не похоже на приём пациента', 'muted'];
  if (!p || item.stage === 'no_protocol' || p.status === 'failed') return ['Протокол не составлен', 'bad'];
  if (p.status === 'confirmed') {
    const at = p.confirmed_at ? new Date(p.confirmed_at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : '';
    return [`Подтверждён${at ? ` в ${at}` : ''}`, 'good'];
  }
  return ['Черновик — проверьте и подтвердите', 'draft'];
}
const current = item => item.protocol ? (item.protocol.final || item.protocol.draft || {}) : {};

function textOf(item) {
  const p = current(item);
  const head = ['Протокол приёма', dayLabel(data.day), item.time, data.doctor.name, data.doctor.specialty].filter(Boolean).join(' · ');
  const body = data.fields.filter(([k]) => p[k]).map(([k, label]) => `${label}: ${p[k]}`).join('\n\n');
  return `${head}\n\n${body}`;
}

async function copy(item) {
  const text = textOf(item);
  try { await navigator.clipboard.writeText(text); message('Протокол скопирован — вставьте его в медкарту.'); }
  catch {
    // Без доступа к буферу: показываем текст, чтобы скопировать вручную
    const area = el('textarea', 'proto-copy'); area.value = text; area.readOnly = true;
    ctx.root.querySelector('.proto-detail')?.append(area); area.focus(); area.select();
    message('Выделите текст ниже и скопируйте его.');
  }
}

function renderList() {
  const root = ctx.root; root.replaceChildren();
  const head = el('div', 'proto-head');
  const prev = button('day-step', '‹', () => { day = shiftDay(day, -1); openId = null; load(); });
  prev.setAttribute('aria-label', 'Предыдущий день');
  const next = button('day-step', '›', () => { day = shiftDay(day, 1); openId = null; load(); });
  next.setAttribute('aria-label', 'Следующий день');
  next.disabled = day >= localDay(new Date());
  const title = el('div', 'proto-day');
  title.append(el('b', '', dayLabel(day)), el('span', 'small muted', [data?.doctor?.name, data?.doctor?.store_name].filter(Boolean).join(' · ')));
  head.append(prev, title, next);
  root.append(head);
  if (!data) { root.append(el('div', 'empty', 'Загружаем приёмы…')); return; }
  if (data.is_demo) root.append(el('p', 'demo-notice', 'Демо-данные клиники «Береке» · приёмы и пациенты вымышлены'));
  const ready = data.items.filter(i => i.stage === 'ready');
  const drafts = ready.filter(i => i.protocol?.status !== 'confirmed').length;
  if (data.items.length) root.append(el('p', 'small muted proto-summary', `Приёмов: ${data.items.length}${drafts ? ` · ждут проверки: ${drafts}` : ready.length ? ' · все протоколы подтверждены' : ''}`));
  if (!data.items.length) {
    root.append(el('div', 'empty', day === localDay(new Date()) ? 'Сегодня приёмов ещё нет. Запишите приём во вкладке «Запись» — протокол появится здесь через несколько минут.' : 'В этот день приёмов нет.'));
  }
  for (const item of data.items) {
    const card = el('button', 'proto-item'); card.type = 'button';
    const [label, tone] = stageText(item);
    const top = el('span', 'proto-item-top');
    top.append(el('b', 'proto-time', item.time || ''), el('span', 'small muted', minutes(item.duration_sec)));
    card.append(top, el('span', 'proto-reason', item.reason || (item.stage === 'processing' ? 'Новый приём' : 'Приём')), el('span', `proto-chip ${tone}`, label));
    card.disabled = item.stage !== 'ready';
    card.addEventListener('click', () => { openId = item.recording_id; editing = false; render(); window.scrollTo({top: 0}); });
    root.append(card);
  }
  const refresh = button('text-button', 'Обновить', () => load());
  root.append(refresh);
}

function renderDetail(item) {
  const root = ctx.root; root.replaceChildren();
  const wrap = el('section', 'proto-detail');
  wrap.append(button('text-button proto-back', '‹ Все приёмы', () => { openId = null; editing = false; render(); }));
  wrap.append(el('h2', 'proto-title', item.reason || 'Приём'));
  const [label, tone] = stageText(item);
  const meta = el('p', 'small muted', [dayLabel(data.day), item.time, minutes(item.duration_sec)].filter(Boolean).join(' · '));
  wrap.append(meta, el('span', `proto-chip ${tone}`, label));
  wrap.append(el('p', 'notice proto-note', 'Черновик составлен ИИ только по тому, что прозвучало на приёме. Проверьте каждый раздел перед переносом в медкарту.'));
  const saved = (() => { try { return JSON.parse(localStorage.getItem(draftKey(item.recording_id)) || 'null'); } catch { return null; } })();
  const values = {...current(item), ...(editing && saved ? saved : {})};
  if (saved && !editing) wrap.append(el('p', 'small proto-unsaved', 'На телефоне есть неотправленные правки — нажмите «Править», чтобы продолжить.'));
  const form = el('div', 'proto-sections');
  for (const [key, title] of data.fields) {
    const value = values[key];
    if (!editing && !value) continue;
    const row = el('div', 'proto-section');
    row.append(el('p', 'proto-label', title));
    if (editing) {
      const area = el('textarea', 'proto-input'); area.name = key; area.value = value || ''; area.rows = Math.min(8, Math.max(2, Math.ceil((value || '').length / 38)));
      area.setAttribute('aria-label', title);
      area.addEventListener('input', () => {
        const all = Object.fromEntries([...form.querySelectorAll('textarea')].map(a => [a.name, a.value]));
        try { localStorage.setItem(draftKey(item.recording_id), JSON.stringify(all)); } catch {}
      });
      row.append(area);
    } else {
      row.append(el('p', 'proto-text', value));
    }
    form.append(row);
  }
  if (!editing && !form.childElementCount) form.append(el('p', 'small muted', 'Протокол пуст — нажмите «Править» и заполните разделы.'));
  wrap.append(form);

  const actions = el('div', 'proto-actions');
  if (editing) {
    const collect = () => Object.fromEntries([...form.querySelectorAll('textarea')].map(a => [a.name, a.value.trim() || null]));
    actions.append(
      button('primary', 'Сохранить и подтвердить', () => save(item, collect(), true)),
      button('secondary', 'Сохранить без подтверждения', () => save(item, collect(), false)),
      button('text-button', 'Отменить правки', () => {
        if (!confirm('Отменить правки? Изменения, которые не сохранены, пропадут.')) return;
        try { localStorage.removeItem(draftKey(item.recording_id)); } catch {}
        editing = false; render();
      }));
  } else {
    if (item.protocol?.status !== 'confirmed') actions.append(button('primary', 'Подтвердить протокол', () => save(item, current(item), true)));
    actions.append(
      button('secondary', 'Править', () => { editing = true; render(); }),
      button('secondary', 'Скопировать для медкарты', () => copy(item)));
  }
  wrap.append(actions);
  if (item.protocol?.status === 'confirmed' && item.protocol.confirmed_by_name) {
    wrap.append(el('p', 'small muted', `Подтвердил: ${item.protocol.confirmed_by_name}`));
  }
  root.append(wrap);
}

async function save(item, protocol, confirmIt) {
  const sellerId = ctx.sellerId();
  if (!sellerId || ctx.root.querySelector('.proto-actions button:disabled')) return;
  ctx.root.querySelectorAll('.proto-actions button').forEach(b => { b.disabled = true; });
  try {
    const saved = await request(`/api/v1/dashboard/clinic/doctors/${sellerId}/protocols/${item.recording_id}`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({protocol, confirm: confirmIt}), timeoutMs: 30000,
    });
    item.protocol = saved;
    try { localStorage.removeItem(draftKey(item.recording_id)); } catch {}
    editing = false;
    message(confirmIt ? 'Протокол подтверждён.' : 'Правки сохранены. Протокол ждёт подтверждения.');
  } catch (error) {
    message(error.status === 422 ? (error.message || 'Пустой протокол нельзя подтвердить.') : 'Не удалось сохранить. Правки остались на телефоне — повторите, когда будет связь.');
  }
  render();
}

function render() {
  if (!ctx) return;
  const item = openId && data?.items.find(i => i.recording_id === openId);
  if (item && item.stage === 'ready') renderDetail(item); else { openId = null; renderList(); }
}

export async function load() {
  if (!ctx || loading || ctx.root.hidden || !session) return;
  const sellerId = ctx.sellerId();
  if (!sellerId) { ctx.root.replaceChildren(el('div', 'empty', 'Выберите врача в списке выше.')); return; }
  day = day || localDay(new Date());
  if (editing) return; // не сбиваем правку врача обновлением списка
  const cacheKey = `voicer-protocols:${owner()}:${sellerId}:${day}`;
  const requested = day;
  loading = true;
  try {
    const result = await request(`/api/v1/dashboard/clinic/doctors/${sellerId}/protocols?day=${day}`);
    if (ctx.sellerId() !== sellerId || requested !== day) return;
    data = result;
    try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
  } catch (error) {
    let cached; try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch {}
    if (cached && ctx.sellerId() === sellerId) { data = cached; message('Нет связи — показаны сохранённые на телефоне протоколы.'); }
    else { data = null; ctx.root.replaceChildren(el('div', 'empty', error.status === 404 ? 'Нет доступа к протоколам этого врача.' : 'Не удалось загрузить протоколы. Проверьте связь.'), button('text-button', 'Повторить', () => load())); return; }
  } finally { loading = false; }
  render();
}

export function initProtocol({root, sellerId}) {
  ctx = {root, sellerId};
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
}
export function showProtocol(visible) {
  clearInterval(timer);
  if (visible) { load(); timer = setInterval(() => { if (data?.items.some(i => i.stage === 'processing') || !data) load(); }, REFRESH_MS); }
}
export function resetProtocol() { data = null; openId = null; editing = false; day = null; }

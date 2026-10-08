/* Войсер · концепт — общий код: каркас, тема, ⌘K, отпечаток разговора, мини-графики, подсказки. */
(function () {
  'use strict';

  const V = (window.V = {});
  const NB = ' ';
  const SVGNS = 'http://www.w3.org/2000/svg';
  V.NB = NB;

  /* ---------- DOM ---------- */
  V.$ = (s, r = document) => r.querySelector(s);
  V.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  V.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  V.svg = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* ---------- Хранилище (в приватном режиме может быть недоступно) ---------- */
  V.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } },
  };

  /* ---------- Язык: ?lang=en или сохранённый выбор ---------- */
  const EN = window.VOICER_EN || null;
  const urlLang = new URLSearchParams(location.search).get('lang');
  if (urlLang === 'ru' || urlLang === 'en') V.store.set('voicer-lang', urlLang);
  V.lang = (urlLang || V.store.get('voicer-lang')) === 'en' && EN ? 'en' : 'ru';
  const IS_EN = V.lang === 'en';
  document.documentElement.lang = V.lang;
  if (IS_EN && window.VD) EN.patchData(window.VD);
  /* Пара «как по-русски, как по-английски» — для фраз с числами и именами */
  V.L = (ru, en) => (IS_EN ? en : ru);

  /* ---------- Форматирование: русская или английская типографика ---------- */
  V.int = (n) => (IS_EN ? Math.round(n).toLocaleString('en-US') : Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NB));
  V.dec = (n, d = 1) => (IS_EN ? n.toFixed(d) : n.toFixed(d).replace('.', ','));
  V.pct = (n, d = 1) => V.dec(n, d) + (IS_EN ? '%' : NB + '%');
  V.PCT = IS_EN ? '%' : NB + '%';
  V.PP = IS_EN ? ' pp' : NB + 'п.' + NB + 'п.';
  V.clock = (s) => {
    s = Math.max(0, Math.round(s));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  V.plural = (n, one, few, many) => {
    if (IS_EN) {
      const f = EN.plural[one];
      if (f) return n === 1 ? f[0] : f[1];
      return V.t(n === 1 ? one : many);
    }
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  V.first = (name) => name.split(' ')[0];

  /* ---------- Перевод интерфейса ----------
     Русский текст — источник. В английском режиме словарь подменяет строки при отрисовке,
     наблюдатель переводит всё, что появляется позже: тосты, подсказки, панели. */
  const norm = (x) => x.replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  const CYR = /[А-Яа-яЁё]/;
  V.t = (x) => {
    if (!IS_EN || x == null) return x;
    const k = norm(String(x));
    return EN.ui[k] != null ? EN.ui[k] : x;
  };
  function numFix(x) {
    return x
      .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
      .replace(/(\d)[\u00A0\u202F](\d{3})(?!\d)/g, '$1,$2')
      .replace(/(\d)[\u00A0\u202F](\d{3})(?!\d)/g, '$1,$2')
      .replace(/[\u00A0\u202F]%/g, '%')
      .replace(/[\u00A0 ]?п\.[\u00A0 ]?п\./g, ' pp');
  }
  function trText(raw) {
    const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2];
    if (!core) return raw;
    const k = norm(core);
    let out = EN.ui[k];
    if (out == null) {
      out = core;
      for (const [re, rp] of EN.patterns) if (re.test(k)) { out = k.replace(re, rp); break; }
    }
    out = numFix(out);
    /* «&nbsp;%» отдельным узлом: в английском знак процента пишется слитно */
    const lead = out.startsWith('%') ? m[1].replace(/[  ]+$/, '') : m[1];
    return lead + out + m[3];
  }
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  V.translate = (rootNode) => {
    if (!IS_EN || !rootNode) return;
    if (rootNode.nodeType === 3) {
      const v = rootNode.nodeValue;
      if (v && (CYR.test(v) || /\d[\u00A0\u202F]\d|\d,\d|\u00A0%/.test(v))) { const t = trText(v); if (t !== v) rootNode.nodeValue = t; }
      return;
    }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => V.translate(n));
    const els = rootNode.querySelectorAll ? [rootNode, ...rootNode.querySelectorAll('[placeholder],[aria-label],[title],[alt],[data-label]')] : [];
    els.forEach((el) => {
      if (!el.getAttribute) return;
      [...ATTRS, 'data-label'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && (CYR.test(v) || /\d,\d|\u00A0%/.test(v))) { const t = trText(v); if (t !== v) el.setAttribute(a, t); }
      });
    });
  };
  V.setLang = (l) => {
    V.store.set('voicer-lang', l);
    const u = new URL(location.href);
    u.searchParams.set('lang', l);
    location.replace(u.toString());
  };
  function startTranslator() {
    if (!IS_EN) return;
    document.title = trText(document.title);
    const md = document.querySelector('meta[name="description"]');
    if (md && EN.ui[norm(md.content)]) md.content = EN.ui[norm(md.content)];
    V.translate(document.body);
    new MutationObserver((list) => {
      list.forEach((m) => {
        if (m.type === 'childList') m.addedNodes.forEach((n) => V.translate(n));
        else if (m.type === 'attributes') V.translate(m.target.nodeType === 1 ? m.target : null);
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });
  }
  V.startTranslator = startTranslator;

  /* ---------- Тема ---------- */
  const root = document.documentElement;
  const urlTheme = new URLSearchParams(location.search).get('theme');
  const savedTheme = urlTheme || V.store.get('voicer-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
  V.isDark = () => root.dataset.theme === 'dark' ||
    (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  V.toggleTheme = () => {
    const next = V.isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    V.store.set('voicer-theme', next);
    V.$$('[data-theme-icon]').forEach(syncThemeButton);
    document.dispatchEvent(new CustomEvent('themechange'));
  };
  function syncThemeButton(btn) {
    const dark = V.isDark();
    btn.setAttribute('aria-label', V.t(dark ? 'Включить светлую тему' : 'Включить тёмную тему'));
    btn.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}" class="i"></i>`;
    V.icons();
  }

  /* ---------- Иконки ---------- */
  V.icons = () => {
    if (!window.lucide) return;
    window.lucide.createIcons();
    /* иконки декоративные: смысл несут подписи и aria-label */
    document.querySelectorAll('svg.lucide:not([aria-hidden])').forEach((s) => s.setAttribute('aria-hidden', 'true'));
  };

  /* ---------- Детерминированный генератор ---------- */
  V.rng = (seed) => {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- Реплики разговора: [начало, конец, кто: s — продавец, c — клиент] ----------
     В продукте это сегменты транскрипта с таймкодами; здесь — правдоподобная генерация.
     В торговом зале бывают долгие паузы: продавец идёт на склад, оформляет, проверяет товар. */
  V.segments = (seed, dur) => {
    const r = V.rng(seed + 7);
    const segs = [];
    let t = 0.5 + r() * 1.5;
    let who = 's';
    while (t < dur - 2) {
      const long = r() < 0.12 ? 2 : 1;
      const len = who === 's' ? 2.2 + r() * 16 * long : 1.2 + r() * 8 * long;
      const e = Math.min(dur - 0.5, t + len);
      segs.push([t, e, who]);
      let next = e + 0.3 + r() * 1.3;
      if (r() < 0.07) next += 6 + r() * 20; /* пауза: склад, касса */
      if (r() < 0.05) next = e - (0.3 + r() * 0.7); /* перебивание */
      t = next;
      who = r() < 0.15 ? who : (who === 's' ? 'c' : 's');
    }
    return segs;
  };
  V.segmentsFromLines = (lines) => lines.map((l) => [l.s, l.e, l.who]);

  /* ---------- Отпечаток разговора ----------
     Две дорожки: продавец над осью (кобальт), клиент под осью (серый).
     Сверху — метки: ▼ нарушение, ◆ возражение (контур — отработано), ● покупка или допродажа. */
  const MARK_LABEL = {
    crit: 'нарушение', 'crit-mid': 'нарушение средней важности', warn: 'возражение не отработано',
    'warn-ok': 'возражение отработано', ok: 'покупка или допродажа',
  };
  const EVENT_MARK = { objection: 'warn-ok', 'objection-open': 'warn', violation: 'crit', 'violation-mid': 'crit-mid', win: 'ok', upsell: 'ok' };
  V.eventMark = (k) => EVENT_MARK[k] || 'warn';

  V.fingerprint = (el, conv, opt = {}) => {
    const dur = conv.dur;
    const segs = conv.segs || V.segments(conv.seed || 1, dur);
    const w = Math.max(60, Math.round(opt.width || el.clientWidth || 180));
    const h = opt.height || 34;
    const markBand = opt.marks === false ? 0 : 8;
    const laneH = Math.floor((h - markBand - 2) / 2);
    const sTop = markBand;
    const axis = sTop + laneH + 1;
    const cTop = axis + 1;
    const x = (t) => (t / dur) * w;
    const marks = opt.marks === false ? [] : (conv.marks || []);

    const sTime = segs.filter((s) => s[2] === 's').reduce((a, s) => a + (s[1] - s[0]), 0);
    const cTime = segs.filter((s) => s[2] === 'c').reduce((a, s) => a + (s[1] - s[0]), 0);
    const share = Math.round((sTime / (sTime + cTime || 1)) * 100);
    const label = [V.L(`Разговор ${V.clock(dur)}`, `Conversation ${V.clock(dur)}`), V.L(`продавец говорит ${share}${NB}%`, `seller talks ${share}%`)];
    if (marks.length) label.push(marks.map((m) => V.t(MARK_LABEL[m.k])).join(', '));

    const svg = V.svg('svg', {
      viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'fp' + (opt.console ? ' fp-console' : ''),
      role: 'img', 'aria-label': label.join('; '), preserveAspectRatio: 'none',
    });
    V.svg('rect', { x: 0, y: axis, width: w, height: 1, class: 'fp-axis' }, svg);
    for (const [s, e, who] of segs) {
      const sw = Math.max(1.4, x(e) - x(s) - 0.6);
      V.svg('rect', {
        x: x(s).toFixed(2), y: who === 's' ? sTop : cTop, width: sw.toFixed(2), height: laneH,
        rx: Math.min(2, sw / 2), class: who === 's' ? 'fp-s' : 'fp-c',
      }, svg);
    }
    for (const m of marks) {
      const mx = Math.min(w - 4, Math.max(4, x(m.t * dur)));
      V.svg('rect', { x: mx - 0.5, y: markBand - 1, width: 1, height: h - markBand + 1, class: `fp-tick fp-${m.k}` }, svg);
      if (m.k === 'crit' || m.k === 'crit-mid') {
        V.svg('path', { d: `M${mx - 4},0.5 L${mx + 4},0.5 L${mx},6.5 Z`, class: `fp-mark fp-${m.k}` }, svg);
      } else if (m.k === 'ok') {
        V.svg('circle', { cx: mx, cy: 3.5, r: 3, class: 'fp-mark fp-ok' }, svg);
      } else {
        V.svg('path', { d: `M${mx},0.5 L${mx + 3.4},3.6 L${mx},6.7 L${mx - 3.4},3.6 Z`, class: `fp-mark fp-${m.k}` }, svg);
      }
    }
    el.replaceChildren(svg);
    return svg;
  };

  /* Найти разговор по id в демо-данных */
  V.findConv = (id) => {
    const D = window.VD;
    if (!D) return null;
    const f = D.featured;
    if (id === f.id) {
      return { dur: f.dur, segs: V.segmentsFromLines(f.lines), marks: f.events.map((e) => ({ t: e.t / f.dur, k: V.eventMark(e.k) })) };
    }
    const c = D.convs.find((x) => x.id === id);
    return c ? { dur: c.dur, seed: c.seed, marks: c.marks || [] } : null;
  };
  /* Отрисовать все [data-fp] */
  V.renderFingerprints = (scope = document) => {
    V.$$('[data-fp]', scope).forEach((el) => {
      const conv = V.findConv(el.dataset.fp);
      if (!conv) return;
      V.fingerprint(el, conv, { height: +(el.dataset.h || 34), marks: el.dataset.marks !== 'off', console: el.dataset.console === 'on' });
    });
  };

  /* ---------- Спарклайн: история серым, текущая точка — акцентом ---------- */
  V.spark = (el, values, opt = {}) => {
    const w = opt.width || el.clientWidth || 96;
    const h = opt.height || el.clientHeight || 32;
    const pad = 4;
    const vals = values.filter(Boolean);
    if (vals.length < 2) { el.replaceChildren(); return; }
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const X = (i) => pad + (i / (values.length - 1)) * (w - pad * 2);
    const Y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
    const svg = V.svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true', class: 'spark' });
    let d = '', pen = false;
    values.forEach((v, i) => {
      if (!v) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    V.svg('path', { d, class: 'spark-line' }, svg);
    const n = values.length - 1;
    if (values[n] && values[n - 1]) V.svg('path', { d: `M${X(n - 1)},${Y(values[n - 1])}L${X(n)},${Y(values[n])}`, class: 'spark-now' }, svg);
    if (values[n]) V.svg('circle', { cx: X(n), cy: Y(values[n]), r: 3, class: 'spark-dot' }, svg);
    el.replaceChildren(svg);
  };

  /* ---------- Мелкие компоненты (данные доверенные — демо) ---------- */
  V.meter = (score) => {
    if (score == null) return `<span class="meter is-na" title="Нет оценки"><span class="meter-val">—</span></span>`;
    const on = Math.round(score / 10);
    const cls = score < 60 ? 'is-low' : score < 80 ? 'is-mid' : '';
    let segs = '';
    for (let i = 0; i < 10; i++) segs += `<i class="${i < on ? 'on' : ''}"></i>`;
    return `<span class="meter ${cls}" role="img" aria-label="${V.L(`Балл ${score} из 100`, `Score ${score} of 100`)}"><span class="meter-track" aria-hidden="true">${segs}</span><span class="meter-val">${score}</span></span>`;
  };
  V.outcome = (key) => {
    const o = (window.VD && window.VD.OUTCOMES[key]) || { label: key, cls: 'is-neutral' };
    return `<span class="outcome ${o.cls}"><span class="outcome-glyph" aria-hidden="true"></span>${o.label}</span>`;
  };
  V.person = (p, sub) =>
    `<span class="person"><span class="avatar" aria-hidden="true">${p.initials}</span><span class="ellipsis"><span class="person-name ellipsis">${p.name}</span>${sub ? `<span class="person-sub ellipsis">${sub}</span>` : ''}</span></span>`;
  V.delta = (v, { unit = '', goodWhenUp = true, digits = 0 } = {}) => {
    if (!v) return `<span class="delta is-flat">без изменений</span>`;
    const up = v > 0;
    const good = up === goodWhenUp;
    const val = (digits ? V.dec(Math.abs(v), digits) : Math.abs(v)) + unit;
    return `<span class="delta ${good ? 'is-good' : 'is-bad'}"><i data-lucide="${up ? 'arrow-up-right' : 'arrow-down-right'}" class="i"></i>${up ? '+' : '−'}${val}</span>`;
  };
  /* Допродажа: точки «предложено из положенного по правилу» */
  V.upsell = (up) => {
    if (!up) return `<span class="muted" title="Правило допродажи не сработало">—</span>`;
    const [done, need] = up;
    let dots = '';
    for (let i = 0; i < need; i++) dots += `<i class="${i < done ? 'on' : ''}"></i>`;
    const cls = done === need ? 'is-full' : done === 0 ? 'is-none' : '';
    return `<span class="upsell ${cls}" role="img" aria-label="${V.L(`Допродажа: ${done} из ${need}`, `Add-on sale: ${done} of ${need}`)}"><span class="upsell-dots" aria-hidden="true">${dots}</span>${V.L(`${done} из ${need}`, `${done} of ${need}`)}</span>`;
  };
  V.badgeState = (key) => {
    const b = window.VD.BSTATE[key];
    return `<span class="flag is-${b.tone}"><i data-lucide="${b.icon}" class="i"></i>${b.label}</span>`;
  };

  /* ---------- Подсказка графиков: текст ставим через textContent ---------- */
  let tipEl = null;
  V.tip = {
    show(spec, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.replaceChildren();
      const line = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
      if (spec.title) tipEl.appendChild(line('tip-title', spec.title));
      (spec.rows || []).forEach((r) => {
        const row = document.createElement('div');
        row.className = 'tip-row';
        if (r.color) {
          const k = document.createElement('span');
          k.className = 'tip-key';
          k.style.background = r.color;
          row.appendChild(k);
        }
        const b = document.createElement('b');
        b.textContent = r.value;
        row.appendChild(b);
        if (r.label) { const l = document.createElement('span'); l.textContent = r.label; row.appendChild(l); }
        tipEl.appendChild(row);
      });
      if (spec.note) { const n = line('tip-title', spec.note); n.style.marginTop = '4px'; tipEl.appendChild(n); }
      tipEl.classList.add('is-on');
      V.tip.move(x, y);
    },
    move(x, y) {
      if (!tipEl) return;
      const r = tipEl.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      tipEl.style.left = Math.max(8, left) + 'px';
      tipEl.style.top = Math.max(8, top) + 'px';
    },
    hide() { if (tipEl) tipEl.classList.remove('is-on'); },
  };
  /* Подсказка на наведение и на фокус с клавиатуры */
  V.bindTip = (el, specFn) => {
    el.addEventListener('pointerenter', (e) => V.tip.show(specFn(), e.clientX, e.clientY));
    el.addEventListener('pointermove', (e) => V.tip.move(e.clientX, e.clientY));
    el.addEventListener('pointerleave', V.tip.hide);
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); V.tip.show(specFn(), r.left + r.width / 2, r.top); });
    el.addEventListener('blur', V.tip.hide);
  };

  /* ---------- Тост ---------- */
  let toastEl = null, toastTimer = 0;
  V.toast = (msg, icon = 'check') => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<i data-lucide="${icon}" class="i"></i><span></span>`;
    toastEl.querySelector('span').textContent = msg;
    V.icons();
    requestAnimationFrame(() => toastEl.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
  };

  /* ---------- Каркас: сайдбар ---------- */
  const NAV = [
    { id: 'dashboard', label: 'Обзор', icon: 'layout-grid', href: 'dashboard.html' },
    { id: 'conversations', label: 'Разговоры', icon: 'audio-lines', href: 'conversations.html', count: '1' + NB + '075' },
    { id: 'team', label: 'Команда', icon: 'users', href: 'team.html' },
    { id: 'scripts', label: 'Скрипты', icon: 'scroll-text', href: 'scripts.html' },
  ];
  const NAV2 = [
    { id: 'badges', label: 'Бейджи', icon: 'radio', href: 'badges.html', count: '2', alert: true },
    { id: 'compliance', label: 'Комплаенс', icon: 'shield-alert', href: 'compliance.html', count: '7' },
    { id: 'analytics', label: 'Аналитика', icon: 'chart-column', href: 'analytics.html' },
    { id: 'settings', label: 'Настройки', icon: 'settings', href: 'settings.html' },
  ];
  const VIEWS = [
    { label: 'Требуют внимания', count: 14, view: 'attention', tone: 'var(--crit)' },
    { label: 'Нарушения', count: 7, view: 'violations', tone: 'var(--crit)' },
    { label: 'Ушли к конкурентам', count: 139, view: 'competitor', tone: 'var(--warn)' },
    { label: 'Без допродажи', count: 61, view: 'upsell', tone: 'var(--accent)' },
  ];
  const logoSVG = `<svg class="brand-mark" viewBox="0 0 90 110" aria-hidden="true">
      <rect x="0" y="37.4" width="10" height="35.2" rx="5" fill="currentColor" opacity=".45"/>
      <rect x="20" y="22" width="10" height="66" rx="5" fill="currentColor" opacity=".7"/>
      <rect x="40" y="2.75" width="10" height="104.5" rx="5" fill="var(--accent)"/>
      <rect x="60" y="27.5" width="10" height="55" rx="5" fill="currentColor" opacity=".6"/>
      <rect x="80" y="41.25" width="10" height="27.5" rx="5" fill="currentColor" opacity=".35"/></svg>`;
  V.logo = logoSVG;

  function navItem(item, active) {
    const cur = item.id === active ? ' aria-current="page"' : '';
    const count = item.count ? `<span class="nav-count${item.alert ? ' is-alert' : ''}">${item.count}</span>` : '';
    const soon = item.soon ? ' data-soon="1"' : '';
    return `<a class="nav-item" href="${item.soon ? '#' : item.href}"${cur}${soon} title="${item.label}"><i data-lucide="${item.icon}" class="i"></i><span>${item.label}</span>${count}</a>`;
  }

  V.shell = () => {
    const aside = V.$('aside.sidebar');
    if (!aside) return;
    if (!V.$('.skip-link')) document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#main">Перейти к содержимому</a>');
    const mainEl = V.$('#main');
    if (mainEl) mainEl.setAttribute('tabindex', '-1');
    const D = window.VD;
    const active = document.body.dataset.page;
    aside.setAttribute('aria-label', 'Навигация');
    aside.innerHTML = `
      <a class="brand" href="index.html" title="О концепте">${logoSVG}<span class="brand-name" translate="no">${V.L('Войсер', 'Voicer')}</span></a>
      <button class="org-switch" type="button" data-soon="1" aria-label="Сменить организацию">
        <span class="org-logo" aria-hidden="true">${D.org.short}</span>
        <div class="ellipsis"><div class="org-name ellipsis">${D.org.name}</div><div class="org-unit ellipsis">${D.org.unit}</div></div>
        <i data-lucide="chevrons-up-down" class="i i-s muted"></i>
      </button>
      <button class="search-btn" type="button" data-cmdk><i data-lucide="search" class="i"></i><span>Поиск по разговорам</span><span class="kbd">⌘K</span></button>
      <nav class="nav" aria-label="Разделы">
        ${NAV.map((n) => navItem(n, active)).join('')}
        <div class="nav-label">Контроль</div>
        ${NAV2.map((n) => navItem(n, active)).join('')}
      </nav>
      <div class="views">
        <div class="nav-label">Подборки</div>
        <nav class="nav" aria-label="Подборки разговоров">
          ${VIEWS.map((v) => `<a class="nav-item" href="conversations.html?view=${v.view}"><span class="view-dot" style="background:${v.tone}" aria-hidden="true"></span><span>${v.label}</span><span class="nav-count">${v.count}</span></a>`).join('')}
        </nav>
      </div>
      <div class="sidebar-foot">
        <a class="live" href="badges.html" title="Бейджи">
          <span class="live-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          <span class="live-text"><b>${V.L(`${D.badges.onShift} бейджей пишут`, `${D.badges.onShift} badges recording`)}</b><br><span>${V.L(`выгрузка после ${D.badges.uploadEta}`, `upload after ${D.badges.uploadEta}`)}</span></span>
        </a>
        <div class="me">
          <span class="avatar" aria-hidden="true">${D.user.initials}</span>
          <div class="me-meta"><div class="me-name ellipsis">${D.user.name}</div><div class="me-role">${D.user.role}</div></div>
          <button class="lang-btn" type="button" data-lang-toggle aria-label="${V.L('Switch to English', 'Переключить на русский')}" translate="no">${V.L('EN', 'RU')}</button>
          <button class="btn-icon is-s" type="button" data-theme-icon></button>
        </div>
      </div>`;

    /* Мобильная шапка и меню */
    const main = V.$('.main');
    if (main && !V.$('.mobile-bar')) {
      const bar = document.createElement('header');
      bar.className = 'mobile-bar';
      bar.innerHTML = `<a class="brand" href="index.html">${logoSVG}<span class="brand-name" translate="no">${V.L('Войсер', 'Voicer')}</span></a>
        <button class="btn-icon" type="button" data-cmdk aria-label="Поиск"><i data-lucide="search" class="i"></i></button>
        <button class="lang-btn" type="button" data-lang-toggle aria-label="${V.L('Switch to English', 'Переключить на русский')}" translate="no">${V.L('EN', 'RU')}</button>
        <button class="btn-icon" type="button" data-theme-icon></button>
        <button class="btn-icon" type="button" data-menu aria-label="Меню" aria-expanded="false"><i data-lucide="menu" class="i"></i></button>`;
      main.prepend(bar);
      const menu = document.createElement('nav');
      menu.className = 'mobile-nav';
      menu.setAttribute('aria-label', 'Разделы');
      menu.innerHTML = `<div class="nav">${NAV.map((n) => navItem(n, active)).join('')}${NAV2.map((n) => navItem(n, active)).join('')}</div>`;
      document.body.appendChild(menu);
      bar.querySelector('[data-menu]').addEventListener('click', (e) => {
        const open = menu.classList.toggle('is-open');
        e.currentTarget.setAttribute('aria-expanded', String(open));
      });
    }
  };

  /* ---------- Командная палитра ---------- */
  function cmdkItems() {
    const D = window.VD;
    const items = [
      { group: 'Разделы', label: 'Обзор', icon: 'layout-grid', href: 'dashboard.html' },
      { group: 'Разделы', label: 'Разговоры', icon: 'audio-lines', href: 'conversations.html' },
      { group: 'Разделы', label: 'Команда', icon: 'users', href: 'team.html' },
      { group: 'Разделы', label: 'Скрипты', icon: 'scroll-text', href: 'scripts.html' },
      { group: 'Разделы', label: 'Бейджи', icon: 'radio', href: 'badges.html' },
      { group: 'Разделы', label: 'Аналитика', icon: 'chart-column', href: 'analytics.html' },
      { group: 'Разделы', label: 'Комплаенс', icon: 'shield-alert', href: 'compliance.html' },
      { group: 'Разделы', label: 'Настройки', icon: 'settings', href: 'settings.html' },
      { group: 'Фраза в разговорах', label: V.L('«заменим на новый»', '“replace it with a new one”'), icon: 'quote', href: V.L('conversations.html?q=заменим на новый', 'conversations.html?q=replace'), hint: V.L('3 разговора', '3 conversations') },
      { group: 'Фраза в разговорах', label: V.L('«на маркетплейсе дешевле»', '“cheaper on the marketplace”'), icon: 'quote', href: V.L('conversations.html?q=маркетплейс', 'conversations.html?q=marketplace'), hint: V.L('176 разговоров', '176 conversations') },
      { group: 'Действия', label: V.L('Переключить язык на английский', 'Switch language to Russian'), icon: 'languages', action: 'lang' },
      { group: 'Действия', label: 'Загрузить запись вручную', icon: 'upload', soon: true },
      { group: 'Действия', label: 'Переключить тему', icon: 'moon', action: 'theme' },
    ];
    D.sellers.forEach((s) => items.push({ group: 'Продавцы', label: s.name, icon: 'user-round', href: `team.html?seller=${s.id}`, hint: D.storeById[s.store].short }));
    return items;
  }
  let cmdkEl = null;
  V.openCmdk = () => {
    if (!cmdkEl) {
      cmdkEl = document.createElement('div');
      cmdkEl.className = 'cmdk';
      cmdkEl.hidden = true;
      cmdkEl.innerHTML = `<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Поиск и команды">
          <div class="cmdk-input"><i data-lucide="search" class="i muted"></i>
            <input type="text" name="command" placeholder="Продавец, фраза из разговора или действие…" aria-label="Запрос" autocomplete="off" spellcheck="false">
            <span class="kbd">Esc</span></div>
          <div class="cmdk-list" role="listbox"></div></div>`;
      document.body.appendChild(cmdkEl);
      const input = cmdkEl.querySelector('input');
      const list = cmdkEl.querySelector('.cmdk-list');
      let active = 0;
      let shown = [];
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        shown = cmdkItems().filter((it) => !q || V.t(it.label).toLowerCase().includes(q) || it.label.toLowerCase().includes(q) || V.t(it.group).toLowerCase().includes(q));
        active = Math.min(active, Math.max(0, shown.length - 1));
        if (!shown.length) { list.innerHTML = `<div class="cmdk-empty">Ничего не нашлось. Попробуйте фамилию продавца или фразу из разговора.</div>`; return; }
        let html = '', group = '';
        shown.forEach((it, i) => {
          if (it.group !== group) { group = it.group; html += `<div class="cmdk-group">${V.esc(group)}</div>`; }
          html += `<button class="cmdk-item${i === active ? ' is-active' : ''}" role="option" aria-selected="${i === active}" data-i="${i}" type="button"><i data-lucide="${it.icon}" class="i"></i>${V.esc(it.label)}${it.hint ? `<span class="muted">${V.esc(it.hint)}</span>` : ''}</button>`;
        });
        list.innerHTML = html;
        V.icons();
      };
      const run = (it) => {
        if (!it) return;
        if (it.action === 'theme') { V.closeCmdk(); V.toggleTheme(); return; }
        if (it.action === 'lang') { V.setLang(IS_EN ? 'ru' : 'en'); return; }
        if (it.soon) { V.closeCmdk(); V.toast('В концепте этот сценарий не показан', 'info'); return; }
        location.href = it.href;
      };
      input.addEventListener('input', () => { active = 0; draw(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); draw(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
        if (e.key === 'Enter') run(shown[active]);
      });
      list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(shown[+b.dataset.i]); });
      cmdkEl.addEventListener('click', (e) => { if (e.target === cmdkEl) V.closeCmdk(); });
      cmdkEl._draw = draw;
    }
    cmdkEl.hidden = false;
    const input = cmdkEl.querySelector('input');
    input.value = '';
    cmdkEl._draw();
    input.focus();
  };
  V.closeCmdk = () => { if (cmdkEl) cmdkEl.hidden = true; };

  /* ---------- Инициализация ---------- */
  V.init = () => {
    V.shell();
    startTranslator();
    V.$$('[data-theme-icon]').forEach(syncThemeButton);
    V.icons();
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-lang-toggle]')) { V.setLang(IS_EN ? 'ru' : 'en'); return; }
      if (e.target.closest('[data-theme-icon]')) { V.toggleTheme(); return; }
      /* простые сегменты без своей логики переключаются визуально */
      const segBtn = e.target.closest('.seg button');
      if (segBtn && !segBtn.closest('[data-seg-manual]')) V.$$('button', segBtn.parentNode).forEach((b) => b.setAttribute('aria-pressed', String(b === segBtn)));
      if (e.target.closest('[data-cmdk]')) { V.openCmdk(); return; }
      const soon = e.target.closest('[data-soon]');
      if (soon) { e.preventDefault(); V.toast('В концепте этот экран не показан', 'info'); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); V.openCmdk(); }
      if (e.key === 'Escape') V.closeCmdk();
    });
  };
})();

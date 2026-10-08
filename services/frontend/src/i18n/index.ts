/* Язык интерфейса (RU/EN), как в концепте ui-concept/assets/voicer.js.
   Русский текст — источник. В английском режиме:
   - новые компоненты зовут t('…') / L('…', '…') напрямую;
   - всё остальное переводит наблюдатель DOM по словарю en.ts — так старые экраны
     получают английский без правки каждой строки.
   Данные (имена, магазины, расшифровки, тексты LLM) остаются как есть: словарь
   сравнивает строку целиком, а узлы с translate="no" наблюдатель пропускает. */
import { UI, PATTERNS, FRAGMENTS } from './en'

export type Lang = 'ru' | 'en'

const STORAGE_KEY = 'voicer-lang'

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

function detectLang(): Lang {
  const fromUrl = new URLSearchParams(window.location.search).get('lang')
  if (fromUrl === 'ru' || fromUrl === 'en') {
    try { localStorage.setItem(STORAGE_KEY, fromUrl) } catch { /* без сохранения */ }
    return fromUrl
  }
  return readStored() === 'en' ? 'en' : 'ru'
}

export const lang: Lang = detectLang()
export const isEn = lang === 'en'
export const locale = isEn ? 'en-US' : 'ru-RU'

const NBSP = /[\u00A0\u202F]/g
const norm = (x: string) => x.replace(NBSP, ' ').replace(/\s+/g, ' ').trim()
const CYR = /[А-Яа-яЁё]/

/** Перевод строки интерфейса (в русском режиме возвращает как есть). */
export function t(ru: string): string {
  if (!isEn) return ru
  return UI[norm(ru)] ?? ru
}

/** Пара «по-русски / по-английски» — для фраз с числами и именами. */
export function L(ru: string, en: string): string {
  return isEn ? en : ru
}

/** Смена языка: сохраняем выбор и перезагружаем страницу без ?lang. */
export function setLang(next: Lang) {
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* без сохранения */ }
  const url = new URL(window.location.href)
  url.searchParams.delete('lang')
  window.location.replace(url.toString())
}

/* ---------- Перевод DOM ---------- */

const MONTHS: Record<string, string> = {
  янв: 'Jan', фев: 'Feb', мар: 'Mar', апр: 'Apr', мая: 'May', май: 'May', июн: 'Jun',
  июл: 'Jul', авг: 'Aug', сен: 'Sep', окт: 'Oct', ноя: 'Nov', дек: 'Dec',
}
const DATE_RU = /(\d{1,2}) (янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?(?: (\d{4})(?: г\.?)?)?/g

/** Русская типографика чисел → английская: «79,5» → «79.5», «1 075» → «1,075», «12 %» → «12%». */
function numFix(x: string): string {
  return x
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
    .replace(/(\d)[\u00A0\u202F](\d{3})(?!\d)/g, '$1,$2')
    .replace(/(\d)[\u00A0\u202F](\d{3})(?!\d)/g, '$1,$2')
    .replace(/[\u00A0\u202F]%/g, '%')
    .replace(/[\u00A0 ]?п\.[\u00A0 ]?п\./g, ' pp')
}

function translateText(raw: string): string {
  const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m || !m[2]) return raw
  const core = m[2]
  const key = norm(core)
  let out = UI[key]
  if (out == null) {
    out = core
    for (const [re, rp] of PATTERNS) {
      if (re.test(key)) { out = key.replace(re, rp); break }
    }
    if (CYR.test(out)) {
      for (const [re, rp] of FRAGMENTS) out = out.replace(re, rp)
      out = out.replace(DATE_RU, (_s, d, mon, y) => `${MONTHS[mon] ?? mon} ${d}${y ? `, ${y}` : ''}`)
    }
  }
  return m[1] + numFix(out) + m[3]
}

const NEEDS = /[А-Яа-яЁё]|\d[\u00A0\u202F]\d|\d,\d|[\u00A0\u202F]%/
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']
const SKIP_TAGS = /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/

/** Узел внутри translate="no" / редактируемой области. Для текста дополнительно
 *  пропускаем содержимое полей ввода и скриптов; атрибуты полей (placeholder) переводим. */
function skipped(node: Node | null, forAttrs = false): boolean {
  for (let el = node instanceof Element ? node : node?.parentElement ?? null; el; el = el.parentElement) {
    if (!forAttrs && SKIP_TAGS.test(el.nodeName)) return true
    if (el.getAttribute('translate') === 'no' || (el as HTMLElement).isContentEditable) return true
  }
  return false
}

function translateNode(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const v = root.nodeValue
    if (v && NEEDS.test(v) && !skipped(root)) {
      const tr = translateText(v)
      if (tr !== v) root.nodeValue = tr
    }
    return
  }
  if (!(root instanceof Element) && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
  if (root instanceof Element && skipped(root, true)) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Node[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach(translateNode)
  if (root instanceof Element) {
    const els = [root, ...Array.from(root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')))]
    els.forEach(translateAttrs)
  }
}

function translateAttrs(el: Element) {
  if (skipped(el, true)) return
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v && NEEDS.test(v)) {
      const tr = translateText(v)
      if (tr !== v) el.setAttribute(a, tr)
    }
  }
}

/** Запускает перевод DOM в английском режиме: сразу и для всего, что появится позже. */
export function startTranslator() {
  document.documentElement.lang = lang
  if (!isEn) return
  document.title = translateText(document.title)
  translateNode(document.body)
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode)
      else if (m.type === 'characterData') translateNode(m.target)
      else if (m.type === 'attributes' && m.target instanceof Element) translateAttrs(m.target)
    }
  }).observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ATTRS,
  })
  // Заголовок вкладки React не трогает, но страницы могут его менять
  const titleEl = document.querySelector('title')
  if (titleEl) {
    new MutationObserver(() => {
      const tr = translateText(document.title)
      if (tr !== document.title) document.title = tr
    }).observe(titleEl, { childList: true, characterData: true, subtree: true })
  }
}

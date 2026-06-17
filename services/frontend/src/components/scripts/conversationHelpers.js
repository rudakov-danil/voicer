import { jsx as _jsx } from "react/jsx-runtime";
export const AVATAR_PALETTE = [
    '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
    '#10B981', '#EF4444', '#6366F1', '#14B8A6',
    '#F97316', '#06B6D4', '#A855F7', '#D946EF',
];
/** Стабильный цвет аватара по id (или имени, если id нет). */
export function avatarColorFor(idOrName) {
    const s = (idOrName || '').toString();
    if (!s)
        return '#94A3B8';
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[idx];
}
/** Нормализует текст для нестрогого поиска: lowercase, без знаков препинания,
 * множественные пробелы → один пробел. Возвращает (normalized, indexMap),
 * где indexMap[i] — индекс i-го символа normalized в оригинале.
 */
function normalizeForMatch(text) {
    const normalized = [];
    const indexMap = [];
    let prevWasSpace = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const code = ch.charCodeAt(0);
        // Сохраняем буквы (включая кириллицу), цифры. Пробелы и пунктуацию → один пробел.
        const isLetter = /\p{L}|\p{N}/u.test(ch);
        if (isLetter) {
            normalized.push(ch.toLowerCase());
            indexMap.push(i);
            prevWasSpace = false;
        }
        else {
            if (!prevWasSpace && normalized.length > 0) {
                normalized.push(' ');
                indexMap.push(i);
                prevWasSpace = true;
            }
        }
    }
    // Хвостовой пробел нам не нужен
    while (normalized.length && normalized[normalized.length - 1] === ' ') {
        normalized.pop();
        indexMap.pop();
    }
    return { normalized: normalized.join(''), indexMap };
}
/** Разбивает строку-цитату на «фразы»: по точкам/восклицанию/вопросу/многоточию.
 * Используется когда LLM склеил два не-смежных куска текста в одну evidence-строку.
 */
function splitIntoPhrases(s) {
    return s
        .split(/[.!?…]+|\s\.{2,3}\s/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
}
/** Подсветка вхождений списка строк в тексте.
 * Стратегия (по убыванию строгости):
 *   1) Точное нормализованное совпадение цитаты.
 *   2) Если не нашли — пробуем поочерёдно каждую «фразу» цитаты (split по .?!).
 *   3) Если и так не нашли — пробуем «префикс» цитаты (первые 6 слов).
 * Это спасает кейс когда LLM перефразировал или склеил две цитаты в одну.
 */
export function highlightSegmentText(text, rules) {
    if (!text || !rules?.length)
        return text;
    const { normalized: hay, indexMap } = normalizeForMatch(text);
    const ranges = [];
    const findAll = (needle, kind, tooltip) => {
        if (needle.length < 3)
            return false;
        let pos = 0;
        let any = false;
        let safety = 200;
        while (pos < hay.length && safety-- > 0) {
            const found = hay.indexOf(needle, pos);
            if (found === -1)
                break;
            const endNorm = found + needle.length - 1;
            if (endNorm >= indexMap.length)
                break;
            const startOrig = indexMap[found];
            const endOrig = indexMap[endNorm] + 1;
            ranges.push({ start: startOrig, end: endOrig, kind, tooltip });
            pos = found + needle.length;
            any = true;
        }
        return any;
    };
    for (const rule of rules) {
        const raw = (rule.text || '').trim();
        if (raw.length < 3)
            continue;
        const { normalized: needle } = normalizeForMatch(raw);
        if (needle.length < 3)
            continue;
        // 1) Точное совпадение
        if (findAll(needle, rule.kind, rule.tooltip))
            continue;
        // 2) Совпадение по фразам (если в цитате несколько предложений)
        const phrases = splitIntoPhrases(raw);
        if (phrases.length > 1) {
            let anyPhrase = false;
            for (const phrase of phrases) {
                const { normalized: phraseNeedle } = normalizeForMatch(phrase);
                // Берём только фразы из >=4 слов, чтобы не подсвечивать «Да» или «Спасибо»
                const wordCount = phraseNeedle.split(' ').filter(Boolean).length;
                if (wordCount < 4)
                    continue;
                if (findAll(phraseNeedle, rule.kind, rule.tooltip))
                    anyPhrase = true;
            }
            if (anyPhrase)
                continue;
        }
        // 3) Префикс — первые 6 слов цитаты
        const words = needle.split(' ').filter(Boolean);
        if (words.length >= 6) {
            const prefix = words.slice(0, 6).join(' ');
            findAll(prefix, rule.kind, rule.tooltip);
        }
    }
    if (!ranges.length)
        return text;
    ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const merged = [];
    for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (last && r.start < last.end)
            continue;
        merged.push(r);
    }
    const parts = [];
    let cursor = 0;
    merged.forEach((r, i) => {
        if (cursor < r.start)
            parts.push(text.slice(cursor, r.start));
        parts.push(_jsx("mark", { className: `hl hl--${r.kind}`, title: r.tooltip, children: text.slice(r.start, r.end) }, `hl-${i}`));
        cursor = r.end;
    });
    if (cursor < text.length)
        parts.push(text.slice(cursor));
    return parts;
}
/** Правило применимо к разговору (store, seller), если покрывает магазин и продавца. */
function ruleApplies(r, storeId, sellerId) {
    if (!r.is_active)
        return false;
    const storeOk = !r.store_ids?.length || (!!storeId && r.store_ids.includes(storeId));
    const sellerOk = !r.seller_ids?.length || (!!sellerId && r.seller_ids.includes(sellerId));
    return storeOk && sellerOk;
}
/** Анализирует, упоминал ли продавец триггер и предлагал ли обязательные товары.
 * Берёт только сегменты с speaker_role === 'seller'.
 */
export function analyzeSell(rules, segments, storeId, sellerId) {
    const empty = { triggered: false, matched: 0, total: 0, missed: [], status: 'no-trigger' };
    if (!rules?.length || !segments?.length)
        return empty;
    // Тексты только продавца, склеенные и нормализованные (без пунктуации, нижний регистр).
    // Нормализация нужна, чтобы триггер "КАСКО" нашёл "КАСКО," в речи, а "трейд-ин" → "трейд ин".
    const sellerTextRaw = segments
        .filter((s) => (s.speaker_role || '').toLowerCase() === 'seller')
        .map((s) => s.text || '')
        .join(' \n ');
    if (!sellerTextRaw)
        return empty;
    const sellerNorm = normalizeForMatch(sellerTextRaw).normalized;
    // Применимые правила: активные, покрывающие магазин и продавца разговора
    const applicable = rules.filter((r) => ruleApplies(r, storeId, sellerId));
    if (!applicable.length)
        return empty;
    const contains = (q) => {
        const n = normalizeForMatch(q).normalized;
        return n.length >= 2 && sellerNorm.includes(n);
    };
    let total = 0;
    let matched = 0;
    let triggered = false;
    const missed = [];
    for (const rule of applicable) {
        const t = (rule.trigger_product || '').trim();
        if (!t)
            continue;
        if (contains(t)) {
            triggered = true;
            total += rule.required_offers.length;
            for (const offer of rule.required_offers) {
                if (!offer.trim())
                    continue;
                if (contains(offer))
                    matched += 1;
                else
                    missed.push(offer);
            }
        }
    }
    let status = 'no-trigger';
    if (triggered) {
        if (total === 0)
            status = 'complete'; // триггер был, но нет ожидаемых офферов в правиле
        else if (matched === total)
            status = 'complete';
        else if (matched === 0)
            status = 'missed';
        else
            status = 'partial';
    }
    return { triggered, matched, total, missed, status };
}
/** Собирает HighlightRule для подсветки upsell/crosssell в речи продавца.
 * trigger подкрашивается одним цветом, offers — другим (зелёный если есть, прочерк если нет — только не подсвечиваем).
 */
export function highlightRulesForSell(rules, storeId, kind, sellerId) {
    if (!rules?.length)
        return [];
    const applicable = rules.filter((r) => ruleApplies(r, storeId, sellerId));
    const out = [];
    for (const rule of applicable) {
        const t = rule.trigger_product?.trim();
        if (t)
            out.push({
                text: t,
                kind: kind === 'upsell' ? 'upsell-trigger' : 'crosssell-trigger',
                tooltip: `${kind === 'upsell' ? 'Апсейл' : 'Кросс-сейл'}: триггер «${t}»`,
            });
        for (const offer of (rule.required_offers || [])) {
            const o = offer.trim();
            if (o)
                out.push({
                    text: o,
                    kind: kind === 'upsell' ? 'upsell-offer' : 'crosssell-offer',
                    tooltip: `${kind === 'upsell' ? 'Апсейл' : 'Кросс-сейл'}: предложение «${o}»`,
                });
        }
    }
    return out;
}

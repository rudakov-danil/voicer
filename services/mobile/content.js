// The app has no POS price source. Omit price-bearing text as a whole rather
// than silently rewriting a recorded quote. Applies to saved responses too.
const PRICE = /[₽₸$€£¥]|\d[\d\s.,]*\s*р\.?(?=$|[^\p{L}])|(?:^|[^\p{L}])(?:руб(?:\.|л[\p{L}]*|лей|ля)?|тенге|теңге|тг\.?|kzt|rub|usd|eur|доллар[\p{L}]*|евро|цен(?:а|ы|у|е|ой|ам|ами|ах)|стоимост[\p{L}]*|дороже|дешевле)(?=$|[^\p{L}])/iu;

export function withoutPrices(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text && !PRICE.test(text) ? text : null;
}

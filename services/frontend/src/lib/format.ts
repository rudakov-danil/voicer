/** Инициалы для аватара: «Дмитрий Соколов» → «ДС». */
export function initials(name?: string | null) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

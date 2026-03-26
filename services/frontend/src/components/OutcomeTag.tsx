interface OutcomeTagProps {
  outcome: 'purchase' | 'deferred' | 'price_objection' | 'competitor' | 'unknown'
}

export function OutcomeTag({ outcome }: OutcomeTagProps) {
  const outcomesMap: Record<string, { label: string; class: string }> = {
    purchase: { label: 'Покупка', class: 'tag-success' },
    deferred: { label: 'Отложил', class: 'tag-warning' },
    price_objection: { label: 'Ценовой отказ', class: 'tag-danger' },
    competitor: { label: 'Ушёл к конкурентам', class: 'tag-purple' },
    unknown: { label: 'Не определён', class: 'tag-neutral' }
  }

  const config = outcomesMap[outcome] || outcomesMap.unknown

  return <span className={`tag ${config.class}`}>{config.label}</span>
}

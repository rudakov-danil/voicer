interface OutcomeTagProps {
  outcome: string
}

export function OutcomeTag({ outcome }: OutcomeTagProps) {
  const outcomesMap: Record<string, { label: string; class: string }> = {
    purchase: { label: 'Покупка', class: 'tag-success' },
    deferred: { label: 'Отложено', class: 'tag-warning' },
    price_refusal: { label: 'Отказ по цене', class: 'tag-danger' },
    competitor: { label: 'Ушёл к конкурентам', class: 'tag-purple' },
    // Исходы телефонии
    appointment: { label: 'Встреча назначена', class: 'tag-success' },
    callback: { label: 'Перезвон', class: 'tag-warning' },
    refusal: { label: 'Отказ', class: 'tag-danger' },
    transfer: { label: 'Перевод звонка', class: 'tag-neutral' },
    non_target: { label: 'Нецелевой', class: 'tag-neutral' },
    voicemail: { label: 'Недозвон', class: 'tag-neutral' },
    unknown: { label: 'Не определён', class: 'tag-neutral' }
  }

  const config = outcomesMap[outcome] || outcomesMap.unknown

  return <span className={`tag ${config.class}`}>{config.label}</span>
}

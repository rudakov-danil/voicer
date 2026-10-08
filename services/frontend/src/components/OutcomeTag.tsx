import { outcomeLabel } from '@/lib/outcomes'

interface OutcomeTagProps {
  outcome: string
}

/** Исход разговора: форма значка + подпись (не только цвет), как в концепте. */
const OUTCOME_GLYPH: Record<string, string> = {
  purchase: 'is-win',
  deferred: 'is-pending',
  price_refusal: 'is-lost',
  competitor: 'is-gone',
  // Исходы телефонии
  appointment: 'is-win',
  resolved: 'is-win',
  callback: 'is-pending',
  refusal: 'is-lost',
}

export function OutcomeTag({ outcome }: OutcomeTagProps) {
  const glyph = OUTCOME_GLYPH[outcome] || 'is-neutral'
  return (
    <span className={`outcome ${glyph}`}>
      <span className="outcome-glyph" aria-hidden="true" />
      {outcomeLabel(outcome)}
    </span>
  )
}

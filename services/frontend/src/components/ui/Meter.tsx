import { L, t } from '@/i18n'

/** Балл по скрипту: 10 сегментов, как индикатор уровня. Ниже 60 — красный, 60–79 — приглушённый. */
export function Meter({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <span className="meter is-na" title={t('Нет оценки')}>
        <span className="meter-val">—</span>
      </span>
    )
  }
  const v = Math.round(score)
  const on = Math.round(v / 10)
  const cls = v < 60 ? 'is-low' : v < 80 ? 'is-mid' : ''
  return (
    <span className={`meter ${cls}`} role="img" aria-label={L(`Балл ${v} из 100`, `Score ${v} of 100`)}>
      <span className="meter-track" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < on ? 'on' : undefined} />)}
      </span>
      <span className="meter-val">{v}</span>
    </span>
  )
}

/** Допродажа: точки «предложено из положенного по правилу». */
export function UpsellDots({ value }: { value: [number, number] | null | undefined }) {
  if (!value) {
    return <span className="muted" title={t('Правило допродажи не сработало')}>—</span>
  }
  const [done, need] = value
  const cls = done === need ? 'is-full' : done === 0 ? 'is-none' : ''
  return (
    <span className={`upsell ${cls}`} role="img" aria-label={L(`Допродажа: ${done} из ${need}`, `Add-on sale: ${done} of ${need}`)}>
      <span className="upsell-dots" aria-hidden="true">
        {Array.from({ length: Math.min(need, 8) }, (_, i) => <i key={i} className={i < done ? 'on' : undefined} />)}
      </span>
      {L(`${done} из ${need}`, `${done} of ${need}`)}
    </span>
  )
}

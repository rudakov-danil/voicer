import { Plus } from 'lucide-react'

/** Карта допродаж: кружки-штампы, как на карте лояльности. Закрашенный — гость согласился
 *  на предложение; пустые — сколько осталось до плана смены. Сверх плана — «+N». */
export function StampCard({ filled, total, label, size = 'sm' }: {
  filled: number
  /** Сколько кружков на карте (план). Без плана карта показывает только закрашенные. */
  total?: number | null
  label: string
  size?: 'sm' | 'lg'
}) {
  const slots = total && total > 0 ? Math.min(total, 12) : Math.min(filled, 12)
  const extra = Math.max(0, filled - slots)
  if (slots === 0) return null
  return (
    <span className={`stamps stamps-${size}${total && filled >= total ? ' is-done' : ''}`} role="img" aria-label={label}>
      {Array.from({ length: slots }, (_, i) => (
        // Небольшой наклон — как у штампа, поставленного рукой; у каждого кружка свой и постоянный
        <span key={i} className={i < filled ? 'stamp is-on' : 'stamp'} style={{ ['--tilt' as string]: `${((i * 37) % 11) - 5}deg` }} aria-hidden="true">
          {i < filled && <Plus strokeWidth={2.5} />}
        </span>
      ))}
      {extra > 0 && <span className="stamp-extra" aria-hidden="true">+{extra}</span>}
    </span>
  )
}

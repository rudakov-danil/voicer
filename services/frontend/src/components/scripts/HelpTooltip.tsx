import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

type Props = {
  content: React.ReactNode
  size?: number
  inline?: boolean
}

export function HelpTooltip({ content, size = 13, inline }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
  }, [open])

  return (
    <>
      <span
        ref={ref}
        className="help-icon"
        style={{ verticalAlign: inline ? 'middle' : 'baseline' }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        role="button"
        tabIndex={0}
        aria-label="Подсказка"
      >
        <HelpCircle size={size} />
      </span>
      {open && pos && createPortal(
        <div
          className="help-tooltip"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  )
}

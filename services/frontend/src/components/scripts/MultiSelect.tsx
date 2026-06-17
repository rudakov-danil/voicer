import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export interface MultiSelectOption {
  id: string
  label: string
  sublabel?: string
}

type Props = {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  /** Если true — режим одиночного выбора, при выборе закрывается. */
  single?: boolean
  /** Опция "Все" сверху (id будет null). При выборе передаёт ВСЕ id; снятие → []. */
  selectAllLabel?: string
  /** Поиск, по умолчанию включён если опций > 5. */
  searchable?: boolean
  /** Доп. опция в начале списка, со специальным id, например "" (без магазина). */
  prependOption?: { id: string; label: string }
  /** Контекст для placeholder при пустом выборе (используется в тегах). */
  emptyHint?: string
  disabled?: boolean
  /** Ширина поповера. По умолчанию равна триггеру. */
  popoverWidth?: number
}

export function MultiSelect({
  options, selected, onChange,
  placeholder = 'Выберите…',
  single = false,
  selectAllLabel,
  searchable,
  prependOption,
  disabled,
  popoverWidth,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)

  const showSearch = searchable ?? options.length > 5

  // Click outside / Escape
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const margin = 8
    const gap = 4
    const spaceBelow = vh - r.bottom - margin
    const spaceAbove = r.top - margin
    // Для строк у нижнего края экрана места снизу не хватает — открываем поповер вверх,
    // если сверху его больше. maxHeight ограничиваем доступной стороной, чтобы он не
    // уезжал за вьюпорт (position: fixed нельзя доскроллить).
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
    const avail = Math.max(0, openUp ? spaceAbove : spaceBelow)
    const maxHeight = Math.min(360, Math.max(120, avail - gap))
    const base = { left: r.left, width: popoverWidth ?? r.width, maxHeight }
    if (openUp) {
      setPos({ ...base, bottom: vh - r.top + gap })
    } else {
      setPos({ ...base, top: r.bottom + gap })
    }
  }, [popoverWidth])

  useEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
    )
  }, [options, query])

  const allIds = options.map((o) => o.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id))

  const toggle = (id: string) => {
    if (single) {
      onChange([id])
      setOpen(false)
      return
    }
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id))
    } else {
      onChange([...selected, id])
    }
  }
  const toggleAll = () => onChange(allSelected ? [] : allIds)

  const selectedMap = useMemo(() => new Set(selected), [selected])
  const selectedLabels = options.filter((o) => selectedMap.has(o.id))
  const prependSelected = !!prependOption && selected.length === 1 && selected[0] === prependOption.id

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ms-trigger ${disabled ? 'ms-trigger--disabled' : ''} ${open ? 'ms-trigger--open' : ''}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ms-value">
          {selectedLabels.length === 0 && !prependSelected && (
            <span className="ms-placeholder">{placeholder}</span>
          )}
          {prependSelected && prependOption && (
            <span className="ms-single-value ms-single-value--prepend">{prependOption.label}</span>
          )}
          {!single && selectedLabels.slice(0, 3).map((o) => (
            <span key={o.id} className="ms-chip" onClick={(e) => { e.stopPropagation(); toggle(o.id) }}>
              {o.label}
              <X size={11} />
            </span>
          ))}
          {!single && selectedLabels.length > 3 && (
            <span className="ms-chip ms-chip--more">+{selectedLabels.length - 3}</span>
          )}
          {single && !prependSelected && selectedLabels[0] && (
            <span className="ms-single-value">{selectedLabels[0].label}</span>
          )}
        </span>
        <ChevronDown size={14} className="ms-caret" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="ms-popover"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          role="listbox"
        >
          {showSearch && (
            <div className="ms-search">
              <Search size={13} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск…"
                onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
              />
            </div>
          )}

          <div className="ms-list">
            {!single && selectAllLabel && options.length > 0 && (
              <div
                className="ms-option ms-option--all"
                onClick={toggleAll}
                role="option"
                aria-selected={allSelected}
              >
                <span className={`ms-check ${allSelected ? 'ms-check--on' : ''}`}>
                  {allSelected && <Check size={11} />}
                </span>
                <span className="ms-option-label">{selectAllLabel}</span>
                <span className="ms-option-count">{allIds.length}</span>
              </div>
            )}

            {prependOption && (
              <div
                className="ms-option"
                onClick={() => { onChange([prependOption.id]); setOpen(false) }}
                role="option"
                aria-selected={selected.length === 1 && selected[0] === prependOption.id}
              >
                <span className={`ms-check ${selected.length === 1 && selected[0] === prependOption.id ? 'ms-check--on' : ''}`}>
                  {selected.length === 1 && selected[0] === prependOption.id && <Check size={11} />}
                </span>
                <span className="ms-option-label">{prependOption.label}</span>
              </div>
            )}

            {filtered.map((o) => {
              const isSelected = selectedMap.has(o.id)
              return (
                <div
                  key={o.id}
                  className={`ms-option ${isSelected ? 'ms-option--selected' : ''}`}
                  onClick={() => toggle(o.id)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className={`ms-check ${isSelected ? 'ms-check--on' : ''}`}>
                    {isSelected && <Check size={11} />}
                  </span>
                  <span className="ms-option-label">
                    {o.label}
                    {o.sublabel && <span className="ms-option-sub"> · {o.sublabel}</span>}
                  </span>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="ms-empty">Ничего не найдено</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

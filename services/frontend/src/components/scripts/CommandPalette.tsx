import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckSquare, Plus, Sparkles, Search, BookOpen, MapPin } from 'lucide-react'

export type PaletteCommand = {
  id: string
  label: string
  hint?: string
  icon?: React.ReactNode
  onRun: () => void
}

type Props = {
  scripts: { id: string; name: string; is_active: boolean }[]
  onCreate: () => void
  onOpenLibrary: () => void
  onSelectScript: (id: string) => void
  onJumpAssignments: (id: string) => void
}

export function CommandPalette({ scripts, onCreate, onOpenLibrary, onSelectScript, onJumpAssignments }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isCmdK) {
        e.preventDefault()
        setOpen((v) => !v)
        setQ('')
        setActive(0)
        return
      }
      if (!open) return
      if (e.key === 'Escape') { setOpen(false); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const commands: PaletteCommand[] = useMemo(() => {
    const fixed: PaletteCommand[] = [
      {
        id: 'create',
        label: 'Создать новый скрипт',
        hint: 'C',
        icon: <Plus size={14} />,
        onRun: () => { setOpen(false); onCreate() },
      },
      {
        id: 'library',
        label: 'Открыть библиотеку шаблонов / AI',
        hint: 'L',
        icon: <Sparkles size={14} />,
        onRun: () => { setOpen(false); onOpenLibrary() },
      },
    ]
    const scriptCmds: PaletteCommand[] = scripts.map((s) => ({
      id: `open:${s.id}`,
      label: `Открыть: ${s.name}`,
      hint: s.is_active ? 'активный' : 'черновик',
      icon: <CheckSquare size={14} />,
      onRun: () => { setOpen(false); onSelectScript(s.id) },
    }))
    const assignCmds: PaletteCommand[] = scripts.map((s) => ({
      id: `assign:${s.id}`,
      label: `Назначить магазины: ${s.name}`,
      icon: <MapPin size={14} />,
      onRun: () => { setOpen(false); onJumpAssignments(s.id) },
    }))
    return [...fixed, ...scriptCmds, ...assignCmds]
  }, [scripts, onCreate, onOpenLibrary, onSelectScript, onJumpAssignments])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands.slice(0, 30)
    return commands.filter((c) => c.label.toLowerCase().includes(s)).slice(0, 30)
  }, [q, commands])

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.onRun() }
  }

  if (!open) return null

  return createPortal(
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-card" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-search">
          <Search size={14} />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            placeholder="Команда или скрипт…"
            onKeyDown={onListKey}
          />
          <span className="cmdk-kbd">esc</span>
        </div>
        <div className="cmdk-list">
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`cmdk-item ${i === active ? 'cmdk-item--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={c.onRun}
            >
              <span className="cmdk-icon">{c.icon || <BookOpen size={14} />}</span>
              <span className="cmdk-label">{c.label}</span>
              {c.hint && <span className="cmdk-hint">{c.hint}</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="cmdk-empty">Ничего не найдено</div>
          )}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> навигация</span>
          <span><kbd>Enter</kbd> выбрать</span>
          <span><kbd>⌘K</kbd> вызов</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

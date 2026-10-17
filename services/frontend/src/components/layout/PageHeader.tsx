import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* Подзаголовок и кнопки страницы в общей шапке (Topbar), как в концепте:
   «Скрипты · 4 скрипта · …» слева и действия справа от заголовка. */

export const PAGE_SUBTITLE_SLOT = 'page-subtitle-slot'
export const PAGE_ACTIONS_SLOT = 'page-actions-slot'

function useSlot(id: string) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => { setEl(document.getElementById(id)) }, [id])
  return el
}

export function PageSubtitle({ children }: { children: ReactNode }) {
  const el = useSlot(PAGE_SUBTITLE_SLOT)
  return el ? createPortal(children, el) : null
}

export function PageActions({ children }: { children: ReactNode }) {
  const el = useSlot(PAGE_ACTIONS_SLOT)
  return el ? createPortal(children, el) : null
}

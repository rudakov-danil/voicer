import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

/* Короткое уведомление внизу экрана (ui-concept/assets/voicer.js → V.toast).
   toast('…') можно звать из любого места; <Toaster /> стоит один раз в каркасе. */

type Listener = (msg: string) => void
const listeners = new Set<Listener>()

export function toast(msg: string) {
  listeners.forEach((fn) => fn(msg))
}

export function Toaster() {
  const [msg, setMsg] = useState('')
  const [on, setOn] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    const show: Listener = (m) => {
      setMsg(m)
      requestAnimationFrame(() => setOn(true))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setOn(false), 2600)
    }
    listeners.add(show)
    return () => { listeners.delete(show); window.clearTimeout(timer.current) }
  }, [])

  return (
    <div className={`toast ${on ? 'is-on' : ''}`} role="status" aria-live="polite">
      {msg && <><Check size={16} aria-hidden="true" /><span>{msg}</span></>}
    </div>
  )
}

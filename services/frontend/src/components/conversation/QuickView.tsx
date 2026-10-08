import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, AudioLines } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { OutcomeTag } from '@/components/OutcomeTag'
import { Meter } from '@/components/ui/Meter'
import { Fingerprint, clock } from '@/components/ui/Fingerprint'
import { ReviewButton } from '@/components/conversation/Coaching'
import { parseSummary, isNoneSection } from '@/components/conversation/shared'
import type { FingerprintData, FingerprintMark } from '@/types'
import { t, L, locale } from '@/i18n'

/* Быстрый просмотр разговора из списка (ui-concept/conversations.html → .drawer):
   «отпечаток», итог ИИ, моменты, этапы скрипта и действия. Полная карточка — по кнопке. */

const MOMENT: Record<FingerprintMark['k'], string> = {
  crit: 'Нарушение',
  'crit-mid': 'Нарушение',
  warn: 'Возражение без ответа',
  'warn-ok': 'Возражение отработано',
  ok: 'Предложение допродажи',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function initialsOf(name?: string | null) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export function QuickView({ id, row, fingerprint: fpFromList, markTitle, onClose }: {
  id: string | null
  /** Строка списка — показываем сразу, пока грузится карточка */
  row?: any
  fingerprint?: FingerprintData | null
  markTitle?: (m: FingerprintMark) => string
  onClose: () => void
}) {
  const open = !!id
  const closeRef = useRef<HTMLButtonElement>(null)
  const lastFocus = useRef<Element | null>(null)
  const { data } = useQuery({
    queryKey: ['conversation-detail', id],
    queryFn: () => dashboardApi.getConversationDetail(id!),
    enabled: open,
  })
  // Разговор открыт по ссылке и не на текущей странице списка — «отпечаток» берём отдельно
  const { data: fpOwn } = useQuery({
    queryKey: ['fingerprints', id],
    queryFn: () => dashboardApi.getFingerprints([id!]),
    enabled: open && !fpFromList,
    staleTime: 5 * 60 * 1000,
  })
  const fingerprint = fpFromList || (id ? fpOwn?.[id] : null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus()
    }
  }, [open, onClose])

  const c: any = data?.conversation || row || {}
  const when = c.recorded_at || c.analyzed_at || c.session_date
  const whenDate = when ? new Date(when) : null
  const scriptResult = (c.script_results || []).find((sr: any) => sr.was_applied !== false) || (c.script_results || [])[0]
  const steps: any[] = scriptResult?.step_scores || []
  const parts = c.summary ? parseSummary(c.summary) : null
  const brief = parts?.['Итог'] || (c.summary ? String(c.summary).split('\n').find((l: string) => l.trim())?.replace(/\*\*/g, '') : null)
  const marks = fingerprint ? [...fingerprint.marks].sort((a, b) => a.t - b.t) : []
  const notScored = c.is_scorable === false
  const sourceLabel = c.source === 'badge' ? t('Запись с бейджа')
    : c.source === 'transcript' ? t('Загружен текстом — без аудио')
    : t('Загруженное аудио')

  return (
    <>
      <div className={`drawer-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer qv ${open ? 'open' : ''}`} aria-label={t('Быстрый просмотр разговора')} aria-hidden={!open}>
        {open && (
          <>
            <div className="drawer-header">
              <div className="qv-head-meta">
                <OutcomeTag outcome={c.outcome || 'unknown'} />
                <span className="muted" aria-hidden="true">·</span>
                {notScored ? <span className="muted">{t('Не оценивается')}</span> : <Meter score={c.overall_score} />}
              </div>
              <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} aria-label={t('Закрыть')}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="drawer-body">
              <div className="qv-title" translate={c.topic ? 'no' : undefined}>{c.topic || t('Разговор без темы')}</div>
              <div className="qv-meta">
                <span className="person">
                  <span className="avatar" aria-hidden="true" translate="no">{initialsOf(c.seller_name)}</span>
                  <span>
                    <span className="person-name" translate="no">{c.seller_name || '—'}</span>
                    <span className="person-sub" translate="no">{c.store_name}</span>
                  </span>
                </span>
              </div>
              <div className="qv-meta" style={{ marginTop: 8 }}>
                {whenDate && <span>{whenDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}, {whenDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>}
                {c.duration_seconds ? <><span className="muted">·</span><span className="mono">{clock(c.duration_seconds)}</span></> : null}
              </div>

              {fingerprint && (
                <div className="qv-fp">
                  <Fingerprint data={fingerprint} height={56} markTitle={markTitle} />
                  <div className="qv-ruler" aria-hidden="true">
                    <span>00:00</span><span>{clock(fingerprint.dur / 2)}</span><span>{clock(fingerprint.dur)}</span>
                  </div>
                  <div className="qv-legend">
                    <span className="legend-item"><span className="key-bar" style={{ background: 'var(--seller)' }} />{t('Продавец')}</span>
                    <span className="legend-item"><span className="key-bar" style={{ background: 'var(--client)' }} />{t('Покупатель')}</span>
                    {fingerprint.talk != null && <span className="qv-talk">{L(`продавец говорит ${fingerprint.talk} %`, `seller talks ${fingerprint.talk}%`)}</span>}
                  </div>
                </div>
              )}

              {brief && (
                <section className="qv-sec">
                  <h3>{t('Коротко')} <span className="tag tag-primary">{t('ИИ')}</span></h3>
                  <p className="qv-sum" translate="no">{brief}</p>
                  {parts && !isNoneSection(parts['Риск претензии']) && (
                    <p className="qv-sum qv-risk" translate="no"><b>{t('Риск претензии')}:</b> {parts['Риск претензии']}</p>
                  )}
                </section>
              )}

              {marks.length > 0 && (
                <section className="qv-sec">
                  <h3>{t('Моменты')}</h3>
                  {marks.map((m, i) => (
                    <Link key={i} className="qv-moment" to={`/conversations/${id}?t=${Math.max(0, Math.round(m.t * fingerprint!.dur) - 1)}`}>
                      <span className="mono">{clock(m.t * fingerprint!.dur)}</span>
                      <span className={`mk is-${m.k}`} aria-hidden="true" />
                      <span>{cap(markTitle ? markTitle(m) : t(MOMENT[m.k]))}</span>
                    </Link>
                  ))}
                </section>
              )}

              {steps.length > 0 && !notScored && (
                <section className="qv-sec">
                  <h3>{t('Этапы скрипта')}</h3>
                  {steps.map((s, i) => (
                    <div key={i} className="qv-step">
                      <span className="ellipsis" translate="no">{s.step_name}</span>
                      <Meter score={s.score} />
                    </div>
                  ))}
                </section>
              )}

              <section className="qv-sec">
                <h3>{t('Запись')}</h3>
                <dl className="cv-rec-list" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                  <dt>{t('Источник')}</dt><dd>{sourceLabel}</dd>
                  <dt>{t('Роли')}</dt><dd>{t('размечены автоматически')}</dd>
                </dl>
              </section>
            </div>
            <div className="qv-foot">
              <Link className="btn btn-primary" to={`/conversations/${id}`}><AudioLines size={15} aria-hidden="true" />{t('Открыть разговор')}</Link>
              <ReviewButton conversationId={id!} sellerName={c.seller_name} />
            </div>
          </>
        )}
      </aside>
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { OctagonAlert, TriangleAlert, Play, ArrowRight } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { Fingerprint, clock } from '@/components/ui/Fingerprint'
import { useObjectionTypeLabel } from '@/components/conversation/shared'
import { initials } from '@/lib/format'
import type { ConversationView, FingerprintData } from '@/types'
import { t, L, locale, plural } from '@/i18n'

/* Очередь на разбор (ui-concept/dashboard.html → #queue): сначала нарушения правил
   общения, потом разговоры с низким баллом. Цитата и момент — из нарушения или
   неотработанного возражения; момент находим по меткам «отпечатка». */

const TABS: Array<{ id: ConversationView; label: string }> = [
  { id: 'attention', label: 'Все' },
  { id: 'violations', label: 'Нарушения' },
  { id: 'low_score', label: 'Низкий балл' },
]
const SHOW = 5

function momentOf(row: any, fp?: FingerprintData) {
  if (!fp) return null
  const marks = fp.marks
  const m = row.top_violation
    ? marks.find((x) => (x.k === 'crit' || x.k === 'crit-mid') && x.label === row.top_violation) || marks.find((x) => x.k === 'crit' || x.k === 'crit-mid')
    : marks.find((x) => x.k === 'warn') || marks.find((x) => x.k === 'crit' || x.k === 'crit-mid')
  return m ? Math.max(0, Math.round(m.t * fp.dur)) : null
}

export function ReviewQueue({ period }: { period: number }) {
  const [tab, setTab] = useState<ConversationView>('attention')
  const objectionLabel = useObjectionTypeLabel()
  const { data } = useQuery({
    queryKey: ['review-queue', period, tab],
    queryFn: () => dashboardApi.getConversations({ view: tab, order: 'risk', limit: SHOW, period, with_counts: true }),
    placeholderData: (prev) => prev,
  })
  const items: any[] = data?.items || []
  const ids = items.map((r) => r.id as string)
  const { data: fps } = useQuery({
    queryKey: ['fingerprints', ids.join(',')],
    queryFn: () => dashboardApi.getFingerprints(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const counts = data?.view_counts
  const total = counts?.[tab] ?? data?.total ?? 0
  const rest = Math.max(0, total - items.length)

  return (
    <section className="panel" aria-labelledby="queue-title">
      <div className="panel-head">
        <div>
          <h2 id="queue-title" className="panel-title">{t('Очередь на разбор')}</h2>
          <div className="panel-sub">{t('Сначала — нарушения правил общения, потом разговоры с низким баллом')}</div>
        </div>
        <div className="seg" role="group" aria-label={t('Фильтр очереди')}>
          {TABS.map((tb) => (
            <button key={tb.id} type="button" aria-pressed={tab === tb.id} onClick={() => setTab(tb.id)}>
              {t(tb.label)}{counts ? ` · ${counts[tb.id] ?? 0}` : ''}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: '28px 18px' }}>
          <p>{data ? t('За период нет разговоров, требующих разбора.') : t('Загрузка...')}</p>
        </div>
      ) : (
        <ul className="queue-list">
          {items.map((r) => {
            const fp = fps?.[r.id]
            const at = momentOf(r, fp)
            const crit = r.top_violation_severity === 'high'
            const when = new Date(r.recorded_at || r.analyzed_at || r.session_date)
            const quote = r.top_violation_evidence || r.open_objection_text
            return (
              <li key={r.id} className="q-item">
                <span className={`q-sev ${crit ? 'is-crit' : 'is-warn'}`} title={crit ? t('Высокий риск') : t('Нужен разбор')}>
                  {crit ? <OctagonAlert aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
                  <span className="sr-only">{crit ? t('Высокий риск') : t('Нужен разбор')}</span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="q-reason">
                    {r.top_violation ? (
                      <><b translate="no">{r.top_violation}</b><span className="muted"> · {r.compliance_violations_count > 1 ? L(`${r.compliance_violations_count} нарушения`, `${r.compliance_violations_count} violations`) : t('нарушение')}</span></>
                    ) : (
                      <><b>{L(`Балл ${Math.round(r.overall_score)} из 100`, `Score ${Math.round(r.overall_score)} of 100`)}</b>
                        {r.weakest_step && <span className="muted"> · {t('слабее всего:')} <span translate="no">{r.weakest_step}</span></span>}</>
                    )}
                  </div>
                  {quote && <blockquote className="q-quote" translate="no">«{quote}»</blockquote>}
                  {!r.top_violation && !quote && r.open_objection && (
                    <div className="q-quote">{L(`Возражение «${objectionLabel(r.open_objection)}» без ответа`, `Objection “${t(objectionLabel(r.open_objection))}” unanswered`)}</div>
                  )}
                  <div className="q-meta">
                    <span className="avatar" aria-hidden="true" translate="no">{initials(r.seller_name) || '?'}</span>
                    <b translate="no">{r.seller_name || '—'}</b>
                    {r.store_name && <span translate="no">{r.store_name}</span>}
                    <span aria-hidden="true">·</span>
                    <span>{when.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}, {when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <div className="q-side">
                  <div className="fp-row">
                    <Fingerprint data={fp} height={30} />
                    <span className="fp-dur">{r.duration_seconds ? clock(r.duration_seconds) : '—'}</span>
                  </div>
                  <div className="q-actions">
                    {at != null && (
                      <Link className="btn btn-sm" to={`/conversations/${r.id}?t=${Math.max(0, at - 1)}`} aria-label={L(`Прослушать с ${clock(at)}`, `Listen from ${clock(at)}`)}>
                        <Play size={13} aria-hidden="true" /><span className="mono">{clock(at)}</span>
                      </Link>
                    )}
                    <Link className="btn btn-sm btn-ghost" to={`/conversations/${r.id}`}>{t('Открыть')}</Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="panel-foot">
        <span>{rest > 0 ? L(`Ещё ${rest} ${plural(rest, ['разговор', 'разговора', 'разговоров'], ['', ''])} в очереди`, `${rest} more in the queue`) : t('Это вся очередь за период')}</span>
        <Link className="link" to={`/conversations?view=${tab}`}>{t('Открыть всю очередь')}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </section>
  )
}

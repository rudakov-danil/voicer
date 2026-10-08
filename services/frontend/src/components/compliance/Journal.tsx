import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { OctagonAlert, TriangleAlert, Info, Play } from 'lucide-react'
import { complianceApi, type ComplianceRule, type ComplianceSummary } from '@/api/compliance'
import { dashboardApi } from '@/api/dashboard'
import { clock } from '@/components/ui/Fingerprint'
import { Delta } from '@/components/ui/Spark'
import { initials } from '@/lib/format'
import { t, L, locale, plural } from '@/i18n'

/* «Комплаенс» по концепту (ui-concept/compliance.html): показатели, журнал нарушений
   со статусом разбора и правила с числом нарушений за период. Статус разбора берём
   из плана разбора с продавцом: разговор в плане — «В плане разбора», разобран — «Разобрано». */

type Review = 'waiting' | 'planned' | 'done'
const reviewOf = (r: string | null | undefined): Review => (r === 'done' ? 'done' : r === 'open' ? 'planned' : 'waiting')
const REVIEW: Record<Review, { label: string; tone: string }> = {
  waiting: { label: 'Ждёт разбора', tone: 'is-crit' },
  planned: { label: 'В плане разбора', tone: 'is-info' },
  done: { label: 'Разобрано', tone: 'is-good' },
}

export function useComplianceSummary(period: number) {
  return useQuery({ queryKey: ['compliance-summary', period], queryFn: () => complianceApi.getSummary({ period, recent_limit: 200 }) })
}

/* ─── Показатели ─────────────────────────────────────────────────────────── */
export function ComplianceKpis({ period, summary, rules }: { period: number; summary?: ComplianceSummary; rules: ComplianceRule[] }) {
  const { data: prev } = useQuery({
    queryKey: ['compliance-summary', period, 'prev'],
    queryFn: () => {
      const to = new Date(); to.setDate(to.getDate() - period - 1)
      const from = new Date(to); from.setDate(from.getDate() - period)
      const iso = (d: Date) => d.toISOString().split('T')[0]
      return complianceApi.getSummary({ date_from: iso(from), date_to: iso(to), recent_limit: 1 })
    },
  })
  const tot = summary?.totals
  const clean = tot && tot.total_conversations ? (1 - tot.conversations_with_violations / tot.total_conversations) * 100 : null
  const waiting = new Map<string, string>()
  for (const v of summary?.recent || []) if (reviewOf(v.review) === 'waiting') waiting.set(v.conversation_id, v.session_date)
  const oldest = [...waiting.values()].sort()[0]
  const oldestDays = oldest ? Math.max(0, Math.round((Date.now() - new Date(`${oldest}T00:00:00`).getTime()) / 86400_000)) : null
  const active = rules.filter((r) => r.is_active).length
  return (
    <div className="cp-kpis">
      <section className="panel"><div className="kpi">
        <div className="kpi-label">{t('Нарушений за период')}</div>
        <div className="kpi-value">{tot?.total_violations ?? '—'}</div>
        <div className="kpi-foot">
          {tot && prev && <Delta value={tot.total_violations - prev.totals.total_violations} goodWhenUp={false} />}
          <span>{t('к прошлому периоду')}</span>
        </div>
      </div></section>
      <section className="panel"><div className="kpi">
        <div className="kpi-label">{t('Разговоров без нарушений')}</div>
        <div className="kpi-value">{clean != null ? clean.toLocaleString(locale, { maximumFractionDigits: 1 }) : '—'}<small>&nbsp;%</small></div>
        <div className="kpi-foot"><span>{tot ? L(`из ${tot.total_conversations}`, `of ${tot.total_conversations}`) : ''}</span></div>
      </div></section>
      <section className="panel"><div className="kpi">
        <div className="kpi-label">{t('Ждут разбора')}</div>
        <div className="kpi-value">{waiting.size}</div>
        <div className="kpi-foot"><span>{oldestDays != null
          ? L(`${plural(waiting.size, ['разговор', 'разговора', 'разговоров'], ['', ''])}, самое старое — ${oldestDays} ${plural(oldestDays, ['день', 'дня', 'дней'], ['', ''])}`,
            `conversation${waiting.size === 1 ? '' : 's'}, oldest — ${oldestDays} day${oldestDays === 1 ? '' : 's'}`)
          : t('все нарушения взяты в разбор')}</span></div>
      </div></section>
      <section className="panel"><div className="kpi">
        <div className="kpi-label">{t('Активных правил')}</div>
        <div className="kpi-value">{active}</div>
        <div className="kpi-foot"><span>{L(`из ${rules.length}`, `of ${rules.length}`)}</span></div>
      </div></section>
    </div>
  )
}

/* ─── Журнал нарушений ──────────────────────────────────────────────────── */
export function ViolationJournal({ summary }: { summary?: ComplianceSummary }) {
  const [tab, setTab] = useState<'all' | Review>('all')
  const items = summary?.recent || []
  const ids = [...new Set(items.map((v) => v.conversation_id))].slice(0, 100)
  const { data: fps } = useQuery({
    queryKey: ['fingerprints', ids.join(',')],
    queryFn: () => dashboardApi.getFingerprints(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const count = (r: Review) => items.filter((v) => reviewOf(v.review) === r).length
  const shown = items.filter((v) => tab === 'all' || reviewOf(v.review) === tab)
  const momentOf = (v: (typeof items)[number]) => {
    const fp = fps?.[v.conversation_id]
    const m = fp?.marks.find((x) => (x.k === 'crit' || x.k === 'crit-mid') && x.label === v.rule_title)
    return fp && m ? Math.max(0, Math.round(m.t * fp.dur)) : null
  }
  return (
    <section className="panel" aria-labelledby="jr-title">
      <div className="panel-head">
        <div>
          <h2 id="jr-title" className="panel-title">{t('Журнал нарушений')}</h2>
          <div className="panel-sub">{t('Каждая запись ведёт к моменту разговора')}</div>
        </div>
      </div>
      <div className="cp-chips" role="group" aria-label={t('Фильтр журнала')}>
        {([['all', 'Все', items.length], ['waiting', 'Ждут разбора', count('waiting')], ['planned', 'В плане разбора', count('planned')], ['done', 'Разобрано', count('done')]] as const).map(([k, label, n]) => (
          <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{t(label)} <span className="muted">{n}</span></button>
        ))}
      </div>
      {shown.length === 0 ? <div className="empty" style={{ padding: '32px 18px' }}><p>{t('Нарушений нет.')}</p></div> : (
        <div className="table-wrap">
          <table className="table jr-table">
            <thead><tr>
              <th scope="col">{t('Когда')}</th>
              <th scope="col">{t('Продавец')}</th>
              <th scope="col">{t('Правило и цитата')}</th>
              <th scope="col">{t('Статус')}</th>
            </tr></thead>
            <tbody>
              {shown.map((v) => {
                const d = new Date(v.recorded_at || `${v.session_date}T00:00:00`)
                const at = momentOf(v)
                const rv = REVIEW[reviewOf(v.review)]
                return (
                  <tr key={v.id}>
                    <td className="jr-when">
                      {v.recorded_at && <b>{d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</b>}
                      <span>{d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </td>
                    <td>
                      <span className="person">
                        <span className="avatar" aria-hidden="true" translate="no">{initials(v.seller_name) || '?'}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="person-name" translate="no">{v.seller_name || '—'}</span>
                          <span className="person-sub" translate="no">{v.store_name}</span>
                        </span>
                      </span>
                    </td>
                    <td className="jr-rule">
                      <b translate="no">{v.rule_title}</b>
                      {v.evidence && <blockquote className="q-quote" translate="no">«{v.evidence}»</blockquote>}
                    </td>
                    <td className="jr-status">
                      <span className={`flag ${rv.tone}`}>{t(rv.label)}</span>
                      <Link className="btn btn-sm" to={`/conversations/${v.conversation_id}${at != null ? `?t=${Math.max(0, at - 1)}` : ''}`}
                        aria-label={at != null ? L(`Прослушать с ${clock(at)}`, `Listen from ${clock(at)}`) : t('Открыть разговор')}>
                        <Play size={13} aria-hidden="true" /><span className="mono">{at != null ? clock(at) : t('Открыть')}</span>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ─── Правила: важность, число нарушений за период, включение ───────────── */
export function RulesOverview({ rules, summary, onManage }: { rules: ComplianceRule[]; summary?: ComplianceSummary; onManage: () => void }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: (r: ComplianceRule) => complianceApi.patchRule(r.id, { is_active: !r.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance-rules'] }),
  })
  const counts = new Map((summary?.by_rule || []).map((b) => [b.rule_id, b.affected_conversations]))
  const rank = { high: 3, medium: 2, low: 1 } as const
  const sorted = [...rules].sort((a, b) => (rank[b.severity] - rank[a.severity]) || ((counts.get(b.id) || 0) - (counts.get(a.id) || 0)))
  return (
    <section className="panel" aria-labelledby="rl-title">
      <div className="panel-head">
        <div>
          <h2 id="rl-title" className="panel-title">{t('Правила')}</h2>
          <div className="panel-sub">{t('Сначала — высокая важность · число — разговоры с нарушением за период')}</div>
        </div>
        <button type="button" className="link" onClick={onManage}>{t('Изменить')}</button>
      </div>
      <div className="panel-body">
        {sorted.length === 0 && <p className="muted">{t('Правил пока нет.')}</p>}
        {sorted.map((r) => {
          const n = counts.get(r.id) || 0
          return (
            <div key={r.id} className={`rl ${r.is_active ? '' : 'is-off'}`}>
              <span className={`q-sev vio-sev ${r.severity === 'high' ? 'is-crit' : r.severity === 'medium' ? 'is-warn' : 'is-plain'}`} aria-hidden="true">
                {r.severity === 'high' ? <OctagonAlert size={15} /> : r.severity === 'medium' ? <TriangleAlert size={15} /> : <Info size={15} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="rl-title" translate="no">{r.title}</div>
                {r.description && <div className="rl-desc" translate="no">{r.description}</div>}
                <div className="rl-meta">
                  <span className="tag tag-neutral">{r.keywords?.length ? t('Словарь + ИИ') : t('ИИ по смыслу')}</span>
                  <span className={n ? 'rl-n is-bad' : 'rl-n'}>{n}</span> {t('за период')}
                </div>
              </div>
              <button type="button" role="switch" aria-checked={r.is_active} className="cv-switch" aria-label={r.is_active ? t('Выключить правило') : t('Включить правило')}
                onClick={() => toggle.mutate(r)} disabled={toggle.isPending}>
                <span className="cv-switch-track" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

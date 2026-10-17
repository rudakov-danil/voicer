import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { clinicApi, type VisitView } from '@/api/clinic'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useTerms } from '@/lib/terms'
import { num } from '@/components/upsells/metrics'
import { ProtocolBadge, Score, SignalChip, minutes, useClinicRange } from '@/components/clinic/shared'
import { L, locale, t } from '@/i18n'

/* Приёмы: список с протоколом, баллами и сигналами. Подборки — как в сайдбаре:
   ?view=fraud|issues|low|draft. Фильтры и поиск — в адресе, ссылкой можно поделиться. */

const VIEWS: Array<{ id: VisitView; label: [string, string]; hint?: [string, string] }> = [
  { id: 'all', label: ['Все', 'All'] },
  { id: 'fraud', label: ['Сигналы фрода', 'Fraud signals'] },
  { id: 'issues', label: ['Нарушения', 'Violations'] },
  { id: 'low', label: ['Низкое качество', 'Low quality'], hint: ['Сервис или компетентность ниже 50 % — выполнено меньше половины правил', 'Service or competence below 50% — fewer than half of the rules done'] },
  { id: 'draft', label: ['Протокол не подтверждён', 'Note not confirmed'] },
  { id: 'non_visit', label: ['Не приём', 'Not a visit'] },
]
const PAGE = 50

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

export function VisitsPage() {
  const terms = useTerms()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as VisitView) || 'all'
  const store = params.get('store') || ''
  const seller = params.get('seller') || ''
  const [q, setQ] = useState(params.get('q') || '')
  const [limit, setLimit] = useState(PAGE)
  const range = useClinicRange(store)

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
    setLimit(PAGE)
  }
  // Поиск — с паузой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    const id = setTimeout(() => { if ((params.get('q') || '') !== q.trim()) set({ q: q.trim() || undefined }) }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const query = { ...range, view, seller_id: seller || undefined, q: params.get('q') || undefined, limit, with_counts: true }
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['clinic-visits', query],
    queryFn: () => clinicApi.visits(query),
    placeholderData: keepPreviousData,
  })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60_000 })
  const { data: sellers } = useQuery({
    queryKey: ['admin-sellers', store],
    queryFn: () => adminApi.getSellers({ store_id: store || undefined, is_active: true, limit: 200 }),
    staleTime: 5 * 60_000,
  })
  const activeStores = (stores?.items || []).filter((s) => s.is_active !== false)
  const counts = data?.counts

  return (
    <div className="cl">
      <div className="tabs" role="tablist" aria-label={L('Подборки', 'Views')}>
        {VIEWS.filter((v) => v.id !== 'non_visit' || (counts?.non_visit ?? 0) > 0).map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`tab ${view === v.id ? 'active' : ''}`}
            title={v.hint ? L(...v.hint) : undefined} onClick={() => set({ view: v.id === 'all' ? undefined : v.id })}>
            {L(...v.label)}{counts && <span className="count">{num(counts[v.id] ?? 0)}</span>}
          </button>
        ))}
      </div>
      <div className="cl-toolbar">
        {user?.role !== 'manager' && activeStores.length > 1 && (
          <select className="select-pill" value={store} aria-label={t(terms.store)} onChange={(e) => set({ store: e.target.value || undefined, seller: undefined })}>
            <option value="">{t(terms.allStores)}</option>
            {activeStores.map((s) => <option key={s.id} value={s.id} translate="no">{s.name}</option>)}
          </select>
        )}
        <select className="select-pill" value={seller} aria-label={L('Врач', 'Doctor')} onChange={(e) => set({ seller: e.target.value || undefined })}>
          <option value="">{L('Все врачи', 'All doctors')}</option>
          {(sellers?.items || []).map((s) => <option key={s.id} value={s.id} translate="no">{s.first_name} {s.last_name}</option>)}
        </select>
        <label className="cl-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Причина, диагноз или врач', 'Reason, diagnosis or doctor')}
            aria-label={L('Поиск по приёмам', 'Search visits')} />
        </label>
      </div>

      <section className="panel">
        {isError ? (
          <div className="up-empty">{L('Не удалось загрузить приёмы. Обновите страницу.', 'Could not load visits. Refresh the page.')}</div>
        ) : isLoading || !data ? (
          <div className="page-loading" role="status">{t('Загрузка...')}</div>
        ) : data.items.length === 0 ? (
          <div className="up-empty">{L('Приёмов с такими условиями нет.', 'No visits match these filters.')}</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th scope="col">{L('Когда', 'When')}</th>
                    <th scope="col">{L('Врач', 'Doctor')}</th>
                    <th scope="col">{L('Причина и диагноз', 'Reason and diagnosis')}</th>
                    <th scope="col" className="t-num">{L('Длит.', 'Length')}</th>
                    <th scope="col" className="t-num">{L('Сервис', 'Service')}</th>
                    <th scope="col" className="t-num">{L('Компет.', 'Compet.')}</th>
                    <th scope="col">{L('Сигналы', 'Signals')}</th>
                    <th scope="col">{L('Протокол', 'Note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v) => (
                    <tr key={v.conversation_id} tabIndex={0} onClick={() => navigate(`/visits/${v.conversation_id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/visits/${v.conversation_id}`) }}>
                      <td className="cl-time">{v.time}<span>{fmtDay(v.session_date)}</span></td>
                      <td><div className="cl-who"><b translate="no">{v.seller_name}</b><span translate="no">{v.store_name}</span></div></td>
                      <td>
                        <div className="cl-reason">
                          <b translate="no">{v.is_visit ? (v.reason || '—') : L('Не приём пациента', 'Not a patient visit')}</b>
                          {v.diagnosis && v.diagnosis !== v.reason && <span translate="no">{v.diagnosis}</span>}
                        </div>
                      </td>
                      <td className="t-num">{minutes(v.duration_sec)}</td>
                      <td className="t-num"><Score value={v.service} /></td>
                      <td className="t-num"><Score value={v.competence} /></td>
                      <td>{v.signals.length ? <div className="cl-signals">{v.signals.map((x, i) => <SignalChip key={i} {...x} />)}</div> : <span className="cl-muted">—</span>}</td>
                      <td><ProtocolBadge status={v.is_visit ? v.protocol_status : null} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > data.items.length && limit < 200 && (
              <div className="cl-more">
                <button type="button" className="btn btn-outline" disabled={isFetching} onClick={() => setLimit((n) => Math.min(200, n + PAGE))}>
                  {L(`Показать ещё · ${num(data.items.length)} из ${num(data.total)}`, `Show more · ${num(data.items.length)} of ${num(data.total)}`)}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

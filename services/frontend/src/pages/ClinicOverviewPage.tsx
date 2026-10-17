import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { clinicApi, type ClinicOverview, type CriterionRow, type DoctorRow } from '@/api/clinic'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useOrganization, useTerms } from '@/lib/terms'
import { num, pct } from '@/components/upsells/metrics'
import {
  CATEGORY, HINT, Score, SignalChip, Tile, minutes, onVisits, signalsN, useClinicRange, visitsN, visitsOf, weekLabel,
} from '@/components/clinic/shared'
import { L, t } from '@/i18n'

/* Обзор клиники: качество приёмов за период, кого и что разобрать в первую очередь.
   Определения цифр — в подсказках «?» (components/clinic/shared.tsx, HINT). */

const quoted = (s: string) => L(`«${s}»`, `“${s}”`)

export function ClinicOverviewPage() {
  const terms = useTerms()
  const user = useAuthStore((s) => s.user)
  const { data: org } = useOrganization()
  const [store, setStore] = useState('')
  const range = useClinicRange(store)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['clinic-overview', range],
    queryFn: () => clinicApi.overview(range),
  })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores(), staleTime: 5 * 60_000 })
  const active = (stores?.items || []).filter((s) => s.is_active !== false)

  return (
    <div className="cl">
      <div className="cl-toolbar">
        {user?.role !== 'manager' && active.length > 1 && (
          <select className="select-pill" value={store} aria-label={t(terms.store)} onChange={(e) => setStore(e.target.value)}>
            <option value="">{t(terms.allStores)}</option>
            {active.map((s) => <option key={s.id} value={s.id} translate="no">{s.name}</option>)}
          </select>
        )}
        {org?.slug === 'medicine-demo' && (
          <span className="cl-demo">{L('Демо-данные: клиники, врачи и приёмы вымышлены.', 'Demo data: clinics, doctors and visits are fictional.')}</span>
        )}
      </div>
      {isError ? (
        <div className="panel up-empty">{L('Не удалось загрузить обзор. Обновите страницу.', 'Could not load the overview. Refresh the page.')}</div>
      ) : isLoading || !data ? (
        <div className="page-loading" role="status">{t('Загрузка...')}</div>
      ) : data.totals.visits === 0 ? (
        <div className="panel up-empty">
          {L('За период приёмов нет. Приёмы появляются через несколько минут после того, как врач остановил запись в приложении.',
            'No visits for the period. Visits appear a few minutes after the doctor stops the recording in the app.')}
        </div>
      ) : (
        <Overview data={data} />
      )}
    </div>
  )
}

function Overview({ data }: { data: ClinicOverview }) {
  const navigate = useNavigate()
  const s = data.totals
  const confirmed = s.protocols ? s.protocols_confirmed / s.protocols : null
  return (
    <>
      <div className="m-tiles">
        <Tile title={L('Приёмы', 'Visits')} hint={HINT.visits} value={num(s.visits)}
          base={L(`в среднем ${minutes(s.avg_duration_sec)} на приём`, `${minutes(s.avg_duration_sec)} per visit on average`)} />
        <Tile title={L('Сервис', 'Service')} hint={HINT.service} value={<Score value={s.service} />}
          base={L(`по ${num(s.service_visits)} ${s.service_visits === 1 ? 'приёму' : 'приёмам'}`, `across ${num(s.service_visits)} visits`)} />
        <Tile title={L('Компетентность', 'Competence')} hint={HINT.competence} value={<Score value={s.competence} />}
          base={L(`по ${num(s.competence_visits)} ${s.competence_visits === 1 ? 'приёму' : 'приёмам'}`, `across ${num(s.competence_visits)} visits`)} />
        <Tile title={L('Сигналы фрода', 'Fraud signals')} hint={HINT.fraud} value={num(s.fraud_signals)}
          base={s.fraud_signals ? onVisits(s.fraud_visits, s.visits) : L('не найдено', 'none found')} />
        <Tile title={L('Нарушения', 'Violations')} hint={HINT.issues} value={num(s.issue_signals)}
          base={s.issue_signals ? onVisits(s.issue_visits, s.visits) : L('не найдено', 'none found')} />
        <Tile title={L('Протоколы подтверждены', 'Notes confirmed')} hint={HINT.protocols} value={pct(confirmed)}
          base={L(`${num(s.protocols_confirmed)} из ${num(s.protocols)}`, `${num(s.protocols_confirmed)} of ${num(s.protocols)}`)} />
      </div>

      <div className="cl-grid">
        <section className="panel" aria-labelledby="cl-attn">
          <div className="panel-head">
            <div>
              <h2 id="cl-attn" className="panel-title">{L('Разобрать в первую очередь', 'Review first')}</h2>
              <div className="panel-sub">{L('Свежие сигналы фрода и нарушения — сначала серьёзные. Цитата — из расшифровки приёма.',
                'Latest fraud signals and violations, most serious first. Quotes come from the visit transcript.')}</div>
            </div>
          </div>
          <div className="cl-panel-body">
            {data.attention.length === 0 ? (
              <p className="cl-muted">{L('За период нарушений и сигналов фрода нет.', 'No violations or fraud signals for the period.')}</p>
            ) : (
              <ul className="cl-queue">
                {data.attention.map((a, i) => (
                  <li key={i}>
                    <button type="button" className="cl-q" onClick={() => navigate(`/visits/${a.conversation_id}`)}>
                      <span className="cl-q-title"><SignalChip title={a.title} category={a.category} severity={a.severity} /></span>
                      <span className="cl-q-when">{a.when}</span>
                      <span className="cl-q-quote" translate="no">{quoted(a.quote)}</span>
                      <span className="cl-q-meta"><span translate="no">{a.seller_name}</span> · <span translate="no">{a.store_name}</span>{a.reason ? <> · <span translate="no">{a.reason}</span></> : null}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="cl-sig">
          <div className="panel-head">
            <div>
              <h2 id="cl-sig" className="panel-title">{L('Сигналы по правилам', 'Signals by rule')}</h2>
              <div className="panel-sub">{L('Что из запрещённого правилами прозвучало на приёмах и у каких врачей.', 'Which prohibited things came up and with which doctors.')}</div>
            </div>
          </div>
          <div className="cl-panel-body">
            {data.signals.length === 0 ? (
              <p className="cl-muted">{L('Ни одно правило «не должно быть» не сработало.', 'No “must not” rule was triggered.')}</p>
            ) : (
              <ul className="cl-sig-list">
                {data.signals.map((x) => (
                  <li key={x.rule_id}>
                    <div className="cl-sig-head">
                      <SignalChip title={x.title} category={x.category} severity={x.severity} />
                      <span className="cl-sig-n">{signalsN(x.count)}</span>
                    </div>
                    <div className="cl-sig-who" translate="no">
                      {x.doctors.slice(0, 3).map((d) => `${d.name} — ${d.count}`).join(' · ')}
                      {x.doctors.length > 3 ? L(` · ещё ${x.doctors.length - 3}`, ` · ${x.doctors.length - 3} more`) : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <DoctorsTable rows={data.doctors} />

      <div className="cl-grid">
        <Criteria rows={data.criteria} />
        <Weeks weeks={data.weeks} />
      </div>
    </>
  )
}

export function DoctorsTable({ rows, title }: { rows: DoctorRow[]; title?: string }) {
  const navigate = useNavigate()
  return (
    <section className="panel" aria-labelledby="cl-docs">
      <div className="panel-head">
        <div>
          <h2 id="cl-docs" className="panel-title">{title ?? L('Врачи', 'Doctors')}</h2>
          <div className="panel-sub">{L('Слабые места — по цвету и числу. Нажмите на врача, чтобы открыть разбор по правилам и сигналы с цитатами.',
            'Weak spots by colour and number. Click a doctor to see rules and quoted signals.')}</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="cl-table">
          <thead>
            <tr>
              <th scope="col">{L('Врач', 'Doctor')}</th>
              <th scope="col" className="t-num">{L('Приёмы', 'Visits')}</th>
              <th scope="col" className="t-num">{L('Длительность', 'Duration')}</th>
              <th scope="col" className="t-num">{L('Сервис', 'Service')}</th>
              <th scope="col" className="t-num">{L('Компетентность', 'Competence')}</th>
              <th scope="col" className="t-num">{L('Фрод', 'Fraud')}</th>
              <th scope="col" className="t-num">{L('Нарушения', 'Violations')}</th>
              <th scope="col" className="t-num">{L('Протоколы подтверждены', 'Notes confirmed')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.seller_id} tabIndex={0} onClick={() => navigate(`/doctors/${d.seller_id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/doctors/${d.seller_id}`) }}>
                <td>
                  <div className="cl-who">
                    <b translate="no">{d.name}</b>
                    <span translate="no">{[d.specialty, d.store_name].filter(Boolean).join(' · ')}</span>
                  </div>
                </td>
                <td className="t-num">{num(d.visits)}</td>
                <td className="t-num">{d.visits ? minutes(d.avg_duration_sec) : '—'}</td>
                <td className="t-num"><Score value={d.service} /></td>
                <td className="t-num"><Score value={d.competence} /></td>
                <td className="t-num">{d.fraud_signals ? <span className="cl-score is-crit">{num(d.fraud_signals)}</span> : '—'}</td>
                <td className="t-num">{d.issue_signals ? <span className="cl-score is-warn">{num(d.issue_signals)}</span> : '—'}</td>
                <td className="t-num">{d.protocols ? `${pct(d.protocols_confirmed / d.protocols)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function Criteria({ rows, compare }: { rows: CriterionRow[]; compare?: boolean }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, 8)
  return (
    <section className="panel" aria-labelledby="cl-crit">
      <div className="panel-head">
        <div>
          <h2 id="cl-crit" className="panel-title">{L('Что чаще всего упускают', 'What is missed most')}</h2>
          <div className="panel-sub">
            {compare
              ? L('Доля приёмов, где правило выполнено. Чёрная отметка — та же доля по всей клинике врача.',
                'Share of visits where the rule was done. The black mark is the same share across the doctor’s clinic.')
              : L('Доля приёмов, где правило выполнено (частично — за половину). Приёмы, где правило не применимо, не считаются.',
                'Share of visits where the rule was done (partly counts as half). Visits where it does not apply are excluded.')}
          </div>
        </div>
        <ShieldCheck size={18} aria-hidden="true" className="muted" />
      </div>
      <div className="cl-panel-body">
        {rows.length === 0 ? <p className="cl-muted">{L('Пока нет проверок по правилам.', 'No rule checks yet.')}</p> : (
          <ul className="cl-crit-list">
            {shown.map((c) => {
              const tone = c.rate == null ? '' : c.rate >= 0.8 ? '' : c.rate >= 0.5 ? 'is-warn' : 'is-crit'
              return (
                <li key={c.rule_id || c.title} className="cl-crit">
                  <div>
                    <div className="cl-crit-title">
                      <span translate="no">{c.title}</span>
                      <span className="cl-cat">{L(...CATEGORY[c.category])}</span>
                    </div>
                    <div className="cl-crit-base">
                      {L(`выполнено в ${num(c.met)} ${visitsOf(c.applicable)}`, `done in ${num(c.met)} of ${num(c.applicable)} visits`)}
                      {c.partial ? L(`, частично — ${num(c.partial)}`, `, partly in ${num(c.partial)}`) : ''}
                      {compare && c.team_rate != null ? L(` · по клинике ${pct(c.team_rate)}`, ` · clinic ${pct(c.team_rate)}`) : ''}
                    </div>
                  </div>
                  <div className="cl-bar" aria-hidden="true">
                    <i className={tone} style={{ width: `${Math.round((c.rate ?? 0) * 100)}%` }} />
                    {compare && c.team_rate != null && <b style={{ left: `calc(${Math.round(c.team_rate * 100)}% - 1px)` }} />}
                  </div>
                  <span className="t-num">{pct(c.rate)}</span>
                </li>
              )
            })}
          </ul>
        )}
        {rows.length > 8 && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setAll((v) => !v)}>
            {all ? L('Свернуть', 'Collapse') : L(`Все правила (${rows.length})`, `All rules (${rows.length})`)}
          </button>
        )}
      </div>
    </section>
  )
}

export function Weeks({ weeks }: { weeks: ClinicOverview['weeks'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.visits))
  return (
    <section className="panel" aria-labelledby="cl-weeks">
      <div className="panel-head">
        <div>
          <h2 id="cl-weeks" className="panel-title">{L('По неделям', 'By week')}</h2>
          <div className="panel-sub">{L('Неделя — с понедельника. Неделя, в которую попала только часть периода, помечена: по ней мало приёмов.',
            'Weeks start on Monday. A week only partly inside the period is marked: it has few visits.')}</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="cl-table">
          <thead>
            <tr>
              <th scope="col">{L('Неделя', 'Week')}</th>
              <th scope="col" className="t-num">{L('Приёмы', 'Visits')}</th>
              <th scope="col" className="t-num">{L('Сервис', 'Service')}</th>
              <th scope="col" className="t-num">{L('Компетентность', 'Competence')}</th>
              <th scope="col" className="t-num">{L('Фрод', 'Fraud')}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week} style={{ cursor: 'default' }}>
                <td>{L(`с ${weekLabel(w.week)}`, `from ${weekLabel(w.week)}`)}{w.visits < max * 0.4 && <span className="cl-muted">{L(' · неполная', ' · partial')}</span>}</td>
                <td className="t-num">{visitsN(w.visits)}</td>
                <td className="t-num"><Score value={w.service} /></td>
                <td className="t-num"><Score value={w.competence} /></td>
                <td className="t-num">{w.fraud_signals || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Copy, ExternalLink, Smartphone } from 'lucide-react'
import { clinicApi, type Invitation } from '@/api/clinic'
import { useAuthStore } from '@/store/authStore'
import { num, pct } from '@/components/upsells/metrics'
import { toast } from '@/components/ui/Toast'
import { HINT, ProtocolBadge, Score, SignalChip, Tile, minutes, onVisits, useClinicRange } from '@/components/clinic/shared'
import { Criteria, DoctorsTable, Weeks } from '@/pages/ClinicOverviewPage'
import { L, t } from '@/i18n'

/* Врачи: список с баллами и сигналами; страница врача — разбор по правилам в сравнении с его
   клиникой, сигналы с цитатами, последние приёмы и подключение приложения врача. */

export function DoctorsPage() {
  const range = useClinicRange()
  const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-overview', range], queryFn: () => clinicApi.overview(range) })
  if (isError) return <div className="panel up-empty">{L('Не удалось загрузить врачей. Обновите страницу.', 'Could not load doctors. Refresh the page.')}</div>
  if (isLoading || !data) return <div className="page-loading" role="status">{t('Загрузка...')}</div>
  return <div className="cl"><DoctorsTable rows={data.doctors} title={L(`Врачи · ${data.doctors.length}`, `Doctors · ${data.doctors.length}`)} /></div>
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const quoted = (s: string) => L(`«${s}»`, `“${s}”`)

export function DoctorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const range = useClinicRange()
  const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-doctor', id, range], queryFn: () => clinicApi.doctor(id, range), enabled: !!id })
  const { data: recent } = useQuery({
    queryKey: ['clinic-visits', 'doctor', id, range],
    queryFn: () => clinicApi.visits({ ...range, seller_id: id, limit: 10 }),
    enabled: !!id,
  })
  if (isError) return <div className="panel up-empty">{L('Врач не найден или недоступен.', 'The doctor was not found or is not available.')}</div>
  if (isLoading || !data) return <div className="page-loading" role="status">{t('Загрузка...')}</div>
  const s = data.totals
  const team = data.team
  const vsTeam = (mine: number | null, all: number | null) =>
    mine == null || all == null ? undefined : L(`по клинике ${pct(all)}`, `clinic ${pct(all)}`)

  return (
    <div className="cl">
      <nav className="cl-crumbs" aria-label={L('Навигация', 'Breadcrumbs')}>
        <Link to="/doctors">{L('Врачи', 'Doctors')}</Link><ChevronRight aria-hidden="true" /><span translate="no">{data.doctor.name}</span>
      </nav>
      <header className="cl-doc-head">
        <span className="avatar" aria-hidden="true" translate="no">{initials(data.doctor.name)}</span>
        <div>
          <h1 className="cl-doc-name" translate="no">{data.doctor.name}</h1>
          <div className="cl-doc-sub">
            <Specialty id={id} value={data.doctor.specialty} />
            <span translate="no">{data.doctor.store_name}</span>
          </div>
        </div>
      </header>

      <div className="m-tiles">
        <Tile title={L('Приёмы', 'Visits')} hint={HINT.visits} value={num(s.visits)}
          base={L(`в среднем ${minutes(s.avg_duration_sec)}; по клинике — ${minutes(team.avg_duration_sec)}`, `${minutes(s.avg_duration_sec)} on average; clinic ${minutes(team.avg_duration_sec)}`)} />
        <Tile title={L('Сервис', 'Service')} hint={HINT.service} value={<Score value={s.service} />} base={vsTeam(s.service, team.service)} />
        <Tile title={L('Компетентность', 'Competence')} hint={HINT.competence} value={<Score value={s.competence} />} base={vsTeam(s.competence, team.competence)} />
        <Tile title={L('Сигналы фрода', 'Fraud signals')} hint={HINT.fraud} value={num(s.fraud_signals)}
          base={s.fraud_signals ? onVisits(s.fraud_visits, s.visits) : L('не найдено', 'none found')} />
        <Tile title={L('Нарушения', 'Violations')} hint={HINT.issues} value={num(s.issue_signals)}
          base={s.issue_signals ? onVisits(s.issue_visits, s.visits) : L('не найдено', 'none found')} />
        <Tile title={L('Протоколы подтверждены', 'Notes confirmed')} hint={HINT.protocols}
          value={pct(s.protocols ? s.protocols_confirmed / s.protocols : null)}
          base={L(`${num(s.protocols_confirmed)} из ${num(s.protocols)}`, `${num(s.protocols_confirmed)} of ${num(s.protocols)}`)} />
      </div>

      <div className="cl-grid">
        <Criteria rows={data.criteria} compare />
        <section className="panel" aria-labelledby="cl-doc-sig">
          <div className="panel-head">
            <div>
              <h2 id="cl-doc-sig" className="panel-title">{L('Сигналы с цитатами', 'Signals with quotes')}</h2>
              <div className="panel-sub">{L('Последние сработавшие запреты. Нажмите, чтобы открыть приём и проверить по записи.', 'Latest triggered prohibitions. Click to open the visit and check it.')}</div>
            </div>
          </div>
          <div className="cl-panel-body">
            {data.signals.length === 0 ? <p className="cl-muted">{L('За период нарушений и сигналов фрода нет.', 'No violations or fraud signals for the period.')}</p> : (
              <ul className="cl-queue">
                {data.signals.map((x, i) => (
                  <li key={i}>
                    <button type="button" className="cl-q" onClick={() => navigate(`/visits/${x.conversation_id}`)}>
                      <span className="cl-q-title"><SignalChip title={x.title} category={x.category} severity={x.severity} /></span>
                      <span className="cl-q-when">{x.when}</span>
                      <span className="cl-q-quote" translate="no">{quoted(x.quote)}</span>
                      {x.reason && <span className="cl-q-meta" translate="no">{x.reason}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="cl-grid">
        <section className="panel" aria-labelledby="cl-doc-recent">
          <div className="panel-head">
            <div>
              <h2 id="cl-doc-recent" className="panel-title">{L('Последние приёмы', 'Latest visits')}</h2>
            </div>
            <Link className="btn btn-ghost btn-sm" to={`/visits?seller=${id}`}>{L('Все приёмы врача', 'All visits')}</Link>
          </div>
          <div className="table-wrap">
            <table className="cl-table">
              <thead>
                <tr>
                  <th scope="col">{L('Когда', 'When')}</th>
                  <th scope="col">{L('Причина обращения', 'Reason')}</th>
                  <th scope="col" className="t-num">{L('Сервис', 'Service')}</th>
                  <th scope="col" className="t-num">{L('Компет.', 'Compet.')}</th>
                  <th scope="col">{L('Протокол', 'Note')}</th>
                </tr>
              </thead>
              <tbody>
                {(recent?.items || []).map((v) => (
                  <tr key={v.conversation_id} tabIndex={0} onClick={() => navigate(`/visits/${v.conversation_id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/visits/${v.conversation_id}`) }}>
                    <td className="cl-time">{v.time}<span>{new Date(`${v.session_date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></td>
                    <td><div className="cl-reason"><b translate="no">{v.reason || '—'}</b>{v.signals.length > 0 && <div className="cl-signals">{v.signals.map((x, i) => <SignalChip key={i} {...x} />)}</div>}</div></td>
                    <td className="t-num"><Score value={v.service} /></td>
                    <td className="t-num"><Score value={v.competence} /></td>
                    <td><ProtocolBadge status={v.protocol_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <Weeks weeks={data.weeks} />
      </div>

      <DoctorApp id={id} name={data.doctor.name} />
    </div>
  )
}

function Specialty({ id, value }: { id: string; value: string | null }) {
  const role = useAuthStore((s) => s.user?.role)
  const qc = useQueryClient()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const save = useMutation({
    mutationFn: () => clinicApi.setSpecialty(id, draft),
    onSuccess: () => { setEdit(false); qc.invalidateQueries({ queryKey: ['clinic-doctor', id] }); qc.invalidateQueries({ queryKey: ['clinic-overview'] }) },
    onError: () => toast(L('Не удалось сохранить специальность.', 'Could not save the specialty.')),
  })
  if (role === 'manager' && !edit) return <span translate="no">{value || L('Специальность не указана', 'No specialty')}</span>
  if (!edit) {
    return (
      <span className="cl-spec">
        <span translate="no">{value || L('Специальность не указана', 'No specialty')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(value || ''); setEdit(true) }}>{L('Изменить', 'Edit')}</button>
      </span>
    )
  }
  return (
    <span className="cl-spec">
      <input value={draft} maxLength={100} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label={L('Специальность', 'Specialty')}
        onKeyDown={(e) => { if (e.key === 'Enter') save.mutate(); if (e.key === 'Escape') setEdit(false) }} />
      <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>{L('Сохранить', 'Save')}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>{L('Отмена', 'Cancel')}</button>
    </span>
  )
}

/** Приложение врача: одноразовая ссылка подключения на 24 часа. Новая ссылка отключает прежний телефон. */
function DoctorApp({ id, name }: { id: string; name: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const connect = useMutation({
    mutationFn: () => clinicApi.invite(id),
    onSuccess: (data) => setInvitation(data),
    onError: () => toast(L('Не удалось создать ссылку. Попробуйте ещё раз.', 'Could not create the link. Try again.')),
  })
  const revoke = useMutation({
    mutationFn: () => clinicApi.revoke(id),
    onSuccess: () => { setInvitation(null); toast(L('Доступ врача к приложению отозван.', 'The doctor’s app access is revoked.')) },
    onError: () => toast(L('Не удалось отозвать доступ.', 'Could not revoke access.')),
  })
  const copy = async () => {
    if (!invitation) return
    try { await navigator.clipboard.writeText(invitation.url); toast(L('Ссылка скопирована.', 'Link copied.')) }
    catch { toast(L('Выделите и скопируйте ссылку из поля.', 'Select and copy the link from the field.')) }
  }
  return (
    <section className="panel" aria-labelledby="cl-app">
      <div className="panel-head">
        <div>
          <h2 id="cl-app" className="panel-title"><Smartphone size={17} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />{L('Приложение врача', 'Doctor app')}</h2>
          <div className="panel-sub">{L('В приложении два раздела: «Запись» — записать приём, и «Протокол» — проверить черновик протокола, поправить и подтвердить. Ссылка одноразовая, действует 24 часа; новая ссылка отключает прежний телефон.',
            'The app has two sections: “Record” to record a visit and “Note” to review, edit and confirm the draft note. The link is single-use and valid for 24 hours; a new link disconnects the previous phone.')}</div>
        </div>
      </div>
      <div className="cl-panel-body cl-app">
        <div className="cl-app-row">
          <button type="button" className="btn btn-primary" disabled={connect.isPending || revoke.isPending} onClick={() => connect.mutate()}>
            {connect.isPending ? L('Готовим…', 'Preparing…') : L('Создать ссылку подключения', 'Create a connection link')}
          </button>
          <button type="button" className="btn btn-outline" disabled={connect.isPending || revoke.isPending} onClick={() => revoke.mutate()}>{L('Отозвать доступ', 'Revoke access')}</button>
        </div>
        {invitation && (
          <div className="cl-app-link">
            <input readOnly value={invitation.url} onFocus={(e) => e.target.select()} aria-label={L(`Личная ссылка для ${name}`, `Personal link for ${name}`)} />
            <button type="button" className="btn btn-outline" onClick={copy}><Copy size={14} aria-hidden="true" />{L('Скопировать', 'Copy')}</button>
            <a className="btn btn-ghost" href={invitation.url} target="_blank" rel="noopener">{L('Открыть', 'Open')}<ExternalLink size={14} aria-hidden="true" /></a>
            <span className="cl-muted">{L(`Действует до ${new Date(invitation.expires_at).toLocaleString('ru-RU')}.`, `Valid until ${new Date(invitation.expires_at).toLocaleString('en-GB')}.`)}</span>
          </div>
        )}
      </div>
    </section>
  )
}

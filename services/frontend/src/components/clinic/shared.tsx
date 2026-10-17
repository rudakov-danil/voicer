import { useMemo, type ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CircleCheck, CircleDot, CircleX, Minus, OctagonAlert, TriangleAlert } from 'lucide-react'
import { periodRange } from '@/api/dashboard'
import type { CheckStatus, Protocol, RuleCategory, Severity } from '@/api/clinic'
import { Hint, num, pct } from '@/components/upsells/metrics'
import { L, plural } from '@/i18n'
import '@/styles/clinic.css'

/* Общее для экранов клиник: подписи, статусы правил, протокол приёма, определения метрик.
   Определения одни на всех экранах (см. память «понятные метрики»): у цифры — база и «?». */

export const CATEGORY: Record<RuleCategory, [string, string]> = {
  service: ['Сервис', 'Service'],
  competence: ['Компетентность', 'Competence'],
  fraud: ['Фрод', 'Fraud'],
}

export const STATUS: Record<CheckStatus, { label: [string, string]; cls: string }> = {
  met: { label: ['Выполнено', 'Done'], cls: 'is-good' },
  partial: { label: ['Частично', 'Partly'], cls: 'is-warn' },
  missed: { label: ['Не выполнено', 'Missed'], cls: 'is-crit' },
  na: { label: ['Не применимо', 'Not applicable'], cls: 'is-na' },
  violated: { label: ['Нарушение', 'Violation'], cls: 'is-crit' },
}

export const SEVERITY: Record<Severity, [string, string]> = {
  high: ['Серьёзное', 'High'],
  medium: ['Среднее', 'Medium'],
  low: ['Низкое', 'Low'],
}

export function StatusIcon({ status }: { status: CheckStatus }) {
  const Icon = status === 'met' ? CircleCheck : status === 'partial' ? CircleDot : status === 'na' ? Minus : CircleX
  return <Icon className={`cl-status-ico ${STATUS[status].cls}`} aria-label={L(...STATUS[status].label)} />
}

/** Доля 0..1 с тоном: 80 % и выше — хорошо, от 50 % — внимание, ниже — плохо. Число всегда видно. */
export function Score({ value, title }: { value: number | null | undefined; title?: string }) {
  if (value == null) return <span className="cl-score is-none" title={title}>—</span>
  const tone = value >= 0.8 ? 'is-good' : value >= 0.5 ? 'is-warn' : 'is-crit'
  return <span className={`cl-score ${tone}`} title={title}>{pct(value)}</span>
}

export function SignalChip({ title, category, severity }: { title: string; category: RuleCategory; severity: Severity }) {
  const fraud = category === 'fraud'
  return (
    <span className={`cl-signal ${fraud ? 'is-fraud' : 'is-issue'} sev-${severity}`}>
      {fraud ? <OctagonAlert aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
      {title}
    </span>
  )
}

export const PROTOCOL_STATUS: Record<string, [string, string]> = {
  draft: ['Черновик ИИ', 'AI draft'],
  confirmed: ['Подтверждён врачом', 'Confirmed by doctor'],
  failed: ['Не составлен', 'Not drafted'],
}

export function ProtocolBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="cl-proto-badge is-none">—</span>
  return <span className={`cl-proto-badge is-${status}`}>{L(...(PROTOCOL_STATUS[status] || [status, status]))}</span>
}

/** Протокол как в медкарте: только заполненные разделы, в порядке медкарты */
export function ProtocolSections({ fields, protocol, empty }: { fields: Array<[string, string]>; protocol: Protocol | null; empty?: ReactNode }) {
  const rows = fields.filter(([k]) => protocol?.[k])
  if (!rows.length) return <p className="cl-muted">{empty ?? L('Протокол пуст.', 'The note is empty.')}</p>
  return (
    <dl className="cl-protocol">
      {rows.map(([k, label]) => (
        <div key={k} className="cl-protocol-row">
          <dt>{label}</dt>
          <dd translate="no">{protocol![k]}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Текст протокола для вставки в МИС */
export function protocolText(fields: Array<[string, string]>, protocol: Protocol | null, header?: string): string {
  const body = fields.filter(([k]) => protocol?.[k]).map(([k, label]) => `${label}: ${protocol![k]}`).join('\n\n')
  return header ? `${header}\n\n${body}` : body
}

export const minutes = (sec: number | null | undefined) =>
  sec == null ? '—' : L(`${Math.max(1, Math.round(sec / 60))} мин`, `${Math.max(1, Math.round(sec / 60))} min`)

export const visitsN = (n: number) => L(`${num(n)} ${plural(n, ['приём', 'приёма', 'приёмов'], ['', ''])}`, `${num(n)} visit${n === 1 ? '' : 's'}`)
export const visitsOf = (n: number) => L(`из ${num(n)} ${plural(n, ['приёма', 'приёмов', 'приёмов'], ['', ''])}`, `of ${num(n)} visits`)
/** «на 59 приёмах из 2 600» — база для сигналов */
export const onVisits = (part: number, total: number) =>
  L(`на ${num(part)} ${plural(part, ['приёме', 'приёмах', 'приёмах'], ['', ''])} из ${num(total)}`, `in ${num(part)} of ${num(total)} visits`)
export const signalsN = (n: number) => L(`${num(n)} ${plural(n, ['сигнал', 'сигнала', 'сигналов'], ['', ''])}`, `${num(n)} signal${n === 1 ? '' : 's'}`)

/** Определения метрик клиник — одни на всех экранах */
export const HINT = {
  visits: L('Записи, в которых ИИ нашёл приём пациента. Длительность — от начала до конца записи.',
    'Recordings where the AI found a patient visit. Duration is from the start to the end of the recording.'),
  service: L('Доля выполненных правил группы «Сервис» на приёме: выполнено — 1, частично — ½, не выполнено — 0. «Не применимо» не входит. Среднее по приёмам.',
    'Share of “Service” rules done in a visit: done = 1, partly = ½, missed = 0; not applicable is excluded. Averaged over visits.'),
  competence: L('Доля выполненных правил группы «Компетентность»: сбор анамнеза, осмотр, обоснованность назначений, предупреждения. Считается так же, как сервис. Это подсказка ИИ для главврача, а не экспертиза качества медпомощи.',
    'Share of “Competence” rules done: history, examination, justified prescriptions, warnings. Counted like service. An AI hint for the head doctor, not a formal quality review.'),
  fraud: L('Сколько раз на приёмах прозвучало то, что запрещают правила группы «Фрод»: увод пациента, оплата мимо кассы, лишние услуги, справки без оснований. У каждого сигнала есть цитата — проверьте её по записи.',
    'How many times visits contained what the “Fraud” rules forbid: diverting patients, off-the-books payments, unnecessary services, unjustified certificates. Each signal has a quote — check it against the recording.'),
  issues: L('Сработавшие запреты групп «Сервис» и «Компетентность»: грубость, нарушение врачебной тайны и другие правила «не должно быть».',
    'Triggered prohibitions in the “Service” and “Competence” groups: rudeness, breach of confidentiality and other “must not” rules.'),
  protocols: L('Доля приёмов, где врач проверил черновик протокола от ИИ и подтвердил его в приложении.',
    'Share of visits where the doctor reviewed the AI draft note and confirmed it in the app.'),
}

export function Tile({ title, hint, value, base, children }: { title: string; hint: string; value: ReactNode; base?: ReactNode; children?: ReactNode }) {
  return (
    <div className="m-tile">
      <div className="m-tile-title">{title}<Hint text={hint} /></div>
      <div className="m-tile-value">{value}</div>
      {base && <div className="m-tile-base">{base}</div>}
      {children && <div className="m-tile-extra">{children}</div>}
    </div>
  )
}

/** Период из шапки (7/30/90 дней…) → date_from/date_to */
export function useClinicRange(store?: string) {
  const ctx = useOutletContext<{ period?: number } | undefined>()
  const period = ctx?.period ?? 30
  return useMemo(() => ({ ...periodRange(period - 1), store_id: store || undefined }), [period, store])
}

/** «17.10» → для подписи недели */
export const weekLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

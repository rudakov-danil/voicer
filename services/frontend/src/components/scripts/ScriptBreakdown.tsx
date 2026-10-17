import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import type { ScriptBreakdownData } from '@/types'
import { Meter } from '@/components/ui/Meter'
import { initials } from '@/lib/format'
import { useTerms } from '@/lib/terms'
import { t, L, locale } from '@/i18n'

/* Разбор этапного скрипта (ui-concept/scripts.html): как складывается балл,
   тепловая карта «продавец × этап» и лучший пример в сети на каждом этапе. */

export interface StepStat {
  step_name: string
  avg_score: number | null
  pass_rate: number | null
  total_count: number
}

const band = (v: number) => (v < 50 ? 1 : v < 60 ? 2 : v < 70 ? 3 : v < 80 ? 4 : v < 90 ? 5 : 6)
export const w2 = (w: number) => w.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** «Как складывается балл разговора»: ширина — вес этапа, заливка — средний балл. */
export function ScoreFormula({ steps, stat }: {
  steps: Array<{ name: string; weight: number | null }>
  stat: Map<string, StepStat>
}) {
  const weightSum = steps.reduce((a, s) => a + (s.weight ?? 0), 0)
  return (
    <div className="formula">
      <div className="formula-h">
        <h3>{t('Как складывается балл разговора')}</h3>
        <span className={`wsum ${Math.abs(weightSum - 1) < 0.011 ? 'is-ok' : 'is-bad'}`}>{L(`Сумма весов ${w2(weightSum)}`, `Weights sum to ${weightSum.toFixed(2)}`)}</span>
      </div>
      <div className="fbar" role="img" aria-label={steps.map((s) => `${s.name}: ${L('вес', 'weight')} ${s.weight ?? '—'}, ${L('средний балл', 'average')} ${stat.get(s.name)?.avg_score ?? '—'}`).join('; ')}>
        {steps.map((s) => {
          const avg = stat.get(s.name)?.avg_score
          return (
            <div key={s.name} className="fseg" style={{ flex: `${Math.max(0.04, s.weight ?? 0)} 1 0` }} title={`${s.name}: ${avg != null ? Math.round(avg) : '—'}`}>
              <div className="fseg-fill" style={{ height: `${Math.max(0, Math.min(100, avg ?? 0))}%` }} />
            </div>
          )
        })}
      </div>
      <div className="flabels">
        {steps.map((s, i) => {
          const avg = stat.get(s.name)?.avg_score
          return (
            <div key={s.name} style={{ flex: `${Math.max(0.04, s.weight ?? 0)} 1 0` }}>
              <b translate="no">{i + 1} · {s.name}</b>
              <span>{s.weight != null ? w2(s.weight) : '—'} × {avg != null ? Math.round(avg) : '—'}</span>
            </div>
          )
        })}
      </div>
      <div className="formula-note">{t('Ширина — вес этапа, заливка — средний балл этапа за период. Балл разговора — сумма «вес × балл» по всем этапам.')}</div>
    </div>
  )
}

/** Тепловая карта: продавец × этап, внизу — медиана сети. */
export function SellerHeatmap({ data }: { data: ScriptBreakdownData }) {
  const terms = useTerms()
  const steps = data.steps
  if (data.sellers.length === 0) {
    return <div className="empty"><p>{t('Скрипт ещё не применялся к разговорам за выбранный период.')}</p></div>
  }
  return (
    <div className="formula">
      <div className="formula-h"><h3>{terms.isCafe ? L('Выполнение по бариста', 'Performance by barista') : terms.isPharmacy ? L('Выполнение по фармацевтам', 'Performance by pharmacist') : t('Выполнение по продавцам')}</h3><span className="muted" style={{ fontSize: 12.5 }}>{t('средний балл этапа за период')}</span></div>
      <div className="heat-wrap">
        <table className="heat">
          <caption className="sr-only">{t('Средний балл этапов скрипта по продавцам')}</caption>
          <thead><tr>
            <th className="row-h" scope="col">{t(terms.seller)}</th>
            {steps.map((s, i) => (
              <th key={s.name} scope="col" title={s.name}>
                {i + 1}<br /><span className="heat-step" translate="no">{s.name}</span>
                {s.weight != null && <><br /><span className="mono">{L('вес', 'wt')} {w2(s.weight)}</span></>}
              </th>
            ))}
            <th scope="col" style={{ textAlign: 'right' }}>{t('Итог')}</th>
          </tr></thead>
          <tbody>
            {data.sellers.map((r) => (
              <tr key={r.seller_id}>
                <td className="name">
                  <span className="person">
                    <span className="avatar" aria-hidden="true" translate="no">{initials(r.seller_name)}</span>
                    <span>
                      <span className="person-name" translate="no">{r.seller_name || '—'}</span>
                      <span className="person-sub">{L(`${r.conversations} разг.`, `${r.conversations} conv.`)}</span>
                    </span>
                  </span>
                </td>
                {steps.map((s) => {
                  const v = r.steps[s.name]
                  return v == null
                    ? <td key={s.name} className="cell is-empty">—</td>
                    : <td key={s.name} className={`cell b${band(v)} ${v < 50 ? 'is-crit' : ''}`} tabIndex={0}
                      title={`${r.seller_name} · ${s.name}: ${Math.round(v)}`}>{Math.round(v)}</td>
                })}
                <td className="total"><Meter score={r.script_score} /></td>
              </tr>
            ))}
            <tr className="heat-median">
              <td className="name"><span className="muted">{t('Медиана сети')}</span></td>
              {steps.map((s) => <td key={s.name} className="cell is-median">{s.median != null ? Math.round(s.median) : '—'}</td>)}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="scale" aria-hidden="true">
        <span>{t('Балл этапа')}</span>
        <div>
          <div className="scale-bar">{[1, 2, 3, 4, 5, 6].map((b) => <span key={b} className={`b${b}`} />)}</div>
          <div className="scale-lbls"><span>&lt;50</span><span>50</span><span>60</span><span>70</span><span>80</span><span>90+</span></div>
        </div>
        <span className="legend-item"><span className="key-bar" style={{ boxShadow: 'inset 0 0 0 2px var(--crit)', background: 'transparent' }} />{t('ниже 50 — нужен разбор')}</span>
      </div>
    </div>
  )
}

/** Лучший пример этапа в сети: цитата и переход к моменту записи. */
export function StepExample({ example }: { example: NonNullable<ScriptBreakdownData['steps'][number]['example']> }) {
  return (
    <div className="step-best">
      <span className="avatar" aria-hidden="true" translate="no">{initials(example.seller_name)}</span>
      <span>{t('Лучший пример —')} <span translate="no">{example.seller_name}</span>, {Math.round(example.score)}:</span>
      <span className="step-quote" translate="no">«{example.evidence}»</span>
      <Link className="link" to={`/conversations/${example.conversation_id}${example.t != null ? `?t=${Math.max(0, example.t - 1)}` : ''}`}>
        <Play size={13} aria-hidden="true" />{t('Послушать')}
      </Link>
    </div>
  )
}

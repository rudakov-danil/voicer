import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, Play } from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { Meter } from '@/components/ui/Meter'
import { initials } from '@/lib/format'
import { t, L, locale } from '@/i18n'

/* Разбор этапного скрипта (ui-concept/scripts.html): как складывается балл,
   тепловая карта «продавец × этап» и лучший пример в сети на каждом этапе. */

interface StepStat {
  step_name: string
  avg_score: number | null
  pass_rate: number | null
  total_count: number
}

const band = (v: number) => (v < 50 ? 1 : v < 60 ? 2 : v < 70 ? 3 : v < 80 ? 4 : v < 90 ? 5 : 6)
const w2 = (w: number) => w.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ScriptBreakdown({ templateId, days, perStep }: { templateId: string; days: number; perStep: StepStat[] }) {
  const { data } = useQuery({
    queryKey: ['script-breakdown', templateId, days],
    queryFn: () => dashboardApi.getScriptBreakdown(templateId, days),
  })
  if (!data) return null
  const stat = new Map(perStep.map((s) => [s.step_name, s]))
  const steps = data.steps
  const weightSum = steps.reduce((a, s) => a + (s.weight ?? 0), 0)

  return (
    <>
      {/* Как складывается балл разговора */}
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

      {/* Тепловая карта: продавец × этап */}
      {data.sellers.length > 0 && (
        <div className="formula">
          <div className="formula-h"><h3>{t('Выполнение по продавцам')}</h3><span className="muted" style={{ fontSize: 12.5 }}>{t('средний балл этапа за период')}</span></div>
          <div className="heat-wrap">
            <table className="heat">
              <caption className="sr-only">{t('Средний балл этапов скрипта по продавцам')}</caption>
              <thead><tr>
                <th className="row-h" scope="col">{t('Продавец')}</th>
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
      )}

      {/* Этапы: средний балл, сколько пропускают, совет и лучший пример */}
      <div className="formula-h" style={{ marginTop: 6 }}><h3>{t('Детально по этапам')}</h3></div>
      {steps.map((s, i) => {
        const st = stat.get(s.name)
        const skip = st?.pass_rate != null ? Math.round(100 - st.pass_rate) : null
        return (
          <div key={s.name} className="step">
            <span className="step-num">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="step-top">
                <span className="step-name" translate="no">{s.name}</span>
                <span className="tag tag-neutral">{s.required ? t('обязательный') : t('по ситуации')}</span>
              </div>
              {s.hint && (
                <div className="step-rec"><Lightbulb size={15} aria-hidden="true" /><span><b>{t('Совет продавцу:')}</b> <span translate="no">{s.hint}</span></span></div>
              )}
              {s.example && (
                <div className="step-best">
                  <span className="avatar" aria-hidden="true" translate="no">{initials(s.example.seller_name)}</span>
                  <span>{t('Лучший пример —')} <span translate="no">{s.example.seller_name}</span>, {Math.round(s.example.score)}:</span>
                  <span className="step-quote" translate="no">«{s.example.evidence}»</span>
                  <Link className="link" to={`/conversations/${s.example.conversation_id}${s.example.t != null ? `?t=${Math.max(0, s.example.t - 1)}` : ''}`}>
                    <Play size={13} aria-hidden="true" />{t('Послушать')}
                  </Link>
                </div>
              )}
            </div>
            <div className="step-side">
              <div className="stat-mini">
                <div className="row"><span>{t('Вес в балле')}</span><b>{s.weight != null ? w2(s.weight) : '—'}</b></div>
                <div className="row"><span>{t('Средний балл')}</span><Meter score={st?.avg_score ?? null} /></div>
                <div className="row"><span>{t('Пропускают')}</span><b className={skip != null && skip >= 25 ? 'is-bad' : ''}>{skip != null ? `${skip} %` : '—'}</b></div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

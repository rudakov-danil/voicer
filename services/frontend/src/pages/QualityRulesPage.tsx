import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { clinicApi, type QualityRule, type RuleCategory } from '@/api/clinic'
import { toast } from '@/components/ui/Toast'
import { CATEGORY, SEVERITY } from '@/components/clinic/shared'
import { L, t } from '@/i18n'

/* Правила контроля качества клиники: по ним ИИ проверяет каждый приём. «Должно быть» дают баллы
   сервиса и компетентности, «Не должно быть» — нарушения и сигналы фрода. Скриптов у клиник нет. */

const GROUPS: Array<{ id: RuleCategory; about: [string, string] }> = [
  { id: 'service', about: ['Как врач общается с пациентом: приветствие, объяснения, следующий шаг.', 'How the doctor communicates: greeting, explanations, next step.'] },
  { id: 'competence', about: ['Полнота приёма: анамнез, осмотр, обоснованность назначений, предупреждения.', 'Completeness: history, examination, justified prescriptions, warnings.'] },
  { id: 'fraud', about: ['Чего не должно быть никогда: увод пациента, оплата мимо кассы, лишние услуги, справки без оснований.', 'What must never happen: diverting patients, off-the-books payments, unnecessary services, unjustified certificates.'] },
]

type Draft = QualityRule & { key: string }
let seq = 0
const withKey = (r: QualityRule): Draft => ({ ...r, key: r.id || `new-${++seq}` })

export function QualityRulesPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-rules'], queryFn: clinicApi.rules })
  const [draft, setDraft] = useState<Draft[]>([])
  useEffect(() => { if (data) setDraft(data.items.map(withKey)) }, [data])
  const dirty = useMemo(() => JSON.stringify(draft.map(({ key, ...r }) => r)) !== JSON.stringify((data?.items || []).map((r) => ({ ...r }))), [draft, data])
  const save = useMutation({
    mutationFn: () => clinicApi.saveRules(draft.map(({ key, ...r }) => ({
      id: r.id, category: r.category, kind: r.category === 'fraud' ? 'forbidden' : r.kind, title: r.title.trim(),
      description: r.description.trim(), severity: r.severity, is_active: r.is_active,
    }))),
    onSuccess: (res) => { qc.setQueryData(['clinic-rules'], res); toast(L('Правила сохранены. Они действуют для новых приёмов.', 'Rules saved. They apply to new visits.')) },
    onError: (e: any) => toast(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : L('Не удалось сохранить правила.', 'Could not save the rules.')),
  })

  if (isError) return <div className="panel up-empty">{L('Не удалось загрузить правила. Обновите страницу.', 'Could not load the rules. Refresh the page.')}</div>
  if (isLoading || !data) return <div className="page-loading" role="status">{t('Загрузка...')}</div>
  const can = data.can_edit
  const update = (key: string, patch: Partial<QualityRule>) => setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const invalid = draft.some((r) => !r.title.trim())

  return (
    <div className="cl cl-rules">
      <p className="cl-muted" style={{ maxWidth: '90ch' }}>
        {L('По этим правилам ИИ проверяет каждый приём и даёт цитату-доказательство. Правила «должно быть» складываются в баллы сервиса и компетентности, «не должно быть» — в нарушения и сигналы фрода. Изменения действуют для новых приёмов; прошлые оценки не пересчитываются.',
          'The AI checks every visit against these rules and quotes the evidence. “Must” rules make up the service and competence scores, “must not” rules become violations and fraud signals. Changes apply to new visits; past scores are not recalculated.')}
        {!can && L(' Править правила могут директор и администратор.', ' Only a director or an admin can edit the rules.')}
      </p>
      <p className="cl-muted">
        {L('Для правил компетентности используйте ', 'For competence rules, use the ')}
        <a href="https://nrchd.kz/clinical-protocols?locale=ru" target="_blank" rel="noopener noreferrer">
          {L('клинические протоколы МЗ РК', 'Kazakhstan Ministry of Health clinical protocols')}
        </a>
        {L('. В описании правила укажите название, год и нужный фрагмент протокола.', '. Include the protocol title, year and relevant excerpt in the rule description.')}
      </p>
      {GROUPS.map((g) => {
        const rows = draft.filter((r) => r.category === g.id)
        return (
          <section key={g.id} className="panel" aria-labelledby={`cl-rules-${g.id}`}>
            <div className="panel-head">
              <div>
                <h2 id={`cl-rules-${g.id}`} className="panel-title">{L(...CATEGORY[g.id])} · {rows.length}</h2>
                <div className="panel-sub">{L(...g.about)}</div>
              </div>
              {can && (
                <button type="button" className="btn btn-outline btn-sm" disabled={draft.length >= 60}
                  onClick={() => setDraft((rs) => [...rs, withKey({ category: g.id, kind: g.id === 'fraud' ? 'forbidden' : 'required', title: '', description: '', severity: g.id === 'fraud' ? 'high' : 'medium', is_active: true })])}>
                  <Plus size={14} aria-hidden="true" />{L('Добавить правило', 'Add a rule')}
                </button>
              )}
            </div>
            <div className="cl-panel-body">
              {rows.length === 0 && <p className="cl-muted">{L('Правил нет.', 'No rules.')}</p>}
              {rows.map((r) => (
                <div key={r.key} className={`cl-rule${r.is_active ? '' : ' is-off'}`}>
                  <div className="cl-rule-main">
                    {can ? (
                      <>
                        <input className="cl-rule-title" value={r.title} maxLength={255} placeholder={L('Название правила', 'Rule title')}
                          aria-label={L('Название правила', 'Rule title')} onChange={(e) => update(r.key, { title: e.target.value })} />
                        <textarea className="cl-rule-desc" value={r.description} maxLength={2000}
                          placeholder={L('Что именно проверять — так ИИ поймёт правило точнее', 'What exactly to check — helps the AI apply the rule')}
                          aria-label={L('Описание правила', 'Rule description')} onChange={(e) => update(r.key, { description: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <span className="cl-rule-ro-title" translate="no">{r.title}</span>
                        <span className="cl-rule-ro-desc" translate="no">{r.description}</span>
                      </>
                    )}
                  </div>
                  <div className="cl-rule-side">
                    {g.id !== 'fraud' && (can ? (
                      <select className="select-pill" value={r.kind} aria-label={L('Вид правила', 'Rule kind')} onChange={(e) => update(r.key, { kind: e.target.value as QualityRule['kind'] })}>
                        <option value="required">{L('Должно быть', 'Must')}</option>
                        <option value="forbidden">{L('Не должно быть', 'Must not')}</option>
                      </select>
                    ) : <span className="cl-cat">{r.kind === 'required' ? L('Должно быть', 'Must') : L('Не должно быть', 'Must not')}</span>)}
                    {(g.id === 'fraud' || r.kind === 'forbidden') && (can ? (
                      <select className="select-pill" value={r.severity} aria-label={L('Важность', 'Severity')} onChange={(e) => update(r.key, { severity: e.target.value as QualityRule['severity'] })}>
                        {(['high', 'medium', 'low'] as const).map((s) => <option key={s} value={s}>{L(...SEVERITY[s])}</option>)}
                      </select>
                    ) : <span className="cl-cat">{L(...SEVERITY[r.severity])}</span>)}
                    {can && (
                      <label className="cl-toggle">
                        <input type="checkbox" checked={r.is_active} onChange={(e) => update(r.key, { is_active: e.target.checked })} />
                        {L('Проверять', 'Active')}
                      </label>
                    )}
                    {can && (
                      <button type="button" className="btn-icon" aria-label={L(`Удалить правило ${r.title}`, `Delete rule ${r.title}`)}
                        onClick={() => setDraft((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {can && dirty && (
        <div className="cl-savebar">
          <button type="button" className="btn btn-primary" disabled={save.isPending || invalid} onClick={() => save.mutate()}>
            {save.isPending ? L('Сохраняем…', 'Saving…') : L('Сохранить правила', 'Save rules')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={save.isPending} onClick={() => setDraft(data.items.map(withKey))}>{L('Отменить изменения', 'Discard changes')}</button>
          {invalid && <span className="cl-muted">{L('У каждого правила должно быть название.', 'Every rule needs a title.')}</span>}
        </div>
      )}
    </div>
  )
}

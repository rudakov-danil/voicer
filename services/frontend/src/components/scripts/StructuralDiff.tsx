import { useQuery } from '@tanstack/react-query'
import { scriptsApi } from '@/api/scripts'
import { ArrowRight, Minus, Plus, RefreshCw, FileText } from 'lucide-react'

type Step = {
  id?: string
  name: string
  weight: number
  is_required: boolean
  description?: string | null
  example_phrases?: string[]
}

function fromSnapshot(s: any): Step[] {
  return (s?.steps || []).map((x: any) => ({
    id: x.id,
    name: x.name,
    weight: Number(x.weight || 0),
    is_required: !!x.is_required,
    description: x.description || '',
    example_phrases: x.example_phrases || [],
  }))
}

type DiffEntry =
  | { kind: 'added'; b: Step }
  | { kind: 'removed'; a: Step }
  | { kind: 'changed'; a: Step; b: Step; fields: string[] }
  | { kind: 'same'; a: Step; b: Step }

function diff(a: Step[], b: Step[]): DiffEntry[] {
  const out: DiffEntry[] = []
  const byNameB = new Map(b.map((s) => [s.name.trim().toLowerCase(), s]))
  const usedB = new Set<string>()

  for (const sa of a) {
    const key = sa.name.trim().toLowerCase()
    const sb = byNameB.get(key)
    if (!sb) { out.push({ kind: 'removed', a: sa }); continue }
    usedB.add(key)

    const fields: string[] = []
    if (Math.abs(sa.weight - sb.weight) > 0.0005) fields.push('вес')
    if (sa.is_required !== sb.is_required) fields.push('обязательность')
    if ((sa.description || '') !== (sb.description || '')) fields.push('описание')
    const ap = (sa.example_phrases || []).join('|')
    const bp = (sb.example_phrases || []).join('|')
    if (ap !== bp) fields.push('фразы')

    if (fields.length === 0) out.push({ kind: 'same', a: sa, b: sb })
    else out.push({ kind: 'changed', a: sa, b: sb, fields })
  }
  for (const sb of b) {
    const key = sb.name.trim().toLowerCase()
    if (!usedB.has(key)) out.push({ kind: 'added', b: sb })
  }
  return out
}

export function StructuralDiff({
  templateId, versionA, versionB,
}: {
  templateId: string; versionA: number; versionB: number
}) {
  const { data: a, isLoading: la } = useQuery({
    queryKey: ['template-version', templateId, versionA],
    queryFn: () => scriptsApi.getVersion(templateId, versionA),
  })
  const { data: b, isLoading: lb } = useQuery({
    queryKey: ['template-version', templateId, versionB],
    queryFn: () => scriptsApi.getVersion(templateId, versionB),
  })

  if (la || lb) {
    return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Загрузка структуры версий…</div>
  }
  if (!a || !b) return null

  const stepsA = fromSnapshot(a.snapshot)
  const stepsB = fromSnapshot(b.snapshot)
  const entries = diff(stepsA, stepsB)

  // Top-level метаданные шаблона — название, описание и контекст.
  // Если их поменяли без правок этапов, diff раньше говорил «идентичны», что
  // вводило в заблуждение.
  const topLevelChanges: Array<{ label: string; from: string; to: string }> = []
  const snapA = a.snapshot || {}
  const snapB = b.snapshot || {}
  const compareField = (key: string, label: string) => {
    const va = (snapA[key] ?? '').toString().trim()
    const vb = (snapB[key] ?? '').toString().trim()
    if (va !== vb) topLevelChanges.push({ label, from: va, to: vb })
  }
  compareField('name', 'Название скрипта')
  compareField('short_name', 'Короткое название')
  compareField('description', 'Описание скрипта')
  compareField('context_description', 'Контекст для LLM')

  const added = entries.filter((e) => e.kind === 'added').length
  const removed = entries.filter((e) => e.kind === 'removed').length
  const changed = entries.filter((e) => e.kind === 'changed').length

  return (
    <div className="diff-block">
      <div className="diff-summary">
        <span className="diff-pill diff-pill--add"><Plus size={11} /> {added} добавлено</span>
        <span className="diff-pill diff-pill--del"><Minus size={11} /> {removed} удалено</span>
        <span className="diff-pill diff-pill--chg"><RefreshCw size={11} /> {changed} изменено</span>
      </div>

      {topLevelChanges.length > 0 && (
        <div className="diff-list" style={{ marginBottom: 10 }}>
          {topLevelChanges.map((c, i) => (
            <div key={`top-${i}`} className="diff-row diff-row--chg">
              <span className="diff-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <FileText size={11} /> Шапка
              </span>
              <div className="diff-step">
                <div className="diff-step-name">{c.label}</div>
                <div className="diff-step-changes">
                  <span className="diff-change" style={{ maxWidth: '100%' }}>
                    <span style={{
                      color: 'var(--text-muted)', textDecoration: 'line-through',
                      maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block',
                    }}>
                      {c.from || '∅'}
                    </span>
                    <ArrowRight size={10} style={{ margin: '0 6px', flexShrink: 0 }} />
                    <span style={{
                      color: 'var(--text)', fontWeight: 500,
                      maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block',
                    }}>
                      {c.to || '∅'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="diff-list">
        {entries.map((e, i) => {
          if (e.kind === 'same') return null
          if (e.kind === 'added') {
            return (
              <div key={i} className="diff-row diff-row--add">
                <span className="diff-tag">Добавлен этап</span>
                <div className="diff-step">
                  <div className="diff-step-name">{e.b.name}</div>
                  <div className="diff-step-meta">{Math.round(e.b.weight * 100)}% · {e.b.is_required ? 'обязательный' : 'опциональный'}</div>
                </div>
              </div>
            )
          }
          if (e.kind === 'removed') {
            return (
              <div key={i} className="diff-row diff-row--del">
                <span className="diff-tag">Удалён этап</span>
                <div className="diff-step">
                  <div className="diff-step-name">{e.a.name}</div>
                  <div className="diff-step-meta">{Math.round(e.a.weight * 100)}% · {e.a.is_required ? 'обязательный' : 'опциональный'}</div>
                </div>
              </div>
            )
          }
          return (
            <div key={i} className="diff-row diff-row--chg">
              <span className="diff-tag">Изменён</span>
              <div className="diff-step">
                <div className="diff-step-name">{e.a.name}</div>
                <div className="diff-step-changes">
                  {e.fields.includes('вес') && (
                    <span className="diff-change">
                      вес: {Math.round(e.a.weight * 100)}% <ArrowRight size={10} /> {Math.round(e.b.weight * 100)}%
                    </span>
                  )}
                  {e.fields.includes('обязательность') && (
                    <span className="diff-change">
                      {e.a.is_required ? 'обязательный' : 'опциональный'} <ArrowRight size={10} /> {e.b.is_required ? 'обязательный' : 'опциональный'}
                    </span>
                  )}
                  {e.fields.includes('описание') && (
                    <span className="diff-change">описание изменено</span>
                  )}
                  {e.fields.includes('фразы') && (
                    <span className="diff-change">
                      эталонных фраз: {e.a.example_phrases?.length || 0} <ArrowRight size={10} /> {e.b.example_phrases?.length || 0}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {added + removed + changed === 0 && topLevelChanges.length === 0 && (
          <div className="diff-empty">Структурно версии идентичны — изменений нет.</div>
        )}
      </div>
    </div>
  )
}

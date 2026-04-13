import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsApi } from '@/api/scripts'
import type { ScriptTemplate } from '@/types'
import { useState, useEffect } from 'react'
import { CheckSquare, Plus } from 'lucide-react'

const UPSELL_RULES = [
  { product: 'Смартфон', upsell: 'Расширенная гарантия, чехол, защитное стекло', active: true },
  { product: 'Ноутбук', upsell: 'Расширенная гарантия, сумка, мышь', active: true },
  { product: 'Телевизор', upsell: 'Кронштейн, HDMI-кабель, саундбар', active: true },
  { product: 'Стиральная машина', upsell: 'Расширенная гарантия, средства для ухода', active: false },
]

export function ScriptsPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editSteps, setEditSteps] = useState<{ id: string; name: string; weight: number; enabled: boolean }[]>([])

  const { data: templates } = useQuery({
    queryKey: ['script-templates'],
    queryFn: () => scriptsApi.getTemplates(),
  })

  const { data: selectedDetail } = useQuery({
    queryKey: ['script-template-detail', selectedId],
    queryFn: () => scriptsApi.getTemplate(selectedId!),
    enabled: !!selectedId,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ScriptTemplate> }) =>
      scriptsApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['script-templates'] })
      queryClient.invalidateQueries({ queryKey: ['script-template-detail', selectedId] })
    },
  })

  const selected = selectedDetail || templates?.find((t) => t.id === selectedId)

  const selectTemplate = (t: ScriptTemplate) => {
    setSelectedId(t.id)
  }

  // Update editSteps when selectedDetail loads or changes
  useEffect(() => {
    if (selectedDetail?.steps) {
      const steps = (selectedDetail.steps || [])
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, name: s.name, weight: s.weight, enabled: s.is_required }))
      setEditSteps(steps)
    }
  }, [selectedDetail])

  const toggleStep = (index: number) => {
    setEditSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s))
    )
  }

  const handleSave = () => {
    if (!selectedId) return
    updateMutation.mutate({
      id: selectedId,
      data: {
        steps: editSteps.map((s, i) => ({
          id: s.id,
          name: s.name,
          weight: s.weight,
          order: i + 1,
          is_required: s.enabled,
        })),
      } as any,
    })
  }

  return (
    <div>
      <div className="grid-2 fade-in">
        {/* Template List */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Шаблоны скриптов</div>
            <button className="btn btn-primary btn-sm">
              <Plus size={14} /> Новый шаблон
            </button>
          </div>
          <div>
            {(templates || []).map((t) => (
              <div
                key={t.id}
                className="list-item"
                onClick={() => selectTemplate(t)}
                style={{
                  background: selectedId === t.id ? 'var(--bg-active)' : undefined,
                }}
              >
                <div className="list-item-icon" style={{
                  background: t.is_active ? 'var(--success-light)' : 'var(--bg)',
                  color: t.is_active ? 'var(--success)' : 'var(--text-muted)',
                }}>
                  <CheckSquare size={18} />
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">{t.name}</div>
                  <div className="list-item-desc">
                    {t.steps?.length || 0} этапов · {t.is_active ? 'Активен' : 'Черновик'}
                  </div>
                </div>
                <div className="list-item-meta">
                  <span className={`tag ${t.is_active ? 'tag-success' : 'tag-neutral'}`}>
                    {t.is_active ? 'Активен' : 'Черновик'}
                  </span>
                </div>
              </div>
            ))}
            {(!templates || templates.length === 0) && (
              <div className="empty-state"><p>Нет шаблонов скриптов</p></div>
            )}
          </div>
        </div>

        {/* Active Script Editor */}
        <div className="card">
          {selected ? (
            <>
              <div className="card-header">
                <div>
                  <div className="card-title">Активный скрипт: {selected.name}</div>
                  <div className="card-subtitle">
                    Чек-лист этапов продажи с весами для скоринга
                  </div>
                </div>
              </div>
              <div>
                {editSteps.map((step, i) => (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px 0', borderBottom: '1px solid var(--border-light)',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: '13.5px' }}>
                        {step.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Вес: {Math.round(step.weight * 100)}%
                      </div>
                    </div>
                    <div
                      className={`toggle-switch ${step.enabled ? 'on' : ''}`}
                      onClick={() => toggleStep(i)}
                    />
                  </div>
                ))}
              </div>
              <div style={{ paddingTop: '16px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>Выберите скрипт из списка слева</p>
            </div>
          )}
        </div>
      </div>

      {/* Upsell Rules */}
      <div className="card fade-in" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Правила апсейла</div>
            <div className="card-subtitle">Обязательные предложения дополнительных продуктов</div>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Продукт</th>
                <th>Обязательное предложение</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {UPSELL_RULES.map((rule, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{rule.product}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{rule.upsell}</td>
                  <td>
                    <span className={`tag ${rule.active ? 'tag-success' : 'tag-warning'}`}>
                      {rule.active ? 'Активно' : 'Черновик'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

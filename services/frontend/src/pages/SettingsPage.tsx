import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw, Check } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { authApi } from '@/api/auth'
import { recorderApi } from '@/api/recorder'
import { TELEPHONY_ENABLED, useOrganization, useTerms } from '@/lib/terms'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('privacy')
  const terms = useTerms()

  return (
    <div className="card fade-in">
      <div className="tabs">
        {[
          { key: 'privacy', label: 'Приватность' },
          { key: 'notifications', label: 'Уведомления' },
          // «Организация» сейчас содержит только выбор «магазины / телефония» — скрыта вместе с контуром
          ...(TELEPHONY_ENABLED ? [{ key: 'organization', label: 'Организация' }] : []),
          ...(terms.isTelephony ? [{ key: 'telephony', label: 'Телефония' }] : []),
        ].map((tab) => (
          <button key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px' }}>
        {activeTab === 'privacy' && <PrivacyTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'organization' && TELEPHONY_ENABLED && <OrganizationTab />}
        {activeTab === 'telephony' && terms.isTelephony && <TelephonyTab />}
      </div>
    </div>
  )
}

function OrganizationTab() {
  const queryClient = useQueryClient()
  const { data: org, isLoading } = useOrganization()

  const mutation = useMutation({
    mutationFn: (org_type: 'retail' | 'telephony') => authApi.updateOrganization({ org_type }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization'] }),
  })

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
  }
  if (!org) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Не удалось загрузить данные организации</div>
  }

  return (
    <div>
      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Тип продаж</div>
          <div className="toggle-desc">
            Определяет терминологию интерфейса и доступные функции.
            «Телефония» включает загрузку звонков, вебхук АТС, направления и исходы звонков.
          </div>
        </div>
        <select
          className="select-pill"
          value={org.org_type}
          onChange={(e) => mutation.mutate(e.target.value as 'retail' | 'telephony')}
        >
          <option value="retail">Офлайн-продажи (магазины)</option>
          <option value="telephony">Телефония (звонки)</option>
        </select>
      </div>
      {mutation.isError && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
          Не удалось сохранить — нужны права директора или администратора
        </div>
      )}
      {mutation.isPending && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Сохранение...</div>
      )}
    </div>
  )
}

function TelephonyTab() {
  const queryClient = useQueryClient()
  const terms = useTerms()
  const [copied, setCopied] = useState(false)

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['telephony-settings'],
    queryFn: () => recorderApi.getTelephonySettings(),
    retry: 1,
  })
  const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data: sellersData } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() })

  const mutation = useMutation({
    mutationFn: (data: any) => recorderApi.updateTelephonySettings(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telephony-settings'] }),
  })

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
  }
  if (isError || !settings) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>
      Не удалось загрузить настройки телефонии (нужны права директора или администратора)
    </div>
  }

  const webhookUrl = `${window.location.origin}${settings.webhook_url_path}`
  const stores = storesData?.items ?? []
  const sellers = sellersData?.items ?? []

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div>
      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Приём звонков из АТС</div>
          <div className="toggle-desc">Вебхук для автоматической загрузки записей звонков из вашей АТС</div>
        </div>
        <div className={`toggle-switch ${settings.is_enabled ? 'on' : ''}`}
          onClick={() => mutation.mutate({ is_enabled: !settings.is_enabled })} />
      </div>

      <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
        <div className="toggle-title" style={{ marginBottom: 6 }}>URL вебхука</div>
        <div className="toggle-desc" style={{ marginBottom: 10 }}>
          Настройте вашу АТС отправлять POST-запрос с JSON на этот адрес после каждого звонка.
          Поля: recording_url (обязательно), direction, client_phone, operator_phone, external_call_id, started_at.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{
            flex: 1, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)',
            fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{webhookUrl}</code>
          <button className="btn btn-sm btn-outline" onClick={copyUrl} title="Скопировать URL">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button className="btn btn-sm btn-outline"
            title="Перевыпустить токен — старый URL перестанет работать"
            onClick={() => {
              if (confirm('Перевыпустить токен вебхука? Старый URL перестанет работать.')) {
                mutation.mutate({ regenerate_token: true })
              }
            }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, padding: '14px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <label className="form-label">{terms.store} по умолчанию</label>
          <select className="form-input"
            value={settings.default_store_id || ''}
            onChange={(e) => e.target.value && mutation.mutate({ default_store_id: e.target.value })}>
            <option value="">Не задан</option>
            {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{terms.seller} по умолчанию</label>
          <select className="form-input"
            value={settings.default_seller_id || ''}
            onChange={(e) => e.target.value && mutation.mutate({ default_seller_id: e.target.value })}>
            <option value="">Не задан</option>
            {sellers.map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Канал оператора в стерео</label>
          <select className="form-input"
            value={settings.operator_channel}
            onChange={(e) => mutation.mutate({ operator_channel: Number(e.target.value) })}>
            <option value={0}>Левый (канал 0)</option>
            <option value={1}>Правый (канал 1)</option>
          </select>
        </div>
      </div>
      <div className="toggle-desc">
        Если АТС не передаёт {terms.store.toLowerCase()}/{terms.seller.toLowerCase()} в вебхуке —
        звонок будет привязан к значениям по умолчанию.
      </div>

      <OperatorMappingEditor
        mapping={settings.operator_mapping || {}}
        sellers={sellers}
        sellerLabel={terms.seller}
        onSave={(operator_mapping) => mutation.mutate({ operator_mapping })}
        isSaving={mutation.isPending}
      />

      <ScorableCategoriesEditor
        value={settings.scorable_categories}
        onSave={(scorable_categories) => mutation.mutate({ scorable_categories })}
        isSaving={mutation.isPending}
      />

      {mutation.isPending && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Сохранение...</div>
      )}
    </div>
  )
}

/** Какие категории звонков идут в рейтинг менеджера (оцениваются по скрипту).
 *  Нецелевые/сервисные звонки, исключённые здесь, не портят средний балл сотрудника. */
const SCORABLE_CATEGORY_OPTIONS: { code: string; label: string; hint: string }[] = [
  { code: 'sales', label: 'Продажные', hint: 'Есть намерение или потенциал покупки' },
  { code: 'service', label: 'Сервисные', hint: 'Обслуживание текущего клиента: статус заказа, поддержка' },
  { code: 'non_target', label: 'Нецелевые', hint: 'Ошиблись номером, спам, поставщик, вакансии' },
  { code: 'other', label: 'Прочие', hint: 'Не удалось однозначно классифицировать' },
]

function ScorableCategoriesEditor({ value, onSave, isSaving }: {
  value: string[] | null
  onSave: (categories: string[]) => void
  isSaving: boolean
}) {
  // null → дефолт: оцениваются только продажные звонки
  const current = value && value.length ? value : ['sales']
  const toggle = (code: string) => {
    const next = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code]
    // Не даём выключить всё — иначе оценивать будет нечего; оставляем хотя бы 'sales'
    onSave(next.length ? next : ['sales'])
  }
  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <label className="form-label">Какие звонки учитывать в рейтинге</label>
      <div className="toggle-desc" style={{ marginBottom: 12 }}>
        ИИ определяет категорию каждого звонка. Звонки вне выбранных категорий не оцениваются
        по скрипту и не влияют на средний балл менеджера — так нецелевые и сервисные обращения
        не портят рейтинг.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SCORABLE_CATEGORY_OPTIONS.map(opt => {
          const checked = current.includes(opt.code)
          return (
            <label key={opt.code} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isSaving ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isSaving}
                onChange={() => toggle(opt.code)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.hint}</div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** Сопоставление номеров (добавочных) операторов из АТС с сотрудниками системы.
 *  По нему вебхук привязывает звонок к конкретному человеку — в аналитике видно ФИО. */
function OperatorMappingEditor({ mapping, sellers, sellerLabel, onSave, isSaving }: {
  mapping: Record<string, string>
  sellers: any[]
  sellerLabel: string
  onSave: (mapping: Record<string, string>) => void
  isSaving: boolean
}) {
  type Row = { key: string; phone: string; sellerId: string }
  const toRows = (m: Record<string, string>): Row[] =>
    Object.entries(m).map(([phone, sellerId], i) => ({ key: `r-${i}-${phone}`, phone, sellerId }))

  const [rows, setRows] = useState<Row[]>(() => toRows(mapping))
  const [dirty, setDirty] = useState(false)

  // Синхронизация с сервером, пока пользователь не начал править
  useEffect(() => {
    if (!dirty) setRows(toRows(mapping))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mapping)])

  const update = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  const remove = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
    setDirty(true)
  }
  const addRow = () => {
    setRows((prev) => [...prev, { key: `n-${Date.now()}`, phone: '', sellerId: '' }])
    setDirty(true)
  }

  const sellerName = (id: string) => {
    const s = sellers.find((x: any) => x.id === id)
    return s ? `${s.first_name} ${s.last_name}` : id
  }

  const validRows = rows.filter((r) => r.phone.trim() && r.sellerId)
  const phones = validRows.map((r) => r.phone.trim())
  const hasDuplicates = new Set(phones).size !== phones.length
  const canSave = dirty && !hasDuplicates && rows.every((r) => (!r.phone.trim() && !r.sellerId) || (r.phone.trim() && r.sellerId))

  const save = () => {
    const m: Record<string, string> = {}
    for (const r of validRows) m[r.phone.trim()] = r.sellerId
    onSave(m)
    setDirty(false)
  }

  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="toggle-title">Сопоставление номеров операторов</div>
        <button className="btn btn-sm btn-outline" onClick={addRow}>+ Добавить</button>
      </div>
      <div className="toggle-desc" style={{ marginBottom: 12 }}>
        Укажите, какой добавочный/номер из АТС принадлежит какому сотруднику — звонки будут
        привязываться к конкретному человеку, и в аналитике вы увидите ФИО, а не номер.
        Номер должен совпадать с тем, что АТС передаёт в поле operator_phone вебхука.
      </div>

      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }}>
          Сопоставлений пока нет — звонки без явного оператора попадут на {sellerLabel.toLowerCase()}а по умолчанию.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const isDup = r.phone.trim() && phones.filter((p) => p === r.phone.trim()).length > 1
          return (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 32px', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder="101 или +7900..."
                value={r.phone}
                onChange={(e) => update(r.key, { phone: e.target.value })}
                style={isDup ? { borderColor: 'var(--danger)' } : undefined}
                title={isDup ? 'Этот номер указан несколько раз' : undefined}
              />
              <select
                className="form-input"
                value={r.sellerId}
                onChange={(e) => update(r.key, { sellerId: e.target.value })}
              >
                <option value="">— выберите сотрудника —</option>
                {sellers.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
                {/* Сотрудник из маппинга, которого уже нет в списке (удалён) — показываем, чтобы не потерять строку */}
                {r.sellerId && !sellers.some((s: any) => s.id === r.sellerId) && (
                  <option value={r.sellerId}>{sellerName(r.sellerId)} (не найден)</option>
                )}
              </select>
              <button className="btn-icon" onClick={() => remove(r.key)} title="Удалить" style={{ color: 'var(--danger)' }}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {hasDuplicates && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
          Один и тот же номер указан для нескольких сотрудников — уберите дубликат.
        </div>
      )}

      {dirty && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!canSave || isSaving}>
            {isSaving ? 'Сохранение…' : 'Сохранить сопоставление'}
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => { setRows(toRows(mapping)); setDirty(false) }}>
            Отменить
          </button>
          {!canSave && !hasDuplicates && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Заполните номер и сотрудника в каждой строке
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PrivacyTab() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['privacy-settings'],
    queryFn: () => adminApi.getPrivacySettings(),
  })

  const mutation = useMutation({
    mutationFn: (data: any) => adminApi.updatePrivacySettings(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['privacy-settings'] }),
  })

  const toggle = (key: string) => {
    if (!settings) return
    mutation.mutate({
      retention_days: settings.retention_days,
      anonymize_transcripts: settings.anonymize_transcripts,
      [key]: !settings[key],
    })
  }

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
  }

  if (!settings) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Не удалось загрузить настройки</div>
  }

  return (
    <div>
      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Анонимизация транскриптов</div>
          <div className="toggle-desc">Удалять персональные данные из расшифровок</div>
        </div>
        <div className={`toggle-switch ${settings.anonymize_transcripts ? 'on' : ''}`}
          onClick={() => toggle('anonymize_transcripts')} />
      </div>

      <div className="toggle-row" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="toggle-label-group">
          <div className="toggle-title">Срок хранения данных</div>
          <div className="toggle-desc">Автоматически удалять записи через указанный срок</div>
        </div>
        <select
          className="select-pill"
          value={settings.retention_days}
          onChange={(e) => mutation.mutate({
            ...settings,
            retention_days: Number(e.target.value),
          })}
        >
          <option value={30}>30 дней</option>
          <option value={60}>60 дней</option>
          <option value={90}>90 дней</option>
          <option value={180}>180 дней</option>
          <option value={365}>1 год</option>
        </select>
      </div>

      {mutation.isPending && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Сохранение...</div>
      )}
    </div>
  )
}

function NotificationsTab() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['alert-settings'],
    queryFn: () => adminApi.getAlertSettings(),
  })

  const mutation = useMutation({
    mutationFn: (data: any) => adminApi.updateAlertSettings(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-settings'] }),
  })

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
  }

  if (!settings) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Не удалось загрузить настройки</div>
  }

  return (
    <div>
      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Алерты включены</div>
          <div className="toggle-desc">Получать уведомления о событиях</div>
        </div>
        <div className={`toggle-switch ${settings.is_active ? 'on' : ''}`}
          onClick={() => mutation.mutate({ ...settings, is_active: !settings.is_active })} />
      </div>

      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Порог низкой оценки</div>
          <div className="toggle-desc">Уведомлять, если оценка разговора ниже порога</div>
        </div>
        <select
          className="select-pill"
          value={settings.score_threshold}
          onChange={(e) => mutation.mutate({ ...settings, score_threshold: Number(e.target.value) })}
        >
          <option value={40}>40</option>
          <option value={50}>50</option>
          <option value={60}>60</option>
          <option value={70}>70</option>
        </select>
      </div>

      {mutation.isPending && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Сохранение...</div>
      )}
    </div>
  )
}


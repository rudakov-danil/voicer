import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw, Check } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { authApi } from '@/api/auth'
import { recorderApi } from '@/api/recorder'
import { TELEPHONY_ENABLED, useOrganization, useTerms } from '@/lib/terms'
import { initials } from '@/lib/format'
import { t, L, isEn, setLang, plural } from '@/i18n'

/* «Настройки» по концепту (ui-concept/settings.html): одна страница с разделами
   и навигацией слева. Док-станций и интеграций нет — эти разделы концепта не переносим. */
const SECTIONS = [
  { id: 'org', label: 'Организация' },
  { id: 'stores', label: 'Магазины' },
  { id: 'users', label: 'Пользователи и роли' },
  { id: 'alerts', label: 'Оповещения' },
  { id: 'privacy', label: 'Приватность и хранение' },
]

const ROLE_LABELS: Record<string, string> = { director: 'Директор', admin: 'Администратор', rop: 'РОП', manager: 'Менеджер магазина' }
const ROLE_NOTES: Array<[string, string]> = [
  ['Директор', 'Видит всю сеть и все разделы.'],
  ['Администратор', 'Пользователи, магазины, продавцы и настройки.'],
  ['РОП', 'Аналитика и разборы по назначенным магазинам.'],
  ['Менеджер магазина', 'Свой магазин: разговоры, продавцы и скрипты.'],
]

export function SettingsPage() {
  const terms = useTerms()
  const [current, setCurrent] = useState('org')
  const go = (id: string) => {
    setCurrent(id)
    document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const sections = [
    ...SECTIONS,
    ...(terms.isTelephony ? [{ id: 'telephony', label: 'Телефония' }] : []),
  ]

  return (
    <div className="set-grid">
      <nav className="set-nav" aria-label={t('Разделы настроек')}>
        {sections.map((s) => (
          <button key={s.id} type="button" aria-current={current === s.id ? 'true' : undefined} onClick={() => go(s.id)}>{t(s.label)}</button>
        ))}
      </nav>
      <div className="set-body">
        <OrgSection />
        <StoresSection />
        <UsersSection />
        <section id="set-alerts" className="panel set-sec">
          <div className="panel-head"><div><h2 className="panel-title">{t('Оповещения')}</h2><div className="panel-sub">{t('Когда разговор попадает в очередь на разбор и в уведомления')}</div></div></div>
          <div className="panel-body"><NotificationsTab /></div>
        </section>
        <section id="set-privacy" className="panel set-sec">
          <div className="panel-head"><div><h2 className="panel-title">{t('Приватность и хранение')}</h2><div className="panel-sub">{t('Запись разговоров в магазинах по 152-ФЗ')}</div></div></div>
          <div className="panel-body"><PrivacyTab /></div>
        </section>
        {TELEPHONY_ENABLED && (
          <section className="panel set-sec">
            <div className="panel-head"><h2 className="panel-title">{t('Тип продаж')}</h2></div>
            <div className="panel-body"><OrganizationTab /></div>
          </section>
        )}
        {terms.isTelephony && (
          <section id="set-telephony" className="panel set-sec">
            <div className="panel-head"><h2 className="panel-title">{t('Телефония')}</h2></div>
            <div className="panel-body"><TelephonyTab /></div>
          </section>
        )}
      </div>
    </div>
  )
}

function SetRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div><div className="set-row-title">{t(title)}</div>{desc && <div className="set-row-desc">{t(desc)}</div>}</div>
      <div className="set-row-ctl">{children}</div>
    </div>
  )
}

function OrgSection() {
  const { data: org } = useOrganization()
  return (
    <section id="set-org" className="panel set-sec">
      <div className="panel-head"><div><h2 className="panel-title">{t('Организация')}</h2><div className="panel-sub">{t('Общие данные и вид интерфейса')}</div></div></div>
      <div className="panel-body">
        <SetRow title="Название" desc="Видно в отчётах и письмах"><b translate="no">{org?.name || '—'}</b></SetRow>
        <SetRow title="Часовой пояс" desc="Для графиков по часам и дням"><span>{t('Москва, UTC+3')}</span></SetRow>
        <SetRow title="Язык интерфейса" desc="Меняется сразу для вашей учётной записи">
          <div className="seg" role="group" aria-label={t('Язык интерфейса')}>
            <button type="button" aria-pressed={!isEn} onClick={() => isEn && setLang('ru')} translate="no">Русский</button>
            <button type="button" aria-pressed={isEn} onClick={() => !isEn && setLang('en')} translate="no">English</button>
          </div>
        </SetRow>
      </div>
    </section>
  )
}

function StoresSection() {
  const { data } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const stores = data?.items || []
  return (
    <section id="set-stores" className="panel set-sec">
      <div className="panel-head">
        <div><h2 className="panel-title">{t('Магазины')}</h2><div className="panel-sub">{L(`${stores.length} ${plural(stores.length, ['магазин', 'магазина', 'магазинов'], ['', ''])} в сети`, `${stores.length} stores in the network`)}</div></div>
        <Link className="btn btn-sm" to="/admin">{t('Добавить магазин')}</Link>
      </div>
      <div className="panel-body" style={{ paddingTop: 6 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">{t('Магазин')}</th><th scope="col">{t('Адрес')}</th><th scope="col" className="t-right">{t('Продавцов')}</th></tr></thead>
            <tbody>
              {stores.map((s: any) => (
                <tr key={s.id}>
                  <td><b translate="no">{s.name}</b>{!s.is_active && <span className="muted"> · {t('отключён')}</span>}</td>
                  <td translate="no">{s.address || '—'}</td>
                  <td className="t-right t-num">{s.seller_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function UsersSection() {
  const { data } = useQuery({ queryKey: ['admin-users'], queryFn: () => adminApi.getUsers() })
  const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const storeName = new Map((stores?.items || []).map((s: any) => [s.id, s.name]))
  const users = data?.items || []
  return (
    <section id="set-users" className="panel set-sec">
      <div className="panel-head">
        <div><h2 className="panel-title">{t('Пользователи и роли')}</h2><div className="panel-sub">{t('Кто работает с аналитикой · продавцы добавляются в разделе «Администрирование»')}</div></div>
        <Link className="btn btn-sm" to="/admin">{t('Пригласить')}</Link>
      </div>
      <div className="panel-body" style={{ paddingTop: 6 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">{t('Пользователь')}</th><th scope="col">{t('Роль')}</th><th scope="col">{t('Доступ')}</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email
                return (
                  <tr key={u.id} className={u.is_active ? '' : 'is-off'}>
                    <td>
                      <span className="person">
                        <span className="avatar" aria-hidden="true" translate="no">{initials(name)}</span>
                        <span><span className="person-name" translate="no">{name}</span><span className="person-sub" translate="no">{u.email}</span></span>
                      </span>
                    </td>
                    <td>{t(ROLE_LABELS[u.role] || u.role)}</td>
                    <td>{u.store_id ? <span translate="no">{storeName.get(u.store_id) || '—'}</span> : t('Вся сеть')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="set-roles">
          {ROLE_NOTES.map(([role, note]) => <div key={role}><b>{t(role)}</b><span>{t(note)}</span></div>)}
        </div>
      </div>
    </section>
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

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="cv-switch" onClick={onChange}>
      <span className="cv-switch-track" aria-hidden="true" />
    </button>
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
  if (isLoading) return <div className="muted">{t('Загрузка...')}</div>
  if (!settings) return <div className="muted">{t('Не удалось загрузить настройки')}</div>
  const save = (patch: Record<string, unknown>) => mutation.mutate({
    retention_days: settings.retention_days,
    anonymize_transcripts: settings.anonymize_transcripts,
    consent_required: settings.consent_required,
    ...patch,
  })

  return (
    <>
      <SetRow title="Скрывать номера карт, телефонов и паспортов" desc="ИИ убирает персональные данные из расшифровок при анализе">
        <Switch on={!!settings.anonymize_transcripts} label={t('Скрывать персональные данные')} onChange={() => save({ anonymize_transcripts: !settings.anonymize_transcripts })} />
      </SetRow>
      <SetRow title="Требовать согласие сотрудников на запись" desc="Отметка о согласии продавца хранится в настройках организации">
        <Switch on={!!settings.consent_required} label={t('Требовать согласие на запись')} onChange={() => save({ consent_required: !settings.consent_required })} />
      </SetRow>
      <SetRow title="Хранить записи и расшифровки" desc="Срок хранения записей разговоров">
        <div className="seg" role="group" aria-label={t('Срок хранения')}>
          {([[30, '30 дней'], [90, '90 дней'], [180, '180 дней'], [365, '1 год']] as const).map(([d, label]) => (
            <button key={d} type="button" aria-pressed={settings.retention_days === d} onClick={() => save({ retention_days: d })}>{t(label)}</button>
          ))}
        </div>
      </SetRow>
      {mutation.isPending && <div className="set-saving">{t('Сохранение...')}</div>}
      {mutation.isError && <div className="set-error">{t('Не удалось сохранить — нужны права директора или администратора')}</div>}
    </>
  )
}

function NotificationsTab() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['alert-settings'],
    queryFn: () => adminApi.getAlertSettings(),
  })
  const [threshold, setThreshold] = useState('')
  const [emails, setEmails] = useState('')
  useEffect(() => {
    if (!settings) return
    setThreshold(String(settings.score_threshold ?? ''))
    setEmails((settings.email_recipients || []).join(', '))
  }, [settings])
  const mutation = useMutation({
    mutationFn: (data: any) => adminApi.updateAlertSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-settings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
  if (isLoading) return <div className="muted">{t('Загрузка...')}</div>
  if (!settings) return <div className="muted">{t('Не удалось загрузить настройки')}</div>
  const save = (patch: Record<string, unknown>) => mutation.mutate({
    score_threshold: settings.score_threshold,
    no_activity_hours: settings.no_activity_hours,
    email_recipients: settings.email_recipients || [],
    is_active: settings.is_active,
    ...patch,
  })
  const saveThreshold = () => {
    const v = Math.round(Number(threshold))
    if (Number.isFinite(v) && v >= 0 && v <= 100 && v !== settings.score_threshold) save({ score_threshold: v })
    else setThreshold(String(settings.score_threshold))
  }
  const saveEmails = () => {
    const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)
    if (list.join(',') !== (settings.email_recipients || []).join(',')) save({ email_recipients: list })
  }

  return (
    <>
      <SetRow title="Оповещения включены" desc="Уведомления о разговорах, которые требуют внимания">
        <Switch on={!!settings.is_active} label={t('Оповещения включены')} onChange={() => save({ is_active: !settings.is_active })} />
      </SetRow>
      <SetRow title="Балл разговора ниже" desc="Разговор попадёт в «Требуют внимания» и в очередь на разбор">
        <input className="set-num" type="number" min={0} max={100} value={threshold} aria-label={t('Порог балла')}
          onChange={(e) => setThreshold(e.target.value)} onBlur={saveThreshold} onKeyDown={(e) => { if (e.key === 'Enter') saveThreshold() }} />
      </SetRow>
      <SetRow title="Нарушение правил общения" desc="Разговор с нарушением всегда попадает в очередь на разбор">
        <span className="flag is-good">{t('Всегда')}</span>
      </SetRow>
      <SetRow title="Письма на адреса" desc="Через запятую. Пусто — только в интерфейсе">
        <input className="set-text" type="text" value={emails} placeholder="director@shop.ru" aria-label={t('Адреса для писем')}
          onChange={(e) => setEmails(e.target.value)} onBlur={saveEmails} onKeyDown={(e) => { if (e.key === 'Enter') saveEmails() }} />
      </SetRow>
      {mutation.isPending && <div className="set-saving">{t('Сохранение...')}</div>}
      {mutation.isError && <div className="set-error">{t('Не удалось сохранить — нужны права директора или администратора')}</div>}
    </>
  )
}

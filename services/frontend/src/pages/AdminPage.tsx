import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { useTerms } from '@/lib/terms'
import { Store, Building2, Smartphone, Users, Plus, X, Check, Pencil, Power } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  director: 'Директор', admin: 'Администратор', rop: 'РОП', manager: 'Менеджер',
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('stores')
  const terms = useTerms()

  // «Устройства» (бейджи) — только для розницы; в телефонии их скрываем.
  const tabs = [
    { key: 'stores', label: terms.storePlural, icon: Store },
    { key: 'sellers', label: terms.sellerPlural, icon: Building2 },
    ...(terms.isTelephony ? [] : [{ key: 'devices', label: 'Устройства', icon: Smartphone }]),
    { key: 'users', label: 'Пользователи', icon: Users },
  ]

  return (
    <div>
      <div className="tabs fade-in">
        {tabs.map((tab) => (
          <button key={tab.key} className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}>
            <tab.icon size={14} style={{ marginRight: 6 }} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'stores' && <StoresTab />}
      {activeTab === 'sellers' && <SellersTab />}
      {activeTab === 'devices' && !terms.isTelephony && <DevicesTab />}
      {activeTab === 'users' && <UsersTab />}
    </div>
  )
}

// ─── Inline Form Row ───────────────────────────────────────
function FormRow({ children, onSubmit, onCancel, disabled }: {
  children: React.ReactNode
  onSubmit: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  return (
    <div style={{
      padding: '16px 20px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-end',
      flexWrap: 'wrap',
    }}>
      {children}
      <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
        <button className="btn btn-primary btn-sm" onClick={onSubmit} disabled={disabled}
          style={{ height: 38, width: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={16} />
        </button>
        <button className="btn btn-sm" onClick={onCancel}
          style={{ height: 38, width: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: string }) {
  return (
    <div style={{ flex: flex || '1 1 160px' }}>
      <label className="form-label" style={{ fontSize: 12, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function StatusTag({ active, labels }: { active: boolean; labels?: [string, string] }) {
  const [on, off] = labels || ['Активен', 'Отключён']
  return (
    <span className={`tag ${active ? 'tag-success' : 'tag-danger'}`}>
      {active ? on : off}
    </span>
  )
}

function ActionButtons({ isActive, onEdit, onToggle }: { isActive: boolean; onEdit: () => void; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
      <button className="icon-btn" title="Редактировать" onClick={(e) => { e.stopPropagation(); onEdit() }}
        style={{ width: 32, height: 32 }}>
        <Pencil size={14} />
      </button>
      <button className="icon-btn" title={isActive ? 'Деактивировать' : 'Активировать'}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        style={{ width: 32, height: 32, color: isActive ? 'var(--danger)' : 'var(--success)' }}>
        <Power size={14} />
      </button>
    </div>
  )
}

// ─── Stores Tab ─────────────────────────────────────────────
function StoresTab() {
  const qc = useQueryClient()
  const terms = useTerms()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', address: '' })

  const { data, isLoading } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const createMut = useMutation({
    mutationFn: () => adminApi.createStore(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-stores'] }); setShowForm(false); setForm({ name: '', address: '' }) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateStore(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-stores'] }); setEditId(null) },
  })

  const stores = data?.items ?? []

  const startEdit = (s: any) => {
    setEditId(s.id)
    setForm({ name: s.name, address: s.address || '' })
    setShowForm(false)
  }

  const startCreate = () => {
    setShowForm(true)
    setEditId(null)
    setForm({ name: '', address: '' })
  }

  return (
    <div className="card fade-in" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">{terms.storePlural}</div>
          <div className="card-subtitle">{stores.length} · {terms.storePlural.toLowerCase()}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {showForm && (
        <FormRow onSubmit={() => createMut.mutate()} onCancel={() => setShowForm(false)} disabled={!form.name || createMut.isPending}>
          <Field label="Название">
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название магазина" />
          </Field>
          <Field label="Адрес">
            <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Адрес" />
          </Field>
        </FormRow>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Название</th><th>Адрес</th><th>Продавцов</th><th>Устройств</th><th>Статус</th><th style={{ width: 80 }}></th></tr>
            </thead>
            <tbody>
              {stores.map((s: any) => (
                editId === s.id ? (
                  <tr key={s.id} style={{ background: 'var(--bg)' }}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <FormRow onSubmit={() => updateMut.mutate({ id: s.id, data: form })} onCancel={() => setEditId(null)} disabled={!form.name || updateMut.isPending}>
                        <Field label="Название">
                          <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </Field>
                        <Field label="Адрес">
                          <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                        </Field>
                      </FormRow>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{s.name}</td>
                    <td>{s.address || '—'}</td>
                    <td>{s.seller_count ?? 0}</td>
                    <td>{s.device_count ?? 0}</td>
                    <td><StatusTag active={s.is_active} /></td>
                    <td>
                      <ActionButtons isActive={s.is_active} onEdit={() => startEdit(s)}
                        onToggle={() => updateMut.mutate({ id: s.id, data: { is_active: !s.is_active } })} />
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Sellers Tab ────────────────────────────────────────────
function SellersTab() {
  const qc = useQueryClient()
  const terms = useTerms()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ store_id: '', first_name: '', last_name: '' })

  const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data, isLoading } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() })
  const createMut = useMutation({
    mutationFn: () => adminApi.createSeller(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sellers'] }); setShowForm(false); setForm({ store_id: '', first_name: '', last_name: '' }) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateSeller(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sellers'] }); setEditId(null) },
  })

  const sellers = data?.items ?? []
  const stores = storesData?.items ?? []

  const startEdit = (s: any) => {
    setEditId(s.id)
    setForm({ store_id: s.store_id, first_name: s.first_name, last_name: s.last_name })
    setShowForm(false)
  }

  const startCreate = () => {
    setShowForm(true)
    setEditId(null)
    setForm({ store_id: '', first_name: '', last_name: '' })
  }

  return (
    <div className="card fade-in" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">{terms.sellerPlural}</div>
          <div className="card-subtitle">{sellers.length} · {terms.sellerPlural.toLowerCase()}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {showForm && (
        <FormRow onSubmit={() => createMut.mutate()} onCancel={() => setShowForm(false)} disabled={!form.store_id || !form.first_name || createMut.isPending}>
          <Field label={terms.store}>
            <select className="form-input" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
              <option value="">Выберите {terms.store.toLowerCase()}</option>
              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Имя">
            <input className="form-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Имя" />
          </Field>
          <Field label="Фамилия">
            <input className="form-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Фамилия" />
          </Field>
        </FormRow>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Имя</th><th>Фамилия</th><th>{terms.store}</th><th>Статус</th><th style={{ width: 80 }}></th></tr>
            </thead>
            <tbody>
              {sellers.map((s: any) => (
                editId === s.id ? (
                  <tr key={s.id} style={{ background: 'var(--bg)' }}>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <FormRow onSubmit={() => updateMut.mutate({ id: s.id, data: form })} onCancel={() => setEditId(null)} disabled={!form.first_name || updateMut.isPending}>
                        <Field label={terms.store}>
                          <select className="form-input" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                            {stores.map((st: any) => <option key={st.id} value={st.id}>{st.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Имя">
                          <input className="form-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                        </Field>
                        <Field label="Фамилия">
                          <input className="form-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                        </Field>
                      </FormRow>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{s.first_name}</td>
                    <td style={{ color: 'var(--text)' }}>{s.last_name}</td>
                    <td>{s.store_name || stores.find((st: any) => st.id === s.store_id)?.name || '—'}</td>
                    <td><StatusTag active={s.is_active} /></td>
                    <td>
                      <ActionButtons isActive={s.is_active} onEdit={() => startEdit(s)}
                        onToggle={() => updateMut.mutate({ id: s.id, data: { is_active: !s.is_active } })} />
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Devices Tab ────────────────────────────────────────────
function DevicesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ store_id: '', seller_id: '', serial_number: '', model: '' })

  const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data: sellersData } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() })
  const { data, isLoading } = useQuery({ queryKey: ['admin-devices'], queryFn: () => adminApi.getDevices() })
  const createMut = useMutation({
    mutationFn: () => adminApi.createDevice({ ...form, seller_id: form.seller_id || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-devices'] }); setShowForm(false); setForm({ store_id: '', seller_id: '', serial_number: '', model: '' }) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateDevice(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-devices'] }); setEditId(null) },
  })

  const devices = data?.items ?? []
  const stores = storesData?.items ?? []
  const sellers = sellersData?.items ?? []

  const startEdit = (d: any) => {
    setEditId(d.id)
    setForm({ store_id: d.store_id, seller_id: d.seller_id || '', serial_number: d.serial_number, model: d.model || '' })
    setShowForm(false)
  }

  const startCreate = () => {
    setShowForm(true)
    setEditId(null)
    setForm({ store_id: '', seller_id: '', serial_number: '', model: '' })
  }

  return (
    <div className="card fade-in" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Устройства</div>
          <div className="card-subtitle">{devices.length} устройств</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {showForm && (
        <FormRow onSubmit={() => createMut.mutate()} onCancel={() => setShowForm(false)}
          disabled={!form.store_id || !form.serial_number || !form.model || createMut.isPending}>
          <Field label="Магазин">
            <select className="form-input" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
              <option value="">Выберите магазин</option>
              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Продавец (опц.)">
            <select className="form-input" value={form.seller_id} onChange={(e) => setForm({ ...form, seller_id: e.target.value })}>
              <option value="">Не привязан</option>
              {sellers.filter((s: any) => !form.store_id || s.store_id === form.store_id).map((s: any) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Серийный номер" flex="0 1 150px">
            <input className="form-input" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="VIQ-XXX" />
          </Field>
          <Field label="Модель" flex="0 1 160px">
            <input className="form-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="VoiceIQ Badge v2" />
          </Field>
        </FormRow>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Серийный номер</th><th>Модель</th><th>Магазин</th><th>Продавец</th><th>Статус</th><th>Последняя активность</th><th style={{ width: 80 }}></th></tr>
            </thead>
            <tbody>
              {devices.map((d: any) => {
                const store = stores.find((s: any) => s.id === d.store_id)
                const seller = sellers.find((s: any) => s.id === d.seller_id)
                if (editId === d.id) {
                  return (
                    <tr key={d.id} style={{ background: 'var(--bg)' }}>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <FormRow onSubmit={() => updateMut.mutate({ id: d.id, data: { ...form, seller_id: form.seller_id || null } })}
                          onCancel={() => setEditId(null)} disabled={!form.store_id || !form.serial_number || updateMut.isPending}>
                          <Field label="Магазин">
                            <select className="form-input" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </Field>
                          <Field label="Продавец">
                            <select className="form-input" value={form.seller_id} onChange={(e) => setForm({ ...form, seller_id: e.target.value })}>
                              <option value="">Не привязан</option>
                              {sellers.filter((s: any) => !form.store_id || s.store_id === form.store_id).map((s: any) => (
                                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Серийный номер" flex="0 1 150px">
                            <input className="form-input" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
                          </Field>
                          <Field label="Модель" flex="0 1 160px">
                            <input className="form-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                          </Field>
                        </FormRow>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text)' }}>{d.serial_number}</td>
                    <td>{d.model || '—'}</td>
                    <td>{store?.name || '—'}</td>
                    <td>{seller ? `${seller.first_name} ${seller.last_name}` : '—'}</td>
                    <td><StatusTag active={d.is_active} labels={['Активно', 'Отключено']} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('ru-RU') : '—'}
                    </td>
                    <td>
                      <ActionButtons isActive={d.is_active} onEdit={() => startEdit(d)}
                        onToggle={() => updateMut.mutate({ id: d.id, data: { is_active: !d.is_active } })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Users Tab ──────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient()
  const terms = useTerms()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', password: '', role: 'manager', first_name: '', last_name: '', store_id: '' })

  const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() })
  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => adminApi.getUsers() })
  const createMut = useMutation({
    mutationFn: () => adminApi.createUser({ ...form, store_id: form.store_id || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setShowForm(false); setForm({ email: '', password: '', role: 'manager', first_name: '', last_name: '', store_id: '' }) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateUser(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setEditId(null) },
  })

  const users = data?.items ?? []
  const stores = storesData?.items ?? []

  const startEdit = (u: any) => {
    setEditId(u.id)
    setForm({ email: u.email, password: '', role: u.role, first_name: u.first_name, last_name: u.last_name, store_id: u.store_id || '' })
    setShowForm(false)
  }

  const startCreate = () => {
    setShowForm(true)
    setEditId(null)
    setForm({ email: '', password: '', role: 'manager', first_name: '', last_name: '', store_id: '' })
  }

  const saveEdit = (id: string) => {
    const payload: any = { first_name: form.first_name, last_name: form.last_name, role: form.role, store_id: form.store_id || null }
    if (form.password) payload.password = form.password
    updateMut.mutate({ id, data: payload })
  }

  return (
    <div className="card fade-in" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title">Пользователи системы</div>
          <div className="card-subtitle">{users.length} пользователей</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {showForm && (
        <FormRow onSubmit={() => createMut.mutate()} onCancel={() => setShowForm(false)}
          disabled={!form.email || !form.password || !form.first_name || createMut.isPending}>
          <Field label="Email">
            <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          </Field>
          <Field label="Пароль" flex="0 1 140px">
            <input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Мин. 8 символов" />
          </Field>
          <Field label="Имя" flex="0 1 130px">
            <input className="form-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Имя" />
          </Field>
          <Field label="Фамилия" flex="0 1 130px">
            <input className="form-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Фамилия" />
          </Field>
          <Field label="Роль" flex="0 1 140px">
            <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="manager">Менеджер</option>
              <option value="rop">РОП</option>
              <option value="admin">Администратор</option>
              <option value="director">Директор</option>
            </select>
          </Field>
          {(form.role === 'manager' || form.role === 'rop') && (
            <Field label={terms.store} flex="0 1 160px">
              <select className="form-input" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                <option value="">{terms.allStores}</option>
                {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
        </FormRow>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Имя</th><th>Email</th><th>Роль</th><th>{terms.store}</th><th>Статус</th><th style={{ width: 80 }}></th></tr>
            </thead>
            <tbody>
              {users.map((u: any) => {
                const store = stores.find((s: any) => s.id === u.store_id)
                if (editId === u.id) {
                  return (
                    <tr key={u.id} style={{ background: 'var(--bg)' }}>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <FormRow onSubmit={() => saveEdit(u.id)} onCancel={() => setEditId(null)} disabled={!form.first_name || updateMut.isPending}>
                          <Field label="Имя" flex="0 1 130px">
                            <input className="form-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                          </Field>
                          <Field label="Фамилия" flex="0 1 130px">
                            <input className="form-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                          </Field>
                          <Field label="Новый пароль" flex="0 1 140px">
                            <input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Оставьте пустым" />
                          </Field>
                          <Field label="Роль" flex="0 1 140px">
                            <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                              <option value="manager">Менеджер</option>
                              <option value="rop">РОП</option>
                              <option value="admin">Администратор</option>
                              <option value="director">Директор</option>
                            </select>
                          </Field>
                          <Field label={terms.store} flex="0 1 160px">
                            <select className="form-input" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                              <option value="">{terms.allStores}</option>
                              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </Field>
                        </FormRow>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{u.first_name} {u.last_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="tag tag-primary">{ROLE_LABELS[u.role] || u.role}</span>
                    </td>
                    <td>{store?.name || '—'}</td>
                    <td><StatusTag active={u.is_active} /></td>
                    <td>
                      <ActionButtons isActive={u.is_active} onEdit={() => startEdit(u)}
                        onToggle={() => updateMut.mutate({ id: u.id, data: { is_active: !u.is_active } })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('privacy')

  return (
    <div className="card fade-in">
      <div className="tabs">
        {[
          { key: 'privacy', label: 'Приватность' },
          { key: 'notifications', label: 'Уведомления' },
          { key: 'integrations', label: 'Интеграции' },
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
        {activeTab === 'integrations' && <IntegrationsTab />}
      </div>
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
      consent_required: settings.consent_required,
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

      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Согласие на запись</div>
          <div className="toggle-desc">Требовать подтверждение перед началом записи</div>
        </div>
        <div className={`toggle-switch ${settings.consent_required ? 'on' : ''}`}
          onClick={() => toggle('consent_required')} />
      </div>

      <div className="toggle-row" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="toggle-label-group">
          <div className="toggle-title">Срок хранения данных</div>
          <div className="toggle-desc">Автоматически удалять записи через указанный срок</div>
        </div>
        <select
          value={settings.retention_days}
          onChange={(e) => mutation.mutate({
            ...settings,
            retention_days: Number(e.target.value),
          })}
          style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
          }}
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
          value={settings.score_threshold}
          onChange={(e) => mutation.mutate({ ...settings, score_threshold: Number(e.target.value) })}
          style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
          }}
        >
          <option value={40}>40</option>
          <option value={50}>50</option>
          <option value={60}>60</option>
          <option value={70}>70</option>
        </select>
      </div>

      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">Неактивность (часы)</div>
          <div className="toggle-desc">Алерт если устройство не отправляет данные</div>
        </div>
        <select
          value={settings.no_activity_hours}
          onChange={(e) => mutation.mutate({ ...settings, no_activity_hours: Number(e.target.value) })}
          style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
          }}
        >
          <option value={2}>2 часа</option>
          <option value={4}>4 часа</option>
          <option value={8}>8 часов</option>
          <option value={12}>12 часов</option>
          <option value={24}>24 часа</option>
        </select>
      </div>

      {mutation.isPending && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Сохранение...</div>
      )}
    </div>
  )
}

function IntegrationsTab() {
  const [showApiInfo, setShowApiInfo] = useState(false)

  return (
    <div>
      <div className="toggle-row">
        <div className="toggle-label-group">
          <div className="toggle-title">REST API</div>
          <div className="toggle-desc">Доступ через API для интеграции с внешними системами</div>
        </div>
        <div className={`toggle-switch ${showApiInfo ? 'on' : ''}`}
          onClick={() => setShowApiInfo(!showApiInfo)} />
      </div>

      {showApiInfo && (
        <div style={{
          background: 'var(--bg)', padding: '16px', borderRadius: 8, marginTop: 12,
        }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Документация API доступна по адресу:
          </p>
          <div style={{
            background: 'var(--bg-card)', padding: '10px', borderRadius: 6,
            fontSize: 12, fontFamily: 'monospace',
          }}>
            /docs/auth/ &mdash; Аутентификация<br />
            /docs/admin/ &mdash; Администрирование<br />
            /docs/dashboard/ &mdash; Дашборд<br />
            /docs/scripts/ &mdash; Скрипты<br />
            /docs/recorder/ &mdash; Запись<br />
          </div>
        </div>
      )}
    </div>
  )
}

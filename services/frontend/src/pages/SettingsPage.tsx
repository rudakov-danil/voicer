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


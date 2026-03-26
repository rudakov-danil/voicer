import { useState } from 'react'

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('privacy')
  const [settings, setSettings] = useState({
    encryptConversations: true,
    anonymizeData: true,
    deleteAfter90Days: false,
    emailAlerts: true,
    slackAlerts: false,
    criticalOnly: false,
    apiIntegration: false
  })

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="card fade-in">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          Приватность
        </button>
        <button
          className={`tab ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Уведомления
        </button>
        <button
          className={`tab ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          Интеграции
        </button>
      </div>

      <div style={{ padding: '24px' }}>
        {activeTab === 'privacy' && (
          <div>
            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">Шифрование разговоров</div>
                <div className="toggle-desc">Все разговоры шифруются по стандарту AES-256</div>
              </div>
              <div
                className={`toggle-switch ${settings.encryptConversations ? 'on' : ''}`}
                onClick={() => toggleSetting('encryptConversations')}
              />
            </div>

            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">Анонимизация данных</div>
                <div className="toggle-desc">Удалять персональные данные после обработки</div>
              </div>
              <div
                className={`toggle-switch ${settings.anonymizeData ? 'on' : ''}`}
                onClick={() => toggleSetting('anonymizeData')}
              />
            </div>

            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">Удаление через 90 дней</div>
                <div className="toggle-desc">Автоматически удалять старые записи</div>
              </div>
              <div
                className={`toggle-switch ${settings.deleteAfter90Days ? 'on' : ''}`}
                onClick={() => toggleSetting('deleteAfter90Days')}
              />
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">Email уведомления</div>
                <div className="toggle-desc">Получать оповещения на почту</div>
              </div>
              <div
                className={`toggle-switch ${settings.emailAlerts ? 'on' : ''}`}
                onClick={() => toggleSetting('emailAlerts')}
              />
            </div>

            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">Slack уведомления</div>
                <div className="toggle-desc">Отправлять алерты в Slack</div>
              </div>
              <div
                className={`toggle-switch ${settings.slackAlerts ? 'on' : ''}`}
                onClick={() => toggleSetting('slackAlerts')}
              />
            </div>

            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">Только критичные</div>
                <div className="toggle-desc">Уведомлять только о серьёзных нарушениях</div>
              </div>
              <div
                className={`toggle-switch ${settings.criticalOnly ? 'on' : ''}`}
                onClick={() => toggleSetting('criticalOnly')}
              />
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div>
            <div className="toggle-row">
              <div className="toggle-label-group">
                <div className="toggle-title">REST API</div>
                <div className="toggle-desc">Включить доступ через API</div>
              </div>
              <div
                className={`toggle-switch ${settings.apiIntegration ? 'on' : ''}`}
                onClick={() => toggleSetting('apiIntegration')}
              />
            </div>
            {settings.apiIntegration && (
              <div style={{ background: 'var(--bg)', padding: '12px', borderRadius: '6px', marginTop: '12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>API Key:</p>
                <code style={{
                  display: 'block',
                  background: 'var(--bg-card)',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  wordBreak: 'break-all'
                }}>
                  sk_live_abcd1234efgh5678ijkl9012mnop3456
                </code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

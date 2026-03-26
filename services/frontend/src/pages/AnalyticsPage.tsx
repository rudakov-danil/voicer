import { useState } from 'react'

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('objections')

  return (
    <div className="card fade-in">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'objections' ? 'active' : ''}`}
          onClick={() => setActiveTab('objections')}
        >
          Возражения
        </button>
        <button
          className={`tab ${activeTab === 'conversion' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversion')}
        >
          Конверсия
        </button>
        <button
          className={`tab ${activeTab === 'sentiment' ? 'active' : ''}`}
          onClick={() => setActiveTab('sentiment')}
        >
          Сентимент
        </button>
      </div>

      {activeTab === 'objections' && (
        <div style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Анализ возражений клиентов</p>
        </div>
      )}
      {activeTab === 'conversion' && (
        <div style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Воронка конверсии</p>
        </div>
      )}
      {activeTab === 'sentiment' && (
        <div style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Анализ сентимента</p>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'

export function IntelligencePage() {
  const [activeTab, setActiveTab] = useState('competitors')

  return (
    <div className="card fade-in">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'competitors' ? 'active' : ''}`}
          onClick={() => setActiveTab('competitors')}
        >
          Конкуренты
        </button>
        <button
          className={`tab ${activeTab === 'trends' ? 'active' : ''}`}
          onClick={() => setActiveTab('trends')}
        >
          Тренды
        </button>
        <button
          className={`tab ${activeTab === 'voice' ? 'active' : ''}`}
          onClick={() => setActiveTab('voice')}
        >
          Голос клиента
        </button>
      </div>

      {activeTab === 'competitors' && (
        <div style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Анализ упоминаний конкурентов в разговорах</p>
        </div>
      )}
      {activeTab === 'trends' && (
        <div style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Актуальные тренды и темы</p>
        </div>
      )}
      {activeTab === 'voice' && (
        <div style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Неудовлетворённые потребности клиентов</p>
        </div>
      )}
    </div>
  )
}

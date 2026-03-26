export function CompliancePage() {
  return (
    <div>
      <div className="metrics-grid fade-in">
        <div className="metric-card">
          <div className="metric-label">Процент соответствия</div>
          <div className="metric-value">94%</div>
          <div className="metric-change up" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            ↑ 2%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Всего проверено</div>
          <div className="metric-value">1,242</div>
          <div className="metric-change up" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            ↑ 5%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Нарушений найдено</div>
          <div className="metric-value">74</div>
          <div className="metric-change down" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            ↓ 8%
          </div>
        </div>
      </div>

      <div className="grid-2 fade-in">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Нарушения по типам</div>
              <div className="card-subtitle">Распределение найденных нарушений</div>
            </div>
          </div>
          <div style={{ padding: '20px 0' }}>
            {[
              { type: 'Отсутствие раскрытия гарантии', count: 28, color: '#DC2626' },
              { type: 'Недостаточное объяснение условий', count: 22, color: '#F59E0B' },
              { type: 'Прерывание клиента', count: 15, color: '#8B5CF6' },
              { type: 'Агрессивный тон', count: 9, color: '#3B82F6' }
            ].map((item, i) => (
              <div key={i} className="objection-row">
                <div className="objection-label">{item.type}</div>
                <div className="objection-bar-wrap">
                  <div
                    className="objection-bar-fill"
                    style={{ width: `${(item.count / 28) * 100}%`, background: item.color }}
                  />
                </div>
                <div className="objection-count">{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Правила комплаенса</div>
              <div className="card-subtitle">Активные проверки</div>
            </div>
          </div>
          <ul className="checklist">
            <li className="checklist-item">
              <div className="check-icon done">✓</div>
              <div className="checklist-text done">Раскрытие условий гарантии</div>
            </li>
            <li className="checklist-item">
              <div className="check-icon done">✓</div>
              <div className="checklist-text done">Предложение расширенной гарантии</div>
            </li>
            <li className="checklist-item">
              <div className="check-icon missed">✗</div>
              <div className="checklist-text missed">Предложение аксессуаров</div>
            </li>
            <li className="checklist-item">
              <div className="check-icon done">✓</div>
              <div className="checklist-text done">Вежливый тон</div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

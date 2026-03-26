export function TrainingPage() {
  return (
    <div>
      <div className="grid-2 fade-in">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Новички</div>
              <div className="card-subtitle">Прогресс обучения</div>
            </div>
          </div>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет новичков в обучении
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Рекомендуемые</div>
              <div className="card-subtitle">Лучшие разговоры для учёбы</div>
            </div>
          </div>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет записей
          </div>
        </div>
      </div>
    </div>
  )
}

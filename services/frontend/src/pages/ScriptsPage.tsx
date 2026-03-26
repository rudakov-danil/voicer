export function ScriptsPage() {
  return (
    <div className="card fade-in">
      <div className="card-header">
        <div>
          <div className="card-title">Шаблоны скриптов</div>
          <div className="card-subtitle">Управление продажными скриптами</div>
        </div>
        <button className="btn btn-primary btn-sm">+ Новый шаблон</button>
      </div>
      <p style={{ color: 'var(--text-muted)', padding: '40px 20px', textAlign: 'center' }}>
        Шаблоны скриптов будут загружены из API
      </p>
    </div>
  )
}

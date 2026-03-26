import { Search, Bell } from 'lucide-react'

interface TopbarProps {
  title: string
  subtitle?: string
  onPeriodChange?: (period: number) => void
  period?: number
}

export function Topbar({ title, subtitle, onPeriodChange, period = 30 }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      <div className="topbar-right">
        <div className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Поиск..." />
        </div>

        <div className="topbar-divider" />

        {onPeriodChange && (
          <select
            className="period-select"
            value={period}
            onChange={(e) => onPeriodChange(parseInt(e.target.value))}
          >
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
        )}

        <button className="icon-btn">
          <Bell size={20} />
          <span className="notif-badge">3</span>
        </button>
      </div>
    </div>
  )
}

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface LineChartWidgetProps {
  data: Array<{ label: string; value: number }>
  color?: string
  height?: number
}

export function LineChartWidget({ data, color = '#2563EB', height = 240 }: LineChartWidgetProps) {
  const chartData = data.map((d) => ({
    name: d.label,
    value: d.value
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" stroke="var(--text-muted)" style={{ fontSize: '12px' }} />
        <YAxis stroke="var(--text-muted)" style={{ fontSize: '12px' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px'
          }}
          labelStyle={{ color: 'var(--text)' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

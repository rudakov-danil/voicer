import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'

interface DonutChartWidgetProps {
  data: Array<{ name: string; value: number; color: string }>
  height?: number
  valueSuffix?: string
}

export function DonutChartWidget({ data, height = 240, valueSuffix = '' }: DonutChartWidgetProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px'
          }}
          labelStyle={{ color: 'var(--text)' }}
          formatter={(value: number, name: string) => [`${value}${valueSuffix}`, name]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

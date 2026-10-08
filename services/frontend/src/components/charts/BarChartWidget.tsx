import { useLayoutEffect, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const RIGHT_MARGIN = 30
const Y_AXIS_WIDTH = 40
// Средняя ширина символа кириллицы в долях кегля — для оценки, влезает ли подпись.
// Замерено по факту рендера: 21 символ при кегле 10 занимает ~138px.
const CHAR_WIDTH_RATIO = 0.62
// Наклонные подписи: угол и высота оси X под них.
const TICK_ANGLE_DEG = 35
const ANGLED_AXIS_HEIGHT = 88
// Отступ базовой линии тика от оси — его тоже надо вычесть из бюджета высоты.
const TICK_BASELINE_OFFSET = 12

function truncate(s: string, maxChars: number) {
  return s.length > maxChars ? s.slice(0, Math.max(maxChars - 1, 1)) + '…' : s
}

// Тик оси X в двух режимах — какой выбрать, решает BarChartWidget по ширине
// слота под колонку:
//  • wrap  — широкие слоты: перенос по словам на 2 строки;
//  • angle — узкие слоты («Топ-10 продавцов»): наклон на 35°, при котором
//            соседние подписи расходятся по вертикали и не наезжают друг
//            на друга, а имя остаётся читаемым целиком.
function WrappedTick({ x, y, payload, maxChars = 16, fontSize = 11, mode = 'wrap' }: any) {
  const value = String(payload?.value ?? '')

  if (mode === 'angle') {
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={10}
          textAnchor="end"
          transform={`rotate(-${TICK_ANGLE_DEG})`}
          fill="var(--text-muted)"
          style={{ fontSize }}
        >
          {truncate(value, maxChars)}
        </text>
      </g>
    )
  }

  const words = value.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = (cur ? cur + ' ' : '') + w
    if (next.length <= maxChars) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  // Слово длиннее лимита переносом не разбить — режем многоточием.
  const shown = lines.slice(0, 2).map((ln) => truncate(ln, maxChars))
  if (lines.length > 2) shown[1] = truncate(shown[1] + '…', maxChars)

  const lineHeight = fontSize + 2

  return (
    <g transform={`translate(${x},${y})`}>
      {shown.map((ln, i) => (
        <text key={i} x={0} y={0} dy={12 + i * lineHeight} textAnchor="middle" fill="var(--text-muted)" style={{ fontSize }}>
          {ln}
        </text>
      ))}
    </g>
  )
}

interface BarChartWidgetProps {
  data: Array<{ label: string; value: number }>
  color?: string
  height?: number
  valueLabel?: string
  valueSuffix?: string
}

export function BarChartWidget({
  data,
  color = '#2E5BFF',
  height = 240,
  valueLabel = 'Значение',
  valueSuffix = '',
}: BarChartWidgetProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  // Меряем контейнер до монтирования графика (useLayoutEffect + рендер только при
  // width > 0): если отдать recharts ререндер уже во время стартовой анимации,
  // колонки залипают на ширине предыдущего layout и остаются нитками у левого края.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const next = entries[0].contentRect.width
      // Игнорируем дрожание в пару пикселей — лишние ререндеры графику вредят.
      setWidth((prev) => (Math.abs(next - prev) > 8 ? next : prev))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const chartData = data.map((d) => ({
    name: d.label,
    value: d.value
  }))

  // Лимит символов считаем от реальной ширины слота под колонку, а не от одного
  // лишь числа колонок: на «Топ-10» в узкой карточке подписи иначе наезжают.
  const count = chartData.length
  const slot = Math.max((width - Y_AXIS_WIDTH - RIGHT_MARGIN) / Math.max(count, 1), 24)
  const fontSize = count > 8 ? 10 : 11
  // Самое длинное слово диктует, влезает ли подпись в слот горизонтально.
  const longestWord = chartData.reduce(
    (m, d) => Math.max(m, ...String(d.name).split(' ').map((w) => w.length)),
    0,
  )
  const wrapChars = Math.max(4, Math.floor((slot - 4) / (fontSize * CHAR_WIDTH_RATIO)))
  // Не влезает даже по словам — уходим в наклон вместо резки до огрызков.
  const mode = longestWord > wrapChars ? 'angle' : 'wrap'
  const axisHeight = mode === 'angle' ? ANGLED_AXIS_HEIGHT : 44
  // Наклонную подпись ограничивает высота оси: L * sin(угол) ≤ высота − отступ,
  // иначе хвост уходит за нижнюю границу svg и обрезается.
  const angleChars = Math.floor(
    ((ANGLED_AXIS_HEIGHT - TICK_BASELINE_OFFSET) / Math.sin((TICK_ANGLE_DEG * Math.PI) / 180)) /
      (fontSize * CHAR_WIDTH_RATIO),
  )
  const maxChars = mode === 'angle' ? angleChars : wrapChars
  // Наклонная подпись уходит влево от своего тика — у первой колонки ей нужен запас.
  const leftMargin = mode === 'angle' ? 12 : 0

  return (
    <div ref={wrapRef} style={{ width: '100%', height }}>
      {width > 0 && (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 5, right: RIGHT_MARGIN, left: leftMargin, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="name"
            stroke="var(--text-muted)"
            interval={0}
            height={axisHeight}
            tickLine={false}
            tick={<WrappedTick maxChars={maxChars} fontSize={fontSize} mode={mode} />}
          />
          <YAxis width={Y_AXIS_WIDTH} stroke="var(--text-muted)" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px'
            }}
            labelStyle={{ color: 'var(--text)' }}
            formatter={(value: number) => [`${value}${valueSuffix}`, valueLabel]}
          />
          <Bar dataKey="value" name={valueLabel} fill={color} radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  )
}

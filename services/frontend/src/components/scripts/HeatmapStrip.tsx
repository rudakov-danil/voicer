import { HelpTooltip } from './HelpTooltip'

type StepRow = {
  step_name: string
  pass_rate: number
  avg_score: number
  total_count: number
  detected_count: number
  detection_rate: number
}

/** Тёмная синяя — высокий pass_rate, светлая — низкий, красная — критический. */
function cellColor(pass: number): string {
  if (pass >= 80) return 'var(--success)'
  if (pass >= 60) return '#34D399'
  if (pass >= 40) return '#FBBF24'
  if (pass >= 20) return '#F97316'
  return 'var(--danger)'
}

function cellOpacity(pass: number): number {
  return Math.max(0.25, Math.min(1, 0.25 + (pass / 100) * 0.75))
}

export function HeatmapStrip({ rows }: { rows: StepRow[] }) {
  if (!rows.length) return null
  return (
    <div className="heatmap-strip">
      <div className="heatmap-header">
        <div className="heatmap-title">
          Тепловая карта этапов
          <HelpTooltip content={
            <div style={{ maxWidth: 280 }}>
              Цвет показывает <strong>% выполнения этапа</strong>. Зелёный — этап стабильно выполняется,
              красный — массово проваливается, требует внимания.
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: 'var(--danger)', borderRadius: 2 }} />
                <span style={{ fontSize: 11 }}>0–20%</span>
                <span style={{ width: 12, height: 12, background: '#F97316', borderRadius: 2, marginLeft: 8 }} />
                <span style={{ fontSize: 11 }}>20–40%</span>
                <span style={{ width: 12, height: 12, background: '#FBBF24', borderRadius: 2, marginLeft: 8 }} />
                <span style={{ fontSize: 11 }}>40–60%</span>
                <span style={{ width: 12, height: 12, background: '#34D399', borderRadius: 2, marginLeft: 8 }} />
                <span style={{ fontSize: 11 }}>60–80%</span>
                <span style={{ width: 12, height: 12, background: 'var(--success)', borderRadius: 2, marginLeft: 8 }} />
                <span style={{ fontSize: 11 }}>80–100%</span>
              </div>
            </div>
          } />
        </div>
      </div>
      <div className="heatmap-cells">
        {rows.map((r, i) => (
          <div
            key={i}
            className="heatmap-cell"
            style={{
              background: cellColor(r.pass_rate),
              opacity: cellOpacity(r.pass_rate),
            }}
            title={`${r.step_name}: ${r.pass_rate}% выполнения · ${r.avg_score} ср. балл`}
          >
            <div className="heatmap-cell-value">{Math.round(r.pass_rate)}%</div>
            <div className="heatmap-cell-name">{r.step_name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

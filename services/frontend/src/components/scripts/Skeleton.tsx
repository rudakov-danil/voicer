type LineProps = { width?: number | string; height?: number; style?: React.CSSProperties }

export function SkeletonLine({ width = '100%', height = 12, style }: LineProps) {
  return (
    <div
      className="skeleton-line"
      style={{ width, height, ...style }}
    />
  )
}

export function SkeletonScriptCard() {
  return (
    <div className="skeleton-script-card">
      <div className="skeleton-circle" />
      <div style={{ flex: 1 }}>
        <SkeletonLine width="60%" height={13} />
        <SkeletonLine width="40%" height={10} style={{ marginTop: 6 }} />
      </div>
      <div className="skeleton-toggle" />
    </div>
  )
}

export function SkeletonAnalyticsRow() {
  return (
    <div className="skeleton-analytics-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <SkeletonLine width="40%" height={13} />
        <SkeletonLine width="22%" height={13} />
      </div>
      <SkeletonLine width="100%" height={6} />
    </div>
  )
}

interface ScoreBadgeProps {
  score: number
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const tagClass =
    score >= 80 ? 'tag-success' :
    score >= 60 ? 'tag-warning' :
    'tag-danger'

  return (
    <span className={`tag ${tagClass}`}>{Math.round(score)}%</span>
  )
}

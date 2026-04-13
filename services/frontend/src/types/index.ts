export interface User {
  id: string
  email: string
  role: 'director' | 'admin' | 'rop' | 'manager'
  first_name: string
  last_name: string
  organization_id: string
  store_id: string | null
}

export interface Store {
  id: string
  name: string
  address?: string
  is_active: boolean
}

export interface Seller {
  id: string
  first_name: string
  last_name: string
  store_id: string
  store_name?: string
  is_active: boolean
  avg_score?: number
  conversion_rate?: number
  conversations_count?: number
  weakest_step?: string
  score_trend?: 'up' | 'down' | 'stable'
  trend?: number
}

export interface Conversation {
  id: string
  seller_id: string
  store_id: string
  session_date: string
  analyzed_at?: string
  recorded_at?: string
  duration_seconds?: number
  overall_score: number
  outcome: 'purchase' | 'deferred' | 'price_objection' | 'competitor' | 'unknown'
  has_upsell?: boolean
  has_violations?: boolean
  compliance_ok?: boolean
  topic?: string
  recording_id?: string
}

export interface ConversationDetail extends Conversation {
  segments: TranscriptSegment[]
  script_results: ScriptResult[]
  objections: Objection[]
}

export interface TranscriptSegment {
  start_time: number
  end_time: number
  speaker_role: 'seller' | 'client' | 'unknown'
  text: string
}

export interface ScriptResult {
  script_name: string
  total_score: number
  steps: { name: string; score: number; weight: number }[]
}

export interface Objection {
  type: string
  text: string
}

export interface DashboardOverview {
  total_conversations: number
  avg_score: number
  conversion_rate: number
  avg_check?: number
  score_distribution?: { excellent: number; good: number; poor: number }
  daily_stats: { date: string; total: number; avg_score: number; conversion_rate: number }[]
  conversations_by_day?: { date: string; count: number }[]
  score_by_store?: { store_name: string; avg_score: number }[]
  outcomes?: { outcome: string; count: number }[]
  alerts?: { severity: 'danger' | 'warning' | 'info'; message: string }[]
}

export interface ScriptTemplate {
  id: string
  name: string
  is_active: boolean
  steps: ScriptStep[]
}

export interface ScriptStep {
  id: string
  name: string
  description?: string
  weight: number
  order: number
  is_required: boolean
  recommendation_text?: string
}

// --- Analytics Types ---

export interface ObjectionDistribution {
  type: string
  count: number
  percentage: number
}

export interface ObjectionCorrelation {
  type: string
  total: number
  purchases: number
  refusals: number
  conversion_after: number
  best_technique: string
}

export interface ConversionFunnel {
  stage: string
  count: number
  percentage: number
}

export interface ConversionByStore {
  store_name: string
  conversion_rate: number
}

export interface SentimentData {
  positive: number
  neutral: number
  negative: number
}

export interface SentimentTrend {
  week: string
  positive: number
  neutral: number
  negative: number
}

// --- Intelligence Types ---

export interface CompetitorMention {
  name: string
  mentions: number
  trend: number
  sentiment: 'positive' | 'negative' | 'mixed' | 'neutral'
}

export interface TopicTrend {
  topic: string
  mentions: number
  trend: number
  is_hot: boolean
}

export interface UnmetDemand {
  rank: number
  description: string
  mentions: number
}

export interface ProductFeedback {
  product: string
  pros: string[]
  cons: string[]
}

// --- Training Types ---

export interface NewcomerProgress {
  seller_id: string
  first_name: string
  last_name: string
  store_name: string
  weeks_in_company: number
  progress: number
  development_zone: string
  weekly_scores: { week: string; score: number }[]
}

export interface BestConversation {
  id: string
  seller_name: string
  topic: string
  score: number
  highlight: string
}

// --- Compliance Types ---

export interface ComplianceMetrics {
  compliance_level: number
  conversations_reviewed: number
  violations_count: number
}

export interface Violation {
  id: string
  date: string
  seller_name: string
  store_name: string
  violation: string
  status: string
}

export interface ComplianceRule {
  industry: string
  rules_count: number
  is_active: boolean
}

export interface ViolationType {
  name: string
  count: number
  severity: 'high' | 'medium' | 'low'
}

// --- Admin Types ---

export interface Device {
  id: string
  serial_number: string
  model: string
  store_id: string
  seller_id?: string
  is_active: boolean
  last_seen_at?: string
}

export interface PrivacySettings {
  employee_consent: boolean
  client_notification: boolean
  advance_notice: boolean
  data_localization: boolean
  encryption: boolean
  anonymize_pii: boolean
  retention_days: number
}

export interface AlertSettings {
  compliance_violations: boolean
  upsell_gaps: boolean
  competitor_spike: boolean
  weekly_report: boolean
  low_scoring_alert: boolean
}

// --- Seller Detail ---

export interface SellerDetail {
  id: string
  first_name: string
  last_name: string
  store_name: string
  conversion_rate: number
  avg_score: number
  avg_check: number
  conversations_count: number
  score_trend: number
  step_scores: { name: string; score: number }[]
  recommendations: { severity: 'warning' | 'info'; text: string }[]
  recent_conversations: {
    id: string
    topic: string
    date: string
    duration_seconds: number
    score: number
    outcome: string
  }[]
}

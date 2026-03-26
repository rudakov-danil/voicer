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
  is_active: boolean
  avg_score?: number
  conversion_rate?: number
  conversations_count?: number
  trend?: number
}

export interface Conversation {
  id: string
  seller_id: string
  store_id: string
  recorded_at: string
  duration_seconds: number
  overall_score: number
  outcome: 'purchase' | 'deferred' | 'price_objection' | 'competitor' | 'unknown'
  has_upsell: boolean
  compliance_ok: boolean
  topic?: string
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
  conversations_by_day: { date: string; count: number }[]
  score_by_store: { store_name: string; avg_score: number }[]
  outcomes: { outcome: string; count: number }[]
  alerts: { severity: 'danger' | 'warning' | 'info'; message: string }[]
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
  weight: number
  order: number
  is_required: boolean
}

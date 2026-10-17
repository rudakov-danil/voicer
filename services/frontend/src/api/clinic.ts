import apiClient from './client'

/* Клиники (industry = clinic): приёмы, протоколы, качество работы врачей, правила контроля.
   Бэкенд — dashboard-service, routers/clinic.py. Доли (service, competence) — 0..1. */

export type RuleCategory = 'service' | 'competence' | 'fraud'
export type RuleKind = 'required' | 'forbidden'
export type Severity = 'low' | 'medium' | 'high'
export type CheckStatus = 'met' | 'partial' | 'missed' | 'na' | 'violated'
export type ProtocolStatus = 'draft' | 'confirmed' | 'failed'
export type Protocol = Record<string, string | null>
export type VisitView = 'all' | 'fraud' | 'issues' | 'low' | 'draft' | 'non_visit'

export interface Range { date_from?: string; date_to?: string; store_id?: string }

export interface ClinicTotals {
  visits: number
  non_visits: number
  avg_duration_sec: number | null
  service: number | null
  service_visits: number
  competence: number | null
  competence_visits: number
  fraud_signals: number
  fraud_visits: number
  issue_signals: number
  issue_visits: number
  protocols: number
  protocols_confirmed: number
}

export interface DoctorRow extends ClinicTotals {
  seller_id: string
  name: string
  store_name: string | null
  specialty: string | null
}

export interface CriterionRow {
  rule_id: string | null
  title: string
  category: RuleCategory
  met: number
  partial: number
  missed: number
  na: number
  applicable: number
  rate: number | null
  team_rate?: number | null
}

export interface SignalRow {
  rule_id: string
  title: string
  category: RuleCategory
  severity: Severity
  count: number
  visits: number
  doctors: Array<{ seller_id: string; name: string; count: number }>
}

export interface WeekRow {
  week: string
  visits: number
  service: number | null
  competence: number | null
  fraud_signals: number
  issue_signals: number
}

export interface SignalQuote {
  conversation_id: string
  title: string
  category: RuleCategory
  severity: Severity
  quote: string
  comment: string
  reason: string | null
  when: string
  seller_id?: string
  seller_name?: string
  store_name?: string | null
}

export interface ClinicOverview {
  period: { date_from: string; date_to: string }
  low_score: number
  totals: ClinicTotals
  doctors: DoctorRow[]
  criteria: CriterionRow[]
  signals: SignalRow[]
  weeks: WeekRow[]
  attention: SignalQuote[]
}

export interface VisitRow {
  conversation_id: string
  recording_id: string
  seller_id: string
  seller_name: string
  store_name: string | null
  session_date: string
  at: string | null
  time: string | null
  duration_sec: number | null
  reason: string | null
  diagnosis: string | null
  is_visit: boolean
  service: number | null
  competence: number | null
  fraud_signals: number
  issue_signals: number
  note: string | null
  checks_done: boolean
  protocol_status: ProtocolStatus | null
  signals: Array<{ title: string; category: RuleCategory; severity: Severity }>
}

export interface VisitList {
  total: number
  items: VisitRow[]
  counts?: Record<VisitView, number>
}

export interface VisitCheck {
  rule_id: string | null
  code: string | null
  category: RuleCategory
  kind: RuleKind
  title: string
  severity: Severity
  status: CheckStatus
  quote: string
  comment: string
}

export interface ProtocolState {
  status: ProtocolStatus
  draft: Protocol | null
  final: Protocol | null
  confirmed_at: string | null
  confirmed_by_name: string | null
  generated_at: string | null
}

export interface VisitDetail {
  fields: Array<[string, string]>
  visit: {
    conversation_id: string
    recording_id: string
    seller_id: string
    seller_name: string
    specialty: string | null
    store_id: string
    store_name: string | null
    session_date: string
    at: string | null
    when: string | null
    duration_sec: number | null
    source: string | null
    reason: string | null
    is_visit: boolean
    visit_type: 'primary' | 'follow_up' | null
    service: number | null
    competence: number | null
    fraud_signals: number
    issue_signals: number
    note: string | null
    checks_done: boolean
    talk_ratio: number | null
    interruptions_count: number | null
    longest_monologue_seconds: number | null
  }
  protocol: ProtocolState | null
  checks: VisitCheck[]
  violations: VisitCheck[]
  segments: Array<{ speaker_role: string; text: string; start_ms: number | null; end_ms: number | null }>
}

export interface DoctorDetail {
  period: { date_from: string; date_to: string }
  doctor: { seller_id: string; name: string; store_id: string; store_name: string | null; specialty: string | null }
  totals: ClinicTotals
  team: ClinicTotals
  criteria: CriterionRow[]
  weeks: WeekRow[]
  signals: SignalQuote[]
}

export interface QualityRule {
  id?: string
  code?: string | null
  category: RuleCategory
  kind: RuleKind
  title: string
  description: string
  severity: Severity
  is_active: boolean
}

export interface Invitation { url: string; expires_at: string; seller_name: string }

const BASE = '/api/v1/dashboard/clinic'

export const clinicApi = {
  overview: async (params: Range) => (await apiClient.get<ClinicOverview>(`${BASE}/overview`, { params })).data,
  visits: async (params: Range & { seller_id?: string; view?: VisitView; q?: string; limit?: number; offset?: number; with_counts?: boolean }) =>
    (await apiClient.get<VisitList>(`${BASE}/visits`, { params })).data,
  visit: async (id: string) => (await apiClient.get<VisitDetail>(`${BASE}/visits/${id}`)).data,
  doctor: async (id: string, params: Range) => (await apiClient.get<DoctorDetail>(`${BASE}/doctors/${id}`, { params })).data,
  setSpecialty: async (id: string, specialty: string) =>
    (await apiClient.put<{ seller_id: string; specialty: string | null }>(`${BASE}/doctors/${id}`, { specialty })).data,
  rules: async () => (await apiClient.get<{ items: QualityRule[]; can_edit: boolean }>(`${BASE}/rules`)).data,
  saveRules: async (items: QualityRule[]) =>
    (await apiClient.put<{ items: QualityRule[]; can_edit: boolean }>(`${BASE}/rules`, { items })).data,
  // Приложение врача: одноразовая ссылка подключения (тот же механизм, что у сотрудников кофеен)
  invite: async (seller_id: string) => (await apiClient.post<Invitation>('/api/v1/auth/mobile/invitations', { seller_id })).data,
  revoke: async (seller_id: string) => { await apiClient.delete(`/api/v1/auth/mobile/accounts/${seller_id}`) },
}

import apiClient from './client'

export type Severity = 'high' | 'medium' | 'low'

export interface ComplianceRule {
  id: string
  organization_id: string
  title: string
  description: string
  severity: Severity
  keywords: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ComplianceRuleCreate {
  title: string
  description?: string
  severity?: Severity
  keywords?: string[]
  is_active?: boolean
}

export interface ComplianceRulePatch {
  title?: string
  description?: string
  severity?: Severity
  keywords?: string[]
  is_active?: boolean
}

export interface ComplianceViolation {
  id: string
  rule_id: string
  rule_title: string
  severity: Severity
  evidence: string
  explanation: string
  conversation_id: string
  session_date: string
  topic?: string | null
  outcome?: string | null
  seller_name?: string | null
  store_name?: string | null
  recorded_at?: string | null
  /** Разбор с продавцом: open — в плане, done — разобран, null — ещё не брали */
  review?: 'open' | 'done' | null
}

export interface ComplianceByRule {
  rule_id: string
  rule_title: string
  severity: Severity
  count: number
  affected_conversations: number
}

export interface ComplianceSummary {
  period: { date_from: string; date_to: string }
  totals: {
    total_conversations: number
    conversations_with_violations: number
    total_violations: number
  }
  by_rule: ComplianceByRule[]
  recent: ComplianceViolation[]
}

export interface ScriptIssue {
  kind: 'script' | 'objection'
  conversation_id: string
  session_date: string
  topic?: string | null
  outcome?: string | null
  seller_name?: string | null
  store_name?: string | null
  script_name?: string | null
  objection_type?: string | null
  text: string
}

export interface ScriptIssuesSummary {
  period: { date_from: string; date_to: string }
  totals: {
    total_conversations: number
    conversations_with_issues: number
    script_violations_count: number
    unresolved_objections_count: number
  }
  recent: ScriptIssue[]
}

export const complianceApi = {
  listRules: async (): Promise<ComplianceRule[]> => {
    const res = await apiClient.get<{ items: ComplianceRule[]; total: number }>('/api/v1/scripts/compliance-rules')
    return res.data.items
  },

  createRule: async (data: ComplianceRuleCreate): Promise<ComplianceRule> => {
    const res = await apiClient.post<ComplianceRule>('/api/v1/scripts/compliance-rules', data)
    return res.data
  },

  patchRule: async (id: string, data: ComplianceRulePatch): Promise<ComplianceRule> => {
    const res = await apiClient.patch<ComplianceRule>(`/api/v1/scripts/compliance-rules/${id}`, data)
    return res.data
  },

  deleteRule: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/scripts/compliance-rules/${id}`)
  },

  getSummary: async (params: { date_from?: string; date_to?: string; recent_limit?: number; store_id?: string; period?: number } = {}): Promise<ComplianceSummary> => {
    const apiParams: Record<string, any> = { ...params }
    if (params.period && !params.date_from && !params.date_to) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - params.period)
      apiParams.date_from = from.toISOString().split('T')[0]
      apiParams.date_to = to.toISOString().split('T')[0]
    }
    delete apiParams.period
    const res = await apiClient.get<ComplianceSummary>('/api/v1/dashboard/compliance/summary', { params: apiParams })
    return res.data
  },

  getScriptIssuesSummary: async (params: { date_from?: string; date_to?: string; recent_limit?: number; store_id?: string; period?: number } = {}): Promise<ScriptIssuesSummary> => {
    const apiParams: Record<string, any> = { ...params }
    if (params.period && !params.date_from && !params.date_to) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - params.period)
      apiParams.date_from = from.toISOString().split('T')[0]
      apiParams.date_to = to.toISOString().split('T')[0]
    }
    delete apiParams.period
    const res = await apiClient.get<ScriptIssuesSummary>('/api/v1/dashboard/compliance/script-issues-summary', { params: apiParams })
    return res.data
  },
}

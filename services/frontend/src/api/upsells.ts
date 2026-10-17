import apiClient from './client'

/* Допродажи (dashboard-service routers/upsell.py, analytics-engine routers/coach.py).
   Заказ — разговор, где гость что-то покупал (offer_opportunity). Попытка — заказ хотя бы
   с одним предложением. «Что-нибудь ещё?» (technique = generic) предложением не считается.
   Разбор есть только у разговоров, проанализированных после миграции analytics 0010. */

export type OfferTechnique = 'generic' | 'specific' | 'choice' | 'benefit' | 'promo'
export type OfferResponse = 'accepted' | 'declined' | 'no_answer'

export interface UpsellPlan {
  attempt_rate_target: number
  attempt_rate_source: 'default' | 'organization' | 'store' | 'seller'
  accepted_per_shift: number | null
  accepted_source: string | null
  focus_items: string[]
  focus_source: string | null
}

export interface ShiftOffer {
  item: string
  category: string
  technique: OfferTechnique
  response: OfferResponse
  is_focus: boolean
  quote: string
}

export interface SellerShift {
  is_demo?: boolean
  seller: { id: string; first_name: string; last_name: string; store_id: string; store_name: string | null }
  day: string
  plan: UpsellPlan
  progress: {
    attempt_rate: number | null
    attempt_rate_target: number
    attempt_rate_met: boolean
    accepted: number
    accepted_target: number | null
    accepted_pct: number | null
  }
  today: {
    orders: number
    with_offer: number
    attempt_rate: number | null
    offers: number
    accepted: number
    acceptance_rate: number | null
    strong_offers: number
    avg_check_with_upsell: number | null
    avg_check_without: number | null
    checks_with_n?: number
    checks_without_n?: number
    avg_check?: number | null
    /** Сумма принятых предложений с известной ценой (analytics 0013) */
    upsell_revenue?: number | null
    upsell_revenue_n?: number
    pending_recordings: number
  }
  week: { orders: number; attempt_rate: number | null; acceptance_rate: number | null }
  team: { place: number | null; of: number; attempt_rate: number | null }
  streak: { current: number; best: number }
  focus: { items: string[]; offered: number; accepted: number }
  best_phrase: { quote: string; item: string; technique: OfferTechnique; customer_quote: string | null } | null
  techniques: Array<{ technique: OfferTechnique; label: string; offers: number; accepted: number }>
  orders: Array<{
    conversation_id: string
    time: string | null
    items: string[]
    check_total: number | null
    offers: ShiftOffer[]
    missed: string | null
    better_phrase: string | null
  }>
}

export interface UpsellOverview {
  period: { from: string; to: string }
  totals: {
    orders: number
    with_offer: number
    attempt_rate: number | null
    offers: number
    accepted: number
    acceptance_rate: number | null
    avg_check_with_upsell: number | null
    avg_check_without: number | null
    check_uplift: number | null
    checks_known: number
    checks_with_n?: number
    checks_without_n?: number
    avg_check?: number | null
    upsell_revenue?: number | null
    upsell_revenue_n?: number
  }
  techniques: Array<{ technique: OfferTechnique; label: string; offers: number; accepted: number; acceptance_rate: number | null }>
  categories: Array<{ category: string; offers: number; accepted: number; acceptance_rate: number | null }>
  items: Array<{ item: string; category: string; offers: number; accepted: number; acceptance_rate: number | null }>
  hours: Array<{ hour: number; orders: number; attempt_rate: number | null; accepted: number }>
  focus: Array<{ item: string; offers: number; accepted: number; acceptance_rate: number | null }>
  sellers: Array<{
    seller_id: string
    name: string | null
    store_id: string
    store_name: string | null
    orders: number
    shifts: number
    with_offer: number
    attempt_rate: number | null
    offers: number
    accepted: number
    accepted_per_shift: number | null
    acceptance_rate: number | null
    attempt_rate_target: number
    plan_met: boolean
  }>
  /** Ряд по дням периода */
  days: Array<{ date: string; orders: number; with_offer: number; attempt_rate: number | null; offers: number; accepted: number; acceptance_rate: number | null }>
  /** Точки с их планом */
  stores: Array<{
    store_id: string
    store_name: string | null
    orders: number
    with_offer: number
    attempt_rate: number | null
    offers: number
    accepted: number
    acceptance_rate: number | null
    avg_check_with_upsell: number | null
    avg_check_without: number | null
    upsell_revenue?: number | null
    upsell_revenue_n?: number
    attempt_rate_target: number
    plan_met: boolean
  }>
  /** План для выбранного уровня (сеть или точка) */
  plan: UpsellPlan
  missed: Array<{
    conversation_id: string
    session_date: string
    seller_name: string | null
    items: string[]
    missed: string | null
    better_phrase: string | null
  }>
}

export interface UpsellPlanRow {
  id: string
  store_id: string | null
  seller_id: string | null
  attempt_rate_target: number | null
  accepted_per_shift: number | null
  focus_items: string[]
  updated_at: string
}

export interface SellerTips {
  /** Для руководителя: praise — что получается, tips — наблюдения (quote — цитата сотрудника), focus — шаг на разборе */
  tips: { praise?: string | null; focus?: string | null; tips?: Array<{ title?: string; text?: string; phrase?: string; quote?: string }> } | null
  period: 'day' | 'week'
  based_on: number
  cached: boolean
}

export const upsellsApi = {
  getShift: async (sellerId: string, day?: string) => {
    const response = await apiClient.get<SellerShift>(`/api/v1/dashboard/sellers/${sellerId}/shift`, { params: { day } })
    return response.data
  },
  getOverview: async (params: { store_id?: string; date_from?: string; date_to?: string }) => {
    const response = await apiClient.get<UpsellOverview>('/api/v1/dashboard/upsell/overview', { params })
    return response.data
  },
  getPlans: async () => {
    const response = await apiClient.get<{ items: UpsellPlanRow[]; default_attempt_rate_target: number }>('/api/v1/dashboard/upsell/plans')
    return response.data
  },
  savePlan: async (data: {
    store_id?: string | null
    seller_id?: string | null
    attempt_rate_target: number | null
    accepted_per_shift: number | null
    focus_items: string[]
  }) => {
    const response = await apiClient.put<UpsellPlanRow>('/api/v1/dashboard/upsell/plans', data)
    return response.data
  },
  deletePlan: async (id: string) => {
    await apiClient.delete(`/api/v1/dashboard/upsell/plans/${id}`)
  },
  /** Советы по разговорам (LLM). Сервер кэширует их на день и пересчитывает только при новых разговорах. */
  getTips: async (sellerId: string, day?: string) => {
    const response = await apiClient.post<SellerTips>(`/api/v1/analytics/sellers/${sellerId}/tips`, null, { params: { day, audience: "manager" }, timeout: 120000 })
    return response.data
  },
}

/** Отраслевые пакеты (scripts-service routers/verticals.py) */
export interface Vertical {
  code: string
  name: string
  description: string
  counts: { upsell_rules: number; cross_sell_rules: number; objection_types: number; compliance_rules: number }
}

export const verticalsApi = {
  list: async () => {
    const response = await apiClient.get<{ items: Vertical[] }>('/api/v1/scripts/verticals')
    return response.data.items
  },
  install: async (code: string) => {
    const response = await apiClient.post<{
      created: Record<string, number | { id: string; name: string } | null>
      skipped: Record<string, number | { id: string; name: string } | null>
      industry_set: boolean
    }>(`/api/v1/scripts/verticals/${code}/install`, { activate_script: true, set_industry: true })
    return response.data
  },
}

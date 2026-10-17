import apiClient from './client'

/* Спрос (dashboard-service routers/demand.py, analytics 0012): что покупатели просили, а этого
   не оказалось в наличии или в ассортименте, и решения руководителя — список к закупке. */

export type DemandStatus = 'new' | 'to_order' | 'ordered' | 'ignored'
export type DemandOutcome = 'substituted' | 'ordered' | 'lost' | 'unknown'

export interface DemandItem {
  key: string
  title: string
  /** rx | otc | supplement | medical | cosmetics | baby | other */
  category: string
  requests: number
  /** Ушли без покупки */
  lost: number
  /** Купили аналог */
  substituted: number
  /** Заказали под покупателя */
  ordered: number
  /** Сколько раз сказали «такого не держим» */
  not_carried: number
  /** Запросов за последние 7 дней периода и за 7 дней до них */
  last7: number
  prev7: number
  last_at: string | null
  stores: Array<{ store_id: string; store_name: string | null; requests: number }>
  analogs: Array<{ name: string; offered: number; taken: number }>
  status: DemandStatus
  note: string | null
  decided_at: string | null
}

export interface DemandRequest {
  conversation_id: string
  session_date: string
  time: string | null
  store_name: string | null
  seller_name: string | null
  item: string
  key: string
  reason: 'out_of_stock' | 'not_carried'
  outcome: DemandOutcome
  analog: string | null
  quote: string
  seller_quote: string
}

export interface DemandOverview {
  period: { from: string; to: string }
  totals: {
    requests: number
    items: number
    conversations: number
    all_conversations: number
    lost: number
    substituted: number
    ordered: number
    to_order: number
  }
  days: Array<{ date: string; requests: number; lost: number }>
  items: DemandItem[]
  recent: DemandRequest[]
}

/** Просьба из разбора разговора (карточка разговора) */
export interface ConversationDemand {
  item: string
  item_key: string
  category: string
  reason: 'out_of_stock' | 'not_carried'
  outcome: DemandOutcome
  analog: string | null
  quote: string
  seller_quote: string
}

type Range = { store_id?: string; date_from?: string; date_to?: string }

export const demandApi = {
  get: async (params: Range) => {
    const response = await apiClient.get<DemandOverview>('/api/v1/dashboard/demand', { params })
    return response.data
  },
  save: async (data: { key: string; title: string; status: DemandStatus; note?: string | null }) => {
    const response = await apiClient.put<{ key: string; title: string; status: DemandStatus; note: string | null; decided_at: string }>(
      '/api/v1/dashboard/demand/items', data)
    return response.data
  },
  /** CSV для Excel: скачивается файлом */
  download: async (params: Range & { status?: DemandStatus }) => {
    const response = await apiClient.get<Blob>('/api/v1/dashboard/demand/export', { params, responseType: 'blob' })
    const name = /filename="([^"]+)"/.exec(String(response.headers['content-disposition'] || ''))?.[1] || 'spros.csv'
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

import { useQuery } from '@tanstack/react-query'
import { authApi, type OrganizationInfo } from '@/api/auth'

/** Информация об организации (тип: retail | telephony). Кэшируется на сессию. */
export function useOrganization() {
  return useQuery<OrganizationInfo>({
    queryKey: ['organization'],
    queryFn: authApi.getOrganization,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export interface Terms {
  orgType: 'retail' | 'telephony'
  isTelephony: boolean
  store: string
  storePlural: string
  allStores: string
  seller: string
  sellerPlural: string
  conversation: string
  conversationPlural: string
}

/** Терминология интерфейса в зависимости от типа организации:
 *  retail — Магазин/Продавец/Разговор; telephony — Отдел/Оператор/Звонок. */
export function useTerms(): Terms {
  const { data } = useOrganization()
  const isTelephony = data?.org_type === 'telephony'
  return {
    orgType: data?.org_type ?? 'retail',
    isTelephony,
    store: isTelephony ? 'Отдел' : 'Магазин',
    storePlural: isTelephony ? 'Отделы' : 'Магазины',
    allStores: isTelephony ? 'Все отделы' : 'Все магазины',
    seller: isTelephony ? 'Оператор' : 'Продавец',
    sellerPlural: isTelephony ? 'Операторы' : 'Продавцы',
    conversation: isTelephony ? 'Звонок' : 'Разговор',
    conversationPlural: isTelephony ? 'Звонки' : 'Разговоры',
  }
}

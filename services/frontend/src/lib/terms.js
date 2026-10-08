import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
/** Информация об организации (тип: retail | telephony). Кэшируется на сессию. */
export function useOrganization() {
    return useQuery({
        queryKey: ['organization'],
        queryFn: authApi.getOrganization,
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });
}
/** Контур телефонии отложен: интерфейс работает только для розницы, даже если
 *  у организации в базе org_type = telephony. Бэкенд телефонии не трогаем —
 *  чтобы вернуть контур, достаточно включить флаг. */
export const TELEPHONY_ENABLED = false;
/** Терминология интерфейса в зависимости от типа организации:
 *  retail — Магазин/Продавец/Разговор; telephony — Отдел/Оператор/Звонок. */
export function useTerms() {
    const { data } = useOrganization();
    const isTelephony = TELEPHONY_ENABLED && data?.org_type === 'telephony';
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
    };
}

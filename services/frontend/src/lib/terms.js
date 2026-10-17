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
/** Терминология интерфейса в зависимости от типа и отрасли организации:
 *  retail — Магазин/Продавец/Разговор; кофейня — Точка/Бариста; аптека — Аптека/Фармацевт;
 *  клиника — Клиника/Врач/Приём; telephony — Отдел/Оператор/Звонок. */
export function useTerms() {
    const { data } = useOrganization();
    const isTelephony = TELEPHONY_ENABLED && data?.org_type === 'telephony';
    const isCafe = !isTelephony && data?.industry === 'coffee';
    const isPharmacy = !isTelephony && data?.industry === 'pharmacy';
    const isClinic = !isTelephony && data?.industry === 'clinic';
    const k = isTelephony ? 0 : isCafe ? 1 : isPharmacy ? 2 : isClinic ? 4 : 3;
    const pick = (telephony, cafe, pharmacy, retail, clinic) => [telephony, cafe, pharmacy, retail, clinic][k];
    return {
        orgType: data?.org_type ?? 'retail',
        isTelephony,
        isCafe,
        isPharmacy,
        offersFirst: isCafe || isPharmacy,
        tracksDemand: isPharmacy,
        isClinic,
        store: pick('Отдел', 'Точка', 'Аптека', 'Магазин', 'Клиника'),
        storePlural: pick('Отделы', 'Точки', 'Аптеки', 'Магазины', 'Клиники'),
        allStores: pick('Все отделы', 'Все точки', 'Все аптеки', 'Все магазины', 'Все клиники'),
        seller: pick('Оператор', 'Бариста', 'Фармацевт', 'Продавец', 'Врач'),
        sellerPlural: pick('Операторы', 'Бариста', 'Фармацевты', 'Продавцы', 'Врачи'),
        conversation: isTelephony ? 'Звонок' : isClinic ? 'Приём' : 'Разговор',
        conversationPlural: isTelephony ? 'Звонки' : isClinic ? 'Приёмы' : 'Разговоры',
        storeChoose: pick('Выберите отдел', 'Выберите точку', 'Выберите аптеку', 'Выберите магазин', 'Выберите клинику'),
        inStore: pick('в отделе', 'в точке', 'в аптеке', 'в магазине', 'в клинике'),
        storeForms: pick(['отдел', 'отдела', 'отделов'], ['точка', 'точки', 'точек'], ['аптека', 'аптеки', 'аптек'], ['магазин', 'магазина', 'магазинов'], ['клиника', 'клиники', 'клиник']),
        sellerForms: pick(['оператор', 'оператора', 'операторов'], ['бариста', 'бариста', 'бариста'], ['фармацевт', 'фармацевта', 'фармацевтов'], ['продавец', 'продавца', 'продавцов'], ['врач', 'врача', 'врачей']),
        sellerGen: pick('оператора', 'бариста', 'фармацевта', 'продавца', 'врача'),
        sellerDat: pick('оператору', 'бариста', 'фармацевту', 'продавцу', 'врачу'),
        withCustomers: pick(['с клиентами', 'with clients'], ['с гостями', 'with guests'], ['с покупателями', 'with customers'], ['с покупателями', 'with customers'], ['с пациентами', 'with patients']),
        customer: pick('Клиент', 'Гость', 'Покупатель', 'Покупатель', 'Пациент'),
        sellerLower: pick(['оператор', 'operator'], ['бариста', 'barista'], ['фармацевт', 'pharmacist'], ['продавец', 'seller'], ['врач', 'doctor']),
        reviewWith: pick('Разобрать с оператором', 'Разобрать с бариста', 'Разобрать с фармацевтом', 'Разобрать с продавцом', 'Разобрать с врачом'),
    };
}

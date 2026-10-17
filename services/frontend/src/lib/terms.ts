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
  /** Кофейня (industry = coffee): Точка / Бариста / гость */
  isCafe: boolean
  /** Аптека (industry = pharmacy): Аптека / Фармацевт / покупатель */
  isPharmacy: boolean
  /** Отрасли, где главный взгляд — разбор предложений у кассы (кофейни, аптеки) */
  offersFirst: boolean
  /** Учёт спроса на товары, которых не оказалось (аптеки): раздел «Спрос» */
  tracksDemand: boolean
  /** Клиника (industry = clinic): Клиника / Врач / Пациент / Приём — свои разделы вместо продаж */
  isClinic: boolean
  /** «Выберите магазин» / «Выберите точку» */
  storeChoose: string
  /** «в магазине» / «в точке» */
  inStore: string
  /** Формы для чисел: 1 магазин, 2 магазина, 5 магазинов */
  storeForms: [string, string, string]
  sellerForms: [string, string, string]
  /** Сотрудник в косвенных падежах: «разговоры продавца», «комментарий продавцу» */
  sellerGen: string
  sellerDat: string
  /** «с покупателями» / «с гостями» — [ru, en] */
  withCustomers: [string, string]
  /** Покупатель / Гость / Клиент */
  customer: string
  /** «продавец говорит …» — [ru, en] */
  sellerLower: [string, string]
  /** Кнопка плана разбора: «Разобрать с продавцом» / «Разобрать с бариста» */
  reviewWith: string
}

/** Контур телефонии отложен: интерфейс работает только для розницы, даже если
 *  у организации в базе org_type = telephony. Бэкенд телефонии не трогаем —
 *  чтобы вернуть контур, достаточно включить флаг. */
export const TELEPHONY_ENABLED = false

/** Терминология интерфейса в зависимости от типа и отрасли организации:
 *  retail — Магазин/Продавец/Разговор; кофейня — Точка/Бариста; аптека — Аптека/Фармацевт;
 *  клиника — Клиника/Врач/Приём; telephony — Отдел/Оператор/Звонок. */
export function useTerms(): Terms {
  const { data } = useOrganization()
  const isTelephony = TELEPHONY_ENABLED && data?.org_type === 'telephony'
  const isCafe = !isTelephony && data?.industry === 'coffee'
  const isPharmacy = !isTelephony && data?.industry === 'pharmacy'
  const isClinic = !isTelephony && data?.industry === 'clinic'
  const k = isTelephony ? 0 : isCafe ? 1 : isPharmacy ? 2 : isClinic ? 4 : 3
  const pick = <T,>(telephony: T, cafe: T, pharmacy: T, retail: T, clinic: T): T => [telephony, cafe, pharmacy, retail, clinic][k]
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
    storeForms: pick<[string, string, string]>(['отдел', 'отдела', 'отделов'], ['точка', 'точки', 'точек'], ['аптека', 'аптеки', 'аптек'], ['магазин', 'магазина', 'магазинов'], ['клиника', 'клиники', 'клиник']),
    sellerForms: pick<[string, string, string]>(['оператор', 'оператора', 'операторов'], ['бариста', 'бариста', 'бариста'], ['фармацевт', 'фармацевта', 'фармацевтов'], ['продавец', 'продавца', 'продавцов'], ['врач', 'врача', 'врачей']),
    sellerGen: pick('оператора', 'бариста', 'фармацевта', 'продавца', 'врача'),
    sellerDat: pick('оператору', 'бариста', 'фармацевту', 'продавцу', 'врачу'),
    withCustomers: pick<[string, string]>(['с клиентами', 'with clients'], ['с гостями', 'with guests'], ['с покупателями', 'with customers'], ['с покупателями', 'with customers'], ['с пациентами', 'with patients']),
    customer: pick('Клиент', 'Гость', 'Покупатель', 'Покупатель', 'Пациент'),
    sellerLower: pick<[string, string]>(['оператор', 'operator'], ['бариста', 'barista'], ['фармацевт', 'pharmacist'], ['продавец', 'seller'], ['врач', 'doctor']),
    reviewWith: pick('Разобрать с оператором', 'Разобрать с бариста', 'Разобрать с фармацевтом', 'Разобрать с продавцом', 'Разобрать с врачом'),
  }
}

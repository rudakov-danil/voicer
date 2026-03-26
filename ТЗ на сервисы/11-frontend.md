# ТЗ 11 — Frontend (React SPA)

> React-приложение `app.voiceiq.ru`. Аутентификация, дашборды, аналитика, разведка, обучение, комплаенс, управление продавцами/магазинами/устройствами, просмотр разговоров с транскриптом и оценками.
>
> **Референс дизайна:** `пример сайта/` — статичный HTML/CSS/JS прототип. Дизайн, UX и структура экранов должны точно совпадать с референсом. Тёмный сайдбар `#0F172A`, синий акцент `#2563EB`, светлый фон `#F8FAFC`.

---

## Технологии

| Компонент | Библиотека | Версия |
|-----------|-----------|--------|
| Framework | React | 18+ |
| Language | TypeScript | 5.4+ |
| Сборщик | Vite | 5.2+ |
| Роутинг | React Router | 6.23+ |
| Стейт/запросы | TanStack Query (React Query) | 5.40+ |
| UI-компоненты | shadcn/ui + Radix UI | latest |
| Стили | Tailwind CSS | 3.4+ |
| Графики | Recharts | 2.12+ |
| Формы | React Hook Form + Zod | RHF 7.51+, Zod 3.23+ |
| HTTP-клиент | Axios | 1.7+ |
| Иконки | Lucide React | 0.379+ |
| Тесты Unit | Vitest + React Testing Library | Vitest 1.6+, RTL 16+ |
| Тесты E2E | Playwright | 1.44+ |
| Линтер | ESLint + Prettier | — |

---

## Структура проекта

```
services/frontend/
├── Dockerfile
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.example
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx                   ← точка входа
│   ├── App.tsx                    ← роутер + провайдеры
│   ├── api/                       ← axios-клиенты и хуки React Query
│   │   ├── client.ts              ← axios instance + интерцепторы
│   │   ├── auth.ts
│   │   ├── admin.ts
│   │   ├── scripts.ts
│   │   ├── dashboard.ts
│   │   └── analytics.ts
│   ├── hooks/
│   │   ├── useAuth.ts             ← работа с токенами, текущий пользователь
│   │   └── usePermissions.ts      ← проверка ролей
│   ├── store/
│   │   └── authStore.ts           ← Zustand стор для auth state
│   ├── components/
│   │   ├── ui/                    ← shadcn/ui компоненты (не редактировать вручную)
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx      ← sidebar + header + outlet
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── charts/
│   │   │   ├── ScoreChart.tsx     ← линейный график скоров
│   │   │   ├── StageRadar.tsx     ← radar chart по этапам
│   │   │   └── ConversionBar.tsx  ← bar chart конверсии
│   │   └── shared/
│   │       ├── ScoreBadge.tsx     ← цветной бейдж со скором
│   │       ├── OutcomeBadge.tsx   ← "Продажа" / "Нет продажи"
│   │       ├── RoleGuard.tsx      ← HOC для проверки роли
│   │       └── ErrorBoundary.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx      ← главный экран (overview)
│   │   ├── SellersPage.tsx        ← рейтинг продавцов
│   │   ├── SellerDetailPage.tsx   ← профиль продавца
│   │   ├── ConversationsPage.tsx  ← список разговоров
│   │   ├── ConversationDetailPage.tsx ← разбор разговора
│   │   ├── AdminPage/
│   │   │   ├── index.tsx          ← вложенный роутер
│   │   │   ├── StoresTab.tsx
│   │   │   ├── SellersTab.tsx
│   │   │   ├── DevicesTab.tsx
│   │   │   └── UsersTab.tsx
│   │   ├── ScriptsPage/
│   │   │   ├── index.tsx
│   │   │   ├── TemplatesList.tsx
│   │   │   └── TemplateEditor.tsx
│   │   └── SettingsPage.tsx       ← настройки приватности и алертов
│   ├── types/
│   │   └── index.ts               ← все TypeScript типы (зеркало API-схем)
│   └── utils/
│       ├── formatScore.ts
│       ├── formatDate.ts
│       └── cn.ts                  ← утилита classnames (из shadcn)
└── tests/
    ├── unit/
    │   ├── formatScore.test.ts
    │   ├── ScoreBadge.test.tsx
    │   └── useAuth.test.ts
    └── e2e/
        ├── login.spec.ts
        ├── dashboard.spec.ts
        └── conversations.spec.ts
```

---

## Переменные окружения (`.env.example`)

```dotenv
VITE_API_BASE_URL=https://app.voiceiq.ru
VITE_APP_NAME=VoiceIQ
```

---

## `src/api/client.ts` — Axios instance

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor: добавляем Authorization header
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor: обработка 401 → refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const resp = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token } = resp.data;
        useAuthStore.getState().setTokens(access_token, refresh_token);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## `src/store/authStore.ts` — Zustand

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  role: 'director' | 'admin' | 'rop' | 'manager';
  first_name: string;
  last_name: string;
  organization_id: string;
  store_id: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
      isAuthenticated: () => !!get().accessToken && !!get().user,
    }),
    {
      name: 'voiceiq-auth',
      // Сохраняем только refreshToken в localStorage, accessToken — только в памяти
      partialize: (state) => ({ refreshToken: state.refreshToken, user: state.user }),
    }
  )
);
```

---

## Роутинг (`src/App.tsx`)

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import SellersPage from '@/pages/SellersPage';
import SellerDetailPage from '@/pages/SellerDetailPage';
import ConversationsPage from '@/pages/ConversationsPage';
import ConversationDetailPage from '@/pages/ConversationDetailPage';
import AdminPage from '@/pages/AdminPage';
import ScriptsPage from '@/pages/ScriptsPage';
import SettingsPage from '@/pages/SettingsPage';
import { RoleGuard } from '@/components/shared/RoleGuard';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="sellers" element={<SellersPage />} />
              <Route path="sellers/:sellerId" element={<SellerDetailPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="conversations/:conversationId" element={<ConversationDetailPage />} />
              <Route path="admin/*" element={
                <RoleGuard allowedRoles={['director', 'admin']}>
                  <AdminPage />
                </RoleGuard>
              } />
              <Route path="scripts/*" element={
                <RoleGuard allowedRoles={['director', 'admin', 'manager']}>
                  <ScriptsPage />
                </RoleGuard>
              } />
              <Route path="settings" element={
                <RoleGuard allowedRoles={['director', 'admin']}>
                  <SettingsPage />
                </RoleGuard>
              } />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

---

## Ключевые компоненты

### `src/components/shared/ScoreBadge.tsx`

```typescript
interface ScoreBadgeProps {
  score: number; // 0—100
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  // score >= 80 → зелёный (bg-green-100 text-green-800)
  // score 60—79 → жёлтый (bg-yellow-100 text-yellow-800)
  // score < 60 → красный (bg-red-100 text-red-800)
  const colorClass =
    score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {Math.round(score)}%
    </span>
  );
}
```

### `src/components/shared/RoleGuard.tsx`

```typescript
interface RoleGuardProps {
  allowedRoles: Array<'director' | 'admin' | 'rop' | 'manager'>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback = null }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);
  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
```

### `src/components/charts/StageRadar.tsx`

```typescript
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';

interface StageData {
  stage: string;       // display_name этапа
  score: number;       // 0—100
  full_mark: 100;
}

interface StageRadarProps {
  data: StageData[];
}

export function StageRadar({ data }: StageRadarProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="stage" />
        <Radar name="Скор" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

---

## Навигация (9 экранов)

| Путь | Страница | Описание |
|------|---------|---------|
| `/dashboard` | Обзор | Метрики, графики, последние разговоры |
| `/conversations` | Разговоры | Таблица с фильтрами, drawer с деталями |
| `/team` | Команда | Рейтинг продавцов, сравнение магазинов |
| `/scripts` | Скрипты | CRUD скриптов продаж и этапов |
| `/analytics` | Аналитика | Возражения / Конверсия / Сентимент |
| `/intelligence` | Разведка | Конкуренты / Тренды / Голос клиента |
| `/training` | Обучение | Адаптация новичков, библиотека записей |
| `/compliance` | Комплаенс | Нарушения, правила, статистика |
| `/settings` | Настройки | Приватность / Уведомления / Интеграции |

Детали разговора и профиль продавца открываются в **drawer** (боковая панель 560px) — не на отдельных страницах.

---

## Страницы и их поведение

### `LoginPage.tsx`

1. Форма: email + пароль (React Hook Form + Zod)
2. Zod-схема: `email` — валидный email, `password` — минимум 8 символов
3. При submit: `POST /api/v1/auth/login`
4. При успехе: сохранить токены в authStore, редирект на `/dashboard`
5. При ошибке 401: показать `"Неверный email или пароль"` под формой
6. При ошибке сети: показать `"Ошибка соединения с сервером"`

---

### `DashboardPage.tsx`

1. 4 метрики: разговоров / средний скоринг / конверсия / средний чек
2. Графики: линейный (разговоры по дням), столбчатый (скоринг по магазинам), пончик (исходы)
3. Блок оповещений
4. Таблица последних 8 разговоров, клик → ConversationDrawer
5. Данные через: `GET /api/v1/dashboard/overview?period=30`

---

### `ConversationsPage.tsx`

1. Фильтры: магазин, продавец, исход, диапазон скоринга
2. Таблица: дата, продавец (аватар+имя), магазин, длительность, скоринг (цвет), апсейл, исход
3. Клик → ConversationDrawer

---

### `ConversationDrawer` (компонент)

1. Теги: дата, длительность, исход, статус комплаенса
2. Карточка продавца (аватар, имя, магазин, тема)
3. Скоринг скрипта: прогресс-бар + чеклист этапов (сделано/пропущено)
4. Возражения (теги)
5. Аудиоплеер (визуальный макет с формой волны)
6. Транскрипт: время | спикер | текст
7. Кнопки: "Добавить в обучение", "Экспорт", "Пометить нарушение"
8. Данные через: `GET /api/v1/dashboard/conversations/{id}`

---

### `TeamPage.tsx`

1. 3 метрики: продавцов в сети / средний скоринг / разрыв конверсии
2. Рейтинг по конверсии (1-е место — золото, 2-е — серебро, 3-е — бронза)
3. Таблица сравнения магазинов (скоринг, конверсия, средний чек)
4. Клик на продавца → SellerDrawer

---

### `SellerDrawer` (компонент)

1. Аватар, имя, магазин
2. 4 мини-карточки: конверсия, скоринг, средний чек, разговоры
3. Прогресс по этапам скрипта
4. Рекомендации
5. Последние разговоры → клик → ConversationDrawer

---

### `ScriptsPage.tsx`

1. Список шаблонов скриптов (активные/черновики)
2. Редактор активного скрипта: этапы с весами и переключателями
3. Таблица правил апсейла

---

### `AnalyticsPage.tsx`

3 вкладки:
- **Возражения**: горизонтальные бары + пончик + таблица корреляций с исходом
- **Конверсия**: воронка + столбчатый по магазинам
- **Сентимент**: стековый бар + линейный по неделям

---

### `IntelligencePage.tsx`

3 вкладки:
- **Конкуренты**: таблица (упоминания, тренд, тональность) + линейный график
- **Тренды**: список тем с HOT-бейджем
- **Голос клиента**: неудовлетворённый спрос + обратная связь по продуктам

---

### `TrainingPage.tsx`

1. Адаптация новичков: прогресс-бары + зоны развития
2. График прогресса по неделям (vs эталон)
3. Библиотека лучших разговоров (score > 80)

---

### `CompliancePage.tsx`

1. 3 метрики: уровень комплаенса / проверено разговоров / нарушений
2. Нарушения по типу (с индикатором severity)
3. Правила комплаенса по отраслям
4. Таблица последних нарушений с кнопкой "Экспорт для аудита"

---

### `SettingsPage.tsx`

3 вкладки:
- **Приватность (152-ФЗ)**: согласие, хранение, шифрование, срок хранения
- **Уведомления**: тогглы по типам алертов
- **Интеграции**: список систем (Whisper, 1С, Битрикс, Telegram, Power BI)

---

### `SellersPage.tsx` (устарело → заменено TeamPage)

1. Таблица продавцов: имя, магазин, кол-во разговоров, средний скор, конверсия, тренд
2. Сортировка по колонкам (client-side для текущей страницы)
3. Клик на строку → `/sellers/{id}`
4. Данные через: `GET /api/v1/dashboard/sellers`

---

### `SellerDetailPage.tsx`

1. Шапка: имя, магазин, период
2. 4 карточки-метрики
3. `StageRadar` — radar-chart по этапам
4. Линейный график скора за период
5. Список последних 10 разговоров с кликом
6. Данные через: `GET /api/v1/dashboard/sellers/{id}/detail`

---

### `ConversationsPage.tsx`

1. Фильтры: магазин, продавец, период, исход, диапазон скора
2. Таблица: продавец, магазин, дата, длительность, скор, исход
3. Пагинация (20 на странице)
4. Кнопка "Экспорт CSV" → `GET /api/v1/dashboard/export` с текущими фильтрами
5. Данные через: `GET /api/v1/dashboard/conversations`

---

### `ConversationDetailPage.tsx`

1. Шапка: продавец, магазин, дата, длительность, итоговый скор (большой `ScoreBadge`)
2. Таблица оценок по этапам с прогресс-барами
3. Список возражений с индикатором обработки
4. Блок "Нарушения скрипта" (если есть)
5. Блок "Рекомендации"
6. Транскрипт: чередование реплик продавца (синий) и клиента (серый), с временными метками
7. Кнопка "Воспроизвести" → открыть presigned URL в аудиоплеере
8. Данные через: `GET /api/v1/dashboard/conversations/{id}`

---

### `AdminPage/` — вложенные вкладки

Вкладки: Магазины / Продавцы / Устройства / Пользователи

Каждая вкладка:
- Таблица с пагинацией
- Кнопка "Добавить" → модальное окно с формой (React Hook Form + Zod)
- Кнопка редактирования → тот же модал с предзаполнением
- Кнопка деактивации (не удаление, мягкое)

CRUD-операции:
- Магазины: `POST/PATCH /api/v1/admin/stores`
- Продавцы: `POST/PATCH /api/v1/admin/sellers`
- Устройства: `POST/PATCH /api/v1/admin/devices`
- Пользователи: `POST/PATCH /api/v1/auth/users`

---

### `ScriptsPage/`

- `TemplatesList.tsx`: таблица шаблонов, кнопки редактировать/назначить продавцам
- `TemplateEditor.tsx`: редактор шаблона с динамическим добавлением этапов
  - Поле для каждого этапа: название, вес (number input), порядок, ключевые слова
  - Индикатор суммы весов в реальном времени (зелёный если = 1.0, красный иначе)
  - Кнопка "Сохранить" неактивна если сумма весов ≠ 1.0
  - Валидация через Zod: `z.array(stepSchema).refine(steps => sum(steps.map(s => s.weight)) === 1.0)`

---

## Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
```

### `nginx.conf`

```nginx
server {
    listen 3000;

    root /usr/share/nginx/html;
    index index.html;

    # Для React Router: все 404 → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование ассетов (Vite хэширует имена файлов)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Покрытие тестами

### Unit-тесты (Vitest + RTL)

| ID | Сценарий | Файл |
|----|---------|------|
| FE-U-01 | `formatScore(82.5)` → `"83%"` | `utils/formatScore.test.ts` |
| FE-U-02 | `ScoreBadge` score=85 → зелёный класс | `ScoreBadge.test.tsx` |
| FE-U-03 | `ScoreBadge` score=65 → жёлтый класс | `ScoreBadge.test.tsx` |
| FE-U-04 | `ScoreBadge` score=45 → красный класс | `ScoreBadge.test.tsx` |
| FE-U-05 | `RoleGuard` с `allowedRoles=['admin']` и `user.role='manager'` → рендерит `null` | `RoleGuard.test.tsx` |
| FE-U-06 | `RoleGuard` с `allowedRoles=['admin']` и `user.role='admin'` → рендерит children | `RoleGuard.test.tsx` |
| FE-U-07 | `useAuth` после `logout()` — `isAuthenticated()` возвращает `false` | `useAuth.test.ts` |
| FE-U-08 | Форма TemplateEditor показывает ошибку если сумма весов ≠ 1.0 | `TemplateEditor.test.tsx` |
| FE-U-09 | Форма TemplateEditor: кнопка Save задизейблена при невалидных весах | `TemplateEditor.test.tsx` |

### E2E-тесты (Playwright)

| ID | Сценарий | Файл |
|----|---------|------|
| FE-E2E-01 | Неаутентифицированный пользователь перенаправляется на `/login` | `login.spec.ts` |
| FE-E2E-02 | Успешный логин → редирект на `/dashboard` | `login.spec.ts` |
| FE-E2E-03 | Неверный пароль → отображение ошибки под формой | `login.spec.ts` |
| FE-E2E-04 | Dashboard отображает карточки метрик с числами | `dashboard.spec.ts` |
| FE-E2E-05 | Смена периода фильтра обновляет данные на дашборде | `dashboard.spec.ts` |
| FE-E2E-06 | Клик на продавца в таблице → переход на страницу продавца | `dashboard.spec.ts` |
| FE-E2E-07 | Страница разговора отображает транскрипт с ролями | `conversations.spec.ts` |
| FE-E2E-08 | `manager` не видит вкладку "Администрирование" в сайдбаре | `login.spec.ts` |

# Горячие правки фронтенда, сделанные прямо в собранном dist на сервере

На сервере фронтенд не собирается: рабочий `dist` привезён целиком, а часть правок вносилась
в минифицированные чанки (новый суффикс файлов + новый `index.html`). Сам `dist` в git не кладётся.
Ниже — что из этих правок уже есть в `src`, а что нужно перенести вручную перед следующей сборкой,
иначе новый релиз вернёт ошибки.

| Суффикс | Дата (UTC) | Что | В `src` |
|---|---|---|---|
| `-ph1014` | 2026-10-14 | правка прошлой сессии | — |
| `-tz1017` | 2026-10-16 | даты по местному времени вместо `toISOString()` (UTC): `src/lib/dates.ts` (`isoDay`), используется в `api/compliance.ts`, `api/dashboard.ts`, `AudioUpload`, `CallUpload`, `TranscriptUpload` | **есть** |
| `-np1017` | 2026-10-17 | единый справочник исходов ритейла и телефонии: `src/lib/outcomes.ts`, `components/OutcomeTag.tsx`, `pages/ConversationsPage.tsx`, `types/index.ts` | **есть** |
| `-sc1017` | 2026-10-16 | автопрокрутка расшифровки в карточке разговора | **нет — перенести вручную** |

## -sc1017: автопрокрутка расшифровки (`src/pages/ConversationPage.tsx`)

Файла `ConversationPage.tsx` нет ни на сервере, ни в ветках этого репозитория (так же нет
`DemandPage.tsx` и `pages/Home*`, на которые ссылается `App.tsx`) — они есть только у того,
кто собирал последний полный релиз. Правку нужно внести там.

Симптом: при воспроизведении записи список реплик прыгал наверх вместо прокрутки к текущей реплике.
Причина: позиция реплики считалась через `offsetTop`, который внутри контейнера с
`position: relative` отсчитывается не от того родителя.

В эффекте, который прокручивает контейнер расшифровки к активной реплике (`data-seg="<индекс>"`),
заменить расчёт позиции:

```ts
// было
const top = el.offsetTop - container.offsetTop
// стало
const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
```

Остальное без изменений: если `top < container.scrollTop` или `top > container.scrollTop + container.clientHeight - 80`,
вызывается `container.scrollTo({ top: Math.max(0, top - container.clientHeight / 3), behavior: 'smooth' })`.

Взято из чанка `dist/assets/ConversationPage-BfGRFfMb-sc1017.js` (сравнение с `-tz1017`).

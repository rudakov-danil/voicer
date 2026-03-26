# VoiceIQ Frontend - Next Steps

## Current Status

✅ **Completed:**
- Project structure and configuration
- All component skeletons
- Full CSS design system (1,075 lines)
- Authentication system (login, JWT, refresh)
- API client with interceptors
- State management (Zustand)
- Type definitions
- Main pages structure
- Chart components (Recharts)
- Navigation sidebar
- Top bar with filters

## What Still Needs Implementation

### 1. Pages That Need Detail Views

#### ConversationDetailPage
**File:** `src/pages/ConversationDetailPage.tsx` (create)
**Features:**
- Seller info card (avatar, name, store)
- Large score badge
- Conversation metadata (duration, date, outcome)
- Script step breakdown with progress bars
- Detected objections with handling status
- Transcript display:
  - Time | Speaker | Text format
  - Highlight upsell opportunities
  - Mark objections in text
- Audio player mockup (waveform visualization)
- Action buttons: "Add to Training", "Export", "Report Compliance"
- Related conversations carousel

**API:** `GET /api/v1/dashboard/conversations/{conversationId}`

#### SellerDetailPage
**File:** `src/pages/SellerDetailPage.tsx` (create)
**Features:**
- Seller header (avatar, name, store, period)
- 4 metric cards (conversion, score, avg check, conversations)
- Stage radar chart (script step scores)
- Line chart (score over selected period)
- Recent conversations list (last 10)
- Performance insights/recommendations
- Comparison to team average

**API:** `GET /api/v1/dashboard/sellers/{sellerId}/detail`

#### AdminPage with Nested Routes
**File:** `src/pages/AdminPage/index.tsx` (create with nested router)
**Tabs:**
- **Stores:** CRUD table for stores
  - Columns: name, address, city, is_active
  - Buttons: Add, Edit, Deactivate
  - Form modal with validation

- **Sellers:** CRUD table for sellers
  - Columns: name, store, is_active
  - Buttons: Add, Edit, Deactivate
  - Form modal with validation

- **Devices:** List devices
  - Columns: device_id, seller, store, battery, last_sync
  - Display health status

- **Users:** CRUD table for users
  - Columns: email, name, role, store, is_active
  - Buttons: Add, Edit, Deactivate, Change Role

**APIs:**
- `GET /api/v1/admin/stores`, `POST`, `PATCH`
- `GET /api/v1/admin/sellers`, `POST`, `PATCH`
- `GET /api/v1/admin/devices`
- `GET /api/v1/auth/users`, `POST`, `PATCH`

### 2. Enhanced Features for Existing Pages

#### DashboardPage
- [ ] Period picker integration
- [ ] Store filter (if admin/director role)
- [ ] Loading skeleton screens
- [ ] Error boundaries
- [ ] Empty states

#### ConversationsPage
- [ ] Filters sidebar: store, seller, outcome, score range
- [ ] Client-side sorting on columns
- [ ] Export to CSV button
- [ ] Filter pills display
- [ ] Advanced search

#### TeamPage
- [ ] Seller details drawer (click on leaderboard item)
- [ ] Export seller list
- [ ] Performance comparison filters

#### ScriptsPage
- [ ] Load templates from API
- [ ] Script template editor
  - Dynamic step addition/removal
  - Weight validation (sum = 100%)
  - Visual weight indicator
- [ ] Assign template to seller
- [ ] Upsell rules management

### 3. Components to Create/Enhance

#### ConversationDetailDrawer
**File:** `src/components/ConversationDrawer.tsx`
**Props:**
- conversationId: string
- isOpen: boolean
- onClose: () => void

#### SellerDetailDrawer
**File:** `src/components/SellerDrawer.tsx`
**Props:**
- sellerId: string
- isOpen: boolean
- onClose: () => void

#### AudioPlayer
**File:** `src/components/AudioPlayer.tsx`
- Visual waveform (mock)
- Play/pause button
- Time display
- Speed control (1x, 1.5x, 2x)
- Timeline scrubbing

#### FormModal
**File:** `src/components/FormModal.tsx`
- Reusable modal for CRUD forms
- Auto-focuses first field
- Submit/Cancel buttons
- Loading state

#### Transcript
**File:** `src/components/Transcript.tsx`
**Props:**
- segments: TranscriptSegment[]
- highlights?: Array<{start: number, end: number, type: 'upsell'|'objection'}>

#### StageRadar
**File:** `src/components/charts/StageRadar.tsx` (Radar chart for script stages)

### 4. Utility Functions

#### Format Functions
**File:** `src/utils/formatters.ts`
```typescript
- formatDuration(seconds: number) → "2:34"
- formatDate(date: string) → "15 мар 2026"
- formatMoney(amount: number) → "34 200 ₽"
- formatPercent(value: number) → "78%"
- getInitials(firstName: string, lastName: string) → "ФИ"
```

#### Hooks
**File:** `src/hooks/useDrawer.ts`
```typescript
- useDrawer() → { isOpen, content, openDrawer(), closeDrawer() }
```

### 5. Error Handling & Loading States

- Add ErrorBoundary component
- Add loading skeletons for tables
- Add empty state illustrations
- Add error toast notifications
- Handle network timeouts

### 6. Form Validation & Input Components

#### ScriptTemplateEditor
- Dynamic fields for steps
- Weight validation
- Visual feedback (red if sum ≠ 100%)
- Add/remove step buttons

#### AdminForms
- Store form (name, address, city)
- Seller form (name, store select, is_active toggle)
- User form (email, name, role select)

### 7. Integration Points

All these API endpoints need backend implementation:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/conversations`
- `GET /api/v1/dashboard/conversations/{id}`
- `GET /api/v1/dashboard/sellers`
- `GET /api/v1/dashboard/sellers/{id}/detail`
- `GET /api/v1/admin/stores`, `POST`, `PATCH`
- `GET /api/v1/admin/sellers`, `POST`, `PATCH`
- `GET /api/v1/admin/devices`
- `GET /api/v1/scripts/templates`, `POST`, `PATCH`

## Quick Start Development

1. **Install dependencies:**
   ```bash
   cd E:/voiceIQ/services/frontend
   npm install
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```
   Opens on http://localhost:3000

3. **Test login:**
   - Email: any valid email format
   - Password: min 6 characters
   - With mock backend, any credentials work

4. **Create new page:**
   - Add file in `src/pages/NewPage.tsx`
   - Export component
   - Add route in `src/App.tsx`
   - Add nav item in `src/components/layout/Sidebar.tsx`

5. **Create new component:**
   - Add file in `src/components/`
   - Use TypeScript interfaces for props
   - Import and use in pages

## Testing Checklist

- [ ] Login flow works
- [ ] Protected routes redirect to login
- [ ] Dashboard loads metrics from API
- [ ] Charts render correctly
- [ ] Sidebar navigation works
- [ ] Page titles update in topbar
- [ ] Responsive design works < 860px
- [ ] CSS matches reference design
- [ ] Icons from Lucide display
- [ ] Token refresh works on 401
- [ ] Logout clears auth state

## Performance Optimization

- [ ] Code splitting by route
- [ ] Image optimization
- [ ] Lazy loading for pages
- [ ] Memoization of expensive components
- [ ] React Query caching strategy
- [ ] Build size optimization

## Deployment Checklist

- [ ] Build succeeds: `npm run build`
- [ ] Docker image builds
- [ ] Environment variables set
- [ ] API_BASE_URL configured
- [ ] SSL/TLS configured (if needed)
- [ ] CORS headers set up
- [ ] Logging configured
- [ ] Error tracking (Sentry, etc.) set up

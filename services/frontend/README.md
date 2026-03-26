# VoiceIQ Frontend

React + TypeScript frontend application for VoiceIQ speech analytics platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

Update `VITE_API_BASE_URL` to point to your backend API.

3. Run development server:
```bash
npm run dev
```

Server runs on `http://localhost:3000`

4. Build for production:
```bash
npm run build
```

## Project Structure

- `src/main.tsx` - Entry point
- `src/App.tsx` - Main router and layout
- `src/components/` - React components
  - `layout/` - AppLayout, Sidebar, Topbar
  - `charts/` - LineChartWidget, BarChartWidget, DonutChartWidget
  - Other reusable components
- `src/pages/` - Page components for each route
- `src/api/` - API client and endpoint functions
- `src/store/` - Zustand auth store
- `src/types/` - TypeScript type definitions
- `src/index.css` - Global CSS with design tokens

## Technology Stack

- React 18 + TypeScript
- Vite (build tool)
- React Router v6
- TanStack Query (data fetching)
- Zustand (state management)
- Recharts (charting)
- Axios (HTTP client)
- React Hook Form + Zod (forms)
- Lucide React (icons)

## Design

The design follows the exact CSS from the reference `styles.css`, with:
- Dark sidebar (#0F172A)
- Blue primary color (#2563EB)
- Light background (#F8FAFC)
- Complete responsive layout
- Custom CSS properties for theming

## Authentication

Authentication is handled through the auth store with:
- JWT access token (memory only)
- Refresh token (localStorage)
- Automatic token refresh on 401 responses
- Redirect to login on auth failure

## Docker

Build and run with Docker:

```bash
docker build -t voiceiq-frontend .
docker run -p 3000:3000 voiceiq-frontend
```

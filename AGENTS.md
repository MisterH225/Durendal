# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MarketLens is a Next.js 14 (App Router) SaaS platform for competitive intelligence on African markets. It is written entirely in TypeScript with a French-language UI. See `README.md` for project structure and deployment instructions.

### Services

| Service | Command | Purpose |
|---|---|---|
| Next.js web app | `npm run dev` | Main app on port 3000 |
| Forecast worker | `npm run worker:dev` | Background scheduled jobs (forecasts, news, intel) |

Both share the same codebase under `lib/` and connect to a hosted **Supabase** instance (PostgreSQL + Auth + pgvector).

### Key commands

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Tests | `npm run test:intel-scoring` |
| Worker (dev) | `npm run worker:dev` |

### Auth bypass for local development

Set `AUTH_UI_BYPASS=true` in `.env.local` to bypass all middleware authentication. This creates a fake "Prévisualisation" user profile. Pages that load data via Supabase RLS will still show empty/error states without a real Supabase connection.

Copy `.env.local.example` to `.env.local` and fill in at minimum:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use placeholders if no Supabase project available)
- `AUTH_UI_BYPASS=true`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

### Gotchas

- **ESLint config**: The repo does not ship a `.eslintrc.json`. Running `npm run lint` for the first time triggers an interactive prompt. Create `.eslintrc.json` with `{"extends": "next/core-web-vitals"}` to avoid the prompt.
- **Build prerender errors**: `npm run build` may fail on pages that call Supabase at build time (e.g. `/agents`). This is expected when Supabase credentials are placeholders. The dev server (`npm run dev`) works fine since pages are rendered on demand.
- **`next.config.mjs`** has `ignoreBuildErrors: true` for TypeScript and `ignoreDuringBuilds: true` for ESLint, so the build tolerates type/lint issues.
- The worker (`npm run worker:dev`) requires `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` to function; it will fail without real API keys.
- The dashboard (`/dashboard`) redirects to `/forecast/veille` by design.

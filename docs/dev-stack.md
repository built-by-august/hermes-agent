# Local Dev Stack — Run & Validation Guide

How to bring up and validate the full local stack: **frontend + backend + database +
auth**, and the config/env each piece needs. Verified end-to-end on macOS (Node 22,
pnpm 11) against `origin/main` (`3849d642a`).

## Architecture at a glance

| Layer    | Tech                                    | Port / origin                          |
|----------|-----------------------------------------|----------------------------------------|
| Frontend | React 18 + Vite 6 + TypeScript (`apps/web`) | http://localhost:5173          |
| Backend  | Fastify 5 + TypeScript (`apps/api`)     | http://localhost:4000 (`/api/v1`)      |
| Database | Prisma 6 + SQLite (`apps/api/prisma/dev.db`) | file (no external infra)     |
| Auth     | JWT (access 15m / refresh 7d) + bcrypt  | `register`/`login`/`refresh`/`me`      |

The Vite dev server proxies `/api` → `http://localhost:4000`, so the browser only
needs the frontend origin. The schema is written portably (see `prisma/schema.prisma`)
and can be switched to PostgreSQL without code changes.

## One-time setup (config / env)

```bash
# 1. Install deps (pnpm >= 9 recommended; the repo pins 11.13.0)
pnpm install

# 2. Backend env — copy the template into apps/api/.env
cp apps/api/.env.example apps/api/.env
#    Contents (Prisma CLI auto-loads apps/api/.env):
#      DATABASE_URL="file:./dev.db"          # SQLite file, relative to prisma/
#      JWT_SECRET="dev-only-secret-change-me-in-production"
#      PORT=4000
#      HOST=0.0.0.0

# 3. Apply migrations + seed the demo org ("Rutherford Consulting")
pnpm --filter @repo/api db:deploy
pnpm --filter @repo/api db:seed
#    Seed login: dale@example.com / jamie@example.com / alex@example.com  (password: Str0ng!Pass)
```

The frontend reads no environment in this scaffold — the Vite `/api` proxy handles
routing. Only `apps/api/.env` is required.

## Starting the whole stack

```bash
pnpm dev
```

Turborepo runs `web` and `api` concurrently in watch mode:

- Backend  → http://localhost:4000  (health: http://localhost:4000/health)
- Frontend → http://localhost:5173  (Vite auto-increments the port if 5173 is taken)

Or start each separately:

```bash
# Backend (watch):
pnpm --filter @repo/api dev
# Backend (production build):
pnpm --filter @repo/api build && pnpm --filter @repo/api start

# Frontend:
pnpm --filter @repo/web dev
```

## Health checks

- **Backend health:** `curl http://localhost:4000/health` → `{"status":"ok","service":"api",...}`
- **OpenAPI / Swagger:** http://localhost:4000/api/v1/docs (UI) and `/docs/json` (schema, 17 paths)
- **Frontend:** `curl http://localhost:5173/` → 200 HTML (`<title>Custom Hermes Agent</title>`)
- **DB ↔ API connectivity:** login and read the seeded operation map
  (`GET /api/v1/orgs/:id/map` → 9 nodes / 8 edges) and audit log.
- **Auth round-trip:** `register → login → refresh → me` all return JWTs and the
  authenticated user.

## Automated validation

`scripts/stack-check.sh` starts both services, exercises every layer (backend health,
OpenAPI, register/login/refresh/me, org write, seeded map + audit reads, frontend
serving, Vite proxy → backend login), and reports a pass/fail count:

```bash
bash scripts/stack-check.sh   # -> "RESULT: 11 passed, 0 failed"
```

## Verification gates (per workspace)

```bash
pnpm typecheck   # 5/5 workspaces pass
pnpm lint        # 4/4 pass
pnpm build       # 4/4 pass (web → 224 kB JS bundle, api prisma+tsc)
pnpm test        # api 43, skills 18, web 2, contracts 7 — all pass
```

## Notes / known behavior

- Vite's default port is 5173; if another dev server already holds it, Vite silently
  picks the next free port (e.g. 5174) — check the dev server log for "Local:". The
  `/api` proxy still targets port 4000 regardless.
- `pnpm dev` (turbo) is the documented one-command boot; for long-lived background
  runs prefer `pnpm --filter @repo/api start` (production build) + `pnpm --filter
  @repo/web dev`, or the included `scripts/stack-check.sh`.

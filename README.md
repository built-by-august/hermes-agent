# Custom Hermes Agent — Webapp Monorepo

Deploy into a business owner's operations, **map** them, **audit** them from the
inside, then **suggest → implement → wire → verify → hand off** integrations and
automations with coded skills.

This repository is a **fork of NousResearch/hermes-agent**. The original upstream
source is preserved under [`upstream/`](./upstream/) as a reference; the product
itself is a self-contained TypeScript monorepo (see
[`docs/architecture.md`](./docs/architecture.md) for the full PRD, data model,
and API contract).

## What's inside

```
apps/
  web/     React 18 + Vite + TypeScript frontend (port 5173)
  api/     Fastify + TypeScript backend (port 4000, prefix /api/v1)
packages/
  contracts/  Shared Zod schemas + TS types (the single API contract source)
  eslint-config/  Shared flat ESLint config
upstream/   Original upstream Hermes Agent source (reference only)
docs/       architecture.md (system design, data model, API contract)
```

## Prerequisites

- Node.js ≥ 22
- [pnpm](https://pnpm.io/) ≥ 9 (the repo pins `packageManager: pnpm@11.13.0`; run
  `corepack enable` if you want it managed for you)

## One-command dev boot

```bash
pnpm install
pnpm dev
```

That starts **both** apps concurrently via Turborepo:

- Frontend → http://localhost:5173
- Backend → http://localhost:4000/api/v1 (health check at http://localhost:4000/health)

The Vite dev server proxies `/api` to the backend, so the browser only needs the
frontend origin.

## Useful commands

```bash
pnpm dev          # run web + api in watch mode
pnpm build        # type-check + build all packages (cached by Turborepo)
pnpm lint         # ESLint across all workspaces
pnpm test         # Vitest across all workspaces
pnpm typecheck    # tsc --noEmit across all workspaces
pnpm format       # Prettier write
pnpm format:check # Prettier check
```

You can target a single workspace, e.g. `pnpm --filter @repo/api test`.

## Environment

Copy the template and adjust:

```bash
cp .env.example .env
```

`apps/api` reads `PORT`/`HOST` from the environment. The frontend reads no
environment in this scaffold (the Vite proxy handles `/api`).

## Working in the monorepo

- **Add a dependency to one app:** `pnpm --filter @repo/web add <pkg>`
- **Add a cross-workspace dep:** `pnpm --filter @repo/api add @repo/contracts@workspace:*`
- **Contract changes:** edit Zod schemas in `packages/contracts/src/index.ts`. The
  frontend and backend consume the generated types directly — keep the contract
  as the single source of truth and both apps stay in sync.

## Docker (single-host deployment)

The Monorepo ships multi-stage Dockerfiles for the **api** (Fastify + Prisma) and
**web** (React + Vite, served by nginx which reverse-proxies `/api/v1` to the
api). The database is an embedded SQLite file kept on a named volume, so the
default stack needs **no external infrastructure**:

```bash
docker compose up --build      # full stack
#   web -> http://localhost:8080   (nginx, SPA + /api/v1 proxy)
#   api -> http://localhost:4000   (Fastify, prefix /api/v1)
```

- The API applies Prisma migrations and seeds the demo org (`dale@example.com`,
  password `Str0ng!Pass`) on first boot; the SQLite DB persists on the
  `api-data` volume.
- `JWT_SECRET` is read from `.env` (`cp .env.example .env`); it defaults to a
  dev placeholder otherwise.

### PostgreSQL (opt-in)

The Prisma schema is SQLite-first today, so Postgres requires first porting
`apps/api/prisma/schema.prisma` to the `postgresql` provider (see the schema
header comment). Once ported, an opt-in stack with a `db` service is provided:

```bash
docker compose -f docker-compose.postgres.yml up --build
```

Kubernetes manifests (namespace, config, secrets, postgres StatefulSet/Service)
live under `deploy/k8s/` for the deployment path. Secrets are placeholders —
generate and apply real ones before production (see the comments in
`deploy/k8s/secret.yaml`).

## CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`:
install → lint → build → test. A PR is green only when all steps pass.

## License

MIT — see [`LICENSE`](./LICENSE).

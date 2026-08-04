# Custom Hermes Agent — MVP Product Requirements & System Architecture

**Status:** Draft v1.0 (pending review)
**Owner:** Connor (direction/judgment)
**Author:** Hermes (architecture) — task t_a7ce9782
**Consumers:** backend team (api), frontend team (web), skill-engine team (packages/skills), E2E/deploy team (infra)
**Source of truth for:** monorepo scaffold, API contract, data model, skill lifecycle, deployment

---

## 1. Product Overview

The Custom Hermes Agent is a web application that embeds a coding-agent harness into a
business owner's operations. It:

1. **Deploys into** a business owner's operations (they set up their organization in the app and connect it to the harness).
2. **Maps** their operations into a structured graph (the "operation map": nodes = processes/steps/tools/systems, edges = handoffs/dependencies).
3. **Audits** operations from the inside (records every action as an audit event, surfaces findings).
4. **Suggests, implements, wires, verifies, and hands off** integrations and automations — driven by **coded skills** packaged with the product.

The MVP is a vertical slice of this loop: an owner can map their ops, see audit findings, run a skill integration demo, and receive a handoff report. It is the foundation the product grows on, not a toy dashboard — the data model and skill lifecycle are designed to be production-shaped from day one.

### 1.1 Explicit Buzz integration decision

> **Decision: Buzz is OUT of MVP scope (Phase 2 / a connector adapter).**

The root task title mentions "Buzz integration," and Connor's Buzz harness (Buzz Desktop + ACP, channel `#455eeae6…`) is his active agent workspace. However, Buzz is an _internal agent-management harness_, not a business-owner integration target. Bundling it into the MVP would couple the product to a proprietary agent harness, delay the core ops-mapping → audit → skill loop, and confuse the "deploy into a business owner's operations" story.

Therefore:

- **In MVP:** the product defines a generic `Connector` interface (the thing a skill wires, verifies, and hands off). Real adapters for common business integrations (email/Slack/CRM/calendar/DB) are the demonstrated ones. A **Buzz adapter stub** exists in the skill engine, clearly marked `NOT_IMPLEMENTED`, so the interface is future-proof.
- **Phase 2:** implement the Buzz adapter against the same `Connector` interface once the MVP loop is proven. Documented in §9 Roadmap.
- The skill-engine acceptance ("if Buzz is confirmed in scope, provide a Buzz adapter stub and clearly mark remaining work") is satisfied: the interface + stub ship in the MVP; the working adapter is explicitly marked remaining work.

---

## 2. User Stories

Prioritized (P0 = MVP core, P1 = MVP nice-to-have, P2 = post-MVP).

### P0 — must have for MVP

- **US-01 (Owner deploys/onboards):** As an organization owner, I can create my organization and invite an operator, so the harness has a home to map and audit.
- **US-02 (Map operations):** As an owner/operator, I can add operation nodes (processes, steps, tools, systems) and edges (handoffs, dependencies) to describe how my business runs, so the harness understands the topology.
- **US-03 (Audit from inside):** As an owner, I can see an audit log of every action taken by users and skills in my org, so I have an immutable record.
- **US-04 (See findings):** As an owner, I can view audit/analysis findings ranked by severity, so I know where to focus.
- **US-05 (Run a skill — suggest):** As an owner, I can ask a skill to propose integration/automation steps against my mapped ops, so I see recommendations before anything changes.
- **US-06 (Implement + wire + verify):** As an owner, I can approve a skill to implement, wire, and verify a change in **simulation/sandbox mode** for the MVP, so no live system is touched until proven safe.
- **US-07 (Hand off):** As an owner, I receive a handoff report assigning completed, pending, and manual steps, archived as an audit event.
- **US-08 (Authz):** As an owner, I can restrict operators to read-only or scoped skill-run permissions.

### P1 — MVP nice-to-have

- **US-09 (Integration catalog):** Browse available skills/connectors from a package registry.
- **US-10 (Replay):** View past skill runs and their full audit trails.
- **US-11 (Seed demo org):** One-click demo org with realistic seeded ops + findings so the frontend works in demo mode (also satisfies FE acceptance).

### P2 — post-MVP

- **US-12 (Live mode):** Execute skill changes against connected real systems with explicit outbound approval.
- **US-13 (Buzz adapter):** Drive the product from/integrate with the Buzz harness (see §1.1).
- **US-14 (Multi-org/multi-tenant SaaS onboarding):** Self-serve signup, billing, marketplace.

---

## 3. MVP Boundaries

### In scope (MVP)

- Monorepo: `apps/web`, `apps/api`, shared `packages/contracts`.
- Auth: email+password registration/login, JWT, RBAC roles per org (owner/admin/operator/auditor).
- Org management: create org, invite members, one org per workspace tenant (multi-tenant data isolation by `org_id`).
- Operation mapping: nodes + edges CRUD, graph retrieval, demo seeding.
- Audit: append-only audit log (`INSERT`-only), immutable by design (no UPDATE/DELETE endpoints; server rejects).
- Findings: computed/skill-generated findings with severity.
- Skill engine: package format + loader, lifecycle API (suggest → implement → wire → verify → handoff), **simulation/sandbox mode only** in MVP, one complete sample skill, Buzz adapter stub.
- Connector interface: generic credential/config model (encrypted at rest, never returned).
- Handoff report generation + audit event.
- Deployment: Docker Compose (local), Docker images, GitHub Actions CI/CD, target runtime with runbook.
- OpenAPI/Swagger auto-generated from the API.

### Explicitly out of scope (MVP)

- Live/real outbound execution against third-party systems (MVP = sandbox/simulation). Gate is a Phase-2 flag.
- Billing / SaaS marketplace / self-serve multi-tenant onboarding (P2).
- Buzz working adapter (stub only).
- Native mobile apps.
- Real-time collaborative editing of the operation map (single-writer per session is fine).
- SOC2/pen-test level compliance (note the immutable-audit foundation is already built in).

### Non-functional boundaries

- **Security posture:** immutable audit, least-privilege RBAC, no secrets returned in API responses, worker isolation for skill execution.
- **Performance:** read path (map + audit) < 300ms p95 at demo scale (hundreds of nodes, tens of thousands of audit events). Skill runs are async.
- **Accessibility/responsiveness:** FE baseline WCAG 2.1 A, responsive down to 768px.

---

## 4. System Architecture

### 4.1 Component diagram

```
                          ┌──────────────────────────────────────────────┐
                          │                  Client (Browser)              │
                          │   apps/web — React + TS + Vite + Tailwind      │
                          │   Dashboard · Org Setup · Ops Map (React Flow)  │
                          │   Audit Log · Findings · Runbook/Handoff UI     │
                          └──────────────────┬───────────────────────────────┘
                                             │ HTTPS / JSON
                                             ▼
                          ┌──────────────────────────────────────────────┐
                          │                apps/api (Node/TS)             │
                          │   Fastify + OpenAPI (auto) + RBAC middleware  │
                          │                                              │
                          │  ┌──────────────┐  ┌──────────────────────┐  │
                          │  │ Auth svc     │  │ Org / Map / Audit    │  │
                          │  │ (JWT+RBAC)   │  │ endpoints (CRUD+R/O) │  │
                          │  └──────┬───────┘  └──────────┬───────────┘  │
                          │         │                      │             │
                          │  ┌──────▼───────┐  ┌───────────▼───────────┐  │
                          │  │ Skill Runner │  │  Connector Manager    │  │
                          │  │ (orchestrates│  │  (credentials, config,│  │
                          │  │  lifecycle)  │  │   sandbox exec)       │  │
                          │  └──────┬───────┘  └───────────────────────┘  │
                          └─────────┼─────────────────────────────────────┘
                                    │ Prisma ORM      │ (read-only to audit)
                                    ▼                 ▼
                          ┌──────────────────────────────────────────────┐
                          │               PostgreSQL (single DB)          │
                          │   org · users · map(nodes/edges) · audit ·   │
                          │   findings · skills · skill_runs · connectors│
                          └──────────────────────────────────────────────┘
```

### 4.2 Request flow (skill run)

```
User clicks "Run skill X (suggest)" on org map
   → POST /api/v1/orgs/{orgId}/skills/{skillId}/runs {phase:"suggest"}
   → api: authz (operator/owner) → creates skill_run (status=pending)
   → api: emits audit_event {action:"skill.suggest.requested"}
   → Skill Runner loads skill X package, calls suggest(map, findings, org.config)
   → skill emits proposed steps {steps:[...]} (NO execution in MVP)
   → api: audit_event {action:"skill.suggest.completed"}
   → returns run id + suggestions to UI
User approves → run next phases (implement/wire/verify/handoff) in sandbox
   → same pattern; every transition logged; final handoff report archived.
```

---

## 5. Tech Stack

Chosen for: single language across a monorepo (type-safe contracts shared FE↔BE), fast iteration, wide hiring pool, auto-documented HTTP layer, and a clean fork boundary from the (Python) Hermes agent — we **do not** couple to Hermes internals in the MVP; the harness runs as our own backend app.

| Layer               | Choice                                                         | Why                                                                |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Monorepo tooling    | pnpm workspaces + Turborepo                                    | One command dev boot, cached builds, clean package graph           |
| Language            | TypeScript (strict) everywhere                                 | Shared `packages/contracts` types drive FE + BE + contract tests   |
| Backend runtime     | Node.js + Fastify                                              | Fast, first-class TS, OpenAPI auto-gen via `@fastify/swagger`      |
| ORM / data          | Prisma + PostgreSQL                                            | Type-safe schema, migrations, single source for data model         |
| Validation/contract | Zod schemas in `packages/contracts` + `@fastify/type-provider` | One schema source; runtime validation + TS types + OpenAPI         |
| Frontend            | React 18 + Vite + Tailwind + TanStack Query + React Flow       | Ops map as a real graph editor; no heavy app shell                 |
| Auth                | better-auth (or @fastify/jwt) + bcrypt; JWT access + refresh   | Session optional; RBAC via standard claims                         |
| Skill engine        | TS modules with a plugin/package format (§6)                   | Coded skills; sandbox via isolated worker (VM) toggled off in demo |
| Jobs/async          | BullMQ + Redis (API) — or in-process queue for demo            | Async skill runs without blocking HTTP                             |
| Infra / deploy      | Docker multi-stage + Docker Compose; GitHub Actions CI         | Repeatable local + CI + target deploy (Fly.io or Caddy+VPS)        |
| Observability       | pino logging + structured audit rows                           | Every action already an audit row                                  |

### Fork strategy (from the root task)

- We **fork the Hermes Agent repo** as the fossil requirement, but the MVP product is our own `apps/web` + `apps/api`. The fork lives as a separate upstream reference (docs/ and the agent harness we may later lean on for agentic skills). The product monorepo is self-contained TS. Skills are **coded** (deterministic, testable) for the MVP rather than LLM-orchestrated — this keeps every action auditable and verifiable (§6).

---

## 6. Skill Engine & Skill Lifecycle

The heart of the product. A **skill** is a packaged, coded capability that moves a mapped operation toward an automation/integration.

### 6.1 Skill package format

A skill is a directory (or tarball) with a manifest + code:

```
skills/<slug>/
  skill.json          # manifest (below)
  index.ts            # default export: implements the lifecycle
  schema.ts           # Zod: input/output/step schemas
  checks.ts           # verification checks
  assets/             # docs, templates
```

`skill.json`:

```json
{
  "slug": "slack-incident-alert",
  "name": "Slack Incident Alert",
  "version": "0.1.0",
  "description": "Wires a Slack channel alert when an ops step fails.",
  "phases": ["suggest", "implement", "wire", "verify", "handoff"],
  "capabilities": { "connectors": ["slack"], "risk": "low" },
  "entry": "index.ts"
}
```

### 6.2 Lifecycle phases (the "automation loop")

Every phase is a discrete endpoint, returns structured output, and **records an audit event** on entry and completion. All phases run in **simulation/sandbox mode** for the MVP (dry-run, no live side effects; a `dry_run: true` flag is set on each run).

1. **Suggest** — skill inspects the mapped ops + findings and returns a ranked list of proposed integration/automation steps (`steps[]`), each with rationale, risk, and affected nodes.
2. **Implement** — skill generates the concrete change (config, code snippet, wiring plan) as an artifact. In MVP this is authored but **not applied** to a live system.
3. **Wire** — skill resolves connector endpoints + creates/validates a credential reference (credential stored encrypted, never returned) and produces a wiring plan.
4. **Verify** — skill runs `checks.ts` (simulated health checks) and returns pass/fail/warn per check.
5. **Handoff** — skill composes a HandoffReport: owner_assignment (who owns each remaining manual step), summary, verification results, the audit trail for this run.

Each phase produces a typed result persisted on `skill_run`; a run moves phase→phase only via the API (owner approval for implement/wire in production use; demo auto-approves).

### 6.3 Connector interface

```ts
interface Connector {
  kind: string // "slack" | "gmail" | "crm" | "buzz" | ...
  status: 'disconnected' | 'configured' | 'verified'
  connect(config: ConnectorConfig): Promise<ConnectResult> // sandbox: simulated
  verify(): Promise<CheckResult[]>
}
```

- **Buzz adapter stub** ships as `connectors/buzz/index.ts` implementing the interface + a manifest flag `implemented: false`, with `TODO` comments listing the required work to complete it (Phase 2).

### 6.4 Sample skill (complete, in MVP)

`slack-incident-alert` — demonstrates the full loop end-to-end against the demo org (map → suggest → implement → wire → verify → handoff) so the E2E drill can assert every step is logged.

---

## 7. Data Model

Single PostgreSQL database, multi-tenant by `org_id`. Prisma is the source of truth.

```
User            { id uuid PK, email unique, password_hash, name, role_in_org?, created_at }
Organization    { id uuid PK, name, industry, settings jsonb, owner_id FK->User, created_at }

Membership      { id, org_id FK, user_id FK, role enum(owner,admin,operator,auditor), unique(org_id,user_id) }

OperationNode   { id uuid PK, org_id FK, name, type enum(process,step,tool,system,handoff),
                  status enum(active,paused,needs_attention), metadata jsonb,
                  position jsonb, created_at }                  // node on the map
OperationEdge   { id uuid PK, org_id FK, source FK->OperationNode, target FK->OperationNode,
                  label, type enum(dependency,handoff,data_flow), unique(org_id,source,target) }

AuditEvent      { id bigserial PK, org_id FK, actor_id FK nullable, actor_type enum(user,skill,system),
                  action varchar(120),            // e.g. "skill.suggest.completed"
                  target_type, target_id, context jsonb,        // full payload snapshot
                  severity enum(info,warning,critical), result varchar, created_at }
                  -- APPEND-ONLY: api is read(x, no update)/append only. No UPDATE/DELETE.

Finding         { id uuid PK, org_id FK, source_type enum(analysis,skill,manual),
                  severity enum(low,medium,high,critical), title, description,
                  evidence jsonb, status enum(open,acknowledged,resolved), suggested_skill_id FK->Skill,
                  created_at }

Skill           { id uuid PK, slug unique, name, version, description,
                  phases text[], capabilities jsonb, status enum(active,disabled) }

SkillRun        { id uuid PK, org_id FK, skill_id FK, phase enum(suggest,implement,wire,verify,handoff),
                  status enum(pending,running,completed,failed), dry_run bool default true,
                  input jsonb, output jsonb, error text?, created_at, updated_at }

Connector       { id uuid PK, org_id FK, kind, display_name,
                  credential_ref text,          // encrypted ref, never plaintext in API
                  config jsonb, status enum(disconnected,configured,verified), created_at }

HandoffReport   { id uuid PK, org_id FK, skill_run_id FK, summary, owner_assignment jsonb,
                  steps jsonb, verification jsonb, audit_event_id FK, created_at }
```

Indexing highlights: `AuditEvent(org_id, created_at)`, `OperationNode(org_id)`, `SkillRun(org_id, skill_id, status)`, `Finding(org_id, status)`.

Immutable-audit enforcement: Prisma/DB grants only allow `INSERT` + `SELECT` on `AuditEvent` from the app role; the API has no update/delete handler for audit rows.

---

## 8. API Contract

REST under `/api/v1`, JSON, Bearer JWT. OpenAPI auto-generated at `/api/v1/docs` (Swagger UI). All endpoint schemas defined once in `packages/contracts` (Zod) and shared with the frontend adapter. Errors follow RFC 7807 (`{error, message, status, details?}`).

### Auth

| Method | Path           | Description                |
| ------ | -------------- | -------------------------- |
| POST   | /auth/register | Create user                |
| POST   | /auth/login    | Get access+refresh token   |
| POST   | /auth/refresh  | Rotate refresh token       |
| GET    | /auth/me       | Current user + memberships |

**Example — register request/response**

```http
POST /api/v1/auth/register
Authorization: (none)
Content-Type: application/json

{
  "email": "dale@example.com",
  "password": "Str0ng!Pass",
  "name": "Dale Rutherford"
}
```

```json
201
{
  "user": { "id": "u_01", "email": "dale@example.com", "name": "Dale Rutherford" },
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 900
}
```

### Organizations

| Method | Path                  | Desc                        |
| ------ | --------------------- | --------------------------- |
| POST   | /orgs                 | Create org                  |
| GET    | /orgs/{orgId}         | Get org                     |
| PATCH  | /orgs/{orgId}         | Update settings             |
| POST   | /orgs/{orgId}/members | Invite member (owner/admin) |

**Example — create org**

```http
POST /api/v1/orgs
Content-Type: application/json

{ "name": "Rutherford Consulting", "industry": "professional-services" }
```

```json
201
{
  "id": "org_01",
  "name": "Rutherford Consulting",
  "industry": "professional-services",
  "ownerId": "u_01",
  "createdAt": "2026-08-04T16:34:00Z"
}
```

### Operations map

| Method | Path                          | Desc                                 |
| ------ | ----------------------------- | ------------------------------------ |
| POST   | /orgs/{orgId}/operations      | Create operation node                |
| GET    | /orgs/{orgId}/operations      | List nodes                           |
| PATCH  | /orgs/{orgId}/operations/{id} | Update node                          |
| POST   | /orgs/{orgId}/edges           | Create edge (dependency)             |
| GET    | /orgs/{orgId}/map             | Return nodes + edges (graph payload) |

**Example — create operation node**

```http
POST /api/v1/orgs/org_01/operations
Content-Type: application/json

{
  "name": "Client intake",
  "type": "process",
  "status": "active",
  "position": { "x": 120, "y": 80 }
}
```

```json
201
{
  "id": "node_01",
  "orgId": "org_01",
  "name": "Client intake",
  "type": "process",
  "status": "active",
  "position": { "x": 120, "y": 80 },
  "createdAt": "2026-08-04T16:40:00Z"
}
```

**Example — get map (graph payload)**

```http
GET /api/v1/orgs/org_01/map
```

```json
200
{
  "nodes": [
    { "id": "node_01", "name": "Client intake", "type": "process", "status": "active", "position": { "x": 120, "y": 80 } },
    { "id": "node_02", "name": "CRM: HubSpot", "type": "tool", "status": "active", "position": { "x": 360, "y": 80 } }
  ],
  "edges": [
    { "id": "edge_01", "source": "node_01", "target": "node_02", "label": "writes to", "type": "data_flow" }
  ]
}
```

### Findings & audit

| Method | Path                               | Desc                      |
| ------ | ---------------------------------- | ------------------------- |
| GET    | /orgs/{orgId}/findings             | List findings by severity |
| PATCH  | /orgs/{orgId}/findings/{id}/status | Acknowledge/resolve       |
| GET    | /orgs/{orgId}/audit                | Audit log (append-only)   |

**Example — audit log**

```http
GET /api/v1/orgs/org_01/audit?limit=10
```

```json
200
{
  "items": [
    {
      "id": 501,
      "orgId": "org_01",
      "actorType": "user",
      "actorId": "u_01",
      "action": "operation.node.created",
      "targetType": "OperationNode",
      "targetId": "node_01",
      "context": { "name": "Client intake" },
      "severity": "info",
      "createdAt": "2026-08-04T16:40:01Z"
    }
  ],
  "nextCursor": "eyJ..."
}
```

### Skill runs (the automation loop)

| Method | Path                                | Desc                                               |
| ------ | ----------------------------------- | -------------------------------------------------- |
| GET    | /orgs/{orgId}/skills                | List skills                                        |
| POST   | /orgs/{orgId}/skills/{skillId}/runs | Start run, phase="suggest"                         |
| GET    | /orgs/{orgId}/runs/{runId}          | Get run state/output                               |
| POST   | /orgs/{orgId}/runs/{runId}/advance  | Move to next phase (implement/wire/verify/handoff) |
| GET    | /orgs/{orgId}/runs/{runId}/handoff  | Get handoff report                                 |
| GET    | /orgs/{orgId}/connectors            | List connectors                                    |
| POST   | /orgs/{orgId}/connectors            | Add/configure connector                            |

**Example — start a skill run (suggest)**

```http
POST /api/v1/orgs/org_01/skills/slack-incident-alert/runs
Content-Type: application/json

{ "phase": "suggest", "dryRun": true }
```

```json
202
{
  "runId": "run_01",
  "status": "pending",
  "phase": "suggest",
  "dryRun": true
}
```

**Example — handoff report (verify → handoff output)**

```http
POST /api/v1/orgs/org_01/runs/run_01/advance
Content-Type: application/json

{ "phase": "handoff" }
```

```json
200
{
  "runId": "run_01",
  "phase": "handoff",
  "status": "completed",
  "handoff": {
    "summary": "Wired Slack alert on Client intake failure (simulated).",
    "ownerAssignment": { "remainingManualSteps": ["Rename channel #ops-alerts"], "assignee": "operator" },
    "verification": [ { "check": "slack.webhook.reachable", "result": "pass" } ],
    "auditEventId": 612
  }
}
```

Every `POST` above that changes state also writes a corresponding `AuditEvent` (e.g. `skill.run.advanced`,`skill.handoff.completed`) with the request/response snapshot in `context`.

---

## 9. Auth Model

- **Identity:** email+password, `bcrypt`-hashed. JWT access token (short TTL, e.g. 15 min) + rotating refresh token (PDF: httpOnly cookie or returned token per deployment; storage in `localStorage` acceptable for MVP demo, **documented** as a known tradeoff).
- **RBAC roles (per org, via `Membership.role`):**
  - `owner` — everything, billing (post-MVP), manage members.
  - `admin` — everything except member ownership transfer; approve reviewer.
  - `operator` — map ops, run skills in sandbox, view audit.
  - `auditor` — read-only org+audit+findings.
- **Authorization:** middleware resolves org from path, checks the requester's role for that org; 403 otherwise. Server is the only trust boundary (never trust FE role gating).
- **Connector credentials:** never returned from the API; stored as encrypted `credential_ref` (envelope encryption); skill reads via a server-side secret manager boundary.
- **Audit attribution:** every action carries `actor_id` + `actor_type(user|skill|system)`.

---

## 10. Deployment Posture

- **Local dev (one command):** `pnpm install && pnpm dev` — Turborepo runs `apps/api` (Fastify, hot reload) + `apps/web` (Vite) + requires Postgres+Redis (Compose). `pnpm db:migrate && pnpm db:seed` provisions schema + demo org.
- **Containers:** multi-stage Dockerfiles for `apps/api` and `apps/web`; `docker-compose.yml` stitches api + web + postgres + redis for a full local stack.
- **CI/CD (GitHub Actions):** on PR → lint, typecheck, unit + contract tests, build. On merge to `main` → build images, run E2E against a fresh stack, deploy to target.
  - Backend contract E2E (t_6765592f acceptance): curl drill — create org → add operations → add edge → run skill → read audit log (asserting every step logged).
  - Full E2E (t_56f6bdda): org setup → map → audit view → skill integration demo → handoff report.
- **Target runtime (MVP):** single region, either **Fly.io** (Postgres + two services, Redis via Upstash) or **Caddy reverse proxy + VPS** with Docker. Choose per cost/ops comfort; runbook in repo `docs/runbook.md`.
- **Config:** 12-factor — all secrets via env (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `NODE_ENV`). No secrets in images.
- **Skill execution isolation:** MVP runs skills in-process (sandbox dry-run, no live side effects). Phase 2 real execution moves to an isolated worker (VM/Firecracker or Docker sidecar) with allow-listed Connector actions and an explicit outbound approval gate.

---

## 11. Handoff Burndown (who builds what from this doc)

| Team / task                    | Consumes §                      | Deliverable                                            |
| ------------------------------ | ------------------------------- | ------------------------------------------------------ |
| Monorepo scaffold (t_1f932161) | §4, §5, §8 (packages/contracts) | apps/web + apps/api + shared package + CI              |
| Backend (t_6765592f)           | §7, §8                          | API, Prisma schema, RBAC, seeding, OpenAPI, curl drill |
| Skill engine (t_56c25581)      | §6, §8 (skill runs)             | package format, lifecycle, sample skill, Buzz stub     |
| Frontend (t_4f8ee31a)          | §2, §8                          | pages, mock adapter contract tests, demo-mode flow     |
| E2E/deploy (t_56f6bdda)        | §10                             | Compose/E2E/runbook/demo script                        |

---

## 12. Roadmap (post-MVP)

- **Phase 2a:** Live execution mode for skills behind explicit outbound approval gate; worker isolation.
- **Phase 2b:** **Buzz adapter** completion (implement `connectors/buzz/index.ts`), enabling the harness-integrated workflow.
- **Phase 3:** Multi-tenant self-serve SaaS onboarding, billing, skill marketplace/registry.
- **Phase 4:** Agentic (LLM-orchestrated) skill authoring layered on the coded-skill foundation, still emitting the same auditable lifecycle.

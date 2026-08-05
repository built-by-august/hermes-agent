# Skill Engine — Implementation Notes (t_56c25581)

This document describes the integration skill engine implemented in
`packages/skills`, which backs the `suggest → implement → wire → verify →
handoff` automation loop from `docs/architecture.md` §6.

## Packages surface (`@repo/skills`)

| Area | File | Responsibility |
| ---- | ---- | -------------- |
| Types | `src/types.ts` | `SkillManifest`, `SkillLifecycle`, `SkillPackage`, `Connector`, `AuditSink`, `SkillRunState`, phase enums. |
| Loader | `src/loader.ts` | Validates `skill.json` (Zod) + imports the entry module (`SkillLifecycle` default export). `loadSkillFromDir` / `loadSkillsFromDir`. |
| Registry | `src/registry.ts` | `SkillRegistry` + `createDefaultSkillRegistry()` (ships `slack-incident-alert`). |
| Engine | `src/engine.ts` | `SkillEngine` orchestrates the lifecycle, guarantees an immutable audit event on **entry + completion** of every phase; `runFullLifecycle` runs the whole loop. |
| Audit | `src/audit.ts` | `InMemoryAuditSink` — reference append-only sink (the API implements the real one against the `AuditEvent` table). |
| Credentials | `src/credentials.ts` | Opaque `enc:v1:` credential vault — secrets never leave the vault; only refs are returned. |
| Connectors | `src/connectors/index.ts` | Generic `Connector` interface + simulated `SlackConnector` + **Buzz adapter STUB**. |
| Sample skill | `src/skills/slack-incident-alert/` | Complete MVP skill: `skill.json`, `index.ts` (lifecycle), `checks.ts`. |
| Demo | `src/demo/run-demo.ts` | `runDemo()` — full drill used by tests + `pnpm demo`. |

## Lifecycle & audit trail

The engine emits, for every run, the following append-only audit actions
(proven by `src/tests/engine.test.ts`):

```
skill.run.started
skill.suggest.started      skill.suggest.running      skill.suggest.completed
skill.implement.started    skill.implement.running    skill.implement.completed
skill.wire.started         skill.wire.running         skill.wire.completed
skill.verify.started       skill.verify.running       skill.verify.completed
skill.handoff.started      skill.handoff.running      skill.handoff.completed
skill.handoff.report.archived
```

Sandbox-only by design: every run is `dryRun: true`. `implement` returns
`applied: false`; `wire` stores the secret as an opaque `enc:v1:` reference;
`verify` runs simulated checks. Nothing is applied to a live system in the MVP.

## Buzz adapter — status

Buzz is **out of MVP scope** (architecture §1.1). The product ships:

- the generic `Connector` interface (so a skill can reference `"buzz"`),
- a clearly-marked `BuzzConnectorStub` with `implemented: false` and
  `describeRemainingWork()` listing the Phase-2 work:

  1. Implement ACP client against Buzz Desktop + harness channel `#455eeae6-…`.
  2. Wire `BUZZ_PRIVATE_KEY` identity hand-off (harness supplies identity;
     the adapter must NOT read the key directly).
  3. Map Buzz agent lifecycle onto `SkillLifecycle` phases.
  4. Add an outbound-approval gate before dispatching any agent.
  5. Persist run state to the product DB.

The stub lives in two places so the intent is unmistakable:
`src/connectors/index.ts` (`BuzzConnectorStub`) and
`src/connectors/buzz/index.ts` (`BuzzAdapter`). Both refuse to connect and
verify as `fail` until the work above is done. No live Buzz calls are attempted.

## Running

```bash
pnpm --filter @repo/skills demo   # prints the full loop's 17 audit events
pnpm --filter @repo/skills test   # 18 tests, including the acceptance drill
```

## Acceptance criteria (task t_56c25581)

- [x] Load skill metadata + capabilities from a package format (`skill.json` + Zod).
- [x] API for proposing integration steps (`suggest` returns ranked `ProposedStep[]`).
- [x] Run proposed changes in sandbox/simulation mode (`dryRun` everywhere).
- [x] Wire credentials/configuration (opaque `enc:v1:` ref, secret never returned).
- [x] Verify success with checks (`checks.ts` + connector `verify()`).
- [x] Produce a handoff report + audit event (`skill.handoff.report.archived`).
- [x] At least one complete sample skill (`slack-incident-alert`).
- [x] Buzz adapter stub provided and remaining work clearly marked.
- [x] Automated tests simulate deploy → map → suggest → implement → wire → verify → handoff and assert **every step is logged**.

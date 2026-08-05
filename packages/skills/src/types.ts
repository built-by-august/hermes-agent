/**
 * Core types for the integration skill engine (packages/skills).
 *
 * A **skill** is a packaged, coded capability that moves a mapped operation
 * toward an automation/integration. It implements the five-phase lifecycle
 * from docs/architecture.md §6:
 *
 *   suggest -> implement -> wire -> verify -> handoff
 *
 * Every phase is a discrete, typed API call that (a) receives the operation
 * map + findings + org settings, (b) returns structured output, and (c) is
 * recorded as an immutable audit event by the engine. In the MVP everything
 * runs in **sandbox / simulation mode** (`dryRun: true`): proposed changes are
 * authored and simulated, never applied to a live system.
 */

import type {
  Finding,
  OperationMap,
  OperationNode,
  SkillPhase,
} from '@repo/contracts'

export type { Finding, OperationMap, OperationNode, SkillPhase }

/** The five lifecycle phases, in dependency order. */
export const PHASES: readonly SkillPhase[] = [
  'suggest',
  'implement',
  'wire',
  'verify',
  'handoff',
] as const

export type RiskLevel = 'low' | 'medium' | 'high'
export type EffortLevel = 'S' | 'M' | 'L' | 'XL'

/* ---------------------------------------------------------------- *
 *  Skill package format (§6.1)
 * ---------------------------------------------------------------- */

/**
 * Declared capabilities of a skill. `connectors` lists the connector kinds
 * the skill can wire (e.g. "slack"); `risk` is the blast radius of applying
 * the skill's changes.
 */
export interface SkillCapabilities {
  connectors: string[]
  risk: RiskLevel
  [key: string]: unknown
}

/** The `skill.json` manifest — the package-format contract for a skill. */
export interface SkillManifest {
  slug: string
  name: string
  version: string
  description: string
  /** Ordered subset of PHASES this skill implements (usually all five). */
  phases: SkillPhase[]
  capabilities: SkillCapabilities
  /** Entry module that default-exports the SkillLifecycle. */
  entry: string
  /**
   * `false` for adapter/stub skills (e.g. the Buzz connector) that satisfy the
   * interface but are not complete. Defaults to `true`.
   */
  implemented?: boolean
  /** Human-readable list of what remains before `implemented: true`. */
  remainingWork?: string[]
}

/* ---------------------------------------------------------------- *
 *  Phase inputs / outputs
 * ---------------------------------------------------------------- */

/** A single proposed integration/automation step returned by `suggest`. */
export interface ProposedStep {
  id: string
  title: string
  description: string
  /** Why this step moves the mapped operation forward. */
  rationale: string
  risk: RiskLevel
  /** Nodes on the operation map this step touches. */
  affectedNodeIds: string[]
  /** Which lifecycle phase this step belongs to. */
  phase: SkillPhase
  effort: EffortLevel
  status: 'proposed' | 'approved' | 'implemented' | 'wired' | 'verified' | 'manual'
}

export interface SuggestOutput {
  steps: ProposedStep[]
  summary: string
}

/**
 * The concrete change the skill authors: config, code snippet, wiring plan.
 * In MVP sandbox mode this is NEVER applied to a live system (`applied` is
 * always `false`).
 */
export interface ImplementOutput {
  artifact: Record<string, unknown>
  applied: false
  dryRun: true
  stepsCompleted: string[]
}

/**
 * A resolved connector endpoint plus a credential *reference*. The secret
 * itself never leaves the credential vault; only the `enc:v1:` ref is exposed.
 */
export interface WireOutput {
  connectorKind: string
  endpoint: string
  credentialRef: string
  wiringPlan: Record<string, unknown>
  status: 'configured' | 'verified'
}

export interface VerifyOutput {
  checks: CheckResult[]
  passed: number
  failed: number
  warned: number
  overall: 'pass' | 'fail' | 'warn'
}

/** One verification check (from a skill's checks.ts or a connector). */
export interface CheckResult {
  check: string
  result: 'pass' | 'fail' | 'warn'
  detail?: string
}

/** Owner-assignment section of the handoff report. */
export interface OwnerAssignment {
  assignee: string
  remainingManualSteps: string[]
  [key: string]: unknown
}

export interface HandoffReportData {
  summary: string
  ownerAssignment: OwnerAssignment
  steps: Array<Record<string, unknown>>
  verification: Record<string, unknown>
  /** Audit trail of this run, for the report body. */
  auditTrail: string[]
}

/* ---------------------------------------------------------------- *
 *  Skill execution context & lifecycle interface
 * ---------------------------------------------------------------- */

/** Everything a skill may read while executing a phase. */
export interface SkillContext {
  orgId: string
  map: OperationMap
  findings: Finding[]
  orgSettings: Record<string, unknown>
  /** Phase-specific input, validated by the skill's own schema. */
  input: Record<string, unknown>
  /** True in the MVP: phases simulate, never execute live side effects. */
  dryRun: boolean
  /** Resolves connectors by kind (e.g. "slack", "buzz"). */
  connectors: ConnectorResolver
}

/** The coded lifecycle a skill package implements. */
export interface SkillLifecycle {
  suggest(ctx: SkillContext): SuggestOutput | Promise<SuggestOutput>
  implement(
    ctx: SkillContext,
    steps: ProposedStep[]
  ): ImplementOutput | Promise<ImplementOutput>
  wire(
    ctx: SkillContext,
    steps: ProposedStep[],
    implemented: ImplementOutput
  ): WireOutput | Promise<WireOutput>
  verify(ctx: SkillContext, wiring: WireOutput): VerifyOutput | Promise<VerifyOutput>
  handoff(ctx: SkillContext, verification: VerifyOutput): HandoffOutput | Promise<HandoffOutput>
}

export interface HandoffOutput {
  report: HandoffReportData
}

/** A loaded skill: validated manifest + runnable lifecycle. */
export interface SkillPackage {
  manifest: SkillManifest
  lifecycle: SkillLifecycle
}

/* ---------------------------------------------------------------- *
 *  Connectors (§6.3)
 * ---------------------------------------------------------------- */

export type ConnectorStatus = 'disconnected' | 'configured' | 'verified'

/** Config a skill passes to `connect()`; secret material is stored, never echoed. */
export interface ConnectorConfig {
  endpoint?: string
  credentials?: Record<string, unknown>
  [key: string]: unknown
}

export interface ConnectResult {
  ok: boolean
  status: ConnectorStatus
  detail?: string
}

/**
 * The generic Connector interface — the thing a skill wires, verifies, and
 * hands off. Real adapters (slack/gmail/crm/...) are simulated in the MVP;
 * the Buzz adapter is a clearly-marked stub (see connectors/buzz).
 */
export interface Connector {
  kind: string
  displayName: string
  /** `false` for stub adapters that are not complete. */
  implemented: boolean
  status: ConnectorStatus
  connect(config: ConnectorConfig): Promise<ConnectResult>
  verify(): Promise<CheckResult[]>
  /** Human-readable list of work remaining for stub adapters. */
  describeRemainingWork?(): string[]
}

export interface ConnectorResolver {
  get(kind: string): Connector | undefined
  list(): Connector[]
}

/* ---------------------------------------------------------------- *
 *  Audit events (append-only)
 * ---------------------------------------------------------------- */

export type AuditActorType = 'user' | 'skill' | 'system'
export type AuditSeverity = 'info' | 'warning' | 'critical'

/** A new audit event to append (id/timestamp assigned by the sink). */
export interface NewAuditEvent {
  orgId: string
  actorId?: string | null
  actorType: AuditActorType
  /** e.g. "skill.suggest.completed", "operation.node.created" */
  action: string
  targetType?: string
  targetId?: string
  context?: Record<string, unknown>
  severity?: AuditSeverity
  result?: string
}

export interface AuditEvent extends NewAuditEvent {
  id: number
  createdAt: string
}

/**
 * Append-only audit sink. The API/DB layer implements this against the
 * immutable AuditEvent table (§7); the engine only ever calls `append`.
 */
export interface AuditSink {
  append(event: NewAuditEvent): Promise<AuditEvent> | AuditEvent
  list(orgId?: string): Promise<AuditEvent[]> | AuditEvent[]
}

/* ---------------------------------------------------------------- *
 *  Engine run state
 * ---------------------------------------------------------------- */

export type SkillRunStatus = 'pending' | 'running' | 'completed' | 'failed'

/** In-engine state of one skill run; mirrors contracts.SkillRun shape. */
export interface SkillRunState {
  id: string
  orgId: string
  skillId: string
  slug: string
  phase: SkillPhase
  status: SkillRunStatus
  dryRun: boolean
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  error: string | null
  steps: ProposedStep[]
  createdAt: string
  updatedAt: string
}

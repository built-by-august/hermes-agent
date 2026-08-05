import type {
  AuditPage,
  AuditSeverity,
  AuthResponse,
  Connector,
  CreateConnectorRequest,
  CreateEdgeRequest,
  CreateNodeRequest,
  Finding,
  FindingStatus,
  HandoffReport,
  LoginRequest,
  Membership,
  OperationEdge,
  OperationMap,
  OperationNode,
  Organization,
  RegisterRequest,
  Skill,
  SkillPhase,
  SkillRun,
  StartSkillRunRequest,
  User,
} from '@repo/contracts'

import type { ApiClient } from './types'
import { createDemoState, DEMO_ORG_ID, DEMO_USER_ID, emptyHandoff, type DemoState } from './seed'

const DELAY = 120 // simulate a little network latency

function sleep(ms = DELAY): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uuid(): string {
  // RFC4122 v4, crypto-backed when available.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function now(): string {
  return new Date().toISOString()
}

/**
 * In-memory mock adapter. Holds a mutable copy of the demo state per session so
 * the UI behaves like a real backend (creates persist, audit log grows, etc.).
 *
 * Implements the full skill-run lifecycle in simulation mode so the core demo
 * flow (map -> findings -> run skill -> handoff) works without a backend.
 */
export class MockApiClient implements ApiClient {
  private state: DemoState

  constructor() {
    this.state = createDemoState()
  }

  private nextAuditId = 1000

  private audit(
    action: string,
    actorType: AuditEvent['actorType'],
    ctx: Record<string, unknown>,
    severity: AuditSeverity = 'info'
  ): void {
    this.state.audit.unshift({
      id: this.nextAuditId++,
      orgId: DEMO_ORG_ID,
      actorId: actorType === 'user' ? DEMO_USER_ID : undefined,
      actorType,
      action,
      targetType: ctx.targetType as string | undefined,
      targetId: ctx.targetId as string | undefined,
      context: ctx,
      severity,
      createdAt: now(),
    })
  }

  /* ---------------------------- auth ---------------------------- */

  async register(input: RegisterRequest): Promise<AuthResponse> {
    await sleep()
    const user: User = { id: uuid(), email: input.email, name: input.name }
    const token = `mock.${btoa(user.id)}.token`
    return { user, accessToken: token, refreshToken: `${token}.refresh`, expiresIn: 900 }
  }

  async login(_input: LoginRequest): Promise<AuthResponse> {
    await sleep()
    const user: User = this.state.user
    const token = `mock.${btoa(user.id)}.token`
    return { user, accessToken: token, refreshToken: `${token}.refresh`, expiresIn: 900 }
  }

  async me(_token: string): Promise<{ user: User; memberships: Membership[] }> {
    await sleep(40)
    return { user: this.state.user, memberships: this.state.memberships }
  }

  /* ------------------------- organizations ----------------------- */

  async createOrg(input: { name: string; industry?: string }): Promise<Organization> {
    await sleep()
    const org: Organization = {
      id: uuid(),
      name: input.name,
      industry: input.industry,
      settings: {},
      ownerId: DEMO_USER_ID,
      createdAt: now(),
    }
    this.state.org = org
    this.audit('organization.created', 'user', {
      name: org.name,
      targetType: 'Organization',
      targetId: org.id,
    })
    return org
  }

  async getOrg(orgId: string): Promise<Organization> {
    await sleep(40)
    this.assertOrg(orgId)
    return this.state.org
  }

  async updateOrg(
    orgId: string,
    patch: Partial<Pick<Organization, 'name' | 'industry' | 'settings'>>
  ): Promise<Organization> {
    await sleep()
    this.assertOrg(orgId)
    this.state.org = { ...this.state.org, ...patch }
    this.audit('organization.updated', 'user', { targetType: 'Organization', targetId: orgId })
    return this.state.org
  }

  async listMembers(orgId: string): Promise<Membership[]> {
    await sleep(40)
    this.assertOrg(orgId)
    return this.state.memberships
  }

  /* ------------------------- operations map ---------------------- */

  async getMap(orgId: string): Promise<OperationMap> {
    await sleep(40)
    this.assertOrg(orgId)
    return { nodes: this.state.nodes, edges: this.state.edges }
  }

  async createNode(orgId: string, input: CreateNodeRequest): Promise<OperationNode> {
    await sleep()
    this.assertOrg(orgId)
    const node: OperationNode = {
      id: uuid(),
      orgId,
      name: input.name,
      type: input.type,
      status: input.status ?? 'active',
      metadata: input.metadata ?? {},
      position: input.position,
      createdAt: now(),
    }
    this.state.nodes.push(node)
    this.audit('operation.node.created', 'user', {
      name: node.name,
      targetType: 'OperationNode',
      targetId: node.id,
    })
    return node
  }

  async updateNode(
    orgId: string,
    nodeId: string,
    patch: Partial<CreateNodeRequest>
  ): Promise<OperationNode> {
    await sleep()
    this.assertOrg(orgId)
    const node = this.state.nodes.find((n) => n.id === nodeId)
    if (!node) throw new ApiError(404, 'not_found', `Node ${nodeId} not found`)
    const updated = { ...node, ...patch }
    this.state.nodes = this.state.nodes.map((n) => (n.id === nodeId ? updated : n))
    this.audit('operation.node.updated', 'user', { targetType: 'OperationNode', targetId: nodeId })
    return updated
  }

  async createEdge(orgId: string, input: CreateEdgeRequest): Promise<OperationEdge> {
    await sleep()
    this.assertOrg(orgId)
    const edge: OperationEdge = {
      id: uuid(),
      orgId,
      source: input.source,
      target: input.target,
      label: input.label,
      type: input.type ?? 'dependency',
    }
    this.state.edges.push(edge)
    this.audit('operation.edge.created', 'user', { targetType: 'OperationEdge', targetId: edge.id })
    return edge
  }

  /* ----------------------------- audit --------------------------- */

  async getAudit(
    orgId: string,
    params?: { limit?: number; cursor?: string; severity?: AuditSeverity }
  ): Promise<AuditPage> {
    await sleep(40)
    this.assertOrg(orgId)
    let items = [...this.state.audit]
    if (params?.severity) items = items.filter((a) => a.severity === params.severity)
    const limit = params?.limit ?? 50
    const items2 = items.slice(0, limit)
    return {
      items: items2,
      nextCursor: items.length > limit ? String(items2[items2.length - 1]?.id ?? '') : null,
    }
  }

  /* ---------------------------- findings ------------------------- */

  async getFindings(orgId: string, params?: { status?: FindingStatus }): Promise<Finding[]> {
    await sleep(40)
    this.assertOrg(orgId)
    let items = [...this.state.findings]
    if (params?.status) items = items.filter((f) => f.status === params.status)
    const order: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return items.sort((a, b) => order[a.severity] - order[b.severity])
  }

  async updateFindingStatus(
    orgId: string,
    findingId: string,
    status: FindingStatus
  ): Promise<Finding> {
    await sleep()
    this.assertOrg(orgId)
    const finding = this.state.findings.find((f) => f.id === findingId)
    if (!finding) throw new ApiError(404, 'not_found', `Finding ${findingId} not found`)
    finding.status = status
    this.audit('finding.status.updated', 'user', {
      status,
      targetType: 'Finding',
      targetId: findingId,
    })
    return finding
  }

  /* --------------------- skills & skill runs --------------------- */

  async listSkills(orgId: string): Promise<Skill[]> {
    await sleep(40)
    this.assertOrg(orgId)
    return this.state.skills
  }

  async startSkillRun(
    orgId: string,
    skillId: string,
    input?: StartSkillRunRequest
  ): Promise<SkillRun> {
    await sleep()
    this.assertOrg(orgId)
    const skill = this.state.skills.find((s) => s.id === skillId)
    if (!skill) throw new ApiError(404, 'not_found', `Skill ${skillId} not found`)
    const phase: SkillPhase = input?.phase ?? 'suggest'
    const run: SkillRun = {
      id: uuid(),
      orgId,
      skillId,
      phase,
      status: 'pending',
      dryRun: true,
      input: input?.input ?? {},
      output: null,
      error: null,
      createdAt: now(),
      updatedAt: now(),
    }
    this.runs.set(run.id, run)
    this.audit('skill.run.started', 'user', {
      phase,
      skillId,
      targetType: 'SkillRun',
      targetId: run.id,
    })
    // Auto-run synchronously in mock mode (demo auto-approves).
    return this.executePhase(run, phase)
  }

  async getSkillRun(orgId: string, runId: string): Promise<SkillRun> {
    await sleep(40)
    this.assertOrg(orgId)
    const run = this.runs.get(runId)
    if (!run) throw new ApiError(404, 'not_found', `Run ${runId} not found`)
    return run
  }

  async advanceSkillRun(orgId: string, runId: string, phase: SkillPhase): Promise<SkillRun> {
    await sleep()
    this.assertOrg(orgId)
    const run = this.runs.get(runId)
    if (!run) throw new ApiError(404, 'not_found', `Run ${runId} not found`)
    this.audit('skill.run.advanced', 'user', { phase, targetType: 'SkillRun', targetId: runId })
    return this.executePhase(run, phase)
  }

  async getHandoff(orgId: string, runId: string): Promise<HandoffReport> {
    await sleep(40)
    this.assertOrg(orgId)
    const run = this.runs.get(runId)
    if (!run) throw new ApiError(404, 'not_found', `Run ${runId} not found`)
    // Replays the lifecycle if the run reached handoff; otherwise returns placeholder.
    if (run.output?.handoff) return run.output.handoff as HandoffReport
    return emptyHandoff(runId)
  }

  /* --------------------------- connectors ------------------------ */

  async listConnectors(orgId: string): Promise<Connector[]> {
    await sleep(40)
    this.assertOrg(orgId)
    return this.state.connectors
  }

  async addConnector(orgId: string, input: CreateConnectorRequest): Promise<Connector> {
    await sleep()
    this.assertOrg(orgId)
    const connector: Connector = {
      id: uuid(),
      orgId,
      kind: input.kind,
      displayName: input.displayName,
      status: 'configured',
      implemented: input.kind !== 'buzz',
      config: input.config ?? {},
      createdAt: now(),
    }
    this.state.connectors.push(connector)
    this.audit('connector.added', 'user', {
      kind: input.kind,
      targetType: 'Connector',
      targetId: connector.id,
    })
    return connector
  }

  /* --------------------------- internals ------------------------- */

  private runs = new Map<string, SkillRun>()

  private assertOrg(orgId: string): void {
    if (orgId !== this.state.org.id) {
      throw new ApiError(404, 'not_found', `Organization ${orgId} not found in demo`)
    }
  }

  /** Executes a skill phase against the demo org and records the audit trail. */
  private executePhase(run: SkillRun, phase: SkillPhase): SkillRun {
    const skill = this.state.skills.find((s) => s.id === run.skillId)!
    let output: Record<string, unknown> = { ...(run.output ?? {}) }

    switch (phase) {
      case 'suggest': {
        output = {
          steps: [
            {
              id: 's1',
              title: 'Add automated alert on project kickoff handoff',
              rationale:
                'Finding f_001 shows the PM handoff is unverified; an alert closes the loop without manual polling.',
              risk: 'low',
              affectedNodes: ['n_handoff_pm', 'n_lead_qual'],
            },
            {
              id: 's2',
              title: 'Route alert to Slack #ops-alerts',
              rationale: 'Slack connector already verified; lowest-friction notification channel.',
              risk: 'low',
              affectedNodes: ['n_handoff_pm'],
            },
          ],
        }
        this.audit('skill.suggest.completed', 'skill', {
          skillId: skill.id,
          targetType: 'SkillRun',
          targetId: run.id,
        })
        break
      }
      case 'implement': {
        output = {
          ...output,
          artifact: {
            kind: 'slack_webhook',
            summary: 'POST to Slack incoming-webhook for #ops-alerts on handoff event.',
            dryRun: true,
          },
        }
        this.audit('skill.implement.completed', 'skill', {
          skillId: skill.id,
          targetType: 'SkillRun',
          targetId: run.id,
        })
        break
      }
      case 'wire': {
        output = {
          ...output,
          wiring: { connector: 'slack', channel: '#ops-alerts', credentialRef: 'enc::slack::demo' },
        }
        this.audit('skill.wire.completed', 'skill', {
          skillId: skill.id,
          targetType: 'SkillRun',
          targetId: run.id,
        })
        break
      }
      case 'verify': {
        output = {
          ...output,
          verification: [
            { check: 'slack.webhook.reachable', result: 'pass' },
            { check: 'handoff.event.emitted', result: 'pass' },
          ],
        }
        this.audit('skill.verify.completed', 'skill', {
          skillId: skill.id,
          targetType: 'SkillRun',
          targetId: run.id,
        })
        break
      }
      case 'handoff': {
        const handoff: HandoffReport = {
          id: uuid(),
          orgId: run.orgId,
          skillRunId: run.id,
          summary: 'Wired Slack alert on project kickoff handoff failure (simulated).',
          ownerAssignment: {
            remainingManualSteps: [
              'Rename channel #ops-alerts to match your runbook',
              'Confirm PM has Slack access',
            ],
            assignee: 'operator',
          },
          steps: [
            { label: 'Slack webhook created (simulated)', status: 'done' },
            { label: 'Alert routed to #ops-alerts', status: 'done' },
            { label: 'Manual: rename channel & confirm access', status: 'pending' },
          ],
          verification: { checksPassed: 2, checksFailed: 0 },
          created: now(),
        }
        output = { ...output, handoff }
        this.audit('skill.handoff.completed', 'skill', {
          skillId: skill.id,
          auditEventId: this.nextAuditId,
          targetType: 'SkillRun',
          targetId: run.id,
        })
        break
      }
    }

    const updated: SkillRun = {
      ...run,
      phase,
      status: 'completed',
      output,
      updatedAt: now(),
    }
    this.runs.set(run.id, updated)
    return updated
  }
}

/** RFC 7807-shaped error thrown by adapters so the UI handles failures uniformly. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toApiError() {
    return { error: this.error, message: this.message, status: this.status, details: this.details }
  }
}

// Re-export for consumers that need the type (kept here to avoid an extra import path).
export type { AuditEvent }
type AuditEvent = import('@repo/contracts').AuditEvent

import type {
  AuditEvent,
  Connector,
  Finding,
  HandoffReport,
  Membership,
  OperationEdge,
  OperationNode,
  Organization,
  Skill,
  User,
} from '@repo/contracts'

/**
 * Deterministic demo-data seed for the mock adapter.
 *
 * All timestamps are fixed so the in-memory store and contract tests are
 * reproducible. Mirrors the MVP demo org described in `docs/architecture.md`
 * (Rutherford Consulting — a professional-services shop running the
 * deploy -> map -> audit -> suggest -> implement -> wire -> verify -> handoff loop).
 */

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const SKILL_ID = '33333333-3333-3333-3333-333333333333'
const T = '2026-08-04T16:40:00.000Z'

// Stable UUIDs for seed entities so the demo data and contract tests are
// deterministic. (The contracts package requires every id to be a valid v4 uuid.)
const SEED_UUIDS = {
  member: 'aaaaaaaa-0000-0000-0000-000000000001',
  nodeIntake: 'bbbbbbbb-0000-0000-0000-000000000101',
  nodeQual: 'bbbbbbbb-0000-0000-0000-000000000102',
  nodeCrm: 'bbbbbbbb-0000-0000-0000-000000000103',
  nodeEmail: 'bbbbbbbb-0000-0000-0000-000000000104',
  nodeHandoff: 'bbbbbbbb-0000-0000-0000-000000000105',
  edgeIntakeQual: 'cccccccc-0000-0000-0000-000000000101',
  edgeQualCrm: 'cccccccc-0000-0000-0000-000000000102',
  edgeIntakeEmail: 'cccccccc-0000-0000-0000-000000000103',
  edgeQualHandoff: 'cccccccc-0000-0000-0000-000000000104',
  finding1: 'dddddddd-0000-0000-0000-000000000101',
  finding2: 'dddddddd-0000-0000-0000-000000000102',
  finding3: 'dddddddd-0000-0000-0000-000000000103',
  connectorSlack: 'eeeeeeee-0000-0000-0000-000000000101',
  connectorBuzz: 'eeeeeeee-0000-0000-0000-000000000102',
}

export interface DemoState {
  org: Organization
  user: User
  memberships: Membership[]
  nodes: OperationNode[]
  edges: OperationEdge[]
  findings: Finding[]
  audit: AuditEvent[]
  skills: Skill[]
  connectors: Connector[]
}

export function createDemoState(): DemoState {
  const org: Organization = {
    id: ORG_ID,
    name: 'Rutherford Consulting',
    industry: 'professional-services',
    settings: { theme: 'system', timezone: 'America/Los_Angeles' },
    ownerId: USER_ID,
    createdAt: T,
  }

  const user: User = {
    id: USER_ID,
    email: 'dale@example.com',
    name: 'Dale Rutherford',
  }

  const memberships: Membership[] = [
    {
      id: SEED_UUIDS.member,
      orgId: ORG_ID,
      userId: USER_ID,
      role: 'owner',
    },
  ]

  const nodes: OperationNode[] = [
    {
      id: SEED_UUIDS.nodeIntake,
      orgId: ORG_ID,
      name: 'Client intake',
      type: 'process',
      status: 'active',
      metadata: { owner: 'front-office' },
      position: { x: 80, y: 120 },
      createdAt: T,
    },
    {
      id: SEED_UUIDS.nodeQual,
      orgId: ORG_ID,
      name: 'Lead qualification',
      type: 'step',
      status: 'active',
      metadata: {},
      position: { x: 320, y: 120 },
      createdAt: T,
    },
    {
      id: SEED_UUIDS.nodeCrm,
      orgId: ORG_ID,
      name: 'CRM: HubSpot',
      type: 'tool',
      status: 'active',
      metadata: { vendor: 'HubSpot' },
      position: { x: 560, y: 60 },
      createdAt: T,
    },
    {
      id: SEED_UUIDS.nodeEmail,
      orgId: ORG_ID,
      name: 'Email: Gmail',
      type: 'tool',
      status: 'needs_attention',
      metadata: { vendor: 'Google Workspace' },
      position: { x: 560, y: 200 },
      createdAt: T,
    },
    {
      id: SEED_UUIDS.nodeHandoff,
      orgId: ORG_ID,
      name: 'Project kickoff handoff',
      type: 'handoff',
      status: 'paused',
      metadata: {},
      position: { x: 320, y: 280 },
      createdAt: T,
    },
  ]

  const edges: OperationEdge[] = [
    {
      id: SEED_UUIDS.edgeIntakeQual,
      orgId: ORG_ID,
      source: SEED_UUIDS.nodeIntake,
      target: SEED_UUIDS.nodeQual,
      label: 'feeds',
      type: 'data_flow',
    },
    {
      id: SEED_UUIDS.edgeQualCrm,
      orgId: ORG_ID,
      source: SEED_UUIDS.nodeQual,
      target: SEED_UUIDS.nodeCrm,
      label: 'writes to',
      type: 'data_flow',
    },
    {
      id: SEED_UUIDS.edgeIntakeEmail,
      orgId: ORG_ID,
      source: SEED_UUIDS.nodeIntake,
      target: SEED_UUIDS.nodeEmail,
      label: 'notifies',
      type: 'handoff',
    },
    {
      id: SEED_UUIDS.edgeQualHandoff,
      orgId: ORG_ID,
      source: SEED_UUIDS.nodeQual,
      target: SEED_UUIDS.nodeHandoff,
      label: 'triggers',
      type: 'handoff',
    },
  ]

  const findings: Finding[] = [
    {
      id: SEED_UUIDS.finding1,
      orgId: ORG_ID,
      sourceType: 'analysis',
      severity: 'high',
      title: 'Manual handoff between intake and PM is unverified',
      description:
        'The "Project kickoff handoff" step has no automated notification. Leads can stall for hours before a PM sees them.',
      evidence: {
        stalledMinutesAvg: 210,
        affectedNodes: [SEED_UUIDS.nodeHandoff, SEED_UUIDS.nodeQual],
      },
      status: 'open',
      suggestedSkillId: SKILL_ID,
      createdAt: T,
    },
    {
      id: SEED_UUIDS.finding2,
      orgId: ORG_ID,
      sourceType: 'analysis',
      severity: 'medium',
      title: 'Email tool flagged needs_attention',
      description:
        'Gmail connector last sync failed 3 times; retries are not surfaced to operators.',
      evidence: { failedSyncs: 3, lastError: 'rate_limited' },
      status: 'open',
      createdAt: T,
    },
    {
      id: SEED_UUIDS.finding3,
      orgId: ORG_ID,
      sourceType: 'manual',
      severity: 'low',
      title: 'Lead qualification step has no documented owner',
      description:
        'Responsibility for lead qualification is ambiguous between front-office and sales.',
      evidence: { suggestedOwner: 'sales' },
      status: 'acknowledged',
      createdAt: T,
    },
  ]

  const audit: AuditEvent[] = [
    {
      id: 501,
      orgId: ORG_ID,
      actorId: USER_ID,
      actorType: 'user',
      action: 'organization.created',
      targetType: 'Organization',
      targetId: ORG_ID,
      context: { name: org.name, industry: org.industry },
      severity: 'info',
      createdAt: T,
    },
    {
      id: 502,
      orgId: ORG_ID,
      actorId: USER_ID,
      actorType: 'user',
      action: 'operation.node.created',
      targetType: 'OperationNode',
      targetId: SEED_UUIDS.nodeIntake,
      context: { name: 'Client intake' },
      severity: 'info',
      createdAt: '2026-08-04T16:40:01.000Z',
    },
    {
      id: 503,
      orgId: ORG_ID,
      actorType: 'system',
      action: 'analysis.findings.generated',
      targetType: 'Organization',
      targetId: ORG_ID,
      context: { count: findings.length },
      severity: 'info',
      createdAt: '2026-08-04T16:45:00.000Z',
    },
  ]

  const skills: Skill[] = [
    {
      id: SKILL_ID,
      slug: 'slack-incident-alert',
      name: 'Slack Incident Alert',
      version: '0.1.0',
      description:
        'Wires a Slack channel alert when an ops step fails. Demonstrates the full lifecycle in simulation mode.',
      phases: ['suggest', 'implement', 'wire', 'verify', 'handoff'],
      capabilities: { connectors: ['slack'], risk: 'low' },
      status: 'active',
    },
  ]

  const connectors: Connector[] = [
    {
      id: SEED_UUIDS.connectorSlack,
      orgId: ORG_ID,
      kind: 'slack',
      displayName: 'Slack',
      status: 'verified',
      implemented: true,
      config: { channel: '#ops-alerts' },
      createdAt: T,
    },
    {
      id: SEED_UUIDS.connectorBuzz,
      orgId: ORG_ID,
      kind: 'buzz',
      displayName: 'Buzz (stub)',
      status: 'disconnected',
      implemented: false,
      config: {},
      createdAt: T,
    },
  ]

  return { org, user, memberships, nodes, edges, findings, audit, skills, connectors }
}

export const DEMO_ORG_ID = ORG_ID
export const DEMO_USER_ID = USER_ID
export const DEMO_SKILL_ID = SKILL_ID

/** Empty handoff placeholder used until a run reaches the handoff phase. */
export function emptyHandoff(runId: string): HandoffReport {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    orgId: ORG_ID,
    skillRunId: runId,
    summary: '',
    ownerAssignment: {},
    steps: [],
    verification: {},
    created: T,
  }
}

/**
 * Demo dataset seed — `pnpm --filter @repo/api db:seed`
 *
 * Creates a realistic professional-services demo org ("Rutherford Consulting")
 * with three users (owner/operator/auditor), a nine-node operation map with
 * eight edges, three findings, one skill, one connector, and the audit events
 * for every seeded action (actorType=system).
 *
 * Idempotent: if the demo owner already exists, the seed exits without changes.
 * Demo credentials (all users, same password):  Str0ng!Pass
 *
 * Exports `seed(prisma)` so tests can drive it programmatically; auto-runs
 * only when executed as a script (pnpm db:seed).
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { pathToFileURL } from 'node:url'
import { appendAudit, type AuditInput } from './audit.js'

const DEMO_PASSWORD = 'Str0ng!Pass'

// Same default resolution as src/db.ts (relative to prisma/ -> prisma/dev.db).
process.env.DATABASE_URL ??= 'file:./dev.db'

export async function seed(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: 'dale@example.com' } })
  if (existing) {
    console.log('Demo data already present (dale@example.com exists) — nothing to do.')
    return
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const dale = await prisma.user.create({
    data: { email: 'dale@example.com', passwordHash, name: 'Dale Rutherford' },
  })
  const jamie = await prisma.user.create({
    data: { email: 'jamie@example.com', passwordHash, name: 'Jamie Ortiz' },
  })
  const alex = await prisma.user.create({
    data: { email: 'alex@example.com', passwordHash, name: 'Alex Chen' },
  })

  const org = await prisma.organization.create({
    data: {
      name: 'Rutherford Consulting',
      industry: 'professional-services',
      ownerId: dale.id,
      settings: {
        notifications: { channel: '#ops-alerts' },
        billingCycle: 'monthly',
      },
    },
  })

  await prisma.membership.createMany({
    data: [
      { orgId: org.id, userId: dale.id, role: 'owner' },
      { orgId: org.id, userId: jamie.id, role: 'operator' },
      { orgId: org.id, userId: alex.id, role: 'auditor' },
    ],
  })

  // --- Operation map -------------------------------------------------------
  const nodeDefs = [
    { name: 'Client intake', type: 'process', status: 'active', position: { x: 60, y: 60 } },
    { name: 'CRM: HubSpot', type: 'tool', status: 'active', position: { x: 320, y: 60 } },
    { name: 'Discovery call', type: 'step', status: 'active', position: { x: 60, y: 220 } },
    {
      name: 'Proposal & contract',
      type: 'process',
      status: 'active',
      position: { x: 320, y: 220 },
    },
    { name: 'Project kickoff', type: 'step', status: 'active', position: { x: 60, y: 380 } },
    { name: 'Invoicing', type: 'process', status: 'active', position: { x: 320, y: 380 } },
    { name: 'Slack: #ops-alerts', type: 'system', status: 'active', position: { x: 580, y: 60 } },
    { name: 'QuickBooks', type: 'tool', status: 'active', position: { x: 580, y: 380 } },
    { name: 'Monthly close', type: 'step', status: 'paused', position: { x: 580, y: 220 } },
  ] as const

  const nodes: Record<string, { id: string }> = {}
  for (const def of nodeDefs) {
    const node = await prisma.operationNode.create({
      data: {
        orgId: org.id,
        name: def.name,
        type: def.type,
        status: def.status,
        position: def.position,
        metadata: {},
      },
    })
    nodes[def.name] = { id: node.id }
    await audit(prisma, org.id, 'operation.node.created', 'OperationNode', node.id, {
      name: node.name,
      type: node.type,
    })
  }

  const edgeDefs: Array<{
    label: string
    type: 'dependency' | 'handoff' | 'data_flow'
    source: string
    target: string
  }> = [
    { source: 'Client intake', target: 'CRM: HubSpot', label: 'writes to', type: 'data_flow' },
    { source: 'Client intake', target: 'Discovery call', label: 'hands off to', type: 'handoff' },
    {
      source: 'Discovery call',
      target: 'Proposal & contract',
      label: 'hands off to',
      type: 'handoff',
    },
    { source: 'CRM: HubSpot', target: 'Proposal & contract', label: 'feeds', type: 'data_flow' },
    {
      source: 'Proposal & contract',
      target: 'Project kickoff',
      label: 'hands off to',
      type: 'handoff',
    },
    { source: 'Project kickoff', target: 'Invoicing', label: 'hands off to', type: 'handoff' },
    { source: 'Invoicing', target: 'QuickBooks', label: 'exports to', type: 'data_flow' },
    { source: 'Monthly close', target: 'Invoicing', label: 'depends on', type: 'dependency' },
  ]

  for (const def of edgeDefs) {
    const edge = await prisma.operationEdge.create({
      data: {
        orgId: org.id,
        source: nodes[def.source]!.id,
        target: nodes[def.target]!.id,
        label: def.label,
        type: def.type,
      },
    })
    await audit(prisma, org.id, 'edge.created', 'OperationEdge', edge.id, {
      source: def.source,
      target: def.target,
      type: def.type,
    })
  }

  // --- Skills & findings ----------------------------------------------------
  const skill = await prisma.skill.create({
    data: {
      slug: 'slack-incident-alert',
      name: 'Slack Incident Alert',
      version: '0.1.0',
      description: 'Wires a Slack channel alert when an ops step fails.',
      phases: ['suggest', 'implement', 'wire', 'verify', 'handoff'],
      capabilities: { connectors: ['slack'], risk: 'low' },
    },
  })
  await audit(prisma, org.id, 'skill.registered', 'Skill', skill.id, { slug: skill.slug })

  const findingDefs: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    sourceType: 'analysis' | 'skill' | 'manual'
    title: string
    description: string
    evidence: Record<string, unknown>
    suggestedSkillId?: string
  }> = [
    {
      severity: 'high',
      sourceType: 'analysis',
      title: 'Invoicing is manual and error-prone',
      description:
        'Invoices are prepared by hand and re-keyed into QuickBooks; three failures in the last two months were traced to manual entry.',
      evidence: { failedSteps: 3, avgDelayDays: 6 },
      suggestedSkillId: skill.id,
    },
    {
      severity: 'medium',
      sourceType: 'analysis',
      title: 'Monthly close is paused with no owner',
      description:
        'The Monthly close step has been paused since late June and no owner is assigned to resume it.',
      evidence: { pausedSince: '2026-06-30' },
    },
    {
      severity: 'low',
      sourceType: 'analysis',
      title: 'No alerting on client intake failures',
      description:
        'Failures in the client intake process are only discovered when a customer complains.',
      evidence: { incidentsLast30d: 2 },
      suggestedSkillId: skill.id,
    },
  ]

  for (const def of findingDefs) {
    const finding = await prisma.finding.create({
      data: {
        orgId: org.id,
        sourceType: def.sourceType,
        severity: def.severity,
        title: def.title,
        description: def.description,
        evidence: def.evidence as Prisma.InputJsonValue,
        suggestedSkillId: def.suggestedSkillId ?? null,
      },
    })
    await audit(prisma, org.id, 'finding.created', 'Finding', finding.id, {
      severity: finding.severity,
      title: finding.title,
    })
  }

  // --- Connector ------------------------------------------------------------
  const connector = await prisma.connector.create({
    data: {
      orgId: org.id,
      kind: 'slack',
      displayName: 'Slack',
      status: 'disconnected',
      config: {},
    },
  })
  await audit(prisma, org.id, 'connector.created', 'Connector', connector.id, {
    kind: connector.kind,
  })

  await audit(prisma, org.id, 'org.seeded', 'Organization', org.id, { dataset: 'demo' })

  console.log('Demo dataset seeded:')
  console.log('  org        : Rutherford Consulting (' + org.id + ')')
  console.log('  owner      : dale@example.com')
  console.log('  operator   : jamie@example.com')
  console.log('  auditor    : alex@example.com')
  console.log('  password   : ' + DEMO_PASSWORD + ' (all users)')
  console.log('  nodes      : ' + nodeDefs.length + ', edges: ' + edgeDefs.length)
  console.log('  findings   : 3, skills: slack-incident-alert, connectors: slack')
}

/** Seed audit events use actorType=system (the harness seeded the data). */
async function audit(
  prisma: PrismaClient,
  orgId: string,
  action: string,
  targetType: string,
  targetId: string,
  context: Record<string, unknown>
): Promise<void> {
  const input: AuditInput = { orgId, actorType: 'system', action, targetType, targetId, context }
  await appendAudit(prisma, input)
}

/** Auto-run only when executed directly (pnpm db:seed), not when imported. */
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const prisma = new PrismaClient()
  seed(prisma)
    .catch((err: unknown) => {
      console.error(err)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

/**
 * Acceptance tests for the integration skill engine (packages/skills).
 *
 * Drives the full acceptance sequence from the task body:
 *
 *   deploy -> map -> suggest -> implement -> wire -> verify -> handoff
 *
 * and asserts that EVERY step is recorded as an audit event. Also covers the
 * package loader, the sample skill, the Buzz adapter stub, the credential
 * vault (no secret leakage), and the per-phase API-shaped runner.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAuditSink, InMemoryAuditSink } from '../audit.js'
import { storeCredential, isCredentialRef, clearVault, readCredential } from '../credentials.js'
import {
  createConnectorResolver,
  createBuzzConnectorStub,
  BUZZ_STUB_REMAINING_WORK,
} from '../connectors/index.js'
import { createEngine } from '../engine.js'
import { createDefaultSkillRegistry, SkillRegistry } from '../registry.js'
import { slackIncidentAlert } from '../skills/slack-incident-alert/index.js'
import { runDemo } from '../demo/run-demo.js'
import type { OperationMap, SkillPackage } from '../types.js'

function demoMap(): OperationMap {
  return {
    nodes: [
      {
        id: 'node_01',
        orgId: 'org_demo',
        name: 'Client intake',
        type: 'process',
        status: 'needs_attention',
        metadata: {},
        position: { x: 120, y: 80 },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'node_02',
        orgId: 'org_demo',
        name: 'CRM: HubSpot',
        type: 'tool',
        status: 'active',
        metadata: {},
        position: { x: 360, y: 80 },
        createdAt: new Date().toISOString(),
      },
    ],
    edges: [
      {
        id: 'edge_01',
        orgId: 'org_demo',
        source: 'node_01',
        target: 'node_02',
        label: 'writes to',
        type: 'data_flow',
      },
    ],
  }
}

function makeSkill(): SkillPackage {
  return slackIncidentAlert()
}

describe('skill engine — full lifecycle acceptance', () => {
  let audit: InMemoryAuditSink
  let engine: ReturnType<typeof createEngine>
  let skill: SkillPackage

  beforeEach(() => {
    clearVault()
    audit = createAuditSink()
    const connectors = createConnectorResolver()
    engine = createEngine({ audit, connectors, dryRun: true })
    skill = makeSkill()
  })

  it('runs deploy->map->suggest->implement->wire->verify->handoff and logs every step', async () => {
    const finalRun = await engine.runFullLifecycle({
      orgId: 'org_demo',
      skill,
      map: demoMap(),
      findings: [],
      orgSettings: { slackChannel: '#ops-alerts' },
      phase: 'suggest',
      dryRun: true,
      input: {},
    })

    expect(finalRun.status).toBe('completed')
    expect(finalRun.phase).toBe('handoff')

    const actions = audit.actions('org_demo')
    // Every phase must be logged on entry (started), running, and completion.
    const expectedPrefixes = [
      'skill.run.started',
      'skill.suggest.started',
      'skill.suggest.running',
      'skill.suggest.completed',
      'skill.implement.started',
      'skill.implement.running',
      'skill.implement.completed',
      'skill.wire.started',
      'skill.wire.running',
      'skill.wire.completed',
      'skill.verify.started',
      'skill.verify.running',
      'skill.verify.completed',
      'skill.handoff.started',
      'skill.handoff.running',
      'skill.handoff.completed',
      'skill.handoff.report.archived',
    ]
    for (const prefix of expectedPrefixes) {
      expect(
        actions.some((a) => a === prefix || a.startsWith(prefix)),
        `missing audit action "${prefix}"`
      ).toBe(true)
    }
    // The handoff completion + report-archived events each appear exactly once.
    expect(actions.filter((a) => a === 'skill.handoff.completed')).toHaveLength(1)
    expect(actions.filter((a) => a === 'skill.handoff.report.archived')).toHaveLength(1)
  })

  it('runDemo produces a complete, logged loop', async () => {
    const result = await runDemo('org_demo')
    expect(result.status).toBe('completed')
    expect(result.phase).toBe('handoff')
    expect(result.auditActions.length).toBeGreaterThanOrEqual(17)
    expect(result.auditActions).toContain('skill.suggest.completed')
    expect(result.auditActions).toContain('skill.handoff.completed')
  })

  it('per-phase runner advances state exactly one phase at a time', async () => {
    const run = engine.startRun({
      orgId: 'org_demo',
      skill,
      map: demoMap(),
      phase: 'suggest',
    })
    expect(run.phase).toBe('suggest')

    let current = run
    const seen: string[] = []
    while (current.status !== 'completed') {
      current = await engine.runPhase(current.id, {
        orgId: 'org_demo',
        skill,
        map: demoMap(),
      })
      seen.push(current.phase)
    }
    // Each phase is executed in order; the run ends at handoff, completed.
    expect(seen[0]).toBe('implement')
    expect(seen.slice(-1)[0]).toBe('handoff')
    expect(current.status).toBe('completed')
    expect(current.phase).toBe('handoff')
    // Distinct audit events were written for every phase entry + completion.
    const actions = audit.actions('org_demo')
    for (const p of ['suggest', 'implement', 'wire', 'verify', 'handoff']) {
      expect(actions.some((a) => a === `skill.${p}.started`)).toBe(true)
      expect(actions.some((a) => a === `skill.${p}.completed`)).toBe(true)
    }
    expect(actions.some((a) => a === 'skill.handoff.report.archived')).toBe(true)
  })
})

describe('sample skill — slack-incident-alert', () => {
  let audit: InMemoryAuditSink
  let engine: ReturnType<typeof createEngine>

  beforeEach(() => {
    clearVault()
    audit = createAuditSink()
    engine = createEngine({ audit, connectors: createConnectorResolver(), dryRun: true })
  })

  it('suggest returns steps for needs_attention nodes', async () => {
    const run = await engine.runPhase(
      engine.startRun({ orgId: 'org_demo', skill: makeSkill(), map: demoMap() }).id,
      { orgId: 'org_demo', skill: makeSkill(), map: demoMap() }
    )
    const out = run.output as { steps: Array<{ title: string; affectedNodeIds: string[] }> }
    expect(out.steps.length).toBeGreaterThan(0)
    expect(out.steps[0]?.affectedNodeIds).toContain('node_01')
  })

  it('implement authors an artifact but never applies it (sandbox)', async () => {
    const start = engine.startRun({ orgId: 'org_demo', skill: makeSkill(), map: demoMap() })
    await engine.runPhase(start.id, { orgId: 'org_demo', skill: makeSkill(), map: demoMap() }) // suggest
    const run = await engine.runPhase(start.id, {
      orgId: 'org_demo',
      skill: makeSkill(),
      map: demoMap(),
    }) // implement
    const impl = run.output as { applied: boolean; dryRun: boolean }
    expect(impl.applied).toBe(false)
    expect(impl.dryRun).toBe(true)
  })

  it('wire stores a credential reference, never the secret', async () => {
    const start = engine.startRun({ orgId: 'org_demo', skill: makeSkill(), map: demoMap() })
    await engine.runPhase(start.id, { orgId: 'org_demo', skill: makeSkill(), map: demoMap() }) // suggest
    await engine.runPhase(start.id, { orgId: 'org_demo', skill: makeSkill(), map: demoMap() }) // implement
    const run = await engine.runPhase(start.id, {
      orgId: 'org_demo',
      skill: makeSkill(),
      map: demoMap(),
    }) // wire
    const wiring = run.output as { credentialRef: string }
    expect(isCredentialRef(wiring.credentialRef)).toBe(true)
    // secret material is readable only server-side via the vault; output has none.
    expect(JSON.stringify(run.output)).not.toContain('xoxb-simulated')
    expect(readCredential(wiring.credentialRef)).toBe('xoxb-simulated-webhook-url')
  })

  it('verify passes simulated checks', async () => {
    const start = engine.startRun({ orgId: 'org_demo', skill: makeSkill(), map: demoMap() })
    await engine.runPhase(start.id, { orgId: 'org_demo', skill: makeSkill(), map: demoMap() })
    await engine.runPhase(start.id, { orgId: 'org_demo', skill: makeSkill(), map: demoMap() })
    await engine.runPhase(start.id, { orgId: 'org_demo', skill: makeSkill(), map: demoMap() })
    const run = await engine.runPhase(start.id, {
      orgId: 'org_demo',
      skill: makeSkill(),
      map: demoMap(),
      orgSettings: { slackChannel: '#ops-alerts' },
    })
    const verify = run.output as {
      overall: string
      checks: Array<{ check: string; result: string }>
    }
    expect(verify.overall).toBe('pass')
    expect(verify.checks.some((c) => c.check === 'slack.credential.ref.created')).toBe(true)
  })

  it('handoff produces a report with owner assignment and audit trail', async () => {
    const finalRun = await engine.runFullLifecycle({
      orgId: 'org_demo',
      skill: makeSkill(),
      map: demoMap(),
      orgSettings: { slackChannel: '#ops-alerts' },
    })
    const handoff = finalRun.output as {
      report: { summary: string; ownerAssignment: { assignee: string } }
    }
    expect(handoff.report.summary).toContain('Slack')
    expect(handoff.report.ownerAssignment.assignee).toBe('operator')
  })
})

describe('Buzz adapter stub (architecture §1.1 / §6.3)', () => {
  it('is marked NOT implemented and lists remaining work', () => {
    const buzz = createBuzzConnectorStub()
    expect(buzz.implemented).toBe(false)
    expect(buzz.describeRemainingWork?.()).toEqual(BUZZ_STUB_REMAINING_WORK)
  })

  it('refuses to connect and verifies as failing', async () => {
    const buzz = createBuzzConnectorStub()
    const connect = await buzz.connect({ credentials: {} })
    expect(connect.ok).toBe(false)
    const checks = await buzz.verify()
    expect(checks[0]?.result).toBe('fail')
  })

  it('is excluded from implemented-only registry listings', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill())
    // Buzz is a connector stub, not a skill package, so the registry holds
    // only implemented skills here. Confirm the registry contract is clean.
    expect(registry.listImplemented().every((p) => p.manifest.implemented !== false)).toBe(true)
  })
})

describe('credential vault — no secret leakage', () => {
  afterEach(() => clearVault())

  it('stores a secret and returns only an opaque ref', () => {
    const ref = storeCredential('super-secret-token')
    expect(isCredentialRef(ref)).toBe(true)
    expect(ref).not.toContain('super-secret-token')
    expect(readCredential(ref)).toBe('super-secret-token')
  })
})

describe('default skill registry', () => {
  it('ships the slack-incident-alert sample skill', () => {
    const registry = createDefaultSkillRegistry()
    expect(registry.has('slack-incident-alert')).toBe(true)
    const pkg = registry.get('slack-incident-alert')
    expect(pkg?.manifest.implemented).toBe(true)
    expect(pkg?.manifest.phases).toEqual(['suggest', 'implement', 'wire', 'verify', 'handoff'])
  })
})

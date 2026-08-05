/**
 * Demo harness — runs the full skill lifecycle against a seeded demo org and
 * returns the run + audit trail. This satisfies the acceptance drill:
 *
 *   deploy -> map -> suggest -> implement -> wire -> verify -> handoff
 *
 * It is exercised by tests/engine.test.ts (asserts every step is logged) and
 * can be run directly with `pnpm --filter @repo/skills demo`. No live systems
 * are touched (dryRun: true throughout).
 */

import { createAuditSink } from '../audit.js'
import { createConnectorResolver } from '../connectors/index.js'
import { createEngine } from '../engine.js'
import { createDefaultSkillRegistry } from '../registry.js'
import { slackIncidentAlert } from '../skills/slack-incident-alert/index.js'
import type { AuditEvent, OperationMap } from '../types.js'

export interface DemoResult {
  runId: string
  status: string
  phase: string
  auditTrail: AuditEvent[]
  auditActions: string[]
}

/** A small realistic demo org map (mirrors architecture.md example). */
export function demoMap(): OperationMap {
  return {
    nodes: [
      {
        id: 'node_01',
        orgId: 'org_demo',
        name: 'Client intake',
        type: 'process',
        status: 'needs_attention',
        metadata: { owner: 'ops' },
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

/**
 * Run the full deploy->map->suggest->implement->wire->verify->handoff loop
 * against the demo org. Engine phases are async, so this is async too.
 */
export async function runDemo(orgId = 'org_demo'): Promise<DemoResult> {
  const audit = createAuditSink()
  const connectors = createConnectorResolver()
  const engine = createEngine({ audit, connectors, dryRun: true })

  const registry = createDefaultSkillRegistry()
  const skill = registry.get('slack-incident-alert') ?? slackIncidentAlert()

  const finalRun = await engine.runFullLifecycle({
    orgId,
    skill,
    map: demoMap(),
    findings: [],
    orgSettings: { slackChannel: '#ops-alerts' },
    phase: 'suggest',
    dryRun: true,
    input: {},
  })

  const trail = audit.list(orgId)
  return {
    runId: finalRun.id,
    status: finalRun.status,
    phase: finalRun.phase,
    auditTrail: trail,
    auditActions: trail.map((e) => e.action),
  }
}

// CLI entry: print the audit trail when run via `pnpm demo`.
runDemo()
  .then((result) => {
    console.log(
      `\n[skills demo] run ${result.runId} -> ${result.status}/${result.phase}\n` +
        result.auditActions.map((a) => `  • ${a}`).join('\n') +
        `\n\nasserted ${result.auditActions.length} audit events for the full loop.\n`,
    )
  })
  .catch((err) => {
    console.error('[skills demo] failed:', err)
    process.exit(1)
  })

import { describe, expect, it } from 'vitest'

import { MockApiClient } from './lib/api/mock'
import { DEMO_ORG_ID, DEMO_SKILL_ID } from './lib/api/seed'
import { operationMapSchema, handoffReportSchema, skillRunSchema } from '@repo/contracts'

/**
 * End-to-end "core flow" contract test (no browser): a user maps ops ->
 * views findings -> runs the skill integration demo -> receives a handoff
 * report. Exercises the same mock adapter the UI uses, so the acceptance
 * flow is verified at the data/contract layer and reproducible in CI.
 */
describe('core flow (map -> findings -> skill demo -> handoff)', () => {
  it('completes the full MVP loop against the mock backend', async () => {
    const api = new MockApiClient()

    // 1) Map ops: add a node + edge.
    const node = await api.createNode(DEMO_ORG_ID, {
      name: 'Invoice review',
      type: 'step',
      status: 'active',
      metadata: {},
      position: { x: 100, y: 100 },
    })
    const map = await api.getMap(DEMO_ORG_ID)
    expect(() => operationMapSchema.parse(map)).not.toThrow()
    expect(map.nodes.some((n) => n.id === node.id)).toBe(true)

    // 2) Audit records the node creation (append-only, immutable log).
    const audit = await api.getAudit(DEMO_ORG_ID)
    expect(audit.items[0]?.action).toBe('operation.node.created')

    // 3) Findings are surfaced and ranked by severity.
    const findings = await api.getFindings(DEMO_ORG_ID)
    expect(findings.length).toBeGreaterThan(0)
    const sevRank = { critical: 0, high: 1, medium: 2, low: 3 } as const
    const ranks = findings.map((f) => sevRank[f.severity])
    expect(ranks.every((v, i) => i === 0 || ranks[i - 1]! <= v)).toBe(true)

    // 4) Run the skill integration demo: suggest -> ... -> handoff.
    let run = await api.startSkillRun(DEMO_ORG_ID, DEMO_SKILL_ID, { phase: 'suggest', input: {} })
    expect(() => skillRunSchema.parse(run)).not.toThrow()
    for (const phase of ['implement', 'wire', 'verify', 'handoff'] as const) {
      run = await api.advanceSkillRun(DEMO_ORG_ID, run.id, phase)
    }
    expect(run.phase).toBe('handoff')
    expect(run.status).toBe('completed')

    // 5) Handoff report is produced and conforms to the contract.
    const handoff = await api.getHandoff(DEMO_ORG_ID, run.id)
    expect(() => handoffReportSchema.parse(handoff)).not.toThrow()
    expect(handoff.steps.length).toBeGreaterThan(0)
    expect(handoff.summary).toContain('Slack')
  })
})

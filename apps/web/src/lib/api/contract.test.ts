import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  auditPageSchema,
  connectorSchema,
  findingSchema,
  handoffReportSchema,
  membershipSchema,
  operationEdgeSchema,
  operationMapSchema,
  operationNodeSchema,
  organizationSchema,
  skillRunSchema,
  skillSchema,
  userSchema,
  apiErrorSchema,
} from '@repo/contracts'

import { MockApiClient } from './mock'
import { DEMO_ORG_ID, DEMO_SKILL_ID } from './seed'

/**
 * Contract tests.
 *
 * Acceptance criterion: "the API adapter has contract tests". These validate that
 * the mock adapter (the frontend's default backend) returns payloads that conform
 * to the shared Zod schemas in `@repo/contracts`. A real backend implementing the
 * same schemas can be swapped in (VITE_API_MODE=http) with no UI change.
 */
function freshClient(): MockApiClient {
  return new MockApiClient()
}

describe('ApiClient contract (mock adapter)', () => {
  it('register / login / me conform to auth schemas', async () => {
    const api = freshClient()
    const reg = await api.register({ email: 'a@b.com', password: 'Str0ng!Pass', name: 'A B' })
    expect(() =>
      z.object({ user: userSchema, accessToken: z.string(), expiresIn: z.number() }).parse(reg)
    ).not.toThrow()

    const login = await api.login({ email: 'dale@example.com', password: 'x' })
    expect(() => userSchema.parse(login.user)).not.toThrow()

    const me = await api.me(login.accessToken)
    expect(() => userSchema.parse(me.user)).not.toThrow()
    expect(me.memberships.every((m) => membershipSchema.safeParse(m).success)).toBe(true)
  })

  it('org CRUD conforms to organization schema', async () => {
    const api = freshClient()
    const org = await api.getOrg(DEMO_ORG_ID)
    expect(() => organizationSchema.parse(org)).not.toThrow()

    const created = await api.createOrg({ name: 'Acme', industry: 'retail' })
    expect(() => organizationSchema.parse(created)).not.toThrow()

    // Patching the newly created org (createOrg replaces the demo org in mock state).
    const patched = await api.updateOrg(created.id, { name: 'Acme Renamed' })
    expect(patched.name).toBe('Acme Renamed')
    expect(() => organizationSchema.parse(patched)).not.toThrow()

    const members = await api.listMembers(created.id)
    expect(members.every((m) => membershipSchema.safeParse(m).success)).toBe(true)
  })

  it('operations map + node/edge CRUD conform to map schemas', async () => {
    const api = freshClient()
    const map = await api.getMap(DEMO_ORG_ID)
    expect(() => operationMapSchema.parse(map)).not.toThrow()

    const node = await api.createNode(DEMO_ORG_ID, {
      name: 'New step',
      type: 'step',
      status: 'active',
      metadata: {},
      position: { x: 10, y: 10 },
    })
    expect(() => operationNodeSchema.parse(node)).not.toThrow()

    const updated = await api.updateNode(DEMO_ORG_ID, node.id, { status: 'paused' })
    expect(updated.status).toBe('paused')

    const edge = await api.createEdge(DEMO_ORG_ID, {
      source: node.id,
      target: DEMO_ORG_ID,
      label: 'writes to',
      type: 'data_flow',
    })
    expect(() => operationEdgeSchema.parse(edge)).not.toThrow()
  })

  it('audit log conforms to audit page schema (append-only growth)', async () => {
    const api = freshClient()
    const before = await api.getAudit(DEMO_ORG_ID)
    expect(() => auditPageSchema.parse(before)).not.toThrow()

    await api.createNode(DEMO_ORG_ID, {
      name: 'Another',
      type: 'tool',
      status: 'active',
      metadata: {},
      position: { x: 1, y: 1 },
    })
    const after = await api.getAudit(DEMO_ORG_ID)
    expect(after.items.length).toBeGreaterThan(before.items.length)
    expect(after.items[0]?.action).toBe('operation.node.created')
    expect(() => auditPageSchema.parse(after)).not.toThrow()
  })

  it('findings are returned sorted by severity and conform to schema', async () => {
    const api = freshClient()
    const findings = await api.getFindings(DEMO_ORG_ID)
    expect(findings.every((f) => findingSchema.safeParse(f).success)).toBe(true)
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const
    const sev = findings.map((f) => order[f.severity])
    expect(sev.every((v, i) => i === 0 || (sev[i - 1] ?? 0) <= v)).toBe(true)

    const updated = await api.updateFindingStatus(DEMO_ORG_ID, findings[0]!.id, 'resolved')
    expect(updated.status).toBe('resolved')
  })

  it('skill run lifecycle (suggest -> handoff) conforms to schemas and logs audit', async () => {
    const api = freshClient()
    const skills = await api.listSkills(DEMO_ORG_ID)
    expect(skills.every((s) => skillSchema.safeParse(s).success)).toBe(true)

    const run = await api.startSkillRun(DEMO_ORG_ID, DEMO_SKILL_ID, { phase: 'suggest', input: {} })
    expect(() => skillRunSchema.parse(run)).not.toThrow()
    expect(run.phase).toBe('suggest')
    expect(Array.isArray(run.output?.['steps'])).toBe(true)

    const implemented = await api.advanceSkillRun(DEMO_ORG_ID, run.id, 'implement')
    expect(implemented.phase).toBe('implement')

    const wired = await api.advanceSkillRun(DEMO_ORG_ID, run.id, 'wire')
    expect(wired.phase).toBe('wire')

    const verified = await api.advanceSkillRun(DEMO_ORG_ID, run.id, 'verify')
    expect(verified.phase).toBe('verify')
    expect(Array.isArray(verified.output?.['verification'])).toBe(true)

    const handedOff = await api.advanceSkillRun(DEMO_ORG_ID, run.id, 'handoff')
    expect(handedOff.phase).toBe('handoff')
    expect(() => skillRunSchema.parse(handedOff)).not.toThrow()

    const handoff = await api.getHandoff(DEMO_ORG_ID, run.id)
    expect(() => handoffReportSchema.parse(handoff)).not.toThrow()
    expect(handoff.summary).toContain('Slack')
    expect(handoff.steps.length).toBeGreaterThan(0)
  })

  it('connectors conform to connector schema; buzz stub marked not implemented', async () => {
    const api = freshClient()
    const connectors = await api.listConnectors(DEMO_ORG_ID)
    expect(connectors.every((c) => connectorSchema.safeParse(c).success)).toBe(true)
    expect(connectors.find((c) => c.kind === 'buzz')?.implemented).toBe(false)

    const added = await api.addConnector(DEMO_ORG_ID, {
      kind: 'gmail',
      displayName: 'Gmail',
      config: {},
    })
    expect(() => connectorSchema.parse(added)).not.toThrow()
  })

  it('well-formed API errors parse as RFC 7807 problem details', async () => {
    const problem = {
      error: 'not_found',
      message: 'Run missing',
      status: 404,
      details: { runId: 'x' },
    }
    expect(() => apiErrorSchema.parse(problem)).not.toThrow()
  })
})

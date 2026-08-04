import { describe, expect, it } from 'vitest'

import {
  auditEventSchema,
  createNodeRequestSchema,
  loginRequestSchema,
  operationMapSchema,
  operationNodeSchema,
  registerRequestSchema,
  skillRunSchema,
} from './index.js'

describe('contracts', () => {
  it('parses a register request', () => {
    const parsed = registerRequestSchema.parse({
      email: 'dale@example.com',
      password: 'Str0ng!Pass',
      name: 'Dale Rutherford',
    })
    expect(parsed.email).toBe('dale@example.com')
  })

  it('rejects a weak password', () => {
    expect(() =>
      registerRequestSchema.parse({ email: 'dale@example.com', password: 'short', name: 'Dale' })
    ).toThrow()
  })

  it('parses a login request', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })

  it('enforces operation-type enum on create node', () => {
    expect(
      createNodeRequestSchema.safeParse({
        name: 'Client intake',
        type: 'bogus',
        status: 'active',
        position: { x: 120, y: 80 },
      }).success
    ).toBe(false)
    expect(
      createNodeRequestSchema.safeParse({
        name: 'Client intake',
        type: 'process',
        position: { x: 120, y: 80 },
      }).success
    ).toBe(true)
  })

  it('round-trips an operation node through the map schema', () => {
    const node = operationNodeSchema.parse({
      id: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567890',
      orgId: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567891',
      name: 'CRM sync',
      type: 'tool',
      position: { x: 0, y: 0 },
      createdAt: '2026-08-04T16:40:01Z',
    })
    const map = operationMapSchema.parse({ nodes: [node], edges: [] })
    expect(map.nodes).toHaveLength(1)
    expect(map.nodes[0]?.status).toBe('active')
  })

  it('parses an audit event with default severity', () => {
    const evt = auditEventSchema.parse({
      id: 1,
      orgId: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567890',
      actorType: 'system',
      action: 'operation.node.created',
      createdAt: '2026-08-04T16:40:01Z',
    })
    expect(evt.severity).toBe('info')
  })

  it('parses a skill run with default dry-run true', () => {
    const run = skillRunSchema.parse({
      id: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567890',
      orgId: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567891',
      skillId: '9b8a4e6e-5e84-4f4e-8a1b-3b1234567892',
      phase: 'suggest',
      status: 'pending',
      createdAt: '2026-08-04T16:40:01Z',
      updatedAt: '2026-08-04T16:40:01Z',
    })
    expect(run.dryRun).toBe(true)
    expect(run.input).toEqual({})
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  authHeader,
  createOrg,
  makeApp,
  registerUser,
  resetDb,
  type TestContext,
} from '../test/helpers.js'

describe('operation map (nodes, edges, graph payload)', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await makeApp()
  })
  afterAll(async () => {
    await ctx.app.close()
  })
  beforeEach(async () => {
    await resetDb(ctx.prisma)
  })

  async function ownerWithOrg() {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    return { ...owner, orgId }
  }

  it('creates a node and writes an audit event', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: {
        name: 'Client intake',
        type: 'process',
        status: 'active',
        position: { x: 120, y: 80 },
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.name).toBe('Client intake')
    expect(body.orgId).toBe(orgId)
    expect(body.position).toEqual({ x: 120, y: 80 })

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'operation.node.created' },
    })
    expect(audit).toBeTruthy()
    expect(audit?.targetId).toBe(body.id)
  })

  it('lists nodes for the org', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'Node A', type: 'step', position: { x: 0, y: 0 } },
    })
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].name).toBe('Node A')
  })

  it('patches a node and writes an audit event', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'Client intake', type: 'process', position: { x: 1, y: 1 } },
    })
    const nodeId = created.json().id

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/operations/${nodeId}`,
      headers: authHeader(accessToken),
      payload: { status: 'needs_attention' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('needs_attention')
    expect(res.json().name).toBe('Client intake')

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'operation.node.updated', targetId: nodeId },
    })
    expect(audit).toBeTruthy()
  })

  it('returns 404 patching a node from another org', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken, 'Org A')
    const other = await createOrg(ctx.app, owner.accessToken, 'Org B')

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${other.orgId}/operations/00000000-0000-4000-8000-000000000000`,
      headers: authHeader(owner.accessToken),
      payload: { name: 'x' },
    })
    expect(res.statusCode).toBe(404)
    expect(orgId).toBeTruthy()
  })

  it('creates an edge between two nodes and writes an audit event', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const a = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'Client intake', type: 'process', position: { x: 0, y: 0 } },
    })
    const b = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'CRM', type: 'tool', position: { x: 10, y: 10 } },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(accessToken),
      payload: {
        source: a.json().id,
        target: b.json().id,
        label: 'writes to',
        type: 'data_flow',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.source).toBe(a.json().id)
    expect(body.target).toBe(b.json().id)
    expect(body.type).toBe('data_flow')

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'edge.created' },
    })
    expect(audit?.context as Record<string, unknown>).toMatchObject({ source: a.json().id })
  })

  it('rejects edges referencing nodes outside the org (400)', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(accessToken),
      payload: {
        source: '00000000-0000-4000-8000-000000000000',
        target: '00000000-0000-4000-8000-000000000001',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_reference')
  })

  it('rejects duplicate edges with 409', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const a = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'A', type: 'step', position: { x: 0, y: 0 } },
    })
    const b = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'B', type: 'step', position: { x: 1, y: 1 } },
    })
    const payload = { source: a.json().id, target: b.json().id, type: 'handoff' }
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(accessToken),
      payload,
    })
    const dup = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(accessToken),
      payload,
    })
    expect(dup.statusCode).toBe(409)
  })

  it('returns the full map payload (nodes + edges) for React Flow', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const a = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'Client intake', type: 'process', position: { x: 120, y: 80 } },
    })
    const b = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'CRM: HubSpot', type: 'tool', position: { x: 360, y: 80 } },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(accessToken),
      payload: { source: a.json().id, target: b.json().id, label: 'writes to', type: 'data_flow' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/map`,
      headers: authHeader(accessToken),
    })
    expect(res.statusCode).toBe(200)
    const map = res.json()
    expect(map.nodes).toHaveLength(2)
    expect(map.edges).toHaveLength(1)
    expect(map.edges[0]).toMatchObject({ source: a.json().id, target: b.json().id })
  })

  it('deletes a node (cascading its edges) and writes an audit event', async () => {
    const { accessToken, orgId } = await ownerWithOrg()
    const a = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'A', type: 'step', position: { x: 0, y: 0 } },
    })
    const b = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(accessToken),
      payload: { name: 'B', type: 'step', position: { x: 1, y: 1 } },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(accessToken),
      payload: { source: a.json().id, target: b.json().id, type: 'handoff' },
    })

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgId}/operations/${a.json().id}`,
      headers: authHeader(accessToken),
    })
    expect(del.statusCode).toBe(204)

    const edgeCount = await ctx.prisma.operationEdge.count({ where: { orgId } })
    expect(edgeCount).toBe(0)

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'operation.node.deleted' },
    })
    expect(audit).toBeTruthy()
  })

  it('lets auditors read the map but blocks writes (403)', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    const auditor = await registerUser(ctx.app, 'alex@example.com', 'Alex')
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'alex@example.com', role: 'auditor' },
    })

    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/map`,
      headers: authHeader(auditor.accessToken),
    })
    expect(read.statusCode).toBe(200)

    const write = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(auditor.accessToken),
      payload: { name: 'Nope', type: 'step', position: { x: 0, y: 0 } },
    })
    expect(write.statusCode).toBe(403)
    expect(write.json().error).toBe('forbidden')
  })
})

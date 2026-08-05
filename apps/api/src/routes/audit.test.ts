import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  authHeader,
  createOrg,
  makeApp,
  registerUser,
  resetDb,
  type TestContext,
} from '../test/helpers.js'

describe('audit log (append-only)', () => {
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

  async function orgWithTraffic() {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    // one node + one edge = two more audit events on top of org.created
    const node = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(owner.accessToken),
      payload: { name: 'Client intake', type: 'process', position: { x: 0, y: 0 } },
    })
    const nodeId = node.json().id
    const node2 = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/operations`,
      headers: authHeader(owner.accessToken),
      payload: { name: 'CRM', type: 'tool', position: { x: 1, y: 1 } },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/edges`,
      headers: authHeader(owner.accessToken),
      payload: { source: nodeId, target: node2.json().id, type: 'data_flow' },
    })
    return { ...owner, orgId }
  }

  it('records every mutating action as an audit event', async () => {
    const { accessToken, orgId } = await orgWithTraffic()
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit`,
      headers: authHeader(accessToken),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const actions = body.items.map((e: { action: string }) => e.action)
    expect(actions).toContain('org.created')
    expect(actions).toContain('operation.node.created')
    expect(actions).toContain('edge.created')
    expect(actions.filter((a: string) => a === 'operation.node.created')).toHaveLength(2)
    expect(body.items[0].context).toBeDefined()
  })

  it('filters by action and actorType', async () => {
    const { accessToken, orgId } = await orgWithTraffic()
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit?action=edge.created&actorType=user`,
      headers: authHeader(accessToken),
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items
    expect(items).toHaveLength(1)
    expect(items[0].action).toBe('edge.created')
    expect(items[0].actorType).toBe('user')
  })

  it('paginates with an opaque keyset cursor', async () => {
    const { accessToken, orgId } = await orgWithTraffic()
    const page1 = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit?limit=2`,
      headers: authHeader(accessToken),
    })
    const body1 = page1.json()
    expect(body1.items).toHaveLength(2)
    expect(body1.nextCursor).toBeTruthy()

    const page2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`,
      headers: authHeader(accessToken),
    })
    const body2 = page2.json()
    expect(body2.items.length).toBeGreaterThan(0)
    // no overlap between pages
    const ids1 = new Set(body1.items.map((e: { id: number }) => e.id))
    for (const e of body2.items as Array<{ id: number }>) {
      expect(ids1.has(e.id)).toBe(false)
    }
    // strictly older rows
    expect(body2.items[0].id).toBeLessThan(body1.items[body1.items.length - 1].id)

    // last page has no cursor
    let cursor = body2.nextCursor
    let guard = 0
    while (cursor && guard < 10) {
      const next = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/orgs/${orgId}/audit?limit=50&cursor=${encodeURIComponent(cursor)}`,
        headers: authHeader(accessToken),
      })
      const nb = next.json()
      if (nb.items.length < 50) expect(nb.nextCursor).toBeNull()
      cursor = nb.nextCursor
      guard += 1
    }
    expect(guard).toBeLessThan(10)
  })

  it('lets auditors read the audit log', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    const auditor = await registerUser(ctx.app, 'alex@example.com', 'Alex')
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'alex@example.com', role: 'auditor' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit`,
      headers: authHeader(auditor.accessToken),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items.length).toBeGreaterThanOrEqual(1)
  })

  it('is append-only: no update/delete endpoints exist', async () => {
    const { accessToken, orgId } = await orgWithTraffic()
    const first = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit?limit=1`,
      headers: authHeader(accessToken),
    })
    const eventId = first.json().items[0].id

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgId}/audit/${eventId}`,
      headers: authHeader(accessToken),
    })
    expect(del.statusCode).toBe(404)

    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/audit/${eventId}`,
      headers: authHeader(accessToken),
      payload: { severity: 'critical' },
    })
    expect(patch.statusCode).toBe(404)

    // and the row is still there, unchanged
    const again = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit?limit=1`,
      headers: authHeader(accessToken),
    })
    expect(again.json().items[0].id).toBe(eventId)
  })

  it('returns 403 for non-members', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    const stranger = await registerUser(ctx.app, 'stranger@example.com', 'Stranger')

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/audit`,
      headers: authHeader(stranger.accessToken),
    })
    expect(res.statusCode).toBe(403)
  })
})

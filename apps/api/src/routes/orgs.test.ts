import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  authHeader,
  createOrg,
  makeApp,
  registerUser,
  resetDb,
  type TestContext,
} from '../test/helpers.js'

describe('organizations', () => {
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

  it('creates an org, makes the creator owner, and writes an audit event', async () => {
    const { accessToken, userId } = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      headers: authHeader(accessToken),
      payload: { name: 'Rutherford Consulting', industry: 'professional-services' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.name).toBe('Rutherford Consulting')
    expect(body.ownerId).toBe(userId)
    expect(body.industry).toBe('professional-services')

    const membership = await ctx.prisma.membership.findFirst({
      where: { userId, orgId: body.id },
    })
    expect(membership?.role).toBe('owner')

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId: body.id, action: 'org.created' },
    })
    expect(audit).toBeTruthy()
    expect(audit?.actorId).toBe(userId)
  })

  it('requires auth to create an org', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      payload: { name: 'No Auth Org' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('lets any member GET the org', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken, 'Rutherford Consulting')

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}`,
      headers: authHeader(owner.accessToken),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Rutherford Consulting')
  })

  it('denies GET to a non-member with 403', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const stranger = await registerUser(ctx.app, 'stranger@example.com', 'Stranger')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}`,
      headers: authHeader(stranger.accessToken),
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden')
  })

  it('lets owner/admin PATCH the org and merges settings', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken, 'Rutherford Consulting')

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}`,
      headers: authHeader(owner.accessToken),
      payload: { name: 'Rutherford Consulting LLC', settings: { billingCycle: 'annual' } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Rutherford Consulting LLC')
    expect(res.json().settings).toEqual({ billingCycle: 'annual' })

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'org.updated' },
    })
    expect(audit).toBeTruthy()
    expect(audit?.context as Record<string, unknown>).toHaveProperty('changes')
  })

  it('denies PATCH to operators (403)', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)

    const operator = await registerUser(ctx.app, 'jamie@example.com', 'Jamie')
    const invited = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'jamie@example.com', role: 'operator' },
    })
    expect(invited.statusCode).toBe(201)

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}`,
      headers: authHeader(operator.accessToken),
      payload: { name: 'Hijacked' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('invites a member by email with a role', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    await registerUser(ctx.app, 'jamie@example.com', 'Jamie')

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'jamie@example.com', role: 'auditor' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.email).toBe('jamie@example.com')
    expect(body.role).toBe('auditor')

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'member.invited' },
    })
    expect(audit?.context as Record<string, unknown>).toMatchObject({
      email: 'jamie@example.com',
      role: 'auditor',
    })
  })

  it('rejects inviting a non-existent email with 404', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'ghost@example.com', role: 'operator' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects inviting with the owner role (400)', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    await registerUser(ctx.app, 'jamie@example.com', 'Jamie')

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'jamie@example.com', role: 'owner' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects duplicate invites with 409', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    await registerUser(ctx.app, 'jamie@example.com', 'Jamie')

    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'jamie@example.com', role: 'operator' },
    })
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'jamie@example.com', role: 'operator' },
    })
    expect(res.statusCode).toBe(409)
  })
})

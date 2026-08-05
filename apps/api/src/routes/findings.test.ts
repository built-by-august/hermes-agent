import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  authHeader,
  createOrg,
  makeApp,
  registerUser,
  resetDb,
  type TestContext,
} from '../test/helpers.js'

describe('findings', () => {
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

  async function ownerWithOrgAndFindings() {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    await ctx.prisma.finding.createMany({
      data: [
        {
          orgId,
          sourceType: 'analysis',
          severity: 'high',
          title: 'Invoicing is manual',
          description: 'Manual entry',
          evidence: { failedSteps: 3 },
        },
        {
          orgId,
          sourceType: 'analysis',
          severity: 'low',
          title: 'No alerting',
          description: 'No alerts',
          evidence: {},
        },
      ],
    })
    return { ...owner, orgId }
  }

  it('lists findings, optionally filtered by severity', async () => {
    const { accessToken, orgId } = await ownerWithOrgAndFindings()

    const all = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/findings`,
      headers: authHeader(accessToken),
    })
    expect(all.statusCode).toBe(200)
    expect(all.json()).toHaveLength(2)

    const high = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/findings?severity=high`,
      headers: authHeader(accessToken),
    })
    expect(high.json()).toHaveLength(1)
    expect(high.json()[0].severity).toBe('high')
    expect(high.json()[0].evidence).toEqual({ failedSteps: 3 })
  })

  it('updates a finding status and writes an audit event', async () => {
    const { accessToken, orgId } = await ownerWithOrgAndFindings()
    const finding = await ctx.prisma.finding.findFirst({ where: { orgId } })

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/findings/${finding!.id}/status`,
      headers: authHeader(accessToken),
      payload: { status: 'acknowledged' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('acknowledged')

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { orgId, action: 'finding.status.updated', targetId: finding!.id },
    })
    expect(audit).toBeTruthy()
    expect(audit?.context as Record<string, unknown>).toMatchObject({ to: 'acknowledged' })
  })

  it('returns 404 for a finding in another org', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken, 'Org A')
    const other = await createOrg(ctx.app, owner.accessToken, 'Org B')

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${other.orgId}/findings/00000000-0000-4000-8000-000000000000/status`,
      headers: authHeader(owner.accessToken),
      payload: { status: 'resolved' },
    })
    expect(res.statusCode).toBe(404)
    expect(orgId).toBeTruthy()
  })

  it('blocks auditors from changing finding status (403)', async () => {
    const owner = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const { orgId } = await createOrg(ctx.app, owner.accessToken)
    const auditor = await registerUser(ctx.app, 'alex@example.com', 'Alex')
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { email: 'alex@example.com', role: 'auditor' },
    })
    const finding = await ctx.prisma.finding.create({
      data: {
        orgId,
        sourceType: 'manual',
        severity: 'medium',
        title: 'Manual finding',
        description: 'Seen by auditor',
        evidence: {},
      },
    })

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/findings/${finding.id}/status`,
      headers: authHeader(auditor.accessToken),
      payload: { status: 'resolved' },
    })
    expect(res.statusCode).toBe(403)
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loginUser, makeApp, resetDb, TEST_DB_URL, type TestContext } from '../test/helpers.js'

/**
 * The demo dataset seed (US-11): importing prisma/seed.ts executes the seed
 * against whatever DATABASE_URL is set — here the isolated test database.
 */
describe('demo seed', () => {
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

  it('seeds a realistic demo org, users, map, findings and audit trail', async () => {
    process.env.DATABASE_URL = TEST_DB_URL
    const { seed } = await import('../seed.js')
    await seed(ctx.prisma)

    const org = await ctx.prisma.organization.findFirst({
      where: { name: 'Rutherford Consulting' },
    })
    expect(org).toBeTruthy()
    expect(org?.industry).toBe('professional-services')

    const memberships = await ctx.prisma.membership.findMany({
      where: { orgId: org!.id },
      include: { user: true },
    })
    const byEmail = Object.fromEntries(memberships.map((m) => [m.user.email, m.role]))
    expect(byEmail).toMatchObject({
      'dale@example.com': 'owner',
      'jamie@example.com': 'operator',
      'alex@example.com': 'auditor',
    })

    const nodes = await ctx.prisma.operationNode.count({ where: { orgId: org!.id } })
    const edges = await ctx.prisma.operationEdge.count({ where: { orgId: org!.id } })
    const findings = await ctx.prisma.finding.count({ where: { orgId: org!.id } })
    const auditEvents = await ctx.prisma.auditEvent.count({ where: { orgId: org!.id } })
    expect(nodes).toBe(9)
    expect(edges).toBe(8)
    expect(findings).toBe(3)
    expect(auditEvents).toBeGreaterThan(20)

    const skill = await ctx.prisma.skill.findUnique({
      where: { slug: 'slack-incident-alert' },
    })
    expect(skill).toBeTruthy()

    // Seeded owner can log in through the API
    const login = await loginUser(ctx.app, 'dale@example.com')
    expect(login.accessToken).toBeTruthy()

    // And the map is retrievable through the API
    const map = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${org!.id}/map`,
      headers: { authorization: `Bearer ${login.accessToken}` },
    })
    expect(map.statusCode).toBe(200)
    expect(map.json().nodes).toHaveLength(9)
    expect(map.json().edges).toHaveLength(8)
  })
})

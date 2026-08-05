import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { makeApp, resetDb, type TestContext } from './test/helpers.js'

describe('api app', () => {
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

  it('serves /health and /api/v1', async () => {
    const t = await ctx.app.inject({ method: 'GET', url: '/health' })
    expect(t.statusCode).toBe(200)
    expect(t.json().status).toBe('ok')

    const root = await ctx.app.inject({ method: 'GET', url: '/api/v1/' })
    expect(root.statusCode).toBe(200)
    expect(root.json().name).toContain('Hermes Agent')
  })

  it('serves the OpenAPI document (Swagger) at /api/v1/docs/json', async () => {
    const t = await ctx.app.inject({ method: 'GET', url: '/api/v1/docs/json' })
    expect(t.statusCode).toBe(200)
    const doc = t.json()
    expect(doc.openapi).toBeDefined()
    expect(doc.info.title).toContain('Hermes Agent')
    // Core contract endpoints are documented
    expect(doc.paths['/auth/register']).toBeDefined()
    expect(doc.paths['/orgs']).toBeDefined()
    expect(doc.paths['/orgs/{orgId}/map']).toBeDefined()
    expect(doc.paths['/orgs/{orgId}/audit']).toBeDefined()
    expect(doc.paths['/orgs/{orgId}/findings']).toBeDefined()
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined()
  })

  it('serves the Swagger UI at /api/v1/docs', async () => {
    const t = await ctx.app.inject({ method: 'GET', url: '/api/v1/docs/' })
    expect(t.statusCode).toBe(200)
    expect(t.body).toContain('swagger-ui')
  })

  it('returns an RFC 7807-shaped 404 for unknown routes', async () => {
    const t = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(t.statusCode).toBe(404)
    expect(t.json()).toEqual({ error: 'not_found', message: 'Route not found', status: 404 })
  })
})

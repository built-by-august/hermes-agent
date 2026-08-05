import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { authHeader, makeApp, registerUser, resetDb, type TestContext } from '../test/helpers.js'

describe('auth', () => {
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

  it('registers a user and returns access + refresh tokens', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'dale@example.com', password: 'Str0ng!Pass', name: 'Dale Rutherford' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe('dale@example.com')
    expect(body.user.name).toBe('Dale Rutherford')
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.expiresIn).toBe(900)
    expect(body.user.passwordHash).toBeUndefined()
  })

  it('rejects duplicate email registration with 409', async () => {
    await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'dale@example.com', password: 'Str0ng!Pass', name: 'Dale Again' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('conflict')
  })

  it('rejects weak passwords with 400', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'dale@example.com', password: 'short', name: 'Dale' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('validation_error')
  })

  it('logs in with valid credentials and rejects bad ones', async () => {
    await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'dale@example.com', password: 'Str0ng!Pass' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().accessToken).toBeTruthy()

    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'dale@example.com', password: 'wrong-password' },
    })
    expect(bad.statusCode).toBe(401)
    expect(bad.json().error).toBe('invalid_credentials')
  })

  it('returns the current user and memberships from /auth/me', async () => {
    const { accessToken, userId } = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const org = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      headers: authHeader(accessToken),
      payload: { name: 'Rutherford Consulting' },
    })
    const orgId = org.json().id

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authHeader(accessToken),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(userId)
    expect(body.memberships).toHaveLength(1)
    expect(body.memberships[0]).toMatchObject({ orgId, orgName: 'Rutherford Consulting', role: 'owner' })
  })

  it('rejects /auth/me without a token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('rotates tokens via /auth/refresh', async () => {
    const { refreshToken, userId } = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(userId)
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
  })

  it('rejects access tokens used as refresh tokens', async () => {
    const { accessToken } = await registerUser(ctx.app, 'dale@example.com', 'Dale')
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: accessToken },
    })
    expect(res.statusCode).toBe(401)
  })
})

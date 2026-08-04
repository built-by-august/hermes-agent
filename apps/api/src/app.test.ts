import { describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

describe('api app', () => {
  it('serves /health and /api/v1', async () => {
    const app = await buildApp()
    const t = await app.inject({ method: 'GET', url: '/health' })
    expect(t.statusCode).toBe(200)
    expect(t.json().status).toBe('ok')

    const root = await app.inject({ method: 'GET', url: '/api/v1/' })
    expect(root.statusCode).toBe(200)
    expect(root.json().name).toContain('Hermes Agent')

    await app.close()
  })
})

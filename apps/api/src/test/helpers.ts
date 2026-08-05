import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'

import { buildApp } from '../app.js'

export const TEST_DB_URL = 'file:./test.db'

export interface TestContext {
  app: FastifyInstance
  prisma: PrismaClient
}

/** Build an app instance against the isolated test database. */
export async function makeApp(): Promise<TestContext> {
  const app = await buildApp({ databaseUrl: TEST_DB_URL })
  return { app, prisma: app.prisma }
}

/** Wipe every table (FK-safe order) between tests. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.handoffReport.deleteMany(),
    prisma.connector.deleteMany(),
    prisma.skillRun.deleteMany(),
    prisma.finding.deleteMany(),
    prisma.operationEdge.deleteMany(),
    prisma.operationNode.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ])
}

export interface RegisterResult {
  userId: string
  accessToken: string
  refreshToken: string
}

export async function registerUser(
  app: FastifyInstance,
  email: string,
  name: string,
  password = 'Str0ng!Pass'
): Promise<RegisterResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, name },
  })
  if (res.statusCode !== 201) {
    throw new Error(`register failed (${res.statusCode}): ${res.body}`)
  }
  const body = res.json() as {
    user: { id: string }
    accessToken: string
    refreshToken: string
  }
  return { userId: body.user.id, accessToken: body.accessToken, refreshToken: body.refreshToken }
}

export async function loginUser(
  app: FastifyInstance,
  email: string,
  password = 'Str0ng!Pass'
): Promise<RegisterResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  })
  if (res.statusCode !== 200) {
    throw new Error(`login failed (${res.statusCode}): ${res.body}`)
  }
  const body = res.json() as {
    user: { id: string }
    accessToken: string
    refreshToken: string
  }
  return { userId: body.user.id, accessToken: body.accessToken, refreshToken: body.refreshToken }
}

export interface CreateOrgResult {
  orgId: string
  body: Record<string, unknown>
}

export async function createOrg(
  app: FastifyInstance,
  accessToken: string,
  name = 'Test Org',
  industry = 'professional-services'
): Promise<CreateOrgResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/orgs',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name, industry },
  })
  if (res.statusCode !== 201) {
    throw new Error(`create org failed (${res.statusCode}): ${res.body}`)
  }
  const body = res.json() as { id: string }
  return { orgId: body.id, body: res.json() as Record<string, unknown> }
}

export function authHeader(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` }
}

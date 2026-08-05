import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import * as C from '@repo/contracts'

import { ApiError } from '../errors.js'
import { s } from '../schemas.js'
import {
  hashPassword,
  issueTokenPair,
  requireAuth,
  verifyPassword,
  verifyRefreshToken,
} from '../auth.js'

export interface AuthRouteDeps {
  prisma: PrismaClient
}

const bearerSecurity = [{ bearerAuth: [] }]

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { prisma } = deps

  app.post(
    '/auth/register',
    {
      schema: {
        body: s(C.registerRequestSchema),
        response: {
          201: s(C.authResponseSchema),
          400: s(C.apiErrorSchema),
          409: s(C.apiErrorSchema),
        },
      },
    },
    async (request, reply) => {
      const body = request.body as C.RegisterRequest
      const existing = await prisma.user.findUnique({ where: { email: body.email } })
      if (existing) {
        throw new ApiError(409, 'conflict', 'A user with this email already exists')
      }
      const passwordHash = await hashPassword(body.password)
      const user = await prisma.user.create({
        data: { email: body.email, passwordHash, name: body.name },
      })
      const tokens = await issueTokenPair(app, user.id)
      reply.code(201)
      return {
        user: { id: user.id, email: user.email, name: user.name },
        ...tokens,
      }
    }
  )

  app.post(
    '/auth/login',
    {
      schema: {
        body: s(C.loginRequestSchema),
        response: {
          200: s(C.authResponseSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
        },
      },
    },
    async (request) => {
      const body = request.body as C.LoginRequest
      const user = await prisma.user.findUnique({ where: { email: body.email } })
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new ApiError(401, 'invalid_credentials', 'Invalid email or password')
      }
      const tokens = await issueTokenPair(app, user.id)
      return {
        user: { id: user.id, email: user.email, name: user.name },
        ...tokens,
      }
    }
  )

  app.post(
    '/auth/refresh',
    {
      schema: {
        body: s(C.refreshRequestSchema),
        response: {
          200: s(C.authResponseSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
        },
      },
    },
    async (request) => {
      const body = request.body as C.RefreshRequest
      const payload = await verifyRefreshToken(app, body.refreshToken)
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) {
        throw new ApiError(401, 'unauthorized', 'User no longer exists')
      }
      const tokens = await issueTokenPair(app, user.id)
      return {
        user: { id: user.id, email: user.email, name: user.name },
        ...tokens,
      }
    }
  )

  app.get(
    '/auth/me',
    {
      preHandler: requireAuth,
      schema: {
        response: {
          200: s(C.authMeResponseSchema),
          401: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const userId = request.authUser!.id
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) throw new ApiError(401, 'unauthorized', 'User no longer exists')

      const memberships = await prisma.membership.findMany({
        where: { userId },
        include: { org: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      })
      return {
        user: { id: user.id, email: user.email, name: user.name },
        memberships: memberships.map((m) => ({
          orgId: m.org.id,
          orgName: m.org.name,
          role: m.role,
        })),
      }
    }
  )
}

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
// Side-effect import so @fastify/jwt's module augmentation types app.jwt /
// request.jwtVerify on FastifyInstance/FastifyRequest.
import '@fastify/jwt'

import { ApiError } from './errors.js'

/* ------------------------------------------------------------------ *
 * Types & constants
 * ------------------------------------------------------------------ */

export interface AuthUser {
  id: string
}

export interface OrgMembership {
  orgId: string
  role: 'owner' | 'admin' | 'operator' | 'auditor'
}

/** Role rank: higher outranks lower. owner > admin > operator > auditor */
export const ROLE_RANK: Record<OrgMembership['role'], number> = {
  auditor: 1,
  operator: 2,
  admin: 3,
  owner: 4,
}

export const ACCESS_TOKEN_TTL_SECONDS = 900 // 15 min
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600 // 7 days

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser
    membership?: OrgMembership
  }
}

/* ------------------------------------------------------------------ *
 * Password hashing
 * ------------------------------------------------------------------ */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/* ------------------------------------------------------------------ *
 * Token issuance / verification (via @fastify/jwt)
 * ------------------------------------------------------------------ */

export interface AccessTokenPayload {
  sub: string
  typ?: 'access'
}

export interface RefreshTokenPayload {
  sub: string
  typ: 'refresh'
}

export async function issueTokenPair(
  app: FastifyInstance,
  userId: string
): Promise<TokenPair> {
  const accessToken = app.jwt.sign({ sub: userId, typ: 'access' } satisfies AccessTokenPayload, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  })
  const refreshToken = app.jwt.sign({ sub: userId, typ: 'refresh' } satisfies RefreshTokenPayload, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  })
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

/** Verify a refresh token; throws ApiError 401 when invalid or not a refresh token. */
export async function verifyRefreshToken(
  app: FastifyInstance,
  token: string
): Promise<RefreshTokenPayload> {
  try {
    const payload = app.jwt.verify<RefreshTokenPayload>(token)
    if (payload.typ !== 'refresh' || !payload.sub) {
      throw new Error('not a refresh token')
    }
    return payload
  } catch {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired refresh token')
  }
}

/* ------------------------------------------------------------------ *
 * Route guards (preHandlers)
 * ------------------------------------------------------------------ */

/** Requires a valid Bearer access token; attaches request.authUser. */
export async function requireAuth(
  this: FastifyInstance,
  request: FastifyRequest
): Promise<void> {
  try {
    const payload = await request.jwtVerify<AccessTokenPayload>()
    if (!payload.sub) throw new Error('missing sub')
    request.authUser = { id: payload.sub }
  } catch {
    throw new ApiError(401, 'unauthorized', 'Missing or invalid access token')
  }
}

/** Requires membership in :orgId; attaches request.membership with the role. */
export function requireMembership(prisma: PrismaClient) {
  return async (request: FastifyRequest): Promise<void> => {
    const params = request.params as { orgId?: string }
    const orgId = params.orgId
    if (!orgId) throw new ApiError(400, 'bad_request', 'Missing orgId path parameter')
    const userId = request.authUser?.id
    if (!userId) throw new ApiError(401, 'unauthorized', 'Missing or invalid access token')

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    })
    if (!membership) {
      throw new ApiError(403, 'forbidden', 'You are not a member of this organization')
    }
    request.membership = { orgId: membership.orgId, role: membership.role }
  }
}

/**
 * Requires the requester's role (from requireMembership) to be at least `min`.
 * auditor is read-only; operator+ can mutate the map & findings;
 * owner/admin can manage the org and its members.
 */
export function requireRole(min: 'auditor' | 'operator' | 'admin' | 'owner') {
  return async (request: FastifyRequest): Promise<void> => {
    const role = request.membership?.role
    if (!role || ROLE_RANK[role] < ROLE_RANK[min]) {
      throw new ApiError(403, 'forbidden', `Requires the "${min}" role or higher`)
    }
  }
}

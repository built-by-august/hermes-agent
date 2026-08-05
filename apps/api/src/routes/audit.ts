import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import * as C from '@repo/contracts'

import { ApiError } from '../errors.js'
import { s } from '../schemas.js'
import { requireAuth, requireMembership } from '../auth.js'

export interface AuditRouteDeps {
  prisma: PrismaClient
}

const bearerSecurity = [{ bearerAuth: [] }]

/** Encode/decode the opaque keyset cursor (base64url of the last seen audit id). */
function encodeCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64url')
}

function decodeCursor(cursor: string): number {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8')
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'bad_request', 'Invalid cursor')
  }
  return id
}

/**
 * GET /orgs/:orgId/audit — append-only audit log (read-only, any member).
 * Keyset pagination on the autoincrement id (desc), filters by action/actorType/severity.
 */
export function registerAuditRoutes(app: FastifyInstance, deps: AuditRouteDeps): void {
  const { prisma } = deps

  app.get(
    '/orgs/:orgId/audit',
    {
      preHandler: [requireAuth, requireMembership(prisma)],
      schema: {
        params: s(C.orgParamsSchema),
        querystring: s(C.auditQuerySchema),
        response: {
          200: s(C.auditPageSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const query = request.query as C.AuditQuery
      const limit = query.limit ?? 50
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined

      const events = await prisma.auditEvent.findMany({
        where: {
          orgId,
          ...(cursor ? { id: { lt: cursor } } : {}),
          ...(query.action ? { action: query.action } : {}),
          ...(query.actorType ? { actorType: query.actorType } : {}),
          ...(query.severity ? { severity: query.severity } : {}),
        },
        orderBy: { id: 'desc' },
        take: limit + 1, // one extra row tells us whether more pages exist
      })

      const hasMore = events.length > limit
      const page = hasMore ? events.slice(0, limit) : events
      const last = page[page.length - 1]

      return {
        items: page.map((e) => ({
          id: e.id,
          orgId: e.orgId,
          actorId: e.actorId,
          actorType: e.actorType,
          action: e.action,
          targetType: e.targetType ?? undefined,
          targetId: e.targetId ?? undefined,
          context: e.context as Record<string, unknown>,
          severity: e.severity,
          result: e.result ?? undefined,
          createdAt: e.createdAt.toISOString(),
        })),
        nextCursor: hasMore && last ? encodeCursor(last.id) : null,
      }
    }
  )
}

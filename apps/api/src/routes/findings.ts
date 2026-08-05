import type { FastifyInstance } from 'fastify'
import type { PrismaClient, Finding } from '@prisma/client'
import * as C from '@repo/contracts'
import { z } from 'zod'

import { ApiError } from '../errors.js'
import { s } from '../schemas.js'
import { appendAudit } from '../audit.js'
import { requireAuth, requireMembership, requireRole } from '../auth.js'

export interface FindingsRouteDeps {
  prisma: PrismaClient
}

const bearerSecurity = [{ bearerAuth: [] }]

function toFindingResponse(finding: Finding): C.Finding {
  return {
    id: finding.id,
    orgId: finding.orgId,
    sourceType: finding.sourceType,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    evidence: finding.evidence as Record<string, unknown>,
    status: finding.status,
    suggestedSkillId: finding.suggestedSkillId ?? undefined,
    createdAt: finding.createdAt.toISOString(),
  }
}

export function registerFindingsRoutes(app: FastifyInstance, deps: FindingsRouteDeps): void {
  const { prisma } = deps

  // GET /orgs/:orgId/findings — list findings, filter by severity/status/source (any member)
  app.get(
    '/orgs/:orgId/findings',
    {
      preHandler: [requireAuth, requireMembership(prisma)],
      schema: {
        params: s(C.orgParamsSchema),
        querystring: s(C.findingsQuerySchema),
        response: {
          200: s(z.array(C.findingSchema)),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const query = request.query as C.FindingsQuery

      const findings = await prisma.finding.findMany({
        where: {
          orgId,
          ...(query.severity ? { severity: query.severity } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.sourceType ? { sourceType: query.sourceType } : {}),
        },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      })
      return findings.map(toFindingResponse)
    }
  )

  // PATCH /orgs/:orgId/findings/:id/status — acknowledge/resolve (operator+; auditor read-only)
  app.patch(
    '/orgs/:orgId/findings/:id/status',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('operator')],
      schema: {
        body: s(C.findingStatusUpdateRequestSchema),
        params: s(C.resourceParamsSchema),
        response: {
          200: s(C.findingSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
          404: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId, id } = request.params as C.ResourceParams
      const body = request.body as C.FindingStatusUpdateRequest
      const actorId = request.authUser!.id

      const existing = await prisma.finding.findFirst({ where: { id, orgId } })
      if (!existing) {
        throw new ApiError(404, 'not_found', 'Finding not found in this organization')
      }

      const finding = await prisma.finding.update({
        where: { id },
        data: { status: body.status },
      })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'finding.status.updated',
        targetType: 'Finding',
        targetId: id,
        context: { from: existing.status, to: body.status },
      })

      return toFindingResponse(finding)
    }
  )
}

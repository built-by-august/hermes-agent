import type { FastifyInstance } from 'fastify'
import type { PrismaClient, Organization } from '@prisma/client'
import * as C from '@repo/contracts'
import type { Prisma } from '@prisma/client'

import { ApiError } from '../errors.js'
import { s } from '../schemas.js'
import { appendAudit } from '../audit.js'
import { requireAuth, requireMembership, requireRole, type OrgMembership } from '../auth.js'

export interface OrgRouteDeps {
  prisma: PrismaClient
}

const bearerSecurity = [{ bearerAuth: [] }]

function toOrgResponse(org: Organization): C.Organization {
  return {
    id: org.id,
    name: org.name,
    industry: org.industry ?? undefined,
    settings: org.settings as Record<string, unknown>,
    ownerId: org.ownerId,
    createdAt: org.createdAt.toISOString(),
  }
}

export function registerOrgRoutes(app: FastifyInstance, deps: OrgRouteDeps): void {
  const { prisma } = deps

  // POST /orgs — create an organization (creator becomes owner)
  app.post(
    '/orgs',
    {
      preHandler: requireAuth,
      schema: {
        body: s(C.createOrganizationRequestSchema),
        response: {
          201: s(C.organizationSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request, reply) => {
      const body = request.body as C.CreateOrganizationRequest
      const actorId = request.authUser!.id

      const org = await prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            name: body.name,
            industry: body.industry ?? null,
            settings: (body.settings ?? {}) as Prisma.InputJsonValue,
            ownerId: actorId,
          },
        })
        await tx.membership.create({
          data: { orgId: created.id, userId: actorId, role: 'owner' },
        })
        await appendAudit(tx, {
          orgId: created.id,
          actorId,
          actorType: 'user',
          action: 'org.created',
          targetType: 'Organization',
          targetId: created.id,
          context: { name: created.name, industry: created.industry ?? undefined },
        })
        return created
      })

      reply.code(201)
      return toOrgResponse(org)
    }
  )

  // GET /orgs/:orgId — any member
  app.get(
    '/orgs/:orgId',
    {
      preHandler: [requireAuth, requireMembership(prisma)],
      schema: {
        params: s(C.orgParamsSchema),
        response: {
          200: s(C.organizationSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const org = await prisma.organization.findUnique({ where: { id: orgId } })
      if (!org) throw new ApiError(404, 'not_found', 'Organization not found')
      return toOrgResponse(org)
    }
  )

  // PATCH /orgs/:orgId — owner/admin only
  app.patch(
    '/orgs/:orgId',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('admin')],
      schema: {
        body: s(C.updateOrganizationRequestSchema),
        params: s(C.orgParamsSchema),
        response: {
          200: s(C.organizationSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const body = request.body as C.UpdateOrganizationRequest
      const actorId = request.authUser!.id
      const membership = request.membership as OrgMembership

      const existing = await prisma.organization.findUnique({ where: { id: orgId } })
      if (!existing) throw new ApiError(404, 'not_found', 'Organization not found')

      const settings = body.settings
        ? { ...(existing.settings as Record<string, unknown>), ...body.settings }
        : undefined

      const org = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.industry !== undefined ? { industry: body.industry } : {}),
          ...(settings !== undefined ? { settings: settings as Prisma.InputJsonValue } : {}),
        },
      })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'org.updated',
        targetType: 'Organization',
        targetId: orgId,
        context: {
          changes: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.industry !== undefined ? { industry: body.industry } : {}),
            ...(body.settings !== undefined ? { settings: body.settings } : {}),
          },
          byRole: membership.role,
        },
      })

      return toOrgResponse(org)
    }
  )

  // POST /orgs/:orgId/members — invite an existing user (owner/admin)
  app.post(
    '/orgs/:orgId/members',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('admin')],
      schema: {
        body: s(C.inviteMemberRequestSchema),
        params: s(C.orgParamsSchema),
        response: {
          201: s(C.memberSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
          404: s(C.apiErrorSchema),
          409: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request, reply) => {
      const { orgId } = request.params as { orgId: string }
      const body = request.body as C.InviteMemberRequest
      const actorId = request.authUser!.id

      if (body.role === 'owner') {
        throw new ApiError(400, 'bad_request', 'The owner role cannot be granted via invite')
      }

      const target = await prisma.user.findUnique({ where: { email: body.email } })
      if (!target) {
        throw new ApiError(
          404,
          'not_found',
          `No user exists with email ${body.email}. Invites target existing accounts.`
        )
      }

      const existing = await prisma.membership.findUnique({
        where: { orgId_userId: { orgId, userId: target.id } },
      })
      if (existing) {
        throw new ApiError(409, 'conflict', 'User is already a member of this organization')
      }

      const membership = await prisma.membership.create({
        data: { orgId, userId: target.id, role: body.role },
      })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'member.invited',
        targetType: 'User',
        targetId: target.id,
        context: { email: target.email, role: body.role },
      })

      reply.code(201)
      return {
        id: membership.id,
        userId: target.id,
        email: target.email,
        name: target.name,
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
      }
    }
  )
}

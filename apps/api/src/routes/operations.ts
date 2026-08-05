import type { FastifyInstance } from 'fastify'
import type { PrismaClient, OperationNode, OperationEdge } from '@prisma/client'
import * as C from '@repo/contracts'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'

import { ApiError } from '../errors.js'
import { s } from '../schemas.js'
import { appendAudit } from '../audit.js'
import { requireAuth, requireMembership, requireRole } from '../auth.js'

export interface OperationsRouteDeps {
  prisma: PrismaClient
}

const bearerSecurity = [{ bearerAuth: [] }]

function toNodeResponse(node: OperationNode): C.OperationNode {
  return {
    id: node.id,
    orgId: node.orgId,
    name: node.name,
    type: node.type,
    status: node.status,
    metadata: node.metadata as Record<string, unknown>,
    position: node.position as C.Position,
    createdAt: node.createdAt.toISOString(),
  }
}

function toEdgeResponse(edge: OperationEdge): C.OperationEdge {
  return {
    id: edge.id,
    orgId: edge.orgId,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? undefined,
    type: edge.type,
  }
}

export function registerOperationsRoutes(app: FastifyInstance, deps: OperationsRouteDeps): void {
  const { prisma } = deps

  /* ------------------------------------------------------------------ *
   * Nodes
   * ------------------------------------------------------------------ */

  // POST /orgs/:orgId/operations — create a node (operator+)
  app.post(
    '/orgs/:orgId/operations',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('operator')],
      schema: {
        body: s(C.createNodeRequestSchema),
        params: s(C.orgParamsSchema),
        response: {
          201: s(C.operationNodeSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request, reply) => {
      const { orgId } = request.params as C.OrgParams
      const body = request.body as C.CreateNodeRequest
      const actorId = request.authUser!.id

      const node = await prisma.operationNode.create({
        data: {
          orgId,
          name: body.name,
          type: body.type,
          status: body.status,
          metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
          position: body.position as unknown as Prisma.InputJsonValue,
        },
      })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'operation.node.created',
        targetType: 'OperationNode',
        targetId: node.id,
        context: { name: node.name, type: node.type },
      })

      reply.code(201)
      return toNodeResponse(node)
    }
  )

  // GET /orgs/:orgId/operations — list nodes (any member)
  app.get(
    '/orgs/:orgId/operations',
    {
      preHandler: [requireAuth, requireMembership(prisma)],
      schema: {
        params: s(C.orgParamsSchema),
        response: {
          200: s(z.array(C.operationNodeSchema)),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const nodes = await prisma.operationNode.findMany({
        where: { orgId },
        orderBy: { createdAt: 'asc' },
      })
      return nodes.map(toNodeResponse)
    }
  )

  // PATCH /orgs/:orgId/operations/:id — update a node (operator+)
  app.patch(
    '/orgs/:orgId/operations/:id',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('operator')],
      schema: {
        body: s(C.patchNodeRequestSchema),
        params: s(C.resourceParamsSchema),
        response: {
          200: s(C.operationNodeSchema),
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
      const body = request.body as C.PatchNodeRequest
      const actorId = request.authUser!.id

      const existing = await prisma.operationNode.findFirst({ where: { id, orgId } })
      if (!existing) {
        throw new ApiError(404, 'not_found', 'Operation node not found in this organization')
      }

      const node = await prisma.operationNode.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.metadata !== undefined
            ? { metadata: body.metadata as Prisma.InputJsonValue }
            : {}),
          ...(body.position !== undefined
            ? { position: body.position as unknown as Prisma.InputJsonValue }
            : {}),
        },
      })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'operation.node.updated',
        targetType: 'OperationNode',
        targetId: id,
        context: { changes: body },
      })

      return toNodeResponse(node)
    }
  )

  // DELETE /orgs/:orgId/operations/:id — delete a node (operator+); edges cascade
  app.delete(
    '/orgs/:orgId/operations/:id',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('operator')],
      schema: {
        params: s(C.resourceParamsSchema),
        response: {
          204: { type: 'null' },
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
          404: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request, reply) => {
      const { orgId, id } = request.params as C.ResourceParams
      const actorId = request.authUser!.id

      const existing = await prisma.operationNode.findFirst({ where: { id, orgId } })
      if (!existing) {
        throw new ApiError(404, 'not_found', 'Operation node not found in this organization')
      }

      await prisma.operationNode.delete({ where: { id } })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'operation.node.deleted',
        targetType: 'OperationNode',
        targetId: id,
        context: { name: existing.name },
      })

      reply.code(204).send()
    }
  )

  /* ------------------------------------------------------------------ *
   * Edges
   * ------------------------------------------------------------------ */

  // POST /orgs/:orgId/edges — create an edge between two nodes (operator+)
  app.post(
    '/orgs/:orgId/edges',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('operator')],
      schema: {
        body: s(C.createEdgeRequestSchema),
        params: s(C.orgParamsSchema),
        response: {
          201: s(C.operationEdgeSchema),
          400: s(C.apiErrorSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
          409: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request, reply) => {
      const { orgId } = request.params as C.OrgParams
      const body = request.body as C.CreateEdgeRequest
      const actorId = request.authUser!.id

      const source = await prisma.operationNode.findFirst({
        where: { id: body.source, orgId },
      })
      const target = await prisma.operationNode.findFirst({
        where: { id: body.target, orgId },
      })
      if (!source || !target) {
        throw new ApiError(400, 'invalid_reference', 'Both edge endpoints must be nodes of this organization')
      }

      const edge = await prisma.operationEdge.create({
        data: {
          orgId,
          source: body.source,
          target: body.target,
          label: body.label ?? null,
          type: body.type,
        },
      })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'edge.created',
        targetType: 'OperationEdge',
        targetId: edge.id,
        context: { source: body.source, target: body.target, type: edge.type },
      })

      reply.code(201)
      return toEdgeResponse(edge)
    }
  )

  // GET /orgs/:orgId/edges — list edges (any member)
  app.get(
    '/orgs/:orgId/edges',
    {
      preHandler: [requireAuth, requireMembership(prisma)],
      schema: {
        params: s(C.orgParamsSchema),
        response: {
          200: s(z.array(C.operationEdgeSchema)),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const edges = await prisma.operationEdge.findMany({
        where: { orgId },
        orderBy: { createdAt: 'asc' },
      })
      return edges.map(toEdgeResponse)
    }
  )

  // DELETE /orgs/:orgId/edges/:id — delete an edge (operator+)
  app.delete(
    '/orgs/:orgId/edges/:id',
    {
      preHandler: [requireAuth, requireMembership(prisma), requireRole('operator')],
      schema: {
        params: s(C.resourceParamsSchema),
        response: {
          204: { type: 'null' },
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
          404: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request, reply) => {
      const { orgId, id } = request.params as C.ResourceParams
      const actorId = request.authUser!.id

      const existing = await prisma.operationEdge.findFirst({ where: { id, orgId } })
      if (!existing) {
        throw new ApiError(404, 'not_found', 'Edge not found in this organization')
      }

      await prisma.operationEdge.delete({ where: { id } })

      await appendAudit(prisma, {
        orgId,
        actorId,
        actorType: 'user',
        action: 'edge.deleted',
        targetType: 'OperationEdge',
        targetId: id,
        context: { source: existing.source, target: existing.target },
      })

      reply.code(204).send()
    }
  )

  /* ------------------------------------------------------------------ *
   * Map (graph payload for React Flow)
   * ------------------------------------------------------------------ */

  // GET /orgs/:orgId/map — nodes + edges in one payload (any member)
  app.get(
    '/orgs/:orgId/map',
    {
      preHandler: [requireAuth, requireMembership(prisma)],
      schema: {
        params: s(C.orgParamsSchema),
        response: {
          200: s(C.operationMapSchema),
          401: s(C.apiErrorSchema),
          403: s(C.apiErrorSchema),
        },
        security: bearerSecurity,
      },
    },
    async (request) => {
      const { orgId } = request.params as C.OrgParams
      const [nodes, edges] = await Promise.all([
        prisma.operationNode.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } }),
        prisma.operationEdge.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } }),
      ])
      return {
        nodes: nodes.map(toNodeResponse),
        edges: edges.map(toEdgeResponse),
      }
    }
  )
}

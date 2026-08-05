import type { Prisma, PrismaClient } from '@prisma/client'

export type AuditActorType = 'user' | 'skill' | 'system'
export type AuditSeverity = 'info' | 'warning' | 'critical'

/** Client or transaction client — audit rows are written inside transactions too. */
type AuditDb = PrismaClient | Prisma.TransactionClient

export interface AuditInput {
  orgId: string
  /** id of the acting user; null/undefined for skill/system actors */
  actorId?: string | null
  actorType: AuditActorType
  /** dot-namespaced action, e.g. "operation.node.created", "skill.run.completed" */
  action: string
  targetType?: string
  targetId?: string
  context?: Record<string, unknown>
  severity?: AuditSeverity
  result?: string
}

/**
 * Append an audit event. The AuditEvent table is append-only by design:
 * the API exposes no update/delete for it, so this helper is the only way
 * rows get created. The skill engine uses the same helper for every
 * integration action (suggest/implement/wire/verify/handoff).
 */
export function appendAudit(prisma: AuditDb, input: AuditInput): Prisma.PrismaPromise<unknown> {
  return prisma.auditEvent.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId ?? null,
      actorType: input.actorType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      context: (input.context ?? {}) as Prisma.InputJsonValue,
      severity: input.severity ?? 'info',
      result: input.result,
    },
  })
}

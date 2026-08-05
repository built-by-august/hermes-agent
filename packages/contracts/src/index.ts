import { z } from 'zod'

/* ---------------------------------------------------------------- *
 *  Common primitives
 * ---------------------------------------------------------------- */
export const uuid = z.string().uuid()
export type UUID = z.infer<typeof uuid>

export const isoDate = z.string().datetime({ offset: true })
export type IsoDate = z.infer<typeof isoDate>

export const jwtToken = z.string().min(10)
export type JwtToken = z.infer<typeof jwtToken>

/* ---------------------------------------------------------------- *
 *  Organizations & membership
 * ---------------------------------------------------------------- */
export const organizationSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(200),
  industry: z.string().optional(),
  settings: z.record(z.unknown()).default({}),
  ownerId: uuid,
  createdAt: isoDate,
})
export type Organization = z.infer<typeof organizationSchema>

export const membershipRoleSchema = z.enum(['owner', 'admin', 'operator', 'auditor'])
export type MembershipRole = z.infer<typeof membershipRoleSchema>

export const membershipSchema = z.object({
  id: uuid,
  orgId: uuid,
  userId: uuid,
  role: membershipRoleSchema,
})
export type Membership = z.infer<typeof membershipSchema>

/* ---------------------------------------------------------------- *
 *  Auth
 * ---------------------------------------------------------------- */
export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200),
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  name: z.string(),
})
export type User = z.infer<typeof userSchema>

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: jwtToken,
  refreshToken: jwtToken,
  expiresIn: z.number().int().positive(),
})
export type AuthResponse = z.infer<typeof authResponseSchema>

/* ---------------------------------------------------------------- *
 *  Operation map (nodes + edges)
 * ---------------------------------------------------------------- */
export const operationNodeTypeSchema = z.enum(['process', 'step', 'tool', 'system', 'handoff'])
export type OperationNodeType = z.infer<typeof operationNodeTypeSchema>

export const operationNodeStatusSchema = z.enum(['active', 'paused', 'needs_attention'])
export type OperationNodeStatus = z.infer<typeof operationNodeStatusSchema>

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Position = z.infer<typeof positionSchema>

export const operationNodeSchema = z.object({
  id: uuid,
  orgId: uuid,
  name: z.string().min(1).max(200),
  type: operationNodeTypeSchema,
  status: operationNodeStatusSchema.default('active'),
  metadata: z.record(z.unknown()).default({}),
  position: positionSchema,
  createdAt: isoDate,
})
export type OperationNode = z.infer<typeof operationNodeSchema>

export const operationEdgeSchema = z.object({
  id: uuid,
  orgId: uuid,
  source: uuid,
  target: uuid,
  label: z.string().optional(),
  type: z.enum(['dependency', 'handoff', 'data_flow']).default('dependency'),
})
export type OperationEdge = z.infer<typeof operationEdgeSchema>

export const operationMapSchema = z.object({
  nodes: z.array(operationNodeSchema),
  edges: z.array(operationEdgeSchema),
})
export type OperationMap = z.infer<typeof operationMapSchema>

export const createNodeRequestSchema = operationNodeSchema.omit({
  id: true,
  orgId: true,
  createdAt: true,
})
export type CreateNodeRequest = z.infer<typeof createNodeRequestSchema>

export const createEdgeRequestSchema = operationEdgeSchema.omit({ id: true, orgId: true })
export type CreateEdgeRequest = z.infer<typeof createEdgeRequestSchema>

/* ---------------------------------------------------------------- *
 *  Audit events (append-only)
 * ---------------------------------------------------------------- */
export const auditSeveritySchema = z.enum(['info', 'warning', 'critical'])
export type AuditSeverity = z.infer<typeof auditSeveritySchema>

export const auditEventSchema = z.object({
  id: z.number().int().positive(),
  orgId: uuid,
  actorId: uuid.nullable().optional(),
  actorType: z.enum(['user', 'skill', 'system']),
  action: z.string().min(1).max(120),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  context: z.record(z.unknown()).default({}),
  severity: auditSeveritySchema.default('info'),
  result: z.string().optional(),
  createdAt: isoDate,
})
export type AuditEvent = z.infer<typeof auditEventSchema>

export const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  nextCursor: z.string().nullable().optional(),
})
export type AuditPage = z.infer<typeof auditPageSchema>

/* ---------------------------------------------------------------- *
 *  Findings
 * ---------------------------------------------------------------- */
export const findingSeveritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export type FindingSeverity = z.infer<typeof findingSeveritySchema>

export const findingStatusSchema = z.enum(['open', 'acknowledged', 'resolved'])
export type FindingStatus = z.infer<typeof findingStatusSchema>

export const findingSchema = z.object({
  id: uuid,
  orgId: uuid,
  sourceType: z.enum(['analysis', 'skill', 'manual']),
  severity: findingSeveritySchema,
  title: z.string().min(1),
  description: z.string(),
  evidence: z.record(z.unknown()).default({}),
  status: findingStatusSchema.default('open'),
  suggestedSkillId: uuid.optional(),
  createdAt: isoDate,
})
export type Finding = z.infer<typeof findingSchema>

/* ---------------------------------------------------------------- *
 *  Skills & skill runs
 * ---------------------------------------------------------------- */
export const skillPhaseSchema = z.enum(['suggest', 'implement', 'wire', 'verify', 'handoff'])
export type SkillPhase = z.infer<typeof skillPhaseSchema>

export const skillSchema = z.object({
  id: uuid,
  slug: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  phases: z.array(skillPhaseSchema),
  capabilities: z.record(z.unknown()).default({}),
  status: z.enum(['active', 'disabled']).default('active'),
})
export type Skill = z.infer<typeof skillSchema>

export const skillRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed'])
export type SkillRunStatus = z.infer<typeof skillRunStatusSchema>

export const skillRunSchema = z.object({
  id: uuid,
  orgId: uuid,
  skillId: uuid,
  phase: skillPhaseSchema,
  status: skillRunStatusSchema,
  dryRun: z.boolean().default(true),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type SkillRun = z.infer<typeof skillRunSchema>

export const startSkillRunRequestSchema = z.object({
  phase: skillPhaseSchema.default('suggest'),
  input: z.record(z.unknown()).default({}),
})
export type StartSkillRunRequest = z.infer<typeof startSkillRunRequestSchema>

/* ---------------------------------------------------------------- *
 *  Handoff reports
 * ---------------------------------------------------------------- */
export const handoffReportSchema = z.object({
  id: uuid,
  orgId: uuid,
  skillRunId: uuid,
  summary: z.string(),
  ownerAssignment: z.record(z.unknown()).default({}),
  steps: z.array(z.record(z.unknown())).default([]),
  verification: z.record(z.unknown()).default({}),
  created: isoDate,
})
export type HandoffReport = z.infer<typeof handoffReportSchema>

/* ---------------------------------------------------------------- *
 *  API error (RFC 7807-ish)
 * ---------------------------------------------------------------- */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  status: z.number().int(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof apiErrorSchema>

/* ---------------------------------------------------------------- *
 *  Request & response schemas for the backend API (single source)
 * ---------------------------------------------------------------- */
export const refreshRequestSchema = z.object({
  refreshToken: jwtToken,
})
export type RefreshRequest = z.infer<typeof refreshRequestSchema>

export const authMeResponseSchema = z.object({
  user: userSchema,
  memberships: z.array(
    z.object({
      orgId: uuid,
      orgName: z.string(),
      role: membershipRoleSchema,
    })
  ),
})
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>

export const createOrganizationRequestSchema = organizationSchema.omit({
  id: true,
  ownerId: true,
  createdAt: true,
})
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>

export const updateOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  industry: z.string().max(100).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
})
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>

export const inviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: membershipRoleSchema,
})
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>

export const memberSchema = z.object({
  id: uuid,
  userId: uuid,
  email: z.string().email(),
  name: z.string(),
  role: membershipRoleSchema,
  createdAt: isoDate,
})
export type Member = z.infer<typeof memberSchema>

export const patchNodeRequestSchema = createNodeRequestSchema.partial()
export type PatchNodeRequest = z.infer<typeof patchNodeRequestSchema>

export const findingStatusUpdateRequestSchema = z.object({
  status: findingStatusSchema,
})
export type FindingStatusUpdateRequest = z.infer<typeof findingStatusUpdateRequestSchema>

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(), // opaque keyset cursor (last seen audit id)
  action: z.string().max(120).optional(),
  actorType: z.enum(['user', 'skill', 'system']).optional(),
  severity: auditSeveritySchema.optional(),
})
export type AuditQuery = z.infer<typeof auditQuerySchema>

export const findingsQuerySchema = z.object({
  severity: findingSeveritySchema.optional(),
  status: findingStatusSchema.optional(),
  sourceType: z.enum(['analysis', 'skill', 'manual']).optional(),
})
export type FindingsQuery = z.infer<typeof findingsQuerySchema>

export const mapQuerySchema = z.object({})
export type MapQuery = z.infer<typeof mapQuerySchema>

export const orgParamsSchema = z.object({ orgId: uuid })
export type OrgParams = z.infer<typeof orgParamsSchema>

export const resourceParamsSchema = z.object({ orgId: uuid, id: uuid })
export type ResourceParams = z.infer<typeof resourceParamsSchema>

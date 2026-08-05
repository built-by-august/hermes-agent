import type {
  AuditPage,
  AuditSeverity,
  AuthResponse,
  Connector,
  CreateConnectorRequest,
  CreateEdgeRequest,
  CreateNodeRequest,
  Finding,
  FindingStatus,
  HandoffReport,
  LoginRequest,
  Membership,
  OperationEdge,
  OperationMap,
  OperationNode,
  Organization,
  RegisterRequest,
  Skill,
  SkillPhase,
  SkillRun,
  StartSkillRunRequest,
  User,
} from '@repo/contracts'

/**
 * The API adapter contract.
 *
 * This interface is the single contract the frontend consumes. Two adapters
 * implement it:
 *
 *  - `MockApiClient`  — in-memory adapter with seeded demo data (default).
 *                       Lets frontend work proceed in parallel with the backend.
 *  - `HttpApiClient`  — real fetch-based adapter against `apps/api` (used when
 *                       `VITE_API_MODE=http`).
 *
 * Contract tests (`contract.test.ts`) validate that every mock adapter method
 * returns data conforming to the shared Zod schemas in `@repo/contracts`, so a
 * backend implementing the same schemas can swap in without UI changes.
 */
export interface ApiClient {
  /* ---------- auth ---------- */
  register(input: RegisterRequest): Promise<AuthResponse>
  login(input: LoginRequest): Promise<AuthResponse>
  me(token: string): Promise<{ user: User; memberships: Membership[] }>

  /* ---------- organizations ---------- */
  createOrg(input: { name: string; industry?: string }): Promise<Organization>
  getOrg(orgId: string): Promise<Organization>
  updateOrg(
    orgId: string,
    patch: Partial<Pick<Organization, 'name' | 'industry' | 'settings'>>
  ): Promise<Organization>
  listMembers(orgId: string): Promise<Membership[]>

  /* ---------- operations map ---------- */
  getMap(orgId: string): Promise<OperationMap>
  createNode(orgId: string, input: CreateNodeRequest): Promise<OperationNode>
  updateNode(
    orgId: string,
    nodeId: string,
    patch: Partial<CreateNodeRequest>
  ): Promise<OperationNode>
  createEdge(orgId: string, input: CreateEdgeRequest): Promise<OperationEdge>

  /* ---------- audit (append-only) ---------- */
  getAudit(
    orgId: string,
    params?: { limit?: number; cursor?: string; severity?: AuditSeverity }
  ): Promise<AuditPage>

  /* ---------- findings ---------- */
  getFindings(orgId: string, params?: { status?: FindingStatus }): Promise<Finding[]>
  updateFindingStatus(orgId: string, findingId: string, status: FindingStatus): Promise<Finding>

  /* ---------- skills & skill runs ---------- */
  listSkills(orgId: string): Promise<Skill[]>
  startSkillRun(orgId: string, skillId: string, input?: StartSkillRunRequest): Promise<SkillRun>
  getSkillRun(orgId: string, runId: string): Promise<SkillRun>
  advanceSkillRun(orgId: string, runId: string, phase: SkillPhase): Promise<SkillRun>
  getHandoff(orgId: string, runId: string): Promise<HandoffReport>

  /* ---------- connectors ---------- */
  listConnectors(orgId: string): Promise<Connector[]>
  addConnector(orgId: string, input: CreateConnectorRequest): Promise<Connector>
}

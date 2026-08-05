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
  ApiError as ApiErrorType,
} from '@repo/contracts'

import type { ApiClient } from './types'

/**
 * Real fetch-based adapter against `apps/api` (Fastify). Active when
 * `VITE_API_MODE=http`. Mirrors the `ApiClient` contract exactly so it can
 * replace the mock adapter without UI changes.
 */
export class HttpApiClient implements ApiClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      let payload: ApiErrorType | undefined
      try {
        payload = (await res.json()) as ApiErrorType
      } catch {
        payload = undefined
      }
      throw new Error(payload?.message ?? `Request failed: ${res.status} ${res.statusText}`)
    }

    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  async register(input: RegisterRequest): Promise<AuthResponse> {
    return this.request('POST', '/auth/register', input)
  }
  async login(input: LoginRequest): Promise<AuthResponse> {
    return this.request('POST', '/auth/login', input)
  }
  async me(token: string): Promise<{ user: User; memberships: Membership[] }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    const res = await fetch(`${this.baseUrl}/auth/me`, { headers })
    if (!res.ok) throw new Error('Failed to load current user')
    return res.json()
  }

  async createOrg(input: { name: string; industry?: string }): Promise<Organization> {
    return this.request('POST', '/orgs', input)
  }
  async getOrg(orgId: string): Promise<Organization> {
    return this.request('GET', `/orgs/${orgId}`)
  }
  async updateOrg(
    orgId: string,
    patch: Partial<Pick<Organization, 'name' | 'industry' | 'settings'>>
  ): Promise<Organization> {
    return this.request('PATCH', `/orgs/${orgId}`, patch)
  }
  async listMembers(orgId: string): Promise<Membership[]> {
    return this.request('GET', `/orgs/${orgId}/members`)
  }

  async getMap(orgId: string): Promise<OperationMap> {
    return this.request('GET', `/orgs/${orgId}/map`)
  }
  async createNode(orgId: string, input: CreateNodeRequest): Promise<OperationNode> {
    return this.request('POST', `/orgs/${orgId}/operations`, input)
  }
  async updateNode(
    orgId: string,
    nodeId: string,
    patch: Partial<CreateNodeRequest>
  ): Promise<OperationNode> {
    return this.request('PATCH', `/orgs/${orgId}/operations/${nodeId}`, patch)
  }
  async createEdge(orgId: string, input: CreateEdgeRequest): Promise<OperationEdge> {
    return this.request('POST', `/orgs/${orgId}/edges`, input)
  }

  async getAudit(
    orgId: string,
    params?: { limit?: number; cursor?: string; severity?: AuditSeverity }
  ): Promise<AuditPage> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.severity) qs.set('severity', params.severity)
    const q = qs.toString()
    return this.request('GET', `/orgs/${orgId}/audit${q ? `?${q}` : ''}`)
  }

  async getFindings(orgId: string, params?: { status?: FindingStatus }): Promise<Finding[]> {
    const qs = params?.status ? `?status=${params.status}` : ''
    return this.request('GET', `/orgs/${orgId}/findings${qs}`)
  }
  async updateFindingStatus(
    orgId: string,
    findingId: string,
    status: FindingStatus
  ): Promise<Finding> {
    return this.request('PATCH', `/orgs/${orgId}/findings/${findingId}/status`, { status })
  }

  async listSkills(orgId: string): Promise<Skill[]> {
    return this.request('GET', `/orgs/${orgId}/skills`)
  }
  async startSkillRun(
    orgId: string,
    skillId: string,
    input?: StartSkillRunRequest
  ): Promise<SkillRun> {
    return this.request(
      'POST',
      `/orgs/${orgId}/skills/${skillId}/runs`,
      input ?? { phase: 'suggest' }
    )
  }
  async getSkillRun(orgId: string, runId: string): Promise<SkillRun> {
    return this.request('GET', `/orgs/${orgId}/runs/${runId}`)
  }
  async advanceSkillRun(orgId: string, runId: string, phase: SkillPhase): Promise<SkillRun> {
    return this.request('POST', `/orgs/${orgId}/runs/${runId}/advance`, { phase })
  }
  async getHandoff(orgId: string, runId: string): Promise<HandoffReport> {
    return this.request('GET', `/orgs/${orgId}/runs/${runId}/handoff`)
  }

  async listConnectors(orgId: string): Promise<Connector[]> {
    return this.request('GET', `/orgs/${orgId}/connectors`)
  }
  async addConnector(orgId: string, input: CreateConnectorRequest): Promise<Connector> {
    return this.request('POST', `/orgs/${orgId}/connectors`, input)
  }
}

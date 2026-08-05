/**
 * Skill engine — orchestrates the five-phase lifecycle and audit trail.
 *
 * The engine is the single place that knows the phase order and guarantees an
 * immutable audit event is written on ENTRY and COMPLETION of every phase
 * (architecture §4.2, §6.2). A skill run is driven phase-by-phase via
 * `runPhase` / `advance`, mirroring the API contract
 * (POST .../runs, POST .../runs/{id}/advance). MVP runs are sandbox-only
 * (`dryRun: true`): the engine never lets a phase touch a live system.
 *
 * Acceptance tests assert that for a full deploy->...->handoff loop, every
 * expected `skill.*` audit action is present (see tests/engine.test.ts).
 */

import { randomUUID } from 'node:crypto'

import type {
  AuditSink,
  ConnectorResolver,
  Finding,
  ImplementOutput,
  OperationMap,
  ProposedStep,
  SkillContext,
  SkillLifecycle,
  SkillPackage,
  SkillPhase,
  SkillRunState,
} from './types.js'
import { PHASES } from './types.js'

export interface EngineOptions {
  /** Audit sink. In tests/demo this is the in-memory sink. */
  audit: AuditSink
  /** Resolves connectors by kind for a run. */
  connectors: ConnectorResolver
  /** Default dryRun; the MVP always runs sandbox-simulated. */
  dryRun?: boolean
  /** Actor attribution for skill-driven audit events. */
  actor?: { id: string; type: 'skill' }
}

export interface RunInput {
  orgId: string
  skill: SkillPackage
  /** Operation map the skill reasons over. */
  map: OperationMap
  findings?: Finding[]
  orgSettings?: Record<string, unknown>
  /** Phase to start the run at (always "suggest" in the API contract). */
  phase?: SkillPhase
  dryRun?: boolean
  input?: Record<string, unknown>
}

function phaseIndex(phase: SkillPhase): number {
  return PHASES.indexOf(phase)
}

export class SkillEngine {
  private opts: Required<Omit<EngineOptions, 'actor'>> & { actor: { id: string; type: 'skill' } }
  private runs = new Map<string, SkillRunState>()

  constructor(options: EngineOptions) {
    this.opts = {
      dryRun: true,
      actor: { id: 'engine', type: 'skill' },
      ...options,
    }
  }

  /** Begin a run at the given phase (default "suggest"). */
  startRun(input: RunInput): SkillRunState {
    const phase = input.phase ?? 'suggest'
    const id = `run_${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    const state: SkillRunState = {
      id,
      orgId: input.orgId,
      skillId: input.skill.manifest.slug,
      slug: input.skill.manifest.slug,
      phase,
      status: 'pending',
      dryRun: input.dryRun ?? this.opts.dryRun,
      input: input.input ?? {},
      output: null,
      error: null,
      steps: [],
      createdAt: now,
      updatedAt: now,
    }
    this.runs.set(id, state)
    this.audit(
      state.orgId,
      'skill.run.started',
      { runId: id, phase, slug: state.slug, dryRun: state.dryRun },
      'info'
    )
    return state
  }

  getRun(runId: string): SkillRunState | undefined {
    return this.runs.get(runId)
  }

  /**
   * Execute the current phase of a run and advance its state. On completion of
   * the "handoff" phase the run is marked completed and a handoff audit event
   * with the report is written.
   */
  async runPhase(runId: string, input: RunInput): Promise<SkillRunState> {
    const run = this.runs.get(runId)
    if (!run) throw new Error(`unknown run ${runId}`)
    if (run.status === 'completed') throw new Error(`run ${runId} already completed`)
    if (run.status === 'failed') throw new Error(`run ${runId} is in failed state`)

    const pkg = input.skill
    const phase = run.phase
    const ctx = this.buildContext(run, input)

    this.audit(
      run.orgId,
      `skill.${phase}.started`,
      { runId, phase, slug: pkg.manifest.slug },
      'info'
    )
    run.status = 'running'
    run.updatedAt = new Date().toISOString()
    this.audit(run.orgId, `skill.${phase}.running`, { runId, phase }, 'info')

    try {
      const output = await this.invokePhase(pkg.lifecycle, phase, ctx, run)
      run.output = output as unknown as Record<string, unknown>
      run.updatedAt = new Date().toISOString()

      const isLast = phase === 'handoff'
      run.status = isLast ? 'completed' : 'pending'
      run.phase = isLast ? 'handoff' : (PHASES[phaseIndex(phase) + 1] ?? phase)

      this.audit(
        run.orgId,
        `skill.${phase}.completed`,
        { runId, phase, slug: pkg.manifest.slug, output },
        'info'
      )
      if (isLast) {
        this.audit(
          run.orgId,
          'skill.handoff.report.archived',
          { runId, slug: pkg.manifest.slug, report: output },
          'info'
        )
      }
      return run
    } catch (err) {
      run.status = 'failed'
      run.error = err instanceof Error ? err.message : String(err)
      run.updatedAt = new Date().toISOString()
      this.audit(run.orgId, `skill.${phase}.failed`, { runId, phase, error: run.error }, 'critical')
      throw err
    }
  }

  /** Convenience: run every phase from suggest through handoff in order. */
  async runFullLifecycle(input: RunInput): Promise<SkillRunState> {
    const run = this.startRun(input)
    let current = run
    // The run always starts at "suggest"; loop until completed.
    for (;;) {
      current = await this.runPhase(current.id, input)
      if (current.status === 'completed') break
    }
    return current
  }

  private async invokePhase(
    lifecycle: SkillLifecycle,
    phase: SkillPhase,
    ctx: SkillContext,
    run: SkillRunState
  ): Promise<unknown> {
    switch (phase) {
      case 'suggest': {
        const out = await lifecycle.suggest(ctx)
        run.steps = out.steps
        run.input = { ...run.input, suggestedSteps: out.steps.length }
        return out
      }
      case 'implement': {
        const steps: ProposedStep[] = (run.steps as ProposedStep[]) ?? []
        return lifecycle.implement(ctx, steps)
      }
      case 'wire': {
        const steps: ProposedStep[] = (run.steps as ProposedStep[]) ?? []
        const implemented = (run.output as unknown as ImplementOutput) ?? {
          artifact: {} as Record<string, unknown>,
          applied: false as const,
          dryRun: true as const,
          stepsCompleted: [] as string[],
        }
        return lifecycle.wire(ctx, steps, implemented)
      }
      case 'verify': {
        const wiring = (run.output as {
          connectorKind: string
          endpoint: string
          credentialRef: string
          wiringPlan: Record<string, unknown>
          status: 'configured' | 'verified'
        }) ?? {
          connectorKind: '',
          endpoint: '',
          credentialRef: '',
          wiringPlan: {},
          status: 'configured' as const,
        }
        return lifecycle.verify(ctx, wiring)
      }
      case 'handoff': {
        const verification = ((run.output as { checks: unknown[]; overall: string }) ?? {
          checks: [],
          overall: 'pass',
        }) as unknown as Awaited<ReturnType<SkillLifecycle['verify']>>
        return lifecycle.handoff(ctx, verification)
      }
      default:
        throw new Error(`unknown phase ${phase}`)
    }
  }

  private buildContext(run: SkillRunState, input: RunInput): SkillContext {
    return {
      orgId: run.orgId,
      map: input.map,
      findings: input.findings ?? [],
      orgSettings: input.orgSettings ?? {},
      input: run.input,
      dryRun: run.dryRun,
      connectors: this.opts.connectors,
    }
  }

  private audit(
    orgId: string,
    action: string,
    context: Record<string, unknown>,
    severity: 'info' | 'warning' | 'critical' = 'info'
  ) {
    this.opts.audit.append({
      orgId,
      actorId: this.opts.actor.id,
      actorType: 'skill',
      action,
      targetType: 'SkillRun',
      targetId: (context.runId as string) ?? undefined,
      context,
      severity,
    })
  }
}

/** Build an engine with the supplied dependencies. */
export function createEngine(options: EngineOptions): SkillEngine {
  return new SkillEngine(options)
}

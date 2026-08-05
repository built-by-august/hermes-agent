/**
 * Sample skill: slack-incident-alert (architecture §6.4).
 *
 * The complete, in-MVP sample skill. It demonstrates the full loop end-to-end
 * against a mapped org so the E2E drill can assert every step is logged:
 *
 *   suggest  -> finds ops nodes with status "needs_attention" (from findings
 *               or map) and proposes a Slack alert automation.
 *   implement-> authors the wiring artifact (channel + trigger) but never
 *               applies it (dryRun: true, applied: false).
 *   wire     -> simulates connecting the Slack connector and stores a
 *               credential reference (secret stays in the vault).
 *   verify   -> runs checks.ts simulated health checks.
 *   handoff  -> composes the HandoffReport with owner assignment + audit trail.
 *
 * This factory returns the skill package so it can be registered both in the
 * default registry and by the per-run engine (which injects context/connectors).
 */

import type {
  HandoffReportData,
  OperationNode,
  ProposedStep,
  SkillContext,
  SkillLifecycle,
  SkillPackage,
} from '../../types.js'
import { runSlackChecks, type SlackCheckInput } from './checks.js'

const DEFAULT_CHANNEL = '#ops-alerts'

function findAttentionNodes(ctx: SkillContext) {
  const fromFindings = ctx.findings
    .filter((f) => f.severity === 'high' || f.severity === 'critical')
    .map((f) => f.evidence?.nodeId)
    .filter(Boolean) as string[]

  const fromMap = ctx.map.nodes.filter((n) => n.status === 'needs_attention').map((n) => n.id)

  const combined = [...new Set([...fromFindings, ...fromMap])]
  return combined
}

// Module-level lifecycle so it can be both the factory's return value and the
// package-format default export (architecture §6.1: entry default-exports the
// SkillLifecycle).
const lifecycle: SkillLifecycle = {
  async suggest(ctx: SkillContext) {
    const affected = findAttentionNodes(ctx)
    const channel = (ctx.orgSettings.slackChannel as string) || DEFAULT_CHANNEL

    const steps: ProposedStep[] = affected.map((nodeId, i) => ({
      id: `sia-step-${i + 1}`,
      title: `Alert on #${channel} when "${nodeId}" fails`,
      description: `Post a Slack message to ${channel} when node ${nodeId} is flagged needs_attention or fails.`,
      rationale: 'Surfaces operational failures to the team in real time without manual polling.',
      risk: 'low' as const,
      affectedNodeIds: [nodeId],
      phase: 'implement' as const,
      effort: 'S' as const,
      status: 'proposed' as const,
    }))

    if (steps.length === 0) {
      steps.push({
        id: 'sia-step-0',
        title: `Stand up ${channel} ops-alert monitor`,
        description: `Create the ${channel} alert rule so future failures are reported.`,
        rationale:
          'No failing nodes today, but the monitor should be ready before the first incident.',
        risk: 'low' as const,
        affectedNodeIds: ctx.map.nodes.slice(0, 1).map((n: OperationNode) => n.id),
        phase: 'implement' as const,
        effort: 'M' as const,
        status: 'proposed' as const,
      })
    }

    return {
      steps: steps.map((s) => ({ ...s, status: 'approved' as const })),
      summary: `Proposes a Slack alert to ${channel} for ${steps.length} ops node(s) needing attention.`,
    }
  },

  async implement(ctx: SkillContext, steps) {
    const channel = (ctx.orgSettings.slackChannel as string) || DEFAULT_CHANNEL
    const artifact = {
      type: 'slack.alert.rule',
      channel,
      webhookEnv: 'SLACK_WEBHOOK_URL',
      trigger: { onNodeStatus: ['needs_attention', 'failed'] },
      stepsReferenced: steps.map((s) => s.id),
    }
    // MVP sandbox: authored but NEVER applied to a live system.
    return {
      artifact,
      applied: false as const,
      dryRun: true as const,
      stepsCompleted: steps.map((s) => s.id),
    }
  },

  async wire(ctx: SkillContext, _steps, implemented) {
    const slack = ctx.connectors.get('slack')
    if (!slack) {
      throw new Error('slack connector not available in this run context')
    }
    await slack.connect({
      endpoint: 'https://hooks.slack.com/services/**',
      credentials: { token: 'xoxb-simulated' },
    })
    await slack.verify() // simulated

    // Store the secret in the vault; expose only the reference.
    const { storeCredential } = await import('../../credentials.js')
    const credentialRef = storeCredential('xoxb-simulated-webhook-url')

    return {
      connectorKind: 'slack',
      endpoint: 'https://hooks.slack.com/services/**',
      credentialRef,
      wiringPlan: {
        artifact: implemented.artifact,
        note: 'simulated; no live webhook created (dryRun)',
      },
      status: 'configured',
    }
  },

  async verify(ctx: SkillContext, wiring) {
    const slack = ctx.connectors.get('slack')
    const connectorChecks = slack ? await slack.verify() : []
    const input: SlackCheckInput = {
      wiring,
      orgSettings: ctx.orgSettings,
      dryRun: ctx.dryRun,
    }
    const skillChecks = runSlackChecks(input)
    const checks = [...connectorChecks, ...skillChecks]
    const failed = checks.filter((c) => c.result === 'fail').length
    const warned = checks.filter((c) => c.result === 'warn').length
    const passed = checks.filter((c) => c.result === 'pass').length
    const overall = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass'
    return { checks, passed, failed, warned, overall }
  },

  async handoff(ctx: SkillContext, verification) {
    const channel = (ctx.orgSettings.slackChannel as string) || DEFAULT_CHANNEL
    const report: HandoffReportData = {
      summary: `Wired Slack alert on ${channel} (simulated). ${verification.passed} check(s) passed, ${verification.failed} failed.`,
      ownerAssignment: {
        assignee: 'operator',
        remainingManualSteps: [
          `Rename channel ${channel} if not yet created`,
          'Add real SLACK_WEBHOOK_URL to env before going live',
        ],
      },
      steps: Array.isArray(ctx.input.steps)
        ? (ctx.input.steps as Array<Record<string, unknown>>)
        : [],
      verification: {
        overall: verification.overall,
        checks: verification.checks,
      },
      auditTrail: [],
    }
    return { report }
  },
}

// In-repo factory that builds a SkillPackage (manifest + lifecycle) so the
// registry and tests can register the sample skill without going through the
// filesystem loader. The package-format loader (loader.ts) instead reads
// skill.json + the default-exported lifecycle from index.ts.
export function slackIncidentAlert(): SkillPackage {
  return {
    manifest: {
      slug: 'slack-incident-alert',
      name: 'Slack Incident Alert',
      version: '0.1.0',
      description:
        'Wires a Slack channel alert when an ops step on the map fails or is marked needs_attention.',
      phases: ['suggest', 'implement', 'wire', 'verify', 'handoff'],
      capabilities: { connectors: ['slack'], risk: 'low' },
      entry: 'index.ts',
      implemented: true,
    },
    lifecycle,
  }
}

// Package-format entry: the default export is the SkillLifecycle (architecture
// §6.1). The factory above is the in-repo helper that also builds the manifest
// so the registry and the loader share one source of truth.
export default lifecycle

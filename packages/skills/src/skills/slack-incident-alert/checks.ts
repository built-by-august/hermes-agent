/**
 * Verification checks for slack-incident-alert (architecture §6.2 "verify").
 *
 * These simulate health checks. A real adapter would validate the webhook,
 * channel membership, and trigger wiring against the live Slack API behind the
 * Phase-2 outbound-approval gate. In the MVP they are deterministic and pure so
 * the engine's verify phase is fully testable.
 */

import type { CheckResult, WireOutput } from '../../types.js'

export interface SlackCheckInput {
  wiring: WireOutput
  orgSettings: Record<string, unknown>
  dryRun: boolean
}

export function runSlackChecks(input: SlackCheckInput): CheckResult[] {
  const checks: CheckResult[] = []

  // 1. Credential reference was created (secret never returned).
  checks.push({
    check: 'slack.credential.ref.created',
    result: input.wiring.credentialRef?.startsWith('enc:v1:') ? 'pass' : 'fail',
    detail: input.wiring.credentialRef?.startsWith('enc:v1:')
      ? 'credential stored as opaque reference'
      : 'credential reference missing',
  })

  // 2. Endpoint configured (simulated).
  checks.push({
    check: 'slack.endpoint.configured',
    result: input.wiring.endpoint ? 'pass' : 'fail',
    detail: input.wiring.endpoint || 'no endpoint',
  })

  // 3. Channel is set in org settings.
  const channel = input.orgSettings.slackChannel as string | undefined
  checks.push({
    check: 'slack.channel.configured',
    result: channel ? 'pass' : 'warn',
    detail: channel ? `channel ${channel}` : 'no channel configured; default #ops-alerts assumed',
  })

  // 4. Dry-run guard: confirm no live side effect in the MVP.
  checks.push({
    check: 'slack.dryrun.no_live_side_effects',
    result: input.dryRun ? 'pass' : 'warn',
    detail: input.dryRun ? 'sandbox mode — nothing applied to live Slack' : 'live mode not enabled in MVP',
  })

  return checks
}

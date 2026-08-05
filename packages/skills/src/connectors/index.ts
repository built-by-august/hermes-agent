/**
 * Built-in connectors (architecture §6.3).
 *
 * In the MVP everything runs in simulation mode: `connect()` and `verify()`
 * return simulated results and NEVER touch a live external system. Real
 * adapters (with an explicit outbound-approval gate) arrive in Phase 2 (§10).
 *
 * Exports:
 *  - createConnectorResolver() — resolves connectors by kind for a skill run.
 *  - SlackConnector            — simulated Slack connector (the demo skill).
 *  - createBuzzConnectorStub() — clearly-marked NOT_IMPLEMENTED Buzz stub.
 */

import type { Connector, ConnectorConfig, ConnectResult, ConnectorResolver, CheckResult } from '../types.js'

/* ---------------------------------------------------------------- *
 *  Slack connector (simulated) — used by the sample skill
 * ---------------------------------------------------------------- */

export class SlackConnector implements Connector {
  kind = 'slack'
  displayName = 'Slack (simulated)'
  implemented = true
  status: Connector['status'] = 'disconnected'

  async connect(config: ConnectorConfig): Promise<ConnectResult> {
    // MVP: simulate a successful connection; never reach out to Slack.
    const endpoint = (config.endpoint as string) || 'https://hooks.slack.com/services/**'
    if (!config.credentials || Object.keys(config.credentials).length === 0) {
      return { ok: false, status: 'disconnected', detail: 'missing credentials' }
    }
    this.status = 'configured'
    return { ok: true, status: 'configured', detail: `simulated connect to ${endpoint}` }
  }

  async verify(): Promise<CheckResult[]> {
    return [
      { check: 'slack.webhook.reachable', result: 'pass', detail: 'simulated reachability check' },
      { check: 'slack.channel.exists', result: 'pass', detail: '#ops-alerts resolved in simulation' },
    ]
  }
}

/* ---------------------------------------------------------------- *
 *  Buzz connector STUB (§1.1, §6.3) — NOT_IMPLEMENTED
 * ---------------------------------------------------------------- */

export const BUZZ_STUB_REMAINING_WORK = [
  'Implement ACP client against the Buzz Desktop harness (channel #455eeae6-…).',
  'Wire BUZZ_PRIVATE_KEY identity hand-off (do NOT read the key; harness supplies it).',
  'Map Buzz agent lifecycle (spawn / message / halt) onto the SkillLifecycle phases.',
  'Add an explicit outbound-approval gate before any agent is dispatched.',
  'Persist run state to the product DB; today the adapter is interface-only.',
]

/**
 * Buzz adapter stub. It satisfies the `Connector` interface so the engine and
 * the sample skill can reference "buzz" as a connector kind, but every call
 * throws `NOT_IMPLEMENTED`. The MVP ships the interface + stub; the working
 * adapter is explicitly Phase-2 remaining work (architecture §1.1 / §12).
 */
export class BuzzConnectorStub implements Connector {
  kind = 'buzz'
  displayName = 'Buzz (STUB — not implemented)'
  implemented = false // clearly marked
  status: Connector['status'] = 'disconnected'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async connect(_config: ConnectorConfig): Promise<ConnectResult> {
    return {
      ok: false,
      status: 'disconnected',
      detail: 'NOT_IMPLEMENTED: Buzz adapter is a Phase-2 stub (see describeRemainingWork).',
    }
  }

  async verify(): Promise<CheckResult[]> {
    return [
      { check: 'buzz.adapter.present', result: 'fail', detail: 'NOT_IMPLEMENTED stub' },
    ]
  }

  describeRemainingWork(): string[] {
    return [...BUZZ_STUB_REMAINING_WORK]
  }
}

/** Factory so the stub can be registered like any other connector. */
export function createBuzzConnectorStub(): BuzzConnectorStub {
  return new BuzzConnectorStub()
}

/* ---------------------------------------------------------------- *
 *  Resolver
 * ---------------------------------------------------------------- */

export function createConnectorResolver(): ConnectorResolver {
  const connectors: Connector[] = [new SlackConnector(), createBuzzConnectorStub()]
  const byKind = new Map(connectors.map((c) => [c.kind, c]))
  return {
    get: (kind: string) => byKind.get(kind),
    list: () => [...connectors],
  }
}

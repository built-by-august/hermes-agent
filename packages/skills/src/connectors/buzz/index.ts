/**
 * Buzz connector adapter stub (architecture §1.1, §6.3, §12).
 *
 * This file is the explicit home for the Buzz adapter and MUST stay a
 * clearly-marked stub until Phase 2. The generic `Connector` interface lives
 * in the parent (connectors/index.ts); this file documents what remains and
 * guards every call with `NOT_IMPLEMENTED`.
 *
 * Remaining work before flipping `implemented: true`:
 *   1. Implement ACP client against Buzz Desktop + harness channel.
 *   2. Wire BUZZ_PRIVATE_KEY identity hand-off (harness supplies identity;
 *      this adapter must NOT read the key directly).
 *   3. Map Buzz agent lifecycle onto SkillLifecycle phases.
 *   4. Add outbound-approval gate before dispatching any agent.
 *   5. Persist run state to the product DB.
 */

import type { Connector, ConnectorConfig, ConnectResult, CheckResult } from '../../types.js'
import { BUZZ_STUB_REMAINING_WORK } from '../index.js'

const NOT_IMPLEMENTED =
  'Buzz adapter is a Phase-2 stub. See connectors/index.ts -> BuzzConnectorStub ' +
  'and packages/skills/docs for remaining work.'

export class BuzzAdapter implements Connector {
  kind = 'buzz'
  displayName = 'Buzz (stub)'
  implemented = false // REMAINING WORK until Phase 2
  status: Connector['status'] = 'disconnected'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async connect(_config: ConnectorConfig): Promise<ConnectResult> {
    return { ok: false, status: 'disconnected', detail: NOT_IMPLEMENTED }
  }

  async verify(): Promise<CheckResult[]> {
    return [{ check: 'buzz.adapter.implemented', result: 'fail', detail: NOT_IMPLEMENTED }]
  }

  describeRemainingWork(): string[] {
    return [...BUZZ_STUB_REMAINING_WORK]
  }
}

export default BuzzAdapter

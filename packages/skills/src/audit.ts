/**
 * Append-only audit log for the skill engine.
 *
 * The engine emits an audit event on entry and completion of every lifecycle
 * phase plus connector transitions, so a full run leaves an immutable trail
 * (architecture §4.2, §6.2). The DB layer implements `AuditSink` against the
 * append-only AuditEvent table; `InMemoryAuditSink` is the reference
 * implementation used by tests and the demo harness.
 */

import type { AuditEvent, AuditSink, NewAuditEvent } from './types.js'

let nextId = 1

export class InMemoryAuditSink implements AuditSink {
  private events: AuditEvent[] = []

  append(event: NewAuditEvent): AuditEvent {
    const stored: AuditEvent = {
      ...event,
      id: nextId++,
      severity: event.severity ?? 'info',
      actorType: event.actorType ?? 'system',
      context: event.context ?? {},
      createdAt: new Date().toISOString(),
    }
    this.events.push(stored)
    return stored
  }

  list(orgId?: string): AuditEvent[] {
    if (!orgId) return [...this.events]
    return this.events.filter((e) => e.orgId === orgId)
  }

  /** Ordered action names — handy for asserting the full loop was logged. */
  actions(orgId?: string): string[] {
    return this.list(orgId).map((e) => e.action)
  }
}

/** Convenience wrapper used by the engine and by tests. */
export function createAuditSink(): InMemoryAuditSink {
  return new InMemoryAuditSink()
}

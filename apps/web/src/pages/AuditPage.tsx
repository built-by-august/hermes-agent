import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type { AuditEvent, AuditSeverity } from '@repo/contracts'
import { Badge, ErrorAlert, Spinner, formatDate } from '../components/ui'

const SEVS: Array<AuditSeverity | 'all'> = ['all', 'info', 'warning', 'critical']

export function AuditPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [items, setItems] = useState<AuditEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [sev, setSev] = useState<AuditSeverity | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (next?: string | null, replace = true) => {
      setLoading(true)
      setError(null)
      try {
        const page = await api.getAudit(orgId, {
          limit: 25,
          cursor: next ?? undefined,
          severity: sev === 'all' ? undefined : sev,
        })
        setItems((prev) => (replace ? page.items : [...prev, ...page.items]))
        setCursor(page.nextCursor ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audit log')
      } finally {
        setLoading(false)
      }
    },
    [api, orgId, sev]
  )

  useEffect(() => {
    load(null, true)
  }, [load])

  return (
    <section>
      <h1>Audit log</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Append-only record of every action by users and skills in your organization.
      </p>

      <div className="row" style={{ margin: '1rem 0' }}>
        {SEVS.map((s) => (
          <button
            key={s}
            className={`btn btn--sm ${sev === s ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setSev(s)}
            aria-pressed={sev === s}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <ErrorAlert message={error} />}
      {loading && items.length === 0 ? (
        <Spinner label="Loading audit log…" />
      ) : items.length === 0 ? (
        <div className="empty">No audit events.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</td>
                  <td>
                    <Badge value={a.actorType}>{a.actorType}</Badge>
                  </td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td className="muted">
                    {a.targetType ?? '—'}
                    {a.targetId ? ` ${a.targetId.slice(0, 8)}` : ''}
                  </td>
                  <td>
                    <Badge value={a.severity}>{a.severity}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={() => load(cursor, false)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  )
}

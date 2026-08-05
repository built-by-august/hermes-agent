import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type { AuditEvent, Finding, OperationMap } from '@repo/contracts'
import { Badge, Spinner } from '../components/ui'

export function DashboardPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [map, setMap] = useState<OperationMap | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.getMap(orgId), api.getFindings(orgId), api.getAudit(orgId, { limit: 5 })])
      .then(([m, f, a]) => {
        if (!active) return
        setMap(m)
        setFindings(f)
        setAudit(a.items)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
    return () => {
      active = false
    }
  }, [api, orgId])

  if (error)
    return (
      <div className="alert alert--error" role="alert">
        {error}
      </div>
    )
  if (!map) return <Spinner label="Loading dashboard…" />

  const highCount = findings.filter(
    (f) => f.severity === 'high' || f.severity === 'critical'
  ).length
  const openCount = findings.filter((f) => f.status === 'open').length

  return (
    <section>
      <h1>Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Your operation at a glance. Map your processes, watch for findings, and run integration
        skills.
      </p>

      <div className="grid grid--4" style={{ marginTop: '1rem' }}>
        <div className="stat">
          <div className="stat__num">{map.nodes.length}</div>
          <div className="stat__label">Operation nodes</div>
        </div>
        <div className="stat">
          <div className="stat__num">{map.edges.length}</div>
          <div className="stat__label">Edges / handoffs</div>
        </div>
        <div className="stat">
          <div className="stat__num">{openCount}</div>
          <div className="stat__label">Open findings</div>
        </div>
        <div className="stat">
          <div className="stat__num" style={{ color: highCount ? 'var(--crit)' : 'var(--ok)' }}>
            {highCount}
          </div>
          <div className="stat__label">High / critical</div>
        </div>
      </div>

      <div className="grid grid--2" style={{ marginTop: '1.25rem' }}>
        <div className="card">
          <div className="row spread">
            <h2>Top findings</h2>
            <Link className="btn btn--sm btn--ghost" to="/findings">
              View all
            </Link>
          </div>
          {findings.length === 0 ? (
            <p className="muted">No findings yet.</p>
          ) : (
            <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {findings.slice(0, 4).map((f) => (
                <li key={f.id}>
                  <Badge value={f.severity}>{f.severity}</Badge> <span>{f.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="row spread">
            <h2>Recent activity</h2>
            <Link className="btn btn--sm btn--ghost" to="/audit">
              Audit log
            </Link>
          </div>
          {audit.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {audit.map((a) => (
                <li key={a.id} className="muted" style={{ fontSize: '0.85rem' }}>
                  <code>{a.action}</code> <Badge value={a.severity}>{a.severity}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <h2>Next step</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ready to automate? Run the <strong>Slack Incident Alert</strong> skill against your mapped
          ops and get a handoff report.
        </p>
        <Link className="btn btn--primary" to="/runbook">
          Open the runbook →
        </Link>
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type { HandoffReport } from '@repo/contracts'
import { Badge, ErrorAlert, Spinner } from '../components/ui'

export function HandoffPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [report, setReport] = useState<HandoffReport | null>(null)
  const [hasRun, setHasRun] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const runId = sessionStorage.getItem('hermes.lastRunId')
    if (!runId) {
      setHasRun(false)
      return
    }
    api
      .getHandoff(orgId, runId)
      .then((r) => {
        // The mock returns a placeholder until the run reaches the handoff phase.
        setReport(r)
        setHasRun(Boolean(r.summary))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load handoff report'))
  }, [api, orgId])

  if (error) return <ErrorAlert message={error} />
  if (!hasRun) {
    return (
      <section>
        <h1>Handoff report</h1>
        <div className="empty">
          No completed skill run yet. Run a skill to the <strong>handoff</strong> phase to generate
          a report.
          <div style={{ marginTop: '1rem' }}>
            <Link className="btn btn--primary" to="/runbook">
              Go to the runbook →
            </Link>
          </div>
        </div>
      </section>
    )
  }
  if (!report) return <Spinner label="Loading handoff report…" />

  const steps = Array.isArray(report.steps) ? report.steps : []
  const owner = report.ownerAssignment as
    { assignee?: string; remainingManualSteps?: string[] } | undefined

  return (
    <section>
      <h1>Handoff report</h1>

      <div className="card">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Summary</h2>
          <Link className="btn btn--sm btn--ghost" to="/runbook">
            New run
          </Link>
        </div>
        <p style={{ marginTop: '0.6rem' }}>
          {report.summary || 'Run completed in simulation mode.'}
        </p>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          report <code>{report.id.slice(0, 8)}</code> · generated {report.created.slice(0, 10)}
        </p>
      </div>

      <div className="grid grid--2" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Steps</h2>
          {steps.length === 0 ? (
            <p className="muted">No steps captured.</p>
          ) : (
            <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {steps.map((s, i) => (
                <li key={i}>
                  <Badge value={String(s.status ?? 'pending')}>
                    {String(s.status ?? 'pending')}
                  </Badge>{' '}
                  {String(s.label ?? s.title ?? `Step ${i + 1}`)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2>Owner assignment</h2>
          {owner?.assignee && (
            <p>
              Assigned to: <Badge value="operator">{owner.assignee}</Badge>
            </p>
          )}
          <h3 style={{ fontSize: '0.95rem' }}>Remaining manual steps</h3>
          {owner?.remainingManualSteps?.length ? (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {owner.remainingManualSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None — fully automated in simulation.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Verification</h2>
        <pre
          className="card"
          style={{ overflowX: 'auto', fontSize: '0.8rem', background: 'var(--bg)', marginTop: 0 }}
        >
          {JSON.stringify(report.verification, null, 2)}
        </pre>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          This report is archived as an audit event. See the <Link to="/audit">audit log</Link> for
          the full trail of the run.
        </p>
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type { Finding, FindingSeverity, FindingStatus } from '@repo/contracts'
import { Badge, ErrorAlert, Spinner } from '../components/ui'

const SEV_ORDER: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const FILTERS: Array<FindingStatus | 'all'> = ['all', 'open', 'acknowledged', 'resolved']

export function FindingsPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [findings, setFindings] = useState<Finding[]>([])
  const [filter, setFilter] = useState<FindingStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    api
      .getFindings(orgId)
      .then((f) => {
        f.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
        setFindings(f)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load findings'))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, orgId])

  async function setStatus(f: Finding, status: FindingStatus) {
    setBusyId(f.id)
    setError(null)
    try {
      await api.updateFindingStatus(orgId, f.id, status)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorAlert message={error} />
  if (findings.length === 0) return <Spinner label="Loading findings…" />

  const visible = filter === 'all' ? findings : findings.filter((f) => f.status === filter)

  return (
    <section>
      <h1>Findings</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Analysis and skill-generated findings, ranked by severity. Findings linked to a skill can be
        resolved by running it.
      </p>

      <div className="row" style={{ margin: '1rem 0' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`btn btn--sm ${filter === f ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">No findings in this view.</div>
      ) : (
        <div className="stack">
          {visible.map((f) => (
            <article className="card" key={f.id}>
              <div className="row spread">
                <div className="row" style={{ gap: '0.5rem' }}>
                  <Badge value={f.severity}>{f.severity}</Badge>
                  <Badge value={f.status}>{f.status}</Badge>
                  <Badge value={f.sourceType}>{f.sourceType}</Badge>
                </div>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  {f.createdAt.slice(0, 10)}
                </span>
              </div>
              <h3 style={{ margin: '0.6rem 0 0.3rem' }}>{f.title}</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                {f.description}
              </p>
              <div className="row" style={{ gap: '0.5rem' }}>
                {f.status !== 'acknowledged' && (
                  <button
                    className="btn btn--sm"
                    disabled={busyId === f.id}
                    onClick={() => setStatus(f, 'acknowledged')}
                  >
                    Acknowledge
                  </button>
                )}
                {f.status !== 'resolved' && (
                  <button
                    className="btn btn--sm"
                    disabled={busyId === f.id}
                    onClick={() => setStatus(f, 'resolved')}
                  >
                    Resolve
                  </button>
                )}
                {f.suggestedSkillId && (
                  <Link className="btn btn--sm btn--ghost" to="/runbook">
                    Run suggested skill →
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

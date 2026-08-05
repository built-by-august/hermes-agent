import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type { Skill, SkillPhase, SkillRun } from '@repo/contracts'
import { Badge, ErrorAlert, Spinner } from '../components/ui'

const PHASES: SkillPhase[] = ['suggest', 'implement', 'wire', 'verify', 'handoff']
const PHASE_HELP: Record<SkillPhase, string> = {
  suggest: 'Inspects the mapped ops + findings and proposes steps.',
  implement: 'Generates the change (artifact) — not applied to a live system.',
  wire: 'Resolves connector endpoints + credential reference (encrypted).',
  verify: 'Runs simulated health checks; reports pass/fail/warn.',
  handoff: 'Composes the handoff report with owner assignment + audit trail.',
}

export function RunbookPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [skills, setSkills] = useState<Skill[]>([])
  const [run, setRun] = useState<SkillRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .listSkills(orgId)
      .then(setSkills)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load skills'))
  }, [api, orgId])

  async function startRun(skill: Skill) {
    setError(null)
    setBusy(true)
    setRun(null)
    try {
      const r = await api.startSkillRun(orgId, skill.id, { phase: 'suggest', input: {} })
      setRun(r)
      sessionStorage.setItem('hermes.lastRunId', r.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start skill run')
    } finally {
      setBusy(false)
    }
  }

  async function advance(phase: SkillPhase) {
    if (!run) return
    setError(null)
    setBusy(true)
    try {
      const r = await api.advanceSkillRun(orgId, run.id, phase)
      setRun(r)
      sessionStorage.setItem('hermes.lastRunId', r.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to advance')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorAlert message={error} />
  if (skills.length === 0) return <Spinner label="Loading skills…" />

  const currentIdx = run ? PHASES.indexOf(run.phase) : -1

  return (
    <section>
      <h1>Integration runbook</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Run a coded skill against your mapped operations in simulation mode. Each phase is logged to
        the audit trail. No live systems are touched in the MVP.
      </p>

      <div className="card">
        <h2>Available skills</h2>
        <div className="grid grid--2">
          {skills.map((s) => (
            <div className="stat" key={s.id}>
              <div className="row spread">
                <strong>{s.name}</strong>
                <Badge value={s.status}>{s.status}</Badge>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>
                {s.description}
              </p>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => startRun(s)}
                disabled={busy}
              >
                {run ? 'Restart run' : 'Run skill (suggest)'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {run && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>Skill run</h2>
          <div className="row spread">
            <span className="muted">
              run <code>{run.id.slice(0, 8)}</code> · dry-run ·{' '}
              <Badge value={run.status}>{run.status}</Badge>
            </span>
            <Link className="btn btn--sm btn--ghost" to="/audit">
              View audit trail
            </Link>
          </div>

          <div className="steps" style={{ marginTop: '1rem' }} aria-label="Lifecycle phases">
            {PHASES.map((p, i) => (
              <div
                key={p}
                className={`step ${i < currentIdx ? 'step--done' : ''} ${i === currentIdx ? 'step--current' : ''}`}
              >
                {i < currentIdx ? '✓ ' : ''}
                {p}
              </div>
            ))}
          </div>

          <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.6rem' }}>
            {PHASE_HELP[run.phase]}
          </p>

          {run.output && (
            <pre
              className="card"
              style={{
                overflowX: 'auto',
                fontSize: '0.8rem',
                background: 'var(--bg)',
                marginTop: '0.75rem',
              }}
            >
              {JSON.stringify(run.output, null, 2)}
            </pre>
          )}

          <div className="row" style={{ marginTop: '0.75rem' }}>
            {currentIdx < PHASES.length - 1 && (
              <button
                className="btn btn--primary"
                onClick={() => advance(PHASES[currentIdx + 1]!)}
                disabled={busy}
              >
                Advance to {PHASES[currentIdx + 1]}
              </button>
            )}
            {run.phase === 'handoff' && (
              <Link className="btn btn--primary" to="/handoff">
                View handoff report →
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

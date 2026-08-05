import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getApiClient } from '../lib/api'
import type { Connector, Membership, Organization } from '@repo/contracts'
import { Badge, ErrorAlert, Spinner } from '../components/ui'

const ROLE_HELP: Record<string, string> = {
  owner: 'Everything, including member management.',
  admin: 'Everything except ownership transfer.',
  operator: 'Map ops, run skills in sandbox, view audit.',
  auditor: 'Read-only org, audit, and findings.',
}

export function OrganizationPage() {
  const { orgId } = useAuth()
  const api = getApiClient()
  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Membership[]>([])
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.getOrg(orgId), api.listMembers(orgId), api.listConnectors(orgId)])
      .then(([o, m, c]) => {
        if (!active) return
        setOrg(o)
        setMembers(m)
        setConnectors(c)
        setName(o.name)
        setIndustry(o.industry ?? '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load organization'))
    return () => {
      active = false
    }
  }, [api, orgId])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      const updated = await api.updateOrg(orgId, {
        name,
        industry: industry || undefined,
        settings: org?.settings,
      })
      setOrg(updated)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  if (error) return <ErrorAlert message={error} />
  if (!org) return <Spinner label="Loading organization…" />

  return (
    <section>
      <h1>Organization setup</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Configure your organization and review who has access. Seeding demo data lives here in demo
        mode.
      </p>

      <form className="card" onSubmit={onSave}>
        <h2>Profile</h2>
        <div className="field">
          <label htmlFor="orgName">Organization name</label>
          <input
            id="orgName"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="industry">Industry</label>
          <input
            id="industry"
            className="input"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="professional-services"
          />
        </div>
        <div className="row">
          <button className="btn btn--primary" type="submit">
            Save changes
          </button>
          {saved && <span className="badge badge--ok">Saved</span>}
        </div>
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Members</h2>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <code>{m.userId.slice(0, 8)}</code>
                </td>
                <td>
                  <Badge value={m.role}>{m.role}</Badge>
                  <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                    {ROLE_HELP[m.role]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Connectors</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Wiring targets for skills. Credentials are never returned by the API.
        </p>
        <div className="grid grid--2">
          {connectors.map((c) => (
            <div className="stat" key={c.id}>
              <div className="row spread">
                <strong>{c.displayName}</strong>
                <Badge value={c.status}>{c.status}</Badge>
              </div>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                kind: {c.kind}
                {c.implemented ? '' : ' · stub (not implemented)'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

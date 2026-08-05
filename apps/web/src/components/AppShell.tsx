import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/org', label: 'Organization' },
  { to: '/map', label: 'Operations Map' },
  { to: '/findings', label: 'Findings' },
  { to: '/audit', label: 'Audit Log' },
  { to: '/runbook', label: 'Runbook' },
  { to: '/handoff', label: 'Handoff' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, demo, logout } = useAuth()
  const navigate = useNavigate()

  function onLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/dashboard" className="brand">
            <span className="brand__mark" aria-hidden="true" />
            Hermes Agent
          </NavLink>
          <nav className="app-nav" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="row" style={{ gap: '0.5rem' }}>
            {user && (
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {user.name}
              </span>
            )}
            <button className="btn btn--sm btn--ghost" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {demo && (
        <div className="demo-banner" role="status">
          <strong>Demo mode</strong>
          <span>
            — running against an in-memory mock backend with seeded data. No real services are
            touched.
          </span>
        </div>
      )}

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        <div className="app-footer__inner">
          Custom Hermes Agent · MVP · deploy → map → audit → suggest → implement → wire → verify →
          handoff
        </div>
      </footer>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DEMO_USER_ID } from '../lib/api/seed'

type Mode = 'login' | 'register'

export function AuthScreen() {
  const { login, register, demo } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('Dale Rutherford')
  const [email, setEmail] = useState('dale@example.com')
  const [password, setPassword] = useState('Str0ng!Pass')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(name, email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  function useDemo() {
    setEmail('dale@example.com')
    setPassword('Str0ng!Pass')
    void login('dale@example.com', 'Str0ng!Pass').catch(() => setError('Demo sign-in failed'))
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          Custom Hermes Agent
        </div>
        <div className="card">
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          {demo && (
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Demo mode — no backend required. Credentials are pre-filled with seeded data.
            </p>
          )}
          {error && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}
          <form onSubmit={onSubmit}>
            {mode === 'register' && (
              <div className="field">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
              />
            </div>
            <button
              className="btn btn--primary"
              type="submit"
              disabled={busy}
              style={{ width: '100%' }}
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="row spread" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Need an account?' : 'Have an account?'}
            </button>
            {demo && (
              <button type="button" className="btn btn--sm" onClick={useDemo}>
                Enter demo
              </button>
            )}
          </div>
        </div>
        <p
          className="muted"
          style={{ textAlign: 'center', fontSize: '0.78rem', marginTop: '0.9rem' }}
        >
          MVP demo · org id <code>{DEMO_USER_ID.slice(0, 8)}…</code>
        </p>
      </div>
    </div>
  )
}

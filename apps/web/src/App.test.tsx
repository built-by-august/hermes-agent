import { render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from './App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('App routing', () => {
  it('redirects "/" to the dashboard', () => {
    renderAt('/')
    // Auth-gated: without a token it sends unauthenticated users to /login.
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('protects routes behind auth (dashboard requires sign-in)', () => {
    renderAt('/dashboard')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders the auth screen with demo-mode affordance', () => {
    renderAt('/login')
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/demo mode/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter demo/i })).toBeInTheDocument()
  })

  it('lists the primary navigation destinations once authenticated', async () => {
    // Seed a demo token so the app shell (and its nav) renders.
    localStorage.setItem('hermes.accessToken', 'mock.demo.token')
    renderAt('/dashboard')

    const nav = await screen.findByRole('navigation', { name: /primary/i })
    const links = within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(links).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'Organization',
        'Operations Map',
        'Findings',
        'Audit Log',
        'Runbook',
        'Handoff',
      ])
    )
    // Dashboard content is present.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    )
  })
})

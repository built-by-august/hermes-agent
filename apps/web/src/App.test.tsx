import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the home page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /custom hermes agent/i })).toBeInTheDocument()
    expect(screen.getByText(/sample operation node/i)).toBeInTheDocument()
  })

  it('navigates to the dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
  })
})

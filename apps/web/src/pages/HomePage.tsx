import { Navigate } from 'react-router-dom'

/**
 * Landing route — redirects to the dashboard. Kept so `/` resolves under the
 * router and is covered by the App routing test.
 */
export function HomePage() {
  return <Navigate to="/dashboard" replace />
}

import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { AuthScreen } from './pages/AuthScreen'
import { DashboardPage } from './pages/DashboardPage'
import { OrganizationPage } from './pages/OrganizationPage'
import { OperationsMapPage } from './pages/OperationsMapPage'
import { FindingsPage } from './pages/FindingsPage'
import { AuditPage } from './pages/AuditPage'
import { RunbookPage } from './pages/RunbookPage'
import { HandoffPage } from './pages/HandoffPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="app-main muted">Loading…</div>
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />
  return <AppShell>{children}</AppShell>
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthScreen />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/org"
          element={
            <RequireAuth>
              <OrganizationPage />
            </RequireAuth>
          }
        />
        <Route
          path="/map"
          element={
            <RequireAuth>
              <OperationsMapPage />
            </RequireAuth>
          }
        />
        <Route
          path="/findings"
          element={
            <RequireAuth>
              <FindingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireAuth>
              <AuditPage />
            </RequireAuth>
          }
        />
        <Route
          path="/runbook"
          element={
            <RequireAuth>
              <RunbookPage />
            </RequireAuth>
          }
        />
        <Route
          path="/handoff"
          element={
            <RequireAuth>
              <HandoffPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}

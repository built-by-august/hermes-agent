import { Link, Route, Routes } from 'react-router-dom'

import { DashboardPage } from './pages/DashboardPage'
import { HomePage } from './pages/HomePage'

export function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/">Home</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </main>
    </div>
  )
}

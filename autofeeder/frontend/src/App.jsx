import React, { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { fmtClock } from './utils.js'
import { useClock } from './hooks.js'
import DashboardPage from './pages/DashboardPage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import ManualFeedPage from './pages/ManualFeedPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import AlarmsPage from './pages/AlarmsPage.jsx'
import AuditPage from './pages/AuditPage.jsx'
import DevicesPage from './pages/DevicesPage.jsx'

// Presentation build: no login, no accounts. Pages still receive this identity
// so their existing admin controls remain visible.
const DEMO_USER = { id: 1, username: 'Operator Demo', role: 'admin' }

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/jadwal', label: 'Jadwal' },
  { to: '/manual', label: 'Manual Feed' },
  { to: '/riwayat', label: 'Riwayat' },
  { to: '/alarm', label: 'Alarm' },
  { to: '/perangkat', label: 'Perangkat' },
  { to: '/audit', label: 'Audit Trail' },
]

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={DEMO_USER} />}>
          <Route index element={<DashboardPage user={DEMO_USER} />} />
          <Route path="jadwal" element={<SchedulesPage user={DEMO_USER} />} />
          <Route path="manual" element={<ManualFeedPage user={DEMO_USER} />} />
          <Route path="riwayat" element={<HistoryPage user={DEMO_USER} />} />
          <Route path="alarm" element={<AlarmsPage user={DEMO_USER} />} />
          <Route path="perangkat" element={<DevicesPage user={DEMO_USER} />} />
          <Route path="audit" element={<AuditPage user={DEMO_USER} />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Layout({ user }) {
  const now = useClock()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">AF</div>
          <div>
            <strong>AutoFeeder</strong>
            <div className="muted small">Rail Gantry 20 Kolam</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-line">
            <span>{user.username}</span>
            <span className="pill neutral">Mode Demo</span>
          </div>
          <div className="muted small">Data dummy untuk presentasi</div>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <button type="button" className="btn ghost mobile-toggle" onClick={() => setMenuOpen((open) => !open)}>
            Menu
          </button>
          <span className="topbar-title">Sistem Pakan Otomatis</span>
          <span className="clock" title="Waktu Indonesia Barat">
            {fmtClock(now)} WIB
          </span>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <footer className="app-foot muted small">
          AutoFeeder Rail Gantry · mode demo presentasi · semua waktu WIB
        </footer>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="card">
      <div className="card-body">
        <h2>Halaman tidak ditemukan</h2>
        <p className="muted">Gunakan menu di samping untuk kembali.</p>
      </div>
    </div>
  )
}

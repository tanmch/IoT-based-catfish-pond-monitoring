import React, { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { api, clearSession, getToken, getStoredUser } from './api.js'
import { fmtClock } from './utils.js'
import { useClock } from './hooks.js'
import { Alert, Modal, RoleBadge } from './components/ui.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import ManualFeedPage from './pages/ManualFeedPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import AlarmsPage from './pages/AlarmsPage.jsx'
import AuditPage from './pages/AuditPage.jsx'
import DevicesPage from './pages/DevicesPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/jadwal', label: 'Jadwal' },
  { to: '/manual', label: 'Manual Feed' },
  { to: '/riwayat', label: 'Riwayat' },
  { to: '/alarm', label: 'Alarm' },
  { to: '/perangkat', label: 'Perangkat' },
  { to: '/audit', label: 'Audit Trail', admin: true },
  { to: '/pengguna', label: 'Pengguna', admin: true },
]

export default function App() {
  const [user, setUser] = useState(getStoredUser())
  const [booting, setBooting] = useState(Boolean(getToken()))

  useEffect(() => {
    let active = true
    if (!getToken()) {
      setBooting(false)
      return undefined
    }
    api
      .me()
      .then((data) => {
        if (active) setUser(data)
      })
      .catch(() => {
        clearSession()
        if (active) setUser(null)
      })
      .finally(() => active && setBooting(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const handler = () => setUser(null)
    window.addEventListener('autofeeder:unauthorized', handler)
    return () => window.removeEventListener('autofeeder:unauthorized', handler)
  }, [])

  if (booting) {
    return <div className="boot">Memuat sesi…</div>
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />
  }

  const logout = () => {
    clearSession()
    setUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} onLogout={logout} />}>
          <Route index element={<DashboardPage user={user} />} />
          <Route path="jadwal" element={<SchedulesPage user={user} />} />
          <Route path="manual" element={<ManualFeedPage user={user} />} />
          <Route path="riwayat" element={<HistoryPage user={user} />} />
          <Route path="alarm" element={<AlarmsPage user={user} />} />
          <Route path="perangkat" element={<DevicesPage user={user} />} />
          <Route
            path="audit"
            element={
              <AdminOnly user={user}>
                <AuditPage user={user} />
              </AdminOnly>
            }
          />
          <Route
            path="pengguna"
            element={
              <AdminOnly user={user}>
                <UsersPage user={user} />
              </AdminOnly>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Layout({ user, onLogout }) {
  const now = useClock()
  const [menuOpen, setMenuOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const location = useLocation()
  const isAdmin = ['admin', 'pemilik'].includes(user.role)

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
          {NAV.filter((item) => !item.admin || isAdmin).map((item) => (
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
            <RoleBadge role={user.role} />
          </div>
          <div className="page-actions">
            <button type="button" className="btn sm" onClick={() => setPasswordOpen(true)}>
              Ganti password
            </button>
            <button type="button" className="btn sm" onClick={onLogout}>
              Keluar
            </button>
          </div>
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
          AutoFeeder Rail Gantry · mode {user.role === 'petani' ? 'operator' : user.role} · semua waktu WIB
        </footer>
      </div>

      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} onLogout={onLogout} />
    </div>
  )
}

function PasswordModal({ open, onClose, onLogout }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.changePassword({ current_password: current, new_password: next })
      setNotice('Password diubah. Sesi lama dicabut; silakan login kembali.')
      setCurrent('')
      setNext('')
      setTimeout(() => {
        onClose()
        onLogout()
      }, 1400)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Ganti password" onClose={onClose} footer={null}>
      <form className="form-stack" onSubmit={submit}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        <label className="field">
          <span className="field-label">Password saat ini</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Password baru</span>
          <input type="password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
          <span className="field-hint">Minimal 10 karakter. Semua sesi lama akan dicabut.</span>
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan password'}
        </button>
      </form>
    </Modal>
  )
}

function AdminOnly({ user, children }) {
  if (!['admin', 'pemilik'].includes(user.role)) return <Navigate to="/" replace />
  return children
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

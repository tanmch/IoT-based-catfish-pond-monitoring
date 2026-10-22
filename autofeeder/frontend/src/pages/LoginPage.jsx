import React, { useState } from 'react'
import { api, storeSession } from '../api.js'
import { Alert } from '../components/ui.jsx'

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api.login(identifier.trim(), password)
      storeSession(data.access_token, data.user)
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.register({ username: username.trim(), email: email.trim(), password })
      setNotice('Registrasi berhasil. Akun baru memiliki role Operator dan menunggu penugasan kolam.')
      setMode('login')
      setIdentifier(username.trim())
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-block">
          <div className="brand-mark">AF</div>
          <div>
            <h1>AutoFeeder Rail Gantry</h1>
            <p className="muted">Monitoring dan kendali pakan 20 kolam</p>
          </div>
        </div>

        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>
            Masuk
          </button>
          <button type="button" className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => setMode('register')}>
            Daftar
          </button>
        </div>

        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="form-stack">
            <label className="field">
              <span className="field-label">Username atau email</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" className="btn primary block" disabled={busy}>
              {busy ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="form-stack">
            <label className="field">
              <span className="field-label">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={50}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
              <span className="field-hint">Minimal 10 karakter.</span>
            </label>
            <button type="submit" className="btn primary block" disabled={busy}>
              {busy ? 'Mendaftar…' : 'Daftar sebagai Operator'}
            </button>
          </form>
        )}

        {import.meta.env.DEV ? (
          <details className="demo-hint">
            <summary>Akun demo lokal</summary>
            <p className="small">
              admin / Admin#12345 · pemilik / Pemilik#12345 · operator / Petani#12345
            </p>
          </details>
        ) : null}

        <p className="muted small login-foot">
          Aksi sensitif memerlukan login. Jangan bagikan kredensial perangkat.
        </p>
      </div>
    </main>
  )
}

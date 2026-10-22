import React, { useState } from 'react'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, Loading, Modal, PageHeader, RoleBadge } from '../components/ui.jsx'
import { ROLE_LABEL, fmtDateTime, label } from '../utils.js'

export default function UsersPage({ user: actor }) {
  const users = usePolling(api.users, 15000)
  const ponds = usePolling(api.availablePonds, 30000)
  const [createOpen, setCreateOpen] = useState(false)
  const [assignUser, setAssignUser] = useState(null)
  const [selectedPonds, setSelectedPonds] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isSuperAdmin = actor.role === 'admin'
  const pondList = ponds.data || []

  async function updateUser(target, payload) {
    setBusy(true)
    setError('')
    try {
      await api.updateUser(target.id, payload)
      setNotice(`User ${target.username} diperbarui.`)
      users.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function openAssign(target) {
    setAssignUser(target)
    setSelectedPonds(target.pond_ids || [])
  }

  async function saveAssignments() {
    if (!assignUser) return
    setBusy(true)
    setError('')
    try {
      await api.setUserPonds(assignUser.id, selectedPonds)
      setNotice(`Penugasan kolam ${assignUser.username} diperbarui.`)
      setAssignUser(null)
      users.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function togglePond(id) {
    setSelectedPonds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  const canModify = (target) => {
    if (target.id === actor.id) return false
    if (actor.role === 'pemilik' && target.role === 'admin') return false
    return true
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Pengguna & Penugasan"
        subtitle="Kelola role dan kolam yang boleh diakses operator. Semua perubahan masuk audit trail."
        actions={<button type="button" className="btn primary sm" onClick={() => setCreateOpen(true)}>Tambah pengguna</button>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Card title="Daftar pengguna">
        {users.loading && !users.data ? (
          <Loading />
        ) : users.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Aktif</th>
                  <th>Kolam</th>
                  <th>Login terakhir</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((target) => {
                  const editable = canModify(target)
                  return (
                    <tr key={target.id}>
                      <td>
                        <strong>{target.username}</strong>
                        {target.id === actor.id ? <span className="muted small"> (Anda)</span> : null}
                      </td>
                      <td>{target.email}</td>
                      <td>
                        {editable ? (
                          <select
                            value={target.role}
                            disabled={busy}
                            onChange={(e) => updateUser(target, { role: e.target.value })}
                          >
                            {isSuperAdmin ? <option value="admin">Admin</option> : null}
                            <option value="pemilik">Pemilik</option>
                            <option value="petani">Operator</option>
                          </select>
                        ) : (
                          <RoleBadge role={target.role} />
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <label className="check-inline">
                            <input
                              type="checkbox"
                              checked={target.is_active}
                              disabled={busy}
                              onChange={(e) => updateUser(target, { is_active: e.target.checked })}
                            />
                            <span>{target.is_active ? 'Aktif' : 'Nonaktif'}</span>
                          </label>
                        ) : (
                          <span>{target.is_active ? 'Aktif' : 'Nonaktif'}</span>
                        )}
                      </td>
                      <td>{target.pond_ids?.length || 0} kolam</td>
                      <td>{fmtDateTime(target.last_login_at)}</td>
                      <td>
                        <button type="button" className="btn sm" onClick={() => openAssign(target)} disabled={!editable && target.id !== actor.id}>
                          Atur kolam
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada pengguna.</Empty>
        )}
      </Card>

      <Card title="Matriks akses" subtitle="Ringkasan kebijakan saat ini">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Aksi</th><th>Admin</th><th>Pemilik</th><th>Operator</th></tr>
            </thead>
            <tbody>
              <tr><td>Lihat dashboard & monitoring</td><td>Ya</td><td>Ya</td><td>Kolam ditugaskan</td></tr>
              <tr><td>Manual feed</td><td>Ya</td><td>Ya</td><td>Kolam ditugaskan</td></tr>
              <tr><td>Ubah jadwal global/baris</td><td>Ya</td><td>Ya</td><td>Tidak</td></tr>
              <tr><td>Ubah jadwal kolam sendiri</td><td>Ya</td><td>Ya</td><td>Ya</td></tr>
              <tr><td>Kelola stok pakan</td><td>Ya</td><td>Ya</td><td>Tidak</td></tr>
              <tr><td>E-stop</td><td>Ya</td><td>Ya</td><td>Ya</td></tr>
              <tr><td>Reset / home</td><td>Ya</td><td>Ya</td><td>Tidak</td></tr>
              <tr><td>Audit trail & pengguna</td><td>Ya</td><td>Ya</td><td>Tidak</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <CreateUserModal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        isSuperAdmin={isSuperAdmin}
        onCreated={() => {
          setNotice('Pengguna baru dibuat.')
          users.refresh()
        }}
        onError={setError}
        busy={busy}
        setBusy={setBusy}
      />

      <Modal
        open={!!assignUser}
        title={`Atur kolam · ${assignUser?.username || ''}`}
        subtitle="Operator hanya melihat dan mengendalikan kolam yang dicentang."
        onClose={() => !busy && setAssignUser(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAssignUser(null)} disabled={busy}>Batal</button>
            <button type="button" className="btn primary" onClick={saveAssignments} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan penugasan'}
            </button>
          </>
        }
      >
        <div className="assign-grid">
          {['left', 'right'].map((side) => (
            <div key={side}>
              <h3>Baris {label(side)}</h3>
              {pondList.filter((pond) => pond.side === side).map((pond) => (
                <label key={pond.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedPonds.includes(pond.id)}
                    onChange={() => togglePond(pond.id)}
                  />
                  <span>{pond.name} <span className="muted small">#{pond.pond_index}</span></span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="page-actions">
          <button type="button" className="btn sm" onClick={() => setSelectedPonds(pondList.map((p) => p.id))}>
            Pilih semua
          </button>
          <button type="button" className="btn sm" onClick={() => setSelectedPonds([])}>
            Kosongkan
          </button>
        </div>
      </Modal>
    </div>
  )
}

function CreateUserModal({ open, onClose, isSuperAdmin, onCreated, onError, busy, setBusy }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'petani' })
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createUser(form)
      setForm({ username: '', email: '', password: '', role: 'petani' })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Tambah pengguna" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="form-grid">
          <Field label="Username">
            <input value={form.username} minLength={3} maxLength={50} required onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" hint="Minimal 10 karakter.">
            <input type="password" value={form.password} minLength={10} required onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {isSuperAdmin ? <option value="admin">Admin</option> : null}
              <option value="pemilik">Pemilik</option>
              <option value="petani">Operator</option>
            </select>
          </Field>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Batal</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Buat pengguna'}</button>
        </div>
      </form>
    </Modal>
  )
}

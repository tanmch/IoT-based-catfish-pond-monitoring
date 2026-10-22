import React, { useState } from 'react'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, Loading, Modal, PageHeader, SeverityPill, StatusPill } from '../components/ui.jsx'
import { fmtDateTime, label } from '../utils.js'

const TYPES = [
  'DEVICE_OFFLINE',
  'HOPPER_EMPTY',
  'HOPPER_TEMPERATURE',
  'HOPPER_HUMIDITY',
  'POWER_VOLTAGE',
  'MOTOR_CURRENT',
  'GANTRY_FAULT',
  'EMERGENCY_STOP',
  'FEED_STOCK_LOW',
  'FEEDING_FAILED',
  'COMMAND_EXPIRED',
  'PORTION_DEVIATION',
  'PORTION_INVALID',
]

export default function AlarmsPage() {
  const [filters, setFilters] = useState({ status: '', alarm_type: '' })
  const alarms = usePolling(
    () => api.alarms({ ...filters, limit: 200 }),
    10000,
    [filters.status, filters.alarm_type],
  )
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit() {
    if (!action) return
    setBusy(true)
    setError('')
    try {
      if (action.type === 'ack') await api.acknowledgeAlarm(action.alarm.id, note || null)
      else await api.resolveAlarm(action.alarm.id, note || null)
      setNotice(action.type === 'ack' ? 'Alarm diakui.' : 'Alarm diselesaikan.')
      setAction(null)
      setNote('')
      alarms.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const data = alarms.data

  return (
    <div className="page-stack">
      <PageHeader
        title="Alarm & Fault"
        subtitle="Alarm kritis dan peringatan operasional; aksi tercatat pada audit trail."
        actions={<button type="button" className="btn sm" onClick={alarms.refresh}>Muat ulang</button>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="stat-grid">
        <div className="stat tone-danger">
          <div className="stat-label">Terbuka</div>
          <div className="stat-value">{data?.open_count ?? '—'}</div>
          <div className="stat-hint">Belum diakui</div>
        </div>
        <div className="stat tone-warn">
          <div className="stat-label">Diakui</div>
          <div className="stat-value">{data?.acknowledged_count ?? '—'}</div>
          <div className="stat-hint">Sedang ditangani</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total tampil</div>
          <div className="stat-value">{data?.total ?? '—'}</div>
          <div className="stat-hint">Sesuai filter</div>
        </div>
      </div>

      <Card>
        <div className="filter-grid">
          <Field label="Status">
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Semua status</option>
              <option value="open">Terbuka</option>
              <option value="acknowledged">Diakui</option>
              <option value="resolved">Selesai</option>
            </select>
          </Field>
          <Field label="Jenis alarm">
            <select value={filters.alarm_type} onChange={(e) => setFilters({ ...filters, alarm_type: e.target.value })}>
              <option value="">Semua jenis</option>
              {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Daftar alarm" subtitle="Diperbarui otomatis setiap 10 detik">
        {alarms.loading && !data ? (
          <Loading />
        ) : data?.items?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Tingkat</th>
                  <th>Jenis</th>
                  <th>Pesan</th>
                  <th>Kolam</th>
                  <th>Status</th>
                  <th>Diakui</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((alarm) => (
                  <tr key={alarm.id}>
                    <td>{fmtDateTime(alarm.detected_at)}</td>
                    <td><SeverityPill severity={alarm.severity} /></td>
                    <td><code>{alarm.alarm_type}</code></td>
                    <td>{alarm.message}</td>
                    <td>{alarm.pond_name || 'Perangkat'}</td>
                    <td><StatusPill status={alarm.status} /></td>
                    <td>{alarm.acknowledged_at ? fmtDateTime(alarm.acknowledged_at) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        {alarm.status === 'open' ? (
                          <button type="button" className="btn sm" onClick={() => { setAction({ type: 'ack', alarm }); setNote('') }}>
                            Akui
                          </button>
                        ) : null}
                        {alarm.status !== 'resolved' ? (
                          <button type="button" className="btn sm" onClick={() => { setAction({ type: 'resolve', alarm }); setNote('') }}>
                            Selesaikan
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Tidak ada alarm pada filter ini.</Empty>
        )}
      </Card>

      <Modal
        open={!!action}
        title={action?.type === 'ack' ? 'Akui alarm?' : 'Selesaikan alarm?'}
        onClose={() => !busy && setAction(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAction(null)} disabled={busy}>Batal</button>
            <button type="button" className="btn primary" onClick={submit} disabled={busy}>
              {busy ? 'Menyimpan…' : action?.type === 'ack' ? 'Akui alarm' : 'Selesaikan'}
            </button>
          </>
        }
      >
        {action ? (
          <div className="form-stack">
            <p><strong>{action.alarm.alarm_type}</strong> — {action.alarm.message}</p>
            <p className="muted small">
              Menyelesaikan alarm tidak otomatis memperbaiki kondisi fisik. Pastikan penyebab sudah ditangani.
            </p>
            <Field label="Catatan penanganan (opsional)">
              <input value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

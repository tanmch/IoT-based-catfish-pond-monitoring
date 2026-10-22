import React, { useState } from 'react'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, InfoRow, Loading, Modal, PageHeader, StatusPill } from '../components/ui.jsx'
import { fmtDateTime, fmtNumber, label, relativeTime, todayInput } from '../utils.js'

export default function DevicesPage({ user }) {
  const devices = usePolling(api.devices, 5000)
  const config = usePolling(api.deviceConfig, 30000)
  const [limit, setLimit] = useState(200)
  const telemetry = usePolling(() => api.telemetry({ limit }), 10000, [limit])
  const [rotateOpen, setRotateOpen] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [homeOpen, setHomeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const isAdmin = ['admin', 'pemilik'].includes(user.role)
  const isSuperAdmin = user.role === 'admin'
  const device = devices.data?.[0]

  async function rotate() {
    setBusy(true)
    setError('')
    try {
      const result = await api.rotateDeviceKey(device.device_id)
      setNewKey(result.api_key)
      setNotice('API key perangkat berhasil dirotasi. Key lama langsung tidak berlaku.')
      devices.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function sendHome() {
    setBusy(true)
    setError('')
    try {
      await api.homeDevice()
      setNotice('Perintah home dikirim ke perangkat.')
      setHomeOpen(false)
      devices.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function exportTelemetry() {
    setBusy(true)
    try {
      await api.download('/devices/telemetry/export.csv', `telemetry-${todayInput()}.csv`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Perangkat & Telemetry"
        subtitle="Status ESP32-S3, konfigurasi offline-first, dan data sensor mentah."
        actions={
          <>
            {isAdmin ? <button type="button" className="btn sm" disabled={!device} onClick={() => setHomeOpen(true)}>Home</button> : null}
            <button type="button" className="btn sm" onClick={() => { devices.refresh(); config.refresh(); telemetry.refresh() }}>
              Muat ulang
            </button>
          </>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" onClose={() => setNotice('')}>{notice}</Alert> : null}

      {devices.loading && !devices.data ? (
        <Loading />
      ) : device ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Perangkat</div>
              <div className="stat-value small-value">{device.device_id}</div>
              <div className="stat-hint">{device.name}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Koneksi</div>
              <div className="stat-value small-value"><StatusPill status={device.status} /></div>
              <div className="stat-hint">{relativeTime(device.last_seen_at)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">State gantry</div>
              <div className="stat-value small-value">{label(device.state)}</div>
              <div className="stat-hint">{device.gantry_pond_index ? `Kolam #${device.gantry_pond_index}` : 'Posisi belum diketahui'}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Firmware</div>
              <div className="stat-value small-value">{device.firmware_version || '—'}</div>
              <div className="stat-hint">Config v{device.config_version}</div>
            </div>
          </div>

          <div className="two-col">
            <Card title="Informasi perangkat" subtitle="API key hanya ditampilkan sekali saat rotasi">
              <div className="info-grid single">
                <InfoRow label="Device ID" value={device.device_id} />
                <InfoRow label="Nama" value={device.name} />
                <InfoRow label="Status" value={<StatusPill status={device.status} />} />
                <InfoRow label="Terakhir terlihat" value={fmtDateTime(device.last_seen_at)} />
                <InfoRow label="API key hint" value={<code>{device.api_key_hint}…</code>} />
                <InfoRow label="Perintah pending" value={device.pending_commands} />
                <InfoRow label="Config version" value={device.config_version} />
              </div>
              {isSuperAdmin ? (
                <button type="button" className="btn" onClick={() => { setRotateOpen(true); setNewKey('') }}>
                  Rotasi API key
                </button>
              ) : null}
            </Card>

            <Card title="Konfigurasi tersinkron" subtitle="Perangkat menyimpan konfigurasi ini di NVS">
              {config.data ? (
                <>
                  <div className="info-grid single">
                    <InfoRow label="Versi konfigurasi" value={config.data.config_version} />
                    <InfoRow label="Versi di perangkat" value={config.data.known_version} />
                    <InfoRow label="Perlu update" value={config.data.changed ? 'Ya' : 'Tidak'} />
                    <InfoRow label="Jumlah jadwal" value={config.data.schedules?.length ?? 0} />
                    <InfoRow label="Gram per putaran" value={`${fmtNumber(config.data.limits?.grams_per_rotation, 0)} g`} />
                    <InfoRow label="Maks porsi" value={`${fmtNumber(config.data.limits?.max_portion_grams, 0)} g`} />
                  </div>
                  <p className="muted small">Dibuat {fmtDateTime(config.data.generated_at)}. Perangkat memakai konfigurasi terakhir saat offline.</p>
                </>
              ) : (
                <Empty>Belum ada konfigurasi.</Empty>
              )}
            </Card>
          </div>

          <Card
            title="Telemetry mentah"
            subtitle="Suhu/kelembapan/tekanan hopper, daya, dan arus DC"
            actions={
              <div className="page-actions">
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Jumlah baris">
                  <option value={100}>100 baris</option>
                  <option value={200}>200 baris</option>
                  <option value={500}>500 baris</option>
                </select>
                <button type="button" className="btn sm" disabled={busy} onClick={exportTelemetry}>Ekspor CSV</button>
              </div>
            }
          >
            {telemetry.loading && !telemetry.data ? (
              <Loading />
            ) : telemetry.data?.items?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Kolam</th>
                      <th>State</th>
                      <th>Suhu °C</th>
                      <th>RH %</th>
                      <th>Tekanan kPa</th>
                      <th>Pakan</th>
                      <th>Sisa kg</th>
                      <th>Tegangan V</th>
                      <th>Daya W</th>
                      <th>Arus DC A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.data.items.map((row) => (
                      <tr key={row.id}>
                        <td>{fmtDateTime(row.recorded_at)}</td>
                        <td>{row.pond_index ?? '—'}</td>
                        <td>{row.gantry_state ? label(row.gantry_state) : '—'}</td>
                        <td>{fmtNumber(row.environment.temperature_c, 1)}</td>
                        <td>{fmtNumber(row.environment.humidity_pct, 0)}</td>
                        <td>{fmtNumber(row.environment.pressure_kpa, 1)}</td>
                        <td>{row.hopper.feed_present === null ? '—' : row.hopper.feed_present ? 'Ada' : 'Kosong'}</td>
                        <td>{fmtNumber(row.hopper.remaining_kg, 2)}</td>
                        <td>{fmtNumber(row.power.voltage_v, 1)}</td>
                        <td>{fmtNumber(row.power.power_w, 0)}</td>
                        <td>{fmtNumber(row.power.dc_current_a, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Belum ada telemetry. Jalankan simulator perangkat.</Empty>
            )}
          </Card>
        </>
      ) : (
        <Empty>Belum ada perangkat terdaftar.</Empty>
      )}

      <Modal
        open={rotateOpen}
        title="Rotasi API key perangkat"
        onClose={() => !busy && setRotateOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setRotateOpen(false)} disabled={busy}>Tutup</button>
            {!newKey ? (
              <button type="button" className="btn danger" onClick={rotate} disabled={busy}>
                {busy ? 'Merotasi…' : 'Ya, rotasi key'}
              </button>
            ) : null}
          </>
        }
      >
        {!newKey ? (
          <div className="form-stack">
            <Alert tone="warn">
              Key lama akan langsung ditolak. Perbarui firmware/perangkat sebelum perangkat melakukan poll berikutnya.
            </Alert>
            <p>Rotasi hanya dapat dilakukan oleh admin. Key baru ditampilkan satu kali.</p>
          </div>
        ) : (
          <div className="form-stack">
            <Alert tone="ok">Key baru dibuat. Salin sekarang; key tidak dapat ditampilkan lagi.</Alert>
            <Field label="API key perangkat">
              <input readOnly value={newKey} onFocus={(e) => e.target.select()} />
            </Field>
            <button
              type="button"
              className="btn"
              onClick={() => navigator.clipboard?.writeText(newKey)}
            >
              Salin key
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={homeOpen}
        title="Kirim perintah home?"
        onClose={() => !busy && setHomeOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setHomeOpen(false)} disabled={busy}>Batal</button>
            <button type="button" className="btn primary" onClick={sendHome} disabled={busy}>
              {busy ? 'Mengirim…' : 'Kirim'}
            </button>
          </>
        }
      >
        <p>Pastikan area rail bebas. Gantry akan bergerak ke home position.</p>
      </Modal>
    </div>
  )
}

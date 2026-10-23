import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, Loading, Modal, PageHeader, StatusPill } from '../components/ui.jsx'
import { fmtDateTime, fmtGrams, fmtKg, fmtNumber, label, relativeTime } from '../utils.js'

function idempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function ManualFeedPage({ user }) {
  const ponds = usePolling(api.ponds, 15000)
  const feeds = usePolling(api.feeds, 10000)
  const devices = usePolling(api.devices, 5000)
  const config = usePolling(api.deviceConfig, 30000)
  const commands = usePolling(() => api.commands({ limit: 50 }), 3000)
  const [form, setForm] = useState({ pond_id: '', portion_grams: 1000, note: '' })
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const pondList = ponds.data || []
  const device = devices.data?.[0]
  const online = device?.status === 'online'
  const isAdmin = ['admin', 'pemilik'].includes(user.role)
  const commandTtl = config.data?.limits?.command_ttl_seconds || 120
  const gramsPerRotation = config.data?.limits?.grams_per_rotation || 200
  const maxGrams = config.data?.limits?.max_manual_portion_grams || 5000
  const selectedPond = pondList.find((p) => String(p.id) === String(form.pond_id))
  const grams = Number(form.portion_grams) || 0
  const rotations = grams > 0 ? Math.round((grams / gramsPerRotation) * 100) / 100 : 0
  const available = feeds.data?.available_kg ?? 0
  const hopper = device?.latest_telemetry?.hopper
  const insufficient = grams / 1000 > available
  const hopperInsufficient = hopper?.remaining_kg !== null && hopper?.remaining_kg !== undefined && grams / 1000 > hopper.remaining_kg

  const pending = useMemo(
    () => (commands.data?.items || []).filter((c) => ['pending', 'delivered'].includes(c.status)),
    [commands.data],
  )

  function prepare(event) {
    event.preventDefault()
    setError('')
    if (!online) {
      setError('Perangkat offline. Manual feed tidak dapat dikirim.')
      return
    }
    if (!selectedPond) {
      setError('Pilih kolam target.')
      return
    }
    if (grams <= 0 || grams > maxGrams) {
      setError(`Porsi harus 1–${maxGrams} gram.`)
      return
    }
    if (insufficient) {
      setError(`Stok pakan tidak cukup (tersedia ${fmtKg(available)}).`)
      return
    }
    setConfirm({
      key: idempotencyKey(),
      pond: selectedPond,
      grams,
      rotations,
      note: form.note,
    })
  }

  async function submit() {
    if (!confirm) return
    setBusy(true)
    setError('')
    try {
      const result = await api.manualFeed({
        pond_id: confirm.pond.id,
        portion_grams: confirm.grams,
        confirm: true,
        note: confirm.note || null,
        idempotency_key: confirm.key,
      })
      setNotice(
        `Perintah manual feed ${fmtGrams(confirm.grams)} untuk ${confirm.pond.name} masuk antrean (${result.command.command_uid.slice(0, 8)}).`,
      )
      setConfirm(null)
      commands.refresh()
      feeds.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(command) {
    setBusy(true)
    setError('')
    try {
      await api.cancelCommand(command.command_uid)
      setNotice('Perintah dibatalkan.')
      commands.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Manual Feed"
        subtitle="Kirim porsi terukur ke satu kolam. Perintah menunggu langkah aktif gantry selesai."
        actions={<Link className="btn sm" to="/riwayat">Riwayat feeding</Link>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {!online ? (
        <Alert tone="warn" title="Perangkat offline">
          {relativeTime(device?.last_seen_at)}. Manual feed diblokir sampai perangkat mengirim heartbeat.
        </Alert>
      ) : null}

      <div className="two-col">
        <Card title="Perintah manual" subtitle="Konfirmasi popup wajib; command ID mencegah eksekusi ganda">
          <form className="form-stack" onSubmit={prepare}>
            <Field label="Kolam target">
              <select
                value={form.pond_id}
                onChange={(e) => setForm({ ...form, pond_id: e.target.value })}
                required
              >
                <option value="">Pilih kolam…</option>
                {pondList.map((pond) => (
                  <option key={pond.id} value={pond.id}>
                    {pond.name} · {label(pond.side)} #{pond.pond_index} · biomassa {fmtNumber(pond.biomass_kg, 0)} kg
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Porsi (gram)"
              hint={`${fmtNumber(gramsPerRotation, 0)} g ≈ 1 putaran rotary · estimasi ${fmtNumber(rotations, 2)} putaran`}
            >
              <input
                type="number"
                min="1"
                max={maxGrams}
                step="1"
                value={form.portion_grams}
                onChange={(e) => setForm({ ...form, portion_grams: e.target.value })}
                required
              />
            </Field>
            <Field label="Catatan (opsional)">
              <input
                value={form.note}
                maxLength={255}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Contoh: tambahan sore"
              />
            </Field>

            <div className="summary-box">
              <div className="info-row"><span>Stok tersedia</span><strong>{fmtKg(available)}</strong></div>
              <div className="info-row"><span>Sisa hopper</span><strong>{fmtKg(hopper?.remaining_kg)}</strong></div>
              <div className="info-row"><span>Porsi</span><strong>{fmtGrams(grams)} · {fmtNumber(rotations, 2)} putaran</strong></div>
              <div className="info-row"><span>Sisi diverter</span><strong>{selectedPond ? label(selectedPond.side) : '—'}</strong></div>
            </div>

            {insufficient ? <Alert tone="danger">Stok pakan tidak cukup. Lakukan pembelian/refill stok terlebih dahulu.</Alert> : null}
            {hopperInsufficient ? <Alert tone="warn">Hopper tidak cukup. Lakukan refill hopper manual.</Alert> : null}

            <button type="submit" className="btn primary" disabled={!online || !pondList.length}>
              Lanjut ke konfirmasi
            </button>
          </form>
        </Card>

        <Card title="Status perangkat" subtitle={device?.device_id || 'Belum ada perangkat'}>
          <div className="info-grid single">
            <div className="info-row"><span>Status</span><StatusPill status={online ? 'online' : 'offline'} /></div>
            <div className="info-row"><span>State</span><span>{device?.state ? label(device.state) : '—'}</span></div>
            <div className="info-row"><span>Posisi gantry</span><span>{device?.gantry_pond_index ? `Kolam #${device.gantry_pond_index}` : '—'}</span></div>
            <div className="info-row"><span>Terakhir terlihat</span><span>{relativeTime(device?.last_seen_at)}</span></div>
            <div className="info-row"><span>Firmware</span><span>{device?.firmware_version || '—'}</span></div>
            <div className="info-row"><span>Perintah pending</span><span>{device?.pending_commands ?? 0}</span></div>
            <div className="info-row"><span>Config version</span><span>{device?.config_version ?? '—'}</span></div>
          </div>
          <p className="muted small">
            Manual feed diprioritaskan setelah langkah gantry yang sedang berjalan selesai. Porsi aktual dilaporkan perangkat saat ACK.
          </p>
        </Card>
      </div>

      <Card
        title="Antrean & perintah terbaru"
        subtitle="Diperbarui otomatis setiap 3 detik"
        actions={<button type="button" className="btn sm" onClick={commands.refresh}>Muat ulang</button>}
      >
        {commands.loading && !commands.data ? (
          <Loading />
        ) : commands.data?.items?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Kolam</th>
                  <th>Jenis</th>
                  <th>Porsi</th>
                  <th>Status</th>
                  <th>Berlaku sampai</th>
                  <th>Command</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {commands.data.items.map((command) => (
                  <tr key={command.command_uid}>
                    <td>{fmtDateTime(command.issued_at)}</td>
                    <td>{command.pond_name || (command.pond_id ? `#${command.pond_id}` : 'Perangkat')}</td>
                    <td>{command.kind === 'feed' ? 'Feeding' : command.kind === 'emergency_stop' ? 'E-Stop' : command.kind === 'home' ? 'Home' : command.kind === 'reset' ? 'Reset' : command.kind}</td>
                    <td>{command.payload?.portion_grams ? fmtGrams(command.payload.portion_grams) : '—'}</td>
                    <td><StatusPill status={command.status} /></td>
                    <td>{fmtDateTime(command.expires_at)}</td>
                    <td><code>{command.command_uid.slice(0, 10)}</code></td>
                    <td>
                      {command.kind === 'feed'
                        && ['pending', 'delivered'].includes(command.status)
                        && (isAdmin || command.issued_by === user.id) ? (
                        <button type="button" className="btn sm" disabled={busy} onClick={() => cancel(command)}>
                          Batalkan
                        </button>
                      ) : (
                        <span className="muted small">{command.error || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada perintah.</Empty>
        )}
        {pending.length ? <p className="muted small">{pending.length} perintah belum dieksekusi.</p> : null}
      </Card>

      <Modal
        open={!!confirm}
        title="Konfirmasi manual feed"
        onClose={() => !busy && setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={busy}>Batal</button>
            <button type="button" className="btn primary" onClick={submit} disabled={busy}>
              {busy ? 'Mengirim…' : 'Kirim perintah'}
            </button>
          </>
        }
      >
        {confirm ? (
          <div className="form-stack">
            <p>Perangkat sedang <strong>{label(device?.state)}</strong>. Perintah akan dieksekusi setelah langkah aktif selesai.</p>
            <div className="summary-box">
              <div className="info-row"><span>Kolam</span><strong>{confirm.pond.name} ({label(confirm.pond.side)})</strong></div>
              <div className="info-row"><span>Porsi</span><strong>{fmtGrams(confirm.grams)}</strong></div>
              <div className="info-row"><span>Rotary</span><strong>{fmtNumber(confirm.rotations, 2)} putaran</strong></div>
              <div className="info-row"><span>Command ID</span><code>{confirm.key.slice(0, 20)}</code></div>
            </div>
            <p className="muted small">Perintah kedaluwarsa dalam {Math.round(commandTtl / 60)} menit jika tidak di-ACK. Jangan kirim ulang sebelum status jelas.</p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Card, Empty, Field, InfoRow, Loading, Modal, PageHeader, SeverityPill, Stat, StatusPill, Alert } from '../components/ui.jsx'
import { GantryMap } from '../components/GantryMap.jsx'
import { LineChart } from '../components/charts.jsx'
import { fmtDateTime, fmtGrams, fmtKg, fmtNumber, label, relativeTime, toneForStatus } from '../utils.js'

export default function DashboardPage({ user }) {
  const { data, error, loading, refresh } = usePolling(api.dashboard, 3000)
  const [selectedPond, setSelectedPond] = useState(null)
  const [action, setAction] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')

  const activeAlarms = data?.alarms || []
  const criticalAlarms = activeAlarms.filter((alarm) => alarm.severity === 'critical')
  const online = data?.device?.status === 'online'
  const isAdmin = ['admin', 'pemilik'].includes(user.role)

  const todayItems = useMemo(() => {
    const counts = data?.today?.counts || {}
    return [
      { label: 'Direncanakan', value: counts.planned || 0, tone: 'neutral' },
      { label: 'Selesai', value: counts.dispensed || 0, tone: 'ok' },
      { label: 'Dilewati', value: counts.skipped || 0, tone: 'warn' },
      { label: 'Gagal', value: counts.failed || 0, tone: 'danger' },
    ]
  }, [data])

  async function runAction() {
    if (!action) return
    setBusy(true)
    setActionError('')
    try {
      if (action === 'estop') await api.estop(reason)
      if (action === 'reset') await api.resetDevice()
      if (action === 'home') await api.homeDevice()
      setNotice(
        action === 'estop'
          ? 'Emergency stop dikirim. Tunggu ACK perangkat.'
          : action === 'reset'
            ? 'Perintah reset/validasi keamanan dikirim.'
            : 'Perintah kembali ke home dikirim.',
      )
      setAction(null)
      setReason('')
      refresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) {
    return <Loading />
  }

  if (!data) {
    return (
      <div className="page-stack">
        <PageHeader title="Dashboard" />
        <Alert tone="danger" title="Gagal memuat dashboard">{error?.message || 'Coba muat ulang.'}</Alert>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Dashboard"
        subtitle={`Ringkasan operasional · ${fmtDateTime(data.generated_at)} WIB`}
        actions={
          <>
            <button type="button" className="btn sm" onClick={refresh}>Muat ulang</button>
            <button type="button" className="btn danger sm" disabled={!online || busy} onClick={() => setAction('estop')}>
              E-Stop
            </button>
          </>
        }
      />

      {notice ? <Alert tone="ok" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {actionError ? <Alert tone="danger" onClose={() => setActionError('')}>{actionError}</Alert> : null}
      {!online ? (
        <Alert tone="warn" title="Perangkat offline">
          Data terakhir {relativeTime(data.device?.last_seen_at)}. Manual feed dan perintah kendali dinonaktifkan sampai perangkat terhubung kembali. Perangkat tetap menjalankan jadwal lokalnya.
        </Alert>
      ) : null}
      {criticalAlarms.length ? (
        <Alert tone="danger" title={`${criticalAlarms.length} alarm kritis aktif`}>
          {criticalAlarms[0].message} <Link to="/alarm">Lihat semua alarm</Link>
        </Alert>
      ) : null}

      <div className="stat-grid">
        <Stat
          label="Status perangkat"
          value={online ? 'Online' : 'Offline'}
          hint={`${data.device?.state ? label(data.device.state) : '—'} · ${relativeTime(data.device?.last_seen_at)}`}
          tone={online ? 'ok' : 'danger'}
        />
        <Stat
          label="Stok pakan"
          value={fmtKg(data.feed.available_kg)}
          hint={`Total ${fmtKg(data.feed.stock_kg)} · dipesan ${fmtKg(data.feed.reserved_kg)}`}
          tone={data.feed.available_kg <= 0 ? 'danger' : 'neutral'}
        />
        <Stat
          label="Hopper"
          value={`${fmtNumber(data.telemetry?.hopper?.level_percent, 0)}%`}
          hint={`Sisa ${fmtKg(data.telemetry?.hopper?.remaining_kg)} · ${data.telemetry?.hopper?.feed_present === false ? 'pakan tidak terdeteksi' : 'pakan terdeteksi'}`}
          tone={data.telemetry?.hopper?.feed_present === false ? 'danger' : 'neutral'}
        />
        <Stat
          label="Perkiraan stok"
          value={data.feed.days_estimate === null ? '—' : `${fmtNumber(data.feed.days_estimate, 1)} hari`}
          hint={`Rencana ${fmtKg(data.feed.daily_plan_kg)}/hari`}
        />
        <Stat
          label="Feeding hari ini"
          value={`${data.today.counts.dispensed || 0} / ${data.today.planned || 0}`}
          hint={`${fmtGrams(data.today.dispensed_grams)} pakan keluar`}
        />
        <Stat
          label="Alarm aktif"
          value={activeAlarms.length}
          hint={`${activeAlarms.filter((a) => a.status === 'open').length} belum diakui`}
          tone={criticalAlarms.length ? 'danger' : activeAlarms.length ? 'warn' : 'ok'}
        />
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card
            title="Peta gantry & 20 kolam"
            subtitle="Carriage bergerak di rail tengah; klik kolam untuk biomassa"
            actions={<StatusPill status={data.device?.state || 'idle'} />}
          >
            <GantryMap ponds={data.ponds} device={data.device} onSelectPond={setSelectedPond} />
          </Card>

          <Card title="Telemetry hopper" subtitle="SHT31-D dan sensor tekanan">
            <div className="chart-grid">
              <LineChart
                values={data.series.temperature_c}
                labels={data.series.at}
                unit="°C"
                color="#b23c17"
                digits={1}
              />
              <LineChart
                values={data.series.humidity_pct}
                labels={data.series.at}
                unit="%"
                color="#0b5cad"
                digits={0}
              />
              <LineChart
                values={data.series.pressure_kpa}
                labels={data.series.at}
                unit="kPa"
                color="#5a5a5a"
                digits={1}
              />
              <LineChart
                values={data.series.hopper_remaining_kg}
                labels={data.series.at}
                unit="kg"
                color="#0a6b3d"
                digits={2}
              />
            </div>
          </Card>

          <Card title="Daya & aktuator" subtitle="PZEM-004T 220 VAC dan ACS758 48 VDC">
            <div className="chart-grid">
              <LineChart values={data.series.power_w} labels={data.series.at} unit="W" color="#8a5a00" digits={0} />
              <LineChart values={data.series.dc_current_a} labels={data.series.at} unit="A" color="#6b4c9a" digits={2} />
            </div>
            <div className="info-grid">
              <InfoRow label="Tegangan" value={`${fmtNumber(data.telemetry?.power?.voltage_v, 1)} V`} />
              <InfoRow label="Arus AC" value={`${fmtNumber(data.telemetry?.power?.current_a, 2)} A`} />
              <InfoRow label="Daya" value={`${fmtNumber(data.telemetry?.power?.power_w, 0)} W`} />
              <InfoRow label="Energi" value={`${fmtNumber(data.telemetry?.power?.energy_kwh, 2)} kWh`} />
              <InfoRow label="Arus DC" value={`${fmtNumber(data.telemetry?.power?.dc_current_a, 2)} A`} />
              <InfoRow label="Suhu hopper" value={`${fmtNumber(data.telemetry?.environment?.temperature_c, 1)} °C`} />
            </div>
          </Card>

          <Card
            title="Jadwal berikutnya"
            subtitle="8 jadwal terdekat berdasarkan porsi efektif"
            actions={<Link className="btn sm" to="/jadwal">Kelola jadwal</Link>}
          >
            {data.upcoming.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Kolam</th>
                      <th>Porsi</th>
                      <th>Rotary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcoming.map((item) => (
                      <tr key={`${item.pond_id}-${item.time}`}>
                        <td>{fmtDateTime(item.at)}</td>
                        <td>{item.pond_name} <span className="muted small">({label(item.side)})</span></td>
                        <td>{fmtGrams(item.grams)}</td>
                        <td>{fmtNumber(item.rotations, 2)} putaran</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Belum ada jadwal aktif.</Empty>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Kendali perangkat" subtitle="Perintah memakai command ID dan masa berlaku">
            <div className="button-stack">
              <button type="button" className="btn danger" disabled={!online || busy} onClick={() => setAction('estop')}>
                Emergency Stop
              </button>
              {isAdmin ? (
                <>
                  <button type="button" className="btn" disabled={!online || busy} onClick={() => setAction('home')}>
                    Kembali ke Home
                  </button>
                  <button type="button" className="btn" disabled={!online || busy} onClick={() => setAction('reset')}>
                    Reset / Validasi Keamanan
                  </button>
                </>
              ) : null}
            </div>
            <div className="info-grid single">
              <InfoRow label="Gantry" value={data.device?.gantry_pond_index ? `Kolam #${data.device.gantry_pond_index}` : '—'} />
              <InfoRow label="Rail step" value={fmtNumber(data.device?.rail_position_step, 0)} />
              <InfoRow label="Firmware" value={data.device?.firmware_version || '—'} />
              <InfoRow label="Config version" value={data.device?.config_version ?? '—'} />
              <InfoRow label="Perintah pending" value={data.commands.pending} />
            </div>
          </Card>

          <Card
            title={`Alarm aktif (${activeAlarms.length})`}
            actions={<Link className="btn sm" to="/alarm">Semua</Link>}
          >
            {activeAlarms.length ? (
              <ul className="alarm-list">
                {activeAlarms.slice(0, 6).map((alarm) => (
                  <li key={alarm.id} className={`alarm-item ${alarm.severity}`}>
                    <div className="alarm-top">
                      <SeverityPill severity={alarm.severity} />
                      <span className="muted small">{fmtDateTime(alarm.detected_at)}</span>
                    </div>
                    <div>{alarm.message}</div>
                    <div className="muted small">
                      {alarm.pond_name || 'Perangkat'} · {label(alarm.status)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Tidak ada alarm aktif.</Empty>
            )}
          </Card>

          <Card title="Feeding hari ini" subtitle={data.today.date}>
            <ul className="kv-list">
              {todayItems.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong className={`tone-text-${item.tone}`}>{item.value}</strong>
                </li>
              ))}
            </ul>
            <div className="info-grid single">
              <InfoRow label="Total keluar" value={fmtGrams(data.today.dispensed_grams)} />
              <InfoRow label="Total rencana" value={`${data.today.planned} run`} />
              <InfoRow label="Stok tersedia" value={fmtKg(data.feed.available_kg)} />
            </div>
          </Card>

          <Card title="Koneksi & waktu" subtitle="Semua timestamp WIB">
            <div className="info-grid single">
              <InfoRow label="Server generated" value={fmtDateTime(data.generated_at)} />
              <InfoRow label="Terakhir telemetry" value={fmtDateTime(data.telemetry?.recorded_at)} />
              <InfoRow label="Terakhir perangkat" value={fmtDateTime(data.device?.last_seen_at)} />
              <InfoRow label="Mode akses" value={user.role === 'petani' ? 'Operator (kolam ditugaskan)' : 'Penuh'} />
            </div>
          </Card>
        </div>
      </div>

      <PondModal pond={selectedPond} onClose={() => setSelectedPond(null)} onUpdated={refresh} />
      <ActionModal
        action={action}
        reason={reason}
        setReason={setReason}
        onClose={() => !busy && setAction(null)}
        onConfirm={runAction}
        busy={busy}
        error={actionError}
      />
    </div>
  )
}

function PondModal({ pond, onClose, onUpdated }) {
  const [biomass, setBiomass] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  React.useEffect(() => {
    setBiomass(pond?.biomass_kg ?? '')
    setNote('')
    setError('')
    setNotice('')
  }, [pond])

  if (!pond) return null

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.updateBiomass(pond.id, Number(biomass), note || null)
      setNotice('Biomassa diperbarui. Porsi berbasis persen akan memakai nilai baru.')
      onUpdated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!pond} title={pond.name} subtitle={`${label(pond.side)} · indeks #${pond.pond_index}`} onClose={onClose}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}
      <div className="info-grid">
        <InfoRow label="Biomassa" value={fmtKg(pond.biomass_kg)} />
        <InfoRow label="Porsi efektif" value={fmtGrams(pond.portion?.grams)} />
        <InfoRow label="Jadwal berikutnya" value={fmtDateTime(pond.next_feeding_at)} />
        <InfoRow label="Feeding terakhir" value={pond.last_run?.status ? label(pond.last_run.status) : 'Belum ada'} />
      </div>
      <form className="form-stack" onSubmit={save}>
        <Field label="Perbarui biomassa (kg)" hint="Dipakai untuk porsi persen biomassa. Maksimal 1.000.000 kg.">
          <input
            type="number"
            min="0.1"
            max="1000000"
            step="0.1"
            value={biomass}
            onChange={(e) => setBiomass(e.target.value)}
            required
          />
        </Field>
        <Field label="Catatan (opsional)">
          <input value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="page-actions">
          <button type="button" className="btn" onClick={onClose}>Tutup</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan biomassa'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ActionModal({ action, reason, setReason, onClose, onConfirm, busy, error }) {
  const titles = {
    estop: 'Kirim Emergency Stop?',
    home: 'Kembali ke home position?',
    reset: 'Reset / validasi keamanan?',
  }
  return (
    <Modal
      open={!!action}
      title={titles[action] || 'Konfirmasi'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className={action === 'estop' ? 'btn danger' : 'btn primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Mengirim…' : 'Kirim perintah'}
          </button>
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {action === 'estop' ? (
        <>
          <p>Seluruh aktuator akan dihentikan. Perangkat harus melalui validasi keamanan sebelum operasi normal.</p>
          <Field label="Alasan (opsional)">
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </>
      ) : action === 'reset' ? (
        <p>Gunakan hanya setelah area gantry aman dan E-stop fisik dilepas. Perangkat akan melakukan validasi keamanan.</p>
      ) : (
        <p>Gantry akan bergerak ke ujung belakang rail (home position).</p>
      )}
    </Modal>
  )
}

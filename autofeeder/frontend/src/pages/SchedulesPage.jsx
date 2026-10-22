import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, Loading, Modal, PageHeader, StatusPill } from '../components/ui.jsx'
import { fmtDateTime, fmtGrams, fmtNumber, label, scheduleTargetText } from '../utils.js'

const EMPTY_FORM = {
  scope: 'global',
  side: 'left',
  pond_id: '',
  times: ['07:00'],
  portion_mode: 'fixed',
  portion_grams: 1000,
  biomass_percent: 2,
  pellet_type: 'medium',
  active: true,
  note: '',
  overrides: {},
}

export default function SchedulesPage({ user }) {
  const schedules = usePolling(api.schedules, 10000)
  const ponds = usePolling(api.ponds, 15000)
  const effective = usePolling(api.effectiveSchedules, 15000)
  const isAdmin = ['admin', 'pemilik'].includes(user.role)
  const [editor, setEditor] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const pondList = ponds.data || []
  const pondMap = useMemo(() => Object.fromEntries(pondList.map((p) => [p.id, p])), [pondList])

  function openCreate() {
    setError('')
    setEditor({
      mode: 'create',
      form: {
        ...EMPTY_FORM,
        scope: isAdmin ? 'global' : 'pond',
        pond_id: !isAdmin && pondList.length ? String(pondList[0].id) : '',
        overrides: {},
      },
    })
  }

  function openEdit(schedule) {
    const overrides = {}
    for (const item of schedule.overrides || []) {
      overrides[item.pond_id] = item.portion_grams ?? item.biomass_percent ?? ''
    }
    setError('')
    setEditor({
      mode: 'edit',
      id: schedule.id,
      form: {
        scope: schedule.scope,
        side: schedule.side || 'left',
        pond_id: schedule.pond_id ? String(schedule.pond_id) : '',
        times: [...schedule.feeding_times],
        portion_mode: schedule.portion_mode,
        portion_grams: schedule.portion_grams ?? 1000,
        biomass_percent: schedule.biomass_percent ?? 2,
        pellet_type: schedule.pellet_type,
        active: schedule.active,
        note: schedule.note || '',
        overrides,
      },
    })
  }

  async function toggleActive(schedule) {
    setBusy(true)
    setError('')
    try {
      await api.setScheduleActive(schedule.id, !schedule.active)
      setNotice(schedule.active ? 'Jadwal dijeda. Perintah pending dibatalkan.' : 'Jadwal diaktifkan kembali.')
      schedules.refresh()
      effective.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeSchedule(schedule) {
    setBusy(true)
    setError('')
    try {
      await api.deleteSchedule(schedule.id)
      setNotice('Jadwal dihapus.')
      setConfirm(null)
      schedules.refresh()
      effective.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Jadwal Feeding"
        subtitle="Maksimum 3 feeding per kolam per hari. Porsi dapat berbeda per kolam."
        actions={
          <>
            <button type="button" className="btn sm" onClick={() => { schedules.refresh(); effective.refresh() }}>
              Muat ulang
            </button>
            <button type="button" className="btn primary sm" onClick={openCreate} disabled={!pondList.length}>
              Buat jadwal
            </button>
          </>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {!isAdmin ? (
        <Alert tone="neutral">
          Role operator hanya dapat mengubah jadwal untuk kolam yang ditugaskan. Jadwal global dan per baris dikelola admin/pemilik.
        </Alert>
      ) : null}

      <Card title="Daftar jadwal" subtitle="Jadwal paling spesifik menang: kolam &gt; baris &gt; global">
        {schedules.loading && !schedules.data ? (
          <Loading />
        ) : schedules.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cakupan</th>
                  <th>Jam (WIB)</th>
                  <th>Porsi</th>
                  <th>Kolam</th>
                  <th>Aktif</th>
                  <th>Versi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {schedules.data.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>{schedule.id}</td>
                    <td>
                      <strong>{label(schedule.scope)}</strong>
                      {schedule.scope === 'row' ? <div className="muted small">Baris {label(schedule.side)}</div> : null}
                      {schedule.scope === 'pond' ? <div className="muted small">{pondMap[schedule.pond_id]?.name || `Kolam #${schedule.pond_id}`}</div> : null}
                    </td>
                    <td>{schedule.feeding_times.join(' · ')}</td>
                    <td>
                      {scheduleTargetText(schedule)}
                      {schedule.overrides?.length ? <div className="muted small">{schedule.overrides.length} porsi khusus</div> : null}
                    </td>
                    <td>{schedule.applies_to?.length ?? 0}</td>
                    <td><StatusPill status={schedule.active ? 'online' : 'offline'}>{schedule.active ? 'Aktif' : 'Jeda'}</StatusPill></td>
                    <td>{schedule.version}</td>
                    <td>
                      <div className="row-actions">
                        {isAdmin || schedule.scope === 'pond' ? (
                          <>
                            <button type="button" className="btn sm" onClick={() => openEdit(schedule)}>Ubah</button>
                            <button type="button" className="btn sm" disabled={busy} onClick={() => toggleActive(schedule)}>
                              {schedule.active ? 'Jeda' : 'Lanjut'}
                            </button>
                          </>
                        ) : (
                          <span className="muted small">Dikelola admin/pemilik</span>
                        )}
                        {isAdmin ? (
                          <button type="button" className="btn danger sm" onClick={() => setConfirm(schedule)}>Hapus</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada jadwal. Buat jadwal pertama.</Empty>
        )}
      </Card>

      <Card title="Porsi efektif per kolam" subtitle="Perhitungan dari biomassa terakhir dan override">
        {effective.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kolam</th>
                  <th>Sisi</th>
                  <th>Biomassa</th>
                  <th>Jadwal</th>
                  <th>Porsi</th>
                  <th>Rotary</th>
                  <th>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {effective.data.map((row) => (
                  <tr key={row.pond.id}>
                    <td>{row.pond.name} <span className="muted small">#{row.pond.pond_index}</span></td>
                    <td>{label(row.pond.side)}</td>
                    <td>{fmtNumber(row.pond.biomass_kg, 0)} kg</td>
                    <td>{row.schedule ? `#${row.schedule.id} (${label(row.schedule.scope)})` : '—'}</td>
                    <td>{fmtGrams(row.portion?.grams)}</td>
                    <td>{fmtNumber(row.portion?.rotations, 2)}</td>
                    <td>{row.portion?.override ? 'Override' : row.schedule?.portion_mode === 'percent' ? '% biomassa' : 'Fixed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada kolam atau jadwal.</Empty>
        )}
      </Card>

      <ScheduleEditor
        editor={editor}
        setEditor={setEditor}
        ponds={pondList}
        isAdmin={isAdmin}
        onSaved={() => {
          setNotice(editor?.mode === 'edit' ? 'Jadwal diperbarui.' : 'Jadwal dibuat.')
          schedules.refresh()
          effective.refresh()
        }}
        onError={setError}
      />

      <Modal
        open={!!confirm}
        title="Hapus jadwal?"
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>Batal</button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => removeSchedule(confirm)}>
              {busy ? 'Menghapus…' : 'Hapus jadwal'}
            </button>
          </>
        }
      >
        <p>Jadwal #{confirm?.id} akan dihapus. Riwayat feeding tetap disimpan, perintah pending akan dibatalkan.</p>
      </Modal>
    </div>
  )
}

function ScheduleEditor({ editor, setEditor, ponds, isAdmin, onSaved, onError }) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const form = editor?.form

  useEffect(() => {
    setLocalError('')
  }, [editor])

  const applicablePonds = useMemo(() => {
    if (!form) return []
    if (form.scope === 'global') return ponds
    if (form.scope === 'row') return ponds.filter((p) => p.side === form.side)
    return ponds.filter((p) => String(p.id) === String(form.pond_id))
  }, [form, ponds])

  if (!editor) return null

  const update = (patch) => setEditor({ ...editor, form: { ...form, ...patch } })

  function setTime(index, value) {
    const times = [...form.times]
    times[index] = value
    update({ times })
  }

  function addTime() {
    if (form.times.length >= 3) return
    update({ times: [...form.times, '12:00'] })
  }

  function removeTime(index) {
    if (form.times.length <= 1) return
    update({ times: form.times.filter((_, i) => i !== index) })
  }

  function setOverride(pondId, value) {
    const overrides = { ...form.overrides }
    if (value === '') delete overrides[pondId]
    else overrides[pondId] = value
    update({ overrides })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setLocalError('')
    try {
      const times = [...new Set(form.times.filter(Boolean))].sort()
      if (!times.length || times.length > 3) throw new Error('Isi 1 sampai 3 jam feeding.')
      if (form.scope === 'pond' && !form.pond_id) throw new Error('Pilih kolam.')
      const payload = {
        scope: form.scope,
        side: form.scope === 'row' ? form.side : null,
        pond_id: form.scope === 'pond' ? Number(form.pond_id) : null,
        feeding_times: times,
        portion_mode: form.portion_mode,
        portion_grams: form.portion_mode === 'fixed' ? Number(form.portion_grams) : null,
        biomass_percent: form.portion_mode === 'percent' ? Number(form.biomass_percent) : null,
        pellet_type: form.pellet_type || 'medium',
        active: !!form.active,
        note: form.note || null,
        overrides: isAdmin
          ? Object.entries(form.overrides)
              .filter(([, value]) => value !== '' && Number(value) > 0)
              .map(([pondId, value]) => ({
                pond_id: Number(pondId),
                ...(form.portion_mode === 'fixed'
                  ? { portion_grams: Number(value) }
                  : { biomass_percent: Number(value) }),
              }))
          : [],
      }
      if (editor.mode === 'edit') await api.updateSchedule(editor.id, payload)
      else await api.createSchedule(payload)
      setEditor(null)
      onSaved()
    } catch (err) {
      setLocalError(err.message)
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!editor}
      title={editor.mode === 'edit' ? `Ubah jadwal #${editor.id}` : 'Buat jadwal feeding'}
      subtitle="Zona waktu WIB · satu siklus hanya mengisi satu sisi kolam"
      onClose={() => !busy && setEditor(null)}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={() => setEditor(null)} disabled={busy}>Batal</button>
          <button type="submit" form="schedule-form" className="btn primary" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan jadwal'}
          </button>
        </>
      }
    >
      <form id="schedule-form" className="form-stack" onSubmit={submit}>
        {localError ? <Alert tone="danger">{localError}</Alert> : null}
        <div className="form-grid">
          <Field label="Cakupan">
            <select
              value={form.scope}
              disabled={!isAdmin}
              onChange={(e) => update({ scope: e.target.value })}
            >
              {isAdmin ? <option value="global">Global — semua 20 kolam</option> : null}
              {isAdmin ? <option value="row">Baris — kiri atau kanan</option> : null}
              <option value="pond">Satu kolam</option>
            </select>
          </Field>
          {form.scope === 'row' ? (
            <Field label="Baris">
              <select value={form.side} onChange={(e) => update({ side: e.target.value })}>
                <option value="left">Kiri (10 kolam)</option>
                <option value="right">Kanan (10 kolam)</option>
              </select>
            </Field>
          ) : null}
          {form.scope === 'pond' ? (
            <Field label="Kolam">
              <select value={form.pond_id} onChange={(e) => update({ pond_id: e.target.value })} required>
                <option value="">Pilih kolam…</option>
                {ponds.map((pond) => (
                  <option key={pond.id} value={pond.id}>
                    {pond.name} · {label(pond.side)} #{pond.pond_index}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Jenis pellet">
            <select value={form.pellet_type} onChange={(e) => update({ pellet_type: e.target.value })}>
              <option value="small">Kecil</option>
              <option value="medium">Sedang</option>
              <option value="large">Besar</option>
            </select>
          </Field>
        </div>

        <div className="field">
          <span className="field-label">Jam feeding (WIB, maksimal 3)</span>
          <div className="time-list">
            {form.times.map((time, index) => (
              <div className="time-row" key={index}>
                <input type="time" value={time} onChange={(e) => setTime(index, e.target.value)} required />
                <button type="button" className="btn sm" onClick={() => removeTime(index)} disabled={form.times.length <= 1}>
                  Hapus
                </button>
              </div>
            ))}
            <button type="button" className="btn sm" onClick={addTime} disabled={form.times.length >= 3}>
              + Tambah jam
            </button>
          </div>
        </div>

        <div className="form-grid">
          <Field label="Mode porsi">
            <select value={form.portion_mode} onChange={(e) => update({ portion_mode: e.target.value, overrides: {} })}>
              <option value="fixed">Fixed (gram)</option>
              <option value="percent">Persen biomassa</option>
            </select>
          </Field>
          {form.portion_mode === 'fixed' ? (
            <Field label="Porsi (gram)" hint="Maksimal 10.000 g; 200 g ≈ 1 putaran rotary.">
              <input
                type="number"
                min="1"
                max="10000"
                step="10"
                value={form.portion_grams}
                onChange={(e) => update({ portion_grams: e.target.value })}
                required
              />
            </Field>
          ) : (
            <Field label="Persen biomassa (%)" hint="Contoh 3% dari 500 kg = 15.000 g; batas maksimum per run 10.000 g.">
              <input
                type="number"
                min="0.5"
                max="10"
                step="0.1"
                value={form.biomass_percent}
                onChange={(e) => update({ biomass_percent: e.target.value })}
                required
              />
            </Field>
          )}
          <Field label="Status">
            <label className="check-inline">
              <input type="checkbox" checked={form.active} onChange={(e) => update({ active: e.target.checked })} />
              <span>Aktif</span>
            </label>
          </Field>
        </div>

        <Field label="Catatan (opsional)">
          <input value={form.note} maxLength={255} onChange={(e) => update({ note: e.target.value })} />
        </Field>

        {isAdmin && form.scope !== 'pond' && applicablePonds.length ? (
          <details className="override-box">
            <summary>Porsi khusus per kolam (opsional)</summary>
            <p className="muted small">
              Kosongkan untuk memakai porsi default. Nilai diisi dalam {form.portion_mode === 'fixed' ? 'gram' : 'persen biomassa'}.
            </p>
            <div className="override-grid">
              {applicablePonds.map((pond) => (
                <label className="override-row" key={pond.id}>
                  <span>{pond.name} <span className="muted small">#{pond.pond_index}</span></span>
                  <input
                    type="number"
                    min="0.1"
                    step={form.portion_mode === 'fixed' ? '10' : '0.1'}
                    placeholder={form.portion_mode === 'fixed' ? String(form.portion_grams) : String(form.biomass_percent)}
                    value={form.overrides[pond.id] ?? ''}
                    onChange={(e) => setOverride(pond.id, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </details>
        ) : null}

        <div className="muted small">
          Porsi default: {form.portion_mode === 'fixed' ? fmtGrams(form.portion_grams) : `${fmtNumber(form.biomass_percent, 2)}% biomassa`} · berlaku untuk {applicablePonds.length} kolam.
        </div>
      </form>
    </Modal>
  )
}

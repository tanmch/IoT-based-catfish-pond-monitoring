import React, { useMemo, useState } from 'react'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, Loading, PageHeader, Pagination, StatusPill } from '../components/ui.jsx'
import { buildQuery, daysAgoInput, fmtDateTime, fmtGrams, fmtNumber, label, todayInput } from '../utils.js'

const LIMIT = 50

export default function HistoryPage() {
  const ponds = usePolling(api.ponds, 30000)
  const [filters, setFilters] = useState({
    date_from: daysAgoInput(7),
    date_to: todayInput(),
    pond_id: '',
    status: '',
    source: '',
  })
  const [offset, setOffset] = useState(0)
  const query = useMemo(() => ({ ...filters, limit: LIMIT, offset }), [filters, offset])
  const runs = usePolling(() => api.runs(query), 0, [query])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setOffset(0)
  }

  async function exportCsv() {
    setBusy(true)
    setError('')
    try {
      const qs = buildQuery(filters)
      await api.download(`/runs/export.csv${qs ? `?${qs}` : ''}`, `riwayat-feeding-${todayInput()}.csv`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Riwayat Feeding"
        subtitle="Filter, ekspor CSV, atau cetak PDF melalui dialog print browser."
        actions={
          <>
            <button type="button" className="btn sm" onClick={() => window.print()}>Cetak / PDF</button>
            <button type="button" className="btn sm" disabled={busy} onClick={exportCsv}>
              {busy ? 'Menyiapkan…' : 'Ekspor CSV'}
            </button>
          </>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}

      <Card className="print-hide">
        <div className="filter-grid">
          <Field label="Dari tanggal">
            <input type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} />
          </Field>
          <Field label="Sampai tanggal">
            <input type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} />
          </Field>
          <Field label="Kolam">
            <select value={filters.pond_id} onChange={(e) => setFilter('pond_id', e.target.value)}>
              <option value="">Semua kolam</option>
              {(ponds.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>{pond.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Semua</option>
              <option value="planned">Direncanakan</option>
              <option value="dispensed">Selesai</option>
              <option value="skipped">Dilewati</option>
              <option value="failed">Gagal</option>
            </select>
          </Field>
          <Field label="Sumber">
            <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
              <option value="">Semua</option>
              <option value="schedule">Jadwal</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="print-area">
        <div className="print-title">
          <h2>Riwayat Feeding</h2>
          <div className="muted small">Periode {filters.date_from || '—'} s/d {filters.date_to || '—'} · WIB</div>
        </div>
        {runs.loading && !runs.data ? (
          <Loading />
        ) : runs.data?.items?.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Kolam</th>
                    <th>Sisi</th>
                    <th>Sumber</th>
                    <th>Target</th>
                    <th>Aktual</th>
                    <th>Deviasi</th>
                    <th>Rotary</th>
                    <th>Status</th>
                    <th>Alasan</th>
                    <th>Command</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.items.map((run) => {
                    const deviation =
                      run.actual_grams && run.target_grams
                        ? ((run.actual_grams - run.target_grams) / run.target_grams) * 100
                        : null
                    return (
                      <tr key={run.id}>
                        <td>{fmtDateTime(run.planned_at)}</td>
                        <td>{run.pond_name || `#${run.pond_id}`}</td>
                        <td>{label(run.side)}</td>
                        <td>{label(run.source)}</td>
                        <td>{fmtGrams(run.target_grams)}</td>
                        <td>{run.actual_grams != null ? fmtGrams(run.actual_grams) : '—'}</td>
                        <td>{deviation == null ? '—' : `${deviation > 0 ? '+' : ''}${fmtNumber(deviation, 1)}%`}</td>
                        <td>{fmtNumber(run.rotary_rotations, 2)}</td>
                        <td><StatusPill status={run.status} /></td>
                        <td>{run.failure_reason || '—'}</td>
                        <td><code>{run.command?.command_uid?.slice(0, 10) || '—'}</code></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={runs.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : (
          <Empty>Tidak ada riwayat pada filter ini.</Empty>
        )}
      </Card>
    </div>
  )
}

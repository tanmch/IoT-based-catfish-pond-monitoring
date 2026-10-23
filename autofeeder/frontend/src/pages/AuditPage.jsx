import React, { useMemo, useState } from 'react'
import { api } from '../api.js'
import { usePolling } from '../hooks.js'
import { Alert, Card, Empty, Field, Loading, PageHeader, Pagination } from '../components/ui.jsx'
import { buildQuery, daysAgoInput, fmtDateTime, label, todayInput } from '../utils.js'

const LIMIT = 100

const ACTIONS = [
  'feeding.dispatch',
  'feeding.manual',
  'feeding.dispensed',
  'feeding.skipped',
  'command.expired',
  'command.cancel',
  'command.failed',
  'device.estop',
  'device.reset',
  'device.home',
  'device.rotate_key',
  'device.config_update',
  'schedule.create',
  'schedule.update',
  'schedule.pause',
  'schedule.resume',
  'schedule.delete',
  'alarm.acknowledge',
  'alarm.resolve',
  'feed.create',
  'feed.update',
  'pond.biomass_update',
]

export default function AuditPage() {
  const [filters, setFilters] = useState({
    date_from: daysAgoInput(7),
    date_to: todayInput(),
    action: '',
    username: '',
  })
  const [offset, setOffset] = useState(0)
  const query = useMemo(() => ({ ...filters, limit: LIMIT, offset }), [filters, offset])
  const logs = usePolling(() => api.audit(query), 0, [query])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setOffset(0)
  }

  async function exportCsv() {
    setBusy(true)
    setError('')
    try {
      const qs = buildQuery(filters)
      await api.download(`/audit/export.csv${qs ? `?${qs}` : ''}`, `audit-trail-${todayInput()}.csv`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Audit Trail"
        subtitle="Siapa melakukan apa, kapan, dan dari IP mana. Hanya admin/pemilik."
        actions={
          <button type="button" className="btn sm" disabled={busy} onClick={exportCsv}>
            {busy ? 'Menyiapkan…' : 'Ekspor CSV'}
          </button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}

      <Card>
        <div className="filter-grid">
          <Field label="Dari tanggal">
            <input type="date" value={filters.date_from} onChange={(e) => update('date_from', e.target.value)} />
          </Field>
          <Field label="Sampai tanggal">
            <input type="date" value={filters.date_to} onChange={(e) => update('date_to', e.target.value)} />
          </Field>
          <Field label="Aksi">
            <select value={filters.action} onChange={(e) => update('action', e.target.value)}>
              <option value="">Semua aksi</option>
              {ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </Field>
          <Field label="Username">
            <input value={filters.username} maxLength={100} onChange={(e) => update('username', e.target.value)} placeholder="Cari username…" />
          </Field>
        </div>
      </Card>

      <Card title="Catatan aktivitas" subtitle="Timestamp WIB">
        {logs.loading && !logs.data ? (
          <Loading />
        ) : logs.data?.items?.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Aksi</th>
                    <th>Entitas</th>
                    <th>Deskripsi</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDateTime(row.at)}</td>
                      <td>{row.username || '—'}</td>
                      <td>{row.role ? label(row.role) : '—'}</td>
                      <td><code>{row.action}</code></td>
                      <td>{row.entity}{row.entity_id ? <span className="muted small"> #{row.entity_id}</span> : null}</td>
                      <td>{row.description || '—'}</td>
                      <td>{row.ip || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={logs.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : (
          <Empty>Tidak ada aktivitas pada filter ini.</Empty>
        )}
      </Card>
    </div>
  )
}

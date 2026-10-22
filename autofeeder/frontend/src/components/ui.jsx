import React, { useEffect } from 'react'
import { ROLE_LABEL, fmtDate, fmtNumber, label, toneForStatus } from '../utils.js'

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="muted small">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  )
}

export function Stat({ label: text, value, hint, tone = 'neutral' }) {
  return (
    <div className={`stat tone-${tone}`}>
      <div className="stat-label">{text}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  )
}

export function StatusPill({ status, children }) {
  return <span className={`pill ${toneForStatus(status)}`}>{children || label(status)}</span>
}

export function RoleBadge({ role }) {
  return <span className={`pill ${role === 'admin' ? 'danger' : role === 'pemilik' ? 'warn' : 'neutral'}`}>{ROLE_LABEL[role] || role}</span>
}

export function SeverityPill({ severity }) {
  return <span className={`pill ${severity === 'critical' ? 'danger' : 'warn'}`}>{severity === 'critical' ? 'Kritis' : 'Peringatan'}</span>
}

export function Alert({ tone = 'danger', title, children, onClose }) {
  if (!children && !title) return null
  return (
    <div className={`alert ${tone}`}>
      <div>
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {onClose ? (
        <button type="button" className="link" onClick={onClose} aria-label="Tutup">
          Tutup
        </button>
      ) : null}
    </div>
  )
}

export function Empty({ children = 'Belum ada data.' }) {
  return <div className="empty">{children}</div>
}

export function Loading({ children = 'Memuat data…' }) {
  return <div className="empty">{children}</div>
}

export function Modal({ open, title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="muted small">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Tutup
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Field({ label: text, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{text}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Pagination({ total, limit, offset, onChange }) {
  if (!total) return null
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <div className="pagination">
      <span className="muted small">
        Halaman {page} dari {pages} · {fmtNumber(total, 0)} baris
      </span>
      <div className="page-actions">
        <button type="button" className="btn sm" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          Sebelumnya
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={page >= pages}
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  )
}

export function PondLabel({ pond }) {
  if (!pond) return '—'
  return (
    <span>
      <strong>{pond.name || `Kolam ${pond.pond_index}`}</strong>{' '}
      <span className="muted small">({label(pond.side)} · #{pond.pond_index})</span>
    </span>
  )
}

export function InfoRow({ label: text, value }) {
  return (
    <div className="info-row">
      <span className="muted">{text}</span>
      <span>{value ?? '—'}</span>
    </div>
  )
}

export function DateText({ value }) {
  return <span title={value || ''}>{value ? fmtDate(value) : '—'}</span>
}

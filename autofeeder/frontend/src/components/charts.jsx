import React from 'react'
import { fmtNumber, fmtTime } from '../utils.js'

export function LineChart({
  values = [],
  labels = [],
  unit = '',
  color = '#0b5cad',
  height = 140,
  digits = 1,
  emptyText = 'Data belum cukup.',
}) {
  const numeric = values.map((value, index) => ({ value: Number(value), index })).filter((item) => Number.isFinite(item.value))
  if (numeric.length < 2) return <div className="chart-empty">{emptyText}</div>

  const width = 640
  const padX = 34
  const padY = 16
  const min = Math.min(...numeric.map((p) => p.value))
  const max = Math.max(...numeric.map((p) => p.value))
  const span = max - min || 1
  const low = min - span * 0.12
  const high = max + span * 0.12
  const range = high - low || 1

  const x = (index) => padX + (index / Math.max(1, values.length - 1)) * (width - padX * 2)
  const y = (value) => padY + (1 - (value - low) / range) * (height - padY * 2)
  const points = numeric.map((p) => `${x(p.index)},${y(p.value)}`).join(' ')
  const last = numeric[numeric.length - 1]
  const firstLabel = labels[0] ? fmtTime(labels[0]) : ''
  const lastLabel = labels[labels.length - 1] ? fmtTime(labels[labels.length - 1]) : ''

  return (
    <div className="chart">
      <div className="chart-meta">
        <span className="chart-last">
          {fmtNumber(last.value, digits)} <span className="muted">{unit}</span>
        </span>
        <span className="muted small">
          min {fmtNumber(min, digits)} · max {fmtNumber(max, digits)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grafik ${unit}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padX}
            x2={width - padX}
            y1={padY + fraction * (height - padY * 2)}
            y2={padY + fraction * (height - padY * 2)}
            className="chart-grid"
          />
        ))}
        <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.index)} cy={y(last.value)} r="4" fill={color} />
      </svg>
      <div className="chart-axis muted small">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}

export function Bars({ items = [], unit = '' }) {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0))
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label">{item.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${item.tone || ''}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} />
          </div>
          <span className="bar-value">
            {fmtNumber(item.value, 0)} {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

import React from 'react'
import { fmtGrams, fmtNumber, label, toneForStatus } from '../utils.js'
import { StatusPill } from './ui.jsx'

export function GantryMap({ ponds = [], device, onSelectPond }) {
  const left = ponds.filter((p) => p.side === 'left').sort((a, b) => a.pond_index - b.pond_index)
  const right = ponds.filter((p) => p.side === 'right').sort((a, b) => a.pond_index - b.pond_index)
  const rows = Math.max(left.length, right.length, 1)
  const position = device?.gantry_pond_index
  const positionSide = position ? (position <= 10 ? 'left' : 'right') : null
  const rowIndex = position ? ((position - 1) % 10) + 1 : null
  const top = rowIndex ? ((rowIndex - 1) / Math.max(1, rows - 1)) * 100 : 0

  return (
    <div className="gantry-wrap">
      <div className="gantry-legend muted small">
        <span><span className="dot ok" /> Kolam</span>
        <span><span className="dot line" /> Rail gantry</span>
        <span><span className="dot moving" /> Posisi carriage</span>
      </div>
      <div className="gantry" style={{ '--rows': rows }}>
        <div className="pond-column left">
          {left.map((pond) => (
            <PondTile key={pond.id} pond={pond} active={device?.gantry_pond_index === pond.pond_index} onSelect={onSelectPond} />
          ))}
        </div>
        <div className="rail-column">
          <div className="rail-line" />
          <div className="rail-home">HOME</div>
          {position ? (
            <div className="carriage" style={{ top: `${top}%` }}>
              <span className="carriage-dot" />
              <span className="carriage-label">
                Gantry · {positionSide === 'left' ? 'L' : 'R'}{rowIndex}
              </span>
            </div>
          ) : (
            <div className="carriage unknown">
              <span className="carriage-dot" />
            </div>
          )}
        </div>
        <div className="pond-column right">
          {right.map((pond) => (
            <PondTile key={pond.id} pond={pond} active={device?.gantry_pond_index === pond.pond_index} onSelect={onSelectPond} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PondTile({ pond, active, onSelect }) {
  const status = pond.last_run?.status
  return (
    <button
      type="button"
      className={`pond-tile ${active ? 'active' : ''} ${status ? `state-${toneForStatus(status)}` : ''}`}
      onClick={() => onSelect?.(pond)}
      title={`${pond.name} · biomassa ${fmtNumber(pond.biomass_kg, 0)} kg · porsi ${fmtGrams(pond.portion?.grams)}`}
    >
      <span className="pond-index">{pond.pond_index}</span>
      <span className="pond-name">{pond.name}</span>
      <span className="pond-meta">
        {fmtNumber(pond.biomass_kg, 0)} kg · {fmtGrams(pond.portion?.grams)}
      </span>
      {status ? <StatusPill status={status} /> : <span className="pill neutral">Belum feeding</span>}
    </button>
  )
}

/**
 * Client-side CSV/PDF exports for the embedded demo dataset.
 * No backend or third-party PDF library is required.
 */

const WIB = 'Asia/Jakarta'

const shortDateTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB,
  dateStyle: 'short',
  timeStyle: 'short',
})

const REASON_LABELS = {
  PERAWATAN_KOLAM: 'Perawatan kolam',
  JADWAL_DILEWATI: 'Jadwal dilewati',
  KOLAM_DIKOSONGKAN: 'Kolam dikosongkan',
  MOTOR_TIMEOUT: 'Motor timeout',
  PAKAN_TIDAK_TERDETEKSI: 'Pakan tidak terdeteksi',
  GANTRY_FAULT: 'Gangguan gantry',
  STOK_PAKAN_TIDAK_CUKUP: 'Stok pakan tidak cukup',
  PAKAN_HOPPER_TIDAK_CUKUP: 'Pakan hopper tidak cukup',
  PERINTAH_KEDALUWARSA: 'Perintah kedaluwarsa',
  JADWAL_DIUBAH: 'Jadwal diubah',
  JADWAL_NONAKTIF: 'Jadwal nonaktif',
}

const STATUS_LABELS = {
  planned: 'Direncanakan',
  dispensed: 'Selesai',
  skipped: 'Dilewati',
  failed: 'Gagal',
}

const SOURCE_LABELS = { schedule: 'Jadwal', manual: 'Manual' }
const SIDE_LABELS = { left: 'Kiri', right: 'Kanan' }

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  return `\ufeff${lines.join('\r\n')}\r\n`
}

export function downloadRunsCsv(runs, filename) {
  const headers = [
    'waktu_wib',
    'kolam',
    'sisi',
    'sumber',
    'target_gram',
    'aktual_gram',
    'rotary',
    'status',
    'alasan',
    'command_id',
    'command_status',
  ]
  const rows = runs.map((run) => [
    run.planned_at,
    run.pond_name || `#${run.pond_id}`,
    run.side,
    run.source,
    run.target_grams,
    run.actual_grams ?? '',
    run.rotary_rotations,
    run.status,
    run.failure_reason || '',
    run.command?.command_uid || '',
    run.command?.status || '',
  ])
  saveBlob(new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

export function downloadTelemetryCsv(rows, filename) {
  const headers = [
    'waktu_wib',
    'device_id',
    'pond_index',
    'state',
    'rail_step',
    'suhu_hopper_c',
    'kelembapan_hopper_pct',
    'tekanan_hopper_kpa',
    'pakan_terdeteksi',
    'sisa_pakan_kg',
    'tegangan_v',
    'arus_a',
    'daya_w',
    'energi_kwh',
    'arus_dc_a',
  ]
  const data = rows.map((row) => [
    row.recorded_at,
    row.device_id,
    row.pond_index,
    row.gantry_state,
    row.rail_position_step,
    row.environment.temperature_c,
    row.environment.humidity_pct,
    row.environment.pressure_kpa,
    row.hopper.feed_present,
    row.hopper.remaining_kg,
    row.power.voltage_v,
    row.power.current_a,
    row.power.power_w,
    row.power.energy_kwh,
    row.power.dc_current_a,
  ])
  saveBlob(new Blob([toCsv(headers, data)], { type: 'text/csv;charset=utf-8' }), filename)
}

export function downloadAuditCsv(rows, filename) {
  const headers = ['waktu_wib', 'username', 'role', 'aksi', 'entitas', 'entity_id', 'deskripsi', 'ip']
  const data = rows.map((row) => [
    row.at,
    row.username,
    row.role,
    row.action,
    row.entity,
    row.entity_id,
    row.description,
    row.ip,
  ])
  saveBlob(new Blob([toCsv(headers, data)], { type: 'text/csv;charset=utf-8' }), filename)
}

function ascii(text) {
  const replacements = {
    '—': '-',
    '–': '-',
    '·': '-',
    '°': ' deg',
    '±': '+/-',
    '…': '...',
    '’': "'",
    '“': '"',
    '”': '"',
  }
  return String(text ?? '')
    .replace(/[—–·°±…’“”]/g, (char) => replacements[char] ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
}

function pdfText(text, x, y, size = 7, bold = false) {
  const escaped = ascii(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped}) Tj ET\n`
}

function pdfLine(x1, y1, x2, y2, width = 0.4) {
  return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`
}

export function downloadRunsPdf(runs, filename, periodLabel) {
  const columns = [
    { label: 'Waktu', width: 105, get: (run) => shortDateTime.format(new Date(run.planned_at)) },
    { label: 'Kolam', width: 70, get: (run) => run.pond_name || `#${run.pond_id}` },
    { label: 'Sisi', width: 34, get: (run) => SIDE_LABELS[run.side] || run.side },
    { label: 'Sumber', width: 44, get: (run) => SOURCE_LABELS[run.source] || run.source },
    { label: 'Target', width: 44, get: (run) => `${run.target_grams} g` },
    { label: 'Aktual', width: 44, get: (run) => (run.actual_grams == null ? '-' : `${run.actual_grams} g`) },
    { label: 'Rotary', width: 40, get: (run) => run.rotary_rotations },
    { label: 'Status', width: 46, get: (run) => STATUS_LABELS[run.status] || run.status },
    { label: 'Alasan', width: 200, get: (run) => REASON_LABELS[run.failure_reason] || run.failure_reason || '-' },
    { label: 'Command', width: 80, get: (run) => run.command?.command_uid?.slice(0, 10) || '-' },
  ]

  const margin = 36
  const firstRowY = 492
  const rowHeight = 14
  const rowsPerPage = 32
  const totalPages = Math.max(1, Math.ceil(runs.length / rowsPerPage))
  const objects = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const pageRefs = []
  for (let page = 0; page < totalPages; page += 1) {
    const slice = runs.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
    let content = ''
    content += pdfText('Laporan Riwayat Feeding - AutoFeeder Rail Gantry', margin, 556, 16, true)
    content += pdfText(`Periode: ${periodLabel} (WIB)`, margin, 538, 8)
    content += pdfText(`Total baris: ${runs.length} - dicetak ${shortDateTime.format(new Date())} WIB`, margin, 526, 8)

    let x = margin
    let y = firstRowY + 14
    for (const column of columns) {
      content += pdfText(column.label, x, y, 7, true)
      x += column.width
    }
    content += pdfLine(margin, y - 4, 806, y - 4, 0.6)

    let rowY = firstRowY
    for (const run of slice) {
      x = margin
      for (const column of columns) {
        content += pdfText(column.get(run), x, rowY, 6.5)
        x += column.width
      }
      content += pdfLine(margin, rowY - 4, 806, rowY - 4, 0.25)
      rowY -= rowHeight
    }
    content += pdfText(`Halaman ${page + 1} dari ${totalPages}`, margin, 24, 7)
    content += pdfText('AutoFeeder - data demo tertanam di frontend', 560, 24, 7)

    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`)
    const contentNumber = objects.length
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    )
    pageRefs.push(`${objects.length} 0 R`)
  }

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  saveBlob(new Blob([pdf], { type: 'application/pdf' }), filename)
}

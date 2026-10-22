const WIB = 'Asia/Jakarta'

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB,
  dateStyle: 'short',
  timeStyle: 'medium',
})

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB,
  dateStyle: 'medium',
})

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB,
  hour: '2-digit',
  minute: '2-digit',
})

export function fmtDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

export function fmtDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

export function fmtTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return timeFormatter.format(date)
}

export function fmtClock(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function fmtNumber(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (Number.isNaN(number)) return '—'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(number)
}

export function fmtKg(value) {
  if (value === null || value === undefined) return '—'
  return `${fmtNumber(value, 2)} kg`
}

export function fmtGrams(value) {
  if (value === null || value === undefined) return '—'
  return `${fmtNumber(value, 0)} g`
}

export function relativeTime(value) {
  if (!value) return 'belum pernah'
  const date = new Date(value).getTime()
  if (Number.isNaN(date)) return '—'
  const seconds = Math.round((Date.now() - date) / 1000)
  if (seconds < 10) return 'baru saja'
  if (seconds < 60) return `${seconds} detik lalu`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`
  return `${Math.floor(seconds / 86400)} hari lalu`
}

export function todayInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts
}

export function daysAgoInput(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export const ROLE_LABEL = {
  admin: 'Admin',
  pemilik: 'Pemilik',
  petani: 'Operator',
}

export const STATUS_LABEL = {
  planned: 'Direncanakan',
  dispensed: 'Selesai',
  skipped: 'Dilewati',
  failed: 'Gagal',
  pending: 'Menunggu',
  delivered: 'Diterima alat',
  executed: 'Dieksekusi',
  expired: 'Kedaluwarsa',
  cancelled: 'Dibatalkan',
  open: 'Terbuka',
  acknowledged: 'Diakui',
  resolved: 'Selesai',
  idle: 'Idle',
  moving: 'Bergerak',
  feeding: 'Memberi pakan',
  fault: 'Fault',
  emergency_stop: 'E-stop',
  offline: 'Offline',
  online: 'Online',
  left: 'Kiri',
  right: 'Kanan',
  manual: 'Manual',
  schedule: 'Jadwal',
  global: 'Global',
  row: 'Baris',
  pond: 'Kolam',
}

export function label(value) {
  return STATUS_LABEL[value] || value || '—'
}

export function toneForStatus(status) {
  if (['dispensed', 'executed', 'online', 'resolved', 'idle'].includes(status)) return 'ok'
  if (['failed', 'fault', 'emergency_stop', 'open', 'offline'].includes(status)) return 'danger'
  if (['skipped', 'expired', 'cancelled', 'acknowledged', 'moving', 'feeding'].includes(status)) return 'warn'
  return 'neutral'
}

export function scheduleTargetText(schedule) {
  if (!schedule) return '—'
  if (schedule.portion_mode === 'percent') return `${fmtNumber(schedule.biomass_percent, 2)}% biomassa`
  return fmtGrams(schedule.portion_grams)
}

export function buildQuery(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  return search.toString()
}

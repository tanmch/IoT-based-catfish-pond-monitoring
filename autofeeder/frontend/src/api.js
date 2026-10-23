import { demoApi } from './demo/mockApi.js'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

// Build-time switch:
//   npm run dev/build                 -> live FastAPI backend (default)
//   npm run dev:demo / build:demo     -> embedded dataset, no backend
export const DATA_MODE = import.meta.env.VITE_USE_MOCK === 'true' ? 'demo' : 'api'

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, signal, raw = false } = options
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!response.ok) {
    let detail = `Permintaan gagal (HTTP ${response.status}).`
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail)) {
        detail = data.detail.map((item) => item.msg || JSON.stringify(item)).join('; ')
      }
    } catch {
      // keep generic message
    }
    throw new ApiError(detail, response.status)
  }

  if (raw) return response
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  return response.text()
}

function queryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

const liveApi = {
  dashboard: () => request('/dashboard'),
  ponds: () => request('/ponds'),
  pond: (id) => request(`/ponds/${id}`),
  updateBiomass: (id, biomass_kg, note) =>
    request(`/ponds/${id}/biomass`, { method: 'PATCH', body: { biomass_kg, note } }),

  schedules: () => request('/schedules'),
  effectiveSchedules: () => request('/schedules/effective'),
  createSchedule: (payload) => request('/schedules', { method: 'POST', body: payload }),
  updateSchedule: (id, payload) => request(`/schedules/${id}`, { method: 'PUT', body: payload }),
  setScheduleActive: (id, active) =>
    request(`/schedules/${id}/active`, { method: 'PATCH', body: { active } }),
  deleteSchedule: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),

  feeds: () => request('/feeds'),
  createFeed: (payload) => request('/feeds', { method: 'POST', body: payload }),
  updateFeed: (id, payload) => request(`/feeds/${id}`, { method: 'PATCH', body: payload }),

  runs: (params) => request(`/runs${queryString(params)}`),
  run: (id) => request(`/runs/${id}`),
  manualFeed: (payload) => request('/commands/manual-feed', { method: 'POST', body: payload }),
  commands: (params) => request(`/commands${queryString(params)}`),
  cancelCommand: (uid) => request(`/commands/${uid}/cancel`, { method: 'POST' }),
  estop: (reason) => request('/commands/estop', { method: 'POST', body: { confirm: true, reason } }),
  resetDevice: () => request('/commands/reset', { method: 'POST', body: { confirm: true } }),
  homeDevice: () => request('/commands/home', { method: 'POST' }),

  alarms: (params) => request(`/alarms${queryString(params)}`),
  acknowledgeAlarm: (id, note) =>
    request(`/alarms/${id}/acknowledge`, { method: 'POST', body: { note } }),
  resolveAlarm: (id, note) => request(`/alarms/${id}/resolve`, { method: 'POST', body: { note } }),

  audit: (params) => request(`/audit${queryString(params)}`),

  devices: () => request('/devices'),
  deviceConfig: () => request('/devices/config'),
  telemetry: (params) => request(`/devices/telemetry${queryString(params)}`),
  rotateDeviceKey: (deviceId) =>
    request(`/devices/${encodeURIComponent(deviceId)}/rotate-key`, { method: 'POST' }),

  async download(path, filename) {
    const response = await request(path, { raw: true })
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}

export const api = DATA_MODE === 'demo' ? demoApi : liveApi

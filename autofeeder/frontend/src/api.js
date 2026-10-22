const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const TOKEN_KEY = 'autofeeder_token'
const USER_KEY = 'autofeeder_user'

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function storeSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, signal, raw = false } = options
  const token = getToken()
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (response.status === 401) {
    clearSession()
    window.dispatchEvent(new Event('autofeeder:unauthorized'))
  }

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

export const api = {
  login: (identifier, password) =>
    request('/auth/login', { method: 'POST', body: { identifier, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  changePassword: (payload) => request('/auth/password', { method: 'POST', body: payload }),

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

  users: () => request('/users'),
  availablePonds: () => request('/users/ponds/available'),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PATCH', body: payload }),
  setUserPonds: (id, pondIds) =>
    request(`/users/${id}/ponds`, { method: 'PUT', body: { pond_ids: pondIds } }),

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

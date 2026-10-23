/**
 * Mock implementation of the frontend API surface.
 *
 * The shapes intentionally mirror the FastAPI responses so every page can run
 * unchanged. Only `api.js` chooses between this module and the real client.
 */
import {
  createDemoStore,
  isoWib,
  nextOccurrence,
  wibToday,
} from './mockData.js'
import {
  downloadAuditCsv,
  downloadRunsCsv,
  downloadRunsPdf,
  downloadTelemetryCsv,
} from './demoExport.js'

const store = createDemoStore()

const ACTION_LABEL = {
  'feeding.manual': 'Manual feed',
  'device.estop': 'Emergency stop',
  'device.reset': 'Reset perangkat',
  'device.home': 'Homing gantry',
  'device.rotate_key': 'Rotasi API key',
  'schedule.create': 'Buat jadwal',
  'schedule.update': 'Ubah jadwal',
  'schedule.pause': 'Jeda jadwal',
  'schedule.resume': 'Aktifkan jadwal',
  'schedule.delete': 'Hapus jadwal',
  'alarm.acknowledge': 'Akui alarm',
  'alarm.resolve': 'Selesaikan alarm',
  'pond.biomass_update': 'Ubah biomassa',
  'feed.create': 'Tambah stok',
  'feed.update': 'Ubah stok',
}

function newCommandUid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '')
  return `demo${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
}

function addAudit(action, entity, entityId, description) {
  const entry = {
    id: store.counters.auditId,
    at: isoWib(new Date()),
    user_id: store.user.id,
    username: store.user.username,
    role: store.user.role,
    action,
    entity,
    entity_id: entityId === null || entityId === undefined ? null : String(entityId),
    description: description || ACTION_LABEL[action] || action,
    ip: '127.0.0.1',
    meta: null,
  }
  store.counters.auditId += 1
  store.audits.unshift(entry)
  return entry
}

function alertForalarm(action, alarm, note) {
  addAudit(action, 'alarm', alarm.id, note || `${alarm.alarm_type} ${action === 'alarm.acknowledge' ? 'diakui' : 'diselesaikan'}.`)
}

function stockTotal() {
  return store.stockKg()
}

function availableStock() {
  return store.stockKg()
}

function feedPayload() {
  return {
    items: store.feeds.map((feed) => ({ ...feed })),
    total_kg: stockTotal(),
    reserved_kg: 0,
    available_kg: availableStock(),
  }
}

function scheduleOut(schedule) {
  return {
    ...schedule,
    overrides: (schedule.overrides || []).map((override) => ({ ...override })),
    applies_to: store.appliesTo(schedule),
  }
}

function effectiveRows() {
  return store.ponds.map((pond) => {
    const schedule = store.effective(pond)
    return {
      pond: {
        id: pond.id,
        name: pond.name,
        side: pond.side,
        pond_index: pond.pond_index,
        biomass_kg: pond.biomass_kg,
      },
      schedule: schedule ? scheduleOut(schedule) : null,
      portion: schedule ? store.portionFor(schedule, pond) : null,
    }
  })
}

function dailyPlanKg() {
  let grams = 0
  for (const pond of store.ponds) {
    const schedule = store.effective(pond)
    if (!schedule) continue
    const portion = store.portionFor(schedule, pond)
    grams += (portion?.grams || 0) * schedule.feeding_times.length
  }
  return Math.round(grams) / 1000
}

function deviceOut(withExtras = true) {
  store.device.last_seen_at = isoWib(new Date(Date.now() - 45_000))
  const pending = store.commands.filter((command) => ['pending', 'delivered'].includes(command.status)).length
  const output = { ...store.device }
  if (withExtras) {
    output.pending_commands = pending
    output.latest_telemetry = latestTelemetry()
  }
  return output
}

function latestTelemetry() {
  const latest = store.telemetry[store.telemetry.length - 1]
  if (!latest) return null
  return { ...latest, recorded_at: isoWib(new Date(Date.now() - 40_000)) }
}

function runOut(run) {
  return {
    ...run,
    command: run.command ? { ...run.command } : null,
  }
}

function filterRuns(params = {}) {
  const limit = Math.min(10000, Math.max(1, Number(params.limit || 10000)))
  const offset = Math.max(0, Number(params.offset || 0))
  let rows = store.runs.filter((run) => {
    const day = run.planned_at.slice(0, 10)
    if (params.date_from && day < params.date_from) return false
    if (params.date_to && day > params.date_to) return false
    if (params.pond_id && Number(params.pond_id) !== run.pond_id) return false
    if (params.status && params.status !== run.status) return false
    if (params.source && params.source !== run.source) return false
    return true
  })
  rows = rows.sort((a, b) => b.planned_at.localeCompare(a.planned_at) || b.id - a.id)
  return { rows, total: rows.length, limit, offset }
}

function filterAudit(params = {}) {
  const limit = Math.min(1000, Math.max(1, Number(params.limit || 100)))
  const offset = Math.max(0, Number(params.offset || 0))
  let rows = store.audits.filter((row) => {
    const day = row.at.slice(0, 10)
    if (params.date_from && day < params.date_from) return false
    if (params.date_to && day > params.date_to) return false
    if (params.action && params.action !== row.action) return false
    if (params.username && !String(row.username || '').toLowerCase().includes(String(params.username).toLowerCase())) {
      return false
    }
    return true
  })
  rows = rows.sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
  return { rows, total: rows.length, limit, offset }
}

function pondDashboard(pond, lastRuns) {
  const schedule = store.effective(pond)
  const portion = schedule ? store.portionFor(schedule, pond) : null
  const lastRun = lastRuns.get(pond.id)
  let nextFeeding = null
  if (schedule) {
    nextFeeding = schedule.feeding_times
      .map((time) => nextOccurrence(time))
      .sort((a, b) => a.getTime() - b.getTime())[0]
  }
  return {
    ...pond,
    portion,
    next_feeding_at: nextFeeding ? isoWib(nextFeeding) : null,
    schedule_id: schedule?.id ?? null,
    last_run: {
      status: lastRun?.status ?? null,
      planned_at: lastRun?.planned_at ?? null,
      target_grams: lastRun?.target_grams ?? null,
      actual_grams: lastRun?.actual_grams ?? null,
    },
  }
}

function telemetryRows(params = {}) {
  const limit = Math.min(1000, Math.max(1, Number(params.limit || 200)))
  const rows = store.telemetry
    .filter((row) => {
      const day = row.recorded_at.slice(0, 10)
      if (params.date_from && day < params.date_from) return false
      if (params.date_to && day > params.date_to) return false
      return true
    })
    .slice(-limit)
    .reverse()
  return { device_id: store.device.device_id, items: rows }
}

function createCommand(kind, payload, pond = null) {
  const issued = new Date()
  const uid = newCommandUid()
  const command = {
    id: store.counters.commandId,
    command_uid: uid,
    device_id: store.device.device_id,
    kind,
    pond_id: pond?.id ?? payload?.pond_id ?? null,
    pond_name: pond?.name ?? null,
    run_id: null,
    priority: kind === 'emergency_stop' ? 100 : 0,
    status: 'pending',
    issued_by: store.user.id,
    issued_by_name: store.user.username,
    issued_at: isoWib(issued),
    expires_at: isoWib(new Date(issued.getTime() + 120_000)),
    delivered_at: null,
    ack_at: null,
    executed_at: null,
    result: null,
    error: null,
    payload: { command_id: uid, type: kind, ...payload },
  }
  store.counters.commandId += 1
  store.commands.unshift(command)
  return command
}

export const demoApi = {
  dashboard() {
    const now = new Date()
    const lastRuns = new Map()
    for (const run of store.runs) {
      if (run.status === 'planned') continue
      const current = lastRuns.get(run.pond_id)
      if (!current || run.planned_at > current.planned_at || (run.planned_at === current.planned_at && run.id > current.id)) {
        lastRuns.set(run.pond_id, run)
      }
    }

    const pondRows = store.ponds.map((pond) => pondDashboard(pond, lastRuns))
    const upcoming = []
    for (const pond of store.ponds) {
      const schedule = store.effective(pond)
      if (!schedule) continue
      const portion = store.portionFor(schedule, pond)
      for (const time of schedule.feeding_times) {
        const at = nextOccurrence(time, now)
        upcoming.push({
          pond_id: pond.id,
          pond_index: pond.pond_index,
          pond_name: pond.name,
          side: pond.side,
          time,
          at: isoWib(at),
          grams: portion?.grams ?? 0,
          rotations: portion?.rotations ?? 0,
          schedule_id: schedule.id,
        })
      }
    }
    upcoming.sort((a, b) => a.at.localeCompare(b.at))

    const today = wibToday(now)
    const todayRuns = store.runs.filter((run) => run.planned_at.slice(0, 10) === today)
    const counts = {}
    for (const run of todayRuns) counts[run.status] = (counts[run.status] || 0) + 1
    const dispensedGrams = todayRuns
      .filter((run) => run.status === 'dispensed')
      .reduce((total, run) => total + (run.actual_grams || 0), 0)

    const seriesRows = store.telemetry.slice(-60)
    const latest = latestTelemetry()
    if (seriesRows.length) seriesRows[seriesRows.length - 1] = latest

    const daily = dailyPlanKg()
    const available = availableStock()
    const activeAlarms = store.alarms
      .filter((alarm) => ['open', 'acknowledged'].includes(alarm.status))
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at))

    return {
      generated_at: isoWib(now),
      device: deviceOut(false),
      telemetry: latest,
      series: {
        at: seriesRows.map((row) => row.recorded_at),
        temperature_c: seriesRows.map((row) => row.environment.temperature_c),
        humidity_pct: seriesRows.map((row) => row.environment.humidity_pct),
        pressure_kpa: seriesRows.map((row) => row.environment.pressure_kpa),
        power_w: seriesRows.map((row) => row.power.power_w),
        dc_current_a: seriesRows.map((row) => row.power.dc_current_a),
        hopper_remaining_kg: seriesRows.map((row) => row.hopper.remaining_kg),
      },
      ponds: pondRows,
      alarms: activeAlarms,
      upcoming: upcoming.slice(0, 8),
      feed: {
        stock_kg: stockTotal(),
        reserved_kg: 0,
        available_kg: available,
        daily_plan_kg: daily,
        days_estimate: daily > 0 ? Math.round((available / daily) * 10) / 10 : null,
      },
      today: {
        date: today,
        counts,
        dispensed_grams: Math.round(dispensedGrams * 10) / 10,
        planned: todayRuns.length,
      },
      commands: {
        pending: store.commands.filter((command) => ['pending', 'delivered'].includes(command.status)).length,
      },
      role: store.user.role,
      permissions: { manage_schedule: true, manage_feed: true, reset_device: true },
    }
  },

  ponds() {
    return store.ponds.map((pond) => ({ ...pond }))
  },

  pond(id) {
    const pond = store.ponds.find((item) => item.id === Number(id))
    if (!pond) throw new Error('Kolam tidak ditemukan.')
    return { ...pond }
  },

  updateBiomass(id, biomassKg, note) {
    const pond = store.ponds.find((item) => item.id === Number(id))
    if (!pond) throw new Error('Kolam tidak ditemukan.')
    const value = Number(biomassKg)
    if (!Number.isFinite(value) || value < 0.1) throw new Error('Biomassa tidak valid.')
    pond.biomass_kg = Math.round(value * 100) / 100
    pond.biomass_updated_at = isoWib(new Date())
    addAudit(
      'pond.biomass_update',
      'pond',
      pond.id,
      `Biomassa ${pond.name} diperbarui menjadi ${pond.biomass_kg.toFixed(1)} kg${note ? ` (${note})` : ''}.`,
    )
    return { ...pond }
  },

  schedules() {
    return store.schedules.map((schedule) => scheduleOut(schedule))
  },

  effectiveSchedules() {
    return effectiveRows()
  },

  createSchedule(payload) {
    const now = isoWib(new Date())
    const pond = payload.scope === 'pond' ? store.ponds.find((item) => item.id === Number(payload.pond_id)) : null
    const schedule = {
      id: store.counters.scheduleId,
      scope: payload.scope,
      side: payload.side || pond?.side || null,
      pond_id: payload.pond_id ? Number(payload.pond_id) : null,
      feeding_times: [...(payload.feeding_times || [])],
      portion_mode: payload.portion_mode || 'fixed',
      portion_grams: payload.portion_grams ?? null,
      biomass_percent: payload.biomass_percent ?? null,
      pellet_type: payload.pellet_type || 'medium',
      active: payload.active !== false,
      version: 1,
      note: payload.note || null,
      created_by: store.user.id,
      updated_by: store.user.id,
      created_at: now,
      updated_at: now,
      overrides: (payload.overrides || []).map((override) => ({
        id: store.nextOverrideId(),
        pond_id: Number(override.pond_id),
        portion_grams: override.portion_grams ?? null,
        biomass_percent: override.biomass_percent ?? null,
      })),
    }
    store.counters.scheduleId += 1
    store.schedules.push(schedule)
    addAudit('schedule.create', 'schedule', schedule.id, `Jadwal #${schedule.id} (${schedule.scope}) dibuat.`)
    return scheduleOut(schedule)
  },

  updateSchedule(id, payload) {
    const schedule = store.schedules.find((item) => item.id === Number(id))
    if (!schedule) throw new Error('Jadwal tidak ditemukan.')
    const pond = payload.scope === 'pond' ? store.ponds.find((item) => item.id === Number(payload.pond_id)) : null
    schedule.scope = payload.scope
    schedule.side = payload.side || pond?.side || null
    schedule.pond_id = payload.pond_id ? Number(payload.pond_id) : null
    schedule.feeding_times = [...(payload.feeding_times || [])]
    schedule.portion_mode = payload.portion_mode
    schedule.portion_grams = payload.portion_grams ?? null
    schedule.biomass_percent = payload.biomass_percent ?? null
    schedule.pellet_type = payload.pellet_type || 'medium'
    schedule.active = payload.active !== false
    schedule.note = payload.note || null
    schedule.version += 1
    schedule.updated_by = store.user.id
    schedule.updated_at = isoWib(new Date())
    schedule.overrides = (payload.overrides || []).map((override) => ({
      id: store.nextOverrideId(),
      pond_id: Number(override.pond_id),
      portion_grams: override.portion_grams ?? null,
      biomass_percent: override.biomass_percent ?? null,
    }))
    addAudit('schedule.update', 'schedule', schedule.id, `Jadwal #${schedule.id} diperbarui ke versi ${schedule.version}.`)
    return scheduleOut(schedule)
  },

  setScheduleActive(id, active) {
    const schedule = store.schedules.find((item) => item.id === Number(id))
    if (!schedule) throw new Error('Jadwal tidak ditemukan.')
    schedule.active = !!active
    schedule.version += 1
    schedule.updated_by = store.user.id
    schedule.updated_at = isoWib(new Date())
    if (!schedule.active) {
      for (const command of store.commands) {
        if (command.status === 'pending' && command.payload?.schedule_id === schedule.id) {
          command.status = 'cancelled'
          command.error = 'Dibatalkan karena jadwal dinonaktifkan.'
        }
      }
    }
    addAudit(
      schedule.active ? 'schedule.resume' : 'schedule.pause',
      'schedule',
      schedule.id,
      `Jadwal #${schedule.id} ${schedule.active ? 'diaktifkan' : 'dijeda'}.`,
    )
    return scheduleOut(schedule)
  },

  deleteSchedule(id) {
    const index = store.schedules.findIndex((item) => item.id === Number(id))
    if (index < 0) throw new Error('Jadwal tidak ditemukan.')
    const [removed] = store.schedules.splice(index, 1)
    for (const command of store.commands) {
      if (command.status === 'pending' && command.payload?.schedule_id === removed.id) {
        command.status = 'cancelled'
        command.error = 'Dibatalkan karena jadwal dihapus.'
      }
    }
    addAudit('schedule.delete', 'schedule', removed.id, `Jadwal #${removed.id} dihapus.`)
    return { ok: true }
  },

  feeds() {
    return feedPayload()
  },

  createFeed(payload) {
    const now = isoWib(new Date())
    const feed = {
      id: store.feeds.length + 1,
      name: payload.name,
      feed_type: payload.feed_type || 'pelet',
      quantity_kg: Number(payload.quantity_kg || 0),
      price_per_kg: payload.price_per_kg ?? null,
      vendor: payload.vendor || null,
      active: payload.active !== false,
      created_at: now,
      updated_at: now,
    }
    store.feeds.push(feed)
    addAudit('feed.create', 'feed_stock', feed.id, `Menambah stok pakan ${feed.name} ${feed.quantity_kg} kg.`)
    return feed
  },

  updateFeed(id, payload) {
    const feed = store.feeds.find((item) => item.id === Number(id))
    if (!feed) throw new Error('Stok pakan tidak ditemukan.')
    Object.assign(feed, payload, { updated_at: isoWib(new Date()) })
    addAudit('feed.update', 'feed_stock', feed.id, `Memperbarui stok pakan ${feed.name}.`)
    return feed
  },

  runs(params) {
    const filtered = filterRuns(params)
    return {
      total: filtered.total,
      items: filtered.rows.slice(filtered.offset, filtered.offset + filtered.limit).map(runOut),
      limit: filtered.limit,
      offset: filtered.offset,
    }
  },

  run(id) {
    const run = store.runs.find((item) => item.id === Number(id))
    if (!run) throw new Error('Riwayat tidak ditemukan.')
    return runOut(run)
  },

  manualFeed(payload) {
    const pond = store.ponds.find((item) => item.id === Number(payload.pond_id))
    if (!pond) throw new Error('Kolam tidak ditemukan.')
    const grams = Number(payload.portion_grams)
    if (!Number.isFinite(grams) || grams <= 0) throw new Error('Porsi tidak valid.')
    if (grams / 1000 > availableStock()) throw new Error('Stok pakan tidak cukup.')
    const command = createCommand(
      'feed',
      {
        pond_id: pond.id,
        pond_index: pond.pond_index,
        side: pond.side,
        portion_grams: grams,
        rotary_rotations: Math.round((grams / 200) * 100) / 100,
        pellet_type: 'medium',
        note: payload.note || null,
        idempotency_key: payload.idempotency_key || null,
      },
      pond,
    )
    addAudit('feeding.manual', 'pond', pond.id, `Manual feed ${grams} g untuk ${pond.name} masuk antrean.`)
    return { command }
  },

  commands(params = {}) {
    const limit = Math.min(500, Math.max(1, Number(params.limit || 50)))
    const rows = [...store.commands]
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at) || b.id - a.id)
      .slice(0, limit)
    return { items: rows.map((command) => ({ ...command, payload: { ...command.payload } })) }
  },

  cancelCommand(uid) {
    const command = store.commands.find((item) => item.command_uid === uid)
    if (!command) throw new Error('Perintah tidak ditemukan.')
    if (!['pending', 'delivered'].includes(command.status)) throw new Error('Perintah tidak dapat dibatalkan.')
    command.status = 'cancelled'
    command.error = 'Dibatalkan oleh operator.'
    addAudit('command.cancel', 'command', command.id, `Perintah ${uid.slice(0, 8)} dibatalkan.`)
    return { ...command }
  },

  estop(reason) {
    store.device.state = 'emergency_stop'
    const command = createCommand('emergency_stop', { confirm: true, reason: reason || null })
    addAudit('device.estop', 'device', store.device.id, `Emergency stop dikirim${reason ? `: ${reason}` : ''}.`)
    return { command }
  },

  resetDevice() {
    store.device.state = 'idle'
    const command = createCommand('reset', { confirm: true })
    addAudit('device.reset', 'device', store.device.id, 'Perintah reset / validasi keamanan dikirim.')
    return { command }
  },

  homeDevice() {
    store.device.state = 'idle'
    const command = createCommand('home', {})
    addAudit('device.home', 'device', store.device.id, 'Perintah homing gantry dikirim.')
    return { command }
  },

  alarms(params = {}) {
    let rows = [...store.alarms]
    if (params.status) rows = rows.filter((alarm) => alarm.status === params.status)
    if (params.alarm_type) rows = rows.filter((alarm) => alarm.alarm_type === params.alarm_type)
    rows.sort((a, b) => b.detected_at.localeCompare(a.detected_at))
    const total = rows.length
    const limit = Math.min(500, Math.max(1, Number(params.limit || 100)))
    const offset = Math.max(0, Number(params.offset || 0))
    return {
      total,
      items: rows.slice(offset, offset + limit),
      open_count: store.alarms.filter((alarm) => alarm.status === 'open').length,
      acknowledged_count: store.alarms.filter((alarm) => alarm.status === 'acknowledged').length,
    }
  },

  acknowledgeAlarm(id, note) {
    const alarm = store.alarms.find((item) => item.id === Number(id))
    if (!alarm) throw new Error('Alarm tidak ditemukan.')
    if (alarm.status === 'resolved') throw new Error('Alarm sudah diselesaikan.')
    if (alarm.status === 'open') {
      alarm.status = 'acknowledged'
      alarm.acknowledged_by = store.user.id
      alarm.acknowledged_at = isoWib(new Date())
      alertForalarm('alarm.acknowledge', alarm, note)
    }
    return { ...alarm }
  },

  resolveAlarm(id, note) {
    const alarm = store.alarms.find((item) => item.id === Number(id))
    if (!alarm) throw new Error('Alarm tidak ditemukan.')
    if (alarm.status === 'resolved') return { ...alarm }
    alarm.status = 'resolved'
    alarm.resolved_by = store.user.id
    alarm.resolved_at = isoWib(new Date())
    if (!alarm.acknowledged_at) {
      alarm.acknowledged_by = store.user.id
      alarm.acknowledged_at = alarm.resolved_at
    }
    alertForalarm('alarm.resolve', alarm, note)
    return { ...alarm }
  },

  audit(params = {}) {
    const filtered = filterAudit(params)
    return {
      total: filtered.total,
      items: filtered.rows.slice(filtered.offset, filtered.offset + filtered.limit),
      limit: filtered.limit,
      offset: filtered.offset,
    }
  },

  devices() {
    return [deviceOut(true)]
  },

  deviceConfig() {
    const active = store.schedules.filter((schedule) => schedule.active)
    return {
      device_id: store.device.device_id,
      config_version: 1,
      known_version: store.device.config_version,
      changed: false,
      generated_at: isoWib(new Date()),
      schedules: active.map((schedule) => ({
        schedule_id: schedule.id,
        scope: schedule.scope,
        side: schedule.side,
        pond_id: schedule.pond_id,
        times: schedule.feeding_times,
        pellet_type: schedule.pellet_type,
        targets: store.appliesTo(schedule),
        version: schedule.version,
      })),
      limits: {
        max_feeding_per_pond_per_day: 3,
        grams_per_rotation: 200,
        max_portion_grams: 10000,
        max_manual_portion_grams: 5000,
        command_ttl_seconds: 120,
      },
    }
  },

  telemetry(params = {}) {
    return telemetryRows(params)
  },

  rotateDeviceKey(deviceId) {
    if (deviceId !== store.device.device_id) throw new Error('Perangkat tidak ditemukan.')
    const key = `fg_demo_${newCommandUid().slice(0, 24)}`
    store.device.api_key_hint = key.slice(0, 8)
    addAudit('device.rotate_key', 'device', store.device.id, `Rotasi API key perangkat ${store.device.device_id}.`)
    return {
      device_id: store.device.device_id,
      api_key: key,
      warning: 'Simpan key ini sekarang. Key tidak dapat ditampilkan lagi.',
    }
  },

  async download(path, filename) {
    const url = new URL(path, 'http://demo.local')
    const params = Object.fromEntries(url.searchParams.entries())
    if (url.pathname === '/runs/export.csv') {
      const { rows } = filterRuns(params)
      downloadRunsCsv(rows, filename)
      return
    }
    if (url.pathname === '/runs/export.pdf') {
      const { rows } = filterRuns(params)
      const period = `${params.date_from || 'awal'} s/d ${params.date_to || wibToday()}`
      downloadRunsPdf(rows, filename, period)
      return
    }
    if (url.pathname === '/devices/telemetry/export.csv') {
      const { items } = telemetryRows({ limit: 1000, date_from: params.date_from, date_to: params.date_to })
      downloadTelemetryCsv(items.slice().reverse(), filename)
      return
    }
    if (url.pathname === '/audit/export.csv') {
      const { rows } = filterAudit({ ...params, limit: 10000 })
      downloadAuditCsv(rows, filename)
      return
    }
    throw new Error('Ekspor ini belum tersedia pada mode data tertanam.')
  },
}

export { store }

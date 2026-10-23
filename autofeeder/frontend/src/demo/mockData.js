/**
 * Embedded presentation dataset.
 *
 * Everything here is generated in the browser so the demo can run without the
 * FastAPI backend. Timestamps are anchored to "today" (WIB), matching the
 * server-side seed shape. This module is only imported when VITE_USE_MOCK=true.
 */

const WIB = 'Asia/Jakarta'
const GRAMS_PER_ROTATION = 200
const HOPPER_CAPACITY_KG = 15
const HISTORY_DAYS = 14
const DEMO_USER = { id: 1, username: 'Operator Demo', role: 'admin' }

const dateOnly = new Intl.DateTimeFormat('en-CA', {
  timeZone: WIB,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: WIB,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function wibToday(date = new Date()) {
  return dateOnly.format(date)
}

export function isoWib(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const p = Object.fromEntries(dateTimeParts.formatToParts(date).map((part) => [part.type, part.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+07:00`
}

export function atWib(day, time) {
  return new Date(`${day}T${time}:00+07:00`)
}

export function addDays(day, amount) {
  const [year, month, date] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, date + amount))
  return utc.toISOString().slice(0, 10)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000)
}

export function nextOccurrence(time, now = new Date()) {
  const today = wibToday(now)
  let occurrence = atWib(today, time)
  if (occurrence.getTime() <= now.getTime()) occurrence = atWib(addDays(today, 1), time)
  return occurrence
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function makeRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexId(rng) {
  let text = ''
  for (let index = 0; index < 32; index += 1) text += Math.floor(rng() * 16).toString(16)
  return text
}

function buildPonds(now) {
  const ponds = []
  for (let index = 1; index <= 10; index += 1) {
    const biomassUpdated = addMinutes(now, -(index % 7 + 1) * 24 * 60)
    ponds.push({
      id: index,
      fishlinker_kolam_id: null,
      name: `Kolam L${index}`,
      side: 'left',
      pond_index: index,
      position_m: round((index - 1) * 1.6 + 0.8, 2),
      biomass_kg: 500 + index * 12,
      biomass_updated_at: isoWib(biomassUpdated),
      diameter_m: 3,
      is_active: true,
    })
  }
  for (let index = 1; index <= 10; index += 1) {
    const biomassUpdated = addMinutes(now, -(index % 6 + 1) * 24 * 60)
    ponds.push({
      id: 10 + index,
      fishlinker_kolam_id: null,
      name: `Kolam R${index}`,
      side: 'right',
      pond_index: 10 + index,
      position_m: round((index - 1) * 1.6 + 0.8, 2),
      biomass_kg: 480 + index * 14,
      biomass_updated_at: isoWib(biomassUpdated),
      diameter_m: 3,
      is_active: true,
    })
  }
  return ponds
}

function buildSchedules(now) {
  const created = isoWib(addMinutes(now, -30 * 24 * 60))
  return [
    {
      id: 1,
      scope: 'global',
      side: null,
      pond_id: null,
      feeding_times: ['07:00', '16:00'],
      portion_mode: 'fixed',
      portion_grams: 1000,
      biomass_percent: null,
      pellet_type: 'medium',
      active: true,
      version: 1,
      note: 'Jadwal produksi 2x sehari',
      created_by: DEMO_USER.id,
      updated_by: DEMO_USER.id,
      created_at: created,
      updated_at: created,
      overrides: [
        { id: 1, pond_id: 3, portion_grams: 1300, biomass_percent: null },
        { id: 2, pond_id: 17, portion_grams: 900, biomass_percent: null },
      ],
    },
    {
      id: 2,
      scope: 'row',
      side: 'left',
      pond_id: null,
      feeding_times: ['06:30', '15:30'],
      portion_mode: 'percent',
      portion_grams: null,
      biomass_percent: 2,
      pellet_type: 'medium',
      active: false,
      version: 1,
      note: 'Contoh jadwal berbasis biomassa (nonaktif)',
      created_by: DEMO_USER.id,
      updated_by: DEMO_USER.id,
      created_at: created,
      updated_at: created,
      overrides: [],
    },
  ]
}

function buildTelemetry(now, ponds) {
  const rng = makeRng(771029)
  const start = atWib(addDays(wibToday(now), -(HISTORY_DAYS - 1)), '00:00')
  const rows = []
  let moment = start
  let index = 0
  let lastRemaining = 12.2
  while (moment.getTime() < now.getTime()) {
    const progress = (moment.getTime() - start.getTime()) / Math.max(1, now.getTime() - start.getTime())
    let remaining = round(9.5 + 4.5 * ((index % 16) / 15), 2)
    if (index % 16 === 0) remaining = 14.6
    const level = round((remaining / HOPPER_CAPACITY_KG) * 100, 1)
    const temperature = round(30 + 2 * ((index % 24) / 23) + (rng() - 0.5) * 0.8, 2)
    const humidity = round(64 + 10 * ((index % 30) / 29) + (rng() - 0.5) * 2, 1)
    const voltage = round(222 + (rng() - 0.5) * 7, 1)
    const current = round(1.1 + 0.8 * Math.abs(((index % 12) / 12) - 0.5), 2)
    rows.push({
      id: index + 1,
      device_id: 'lele-gantry-001',
      recorded_at: isoWib(moment),
      pond_index: ((Math.floor(index / 5)) % ponds.length) + 1,
      gantry_state: 'idle',
      rail_position_step: Math.round(progress * 32000),
      environment: {
        temperature_c: temperature,
        humidity_pct: humidity,
        pressure_kpa: round(100.5 + 0.8 * ((index % 9) / 9), 2),
      },
      hopper: {
        feed_present: true,
        remaining_kg: remaining,
        level_percent: level,
      },
      power: {
        voltage_v: voltage,
        current_a: current,
        power_w: round(voltage * current * 0.94, 1),
        energy_kwh: round(118 + index * 0.071, 3),
        dc_current_a: round(0.35 + 1.4 * Math.abs(((index % 8) / 8) - 0.5), 2),
      },
    })
    lastRemaining = remaining
    index += 1
    moment = addMinutes(moment, 30)
  }
  // Keep the most recent sample visually fresh while the app is open.
  if (rows.length) {
    rows[rows.length - 1].recorded_at = isoWib(new Date(Date.now() - 40_000))
    rows[rows.length - 1].hopper.remaining_kg = lastRemaining
    rows[rows.length - 1].hopper.level_percent = round((lastRemaining / HOPPER_CAPACITY_KG) * 100, 1)
  }
  return rows
}

export function createDemoStore() {
  const now = new Date()
  const today = wibToday(now)
  const rng = makeRng(20261022)
  const ponds = buildPonds(now)
  const schedules = buildSchedules(now)
  const telemetry = buildTelemetry(now, ponds)
  const feeds = [
    {
      id: 1,
      name: 'Pelet 781-1',
      feed_type: 'pelet',
      quantity_kg: 500,
      price_per_kg: 14500,
      vendor: 'CV Pakan Nusantara',
      active: true,
      created_at: isoWib(addMinutes(now, -45 * 24 * 60)),
      updated_at: isoWib(addMinutes(now, -8 * 24 * 60)),
    },
    {
      id: 2,
      name: 'Pelet 781-2',
      feed_type: 'pelet',
      quantity_kg: 250,
      price_per_kg: 15200,
      vendor: 'CV Pakan Nusantara',
      active: true,
      created_at: isoWib(addMinutes(now, -45 * 24 * 60)),
      updated_at: isoWib(addMinutes(now, -8 * 24 * 60)),
    },
  ]

  const effective = (pond) => {
    const candidates = schedules
      .filter((schedule) => schedule.active)
      .filter((schedule) => {
        if (schedule.scope === 'pond') return schedule.pond_id === pond.id
        if (schedule.scope === 'row') return schedule.side === pond.side
        return schedule.scope === 'global'
      })
    const priority = { pond: 3, row: 2, global: 1 }
    return candidates.sort((a, b) => priority[b.scope] - priority[a.scope] || b.id - a.id)[0] || null
  }

  const portionFor = (schedule, pond) => {
    if (!schedule) return null
    const override = (schedule.overrides || []).find((item) => item.pond_id === pond.id)
    if (override) {
      if (override.portion_grams !== null && override.portion_grams !== undefined) {
        const grams = round(override.portion_grams, 1)
        return {
          grams,
          rotations: round(grams / GRAMS_PER_ROTATION, 2),
          mode: 'fixed',
          value: grams,
          override: true,
          valid: grams <= 10000,
        }
      }
      const percent = Number(override.biomass_percent || 0)
      const grams = round(Math.min(10000, (pond.biomass_kg * 1000 * percent) / 100), 1)
      return {
        grams,
        rotations: round(grams / GRAMS_PER_ROTATION, 2),
        mode: 'percent',
        value: percent,
        override: true,
        valid: grams <= 10000,
      }
    }
    if (schedule.portion_mode === 'percent') {
      const percent = Number(schedule.biomass_percent || 0)
      const grams = round(Math.min(10000, (pond.biomass_kg * 1000 * percent) / 100), 1)
      return {
        grams,
        rotations: round(grams / GRAMS_PER_ROTATION, 2),
        mode: 'percent',
        value: percent,
        override: false,
        valid: grams <= 10000,
      }
    }
    const grams = round(schedule.portion_grams || 0, 1)
    return {
      grams,
      rotations: round(grams / GRAMS_PER_ROTATION, 2),
      mode: 'fixed',
      value: grams,
      override: false,
      valid: grams <= 10000,
    }
  }

  const appliesTo = (schedule) => {
    let scoped = ponds
    if (schedule.scope === 'row') scoped = ponds.filter((pond) => pond.side === schedule.side)
    if (schedule.scope === 'pond') scoped = ponds.filter((pond) => pond.id === schedule.pond_id)
    return scoped.map((pond) => {
      const portion = portionFor(schedule, pond)
      return {
        pond_id: pond.id,
        pond_index: pond.pond_index,
        pond_name: pond.name,
        side: pond.side,
        grams: portion?.grams ?? 0,
        rotations: portion?.rotations ?? 0,
        override: !!portion?.override,
        valid: portion?.valid ?? true,
      }
    })
  }

  const runs = []
  const commands = []
  let runId = 1
  let commandId = 1
  let overrideId = 2

  const times = ['07:00', '16:00']
  const target = 1000
  const rotations = round(target / GRAMS_PER_ROTATION, 3)

  for (let offset = 0; offset < HISTORY_DAYS; offset += 1) {
    const day = addDays(today, offset - (HISTORY_DAYS - 1))
    for (const time of times) {
      const planned = atWib(day, time)
      if (planned.getTime() >= now.getTime() - 2 * 60_000) continue
      for (const pond of ponds) {
        const roll = rng()
        let status = 'dispensed'
        let actual = round(target * (0.972 + rng() * 0.034), 1)
        let reason = null
        if (roll >= 0.977) {
          status = 'failed'
          actual = null
          reason = ['MOTOR_TIMEOUT', 'PAKAN_TIDAK_TERDETEKSI', 'GANTRY_FAULT'][Math.floor(rng() * 3)]
        } else if (roll >= 0.955) {
          status = 'skipped'
          actual = null
          reason = ['PERAWATAN_KOLAM', 'JADWAL_DILEWATI', 'KOLAM_DIKOSONGKAN'][Math.floor(rng() * 3)]
        }
        const started = addMinutes(planned, (4 + Math.floor(rng() * 19)) / 60)
        const completed = addMinutes(started, (7 + Math.floor(rng() * 24)) / 60)
        const run = {
          id: runId,
          schedule_id: 1,
          pond_id: pond.id,
          pond_name: pond.name,
          side: pond.side,
          source: 'schedule',
          planned_at: isoWib(planned),
          target_grams: target,
          rotary_rotations: rotations,
          status,
          failure_reason: reason,
          actual_grams: actual,
          started_at: status === 'skipped' ? null : isoWib(started),
          completed_at: status === 'skipped' ? null : isoWib(completed),
          created_by: DEMO_USER.id,
          note: null,
          command: null,
        }
        if (status !== 'skipped') {
          const issued = addMinutes(planned, -8 / 60)
          const commandUid = hexId(rng)
          const command = {
            id: commandId,
            command_uid: commandUid,
            device_id: 'lele-gantry-001',
            kind: 'feed',
            pond_id: pond.id,
            pond_name: pond.name,
            run_id: run.id,
            priority: 0,
            status: status === 'dispensed' ? 'executed' : 'failed',
            issued_by: DEMO_USER.id,
            issued_by_name: DEMO_USER.username,
            issued_at: isoWib(issued),
            expires_at: isoWib(addMinutes(issued, 2)),
            delivered_at: isoWib(addMinutes(issued, 2 / 60)),
            ack_at: isoWib(addMinutes(issued, 4 / 60)),
            executed_at: run.completed_at || isoWib(addMinutes(issued, 20 / 60)),
            result: status === 'dispensed' ? { actual_grams: actual } : { error: reason },
            error: status === 'dispensed' ? null : reason,
            payload: {
              command_id: commandUid,
              type: 'feed',
              run_id: run.id,
              pond_id: pond.id,
              pond_index: pond.pond_index,
              side: pond.side,
              portion_grams: target,
              rotary_rotations: rotations,
              pellet_type: 'medium',
              schedule_id: 1,
            },
          }
          const { payload, ...withoutPayload } = command
          run.command = withoutPayload
          commands.push(command)
          commandId += 1
        }
        runs.push(run)
        runId += 1
      }
    }
  }

  // Future slots today are pre-planned so the dashboard is never empty.
  for (const time of times) {
    const planned = atWib(today, time)
    if (planned.getTime() < now.getTime() - 2 * 60_000) continue
    for (const pond of ponds) {
      const schedule = effective(pond)
      const portion = schedule ? portionFor(schedule, pond) : null
      runs.push({
        id: runId,
        schedule_id: schedule?.id ?? null,
        pond_id: pond.id,
        pond_name: pond.name,
        side: pond.side,
        source: 'schedule',
        planned_at: isoWib(planned),
        target_grams: portion?.grams ?? 0,
        rotary_rotations: portion?.rotations ?? 0,
        status: 'planned',
        failure_reason: null,
        actual_grams: null,
        started_at: null,
        completed_at: null,
        created_by: DEMO_USER.id,
        note: null,
        command: null,
      })
      runId += 1
    }
  }

  const usedGrams = runs
    .filter((run) => run.status === 'dispensed')
    .reduce((total, run) => total + (run.actual_grams || 0), 0)
  const usedKg = usedGrams / 1000
  feeds[0].quantity_kg = round(Math.max(0, 500 - usedKg * 0.66), 1)
  feeds[1].quantity_kg = round(Math.max(0, 250 - usedKg * 0.34), 1)
  const stockKg = round(feeds.reduce((total, feed) => total + feed.quantity_kg, 0), 1)

  const lastSample = telemetry[telemetry.length - 1]
  const device = {
    id: 1,
    device_id: 'lele-gantry-001',
    name: 'Gantry Lele 001',
    status: 'online',
    state: 'idle',
    gantry_pond_index: lastSample?.pond_index ?? 12,
    rail_position_step: lastSample?.rail_position_step ?? 17600,
    hopper_level_percent: lastSample?.hopper.level_percent ?? 81.3,
    firmware_version: 'gantry-demo-1.1.0',
    config_version: 1,
    last_seen_at: isoWib(new Date(Date.now() - 45_000)),
    api_key_hint: 'fg_o6mvGg',
  }

  const alarms = [
    {
      id: 1,
      device_id: device.device_id,
      pond_id: null,
      pond_name: null,
      alarm_type: 'FEED_STOCK_LOW',
      severity: 'warning',
      message: `Stok pakan gudang tersisa ${Math.round(stockKg)} kg (estimasi 4-5 hari).`,
      status: 'open',
      detected_at: isoWib(addMinutes(now, -2 * 60)),
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      meta: { stock_kg: stockKg },
    },
    {
      id: 2,
      device_id: device.device_id,
      pond_id: null,
      pond_name: null,
      alarm_type: 'HOPPER_HUMIDITY',
      severity: 'warning',
      message: 'Kelembapan hopper 87% melewati ambang 85%.',
      status: 'open',
      detected_at: isoWib(addMinutes(now, -95)),
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      meta: { humidity_pct: 87 },
    },
    {
      id: 3,
      device_id: device.device_id,
      pond_id: null,
      pond_name: null,
      alarm_type: 'GANTRY_FAULT',
      severity: 'critical',
      message: 'Limit switch sisi kanan tidak kembali pada percobaan pertama.',
      status: 'acknowledged',
      detected_at: isoWib(addMinutes(now, -(24 + 3) * 60)),
      acknowledged_by: DEMO_USER.id,
      acknowledged_at: isoWib(addMinutes(now, -(24 + 1) * 60)),
      resolved_by: null,
      resolved_at: null,
      meta: { pond_index: 14 },
    },
    {
      id: 4,
      device_id: device.device_id,
      pond_id: null,
      pond_name: null,
      alarm_type: 'HOPPER_TEMPERATURE',
      severity: 'critical',
      message: 'Suhu hopper 46.2 °C melewati ambang 40 °C.',
      status: 'resolved',
      detected_at: isoWib(addMinutes(now, -(5 * 24 + 4) * 60)),
      acknowledged_by: DEMO_USER.id,
      acknowledged_at: isoWib(addMinutes(now, -(5 * 24 + 3) * 60)),
      resolved_by: DEMO_USER.id,
      resolved_at: isoWib(addMinutes(now, -(5 * 24 + 2) * 60)),
      meta: { temperature_c: 46.2 },
    },
    {
      id: 5,
      device_id: device.device_id,
      pond_id: null,
      pond_name: null,
      alarm_type: 'POWER_VOLTAGE',
      severity: 'warning',
      message: 'Tegangan 208.4 V di luar rentang ideal 210-235 V.',
      status: 'resolved',
      detected_at: isoWib(addMinutes(now, -(9 * 24 + 6) * 60)),
      acknowledged_by: DEMO_USER.id,
      acknowledged_at: isoWib(addMinutes(now, -(9 * 24 + 5.5) * 60)),
      resolved_by: DEMO_USER.id,
      resolved_at: isoWib(addMinutes(now, -(9 * 24 + 5) * 60)),
      meta: { voltage_v: 208.4 },
    },
    {
      id: 6,
      device_id: device.device_id,
      pond_id: null,
      pond_name: null,
      alarm_type: 'MOTOR_CURRENT',
      severity: 'warning',
      message: 'Arus 48 VDC tinggi: 8.6 A pada saat manuver.',
      status: 'resolved',
      detected_at: isoWib(addMinutes(now, -(11 * 24 + 2) * 60)),
      acknowledged_by: DEMO_USER.id,
      acknowledged_at: isoWib(addMinutes(now, -(11 * 24 + 1.5) * 60)),
      resolved_by: DEMO_USER.id,
      resolved_at: isoWib(addMinutes(now, -(11 * 24 + 1) * 60)),
      meta: { dc_current_a: 8.6 },
    },
  ]

  const audits = [
    {
      action: 'schedule.update',
      entity: 'schedule',
      entity_id: '1',
      description: 'Jadwal global 07:00 & 16:00 diperbarui (2x sehari, 1 kg/kolam).',
      hoursAgo: 12 * 24 + 3,
    },
    {
      action: 'feed.update',
      entity: 'feed_stock',
      entity_id: '1',
      description: 'Restok pakan 200 kg dari CV Pakan Nusantara.',
      hoursAgo: 8 * 24 + 1,
    },
    {
      action: 'device.config_update',
      entity: 'device',
      entity_id: '1',
      description: 'Konfigurasi jadwal diterapkan ke gantry.',
      hoursAgo: 7 * 24 + 5,
    },
    {
      action: 'pond.biomass_update',
      entity: 'pond',
      entity_id: '1',
      description: 'Biomassa Kolam L1 diperbarui menjadi 512.0 kg.',
      hoursAgo: 5 * 24 + 2,
    },
    {
      action: 'alarm.acknowledge',
      entity: 'alarm',
      entity_id: '3',
      description: 'Gantry fault sisi kanan diperiksa dan di-acknowledge.',
      hoursAgo: 27,
    },
    {
      action: 'feed.manual',
      entity: 'pond',
      entity_id: '4',
      description: 'Manual feed 800 g untuk Kolam L4 di luar jadwal.',
      hoursAgo: 5,
    },
    {
      action: 'device.home',
      entity: 'device',
      entity_id: '1',
      description: 'Perintah homing gantry dikirim dari halaman perangkat.',
      hoursAgo: 3,
    },
    {
      action: 'alarm.resolve',
      entity: 'alarm',
      entity_id: '4',
      description: 'Alarm suhu hopper dinyatakan selesai setelah pembersihan filter.',
      hoursAgo: 2,
    },
  ].map((item, index) => ({
    id: index + 1,
    at: isoWib(addMinutes(now, -item.hoursAgo * 60)),
    user_id: DEMO_USER.id,
    username: DEMO_USER.username,
    role: DEMO_USER.role,
    action: item.action,
    entity: item.entity,
    entity_id: item.entity_id,
    description: item.description,
    ip: '127.0.0.1',
    meta: null,
  }))

  return {
    user: DEMO_USER,
    ponds,
    schedules,
    runs,
    commands,
    telemetry,
    feeds,
    alarms,
    audits,
    device,
    counters: {
      runId,
      commandId,
      alarmId: 7,
      auditId: audits.length + 1,
      scheduleId: 3,
    },
    nextOverrideId: () => {
      overrideId += 1
      return overrideId
    },
    stockKg: () => round(feeds.filter((feed) => feed.active).reduce((total, feed) => total + feed.quantity_kg, 0), 3),
    effective,
    portionFor,
    appliesTo,
  }
}

export { DEMO_USER, GRAMS_PER_ROTATION, HOPPER_CAPACITY_KG }

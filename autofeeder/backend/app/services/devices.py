"""Device online state, telemetry ingestion, thresholds and config payload."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from . import alarms, schedules
from .timeutil import iso_wib, utcnow


def device_online(device: models.Device | None, now=None) -> bool:
    if not device or not device.last_seen_at:
        return False
    if settings.demo_mode:
        return True
    now = now or utcnow()
    return (now - device.last_seen_at).total_seconds() <= settings.device_offline_seconds


def touch_device(db: Session, device: models.Device) -> None:
    device.last_seen_at = utcnow()
    device.status = "online"
    alarms.resolve_alarm_condition(db, alarm_type="DEVICE_OFFLINE", device_id=device.device_id)


def refresh_device_status(db: Session) -> int:
    changed = 0
    for device in db.query(models.Device).filter(models.Device.is_active.is_(True)).all():
        online = device_online(device)
        if not online and device.status != "offline":
            device.status = "offline"
            alarms.raise_alarm(
                db,
                alarm_type="DEVICE_OFFLINE",
                message=f"Perangkat {device.device_id} terputus dari server.",
                severity="critical",
                device_id=device.device_id,
            )
            changed += 1
        elif online and device.status == "offline":
            device.status = "online"
            changed += 1
    return changed


def ingest_telemetry(db: Session, device: models.Device, payload: schemas.TelemetryIn) -> models.Telemetry:
    recorded_at = payload.recorded_at or utcnow()
    env = payload.environment
    power = payload.power
    hopper = payload.hopper
    status = payload.status

    row = models.Telemetry(
        device_id=device.device_id,
        recorded_at=recorded_at,
        pond_index=status.gantry_pond_index if status else device.gantry_pond_index,
        gantry_state=status.state if status else device.state,
        rail_position_step=status.rail_position_step if status else device.rail_position_step,
        hopper_temp_c=env.temperature_c if env else None,
        hopper_humidity_pct=env.humidity_pct if env else None,
        hopper_pressure_kpa=env.pressure_kpa if env else None,
        hopper_feed_present=hopper.feed_present if hopper else None,
        hopper_remaining_kg=hopper.remaining_kg if hopper else None,
        hopper_level_percent=hopper.level_percent if hopper else None,
        voltage_v=power.voltage_v if power else None,
        current_a=power.current_a if power else None,
        power_w=power.power_w if power else None,
        energy_kwh=power.energy_kwh if power else None,
        dc_current_a=power.dc_current_a if power else None,
        raw=payload.model_dump(mode="json", exclude_none=True),
    )
    db.add(row)

    touch_device(db, device)
    if status:
        device.state = status.state or device.state
        device.gantry_pond_index = status.gantry_pond_index or device.gantry_pond_index
        device.rail_position_step = (
            status.rail_position_step if status.rail_position_step is not None else device.rail_position_step
        )
    if hopper:
        if hopper.level_percent is not None:
            device.hopper_level_percent = hopper.level_percent
        elif hopper.remaining_kg is not None:
            device.hopper_level_percent = min(100.0, hopper.remaining_kg / settings.hopper_capacity_kg * 100.0)
    if payload.device and payload.device.firmware_version:
        device.firmware_version = payload.device.firmware_version

    _evaluate_thresholds(db, device, env, power, hopper, status)
    return row


def _evaluate_thresholds(db, device, env, power, hopper, status) -> None:
    if env:
        if env.temperature_c is not None and env.temperature_c > 40:
            alarms.raise_alarm(
                db,
                alarm_type="HOPPER_TEMPERATURE",
                message=f"Suhu hopper {env.temperature_c:.1f} °C melewati ambang 40 °C.",
                severity="critical" if env.temperature_c > 50 else "warning",
                device_id=device.device_id,
                meta={"temperature_c": env.temperature_c},
            )
        elif env.temperature_c is not None and env.temperature_c <= 38:
            alarms.resolve_alarm_condition(db, alarm_type="HOPPER_TEMPERATURE", device_id=device.device_id)

        if env.humidity_pct is not None and env.humidity_pct > 85:
            alarms.raise_alarm(
                db,
                alarm_type="HOPPER_HUMIDITY",
                message=f"Kelembapan hopper {env.humidity_pct:.0f}% melewati ambang 85%.",
                severity="warning",
                device_id=device.device_id,
                meta={"humidity_pct": env.humidity_pct},
            )
        elif env.humidity_pct is not None and env.humidity_pct <= 80:
            alarms.resolve_alarm_condition(db, alarm_type="HOPPER_HUMIDITY", device_id=device.device_id)

    if hopper:
        empty = hopper.feed_present is False or (
            hopper.remaining_kg is not None and hopper.remaining_kg <= 0.2
        )
        if empty:
            alarms.raise_alarm(
                db,
                alarm_type="HOPPER_EMPTY",
                message="Pakan di hopper habis atau tidak terdeteksi.",
                severity="critical",
                device_id=device.device_id,
                meta={"remaining_kg": hopper.remaining_kg, "feed_present": hopper.feed_present},
            )
        elif (hopper.remaining_kg is None or hopper.remaining_kg > 1.0) and hopper.feed_present is not False:
            alarms.resolve_alarm_condition(db, alarm_type="HOPPER_EMPTY", device_id=device.device_id)

    if power:
        voltage = power.voltage_v
        if voltage is not None and (voltage < 198 or voltage > 242):
            alarms.raise_alarm(
                db,
                alarm_type="POWER_VOLTAGE",
                message=f"Tegangan 220 VAC abnormal: {voltage:.1f} V (normal 198-242 V).",
                severity="critical" if voltage < 100 or voltage > 260 else "warning",
                device_id=device.device_id,
                meta={"voltage_v": voltage},
            )
        elif voltage is not None and 205 <= voltage <= 235:
            alarms.resolve_alarm_condition(db, alarm_type="POWER_VOLTAGE", device_id=device.device_id)

        if power.dc_current_a is not None and power.dc_current_a > 8:
            alarms.raise_alarm(
                db,
                alarm_type="MOTOR_CURRENT",
                message=f"Arus 48 VDC tinggi: {power.dc_current_a:.1f} A.",
                severity="warning",
                device_id=device.device_id,
                meta={"dc_current_a": power.dc_current_a},
            )
        elif power.dc_current_a is not None and power.dc_current_a <= 6:
            alarms.resolve_alarm_condition(db, alarm_type="MOTOR_CURRENT", device_id=device.device_id)

    if status and status.state:
        if status.state == "fault":
            alarms.raise_alarm(
                db,
                alarm_type="GANTRY_FAULT",
                message="Perangkat melaporkan fault. Periksa gantry, servo, dan limit switch.",
                severity="critical",
                device_id=device.device_id,
            )
        elif status.state == "emergency_stop":
            alarms.raise_alarm(
                db,
                alarm_type="EMERGENCY_STOP",
                message="Emergency stop aktif. Seluruh aktuator dihentikan.",
                severity="critical",
                device_id=device.device_id,
            )


def config_payload(db: Session, device: models.Device) -> dict[str, Any]:
    rows = schedules.load_schedules(db)
    ponds = schedules.active_ponds(db)
    active = [s for s in rows if s.active]
    version = 0
    for s in rows:
        version = max(version, int(s.updated_at.timestamp()) if s.updated_at else 0)
    payload = []
    for s in active:
        targets = schedules.applies_to(s, ponds)
        if not targets:
            continue
        payload.append(
            {
                "schedule_id": s.id,
                "scope": s.scope,
                "side": s.side,
                "pond_id": s.pond_id,
                "times": s.feeding_times,
                "pellet_type": s.pellet_type,
                "targets": targets,
                "version": s.version,
            }
        )
    return {
        "device_id": device.device_id,
        "config_version": version,
        "known_version": device.config_version,
        "changed": version != device.config_version,
        "generated_at": iso_wib(utcnow()),
        "schedules": payload,
        "limits": {
            "max_feeding_per_pond_per_day": 3,
            "grams_per_rotation": settings.grams_per_rotation,
            "max_portion_grams": settings.max_portion_grams,
            "max_manual_portion_grams": settings.max_manual_portion_grams,
            "command_ttl_seconds": settings.command_ttl_seconds,
        },
    }


def mark_config_applied(db: Session, device: models.Device, version: int) -> None:
    device.config_version = version


def telemetry_cleanup(db: Session) -> int:
    cutoff = utcnow() - timedelta(days=settings.retention_days)
    deleted = db.query(models.Telemetry).filter(models.Telemetry.recorded_at < cutoff).delete(
        synchronize_session=False
    )
    return int(deleted or 0)

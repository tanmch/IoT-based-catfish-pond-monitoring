"""Consistent JSON serialisation, with all timestamps expressed in WIB."""
from __future__ import annotations

from typing import Any

from .. import models
from .timeutil import iso_wib


def user_dict(user: models.User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": iso_wib(user.created_at),
        "last_login_at": iso_wib(user.last_login_at),
    }


def pond_dict(pond: models.Pond) -> dict[str, Any]:
    return {
        "id": pond.id,
        "fishlinker_kolam_id": pond.fishlinker_kolam_id,
        "name": pond.name,
        "side": pond.side,
        "pond_index": pond.pond_index,
        "position_m": pond.position_m,
        "biomass_kg": round(pond.biomass_kg, 2),
        "biomass_updated_at": iso_wib(pond.biomass_updated_at),
        "diameter_m": pond.diameter_m,
        "is_active": pond.is_active,
    }


def override_dict(override: models.ScheduleOverride) -> dict[str, Any]:
    return {
        "id": override.id,
        "pond_id": override.pond_id,
        "portion_grams": override.portion_grams,
        "biomass_percent": override.biomass_percent,
    }


def schedule_dict(schedule: models.Schedule, applies_to: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "id": schedule.id,
        "scope": schedule.scope,
        "side": schedule.side,
        "pond_id": schedule.pond_id,
        "feeding_times": schedule.feeding_times,
        "portion_mode": schedule.portion_mode,
        "portion_grams": schedule.portion_grams,
        "biomass_percent": schedule.biomass_percent,
        "pellet_type": schedule.pellet_type,
        "active": schedule.active,
        "version": schedule.version,
        "note": schedule.note,
        "created_by": schedule.created_by,
        "updated_by": schedule.updated_by,
        "created_at": iso_wib(schedule.created_at),
        "updated_at": iso_wib(schedule.updated_at),
        "overrides": [override_dict(o) for o in schedule.overrides],
        "applies_to": applies_to or [],
    }


def feed_dict(feed: models.FeedStock) -> dict[str, Any]:
    return {
        "id": feed.id,
        "name": feed.name,
        "feed_type": feed.feed_type,
        "quantity_kg": round(feed.quantity_kg, 3),
        "price_per_kg": feed.price_per_kg,
        "vendor": feed.vendor,
        "active": feed.active,
        "created_at": iso_wib(feed.created_at),
        "updated_at": iso_wib(feed.updated_at),
    }


def device_dict(device: models.Device | None, online: bool = False) -> dict[str, Any] | None:
    if not device:
        return None
    return {
        "id": device.id,
        "device_id": device.device_id,
        "name": device.name,
        "status": "online" if online else "offline",
        "state": device.state,
        "gantry_pond_index": device.gantry_pond_index,
        "rail_position_step": device.rail_position_step,
        "hopper_level_percent": device.hopper_level_percent,
        "firmware_version": device.firmware_version,
        "config_version": device.config_version,
        "last_seen_at": iso_wib(device.last_seen_at),
        "api_key_hint": device.api_key_hint,
    }


def telemetry_dict(row: models.Telemetry | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": row.id,
        "device_id": row.device_id,
        "recorded_at": iso_wib(row.recorded_at),
        "pond_index": row.pond_index,
        "gantry_state": row.gantry_state,
        "rail_position_step": row.rail_position_step,
        "environment": {
            "temperature_c": row.hopper_temp_c,
            "humidity_pct": row.hopper_humidity_pct,
            "pressure_kpa": row.hopper_pressure_kpa,
        },
        "hopper": {
            "feed_present": row.hopper_feed_present,
            "remaining_kg": row.hopper_remaining_kg,
            "level_percent": row.hopper_level_percent,
        },
        "power": {
            "voltage_v": row.voltage_v,
            "current_a": row.current_a,
            "power_w": row.power_w,
            "energy_kwh": row.energy_kwh,
            "dc_current_a": row.dc_current_a,
        },
    }


def run_dict(run: models.FeedingRun, command: models.Command | None = None) -> dict[str, Any]:
    return {
        "id": run.id,
        "schedule_id": run.schedule_id,
        "pond_id": run.pond_id,
        "pond_name": run.pond.name if run.pond else None,
        "side": run.side,
        "source": run.source,
        "planned_at": iso_wib(run.planned_at),
        "target_grams": run.target_grams,
        "rotary_rotations": run.rotary_rotations,
        "status": run.status,
        "failure_reason": run.failure_reason,
        "actual_grams": run.actual_grams,
        "started_at": iso_wib(run.started_at),
        "completed_at": iso_wib(run.completed_at),
        "created_by": run.created_by,
        "note": run.note,
        "command": command_dict(command, include_payload=False) if command else None,
    }


def command_dict(command: models.Command, include_payload: bool = True) -> dict[str, Any]:
    data = {
        "id": command.id,
        "command_uid": command.command_uid,
        "device_id": command.device_id,
        "kind": command.kind,
        "pond_id": command.pond_id,
        "pond_name": command.pond.name if command.pond else None,
        "run_id": command.run_id,
        "priority": command.priority,
        "status": command.status,
        "issued_by": command.issued_by,
        "issued_by_name": command.issued_by_name,
        "issued_at": iso_wib(command.issued_at),
        "expires_at": iso_wib(command.expires_at),
        "delivered_at": iso_wib(command.delivered_at),
        "ack_at": iso_wib(command.ack_at),
        "executed_at": iso_wib(command.executed_at),
        "result": command.result,
        "error": command.error,
    }
    if include_payload:
        data["payload"] = command.payload
    return data


def alarm_dict(alarm: models.Alarm) -> dict[str, Any]:
    return {
        "id": alarm.id,
        "device_id": alarm.device_id,
        "pond_id": alarm.pond_id,
        "pond_name": alarm.pond.name if alarm.pond else None,
        "alarm_type": alarm.alarm_type,
        "severity": alarm.severity,
        "message": alarm.message,
        "status": alarm.status,
        "detected_at": iso_wib(alarm.detected_at),
        "acknowledged_by": alarm.acknowledged_by,
        "acknowledged_at": iso_wib(alarm.acknowledged_at),
        "resolved_by": alarm.resolved_by,
        "resolved_at": iso_wib(alarm.resolved_at),
        "meta": alarm.meta,
    }


def audit_dict(row: models.AuditLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "at": iso_wib(row.at),
        "user_id": row.user_id,
        "username": row.username,
        "role": row.role,
        "action": row.action,
        "entity": row.entity,
        "entity_id": row.entity_id,
        "description": row.description,
        "ip": row.ip,
        "meta": row.meta,
    }

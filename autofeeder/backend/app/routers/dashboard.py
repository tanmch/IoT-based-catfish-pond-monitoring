"""Dashboard aggregation and optional public monitoring."""
from __future__ import annotations


from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db
from ..deps import ADMIN_ROLES, get_current_user, user_pond_ids
from ..services import feeder as feeder_service
from ..services import schedules as schedule_service
from ..services.serializers import (
    alarm_dict,
    device_dict,
    pond_dict,
    telemetry_dict,
)
from ..services.timeutil import (
    iso_wib,
    next_occurrence,
    to_wib,
    utcnow,
    wib_day_bounds_utc,
)

router = APIRouter(tags=["dashboard"])


def _visible_ponds(db: Session, user: models.User | None) -> list[models.Pond]:
    ponds = schedule_service.active_ponds(db)
    if user is None:
        return ponds
    allowed = user_pond_ids(db, user)
    if allowed is None:
        return ponds
    return [p for p in ponds if p.id in set(allowed)]


def _alarms(db: Session, allowed: list[int] | None, limit: int = 20):
    query = db.query(models.Alarm).filter(models.Alarm.status.in_(("open", "acknowledged")))
    if allowed is not None:
        query = query.filter(
            (models.Alarm.pond_id.in_(allowed or [-1])) | (models.Alarm.pond_id.is_(None))
        )
    return query.order_by(models.Alarm.detected_at.desc()).limit(limit).all()


def _latest_runs(db: Session, pond_ids: list[int]) -> dict[int, models.FeedingRun]:
    result: dict[int, models.FeedingRun] = {}
    for pond_id in pond_ids:
        run = (
            db.query(models.FeedingRun)
            .filter(models.FeedingRun.pond_id == pond_id)
            .order_by(models.FeedingRun.planned_at.desc(), models.FeedingRun.id.desc())
            .first()
        )
        if run:
            result[pond_id] = run
    return result


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    device = feeder_service.primary_device(db)
    online = bool(device and feeder_service.devices.device_online(device))
    latest = feeder_service.latest_telemetry(db, device.device_id) if device else None
    ponds = _visible_ponds(db, user)
    allowed = user_pond_ids(db, user)
    all_schedules = schedule_service.load_schedules(db)
    last_runs = _latest_runs(db, [p.id for p in ponds])
    now = utcnow()

    series_rows = []
    if device:
        series_rows = (
            db.query(models.Telemetry)
            .filter(models.Telemetry.device_id == device.device_id)
            .order_by(models.Telemetry.recorded_at.desc(), models.Telemetry.id.desc())
            .limit(60)
            .all()
        )[::-1]

    pond_rows = []
    upcoming = []
    for pond in ponds:
        schedule = schedule_service.effective_schedule(pond, all_schedules)
        meta = schedule_service.portion_meta(schedule, pond) if schedule else None
        next_at = None
        if schedule:
            occurrences = [next_occurrence(t, now) for t in schedule.feeding_times]
            next_at = min(occurrences) if occurrences else None
            for t in schedule.feeding_times:
                grams = schedule_service.portion_grams_for(schedule, pond)
                upcoming.append(
                    {
                        "pond_id": pond.id,
                        "pond_index": pond.pond_index,
                        "pond_name": pond.name,
                        "side": pond.side,
                        "time": t,
                        "at": iso_wib(next_occurrence(t, now)),
                        "grams": grams,
                        "rotations": schedule_service.rotations_for(grams),
                        "schedule_id": schedule.id,
                    }
                )
        last_run = last_runs.get(pond.id)
        data = pond_dict(pond)
        data.update(
            {
                "portion": meta,
                "next_feeding_at": iso_wib(next_at),
                "schedule_id": schedule.id if schedule else None,
                "last_run": {
                    "status": last_run.status if last_run else None,
                    "planned_at": iso_wib(last_run.planned_at) if last_run else None,
                    "target_grams": last_run.target_grams if last_run else None,
                    "actual_grams": last_run.actual_grams if last_run else None,
                },
            }
        )
        pond_rows.append(data)

    upcoming.sort(key=lambda item: item["at"])
    if allowed is not None:
        upcoming = [u for u in upcoming if u["pond_id"] in set(allowed)]

    day_start, day_end = wib_day_bounds_utc(to_wib(now).date())
    today_query = db.query(models.FeedingRun).filter(
        models.FeedingRun.planned_at >= day_start,
        models.FeedingRun.planned_at < day_end,
    )
    if allowed is not None:
        today_query = today_query.filter(models.FeedingRun.pond_id.in_(allowed or [-1]))
    today_runs = today_query.all()
    today_counts: dict[str, int] = {}
    for run in today_runs:
        today_counts[run.status] = today_counts.get(run.status, 0) + 1

    pending_commands = (
        db.query(models.Command)
        .filter(models.Command.status.in_(("pending", "delivered")))
        .count()
    )
    stock = feeder_service.stock_kg(db)
    reserved = feeder_service.reserved_kg(db)
    daily_kg = schedule_service.daily_planned_grams(db) / 1000.0
    available = max(0.0, stock - reserved)

    return {
        "generated_at": iso_wib(now),
        "device": device_dict(device, online),
        "telemetry": telemetry_dict(latest),
        "series": {
            "at": [iso_wib(r.recorded_at) for r in series_rows],
            "temperature_c": [r.hopper_temp_c for r in series_rows],
            "humidity_pct": [r.hopper_humidity_pct for r in series_rows],
            "pressure_kpa": [r.hopper_pressure_kpa for r in series_rows],
            "power_w": [r.power_w for r in series_rows],
            "dc_current_a": [r.dc_current_a for r in series_rows],
            "hopper_remaining_kg": [r.hopper_remaining_kg for r in series_rows],
        },
        "ponds": pond_rows,
        "alarms": [alarm_dict(a) for a in _alarms(db, allowed, limit=20)],
        "upcoming": upcoming[:8],
        "feed": {
            "stock_kg": stock,
            "reserved_kg": reserved,
            "available_kg": round(available, 3),
            "daily_plan_kg": round(daily_kg, 3),
            "days_estimate": round(available / daily_kg, 1) if daily_kg > 0 else None,
        },
        "today": {
            "date": to_wib(now).date().isoformat(),
            "counts": today_counts,
            "dispensed_grams": round(
                sum(r.actual_grams or 0 for r in today_runs if r.status == "dispensed"), 1
            ),
            "planned": len(today_runs),
        },
        "commands": {"pending": pending_commands},
        "role": user.role,
        "permissions": {
            "manage_schedule": user.role in ADMIN_ROLES,
            "manage_users": user.role in ADMIN_ROLES,
            "manage_feed": user.role in ADMIN_ROLES,
            "reset_device": user.role in ADMIN_ROLES,
        },
    }


@router.get("/public/summary")
def public_summary(db: Session = Depends(get_db)):
    if not settings.public_monitoring:
        raise HTTPException(status_code=404, detail="Mode monitoring publik tidak aktif.")
    device = feeder_service.primary_device(db)
    online = bool(device and feeder_service.devices.device_online(device))
    latest = feeder_service.latest_telemetry(db, device.device_id) if device else None
    alarms = _alarms(db, None, limit=5)
    upcoming = feeder_service.upcoming_runs(db, limit=5)
    return {
        "generated_at": iso_wib(utcnow()),
        "device": device_dict(device, online),
        "telemetry": telemetry_dict(latest),
        "active_alarms": len(_alarms(db, None, limit=100)),
        "alarms": [{"type": a.alarm_type, "severity": a.severity, "message": a.message, "detected_at": iso_wib(a.detected_at)} for a in alarms],
        "upcoming": [
            {
                "time": item["time"],
                "at": item["at"],
                "pond_index": item["pond_index"],
                "pond_name": item["pond_name"],
            }
            for item in upcoming
        ],
    }

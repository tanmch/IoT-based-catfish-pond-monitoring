"""Core auto-feeding logic: scheduling, dispatching, manual feed and ACKs."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..config import settings
from ..deps import can_access_pond, ensure_pond_access
from . import alarms, audit, devices, schedules
from .timeutil import iso_wib, planned_utc_naive, to_wib, utcnow

PENDING_COMMAND_STATUSES = ("pending", "delivered")


def primary_device(db: Session) -> models.Device | None:
    return db.query(models.Device).filter(models.Device.is_active.is_(True)).order_by(models.Device.id).first()


def stock_kg(db: Session) -> float:
    value = (
        db.query(models.FeedStock.quantity_kg)
        .filter(models.FeedStock.active.is_(True))
        .all()
    )
    return round(sum(float(v[0] or 0) for v in value), 3)


def reserved_kg(db: Session) -> float:
    rows = (
        db.query(models.FeedingRun.target_grams)
        .join(models.Command, models.Command.run_id == models.FeedingRun.id)
        .filter(
            models.Command.kind == "feed",
            models.Command.status.in_(PENDING_COMMAND_STATUSES),
        )
        .all()
    )
    return round(sum(float(r[0] or 0) for r in rows) / 1000.0, 3)


def available_stock_kg(db: Session) -> float:
    return round(max(0.0, stock_kg(db) - reserved_kg(db)), 3)


def latest_telemetry(db: Session, device_id: str) -> models.Telemetry | None:
    return (
        db.query(models.Telemetry)
        .filter(models.Telemetry.device_id == device_id)
        .order_by(models.Telemetry.recorded_at.desc(), models.Telemetry.id.desc())
        .first()
    )


def fresh_hopper_kg(db: Session, device: models.Device) -> float | None:
    row = latest_telemetry(db, device.device_id)
    if not row or row.hopper_remaining_kg is None:
        return None
    if (utcnow() - row.recorded_at).total_seconds() > max(300, settings.device_offline_seconds * 5):
        return None
    return float(row.hopper_remaining_kg)


def _new_command(
    db: Session,
    *,
    device: models.Device,
    kind: str,
    payload: dict[str, Any],
    pond_id: int | None = None,
    run_id: int | None = None,
    priority: int = 0,
    ttl_seconds: int | None = None,
    user: models.User | None = None,
    actor_name: str = "system",
    idempotency_key: str | None = None,
) -> models.Command:
    now = utcnow()
    command = models.Command(
        command_uid=uuid.uuid4().hex,
        device_id=device.device_id,
        kind=kind,
        pond_id=pond_id,
        run_id=run_id,
        payload=payload,
        priority=priority,
        status="pending",
        issued_by=user.id if user else None,
        issued_by_name=user.username if user else actor_name,
        issued_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds or settings.command_ttl_seconds),
        idempotency_key=idempotency_key,
    )
    db.add(command)
    db.flush()
    return command


def _feed_payload(
    run: models.FeedingRun,
    command: models.Command,
    schedule: models.Schedule | None,
) -> None:
    command.payload = {
        "command_id": command.command_uid,
        "type": "feed",
        "run_id": run.id,
        "pond_id": run.pond_id,
        "pond_index": run.pond.pond_index,
        "side": run.side,
        "portion_grams": run.target_grams,
        "rotary_rotations": run.rotary_rotations,
        "pellet_type": schedule.pellet_type if schedule else "medium",
        "schedule_id": run.schedule_id,
        "issued_at": iso_wib(command.issued_at),
        "expires_at": iso_wib(command.expires_at),
    }


def materialize_runs(db: Session, now: datetime | None = None) -> int:
    """Create today's planned runs once per pond/effective schedule/time slot.

    Only the most specific active schedule for a pond is materialised (pond >
    row > global). Without this, a pond with both a global and a pond schedule
    would receive two feedings in the same slot.
    """
    now = now or utcnow()
    wib_now = to_wib(now)
    today = wib_now.date()
    ponds = schedules.active_ponds(db)
    active = [s for s in schedules.load_schedules(db) if s.active]
    created = 0

    for pond in ponds:
        schedule = schedules.effective_schedule(pond, active)
        if not schedule:
            continue
        for hhmm in schedule.feeding_times:
            planned_at = planned_utc_naive(today, hhmm)
            if planned_at > now + timedelta(seconds=60):
                continue
            if planned_at < now - timedelta(seconds=settings.schedule_late_grace_seconds):
                continue
            exists = (
                db.query(models.FeedingRun.id)
                .filter(
                    models.FeedingRun.schedule_id == schedule.id,
                    models.FeedingRun.pond_id == pond.id,
                    models.FeedingRun.planned_at == planned_at,
                )
                .first()
            )
            if exists:
                continue
            grams = schedules.portion_grams_for(schedule, pond)
            run = models.FeedingRun(
                schedule_id=schedule.id,
                pond_id=pond.id,
                side=pond.side,
                source="schedule",
                planned_at=planned_at,
                target_grams=grams,
                rotary_rotations=schedules.rotations_for(grams),
                status="planned",
            )
            db.add(run)
            created += 1
    if created:
        db.flush()
    return created


def expire_commands(db: Session, now: datetime | None = None) -> int:
    now = now or utcnow()
    rows = (
        db.query(models.Command)
        .options(joinedload(models.Command.pond))
        .filter(
            models.Command.status.in_(PENDING_COMMAND_STATUSES),
            models.Command.expires_at < now,
        )
        .all()
    )
    for command in rows:
        command.status = "expired"
        command.error = "Perintah kedaluwarsa sebelum di-ACK perangkat."
        if command.run_id:
            run = db.get(models.FeedingRun, command.run_id)
            if run and run.status == "planned":
                run.status = "failed"
                run.failure_reason = "PERINTAH_KEDALUWARSA"
                run.completed_at = now
                alarms.raise_alarm(
                    db,
                    alarm_type="COMMAND_EXPIRED",
                    message=f"Perintah feeding {command.command_uid[:8]} untuk {run.pond.name} kedaluwarsa.",
                    severity="warning",
                    pond_id=run.pond_id,
                    device_id=command.device_id,
                )
        audit.record_audit(
            db,
            action="command.expired",
            entity="command",
            entity_id=command.command_uid,
            description="Perintah kedaluwarsa",
            actor_name="system",
            role="system",
        )
    return len(rows)


def dispatch_run(db: Session, run: models.FeedingRun, device: models.Device) -> models.Command | None:
    if run.status != "planned":
        return None
    if db.query(models.Command.id).filter(models.Command.run_id == run.id).first():
        return None

    if run.target_grams <= 0 or run.target_grams > settings.max_portion_grams:
        run.status = "failed"
        run.failure_reason = "PORSI_TIDAK_VALID"
        run.completed_at = utcnow()
        alarms.raise_alarm(
            db,
            alarm_type="PORTION_INVALID",
            message=f"Porsi untuk {run.pond.name} tidak valid ({run.target_grams:.0f} g). Periksa biomassa/kalibrasi.",
            severity="warning",
            pond_id=run.pond_id,
            device_id=device.device_id,
        )
        return None

    if not devices.device_online(device):
        run.status = "skipped"
        run.failure_reason = "PERANGKAT_OFFLINE"
        run.completed_at = utcnow()
        alarms.raise_alarm(
            db,
            alarm_type="DEVICE_OFFLINE",
            message=f"Perangkat offline; feeding {run.pond.name} tidak dapat dikirim.",
            severity="critical",
            device_id=device.device_id,
        )
        return None

    needed_kg = run.target_grams / 1000.0
    available = available_stock_kg(db)
    if available + 1e-9 < needed_kg:
        run.status = "skipped"
        run.failure_reason = "STOK_PAKAN_TIDAK_CUKUP"
        run.completed_at = utcnow()
        alarms.raise_alarm(
            db,
            alarm_type="FEED_STOCK_LOW",
            message=f"Stok pakan tidak cukup untuk {run.pond.name}: butuh {needed_kg:.2f} kg, tersedia {available:.2f} kg.",
            severity="critical",
            pond_id=run.pond_id,
            device_id=device.device_id,
            meta={"needed_kg": needed_kg, "available_kg": available},
        )
        return None

    hopper_kg = fresh_hopper_kg(db, device)
    if hopper_kg is not None and hopper_kg + 1e-9 < needed_kg:
        run.status = "skipped"
        run.failure_reason = "PAKAN_HOPPER_TIDAK_CUKUP"
        run.completed_at = utcnow()
        alarms.raise_alarm(
            db,
            alarm_type="HOPPER_EMPTY",
            message=f"Pakan di hopper tidak cukup untuk {run.pond.name}: butuh {needed_kg:.2f} kg, tersedia {hopper_kg:.2f} kg.",
            severity="critical",
            device_id=device.device_id,
            meta={"needed_kg": needed_kg, "hopper_kg": hopper_kg},
        )
        return None

    command = _new_command(
        db,
        device=device,
        kind="feed",
        pond_id=run.pond_id,
        run_id=run.id,
        priority=0,
        payload={},
        actor_name="scheduler",
    )
    _feed_payload(run, command, run.schedule)
    run.started_at = utcnow()
    audit.record_audit(
        db,
        action="feeding.dispatch",
        entity="feeding_run",
        entity_id=run.id,
        description=f"Perintah feeding {run.target_grams:.0f} g untuk {run.pond.name} dikirim.",
        actor_name="scheduler",
        role="system",
        meta={"command_uid": command.command_uid},
    )
    return command


def _pending_feed_exists(db: Session) -> bool:
    """A single gantry executes one feed at a time; keep later runs queued server-side."""
    return (
        db.query(models.Command.id)
        .filter(
            models.Command.kind == "feed",
            models.Command.status.in_(PENDING_COMMAND_STATUSES),
        )
        .first()
        is not None
    )


def dispatch_due_runs(db: Session, now: datetime | None = None) -> int:
    now = now or utcnow()
    device = primary_device(db)
    if not device:
        return 0
    if _pending_feed_exists(db):
        return 0
    due = (
        db.query(models.FeedingRun)
        .options(joinedload(models.FeedingRun.pond), joinedload(models.FeedingRun.schedule))
        .filter(
            models.FeedingRun.status == "planned",
            models.FeedingRun.planned_at <= now,
        )
        .order_by(models.FeedingRun.planned_at, models.FeedingRun.id)
        .limit(100)
        .all()
    )
    for run in due:
        if run.schedule_id:
            schedule = run.schedule or db.get(models.Schedule, run.schedule_id)
            if schedule and not schedule.active:
                run.status = "skipped"
                run.failure_reason = "JADWAL_NONAKTIF"
                run.completed_at = now
                continue
        if dispatch_run(db, run, device):
            # Do not issue the next command until the device ACKs this one.
            return 1
    return 0


def scheduler_tick(db: Session, now: datetime | None = None) -> dict[str, int]:
    now = now or utcnow()
    offline = devices.refresh_device_status(db)
    expired = expire_commands(db, now)
    created = materialize_runs(db, now)
    dispatched = dispatch_due_runs(db, now)
    return {"offline": offline, "expired": expired, "created": created, "dispatched": dispatched}


def _low_stock_alarm(db: Session, device_id: str) -> None:
    daily = schedules.daily_planned_grams(db) / 1000.0
    remaining = stock_kg(db)
    if daily > 0 and remaining < daily:
        alarms.raise_alarm(
            db,
            alarm_type="FEED_STOCK_LOW",
            message=f"Stok pakan tersisa {remaining:.2f} kg, kurang dari kebutuhan harian {daily:.2f} kg.",
            severity="critical",
            device_id=device_id,
            meta={"remaining_kg": remaining, "daily_kg": daily},
        )


def deduct_stock(db: Session, grams: float) -> float:
    """FIFO deduction. Returns the unfulfilled amount in kg."""
    remaining = max(0.0, grams) / 1000.0
    feeds = (
        db.query(models.FeedStock)
        .filter(models.FeedStock.active.is_(True), models.FeedStock.quantity_kg > 0)
        .order_by(models.FeedStock.created_at, models.FeedStock.id)
        .all()
    )
    for feed in feeds:
        if remaining <= 0:
            break
        take = min(feed.quantity_kg, remaining)
        feed.quantity_kg = round(feed.quantity_kg - take, 4)
        remaining = round(remaining - take, 4)
    return round(remaining, 4)


def manual_feed(
    db: Session,
    user: models.User,
    payload: schemas.ManualFeedRequest,
    ip: str | None = None,
) -> tuple[models.FeedingRun, models.Command]:
    if payload.idempotency_key:
        existing = (
            db.query(models.Command)
            .filter(models.Command.idempotency_key == payload.idempotency_key)
            .first()
        )
        if existing:
            run = db.get(models.FeedingRun, existing.run_id) if existing.run_id else None
            if run:
                return run, existing

    pond = ensure_pond_access(db, user, payload.pond_id)
    device = primary_device(db)
    if not device:
        raise HTTPException(status_code=409, detail="Belum ada perangkat terdaftar.")
    if not devices.device_online(device):
        raise HTTPException(status_code=409, detail="Perangkat offline. Manual feed tidak dapat dikirim.")
    if payload.portion_grams > settings.max_manual_portion_grams:
        raise HTTPException(status_code=422, detail="Porsi manual melebihi batas maksimum.")

    needed_kg = payload.portion_grams / 1000.0
    available = available_stock_kg(db)
    if available + 1e-9 < needed_kg:
        raise HTTPException(
            status_code=409,
            detail=f"Stok pakan tidak cukup. Butuh {needed_kg:.2f} kg, tersedia {available:.2f} kg.",
        )
    hopper_kg = fresh_hopper_kg(db, device)
    if hopper_kg is not None and hopper_kg + 1e-9 < needed_kg:
        raise HTTPException(
            status_code=409,
            detail=f"Pakan di hopper tidak cukup ({hopper_kg:.2f} kg). Lakukan refill terlebih dahulu.",
        )

    now = utcnow()
    run = models.FeedingRun(
        schedule_id=None,
        pond_id=pond.id,
        side=pond.side,
        source="manual",
        planned_at=now,
        target_grams=round(payload.portion_grams, 1),
        rotary_rotations=schedules.rotations_for(payload.portion_grams),
        status="planned",
        started_at=now,
        created_by=user.id,
        note=payload.note,
    )
    db.add(run)
    db.flush()

    command = _new_command(
        db,
        device=device,
        kind="feed",
        pond_id=pond.id,
        run_id=run.id,
        priority=10,
        payload={},
        user=user,
        idempotency_key=payload.idempotency_key,
    )
    _feed_payload(run, command, None)
    command.payload["source"] = "manual"
    audit.record_audit(
        db,
        user=user,
        action="feeding.manual",
        entity="feeding_run",
        entity_id=run.id,
        description=f"Manual feed {run.target_grams:.0f} g untuk {pond.name}.",
        ip=ip,
        meta={"command_uid": command.command_uid, "pond_id": pond.id},
    )
    return run, command


def cancel_command(
    db: Session, user: models.User, command_uid: str, ip: str | None = None
) -> models.Command:
    command = db.query(models.Command).filter(models.Command.command_uid == command_uid).first()
    if not command:
        raise HTTPException(status_code=404, detail="Perintah tidak ditemukan.")
    if command.pond_id and not can_access_pond(db, user, command.pond_id):
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke kolam ini.")
    if command.kind != "feed":
        raise HTTPException(
            status_code=403,
            detail="Perintah keselamatan/perangkat tidak dapat dibatalkan dari antrean.",
        )
    if user.role not in {"admin", "pemilik"} and command.issued_by != user.id:
        raise HTTPException(
            status_code=403,
            detail="Anda hanya dapat membatalkan perintah manual yang Anda kirim sendiri.",
        )
    if command.status not in PENDING_COMMAND_STATUSES:
        raise HTTPException(status_code=409, detail="Hanya perintah yang belum dieksekusi yang dapat dibatalkan.")
    command.status = "cancelled"
    command.error = "Dibatalkan oleh pengguna."
    if command.run_id:
        run = db.get(models.FeedingRun, command.run_id)
        if run and run.status == "planned":
            run.status = "skipped"
            run.failure_reason = "DIBATALKAN_PENGGUNA"
            run.completed_at = utcnow()
    audit.record_audit(
        db,
        user=user,
        action="command.cancel",
        entity="command",
        entity_id=command.command_uid,
        description="Perintah feeding dibatalkan.",
        ip=ip,
    )
    return command


def create_estop(db: Session, user: models.User, reason: str | None, ip: str | None = None) -> models.Command:
    device = primary_device(db)
    if not device:
        raise HTTPException(status_code=409, detail="Belum ada perangkat terdaftar.")
    if not devices.device_online(device):
        raise HTTPException(status_code=409, detail="Perangkat offline. Gunakan E-stop fisik di panel.")
    command = _new_command(
        db,
        device=device,
        kind="emergency_stop",
        priority=100,
        ttl_seconds=60,
        payload={"reason": reason},
        user=user,
        actor_name=user.username,
    )
    alarms.raise_alarm(
        db,
        alarm_type="EMERGENCY_STOP",
        message=f"Emergency stop dikirim oleh {user.username}.",
        severity="critical",
        device_id=device.device_id,
        meta={"command_uid": command.command_uid, "reason": reason},
    )
    audit.record_audit(
        db,
        user=user,
        action="device.estop",
        entity="command",
        entity_id=command.command_uid,
        description=reason or "Emergency stop dari dashboard.",
        ip=ip,
    )
    return command


def create_reset(db: Session, user: models.User, ip: str | None = None) -> models.Command:
    device = primary_device(db)
    if not device:
        raise HTTPException(status_code=409, detail="Belum ada perangkat terdaftar.")
    if not devices.device_online(device):
        raise HTTPException(status_code=409, detail="Perangkat offline. Reset harus dilakukan di panel lokal.")
    command = _new_command(
        db,
        device=device,
        kind="reset",
        priority=90,
        ttl_seconds=60,
        payload={},
        user=user,
        actor_name=user.username,
    )
    audit.record_audit(
        db,
        user=user,
        action="device.reset",
        entity="command",
        entity_id=command.command_uid,
        description="Validasi keamanan / reset setelah E-stop.",
        ip=ip,
    )
    return command


def create_home(db: Session, user: models.User, ip: str | None = None) -> models.Command:
    device = primary_device(db)
    if not device:
        raise HTTPException(status_code=409, detail="Belum ada perangkat terdaftar.")
    if not devices.device_online(device):
        raise HTTPException(status_code=409, detail="Perangkat offline.")
    command = _new_command(
        db,
        device=device,
        kind="home",
        priority=5,
        ttl_seconds=120,
        payload={},
        user=user,
        actor_name=user.username,
    )
    audit.record_audit(
        db,
        user=user,
        action="device.home",
        entity="command",
        entity_id=command.command_uid,
        description="Perintah kembali ke home position.",
        ip=ip,
    )
    return command


def ack_command(
    db: Session,
    device: models.Device,
    command_uid: str,
    payload: schemas.CommandAckIn,
    ip: str | None = None,
) -> models.Command:
    command = (
        db.query(models.Command)
        .filter(
            models.Command.command_uid == command_uid,
            models.Command.device_id == device.device_id,
        )
        .first()
    )
    if not command:
        raise HTTPException(status_code=404, detail="Perintah tidak ditemukan untuk perangkat ini.")
    if command.status in {"executed", "failed", "expired", "cancelled"}:
        raise HTTPException(status_code=409, detail="Perintah sudah diproses; ACK duplikat ditolak.")

    now = utcnow()
    if command.expires_at < now:
        command.status = "expired"
        command.error = "ACK melewati masa berlaku."
        if command.run_id:
            run = db.get(models.FeedingRun, command.run_id)
            if run and run.status == "planned":
                run.status = "failed"
                run.failure_reason = "PERINTAH_KEDALUWARSA"
                run.completed_at = now
        raise HTTPException(status_code=409, detail="Perintah sudah kedaluwarsa.")

    command.ack_at = now
    command.executed_at = payload.executed_at or now
    command.result = payload.result

    if payload.status == "failed":
        command.status = "failed"
        command.error = payload.failure_reason or "Perangkat melaporkan kegagalan."
        if command.run_id:
            run = db.get(models.FeedingRun, command.run_id)
            if run and run.status == "planned":
                run.status = "failed"
                run.failure_reason = command.error[:200]
                run.completed_at = now
                alarms.raise_alarm(
                    db,
                    alarm_type="FEEDING_FAILED",
                    message=f"Feeding {run.pond.name} gagal: {command.error}",
                    severity="critical",
                    pond_id=run.pond_id,
                    device_id=device.device_id,
                )
        audit.record_audit(
            db,
            action="command.failed",
            entity="command",
            entity_id=command.command_uid,
            description=command.error,
            actor_name=f"device:{device.device_id}",
            role="device",
            ip=ip,
        )
        return command

    command.status = "executed"
    if command.run_id:
        run = db.get(models.FeedingRun, command.run_id)
        if run and run.status == "planned":
            actual = payload.actual_grams
            if actual is None:
                actual = payload.actual_portion_g
            if actual is None:
                actual = run.target_grams
            run.status = "dispensed"
            run.actual_grams = round(float(actual), 1)
            run.completed_at = now
            shortage = deduct_stock(db, float(actual))
            if shortage > 0:
                alarms.raise_alarm(
                    db,
                    alarm_type="FEED_STOCK_LOW",
                    message=f"Stok pakan tidak cukup saat pemotongan; kurang {shortage:.2f} kg.",
                    severity="critical",
                    pond_id=run.pond_id,
                    device_id=device.device_id,
                )
            deviation = abs(float(actual) - run.target_grams) / run.target_grams * 100 if run.target_grams else 0
            if deviation > 10:
                alarms.raise_alarm(
                    db,
                    alarm_type="PORTION_DEVIATION",
                    message=f"Porsi {run.pond.name} menyimpang {deviation:.1f}% dari target ({run.target_grams:.0f} g → {actual:.0f} g).",
                    severity="warning",
                    pond_id=run.pond_id,
                    device_id=device.device_id,
                )
            _low_stock_alarm(db, device.device_id)
            audit.record_audit(
                db,
                action="feeding.dispensed",
                entity="feeding_run",
                entity_id=run.id,
                description=f"Feeding {run.pond.name} selesai: {run.actual_grams:.0f} g.",
                actor_name=f"device:{device.device_id}",
                role="device",
                ip=ip,
                meta={"command_uid": command.command_uid, "rotation": run.rotary_rotations},
            )
    elif command.kind == "emergency_stop":
        alarms.raise_alarm(
            db,
            alarm_type="EMERGENCY_STOP",
            message="Emergency stop dieksekusi perangkat.",
            severity="critical",
            device_id=device.device_id,
        )
        audit.record_audit(
            db,
            action="device.estop_ack",
            entity="command",
            entity_id=command.command_uid,
            description="E-stop di-ACK perangkat.",
            actor_name=f"device:{device.device_id}",
            role="device",
            ip=ip,
        )
    elif command.kind == "reset":
        alarms.resolve_alarm_condition(db, alarm_type="EMERGENCY_STOP", device_id=device.device_id)
        alarms.resolve_alarm_condition(db, alarm_type="GANTRY_FAULT", device_id=device.device_id)
        audit.record_audit(
            db,
            action="device.reset_ack",
            entity="command",
            entity_id=command.command_uid,
            description="Reset/validasi keamanan selesai.",
            actor_name=f"device:{device.device_id}",
            role="device",
            ip=ip,
        )
    elif command.kind == "home":
        audit.record_audit(
            db,
            action="device.home_ack",
            entity="command",
            entity_id=command.command_uid,
            description="Gantry kembali ke home.",
            actor_name=f"device:{device.device_id}",
            role="device",
            ip=ip,
        )
    return command


def poll_commands(db: Session, device: models.Device) -> list[models.Command]:
    now = utcnow()
    expire_commands(db, now)
    rows = (
        db.query(models.Command)
        .options(joinedload(models.Command.pond))
        .filter(
            models.Command.device_id == device.device_id,
            models.Command.status.in_(PENDING_COMMAND_STATUSES),
            models.Command.expires_at >= now,
        )
        .order_by(models.Command.priority.desc(), models.Command.issued_at)
        .limit(10)
        .all()
    )
    for row in rows:
        if row.status == "pending":
            row.status = "delivered"
            row.delivered_at = now
    devices.touch_device(db, device)
    return rows


def upcoming_runs(db: Session, limit: int = 8) -> list[dict[str, Any]]:
    from .timeutil import next_occurrence

    ponds = schedules.active_ponds(db)
    rows = schedules.load_schedules(db)
    now = utcnow()
    items = []
    for pond in ponds:
        schedule = schedules.effective_schedule(pond, rows)
        if not schedule:
            continue
        for hhmm in schedule.feeding_times:
            at = next_occurrence(hhmm, now)
            grams = schedules.portion_grams_for(schedule, pond)
            items.append(
                {
                    "pond_id": pond.id,
                    "pond_index": pond.pond_index,
                    "pond_name": pond.name,
                    "side": pond.side,
                    "time": hhmm,
                    "at": iso_wib(at),
                    "grams": grams,
                    "rotations": schedules.rotations_for(grams),
                    "schedule_id": schedule.id,
                }
            )
    items.sort(key=lambda x: x["at"])
    return items[:limit]

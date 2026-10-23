"""Idempotent demo seed and presentation dataset."""
from __future__ import annotations

import random
import uuid
from datetime import timedelta

from sqlalchemy.orm import Session

from . import models
from .config import settings
from .security import hash_device_key
from .services.timeutil import planned_utc_naive, to_wib, utcnow

DEMO_USERNAME = "Operator Demo"


def ensure_demo_user(db: Session) -> models.User:
    """Return the single presentation operator, creating it if needed."""
    user = db.query(models.User).filter(models.User.username == DEMO_USERNAME).first()
    if user:
        return user
    user = models.User(
        username=DEMO_USERNAME,
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def seed_demo(db: Session) -> dict[str, int]:
    created = {
        "users": 0,
        "ponds": 0,
        "device": 0,
        "feed": 0,
        "schedules": 0,
        "runs": 0,
        "commands": 0,
        "telemetry": 0,
        "alarms": 0,
        "audits": 0,
    }

    if db.query(models.User.id).count() == 0:
        ensure_demo_user(db)
        created["users"] = 1
    else:
        ensure_demo_user(db)

    if db.query(models.Pond.id).count() == 0:
        for i in range(1, 11):
            db.add(
                models.Pond(
                    name=f"Kolam L{i}",
                    side="left",
                    pond_index=i,
                    position_m=round((i - 1) * 1.6 + 0.8, 2),
                    biomass_kg=500.0 + i * 12,
                    diameter_m=3.0,
                    biomass_updated_at=utcnow() - timedelta(days=i % 7 + 1),
                )
            )
        for i in range(1, 11):
            db.add(
                models.Pond(
                    name=f"Kolam R{i}",
                    side="right",
                    pond_index=10 + i,
                    position_m=round((i - 1) * 1.6 + 0.8, 2),
                    biomass_kg=480.0 + i * 14,
                    diameter_m=3.0,
                    biomass_updated_at=utcnow() - timedelta(days=i % 6 + 1),
                )
            )
        db.flush()
        created["ponds"] = 20

    device = db.query(models.Device).filter(models.Device.device_id == settings.device_id).first()
    if not device:
        db.add(
            models.Device(
                device_id=settings.device_id,
                name=settings.device_name,
                api_key_hash=hash_device_key(settings.device_api_key),
                api_key_hint=settings.device_api_key[:8],
                status="online",
                state="idle",
                config_version=0,
            )
        )
        created["device"] = 1

    if db.query(models.FeedStock.id).count() == 0:
        db.add(
            models.FeedStock(
                name="Pelet 781-1",
                feed_type="pelet",
                quantity_kg=500.0,
                price_per_kg=14500,
                vendor="CV Pakan Nusantara",
            )
        )
        db.add(
            models.FeedStock(
                name="Pelet 781-2",
                feed_type="pelet",
                quantity_kg=250.0,
                price_per_kg=15200,
                vendor="CV Pakan Nusantara",
            )
        )
        created["feed"] = 2

    if db.query(models.Schedule.id).count() == 0 and db.query(models.Pond.id).count() > 0:
        demo = ensure_demo_user(db)
        db.add(
            models.Schedule(
                scope="global",
                feeding_times=["07:00", "16:00"],
                portion_mode="fixed",
                portion_grams=1000,
                pellet_type="medium",
                active=True,
                note="Jadwal produksi 2x sehari",
                created_by=demo.id,
                updated_by=demo.id,
            )
        )
        created["schedules"] = 1
        db.flush()

    global_schedule = (
        db.query(models.Schedule)
        .filter(models.Schedule.scope == "global", models.Schedule.active.is_(True))
        .order_by(models.Schedule.id)
        .first()
    )
    if global_schedule and not global_schedule.overrides:
        demo = ensure_demo_user(db)
        ponds = {p.name: p for p in db.query(models.Pond).all()}
        for name, grams in (("Kolam L3", 1300), ("Kolam R7", 900)):
            pond = ponds.get(name)
            if pond:
                db.add(
                    models.ScheduleOverride(
                        schedule_id=global_schedule.id,
                        pond_id=pond.id,
                        portion_grams=grams,
                    )
                )
        if not db.query(models.Schedule).filter(models.Schedule.scope == "row").first():
            db.add(
                models.Schedule(
                    scope="row",
                    side="left",
                    feeding_times=["06:30", "15:30"],
                    portion_mode="percent",
                    biomass_percent=2.0,
                    pellet_type="medium",
                    active=False,
                    note="Contoh jadwal berbasis biomassa (nonaktif)",
                    created_by=demo.id,
                    updated_by=demo.id,
                )
            )
            created["schedules"] += 1

    db.commit()

    if settings.seed_demo_history:
        history = seed_demo_history(db)
        for key, value in history.items():
            created[key] = created.get(key, 0) + value
    return created


def seed_demo_history(db: Session) -> dict[str, int]:
    """Generate a realistic two-week operating history for presentations.

    Idempotent: does nothing once feeding runs exist. Future slots for today are
    left to the live scheduler so the dashboard still shows upcoming feedings.
    """
    counts = {
        "runs": 0,
        "commands": 0,
        "telemetry": 0,
        "alarms": 0,
        "audits": 0,
    }
    if db.query(models.FeedingRun.id).count() > 0:
        return counts

    demo = ensure_demo_user(db)
    device = db.query(models.Device).filter(models.Device.device_id == settings.device_id).first()
    ponds = db.query(models.Pond).order_by(models.Pond.pond_index).all()
    schedule = (
        db.query(models.Schedule)
        .filter(models.Schedule.scope == "global", models.Schedule.active.is_(True))
        .order_by(models.Schedule.id)
        .first()
    )
    if not device or not ponds or not schedule:
        return counts

    rng = random.Random(20261022)
    now = utcnow()
    today = to_wib(now).date()
    first_day = today - timedelta(days=settings.demo_history_days - 1)
    times = [str(t) for t in schedule.feeding_times]
    target = float(schedule.portion_grams or 1000)
    rotations = round(target / settings.grams_per_rotation, 3)

    run_rows: list[tuple[models.FeedingRun, str, float | None, str | None]] = []
    for offset in range(settings.demo_history_days):
        day = first_day + timedelta(days=offset)
        for hhmm in times:
            planned = planned_utc_naive(day, hhmm)
            if planned >= now - timedelta(minutes=2):
                continue  # current/future slot belongs to the live scheduler
            for pond in ponds:
                roll = rng.random()
                if roll < 0.955:
                    status = "dispensed"
                    actual = round(target * rng.uniform(0.972, 1.006), 1)
                    reason = None
                elif roll < 0.977:
                    status = "skipped"
                    actual = None
                    reason = rng.choice(["PERAWATAN_KOLAM", "JADWAL_DILEWATI", "KOLAM_DIKOSONGKAN"])
                else:
                    status = "failed"
                    actual = None
                    reason = rng.choice(["MOTOR_TIMEOUT", "PAKAN_TIDAK_TERDETEKSI", "GANTRY_FAULT"])

                started = planned + timedelta(seconds=rng.randint(4, 22))
                completed = started + timedelta(seconds=rng.randint(7, 30))
                run = models.FeedingRun(
                    schedule_id=schedule.id,
                    pond_id=pond.id,
                    side=pond.side,
                    source="schedule",
                    planned_at=planned,
                    target_grams=target,
                    rotary_rotations=rotations,
                    status=status,
                    failure_reason=reason,
                    actual_grams=actual,
                    started_at=started if status != "skipped" else None,
                    completed_at=completed if status != "skipped" else None,
                    created_by=demo.id,
                )
                db.add(run)
                run_rows.append((run, status, actual, reason))

    db.flush()
    counts["runs"] = len(run_rows)

    commands: list[models.Command] = []
    used_grams = 0.0
    for run, status, actual, reason in run_rows:
        if status == "skipped":
            continue
        pond = next(p for p in ponds if p.id == run.pond_id)
        issued = run.planned_at - timedelta(seconds=8)
        command_uid = uuid.uuid4().hex
        command = models.Command(
            command_uid=command_uid,
            device_id=device.device_id,
            kind="feed",
            pond_id=run.pond_id,
            run_id=run.id,
            payload={
                "command_id": command_uid,
                "type": "feed",
                "run_id": run.id,
                "pond_id": run.pond_id,
                "pond_index": pond.pond_index,
                "side": run.side,
                "portion_grams": run.target_grams,
                "rotary_rotations": run.rotary_rotations,
                "pellet_type": schedule.pellet_type,
                "schedule_id": schedule.id,
            },
            status="executed" if status == "dispensed" else "failed",
            issued_by=demo.id,
            issued_by_name=demo.username,
            issued_at=issued,
            expires_at=issued + timedelta(seconds=settings.command_ttl_seconds),
            delivered_at=issued + timedelta(seconds=2),
            ack_at=issued + timedelta(seconds=4),
            executed_at=run.completed_at or issued + timedelta(seconds=20),
            result={"actual_grams": actual} if status == "dispensed" else {"error": reason},
            error=None if status == "dispensed" else reason,
        )
        db.add(command)
        commands.append(command)
        if status == "dispensed" and actual:
            used_grams += actual

    counts["commands"] = len(commands)

    # Warehouse stock after two weeks of feeding (started at 750 kg).
    used_kg = used_grams / 1000.0
    stocks = db.query(models.FeedStock).order_by(models.FeedStock.id).all()
    if len(stocks) >= 2:
        stocks[0].quantity_kg = round(max(0.0, 500.0 - used_kg * 0.66), 1)
        stocks[1].quantity_kg = round(max(0.0, 250.0 - used_kg * 0.34), 1)
    elif stocks:
        stocks[0].quantity_kg = round(max(0.0, stocks[0].quantity_kg - used_kg), 1)
    stock_kg = round(sum(s.quantity_kg for s in stocks if s.active), 1)

    # Telemetry every 30 minutes, including a final sample near "now".
    start_dt = planned_utc_naive(first_day, "00:00")
    step = timedelta(minutes=30)
    telemetry: list[models.Telemetry] = []
    index = 0
    moment = start_dt
    last_remaining = 8.0
    while moment < now:
        progress = (moment - start_dt).total_seconds() / max(1.0, (now - start_dt).total_seconds())
        remaining = round(9.5 + 4.5 * ((index % 16) / 15.0), 2)
        if index % 16 == 0:
            remaining = 14.6
        level = round(remaining / settings.hopper_capacity_kg * 100, 1)
        temperature = round(30.0 + 2.0 * ((index % 24) / 23.0) + rng.uniform(-0.4, 0.4), 2)
        humidity = round(64.0 + 10.0 * ((index % 30) / 29.0) + rng.uniform(-1.0, 1.0), 1)
        voltage = round(222.0 + rng.uniform(-3.5, 3.5), 1)
        current = round(1.1 + 0.8 * abs(((index % 12) / 12.0) - 0.5), 2)
        telemetry.append(
            models.Telemetry(
                device_id=device.device_id,
                recorded_at=moment,
                pond_index=((index // 5) % len(ponds)) + 1,
                gantry_state="idle",
                rail_position_step=int(progress * 32000),
                hopper_temp_c=temperature,
                hopper_humidity_pct=humidity,
                hopper_pressure_kpa=round(100.5 + 0.8 * ((index % 9) / 9.0), 2),
                hopper_feed_present=True,
                hopper_remaining_kg=remaining,
                hopper_level_percent=level,
                voltage_v=voltage,
                current_a=current,
                power_w=round(voltage * current * 0.94, 1),
                energy_kwh=round(118.0 + index * 0.071, 3),
                dc_current_a=round(0.35 + 1.4 * abs(((index % 8) / 8.0) - 0.5), 2),
            )
        )
        last_remaining = remaining
        index += 1
        moment += step

    if telemetry:
        telemetry[-1].recorded_at = now - timedelta(seconds=40)
        db.add_all(telemetry)
        counts["telemetry"] = len(telemetry)

    device.status = "online"
    device.state = "idle"
    device.gantry_pond_index = telemetry[-1].pond_index if telemetry else 1
    device.rail_position_step = telemetry[-1].rail_position_step if telemetry else 0
    device.hopper_level_percent = round(last_remaining / settings.hopper_capacity_kg * 100, 1)
    device.firmware_version = "gantry-demo-1.1.0"
    device.last_seen_at = now

    # Alarms: a mix of open, acknowledged and resolved events.
    alarm_rows = [
        dict(
            alarm_type="FEED_STOCK_LOW",
            severity="warning",
            message=f"Stok pakan gudang tersisa {stock_kg:.0f} kg (estimasi 4-5 hari).",
            status="open",
            detected_at=now - timedelta(hours=2),
            meta={"stock_kg": stock_kg},
        ),
        dict(
            alarm_type="HOPPER_HUMIDITY",
            severity="warning",
            message="Kelembapan hopper 87% melewati ambang 85%.",
            status="open",
            detected_at=now - timedelta(minutes=95),
            meta={"humidity_pct": 87.0},
        ),
        dict(
            alarm_type="GANTRY_FAULT",
            severity="critical",
            message="Limit switch sisi kanan tidak kembali pada percobaan pertama.",
            status="acknowledged",
            detected_at=now - timedelta(days=1, hours=3),
            acknowledged_by=demo.id,
            acknowledged_at=now - timedelta(days=1, hours=1),
            meta={"pond_index": 14},
        ),
        dict(
            alarm_type="HOPPER_TEMPERATURE",
            severity="critical",
            message="Suhu hopper 46.2 °C melewati ambang 40 °C.",
            status="resolved",
            detected_at=now - timedelta(days=5, hours=4),
            resolved_by=demo.id,
            resolved_at=now - timedelta(days=5, hours=2),
            meta={"temperature_c": 46.2},
        ),
        dict(
            alarm_type="POWER_VOLTAGE",
            severity="warning",
            message="Tegangan 208.4 V di luar rentang ideal 210-235 V.",
            status="resolved",
            detected_at=now - timedelta(days=9, hours=6),
            resolved_by=demo.id,
            resolved_at=now - timedelta(days=9, hours=5),
            meta={"voltage_v": 208.4},
        ),
        dict(
            alarm_type="MOTOR_CURRENT",
            severity="warning",
            message="Arus 48 VDC tinggi: 8.6 A pada saat manuver.",
            status="resolved",
            detected_at=now - timedelta(days=11, hours=2),
            resolved_by=demo.id,
            resolved_at=now - timedelta(days=11, hours=1),
            meta={"dc_current_a": 8.6},
        ),
    ]
    for item in alarm_rows:
        db.add(models.Alarm(device_id=device.device_id, **item))
    counts["alarms"] = len(alarm_rows)

    # A few audit entries so the audit page is not empty at first open.
    audit_rows = [
        ("schedule.update", "schedule", schedule.id, "Jadwal global 07:00 & 16:00 diperbarui (2x sehari, 1 kg/kolam).", 12 * 24 + 3),
        ("feed.update", "feed_stock", stocks[0].id if stocks else None, "Restok pakan 200 kg dari CV Pakan Nusantara.", 8 * 24 + 1),
        ("device.config_update", "device", device.id, "Konfigurasi jadwal diterapkan ke gantry.", 7 * 24 + 5),
        ("pond.biomass_update", "pond", ponds[0].id, f"Biomassa {ponds[0].name} diperbarui menjadi {ponds[0].biomass_kg:.1f} kg.", 5 * 24 + 2),
        ("alarm.acknowledge", "alarm", None, "Gantry fault sisi kanan diperiksa dan di-acknowledge.", 27),
        ("feed.manual", "pond", ponds[3].id, f"Manual feed 800 g untuk {ponds[3].name} di luar jadwal.", 5),
        ("device.home", "device", device.id, "Perintah homing gantry dikirim dari halaman perangkat.", 3),
        ("alarm.resolve", "alarm", None, "Alarm suhu hopper dinyatakan selesai setelah pembersihan filter.", 2),
    ]
    for action, entity, entity_id, description, hours_ago in audit_rows:
        db.add(
            models.AuditLog(
                at=now - timedelta(hours=hours_ago),
                user_id=demo.id,
                username=demo.username,
                role=demo.role,
                action=action,
                entity=entity,
                entity_id=str(entity_id) if entity_id is not None else None,
                description=description,
                ip="127.0.0.1",
            )
        )
    counts["audits"] = len(audit_rows)

    db.commit()
    return counts


def main() -> None:  # pragma: no cover
    from .database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        print(seed_demo(db))


if __name__ == "__main__":  # pragma: no cover
    main()

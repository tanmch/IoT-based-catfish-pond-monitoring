"""Feeding schedule CRUD, pause/resume and effective-portion preview."""
from __future__ import annotations


from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import get_db
from ..deps import ADMIN_ROLES, can_access_pond, client_ip, get_current_user, user_pond_ids
from ..services import audit, schedules as schedule_service
from ..services.serializers import schedule_dict
from ..services.timeutil import utcnow

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _visible_ponds(db: Session, user: models.User) -> list[models.Pond]:
    ponds = schedule_service.active_ponds(db)
    allowed = user_pond_ids(db, user)
    if allowed is None:
        return ponds
    return [p for p in ponds if p.id in set(allowed)]


def _get_schedule(db: Session, schedule_id: int) -> models.Schedule:
    schedule = (
        db.query(models.Schedule)
        .options(selectinload(models.Schedule.overrides))
        .filter(models.Schedule.id == schedule_id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan.")
    return schedule


def _ensure_can_manage(db: Session, user: models.User, schedule: models.Schedule) -> None:
    if user.role in ADMIN_ROLES:
        return
    if schedule.scope == "pond" and schedule.pond_id and can_access_pond(db, user, schedule.pond_id):
        return
    raise HTTPException(status_code=403, detail="Anda hanya dapat mengubah jadwal kolam yang ditugaskan.")


def _validate_payload(db: Session, user: models.User, payload: schemas.ScheduleIn) -> models.Pond | None:
    pond = None
    if payload.scope == "pond":
        pond = db.get(models.Pond, payload.pond_id)
        if not pond or not pond.is_active:
            raise HTTPException(status_code=422, detail="Kolam tidak ditemukan.")
        if user.role not in ADMIN_ROLES and not can_access_pond(db, user, pond.id):
            raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke kolam ini.")
        if user.role not in ADMIN_ROLES and payload.overrides:
            raise HTTPException(status_code=403, detail="Override porsi hanya untuk admin/pemilik.")
    elif user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Hanya admin/pemilik yang dapat mengubah jadwal global/baris.")

    if payload.scope == "row":
        count = (
            db.query(models.Pond.id)
            .filter(models.Pond.side == payload.side, models.Pond.is_active.is_(True))
            .count()
        )
        if count == 0:
            raise HTTPException(status_code=422, detail="Tidak ada kolam aktif pada sisi tersebut.")

    if payload.overrides:
        scope_ponds = schedule_service.schedule_ponds(
            models.Schedule(scope=payload.scope, side=payload.side, pond_id=payload.pond_id),
            db=db,
        )
        ids = {p.id for p in scope_ponds}
        invalid = [o.pond_id for o in payload.overrides if o.pond_id not in ids]
        if invalid:
            raise HTTPException(status_code=422, detail=f"Override di luar cakupan jadwal: {invalid}")
    return pond


def _sync_overrides(db: Session, schedule: models.Schedule, payload: schemas.ScheduleIn) -> None:
    db.query(models.ScheduleOverride).filter(models.ScheduleOverride.schedule_id == schedule.id).delete(
        synchronize_session=False
    )
    for override in payload.overrides:
        db.add(
            models.ScheduleOverride(
                schedule_id=schedule.id,
                pond_id=override.pond_id,
                portion_grams=override.portion_grams,
                biomass_percent=override.biomass_percent,
            )
        )


def _cancel_pending_for_schedule(db: Session, schedule_id: int, user: models.User) -> int:
    run_ids = [
        r[0]
        for r in db.query(models.FeedingRun.id).filter(models.FeedingRun.schedule_id == schedule_id).all()
    ]
    if not run_ids:
        return 0
    commands = (
        db.query(models.Command)
        .filter(
            models.Command.run_id.in_(run_ids),
            models.Command.status == "pending",
        )
        .all()
    )
    for command in commands:
        command.status = "cancelled"
        command.error = "Dibatalkan karena jadwal diubah/dinonaktifkan."
        run = db.get(models.FeedingRun, command.run_id)
        if run and run.status == "planned":
            run.status = "skipped"
            run.failure_reason = "JADWAL_DIUBAH"
            run.completed_at = utcnow()
    if commands:
        audit.record_audit(
            db,
            user=user,
            action="schedule.cancel_pending",
            entity="schedule",
            entity_id=schedule_id,
            description=f"{len(commands)} perintah pending dibatalkan.",
        )
    return len(commands)


@router.get("")
def list_schedules(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    schedules = schedule_service.load_schedules(db)
    ponds = _visible_ponds(db, user)
    allowed = user_pond_ids(db, user)
    result = []
    for schedule in schedules:
        if allowed is not None and schedule.scope == "pond" and schedule.pond_id not in set(allowed):
            continue
        result.append(schedule_dict(schedule, schedule_service.applies_to(schedule, ponds)))
    return result


@router.get("/effective")
def effective_schedules(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ponds = _visible_ponds(db, user)
    all_schedules = schedule_service.load_schedules(db)
    result = []
    for pond in ponds:
        schedule = schedule_service.effective_schedule(pond, all_schedules)
        meta = schedule_service.portion_meta(schedule, pond) if schedule else None
        result.append(
            {
                "pond": {
                    "id": pond.id,
                    "name": pond.name,
                    "side": pond.side,
                    "pond_index": pond.pond_index,
                    "biomass_kg": pond.biomass_kg,
                },
                "schedule": schedule_dict(schedule) if schedule else None,
                "portion": meta,
            }
        )
    return result


@router.get("/{schedule_id}")
def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    schedule = _get_schedule(db, schedule_id)
    if (
        user.role not in ADMIN_ROLES
        and schedule.scope == "pond"
        and schedule.pond_id
        and not can_access_pond(db, user, schedule.pond_id)
    ):
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke jadwal ini.")
    return schedule_dict(schedule, schedule_service.applies_to(schedule, _visible_ponds(db, user)))


@router.post("", status_code=201)
def create_schedule(
    payload: schemas.ScheduleIn,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    pond = _validate_payload(db, user, payload)
    schedule = models.Schedule(
        scope=payload.scope,
        side=payload.side or (pond.side if pond else None),
        pond_id=payload.pond_id,
        feeding_times=payload.feeding_times,
        portion_mode=payload.portion_mode,
        portion_grams=payload.portion_grams,
        biomass_percent=payload.biomass_percent,
        pellet_type=payload.pellet_type,
        active=payload.active,
        note=payload.note,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(schedule)
    db.flush()
    _sync_overrides(db, schedule, payload)
    audit.record_audit(
        db,
        user=user,
        action="schedule.create",
        entity="schedule",
        entity_id=schedule.id,
        description=f"Membuat jadwal {payload.scope} {payload.feeding_times}.",
        ip=client_ip(request),
        meta={"scope": payload.scope, "pond_id": payload.pond_id, "side": payload.side},
    )
    db.commit()
    db.refresh(schedule)
    return schedule_dict(schedule, schedule_service.applies_to(schedule, _visible_ponds(db, user)))


@router.put("/{schedule_id}")
def update_schedule(
    schedule_id: int,
    payload: schemas.ScheduleIn,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    schedule = _get_schedule(db, schedule_id)
    _ensure_can_manage(db, user, schedule)
    pond = _validate_payload(db, user, payload)
    schedule.scope = payload.scope
    schedule.side = payload.side or (pond.side if pond else None)
    schedule.pond_id = payload.pond_id
    schedule.feeding_times = payload.feeding_times
    schedule.portion_mode = payload.portion_mode
    schedule.portion_grams = payload.portion_grams
    schedule.biomass_percent = payload.biomass_percent
    schedule.pellet_type = payload.pellet_type
    schedule.active = payload.active
    schedule.note = payload.note
    schedule.updated_by = user.id
    schedule.version += 1
    _sync_overrides(db, schedule, payload)
    audit.record_audit(
        db,
        user=user,
        action="schedule.update",
        entity="schedule",
        entity_id=schedule.id,
        description=f"Memperbarui jadwal #{schedule.id} (versi {schedule.version}).",
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(schedule)
    return schedule_dict(schedule, schedule_service.applies_to(schedule, _visible_ponds(db, user)))


@router.patch("/{schedule_id}/active")
def set_active(
    schedule_id: int,
    payload: schemas.ScheduleActiveRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    schedule = _get_schedule(db, schedule_id)
    _ensure_can_manage(db, user, schedule)
    schedule.active = payload.active
    schedule.updated_by = user.id
    schedule.version += 1
    cancelled = 0 if payload.active else _cancel_pending_for_schedule(db, schedule.id, user)
    audit.record_audit(
        db,
        user=user,
        action="schedule.resume" if payload.active else "schedule.pause",
        entity="schedule",
        entity_id=schedule.id,
        description=f"Jadwal #{schedule.id} {'diaktifkan' if payload.active else 'dijeda'}.",
        ip=client_ip(request),
        meta={"cancelled_commands": cancelled},
    )
    db.commit()
    return schedule_dict(schedule, schedule_service.applies_to(schedule, _visible_ponds(db, user)))


@router.delete("/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    schedule = _get_schedule(db, schedule_id)
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Hanya admin/pemilik yang dapat menghapus jadwal.")
    _cancel_pending_for_schedule(db, schedule.id, user)
    audit.record_audit(
        db,
        user=user,
        action="schedule.delete",
        entity="schedule",
        entity_id=schedule.id,
        description=f"Menghapus jadwal #{schedule.id}.",
        ip=client_ip(request),
    )
    db.delete(schedule)
    db.commit()
    return {"message": "Jadwal dihapus."}

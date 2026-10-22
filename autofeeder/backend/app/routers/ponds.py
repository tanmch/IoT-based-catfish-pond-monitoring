"""Pond read endpoints and biomass update."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import (
    ADMIN_ROLES,
    client_ip,
    ensure_pond_access,
    get_current_user,
    user_pond_ids,
)
from ..services import audit, schedules as schedule_service
from ..services.serializers import pond_dict, schedule_dict
from ..services.timeutil import utcnow

router = APIRouter(prefix="/ponds", tags=["ponds"])


@router.get("")
def list_ponds(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.Pond).filter(models.Pond.is_active.is_(True))
    allowed = user_pond_ids(db, user)
    if allowed is not None:
        query = query.filter(models.Pond.id.in_(allowed or [-1]))
    ponds = query.order_by(models.Pond.pond_index).all()
    all_schedules = schedule_service.load_schedules(db)
    result = []
    for pond in ponds:
        data = pond_dict(pond)
        schedule = schedule_service.effective_schedule(pond, all_schedules)
        meta = schedule_service.portion_meta(schedule, pond) if schedule else None
        data["effective_schedule"] = schedule_dict(schedule) if schedule else None
        data["portion"] = meta
        result.append(data)
    return result


@router.get("/{pond_id}")
def get_pond(
    pond_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    pond = ensure_pond_access(db, user, pond_id)
    all_schedules = schedule_service.load_schedules(db)
    schedule = schedule_service.effective_schedule(pond, all_schedules)
    data = pond_dict(pond)
    data["effective_schedule"] = schedule_dict(schedule) if schedule else None
    data["portion"] = schedule_service.portion_meta(schedule, pond) if schedule else None
    if user.role in ADMIN_ROLES:
        data["assigned_users"] = [
            {"id": a.user.id, "username": a.user.username, "role": a.user.role}
            for a in pond.assignments
        ]
    return data


@router.patch("/{pond_id}/biomass")
def update_biomass(
    pond_id: int,
    payload: schemas.PondBiomassRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    pond = ensure_pond_access(db, user, pond_id)
    old = pond.biomass_kg
    pond.biomass_kg = payload.biomass_kg
    pond.biomass_updated_at = utcnow()
    audit.record_audit(
        db,
        user=user,
        action="pond.biomass_update",
        entity="pond",
        entity_id=pond.id,
        description=f"Biomassa {pond.name}: {old:.1f} kg → {payload.biomass_kg:.1f} kg. {payload.note or ''}".strip(),
        ip=client_ip(request),
        meta={"old_kg": old, "new_kg": payload.biomass_kg},
    )
    db.commit()
    return pond_dict(pond)

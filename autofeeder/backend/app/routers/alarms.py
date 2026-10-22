"""Alarm listing, acknowledgement and resolution."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import client_ip, get_current_user, user_pond_ids
from ..services import audit
from ..services.serializers import alarm_dict
from ..services.timeutil import utcnow

router = APIRouter(prefix="/alarms", tags=["alarms"])


def _scoped_query(db: Session, user: models.User):
    query = db.query(models.Alarm).options(joinedload(models.Alarm.pond))
    allowed = user_pond_ids(db, user)
    if allowed is not None:
        query = query.filter(
            (models.Alarm.pond_id.in_(allowed or [-1])) | (models.Alarm.pond_id.is_(None))
        )
    return query


@router.get("")
def list_alarms(
    status: str | None = Query(default=None, pattern="^(open|acknowledged|resolved)$"),
    alarm_type: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = _scoped_query(db, user)
    if status:
        query = query.filter(models.Alarm.status == status)
    if alarm_type:
        query = query.filter(models.Alarm.alarm_type == alarm_type)
    total = query.count()
    rows = query.order_by(models.Alarm.detected_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [alarm_dict(a) for a in rows],
        "open_count": _scoped_query(db, user).filter(models.Alarm.status == "open").count(),
        "acknowledged_count": _scoped_query(db, user)
        .filter(models.Alarm.status == "acknowledged")
        .count(),
    }


@router.post("/{alarm_id}/acknowledge")
def acknowledge_alarm(
    alarm_id: int,
    payload: schemas.AlarmActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    alarm = _get_scoped_alarm(db, user, alarm_id)
    if alarm.status == "resolved":
        raise HTTPException(status_code=409, detail="Alarm sudah diselesaikan.")
    if alarm.status == "open":
        alarm.status = "acknowledged"
        alarm.acknowledged_by = user.id
        alarm.acknowledged_at = utcnow()
        audit.record_audit(
            db,
            user=user,
            action="alarm.acknowledge",
            entity="alarm",
            entity_id=alarm.id,
            description=payload.note or f"Alarm {alarm.alarm_type} diakui.",
            ip=client_ip(request),
        )
    db.commit()
    return alarm_dict(alarm)


@router.post("/{alarm_id}/resolve")
def resolve_alarm(
    alarm_id: int,
    payload: schemas.AlarmActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    alarm = _get_scoped_alarm(db, user, alarm_id)
    if alarm.status == "resolved":
        return alarm_dict(alarm)
    alarm.status = "resolved"
    alarm.resolved_by = user.id
    alarm.resolved_at = utcnow()
    if not alarm.acknowledged_at:
        alarm.acknowledged_by = user.id
        alarm.acknowledged_at = utcnow()
    audit.record_audit(
        db,
        user=user,
        action="alarm.resolve",
        entity="alarm",
        entity_id=alarm.id,
        description=payload.note or f"Alarm {alarm.alarm_type} diselesaikan.",
        ip=client_ip(request),
    )
    db.commit()
    return alarm_dict(alarm)


def _get_scoped_alarm(db: Session, user: models.User, alarm_id: int) -> models.Alarm:
    alarm = db.get(models.Alarm, alarm_id)
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm tidak ditemukan.")
    allowed = user_pond_ids(db, user)
    if allowed is not None and alarm.pond_id is not None and alarm.pond_id not in allowed:
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke alarm ini.")
    return alarm

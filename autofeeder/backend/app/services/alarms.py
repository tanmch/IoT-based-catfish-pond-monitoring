"""Alarm creation and resolution with simple de-duplication."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .. import models
from .timeutil import utcnow

ACTIVE_STATUSES = ("open", "acknowledged")


def raise_alarm(
    db: Session,
    *,
    alarm_type: str,
    message: str,
    severity: str = "warning",
    pond_id: int | None = None,
    device_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> models.Alarm:
    existing = (
        db.query(models.Alarm)
        .filter(
            models.Alarm.alarm_type == alarm_type,
            models.Alarm.status.in_(ACTIVE_STATUSES),
            models.Alarm.pond_id == pond_id if pond_id is not None else models.Alarm.pond_id.is_(None),
            models.Alarm.device_id == device_id if device_id is not None else models.Alarm.device_id.is_(None),
        )
        .first()
    )
    if existing:
        return existing
    alarm = models.Alarm(
        alarm_type=alarm_type,
        severity=severity,
        message=message,
        pond_id=pond_id,
        device_id=device_id,
        status="open",
        detected_at=utcnow(),
        meta=meta,
    )
    db.add(alarm)
    return alarm


def resolve_alarm_condition(
    db: Session,
    *,
    alarm_type: str,
    pond_id: int | None = None,
    device_id: str | None = None,
    actor_id: int | None = None,
) -> int:
    query = db.query(models.Alarm).filter(
        models.Alarm.alarm_type == alarm_type,
        models.Alarm.status.in_(ACTIVE_STATUSES),
    )
    if pond_id is not None:
        query = query.filter(models.Alarm.pond_id == pond_id)
    if device_id is not None:
        query = query.filter(models.Alarm.device_id == device_id)
    rows = query.all()
    for row in rows:
        row.status = "resolved"
        row.resolved_at = utcnow()
        row.resolved_by = actor_id
    return len(rows)

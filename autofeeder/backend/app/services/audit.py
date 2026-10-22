"""Activity / audit trail helper."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .. import models
from .timeutil import utcnow


def record_audit(
    db: Session,
    *,
    action: str,
    entity: str,
    entity_id: str | int | None = None,
    description: str | None = None,
    user: models.User | None = None,
    actor_name: str | None = None,
    role: str | None = None,
    ip: str | None = None,
    meta: dict[str, Any] | None = None,
) -> models.AuditLog:
    row = models.AuditLog(
        at=utcnow(),
        user_id=user.id if user else None,
        username=user.username if user else actor_name,
        role=user.role if user else role,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        description=description,
        ip=ip,
        meta=meta,
    )
    db.add(row)
    return row

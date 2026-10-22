"""Audit trail (admin / owner)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import require_roles
from ..services.export import csv_response
from ..services.serializers import audit_dict
from ..services.timeutil import iso_wib, wib_day_bounds_utc

router = APIRouter(prefix="/audit", tags=["audit"])


def _query(
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    action: str | None = None,
    username: str | None = None,
):
    query = db.query(models.AuditLog).order_by(models.AuditLog.at.desc())
    if date_from:
        query = query.filter(models.AuditLog.at >= wib_day_bounds_utc(date_from)[0])
    if date_to:
        query = query.filter(models.AuditLog.at < wib_day_bounds_utc(date_to)[1])
    if action:
        query = query.filter(models.AuditLog.action == action)
    if username:
        query = query.filter(models.AuditLog.username.ilike(f"%{username}%"))
    return query


@router.get("")
def list_audit(
    date_from: date | None = None,
    date_to: date | None = None,
    action: str | None = None,
    username: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "pemilik")),
):
    query = _query(
        db, date_from=date_from, date_to=date_to, action=action, username=username
    )
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [audit_dict(r) for r in rows],
        "limit": limit,
        "offset": offset,
    }


@router.get("/export.csv")
def export_audit(
    date_from: date | None = None,
    date_to: date | None = None,
    action: str | None = None,
    username: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "pemilik")),
):
    rows = _query(
        db, date_from=date_from, date_to=date_to, action=action, username=username
    ).limit(10000)
    headers = ["waktu_wib", "user", "role", "aksi", "entitas", "entity_id", "deskripsi", "ip"]
    data = [
        [
            iso_wib(r.at),
            r.username,
            r.role,
            r.action,
            r.entity,
            r.entity_id,
            r.description,
            r.ip,
        ]
        for r in rows
    ]
    filename = f"audit-trail-{date.today().isoformat()}.csv"
    return csv_response(filename, headers, data)

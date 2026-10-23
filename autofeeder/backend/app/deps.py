"""FastAPI dependencies.

This build runs in presentation/demo mode: there is no login or account system.
Every request acts as a single seeded demo operator with full access. Device
endpoints still require the device API key so the hardware contract stays
authenticated.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import get_db
from .security import hash_device_key

ADMIN_ROLES = {"admin", "pemilik"}
ALL_ROLES = {"admin", "pemilik", "petani"}


def get_current_user(db: Annotated[Session, Depends(get_db)]) -> models.User:
    """Return the fixed demo operator (created on demand if the DB is empty)."""
    from .seed import ensure_demo_user

    user = db.query(models.User).filter(models.User.username == "Operator Demo").first()
    if not user:
        user = ensure_demo_user(db)
        db.commit()
        db.refresh(user)
    return user


def require_roles(*roles: str):
    """Kept for call-site compatibility; demo mode has no role restrictions."""

    def dependency(user: Annotated[models.User, Depends(get_current_user)]) -> models.User:
        return user

    return dependency


def get_current_device(
    db: Annotated[Session, Depends(get_db)],
    x_device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
) -> models.Device:
    if not x_device_key:
        raise HTTPException(status_code=401, detail="Device key diperlukan.")
    key_hash = hash_device_key(x_device_key)
    device = (
        db.query(models.Device)
        .filter(models.Device.api_key_hash == key_hash, models.Device.is_active.is_(True))
        .first()
    )
    if not device:
        raise HTTPException(status_code=401, detail="Device key tidak valid.")
    return device


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def user_pond_ids(db: Session, user: models.User) -> list[int] | None:
    """Demo mode sees every pond."""
    return None


def can_access_pond(db: Session, user: models.User, pond_id: int) -> bool:
    return True


def ensure_pond_access(db: Session, user: models.User, pond_id: int) -> models.Pond:
    pond = db.get(models.Pond, pond_id)
    if not pond:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan.")
    return pond


def ensure_device_online(db: Session, device: models.Device, offline_seconds: int) -> None:
    from .services.timeutil import iso_wib, utcnow

    if settings.demo_mode:
        return
    if not device.last_seen_at:
        raise HTTPException(status_code=409, detail="Perangkat belum pernah terhubung.")
    age = (utcnow() - device.last_seen_at).total_seconds()
    if age > offline_seconds:
        raise HTTPException(
            status_code=409,
            detail=f"Perangkat offline sejak {iso_wib(device.last_seen_at)} WIB. Kendali manual tidak dapat dikirim.",
        )

"""FastAPI dependencies: authentication, roles and pond-level authorisation."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decode_token, hash_device_key

ADMIN_ROLES = {"admin", "pemilik"}
ALL_ROLES = {"admin", "pemilik", "petani"}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _unauthorized(detail: str = "Autentikasi diperlukan.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> models.User:
    if not token:
        raise _unauthorized()
    try:
        payload = decode_token(token)
        email = str(payload.get("sub", "")).strip().lower()
        if not email:
            raise ValueError("missing sub")
        token_version = int(payload["ver"])
    except Exception:
        raise _unauthorized("Token tidak valid atau kedaluwarsa.")

    user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if not user:
        raise _unauthorized("Token tidak valid atau kedaluwarsa.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan.")
    if token_version != user.token_version:
        raise _unauthorized("Sesi sudah tidak berlaku. Silakan login kembali.")
    return user


def require_roles(*roles: str):
    allowed = set(roles)

    def dependency(user: Annotated[models.User, Depends(get_current_user)]) -> models.User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Anda tidak memiliki izin untuk aksi ini.")
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
    """None means all ponds (admin/owner)."""
    if user.role in ADMIN_ROLES:
        return None
    rows = db.query(models.PondAssignment.pond_id).filter(models.PondAssignment.user_id == user.id).all()
    return [r[0] for r in rows]


def can_access_pond(db: Session, user: models.User, pond_id: int) -> bool:
    if user.role in ADMIN_ROLES:
        return True
    return (
        db.query(models.PondAssignment.id)
        .filter(
            models.PondAssignment.user_id == user.id,
            models.PondAssignment.pond_id == pond_id,
        )
        .first()
        is not None
    )


def ensure_pond_access(db: Session, user: models.User, pond_id: int) -> models.Pond:
    pond = db.get(models.Pond, pond_id)
    if not pond:
        raise HTTPException(status_code=404, detail="Kolam tidak ditemukan.")
    if not can_access_pond(db, user, pond_id):
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke kolam ini.")
    return pond


def ensure_device_online(db: Session, device: models.Device, offline_seconds: int) -> None:
    from .services.timeutil import iso_wib, utcnow

    if not device.last_seen_at:
        raise HTTPException(status_code=409, detail="Perangkat belum pernah terhubung.")
    age = (utcnow() - device.last_seen_at).total_seconds()
    if age > offline_seconds:
        raise HTTPException(
            status_code=409,
            detail=f"Perangkat offline sejak {iso_wib(device.last_seen_at)} WIB. Kendali manual tidak dapat dikirim.",
        )

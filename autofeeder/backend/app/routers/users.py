"""User, role and pond-assignment management (admin / owner)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import client_ip, require_roles
from ..security import hash_password, password_problem
from ..services import audit
from ..services.serializers import pond_dict, user_dict

router = APIRouter(prefix="/users", tags=["users"])


def _with_ponds(db: Session, user: models.User) -> dict:
    pond_ids = [
        r[0]
        for r in db.query(models.PondAssignment.pond_id)
        .filter(models.PondAssignment.user_id == user.id)
        .all()
    ]
    data = user_dict(user)
    data["pond_ids"] = sorted(pond_ids)
    return data


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "pemilik")),
):
    users = db.query(models.User).order_by(models.User.id).all()
    return [_with_ponds(db, u) for u in users]


@router.post("", status_code=201)
def create_user(
    payload: schemas.UserCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_roles("admin", "pemilik")),
):
    if actor.role == "pemilik" and payload.role == "admin":
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat membuat akun admin.")
    problem = password_problem(payload.password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    email = payload.email.lower()
    exists = (
        db.query(models.User.id)
        .filter(
            or_(
                func.lower(models.User.email) == email,
                func.lower(models.User.username) == payload.username.lower(),
            )
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Username atau email sudah terdaftar.")
    user = models.User(
        username=payload.username,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    audit.record_audit(
        db,
        user=actor,
        action="user.create",
        entity="user",
        entity_id=user.id,
        description=f"Membuat user {user.username} dengan role {user.role}.",
        ip=client_ip(request),
    )
    db.commit()
    return _with_ponds(db, user)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    payload: schemas.UserUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_roles("admin", "pemilik")),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan.")
    if user.id == actor.id and (payload.role is not None or payload.is_active is not None):
        raise HTTPException(status_code=400, detail="Tidak dapat mengubah role/status akun sendiri.")
    if actor.role == "pemilik" and user.role == "admin":
        raise HTTPException(status_code=403, detail="Pemilik tidak dapat mengubah akun admin.")
    if actor.role == "pemilik" and payload.role == "admin":
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat memberikan role admin.")
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not payload.is_active:
            user.token_version += 1
    audit.record_audit(
        db,
        user=actor,
        action="user.update",
        entity="user",
        entity_id=user.id,
        description=f"Memperbarui user {user.username} (role={user.role}, aktif={user.is_active}).",
        ip=client_ip(request),
    )
    db.commit()
    return _with_ponds(db, user)


@router.put("/{user_id}/ponds")
def set_pond_assignments(
    user_id: int,
    payload: schemas.PondAssignmentRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_roles("admin", "pemilik")),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan.")
    if actor.role == "pemilik" and user.role == "admin":
        raise HTTPException(status_code=403, detail="Pemilik tidak dapat mengubah admin.")
    ponds = (
        db.query(models.Pond).filter(models.Pond.id.in_(payload.pond_ids)).all()
        if payload.pond_ids
        else []
    )
    found = {p.id for p in ponds}
    missing = set(payload.pond_ids) - found
    if missing:
        raise HTTPException(status_code=422, detail=f"Kolam tidak ditemukan: {sorted(missing)}")
    db.query(models.PondAssignment).filter(models.PondAssignment.user_id == user.id).delete(
        synchronize_session=False
    )
    for pond_id in payload.pond_ids:
        db.add(models.PondAssignment(user_id=user.id, pond_id=pond_id))
    audit.record_audit(
        db,
        user=actor,
        action="user.pond_assign",
        entity="user",
        entity_id=user.id,
        description=f"Menetapkan {len(payload.pond_ids)} kolam ke {user.username}.",
        ip=client_ip(request),
        meta={"pond_ids": payload.pond_ids},
    )
    db.commit()
    return _with_ponds(db, user)


@router.get("/ponds/available")
def available_ponds(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "pemilik")),
):
    return [pond_dict(p) for p in db.query(models.Pond).order_by(models.Pond.pond_index).all()]

"""Authentication endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..security import (
    create_access_token,
    hash_password,
    login_limiter,
    password_problem,
    verify_password,
)
from ..services import audit
from ..services.serializers import user_dict
from ..services.timeutil import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])

DUMMY_HASH = hash_password("dummy-password-for-timing-only")


def _find_user(db: Session, identifier: str) -> models.User | None:
    needle = identifier.strip().lower()
    return (
        db.query(models.User)
        .filter(
            or_(
                func.lower(models.User.email) == needle,
                func.lower(models.User.username) == needle,
            )
        )
        .first()
    )


def _token_payload(user: models.User) -> dict:
    token, expires_in = create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user_dict(user),
    }


@router.post("/login")
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    limiter_key = f"{ip or 'unknown'}|{payload.identifier.strip().lower()}"
    retry_after = login_limiter.check(limiter_key)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak percobaan login. Coba lagi nanti.",
            headers={"Retry-After": str(retry_after)},
        )

    user = _find_user(db, payload.identifier)
    check_hash = user.password_hash if user else DUMMY_HASH
    valid = verify_password(payload.password, check_hash)
    if not user or not valid:
        login_limiter.fail(limiter_key)
        audit.record_audit(
            db,
            action="auth.login_failed",
            entity="user",
            entity_id=payload.identifier[:80],
            description="Login gagal.",
            ip=ip,
            role="anonymous",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username/email atau password salah.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan. Hubungi admin.")

    login_limiter.success(limiter_key)
    user.last_login_at = utcnow()
    audit.record_audit(
        db,
        user=user,
        action="auth.login",
        entity="user",
        entity_id=user.id,
        description="Login berhasil.",
        ip=ip,
    )
    db.commit()
    return _token_payload(user)


@router.post("/register", status_code=201)
def register(payload: schemas.RegisterRequest, request: Request, db: Session = Depends(get_db)):
    from ..config import settings

    if not settings.allow_registration:
        raise HTTPException(status_code=403, detail="Registrasi dinonaktifkan.")

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
        role="petani",
    )
    db.add(user)
    db.flush()
    audit.record_audit(
        db,
        user=user,
        action="auth.register",
        entity="user",
        entity_id=user.id,
        description="Registrasi akun baru (role petani).",
        ip=client_ip(request),
    )
    db.commit()
    return {"user": user_dict(user), "message": "Registrasi berhasil. Akun menunggu penugasan kolam."}


@router.get("/me")
def me(user: models.User = Depends(get_current_user)):
    return user_dict(user)


@router.post("/password")
def change_password(
    payload: schemas.PasswordChangeRequest,
    request: Request,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Password saat ini salah.")
    problem = password_problem(payload.new_password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    audit.record_audit(
        db,
        user=user,
        action="auth.password_change",
        entity="user",
        entity_id=user.id,
        description="Password diubah; sesi lama dicabut.",
        ip=client_ip(request),
    )
    db.commit()
    return {"message": "Password diubah. Silakan login kembali."}

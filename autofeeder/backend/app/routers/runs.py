"""Feeding history, manual commands, e-stop and command queue endpoints."""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import ADMIN_ROLES, client_ip, get_current_user, user_pond_ids
from ..services import feeder as feeder_service
from ..services.export import csv_response, pdf_table_response
from ..services.serializers import command_dict, run_dict
from ..services.timeutil import iso_wib, utcnow, wib_day_bounds_utc

router = APIRouter(tags=["feeding"])


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Hanya admin/pemilik yang dapat melakukan aksi ini.")
    return user


def _scope_pond_ids(db: Session, user: models.User) -> list[int] | None:
    return user_pond_ids(db, user)


def _bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    start = wib_day_bounds_utc(date_from)[0] if date_from else None
    end = wib_day_bounds_utc(date_to)[1] if date_to else None
    return start, end


def _run_query(
    db: Session,
    user: models.User,
    *,
    pond_id: int | None = None,
    status: str | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    query = (
        db.query(models.FeedingRun)
        .options(joinedload(models.FeedingRun.pond))
        .order_by(models.FeedingRun.planned_at.desc(), models.FeedingRun.id.desc())
    )
    allowed = _scope_pond_ids(db, user)
    if allowed is not None:
        query = query.filter(models.FeedingRun.pond_id.in_(allowed or [-1]))
    if pond_id:
        if allowed is not None and pond_id not in allowed:
            raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke kolam ini.")
        query = query.filter(models.FeedingRun.pond_id == pond_id)
    if status:
        query = query.filter(models.FeedingRun.status == status)
    if source:
        query = query.filter(models.FeedingRun.source == source)
    start, end = _bounds(date_from, date_to)
    if start:
        query = query.filter(models.FeedingRun.planned_at >= start)
    if end:
        query = query.filter(models.FeedingRun.planned_at < end)
    return query


def _commands_for_runs(db: Session, run_ids: list[int]) -> dict[int, models.Command]:
    if not run_ids:
        return {}
    rows = db.query(models.Command).filter(models.Command.run_id.in_(run_ids)).all()
    return {c.run_id: c for c in rows if c.run_id}


@router.get("/runs")
def list_runs(
    pond_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None, pattern="^(planned|dispensed|skipped|failed)$"),
    source: str | None = Query(default=None, pattern="^(schedule|manual)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = _run_query(
        db,
        user,
        pond_id=pond_id,
        status=status,
        source=source,
        date_from=date_from,
        date_to=date_to,
    )
    total = query.count()
    runs = query.offset(offset).limit(limit).all()
    commands = _commands_for_runs(db, [r.id for r in runs])
    return {
        "total": total,
        "items": [run_dict(r, commands.get(r.id)) for r in runs],
        "limit": limit,
        "offset": offset,
    }


@router.get("/runs/export.csv")
def export_runs(
    pond_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None, pattern="^(planned|dispensed|skipped|failed)$"),
    source: str | None = Query(default=None, pattern="^(schedule|manual)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = _run_query(
        db,
        user,
        pond_id=pond_id,
        status=status,
        source=source,
        date_from=date_from,
        date_to=date_to,
    ).limit(10000)
    runs = query.all()
    commands = _commands_for_runs(db, [r.id for r in runs])
    headers = [
        "waktu_wib",
        "kolam",
        "sisi",
        "sumber",
        "target_gram",
        "aktual_gram",
        "rotary",
        "status",
        "alasan",
        "command_id",
        "command_status",
    ]
    rows = []
    for run in runs:
        command = commands.get(run.id)
        rows.append(
            [
                iso_wib(run.planned_at),
                run.pond.name if run.pond else run.pond_id,
                run.side,
                run.source,
                run.target_grams,
                run.actual_grams,
                run.rotary_rotations,
                run.status,
                run.failure_reason,
                command.command_uid if command else "",
                command.status if command else "",
            ]
        )
    filename = f"riwayat-feeding-{date.today().isoformat()}.csv"
    return csv_response(filename, headers, rows)


@router.get("/runs/export.pdf")
def export_runs_pdf(
    pond_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None, pattern="^(planned|dispensed|skipped|failed)$"),
    source: str | None = Query(default=None, pattern="^(schedule|manual)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = _run_query(
        db,
        user,
        pond_id=pond_id,
        status=status,
        source=source,
        date_from=date_from,
        date_to=date_to,
    ).limit(5000)
    runs = query.all()
    headers = [
        "Waktu WIB",
        "Kolam",
        "Sisi",
        "Sumber",
        "Target (g)",
        "Aktual (g)",
        "Rotary",
        "Status",
        "Alasan",
    ]
    rows = []
    total_target = 0.0
    total_actual = 0.0
    for run in runs:
        total_target += float(run.target_grams or 0)
        total_actual += float(run.actual_grams or 0)
        rows.append(
            [
                iso_wib(run.planned_at),
                run.pond.name if run.pond else run.pond_id,
                run.side,
                run.source,
                f"{run.target_grams:.0f}",
                f"{run.actual_grams:.0f}" if run.actual_grams is not None else "—",
                f"{run.rotary_rotations:.2f}",
                run.status,
                run.failure_reason or "—",
            ]
        )
    period = f"{date_from.isoformat() if date_from else 'awal'} s/d {date_to.isoformat() if date_to else 'sekarang'}"
    subtitle = (
        f"Periode {period} · {len(runs)} run · target {total_target / 1000:.2f} kg "
        f"· aktual {total_actual / 1000:.2f} kg · dibuat {iso_wib(utcnow())} WIB"
    )
    filename = f"riwayat-feeding-{date.today().isoformat()}.pdf"
    return pdf_table_response(
        filename=filename,
        title="Laporan Riwayat Feeding",
        subtitle=subtitle,
        header=headers,
        rows=rows,
    )


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    run = db.get(models.FeedingRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Riwayat feeding tidak ditemukan.")
    allowed = _scope_pond_ids(db, user)
    if allowed is not None and run.pond_id not in allowed:
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke kolam ini.")
    command = db.query(models.Command).filter(models.Command.run_id == run.id).first()
    return run_dict(run, command)


@router.post("/commands/manual-feed", status_code=201)
def manual_feed(
    payload: schemas.ManualFeedRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    run, command = feeder_service.manual_feed(db, user, payload, ip=client_ip(request))
    db.commit()
    db.refresh(run)
    db.refresh(command)
    return {"run": run_dict(run, command), "command": command_dict(command)}


@router.get("/commands")
def list_commands(
    status: str | None = Query(default=None, pattern="^(pending|delivered|executed|failed|expired|cancelled)$"),
    kind: str | None = Query(default=None, pattern="^(feed|move|home|emergency_stop|reset)$"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = (
        db.query(models.Command)
        .options(joinedload(models.Command.pond))
        .order_by(models.Command.issued_at.desc())
    )
    allowed = _scope_pond_ids(db, user)
    if allowed is not None:
        query = query.filter(
            (models.Command.pond_id.in_(allowed or [-1])) | (models.Command.pond_id.is_(None))
        )
    if status:
        query = query.filter(models.Command.status == status)
    if kind:
        query = query.filter(models.Command.kind == kind)
    rows = query.limit(limit).all()
    return {"items": [command_dict(c) for c in rows]}


@router.post("/commands/{command_uid}/cancel")
def cancel_command(
    command_uid: str,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    command = feeder_service.cancel_command(db, user, command_uid, ip=client_ip(request))
    db.commit()
    db.refresh(command)
    return command_dict(command)


@router.post("/commands/estop", status_code=201)
def emergency_stop(
    payload: schemas.EStopRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    command = feeder_service.create_estop(db, user, payload.reason, ip=client_ip(request))
    db.commit()
    db.refresh(command)
    return command_dict(command)


@router.post("/commands/reset", status_code=201)
def reset_device(
    payload: schemas.ResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    command = feeder_service.create_reset(db, user, ip=client_ip(request))
    db.commit()
    db.refresh(command)
    return command_dict(command)


@router.post("/commands/home", status_code=201)
def home_device(
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    command = feeder_service.create_home(db, user, ip=client_ip(request))
    db.commit()
    db.refresh(command)
    return command_dict(command)

"""User-facing device, telemetry and configuration endpoints."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import client_ip, get_current_user, require_roles
from ..security import generate_device_key, hash_device_key
from ..services import audit, devices, feeder
from ..services.export import csv_response
from ..services.serializers import device_dict, telemetry_dict
from ..services.timeutil import iso_wib, wib_day_bounds_utc

router = APIRouter(prefix="/devices", tags=["devices"])


def _get_device(db: Session, device_id: str) -> models.Device:
    device = db.query(models.Device).filter(models.Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Perangkat tidak ditemukan.")
    return device


@router.get("")
def list_devices(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    rows = db.query(models.Device).order_by(models.Device.id).all()
    result = []
    for device in rows:
        latest = feeder.latest_telemetry(db, device.device_id)
        pending = (
            db.query(models.Command)
            .filter(
                models.Command.device_id == device.device_id,
                models.Command.status.in_(("pending", "delivered")),
            )
            .count()
        )
        item = device_dict(device, devices.device_online(device))
        item["latest_telemetry"] = telemetry_dict(latest)
        item["pending_commands"] = pending
        result.append(item)
    return result


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    device = feeder.primary_device(db)
    if not device:
        raise HTTPException(status_code=404, detail="Belum ada perangkat terdaftar.")
    return devices.config_payload(db, device)


@router.get("/telemetry")
def list_telemetry(
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    device = feeder.primary_device(db)
    if not device:
        return {"items": [], "device_id": None}
    query = db.query(models.Telemetry).filter(models.Telemetry.device_id == device.device_id)
    if date_from:
        query = query.filter(models.Telemetry.recorded_at >= wib_day_bounds_utc(date_from)[0])
    if date_to:
        query = query.filter(models.Telemetry.recorded_at < wib_day_bounds_utc(date_to)[1])
    rows = query.order_by(models.Telemetry.recorded_at.desc(), models.Telemetry.id.desc()).limit(limit).all()
    return {"device_id": device.device_id, "items": [telemetry_dict(r) for r in rows]}


@router.get("/telemetry/export.csv")
def export_telemetry(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    device = feeder.primary_device(db)
    if not device:
        raise HTTPException(status_code=404, detail="Belum ada perangkat terdaftar.")
    query = db.query(models.Telemetry).filter(models.Telemetry.device_id == device.device_id)
    if date_from:
        query = query.filter(models.Telemetry.recorded_at >= wib_day_bounds_utc(date_from)[0])
    if date_to:
        query = query.filter(models.Telemetry.recorded_at < wib_day_bounds_utc(date_to)[1])
    rows = query.order_by(models.Telemetry.recorded_at).limit(50000).all()
    headers = [
        "waktu_wib",
        "device_id",
        "pond_index",
        "state",
        "rail_step",
        "suhu_hopper_c",
        "kelembapan_hopper_pct",
        "tekanan_hopper_kpa",
        "pakan_terdeteksi",
        "sisa_pakan_kg",
        "tegangan_v",
        "arus_a",
        "daya_w",
        "energi_kwh",
        "arus_dc_a",
    ]
    data = [
        [
            iso_wib(r.recorded_at),
            r.device_id,
            r.pond_index,
            r.gantry_state,
            r.rail_position_step,
            r.hopper_temp_c,
            r.hopper_humidity_pct,
            r.hopper_pressure_kpa,
            r.hopper_feed_present,
            r.hopper_remaining_kg,
            r.voltage_v,
            r.current_a,
            r.power_w,
            r.energy_kwh,
            r.dc_current_a,
        ]
        for r in rows
    ]
    filename = f"telemetry-{date.today().isoformat()}.csv"
    return csv_response(filename, headers, data)


@router.post("/{device_id}/rotate-key")
def rotate_key(
    device_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_roles("admin")),
):
    device = _get_device(db, device_id)
    new_key = generate_device_key()
    device.api_key_hash = hash_device_key(new_key)
    device.api_key_hint = new_key[:8]
    audit.record_audit(
        db,
        user=actor,
        action="device.rotate_key",
        entity="device",
        entity_id=device.id,
        description=f"Rotasi API key perangkat {device.device_id}.",
        ip=client_ip(request),
    )
    db.commit()
    return {
        "device_id": device.device_id,
        "api_key": new_key,
        "warning": "Simpan key ini sekarang. Key tidak dapat ditampilkan lagi.",
    }

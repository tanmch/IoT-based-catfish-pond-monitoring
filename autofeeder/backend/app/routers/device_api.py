"""Machine-to-machine device API.

Authenticated only by a per-device API key (X-Device-Key). This mirrors the
polling pattern used by Fish Linker's ESP devices, so no MQTT broker is
required for the first deployment. See docs/DEVICE_API.md.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import client_ip, get_current_device
from ..services import devices, feeder
from ..services.serializers import command_dict
from ..services.timeutil import iso_wib, utcnow

router = APIRouter(prefix="/device", tags=["device"])


@router.post("/telemetry")
def ingest_telemetry(
    payload: schemas.TelemetryIn,
    request: Request,
    db: Session = Depends(get_db),
    device: models.Device = Depends(get_current_device),
):
    row = devices.ingest_telemetry(db, device, payload)
    db.commit()
    return {
        "ok": True,
        "device_id": device.device_id,
        "recorded_at": iso_wib(row.recorded_at),
        "received_at": iso_wib(utcnow()),
    }


@router.get("/commands")
def poll_commands(
    db: Session = Depends(get_db),
    device: models.Device = Depends(get_current_device),
):
    rows = feeder.poll_commands(db, device)
    db.commit()
    return {
        "count": len(rows),
        "server_time": iso_wib(utcnow()),
        "commands": [command_dict(r) for r in rows],
    }


@router.post("/commands/{command_uid}/ack")
def ack_command(
    command_uid: str,
    payload: schemas.CommandAckIn,
    request: Request,
    db: Session = Depends(get_db),
    device: models.Device = Depends(get_current_device),
):
    command = feeder.ack_command(db, device, command_uid, payload, ip=client_ip(request))
    db.commit()
    db.refresh(command)
    return {"accepted": True, "command": command_dict(command)}


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    device: models.Device = Depends(get_current_device),
):
    return devices.config_payload(db, device)


@router.post("/config/ack")
def ack_config(
    payload: schemas.ConfigAckIn,
    db: Session = Depends(get_db),
    device: models.Device = Depends(get_current_device),
):
    devices.mark_config_applied(db, device, payload.config_version)
    db.commit()
    return {"ok": True, "config_version": device.config_version}


@router.post("/heartbeat")
def heartbeat(
    db: Session = Depends(get_db),
    device: models.Device = Depends(get_current_device),
):
    devices.touch_device(db, device)
    db.commit()
    return {"ok": True, "server_time": iso_wib(utcnow())}

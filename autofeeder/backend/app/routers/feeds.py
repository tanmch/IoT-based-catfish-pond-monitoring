"""Feed stock management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import client_ip, get_current_user, require_roles
from ..services import alarms, audit, schedules as schedule_service
from ..services.serializers import feed_dict
from ..services import feeder as feeder_service

router = APIRouter(prefix="/feeds", tags=["feeds"])


def _maybe_resolve_low_stock(db: Session) -> None:
    daily = schedule_service.daily_planned_grams(db) / 1000.0
    if daily > 0 and feeder_service.stock_kg(db) >= daily:
        alarms.resolve_alarm_condition(db, alarm_type="FEED_STOCK_LOW")


@router.get("")
def list_feeds(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    feeds = db.query(models.FeedStock).order_by(models.FeedStock.active.desc(), models.FeedStock.id).all()
    return {
        "items": [feed_dict(f) for f in feeds],
        "total_kg": feeder_service.stock_kg(db),
        "reserved_kg": feeder_service.reserved_kg(db),
        "available_kg": feeder_service.available_stock_kg(db),
    }


@router.post("", status_code=201)
def create_feed(
    payload: schemas.FeedStockIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_roles("admin", "pemilik")),
):
    feed = models.FeedStock(
        name=payload.name,
        feed_type=payload.feed_type,
        quantity_kg=payload.quantity_kg,
        price_per_kg=payload.price_per_kg,
        vendor=payload.vendor,
        active=payload.active,
    )
    db.add(feed)
    db.flush()
    audit.record_audit(
        db,
        user=actor,
        action="feed.create",
        entity="feed_stock",
        entity_id=feed.id,
        description=f"Menambah stok pakan {feed.name} {feed.quantity_kg:.2f} kg.",
        ip=client_ip(request),
    )
    _maybe_resolve_low_stock(db)
    db.commit()
    return feed_dict(feed)


@router.patch("/{feed_id}")
def update_feed(
    feed_id: int,
    payload: schemas.FeedStockUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: models.User = Depends(require_roles("admin", "pemilik")),
):
    feed = db.get(models.FeedStock, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="Stok pakan tidak ditemukan.")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(feed, key, value)
    audit.record_audit(
        db,
        user=actor,
        action="feed.update",
        entity="feed_stock",
        entity_id=feed.id,
        description=f"Memperbarui stok pakan {feed.name}.",
        ip=client_ip(request),
        meta=changes,
    )
    _maybe_resolve_low_stock(db)
    db.commit()
    return feed_dict(feed)

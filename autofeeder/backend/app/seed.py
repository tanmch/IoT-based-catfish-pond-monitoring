"""Idempotent demo seed for local evaluation."""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models
from .config import settings
from .security import hash_device_key, hash_password


def seed_demo(db: Session) -> dict[str, int]:
    created = {"users": 0, "ponds": 0, "device": 0, "feed": 0, "schedules": 0}

    users = [
        ("admin", "admin@fishlinker.local", settings.demo_password_admin, "admin"),
        ("pemilik", "pemilik@fishlinker.local", settings.demo_password_owner, "pemilik"),
        ("operator", "operator@fishlinker.local", settings.demo_password_operator, "petani"),
    ]
    user_by_name: dict[str, models.User] = {}
    for username, email, password, role in users:
        existing = db.query(models.User).filter(models.User.username == username).first()
        if not existing:
            existing = models.User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                role=role,
            )
            db.add(existing)
            db.flush()
            created["users"] += 1
        user_by_name[username] = existing

    if db.query(models.Pond.id).count() == 0:
        for i in range(1, 11):
            db.add(
                models.Pond(
                    name=f"Kolam L{i}",
                    side="left",
                    pond_index=i,
                    position_m=round((i - 1) * 1.6 + 0.8, 2),
                    biomass_kg=500.0,
                    diameter_m=3.0,
                )
            )
        for i in range(1, 11):
            db.add(
                models.Pond(
                    name=f"Kolam R{i}",
                    side="right",
                    pond_index=10 + i,
                    position_m=round((i - 1) * 1.6 + 0.8, 2),
                    biomass_kg=500.0,
                    diameter_m=3.0,
                )
            )
        db.flush()
        created["ponds"] = 20

    ponds = db.query(models.Pond).order_by(models.Pond.pond_index).all()

    operator = user_by_name.get("operator")
    if operator:
        assigned = {row[0] for row in db.query(models.PondAssignment.pond_id).all()}
        for pond in ponds:
            if pond.id not in assigned:
                db.add(models.PondAssignment(user_id=operator.id, pond_id=pond.id))

    device = db.query(models.Device).filter(models.Device.device_id == settings.device_id).first()
    if not device:
        db.add(
            models.Device(
                device_id=settings.device_id,
                name=settings.device_name,
                api_key_hash=hash_device_key(settings.device_api_key),
                api_key_hint=settings.device_api_key[:8],
                status="offline",
                state="idle",
                config_version=0,
            )
        )
        created["device"] = 1

    if db.query(models.FeedStock.id).count() == 0:
        db.add(models.FeedStock(name="Pelet 781-1", feed_type="pelet", quantity_kg=500.0, price_per_kg=14500))
        db.add(models.FeedStock(name="Pelet 781-2", feed_type="pelet", quantity_kg=250.0, price_per_kg=15200))
        created["feed"] = 2

    if db.query(models.Schedule.id).count() == 0 and ponds:
        db.add(
            models.Schedule(
                scope="global",
                feeding_times=["07:00", "16:00"],
                portion_mode="fixed",
                portion_grams=1000,
                pellet_type="medium",
                active=True,
                note="Jadwal awal demo",
                created_by=user_by_name.get("pemilik").id if user_by_name.get("pemilik") else None,
                updated_by=user_by_name.get("pemilik").id if user_by_name.get("pemilik") else None,
            )
        )
        created["schedules"] = 1

    db.commit()
    return created


def main() -> None:  # pragma: no cover
    from .database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        print(seed_demo(db))


if __name__ == "__main__":  # pragma: no cover
    main()

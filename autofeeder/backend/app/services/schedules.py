"""Schedule resolution and portion calculation."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, selectinload

from .. import models
from ..config import settings


def active_ponds(db: Session) -> list[models.Pond]:
    return (
        db.query(models.Pond)
        .filter(models.Pond.is_active.is_(True))
        .order_by(models.Pond.pond_index)
        .all()
    )


def load_schedules(db: Session) -> list[models.Schedule]:
    return (
        db.query(models.Schedule)
        .options(selectinload(models.Schedule.overrides))
        .order_by(models.Schedule.id)
        .all()
    )


def pond_is_active(pond: models.Pond) -> bool:
    return bool(pond.is_active)


def schedule_ponds(schedule: models.Schedule, ponds: list[models.Pond] | None = None, db: Session | None = None) -> list[models.Pond]:
    if ponds is None:
        if db is None:
            return []
        ponds = active_ponds(db)
    if schedule.scope == "global":
        return [p for p in ponds if p.is_active]
    if schedule.scope == "row":
        return [p for p in ponds if p.is_active and p.side == schedule.side]
    if schedule.scope == "pond":
        return [p for p in ponds if p.is_active and p.id == schedule.pond_id]
    return []


def effective_schedule(pond: models.Pond, schedules: list[models.Schedule]) -> models.Schedule | None:
    """Most specific active schedule wins: pond > row > global."""
    relevant = [s for s in schedules if s.active and s.id in _schedule_ids_for_pond(pond, schedules)]
    if not relevant:
        return None
    priority = {"pond": 3, "row": 2, "global": 1}
    relevant.sort(key=lambda s: (priority.get(s.scope, 0), s.updated_at, s.id), reverse=True)
    return relevant[0]


def _schedule_ids_for_pond(pond: models.Pond, schedules: list[models.Schedule]) -> set[int]:
    ids: set[int] = set()
    for s in schedules:
        if s.scope == "global":
            ids.add(s.id)
        elif s.scope == "row" and s.side == pond.side:
            ids.add(s.id)
        elif s.scope == "pond" and s.pond_id == pond.id:
            ids.add(s.id)
    return ids


def override_for(schedule: models.Schedule, pond: models.Pond) -> models.ScheduleOverride | None:
    return next((o for o in schedule.overrides if o.pond_id == pond.id), None)


def portion_grams_for(schedule: models.Schedule, pond: models.Pond) -> float:
    override = override_for(schedule, pond)
    if override:
        if override.portion_grams is not None:
            return round(float(override.portion_grams), 1)
        if override.biomass_percent is not None:
            return round(pond.biomass_kg * float(override.biomass_percent) / 100.0 * 1000.0, 1)
    if schedule.portion_mode == "percent" and schedule.biomass_percent is not None:
        return round(pond.biomass_kg * schedule.biomass_percent / 100.0 * 1000.0, 1)
    return round(float(schedule.portion_grams or 0.0), 1)


def portion_meta(schedule: models.Schedule, pond: models.Pond) -> dict[str, Any]:
    grams = portion_grams_for(schedule, pond)
    override = override_for(schedule, pond)
    if override and override.portion_grams is not None:
        mode = "fixed"
        value = override.portion_grams
    elif override and override.biomass_percent is not None:
        mode = "percent"
        value = override.biomass_percent
    else:
        mode = schedule.portion_mode
        value = schedule.biomass_percent if mode == "percent" else schedule.portion_grams
    rotations = round(grams / settings.grams_per_rotation, 2) if settings.grams_per_rotation else 0
    return {
        "grams": grams,
        "rotations": rotations,
        "mode": mode,
        "value": value,
        "override": bool(override),
        "valid": 0 < grams <= settings.max_portion_grams,
    }


def applies_to(schedule: models.Schedule, ponds: list[models.Pond]) -> list[dict[str, Any]]:
    result = []
    for pond in schedule_ponds(schedule, ponds):
        meta = portion_meta(schedule, pond)
        result.append(
            {
                "pond_id": pond.id,
                "pond_index": pond.pond_index,
                "pond_name": pond.name,
                "side": pond.side,
                "grams": meta["grams"],
                "rotations": meta["rotations"],
                "override": meta["override"],
                "valid": meta["valid"],
            }
        )
    return result


def effective_by_pond(db: Session, ponds: list[models.Pond] | None = None, schedules: list[models.Schedule] | None = None) -> dict[int, tuple[models.Schedule | None, dict[str, Any]]]:
    ponds = ponds if ponds is not None else active_ponds(db)
    schedules = schedules if schedules is not None else load_schedules(db)
    result = {}
    for pond in ponds:
        schedule = effective_schedule(pond, schedules)
        result[pond.id] = (
            schedule,
            portion_meta(schedule, pond) if schedule else {"grams": 0, "rotations": 0, "valid": False},
        )
    return result


def rotations_for(grams: float) -> float:
    if not settings.grams_per_rotation:
        return 0.0
    return round(grams / settings.grams_per_rotation, 2)


def daily_planned_grams(db: Session) -> float:
    ponds = active_ponds(db)
    schedules = load_schedules(db)
    total = 0.0
    for pond in ponds:
        schedule = effective_schedule(pond, schedules)
        if schedule:
            total += portion_grams_for(schedule, pond) * len(schedule.feeding_times)
    return total


def ensure_no_duplicate_slot_overflow(schedule: models.Schedule) -> None:
    if len(schedule.feeding_times) > 3:
        raise ValueError("Maksimum 3 jadwal feeding per kolam per hari.")
    if len(set(schedule.feeding_times)) != len(schedule.feeding_times):
        raise ValueError("Jam feeding tidak boleh duplikat.")
    for value in schedule.feeding_times:
        if not isinstance(value, str) or len(value) != 5:
            raise ValueError("Format jam tidak valid.")

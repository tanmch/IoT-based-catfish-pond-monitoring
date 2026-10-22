"""Timezone helpers.

The database stores naive UTC datetimes. API responses are converted to WIB
(Asia/Jakarta) ISO-8601 strings so the frontend never has to guess the zone.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from ..config import settings

JAKARTA = ZoneInfo(settings.timezone)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_wib(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return as_utc(dt).astimezone(JAKARTA)


def iso_wib(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return to_wib(dt).isoformat(timespec="seconds")


def wib_now() -> datetime:
    return datetime.now(JAKARTA)


def parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def planned_utc_naive(day: date, hhmm: str) -> datetime:
    local = datetime.combine(day, parse_hhmm(hhmm), tzinfo=JAKARTA)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def wib_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=JAKARTA).astimezone(timezone.utc).replace(tzinfo=None)
    end = start + timedelta(days=1)
    return start, end


def next_occurrence(hhmm: str, now: datetime | None = None) -> datetime:
    """Next local occurrence of HH:MM, returned as naive UTC."""
    now_wib = to_wib(now or utcnow())
    local_time = parse_hhmm(hhmm)
    candidate = datetime.combine(now_wib.date(), local_time, tzinfo=JAKARTA)
    if candidate <= now_wib:
        candidate += timedelta(days=1)
    return candidate.astimezone(timezone.utc).replace(tzinfo=None)

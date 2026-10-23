"""Database models for the auto-feeder service.

All tables are prefixed with ``feeder_`` so they can live in the same MySQL
schema as the existing Fish Linker tables without collisions. ``feeder_ponds``
optionally references a Fish Linker ``kolam`` row through
``fishlinker_kolam_id``.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp, stored consistently across SQLite and MySQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    """Internal operator identity used for audit attribution (no login)."""

    __tablename__ = "feeder_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="admin", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)


class Pond(Base):
    __tablename__ = "feeder_ponds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fishlinker_kolam_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # left | right
    pond_index: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    position_m: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    biomass_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    biomass_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    diameter_m: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    overrides: Mapped[list["ScheduleOverride"]] = relationship(
        back_populates="pond", cascade="all, delete-orphan"
    )


class Schedule(Base):
    __tablename__ = "feeder_schedules"
    __table_args__ = (
        Index("ix_feeder_schedule_scope", "scope", "active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(10), nullable=False)  # global | row | pond
    side: Mapped[str | None] = mapped_column(String(10), nullable=True)
    pond_id: Mapped[int | None] = mapped_column(
        ForeignKey("feeder_ponds.id", ondelete="CASCADE"), nullable=True, index=True
    )
    feeding_times: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    portion_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="fixed")
    portion_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    biomass_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    pellet_type: Mapped[str] = mapped_column(String(50), nullable=False, default="medium")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    overrides: Mapped[list["ScheduleOverride"]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan"
    )
    pond: Mapped["Pond | None"] = relationship()


class ScheduleOverride(Base):
    __tablename__ = "feeder_schedule_overrides"
    __table_args__ = (UniqueConstraint("schedule_id", "pond_id", name="uq_feeder_override"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("feeder_schedules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pond_id: Mapped[int] = mapped_column(
        ForeignKey("feeder_ponds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    portion_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    biomass_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    schedule: Mapped["Schedule"] = relationship(back_populates="overrides")
    pond: Mapped["Pond"] = relationship(back_populates="overrides")


class FeedStock(Base):
    __tablename__ = "feeder_feed_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    feed_type: Mapped[str] = mapped_column(String(50), nullable=False, default="pelet")
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price_per_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    vendor: Mapped[str | None] = mapped_column(String(150), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )


class Device(Base):
    __tablename__ = "feeder_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    api_key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    api_key_hint: Mapped[str] = mapped_column(String(12), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="offline", index=True)
    state: Mapped[str] = mapped_column(String(30), nullable=False, default="idle")
    gantry_pond_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rail_position_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hopper_level_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    config_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)


class Telemetry(Base):
    __tablename__ = "feeder_telemetry"
    __table_args__ = (
        Index("ix_feeder_telemetry_device_time", "device_id", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(
        ForeignKey("feeder_devices.device_id", ondelete="CASCADE"), nullable=False
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, index=True)
    pond_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gantry_state: Mapped[str | None] = mapped_column(String(30), nullable=True)
    rail_position_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hopper_temp_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    hopper_humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    hopper_pressure_kpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    hopper_feed_present: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    hopper_remaining_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    hopper_level_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    voltage_v: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_a: Mapped[float | None] = mapped_column(Float, nullable=True)
    power_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    dc_current_a: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class FeedingRun(Base):
    __tablename__ = "feeder_runs"
    __table_args__ = (
        UniqueConstraint("schedule_id", "pond_id", "planned_at", name="uq_feeder_run_slot"),
        Index("ix_feeder_runs_status_time", "status", "planned_at"),
        Index("ix_feeder_runs_pond_time", "pond_id", "planned_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_id: Mapped[int | None] = mapped_column(
        ForeignKey("feeder_schedules.id", ondelete="SET NULL"), nullable=True
    )
    pond_id: Mapped[int] = mapped_column(
        ForeignKey("feeder_ponds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="schedule")
    planned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    target_grams: Mapped[float] = mapped_column(Float, nullable=False)
    rotary_rotations: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned", index=True)
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    actual_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    pond: Mapped["Pond"] = relationship()
    schedule: Mapped["Schedule | None"] = relationship()


class Command(Base):
    __tablename__ = "feeder_commands"
    __table_args__ = (
        Index("ix_feeder_commands_device_status", "device_id", "status", "priority"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    command_uid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(
        ForeignKey("feeder_devices.device_id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # feed | move | home | emergency_stop | reset
    pond_id: Mapped[int | None] = mapped_column(
        ForeignKey("feeder_ponds.id", ondelete="SET NULL"), nullable=True
    )
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("feeder_runs.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    issued_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    issued_by_name: Mapped[str] = mapped_column(String(120), nullable=False, default="system")
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ack_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    pond: Mapped["Pond | None"] = relationship()
    device: Mapped["Device"] = relationship()


class Alarm(Base):
    __tablename__ = "feeder_alarms"
    __table_args__ = (
        Index("ix_feeder_alarms_status_time", "status", "detected_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pond_id: Mapped[int | None] = mapped_column(
        ForeignKey("feeder_ponds.id", ondelete="SET NULL"), nullable=True
    )
    alarm_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="warning")
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    acknowledged_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    pond: Mapped["Pond | None"] = relationship()


class AuditLog(Base):
    __tablename__ = "feeder_audit_logs"
    __table_args__ = (
        Index("ix_feeder_audit_time", "at"),
        Index("ix_feeder_audit_user_time", "user_id", "at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)

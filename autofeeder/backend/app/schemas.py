"""Pydantic request/response schemas.

Validation is deliberately strict: the API is the trust boundary for both the
web UI and the ESP device.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,50}$")
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,80}$")

Role = Literal["admin", "pemilik", "petani"]
Scope = Literal["global", "row", "pond"]
Side = Literal["left", "right"]


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=256)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        value = value.strip()
        if not USERNAME_RE.match(value):
            raise ValueError("Username hanya boleh huruf, angka, titik, garis bawah, atau strip (3-50).")
        return value


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)
    role: Role = "petani"

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        value = value.strip()
        if not USERNAME_RE.match(value):
            raise ValueError("Username hanya boleh huruf, angka, titik, garis bawah, atau strip (3-50).")
        return value


class UserUpdateRequest(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class PondAssignmentRequest(BaseModel):
    pond_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("pond_ids")
    @classmethod
    def _unique(cls, value: list[int]) -> list[int]:
        return sorted(set(value))


class PondBiomassRequest(BaseModel):
    biomass_kg: float = Field(gt=0, le=1_000_000)
    note: str | None = Field(default=None, max_length=255)


class OverrideIn(BaseModel):
    pond_id: int = Field(gt=0)
    portion_grams: float | None = Field(default=None, gt=0, le=10000)
    biomass_percent: float | None = Field(default=None, gt=0, le=10)

    @model_validator(mode="after")
    def _one_value(self) -> "OverrideIn":
        if self.portion_grams is None and self.biomass_percent is None:
            raise ValueError("Override harus memiliki portion_grams atau biomass_percent.")
        return self


class ScheduleIn(BaseModel):
    scope: Scope
    side: Side | None = None
    pond_id: int | None = Field(default=None, gt=0)
    feeding_times: list[str] = Field(min_length=1, max_length=3)
    portion_mode: Literal["fixed", "percent"] = "fixed"
    portion_grams: float | None = Field(default=None, gt=0, le=10000)
    biomass_percent: float | None = Field(default=None, gt=0, le=10)
    pellet_type: str = Field(default="medium", min_length=1, max_length=50)
    active: bool = True
    note: str | None = Field(default=None, max_length=255)
    overrides: list[OverrideIn] = Field(default_factory=list, max_length=20)

    @field_validator("feeding_times")
    @classmethod
    def _times(cls, value: list[str]) -> list[str]:
        cleaned = []
        for item in value:
            item = item.strip()
            if not TIME_RE.match(item):
                raise ValueError("Format jam harus HH:MM (00:00-23:59).")
            cleaned.append(item)
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Jam feeding tidak boleh duplikat.")
        return sorted(cleaned)

    @model_validator(mode="after")
    def _consistency(self) -> "ScheduleIn":
        if self.scope == "global":
            if self.side is not None or self.pond_id is not None:
                raise ValueError("Jadwal global tidak boleh memiliki side atau pond_id.")
        elif self.scope == "row":
            if self.side is None or self.pond_id is not None:
                raise ValueError("Jadwal baris memerlukan side dan tidak boleh memiliki pond_id.")
        elif self.scope == "pond":
            if self.pond_id is None or self.side is not None:
                raise ValueError("Jadwal kolam memerlukan pond_id dan tidak boleh memiliki side.")

        if self.portion_mode == "fixed":
            if self.portion_grams is None:
                raise ValueError("portion_grams wajib untuk mode fixed.")
            self.biomass_percent = None
        else:
            if self.biomass_percent is None:
                raise ValueError("biomass_percent wajib untuk mode percent.")
            self.portion_grams = None

        pond_ids = [o.pond_id for o in self.overrides]
        if len(set(pond_ids)) != len(pond_ids):
            raise ValueError("Override kolam tidak boleh duplikat.")
        return self


class ScheduleActiveRequest(BaseModel):
    active: bool


class ManualFeedRequest(BaseModel):
    pond_id: int = Field(gt=0)
    portion_grams: float = Field(gt=0, le=5000)
    confirm: bool
    note: str | None = Field(default=None, max_length=255)
    idempotency_key: str | None = Field(default=None, max_length=80)

    @field_validator("idempotency_key")
    @classmethod
    def _idempotency(cls, value: str | None) -> str | None:
        if value is not None and not IDEMPOTENCY_RE.match(value):
            raise ValueError("idempotency_key tidak valid.")
        return value

    @model_validator(mode="after")
    def _confirm(self) -> "ManualFeedRequest":
        if not self.confirm:
            raise ValueError("Konfirmasi manual feed diperlukan.")
        return self


class EStopRequest(BaseModel):
    confirm: bool
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _confirm(self) -> "EStopRequest":
        if not self.confirm:
            raise ValueError("Konfirmasi emergency stop diperlukan.")
        return self


class ResetRequest(BaseModel):
    confirm: bool

    @model_validator(mode="after")
    def _confirm(self) -> "ResetRequest":
        if not self.confirm:
            raise ValueError("Konfirmasi reset diperlukan.")
        return self


class DeviceStateIn(BaseModel):
    state: str | None = Field(default=None, max_length=30)
    gantry_pond_index: int | None = Field(default=None, ge=1, le=20)
    rail_position_step: int | None = Field(default=None, ge=0)


class EnvironmentIn(BaseModel):
    temperature_c: float | None = Field(default=None, ge=-20, le=80)
    humidity_pct: float | None = Field(default=None, ge=0, le=100)
    pressure_kpa: float | None = Field(default=None, ge=50, le=120)


class PowerIn(BaseModel):
    voltage_v: float | None = Field(default=None, ge=0, le=300)
    current_a: float | None = Field(default=None, ge=0, le=50)
    power_w: float | None = Field(default=None, ge=0, le=15000)
    energy_kwh: float | None = Field(default=None, ge=0, le=1_000_000)
    dc_current_a: float | None = Field(default=None, ge=0, le=30)


class HopperIn(BaseModel):
    feed_present: bool | None = None
    remaining_kg: float | None = Field(default=None, ge=0, le=100)
    level_percent: float | None = Field(default=None, ge=0, le=100)


class DeviceInfoIn(BaseModel):
    firmware_version: str | None = Field(default=None, max_length=50)


class TelemetryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    recorded_at: datetime | None = None
    status: DeviceStateIn | None = None
    environment: EnvironmentIn | None = None
    power: PowerIn | None = None
    hopper: HopperIn | None = None
    device: DeviceInfoIn | None = None

    @field_validator("recorded_at")
    @classmethod
    def _recorded_at(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    @model_validator(mode="after")
    def _at_least_one(self) -> "TelemetryIn":
        if not any([self.status, self.environment, self.power, self.hopper, self.device]):
            raise ValueError("Payload telemetry kosong.")
        return self


class CommandAckIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: Literal["success", "failed"]
    actual_grams: float | None = Field(default=None, ge=0, le=10000)
    actual_portion_g: float | None = Field(default=None, ge=0, le=10000)
    failure_reason: str | None = Field(default=None, max_length=200)
    executed_at: datetime | None = None
    result: dict[str, Any] | None = None

    @field_validator("executed_at")
    @classmethod
    def _executed_at(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class FeedStockIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    feed_type: str = Field(default="pelet", min_length=1, max_length=50)
    quantity_kg: float = Field(ge=0, le=100_000)
    price_per_kg: float = Field(ge=0, le=1_000_000)
    vendor: str | None = Field(default=None, max_length=150)
    active: bool = True


class FeedStockUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    feed_type: str | None = Field(default=None, min_length=1, max_length=50)
    quantity_kg: float | None = Field(default=None, ge=0, le=100_000)
    price_per_kg: float | None = Field(default=None, ge=0, le=1_000_000)
    vendor: str | None = Field(default=None, max_length=150)
    active: bool | None = None


class AlarmActionRequest(BaseModel):
    note: str | None = Field(default=None, max_length=255)


class ConfigAckIn(BaseModel):
    config_version: int = Field(ge=0)

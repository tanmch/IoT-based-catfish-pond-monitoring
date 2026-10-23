"""Application configuration.

All deployment-specific values come from environment variables (or a local
.env file that is never committed). See .env.example.

This presentation build has no user accounts. ``DEMO_MODE`` keeps the UI open
and keeps the seeded gantry shown as online. Never enable demo mode in
production; the validator below refuses to start if you try.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core
    app_name: str = "AutoFeeder Rail Gantry"
    app_version: str = "1.1.0-demo"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api"
    timezone: str = "Asia/Jakarta"

    # Presentation mode (no accounts)
    demo_mode: bool = True
    public_monitoring: bool = False
    cors_origins: str = "http://localhost:5174,http://127.0.0.1:5174"
    allowed_hosts: str = "localhost,127.0.0.1,testserver"

    # Database
    database_url: str = f"sqlite:///{DATA_DIR / 'autofeeder.db'}"

    # Device
    device_id: str = "lele-gantry-001"
    device_name: str = "Gantry Lele 001"
    device_api_key: str = Field(min_length=24)
    device_offline_seconds: int = Field(default=30, ge=10, le=600)
    command_ttl_seconds: int = Field(default=120, ge=30, le=1800)

    # Scheduler
    scheduler_enabled: bool = True
    scheduler_tick_seconds: int = Field(default=5, ge=2, le=60)
    schedule_late_grace_seconds: int = Field(default=900, ge=60, le=7200)
    hopper_capacity_kg: float = Field(default=15.0, gt=0, le=100)
    grams_per_rotation: float = Field(default=200.0, gt=0, le=2000)
    max_portion_grams: float = Field(default=10000.0, gt=0, le=20000)
    max_manual_portion_grams: float = Field(default=5000.0, gt=0, le=20000)
    retention_days: int = Field(default=365, ge=30, le=3650)

    # Seed / demo (never enable in production)
    seed_demo: bool = True
    seed_demo_history: bool = True
    demo_history_days: int = Field(default=14, ge=1, le=90)

    # Optional Fish Linker integration
    fishlinker_database_url: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _validate_security(self) -> "Settings":
        device_key = (self.device_api_key or "").lower()
        if (
            device_key.startswith(("change-me", "changeme", "secret", "dev-"))
            or len(set(device_key)) < 8
        ):
            raise ValueError("DEVICE_API_KEY terlalu lemah. Gunakan nilai acak minimal 24 karakter.")
        if self.is_production:
            if self.seed_demo or self.seed_demo_history:
                raise ValueError("SEED_DEMO dan SEED_DEMO_HISTORY harus false di production.")
            if self.demo_mode:
                raise ValueError("DEMO_MODE harus false di production.")
            if self.debug:
                raise ValueError("DEBUG harus false di production.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

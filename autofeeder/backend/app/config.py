"""Application configuration.

All secrets and deployment-specific values come from environment variables
(or a local .env file that is never committed). See .env.example.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

WEAK_SECRETS = {
    "supersecretkey",
    "change-me",
    "changeme",
    "secret",
    "dev",
    "development",
    "your-secret-key",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core
    app_name: str = "AutoFeeder Rail Gantry"
    app_version: str = "1.0.0"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api"
    timezone: str = "Asia/Jakarta"

    # Security
    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)
    login_max_attempts: int = Field(default=5, ge=3, le=20)
    login_window_seconds: int = Field(default=600, ge=60, le=3600)
    login_lockout_seconds: int = Field(default=900, ge=60, le=86400)
    allow_registration: bool = True
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
    demo_password_admin: str = "Admin#12345"
    demo_password_owner: str = "Pemilik#12345"
    demo_password_operator: str = "Petani#12345"

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
        weak_values = {v.lower() for v in WEAK_SECRETS}
        secret = (self.secret_key or "").lower()
        device_key = (self.device_api_key or "").lower()
        if (
            secret in weak_values
            or secret.startswith(("change-me", "changeme", "secret", "dev-"))
            or len(set(secret)) < 12
        ):
            raise ValueError("SECRET_KEY terlalu lemah. Gunakan nilai acak minimal 32 karakter.")
        if (
            device_key in weak_values
            or device_key.startswith(("change-me", "changeme", "secret", "dev-"))
            or len(set(device_key)) < 8
        ):
            raise ValueError("DEVICE_API_KEY terlalu lemah. Gunakan nilai acak minimal 24 karakter.")
        if self.is_production:
            if self.seed_demo:
                raise ValueError("SEED_DEMO harus false di production.")
            if self.debug:
                raise ValueError("DEBUG harus false di production.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

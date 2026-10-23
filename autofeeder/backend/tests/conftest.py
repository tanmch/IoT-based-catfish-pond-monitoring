from __future__ import annotations

import os
import tempfile
from pathlib import Path

TEST_DIR = tempfile.mkdtemp(prefix="autofeeder-tests-")
TEST_DB = Path(TEST_DIR) / "test.db"
TEST_DEVICE_KEY = "fg_test_0123456789abcdef0123456789abcdef"

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DEBUG": "false",
        "DEMO_MODE": "false",
        "DEVICE_API_KEY": TEST_DEVICE_KEY,
        "DATABASE_URL": f"sqlite:///{TEST_DB}",
        "SEED_DEMO": "true",
        "SEED_DEMO_HISTORY": "false",
        "SCHEDULER_ENABLED": "false",
        "ALLOWED_HOSTS": "testserver,localhost",
        "CORS_ORIGINS": "http://localhost:5174",
        "PUBLIC_MONITORING": "false",
    }
)

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.seed import seed_demo


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_demo(session)
        yield session


@pytest.fixture()
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient, username: str = "admin", password: str | None = None) -> dict:
    """Presentation mode has no login; kept as a no-op for older tests."""
    return {}


def device_headers(key: str = TEST_DEVICE_KEY) -> dict:
    return {"X-Device-Key": key}


def send_telemetry(client: TestClient, **overrides) -> dict:
    payload = {
        "status": {"state": "idle", "gantry_pond_index": 1, "rail_position_step": 100},
        "environment": {"temperature_c": 30.2, "humidity_pct": 65, "pressure_kpa": 100.8},
        "power": {
            "voltage_v": 220,
            "current_a": 1.2,
            "power_w": 240,
            "energy_kwh": 1.2,
            "dc_current_a": 0.4,
        },
        "hopper": {"feed_present": True, "remaining_kg": 14.5, "level_percent": 96},
        "device": {"firmware_version": "test-1"},
    }
    payload.update(overrides)
    response = client.post("/api/device/telemetry", headers=device_headers(), json=payload)
    assert response.status_code == 200, response.text
    return response.json()

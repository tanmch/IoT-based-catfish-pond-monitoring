from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app import models
from app.database import SessionLocal
from app.services import feeder
from app.services.timeutil import planned_utc_naive, to_wib, utcnow
from tests.conftest import device_headers, login, send_telemetry


def test_health_and_open_demo_mode(client: TestClient):
    assert client.get("/api/health").status_code == 200
    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["role"] == "admin"
    # Device endpoints remain protected by the device key.
    assert client.get("/api/device/commands").status_code == 401


def test_account_endpoints_are_gone(client: TestClient):
    assert client.post("/api/auth/login", json={"identifier": "admin", "password": "x"}).status_code in {404, 405}
    assert client.get("/api/users").status_code == 404
    assert client.get("/api/auth/me").status_code == 404


def test_schedule_validation_and_override(client: TestClient):
    admin = login(client, "admin")
    invalid = {
        "scope": "global",
        "side": "left",
        "feeding_times": ["08:00"],
        "portion_mode": "fixed",
        "portion_grams": 1000,
    }
    assert client.post("/api/schedules", headers=admin, json=invalid).status_code == 422

    valid = {
        "scope": "global",
        "feeding_times": ["07:00", "16:00"],
        "portion_mode": "fixed",
        "portion_grams": 1000,
        "overrides": [{"pond_id": 1, "portion_grams": 1500}],
    }
    response = client.post("/api/schedules", headers=admin, json=valid)
    assert response.status_code == 201, response.text
    data = response.json()
    assert len(data["applies_to"]) == 20
    assert any(item["pond_id"] == 1 and item["grams"] == 1500 for item in data["applies_to"])


def test_device_key_auth_and_telemetry_online(client: TestClient):
    assert client.post("/api/device/telemetry", json={}).status_code == 401
    assert (
        client.post(
            "/api/device/telemetry",
            headers=device_headers("wrong-key-000000000000000000000000"),
            json={"environment": {"temperature_c": 30}},
        ).status_code
        == 401
    )
    result = send_telemetry(client)
    assert result["ok"] is True

    admin = login(client, "admin")
    dashboard = client.get("/api/dashboard", headers=admin).json()
    assert dashboard["device"]["status"] == "online"
    assert dashboard["telemetry"]["environment"]["temperature_c"] == 30.2
    assert dashboard["telemetry"]["hopper"]["level_percent"] == 96


def test_manual_feed_ack_deducts_stock_and_rejects_replay(client: TestClient):
    send_telemetry(client)
    operator = login(client, "operator")
    response = client.post(
        "/api/commands/manual-feed",
        headers=operator,
        json={
            "pond_id": 1,
            "portion_grams": 1000,
            "confirm": True,
            "idempotency_key": "manual-feed-test-0001",
        },
    )
    assert response.status_code == 201, response.text
    command_uid = response.json()["command"]["command_uid"]
    assert response.json()["run"]["rotary_rotations"] == 5.0

    poll = client.get("/api/device/commands", headers=device_headers())
    assert poll.status_code == 200
    assert poll.json()["commands"][0]["command_uid"] == command_uid

    ack = client.post(
        f"/api/device/commands/{command_uid}/ack",
        headers=device_headers(),
        json={"status": "success", "actual_grams": 980},
    )
    assert ack.status_code == 200, ack.text

    runs = client.get("/api/runs", headers=operator).json()["items"]
    run = next(r for r in runs if r["id"] == response.json()["run"]["id"])
    assert run["status"] == "dispensed"
    assert run["actual_grams"] == 980.0

    feeds = client.get("/api/feeds", headers=operator).json()
    assert abs(feeds["total_kg"] - 749.02) < 0.001

    replay = client.post(
        f"/api/device/commands/{command_uid}/ack",
        headers=device_headers(),
        json={"status": "success"},
    )
    assert replay.status_code == 409


def test_idempotency_key_prevents_double_feed(client: TestClient):
    send_telemetry(client)
    operator = login(client, "operator")
    body = {
        "pond_id": 1,
        "portion_grams": 500,
        "confirm": True,
        "idempotency_key": "same-request-12345",
    }
    first = client.post("/api/commands/manual-feed", headers=operator, json=body)
    second = client.post("/api/commands/manual-feed", headers=operator, json=body)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["command"]["command_uid"] == second.json()["command"]["command_uid"]


def test_manual_feed_rejected_when_device_offline(client: TestClient):
    operator = login(client, "operator")
    response = client.post(
        "/api/commands/manual-feed",
        headers=operator,
        json={"pond_id": 1, "portion_grams": 500, "confirm": True},
    )
    assert response.status_code == 409
    assert "offline" in response.json()["detail"].lower()


def _clear_schedules_and_add_due(client: TestClient, grams: float = 500) -> int:
    admin = login(client, "admin")
    with SessionLocal() as db:
        for schedule in db.query(models.Schedule).all():
            db.delete(schedule)
        db.commit()
    now_wib = to_wib(utcnow())
    response = client.post(
        "/api/schedules",
        headers=admin,
        json={
            "scope": "pond",
            "pond_id": 1,
            "feeding_times": [now_wib.strftime("%H:%M")],
            "portion_mode": "fixed",
            "portion_grams": grams,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_materialize_uses_only_effective_schedule(client: TestClient):
    admin = login(client, "admin")
    with SessionLocal() as db:
        for schedule in db.query(models.Schedule).all():
            db.delete(schedule)
        db.commit()

    global_response = client.post(
        "/api/schedules",
        headers=admin,
        json={
            "scope": "global",
            "feeding_times": ["08:00"],
            "portion_mode": "fixed",
            "portion_grams": 1000,
        },
    )
    assert global_response.status_code == 201, global_response.text
    pond_response = client.post(
        "/api/schedules",
        headers=admin,
        json={
            "scope": "pond",
            "pond_id": 1,
            "feeding_times": ["08:00"],
            "portion_mode": "fixed",
            "portion_grams": 500,
        },
    )
    assert pond_response.status_code == 201, pond_response.text
    pond_schedule_id = pond_response.json()["id"]

    now = planned_utc_naive(to_wib(utcnow()).date(), "08:05")
    with SessionLocal() as db:
        created = feeder.materialize_runs(db, now)
        db.commit()
        assert created == 20
        runs = (
            db.query(models.FeedingRun)
            .filter(models.FeedingRun.pond_id == 1)
            .all()
        )
        assert len(runs) == 1
        assert runs[0].schedule_id == pond_schedule_id
        assert runs[0].target_grams == 500

    with SessionLocal() as db:
        assert feeder.materialize_runs(db, now) == 0
        db.commit()


def test_scheduler_materializes_and_dispatches_due_run(client: TestClient):
    send_telemetry(client)
    schedule_id = _clear_schedules_and_add_due(client, grams=500)
    now = utcnow()
    with SessionLocal() as db:
        result = feeder.scheduler_tick(db, now)
        db.commit()
        assert result["created"] >= 1
        assert result["dispatched"] >= 1
        run = db.query(models.FeedingRun).filter(models.FeedingRun.schedule_id == schedule_id).first()
        assert run is not None and run.status == "planned"
        command = db.query(models.Command).filter(models.Command.run_id == run.id).first()
        assert command is not None and command.status == "pending"
        assert command.payload["portion_grams"] == 500


def test_scheduler_skips_when_stock_insufficient_and_raises_alarm(client: TestClient):
    send_telemetry(client)
    _clear_schedules_and_add_due(client, grams=500)
    with SessionLocal() as db:
        for feed in db.query(models.FeedStock).all():
            feed.quantity_kg = 0
        db.commit()
    with SessionLocal() as db:
        feeder.scheduler_tick(db, utcnow())
        db.commit()
        run = db.query(models.FeedingRun).filter(models.FeedingRun.pond_id == 1).first()
        assert run is not None
        assert run.status == "skipped"
        assert run.failure_reason == "STOK_PAKAN_TIDAK_CUKUP"
        alarm = (
            db.query(models.Alarm)
            .filter(models.Alarm.alarm_type == "FEED_STOCK_LOW")
            .first()
        )
        assert alarm is not None and alarm.status == "open"


def test_expired_command_fails_run(client: TestClient):
    send_telemetry(client)
    operator = login(client, "operator")
    response = client.post(
        "/api/commands/manual-feed",
        headers=operator,
        json={"pond_id": 1, "portion_grams": 500, "confirm": True},
    )
    assert response.status_code == 201
    run_id = response.json()["run"]["id"]
    with SessionLocal() as db:
        command = db.query(models.Command).filter(models.Command.run_id == run_id).first()
        command.expires_at = utcnow() - timedelta(minutes=5)
        db.commit()
    with SessionLocal() as db:
        feeder.expire_commands(db, utcnow())
        db.commit()
        run = db.get(models.FeedingRun, run_id)
        assert run.status == "failed"
        assert run.failure_reason == "PERINTAH_KEDALUWARSA"


def test_command_cancel_rules(client: TestClient):
    send_telemetry(client)
    operator = login(client, "operator")

    estop = client.post(
        "/api/commands/estop",
        headers=operator,
        json={"confirm": True, "reason": "Uji pembatalan"},
    )
    assert estop.status_code == 201, estop.text
    estop_uid = estop.json()["command_uid"]
    denied = client.post(f"/api/commands/{estop_uid}/cancel")
    assert denied.status_code == 403

    feed = client.post(
        "/api/commands/manual-feed",
        headers=operator,
        json={"pond_id": 1, "portion_grams": 500, "confirm": True},
    )
    assert feed.status_code == 201, feed.text
    uid = feed.json()["command"]["command_uid"]
    assert client.post(f"/api/commands/{uid}/cancel").status_code == 200


def test_emergency_stop_creates_priority_command(client: TestClient):
    send_telemetry(client)
    operator = login(client, "operator")
    response = client.post(
        "/api/commands/estop",
        headers=operator,
        json={"confirm": True, "reason": "Uji E-stop"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["kind"] == "emergency_stop"
    assert response.json()["priority"] == 100

    reset_allowed = client.post("/api/commands/reset", json={"confirm": True})
    assert reset_allowed.status_code == 201


def test_alarm_acknowledge_and_resolve(client: TestClient):
    send_telemetry(client, environment={"temperature_c": 45, "humidity_pct": 90})
    operator = login(client, "operator")
    alarms = client.get("/api/alarms", headers=operator).json()["items"]
    assert any(a["alarm_type"] == "HOPPER_TEMPERATURE" for a in alarms)
    alarm = next(a for a in alarms if a["alarm_type"] == "HOPPER_TEMPERATURE")

    ack = client.post(
        f"/api/alarms/{alarm['id']}/acknowledge", headers=operator, json={"note": "Dicek"}
    )
    assert ack.status_code == 200 and ack.json()["status"] == "acknowledged"
    resolve = client.post(f"/api/alarms/{alarm['id']}/resolve", headers=operator, json={})
    assert resolve.status_code == 200 and resolve.json()["status"] == "resolved"


def test_device_key_rotation(client: TestClient):
    send_telemetry(client)
    rotated = client.post("/api/devices/lele-gantry-001/rotate-key")
    assert rotated.status_code == 200, rotated.text
    new_key = rotated.json()["api_key"]

    assert (
        client.post(
            "/api/device/telemetry",
            headers=device_headers(),
            json={"environment": {"temperature_c": 30}},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/device/telemetry",
            headers=device_headers(new_key),
            json={"environment": {"temperature_c": 30}},
        ).status_code
        == 200
    )


def test_csv_exports_and_public_mode_disabled(client: TestClient):
    send_telemetry(client)
    admin = login(client, "admin")
    runs_csv = client.get("/api/runs/export.csv", headers=admin)
    assert runs_csv.status_code == 200
    assert "text/csv" in runs_csv.headers["content-type"]
    telemetry_csv = client.get("/api/devices/telemetry/export.csv", headers=admin)
    assert telemetry_csv.status_code == 200
    audit_csv = client.get("/api/audit/export.csv", headers=admin)
    assert audit_csv.status_code == 200
    assert client.get("/api/public/summary").status_code == 404


def test_pdf_export_returns_pdf(client: TestClient):
    send_telemetry(client)
    pdf = client.get("/api/runs/export.pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert "attachment" in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF")
    assert len(pdf.content) > 1000

    scoped = client.get("/api/runs/export.pdf?pond_id=1")
    assert scoped.status_code == 200
    assert scoped.content.startswith(b"%PDF")


def test_audit_trail_is_open_in_demo_mode(client: TestClient):
    with SessionLocal() as db:
        demo = db.query(models.User).filter(models.User.username == "Operator Demo").first()
        assert demo is not None
        assert demo.role == "admin"

    created = client.post(
        "/api/schedules",
        json={
            "scope": "global",
            "feeding_times": ["06:30", "17:00"],
            "portion_mode": "fixed",
            "portion_grams": 900,
        },
    )
    assert created.status_code == 201, created.text

    data = client.get("/api/audit").json()
    assert data["total"] >= 1
    assert any(item["action"] == "schedule.create" for item in data["items"])
    assert all(item["username"] == "Operator Demo" for item in data["items"] if item["action"] == "schedule.create")

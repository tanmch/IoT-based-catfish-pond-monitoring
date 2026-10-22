#!/usr/bin/env python3
"""Simulator for the rail-gantry ESP32 device.

The simulator behaves like the real firmware: it polls the REST command queue,
sends telemetry, acknowledges commands and keeps an in-memory hopper level.
It only uses the Python standard library, so it runs without installing extra
packages.

Usage:
    python simulator/device_sim.py
    python simulator/device_sim.py --api http://127.0.0.1:8010 --ponds 20

Configuration:
    DEVICE_API_KEY   per-device key from backend/.env (loaded automatically)
    SIM_HOPPER_KG    starting hopper content in kg (default 14)
    SIM_INTERVAL     poll interval in seconds (default 2)
    SIM_TELEMETRY    telemetry interval in seconds (default 5)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV = ROOT / "backend" / ".env"


def load_env(path: Path) -> None:
    """Minimal .env reader; does not override variables already in the environment."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


class DeviceClient:
    def __init__(self, api: str, device_key: str, timeout: float = 10.0) -> None:
        self.api = api.rstrip("/")
        self.device_key = device_key
        self.timeout = timeout

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{self.api}{path}",
            data=data,
            method=method,
            headers={
                "X-Device-Key": self.device_key,
                "Accept": "application/json",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} {method} {path}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Tidak dapat terhubung ke {self.api}: {exc.reason}") from exc

    def telemetry(self, payload: dict) -> dict:
        return self.request("POST", "/api/device/telemetry", payload)

    def poll(self) -> list[dict]:
        return self.request("GET", "/api/device/commands").get("commands", [])

    def ack(self, command_id: str, payload: dict) -> dict:
        return self.request("POST", f"/api/device/commands/{command_id}/ack", payload)

    def config(self) -> dict:
        return self.request("GET", "/api/device/config")

    def heartbeat(self) -> dict:
        return self.request("POST", "/api/device/heartbeat")


class RailGantry:
    """Very small state machine mirroring the physical gantry."""

    def __init__(self, hopper_kg: float, capacity_kg: float) -> None:
        self.hopper_kg = max(0.0, hopper_kg)
        self.capacity_kg = max(1.0, capacity_kg)
        self.state = "idle"
        self.start_step = 0
        self.position_step = 0
        self.pond_index: int | None = None
        self.energy_kwh = 0.0
        self.last_pond_index: int | None = None

    def level_percent(self) -> float:
        return round(min(100.0, self.hopper_kg / self.capacity_kg * 100.0), 1)

    def target_step(self, pond_index: int | None) -> int:
        if not pond_index:
            return 0
        return max(0, (pond_index - 1) * 120)

    def execute(self, command: dict, args: argparse.Namespace) -> dict:
        kind = command.get("kind")
        payload = command.get("payload") or {}
        command_id = command.get("command_uid") or payload.get("command_id")

        if self.state == "emergency_stop" and kind not in ("reset", "emergency_stop", "home"):
            return {
                "status": "failed",
                "failure_reason": "Emergency stop aktif; reset perangkat terlebih dahulu.",
                "executed_at": now_iso(),
            }

        if kind == "feed":
            if self.state == "emergency_stop":
                return {"status": "failed", "failure_reason": "E-stop aktif.", "executed_at": now_iso()}
            grams = float(payload.get("portion_grams") or 0)
            if grams <= 0:
                return {"status": "failed", "failure_reason": "Porsi tidak valid.", "executed_at": now_iso()}
            if self.hopper_kg * 1000.0 + 1e-6 < grams:
                return {
                    "status": "failed",
                    "failure_reason": "Pakan di hopper habis/tidak cukup.",
                    "executed_at": now_iso(),
                }

            self.pond_index = payload.get("pond_index") or command.get("pond_id")
            self.state = "feeding"
            print(f"  → bergerak ke kolam #{self.pond_index} dan menakar {grams:.0f} g …")
            time.sleep(min(args.sim_delay, 2.0))

            actual = round(grams * random.uniform(0.98, 1.0), 1)
            self.hopper_kg = max(0.0, self.hopper_kg - actual / 1000.0)
            self.position_step = self.target_step(self.pond_index)
            self.energy_kwh = round(self.energy_kwh + actual / 1000.0 * 0.02, 4)
            self.state = "idle"
            self.last_pond_index = self.pond_index
            print(
                f"     selesai: {actual:.0f} g, sisa hopper {self.hopper_kg:.2f} kg "
                f"({self.level_percent():.0f}%)"
            )
            return {
                "status": "success",
                "actual_grams": actual,
                "executed_at": now_iso(),
                "result": {
                    "rotary_rotations": payload.get("rotary_rotations"),
                    "pond_index": self.pond_index,
                    "hopper_kg": round(self.hopper_kg, 3),
                },
            }

        if kind == "move":
            self.state = "moving"
            self.pond_index = payload.get("pond_index", self.pond_index)
            time.sleep(min(args.sim_delay, 1.0))
            self.position_step = self.target_step(self.pond_index)
            self.state = "idle"
            return {"status": "success", "executed_at": now_iso(), "result": {"position_step": self.position_step}}

        if kind == "home":
            self.state = "homing"
            time.sleep(min(args.sim_delay, 1.0))
            self.position_step = 0
            self.pond_index = None
            self.state = "idle"
            return {"status": "success", "executed_at": now_iso(), "result": {"position_step": 0}}

        if kind == "emergency_stop":
            self.state = "emergency_stop"
            print("  ! Emergency stop diterima; gantry berhenti.")
            return {"status": "success", "executed_at": now_iso(), "result": {"state": self.state}}

        if kind == "reset":
            self.state = "idle"
            self.pond_index = None
            print("  ✓ Reset/validasi keamanan selesai; gantry siap.")
            return {"status": "success", "executed_at": now_iso(), "result": {"state": self.state}}

        return {
            "status": "failed",
            "failure_reason": f"Jenis perintah tidak dikenal: {kind}",
            "executed_at": now_iso(),
            "result": {"command_id": command_id},
        }

    def telemetry_payload(self, args: argparse.Namespace, tick: int) -> dict:
        wave = math.sin(tick / 12.0)
        temp = round(29.0 + wave * 1.6 + random.uniform(-0.3, 0.3), 1)
        humidity = round(72.0 - wave * 4 + random.uniform(-1.5, 1.5), 1)
        pressure = round(100.9 + random.uniform(-0.2, 0.2), 2)
        voltage = round(220.0 + random.uniform(-2.5, 2.5), 1)
        current = round(0.45 + (0.6 if self.state in ("feeding", "moving", "homing") else 0.0) + random.uniform(-0.04, 0.04), 2)
        payload = {
            "recorded_at": now_iso(),
            "status": {
                "state": self.state,
                "gantry_pond_index": self.pond_index or self.last_pond_index or 1,
                "rail_position_step": self.position_step,
            },
            "environment": {
                "temperature_c": temp,
                "humidity_pct": humidity,
                "pressure_kpa": pressure,
            },
            "power": {
                "voltage_v": voltage,
                "current_a": current,
                "power_w": round(voltage * current, 1),
                "energy_kwh": self.energy_kwh,
                "dc_current_a": round(1.2 + random.uniform(-0.05, 0.05), 2),
            },
            "hopper": {
                "feed_present": self.hopper_kg > 0.05,
                "remaining_kg": round(self.hopper_kg, 3),
                "level_percent": self.level_percent(),
            },
            "device": {"firmware_version": args.firmware},
        }
        return payload


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulator perangkat auto-feeder rail gantry")
    parser.add_argument("--api", default=os.environ.get("SIM_API", "http://127.0.0.1:8010"))
    parser.add_argument("--env-file", default=os.environ.get("SIM_ENV_FILE", str(DEFAULT_ENV)))
    parser.add_argument("--device-key", default=os.environ.get("DEVICE_API_KEY", ""))
    parser.add_argument("--hopper-kg", type=float, default=float(os.environ.get("SIM_HOPPER_KG", "14")))
    parser.add_argument("--capacity-kg", type=float, default=float(os.environ.get("SIM_CAPACITY_KG", "15")))
    parser.add_argument("--interval", type=float, default=float(os.environ.get("SIM_INTERVAL", "2")))
    parser.add_argument("--telemetry-every", type=float, default=float(os.environ.get("SIM_TELEMETRY", "5")))
    parser.add_argument("--delay", dest="sim_delay", type=float, default=float(os.environ.get("SIM_DELAY", "1.2")))
    parser.add_argument("--firmware", default="sim-1.0.0")
    parser.add_argument("--once", action="store_true", help="Kirim satu telemetry lalu keluar (untuk uji koneksi)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if not args.device_key:
        load_env(Path(args.env_file))
        args.device_key = os.environ.get("DEVICE_API_KEY", "")
    if not args.device_key:
        print("DEVICE_API_KEY belum diset. Jalankan dari root proyek atau isi backend/.env.", file=sys.stderr)
        return 2

    client = DeviceClient(args.api, args.device_key)
    gantry = RailGantry(args.hopper_kg, args.capacity_kg)

    print(f"Simulator AutoFeeder · API {args.api}")
    try:
        config = client.config()
        print(f"  device     : {config.get('device_id')} (config v{config.get('config_version')})")
        print(f"  jadwal     : {len(config.get('schedules') or [])} jadwal diterima")
        limits = config.get("limits") or {}
        print(f"  batas porsi: {limits.get('max_portion_grams')} g · hopper {args.hopper_kg:.1f} kg")
    except RuntimeError as exc:
        print(f"  peringatan : {exc}", file=sys.stderr)

    tick = 0
    next_telemetry = 0.0
    last_heartbeat = 0.0
    try:
        while True:
            now = time.monotonic()
            if now >= next_telemetry:
                try:
                    client.telemetry(gantry.telemetry_payload(args, tick))
                    next_telemetry = now + max(1.0, args.telemetry_every)
                    tick += 1
                except RuntimeError as exc:
                    print(f"telemetry gagal: {exc}", file=sys.stderr)
                    next_telemetry = now + 3.0
                if args.once:
                    print("Telemetry terkirim. Koneksi dan kredensial perangkat valid.")
                    return 0

            if now - last_heartbeat >= 10.0:
                try:
                    client.heartbeat()
                    last_heartbeat = now
                except RuntimeError:
                    pass

            try:
                commands = client.poll()
            except RuntimeError as exc:
                print(f"poll gagal: {exc}", file=sys.stderr)
                time.sleep(max(1.0, args.interval))
                continue

            for command in commands:
                uid = command.get("command_uid", "?")
                print(f"perintah {command.get('kind')} [{uid[:8]}] diterima")
                result = gantry.execute(command, args)
                try:
                    client.ack(uid, result)
                    print(f"  ACK {result.get('status')} terkirim")
                except RuntimeError as exc:
                    print(f"  ACK gagal: {exc}", file=sys.stderr)

            time.sleep(max(0.5, args.interval))
    except KeyboardInterrupt:
        print("\nSimulator dihentikan.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

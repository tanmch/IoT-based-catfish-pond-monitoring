#!/usr/bin/env bash
# AutoFeeder Rail Gantry - one-command local runner.
#
#   ./start.sh          build frontend, start API + UI on http://127.0.0.1:8010
#   ./start.sh --dev    start API on :8010 and Vite dev server on :5174
#   ./start.sh --reload start API with auto-reload (development)
#
# The first run creates backend/.env with random secrets, a virtualenv and the
# frontend npm dependencies. Nothing secret is committed to git.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
MODE="${1:-}"

log() { printf '\033[1;36m[autofeeder]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[autofeeder]\033[0m %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || fail "python3 tidak ditemukan."
command -v npm >/dev/null || fail "npm tidak ditemukan (butuh Node.js 20+)."

cd "$BACKEND"

if [[ ! -d .venv ]]; then
  log "Membuat virtualenv Python…"
  python3 -m venv .venv
fi

if [[ ! -f .venv/.deps-ok || requirements.txt -nt .venv/.deps-ok ]]; then
  log "Memasang dependensi backend…"
  .venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt
  touch .venv/.deps-ok
fi

if [[ ! -f .env ]]; then
  log "Membuat backend/.env dengan secret acak…"
  .venv/bin/python - <<'PY'
from pathlib import Path
import secrets

example = Path(".env.example").read_text(encoding="utf-8")
example = example.replace(
    "SECRET_KEY=replace-with-64-random-characters-from-secrets-token-urlsafe",
    f"SECRET_KEY={secrets.token_urlsafe(48)}",
)
example = example.replace(
    "DEVICE_API_KEY=replace-with-a-random-device-key-min-24-chars",
    f"DEVICE_API_KEY=fg_{secrets.token_urlsafe(32)}",
)
Path(".env").write_text(example, encoding="utf-8")
PY
  chmod 600 .env
fi

if [[ ! -d "$FRONTEND/node_modules" || "$FRONTEND/package.json" -nt "$FRONTEND/node_modules/.package-lock.json" ]]; then
  log "Memasang dependensi frontend…"
  (cd "$FRONTEND" && npm install --no-audit --no-fund)
fi

if [[ "$MODE" == "--dev" ]]; then
  log "Membangun frontend untuk mode produksi (dipakai sebagai fallback)…"
  (cd "$FRONTEND" && npm run build >/dev/null)
  log "Menjalankan API :8010 dan Vite :5174"
  (cd "$BACKEND" && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload) &
  api_pid=$!
  (cd "$FRONTEND" && npm run dev) &
  vite_pid=$!
  trap 'kill "$api_pid" "$vite_pid" 2>/dev/null' EXIT INT TERM
  wait
  exit 0
fi

log "Membangun frontend…"
(cd "$FRONTEND" && npm run build)

if [[ "$MODE" == "--reload" ]]; then
  log "API + UI: http://127.0.0.1:8010  (auto-reload)"
  exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
fi

log "API + UI: http://127.0.0.1:8010"
log "Dokumentasi API: http://127.0.0.1:8010/docs"
log "Simulator (terminal lain): python3 simulator/device_sim.py"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010

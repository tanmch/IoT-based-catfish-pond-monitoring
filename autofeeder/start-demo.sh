#!/usr/bin/env bash
# Frontend-only presentation runner.
#
#   ./start-demo.sh   build UI with embedded dummy data, serve on :5174
#
# No API server is started and no /api request is made. The normal
# `./start.sh` flow still builds against the real FastAPI backend.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"

log() { printf '\033[1;36m[autofeeder-demo]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[autofeeder-demo]\033[0m %s\n' "$*" >&2; exit 1; }

command -v npm >/dev/null || fail "npm tidak ditemukan (butuh Node.js 20+)."

cd "$FRONTEND"
if [[ ! -d node_modules ]]; then
  log "Memasang dependensi frontend…"
  npm install --no-audit --no-fund
fi

log "Membangun UI dengan data dummy tertanam…"
npm run build:demo

log "Demo frontend: http://127.0.0.1:5174"
log "Mode ini tidak terhubung ke backend/API."
exec npm run preview:demo -- --host 127.0.0.1

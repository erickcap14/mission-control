#!/usr/bin/env bash
#
# MISSION-CONTROL launcher (host device, v0.2).
#
# Brings the host stack up in order: Postgres (Docker) -> migrations ->
# backend -> the host's own collector. Other devices don't run this script;
# they just run `npm run collector` after editing collector.config.json.
#
# Usage: ./start.sh [--no-collector] [--no-open] [-h|--help]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

START_COLLECTOR=1
OPEN_BROWSER=1
DB_CONTAINER="mission-control-db"   # must match container_name in docker-compose.yml

usage() {
  cat <<'EOF'
MISSION-CONTROL launcher (host device)

  ./start.sh                Start Postgres, migrate, backend, and host collector
  ./start.sh --no-collector Skip the host collector (backend + DB only)
  ./start.sh --no-open      Don't open the dashboard in a browser
  ./start.sh --help         Show this help

Other devices: edit collector.config.json (backendUrl, deviceId, deviceKey)
and run `npm run collector` — do NOT run this script on them.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-collector) START_COLLECTOR=0 ;;
    --no-open)      OPEN_BROWSER=0 ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

# --- Prerequisites ----------------------------------------------------------
if ! node --version &>/dev/null; then
  echo "Error: node is not installed or not in PATH" >&2
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "Error: 'docker compose' (Docker v2) is required for the Postgres backend" >&2
  exit 1
fi

# Port: PORT env overrides config.json; falls back to 9000.
PORT="${PORT:-$(node -p "require('./config.json').port || 9000" 2>/dev/null || echo 9000)}"
# Use https when both TLS files are configured; otherwise plain http.
if [ -n "${TLS_CERT_FILE:-}" ] && [ -n "${TLS_KEY_FILE:-}" ]; then
  URL="https://localhost:$PORT"
else
  URL="http://localhost:$PORT"
fi

# --- Secrets ----------------------------------------------------------------
if [ ! -f .env ]; then
  echo "No .env found — creating one from .env.example"
  cp .env.example .env
  echo "⚠️  Edit .env and set DASHBOARD_PASSWORD before exposing this on the LAN."
fi

# --- Dependencies -----------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# --- Already running? -------------------------------------------------------
if lsof -ti tcp:"$PORT" &>/dev/null; then
  echo "Port $PORT already in use — opening existing instance"
  [ "$OPEN_BROWSER" -eq 1 ] && open "$URL"
  exit 0
fi

# --- Postgres ---------------------------------------------------------------
echo "Starting Postgres (docker compose up -d)..."
docker compose up -d

echo -n "Waiting for Postgres to be healthy"
for i in {1..60}; do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo starting)"
  if [ "$status" = "healthy" ]; then
    echo " ✓"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo " ✗"
    echo "Error: Postgres did not become healthy in time. Check 'docker compose logs'." >&2
    exit 1
  fi
  echo -n "."
  sleep 1
done

# --- Migrations -------------------------------------------------------------
echo "Applying database schema (npm run db:migrate)..."
npm run db:migrate

# --- Backend ----------------------------------------------------------------
echo "Starting Mission Control backend on $URL"
node server.js &
SERVER_PID=$!

COLLECTOR_PID=""
cleanup() {
  [ -n "$COLLECTOR_PID" ] && kill "$COLLECTOR_PID" 2>/dev/null || true
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for the backend to accept connections.
for i in {1..40}; do
  if curl -s -o /dev/null "$URL"; then
    break
  fi
  sleep 0.25
done

# --- Host collector (optional) ---------------------------------------------
if [ "$START_COLLECTOR" -eq 1 ]; then
  if [ -f collector.config.json ]; then
    echo "Starting host collector (npm run collector)..."
    npm run collector &
    COLLECTOR_PID=$!
  else
    echo "⚠️  No collector.config.json — skipping host collector."
    echo "    Register this device first:"
    echo "      npm run register-device -- --id host --name \"Host\" --host"
    echo "    then create collector.config.json (see collector.config.example.json)."
  fi
fi

[ "$OPEN_BROWSER" -eq 1 ] && open "$URL"

echo "Backend PID $SERVER_PID${COLLECTOR_PID:+, collector PID $COLLECTOR_PID} — press Ctrl+C to stop"
echo "(Postgres keeps running in the background; stop it with 'docker compose down')"
wait "$SERVER_PID"

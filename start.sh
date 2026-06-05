#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=9000
URL="http://localhost:$PORT"

cd "$SCRIPT_DIR"

if ! node --version &>/dev/null; then
  echo "Error: node is not installed or not in PATH" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if lsof -ti tcp:"$PORT" &>/dev/null; then
  echo "Port $PORT already in use — opening existing instance"
  open "$URL"
  exit 0
fi

echo "Starting Mission Control on $URL"
node server.js &
SERVER_PID=$!

# Wait for server to accept connections
for i in {1..20}; do
  if curl -s -o /dev/null "$URL"; then
    break
  fi
  sleep 0.25
done

open "$URL"

echo "Server PID $SERVER_PID — press Ctrl+C to stop"
wait "$SERVER_PID"

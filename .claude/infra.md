# Infrastructure Blueprint — MISSION-CONTROL

Purpose: Runtime environment, tech stack, coding conventions, and data architecture.

---

## What We're Building

- **Programming Language:** JavaScript (Node.js ESM)
- **Main Framework/Tool:** Express 4.x (backend), PostgreSQL (storage), React 18 via CDN (frontend)
- **Quick Summary:** A LAN-shared analytics dashboard. One host runs the Express backend + PostgreSQL; per-device collectors push Claude Code session data to it; any device on the LAN views the aggregated UI on port 9000.

---

## How to Run it (host device)

1. **Install:** `npm install`
2. **Secrets:** `cp .env.example .env`, then set `DATABASE_URL` and `DASHBOARD_PASSWORD`
3. **Database:** `docker compose up -d` (starts local PostgreSQL), then `npm run db:migrate`
4. **Register devices:** `npm run register-device -- --id host --name "Host" --host` (repeat per device, without `--host`). Copy each printed key into that device's `collector.config.json`.
5. **Start backend:** `npm start` (listens on `0.0.0.0:9000`; `PORT` env overrides the config port)
6. **Start the host's own collector:** `npm run collector`

## How to Run it (every other device)

1. Clone the repo, `npm install`
2. `cp collector.config.example.json collector.config.json` and set `backendUrl` to `http://<host-ip>:9000`, plus this device's `deviceId`/`deviceKey`
3. `npm run collector`

- **Dashboard Address (any LAN device):** `http://<host-ip>:9000` (login with `DASHBOARD_PASSWORD`)

---

## Project Architecture

```
mission-control/
  server.js              # Express server + all API route handlers
  config.json            # Runtime configuration (scanPath, port, pricing, timeSavedMultiplier)
  package.json           # ESM module, npm metadata
  lib/
    projectDiscovery.js  # Recursively scans scanPath for dirs containing .claude/
    sessionParser.js     # Streams a .jsonl file → session object (tokens, tools, timing)
    costCalculator.js    # Pricing tables + cost/time-saved calculations
    sessionManager.js    # Mtime-based cache + project/session aggregation
  public/
    index.html           # Single HTML file: CSS + CDN React imports
    app.js               # React 18 app via React.createElement (no JSX, no build step)
```

New in v0.2 (backend/collector):
```
  server.js              # Express backend: ingest + Postgres-backed reads + auth + SSE
  collector.js           # Per-device agent: reads local ~/.claude, pushes to backend
  db/schema.sql          # PostgreSQL schema (devices, sessions, session_meta)
  docker-compose.yml     # Local PostgreSQL for the host
  lib/
    db.js                # pg Pool wrapper (upsert/read/meta)
    auth.js              # device-key + dashboard-cookie auth (Node crypto only)
    env.js               # minimal .env loader (no dependency)
  scripts/
    migrate.js           # apply db/schema.sql
    register-device.js   # register a device, print its key once
  collector.config.json  # per-device: backendUrl, deviceId, deviceKey (git-ignored)
```

**Important constraints:**
- No build step — frontend is loaded directly from `public/` as static files
- No JSX — use `React.createElement` in `app.js`
- No frontend bundler (webpack/vite/etc.) — keep it zero-dependency for the frontend
- Node.js native `readline` for streaming JSONL (no external JSON stream library)
- Backend dependencies kept minimal: `pg` is the only addition; auth/cookies/env use Node's built-in `crypto`/`fs` (no `bcrypt`, `express-session`, or `dotenv`)

---

## Code Generation Style Guide

- **Variable/function naming:** `camelCase`
- **File naming:** `camelCase.js`
- **Constants:** `UPPER_SNAKE_CASE`
- **Modules:** ESM (`import`/`export`) — the package is `"type": "module"`
- **Async pattern:** `async/await` throughout; avoid callback style
- **Error handling:** All API routes have try/catch with `errorResponse()` helper
- **Comments:** Only where behavior is non-obvious (don't narrate the code)

---

## Where it Lives

- **Hosting:** One host machine on your LAN. No public-internet/cloud deployment — the listener is reachable only by devices on the same network.
- **Processes:** the Express backend (`node server.js`) + a PostgreSQL container (Docker) on the host; a `node collector.js` process on each device.
- **Port:** backend on `0.0.0.0:9000` (config `port`, overridable by `PORT` env); PostgreSQL on `5432` (host-local, per `docker-compose.yml`).

---

## Where Data Lives

- **Source of truth:** PostgreSQL on the host (survives restarts).
  - `devices` — id, display name, scrypt-hashed key, `is_host` flag, last_seen
  - `sessions` — PK `(device_id, session_id)`; full session object in `data JSONB` + promoted `project_path/model/cost/start_time/end_time` columns
  - `session_meta` — user status/summary edits, kept separate so re-ingestion never clobbers them
- **Upstream raw data:** each device's `~/.claude/projects/<encoded-path>/*.jsonl` (read-only) — collectors parse these and push to the backend.
- **Configuration:** shared `config.json` (pricing/plan, written by `PUT /api/config`); secrets in `.env` (`DATABASE_URL`, `DASHBOARD_PASSWORD`, optional `SESSION_SECRET`); per-device `collector.config.json`.
- **Cache:** the collector keeps an mtime/fingerprint map to push only changed sessions; the backend reads live from Postgres.

**Schema — Session object:**
```js
{
  id: string,             // JSONL filename without extension
  model: string,          // e.g., "claude-sonnet-4-6"
  tokens: {
    input: number,
    output: number,
    cacheRead: number,
    cacheWrite: number
  },
  cost: number,           // USD
  costBreakdown: { input, output, cacheRead, cacheWrite },
  duration: number,       // milliseconds
  turnCount: number,      // user message count
  toolCalls: [{ name: string, count: number }],
  startTime: Date,
  endTime: Date,
  summary: string,        // auto-generated or user-edited (session_meta wins on read)
  subagentCount: number,
  subagentModels: { [modelKey]: number },
  projectPath: string,    // real filesystem path of the project
  status: string | null,  // "wip" | "complete" | null (from session_meta)
  device: string          // owning device id (added by the backend on read)
}
```

**Schema — Config (`config.json`):**
```json
{
  "scanPath": "~/Documents",
  "claudeDir": "~/.claude",
  "port": 9000,
  "timeSavedMultiplier": 2.5,
  "pricing": {
    "claude-sonnet-4-6": { "input": 3, "output": 15, "cacheRead": 0.30, "cacheWrite": 3.75 }
  }
}
```
Pricing keys must be full model IDs (e.g., `claude-sonnet-4-6`), not short names.

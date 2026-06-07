# Product Requirements Document — MISSION-CONTROL

Purpose: This document defines what MISSION-CONTROL is, who it's for, and what it does. It is derived from the ACC 2026 baseline codebase.

---

## 1. The Big Picture

- **Project Name:** MISSION-CONTROL
- **One-Sentence Summary:** A LAN-shared analytics dashboard that aggregates Claude Code usage from every device on your local network into one persistent backend, giving a real-time, per-device view of usage, costs, and productivity metrics.
- **Who is this for:** Developers using Claude Code across more than one machine (e.g., a laptop and a desktop) on the same network who want a single, persistent dashboard of their session history, token spend, and time-saving estimates — without sending anything to the public internet.
- **What this app will NOT do:**
  - Modify or control Claude Code's behavior or settings
  - Expose data to the public internet or any third-party cloud service (it is LAN-only)
  - Replace Claude Code's built-in chat UI
  - Support arbitrary multi-tenant team accounts (it is single-owner; the dashboard is gated by one shared password)

> **Architecture change (v0.2):** MISSION-CONTROL was originally a strictly single-machine, in-memory, file-reading app. It is now a **LAN-shared, persistent, multi-device** system: one host device runs the backend + PostgreSQL; every device runs a lightweight collector that pushes its local session data to the host; any device on the LAN can view the aggregated data, filterable by device, after logging in. This intentionally supersedes the earlier "local machine only / no auth / single user" constraints.

---

## 2. The Features

### Core (Implemented in Baseline)

**Story 1 — Project Overview**
As a developer, I want to see all my Claude Code projects and their aggregate stats so I can quickly understand which projects I'm spending the most on.
- Lists all discovered projects (scanned from `scanPath` in config)
- Per-project: session count, total cost, total tokens, total duration, model breakdown

**Story 2 — Session List**
As a developer, I want to browse all sessions across all projects (or filtered by project) so I can review what I worked on.
- Full session table with columns: Date, Summary, Model, Tokens, Cost, Duration, Status
- All-projects view or per-project filter via sidebar
- Sortable columns (Date, Tokens, Cost, Duration)
- Search by session summary or session ID

**Story 3 — Cost Tracking**
As a developer, I want to see how much I'm spending per session and in total so I can manage my budget.
- Per-session cost computed from token counts × model pricing
- Cost breakdown by token type (input, output, cache read, cache write)
- Global total cost shown in the top bar
- Pricing configurable per model in `config.json`
- Supported models: claude-opus-4-8/4-6, claude-sonnet-4-6/4-5, claude-haiku-4-5/3-5

**Story 4 — Time Saved Estimate**
As a developer, I want an estimate of how much time I saved using Claude so I can justify the cost.
- Time saved = session duration × `timeSavedMultiplier` (default: 2.5×)
- Shown globally in top bar as hours saved
- Configurable multiplier via `PUT /api/config`

**Story 5 — Real-Time Updates**
As a developer, I want the dashboard to reflect active sessions without manual refresh so I can see live cost accumulation.
- The per-device collector watches `~/.claude/projects/**/*.jsonl` (chokidar) and pushes changed sessions to the backend
- The backend emits a Server-Sent Event on every ingest; all connected dashboards refresh
- Frontend also polls every 5 seconds as a fallback

**Story 11 — Multi-Device Aggregation & Persistence (v0.2)**
As a developer working from multiple machines, I want all my devices' usage stored centrally and persistently so I see one combined picture that survives restarts.
- Each device runs a collector (`collector.js`) that reads its local `~/.claude` files and pushes them to the host backend, tagged with a device id
- Backend persists everything in PostgreSQL (`sessions`, `session_meta`, `devices`) — data survives server restarts
- Dashboard has a **device filter** (All / per-device); every read endpoint accepts `?device=<id>`
- `GET /api/devices` lists registered devices with session counts

**Story 12 — Access Control (v0.2)**
As the owner, I want the backend secured since it listens on the LAN, so others on the network can't read or write my data.
- Per-device API keys (hashed at rest) authenticate collector pushes to `/api/ingest/*`
- A shared dashboard password (via `POST /api/login`) gates the dashboard and all read APIs with a signed, HttpOnly cookie
- `scripts/register-device.js` registers a device and prints its key once

**Story 6 — Daily & Monthly Stats**
As a developer, I want to see cost and token breakdowns over time so I can spot trends.
- `GET /api/daily-stats` — cost and token counts grouped by date (YYYY-MM-DD)
- `GET /api/monthly-stats` — cost and token counts grouped by month (YYYY-MM)

**Story 7 — Session Metadata**
As a developer, I want to mark sessions as WIP or complete and edit their summaries so I can organize my work history.
- `PUT /api/sessions/:id/status` — set status to `wip`, `complete`, or null
- `PUT /api/sessions/:id/summary` — edit the human-readable summary
- Edits are persisted in the `session_meta` table and survive re-ingestion of the underlying session

**Story 8 — Ghostty Session Restore (macOS)**
As a macOS developer using Ghostty terminal, I want to resume a past session with one click so I can continue where I left off.
- `POST /api/restore/:id` — launches Ghostty via AppleScript and runs `claude --resume <session-id>` in the project directory

**Story 9 — Subagent Tracking**
As a developer, I want to know how many subagents were spawned in a session so I can understand multi-agent usage and cost.
- `subagentCount` and `subagentModels` fields parsed from sidechain events in JSONL
- Shown in session detail response

**Story 10 — Auto-Generated Session Summaries**
As a developer, I want sessions to have readable summaries even when I haven't written one, so the session list is browsable.
- Rule-based summary generated from tool call patterns (e.g., "Implemented feature in codebase", "Researched topic online")
- Falls back gracefully to turn count and token count

---

## 3. The Look and Feel

- **Overall Style:** Dark, terminal-inspired. Minimal. No rounded corners, no gradients. Looks like a mission control monitor.
- **Font:** IBM Plex Mono throughout
- **Color Palette:**
  - Background: `#0a0e27` (deep navy)
  - Panel: `#0f1229` / `#151a33`
  - Border: `#1a1f3a`
  - Accent/positive: `#00d966` (green)
  - Cost/warning: `#ffaa00` (amber)
  - Muted text: `#888` / `#666`

**Key Screens:**

**Screen 1 — Main Dashboard**
- Top bar: Projects count | Sessions count | Total Cost | Time Saved
- Left sidebar: "All Projects" + per-project list with session counts
- Main content: Search bar + sortable session table
- Table columns: Date | Summary | Model | Tokens | Cost | Duration | Status dot

**Screen 2 — Charts Panel (planned, not yet in frontend)**
- Collapsible panel above or below the session table
- Daily cost bar chart
- Monthly cost trend line
- Model distribution (Opus / Sonnet / Haiku breakdown)

---

## 4. Technical Architecture

- **Runtime:** Node.js (ESM modules, `"type": "module"`)
- **Backend:** Express 4.x on the host device, bound to `0.0.0.0:9000` (LAN-reachable). `PORT` env overrides the config port.
- **Database:** PostgreSQL (run locally on the host via Docker Compose). Tables: `devices`, `sessions` (full session object in `JSONB` + promoted columns), `session_meta`.
- **Collector:** `collector.js` runs on each device — reuses `sessionParser`/`sessionManager` + chokidar to read local `~/.claude` files and pushes deltas to `POST /api/ingest/sessions`.
- **Frontend:** React 18 (CDN UMD build), no build step, vanilla CSS in `public/index.html`. API base is relative so it works from any LAN device.
- **Auth:** device API keys (scrypt-hashed) for ingest; shared dashboard password + HMAC-signed HttpOnly cookie for reads. Built on Node's `crypto` (no extra auth dependency).
- **Source of truth:** PostgreSQL. Per-device `~/.claude/*.jsonl` files remain the upstream raw data that collectors read.
- **Config:** shared policy (pricing, plan limits) in `config.json`; secrets in `.env` (`DATABASE_URL`, `DASHBOARD_PASSWORD`); per-device settings in `collector.config.json` (git-ignored).

**Directory Layout (baseline):**
```
mission-control/
  server.js           # Express server + all API routes
  config.json         # Runtime configuration
  package.json        # npm metadata
  lib/
    projectDiscovery.js  # Scans scanPath for .claude/ directories
    sessionParser.js     # Parses JSONL → session object
    costCalculator.js    # Token pricing calculations
    sessionManager.js    # Cache + aggregation layer
  public/
    index.html           # Shell HTML + CSS, loads React from CDN
    app.js               # React App component (React.createElement)
```

**Config Options (`config.json`):**
| Field | Default | Description |
|-------|---------|-------------|
| `scanPath` | `~/Documents` | Root directory to scan for projects |
| `claudeDir` | `~/.claude` | Claude Code data directory |
| `port` | `9000` | HTTP port |
| `timeSavedMultiplier` | `2.5` | Efficiency multiplier for time-saved calc |
| `pricing` | (see below) | Per-model token pricing in $/M tokens |

**Model Pricing Defaults ($/M tokens):**
| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|-----------|-------------|
| claude-opus-4-x | $15 | $75 | $1.50 | $18.75 |
| claude-sonnet-4-x | $3 | $15 | $0.30 | $3.75 |
| claude-haiku-4-x | $0.80 | $4 | $0.08 | $1.00 |

---

## 5. Known Gaps & Planned Work

See `tasks.md` for the full prioritized backlog.

High-priority gaps:
1. **Metadata persistence** — session status and summary edits are lost on server restart
2. **Active session detection** — `GET /api/active` returns empty (no implementation)
3. **Charts in frontend** — API endpoints exist but frontend has no chart rendering yet
4. **SSE for live push** — frontend polls every 5s; Server-Sent Events would be more efficient

---

## 6. Out of Scope (v0.2)

- Public-internet / cross-network access (LAN-only by design; expose via VPN/Tailscale at your own risk)
- Multi-tenant team accounts with per-user data isolation (single-owner, one shared dashboard password)
- Per-device toolkit scanning — `GET /api/toolkit` reflects the host device only
- Cross-device session restore — `POST /api/restore/:id` works only for sessions owned by the host
- CI/CD integration
- Support for non-Claude AI tools

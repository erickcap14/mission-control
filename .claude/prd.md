# Product Requirements Document — MISSION-CONTROL

Purpose: This document defines what MISSION-CONTROL is, who it's for, and what it does. It is derived from the ACC 2026 baseline codebase.

---

## 1. The Big Picture

- **Project Name:** MISSION-CONTROL
- **One-Sentence Summary:** A local analytics dashboard that reads Claude Code session files and gives developers a real-time view of their usage, costs, and productivity metrics.
- **Who is this for:** Developers using Claude Code daily who want visibility into their session history, token spend, and time-saving estimates — without leaving their local machine.
- **What this app will NOT do:**
  - Modify or control Claude Code's behavior or settings
  - Send any data to the cloud or external services
  - Replace Claude Code's built-in chat UI
  - Require authentication or user accounts
  - Support multiple users or shared team views

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
- File watcher (chokidar) monitors `~/.claude/projects/**/*.jsonl`
- Cache invalidated on file add/change/delete
- Frontend polls every 5 seconds for fresh data

**Story 6 — Daily & Monthly Stats**
As a developer, I want to see cost and token breakdowns over time so I can spot trends.
- `GET /api/daily-stats` — cost and token counts grouped by date (YYYY-MM-DD)
- `GET /api/monthly-stats` — cost and token counts grouped by month (YYYY-MM)

**Story 7 — Session Metadata**
As a developer, I want to mark sessions as WIP or complete and edit their summaries so I can organize my work history.
- `PUT /api/sessions/:id/status` — set status to `wip`, `complete`, or null
- `PUT /api/sessions/:id/summary` — edit the human-readable summary
- Note: persistence to disk is not yet implemented (in-memory only)

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
- **Server:** Express 4.x, port 9000 by default
- **Frontend:** React 18 (CDN UMD build), no build step, vanilla CSS in `public/index.html`
- **Data source:** `~/.claude/projects/<encoded-path>/*.jsonl` — Claude Code's native session storage
- **File watching:** chokidar with polling for cross-platform compatibility
- **Caching:** mtime-based in-memory cache (`Map`), per session file and per project
- **Config file:** `config.json` at project root

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

## 6. Out of Scope (v0.1)

- Cloud sync or remote access
- Multi-user / team sharing
- CI/CD integration
- Billing alerts / budget limits (future)
- Support for non-Claude AI tools

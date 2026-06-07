# Changelog

Purpose: This file is a running log that tracks all notable changes, new features, and workflow updates for the project over time.
It also serves as a record of **completed beads issues** and significant workflow milestones.

> The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),  
> and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Version Numbering Rules

We follow **Semantic Versioning (SemVer)** for all projects:

- **MAJOR (X.0.0):** Incompatible or breaking workflow or API changes.
- **MINOR (0.X.0):** New features, plan types, or template enhancements added in a backwards-compatible way.
- **PATCH (0.0.X):** Bug fixes, template corrections, or workflow refinements that don’t break existing functionality.

> For student or prototype projects:
>
> - Use **0.x.x** versions while iterating (pre-1.0).
> - Bump to **1.0.0** only when the core features are stable and production-ready.

---

## Issue Completion Logging

Significant beads issues should be recorded in the changelog when completed. Use this format:

---

### Issue Completion Entry Example

**Issue:** `AES-42`
**Type:** `feature`
**Status:** `closed`
**Summary:** Implemented secure login and registration flow with Firebase Auth.
**Commit Reference:** `feat: add login flow (Closes: AES-42)`
**Date:** 2025-10-24

---

This ensures transparency and traceability for all AI-executed workflows.

---

## [0.1.1] - 2026-06-05

### Added
- Full application build: `server.js`, `lib/`, `public/` created from scratch
- All 15+ REST API endpoints + SSE `/api/events`
- React 18 frontend: session table, sortable columns, sidebar project filter, search
- SVG bar charts (daily/monthly cost) — no charting library
- Session detail modal with cost/token breakdown and inline edit
- Metadata persistence: status/summary stored in `~/.claude/mission-control-meta/<id>.json` (MC-01, MC-02)
- Active session detection via JSONL mtime < 60s (MC-03)
- SSE live push from chokidar file watcher + 5s polling fallback (MC-05)
- CSV export (client-side, current filter/sort state) (MC-10)
- Keyboard shortcuts: `j`/`k` navigate rows, `/` focus search, `Esc` close modal (MC-13)
- Health endpoint: `GET /health` returns version, uptimeSeconds, sessionCount (MC-14)
- AppleScript session restore with input validation + path escaping (MC-15)
- 9 Playwright screenshots in `screenshots/`

### Fixed
- Path encoding bug: Claude Code encodes `/` AND `_` as `-`; `encodeProjectPath` now handles both
- Duration display: `fmtDuration` was treating milliseconds as seconds
- AppleScript shell injection: UUID validation + null byte/traversal rejection

### Commit
`997af1d` — feat: build MISSION-CONTROL v0.1.1

---

## [Unreleased]

### Added
- **LAN-shared persistent multi-device backend** (`mission_control-yyi`) — MISSION-CONTROL moved from a strictly single-machine, in-memory, file-reading app to a LAN-shared, **PostgreSQL-backed**, multi-device system. One host runs the Express backend + Postgres; every device runs a new **collector** (`collector.js`) that reads its local `~/.claude` files (reusing `sessionParser`/`sessionManager`) and pushes changed sessions to `POST /api/ingest/sessions`. All read endpoints now query Postgres (`lib/db.js`) and accept a `?device=<id>` filter; the aggregation logic in `server.js` (daily/monthly/usage windows) was preserved verbatim by reconstructing the original session-object shape from a `JSONB` column. New: `db/schema.sql` (`devices`, `sessions`, `session_meta`), `docker-compose.yml` (local Postgres), `lib/env.js` (dependency-free `.env` loader), `scripts/migrate.js`, `scripts/register-device.js`, `GET /api/devices`. Backend binds `0.0.0.0:9000` (LAN) with a `PORT` env override. Only new runtime dependency: `pg`.
  - **Auth** (`mission_control-ip6`) — device API keys (scrypt-hashed, sent as `Authorization: Bearer` + `X-Device-Id`) guard ingest; a shared `DASHBOARD_PASSWORD` + HMAC-signed HttpOnly cookie (`POST /api/login`) guards all reads and the SSE stream. Built entirely on Node's `crypto` (no `bcrypt`/`express-session`/`dotenv`). `POST /api/restore/:id` is now host-only.
  - **Frontend** (`mission_control-59i`) — relative API base so the dashboard works from any LAN device; login screen on 401; a top-bar **device filter** (All / per-device) that re-queries with `?device=`; a new **Device** column; logout button. Session status/summary edits now send the owning `device`.
  - **Session metadata persistence** — status/summary now live in the `session_meta` table (keyed by device+session) and survive re-ingestion; replaces the in-memory/sidecar approach. (Fixes a `setMeta` placeholder-misalignment bug found in verification where a summary-only update wrote `NULL`.)
  - **Docs harmonized** (`mission_control-uq6`) — `prd.md`, `infra.md`, `security.md`, `sbom.md` updated to the LAN multi-device + auth model, superseding the earlier "local machine only / no auth / single user" constraints per the Conflict Resolution Matrix.
- **Token-limit bars on usage dashboard** (`mission_control-hi6`) — replaced the "this month vs monthly budget" red cost bar with a new **Token Limits** card showing two bars: weekly and 5-hour token usage vs configurable caps. Each bar shows `used / limit`, a remaining figure (or "over by X"), reset countdown, and green→orange→red color by percent. New config fields `plan.weeklyTokenLimit`, `plan.fiveHourTokenLimit` (total incl. cache; placeholder defaults — tune to your plan), and `plan.weeklyResetWeekday` (0=Sun…1=Mon). `server.js` `/api/usage-stats` now returns a `weeklyWindow` object (fixed weekly reset anchored to `weeklyResetWeekday`) and passes the token limits through `plan`. `fmtCount` gained a billions (`B`) tier.
- **Sessions page pagination** (`mission_control-hi6`) — the sessions table now renders 20 rows initially with a "Show more (showing X of N)" button that reveals 20 more per click; `j`-key navigation auto-reveals hidden rows; pagination resets to 20 when search/project/sort changes.
- **Calibrated token caps from `/usage`** — set real caps by back-calculating from the live `/usage` panel (`cap = tokens_used ÷ percent`): `weeklyTokenLimit` 3.6B (501M used ≈ 14%), `fiveHourTokenLimit` 275M (225M used ≈ 82%). Realigned the weekly window to Anthropic's actual reset (Thursday 10am ET): `weeklyResetWeekday` 1→4 and new `weeklyResetHour` config; `server.js` weekly-window logic now honors `weeklyResetHour` (rolls back a week if the reset hour hasn't passed today). Dashboard now matches `/usage` within ~1%.
- `start.sh` (`mission_control-wk2`) — host launcher rewritten for the v0.2 multi-device stack: ensures `.env` exists (copies from `.env.example` + warns to set `DASHBOARD_PASSWORD`), checks for `docker compose`, brings up Postgres and waits for the container healthcheck, runs `npm run db:migrate`, starts the backend, and (by default) the host collector — skipped with a registration hint when `collector.config.json` is absent. Reads the port from `config.json` (`PORT` env overrides), still short-circuits to the existing instance if the port is in use, traps Ctrl+C to stop both backend and collector, and supports `--no-collector` / `--no-open` / `--help`. Postgres is left running on exit.
- `missioncontrol` zsh alias in `~/.zshrc` pointing to `start.sh` (unchanged — the alias path/name is stable; it now drives the v0.2 flow automatically)
- `.claude/settings.json`: added `Stop` hook for unpushed-commit warning; added `permissions.allow` allowlist for common Bash/MCP/Read patterns to reduce permission prompts
- **Toolkit tab** (`mission_control-km7`) — new nav tab that surfaces the user's full Claude Code toolkit across all projects: `lib/toolkitScanner.js` module + `GET /api/toolkit` endpoint + `ToolkitPanel` React component with three sections: skills & commands (deduplicated across all projects under `scanPath`), installed plugins (from `~/.claude/plugins/installed_plugins.json`), and global settings (`~/.claude/settings.json` displayed as formatted JSON)
- **Type and Uses columns in Toolkit** — Type badge (`skill` in green, `hook` in amber) distinguishes slash commands from automated hook triggers; Uses column shows real invocation count derived from scanning `<command-name>` tags in all 159 JSONL session files; hooks from `~/.claude/settings.json` and project `settings.json` files are included as rows with type "hook" and uses "—"
- **Toolkit description tooltips** — hovering over a truncated description in the skills or MCP servers table shows the full text in a styled tooltip; implemented via CSS `.tooltip-wrap`/`.tooltip-box` with `position: absolute` to avoid overflow clipping
- **Monthly billing period** — usage dashboard switched from artificial weekly bucketing (`$20 ÷ 4.33`) to a true monthly period anchored to `billingAnchorDay` in config.json (defaults to 1); all labels updated from "weekly" → "monthly"; `server.js` `/api/usage-stats` now exposes `monthlyBudget` and `periodLabel: 'monthly'`; user should update `billingAnchorDay` to their actual Anthropic subscription renewal day once confirmed
- **Daily cost chart visible by default** — `showCharts` state initializes to `true`; charts panel renders immediately on load without requiring the toggle; fixed stale "This Week" label to "This Month" in usage dashboard daily breakdown chart
- **Per-project cost in sidebar** — each sidebar project item now shows total cost in amber (`$X.XX`) above the session count; "All Projects" row shows global total cost from `/api/stats`; uses new `.project-meta` / `.project-cost` CSS classes

### Fixed
- **Sidebar project cost mismatch** — `refreshData` now includes `fetchProjects()` alongside `fetchStats()` and `fetchSessions()`; previously, sidebar project costs were only fetched once at mount and grew stale while the header recalculated from live-refreshed session data every 5 seconds

---

### Issue Completion

**Issue:** `mission_control-15l`
**Type:** `bug`
**Status:** `closed`
**Summary:** Fixed usage stats reset schedule — replaced monthly billing logic with Claude Code Pro's actual weekly (Mon–Mon) + 5-hour rolling window model.
**Commit Reference:** `a860d0f` — fix: weekly + 5-hour rolling window usage stats
**Date:** 2026-06-05

#### Details
- `config.json`: removed `billingDay`/`monthlyCostLimit`, added `subscriptionCostPerMonth` and `weeklyResetDay: 1`
- `server.js` `/api/usage-stats`: weekly period anchored to Monday; 5-hour rolling window anchored to oldest session start in last 5h; `weeklyBudget` derived as `subscriptionCostPerMonth / 4.33`; `fiveHourWindow` object in response with countdown and stats
- `public/app.js` `UsageDashboard`: new 5-hour window card (active/inactive states, time-of-day range); labels updated from "month/period" to "week"; progress bar compares against `weeklyBudget`; projection text uses weekly budget threshold

---

**Issue:** `mission_control-onh`
**Type:** `feature`
**Status:** `closed`
**Summary:** Completed Usage Dashboard frontend — `UsageDashboard` React component, `view`/`usageStats` state, dynamic top bar with per-project stats and Tokens column.
**Date:** 2026-06-05

#### Details
- `UsageDashboard` component: billing period card (plan name, progress bar, burn rate projection, metrics row, reset countdown), overage card, token breakdown grid, model breakdown table with % bars, daily cost bar chart
- `view` state (`'sessions' | 'usage'`) with lazy fetch of `/api/usage-stats` on first switch
- Top bar now dynamic: shows per-project cost/sessions when a project is selected; added Tokens stat (formatted with K/M suffix via `fmtCount`)



### Changed

- Migrated from `.claude/implementation/` and `features.json` to beads (`bd`) for issue tracking.
- Updated `workflow.md` to use beads CLI commands for planning, execution, and status management.
- Clarified changelog role in tracking **issue completions** and **workflow milestones**.

### Added

- Introduced beads (`bd`) for centralized issue tracking with priorities, dependencies, and labels.
- Added branching strategy and PR workflow documentation to `workflow.md`.
- Enhanced multi-agent coordination with `--actor` and `--assignee` flags.

### Deprecated

- Removed `.claude/implementation/` directory structure — now handled by beads.

---

## [0.1.1] - 2025-09-15

### Added

- Introduced initial autonomous workflow logic:
  - Beads (`bd`) CLI for issue tracking
  - Issue types: bug, feature, task, epic, chore
  - Status management: open, in_progress, blocked, deferred, closed
- Updated `workflow.md` and `claude.md` to define issue-based planning and execution.

### Changed

- Revised `tests.md` to support automatic test execution after each feature step.
- Added changelog integration rules for issue completions.

---

## [0.1.0] - 2025-08-31

### Added

- Created initial set of Markdown context files (`claude.md`, `prd.md`, `infra.md`, `workflow.md`, `security.md`, `sbom.md`, `tests.md`).
- Added `changelog.md` to track project history.
- Added `first_prompt.md` as interactive setup guide for template population.
- Defined examples for both local Python applications and Next.js + Supabase applications to guide new students.

### Notes

- This is the first structured version of the project templates.
- Future releases will focus on workflow automation, changelog integration, and feature-based plan versioning.

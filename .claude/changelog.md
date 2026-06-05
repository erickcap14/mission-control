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
- `start.sh` — shell startup script that checks for node, installs deps if missing, detects if port 9000 is already in use (opens existing instance instead of starting a second), starts the server, waits for it to be ready, and opens `http://localhost:9000` in the browser
- `missioncontrol` zsh alias in `~/.zshrc` pointing to `start.sh`
- `.claude/settings.json`: added `Stop` hook for unpushed-commit warning; added `permissions.allow` allowlist for common Bash/MCP/Read patterns to reduce permission prompts
- **Toolkit tab** (`mission_control-km7`) — new nav tab that surfaces the user's full Claude Code toolkit across all projects: `lib/toolkitScanner.js` module + `GET /api/toolkit` endpoint + `ToolkitPanel` React component with three sections: skills & commands (deduplicated across all projects under `scanPath`), installed plugins (from `~/.claude/plugins/installed_plugins.json`), and global settings (`~/.claude/settings.json` displayed as formatted JSON)
- **Type and Uses columns in Toolkit** — Type badge (`skill` in green, `hook` in amber) distinguishes slash commands from automated hook triggers; Uses column shows real invocation count derived from scanning `<command-name>` tags in all 159 JSONL session files; hooks from `~/.claude/settings.json` and project `settings.json` files are included as rows with type "hook" and uses "—"
- **Toolkit description tooltips** — hovering over a truncated description in the skills or MCP servers table shows the full text in a styled tooltip; implemented via CSS `.tooltip-wrap`/`.tooltip-box` with `position: absolute` to avoid overflow clipping

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

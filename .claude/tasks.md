# MISSION-CONTROL Task Backlog

Purpose: Prioritized list of work to implement. Derived from code TODOs, API gaps, and product gaps identified in the ACC baseline.

Status key: `[ ]` open · `[~]` in progress · `[x]` done

---

## P0 — Critical / Blocking

None currently.

---

## P1 — High Priority (Core Functionality Gaps)

### [MC-01] Persist session status to disk
**Type:** feature  
**Source:** `server.js:559` — TODO comment, in-memory only  
**What:** When a user marks a session as `wip` or `complete` via `PUT /api/sessions/:id/status`, the value is stored in memory only and lost on server restart.  
**Acceptance Criteria:**
- Status is written to a sidecar file (e.g., `~/.claude/mission-control-meta/<session-id>.json`) or appended to the JSONL
- Survives a server restart
- `GET /api/wip` returns correctly after restart

---

### [MC-02] Persist session summary edits to disk
**Type:** feature  
**Source:** `server.js:591` — TODO comment, in-memory only  
**What:** `PUT /api/sessions/:id/summary` edits are lost on restart.  
**Acceptance Criteria:**
- Summary stored in same sidecar store as status (MC-01)
- Retrieved on next load of the same session
- Overrides auto-generated summary when present

---

### [MC-03] Implement active session detection (`GET /api/active`)
**Type:** feature  
**Source:** `server.js:516-520`, `API.md` TODOs  
**What:** Endpoint returns `[]` always. Need to detect Claude Code processes that are currently running.  
**Options:**
1. Check for lock files in `~/.claude/projects/*/`
2. Scan running processes for `claude` CLI using `ps aux`
3. Watch for JSONL files modified within the last N seconds  
**Acceptance Criteria:**
- Returns list of sessions whose JSONL was modified in the last 60 seconds
- Frontend shows active indicator for these sessions in the table

---

### [MC-04] Implement charts in frontend
**Type:** feature  
**Source:** `index.html` has `.charts-container` CSS but frontend `app.js` has no chart rendering  
**What:** The daily and monthly stats APIs exist (`/api/daily-stats`, `/api/monthly-stats`) but nothing renders them.  
**Acceptance Criteria:**
- Daily cost bar chart (last 30 days)
- Monthly cost trend line (last 12 months)
- Collapsible panel above the session table
- Pure SVG or canvas — no charting library dependency (keep it CDN-free)

---

## P2 — Medium Priority (Quality of Life)

### [MC-05] Server-Sent Events (SSE) for live push
**Type:** enhancement  
**What:** Replace 5-second frontend polling with SSE push from the file watcher. The watcher (`changeEmitter`) already emits events — they just need to be forwarded to connected clients.  
**Acceptance Criteria:**
- `GET /api/events` SSE endpoint
- File watcher emits to SSE stream
- Frontend subscribes via `EventSource` and triggers re-fetch
- Falls back to polling if SSE connection drops

---

### [MC-06] Session detail modal / drawer
**Type:** feature  
**What:** Clicking a session row in the table shows a detail view with full cost breakdown, tool call list, subagent info, and the ability to edit the summary inline.  
**Acceptance Criteria:**
- Click row → slide-in panel (or modal)
- Shows: date/time, model, cost breakdown (input/output/cache), token counts by type, tool calls with counts, subagent count and model breakdown, duration, summary (editable)
- ESC or click-outside dismisses

---

### [MC-07] Date range filter
**Type:** feature  
**What:** Add date range picker to filter the session table to a specific time window.  
**Acceptance Criteria:**
- "Last 7 days / 30 days / 90 days / Custom" selector
- Applies to main session table and top-bar stats
- Persists filter selection in `localStorage`

---

### [MC-08] Fix project path matching for session filtering
**Type:** bug  
**Source:** `app.js:44` — `s.projectPath === selectedProject` — sessions from `/api/sessions/all` don't include `projectPath`  
**What:** Selecting a project in the sidebar has no effect because session objects from `GET /api/sessions/all` don't include the project path.  
**Acceptance Criteria:**
- Sessions returned by `/api/sessions/all` include `projectPath` field
- Sidebar filter works correctly
- `app.js` filter logic matches on the included field

---

### [MC-09] Model normalization in config pricing
**Type:** bug  
**Source:** `config.json` uses short names (`opus`, `sonnet`, `haiku`) but `costCalculator.js` and `server.js` expect full model IDs  
**What:** User-defined pricing in `config.json` won't apply because keys don't match.  
**Acceptance Criteria:**
- `loadConfig()` normalizes short-name pricing keys to full model IDs
- OR `normalizeModel()` in `costCalculator.js` handles both forms
- Document the accepted key formats in config comments / README

---

### [MC-10] Export sessions as CSV
**Type:** feature  
**What:** Add a button to export the currently visible session list as a CSV file.  
**Acceptance Criteria:**
- "Export CSV" button in search bar area
- CSV includes: date, summary, model, tokens (total), cost, duration
- Uses current filter/sort state
- Pure client-side (no API endpoint needed)

---

## P3 — Low Priority (Nice to Have)

### [MC-11] Budget alert / daily spend threshold
**Type:** feature  
**What:** Allow user to set a daily spend threshold in config. Show a warning banner when exceeded.  
**Acceptance Criteria:**
- `budgetAlertDaily` field in `config.json`
- Top bar stat turns amber/red when today's cost exceeds threshold
- `GET /api/daily-stats` includes a `budgetExceeded` flag

---

### [MC-12] Model distribution chart (pie/donut)
**Type:** feature  
**What:** Add a third chart showing cost split by model (Opus vs Sonnet vs Haiku).  
**Acceptance Criteria:**
- SVG donut chart in the charts panel (MC-04)
- Shows % of total cost per model
- Color-coded consistent with existing model badge colors

---

### [MC-13] Keyboard shortcuts
**Type:** enhancement  
**What:** Add basic keyboard nav: `j/k` to move between sessions, `/` to focus search, `Enter` to open session detail (MC-06).  
**Acceptance Criteria:**
- Works when focus is not in an input
- No conflict with browser defaults

---

### [MC-14] Health endpoint with version info
**Type:** chore  
**What:** Extend `GET /health` to include version from `package.json`, uptime, and session count.  
**Acceptance Criteria:**
- `{ status: "ok", version: "0.1.0", uptimeSeconds: 120, sessionCount: 42 }`

---

### [MC-15] macOS Ghostty AppleScript — fix command quoting
**Type:** bug  
**Source:** `server.js:626-634` — AppleScript has potential shell injection via `projectPath`  
**What:** The `projectPath` is interpolated directly into the AppleScript string without escaping. A project path with a single quote would break the command.  
**Acceptance Criteria:**
- Project path is properly escaped before interpolation
- Test with a path containing spaces and special characters
- Add input validation to reject obviously malicious paths

---

## Completed

*(Move items here with `[x]` as they are finished)*

- [x] Session file parsing from `.jsonl` — `lib/sessionParser.js`
- [x] Cost calculation per model — `lib/costCalculator.js`
- [x] Project discovery by scanning for `.claude/` dirs — `lib/projectDiscovery.js`
- [x] Session caching by mtime — `lib/sessionManager.js`
- [x] Express API server with all core endpoints — `server.js`
- [x] File watcher with cache invalidation — `server.js:117-181`
- [x] Time saved calculation — `lib/costCalculator.js:109`
- [x] Subagent/sidechain detection — `lib/sessionParser.js:149`
- [x] Auto-generated session summaries — `lib/sessionParser.js:49`
- [x] React frontend with session table — `public/app.js`
- [x] Sortable columns (date, tokens, cost, duration)
- [x] Ghostty session restore via AppleScript (partially working)
- [x] Daily and monthly stats API endpoints

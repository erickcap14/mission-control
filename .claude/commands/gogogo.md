---
description: Start a new Claude Code session - load context, check git status, and prepare for work
---

## Session Startup Checklist

Please perform the following startup tasks to begin this session:

### 0. Status Line Check (First Time Only)

Check if the context status line is configured by checking if `~/.claude/statusline.sh` exists.

**If the file does NOT exist**, offer to set it up:

"I noticed you don't have the context status line configured yet. This shows you real-time token usage at the bottom of your terminal, helping you stay aware of context limits before autocompact triggers.

Would you like me to set it up now? (This is a one-time setup that works across all projects.)"

- **If yes:** Follow the setup process from `/setup-statusline` (check for jq, create script, update settings.json)
- **If no:** Continue with the session startup

**If the file already exists**, skip this step silently and continue.

---

### 1. Environment Setup

MISSION-CONTROL is a **Node/Express + PostgreSQL** stack. The backend will **not** start unless Postgres is up first, so check the layers in order. Do **not** start anything destructively — only offer to start what's down.

1. **Backend already running?** — `curl -s http://localhost:9000/health` (or the configured `port`). If it returns JSON, the stack is up; note the `version`/`sessionCount` and skip the rest of this section.
2. **PostgreSQL up?** — `docker inspect --format '{{.State.Health.Status}}' mission-control-db` should print `healthy`. If the container is missing or unhealthy, offer to run `docker compose up -d` and wait for the healthcheck, then `npm run db:migrate` (idempotent).
3. **Start the backend** only if the user wants to work against a live server: prefer `./start.sh` (brings up Postgres → migrate → backend → host collector, opens the dashboard) — or `npm start` for backend-only. Run it in the background and confirm `/health` responds.

> **Note:** Many sessions are code-only and don't need a live server — don't force a startup. If Docker isn't running, surface that rather than failing silently; the backend needs Postgres.

### 2. Git Status Check
- Run `git status` to show current branch and any uncommitted changes
- Run `git log -5 --oneline` to show recent commits
- **If there are uncommitted changes:** Ask the user what to do:
  - Commit them now (with a message)
  - Stash them for later
  - Continue without committing
- If there are remote changes (behind origin), pull them with `git pull`

### 3. Load Project Context
Read and internalize the full project context:

**Core Context Files (read but don't summarize verbosely):**
- `.claude/claude.md` - Master context and conflict resolution rules
- `.claude/prd.md` - Product requirements and user stories
- `.claude/workflow.md` - Development workflow and plan execution rules
- `.claude/infra.md` - Infrastructure and coding conventions

**Status Files (summarize for user):**
- `.claude/changelog.md` - Summarize the most recent entries (what was completed recently)

**Beads Issue Tracking:**
- Run `bd list` to see all tracked issues
- If `bd list` returns "no beads database found", ask the user: "No beads database found. Run `bd init` to initialize issue tracking for this project?" — if yes, run `bd init`, then continue; if no, skip beads steps
- Run `bd ready` to identify available work
- Note any issues with status "in_progress" that may need continuation

### 4. Environment Check
- Verify `.env` exists (compare against `.env.example`). Required: `DATABASE_URL`, `DASHBOARD_PASSWORD`. Optional: `SESSION_SECRET`, and `TLS_CERT_FILE`/`TLS_KEY_FILE` (only if running HTTPS).
- For multi-device work, note whether `collector.config.json` exists (per-device, git-ignored); without it the host collector is skipped.
- Flag any variable present in `.env.example` but missing from `.env`.

### 5. Present Options
After gathering context, ask the user:

"Session ready! Here's what I found:
- **Recent work:** [Summary from changelog]
- **In progress:** [Any in-progress issues from `bd list`]
- **Ready to start:** [Available issues from `bd ready`]

What would you like to work on?
1. Continue: [in-progress issue if any]
2. Next up: [top issue from `bd ready`]
3. Something else - describe what you'd like to do"

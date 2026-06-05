# Infrastructure Blueprint — MISSION-CONTROL

Purpose: Runtime environment, tech stack, coding conventions, and data architecture.

---

## What We're Building

- **Programming Language:** JavaScript (Node.js ESM)
- **Main Framework/Tool:** Express 4.x (backend), React 18 via CDN (frontend)
- **Quick Summary:** A local-only analytics dashboard that reads Claude Code session JSONL files and serves a web UI on port 9000.

---

## How to Run it Locally

- **Installation:** `npm install`
- **Startup:** `npm start` (or `node server.js`)
- **Local Address:** `http://localhost:9000`
- **Start Script:** `start.sh` (available at project root)

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

**Important constraints:**
- No build step — frontend is loaded directly from `public/` as static files
- No JSX — use `React.createElement` in `app.js`
- No frontend bundler (webpack/vite/etc.) — keep it zero-dependency for the frontend
- Node.js native `readline` for streaming JSONL (no external JSON stream library)

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

- **Hosting:** Local machine only. No cloud deployment.
- **Process:** Runs as a `node` process, typically started manually or via `start.sh`
- **Port:** 9000 (configurable in `config.json`)

---

## Where Data Lives

- **Session data:** Read-only from `~/.claude/projects/<encoded-path>/*.jsonl`
  - Claude Code writes these files; MISSION-CONTROL only reads them
  - Encoding: real path with `/` and `_` replaced by `-`
- **Metadata (status, summaries):** In-memory only in v0.1 (see MC-01, MC-02 in tasks.md for persistence plan)
- **Configuration:** `config.json` at project root (written by `PUT /api/config`)
- **Cache:** In-memory `Map` in `SessionManager`; keyed by file path + mtime

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
  summary: string,        // auto-generated or user-edited
  subagentCount: number,
  subagentModels: { [modelKey]: number }
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

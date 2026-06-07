/**
 * MISSION-CONTROL — Express server (LAN-shared, Postgres-backed).
 *
 * Aggregates Claude Code session analytics pushed by per-device collectors.
 * Reads come from Postgres; the aggregation logic is unchanged from the original
 * file-based version — only the data source moved. Ingest is device-key
 * authenticated; the dashboard + read APIs require a login cookie.
 */

import { loadEnv } from './lib/env.js';
loadEnv();

import express from 'express';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  migrate,
  upsertSessions,
  touchDevice,
  getAllSessions,
  getDevices,
  setMeta,
  findSessionDevice,
} from './lib/db.js';
import { calculateTimeSaved } from './lib/costCalculator.js';
import { deviceAuth, dashboardAuth, loginHandler, logoutHandler } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

async function loadConfig() {
  return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
}

async function saveConfig(cfg) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function errorResponse(res, err, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).json({ error: message });
}

function fuzzyMatch(text, query) {
  if (!query) return true;
  return String(text || '').toLowerCase().includes(query.toLowerCase());
}

/**
 * Sorts sessions array in place based on sort/order params.
 */
function sortSessions(sessions, sort = 'date', order = 'desc') {
  const dir = order === 'asc' ? 1 : -1;
  sessions.sort((a, b) => {
    let valA, valB;
    switch (sort) {
      case 'tokens':
        valA = (a.tokens?.input || 0) + (a.tokens?.output || 0);
        valB = (b.tokens?.input || 0) + (b.tokens?.output || 0);
        break;
      case 'cost':
        valA = a.cost || 0;
        valB = b.cost || 0;
        break;
      case 'duration':
        valA = a.duration || 0;
        valB = b.duration || 0;
        break;
      case 'date':
      default:
        valA = a.startTime ? new Date(a.startTime).getTime() : 0;
        valB = b.startTime ? new Date(b.startTime).getTime() : 0;
        break;
    }
    if (valA < valB) return -1 * dir;
    if (valA > valB) return 1 * dir;
    return 0;
  });
}

/**
 * Derives per-project aggregates from a session array (replaces filesystem
 * project discovery — projects now come from whatever has been ingested).
 */
function aggregateProjects(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = s.projectPath || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        name: key === 'unknown' ? 'unknown' : path.basename(key),
        path: key,
        sessionCount: 0,
        totalCost: 0,
        totalTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        totalDuration: 0,
        modelBreakdown: {},
      });
    }
    const p = map.get(key);
    p.sessionCount++;
    p.totalCost += s.cost || 0;
    p.totalDuration += s.duration || 0;
    p.totalTokens.input += s.tokens?.input || 0;
    p.totalTokens.output += s.tokens?.output || 0;
    p.totalTokens.cacheRead += s.tokens?.cacheRead || 0;
    p.totalTokens.cacheWrite += s.tokens?.cacheWrite || 0;
    if (s.model) p.modelBreakdown[s.model] = (p.modelBreakdown[s.model] || 0) + 1;
  }
  return [...map.values()].sort((a, b) => b.totalCost - a.totalCost);
}

// ---------------------------------------------------------------------------
// Change emitter (for SSE)
// ---------------------------------------------------------------------------
export const changeEmitter = new EventEmitter();

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
async function createApp(config) {
  const app = express();
  app.use(express.json({ limit: '25mb' })); // ingest batches can be large

  // -------------------------------------------------------------------------
  // Auth: login (open), then everything below requires a session cookie —
  // except /api/ingest/* (device-key auth) and /health.
  // -------------------------------------------------------------------------
  app.post('/api/login', loginHandler);
  app.post('/api/logout', logoutHandler);

  app.get('/health', async (_req, res) => {
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')
      );
      res.json({ status: 'ok', version: packageJson.version, uptimeSeconds: Math.floor(process.uptime()) });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Ingest (device-key auth) — collectors push session batches here.
  // -------------------------------------------------------------------------
  app.post('/api/ingest/sessions', deviceAuth, async (req, res) => {
    try {
      const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
      await upsertSessions(req.deviceId, sessions);
      await touchDevice(req.deviceId);
      changeEmitter.emit('change');
      res.json({ ok: true, ingested: sessions.length });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Dashboard gate: all /api reads below require login. The static SPA shell
  // itself is not sensitive (it shows a login form when the data APIs 401), so
  // it is served openly.
  // -------------------------------------------------------------------------
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', dashboardAuth);

  // -------------------------------------------------------------------------
  // Config endpoints
  // -------------------------------------------------------------------------
  app.get('/api/config', async (_req, res) => {
    try {
      res.json(await loadConfig());
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const current = await loadConfig();
      const updated = { ...current, ...req.body };
      await saveConfig(updated);
      Object.assign(config, updated);
      res.json(updated);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------------
  app.get('/api/devices', async (_req, res) => {
    try {
      res.json(await getDevices());
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Projects (derived from ingested sessions)
  // -------------------------------------------------------------------------
  app.get('/api/projects', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      res.json(aggregateProjects(sessions));
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------
  async function querySessions(query) {
    const { projectPath, sort = 'date', order = 'desc', search = '', device } = query;
    let sessions = await getAllSessions({ device });
    if (projectPath) sessions = sessions.filter(s => s.projectPath === projectPath);
    if (search) {
      sessions = sessions.filter(s => fuzzyMatch(s.summary, search) || fuzzyMatch(s.id, search));
    }
    sortSessions(sessions, sort, order);
    return sessions;
  }

  app.get('/api/sessions', async (req, res) => {
    try {
      res.json(await querySessions(req.query));
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/sessions/all', async (req, res) => {
    try {
      const { sort = 'date', order = 'desc', search = '', device } = req.query;
      let sessions = await getAllSessions({ device });
      if (search) {
        sessions = sessions.filter(s => fuzzyMatch(s.summary, search) || fuzzyMatch(s.id, search));
      }
      sortSessions(sessions, sort, order);
      res.json(sessions);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      const session = sessions.find(s => s.id === req.params.id);
      if (!session) return errorResponse(res, new Error(`Session not found: ${req.params.id}`), 404);
      res.json(session);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.put('/api/sessions/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const device = req.body.device || req.query.device || (await findSessionDevice(id));
      if (!device) return errorResponse(res, new Error(`Session not found: ${id}`), 404);
      await setMeta(device, id, { status: req.body.status });
      changeEmitter.emit('change');
      res.json({ ok: true });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.put('/api/sessions/:id/summary', async (req, res) => {
    try {
      const { id } = req.params;
      const device = req.body.device || req.query.device || (await findSessionDevice(id));
      if (!device) return errorResponse(res, new Error(`Session not found: ${id}`), 404);
      await setMeta(device, id, { summary: req.body.summary });
      changeEmitter.emit('change');
      res.json({ ok: true });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------
  app.get('/api/stats', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      const projectPaths = new Set();
      let totalCost = 0;
      let totalDuration = 0;
      for (const s of sessions) {
        if (s.projectPath) projectPaths.add(s.projectPath);
        totalCost += s.cost || 0;
        totalDuration += s.duration || 0;
      }
      res.json({
        projectCount: projectPaths.size,
        sessionCount: sessions.length,
        totalCost,
        totalDuration,
        timeSaved: calculateTimeSaved(totalDuration, config.timeSavedMultiplier || 2.5),
      });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/daily-stats', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const byDate = {};
      for (const s of sessions) {
        if (!s.startTime) continue;
        const d = new Date(s.startTime);
        if (d < cutoff) continue;
        const dateStr = d.toISOString().slice(0, 10);
        if (!byDate[dateStr]) byDate[dateStr] = { date: dateStr, cost: 0, tokens: 0 };
        byDate[dateStr].cost += s.cost || 0;
        byDate[dateStr].tokens += (s.tokens?.input || 0) + (s.tokens?.output || 0);
      }
      res.json(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/monthly-stats', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);

      const byMonth = {};
      for (const s of sessions) {
        if (!s.startTime) continue;
        const d = new Date(s.startTime);
        if (d < cutoff) continue;
        const monthStr = d.toISOString().slice(0, 7);
        if (!byMonth[monthStr]) byMonth[monthStr] = { month: monthStr, cost: 0, tokens: 0 };
        byMonth[monthStr].cost += s.cost || 0;
        byMonth[monthStr].tokens += (s.tokens?.input || 0) + (s.tokens?.output || 0);
      }
      res.json(Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)));
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // Usage stats: monthly billing period + 5-hour rolling + weekly windows.
  app.get('/api/usage-stats', async (req, res) => {
    try {
      const cfg = config;
      const now = new Date();

      // ── Monthly billing period (anchored to billingAnchorDay of each month) ──
      const anchorDay = cfg.plan?.billingAnchorDay ?? 1;
      let periodStart = new Date(now.getFullYear(), now.getMonth(), anchorDay);
      if (periodStart > now) {
        periodStart = new Date(now.getFullYear(), now.getMonth() - 1, anchorDay);
      }
      const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, anchorDay);

      const msUntilReset = periodEnd - now;
      const daysRemaining = Math.floor(msUntilReset / (1000 * 60 * 60 * 24));
      const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60));
      const minutesUntilReset = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));

      const allSessions = await getAllSessions({ device: req.query.device });

      function aggregateSessions(sessions) {
        const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
        let cost = 0;
        const byModel = {};
        const dailyMap = {};

        for (const s of sessions) {
          const ti = s.tokens?.input || 0;
          const to = s.tokens?.output || 0;
          const tr = s.tokens?.cacheRead || 0;
          const tw = s.tokens?.cacheWrite || 0;
          const sessionTokens = ti + to + tr + tw;

          tokens.input += ti;
          tokens.output += to;
          tokens.cacheRead += tr;
          tokens.cacheWrite += tw;
          cost += s.cost || 0;

          const model = s.model || 'unknown';
          if (!byModel[model]) byModel[model] = { tokens: 0, cost: 0, sessions: 0 };
          byModel[model].tokens += sessionTokens;
          byModel[model].cost += s.cost || 0;
          byModel[model].sessions++;

          if (s.startTime) {
            const dateKey = new Date(s.startTime).toISOString().slice(0, 10);
            if (!dailyMap[dateKey]) dailyMap[dateKey] = { tokens: 0, cost: 0, sessions: 0 };
            dailyMap[dateKey].tokens += sessionTokens;
            dailyMap[dateKey].cost += s.cost || 0;
            dailyMap[dateKey].sessions++;
          }
        }
        tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;

        const dailyBreakdown = Object.entries(dailyMap)
          .map(([date, d]) => ({ date, ...d }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return { tokens, cost, sessionCount: sessions.length, byModel, dailyBreakdown };
      }

      const monthlySessions = allSessions.filter(s => {
        if (!s.startTime) return false;
        const d = new Date(s.startTime);
        return d >= periodStart && d < periodEnd;
      });
      const monthly = aggregateSessions(monthlySessions);

      const daysElapsed = Math.max(1, (now - periodStart) / (1000 * 60 * 60 * 24));
      const dailyBurnRate = monthly.cost / daysElapsed;
      const subscriptionCost = cfg.plan?.subscriptionCostPerMonth ?? null;
      const monthlyBudget = subscriptionCost;
      const usagePercent = monthlyBudget != null ? Math.min((monthly.cost / monthlyBudget) * 100, 100) : null;
      const overageCost = monthlyBudget != null ? Math.max(0, monthly.cost - monthlyBudget) : 0;
      const daysUntilExhausted = monthlyBudget != null && dailyBurnRate > 0
        ? Math.max(0, (monthlyBudget - monthly.cost) / dailyBurnRate)
        : null;

      // ── 5-hour rolling window ──
      const fiveHoursMs = 5 * 60 * 60 * 1000;
      const fiveHoursAgo = new Date(now - fiveHoursMs);
      const recentSessions = allSessions
        .filter(s => s.startTime && new Date(s.startTime) >= fiveHoursAgo)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      let fiveHourWindow = null;
      if (recentSessions.length > 0) {
        const windowStart = new Date(recentSessions[0].startTime);
        const windowEnd = new Date(windowStart.getTime() + fiveHoursMs);
        const msUntilWindowReset = windowEnd - now;
        const fiveHr = aggregateSessions(recentSessions);
        fiveHourWindow = {
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          msUntilReset: Math.max(0, msUntilWindowReset),
          hoursUntilReset: Math.max(0, Math.floor(msUntilWindowReset / (1000 * 60 * 60))),
          minutesUntilReset: Math.max(0, Math.floor((msUntilWindowReset % (1000 * 60 * 60)) / (1000 * 60))),
          totalTokens: fiveHr.tokens,
          totalCost: fiveHr.cost,
          sessionCount: fiveHr.sessionCount,
          byModel: fiveHr.byModel,
          active: msUntilWindowReset > 0,
        };
      }

      // ── Weekly fixed-reset window ──
      const weeklyResetWeekday = cfg.plan?.weeklyResetWeekday ?? 1;
      const weeklyResetHour = cfg.plan?.weeklyResetHour ?? 0;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), weeklyResetHour);
      const daysSinceReset = (now.getDay() - weeklyResetWeekday + 7) % 7;
      weekStart.setDate(weekStart.getDate() - daysSinceReset);
      if (weekStart > now) weekStart.setDate(weekStart.getDate() - 7);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const msUntilWeekReset = weekEnd - now;
      const weeklySessions = allSessions.filter(s => {
        if (!s.startTime) return false;
        const d = new Date(s.startTime);
        return d >= weekStart && d < weekEnd;
      });
      const weekly = aggregateSessions(weeklySessions);
      const weeklyWindow = {
        windowStart: weekStart.toISOString(),
        windowEnd: weekEnd.toISOString(),
        msUntilReset: Math.max(0, msUntilWeekReset),
        daysUntilReset: Math.max(0, Math.floor(msUntilWeekReset / (1000 * 60 * 60 * 24))),
        hoursUntilReset: Math.max(0, Math.floor(msUntilWeekReset / (1000 * 60 * 60))),
        minutesUntilReset: Math.max(0, Math.floor((msUntilWeekReset % (1000 * 60 * 60)) / (1000 * 60))),
        totalTokens: weekly.tokens,
        totalCost: weekly.cost,
        sessionCount: weekly.sessionCount,
        active: true,
      };

      res.json({
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        periodLabel: 'monthly',
        daysRemaining,
        hoursUntilReset,
        minutesUntilReset,
        plan: {
          ...(cfg.plan || {}),
          name: cfg.plan?.name || 'Unknown',
          monthlyCostLimit: subscriptionCost,
          monthlyBudget,
          paygAfterLimit: cfg.plan?.paygAfterLimit ?? false,
          weeklyTokenLimit: cfg.plan?.weeklyTokenLimit ?? null,
          fiveHourTokenLimit: cfg.plan?.fiveHourTokenLimit ?? null,
        },
        currentPeriod: {
          totalTokens: monthly.tokens,
          totalCost: monthly.cost,
          sessionCount: monthly.sessionCount,
          byModel: monthly.byModel,
          dailyBreakdown: monthly.dailyBreakdown,
        },
        includedCost: monthlyBudget != null ? Math.min(monthly.cost, monthlyBudget) : monthly.cost,
        overageCost,
        usagePercent,
        dailyBurnRate,
        daysUntilExhausted,
        fiveHourWindow,
        weeklyWindow,
      });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Active / WIP
  // -------------------------------------------------------------------------
  app.get('/api/active', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      const cutoff = Date.now() - 60_000;
      const active = sessions.filter(s => s.endTime && new Date(s.endTime).getTime() >= cutoff);
      res.json(active);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/wip', async (req, res) => {
    try {
      const sessions = await getAllSessions({ device: req.query.device });
      res.json(sessions.filter(s => s.status === 'wip'));
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Toolkit (host-local: scans the backend host's filesystem)
  // -------------------------------------------------------------------------
  app.get('/api/toolkit', async (_req, res) => {
    try {
      const { scanToolkit } = await import('./lib/toolkitScanner.js');
      res.json(await scanToolkit(config));
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Restore (host-only: launches a terminal on the backend host)
  // -------------------------------------------------------------------------
  app.post('/api/restore/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return errorResponse(res, new Error('Invalid session ID'), 400);
      }

      const devices = await getDevices();
      const hostId = devices.find(d => d.isHost)?.id;
      const sessions = await getAllSessions({});
      const session = sessions.find(s => s.id === id);
      if (!session) return errorResponse(res, new Error(`Session not found: ${id}`), 404);

      if (!hostId || session.device !== hostId) {
        return errorResponse(
          res,
          new Error('Restore is only available for sessions on the host device'),
          400
        );
      }

      const projectPath = session.projectPath || os.homedir();
      if (projectPath.includes('\0') || projectPath.includes('..')) {
        return errorResponse(res, new Error('Invalid project path'), 400);
      }

      const escapedPath = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const escapedId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const appleScript = `
tell application "Ghostty"
  activate
  tell application "System Events"
    keystroke "n" using {command down}
  end tell
  delay 0.5
  tell application "System Events"
    keystroke "cd \\"${escapedPath}\\" && claude --resume ${escapedId}"
    key code 36
  end tell
end tell
`.trim();

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
      res.json({ ok: true });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // SSE endpoint (fired by ingest + meta edits)
  // -------------------------------------------------------------------------
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(': connected\n\n');

    const onChange = () => res.write(`data: ${JSON.stringify({ type: 'change' })}\n\n`);
    changeEmitter.on('change', onChange);

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000);
    req.on('close', () => {
      changeEmitter.off('change', onChange);
      clearInterval(heartbeat);
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function main() {
  const config = await loadConfig();
  await migrate(); // ensure schema exists

  const app = await createApp(config);
  const port = process.env.PORT || config.port || 9000;

  app.listen(port, () => {
    console.log(`MISSION-CONTROL running on http://0.0.0.0:${port} (reachable on your LAN)`);
  });
}

main().catch(err => {
  console.error('Failed to start MISSION-CONTROL:', err);
  process.exit(1);
});

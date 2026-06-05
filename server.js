/**
 * MISSION-CONTROL — Express server
 * Local analytics dashboard for Claude Code sessions.
 */

import express from 'express';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import SessionManager from './lib/sessionManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Expands a leading `~` to the user's home directory.
 * @param {string} p
 * @returns {string}
 */
function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Loads config.json from disk, expanding ~ in path fields.
 * @returns {Promise<object>}
 */
async function loadConfig() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  return cfg;
}

/**
 * Saves config object back to config.json.
 * @param {object} cfg
 */
async function saveConfig(cfg) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/**
 * Sends a JSON error response.
 * @param {import('express').Response} res
 * @param {Error|string} err
 * @param {number} [status=500]
 */
function errorResponse(res, err, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).json({ error: message });
}

/**
 * Fuzzy-matches a string against a query (case-insensitive substring).
 * @param {string} text
 * @param {string} query
 * @returns {boolean}
 */
function fuzzyMatch(text, query) {
  if (!query) return true;
  return String(text || '').toLowerCase().includes(query.toLowerCase());
}

/**
 * Sorts sessions array in place based on sort/order params.
 * @param {object[]} sessions
 * @param {string} sort - date|tokens|cost|duration
 * @param {string} order - asc|desc
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

// ---------------------------------------------------------------------------
// Change emitter (for SSE)
// ---------------------------------------------------------------------------
export const changeEmitter = new EventEmitter();

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------
function startWatcher(config, sessionManager) {
  const claudeDir = expandHome(config.claudeDir || '~/.claude');
  const watchGlob = path.join(claudeDir, 'projects', '**', '*.jsonl');

  const watcher = chokidar.watch(watchGlob, {
    usePolling: true,
    interval: 2000,
    persistent: false,
    ignoreInitial: true,
  });

  const handleChange = (filePath) => {
    sessionManager.invalidateSession(filePath);
    changeEmitter.emit('change', filePath);
  };

  watcher.on('add', handleChange);
  watcher.on('change', handleChange);
  watcher.on('unlink', (filePath) => {
    sessionManager.invalidateSession(filePath);
    changeEmitter.emit('change', filePath);
  });

  return watcher;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
async function createApp(config, sessionManager) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // -------------------------------------------------------------------------
  // Config endpoints
  // -------------------------------------------------------------------------

  app.get('/api/config', async (_req, res) => {
    try {
      const cfg = await loadConfig();
      res.json(cfg);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const current = await loadConfig();
      const updated = { ...current, ...req.body };
      await saveConfig(updated);
      // Refresh in-memory config
      Object.assign(config, updated);
      Object.assign(sessionManager.config, updated);
      res.json(updated);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Project endpoints
  // -------------------------------------------------------------------------

  app.get('/api/projects', async (_req, res) => {
    try {
      const { discoverProjects } = await import('./lib/projectDiscovery.js');
      const projects = await discoverProjects(expandHome(config.scanPath || '~/Documents'));

      const result = [];
      for (const project of projects) {
        const stats = await sessionManager.getProjectStats(project.path);
        result.push({
          name: project.name,
          path: project.path,
          sessionCount: stats.sessionCount,
          totalCost: stats.totalCost,
          totalTokens: stats.totalTokens,
          totalDuration: stats.totalDuration,
          modelBreakdown: stats.modelBreakdown,
        });
      }

      res.json(result);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Session endpoints
  // -------------------------------------------------------------------------

  /**
   * Shared logic: gather sessions (optionally filtered by projectPath),
   * apply search/sort/order.
   */
  async function querySessions(query) {
    const { projectPath, sort = 'date', order = 'desc', search = '' } = query;

    let sessions;
    if (projectPath) {
      sessions = await sessionManager.getProjectSessions(projectPath);
    } else {
      sessions = await sessionManager.getAllSessions();
    }

    // Apply search filter
    if (search) {
      sessions = sessions.filter(
        s => fuzzyMatch(s.summary, search) || fuzzyMatch(s.id, search)
      );
    }

    sortSessions(sessions, sort, order);
    return sessions;
  }

  app.get('/api/sessions', async (req, res) => {
    try {
      const sessions = await querySessions(req.query);
      res.json(sessions);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/sessions/all', async (req, res) => {
    try {
      // Ignore projectPath for "all" endpoint
      const { sort = 'date', order = 'desc', search = '' } = req.query;
      let sessions = await sessionManager.getAllSessions();

      if (search) {
        sessions = sessions.filter(
          s => fuzzyMatch(s.summary, search) || fuzzyMatch(s.id, search)
        );
      }

      sortSessions(sessions, sort, order);
      res.json(sessions);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const all = await sessionManager.getAllSessions();
      const session = all.find(s => s.id === id);

      if (!session) {
        return errorResponse(res, new Error(`Session not found: ${id}`), 404);
      }

      res.json(session);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.put('/api/sessions/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      sessionManager.setMeta(id, { status });
      res.json({ ok: true });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.put('/api/sessions/:id/summary', async (req, res) => {
    try {
      const { id } = req.params;
      const { summary } = req.body;
      sessionManager.setMeta(id, { summary });
      res.json({ ok: true });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Stats endpoints
  // -------------------------------------------------------------------------

  app.get('/api/stats', async (_req, res) => {
    try {
      const stats = await sessionManager.getAllStats();
      res.json(stats);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/daily-stats', async (_req, res) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const byDate = {};
      for (const s of sessions) {
        if (!s.startTime) continue;
        const d = new Date(s.startTime);
        if (d < cutoff) continue;

        const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
        if (!byDate[dateStr]) byDate[dateStr] = { date: dateStr, cost: 0, tokens: 0 };
        byDate[dateStr].cost += s.cost || 0;
        byDate[dateStr].tokens +=
          (s.tokens?.input || 0) + (s.tokens?.output || 0);
      }

      const result = Object.values(byDate).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      res.json(result);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/monthly-stats', async (_req, res) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);

      const byMonth = {};
      for (const s of sessions) {
        if (!s.startTime) continue;
        const d = new Date(s.startTime);
        if (d < cutoff) continue;

        const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
        if (!byMonth[monthStr]) byMonth[monthStr] = { month: monthStr, cost: 0, tokens: 0 };
        byMonth[monthStr].cost += s.cost || 0;
        byMonth[monthStr].tokens +=
          (s.tokens?.input || 0) + (s.tokens?.output || 0);
      }

      const result = Object.values(byMonth).sort((a, b) =>
        b.month.localeCompare(a.month)
      );
      res.json(result);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Other endpoints
  // -------------------------------------------------------------------------

  app.get('/api/active', async (_req, res) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      const sixtySecondsAgo = Date.now() - 60_000;

      const { promises: fsProm } = await import('fs');
      const active = [];

      for (const s of sessions) {
        try {
          const stat = await fsProm.stat(s.filePath);
          if (stat.mtimeMs >= sixtySecondsAgo) {
            active.push(s);
          }
        } catch {
          // File may have been deleted
        }
      }

      res.json(active);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.get('/api/wip', async (_req, res) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      const wip = sessions.filter(s => s.status === 'wip');
      res.json(wip);
    } catch (err) {
      errorResponse(res, err);
    }
  });

  app.post('/api/restore/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Validate session ID: must be UUID-like (alphanumeric + dashes only)
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return errorResponse(res, new Error('Invalid session ID'), 400);
      }

      const all = await sessionManager.getAllSessions();
      const session = all.find(s => s.id === id);

      if (!session) {
        return errorResponse(res, new Error(`Session not found: ${id}`), 404);
      }

      const projectPath = session.projectPath || os.homedir();

      // Reject paths with null bytes or path traversal attempts
      if (projectPath.includes('\0') || projectPath.includes('..')) {
        return errorResponse(res, new Error('Invalid project path'), 400);
      }

      // Escape for AppleScript string: backslash-escape backslashes then double-quotes
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

  app.get('/health', async (_req, res) => {
    try {
      const cfg = await loadConfig();
      const packageJson = JSON.parse(
        await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')
      );
      const allSessions = await sessionManager.getAllSessions();
      res.json({
        status: 'ok',
        version: packageJson.version,
        uptimeSeconds: Math.floor(process.uptime()),
        sessionCount: allSessions.length,
      });
    } catch (err) {
      errorResponse(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // SSE endpoint
  // -------------------------------------------------------------------------

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection confirmation
    res.write(': connected\n\n');

    const onChange = () => {
      res.write(`data: ${JSON.stringify({ type: 'change' })}\n\n`);
    };

    changeEmitter.on('change', onChange);

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30_000);

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
  const sessionManager = new SessionManager(config);

  await sessionManager.loadPersistedMeta();
  startWatcher(config, sessionManager);

  const app = await createApp(config, sessionManager);
  const port = config.port || 9000;

  app.listen(port, () => {
    console.log(`MISSION-CONTROL running on http://localhost:${port}`);
  });
}

main().catch(err => {
  console.error('Failed to start MISSION-CONTROL:', err);
  process.exit(1);
});

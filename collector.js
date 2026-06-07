/**
 * MISSION-CONTROL — per-device collector.
 *
 * Runs on every device (including the host). Reads that machine's local
 * ~/.claude session files using the existing SessionManager + parser, then pushes
 * new/changed sessions to the LAN backend, tagged with this device's id + key.
 *
 * Config: collector.config.json (see collector.config.example.json). Pricing/plan
 * come from the shared config.json so cost is computed identically everywhere.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import SessionManager from './lib/sessionManager.js';
import { scanToolkit } from './lib/toolkitScanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

async function loadJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

/** Fingerprint that changes whenever a session's measurable content changes. */
function fingerprint(s) {
  const t = s.tokens || {};
  return `${s.cost}|${t.input}|${t.output}|${t.cacheRead}|${t.cacheWrite}|${s.endTime}|${s.turnCount}`;
}

async function main() {
  const sharedConfig = await loadJson(path.join(__dirname, 'config.json'));
  const deviceConfig = await loadJson(path.join(__dirname, 'collector.config.json'));

  const backendUrl = process.env.BACKEND_URL || deviceConfig.backendUrl;
  const { deviceId, deviceKey, deviceName } = deviceConfig;
  if (!backendUrl || !deviceId || !deviceKey) {
    throw new Error('collector.config.json must set backendUrl, deviceId and deviceKey');
  }

  // Merge: device may override claudeDir/scanPath; pricing/plan come from shared config.
  const config = {
    ...sharedConfig,
    claudeDir: deviceConfig.claudeDir || sharedConfig.claudeDir || '~/.claude',
    scanPath: deviceConfig.scanPath || sharedConfig.scanPath || '~/Documents',
  };

  const sessionManager = new SessionManager(config);
  const ingestUrl = backendUrl.replace(/\/$/, '') + '/api/ingest/sessions';
  const toolkitUrl = backendUrl.replace(/\/$/, '') + '/api/ingest/toolkit';
  const sent = new Map(); // sessionId -> fingerprint

  async function pushChanged(reason) {
    let sessions;
    try {
      sessions = await sessionManager.getAllSessions();
    } catch (err) {
      console.error('collector: failed to read sessions:', err.message);
      return;
    }

    const changed = sessions.filter(s => sent.get(s.id) !== fingerprint(s));
    if (!changed.length) return;

    try {
      const res = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
          Authorization: `Bearer ${deviceKey}`,
        },
        body: JSON.stringify({ deviceName, sessions: changed }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`collector: ingest failed (${res.status}): ${body}`);
        return;
      }
      for (const s of changed) sent.set(s.id, fingerprint(s));
      console.log(`collector: pushed ${changed.length} session(s) [${reason}]`);
    } catch (err) {
      console.error('collector: cannot reach backend:', err.message);
    }
  }

  /** Scans and pushes this device's local toolkit snapshot to the backend. */
  async function pushToolkit(reason) {
    try {
      const toolkit = await scanToolkit(config);
      const res = await fetch(toolkitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
          Authorization: `Bearer ${deviceKey}`,
        },
        body: JSON.stringify({ deviceName, toolkit }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`collector: toolkit ingest failed (${res.status}): ${body}`);
        return;
      }
      console.log(`collector: pushed toolkit [${reason}]`);
    } catch (err) {
      // Never let a toolkit failure kill the collector.
      console.error('collector: toolkit push error:', err.message);
    }
  }

  // Debounced watcher on this device's local Claude session files.
  const claudeDir = expandHome(config.claudeDir);
  const watchGlob = path.join(claudeDir, 'projects', '**', '*.jsonl');
  let timer = null;
  const schedule = (filePath) => {
    if (filePath) sessionManager.invalidateSession(filePath);
    clearTimeout(timer);
    timer = setTimeout(() => pushChanged('watch'), 1500);
  };

  chokidar
    .watch(watchGlob, { usePolling: true, interval: 2000, persistent: true, ignoreInitial: true })
    .on('add', schedule)
    .on('change', schedule)
    .on('unlink', schedule);

  console.log(`MISSION-CONTROL collector — device "${deviceId}" → ${backendUrl}`);
  await pushChanged('startup'); // backfill existing history

  // Push toolkit on startup then every 5 minutes (toolkit files change rarely).
  await pushToolkit('startup');
  setInterval(() => pushToolkit('interval'), 5 * 60 * 1000);
}

main().catch(err => {
  console.error('Collector failed to start:', err);
  process.exit(1);
});

/**
 * Session manager — caches parsed sessions and provides aggregated stats.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { discoverProjects } from './projectDiscovery.js';
import { parseSession } from './sessionParser.js';
import { calculateTimeSaved } from './costCalculator.js';

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
 * Converts a real filesystem path to the encoded project directory name used by Claude Code.
 * e.g. "/Users/foo/my-project" → "Users-foo-my-project"
 * @param {string} projectPath - absolute path
 * @returns {string}
 */
function encodeProjectPath(projectPath) {
  // Claude Code replaces / and _ with - (including the leading slash)
  return projectPath.replace(/[/_]/g, '-');
}

export default class SessionManager {
  /**
   * @param {object} config - loaded config object
   */
  constructor(config) {
    this.config = config;
    /** @type {Map<string, {mtime: number, session: object}>} */
    this.sessionCache = new Map();
    /** @type {Map<string, {sessions: object[], stats: object}>} */
    this.projectCache = new Map();
    /** @type {Map<string, {status?: string, summary?: string}>} */
    this.metaStore = new Map();
  }

  /**
   * Returns the ~/.claude/projects/ base directory (expanded).
   */
  get claudeProjectsDir() {
    return path.join(expandHome(this.config.claudeDir || '~/.claude'), 'projects');
  }

  /**
   * Returns the directory where session metadata sidecar files are stored.
   */
  get metaDir() {
    return path.join(expandHome(this.config.claudeDir || '~/.claude'), 'mission-control-meta');
  }

  /**
   * Loads all persisted metadata from disk into the in-memory metaStore.
   */
  async loadPersistedMeta() {
    try {
      await fs.mkdir(this.metaDir, { recursive: true });
      const files = await fs.readdir(this.metaDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const sessionId = file.slice(0, -5);
        try {
          const raw = await fs.readFile(path.join(this.metaDir, file), 'utf8');
          this.metaStore.set(sessionId, JSON.parse(raw));
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // metaDir may not exist yet; that's fine
    }
  }

  /**
   * Persists metadata for a session to a sidecar JSON file.
   * @param {string} sessionId
   */
  async persistMeta(sessionId) {
    try {
      await fs.mkdir(this.metaDir, { recursive: true });
      const meta = this.metaStore.get(sessionId);
      if (!meta) return;
      await fs.writeFile(
        path.join(this.metaDir, `${sessionId}.json`),
        JSON.stringify(meta, null, 2),
        'utf8'
      );
    } catch {
      // best-effort; don't crash on write failures
    }
  }

  /**
   * Reads and parses a single session file, using cache when mtime matches.
   * @param {string} filePath
   * @returns {Promise<object>} session object
   */
  async getSession(filePath) {
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      this.sessionCache.delete(filePath);
      return null;
    }

    const mtime = stat.mtimeMs;
    const cached = this.sessionCache.get(filePath);

    if (cached && cached.mtime === mtime) {
      return cached.session;
    }

    const session = await parseSession(filePath, this.config);
    this.sessionCache.set(filePath, { mtime, session });
    return session;
  }

  /**
   * Returns all sessions for a given project path.
   * Looks for JSONL files in ~/.claude/projects/<encoded-path>/
   * @param {string} projectPath - real filesystem path to the project
   * @returns {Promise<object[]>} array of session objects
   */
  async getProjectSessions(projectPath) {
    const encoded = encodeProjectPath(projectPath);
    const sessionDir = path.join(this.claudeProjectsDir, encoded);

    let files;
    try {
      files = await fs.readdir(sessionDir);
    } catch {
      return [];
    }

    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    const sessions = [];

    for (const file of jsonlFiles) {
      const filePath = path.join(sessionDir, file);
      const session = await this.getSession(filePath);
      if (!session) continue;

      // Merge metadata and set projectPath
      const meta = this.getMeta(session.id);
      sessions.push({
        ...session,
        projectPath,
        status: meta?.status ?? session.status,
        summary: meta?.summary ?? session.summary,
      });
    }

    return sessions;
  }

  /**
   * Returns all sessions across all discovered projects.
   * @returns {Promise<object[]>}
   */
  async getAllSessions() {
    const projects = await discoverProjects(
      expandHome(this.config.scanPath || '~/Documents')
    );

    const allSessions = [];
    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path);
      allSessions.push(...sessions);
    }

    return allSessions;
  }

  /**
   * Returns aggregated stats for a single project.
   * @param {string} projectPath
   * @returns {Promise<object>}
   */
  async getProjectStats(projectPath) {
    const sessions = await this.getProjectSessions(projectPath);

    const stats = {
      sessionCount: sessions.length,
      totalCost: 0,
      totalTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      totalDuration: 0,
      modelBreakdown: {},
    };

    for (const s of sessions) {
      stats.totalCost += s.cost || 0;
      stats.totalDuration += s.duration || 0;
      stats.totalTokens.input += s.tokens?.input || 0;
      stats.totalTokens.output += s.tokens?.output || 0;
      stats.totalTokens.cacheRead += s.tokens?.cacheRead || 0;
      stats.totalTokens.cacheWrite += s.tokens?.cacheWrite || 0;

      if (s.model) {
        stats.modelBreakdown[s.model] = (stats.modelBreakdown[s.model] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Returns aggregated stats across all projects.
   * @returns {Promise<object>}
   */
  async getAllStats() {
    const projects = await discoverProjects(
      expandHome(this.config.scanPath || '~/Documents')
    );

    let sessionCount = 0;
    let totalCost = 0;
    let totalDuration = 0;

    for (const project of projects) {
      const stats = await this.getProjectStats(project.path);
      sessionCount += stats.sessionCount;
      totalCost += stats.totalCost;
      totalDuration += stats.totalDuration;
    }

    const timeSaved = calculateTimeSaved(
      totalDuration,
      this.config.timeSavedMultiplier || 2.5
    );

    return {
      projectCount: projects.length,
      sessionCount,
      totalCost,
      totalDuration,
      timeSaved,
    };
  }

  /**
   * Stores metadata (status, summary) for a session by id and persists to disk.
   * @param {string} sessionId
   * @param {{ status?: string, summary?: string }} meta
   */
  setMeta(sessionId, meta) {
    const existing = this.metaStore.get(sessionId) || {};
    this.metaStore.set(sessionId, { ...existing, ...meta });
    this.persistMeta(sessionId);
  }

  /**
   * Retrieves stored metadata for a session.
   * @param {string} sessionId
   * @returns {{ status?: string, summary?: string } | undefined}
   */
  getMeta(sessionId) {
    return this.metaStore.get(sessionId);
  }

  /**
   * Removes a session from the cache (e.g. when the file changes).
   * @param {string} filePath
   */
  invalidateSession(filePath) {
    this.sessionCache.delete(filePath);
  }

  /**
   * Removes a project's session list from the project cache.
   * @param {string} projectPath
   */
  invalidateProject(projectPath) {
    this.projectCache.delete(projectPath);
  }
}

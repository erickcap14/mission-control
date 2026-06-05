/**
 * Toolkit scanner — discovers skills, plugins, and global settings from ~/.claude.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { discoverProjects } from './projectDiscovery.js';

/**
 * Reads the first non-empty line of a file and returns it as a description,
 * stripping a leading `#` and surrounding whitespace.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readDescription(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        return trimmed.replace(/^#+\s*/, '');
      }
    }
  } catch {
    // Unreadable file — return empty description
  }
  return '';
}

/**
 * Scans a commands directory for .md files and returns
 * a map of { basename -> { filePath, source } }.
 * @param {string} dir - absolute path to commands directory
 * @param {string} source - label for the source ("global" or project dir name)
 * @returns {Promise<Map<string, { filePath: string, source: string }>>}
 */
async function scanCommandsDir(dir, source) {
  const map = new Map();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      const name = entry.name.slice(0, -3); // strip .md
      map.set(name, { filePath: path.join(dir, entry.name), source });
    }
  } catch {
    // Directory doesn't exist or unreadable — skip
  }
  return map;
}

/**
 * Scans skills/commands across global and per-project locations.
 * Deduplicates by file basename; collects all sources per skill.
 * @param {string} scanPath - root path to scan for projects
 * @returns {Promise<Array<{ name: string, description: string, sources: string[] }>>}
 */
async function scanSkills(scanPath) {
  // Map of skill name -> { filePath (first seen), sources: string[] }
  const skillMap = new Map();

  function mergeSkill(name, filePath, source) {
    if (skillMap.has(name)) {
      skillMap.get(name).sources.push(source);
    } else {
      skillMap.set(name, { filePath, sources: [source] });
    }
  }

  // 1. Global commands: ~/.claude/commands/
  const globalCommandsDir = path.join(os.homedir(), '.claude', 'commands');
  const globalSkills = await scanCommandsDir(globalCommandsDir, 'global');
  for (const [name, { filePath, source }] of globalSkills) {
    mergeSkill(name, filePath, source);
  }

  // 2. Per-project commands
  let projects = [];
  try {
    projects = await discoverProjects(scanPath);
  } catch {
    // scanPath unreadable — skip project scanning
  }

  for (const project of projects) {
    // <project>/.claude/commands/
    const dotClaudeCommands = path.join(project.path, '.claude', 'commands');
    const dotClaudeSkills = await scanCommandsDir(dotClaudeCommands, project.name);
    for (const [name, { filePath, source }] of dotClaudeSkills) {
      mergeSkill(name, filePath, source);
    }

    // <project>/commands/
    const rootCommands = path.join(project.path, 'commands');
    const rootSkills = await scanCommandsDir(rootCommands, project.name);
    for (const [name, { filePath, source }] of rootSkills) {
      mergeSkill(name, filePath, source);
    }
  }

  // Build result array with descriptions, sorted alphabetically
  const results = [];
  for (const [name, { filePath, sources }] of skillMap) {
    const description = await readDescription(filePath);
    results.push({ name, description, sources });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Reads installed plugins from ~/.claude/plugins/installed_plugins.json.
 * @returns {Promise<Array<{ name: string, scope: string, version: string, installedAt: string }>>}
 */
async function scanPlugins() {
  const pluginsPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  try {
    const raw = await fs.readFile(pluginsPath, 'utf8');
    const data = JSON.parse(raw);
    const plugins = data.plugins || {};
    const result = [];

    for (const [key, entries] of Object.entries(plugins)) {
      // key is "<name>@<marketplace>"
      const name = key.split('@')[0];
      for (const entry of entries) {
        result.push({
          name,
          scope: entry.scope || '',
          version: entry.version || '',
          installedAt: entry.installedAt || '',
        });
      }
    }

    return result;
  } catch {
    // File doesn't exist or is malformed — return empty array
    return [];
  }
}

/**
 * Reads global Claude settings from ~/.claude/settings.json.
 * @returns {Promise<object>}
 */
async function scanGlobalSettings() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // File doesn't exist or is malformed — return empty object
    return {};
  }
}

/**
 * Scans the toolkit: skills, plugins, and global settings.
 * @param {{ scanPath?: string }} config
 * @returns {Promise<{ skills: object[], plugins: object[], globalSettings: object }>}
 */
export async function scanToolkit(config) {
  const rawScanPath = config?.scanPath || '~/Documents';
  const resolvedScanPath = rawScanPath.startsWith('~')
    ? path.join(os.homedir(), rawScanPath.slice(1))
    : rawScanPath;

  const [skills, plugins, globalSettings] = await Promise.all([
    scanSkills(resolvedScanPath),
    scanPlugins(),
    scanGlobalSettings(),
  ]);

  return { skills, plugins, globalSettings };
}

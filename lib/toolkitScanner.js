/**
 * Toolkit scanner — discovers skills, hooks, plugins, and global settings from ~/.claude.
 */

import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import os from 'os';
import path from 'path';
import { discoverProjects } from './projectDiscovery.js';

const CMD_NAME_RE = /<command-name>\/([^<]+)<\/command-name>/;

/**
 * Reads the first non-empty line of a file and returns it as a description,
 * stripping a leading `#` and surrounding whitespace.
 */
async function readDescription(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) return trimmed.replace(/^#+\s*/, '');
    }
  } catch {
    // unreadable — return empty
  }
  return '';
}

/**
 * Scans a commands directory for .md files and returns
 * a map of { basename -> { filePath, source } }.
 */
async function scanCommandsDir(dir, source) {
  const map = new Map();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.slice(0, -3);
      map.set(name, { filePath: path.join(dir, entry.name), source });
    }
  } catch {
    // directory missing — skip
  }
  return map;
}

/**
 * Builds a usage count map (skill name -> count) by scanning all JSONL session files
 * for <command-name>/name</command-name> patterns in user messages.
 */
async function buildUsageCounts() {
  const counts = {};
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');

  let projectDirs;
  try {
    projectDirs = await fs.readdir(claudeDir);
  } catch {
    return counts;
  }

  for (const dir of projectDirs) {
    const dirPath = path.join(claudeDir, dir);
    let files;
    try {
      files = await fs.readdir(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(dirPath, file);
      try {
        const rl = createInterface({
          input: createReadStream(filePath, { encoding: 'utf8' }),
          crlfDelay: Infinity,
        });
        for await (const line of rl) {
          if (!line.includes('<command-name>')) continue;
          try {
            const event = JSON.parse(line);
            // Check user message content
            const msg = event.message || event;
            let content = '';
            if (typeof msg.content === 'string') {
              content = msg.content;
            } else if (Array.isArray(msg.content)) {
              content = msg.content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('');
            }
            if (!content && typeof event.content === 'string') {
              content = event.content;
            }
            const match = CMD_NAME_RE.exec(content);
            if (match) {
              const name = match[1].trim();
              counts[name] = (counts[name] || 0) + 1;
            }
          } catch {
            // malformed JSON line — skip
          }
        }
      } catch {
        // unreadable file — skip
      }
    }
  }

  return counts;
}

/**
 * Scans skills/commands across global and per-project locations.
 * Deduplicates by file basename; collects all sources per skill.
 */
async function scanSkills(scanPath, usageCounts) {
  const skillMap = new Map();

  function mergeSkill(name, filePath, source) {
    if (skillMap.has(name)) {
      const entry = skillMap.get(name);
      if (!entry.sources.includes(source)) entry.sources.push(source);
    } else {
      skillMap.set(name, { filePath, sources: [source] });
    }
  }

  // 1. Global commands: ~/.claude/commands/
  const globalDir = path.join(os.homedir(), '.claude', 'commands');
  for (const [name, { filePath, source }] of await scanCommandsDir(globalDir, 'global')) {
    mergeSkill(name, filePath, source);
  }

  // 2. Per-project commands
  let projects = [];
  try {
    projects = await discoverProjects(scanPath);
  } catch {
    // scanPath unreadable — skip
  }

  for (const project of projects) {
    for (const subdir of ['.claude/commands', 'commands']) {
      const dir = path.join(project.path, subdir);
      for (const [name, { filePath, source }] of await scanCommandsDir(dir, project.name)) {
        mergeSkill(name, filePath, source);
      }
    }
  }

  const results = [];
  for (const [name, { filePath, sources }] of skillMap) {
    const description = await readDescription(filePath);
    results.push({
      name,
      type: 'skill',
      description,
      sources,
      usageCount: usageCounts[name] ?? 0,
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Reads hooks from a settings.json file and returns an array of hook entries.
 * Each entry: { hookEvent, command, source }
 */
async function extractHooksFromSettings(settingsPath, source) {
  const entries = [];
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    const hooks = settings.hooks || {};
    for (const [hookEvent, matchers] of Object.entries(hooks)) {
      if (!Array.isArray(matchers)) continue;
      for (const matcher of matchers) {
        const hookList = matcher.hooks || [];
        for (const hook of hookList) {
          const cmd = hook.command || hook.prompt || '';
          if (cmd) entries.push({ hookEvent, command: cmd.slice(0, 80), source });
        }
      }
    }
  } catch {
    // file missing or malformed — skip
  }
  return entries;
}

/**
 * Scans hook definitions from global and per-project settings.json files.
 * Deduplicates by hookEvent+command pair.
 */
async function scanHooks(scanPath) {
  const hookMap = new Map(); // key: "hookEvent::command" -> { hookEvent, command, sources }

  function mergeHook(hookEvent, command, source) {
    const key = `${hookEvent}::${command}`;
    if (hookMap.has(key)) {
      const entry = hookMap.get(key);
      if (!entry.sources.includes(source)) entry.sources.push(source);
    } else {
      hookMap.set(key, { hookEvent, command, sources: [source] });
    }
  }

  // Global settings
  const globalSettings = path.join(os.homedir(), '.claude', 'settings.json');
  for (const { hookEvent, command, source } of await extractHooksFromSettings(globalSettings, 'global')) {
    mergeHook(hookEvent, command, source);
  }

  // Per-project settings
  let projects = [];
  try {
    projects = await discoverProjects(scanPath);
  } catch {
    // scanPath unreadable — skip
  }

  for (const project of projects) {
    const settingsPath = path.join(project.path, '.claude', 'settings.json');
    for (const { hookEvent, command, source } of await extractHooksFromSettings(settingsPath, project.name)) {
      mergeHook(hookEvent, command, source);
    }
  }

  return Array.from(hookMap.values()).map(({ hookEvent, command, sources }) => ({
    name: hookEvent,
    type: 'hook',
    description: command,
    sources,
    usageCount: null, // hooks are automated; no invocation count
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads installed plugins from ~/.claude/plugins/installed_plugins.json.
 */
async function scanPlugins() {
  const pluginsPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  try {
    const raw = await fs.readFile(pluginsPath, 'utf8');
    const data = JSON.parse(raw);
    const plugins = data.plugins || {};
    const result = [];
    for (const [key, entries] of Object.entries(plugins)) {
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
    return [];
  }
}

/**
 * Reads global Claude settings from ~/.claude/settings.json.
 */
async function scanGlobalSettings() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Scans the full toolkit: skills, hooks, plugins, and global settings.
 */
export async function scanToolkit(config) {
  const rawScanPath = config?.scanPath || '~/Documents';
  const resolvedScanPath = rawScanPath.startsWith('~')
    ? path.join(os.homedir(), rawScanPath.slice(1))
    : rawScanPath;

  // Build usage counts first so skills can reference them
  const usageCounts = await buildUsageCounts();

  const [skills, hooks, plugins, globalSettings] = await Promise.all([
    scanSkills(resolvedScanPath, usageCounts),
    scanHooks(resolvedScanPath),
    scanPlugins(),
    scanGlobalSettings(),
  ]);

  return { skills: [...skills, ...hooks], plugins, globalSettings };
}

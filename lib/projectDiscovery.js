/**
 * Project discovery — scans a directory tree for projects that contain a .claude/ subdir.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

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
 * Recursively scans scanPath for directories containing a .claude/ subdirectory.
 * Skips: node_modules, .git, hidden directories (starting with '.') deeper than depth 0,
 * and directories beyond maxDepth levels.
 *
 * @param {string} scanPath - root path to scan (~ is expanded)
 * @param {number} [maxDepth=5] - maximum recursion depth
 * @returns {Promise<Array<{name: string, path: string, claudePath: string}>>}
 */
export async function discoverProjects(scanPath, maxDepth = 5) {
  const root = expandHome(scanPath);
  const results = [];

  async function scan(dirPath, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      // Permission denied or other error — skip silently
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const name = entry.name;

      // Skip hidden dirs (except at depth 0 where we start scanning),
      // node_modules, and .git at any depth
      if (name === 'node_modules' || name === '.git') continue;
      if (depth > 0 && name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, name);

      // Check if this directory contains a .claude/ subdirectory
      const claudePath = path.join(fullPath, '.claude');
      try {
        const stat = await fs.stat(claudePath);
        if (stat.isDirectory()) {
          results.push({
            name,
            path: fullPath,
            claudePath,
          });
          // Don't recurse into a project's own subdirectories for discovery
          // (we already found the project root)
          continue;
        }
      } catch {
        // No .claude dir here — recurse deeper
      }

      await scan(fullPath, depth + 1);
    }
  }

  await scan(root, 0);
  return results;
}

/**
 * PostgreSQL access layer for MISSION-CONTROL.
 *
 * The read path (`getAllSessions`) reconstructs session objects in the *exact*
 * shape produced by `sessionParser.parseSession`, so all of server.js's existing
 * aggregation code works unchanged — only the data source moves from local files
 * to Postgres.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool;

/**
 * Returns the shared pg connection pool, creating it on first use.
 * Connection comes from DATABASE_URL.
 * @returns {import('pg').Pool}
 */
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * Applies db/schema.sql (idempotent — uses CREATE TABLE IF NOT EXISTS).
 */
export async function migrate() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = await fs.readFile(schemaPath, 'utf8');
  await getPool().query(sql);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/**
 * Inserts a device (or updates name/key on conflict).
 * @param {{id: string, name: string, keyHash: string, isHost?: boolean}} device
 */
export async function upsertDevice({ id, name, keyHash, isHost = false }) {
  await getPool().query(
    `INSERT INTO devices (id, name, key_hash, is_host)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           key_hash = EXCLUDED.key_hash,
           is_host = EXCLUDED.is_host`,
    [id, name, keyHash, isHost]
  );
}

/**
 * Looks up a single device row (including key_hash) by id.
 * @param {string} id
 * @returns {Promise<{id: string, name: string, key_hash: string, is_host: boolean} | null>}
 */
export async function getDevice(id) {
  const { rows } = await getPool().query(
    `SELECT id, name, key_hash, is_host FROM devices WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Marks a device as recently active.
 * @param {string} id
 */
export async function touchDevice(id) {
  await getPool().query(`UPDATE devices SET last_seen = now() WHERE id = $1`, [id]);
}

/**
 * Returns all registered devices with a session count (no secrets).
 * @returns {Promise<Array<{id, name, isHost, lastSeen, sessionCount}>>}
 */
export async function getDevices() {
  const { rows } = await getPool().query(
    `SELECT d.id, d.name, d.is_host, d.last_seen,
            COUNT(s.session_id)::int AS session_count
       FROM devices d
       LEFT JOIN sessions s ON s.device_id = d.id
      GROUP BY d.id
      ORDER BY d.name`
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    isHost: r.is_host,
    lastSeen: r.last_seen,
    sessionCount: r.session_count,
  }));
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Upserts a batch of session objects for one device.
 * The full object is stored in `data`; a few columns are promoted for filtering.
 * @param {string} deviceId
 * @param {object[]} sessions - session objects in parseSession shape
 */
export async function upsertSessions(deviceId, sessions) {
  if (!sessions?.length) return;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const s of sessions) {
      await client.query(
        `INSERT INTO sessions
           (device_id, session_id, project_path, model, cost, start_time, end_time, data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (device_id, session_id) DO UPDATE
           SET project_path = EXCLUDED.project_path,
               model        = EXCLUDED.model,
               cost         = EXCLUDED.cost,
               start_time   = EXCLUDED.start_time,
               end_time     = EXCLUDED.end_time,
               data         = EXCLUDED.data,
               updated_at   = now()`,
        [
          deviceId,
          s.id,
          s.projectPath || null,
          s.model || null,
          s.cost || 0,
          s.startTime || null,
          s.endTime || null,
          JSON.stringify(s),
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns all sessions (optionally for one device) in parseSession shape,
 * with user meta (status/summary) merged in and a top-level `device` field added.
 * @param {{device?: string}} [opts]
 * @returns {Promise<object[]>}
 */
export async function getAllSessions({ device } = {}) {
  const params = [];
  let where = '';
  if (device) {
    params.push(device);
    where = `WHERE s.device_id = $1`;
  }
  const { rows } = await getPool().query(
    `SELECT s.device_id, s.data, m.status, m.summary
       FROM sessions s
       LEFT JOIN session_meta m
         ON m.device_id = s.device_id AND m.session_id = s.session_id
       ${where}`,
    params
  );

  return rows.map(r => {
    const session = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    return {
      ...session,
      device: r.device_id,
      status: r.status ?? session.status ?? null,
      summary: r.summary ?? session.summary,
    };
  });
}

// ---------------------------------------------------------------------------
// Session meta (status / summary edits)
// ---------------------------------------------------------------------------

/**
 * Sets status and/or summary for a session, preserving the other field.
 * @param {string} deviceId
 * @param {string} sessionId
 * @param {{status?: string, summary?: string}} meta
 */
export async function setMeta(deviceId, sessionId, meta) {
  // Params are fixed at $1..$4; only the SET clause varies so a status-only
  // update never clobbers an existing summary (and vice versa).
  const sets = [];
  if (meta.status !== undefined) sets.push('status = $3');
  if (meta.summary !== undefined) sets.push('summary = $4');
  if (!sets.length) return;

  await getPool().query(
    `INSERT INTO session_meta (device_id, session_id, status, summary, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (device_id, session_id) DO UPDATE
       SET ${sets.join(', ')}, updated_at = now()`,
    [deviceId, sessionId, meta.status ?? null, meta.summary ?? null]
  );
}

/**
 * Resolves which device owns a session id (sessions are keyed by device+id, but
 * the dashboard addresses them by bare session id). Returns the first match.
 * @param {string} sessionId
 * @returns {Promise<string | null>} device_id
 */
export async function findSessionDevice(sessionId) {
  const { rows } = await getPool().query(
    `SELECT device_id FROM sessions WHERE session_id = $1 LIMIT 1`,
    [sessionId]
  );
  return rows[0]?.device_id || null;
}

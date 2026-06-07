/**
 * Authentication for MISSION-CONTROL.
 *
 * Two independent mechanisms:
 *   1. Device keys  — collectors push session data with a per-device API key
 *      (Authorization: Bearer <key> + X-Device-Id: <id>). Keys are stored hashed.
 *   2. Dashboard login — browsers authenticate with a shared password and receive
 *      an HMAC-signed, HttpOnly cookie that guards the dashboard + read APIs.
 *
 * Uses only Node's built-in `crypto` — no extra dependencies.
 */

import crypto from 'crypto';
import { getDevice, touchDevice } from './db.js';

const COOKIE_NAME = 'mc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Secret hashing (scrypt)
// ---------------------------------------------------------------------------

/**
 * Hashes a secret (device key) with a random salt. Returns "salt:hash" (hex).
 * @param {string} secret
 * @returns {string}
 */
export function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verifies a secret against a stored "salt:hash" value (timing-safe).
 * @param {string} secret
 * @param {string} stored
 * @returns {boolean}
 */
export function verifySecret(secret, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/**
 * Generates a fresh random device key (url-safe).
 * @returns {string}
 */
export function generateDeviceKey() {
  return crypto.randomBytes(32).toString('base64url');
}

// ---------------------------------------------------------------------------
// Dashboard session cookie (HMAC-signed)
// ---------------------------------------------------------------------------

function sessionSecret() {
  // Prefer an explicit secret; otherwise derive a stable one from the password
  // so that changing the password invalidates existing cookies.
  const base = process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || 'mission-control-dev';
  return crypto.createHash('sha256').update(base).digest();
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Middleware & handlers
// ---------------------------------------------------------------------------

/**
 * Guards ingest endpoints: requires a valid device id + key.
 * Sets req.deviceId on success.
 */
export async function deviceAuth(req, res, next) {
  try {
    const deviceId = req.get('X-Device-Id');
    const auth = req.get('Authorization') || '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!deviceId || !key) {
      return res.status(401).json({ error: 'Missing device credentials' });
    }
    const device = await getDevice(deviceId);
    if (!device || !verifySecret(key, device.key_hash)) {
      return res.status(403).json({ error: 'Invalid device credentials' });
    }
    req.deviceId = deviceId;
    touchDevice(deviceId).catch(() => {});
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Guards the dashboard + read APIs: requires a valid signed session cookie.
 */
export function dashboardAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verifySession(cookies[COOKIE_NAME]);
  if (!payload) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/**
 * POST /api/login — verifies the dashboard password and sets the session cookie.
 */
export function loginHandler(req, res) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: 'DASHBOARD_PASSWORD not configured' });
  }
  const supplied = String(req.body?.password ?? '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = signSession({ exp: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
  res.json({ ok: true });
}

/**
 * POST /api/logout — clears the session cookie.
 */
export function logoutHandler(_req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
}

#!/usr/bin/env node
/**
 * gen-tls-cert.js — generate a self-signed certificate for the LAN listener.
 *
 * Usage: node scripts/gen-tls-cert.js   (or: npm run gen-cert)
 *
 * Outputs:
 *   ./certs/key.pem   — RSA private key
 *   ./certs/cert.pem  — self-signed X.509 certificate (~825 days)
 *
 * SANs include: localhost, 127.0.0.1, and the machine's primary LAN IPv4.
 * Requires `openssl` to be installed and on PATH.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CERTS_DIR = path.resolve('certs');
const KEY_PATH  = path.join(CERTS_DIR, 'key.pem');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');
const VALIDITY_DAYS = 825;

/** Returns the primary LAN IPv4 (first non-loopback, non-link-local IPv4). */
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        !iface.address.startsWith('169.254.')
      ) {
        return iface.address;
      }
    }
  }
  return null;
}

async function main() {
  // Verify openssl is available before doing anything else.
  try {
    await execFileAsync('openssl', ['version']);
  } catch {
    console.error(
      'Error: `openssl` not found. Install OpenSSL and ensure it is on your PATH.'
    );
    process.exit(1);
  }

  await fs.mkdir(CERTS_DIR, { recursive: true });

  const lanIp = getLanIp();
  const sans = ['DNS:localhost', 'IP:127.0.0.1'];
  if (lanIp) sans.push(`IP:${lanIp}`);

  const subjectAltName = sans.join(',');
  const subject = '/CN=mission-control-lan/O=Mission Control/OU=Self-Signed';

  console.log(`Generating self-signed certificate (${VALIDITY_DAYS} days)...`);
  console.log(`  SANs: ${subjectAltName}`);

  // Single openssl req call: generate key + self-signed cert in one shot.
  await execFileAsync('openssl', [
    'req', '-x509',
    '-newkey', 'rsa:2048',
    '-keyout', KEY_PATH,
    '-out', CERT_PATH,
    '-days', String(VALIDITY_DAYS),
    '-nodes',                    // no passphrase on the key
    '-subj', subject,
    '-addext', `subjectAltName=${subjectAltName}`,
  ]);

  console.log(`\nCertificate written:`);
  console.log(`  ${KEY_PATH}`);
  console.log(`  ${CERT_PATH}`);
  console.log(`\nTo enable TLS, add these lines to your .env and restart:\n`);
  console.log(`  TLS_CERT_FILE=./certs/cert.pem`);
  console.log(`  TLS_KEY_FILE=./certs/key.pem`);
  console.log(`\nNote: browsers will show a security warning for self-signed certs.`);
  console.log(`For production-grade TLS, front with nginx/Caddy or use Tailscale.`);
}

main().catch(err => {
  console.error('gen-tls-cert failed:', err.message);
  process.exit(1);
});

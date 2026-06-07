/**
 * Registers a device and prints its API key exactly once.
 *
 * Usage:
 *   node scripts/register-device.js --id macbook-air --name "MacBook Air"
 *   node scripts/register-device.js --id host --name "Host" --host
 *
 * Requires DATABASE_URL (see .env). The printed key is shown only here — store it
 * in that device's collector.config.json. Re-running for an existing id rotates
 * the key.
 */

import { loadEnv } from '../lib/env.js';
import { upsertDevice, migrate } from '../lib/db.js';
import { generateDeviceKey, hashSecret } from '../lib/auth.js';

loadEnv();

function parseArgs(argv) {
  const args = { host: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') args.host = true;
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--name') args.name = argv[++i];
  }
  return args;
}

async function main() {
  const { id, name, host } = parseArgs(process.argv.slice(2));
  if (!id || !name) {
    console.error('Usage: node scripts/register-device.js --id <id> --name "<name>" [--host]');
    process.exit(1);
  }

  await migrate(); // ensure tables exist
  const key = generateDeviceKey();
  await upsertDevice({ id, name, keyHash: hashSecret(key), isHost: host });

  console.log('\n✓ Device registered.\n');
  console.log(`  id:   ${id}`);
  console.log(`  name: ${name}`);
  console.log(`  host: ${host}`);
  console.log(`\n  DEVICE KEY (store this in collector.config.json — shown only once):\n`);
  console.log(`    ${key}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to register device:', err.message);
  process.exit(1);
});

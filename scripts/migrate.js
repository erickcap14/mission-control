/**
 * Applies db/schema.sql to the configured Postgres database. Idempotent.
 * Usage: npm run db:migrate  (requires DATABASE_URL)
 */

import { loadEnv } from '../lib/env.js';
import { migrate } from '../lib/db.js';

loadEnv();

migrate()
  .then(() => {
    console.log('✓ Schema applied.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });

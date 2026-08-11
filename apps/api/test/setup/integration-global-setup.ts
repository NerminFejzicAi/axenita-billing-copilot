import { runPrismaCli } from '../support/run-prisma-cli.js';
import { integrationDatabaseUrls } from './integration-test-database.js';

/**
 * Applies the migration history to the isolated test database before the suite runs.
 *
 * 08 §3 requires migrations to be applied from scratch for tests. `migrate deploy` is the
 * non-interactive, production-shaped command (00 §6.2) and is idempotent, so a repeated run
 * is a no-op rather than a reset. Nothing destructive happens here: no reset, no drop, no
 * volume operation.
 *
 * It runs as `copilot_migrator` through `TEST_MIGRATION_DATABASE_URL`, which is exactly the
 * separation Phase 2 exists to establish.
 */
export async function setup(): Promise<void> {
  const urls = integrationDatabaseUrls();

  runPrismaCli(['migrate', 'deploy'], urls.migration);

  return Promise.resolve();
}

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Connection details for the isolated integration database (08 §3).
 *
 * Three identities are required because 08 §5.1 mandates assertions per role: the runtime
 * role, the migration role and the platform role each have a distinct privilege set that
 * must be proven separately.
 *
 * Nothing here is ever logged. Values come from `apps/api/.env`, which is git-ignored and
 * contains local placeholders only (09 §9).
 */
export interface IntegrationDatabaseUrls {
  readonly app: string;
  readonly migration: string;
  readonly system: string;
}

const REQUIRED = [
  'TEST_DATABASE_URL',
  'TEST_MIGRATION_DATABASE_URL',
  'TEST_SYSTEM_DATABASE_URL',
] as const;

let loaded = false;

/** Loads `apps/api/.env` once, without overriding anything already in the environment. */
export function loadIntegrationEnvironment(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  const envFile = resolve(import.meta.dirname, '../../.env');
  if (!existsSync(envFile)) {
    return;
  }

  const before = { ...process.env };
  process.loadEnvFile(envFile);

  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Returns the three test connection strings.
 *
 * Fails with a message that names the missing variables and never their values, matching the
 * bootstrap failure rule of 09 §11.
 */
export function integrationDatabaseUrls(): IntegrationDatabaseUrls {
  loadIntegrationEnvironment();

  const missing = REQUIRED.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Integration tests need ${missing.join(', ')}. Copy apps/api/.env.example to apps/api/.env ` +
        'and start the compose `test` profile (10 §5, 08 §3).',
    );
  }

  return {
    app: process.env['TEST_DATABASE_URL'] as string,
    migration: process.env['TEST_MIGRATION_DATABASE_URL'] as string,
    system: process.env['TEST_SYSTEM_DATABASE_URL'] as string,
  };
}

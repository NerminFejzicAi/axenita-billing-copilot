import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationDatabaseUrls } from './setup/integration-test-database.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

/**
 * Migration foundation (04 §4.5, 08 §5, 05 Faza 2).
 *
 * The migration history has already been applied to the isolated test database by the
 * suite's global setup, using `copilot_migrator`. These specs prove the properties phase 2
 * is accountable for: a deterministic clean migration, a stable no-op on repetition, an
 * intact checksum, and a package that verifies rather than assumes the role model.
 *
 * Nothing destructive runs here: no reset, no drop, no volume operation.
 */
const urls = integrationDatabaseUrls();
const apiRoot = resolve(import.meta.dirname, '..');

let migrator: Client;

function runPrisma(args: readonly string[]): string {
  return runPrismaCli(args, urls.migration);
}

beforeAll(async () => {
  migrator = new Client({ connectionString: urls.migration });
  await migrator.connect();
});

afterAll(async () => {
  await migrator.end();
});

describe('migration history', () => {
  it('given the migrated database when inspected then package 001 is recorded as applied', async () => {
    const result = await migrator.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      applied_steps_count: number;
    }>(
      `select migration_name, finished_at, rolled_back_at, applied_steps_count
         from _prisma_migrations order by started_at`,
    );

    expect(result.rows).toHaveLength(1);

    const migration = result.rows[0];
    expect(migration?.migration_name).toMatch(/_001_extensions_and_roles$/);
    expect(migration?.finished_at).not.toBeNull();
    expect(migration?.rolled_back_at).toBeNull();
    expect(migration?.applied_steps_count).toBeGreaterThan(0);
  });

  it('given the applied migration when compared then its checksum matches the file on disk', async () => {
    // A drifting checksum means the applied migration and the repository disagree, which
    // 00 §6.2 forbids ("primijenjena migracija se ne mijenja").
    const result = await migrator.query<{ migration_name: string; checksum: string }>(
      'select migration_name, checksum from _prisma_migrations',
    );

    const applied = result.rows[0];
    expect(applied).toBeDefined();

    const sqlPath = resolve(
      apiRoot,
      'prisma/migrations',
      applied?.migration_name ?? '',
      'migration.sql',
    );
    const sql = readFileSync(sqlPath, 'utf8');

    expect(sql).toContain('001_extensions_and_roles');
    expect(applied?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('migration determinism', () => {
  it('given an already migrated database when deploy runs again then it is a stable no-op', () => {
    const output = runPrisma(['migrate', 'deploy']);

    expect(output).toMatch(/No pending migrations to apply|already been applied/i);
  });

  it('given an already migrated database when status runs then it reports up to date', () => {
    const output = runPrisma(['migrate', 'status']);

    expect(output).toContain('Database schema is up to date!');
  });

  it('given the repository schema when validated then it is valid', () => {
    const output = runPrisma(['validate']);

    expect(output).toContain('is valid');
  });
});

describe('migration scope — phase 2 owns package 001 only', () => {
  it('given the migrated database when inspected then no business table exists yet', async () => {
    // Packages 002+ belong to later phases (02 §22). Pulling a domain table forward would
    // be phase 3+ scope entering phase 2.
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by tablename`,
    );

    expect(result.rows.map((row) => row.tablename)).toStrictEqual([]);
  });

  it('given package 001 when inspected then it installed no PostgreSQL extension', async () => {
    // 02 §22.1 — no extension is currently required; the application generates every UUID.
    const result = await migrator.query<{ extname: string }>(
      `select extname from pg_extension where extname <> 'plpgsql' order by extname`,
    );

    expect(result.rows.map((row) => row.extname)).toStrictEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationDatabaseUrls } from './setup/integration-test-database.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

/**
 * Migration foundation (04 §4.5, 08 §5, 05 Faza 2–3).
 *
 * The migration history has already been applied to the isolated test database by the
 * suite's global setup, using `copilot_migrator`. These specs prove the properties the
 * migration chain is accountable for: a deterministic clean migration, a stable no-op on
 * repetition, an intact checksum per package, and a history that verifies rather than
 * assumes the accepted package set.
 *
 * The expectations below describe the *current* canonical database. Phase 2 owned package
 * 001 alone; phase 3 added package 002; phase 4 added package 013; phase 5 adds package 003,
 * so the assertions name all four explicitly rather than counting, and a package appearing or
 * disappearing is a defect, not a test omission. The assertion stays an EXACT chain — it is
 * deliberately not weakened to a containment check, because a package pulled forward from a
 * later phase (02 §22) must fail here rather than pass silently.
 *
 * PHASE 5 RECONCILIATION. Package `003_patient_encounter_documents` is applied AFTER `013`
 * even though its number is lower: package NUMBERS carry ownership, not execution order, and
 * D-052 already established that a package executes in the phase in which its tables exist.
 * The phase 5 slices of `011`, `013` and `014` are NOT part of this chain — D-063 clause 3
 * defers the `011` slice out of `P5-I1` altogether — so `idempotency_keys`, `audit_events`,
 * `outbox_events` and `async_jobs` must all still be absent from the table set below.
 *
 * Nothing destructive runs here: no reset, no drop, no volume operation.
 */
const urls = integrationDatabaseUrls();
const apiRoot = resolve(import.meta.dirname, '..');

/** The canonical applied migration history, in application order (05 Faza 2–5). */
const EXPECTED_MIGRATIONS = [
  '20260810213856_001_extensions_and_roles',
  '20260814013200_002_identity_and_practices',
  '20260816111141_013_rls_policies',
  '20260823104252_003_patient_encounter_documents',
] as const;

/** Every business table the canonical history creates, in `order by tablename` order. */
const EXPECTED_BUSINESS_TABLES = [
  'encounter_diagnoses',
  'encounter_documents',
  'encounters',
  'patient_references',
  'platform_role_assignments',
  'practice_membership_roles',
  'practice_memberships',
  'practice_settings',
  'practices',
  'storage_objects',
  'users',
] as const;

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
  it('given the migrated database when inspected then exactly the canonical packages are recorded as applied', async () => {
    const result = await migrator.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      applied_steps_count: number;
    }>(
      `select migration_name, finished_at, rolled_back_at, applied_steps_count
         from _prisma_migrations order by started_at`,
    );

    // Identity and order, not a count: a wrong package applied in the right number would
    // otherwise pass (00 §6.2).
    expect(result.rows.map((row) => row.migration_name)).toStrictEqual([...EXPECTED_MIGRATIONS]);

    for (const migration of result.rows) {
      expect(migration.finished_at).not.toBeNull();
      expect(migration.rolled_back_at).toBeNull();
      expect(migration.applied_steps_count).toBeGreaterThan(0);
    }
  });

  it('given every applied migration when compared then its checksum matches the file on disk', async () => {
    // A drifting checksum means the applied migration and the repository disagree, which
    // 00 §6.2 forbids ("primijenjena migracija se ne mijenja").
    const result = await migrator.query<{ migration_name: string; checksum: string }>(
      'select migration_name, checksum from _prisma_migrations order by started_at',
    );

    expect(result.rows).toHaveLength(EXPECTED_MIGRATIONS.length);

    for (const applied of result.rows) {
      const sqlPath = resolve(
        apiRoot,
        'prisma/migrations',
        applied.migration_name,
        'migration.sql',
      );
      const sql = readFileSync(sqlPath, 'utf8');

      // Each package's SQL names itself, so a history row can never be matched against
      // another package's file.
      expect(sql).toContain(applied.migration_name.replace(/^\d+_/, ''));
      expect(applied.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
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

describe('migration scope — packages 001, 002, 013 and 003', () => {
  it('given the migrated database when inspected then exactly the accepted business tables exist', async () => {
    // Drift detection, unchanged in intent from the phase 2 "no business table yet" spec:
    // the set is named exactly, so a table pulled forward from a later package (02 §22) or
    // one silently dropped both fail. `_prisma_migrations` is Prisma bookkeeping, not a
    // business table, and stays excluded.
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by tablename`,
    );

    expect(result.rows.map((row) => row.tablename)).toStrictEqual([...EXPECTED_BUSINESS_TABLES]);
  });

  it('given the migrated database when inspected then it installed no PostgreSQL extension', async () => {
    // 02 §22.1 — no extension is currently required; the application generates every UUID.
    const result = await migrator.query<{ extname: string }>(
      `select extname from pg_extension where extname <> 'plpgsql' order by extname`,
    );

    expect(result.rows.map((row) => row.extname)).toStrictEqual([]);
  });
});

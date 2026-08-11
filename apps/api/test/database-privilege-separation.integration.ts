import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationDatabaseUrls } from './setup/integration-test-database.js';

/**
 * Privilege separation between the migration identity and the runtime identities
 * (D-005, D-023, 02 §3.5, 05 Faza 2 "runtime not owner" / "runtime CREATE TABLE denied").
 *
 * These are the negative tests 08 §5.1 demands: the assertion is on the exact privilege
 * set, and a *wider* grant than the accepted least-privilege model must fail the test.
 *
 * Every statement runs inside a transaction that is rolled back, so the suite leaves the
 * database exactly as it found it. Nothing destructive is executed.
 */
const urls = integrationDatabaseUrls();

let app: Client;
let system: Client;
let migrator: Client;

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/** Runs a statement and returns the PostgreSQL SQLSTATE, or `undefined` when it succeeded. */
async function sqlStateOf(client: Client, statement: string): Promise<string | undefined> {
  try {
    await client.query('begin');
    await client.query(statement);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await client.query('rollback');
  }
}

const INSUFFICIENT_PRIVILEGE = '42501';

beforeAll(async () => {
  [app, system, migrator] = await Promise.all([
    connect(urls.app),
    connect(urls.system),
    connect(urls.migration),
  ]);
});

afterAll(async () => {
  await Promise.all([app.end(), system.end(), migrator.end()]);
});

describe('runtime identity — connection', () => {
  it('given DATABASE_URL when connected then the session runs as copilot_app', async () => {
    const result = await app.query<{ current_user: string }>('select current_user');

    expect(result.rows[0]?.current_user).toBe('copilot_app');
  });

  it('given the runtime session when inspected then it is not a superuser', async () => {
    const result = await app.query<{ is_super: boolean }>(
      `select rolsuper as is_super from pg_roles where rolname = current_user`,
    );

    expect(result.rows[0]?.is_super).toBe(false);
  });

  it('given the runtime session when it runs a trivial query then it succeeds', async () => {
    const result = await app.query<{ value: number }>('select 1 as value');

    expect(result.rows[0]?.value).toBe(1);
  });
});

describe('runtime identity — DDL is denied (05 Faza 2)', () => {
  it('given copilot_app when it attempts CREATE TABLE then it is denied', async () => {
    await expect(
      sqlStateOf(app, 'create table phase2_privilege_probe (id uuid primary key)'),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_app when it attempts CREATE SCHEMA then it is denied', async () => {
    await expect(sqlStateOf(app, 'create schema phase2_privilege_probe')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_app when it attempts to change the migration history then it is denied', async () => {
    // `_prisma_migrations` is owned by copilot_migrator. The runtime role must not be able
    // to read or rewrite the migration record.
    const state = await sqlStateOf(app, 'select * from _prisma_migrations limit 1');

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_system when it attempts CREATE TABLE then it is denied', async () => {
    await expect(
      sqlStateOf(system, 'create table phase2_privilege_probe (id uuid primary key)'),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_system when connected then the session runs as copilot_system', async () => {
    const result = await system.query<{ current_user: string }>('select current_user');

    expect(result.rows[0]?.current_user).toBe('copilot_system');
  });
});

describe('runtime identity — role administration is denied (02 §3.2, §3.3)', () => {
  it.each([
    ['copilot_app', () => app],
    ['copilot_system', () => system],
  ])('given %s when it attempts to create a role then it is denied', async (_name, clientOf) => {
    const state = await sqlStateOf(
      clientOf(),
      "create role phase2_privilege_probe login password 'x'",
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_app when it attempts to grant itself BYPASSRLS then it is denied', async () => {
    const state = await sqlStateOf(app, 'alter role copilot_app bypassrls');

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('migration identity — required capabilities (02 §3.1)', () => {
  it('given MIGRATION_DATABASE_URL when connected then the session runs as copilot_migrator', async () => {
    const result = await migrator.query<{ current_user: string }>('select current_user');

    expect(result.rows[0]?.current_user).toBe('copilot_migrator');
  });

  it('given copilot_migrator when it creates and drops a table then it succeeds', async () => {
    // Rolled back, so the schema is untouched. This proves the migration identity can do
    // what migrations require, which is the other half of the separation.
    await expect(
      sqlStateOf(migrator, 'create table phase2_privilege_probe (id uuid primary key)'),
    ).resolves.toBeUndefined();
  });

  it('given copilot_migrator when it reads the migration history then it succeeds', async () => {
    const result = await migrator.query<{ count: string }>(
      'select count(*)::text as count from _prisma_migrations',
    );

    expect(Number(result.rows[0]?.count)).toBeGreaterThanOrEqual(1);
  });

  it('given copilot_migrator when it attempts to create a role then it is denied', async () => {
    // NOCREATEROLE (02 §3.1) — this is why role creation is a bootstrap concern and not a
    // Prisma migration.
    const state = await sqlStateOf(
      migrator,
      "create role phase2_privilege_probe login password 'x'",
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('privilege separation — no leftovers', () => {
  it('given the completed suite when inspected then no probe object survived', async () => {
    const result = await migrator.query<{ count: string }>(
      `select count(*)::text as count from pg_tables where tablename like 'phase2_privilege_probe%'`,
    );

    expect(result.rows[0]?.count).toBe('0');
  });
});

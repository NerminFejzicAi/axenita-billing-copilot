import { Client } from 'pg';

import { integrationDatabaseUrls } from '../setup/integration-test-database.js';

/**
 * Disposable database lifecycle for the phase 3 security suite (08 §3, 02 §26.3 step 5, 10 §6).
 *
 * WHY A DISPOSABLE DATABASE AND NOT THE SHARED TEST DATABASE
 *
 * The phase 3 security proofs are not read-only. They seed rows, they open and abort D-048
 * maintenance windows, and they revoke and restore a grant inside a rolled-back transaction.
 * A suite that does that must own its database outright, so it is created empty, migrated
 * from `001` onward, seeded, and dropped again. Neither the development database `copilot`
 * nor the shared integration database `copilot_test` is ever the target.
 *
 * WHY NO SUPERUSER IS INVOLVED
 *
 * `copilot_migrator` is `CREATEDB` (02 §3.1), so it can create and drop its own database and
 * it owns what it creates. Everything this module executes is therefore performed by the
 * ordinary migration identity. No fourth credential is introduced, and in particular no
 * superuser seed or test credential exists (02 §3.4, D-048 clause 1).
 *
 * The three application roles themselves are cluster level and are NOT created here: 02 §22.1
 * assigns role creation to the bootstrap superuser through
 * `infra/database/init/roles_and_privileges.psql`, and migration `001_extensions_and_roles`
 * verifies the result and fails loudly when it is absent. This module only replays the
 * DATABASE-scoped half of that canonical file — sections 4 and 5, ownership, `CONNECT` and
 * schema `USAGE` — which is precisely the part a brand new database is missing and the part
 * `copilot_migrator` is allowed to perform on a database it owns. No role attribute is
 * changed anywhere, and no guard of migration `001` is weakened for it.
 */

/**
 * Hosts a disposable database may live on. Anything else aborts before a connection is
 * opened. This, together with the name rule below, is what makes accidental execution
 * against a shared or remote database impossible rather than merely unlikely.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/**
 * The disposable naming rule. A database this suite is willing to create, mutate or drop must
 * announce itself as disposable in its own name, so `copilot` and `copilot_test` can never
 * match by accident.
 */
const DISPOSABLE_NAME_PATTERN = /^copilot_gate3b_[0-9a-z]+$/;

/** Databases that must never be a target, whatever else the configuration says. */
const PROTECTED_DATABASES: ReadonlySet<string> = new Set(['copilot', 'copilot_test', 'postgres']);

/** The database used to open the create/drop connection; it is never itself a target. */
const MAINTENANCE_DATABASE = 'postgres';

export interface DisposableDatabase {
  readonly name: string;
  /** `copilot_app` — the runtime identity under test. */
  readonly app: string;
  /** `copilot_migrator` — migrations, seed and trusted maintenance. */
  readonly migration: string;
  /** `copilot_system` — the platform identity. */
  readonly system: string;
}

/**
 * Fails unless `connectionString` points at a local disposable database.
 *
 * Exported because the suite asserts the guard itself: a harness that silently accepts a
 * remote host is worth nothing, so the refusal has to be a tested behaviour.
 */
export function assertDisposableTarget(connectionString: string): void {
  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Disposable database target is not a parsable PostgreSQL connection URL.');
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    // The message names the host and never the credential (09 §9, §11).
    throw new Error(
      `Refusing to use host "${url.hostname}". The phase 3 security suite runs only against ` +
        'localhost or 127.0.0.1 (08 §3).',
    );
  }

  const name = url.pathname.replace(/^\//, '');

  if (PROTECTED_DATABASES.has(name)) {
    throw new Error(
      `Refusing to use database "${name}". It is a shared database, not a disposable one.`,
    );
  }

  if (!DISPOSABLE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Refusing to use database "${name}". A disposable database must be named ` +
        `copilot_gate3b_<suffix> (${DISPOSABLE_NAME_PATTERN.source}).`,
    );
  }
}

/** Replaces the database of a known-good local connection string. */
function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Derives the three identities for `name` from the isolated test configuration.
 *
 * The credentials are reused verbatim from `TEST_*_DATABASE_URL`, so this module holds no
 * password of its own and adds no environment variable (09 §9).
 */
export function disposableDatabaseUrls(name: string): DisposableDatabase {
  const urls = integrationDatabaseUrls();

  const disposable: DisposableDatabase = {
    name,
    app: withDatabase(urls.app, name),
    migration: withDatabase(urls.migration, name),
    system: withDatabase(urls.system, name),
  };

  assertDisposableTarget(disposable.app);
  assertDisposableTarget(disposable.migration);
  assertDisposableTarget(disposable.system);

  return disposable;
}

/** A unique, obviously disposable name for one suite run. */
export function generateDisposableDatabaseName(): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);

  return `copilot_gate3b_${stamp}${noise}`;
}

async function withMaintenanceClient<T>(
  migrationUrl: string,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: withDatabase(migrationUrl, MAINTENANCE_DATABASE),
  });
  await client.connect();

  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates the disposable database and applies the database-scoped bootstrap of
 * `infra/database/init/roles_and_privileges.psql` §4–§5.
 *
 * Nothing here grants a table privilege: 02 §20 requires every table grant to be declared by
 * the migration package that creates the table, and migration `001` fails when a DEFAULT
 * PRIVILEGE would pre-grant a future table. The bootstrap therefore stops at ownership,
 * `CONNECT` and schema `USAGE`, exactly like the canonical file.
 */
export async function createDisposableDatabase(name: string): Promise<DisposableDatabase> {
  const disposable = disposableDatabaseUrls(name);

  await withMaintenanceClient(disposable.migration, async (client) => {
    // `create database` cannot run inside a transaction block, which is why this one
    // statement stands alone.
    await client.query(`create database "${name}"`);

    // §4 — least privilege CONNECT. PUBLIC gets nothing.
    await client.query(`revoke all on database "${name}" from public`);
    await client.query(
      `grant connect on database "${name}" to "copilot_migrator", "copilot_app", "copilot_system"`,
    );
  });

  const owner = new Client({ connectionString: disposable.migration });
  await owner.connect();

  try {
    // §5 — schema ownership and least privilege USAGE. Runtime roles may resolve objects but
    // may never create them.
    await owner.query('alter schema public owner to "copilot_migrator"');
    await owner.query('revoke all on schema public from public');
    await owner.query('grant usage, create on schema public to "copilot_migrator"');
    await owner.query('grant usage on schema public to "copilot_app"');
    await owner.query('grant usage on schema public to "copilot_system"');
  } finally {
    await owner.end();
  }

  return disposable;
}

/**
 * Drops the disposable database.
 *
 * `assertDisposableTarget` runs again here rather than trusting the caller, because this is
 * the only destructive statement in the suite.
 */
export async function dropDisposableDatabase(disposable: DisposableDatabase): Promise<void> {
  assertDisposableTarget(disposable.migration);

  await withMaintenanceClient(disposable.migration, async (client) => {
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [disposable.name],
    );
    await client.query(`drop database if exists "${disposable.name}"`);
  });
}

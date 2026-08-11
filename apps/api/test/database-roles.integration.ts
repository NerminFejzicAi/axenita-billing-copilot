import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { integrationDatabaseUrls } from './setup/integration-test-database.js';

/**
 * Database role verification (08 §5.1, D-023).
 *
 * 08 §5.1 is explicit that this must be proven against a real database with real
 * connections, not inferred from static SQL inspection or from a successful migration.
 *
 * The accepted model has **three** roles (02 §3.1–§3.3). A missing role is a migration
 * defect, not a test omission.
 */
const urls = integrationDatabaseUrls();

interface RoleAttributes {
  readonly rolcanlogin: boolean;
  readonly rolsuper: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolinherit: boolean;
  readonly rolbypassrls: boolean;
}

let migrator: Client;

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function attributesOf(role: string): Promise<RoleAttributes | undefined> {
  const result = await migrator.query<RoleAttributes>(
    `select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
       from pg_roles where rolname = $1`,
    [role],
  );

  return result.rows[0];
}

beforeAll(async () => {
  migrator = await connect(urls.migration);
});

afterAll(async () => {
  await migrator.end();
});

describe('database roles — existence (D-023 clause 3)', () => {
  it.each(['copilot_migrator', 'copilot_app', 'copilot_system'])(
    'given the migrated database when inspected then role %s exists',
    async (role) => {
      await expect(attributesOf(role)).resolves.toBeDefined();
    },
  );

  it('given the accepted model when counted then exactly the three roles are present', async () => {
    const result = await migrator.query<{ rolname: string }>(
      `select rolname from pg_roles where rolname like 'copilot%' order by rolname`,
    );

    expect(result.rows.map((row) => row.rolname)).toStrictEqual([
      'copilot_app',
      'copilot_migrator',
      'copilot_system',
    ]);
  });
});

describe('database roles — attributes (02 §3.1–§3.3, 08 §5.1)', () => {
  it('given copilot_migrator when inspected then it matches 02 §3.1 exactly', async () => {
    await expect(attributesOf('copilot_migrator')).resolves.toStrictEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: true,
      rolcreaterole: false,
      rolinherit: true,
      rolbypassrls: false,
    });
  });

  it.each(['copilot_app', 'copilot_system'])(
    'given runtime role %s when inspected then it matches the 08 §5.1 attribute set exactly',
    async (role) => {
      await expect(attributesOf(role)).resolves.toStrictEqual({
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolbypassrls: false,
      });
    },
  );

  it('given the runtime roles when inspected then none can bypass RLS', async () => {
    // Tenant isolation in phase 4 rests on this being false (02 §3.5, D-006).
    const result = await migrator.query<{ rolname: string; rolbypassrls: boolean }>(
      `select rolname, rolbypassrls from pg_roles where rolname in ('copilot_app','copilot_system')`,
    );

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.rolbypassrls).toBe(false);
    }
  });
});

describe('database roles — ownership (02 §3.5)', () => {
  it('given schema public when inspected then copilot_migrator owns it', async () => {
    const result = await migrator.query<{ owner: string }>(
      `select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'public'`,
    );

    expect(result.rows[0]?.owner).toBe('copilot_migrator');
  });

  it('given the database when inspected then no runtime role owns any table', async () => {
    const result = await migrator.query<{ count: string }>(
      `select count(*)::text as count from pg_tables
        where schemaname not in ('pg_catalog','information_schema')
          and tableowner in ('copilot_app','copilot_system')`,
    );

    expect(result.rows[0]?.count).toBe('0');
  });
});

describe('database roles — no blanket privileges (02 §3.5, §20)', () => {
  it('given PUBLIC when inspected then it holds nothing on schema public', async () => {
    const result = await migrator.query<{ create_priv: boolean; usage_priv: boolean }>(
      `select has_schema_privilege('public','public','CREATE') as create_priv,
              has_schema_privilege('public','public','USAGE')  as usage_priv`,
    );

    expect(result.rows[0]).toStrictEqual({ create_priv: false, usage_priv: false });
  });

  it('given the runtime roles when inspected then they may resolve but not create objects', async () => {
    const result = await migrator.query<{
      app_create: boolean;
      app_usage: boolean;
      system_create: boolean;
      system_usage: boolean;
    }>(
      `select has_schema_privilege('copilot_app','public','CREATE')    as app_create,
              has_schema_privilege('copilot_app','public','USAGE')     as app_usage,
              has_schema_privilege('copilot_system','public','CREATE') as system_create,
              has_schema_privilege('copilot_system','public','USAGE')  as system_usage`,
    );

    expect(result.rows[0]).toStrictEqual({
      app_create: false,
      app_usage: true,
      system_create: false,
      system_usage: true,
    });
  });

  it('given schema public when inspected then no default privileges pre-grant future tables', async () => {
    // 02 §20 — every table grant belongs to the package that creates the table, so a future
    // tenant table must never become readable merely by existing.
    const result = await migrator.query<{ count: string }>(
      `select count(*)::text as count
         from pg_default_acl acl
         join pg_namespace ns on ns.oid = acl.defaclnamespace
        where ns.nspname = 'public'`,
    );

    expect(result.rows[0]?.count).toBe('0');
  });

  it('given copilot_system when inspected then it holds no table grant at all', async () => {
    // D-023: platform administration is separated from access to medical data. Phase 2
    // creates no tenant table yet, so the correct assertion today is "no grants at all";
    // the per-table matrix of 02 §20.2 is enforced by the packages that create the tables.
    const result = await migrator.query<{ count: string }>(
      `select count(*)::text as count from information_schema.role_table_grants
        where grantee = 'copilot_system'`,
    );

    expect(result.rows[0]?.count).toBe('0');
  });
});

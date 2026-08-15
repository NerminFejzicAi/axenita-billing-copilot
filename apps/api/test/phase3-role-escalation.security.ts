import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  INSUFFICIENT_PRIVILEGE,
  connect,
  securityDatabase,
  sqlStateOf,
} from './support/phase3-security-context.js';

/**
 * Role membership and `SET ROLE` escalation (02 §3.1-§3.5, §20.4).
 *
 * Migration `001_extensions_and_roles` asserts the ATTRIBUTES of the three roles but does not
 * assert the absence of `pg_auth_members` rows between them. Attributes alone are not the whole
 * story: a `GRANT copilot_migrator TO copilot_app` would leave every attribute check green
 * while handing the runtime identity the table owner's rights through `SET ROLE`.
 *
 * Migration `001` is deliberately NOT changed for this. The gap is closed here instead, as a
 * live regression test over the real catalogue, which is also where a grant made after the
 * migration ran would show up.
 */
const database = securityDatabase();

const PROJECT_ROLES = ['copilot_migrator', 'copilot_app', 'copilot_system'] as const;

let app: Client;
let system: Client;
let migrator: Client;

beforeAll(async () => {
  [app, system, migrator] = await Promise.all([
    connect(database.app),
    connect(database.system),
    connect(database.migration),
  ]);
});

afterAll(async () => {
  await Promise.all([app.end(), system.end(), migrator.end()]);
});

describe('role attributes (02 §3.1-§3.3)', () => {
  it('given the three project roles then each carries exactly its accepted attribute set', async () => {
    const result = await migrator.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
      rolcanlogin: boolean;
      rolbypassrls: boolean;
    }>(
      `select rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin, rolbypassrls
         from pg_roles where rolname = any($1::text[]) order by rolname`,
      [[...PROJECT_ROLES]],
    );

    expect(result.rows).toStrictEqual([
      {
        rolname: 'copilot_app',
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolcanlogin: true,
        rolbypassrls: false,
      },
      {
        rolname: 'copilot_migrator',
        rolsuper: false,
        rolcreatedb: true,
        rolcreaterole: false,
        rolinherit: true,
        rolcanlogin: true,
        rolbypassrls: false,
      },
      {
        rolname: 'copilot_system',
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolcanlogin: true,
        rolbypassrls: false,
      },
    ]);
  });
});

describe('pg_auth_members — no project role inherits another', () => {
  it('given pg_auth_members then no project role is a member of any other role', async () => {
    const result = await migrator.query<{ member: string; granted_role: string }>(
      `select r.rolname as member, g.rolname as granted_role
         from pg_auth_members m
         join pg_roles r on r.oid = m.member
         join pg_roles g on g.oid = m.roleid
        where r.rolname = any($1::text[])
        order by 1, 2`,
      [[...PROJECT_ROLES]],
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given pg_auth_members then no role was granted INTO a project role either', async () => {
    // The reverse direction matters too: granting an arbitrary role INTO `copilot_migrator`
    // would widen what the table owner can reach.
    const result = await migrator.query<{ member: string; granted_role: string }>(
      `select r.rolname as member, g.rolname as granted_role
         from pg_auth_members m
         join pg_roles r on r.oid = m.member
         join pg_roles g on g.oid = m.roleid
        where g.rolname = any($1::text[])
        order by 1, 2`,
      [[...PROJECT_ROLES]],
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the runtime roles then pg_has_role reports no usable membership in the other identities', async () => {
    const result = await migrator.query<{
      app_in_migrator: boolean;
      app_in_system: boolean;
      system_in_migrator: boolean;
      system_in_app: boolean;
      migrator_in_app: boolean;
      migrator_in_system: boolean;
    }>(
      `select pg_has_role('copilot_app', 'copilot_migrator', 'USAGE') as app_in_migrator,
              pg_has_role('copilot_app', 'copilot_system', 'USAGE') as app_in_system,
              pg_has_role('copilot_system', 'copilot_migrator', 'USAGE') as system_in_migrator,
              pg_has_role('copilot_system', 'copilot_app', 'USAGE') as system_in_app,
              pg_has_role('copilot_migrator', 'copilot_app', 'USAGE') as migrator_in_app,
              pg_has_role('copilot_migrator', 'copilot_system', 'USAGE') as migrator_in_system`,
    );

    expect(result.rows[0]).toStrictEqual({
      app_in_migrator: false,
      app_in_system: false,
      system_in_migrator: false,
      system_in_app: false,
      migrator_in_app: false,
      migrator_in_system: false,
    });
  });
});

describe('SET ROLE cannot escalate (02 §3.5, §20.4)', () => {
  it.each(['copilot_migrator', 'copilot_system', 'postgres'])(
    'given copilot_app when it attempts SET ROLE %s then it is denied',
    async (target) => {
      await expect(sqlStateOf(app, `set role "${target}"`)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it.each(['copilot_migrator', 'copilot_app', 'postgres'])(
    'given copilot_system when it attempts SET ROLE %s then it is denied',
    async (target) => {
      await expect(sqlStateOf(system, `set role "${target}"`)).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it('given copilot_app when it attempts SET SESSION AUTHORIZATION then it is denied', async () => {
    await expect(sqlStateOf(app, 'set session authorization "copilot_migrator"')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_app when it attempts to grant itself the migrator role then it is denied', async () => {
    await expect(sqlStateOf(app, 'grant copilot_migrator to copilot_app')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_migrator when it attempts to grant a role then it is denied', async () => {
    // NOCREATEROLE (02 §3.1) — this is why role administration is a bootstrap concern and
    // why the migration identity cannot widen its own reach.
    await expect(sqlStateOf(migrator, 'grant copilot_app to copilot_system')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_app when it attempts to grant itself BYPASSRLS then it is denied', async () => {
    await expect(sqlStateOf(app, 'alter role copilot_app bypassrls')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_app when it reads the migration history then it is denied', async () => {
    await expect(sqlStateOf(app, 'select * from _prisma_migrations limit 1')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

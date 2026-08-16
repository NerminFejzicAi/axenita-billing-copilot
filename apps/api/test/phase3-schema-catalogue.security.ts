import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, securityDatabase } from './support/phase3-security-context.js';

/**
 * Mechanical verification of migration package `002_identity_and_practices` (02 §22.2, §26.3
 * step 7; 08 §21.5.1, §21.6.1, §21.6.5, §21.7.2).
 *
 * These are catalogue assertions, not behaviour assertions: the schema, the ownership, the
 * grant surface, the RLS flags and the policy set are read straight out of `pg_catalog` and
 * compared against the accepted model, exactly. A WIDER grant than the least-privilege model
 * must fail the test, which is why every assertion is `toStrictEqual` on a full set rather
 * than a containment check (08 §5.1).
 */
const database = securityDatabase();

let migrator: Client;

beforeAll(async () => {
  migrator = await connect(database.migration);
});

afterAll(async () => {
  await migrator.end();
});

describe('migration history', () => {
  it('given the disposable database when migrated then exactly packages 001 and 002 are applied', async () => {
    const result = await migrator.query<{
      migration_name: string;
      finished: boolean;
      rolled_back: boolean;
    }>(
      `select migration_name,
              (finished_at is not null) as finished,
              (rolled_back_at is not null) as rolled_back
         from _prisma_migrations
        order by started_at`,
    );

    expect(result.rows.map((row) => row.migration_name)).toStrictEqual([
      '20260810213856_001_extensions_and_roles',
      '20260814013200_002_identity_and_practices',
    ]);
    expect(result.rows.every((row) => row.finished && !row.rolled_back)).toBe(true);
  });
});

describe('enums (02 §4.1, §4.2, §4.16)', () => {
  it('given package 002 when applied then the three phase 3 enums carry exactly their accepted values', async () => {
    const result = await migrator.query<{ typname: string; values: string }>(
      `select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as values
         from pg_type t
         join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname
        order by t.typname`,
    );

    expect(result.rows).toStrictEqual([
      { typname: 'entity_status', values: 'ACTIVE,INACTIVE,SUSPENDED,ARCHIVED' },
      {
        typname: 'membership_role',
        values: 'PRACTICE_ADMIN,PHYSICIAN,MPA,BILLING_SPECIALIST,AUDITOR,READ_ONLY',
      },
      // `SYSTEM_ADMIN` is a PLATFORM role and must never appear in `membership_role`
      // (D-038 clause 12).
      { typname: 'platform_role', values: 'SYSTEM_ADMIN' },
    ]);
  });
});

describe('tables and ownership (02 §3.5, §6.1-§6.5)', () => {
  it('given package 002 when applied then exactly the six phase 3 tables exist', async () => {
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by tablename`,
    );

    expect(result.rows.map((row) => row.tablename)).toStrictEqual([
      'platform_role_assignments',
      'practice_membership_roles',
      'practice_memberships',
      'practice_settings',
      'practices',
      'users',
    ]);
  });

  it('given every phase 3 table when inspected then copilot_migrator owns it and no runtime role does', async () => {
    const result = await migrator.query<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner from pg_tables
        where schemaname not in ('pg_catalog', 'information_schema')
        order by tablename`,
    );

    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.tableowner).toBe('copilot_migrator');
    }
  });

  it('given schema public when inspected then copilot_migrator owns it', async () => {
    const result = await migrator.query<{ owner: string }>(
      `select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'public'`,
    );

    expect(result.rows[0]?.owner).toBe('copilot_migrator');
  });
});

describe('constraints and indexes (02 §6.1-§6.5, §21, §22.2)', () => {
  it('given package 002 when applied then every accepted constraint exists with its accepted definition', async () => {
    const result = await migrator.query<{ tbl: string; conname: string; def: string }>(
      `select rel.relname as tbl, con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname <> '_prisma_migrations'
        order by rel.relname, con.conname`,
    );

    expect(result.rows).toStrictEqual([
      {
        tbl: 'platform_role_assignments',
        conname: 'platform_role_assignments_pkey',
        def: 'PRIMARY KEY (id)',
      },
      {
        tbl: 'platform_role_assignments',
        conname: 'platform_role_assignments_user_fk',
        def: 'FOREIGN KEY (user_id) REFERENCES users(id)',
      },
      // The composite foreign key of D-038 clause 19: it is what makes a cross-practice role
      // assignment structurally impossible rather than merely validated.
      {
        tbl: 'practice_membership_roles',
        conname: 'practice_membership_roles_membership_fk',
        def: 'FOREIGN KEY (practice_id, membership_id) REFERENCES practice_memberships(practice_id, id)',
      },
      {
        tbl: 'practice_membership_roles',
        conname: 'practice_membership_roles_pkey',
        def: 'PRIMARY KEY (id)',
      },
      {
        tbl: 'practice_memberships',
        conname: 'practice_memberships_pkey',
        def: 'PRIMARY KEY (id)',
      },
      {
        tbl: 'practice_memberships',
        conname: 'practice_memberships_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      {
        tbl: 'practice_memberships',
        conname: 'practice_memberships_user_fk',
        def: 'FOREIGN KEY (user_id) REFERENCES users(id)',
      },
      { tbl: 'practice_settings', conname: 'practice_settings_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'practice_settings',
        conname: 'practice_settings_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      // D-029 optimistic locking guard. Prisma cannot express CHECK, so it is custom SQL.
      {
        tbl: 'practice_settings',
        conname: 'practice_settings_version_check',
        def: 'CHECK ((version >= 1))',
      },
      { tbl: 'practices', conname: 'practices_pkey', def: 'PRIMARY KEY (id)' },
      { tbl: 'users', conname: 'users_pkey', def: 'PRIMARY KEY (id)' },
    ]);
  });

  it('given package 002 when applied then referential actions stay at the PostgreSQL default', async () => {
    // 02 §6.3a and §28.1 keep ON DELETE / ON UPDATE an OPEN question. A generated CASCADE or
    // RESTRICT would decide it silently, so every foreign key must be NO ACTION ('a').
    const result = await migrator.query<{
      conname: string;
      confdeltype: string;
      confupdtype: string;
    }>(
      `select con.conname, con.confdeltype, con.confupdtype
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
        order by con.conname`,
    );

    expect(result.rows.length).toBe(5);
    for (const row of result.rows) {
      expect(row.confdeltype).toBe('a');
      expect(row.confupdtype).toBe('a');
    }
  });

  it('given package 002 when applied then exactly the accepted indexes exist', async () => {
    const result = await migrator.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by indexname`,
    );

    // No speculative index: 02 §6.3 proves every documented query path is already covered by
    // an existing constraint after the singular role column was removed (D-038 clause 2).
    expect(result.rows.map((row) => row.indexname)).toStrictEqual([
      'platform_role_assignments_pkey',
      'platform_role_assignments_user_idx',
      'platform_role_assignments_user_role_key',
      'practice_membership_roles_membership_role_key',
      'practice_membership_roles_pkey',
      'practice_membership_roles_tenant_key',
      'practice_memberships_pkey',
      'practice_memberships_practice_user_key',
      'practice_memberships_tenant_key',
      'practice_memberships_user_active_idx',
      'practice_settings_pkey',
      'practice_settings_practice_key',
      'practice_settings_tenant_key',
      'practices_code_key',
      'practices_pkey',
      'practices_status_idx',
      'users_auth_subject_key',
      'users_pkey',
    ]);
  });

  it('given the tenant tables when inspected then each carries the unconditional unique (practice_id, id)', async () => {
    // 02 §2.5. On `practice_memberships` it doubles as the parent key of the composite FK.
    const result = await migrator.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname like '%_tenant_key'
        order by indexname`,
    );

    expect(result.rows.map((row) => row.indexdef)).toStrictEqual([
      'CREATE UNIQUE INDEX practice_membership_roles_tenant_key ON public.practice_membership_roles USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_memberships_tenant_key ON public.practice_memberships USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_settings_tenant_key ON public.practice_settings USING btree (practice_id, id)',
    ]);
  });
});

describe('privilege catalogue (02 §20.2, §20.2a, §20.2b; D-047, D-049, D-051)', () => {
  it('given package 002 when applied then exactly these table-level grants exist', async () => {
    const result = await migrator.query<{ table_name: string; grantee: string; privs: string }>(
      `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
        group by table_name, grantee
        order by table_name, grantee`,
    );

    // No INSERT, no UPDATE, no DELETE for any runtime role anywhere in this package
    // (D-047 clause 15, D-033 clause 13, D-038 clause 24, D-023 clause 11).
    expect(result.rows).toStrictEqual([
      { table_name: 'platform_role_assignments', grantee: 'copilot_app', privs: 'SELECT' },
      { table_name: 'platform_role_assignments', grantee: 'copilot_system', privs: 'SELECT' },
      { table_name: 'practice_membership_roles', grantee: 'copilot_app', privs: 'SELECT' },
      // The hard dependency of BOTH `practices_membership_select` and
      // `practice_membership_roles_self_select` (02 §17.4, §17.6, §20.2a, D-051 clause 4).
      { table_name: 'practice_memberships', grantee: 'copilot_app', privs: 'SELECT' },
    ]);
  });

  it('given users when inspected then copilot_app reads exactly the five accepted columns', async () => {
    const columns = await grantedColumns(migrator, 'users', 'copilot_app');

    // `auth_subject`, `last_login_at`, `created_at` and `updated_at` receive NO grant.
    // `auth_subject` is reachable only through the §17.5 policy expression (02 §20.2a).
    expect(columns).toStrictEqual(['display_name', 'email', 'id', 'preferred_language', 'status']);
  });

  it('given practices when inspected then copilot_app reads exactly the six accepted columns', async () => {
    const columns = await grantedColumns(migrator, 'practices', 'copilot_app');

    // `legal_name`, `zsr_number` and `gln_number` receive NO grant: class B business data
    // that stays unreachable even with a compromised credential (02 §20.2a, 09 §2).
    expect(columns).toStrictEqual(['code', 'default_language', 'id', 'name', 'status', 'timezone']);
  });

  it('given practice_settings when inspected then copilot_app reads exactly the three D-049 columns', async () => {
    const columns = await grantedColumns(migrator, 'practice_settings', 'copilot_app');

    expect(columns).toStrictEqual([
      'allow_billing_specialist_approval',
      'allow_mpa_approval',
      'practice_id',
    ]);
  });

  it('given practice_settings when inspected then copilot_system and PUBLIC hold nothing', async () => {
    // A tenant table; `copilot_system` is a platform identity and never reaches tenant data
    // (D-023). 02 §20.2b also forbids a table-level SELECT here in phase 3.
    expect(await grantedColumns(migrator, 'practice_settings', 'copilot_system')).toStrictEqual([]);
    expect(await grantedColumns(migrator, 'practice_settings', 'PUBLIC')).toStrictEqual([]);
  });

  it('given every phase 3 table when inspected then PUBLIC holds no privilege at all', async () => {
    const result = await migrator.query<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'PUBLIC'`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given schema public when inspected then PUBLIC holds neither USAGE nor CREATE', async () => {
    const result = await migrator.query<{ usage: boolean; creation: boolean }>(
      `select has_schema_privilege('public', 'public', 'USAGE') as usage,
              has_schema_privilege('public', 'public', 'CREATE') as creation`,
    );

    expect(result.rows[0]).toStrictEqual({ usage: false, creation: false });
  });

  it('given schema public when inspected then no DEFAULT PRIVILEGE can pre-grant a future table', async () => {
    // Migration 001 asserts this too. Repeating it after package 002 proves the package did
    // not introduce one (02 §20).
    const result = await migrator.query<{ total: string }>(
      'select count(*)::text as total from pg_default_acl',
    );

    expect(result.rows[0]?.total).toBe('0');
  });

  it('given the runtime roles when inspected then neither may create objects in schema public', async () => {
    const result = await migrator.query<{
      app_create: boolean;
      system_create: boolean;
      app_usage: boolean;
      system_usage: boolean;
    }>(
      `select has_schema_privilege('copilot_app', 'public', 'CREATE') as app_create,
              has_schema_privilege('copilot_system', 'public', 'CREATE') as system_create,
              has_schema_privilege('copilot_app', 'public', 'USAGE') as app_usage,
              has_schema_privilege('copilot_system', 'public', 'USAGE') as system_usage`,
    );

    expect(result.rows[0]).toStrictEqual({
      app_create: false,
      system_create: false,
      app_usage: true,
      system_usage: true,
    });
  });
});

describe('RLS and policy catalogue (02 §17.2, §17.4, §17.5, §17.6; D-047, D-051)', () => {
  it('given package 002 when applied then exactly four tables carry ENABLE and FORCE row level security', async () => {
    const result = await migrator.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_prisma_migrations'
        order by c.relname`,
    );

    expect(result.rows).toStrictEqual([
      { relname: 'platform_role_assignments', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_membership_roles', relrowsecurity: true, relforcerowsecurity: true },
      // 02 §17.3 belongs to package `013_rls_policies` and phase 4 (D-051 clause 5).
      { relname: 'practice_memberships', relrowsecurity: false, relforcerowsecurity: false },
      // 02 §20.2b, §22.13 — RLS and the bounded UPDATE grant arrive together, in phase 4.
      { relname: 'practice_settings', relrowsecurity: false, relforcerowsecurity: false },
      { relname: 'practices', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'users', relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it('given package 002 when applied then exactly seven policies exist, with their accepted mode, command and roles', async () => {
    const result = await migrator.query<{
      tbl: string;
      polname: string;
      mode: string;
      command: string;
      roles: string;
    }>(
      `select c.relname as tbl,
              p.polname,
              case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
              p.polcmd::text as command,
              (select string_agg(pg_get_userbyid(r), ',' order by pg_get_userbyid(r))
                 from unnest(p.polroles) r) as roles
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by c.relname, p.polname`,
    );

    expect(result.rows).toStrictEqual([
      {
        tbl: 'platform_role_assignments',
        polname: 'platform_role_assignments_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'platform_role_assignments',
        polname: 'platform_role_assignments_system_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_system',
      },
      {
        tbl: 'practice_membership_roles',
        polname: 'practice_membership_roles_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      // RESTRICTIVE is MANDATORY and NORMATIVE (02 §17.6): restrictive policies combine with
      // AND, so no future permissive policy can OR away the narrowing rule.
      {
        tbl: 'practices',
        polname: 'practices_context_narrow',
        mode: 'RESTRICTIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'practices',
        polname: 'practices_membership_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'users',
        polname: 'users_bootstrap_subject_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'users',
        polname: 'users_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
    ]);
  });

  it('given no policy when inspected then none carries a WITH CHECK expression', async () => {
    // Every accepted phase 3 policy is FOR SELECT. A WITH CHECK expression would mean a write
    // path exists, and no runtime role holds a write grant on any of these tables.
    const result = await migrator.query<{ polname: string }>(
      `select p.polname from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polwithcheck is not null`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the users bootstrap policy when inspected then it carries the mandatory app.user_id IS NULL guard', async () => {
    // 02 §17.5 / D-047 clauses 3-4: without this guard, mismatched contexts were empirically
    // shown to expose TWO user rows at once. The guard is normative, not stylistic.
    const expression = await policyExpression(migrator, 'users_bootstrap_subject_select');

    expect(expression).toContain(
      "NULLIF(current_setting('app.user_id'::text, true), ''::text) IS NULL",
    );
    expect(expression).toContain('auth_subject');
  });

  it('given the practices membership policy when inspected then it deliberately does not filter pm.active', async () => {
    // A frozen `GET /me` requires an inactive membership to still show its practice name
    // (02 §17.6). RLS governs visibility here, not authorisation.
    const expression = await policyExpression(migrator, 'practices_membership_select');

    expect(expression).toContain('practice_memberships pm');
    expect(expression).not.toContain('pm.active');
  });

  it('given the membership-role policy when inspected then it compares BOTH practice_id and membership_id', async () => {
    // 02 §17.4: comparing both is what makes a cross-practice leak through somebody else's
    // membership impossible.
    const expression = await policyExpression(migrator, 'practice_membership_roles_self_select');

    expect(expression).toContain('pm.practice_id = practice_membership_roles.practice_id');
    expect(expression).toContain('pm.id = practice_membership_roles.membership_id');
    expect(expression).toContain("current_setting('app.user_id'::text, true)");
    expect(expression).not.toContain('app.practice_id');
  });

  it('given the platform role policy when inspected then it depends on app.user_id alone', async () => {
    // D-051 clause 1: the policy uses NEITHER `app.practice_id`, NOR `set_request_context`,
    // which is precisely why it already works in phase 3.
    const expression = await policyExpression(migrator, 'platform_role_assignments_self_select');

    expect(expression).toContain("current_setting('app.user_id'::text, true)");
    expect(expression).not.toContain('app.practice_id');
  });
});

describe('context functions (02 §16.1, §16.2.2, §16.2.4)', () => {
  it('given package 002 when applied then it created exactly two context functions, both SECURITY INVOKER', async () => {
    const result = await migrator.query<{ proname: string; prosecdef: boolean; config: string }>(
      `select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_security'
        order by p.proname`,
    );

    expect(result.rows).toStrictEqual([
      {
        proname: 'set_auth_subject_context',
        prosecdef: false,
        config: 'search_path=public, pg_temp',
      },
      { proname: 'set_user_context', prosecdef: false, config: 'search_path=public, pg_temp' },
    ]);
  });

  it('given phase 3 when inspected then set_request_context does not exist', async () => {
    // It stays in `013_rls_policies` and phase 4 (02 §16.2.3, §22.13). Creating it here would
    // pull phase 4 forward.
    const result = await migrator.query<{ total: string }>(
      `select count(*)::text as total from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_security' and p.proname = 'set_request_context'`,
    );

    expect(result.rows[0]?.total).toBe('0');
  });
});

async function grantedColumns(client: Client, table: string, grantee: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = $1 and grantee = $2
        and privilege_type = 'SELECT'
      order by column_name`,
    [table, grantee],
  );

  return result.rows.map((row) => row.column_name);
}

async function policyExpression(client: Client, policyName: string): Promise<string> {
  const result = await client.query<{ expression: string }>(
    `select pg_get_expr(p.polqual, p.polrelid) as expression
       from pg_policy p where p.polname = $1`,
    [policyName],
  );

  const expression = result.rows[0]?.expression;
  expect(expression).toBeDefined();

  return expression ?? '';
}

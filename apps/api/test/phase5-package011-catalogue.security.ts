import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, securityDatabase } from './support/phase3-security-context.js';

/**
 * Mechanical verification of the PHASE 5 SLICE of migration package
 * `011_jobs_idempotency_outbox_audit` — sub-gate `P5-I2A`, the STRUCTURAL PREREQUISITE
 * (02 §15.2, §15.4, §21, §22.11, §29.9, §29.10; D-023, D-062, D-063, D-064 `OD-1`, `OD-4`,
 * `OD-5`, `OD-7`, `OD-8`; test contract 08 §12.9.4 items 26a-26b; plan 04 §7.5a).
 *
 * These are catalogue assertions read straight out of `pg_catalog` and compared against the
 * accepted model EXACTLY. Every set comparison is `toStrictEqual` over a FULL set, never a
 * containment check: a column, constraint, index or foreign key that is missing, one too many,
 * one renamed or one whose definition drifted must all fail here. That prohibition is
 * PERMANENT and applies to every future edit of this file. D-064 `OD-9` authorises an exact
 * set to be REPLACED by a new exact set when a canonical slice deliberately changes the
 * database; it NEVER authorises `exact` -> `contains` / `subset` / `partial`.
 *
 * THE ZERO-CAPABILITY EVIDENCE OF THIS SLICE IS A STATIC PROOF (D-064 `OD-1`, `OD-9`).
 * The phase 5 slice of package `011` creates two tables and issues NO grant, NO revoke, NO
 * `ENABLE`/`FORCE ROW LEVEL SECURITY`, NO policy, NO function and NO trigger. Between it and
 * the phase 5 slice of `013_rls_policies` both tables carried `relrowsecurity = false`,
 * `relforcerowsecurity = false`, ZERO policies and ZERO runtime grants — the ABSENCE OF A
 * GRANT WAS THE SECURITY CONTROL of this slice, and that window contained no capability at
 * all rather than merely a short exposure.
 *
 * Sub-gate `P5-I2B` deliberately ends that window: grants, `ENABLE`, `FORCE` and the five
 * policies of §29.4a arrive together, in ONE explicit transaction, with package `013` (D-049
 * clause 5, §29.4a.0). The LIVE assertions below therefore evolved from their old exact set to
 * the new one (D-064 `OD-9`), while the STATIC PACKAGE-BOUNDARY PROOF at the bottom of this
 * file — that migration `011` ITSELF introduced no runtime capability — is UNCHANGED,
 * UNWEAKENED AND PERMANENT. Migration `011` is never edited (AGENTS.md §5.1).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT PROVE.
 * It does not own the runtime grants, the tenant policies or the append-only contract of
 * either table — those belong to `P5-I2B` and to `phase5-rls-grants.security.ts` (D-064
 * `OD-9` part B); what it asserts about them here is only that this slice did not create them.
 * It does not discharge the `★` RI-versus-RLS proof, which belongs to `P5-I2V` and stays a
 * HARD precondition of `P5-I5`.
 */
const database = securityDatabase();
const apiRoot = resolve(import.meta.dirname, '..');

/** The two tables the phase 5 slice of package `011` creates, and the only two it may create. */
const PACKAGE_011_TABLES = ['audit_events', 'idempotency_keys'] as const;

/** The same two as a SQL list literal, so every query names them identically. */
const PACKAGE_011_TABLE_LIST = PACKAGE_011_TABLES.map((table) => `'${table}'`).join(', ');

/**
 * The two §15 tables package `011` owns that phase 5 must NOT create (D-064 `OD-5`), plus the
 * four `system_*` twins D-023 clause 2 forbids outright.
 */
const TABLES_THAT_MUST_NOT_EXIST = [
  'async_jobs',
  'outbox_events',
  'system_async_jobs',
  'system_audit_events',
  'system_outbox_events',
  'system_webhook_receipts',
] as const;

/**
 * The canonical migration chain after `P5-I2C` — EXACTLY SEVEN directories, in application
 * order (§29.10; D-064 `OD-8`, correction A).
 *
 * Package numbers carry OWNERSHIP, not execution order (D-052), which is why `013` precedes
 * `003` and why the phase 5 slices of `013` and `014` follow the phase 5 slice of `011`. The
 * old exact set of SIX is superseded by this one of SEVEN (D-064 `OD-9`), which is the
 * canonical chain after the whole of `P5-I2`; §29.10 names no eighth directory.
 */
const EXPECTED_MIGRATIONS = [
  '20260810213856_001_extensions_and_roles',
  '20260814013200_002_identity_and_practices',
  '20260816111141_013_rls_policies',
  '20260823104252_003_patient_encounter_documents',
  '20260823211546_011_jobs_idempotency_outbox_audit_phase5',
  '20260825013452_013_rls_policies_phase5',
  '20260825214248_014_immutability_triggers_phase5',
] as const;

/** The phase 5 slice of package `011` — the migration this file speaks for. */
const PACKAGE_011_MIGRATION = EXPECTED_MIGRATIONS[4];

/** The phase 5 slice of package `013`, at its canonical position — no longer the final one. */
const PACKAGE_013_PHASE_5_MIGRATION = EXPECTED_MIGRATIONS[5];

/** The phase 5 slice of package `014` — the chronologically LAST migration since `P5-I2C`. */
const PACKAGE_014_PHASE_5_MIGRATION = EXPECTED_MIGRATIONS[6];

/**
 * The THIRTEEN business tables the canonical chain creates after `P5-I2A`, in
 * `order by tablename` order.
 *
 * Six from packages `002`/`013`, five from package `003` (`P5-I1`) and the two of this slice.
 * The old exact set of ELEVEN is superseded by this one — a deliberate, canonical
 * old-exact-set -> new-exact-set evolution (D-064 `OD-9`), not a weakening.
 */
const EXPECTED_BUSINESS_TABLES = [
  'audit_events',
  'encounter_diagnoses',
  'encounter_documents',
  'encounters',
  'idempotency_keys',
  'patient_references',
  'platform_role_assignments',
  'practice_membership_roles',
  'practice_memberships',
  'practice_settings',
  'practices',
  'storage_objects',
  'users',
] as const;

/**
 * The complete physical column contract of both new tables (§15.2, §15.4), in ordinal order.
 *
 * `nullable` follows the §15 reading rule literally: a row is `NOT NULL` unless §15 marks it
 * `nullable`. `practice_id` is `NOT NULL` on both — on `audit_events` that is D-023 clause 1
 * (a nullable tenant key makes `NULL = <uuid>` yield `NULL` under a FORCE RLS equality policy,
 * so the row becomes invisible without an error) and on `idempotency_keys` it is additionally
 * the unconditional rule of §2.5.
 *
 * The ONLY default anywhere is `idempotency_keys.created_at`. §15.4 declares NO `created_at`
 * on `audit_events`; `occurred_at` is the event timestamp and carries no default, exactly like
 * `encounters.occurred_at`. No column carries a UUID default (§2.2): the application generates
 * every identifier before `INSERT`.
 */
const EXPECTED_COLUMNS = [
  { tbl: 'audit_events', pos: 1, col: 'id', type: 'uuid', nullable: 'NO', dflt: null },
  { tbl: 'audit_events', pos: 2, col: 'practice_id', type: 'uuid', nullable: 'NO', dflt: null },
  {
    tbl: 'audit_events',
    pos: 3,
    col: 'occurred_at',
    type: 'timestamp with time zone',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'audit_events',
    pos: 4,
    col: 'actor_type',
    type: 'character varying(30)',
    nullable: 'NO',
    dflt: null,
  },
  { tbl: 'audit_events', pos: 5, col: 'actor_user_id', type: 'uuid', nullable: 'YES', dflt: null },
  {
    tbl: 'audit_events',
    pos: 6,
    col: 'actor_service',
    type: 'character varying(100)',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'audit_events',
    pos: 7,
    col: 'action',
    type: 'character varying(150)',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'audit_events',
    pos: 8,
    col: 'resource_type',
    type: 'character varying(100)',
    nullable: 'NO',
    dflt: null,
  },
  { tbl: 'audit_events', pos: 9, col: 'resource_id', type: 'uuid', nullable: 'YES', dflt: null },
  {
    tbl: 'audit_events',
    pos: 10,
    col: 'request_id',
    type: 'character varying(100)',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'audit_events',
    pos: 11,
    col: 'session_id_hash',
    type: 'character varying(128)',
    nullable: 'YES',
    dflt: null,
  },
  { tbl: 'audit_events', pos: 12, col: 'ip_address', type: 'inet', nullable: 'YES', dflt: null },
  {
    tbl: 'audit_events',
    pos: 13,
    col: 'user_agent_hash',
    type: 'character varying(128)',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'audit_events',
    pos: 14,
    col: 'previous_value',
    type: 'jsonb',
    nullable: 'YES',
    dflt: null,
  },
  { tbl: 'audit_events', pos: 15, col: 'new_value', type: 'jsonb', nullable: 'YES', dflt: null },
  { tbl: 'audit_events', pos: 16, col: 'metadata', type: 'jsonb', nullable: 'NO', dflt: null },
  {
    tbl: 'audit_events',
    pos: 17,
    col: 'event_sha256',
    type: 'character varying(64)',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'audit_events',
    pos: 18,
    col: 'previous_event_sha256',
    type: 'character varying(64)',
    nullable: 'YES',
    dflt: null,
  },
  { tbl: 'idempotency_keys', pos: 1, col: 'id', type: 'uuid', nullable: 'NO', dflt: null },
  { tbl: 'idempotency_keys', pos: 2, col: 'practice_id', type: 'uuid', nullable: 'NO', dflt: null },
  { tbl: 'idempotency_keys', pos: 3, col: 'user_id', type: 'uuid', nullable: 'NO', dflt: null },
  {
    tbl: 'idempotency_keys',
    pos: 4,
    col: 'idempotency_key',
    type: 'character varying(255)',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 5,
    col: 'endpoint',
    type: 'character varying(255)',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 6,
    col: 'request_sha256',
    type: 'character varying(64)',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 7,
    col: 'response_status',
    type: 'integer',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 8,
    col: 'response_body',
    type: 'jsonb',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 9,
    col: 'locked_at',
    type: 'timestamp with time zone',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 10,
    col: 'completed_at',
    type: 'timestamp with time zone',
    nullable: 'YES',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 11,
    col: 'expires_at',
    type: 'timestamp with time zone',
    nullable: 'NO',
    dflt: null,
  },
  {
    tbl: 'idempotency_keys',
    pos: 12,
    col: 'created_at',
    type: 'timestamp with time zone',
    nullable: 'NO',
    dflt: 'CURRENT_TIMESTAMP',
  },
] as const;

/**
 * Every index on the two new tables, with its exact definition, ordered by name.
 *
 * SEVEN: two primary keys, three unique constraints and the TWO §21 audit indexes this
 * package's creator migration owns (§29.9.2, D-064 `OD-7`). No speculative index exists —
 * `idempotency_keys` gets none beyond its two unique constraints, and the `expires_at`
 * retention path has no phase 5 consumer, so no index is created before its consumer (D-049).
 */
const EXPECTED_PACKAGE_011_INDEXES = [
  'CREATE INDEX audit_actor_idx ON public.audit_events USING btree (practice_id, actor_user_id, occurred_at DESC)',
  'CREATE UNIQUE INDEX audit_events_pkey ON public.audit_events USING btree (id)',
  'CREATE UNIQUE INDEX audit_events_tenant_key ON public.audit_events USING btree (practice_id, id)',
  'CREATE INDEX audit_resource_idx ON public.audit_events USING btree (practice_id, resource_type, resource_id, occurred_at)',
  'CREATE UNIQUE INDEX idempotency_keys_pkey ON public.idempotency_keys USING btree (id)',
  'CREATE UNIQUE INDEX idempotency_keys_scope_key ON public.idempotency_keys USING btree (practice_id, user_id, endpoint, idempotency_key)',
  'CREATE UNIQUE INDEX idempotency_keys_tenant_key ON public.idempotency_keys USING btree (practice_id, id)',
] as const;

/** Every constraint of the two new tables — two primary keys and the two `practices` keys. */
const EXPECTED_PACKAGE_011_CONSTRAINTS = [
  { tbl: 'audit_events', conname: 'audit_events_pkey', def: 'PRIMARY KEY (id)' },
  {
    tbl: 'audit_events',
    conname: 'audit_events_practice_fk',
    def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
  },
  { tbl: 'idempotency_keys', conname: 'idempotency_keys_pkey', def: 'PRIMARY KEY (id)' },
  {
    tbl: 'idempotency_keys',
    conname: 'idempotency_keys_practice_fk',
    def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
  },
] as const;

/** The two foreign keys of §29.9.1 — the ONLY two this slice may declare (D-064 `OD-4`). */
const NEW_FOREIGN_KEYS = ['audit_events_practice_fk', 'idempotency_keys_practice_fk'] as const;

/** The FIFTEEN foreign keys the whole chain carries after `P5-I2A`: 5 + 8 + 2. */
const EXPECTED_ALL_FOREIGN_KEYS = [
  'audit_events_practice_fk',
  'encounter_diagnoses_encounter_fk',
  'encounter_documents_encounter_fk',
  'encounter_documents_source_storage_object_fk',
  'encounter_documents_storage_object_fk',
  'encounters_patient_reference_fk',
  'encounters_responsible_physician_membership_fk',
  'idempotency_keys_practice_fk',
  'patient_references_practice_fk',
  'platform_role_assignments_user_fk',
  'practice_membership_roles_membership_fk',
  'practice_memberships_practice_fk',
  'practice_memberships_user_fk',
  'practice_settings_practice_fk',
  'storage_objects_practice_fk',
] as const;

let migrator: Client;

beforeAll(async () => {
  migrator = await connect(database.migration);
});

afterAll(async () => {
  await migrator.end();
});

describe('migration chain after P5-I2B (02 §29.10; D-064 `OD-8`, correction A)', () => {
  it('given the repository when inspected then EXACTLY SEVEN migration directories exist', () => {
    // Identity and order, not a count: a wrong package applied in the right number would
    // otherwise pass (00 §6.2). The old exact set of SIX is superseded by this one — a
    // deliberate canonical evolution under D-064 `OD-9`, never a weakening. SEVEN is the FINAL
    // phase 5 count (§29.10).
    const directories = readdirSync(resolve(apiRoot, 'prisma/migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toStrictEqual([...EXPECTED_MIGRATIONS]);
  });

  it('given the migrated database when inspected then exactly those seven are recorded as applied', async () => {
    const result = await migrator.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      `select migration_name, finished_at, rolled_back_at
         from _prisma_migrations order by started_at`,
    );

    expect(result.rows.map((row) => row.migration_name)).toStrictEqual([...EXPECTED_MIGRATIONS]);

    for (const migration of result.rows) {
      expect(migration.finished_at).not.toBeNull();
      expect(migration.rolled_back_at).toBeNull();
    }
  });

  it('given the phase 5 slice of package 011 then it is named canonically and precedes the 013 slice', () => {
    // §29.10 fixes the directory suffix `_011_jobs_idempotency_outbox_audit_phase5`. The
    // package number expresses OWNERSHIP, not chronological order (D-052) — which is exactly
    // why `013` precedes `003` in the chain and why this slice follows both. It was
    // chronologically LAST until `P5-I2B`; the ORDER, not the position, is what §29.4a.1
    // requires: structure first, capability second, never the reverse.
    //
    // POSITION IS NOW ASSERTED BY INDEX, NOT BY `at(-1)`. Until `P5-I2C` the `013` phase 5
    // slice was the final element, so asserting that was equivalent to asserting its position.
    // It is no longer final, so the exact statement becomes: `011` at index 4, `013` phase 5 at
    // index 5, and `014` phase 5 as the new last element. Leaving the old final-element form
    // would either fail or, if repaired by deletion, silently stop pinning where either slice
    // sits.
    expect(PACKAGE_011_MIGRATION).toMatch(/^\d{14}_011_jobs_idempotency_outbox_audit_phase5$/);
    expect(EXPECTED_MIGRATIONS.indexOf(PACKAGE_011_MIGRATION)).toBe(4);
    expect(PACKAGE_013_PHASE_5_MIGRATION).toMatch(/^\d{14}_013_rls_policies_phase5$/);
    expect(EXPECTED_MIGRATIONS.indexOf(PACKAGE_013_PHASE_5_MIGRATION)).toBe(5);
    expect(PACKAGE_014_PHASE_5_MIGRATION).toMatch(/^\d{14}_014_immutability_triggers_phase5$/);
    expect(EXPECTED_MIGRATIONS.at(-1)).toBe(PACKAGE_014_PHASE_5_MIGRATION);
  });
});

describe('package 011 tables and models (02 §15.2, §15.4, §22.11, §29.9.3; D-064 `OD-5`)', () => {
  it('given the chain when applied then exactly THIRTEEN business tables exist', async () => {
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by tablename`,
    );

    expect(result.rows.map((row) => row.tablename)).toStrictEqual([...EXPECTED_BUSINESS_TABLES]);
    expect(result.rows).toHaveLength(13);
  });

  it('given the deferred package 011 tables when looked for then none of them exists', async () => {
    // D-064 `OD-5` and D-023 clause 2, made mechanical. `outbox_events` and `async_jobs` have
    // no phase 5 consumer and stay deferred; the four `system_*` twins are never created at
    // all. A table pulled forward from either group must fail here rather than pass silently.
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename = any($1::text[])
        order by tablename`,
      [[...TABLES_THAT_MUST_NOT_EXIST]],
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the Prisma schema when inspected then it declares exactly THIRTEEN models', () => {
    // §29.9.3 / D-064 `OD-5`: eleven existing models plus `IdempotencyKey` and `AuditEvent`.
    // `OutboxEvent` and `AsyncJob` must NOT appear — declaring them would pull later scope
    // forward. The set is asserted by NAME, so a renamed or extra model fails like a missing
    // one.
    const schema = readFileSync(resolve(apiRoot, 'prisma/schema.prisma'), 'utf8');
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]).sort();

    expect(models).toStrictEqual([
      'AuditEvent',
      'Encounter',
      'EncounterDiagnosis',
      'EncounterDocument',
      'IdempotencyKey',
      'PatientReference',
      'PlatformRoleAssignment',
      'Practice',
      'PracticeMembership',
      'PracticeMembershipRole',
      'PracticeSettings',
      'StorageObject',
      'User',
    ]);
    expect(models).toHaveLength(13);
  });

  it('given the Prisma schema when inspected then no model carries a UUID default', () => {
    // §2.2 / §26.1 / D-025 clause 11: the application generates every business identifier
    // because the canonical AAD of the encryption envelope contains `row_id`.
    //
    // Comments are stripped before the scan. The schema DOCUMENTS the rule in prose — the
    // header states that `@default(uuid())` is never used — and flagging that prose would push
    // a future author to delete the very text that records the decision. This is the same
    // treatment the package `013` forward-SQL scan already gives its rollback commentary.
    const schema = readFileSync(resolve(apiRoot, 'prisma/schema.prisma'), 'utf8');
    const declarations = schema
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/^\s*\/\/\/.*$/, ''))
      .join('\n');

    expect(declarations).not.toContain('@default(uuid())');
    expect(declarations).not.toContain('@default(cuid())');
    expect(declarations).not.toContain('dbgenerated');

    // The rule IS documented and must stay documented — the scan tolerating it is the point.
    expect(schema).toContain('@default(uuid())');
  });

  it('given the enum catalogue when inspected then package 011 introduced none — still EIGHT', async () => {
    const result = await migrator.query<{ typname: string }>(
      `select t.typname from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typtype = 'e'
        order by t.typname`,
    );

    // Three from package `002` and five from package `003`. Neither new table uses an enum:
    // §15.2 and §15.4 declare none, and `actor_type` stays `varchar(30)`.
    expect(result.rows.map((row) => row.typname)).toStrictEqual([
      'document_source',
      'document_type',
      'encounter_status',
      'entity_status',
      'integration_provider',
      'membership_role',
      'platform_role',
      'review_state',
    ]);
  });

  it('given both new tables when inspected then copilot_migrator owns them and no runtime role does', async () => {
    const result = await migrator.query<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner from pg_tables
        where schemaname = 'public' and tablename in (${PACKAGE_011_TABLE_LIST})
        order by tablename`,
    );

    expect(result.rows).toStrictEqual(
      PACKAGE_011_TABLES.map((tablename) => ({ tablename, tableowner: 'copilot_migrator' })),
    );
  });
});

describe('column contract (02 §15.2, §15.4; D-023 clause 1)', () => {
  it('given both new tables when inspected then the column catalogue is EXACTLY the accepted one', async () => {
    const result = await migrator.query<{
      tbl: string;
      pos: number;
      col: string;
      type: string;
      nullable: string;
      dflt: string | null;
    }>(
      `select table_name as tbl,
              ordinal_position::int as pos,
              column_name as col,
              data_type || coalesce('(' || character_maximum_length || ')', '') as type,
              is_nullable as nullable,
              column_default as dflt
         from information_schema.columns
        where table_schema = 'public' and table_name in (${PACKAGE_011_TABLE_LIST})
        order by table_name, ordinal_position`,
    );

    expect(result.rows).toStrictEqual(EXPECTED_COLUMNS.map((row) => ({ ...row })));
    expect(result.rows).toHaveLength(30);
  });

  it('given both new tables when inspected then practice_id is NOT NULL', async () => {
    // D-023 clause 1 literally: under a FORCE RLS equality policy a nullable tenant key makes
    // `NULL = <uuid>` evaluate to `NULL`, so the runtime role could neither write nor read the
    // row — silently, without an error.
    const result = await migrator.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name in (${PACKAGE_011_TABLE_LIST})
          and column_name = 'practice_id'
        order by table_name`,
    );

    expect(result.rows).toStrictEqual(
      PACKAGE_011_TABLES.map((table_name) => ({ table_name, is_nullable: 'NO' })),
    );
  });

  it('given both new tables when inspected then no column carries a UUID or sequence default', async () => {
    // §2.2: `gen_random_uuid()` is never a column default and no generated identity or
    // sequence is introduced. `idempotency_keys.created_at` is the only default of any kind.
    const result = await migrator.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in (${PACKAGE_011_TABLE_LIST})
          and (column_default like '%uuid%'
               or column_default like 'nextval%'
               or is_identity = 'YES')
        order by table_name, column_name`,
    );

    expect(result.rows).toStrictEqual([]);
  });
});

describe('constraint, unique and index catalogue (02 §2.5, §15.2, §15.4, §21; D-064 `OD-7`)', () => {
  it('given both new tables when inspected then their constraint set is EXACTLY the accepted one', async () => {
    // FOUR: two primary keys and the two `practices` foreign keys. NO `CHECK` constraint
    // belongs to either table — §15.2 and §15.4 declare none, and the `progress_percent`
    // CHECK of §15.1 belongs to `async_jobs`, which phase 5 does not create.
    const result = await migrator.query<{ tbl: string; conname: string; def: string }>(
      `select rel.relname as tbl, con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname in (${PACKAGE_011_TABLE_LIST})
        order by rel.relname, con.conname`,
    );

    expect(result.rows).toStrictEqual(EXPECTED_PACKAGE_011_CONSTRAINTS.map((row) => ({ ...row })));
  });

  it('given both new tables when inspected then the index set is EXACTLY the accepted seven', async () => {
    const result = await migrator.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename in (${PACKAGE_011_TABLE_LIST})
        order by indexname`,
    );

    expect(result.rows.map((row) => row.indexdef)).toStrictEqual([...EXPECTED_PACKAGE_011_INDEXES]);
    expect(result.rows).toHaveLength(7);
  });

  it('given audit_events when inspected then BOTH §21 audit indexes exist on the canonical columns', async () => {
    // §29.9.2 / D-064 `OD-7`: the CREATOR migration owns them. Package `012` may later verify
    // or reconcile them, but creation is not deferred — `012` does not exist in phase 5, and
    // `audit_actor_idx` and only it carries the `occurred_at desc` ordering.
    const result = await migrator.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'audit_events' and indexname like '%_idx'
        order by indexname`,
    );

    expect(result.rows).toStrictEqual([
      {
        indexname: 'audit_actor_idx',
        indexdef:
          'CREATE INDEX audit_actor_idx ON public.audit_events USING btree (practice_id, actor_user_id, occurred_at DESC)',
      },
      {
        indexname: 'audit_resource_idx',
        indexdef:
          'CREATE INDEX audit_resource_idx ON public.audit_events USING btree (practice_id, resource_type, resource_id, occurred_at)',
      },
    ]);
  });

  it('given all TEN tenant tables in scope when inspected then each carries unique (practice_id, id)', async () => {
    // §2.5 / D-022, unconditional. Three from package `002`, five from `003` and the two of
    // this slice — ten of the thirty tenant tables now carry it. The old exact set of EIGHT is
    // superseded by this one (D-064 `OD-9`).
    const result = await migrator.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname like '%_tenant_key'
        order by indexname`,
    );

    expect(result.rows.map((row) => row.indexdef)).toStrictEqual([
      'CREATE UNIQUE INDEX audit_events_tenant_key ON public.audit_events USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX encounter_diagnoses_tenant_key ON public.encounter_diagnoses USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX encounter_documents_tenant_key ON public.encounter_documents USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX encounters_tenant_key ON public.encounters USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX idempotency_keys_tenant_key ON public.idempotency_keys USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX patient_references_tenant_key ON public.patient_references USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_membership_roles_tenant_key ON public.practice_membership_roles USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_memberships_tenant_key ON public.practice_memberships USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_settings_tenant_key ON public.practice_settings USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX storage_objects_tenant_key ON public.storage_objects USING btree (practice_id, id)',
    ]);
    expect(result.rows).toHaveLength(10);
  });

  it('given idempotency_keys when inspected then the §15.2 scope key exists over exactly four columns', async () => {
    const result = await migrator.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname = 'idempotency_keys_scope_key'`,
    );

    expect(result.rows.map((row) => row.indexdef)).toStrictEqual([
      'CREATE UNIQUE INDEX idempotency_keys_scope_key ON public.idempotency_keys USING btree (practice_id, user_id, endpoint, idempotency_key)',
    ]);
  });
});

describe('foreign key contract — EXACTLY TWO NEW (02 §29.9.1; D-064 `OD-4`)', () => {
  it('given the chain when applied then exactly FIFTEEN foreign keys exist', async () => {
    // Five from package `002`, eight from `003` and the two of this slice. The old exact set
    // of THIRTEEN is superseded by this one (D-064 `OD-9`).
    const result = await migrator.query<{ conname: string }>(
      `select con.conname
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
        order by con.conname`,
    );

    expect(result.rows.map((row) => row.conname)).toStrictEqual([...EXPECTED_ALL_FOREIGN_KEYS]);
    expect(result.rows).toHaveLength(15);
  });

  it('given the two new keys when inspected then both are NO ACTION on DELETE and on UPDATE', async () => {
    // §29.9.1: `confdeltype = 'a'` and `confupdtype = 'a'`. `CASCADE` is rejected outright —
    // an audit trail a parent delete can cascade away is not an audit trail. `SET NULL` is
    // impossible over a NOT NULL tenant key, and `ON UPDATE` is unreachable because
    // `practices.id` is immutable after INSERT.
    const result = await migrator.query<{
      conname: string;
      tbl: string;
      def: string;
      confdeltype: string;
      confupdtype: string;
    }>(
      `select con.conname, rel.relname as tbl, pg_get_constraintdef(con.oid) as def,
              con.confdeltype, con.confupdtype
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
          and rel.relname in (${PACKAGE_011_TABLE_LIST})
        order by con.conname`,
    );

    expect(result.rows).toStrictEqual([
      {
        conname: 'audit_events_practice_fk',
        tbl: 'audit_events',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
        confdeltype: 'a',
        confupdtype: 'a',
      },
      {
        conname: 'idempotency_keys_practice_fk',
        tbl: 'idempotency_keys',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
        confdeltype: 'a',
        confupdtype: 'a',
      },
    ]);
    expect(result.rows.map((row) => row.conname)).toStrictEqual([...NEW_FOREIGN_KEYS]);
  });

  it('given EVERY foreign key when inspected then ON DELETE and ON UPDATE are NO ACTION', async () => {
    // Must hold for all fifteen, not only the two new ones (08 §12.9.3 item 10).
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

    expect(result.rows).toHaveLength(15);
    for (const row of result.rows) {
      expect(row.confdeltype).toBe('a');
      expect(row.confupdtype).toBe('a');
    }
  });

  it('given the deliberately undeclared relations when looked for then none of them exists', async () => {
    // §29.9.1 / D-064 `OD-4`: `idempotency_keys.user_id -> users`,
    // `audit_events.actor_user_id -> users` and every actor or service directory key are
    // FORBIDDEN. Actor columns stay an APPLICATION INVARIANT (precedent §6.5), because a key
    // to `users` would introduce an identity relation D-061 explicitly does not widen — and
    // `audit_events` must stay writable for an actor row that no longer resolves.
    const result = await migrator.query<{ conname: string; def: string }>(
      `select con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
          and rel.relname in (${PACKAGE_011_TABLE_LIST})
          and pg_get_constraintdef(con.oid) not like '%REFERENCES practices(id)'
        order by con.conname`,
    );

    expect(result.rows).toStrictEqual([]);
  });
});

describe('the package 011 privilege surface after P5-I2B (D-064 `OD-1`, `OD-9`; §29.4a.3, §29.4a.4)', () => {
  it('given both new tables then the table-level grant set is EXACTLY the P5-I2B one', async () => {
    // `copilot_migrator` is excluded because it is the table OWNER and holds every privilege
    // by definition. The old exact set was EMPTY, which was correct while this slice was the
    // last word on both tables; the phase 5 slice of `013_rls_policies` deliberately replaces
    // it with the surface of §29.4a.3 and §29.4a.4 (D-064 `OD-9`).
    //
    // `audit_events` receives `SELECT` + `INSERT` AND NOTHING ELSE — the append-only contract
    // of §15.4 enforced by the GRANT, which is the PRIMARY control (§19.2). `copilot_system`
    // and `PUBLIC` still hold NOTHING; that half of the boundary is permanent (D-023).
    const result = await migrator.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name in (${PACKAGE_011_TABLE_LIST})
          and grantee <> 'copilot_migrator'
        order by table_name, grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'audit_events', grantee: 'copilot_app', privilege_type: 'INSERT' },
      { table_name: 'audit_events', grantee: 'copilot_app', privilege_type: 'SELECT' },
      { table_name: 'idempotency_keys', grantee: 'copilot_app', privilege_type: 'INSERT' },
      { table_name: 'idempotency_keys', grantee: 'copilot_app', privilege_type: 'SELECT' },
    ]);
  });

  it('given both new tables then the ONLY column-level UPDATE is on idempotency_keys', async () => {
    // The other half of the surface: a column grant never appears in `role_table_grants`, so
    // it has to be asserted separately (§20.2b). The column-level `UPDATE` of §29.4a.3 belongs
    // to `P5-I2B`; `audit_events` receives NO `UPDATE` of any kind, at any granularity.
    //
    // The exact four columns are owned by `phase5-rls-grants.security.ts`; asserted here is
    // only that no other table and no other privilege joined them.
    const result = await migrator.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select distinct table_name, grantee, privilege_type
         from information_schema.role_column_grants
        where table_schema = 'public' and table_name in (${PACKAGE_011_TABLE_LIST})
          and grantee <> 'copilot_migrator' and privilege_type <> 'SELECT'
          and privilege_type <> 'INSERT'
        order by table_name, grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'idempotency_keys', grantee: 'copilot_app', privilege_type: 'UPDATE' },
    ]);
  });

  it('given copilot_app, copilot_system and PUBLIC when probed then only SELECT and INSERT are held', async () => {
    // `has_table_privilege` is asked directly, so an inherited or implicit privilege that
    // never materialises as an `information_schema` row also fails. It reports TABLE-LEVEL
    // privilege only, so `UPDATE` is `false` even on `idempotency_keys`: its `UPDATE` is
    // column-level, which is exactly the narrowing D-064 `OD-2` requires over a blanket grant
    // that would have carried `practice_id` and `idempotency_key` with it.
    //
    // NO `DELETE` AND NO `TRUNCATE` ANYWHERE, and `copilot_system` and `PUBLIC` hold NOTHING —
    // both tables are tenant tables and the platform identity never reaches tenant data
    // (D-023). For `audit_events` that is also D-063 clause 5: cross-practice audit
    // readability is categorically forbidden.
    const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'];
    const grantees = ['copilot_app', 'copilot_system', 'public'];

    for (const table of PACKAGE_011_TABLES) {
      for (const grantee of grantees) {
        for (const privilege of privileges) {
          const result = await migrator.query<{ held: boolean }>(
            'select has_table_privilege($1, $2, $3) as held',
            [grantee, table, privilege],
          );

          expect({ table, grantee, privilege, held: result.rows[0]?.held }).toStrictEqual({
            table,
            grantee,
            privilege,
            held: grantee === 'copilot_app' && (privilege === 'SELECT' || privilege === 'INSERT'),
          });
        }
      }
    }
  });

  it('given both new tables then EXACTLY the FIVE §29.4a policies exist on them', async () => {
    // The three `idempotency_keys` policies and the two of `audit_events` (§29.4a) belong to
    // the phase 5 slice of `013_rls_policies` and were created in the SAME transaction as the
    // grants they restrict. Pulling either half forward is exactly what D-049 clause 5 forbids,
    // and the old exact set of ZERO is superseded by this one of FIVE (D-064 `OD-9`).
    //
    // `audit_events` has NO update and NO delete policy, matching the absence of those grants.
    const result = await migrator.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname = 'public' and tablename in (${PACKAGE_011_TABLE_LIST})
        order by tablename, policyname`,
    );

    expect(result.rows).toStrictEqual([
      { tablename: 'audit_events', policyname: 'audit_events_insert' },
      { tablename: 'audit_events', policyname: 'audit_events_select' },
      { tablename: 'idempotency_keys', policyname: 'idempotency_keys_insert' },
      { tablename: 'idempotency_keys', policyname: 'idempotency_keys_select' },
      { tablename: 'idempotency_keys', policyname: 'idempotency_keys_update' },
    ]);
  });

  it('given both new tables when inspected then relrowsecurity and relforcerowsecurity are TRUE', async () => {
    // THE STEADY STATE, MODELLED EXACTLY. Both stood `false`/`false` after `P5-I2A`, which was
    // INTENDED and not a defect: no runtime role could reach either table, so there was
    // nothing yet for a policy to restrict, and `P5-I2A` must not have "fixed" it by pulling
    // `P5-I2B` forward. `P5-I2B` now sets both flags in the same transaction as the grants
    // (D-049 clause 5), and the old exact `false`/`false` set is superseded (D-064 `OD-9`).
    const result = await migrator.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (${PACKAGE_011_TABLE_LIST})
        order by c.relname`,
    );

    expect(result.rows).toStrictEqual([
      { relname: 'audit_events', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'idempotency_keys', relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it('given the whole schema when inspected then ALL THIRTEEN tables force RLS after P5-I2B', async () => {
    // The whole-schema view of the same steady state, row by row. The six tables of packages
    // `002`/`013` are asserted to have KEPT `true`/`true` — neither this slice nor `P5-I2B`
    // may disturb any of them, and this comparison is the mechanical proof that neither did.
    // The five `P5-I1` tables and the two new ones stood `false`/`false` until `P5-I2B` moved
    // all seven to `true`/`true` in one explicit transaction (§29.4a.0). The old exact set —
    // six `true`/`true` plus seven `false`/`false` — is superseded by this one of thirteen
    // `true`/`true` (D-064 `OD-9`).
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
      { relname: 'audit_events', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'encounter_diagnoses', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'encounter_documents', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'encounters', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'idempotency_keys', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'patient_references', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'platform_role_assignments', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_membership_roles', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_memberships', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_settings', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practices', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'storage_objects', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'users', relrowsecurity: true, relforcerowsecurity: true },
    ]);
    expect(result.rows).toHaveLength(13);
    expect(result.rows.filter((row) => row.relforcerowsecurity)).toHaveLength(13);
    expect(result.rows.filter((row) => !row.relrowsecurity)).toHaveLength(0);
  });

  it('given the whole schema when inspected then EXACTLY TWENTY-FIVE policies exist', async () => {
    // `P5-I2A` creates none of its own. The TEN phase 5 PHI policies of §29.4 and the FIVE of
    // §29.4a arrive with `P5-I2B`, taking the canonical total to 25 over 13 tables (D-065
    // `RULING 1`). The old exact value of `10` is superseded by `25` (D-064 `OD-9`); the
    // superseded totals `8` PHI, `18 / 11` and `23` must never reappear as an expected value.
    const result = await migrator.query<{ total: string }>(
      `select count(*)::text as total
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'`,
    );

    expect(result.rows[0]?.total).toBe('25');
  });

  it('given schema public when inspected then no DEFAULT PRIVILEGE could have pre-granted the new tables', async () => {
    // This is what makes "no GRANT statement" equal to "no capability". Migration `001`
    // asserts it; repeating it after the phase 5 slice of `011` proves the slice did not
    // introduce one (§20; D-064 `OD-1`).
    const result = await migrator.query<{ total: string }>(
      'select count(*)::text as total from pg_default_acl',
    );

    expect(result.rows[0]?.total).toBe('0');
  });

  it('given the runtime roles when inspected then neither may create objects in schema public', async () => {
    const result = await migrator.query<{ app_create: boolean; system_create: boolean }>(
      `select has_schema_privilege('copilot_app', 'public', 'CREATE') as app_create,
              has_schema_privilege('copilot_system', 'public', 'CREATE') as system_create`,
    );

    expect(result.rows[0]).toStrictEqual({ app_create: false, system_create: false });
  });

  it('given the cluster when inspected then package 011 introduced no role and no BYPASSRLS', async () => {
    const result = await migrator.query<{ rolname: string; rolbypassrls: boolean }>(
      `select rolname, rolbypassrls from pg_roles
        where rolname like 'copilot%' order by rolname`,
    );

    expect(result.rows).toStrictEqual([
      { rolname: 'copilot_app', rolbypassrls: false },
      { rolname: 'copilot_migrator', rolbypassrls: false },
      { rolname: 'copilot_system', rolbypassrls: false },
    ]);
  });

  it('given schema app_security then the LIVE catalogue is the four functions and three triggers of P5-I2C', async () => {
    const functions = await migrator.query<{ proname: string; prosecdef: boolean }>(
      `select p.proname, p.prosecdef from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app_security', 'public')
        order by p.proname`,
    );

    // The three phase 3/4 context functions plus `reject_aad_bound_column_change`, which the
    // phase 5 slice of package `014` created under sub-gate `P5-I2C`. The old exact set of
    // THREE is superseded by this one of FOUR — a canonical old-exact-set -> new-exact-set
    // evolution (D-064 `OD-9`), never a weakening. No function is `SECURITY DEFINER`.
    //
    // NEITHER PACKAGE `011` NOR `P5-I2B` CREATED ANY OF THEM. That stays provable from the
    // STATIC forward-SQL scans, which inspect those packages' own files and are deliberately
    // left untouched: the LIVE catalogue records the whole applied chain, while the static
    // scans record PACKAGE OWNERSHIP. Conflating the two would let a later package quietly
    // acquire an earlier one's objects.
    expect(functions.rows.map((row) => row.proname)).toStrictEqual([
      'reject_aad_bound_column_change',
      'set_auth_subject_context',
      'set_request_context',
      'set_user_context',
    ]);
    expect(functions.rows.filter((row) => row.prosecdef)).toStrictEqual([]);

    const triggers = await migrator.query<{ tgname: string }>(
      `select t.tgname from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by t.tgname`,
    );

    // The old exact set was EMPTY; this one of THREE supersedes it. The full shape of each
    // trigger — timing, level, absent `WHEN`, target function and function ACL — is owned by
    // `phase5-aad-immutability.security.ts`.
    expect(triggers.rows.map((row) => row.tgname)).toStrictEqual([
      'encounter_documents_aad_immutable_trg',
      'encounters_aad_immutable_trg',
      'patient_references_aad_immutable_trg',
    ]);
  });
});

describe('package 011 forward SQL — static package boundary, PERMANENT (D-064 `OD-1`, `OD-5`)', () => {
  /**
   * The migration's OPERATIONAL SQL, with comments stripped.
   *
   * Comments must be stripped before the scan, exactly as the package `013` scan does: the
   * file DOCUMENTS the forbidden statements in prose in order to record why they are absent,
   * and flagging that prose would push a future author to delete the very text that carries
   * the decision.
   */
  const operationalSql = (): string => {
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_011_MIGRATION, 'migration.sql'),
      'utf8',
    );

    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  };

  it('given the package 011 forward SQL then it issues NO security statement of any kind', () => {
    // D-064 `OD-1`, made mechanical. The phase 5 slice of `013_rls_policies` is the EXCLUSIVE
    // owner of every one of these for both new tables; the slice of `014` owns the triggers.
    //
    // THIS ASSERTION IS PERMANENT AND SURVIVES `P5-I2B` UNCHANGED. The LIVE state of both
    // tables deliberately changed — they now carry grants, RLS and five policies — but what
    // must stay provable forever is that MIGRATION `011` ITSELF introduced no runtime
    // capability. It is already applied and is never edited (AGENTS.md §5.1, 00 §6.2), so this
    // can only fail if someone rewrites history.
    const operational = operationalSql();

    expect(/\bgrant\b/i.test(operational)).toBe(false);
    expect(/\brevoke\b/i.test(operational)).toBe(false);
    expect(/\benable\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bforce\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bdisable\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+policy\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+(or\s+replace\s+)?function\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+trigger\b/i.test(operational)).toBe(false);
    expect(/\bsecurity\s+definer\b/i.test(operational)).toBe(false);
    expect(/\bbypassrls\b/i.test(operational)).toBe(false);
    expect(/\bcomment\s+on\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+index\s+concurrently\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+role\b/i.test(operational)).toBe(false);
  });

  it('given the package 011 forward SQL then it contains no DML and no seed', () => {
    // Neither new table is ever seeded, and the §23.4 FORCE-RLS maintenance allowlist stays at
    // exactly six tables.
    const operational = operationalSql();

    expect(/\binsert\s+into\b/i.test(operational)).toBe(false);
    expect(/\bupdate\s+"?\w+"?\s+set\b/i.test(operational)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(operational)).toBe(false);
    expect(/\btruncate\b/i.test(operational)).toBe(false);
  });

  it('given the package 011 forward SQL then it creates neither outbox_events nor async_jobs', () => {
    // D-064 `OD-5`. The names may appear in the prose that records their deferral; no
    // executable statement may reference them.
    const operational = operationalSql();

    expect(/outbox_events/i.test(operational)).toBe(false);
    expect(/async_jobs/i.test(operational)).toBe(false);
    expect(/system_audit_events/i.test(operational)).toBe(false);

    // The deferral prose IS present and must stay present — the scan tolerating it is the
    // point.
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_011_MIGRATION, 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain('outbox_events');
    expect(sql).toContain('async_jobs');
  });

  it('given the package 011 forward SQL then it alters no existing object', () => {
    // The only `ALTER TABLE` statements are the two `ADD CONSTRAINT ... FOREIGN KEY`, both ON
    // THE NEW CHILD TABLES. No `DROP`, no `RENAME`, and nothing at all against `practices` —
    // its parent key `practices_pkey` has existed since package `002` (D-064 `OD-5`).
    const operational = operationalSql();
    const alters = [...operational.matchAll(/\balter\s+table\s+"?(\w+)"?\s+(\w+)/gi)].map(
      (match) => `${match[1] ?? ''} ${(match[2] ?? '').toUpperCase()}`,
    );

    expect(alters.sort()).toStrictEqual(['audit_events ADD', 'idempotency_keys ADD']);
    expect(/\bdrop\s+(table|column|constraint|index|type)\b/i.test(operational)).toBe(false);
    expect(/\brename\s+to\b/i.test(operational)).toBe(false);
    expect(/alter\s+table\s+"?practices"?/i.test(operational)).toBe(false);
  });
});

describe('no existing-object drift (D-061 clause 11; D-064 `OD-5`)', () => {
  it('given practices when inspected then package 011 added no constraint and no index', async () => {
    // Both new foreign keys are created ON THE CHILD TABLES; their parent key `practices_pkey`
    // has existed since package `002`. A new index or constraint here would be exactly the
    // silent widening D-064 `OD-5` forbids.
    const constraints = await migrator.query<{ conname: string; def: string }>(
      `select con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname = 'practices'
        order by con.conname`,
    );

    expect(constraints.rows).toStrictEqual([
      { conname: 'practices_pkey', def: 'PRIMARY KEY (id)' },
    ]);

    const indexes = await migrator.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'practices'
        order by indexname`,
    );

    expect(indexes.rows.map((row) => row.indexname)).toStrictEqual([
      'practices_code_key',
      'practices_pkey',
      'practices_status_idx',
    ]);
  });

  it('given practices when inspected then its column set is unchanged', async () => {
    const result = await migrator.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'practices'
        order by ordinal_position`,
    );

    expect(result.rows.map((row) => row.column_name)).toStrictEqual([
      'id',
      'code',
      'name',
      'legal_name',
      'zsr_number',
      'gln_number',
      'default_language',
      'timezone',
      'status',
      'created_at',
      'updated_at',
    ]);
  });

  it('given the four phase 3/4 grant rows then they are byte-identical to their phase 4 state', async () => {
    // THE PART THAT MUST NEVER CHANGE. Neither this slice nor `P5-I2B` may touch the phase 3/4
    // privilege surface, and in particular no grant on `practice_memberships` may be added,
    // narrowed or removed (D-061 clause 11, D-062 Dio B.4, §29.7).
    //
    // The six phase 5 rows above them belong to `P5-I2B` and their contract is owned by
    // `phase5-rls-grants.security.ts`; the whole-schema query stays an exact full set, so its
    // old set of four rows is superseded by this one of ten (D-064 `OD-9`).
    const result = await migrator.query<{ table_name: string; grantee: string; privs: string }>(
      `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
        group by table_name, grantee
        order by table_name, grantee`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'audit_events', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'encounter_diagnoses', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'encounter_documents', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'encounters', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'idempotency_keys', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'patient_references', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'platform_role_assignments', grantee: 'copilot_app', privs: 'SELECT' },
      { table_name: 'platform_role_assignments', grantee: 'copilot_system', privs: 'SELECT' },
      { table_name: 'practice_membership_roles', grantee: 'copilot_app', privs: 'SELECT' },
      { table_name: 'practice_memberships', grantee: 'copilot_app', privs: 'SELECT' },
    ]);
  });

  it('given storage_objects then it is STILL zero-capability, alone among the P5-I1 five', async () => {
    // The four other `P5-I1` tables received the §29.5 surface with `P5-I2B`; `storage_objects`
    // deliberately received NOTHING and keeps `ENABLE` + `FORCE ROW LEVEL SECURITY` with zero
    // policies, which is default-deny. It exists only as the foreign-key parent of
    // `encounter_documents`, and no phase 5 route reads or writes it.
    //
    // This must NOT be "fixed" by adding a policy or a privilege (D-065 `RULING 1`).
    const result = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'storage_objects'
          and grantee <> 'copilot_migrator'
        order by grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([]);

    const policies = await migrator.query<{ policyname: string }>(
      `select policyname from pg_policies
        where schemaname = 'public' and tablename = 'storage_objects'`,
    );

    expect(policies.rows).toStrictEqual([]);
  });
});

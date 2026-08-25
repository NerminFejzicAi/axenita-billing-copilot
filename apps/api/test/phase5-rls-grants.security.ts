import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FORCE_RLS_MAINTENANCE_ALLOWLIST, PHASE_3_SEED_IDS } from '../prisma/seed.js';
import {
  INSUFFICIENT_PRIVILEGE,
  connect,
  securityDatabase,
} from './support/phase3-security-context.js';

/**
 * The STEADY-STATE security catalogue and behaviour of sub-gate `P5-I2B` — the phase 5 slice
 * of migration package `013_rls_policies` (02 §17.1, §19.2, §20.2b, §20.2b.1, §23.4.4b,
 * §29.4, §29.4a, §29.4a.0-§29.4a.5, §29.5, §29.7, §29.10; D-023, D-049, D-062, D-063,
 * D-064 `OD-1`, `OD-2`, `OD-3`, `OD-8`, `OD-9` part B; D-065 `RULING 1`, `RULING 2`;
 * test contract 08 §12.9.4).
 *
 * D-064 `OD-9` part B makes THIS FILE the owner of the post-`P5-I2B` security steady state:
 * 13 tables `true`/`true`, EXACTLY 25 policies (corrected from the superseded 23 by D-065
 * `RULING 1`), the exact table-level and column-level grant catalogues, ZERO for `PUBLIC`,
 * ZERO for `copilot_system` on every phase 5 tenant object, tenant isolation, and the
 * negative privilege behaviour. The structural catalogues stay with
 * `phase5-schema-catalogue.security.ts` (package `003`) and
 * `phase5-package011-catalogue.security.ts` (package `011`).
 *
 * EVERY SET COMPARISON HERE IS `toStrictEqual` OVER A FULL SET, never a containment check.
 * That prohibition is PERMANENT and applies to every future edit: D-064 `OD-9` authorises an
 * exact set to be REPLACED by a new exact set when a canonical slice deliberately changes the
 * database; it NEVER authorises `exact` -> `contains` / `subset` / `partial`.
 *
 * THE NUMBERS THAT MUST NEVER REAPPEAR AS AN EXPECTED VALUE: `8` phase 5 PHI policies,
 * `18 / 11`, and `23` total policies. All three are superseded arithmetic (D-065 `RULING 1`).
 * The NAMED catalogue controls and the count follows the names — never the reverse. In
 * particular `encounters_update` and `encounter_documents_update` are MANDATORY and may not
 * be deleted to make an obsolete total add up.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT PROVE.
 * It does not create or assert a single package `014` object — the AAD immutability function
 * and its three triggers belong to sub-gate `P5-I2C`, which `P5-I2B` does NOT authorise. It
 * does not discharge the `★` RI-versus-RLS proof either: an ordinary `encounters` INSERT
 * naming a responsible physician through the composite foreign key is NOT the `★` proof and
 * must never be presented as one. `★` belongs to the dedicated `P5-I2V` gate and remains a
 * HARD precondition of `P5-I5`, which stays BLOCKED.
 */
const database = securityDatabase();
const apiRoot = resolve(import.meta.dirname, '..');

/**
 * The canonical migration chain after `P5-I2B` — EXACTLY SIX directories, in application
 * order (§29.10; D-064 `OD-8`, correction A).
 *
 * Package numbers carry OWNERSHIP, not execution order (D-052), which is why `013` precedes
 * `003` and why the phase 5 slice of `013` follows the phase 5 slice of `011`. The old exact
 * set of FIVE is superseded by this one of SIX — a deliberate canonical evolution under
 * D-064 `OD-9`, never a weakening. The chain reaches SEVEN only with `P5-I2C`, which this
 * gate does not authorise.
 */
const EXPECTED_MIGRATIONS = [
  '20260810213856_001_extensions_and_roles',
  '20260814013200_002_identity_and_practices',
  '20260816111141_013_rls_policies',
  '20260823104252_003_patient_encounter_documents',
  '20260823211546_011_jobs_idempotency_outbox_audit_phase5',
  '20260825013452_013_rls_policies_phase5',
] as const;

/** The phase 5 slice of package `013` — the migration this file speaks for. */
const PACKAGE_013_PHASE_5_MIGRATION = EXPECTED_MIGRATIONS[5];

/**
 * The SEVEN tenant tables whose security this slice exclusively owns (§29.4a.1, D-064 `OD-1`).
 */
const P5_I2B_TABLES = [
  'audit_events',
  'encounter_diagnoses',
  'encounter_documents',
  'encounters',
  'idempotency_keys',
  'patient_references',
  'storage_objects',
] as const;

const P5_I2B_TABLE_LIST = P5_I2B_TABLES.map((table) => `'${table}'`).join(', ');

/**
 * The FIFTEEN policies `P5-I2B` creates — the exact named catalogue of §29.4a.2 / D-065
 * `RULING 1`, sorted.
 *
 * `storage_objects` is absent ON PURPOSE and contributes ZERO. Its intended phase 5 state is
 * `ENABLE` + `FORCE ROW LEVEL SECURITY` with no policy and no grant, which makes it
 * unreachable by default-deny rather than by an absent grant alone.
 */
const P5_I2B_POLICY_NAMES = [
  'audit_events_insert',
  'audit_events_select',
  'encounter_diagnoses_insert',
  'encounter_diagnoses_select',
  'encounter_documents_insert',
  'encounter_documents_select',
  'encounter_documents_update',
  'encounters_insert',
  'encounters_select',
  'encounters_update',
  'idempotency_keys_insert',
  'idempotency_keys_select',
  'idempotency_keys_update',
  'patient_references_insert',
  'patient_references_select',
] as const;

/** The TEN phase 3/4 policies, which `P5-I2B` must leave untouched (§29.4a.2). */
const PHASE_3_AND_4_POLICY_NAMES = [
  'platform_role_assignments_self_select',
  'platform_role_assignments_system_select',
  'practice_membership_roles_self_select',
  'practice_memberships_self_select',
  'practice_settings_select',
  'practice_settings_update',
  'practices_context_narrow',
  'practices_membership_select',
  'users_bootstrap_subject_select',
  'users_self_select',
] as const;

/**
 * The canonical §17.1 tenant predicate as PostgreSQL renders it back from the catalogue.
 *
 * Comparing against the RENDERED form rather than the authored text is deliberate: it is what
 * the planner will actually evaluate, so a semantically different predicate that merely looks
 * similar in the migration file cannot pass.
 */
const TENANT_PREDICATE =
  "(practice_id = (NULLIF(current_setting('app.practice_id'::text, true), ''::text))::uuid)";

/** `pg_policy.polcmd` codes. */
const SELECT_CMD = 'r';
const INSERT_CMD = 'a';
const UPDATE_CMD = 'w';

/**
 * The COMPLETE post-`P5-I2B` policy catalogue — 25 rows, `order by tablename, policyname`.
 *
 * `mode`, `command` and `roles` are part of the contract, not decoration: a policy that is
 * silently widened from `FOR SELECT` to `FOR ALL`, flipped from RESTRICTIVE to PERMISSIVE, or
 * re-targeted at another role must fail here. The old exact set of TEN is superseded by this
 * one of TWENTY-FIVE (D-064 `OD-9`, D-065 `RULING 1`).
 */
const EXPECTED_POLICY_CATALOGUE = [
  {
    tbl: 'audit_events',
    polname: 'audit_events_insert',
    mode: 'PERMISSIVE',
    command: INSERT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'audit_events',
    polname: 'audit_events_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounter_diagnoses',
    polname: 'encounter_diagnoses_insert',
    mode: 'PERMISSIVE',
    command: INSERT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounter_diagnoses',
    polname: 'encounter_diagnoses_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounter_documents',
    polname: 'encounter_documents_insert',
    mode: 'PERMISSIVE',
    command: INSERT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounter_documents',
    polname: 'encounter_documents_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounter_documents',
    polname: 'encounter_documents_update',
    mode: 'PERMISSIVE',
    command: UPDATE_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounters',
    polname: 'encounters_insert',
    mode: 'PERMISSIVE',
    command: INSERT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounters',
    polname: 'encounters_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'encounters',
    polname: 'encounters_update',
    mode: 'PERMISSIVE',
    command: UPDATE_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'idempotency_keys',
    polname: 'idempotency_keys_insert',
    mode: 'PERMISSIVE',
    command: INSERT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'idempotency_keys',
    polname: 'idempotency_keys_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'idempotency_keys',
    polname: 'idempotency_keys_update',
    mode: 'PERMISSIVE',
    command: UPDATE_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'patient_references',
    polname: 'patient_references_insert',
    mode: 'PERMISSIVE',
    command: INSERT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'patient_references',
    polname: 'patient_references_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'platform_role_assignments',
    polname: 'platform_role_assignments_self_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'platform_role_assignments',
    polname: 'platform_role_assignments_system_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_system',
  },
  {
    tbl: 'practice_membership_roles',
    polname: 'practice_membership_roles_self_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'practice_memberships',
    polname: 'practice_memberships_self_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'practice_settings',
    polname: 'practice_settings_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'practice_settings',
    polname: 'practice_settings_update',
    mode: 'PERMISSIVE',
    command: UPDATE_CMD,
    roles: 'copilot_app',
  },
  // RESTRICTIVE is MANDATORY and NORMATIVE (§17.6) and stays RESTRICTIVE: restrictive
  // policies combine with AND, so no future permissive policy can OR away the narrowing rule.
  {
    tbl: 'practices',
    polname: 'practices_context_narrow',
    mode: 'RESTRICTIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'practices',
    polname: 'practices_membership_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'users',
    polname: 'users_bootstrap_subject_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
  {
    tbl: 'users',
    polname: 'users_self_select',
    mode: 'PERMISSIVE',
    command: SELECT_CMD,
    roles: 'copilot_app',
  },
] as const;

/**
 * The COMPLETE post-`P5-I2B` table-level grant catalogue for every grantee that is not the
 * owner, `order by table_name, grantee`.
 *
 * `copilot_migrator` is excluded because it is the OWNER and holds every privilege by
 * definition; it is not a runtime role, and under `FORCE` it is subject to the policies
 * anyway. Every phase 5 row below is `INSERT,SELECT` and nothing more: no `UPDATE` appears
 * here at all, because every phase 5 `UPDATE` grant is COLUMN-LEVEL and therefore lives only
 * in `role_column_grants`. `storage_objects` is absent entirely (§29.5).
 */
const EXPECTED_TABLE_GRANTS = [
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
] as const;

/**
 * The EXACT column-level `UPDATE` catalogue of the whole schema, `order by table_name`.
 *
 * There is no table-level `UPDATE` anywhere, so this list is the WHOLE truth about what any
 * runtime role may write into an existing row.
 */
const EXPECTED_UPDATE_COLUMNS = [
  // §29.5 — the complete list is the single column `archived_at`. Both status columns, both
  // ciphertext triples, both hashes, all four `encryption_*` coordinates, `created_by`,
  // `created_at`, `id`, `practice_id` and `encounter_id` are unwritable after INSERT.
  { table_name: 'encounter_documents', cols: 'archived_at' },
  // §29.5 — EXACTLY TWELVE. `id`, `practice_id` and `patient_reference_id` are withheld, so a
  // tenant-key move and a silent re-pointing at another patient are both rejected on the
  // PRIVILEGE level, before any policy is consulted. The AAD-bound encryption envelope is
  // withheld too, without depending on the package `014` trigger that `P5-I2C` will add.
  {
    table_name: 'encounters',
    cols: 'guarantor_type,insurance_context,occurred_at,patient_age_at_encounter,patient_sex_at_encounter,responsible_physician_id,specialty_code,status,treatment_date,updated_at,updated_by,version',
  },
  // §29.4a.3 / D-064 `OD-2` — EXACTLY FOUR. `locked_at` is deliberately mutable (claim
  // state); `expires_at` is deliberately NOT (no phase 5 retention consumer).
  { table_name: 'idempotency_keys', cols: 'completed_at,locked_at,response_body,response_status' },
  // Phase 4, unchanged by this slice (D-053 part B).
  {
    table_name: 'practice_settings',
    cols: 'ai_enabled,allow_billing_specialist_approval,allow_mpa_approval,axenita_export_enabled,billing_review_required,require_reason_for_manual_change,retention_policy_code,updated_at,version',
  },
] as const;

/** Seed practices. `practiceNord` is the cross-tenant negative throughout. */
const DEMO = PHASE_3_SEED_IDS.practiceDemo;
const NORD = PHASE_3_SEED_IDS.practiceNord;
const ACTOR = PHASE_3_SEED_IDS.userPracticeAdmin;

/** Deterministic row identifiers for the behavioural fixtures; every one is rolled back. */
const FIXTURE = {
  patientReference: '77777777-7777-4777-8777-777777777001',
  encounter: '77777777-7777-4777-8777-777777777002',
  diagnosis: '77777777-7777-4777-8777-777777777003',
  document: '77777777-7777-4777-8777-777777777004',
  idempotencyKey: '77777777-7777-4777-8777-777777777005',
  auditEvent: '77777777-7777-4777-8777-777777777006',
  foreignRow: '77777777-7777-4777-8777-7777777770ff',
} as const;

let migrator: Client;
let app: Client;

beforeAll(async () => {
  migrator = await connect(database.migration);
  app = await connect(database.app);
});

afterAll(async () => {
  await migrator.end();
  await app.end();
});

/**
 * Opens a tenant transaction as the REAL `copilot_app` role, runs `work`, and ALWAYS rolls
 * back.
 *
 * `app.practice_id` is set with `set_config` directly rather than through
 * `set_request_context`, which §25.1.1 permits for policy verification: the point here is the
 * policy, not the admission path that establishes the GUC.
 */
async function withTenant<T>(
  practiceId: string | null,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  await app.query('begin');

  try {
    await app.query('select set_config($1, $2, true)', ['app.practice_id', practiceId ?? '']);
    return await work(app);
  } finally {
    await app.query('rollback');
  }
}

/**
 * Runs `statement` inside a SAVEPOINT and returns the SQLSTATE PostgreSQL reported, or
 * `undefined` when it succeeded.
 *
 * A savepoint rather than a nested transaction, because these negatives run INSIDE a tenant
 * transaction that already holds fixture rows: a failed statement must not abort the rows the
 * next assertion depends on. A negative privilege test asserts the EXACT SQLSTATE, never
 * merely "it threw".
 */
async function sqlStateInside(
  client: Client,
  label: string,
  statement: string,
  parameters: readonly unknown[] = [],
): Promise<string | undefined> {
  await client.query(`savepoint ${label}`);

  try {
    await client.query(statement, [...parameters]);
    await client.query(`release savepoint ${label}`);
    return undefined;
  } catch (error) {
    await client.query(`rollback to savepoint ${label}`);
    return (error as { code?: string }).code;
  }
}

/** Inserts the minimal same-tenant fixture chain: patient reference -> encounter. */
async function seedEncounter(client: Client, practiceId: string): Promise<void> {
  await client.query(
    `insert into patient_references
       (id, practice_id, source_system, external_patient_ref_hash, pseudonym, updated_at)
     values ($1, $2, 'MANUAL', 'p5-i2b-hash', 'P5-I2B-001', now())`,
    [FIXTURE.patientReference, practiceId],
  );
  await client.query(
    `insert into encounters
       (id, practice_id, patient_reference_id, occurred_at, treatment_date,
        status, source_system, created_by, updated_at)
     values ($1, $2, $3, now(), current_date, 'DRAFT', 'MANUAL', $4, now())`,
    [FIXTURE.encounter, practiceId, FIXTURE.patientReference, ACTOR],
  );
}

// =============================================================================
// A. MIGRATION CHAIN
// =============================================================================

describe('migration chain after P5-I2B (02 §29.10; D-064 `OD-8`, correction A)', () => {
  it('given the repository when inspected then EXACTLY SIX migration directories exist', () => {
    const directories = readdirSync(resolve(apiRoot, 'prisma/migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toStrictEqual([...EXPECTED_MIGRATIONS]);
    expect(directories).toHaveLength(6);
  });

  it('given the phase 5 slice of package 013 then it is chronologically LAST and named canonically', () => {
    expect(PACKAGE_013_PHASE_5_MIGRATION).toMatch(/^\d{14}_013_rls_policies_phase5$/);
    expect(EXPECTED_MIGRATIONS.at(-1)).toBe(PACKAGE_013_PHASE_5_MIGRATION);
  });

  it('given the migrated database when inspected then exactly those six are recorded as applied', async () => {
    const result = await migrator.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      applied_steps_count: number;
    }>(
      `select migration_name, finished_at, rolled_back_at, applied_steps_count
         from _prisma_migrations order by started_at`,
    );

    expect(result.rows.map((row) => row.migration_name)).toStrictEqual([...EXPECTED_MIGRATIONS]);

    const applied = result.rows.find((row) => row.migration_name === PACKAGE_013_PHASE_5_MIGRATION);

    expect(applied?.finished_at).not.toBeNull();
    expect(applied?.rolled_back_at).toBeNull();
    expect(applied?.applied_steps_count).toBeGreaterThan(0);
  });
});

// =============================================================================
// B. MIGRATION SQL CONTRACT — STATIC
// =============================================================================

describe('package 013 phase 5 forward SQL — explicit transaction (02 §29.4a.0; D-065 `RULING 2`)', () => {
  /**
   * The migration's OPERATIONAL SQL, with comments stripped.
   *
   * Comments MUST be stripped before every scan below, exactly as the package `003` and `011`
   * scans do: the file DOCUMENTS the forbidden constructs in prose in order to record why
   * they are absent, and flagging that prose would push a future author to delete the very
   * text that carries the decision.
   */
  const operationalSql = (): string => {
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_013_PHASE_5_MIGRATION, 'migration.sql'),
      'utf8',
    );

    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  };

  /** Every statement whose commit must be atomic with every other (D-064 `OD-1`). */
  const OPERATIONAL_SECURITY_STATEMENT =
    /\b(revoke\s+all|grant\s+(select|insert|update)|alter\s+table|create\s+policy)\b/gi;

  it('given the forward SQL then it carries EXACTLY ONE top-level BEGIN and ONE COMMIT', () => {
    // D-065 `RULING 2`, made mechanical. Atomicity must be a property of THIS FILE and must
    // NOT be delegated to the assumption that the Prisma migration runtime implicitly wraps
    // `migration.sql` in a transaction. If that behaviour ever changed, a partially applied
    // file would leave a COMMITTED state in which a runtime role holds a GRANT without the
    // tenant policy that constrains it — exactly what D-064 `OD-1` forbids.
    const operational = operationalSql();

    expect(operational.match(/^\s*begin\s*;/gim) ?? []).toHaveLength(1);
    expect(operational.match(/^\s*commit\s*;/gim) ?? []).toHaveLength(1);

    // No intermediate COMMIT and no second top-level BEGIN anywhere, in any spelling.
    expect(operational.match(/\bcommit\b/gi) ?? []).toHaveLength(1);
    expect(operational.match(/\bbegin\b/gi) ?? []).toHaveLength(1);
    expect(/\brollback\b/i.test(operational)).toBe(false);
    expect(/\bsavepoint\b/i.test(operational)).toBe(false);
    expect(/\bstart\s+transaction\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then EVERY operational security statement lies between them', () => {
    // The whole capability transition — every REVOKE, every GRANT, every ENABLE/FORCE ROW
    // LEVEL SECURITY and every CREATE POLICY — inside the one boundary. Nothing before BEGIN,
    // nothing after COMMIT.
    const operational = operationalSql();
    const beginAt = operational.search(/^\s*begin\s*;/im);
    const commitAt = operational.search(/^\s*commit\s*;/im);

    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(commitAt).toBeGreaterThan(beginAt);

    const statements = [...operational.matchAll(OPERATIONAL_SECURITY_STATEMENT)];

    // EXACTLY 51: seven REVOKEs, six GRANT SELECTs, six GRANT INSERTs, three GRANT UPDATEs,
    // fourteen ALTER TABLEs and fifteen CREATE POLICYs. The count is asserted as well as the
    // bounds, so a statement moved outside the block cannot hide by also disappearing from
    // the match set.
    expect(statements).toHaveLength(51);

    for (const statement of statements) {
      const at = statement.index ?? -1;

      expect({ statement: statement[0], inside: at > beginAt && at < commitAt }).toStrictEqual({
        statement: statement[0],
        inside: true,
      });
    }
  });

  it('given the forward SQL then it contains no transaction-breaking statement', () => {
    // Any of these would silently split the single boundary and reintroduce the committed
    // intermediate state this package exists to prevent.
    const operational = operationalSql();

    expect(/\bcreate\s+index\s+concurrently\b/i.test(operational)).toBe(false);
    expect(/\bdrop\s+index\s+concurrently\b/i.test(operational)).toBe(false);
    expect(/\bvacuum\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+database\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+tablespace\b/i.test(operational)).toBe(false);
    expect(/\balter\s+system\b/i.test(operational)).toBe(false);
    expect(/\breindex\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it contains no privilege-escape construct', () => {
    const operational = operationalSql();

    expect(/\balter\s+default\s+privileges\b/i.test(operational)).toBe(false);
    expect(/\bsecurity\s+definer\b/i.test(operational)).toBe(false);
    expect(/\bbypassrls\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+role\b/i.test(operational)).toBe(false);
    expect(/\balter\s+role\b/i.test(operational)).toBe(false);
    expect(/\bdrop\s+role\b/i.test(operational)).toBe(false);
    expect(/\bdisable\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bno\s+force\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    // Neither a schema CREATE grant nor a sequence grant: no phase 5 table has a serial or
    // identity column at all (§2.2, §20.3, §29.5).
    expect(/\bgrant\b[^;]*\bon\s+schema\b/i.test(operational)).toBe(false);
    expect(/\bgrant\b[^;]*\bsequence\b/i.test(operational)).toBe(false);
    // No DELETE and no TRUNCATE is granted anywhere, to any role.
    expect(/\bgrant\b[^;]*\bdelete\b/i.test(operational)).toBe(false);
    expect(/\bgrant\b[^;]*\btruncate\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it contains no DML and no seed', () => {
    // §23.4.4b (D-062 Dio K): no phase 5 table is ever seeded, so the §23.4 FORCE-RLS
    // maintenance allowlist stays at exactly six tables and this package carries no clause
    // extending it. A silent extension fails the phase gate (§23.4.4, 08 §26.2).
    const operational = operationalSql();

    expect(/\binsert\s+into\b/i.test(operational)).toBe(false);
    expect(/\bupdate\s+"?\w+"?\s+set\b/i.test(operational)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(operational)).toBe(false);
    expect(/\btruncate\b/i.test(operational)).toBe(false);
    expect(/\bcopy\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it creates no structural object and alters nothing else', () => {
    // The canonical `migrate diff` candidate for this package is EMPTY (D-050): it adds no
    // table, no column, no enum, no constraint and no index. The only `ALTER TABLE` verbs are
    // ENABLE and FORCE ROW LEVEL SECURITY, on the seven tables of §29.4a.1.
    const operational = operationalSql();

    expect(/\bcreate\s+table\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+type\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+index\b/i.test(operational)).toBe(false);
    expect(/\badd\s+constraint\b/i.test(operational)).toBe(false);
    expect(/\bdrop\s+(table|column|constraint|index|type|policy)\b/i.test(operational)).toBe(false);
    expect(/\brename\s+to\b/i.test(operational)).toBe(false);
    expect(/\bcomment\s+on\b/i.test(operational)).toBe(false);

    const alters = [...operational.matchAll(/\balter\s+table\s+"(\w+)"\s+(enable|force)\b/gi)].map(
      (match) => `${match[1] ?? ''} ${(match[2] ?? '').toUpperCase()}`,
    );

    expect([...new Set(alters)].sort()).toStrictEqual([
      'audit_events ENABLE',
      'audit_events FORCE',
      'encounter_diagnoses ENABLE',
      'encounter_diagnoses FORCE',
      'encounter_documents ENABLE',
      'encounter_documents FORCE',
      'encounters ENABLE',
      'encounters FORCE',
      'idempotency_keys ENABLE',
      'idempotency_keys FORCE',
      'patient_references ENABLE',
      'patient_references FORCE',
      'storage_objects ENABLE',
      'storage_objects FORCE',
    ]);
    expect([...operational.matchAll(/\balter\s+table\b/gi)]).toHaveLength(14);
  });

  it('given the forward SQL then it implements NO package 014 object and NO ★ proof', () => {
    // `P5-I2B` DOES NOT AUTHORISE `P5-I2C`. The AAD immutability function and its three
    // triggers belong exclusively to the phase 5 slice of package `014`.
    const operational = operationalSql();

    expect(/\bcreate\s+(or\s+replace\s+)?function\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+trigger\b/i.test(operational)).toBe(false);
    expect(/reject_aad_bound_column_change/i.test(operational)).toBe(false);
    expect(/_aad_immutable_trg/i.test(operational)).toBe(false);
    // `★` is a TEST-level proof owned by `P5-I2V`; no migration may pretend to discharge it.
    expect(/\bpractice_memberships\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it names its own package, as the checksum contract requires', () => {
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_013_PHASE_5_MIGRATION, 'migration.sql'),
      'utf8',
    );

    expect(sql).toContain('013_rls_policies_phase5');
  });
});

// =============================================================================
// C. RLS CATALOGUE
// =============================================================================

describe('RLS catalogue after P5-I2B (02 §17.3, §18.1, §29.4, §29.4a.2; D-065 `RULING 1`)', () => {
  it('given the whole schema when inspected then ALL THIRTEEN tables are true / true', async () => {
    // THE STEADY STATE, MODELLED EXACTLY. The old exact set — six `true`/`true` plus seven
    // `false`/`false` — is superseded by this one of thirteen `true`/`true` (D-064 `OD-9`).
    // The six phase 3/4 tables are asserted to have KEPT their state: this slice must not
    // disturb any of them, and this row-by-row comparison is the mechanical proof it did not.
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
    expect(result.rows.filter((row) => row.relrowsecurity && row.relforcerowsecurity)).toHaveLength(
      13,
    );
  });

  it('given the §23.4 maintenance allowlist then P5-I2B did not extend it', () => {
    // §23.4.4b: the allowlist stays at EXACTLY SIX tables and no phase 5 table may appear on
    // it. Trusted DML never touches a phase 5 table, so the maintenance window stays
    // permanently away from medical data. A table under FORCE is NOT automatically a
    // maintenance-window table, and a silent extension fails the phase gate (§23.4.4).
    const allowlist: readonly string[] = FORCE_RLS_MAINTENANCE_ALLOWLIST;

    expect(allowlist).toHaveLength(6);

    for (const table of P5_I2B_TABLES) {
      expect({ table, allowlisted: allowlist.includes(table) }).toStrictEqual({
        table,
        allowlisted: false,
      });
    }
  });
});

// =============================================================================
// D. POLICY CATALOGUE
// =============================================================================

describe('policy catalogue after P5-I2B — EXACTLY 25 (02 §29.4a.2; D-065 `RULING 1`)', () => {
  it('given the whole schema when inspected then the catalogue is EXACTLY the accepted 25-row set', async () => {
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

    expect(result.rows).toStrictEqual(EXPECTED_POLICY_CATALOGUE.map((row) => ({ ...row })));
    expect(result.rows).toHaveLength(25);
  });

  it('given the catalogue when counted then the total is 25, as an ADDITIONAL assertion', async () => {
    // Permitted as an EXTRA assertion, never as the primary one. `23` and `18` are superseded
    // arithmetic and must never appear as an expected value (D-065 `RULING 1`).
    const result = await migrator.query<{ total: string }>(
      `select count(*)::text as total
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'`,
    );

    expect(result.rows[0]?.total).toBe('25');
  });

  it('given the catalogue when split then it is exactly the TEN phase 3/4 plus the FIFTEEN of P5-I2B', async () => {
    const result = await migrator.query<{ polname: string }>(
      `select p.polname
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by p.polname`,
    );

    const names = result.rows.map((row) => row.polname);

    expect(names).toStrictEqual(
      [...PHASE_3_AND_4_POLICY_NAMES, ...P5_I2B_POLICY_NAMES].sort((a, b) => a.localeCompare(b)),
    );
    expect(P5_I2B_POLICY_NAMES).toHaveLength(15);
    expect(PHASE_3_AND_4_POLICY_NAMES).toHaveLength(10);
  });

  it('given the per-table distribution then it is exactly the accepted one', async () => {
    // `storage_objects` is ABSENT from this result ON PURPOSE: it carries ZERO policies while
    // still carrying `ENABLE` + `FORCE`, which is default-deny and is the security control
    // (§29.4, D-065 `RULING 1`).
    const result = await migrator.query<{ tablename: string; total: string }>(
      `select tablename, count(*)::text as total from pg_policies
        where schemaname = 'public'
        group by tablename
        order by tablename`,
    );

    expect(result.rows).toStrictEqual([
      { tablename: 'audit_events', total: '2' },
      { tablename: 'encounter_diagnoses', total: '2' },
      { tablename: 'encounter_documents', total: '3' },
      { tablename: 'encounters', total: '3' },
      { tablename: 'idempotency_keys', total: '3' },
      { tablename: 'patient_references', total: '2' },
      { tablename: 'platform_role_assignments', total: '2' },
      { tablename: 'practice_membership_roles', total: '1' },
      { tablename: 'practice_memberships', total: '1' },
      { tablename: 'practice_settings', total: '2' },
      { tablename: 'practices', total: '2' },
      { tablename: 'users', total: '2' },
    ]);
  });

  it('given the ten phase 3/4 policies then none was renamed, re-moded or re-targeted', async () => {
    // §29.4a.5 and D-062 Dio B.4: no existing applied policy is renamed for a generic `_policy`
    // suffix, `practices_context_narrow` stays RESTRICTIVE, `users` still carries exactly two,
    // and `practice_memberships_self_select` stays byte-identical.
    const result = await migrator.query<{ polname: string; qual: string }>(
      `select p.polname, pg_get_expr(p.polqual, p.polrelid) as qual
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'practice_memberships'
        order by p.polname`,
    );

    expect(result.rows).toStrictEqual([
      {
        polname: 'practice_memberships_self_select',
        qual: "(user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)",
      },
    ]);
  });
});

// =============================================================================
// E. PREDICATES
// =============================================================================

describe('P5-I2B policy predicates — the unweakened §17.1 tenant pattern (02 §17.1, §29.4)', () => {
  it('given every P5-I2B policy then its USING / WITH CHECK pairing matches its command', async () => {
    // SELECT -> USING only. INSERT -> WITH CHECK only. UPDATE -> BOTH, and that pairing is
    // NORMATIVE rather than redundant (§17.1): `USING` decides WHICH ROWS may be updated, so a
    // cross-tenant write affects ZERO ROWS, while `WITH CHECK` decides WHAT THE ROW MAY BECOME
    // and forbids a move OUT of the established tenant by rewriting `practice_id`.
    const result = await migrator.query<{
      polname: string;
      command: string;
      qual: string | null;
      withcheck: string | null;
    }>(
      `select p.polname,
              p.polcmd::text as command,
              pg_get_expr(p.polqual, p.polrelid) as qual,
              pg_get_expr(p.polwithcheck, p.polrelid) as withcheck
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polname = any($1::text[])
        order by p.polname`,
      [[...P5_I2B_POLICY_NAMES]],
    );

    expect(result.rows).toHaveLength(15);

    expect(
      result.rows.map((row) => ({
        polname: row.polname,
        command: row.command,
        qual: row.qual,
        withcheck: row.withcheck,
      })),
    ).toStrictEqual(
      [...P5_I2B_POLICY_NAMES].map((polname) => {
        if (polname.endsWith('_select')) {
          return { polname, command: SELECT_CMD, qual: TENANT_PREDICATE, withcheck: null };
        }
        if (polname.endsWith('_insert')) {
          return { polname, command: INSERT_CMD, qual: null, withcheck: TENANT_PREDICATE };
        }
        return {
          polname,
          command: UPDATE_CMD,
          qual: TENANT_PREDICATE,
          withcheck: TENANT_PREDICATE,
        };
      }),
    );
  });

  it('given every P5-I2B predicate then it contains no subquery and no forbidden reference', async () => {
    // §29.4, made mechanical. Every one of the fifteen is a PLAIN COMPARISON of a column
    // against a GUC, so there is structurally no surface for leaking co-member identity, no
    // permission/RBAC branch, no `archived_at` soft-delete branch that would hide rows from
    // audit, and no bootstrap exception. Without `app.practice_id` the predicate is
    // `practice_id = NULL`, which yields zero rows for every practice — fail-closed.
    const result = await migrator.query<{ polname: string; expression: string }>(
      `select p.polname,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '')
                || ' '
                || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expression
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polname = any($1::text[])
        order by p.polname`,
      [[...P5_I2B_POLICY_NAMES]],
    );

    expect(result.rows).toHaveLength(15);

    for (const { polname, expression } of result.rows) {
      const offenders = [
        /\bselect\b/i,
        /\bexists\b/i,
        /\busers\b/i,
        /\bpractice_memberships\b/i,
        /\barchived_at\b/i,
        /\bpermission\b/i,
        /\brole\b/i,
        /app\.user_id/i,
        /app\.auth_subject/i,
      ].filter((pattern) => pattern.test(expression));

      expect({ polname, offenders: offenders.map(String) }).toStrictEqual({
        polname,
        offenders: [],
      });
      expect({ polname, canonical: expression.includes(TENANT_PREDICATE) }).toStrictEqual({
        polname,
        canonical: true,
      });
    }
  });

  it('given the whole catalogue then EXACTLY TEN policies carry a WITH CHECK expression', async () => {
    // The six phase 5 INSERT policies, the three phase 5 UPDATE policies and
    // `practice_settings_update`. Every other policy is FOR SELECT, where a WITH CHECK
    // expression would mean an unaccounted write path. The old exact set of ONE is superseded
    // by this one of TEN (D-064 `OD-9`).
    const result = await migrator.query<{ polname: string }>(
      `select p.polname
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polwithcheck is not null
        order by p.polname`,
    );

    expect(result.rows.map((row) => row.polname)).toStrictEqual([
      'audit_events_insert',
      'encounter_diagnoses_insert',
      'encounter_documents_insert',
      'encounter_documents_update',
      'encounters_insert',
      'encounters_update',
      'idempotency_keys_insert',
      'idempotency_keys_update',
      'patient_references_insert',
      'practice_settings_update',
    ]);
  });
});

// =============================================================================
// F. GRANT CATALOGUE
// =============================================================================

describe('grant catalogue after P5-I2B (02 §20.2b, §29.5, §29.4a.3, §29.4a.4; D-064 `OD-2`, `OD-3`)', () => {
  it('given the whole schema then the table-level grant catalogue is EXACTLY the accepted set', async () => {
    const result = await migrator.query<{ table_name: string; grantee: string; privs: string }>(
      `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
        group by table_name, grantee
        order by table_name, grantee`,
    );

    expect(result.rows).toStrictEqual(EXPECTED_TABLE_GRANTS.map((row) => ({ ...row })));
  });

  it('given the whole schema then the column-level UPDATE catalogue is EXACTLY the accepted set', async () => {
    // There is no table-level `UPDATE` anywhere, so this list is the WHOLE truth about what
    // any runtime role may write into an existing row. `encounters` = 12 columns,
    // `encounter_documents` = `archived_at` only, `idempotency_keys` = 4 columns.
    const result = await migrator.query<{ table_name: string; cols: string }>(
      `select table_name, string_agg(column_name, ',' order by column_name) as cols
         from information_schema.role_column_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
          and privilege_type = 'UPDATE'
        group by table_name
        order by table_name`,
    );

    expect(result.rows).toStrictEqual(EXPECTED_UPDATE_COLUMNS.map((row) => ({ ...row })));
  });

  it('given encounters then copilot_app updates EXACTLY the twelve §29.5 columns', async () => {
    const result = await migrator.query<{ column_name: string }>(
      `select column_name from information_schema.role_column_grants
        where table_schema = 'public' and table_name = 'encounters'
          and grantee = 'copilot_app' and privilege_type = 'UPDATE'
        order by column_name`,
    );

    const columns = result.rows.map((row) => row.column_name);

    expect(columns).toStrictEqual([
      'guarantor_type',
      'insurance_context',
      'occurred_at',
      'patient_age_at_encounter',
      'patient_sex_at_encounter',
      'responsible_physician_id',
      'specialty_code',
      'status',
      'treatment_date',
      'updated_at',
      'updated_by',
      'version',
    ]);
    expect(columns).toHaveLength(12);

    // Named individually as well, because these are the columns whose absence carries the
    // security meaning (§29.5): tenant key, row identity, patient linkage, provenance and the
    // whole AAD-bound encryption envelope.
    for (const withheld of [
      'id',
      'practice_id',
      'patient_reference_id',
      'source_system',
      'created_by',
      'created_at',
      'external_encounter_ref_hash',
      'external_encounter_ref_ciphertext',
      'external_encounter_ref_iv',
      'external_encounter_ref_auth_tag',
      'encryption_algorithm',
      'encryption_version',
      'encryption_key_ref',
      'encryption_key_version',
    ]) {
      expect({ withheld, granted: columns.includes(withheld) }).toStrictEqual({
        withheld,
        granted: false,
      });
    }
  });

  it('given encounter_documents then copilot_app updates archived_at and NOTHING else', async () => {
    const result = await migrator.query<{ column_name: string }>(
      `select column_name from information_schema.role_column_grants
        where table_schema = 'public' and table_name = 'encounter_documents'
          and grantee = 'copilot_app' and privilege_type = 'UPDATE'
        order by column_name`,
    );

    expect(result.rows.map((row) => row.column_name)).toStrictEqual(['archived_at']);
  });

  it('given idempotency_keys then copilot_app updates EXACTLY the four §29.4a.3 columns', async () => {
    const result = await migrator.query<{ column_name: string }>(
      `select column_name from information_schema.role_column_grants
        where table_schema = 'public' and table_name = 'idempotency_keys'
          and grantee = 'copilot_app' and privilege_type = 'UPDATE'
        order by column_name`,
    );

    const columns = result.rows.map((row) => row.column_name);

    expect(columns).toStrictEqual([
      'completed_at',
      'locked_at',
      'response_body',
      'response_status',
    ]);

    // D-064 `OD-2`, exhaustively. `practice_id` and `idempotency_key` in particular carry the
    // tenant boundary and the deduplication key, which is why a blanket table-level UPDATE was
    // considered and rejected.
    for (const withheld of [
      'id',
      'practice_id',
      'user_id',
      'idempotency_key',
      'endpoint',
      'request_sha256',
      'expires_at',
      'created_at',
    ]) {
      expect({ withheld, granted: columns.includes(withheld) }).toStrictEqual({
        withheld,
        granted: false,
      });
    }
  });

  it('given audit_events then copilot_app holds SELECT and INSERT and nothing else', async () => {
    // The append-only contract of §15.4, enforced by the GRANT, which is the PRIMARY control
    // (§19.2). An audit trail its own writer may rewrite is not an audit trail.
    const result = await migrator.query<{ privilege_type: string }>(
      `select distinct privilege_type from information_schema.role_column_grants
        where table_schema = 'public' and table_name = 'audit_events'
          and grantee <> 'copilot_migrator'
        order by privilege_type`,
    );

    expect(result.rows.map((row) => row.privilege_type)).toStrictEqual(['INSERT', 'SELECT']);
  });

  it('given patient_references and encounter_diagnoses then neither carries any UPDATE', async () => {
    // §29.5: no UPDATE in phase 5 on either. A diagnosis correction creates a new row rather
    // than overwriting history.
    const result = await migrator.query<{ table_name: string; privilege_type: string }>(
      `select distinct table_name, privilege_type from information_schema.role_column_grants
        where table_schema = 'public'
          and table_name in ('patient_references', 'encounter_diagnoses')
          and grantee <> 'copilot_migrator'
        order by table_name, privilege_type`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'encounter_diagnoses', privilege_type: 'INSERT' },
      { table_name: 'encounter_diagnoses', privilege_type: 'SELECT' },
      { table_name: 'patient_references', privilege_type: 'INSERT' },
      { table_name: 'patient_references', privilege_type: 'SELECT' },
    ]);
  });
});

// =============================================================================
// G. NEGATIVE PRIVILEGE SURFACES
// =============================================================================

describe('negative privilege surfaces after P5-I2B (02 §19.2, §20, §29.7; D-023)', () => {
  it('given every table then PUBLIC holds no privilege at all', async () => {
    // `REVOKE ALL … FROM PUBLIC` precedes every grant in the migration. This is the permanent
    // regression that proves the end state (§29.5, §29.7).
    const tableGrants = await migrator.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'PUBLIC'
        order by table_name, privilege_type`,
    );

    expect(tableGrants.rows).toStrictEqual([]);

    const columnGrants = await migrator.query<{ table_name: string; privilege_type: string }>(
      `select distinct table_name, privilege_type from information_schema.role_column_grants
        where table_schema = 'public' and grantee = 'PUBLIC'
        order by table_name, privilege_type`,
    );

    expect(columnGrants.rows).toStrictEqual([]);
  });

  it('given the seven P5-I2B tables then copilot_system holds nothing on any of them', async () => {
    // D-023: all seven are tenant tables and the platform identity never reaches tenant data.
    // That includes `audit_events` — a platform-wide audit reader is exactly the cross-practice
    // readability D-063 clause 5 forbids categorically.
    const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'];

    for (const table of P5_I2B_TABLES) {
      for (const privilege of privileges) {
        const result = await migrator.query<{ held: boolean }>(
          'select has_table_privilege($1, $2, $3) as held',
          ['copilot_system', table, privilege],
        );

        expect({ table, privilege, held: result.rows[0]?.held }).toStrictEqual({
          table,
          privilege,
          held: false,
        });
      }
    }
  });

  it('given every table then NO role holds DELETE, TRUNCATE, REFERENCES or TRIGGER', async () => {
    const result = await migrator.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
          and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
        order by table_name, grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the schema then no sequence exists and no sequence privilege was granted', async () => {
    // §2.2, §20.3, §29.5: no phase 5 table has a serial or identity column, so no sequence
    // grant is required and none may be issued. The application generates every identifier.
    const sequences = await migrator.query<{ total: string }>(
      `select count(*)::text as total from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'`,
    );

    expect(sequences.rows[0]?.total).toBe('0');

    const usage = await migrator.query<{ total: string }>(
      `select count(*)::text as total from information_schema.role_usage_grants
        where object_type = 'SEQUENCE'`,
    );

    expect(usage.rows[0]?.total).toBe('0');
  });

  it('given schema public then no DEFAULT PRIVILEGE exists and no runtime role may create', async () => {
    const defaults = await migrator.query<{ total: string }>(
      'select count(*)::text as total from pg_default_acl',
    );

    expect(defaults.rows[0]?.total).toBe('0');

    const schema = await migrator.query<{
      app_create: boolean;
      system_create: boolean;
      public_create: boolean;
      public_usage: boolean;
    }>(
      `select has_schema_privilege('copilot_app', 'public', 'CREATE') as app_create,
              has_schema_privilege('copilot_system', 'public', 'CREATE') as system_create,
              has_schema_privilege('public', 'public', 'CREATE') as public_create,
              has_schema_privilege('public', 'public', 'USAGE') as public_usage`,
    );

    expect(schema.rows[0]).toStrictEqual({
      app_create: false,
      system_create: false,
      public_create: false,
      public_usage: false,
    });
  });

  it('given the cluster then P5-I2B introduced no role, no fourth credential and no BYPASSRLS', async () => {
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

  it('given every table then copilot_migrator is still the owner and no policy targets it', async () => {
    // Ownership stays with the migration identity (§3.5) and NO OWNER POLICY EXISTS: under
    // `FORCE` the owner is subject to the policies, and a policy naming it would hand the
    // trusted migration identity an unrestricted read of every PHI table.
    const owners = await migrator.query<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner from pg_tables
        where schemaname = 'public' and tablename in (${P5_I2B_TABLE_LIST})
        order by tablename`,
    );

    expect(owners.rows).toStrictEqual(
      P5_I2B_TABLES.map((tablename) => ({ tablename, tableowner: 'copilot_migrator' })),
    );

    const ownerPolicies = await migrator.query<{ polname: string }>(
      `select p.polname
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and 'copilot_migrator'::regrole::oid = any(p.polroles)
        order by p.polname`,
    );

    expect(ownerPolicies.rows).toStrictEqual([]);
  });

  it('given the schema then P5-I2B created no function, no trigger and nothing SECURITY DEFINER', async () => {
    // `P5-I2B` DOES NOT AUTHORISE `P5-I2C`. `reject_aad_bound_column_change` and the three
    // `*_aad_immutable_trg` triggers belong to the phase 5 slice of package `014` and must be
    // ABSENT here.
    const functions = await migrator.query<{ proname: string; prosecdef: boolean }>(
      `select p.proname, p.prosecdef from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app_security', 'public')
        order by p.proname`,
    );

    expect(functions.rows.map((row) => row.proname)).toStrictEqual([
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

    expect(triggers.rows).toStrictEqual([]);
  });
});

// =============================================================================
// H. STORAGE_OBJECTS — DEFAULT DENY
// =============================================================================

describe('storage_objects is deliberately unreachable (02 §29.4, §29.5; D-065 `RULING 1`)', () => {
  it('given storage_objects then it is true / true with ZERO policies', async () => {
    // RLS enabled with no policy is DEFAULT-DENY: even if a grant were issued by mistake,
    // `copilot_app` would still see zero rows and write none. That is strictly stronger than
    // relying on the absent grant alone, and it must NOT be "fixed" by adding a policy.
    const flags = await migrator.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relrowsecurity, c.relforcerowsecurity from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'storage_objects'`,
    );

    expect(flags.rows[0]).toStrictEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await migrator.query<{ policyname: string }>(
      `select policyname from pg_policies
        where schemaname = 'public' and tablename = 'storage_objects'`,
    );

    expect(policies.rows).toStrictEqual([]);
  });

  it('given storage_objects then no runtime role holds any privilege of any kind', async () => {
    const tableGrants = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'storage_objects'
          and grantee <> 'copilot_migrator'
        order by grantee, privilege_type`,
    );

    expect(tableGrants.rows).toStrictEqual([]);

    const columnGrants = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select distinct grantee, privilege_type from information_schema.role_column_grants
        where table_schema = 'public' and table_name = 'storage_objects'
          and grantee <> 'copilot_migrator'
        order by grantee, privilege_type`,
    );

    expect(columnGrants.rows).toStrictEqual([]);

    for (const grantee of ['copilot_app', 'copilot_system', 'public']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES']) {
        const held = await migrator.query<{ held: boolean }>(
          'select has_table_privilege($1, $2, $3) as held',
          [grantee, 'storage_objects', privilege],
        );

        expect({ grantee, privilege, held: held.rows[0]?.held }).toStrictEqual({
          grantee,
          privilege,
          held: false,
        });
      }
    }
  });
});

// =============================================================================
// BEHAVIOURAL — SAME TENANT
// =============================================================================

describe('behaviour: SAME TENANT under real copilot_app (02 §17.1, §25.1.1, §25.2.2)', () => {
  it('given a valid tenant context then the allowed INSERT, SELECT and bounded UPDATE all succeed', async () => {
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);

      const encounters = await client.query<{ id: string; status: string }>(
        'select id, status from encounters where id = $1',
        [FIXTURE.encounter],
      );

      expect(encounters.rows).toStrictEqual([{ id: FIXTURE.encounter, status: 'DRAFT' }]);

      const updated = await client.query(
        `update encounters
            set status = 'REVIEW_REQUIRED', version = version + 1, updated_at = now(),
                updated_by = $2
          where id = $1`,
        [FIXTURE.encounter, ACTOR],
      );

      expect(updated.rowCount).toBe(1);

      const after = await client.query<{ status: string; version: number }>(
        'select status, version from encounters where id = $1',
        [FIXTURE.encounter],
      );

      expect(after.rows).toStrictEqual([{ status: 'REVIEW_REQUIRED', version: 2 }]);
    });
  });

  it('given a valid tenant context then encounter_diagnoses and encounter_documents accept an INSERT', async () => {
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);

      const diagnosis = await client.query(
        `insert into encounter_diagnoses
           (id, practice_id, encounter_id, coding_system, diagnosis_code, is_primary,
            source, review_state)
         values ($1, $2, $3, 'ICD-10-GM', 'A00.0', true, 'MANUAL', 'UNREVIEWED')`,
        [FIXTURE.diagnosis, DEMO, FIXTURE.encounter],
      );

      expect(diagnosis.rowCount).toBe(1);

      // `storage_object_id` is deliberately NULL: `copilot_app` holds no privilege on
      // `storage_objects` at all, so a document that referenced one could not be created by a
      // runtime role in phase 5 (§29.5).
      const document = await client.query(
        `insert into encounter_documents
           (id, practice_id, encounter_id, document_type, source,
            processing_status, redaction_status, created_by)
         values ($1, $2, $3, 'CONSULTATION_NOTE', 'MANUAL_TEXT', 'READY', 'FAILED', $4)`,
        [FIXTURE.document, DEMO, FIXTURE.encounter, ACTOR],
      );

      expect(document.rowCount).toBe(1);

      const archived = await client.query(
        'update encounter_documents set archived_at = now() where id = $1',
        [FIXTURE.document],
      );

      expect(archived.rowCount).toBe(1);
    });
  });

  it('given a valid tenant context then idempotency_keys accepts an INSERT and the bounded UPDATE', async () => {
    await withTenant(DEMO, async (client) => {
      const inserted = await client.query(
        `insert into idempotency_keys
           (id, practice_id, user_id, idempotency_key, endpoint, request_sha256, expires_at)
         values ($1, $2, $3, 'p5-i2b-key', '/v1/encounters', 'sha', now() + interval '1 day')`,
        [FIXTURE.idempotencyKey, DEMO, ACTOR],
      );

      expect(inserted.rowCount).toBe(1);

      const claimed = await client.query(
        `update idempotency_keys
            set locked_at = now(), response_status = 201, response_body = '{}'::jsonb,
                completed_at = now()
          where id = $1`,
        [FIXTURE.idempotencyKey],
      );

      expect(claimed.rowCount).toBe(1);
    });
  });

  it('given a valid tenant context then audit_events accepts an append and a read', async () => {
    await withTenant(DEMO, async (client) => {
      const appended = await client.query(
        `insert into audit_events
           (id, practice_id, occurred_at, actor_type, actor_user_id, action,
            resource_type, metadata, event_sha256)
         values ($1, $2, now(), 'USER', $3, 'encounter.created', 'encounter',
                 '{}'::jsonb, 'p5-i2b-sha')`,
        [FIXTURE.auditEvent, DEMO, ACTOR],
      );

      expect(appended.rowCount).toBe(1);

      const read = await client.query<{ id: string }>('select id from audit_events');

      expect(read.rows).toStrictEqual([{ id: FIXTURE.auditEvent }]);
    });
  });
});

// =============================================================================
// BEHAVIOURAL — CROSS TENANT
// =============================================================================

describe('behaviour: CROSS TENANT is denied (02 §17.1, §25.2.2; D-063 clause 5)', () => {
  it('given rows of another practice then a cross-practice SELECT returns ZERO ROWS', async () => {
    // The rows are created under DEMO inside this transaction, then read back with the tenant
    // context switched to NORD. `USING` filters them out entirely — no error, no row.
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);
      await client.query(
        `insert into audit_events
           (id, practice_id, occurred_at, actor_type, action, resource_type, metadata,
            event_sha256)
         values ($1, $2, now(), 'USER', 'encounter.created', 'encounter', '{}'::jsonb, 'sha')`,
        [FIXTURE.auditEvent, DEMO],
      );

      await client.query('select set_config($1, $2, true)', ['app.practice_id', NORD]);

      for (const table of ['patient_references', 'encounters', 'audit_events']) {
        const result = await client.query<{ total: string }>(
          `select count(*)::text as total from ${table}`,
        );

        expect({ table, total: result.rows[0]?.total }).toStrictEqual({ table, total: '0' });
      }
    });
  });

  it('given a cross-practice INSERT then WITH CHECK rejects it with SQLSTATE 42501', async () => {
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);

      const encounter = await sqlStateInside(
        client,
        'cross_encounter',
        `insert into encounters
           (id, practice_id, patient_reference_id, occurred_at, treatment_date,
            status, source_system, created_by, updated_at)
         values ($1, $2, $3, now(), current_date, 'DRAFT', 'MANUAL', $4, now())`,
        [FIXTURE.foreignRow, NORD, FIXTURE.patientReference, ACTOR],
      );

      expect(encounter).toBe(INSUFFICIENT_PRIVILEGE);

      const reference = await sqlStateInside(
        client,
        'cross_reference',
        `insert into patient_references
           (id, practice_id, source_system, external_patient_ref_hash, pseudonym, updated_at)
         values ($1, $2, 'MANUAL', 'cross-hash', 'CROSS-001', now())`,
        [FIXTURE.foreignRow, NORD],
      );

      expect(reference).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('given a cross-practice audit append then it is rejected — the D-063 clause 5 regression', async () => {
    // Cross-practice readability AND writability of `audit_events` are categorically
    // forbidden. This negative is a PERMANENT REGRESSION and may never be relaxed.
    await withTenant(DEMO, async (client) => {
      const state = await sqlStateInside(
        client,
        'cross_audit',
        `insert into audit_events
           (id, practice_id, occurred_at, actor_type, action, resource_type, metadata,
            event_sha256)
         values ($1, $2, now(), 'USER', 'encounter.created', 'encounter', '{}'::jsonb, 'sha')`,
        [FIXTURE.foreignRow, NORD],
      );

      expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('given a cross-practice UPDATE then USING makes it affect ZERO ROWS', async () => {
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);
      await client.query('select set_config($1, $2, true)', ['app.practice_id', NORD]);

      const updated = await client.query(
        `update encounters set status = 'CANCELLED', updated_at = now() where id = $1`,
        [FIXTURE.encounter],
      );

      expect(updated.rowCount).toBe(0);
    });
  });

  it('given an attempt to move a row OUT of its tenant then the privilege barrier rejects it first', async () => {
    // TWO INDEPENDENT BARRIERS (§29.5). `practice_id` carries no `UPDATE` grant, so the
    // rewrite fails on PRIVILEGE with SQLSTATE 42501 before the `WITH CHECK` of the tenant
    // policy is even reached. The policy remains the second barrier and is asserted
    // separately in the predicate section.
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);

      const state = await sqlStateInside(
        client,
        'tenant_move',
        'update encounters set practice_id = $2 where id = $1',
        [FIXTURE.encounter, NORD],
      );

      expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

// =============================================================================
// BEHAVIOURAL — NO TENANT CONTEXT
// =============================================================================

describe('behaviour: NO TENANT CONTEXT is fail-closed (02 §17.1, §29.4)', () => {
  it('given app.practice_id unset then every phase 5 SELECT returns ZERO ROWS', async () => {
    // Without the GUC the predicate is `practice_id = NULL`, which yields zero rows for EVERY
    // practice. There is no bootstrap exception and none may be added: fail-closed, never
    // fail-open.
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);
      await client.query(
        `insert into audit_events
           (id, practice_id, occurred_at, actor_type, action, resource_type, metadata,
            event_sha256)
         values ($1, $2, now(), 'USER', 'encounter.created', 'encounter', '{}'::jsonb, 'sha')`,
        [FIXTURE.auditEvent, DEMO],
      );
      await client.query(
        `insert into idempotency_keys
           (id, practice_id, user_id, idempotency_key, endpoint, request_sha256, expires_at)
         values ($1, $2, $3, 'p5-i2b-key', '/v1/encounters', 'sha', now() + interval '1 day')`,
        [FIXTURE.idempotencyKey, DEMO, ACTOR],
      );
      await client.query(
        `insert into encounter_diagnoses
           (id, practice_id, encounter_id, coding_system, diagnosis_code, is_primary,
            source, review_state)
         values ($1, $2, $3, 'ICD-10-GM', 'A00.0', true, 'MANUAL', 'UNREVIEWED')`,
        [FIXTURE.diagnosis, DEMO, FIXTURE.encounter],
      );
      await client.query(
        `insert into encounter_documents
           (id, practice_id, encounter_id, document_type, source,
            processing_status, redaction_status, created_by)
         values ($1, $2, $3, 'CONSULTATION_NOTE', 'MANUAL_TEXT', 'READY', 'FAILED', $4)`,
        [FIXTURE.document, DEMO, FIXTURE.encounter, ACTOR],
      );

      await client.query('select set_config($1, $2, true)', ['app.practice_id', '']);

      for (const table of [
        'patient_references',
        'encounters',
        'encounter_diagnoses',
        'encounter_documents',
        'idempotency_keys',
        'audit_events',
      ]) {
        const result = await client.query<{ total: string }>(
          `select count(*)::text as total from ${table}`,
        );

        expect({ table, total: result.rows[0]?.total }).toStrictEqual({ table, total: '0' });
      }
    });
  });

  it('given app.practice_id unset then an INSERT is rejected rather than accepted tenant-less', async () => {
    await withTenant(null, async (client) => {
      const state = await sqlStateInside(
        client,
        'no_context_insert',
        `insert into patient_references
           (id, practice_id, source_system, external_patient_ref_hash, pseudonym, updated_at)
         values ($1, $2, 'MANUAL', 'no-context', 'NOCTX-001', now())`,
        [FIXTURE.foreignRow, DEMO],
      );

      expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

// =============================================================================
// BEHAVIOURAL — DENIED COLUMN UPDATE
// =============================================================================

describe('behaviour: a denied UPDATE column fails with SQLSTATE 42501 (02 §20.2b, §29.5)', () => {
  it('given encounters then a withheld column cannot be written', async () => {
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);

      for (const [label, statement] of [
        ['created_by', 'update encounters set created_by = $2 where id = $1'],
        ['patient_reference_id', 'update encounters set patient_reference_id = $2 where id = $1'],
        ['encryption_key_ref', "update encounters set encryption_key_ref = 'k' where id = $1"],
      ] as const) {
        const state = await sqlStateInside(
          client,
          `enc_${label}`,
          statement,
          statement.includes('$2') ? [FIXTURE.encounter, ACTOR] : [FIXTURE.encounter],
        );

        expect({ label, state }).toStrictEqual({ label, state: INSUFFICIENT_PRIVILEGE });
      }
    });
  });

  it('given encounter_documents then any column other than archived_at cannot be written', async () => {
    await withTenant(DEMO, async (client) => {
      await seedEncounter(client, DEMO);
      await client.query(
        `insert into encounter_documents
           (id, practice_id, encounter_id, document_type, source,
            processing_status, redaction_status, created_by)
         values ($1, $2, $3, 'CONSULTATION_NOTE', 'MANUAL_TEXT', 'READY', 'FAILED', $4)`,
        [FIXTURE.document, DEMO, FIXTURE.encounter, ACTOR],
      );

      for (const [label, statement] of [
        ['processing_status', "update encounter_documents set processing_status = 'FAILED'"],
        ['redaction_status', "update encounter_documents set redaction_status = 'FAILED'"],
        ['created_by', 'update encounter_documents set created_by = $1'],
      ] as const) {
        const state = await sqlStateInside(
          client,
          `doc_${label}`,
          statement,
          statement.includes('$1') ? [ACTOR] : [],
        );

        expect({ label, state }).toStrictEqual({ label, state: INSUFFICIENT_PRIVILEGE });
      }
    });
  });

  it('given idempotency_keys then a withheld column cannot be written', async () => {
    await withTenant(DEMO, async (client) => {
      await client.query(
        `insert into idempotency_keys
           (id, practice_id, user_id, idempotency_key, endpoint, request_sha256, expires_at)
         values ($1, $2, $3, 'p5-i2b-key', '/v1/encounters', 'sha', now() + interval '1 day')`,
        [FIXTURE.idempotencyKey, DEMO, ACTOR],
      );

      for (const [label, statement] of [
        ['expires_at', 'update idempotency_keys set expires_at = now()'],
        ['idempotency_key', "update idempotency_keys set idempotency_key = 'other'"],
        ['request_sha256', "update idempotency_keys set request_sha256 = 'other'"],
      ] as const) {
        const state = await sqlStateInside(client, `idem_${label}`, statement);

        expect({ label, state }).toStrictEqual({ label, state: INSUFFICIENT_PRIVILEGE });
      }
    });
  });

  it('given audit_events then no UPDATE and no DELETE is possible at all', async () => {
    // The append-only contract, proven from the runtime role rather than only from the
    // catalogue.
    await withTenant(DEMO, async (client) => {
      await client.query(
        `insert into audit_events
           (id, practice_id, occurred_at, actor_type, action, resource_type, metadata,
            event_sha256)
         values ($1, $2, now(), 'USER', 'encounter.created', 'encounter', '{}'::jsonb, 'sha')`,
        [FIXTURE.auditEvent, DEMO],
      );

      expect(
        await sqlStateInside(client, 'audit_update', "update audit_events set action = 'x'"),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlStateInside(client, 'audit_delete', 'delete from audit_events')).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    });
  });

  it('given any phase 5 table then DELETE is refused for the runtime role', async () => {
    await withTenant(DEMO, async (client) => {
      for (const table of [
        'patient_references',
        'encounters',
        'encounter_diagnoses',
        'encounter_documents',
        'idempotency_keys',
      ]) {
        const state = await sqlStateInside(client, `del_${table}`, `delete from ${table}`);

        expect({ table, state }).toStrictEqual({ table, state: INSUFFICIENT_PRIVILEGE });
      }
    });
  });
});

// =============================================================================
// BEHAVIOURAL — STORAGE_OBJECTS
// =============================================================================

describe('behaviour: storage_objects is unreachable for copilot_app (02 §29.5)', () => {
  it('given a valid tenant context then every statement against storage_objects fails with 42501', async () => {
    // No policy path exists because no policy exists. The privilege barrier answers first and
    // the default-deny of RLS stands behind it.
    await withTenant(DEMO, async (client) => {
      const statements: readonly [string, string, readonly unknown[]][] = [
        ['select', 'select id from storage_objects', []],
        [
          'insert',
          `insert into storage_objects
             (id, practice_id, bucket_name, object_key, content_type, byte_size, sha256,
              created_by)
           values ($1, $2, 'bucket', 'key', 'text/plain', 1, 'sha', $3)`,
          [FIXTURE.foreignRow, DEMO, ACTOR],
        ],
        ['update', 'update storage_objects set archived_at = now()', []],
        ['delete', 'delete from storage_objects', []],
      ];

      for (const [label, statement, parameters] of statements) {
        const state = await sqlStateInside(client, `storage_${label}`, statement, parameters);

        expect({ label, state }).toStrictEqual({ label, state: INSUFFICIENT_PRIVILEGE });
      }
    });
  });
});

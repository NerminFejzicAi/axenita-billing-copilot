import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * The STEADY-STATE catalogue and behaviour of sub-gate `P5-I2C` — the phase 5 slice of
 * migration package `014_immutability_triggers` (02 §2.7.4, §2.7.8, §19.3, §22.14, §25.8,
 * §25.8a, §29.4a, §29.5, §29.7, §29.10; D-025 clause 12, D-062 `OD-P5-D2-1`, D-064 function
 * ACL hygiene of package `014` and `OD-8`/`OD-9`, D-065, D-066; test contract 08 §12.9.4).
 *
 * THIS FILE IS THE OWNER of the post-`P5-I2C` AAD state: the exact FOUR-function
 * `app_security` catalogue, the exact THREE-trigger catalogue, the function ACL, and the
 * behavioural contract of §25.8 as CORRECTED by §25.8a.
 *
 * EVERY SET COMPARISON HERE IS `toStrictEqual` OVER A FULL SET, never a containment check.
 * D-064 `OD-9` authorises an exact set to be REPLACED by a new exact set when a canonical
 * slice deliberately changes the database; it NEVER authorises `exact` -> `contains` /
 * `subset` / `partial`.
 *
 * -------------------------------------------------------------------------------------
 * THE TWO BARRIERS ARE NOT INTERCHANGEABLE (02 §25.8a, D-064 correction B)
 * -------------------------------------------------------------------------------------
 *
 * `42501` (`insufficient_privilege`) is the FIRST barrier and belongs to `P5-I2B`:
 * `copilot_app` holds no column-level `UPDATE` on `id` or `practice_id` on any of the three
 * tables (§29.5), so a runtime mutation attempt fails on PRIVILEGE. That refusal says NOTHING
 * about whether the trigger exists, let alone whether it fired, and this file never presents
 * it as if it did.
 *
 * `23514` (`check_violation`) is the SECOND barrier and belongs to `P5-I2C`: it is raised by
 * `app_security.reject_aad_bound_column_change()` itself.
 *
 * The naive proof "`copilot_migrator` mutates `id` on a real phase 5 table and receives
 * `23514`" is EXPLICITLY NOT REQUIRED and is rejected as invalid under the phase 5 model
 * (§25.8a): since the phase 5 slice of package `013` the OWNER is subject to `FORCE ROW LEVEL
 * SECURITY` too and has no applicable runtime policy, so RLS may stop the row before the
 * `BEFORE UPDATE` trigger is ever consulted — the test would then pass for the wrong reason or
 * fail while saying nothing at all about the trigger. §25.8a therefore splits the proof in
 * three: catalogue attachment against the real tables, the first barrier at runtime, and the
 * function's BEHAVIOUR on a TEST-ONLY TEMPORARY table carrying the SAME canonical function.
 * `FORCE RLS` is not weakened in any of the three, and no owner policy, fourth role,
 * `BYPASSRLS`, permanent test table or widened production grant is introduced to reach the
 * trigger.
 *
 * -------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT PROVE
 * -------------------------------------------------------------------------------------
 *
 * IT DOES NOT DISCHARGE `★`. The `P5-I2V` RI-versus-RLS proof requires, in ONE transaction
 * under real `copilot_app` and real `FORCE RLS`, that a same-practice co-member
 * responsible-physician INSERT SUCCEEDS through the composite foreign key WHILE a direct
 * `SELECT` of that same `practice_memberships` row returns ZERO ROWS. SQLSTATE `42501` is NOT
 * that second half. `P5-I2C` does not advance `★` by a single assertion, `★` remains a HARD
 * precondition of `P5-I5`, and `P5-I5` stays BLOCKED.
 *
 * IT OWNS NO GRANT AND NO POLICY. The phase 5 security surface — table grants, column grants,
 * `ENABLE`/`FORCE ROW LEVEL SECURITY` and all 25 policies — is owned by
 * `phase5-rls-grants.security.ts` (`P5-I2B`). The regression section at the end of this file
 * asserts that `P5-I2C` left that state untouched; it does not restate its ownership.
 */
const database = securityDatabase();
const apiRoot = resolve(import.meta.dirname, '..');

/**
 * The canonical migration chain after `P5-I2C` — EXACTLY SEVEN directories, in application
 * order (§29.10; D-064 `OD-8`).
 *
 * Package numbers carry OWNERSHIP, not execution order (D-052), which is why `013` precedes
 * `003` and why the phase 5 slices of `011`, `013` and `014` follow all of them. The old
 * exact set of SIX is superseded by this one of SEVEN — a deliberate canonical evolution
 * under D-064 `OD-9`, never a weakening. SEVEN is the FINAL count for phase 5: §29.10 names
 * no eighth directory.
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

/** The phase 5 slice of package `014` — the migration this file speaks for. */
const PACKAGE_014_PHASE_5_MIGRATION = EXPECTED_MIGRATIONS[6];

/** The phase 5 slice of package `013`, which keeps its canonical position at index 5. */
const PACKAGE_013_PHASE_5_MIGRATION = EXPECTED_MIGRATIONS[5];

/** SQLSTATE `check_violation` — the canonical AAD trigger refusal (§19.3, §25.8). */
const CHECK_VIOLATION = '23514';

/** The canonical function this package owns, unqualified. */
const AAD_FUNCTION = 'reject_aad_bound_column_change';

/** The canonical function, fully qualified with its (empty) argument list. */
const AAD_FUNCTION_SIGNATURE = `app_security.${AAD_FUNCTION}()`;

/**
 * The exact THREE tables that receive an AAD trigger in phase 5 (§22.14, D-062
 * `OD-P5-D2-1`).
 *
 * §19.3 names FIVE triggers. `candidate_evidence` and `external_resource_links` DO NOT EXIST
 * in phase 5, so their triggers belong to the phase that owns their state. A fourth or fifth
 * trigger here is a defect, not an omission.
 */
const AAD_TRIGGER_TABLES = ['encounter_documents', 'encounters', 'patient_references'] as const;

/**
 * The exact non-internal trigger catalogue of the whole `public` schema after `P5-I2C`,
 * `order by tgname`.
 *
 * The old exact set was EMPTY. This one of THREE supersedes it — a canonical
 * old-exact-set -> new-exact-set evolution (D-064 `OD-9`), never a weakening.
 */
const EXPECTED_TRIGGER_DEFINITIONS = [
  {
    tgname: 'encounter_documents_aad_immutable_trg',
    tbl: 'encounter_documents',
    definition:
      'CREATE TRIGGER encounter_documents_aad_immutable_trg BEFORE UPDATE ON public.encounter_documents FOR EACH ROW EXECUTE FUNCTION app_security.reject_aad_bound_column_change()',
  },
  {
    tgname: 'encounters_aad_immutable_trg',
    tbl: 'encounters',
    definition:
      'CREATE TRIGGER encounters_aad_immutable_trg BEFORE UPDATE ON public.encounters FOR EACH ROW EXECUTE FUNCTION app_security.reject_aad_bound_column_change()',
  },
  {
    tgname: 'patient_references_aad_immutable_trg',
    tbl: 'patient_references',
    definition:
      'CREATE TRIGGER patient_references_aad_immutable_trg BEFORE UPDATE ON public.patient_references FOR EACH ROW EXECUTE FUNCTION app_security.reject_aad_bound_column_change()',
  },
] as const;

/**
 * The COMPLETE post-`P5-I2B` policy catalogue — 25 names (§29.4a.2, D-065 `RULING 1`).
 *
 * Restated here in full, as an EXACT set, because `P5-I2C` must prove it changed NOTHING
 * about it. `phase5-rls-grants.security.ts` remains the owner of WHY each policy exists and
 * of its mode, command, role and predicate; this list is a regression fence only.
 *
 * THE NUMBERS THAT MUST NEVER REAPPEAR AS AN EXPECTED VALUE: `8` phase 5 PHI policies,
 * `18 / 11`, and `23` total policies — all three are superseded arithmetic (D-065 `RULING 1`).
 */
const EXPECTED_POLICY_NAMES = [
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

/** The THIRTEEN tables that are `ENABLE` + `FORCE ROW LEVEL SECURITY` (§29.4a.2). */
const EXPECTED_RLS_TABLES = [
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

/** Seed practices. `practiceNord` is the cross-tenant negative. */
const DEMO = PHASE_3_SEED_IDS.practiceDemo;
const NORD = PHASE_3_SEED_IDS.practiceNord;
const ACTOR = PHASE_3_SEED_IDS.userPracticeAdmin;

/** Deterministic row identifiers for the behavioural fixtures; every one is rolled back. */
const FIXTURE = {
  patientReference: '7c000000-0000-4000-8000-00000000c001',
  encounter: '7c000000-0000-4000-8000-00000000c002',
  document: '7c000000-0000-4000-8000-00000000c003',
  moved: '7c000000-0000-4000-8000-00000000c0ff',
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
 * The migration's OPERATIONAL SQL, with comments stripped.
 *
 * Comments MUST be stripped before every scan below, exactly as the package `003`, `011` and
 * `013` phase 5 scans do: the file DOCUMENTS the forbidden constructs in prose in order to
 * record why they are absent, and flagging that prose would push a future author to delete the
 * very text that carries the decision.
 */
function operationalSql(): string {
  const sql = readFileSync(
    resolve(apiRoot, 'prisma/migrations', PACKAGE_014_PHASE_5_MIGRATION, 'migration.sql'),
    'utf8',
  );

  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * Opens a tenant transaction as the REAL `copilot_app` role, runs `work`, and ALWAYS rolls
 * back.
 *
 * `app.practice_id` is set with `set_config` directly rather than through
 * `set_request_context`, which §25.1.1 permits for policy verification: the point here is the
 * privilege barrier, not the admission path that establishes the GUC.
 */
async function withTenant<T>(practiceId: string, work: (client: Client) => Promise<T>): Promise<T> {
  await app.query('begin');

  try {
    await app.query('select set_config($1, $2, true)', ['app.practice_id', practiceId]);
    return await work(app);
  } finally {
    await app.query('rollback');
  }
}

/**
 * Runs `statement` inside a SAVEPOINT and returns the SQLSTATE PostgreSQL reported, or
 * `undefined` when it succeeded.
 *
 * A savepoint rather than a nested transaction, because these negatives run INSIDE a
 * transaction that already holds fixture rows: a failed statement must not abort the rows the
 * next assertion depends on. A negative test asserts the EXACT SQLSTATE, never merely
 * "it threw".
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

/** Inserts the same-tenant fixture chain: patient reference -> encounter -> document. */
async function seedChain(client: Client, practiceId: string): Promise<void> {
  await client.query(
    `insert into patient_references
       (id, practice_id, source_system, external_patient_ref_hash, pseudonym, updated_at)
     values ($1, $2, 'MANUAL', 'p5-i2c-hash', 'P5-I2C-001', now())`,
    [FIXTURE.patientReference, practiceId],
  );
  await client.query(
    `insert into encounters
       (id, practice_id, patient_reference_id, occurred_at, treatment_date,
        status, source_system, created_by, updated_at)
     values ($1, $2, $3, now(), current_date, 'DRAFT', 'MANUAL', $4, now())`,
    [FIXTURE.encounter, practiceId, FIXTURE.patientReference, ACTOR],
  );
  await client.query(
    `insert into encounter_documents
       (id, practice_id, encounter_id, document_type, source,
        processing_status, redaction_status, created_by)
     values ($1, $2, $3, 'CONSULTATION_NOTE', 'MANUAL_TEXT', 'READY', 'FAILED', $4)`,
    [FIXTURE.document, practiceId, FIXTURE.encounter, ACTOR],
  );
}

// =============================================================================
// A. MIGRATION CHAIN
// =============================================================================

describe('migration chain after P5-I2C (02 §29.10; D-064 `OD-8`)', () => {
  it('given the repository when inspected then EXACTLY SEVEN migration directories exist', () => {
    // Identity and order, not a count: a wrong package applied in the right number would
    // otherwise pass (00 §6.2).
    const directories = readdirSync(resolve(apiRoot, 'prisma/migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toStrictEqual([...EXPECTED_MIGRATIONS]);
    expect(directories).toHaveLength(7);
  });

  it('given the phase 5 slice of package 014 then it is chronologically LAST and named canonically', () => {
    // §29.10 fixes the suffix `_014_immutability_triggers_phase5` and forbids inventing the
    // timestamp ahead of authoring time.
    expect(PACKAGE_014_PHASE_5_MIGRATION).toMatch(/^\d{14}_014_immutability_triggers_phase5$/);
    expect(EXPECTED_MIGRATIONS.at(-1)).toBe(PACKAGE_014_PHASE_5_MIGRATION);
    // The `013` phase 5 slice keeps its canonical position and is no longer final.
    expect(EXPECTED_MIGRATIONS.indexOf(PACKAGE_013_PHASE_5_MIGRATION)).toBe(5);
  });

  it('given the migrated database when inspected then exactly those seven are recorded as applied', async () => {
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

    const applied = result.rows.find((row) => row.migration_name === PACKAGE_014_PHASE_5_MIGRATION);

    expect(applied?.finished_at).not.toBeNull();
    expect(applied?.rolled_back_at).toBeNull();
    expect(applied?.applied_steps_count).toBeGreaterThan(0);
  });

  it('given the six earlier migrations then package 014 added exactly ONE new directory', () => {
    // `P5-I2C` creates ONE migration. A "part two" would by definition create a committed
    // intermediate state in which the function exists without its triggers.
    const package014 = EXPECTED_MIGRATIONS.filter((name) => /_014_/.test(name));

    expect(package014).toStrictEqual([PACKAGE_014_PHASE_5_MIGRATION]);
  });
});

// =============================================================================
// B. MIGRATION SQL CONTRACT — STATIC
// =============================================================================

describe('package 014 phase 5 forward SQL — explicit transaction and exact scope', () => {
  it('given the forward SQL then it carries EXACTLY ONE top-level BEGIN and ONE COMMIT', () => {
    // Atomicity must be a property of THIS FILE and must NOT be delegated to the assumption
    // that the Prisma migration runtime implicitly wraps `migration.sql` in a transaction. A
    // partially applied file would otherwise leave a COMMITTED state in which the function
    // exists without the triggers that make it an enforced contract, or a trigger exists while
    // `PUBLIC` still holds the default `EXECUTE` on its function.
    //
    // This is a LOCAL safety choice for THIS migration. D-065 `RULING 2` mandates the explicit
    // boundary for the phase 5 slice of package `013`; it establishes no project-wide
    // transaction-wrapping policy and this assertion must not be cited as if it did.
    const operational = operationalSql();

    expect(operational.match(/^\s*begin\s*;/gim) ?? []).toHaveLength(1);
    expect(operational.match(/^\s*commit\s*;/gim) ?? []).toHaveLength(1);
  });

  it('given the forward SQL then it contains NO transaction-breaking statement', () => {
    const operational = operationalSql();

    expect(/\brollback\b/i.test(operational)).toBe(false);
    expect(/\bsavepoint\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+index\s+concurrently\b/i.test(operational)).toBe(false);
    expect(/\bvacuum\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+database\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it creates EXACTLY ONE function, canonically shaped', () => {
    const operational = operationalSql();

    expect([...operational.matchAll(/\bcreate\s+(or\s+replace\s+)?function\b/gi)]).toHaveLength(1);
    expect(operational).toContain(`"app_security"."${AAD_FUNCTION}"()`);
    expect(/\breturns\s+trigger\b/i.test(operational)).toBe(true);
    expect(/\blanguage\s+plpgsql\b/i.test(operational)).toBe(true);
    expect(/\bsecurity\s+invoker\b/i.test(operational)).toBe(true);
    expect(/\bset\s+search_path\s*=\s*pg_catalog,\s*pg_temp\b/i.test(operational)).toBe(true);
    // The canonical refusal, verbatim (§19.3).
    expect(operational).toContain("ERRCODE = '23514'");
    expect(operational).toContain(
      "MESSAGE = 'AAD-bound column (id, practice_id) is immutable after INSERT'",
    );
  });

  it('given the forward SQL then it is NOT SECURITY DEFINER and grants NO EXECUTE', () => {
    // D-064 ratifies `REVOKE ALL … FROM PUBLIC` and NO direct `EXECUTE` grant to either
    // runtime role. Trigger execution is unaffected: `EXECUTE` is checked when the TRIGGER is
    // created — by the owner, in this same transaction — not on every fired row.
    const operational = operationalSql();

    expect(/\bsecurity\s+definer\b/i.test(operational)).toBe(false);
    expect([
      ...operational.matchAll(/\brevoke\s+all\s+on\s+function\b[\s\S]*?\bfrom\s+public\b/gi),
    ]).toHaveLength(1);
    expect(operational).toContain(`REVOKE ALL ON FUNCTION "app_security"."${AAD_FUNCTION}"()`);
    // No `GRANT` of any kind — not `EXECUTE`, and not a table privilege either.
    expect(/\bgrant\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it creates EXACTLY THREE triggers, bare BEFORE UPDATE FOR EACH ROW', () => {
    const operational = operationalSql();
    const created = [...operational.matchAll(/\bcreate\s+trigger\s+"(\w+)"/gi)]
      .map((match) => match[1] ?? '')
      .sort();

    expect(created).toStrictEqual(
      [...EXPECTED_TRIGGER_DEFINITIONS.map((trigger) => trigger.tgname)].sort(),
    );
    expect(created).toHaveLength(3);

    expect([...operational.matchAll(/\bbefore\s+update\s+on\b/gi)]).toHaveLength(3);
    expect([...operational.matchAll(/\bfor\s+each\s+row\b/gi)]).toHaveLength(3);
    // `UPDATE OF` narrows the firing condition inside the trigger definition, where a later
    // schema change can silently outgrow it; a `WHEN` clause moves the comparison out of the
    // function for the same reason. §19.3 forbids both.
    expect(/\bupdate\s+of\b/i.test(operational)).toBe(false);
    expect(/\bwhen\s*\(/i.test(operational)).toBe(false);
    // The two remaining §19.3 triggers belong to the phase that owns their state (§22.14).
    expect(/candidate_evidence/i.test(operational)).toBe(false);
    expect(/external_resource_links/i.test(operational)).toBe(false);
    expect([...operational.matchAll(/\bcreate\s+trigger\b/gi)]).toHaveLength(3);
  });

  it('given the forward SQL then it owns NO grant, NO policy, NO RLS flag and NO role', () => {
    // Every `GRANT`, `REVOKE` on a table, `ENABLE`/`FORCE ROW LEVEL SECURITY` and
    // `CREATE POLICY` for the seven phase 5 tenant tables belongs EXCLUSIVELY to the phase 5
    // slice of package `013` (§29.4a.1). The only `REVOKE` in this package targets its own
    // function.
    const operational = operationalSql();

    expect(/\bcreate\s+policy\b/i.test(operational)).toBe(false);
    expect(/\brow\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\balter\s+table\b/i.test(operational)).toBe(false);
    expect(/\brevoke\s+all\s+on\s+table\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+role\b/i.test(operational)).toBe(false);
    expect(/\balter\s+role\b/i.test(operational)).toBe(false);
    expect(/bypassrls/i.test(operational)).toBe(false);
    // `★` is a TEST-level proof owned by `P5-I2V`; no migration may pretend to discharge it.
    expect(/\bpractice_memberships\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it writes NOT ONE ROW', () => {
    // No DML, no seed. The word `INSERT` occurs only inside the canonical refusal MESSAGE,
    // which is why the scans below are statement-shaped rather than keyword-shaped.
    const operational = operationalSql();

    expect(/\binsert\s+into\b/i.test(operational)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(operational)).toBe(false);
    expect(/\bmerge\s+into\b/i.test(operational)).toBe(false);
    expect(/\btruncate\b/i.test(operational)).toBe(false);
    expect(/\bupdate\s+"?\w+"?\s+set\b/i.test(operational)).toBe(false);
  });

  it('given the forward SQL then it names its own package, as the checksum contract requires', () => {
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_014_PHASE_5_MIGRATION, 'migration.sql'),
      'utf8',
    );

    expect(sql).toContain('014_immutability_triggers_phase5');
  });
});

// =============================================================================
// C. FUNCTION CATALOGUE — LIVE
// =============================================================================

describe('function catalogue after P5-I2C (02 §16.1, §19.3; D-064)', () => {
  it('given schema app_security then it holds EXACTLY FOUR functions, all SECURITY INVOKER', async () => {
    // The old exact set of THREE context functions is superseded by this one of FOUR — a
    // canonical old-exact-set -> new-exact-set evolution (D-064 `OD-9`), never a weakening.
    //
    // The `search_path` values deliberately DIFFER. The three context functions resolve
    // `public` tables in their bodies and keep `public, pg_temp` (§16.2); the AAD function
    // resolves nothing but record fields and carries the `pg_catalog, pg_temp` that §19.3
    // freezes for it. Neither is "corrected" towards the other.
    const result = await migrator.query<{
      proname: string;
      prosecdef: boolean;
      lanname: string;
      result_type: string;
      args: string;
      config: string;
    }>(
      `select p.proname,
              p.prosecdef,
              l.lanname,
              pg_get_function_result(p.oid) as result_type,
              pg_get_function_identity_arguments(p.oid) as args,
              array_to_string(p.proconfig, ',') as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_language l on l.oid = p.prolang
        where n.nspname = 'app_security'
        order by p.proname`,
    );

    expect(result.rows).toStrictEqual([
      {
        proname: AAD_FUNCTION,
        prosecdef: false,
        lanname: 'plpgsql',
        result_type: 'trigger',
        args: '',
        config: 'search_path=pg_catalog, pg_temp',
      },
      {
        proname: 'set_auth_subject_context',
        prosecdef: false,
        lanname: 'plpgsql',
        result_type: 'void',
        args: 'p_auth_subject text',
        config: 'search_path=public, pg_temp',
      },
      {
        proname: 'set_request_context',
        prosecdef: false,
        lanname: 'plpgsql',
        result_type: 'void',
        args: 'p_practice_id uuid',
        config: 'search_path=public, pg_temp',
      },
      {
        proname: 'set_user_context',
        prosecdef: false,
        lanname: 'plpgsql',
        result_type: 'void',
        args: 'p_user_id uuid',
        config: 'search_path=public, pg_temp',
      },
    ]);
    expect(result.rows).toHaveLength(4);
  });

  it('given the whole database then NO function anywhere is SECURITY DEFINER', async () => {
    // A `SECURITY DEFINER` variant is a PERMANENTLY REJECTED alternative for every `P5-I2`
    // addition (D-064, preserved authority).
    const result = await migrator.query<{ proname: string }>(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_security') and p.prosecdef
        order by p.proname`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the AAD function then its body compares exactly id and practice_id', async () => {
    // The protected row-column set is `id` + `practice_id` and NOTHING else (§10 of the AAD
    // column contract, §19.3). The AAD construction also incorporates the table name and the
    // encrypted column name, but those are IDENTIFIERS in the AAD, not mutable row columns
    // this trigger owns, so no further column may be added here.
    //
    // `IS DISTINCT FROM` is REQUIRED and `<>` is forbidden: `<>` yields NULL when either side
    // is NULL and the `IF` would fall through to `RETURN NEW`, letting an AAD-bound column be
    // rewritten to or from NULL silently.
    const result = await migrator.query<{ body: string; arity: number }>(
      `select p.prosrc as body, p.pronargs as arity
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_security' and p.proname = $1`,
      [AAD_FUNCTION],
    );

    const body = result.rows[0]?.body ?? '';

    expect(result.rows[0]?.arity).toBe(0);
    expect(body).toContain('NEW.id IS DISTINCT FROM OLD.id');
    expect(body).toContain('NEW.practice_id IS DISTINCT FROM OLD.practice_id');
    expect(body).toContain("ERRCODE = '23514'");
    expect(body).toContain('RETURN NEW;');
    // No per-table branching and no argument-driven behaviour: one function, one rule.
    expect(body).not.toContain('TG_ARGV');
    expect(body).not.toContain('TG_TABLE_NAME');
    // No invented AAD-bound field.
    expect(body).not.toContain('encounter_id');
    expect(body).not.toContain('patient_reference_id');
  });
});

// =============================================================================
// D. FUNCTION ACL
// =============================================================================

describe('AAD function ACL — ratified (D-064; 02 §19.3, §22.14)', () => {
  it('given the AAD function then PUBLIC, copilot_app and copilot_system hold NO EXECUTE', async () => {
    // The required final surface: `PUBLIC` none · `copilot_app` none · `copilot_system` none ·
    // `copilot_migrator` owner rights only. This differs DELIBERATELY from the three context
    // functions, which do grant `EXECUTE` to `copilot_app` — those are CALLED by the
    // application; this one is never called directly by anyone.
    const result = await migrator.query<{
      app: boolean;
      system: boolean;
      everyone: boolean;
      owner: boolean;
    }>(
      `select has_function_privilege('copilot_app', $1, 'EXECUTE') as app,
              has_function_privilege('copilot_system', $1, 'EXECUTE') as system,
              has_function_privilege('public', $1, 'EXECUTE') as everyone,
              has_function_privilege('copilot_migrator', $1, 'EXECUTE') as owner`,
      [AAD_FUNCTION_SIGNATURE],
    );

    expect(result.rows[0]).toStrictEqual({
      app: false,
      system: false,
      everyone: false,
      owner: true,
    });
  });

  it('given the AAD function then its explicit ACL names ONLY the owner', async () => {
    // After `REVOKE ALL … FROM PUBLIC` with nothing granted back, `proacl` is the single
    // owner entry. An entry for any other grantee is a defect, and an ACL that reverted to
    // NULL would mean the default `PUBLIC EXECUTE` is back.
    const result = await migrator.query<{ acl: string[] | null; owner: string }>(
      `select p.proacl::text[] as acl, pg_get_userbyid(p.proowner) as owner
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_security' and p.proname = $1`,
      [AAD_FUNCTION],
    );

    expect(result.rows[0]?.owner).toBe('copilot_migrator');
    expect(result.rows[0]?.acl).toStrictEqual(['copilot_migrator=X/copilot_migrator']);
  });
});

// =============================================================================
// E. TRIGGER CATALOGUE — LIVE
// =============================================================================

describe('trigger catalogue after P5-I2C (02 §19.3, §22.14, §25.8a proof 1)', () => {
  it('given the whole schema then EXACTLY THREE non-internal triggers exist, exactly shaped', async () => {
    // §25.8a proof 1 — attachment against the REAL phase 5 tables, made mechanical.
    // `pg_get_triggerdef` is the strongest available single assertion: it reproduces timing,
    // event, level, the absence of `UPDATE OF`, the absence of `WHEN` and the target function
    // in one comparable string.
    const result = await migrator.query<{
      tgname: string;
      tbl: string;
      definition: string;
    }>(
      `select t.tgname, c.relname as tbl, pg_get_triggerdef(t.oid) as definition
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by t.tgname`,
    );

    expect(result.rows).toStrictEqual([...EXPECTED_TRIGGER_DEFINITIONS]);
    expect(result.rows).toHaveLength(3);
  });

  it('given each AAD trigger then its catalogue bits are BEFORE + ROW + UPDATE and nothing else', async () => {
    // `tgtype` decomposed: ROW = 1, BEFORE = 2, INSERT = 4, DELETE = 8, UPDATE = 16,
    // TRUNCATE = 32, INSTEAD = 64. BEFORE UPDATE FOR EACH ROW is therefore exactly 19, and
    // any additional event or an INSTEAD OF variant changes that number.
    //
    // `tgenabled = 'O'` means enabled for origin/local sessions — the normal state. A trigger
    // left `'D'` (disabled) would be catalogued correctly and enforce nothing.
    //
    // `tgqual is null` is the mechanical form of "no `WHEN` clause"; `tgattr` empty is the
    // mechanical form of "bare UPDATE, not `UPDATE OF`".
    const result = await migrator.query<{
      tgname: string;
      tgtype: number;
      tgenabled: string;
      no_when: boolean;
      columns: string;
      fn: string;
      nargs: number;
    }>(
      `select t.tgname,
              t.tgtype::int as tgtype,
              t.tgenabled,
              (t.tgqual is null) as no_when,
              t.tgattr::text as columns,
              np.nspname || '.' || p.proname as fn,
              t.tgnargs::int as nargs
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
         join pg_namespace np on np.oid = p.pronamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by t.tgname`,
    );

    expect(result.rows).toStrictEqual(
      EXPECTED_TRIGGER_DEFINITIONS.map((trigger) => ({
        tgname: trigger.tgname,
        tgtype: 19,
        tgenabled: 'O',
        no_when: true,
        columns: '',
        fn: `app_security.${AAD_FUNCTION}`,
        nargs: 0,
      })),
    );
  });

  it('given the trigger tables then exactly the three phase 5 AAD tables carry one each', async () => {
    // The two remaining §19.3 triggers — `candidate_evidence` and `external_resource_links` —
    // are FUTURE-OWNED: neither table exists in phase 5 (§22.14). Their absence here is the
    // contract, not an omission.
    const result = await migrator.query<{ tbl: string; total: string }>(
      `select c.relname as tbl, count(*)::text as total
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        group by c.relname
        order by c.relname`,
    );

    expect(result.rows).toStrictEqual(AAD_TRIGGER_TABLES.map((tbl) => ({ tbl, total: '1' })));
  });
});

// =============================================================================
// F. FIRST BARRIER — PRIVILEGE, SQLSTATE 42501 (02 §25.8a proof 2, §29.5)
// =============================================================================

describe('first barrier: real copilot_app is stopped by PRIVILEGE, not by the trigger', () => {
  it('given copilot_app then mutating id or practice_id fails with SQLSTATE 42501 on all three tables', async () => {
    // §25.8a proof 2, made mechanical. `copilot_app` holds NO `UPDATE` at all on
    // `patient_references`, a twelve-column `UPDATE` on `encounters` that excludes `id` and
    // `practice_id`, and a single-column `UPDATE (archived_at)` on `encounter_documents`
    // (§29.5). Every attempt below therefore fails on PRIVILEGE.
    //
    // THIS DOES NOT PROVE THE TRIGGER FIRED. `42501` is raised before the `BEFORE UPDATE`
    // trigger is reached, and this assertion must never be presented as evidence of the AAD
    // function's behaviour. That proof is section G, and it is a SEPARATE proof by design.
    await withTenant(DEMO, async (client) => {
      await seedChain(client, DEMO);

      for (const [label, statement, parameters] of [
        [
          'patient_references.id',
          'update patient_references set id = $2 where id = $1',
          [FIXTURE.patientReference, FIXTURE.moved],
        ],
        [
          'patient_references.practice_id',
          'update patient_references set practice_id = $2 where id = $1',
          [FIXTURE.patientReference, NORD],
        ],
        [
          'encounters.id',
          'update encounters set id = $2 where id = $1',
          [FIXTURE.encounter, FIXTURE.moved],
        ],
        [
          'encounters.practice_id',
          'update encounters set practice_id = $2 where id = $1',
          [FIXTURE.encounter, NORD],
        ],
        [
          'encounter_documents.id',
          'update encounter_documents set id = $2 where id = $1',
          [FIXTURE.document, FIXTURE.moved],
        ],
        [
          'encounter_documents.practice_id',
          'update encounter_documents set practice_id = $2 where id = $1',
          [FIXTURE.document, NORD],
        ],
      ] as const) {
        const state = await sqlStateInside(
          client,
          `first_barrier_${label.replace(/\W/g, '_')}`,
          statement,
          parameters,
        );

        expect({ label, state }).toStrictEqual({ label, state: INSUFFICIENT_PRIVILEGE });
      }
    });
  });

  it('given the two SQLSTATEs then they are distinct and neither substitutes for the other', () => {
    // Stated as an assertion rather than only as prose, because conflating them is the exact
    // mistake §25.8a exists to prevent.
    expect(INSUFFICIENT_PRIVILEGE).toBe('42501');
    expect(CHECK_VIOLATION).toBe('23514');
    expect(INSUFFICIENT_PRIVILEGE).not.toBe(CHECK_VIOLATION);
  });

  it('given copilot_app then the granted UPDATE columns still work with the trigger attached', async () => {
    // The trigger must not break the LEGITIMATE writes `P5-I2B` grants. `archived_at` on
    // `encounter_documents` and the twelve-column `encounters` surface leave `id` and
    // `practice_id` untouched, so the function returns `NEW`.
    await withTenant(DEMO, async (client) => {
      await seedChain(client, DEMO);

      const encounter = await client.query(
        `update encounters set status = 'CANCELLED', updated_at = now() where id = $1`,
        [FIXTURE.encounter],
      );
      const document = await client.query(
        'update encounter_documents set archived_at = now() where id = $1',
        [FIXTURE.document],
      );

      expect({ encounter: encounter.rowCount, document: document.rowCount }).toStrictEqual({
        encounter: 1,
        document: 1,
      });
    });
  });
});

// =============================================================================
// G. SECOND BARRIER — THE TRIGGER FUNCTION, SQLSTATE 23514 (02 §25.8a proof 3)
// =============================================================================

describe('second barrier: the canonical function itself, on a TEST-ONLY TEMPORARY table', () => {
  /**
   * Builds the §25.8a proof-3 probe INSIDE an open `copilot_migrator` transaction.
   *
   * A TEMPORARY table with `ON COMMIT DROP`, created by the ordinary migration identity, in a
   * transaction the caller always rolls back. It lives in `pg_temp`, so it is invisible to the
   * `public`-scoped catalogue assertions above, and it disappears whether the transaction
   * commits or aborts. NO PERMANENT TEST TABLE is created, no production table is touched, no
   * grant is widened, no owner policy is added, no fourth role appears and `FORCE ROW LEVEL
   * SECURITY` is not weakened anywhere.
   *
   * The probe attaches THE SAME CANONICAL FUNCTION — not a copy, not a re-declaration — which
   * is what makes the behaviour it proves the behaviour of the real triggers.
   */
  async function withProbe<T>(work: (client: Client) => Promise<T>): Promise<T> {
    await migrator.query('begin');

    try {
      await migrator.query(
        `create temporary table p5_i2c_aad_probe (
           id uuid primary key,
           practice_id uuid not null,
           payload text
         ) on commit drop`,
      );
      await migrator.query(
        `create trigger p5_i2c_aad_probe_trg
         before update on p5_i2c_aad_probe
         for each row
         execute function app_security.${AAD_FUNCTION}()`,
      );
      await migrator.query(
        `insert into p5_i2c_aad_probe (id, practice_id, payload) values ($1, $2, 'before')`,
        [FIXTURE.encounter, DEMO],
      );

      return await work(migrator);
    } finally {
      await migrator.query('rollback');
    }
  }

  it('given a change to id ALONE then the function raises SQLSTATE 23514', async () => {
    await withProbe(async (client) => {
      const state = await sqlStateInside(
        client,
        'probe_id',
        'update p5_i2c_aad_probe set id = $2 where id = $1',
        [FIXTURE.encounter, FIXTURE.moved],
      );

      expect(state).toBe(CHECK_VIOLATION);
    });
  });

  it('given a change to practice_id ALONE then the function raises SQLSTATE 23514', async () => {
    await withProbe(async (client) => {
      const state = await sqlStateInside(
        client,
        'probe_practice',
        'update p5_i2c_aad_probe set practice_id = $2 where id = $1',
        [FIXTURE.encounter, NORD],
      );

      expect(state).toBe(CHECK_VIOLATION);
    });
  });

  it('given the refusal then it carries the canonical message, not a generic failure', async () => {
    await withProbe(async (client) => {
      await client.query('savepoint probe_message');

      let code: string | undefined;
      let message: string | undefined;

      try {
        await client.query('update p5_i2c_aad_probe set id = $2 where id = $1', [
          FIXTURE.encounter,
          FIXTURE.moved,
        ]);
      } catch (error) {
        code = (error as { code?: string }).code;
        message = (error as { message?: string }).message;
      } finally {
        await client.query('rollback to savepoint probe_message');
      }

      expect({ code, message }).toStrictEqual({
        code: CHECK_VIOLATION,
        message: 'AAD-bound column (id, practice_id) is immutable after INSERT',
      });
    });
  });

  it('given a NON-AAD payload change then the UPDATE succeeds', async () => {
    // The trigger returns `NEW` when the protected columns are unchanged. An implementation
    // that rejected every UPDATE would satisfy the two negatives above and still be wrong.
    await withProbe(async (client) => {
      const updated = await client.query(
        `update p5_i2c_aad_probe set payload = 'after' where id = $1`,
        [FIXTURE.encounter],
      );
      const row = await client.query<{ payload: string }>(
        'select payload from p5_i2c_aad_probe where id = $1',
        [FIXTURE.encounter],
      );

      expect({ rows: updated.rowCount, payload: row.rows[0]?.payload }).toStrictEqual({
        rows: 1,
        payload: 'after',
      });
    });
  });

  it('given a SAME-VALUE assignment to id and practice_id then the UPDATE succeeds', async () => {
    // `IS DISTINCT FROM` rather than "was the column named in the SET list". Assigning the
    // identical value leaves the AAD binding intact, so the ciphertext still matches and the
    // write is legitimate. A `WHEN` clause or an `UPDATE OF` list could not make this
    // distinction at all — which is one of the reasons §19.3 forbids both.
    await withProbe(async (client) => {
      const updated = await client.query(
        `update p5_i2c_aad_probe
            set id = id, practice_id = practice_id, payload = 'same-value'
          where id = $1`,
        [FIXTURE.encounter],
      );

      expect(updated.rowCount).toBe(1);
    });
  });

  it('given the probe transaction rolled back then no test object survives', async () => {
    // The temporary table is `ON COMMIT DROP` inside a transaction that is always rolled back,
    // so neither the table nor its trigger can leak into the catalogue assertions of section E.
    await withProbe(() => Promise.resolve(undefined));

    const leaked = await migrator.query<{ tgname: string }>(
      `select t.tgname from pg_trigger t where not t.tgisinternal and t.tgname like 'p5_i2c%'`,
    );
    const tables = await migrator.query<{ relname: string }>(
      `select c.relname from pg_class c where c.relname = 'p5_i2c_aad_probe'`,
    );

    expect(leaked.rows).toStrictEqual([]);
    expect(tables.rows).toStrictEqual([]);
  });
});

// =============================================================================
// H. P5-I2B REGRESSION — P5-I2C CHANGED NOTHING
// =============================================================================

describe('P5-I2B security state is untouched by P5-I2C (02 §29.4a; D-065 `RULING 1`)', () => {
  it('given the whole schema then ALL THIRTEEN tables are still true / true', async () => {
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

    expect(result.rows).toStrictEqual(
      EXPECTED_RLS_TABLES.map((relname) => ({
        relname,
        relrowsecurity: true,
        relforcerowsecurity: true,
      })),
    );
  });

  it('given the whole schema then EXACTLY the 25 canonical policies still exist', async () => {
    const result = await migrator.query<{ polname: string }>(
      `select p.polname
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by p.polname`,
    );

    expect(result.rows.map((row) => row.polname)).toStrictEqual([...EXPECTED_POLICY_NAMES]);
    expect(result.rows).toHaveLength(25);
  });

  it('given the phase 5 tables then the exact column-level UPDATE catalogue is unchanged', async () => {
    // `P5-I2C` issues no `GRANT` and no table `REVOKE`, so the privilege surface that forms
    // the FIRST barrier must be bit-for-bit what `P5-I2B` left behind (§29.5).
    const result = await migrator.query<{ table_name: string; cols: string }>(
      `select table_name, string_agg(column_name, ',' order by column_name) as cols
         from information_schema.role_column_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
          and privilege_type = 'UPDATE'
        group by table_name
        order by table_name`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'encounter_documents', cols: 'archived_at' },
      {
        table_name: 'encounters',
        cols: 'guarantor_type,insurance_context,occurred_at,patient_age_at_encounter,patient_sex_at_encounter,responsible_physician_id,specialty_code,status,treatment_date,updated_at,updated_by,version',
      },
      {
        table_name: 'idempotency_keys',
        cols: 'completed_at,locked_at,response_body,response_status',
      },
      {
        table_name: 'practice_settings',
        cols: 'ai_enabled,allow_billing_specialist_approval,allow_mpa_approval,axenita_export_enabled,billing_review_required,require_reason_for_manual_change,retention_policy_code,updated_at,version',
      },
    ]);
  });

  it('given storage_objects then it still holds ZERO capability and ZERO policies', async () => {
    const grants = await migrator.query<{ grantee: string }>(
      `select grantee from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'storage_objects'
          and grantee <> 'copilot_migrator'`,
    );
    const policies = await migrator.query<{ polname: string }>(
      `select p.polname from pg_policy p
         join pg_class c on c.oid = p.polrelid
        where c.relname = 'storage_objects'`,
    );

    expect(grants.rows).toStrictEqual([]);
    expect(policies.rows).toStrictEqual([]);
  });

  it('given PUBLIC and copilot_system then neither holds a privilege on any AAD trigger table', async () => {
    const result = await migrator.query<{ grantee: string; table_name: string }>(
      `select grantee, table_name from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('patient_references', 'encounters', 'encounter_documents')
          and grantee in ('PUBLIC', 'copilot_system')
        order by table_name, grantee`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the roles then all three are unchanged and NOBYPASSRLS', async () => {
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

  it('given the FORCE RLS maintenance allowlist then it is still EXACTLY SIX tables', async () => {
    // §23.4 / D-048 clause 6: no silent extension. `P5-I2C` reaches its trigger through a
    // TEMPORARY table, never through a widened allowlist.
    const allowlist: readonly string[] = FORCE_RLS_MAINTENANCE_ALLOWLIST;

    expect(allowlist).toHaveLength(6);

    for (const table of AAD_TRIGGER_TABLES) {
      expect({ table, allowlisted: allowlist.includes(table) }).toStrictEqual({
        table,
        allowlisted: false,
      });
    }

    const owner = await migrator.query<{ polname: string }>(
      `select p.polname from pg_policy p
        where 'copilot_migrator'::regrole::oid = any(p.polroles)`,
    );

    expect(owner.rows).toStrictEqual([]);
  });
});

// =============================================================================
// I. ★ EXCLUSION
// =============================================================================

describe('P5-I2C does NOT discharge ★ (D-064 `★` hard stop; 02 §29.4a)', () => {
  /**
   * This spec file's OWN source, with comments stripped.
   *
   * Comments MUST be stripped, for exactly the reason the package `003`, `011`, `013` and
   * `014` forward-SQL scans strip them: this file DOCUMENTS both `★` halves in prose in order
   * to record why it does not execute them, and flagging that prose would push a future author
   * to delete the very text that carries the gate boundary.
   *
   * The path is `import.meta.filename` rather than a written-out path, so the scan cannot be
   * pointed at some other, more convenient file.
   */
  const operationalSelfSource = (): string =>
    readFileSync(import.meta.filename, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

  it('given the repository then the ★ owner test EXISTS and is owned by P5-I2V, not by this file', () => {
    // THE LIVE-STATE HALF, AND WHY IT FLIPPED.
    //
    // `P5-I2V` has since created `phase5-responsible-physician-ri.security.ts`, so the old
    // expectation `false` is now FALSE ABOUT THE WORLD. D-064 `OD-9` governs exactly this
    // case: such an assertion is RESTATED in the form that stays true forever, and is NEVER
    // deleted. The live-state half therefore becomes `true`, and the claim that actually
    // carries the gate boundary — `P5-I2C` ITSELF authored NEITHER `★` half — is preserved
    // PERMANENTLY as the static self-scan below.
    //
    // The two are different claims and must never be collapsed into one: the repository now
    // CONTAINS `★`, while THIS package still does not IMPLEMENT it.
    expect(existsSync(resolve(apiRoot, 'test/phase5-responsible-physician-ri.security.ts'))).toBe(
      true,
    );
  });

  it('given this file own source then it implements NEITHER ★ half (P5-I2C package boundary)', () => {
    // THE PACKAGE-OWNERSHIP HALF, MADE MECHANICAL AND PERMANENT (D-064 `OD-9`).
    //
    // `★` needs BOTH halves in ONE transaction: a same-practice co-member
    // responsible-physician INSERT that SUCCEEDS through the composite foreign key, AND a
    // direct `SELECT` of that same membership row returning ZERO ROWS. This file executes
    // NEITHER, and that is proven from its own source rather than asserted in prose.
    const operational = operationalSelfSource();

    // Sanity: the scan really read a populated source file, so a silently empty read cannot
    // make every check below vacuously true.
    expect(operational.length).toBeGreaterThan(1000);

    // ★ HALF A — a co-member responsible-physician assignment. Every `insert into encounters`
    // in this file omits `responsible_physician_id` from its column list entirely, so no
    // statement here can assign a responsible physician at all, whichever identity it used.
    const encounterInserts = [
      ...operational.matchAll(/insert\s+into\s+encounters\b([\s\S]*?)\bvalues\b/gi),
    ];

    expect(encounterInserts).toHaveLength(1);

    for (const [, columns] of encounterInserts) {
      expect(/\bresponsible_physician_id\b/i.test(columns ?? '')).toBe(false);
    }

    // ★ HALF B — a direct read of `practice_memberships`. This file never reads that table in
    // any form, so it cannot observe the zero-rows half either. `42501` is NOT equivalent to
    // it, and no assertion in this file may ever be read as standing in for it.
    expect(/\bfrom\s+"?practice_memberships"?\b/i.test(operational)).toBe(false);
    expect(/\bjoin\s+"?practice_memberships"?\b/i.test(operational)).toBe(false);

    // And no DML of any kind reaches that table: `P5-I2C` neither reads nor writes it
    // (D-061 clause 11, §29.7).
    expect(/\binsert\s+into\s+"?practice_memberships"?\b/i.test(operational)).toBe(false);
    expect(/\bupdate\s+"?practice_memberships"?\b/i.test(operational)).toBe(false);
    expect(/\bdelete\s+from\s+"?practice_memberships"?\b/i.test(operational)).toBe(false);
  });

  it('given P5-I5 then it remains BLOCKED behind P5-I2V, which this gate does not execute', () => {
    // A deliberate, greppable statement of the gate boundary: `P5-I2C` proves the AAD slice
    // and nothing beyond it. `SQLSTATE 42501` is NOT equivalent to the zero-rows half of `★`.
    const migration = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_014_PHASE_5_MIGRATION, 'migration.sql'),
      'utf8',
    );

    expect(migration).toContain('P5-I5');
    expect(migration).toContain('BLOCKED');
  });
});

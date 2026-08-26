import { randomUUID } from 'node:crypto';

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FORCE_RLS_MAINTENANCE_ALLOWLIST,
  PHASE_3_SEED_IDS,
  PHASE_3_SEED_SUBJECTS,
} from '../prisma/seed.js';
import {
  connect,
  FOREIGN_KEY_VIOLATION,
  INSUFFICIENT_PRIVILEGE,
  securityDatabase,
  withAppContext,
} from './support/phase3-security-context.js';

/**
 * `★` — THE RESPONSIBLE-PHYSICIAN REFERENTIAL-INTEGRITY VERSUS ROW-LEVEL-SECURITY PROOF.
 *
 * Sub-gate `P5-I2V`, the last undischarged obligation of slice `P5-I2` and a HARD precondition
 * of `P5-I5` (D-062 Dio D.6, D-063 clause 3, D-064 `★` hard stop; 02 §29.2, §29.4a; test
 * contract 08 §12.9.3).
 *
 * WHAT `★` IS.
 * In ONE transaction, on ONE connection, under the REAL runtime role `copilot_app` and the
 * REAL tenant context of caller `A`, BOTH of the following must hold SIMULTANEOUSLY:
 *
 *   A. an `encounters` row naming a SAME-PRACTICE CO-MEMBER `B` as
 *      `responsible_physician_id` is ACCEPTED through the composite foreign key
 *      `encounters_responsible_physician_membership_fk`; and
 *
 *   B. a DIRECT `SELECT` of that co-member's own `practice_memberships` row, in that same
 *      transaction and that same context, returns ZERO ROWS.
 *
 * The two halves are ONE INSEPARABLE FINDING and are presented as one. Neither half proves
 * anything on its own: half A alone is already owned by
 * `phase5-schema-catalogue.security.ts`, and generic self-select visibility is already owned
 * by `phase3-platform-and-membership-roles-rls.security.ts`. What `P5-I2V` owns — and what no
 * earlier gate may be read as having discharged — is that they are TRUE AT THE SAME TIME.
 *
 * WHY IT MATTERS.
 * PostgreSQL evaluates referential-integrity checks OUTSIDE row-level security. A composite
 * foreign key into `practice_memberships` therefore keeps working under `FORCE ROW LEVEL
 * SECURITY` even though the referencing session cannot READ the parent row it depends on.
 * That is a load-bearing assumption of the phase 5 encounter model: it is what lets the
 * DATABASE — not the application — refuse a cross-practice responsible physician WITHOUT
 * handing any session a cross-user read of the membership table. If it were false, the only
 * ways to keep the model would be to widen the `practice_memberships` `SELECT` policy, to add
 * an owner policy, to introduce `BYPASSRLS` or a `SECURITY DEFINER` helper, or to drop the
 * key. ALL of those are permanently forbidden (D-064; D-062 Dio K; §23.4.4b), which is
 * precisely why the assumption has to be PROVEN rather than assumed.
 *
 * `SQLSTATE 42501` IS NOT EQUIVALENT TO HALF B, AND NEVER WILL BE.
 * A privilege refusal proves the session could not REACH the table. Half B requires the
 * OPPOSITE: the session HOLDS `SELECT` on `practice_memberships`, the statement EXECUTES
 * NORMALLY, and it returns an EMPTY result because the POLICY filtered the row away. This
 * file therefore pins the grant POSITIVELY, so a future revocation turns `★` red instead of
 * silently converting it into a privilege test.
 *
 * THE ANTI-FALSE-POSITIVE SPINE.
 * Zero rows is the weakest possible evidence unless every other explanation is closed first,
 * so this file closes them all mechanically:
 *
 *   * `B` PHYSICALLY EXISTS — a separate, rolled-back control transaction on the SAME
 *     `copilot_app` connection, differing ONLY in `app.user_id`, returns EXACTLY ONE row for
 *     the SAME `(P, B)` pair with the SAME SQL. Zero rows later is therefore not absence;
 *   * PRIVILEGE IS PRESENT — `copilot_app` holds `SELECT`, and the statement raises nothing;
 *   * THE CONTEXT IS LIVE — the caller's OWN membership row returns EXACTLY ONE row inside
 *     the `★` transaction, with the same query shape;
 *   * IT IS THE SAME TRANSACTION — backend pid and transaction id are captured and compared,
 *     and the control transaction's id is proven DIFFERENT from the `★` transaction's;
 *   * `A != B` — asserted, never assumed;
 *   * THE KEY IS REAL — the full `pg_catalog` identity of the foreign key is pinned exactly,
 *     including `confmatchtype`, `convalidated` and the deferrability flags, so a dropped,
 *     renamed, `NOT VALID` or deferred key cannot masquerade as a passing proof.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT OWN (D-064 `OD-9`; 02 §29.4a).
 * The cross-practice `23503` negative and the `MATCH SIMPLE` `NULL` case stay with
 * `phase5-schema-catalogue.security.ts`. Generic `practice_memberships` self-select behaviour
 * stays with `phase3-platform-and-membership-roles-rls.security.ts`. The whole-schema RLS,
 * policy and grant inventory stays with `phase5-rls-grants.security.ts`. The package `014` AAD
 * contract stays with `phase5-aad-immutability.security.ts`. This file adds ONLY the exact
 * assertions without which the simultaneous RI-versus-RLS finding would be falsifiable.
 *
 * NOTHING HERE MUTATES THE PRODUCTION CONTRACT. `P5-I2V` is TEST-ONLY: no migration, no schema
 * change, no grant, no policy, no role, no RLS flag. Every row it writes lives inside a
 * transaction that is ALWAYS rolled back, on the guarded disposable database created by
 * `security-global-setup.ts`.
 */
const database = securityDatabase();

/** Practice `P` — the ONE practice both identities of `★` belong to. */
const PRACTICE = PHASE_3_SEED_IDS.practiceDemo;

/** Caller `A` — the authenticated identity whose context the `★` transaction carries. */
const CALLER_A = PHASE_3_SEED_IDS.userPracticeAdmin;
const CALLER_A_SUBJECT = PHASE_3_SEED_SUBJECTS.practiceAdmin;
const MEMBERSHIP_A = PHASE_3_SEED_IDS.membershipAdminInDemo;

/**
 * Co-member `B` — a DIFFERENT user holding a membership in the SAME practice `P`.
 *
 * `B` is deliberately NOT required to hold the `PHYSICIAN` tenant role, and its `users.status`
 * is deliberately irrelevant here. The canonical phase 5 rule of §29.2 is a foreign key into
 * `practice_memberships (practice_id, user_id)`: ANY membership in the same practice satisfies
 * it. Role and activity semantics are enforced elsewhere and are not part of this proof.
 */
const COMEMBER_B = PHASE_3_SEED_IDS.userInactive;
const COMEMBER_B_SUBJECT = PHASE_3_SEED_SUBJECTS.inactive;
const MEMBERSHIP_B = PHASE_3_SEED_IDS.membershipInactiveUserInDemo;

/**
 * The same two identities, WIDENED TO `string` ON PURPOSE.
 *
 * `PHASE_3_SEED_IDS` is `as const`, so TypeScript knows the two literal types and would decide
 * `A !== B` at COMPILE TIME — which is not what `★` needs. `A != B` has to be a RUNTIME
 * assertion evaluated against the values the proof actually used, so the comparison is made on
 * widened references.
 */
const CALLER_A_ID: string = CALLER_A;
const COMEMBER_B_ID: string = COMEMBER_B;

/** The composite key under proof, and the parent unique key it depends on (§29.2). */
const RESPONSIBLE_PHYSICIAN_FK = 'encounters_responsible_physician_membership_fk';
const PARENT_UNIQUE_KEY = 'practice_memberships_practice_user_key';

/** The ONE `practice_memberships` policy, byte-identical to §17.4 (D-062 Dio B.4). */
const SELF_SELECT_POLICY = 'practice_memberships_self_select';
const SELF_SELECT_QUAL =
  "(user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)";

/** `pg_policy.polcmd` code for `FOR SELECT`. */
const SELECT_CMD = 'r';

/** The verdict constants. They are compared with `toBe`, so a typo cannot pass silently. */
const PROOF_A_PASS = 'PROOF_A_PASS_CO_MEMBER_ACCEPTED_THROUGH_COMPOSITE_FK';
const PROOF_B_PASS = 'PROOF_B_PASS_ZERO_ROWS_WITH_SELECT_PRIVILEGE_HELD';
const PROOF_B_NOT_REACHED = 'PROOF_B_NOT_REACHED_BECAUSE_PROOF_A_DID_NOT_SUCCEED';

/**
 * The ONE membership lookup shape, used by ALL THREE reads of `practice_memberships`.
 *
 * The differential is worthless unless the SQL is identical, so it is written once: the
 * physical-existence control, the caller's own-membership control and half `★.B` differ in
 * NOTHING but their parameters and the `app.user_id` in force.
 */
const MEMBERSHIP_LOOKUP = `select id, practice_id, user_id
     from practice_memberships
    where practice_id = $1 and user_id = $2
    order by id`;

/**
 * The minimum valid `patient_references` parent row, in the exact field shape already used by
 * `phase5-schema-catalogue.security.ts`. Both literals are obviously synthetic: no PHI-shaped
 * value is introduced anywhere in this file (09 §9).
 */
const INSERT_PATIENT_REFERENCE = `insert into patient_references
       (id, practice_id, source_system, external_patient_ref_hash, pseudonym, updated_at)
     values ($1, $2, 'MANUAL', $3, $4, current_timestamp)`;

const EXTERNAL_PATIENT_REF_HASH = `p5i2v.${'0'.repeat(64)}`;
const PSEUDONYM = 'P-P5I2VSTAR1';

/**
 * Half `★.A`, and it RETURNS THE ROW.
 *
 * `RETURNING` is not decoration. A helper that reported only a SQLSTATE would let half A
 * "pass" on a statement that inserted nothing, or that inserted a row whose
 * `responsible_physician_id` was silently `NULL` — which is the `MATCH SIMPLE` case, and is
 * emphatically NOT `★`. The returned row is therefore asserted column by column.
 */
const INSERT_ENCOUNTER = `insert into encounters
       (id, practice_id, patient_reference_id, occurred_at, treatment_date,
        responsible_physician_id, status, source_system, created_by, updated_at)
     values ($1, $2, $3, current_timestamp, current_date, $4, 'DRAFT', 'MANUAL', $5,
             current_timestamp)
  returning id, practice_id, responsible_physician_id`;

interface MembershipRow {
  readonly id: string;
  readonly practice_id: string;
  readonly user_id: string;
}

interface EncounterRow {
  readonly id: string;
  readonly practice_id: string;
  readonly responsible_physician_id: string | null;
}

/** `copilot_migrator` — catalogue reads ONLY, and never inside the `★` transaction. */
let migrator: Client;

/**
 * `copilot_app` — the ONE real runtime connection.
 *
 * A single `pg.Client`, never a `pg.Pool`: `★` requires both halves on the SAME physical
 * session, and a pool may hand out a different backend per statement. No `SET ROLE`, no second
 * application connection and no fourth credential is opened anywhere in this file.
 */
let app: Client;

beforeAll(async () => {
  migrator = await connect(database.migration);
  app = await connect(database.app);
});

afterAll(async () => {
  await migrator.end();
  await app.end();
});

/** Reads a PostgreSQL SQLSTATE off an unknown rejection value. */
function sqlStateOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;

  return typeof code === 'string' ? code : undefined;
}

/** Reads the offending constraint name off an unknown rejection value. */
function constraintOf(error: unknown): string | undefined {
  const constraint = (error as { constraint?: unknown } | null | undefined)?.constraint;

  return typeof constraint === 'string' ? constraint : undefined;
}

/**
 * The REQUIRED failure classification of half A.
 *
 * NOTHING IS SWALLOWED. The classification is the VALUE the spec asserts on, so any outcome
 * other than the pass constant fails the test loudly and names the exact failure class. The
 * classes are kept distinct on purpose, because they authorise very different responses — and
 * NONE of them authorises widening the security model.
 */
function classifyProofAFailure(error: unknown): string {
  const state = sqlStateOf(error);
  const constraint = constraintOf(error);

  if (state === INSUFFICIENT_PRIVILEGE) {
    // The statement never reached referential integrity at all. A test defect or a revoked
    // grant — never a reason to grant anything back.
    return 'PROOF_A_FAIL_42501_NEVER_REACHED_REFERENTIAL_INTEGRITY';
  }

  if (state === FOREIGN_KEY_VIOLATION && constraint === RESPONSIBLE_PHYSICIAN_FK) {
    // THE LOAD-BEARING ASSUMPTION ITSELF FAILED: the key could not resolve a parent row that
    // demonstrably exists. HARD HOLD. This is a design-level finding for the owner, and it
    // authorises NO policy, grant, role or key change by this gate.
    return 'P5_I2V_EXECUTION_HOLD_RI_VS_RLS_ASSUMPTION_FAILED_23503';
  }

  if (state === FOREIGN_KEY_VIOLATION) {
    // Another key refused the row — a fixture or test-shape defect, not a security finding.
    return `PROOF_A_FAIL_23503_ON_UNRELATED_CONSTRAINT_${constraint ?? 'UNKNOWN'}`;
  }

  if (state !== undefined) {
    return `PROOF_A_FAIL_FIXTURE_OR_TEST_SHAPE_DEFECT_SQLSTATE_${state}`;
  }

  return 'PROOF_A_FAIL_NON_SQL_ERROR';
}

/** The REQUIRED failure classification of half B. */
function classifyProofBFailure(error: unknown): string {
  const state = sqlStateOf(error);

  if (state === INSUFFICIENT_PRIVILEGE) {
    // `42501` IS NOT HALF B. Half B requires the read to SUCCEED and to return nothing.
    return 'PROOF_B_FAIL_42501_IS_NOT_EQUIVALENT_TO_ZERO_ROWS';
  }

  return `PROOF_B_FAIL_SQLSTATE_${state ?? 'NON_SQL_ERROR'}`;
}

// =============================================================================
// A. THE KEY — EXACT CATALOGUE IDENTITY
// =============================================================================

describe('★ P5-I2V — the composite responsible-physician key (02 §29.2; D-062 Dio D)', () => {
  it('given the foreign key then its FULL catalogue identity is exactly the canonical one', async () => {
    // A `★` that ran against a dropped, renamed, `NOT VALID`, deferred or `MATCH FULL` key
    // would prove nothing, so the key's whole identity is pinned in ONE strict full-row
    // comparison. `confmatchtype = 's'` is MATCH SIMPLE, `confdeltype`/`confupdtype = 'a'` are
    // NO ACTION, and `conindid` names the parent unique index the key actually resolved to.
    const result = await migrator.query(
      `select con.conname,
              childns.nspname || '.' || child.relname as child,
              parentns.nspname || '.' || parent.relname as parent,
              pg_get_constraintdef(con.oid) as def,
              con.confmatchtype::text as confmatchtype,
              con.confdeltype::text as confdeltype,
              con.confupdtype::text as confupdtype,
              con.convalidated,
              con.condeferrable,
              con.condeferred,
              con.conindid::regclass::text as parent_index
         from pg_constraint con
         join pg_class child on child.oid = con.conrelid
         join pg_namespace childns on childns.oid = child.relnamespace
         join pg_class parent on parent.oid = con.confrelid
         join pg_namespace parentns on parentns.oid = parent.relnamespace
        where con.contype = 'f' and con.conname = $1`,
      [RESPONSIBLE_PHYSICIAN_FK],
    );

    expect(result.rows).toStrictEqual([
      {
        conname: RESPONSIBLE_PHYSICIAN_FK,
        child: 'public.encounters',
        parent: 'public.practice_memberships',
        def: 'FOREIGN KEY (practice_id, responsible_physician_id) REFERENCES practice_memberships(practice_id, user_id)',
        confmatchtype: 's',
        confdeltype: 'a',
        confupdtype: 'a',
        convalidated: true,
        condeferrable: false,
        condeferred: false,
        parent_index: PARENT_UNIQUE_KEY,
      },
    ]);
  });

  it('given the foreign key then its column pairing is exactly (practice_id, responsible_physician_id) to (practice_id, user_id)', async () => {
    // `pg_get_constraintdef` already renders the pairing, but the ORDER of the two columns is
    // the whole tenant guarantee: a key whose columns were transposed would still print
    // plausibly while referencing a different pair. It is therefore also read out of `conkey`
    // and `confkey` positionally.
    const columns = await migrator.query<{ child_column: string; parent_column: string }>(
      `select child_attr.attname as child_column, parent_attr.attname as parent_column
         from pg_constraint con
         join unnest(con.conkey) with ordinality as child_key(attnum, ord) on true
         join unnest(con.confkey) with ordinality as parent_key(attnum, ord)
           on parent_key.ord = child_key.ord
         join pg_attribute child_attr
           on child_attr.attrelid = con.conrelid and child_attr.attnum = child_key.attnum
         join pg_attribute parent_attr
           on parent_attr.attrelid = con.confrelid and parent_attr.attnum = parent_key.attnum
        where con.conname = $1
        order by child_key.ord`,
      [RESPONSIBLE_PHYSICIAN_FK],
    );

    expect(columns.rows).toStrictEqual([
      { child_column: 'practice_id', parent_column: 'practice_id' },
      { child_column: 'responsible_physician_id', parent_column: 'user_id' },
    ]);
  });

  it('given the parent key then it is unique, valid, total and exactly (practice_id, user_id)', async () => {
    // The key can only behave this way because a UNIQUE index over exactly
    // `(practice_id, user_id)` exists on the parent — since package `002`, and untouched by
    // every package since (D-061 clause 11). A partial index would silently narrow the set of
    // rows the key can resolve against, so `indpred` is asserted absent too.
    const index = await migrator.query(
      `select ic.relname as index_name,
              i.indisunique,
              i.indisvalid,
              i.indisready,
              i.indpred is not null as partial,
              (select array_agg(a.attname::text order by k.ord)
                 from unnest(string_to_array(i.indkey::text, ' ')::int[])
                      with ordinality as k(attnum, ord)
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)
                as columns
         from pg_index i
         join pg_class ic on ic.oid = i.indexrelid
         join pg_class tc on tc.oid = i.indrelid
         join pg_namespace n on n.oid = tc.relnamespace
        where n.nspname = 'public'
          and tc.relname = 'practice_memberships'
          and ic.relname = $1`,
      [PARENT_UNIQUE_KEY],
    );

    expect(index.rows).toStrictEqual([
      {
        index_name: PARENT_UNIQUE_KEY,
        indisunique: true,
        indisvalid: true,
        indisready: true,
        partial: false,
        columns: ['practice_id', 'user_id'],
      },
    ]);
  });
});

// =============================================================================
// B. THE PARENT TABLE — EXACT RLS, POLICY AND GRANT IDENTITY
// =============================================================================

describe('★ P5-I2V — practice_memberships RLS, policy and grant identity (02 §17.4, §20.2)', () => {
  it('given practice_memberships then it is ENABLE plus FORCE ROW LEVEL SECURITY', async () => {
    // Without `FORCE`, half B would only prove that a non-owner cannot read the row — a much
    // weaker claim, and one that would collapse the moment the proof ran as the owner.
    const flags = await migrator.query(
      `select c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'practice_memberships'`,
    );

    expect(flags.rows).toStrictEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });

  it('given practice_memberships then it carries EXACTLY ONE policy, unweakened and byte-identical', async () => {
    // The COMPLETE policy set for the table in one strict full-set comparison: name, mode,
    // command, target role, `USING` and `WITH CHECK`. A second policy, a widened predicate, a
    // `FOR ALL` re-mode, a re-target at another role or a substring-only ownership test must
    // all fail here. `qual` is compared to the EXACT §17.4 expression, never to a fragment.
    const policies = await migrator.query(
      `select p.polname,
              case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
              p.polcmd::text as command,
              (select string_agg(pg_get_userbyid(r), ',' order by pg_get_userbyid(r))
                 from unnest(p.polroles) r) as roles,
              pg_get_expr(p.polqual, p.polrelid) as qual,
              pg_get_expr(p.polwithcheck, p.polrelid) as with_check
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'practice_memberships'
        order by p.polname`,
    );

    expect(policies.rows).toStrictEqual([
      {
        polname: SELF_SELECT_POLICY,
        mode: 'PERMISSIVE',
        command: SELECT_CMD,
        roles: 'copilot_app',
        qual: SELF_SELECT_QUAL,
        with_check: null,
      },
    ]);
    expect(policies.rows).toHaveLength(1);
  });

  it('given practice_memberships then copilot_app holds SELECT and NOTHING ELSE', async () => {
    // THE ASSERTION THAT KEEPS HALF B HONEST. `42501` is not equivalent to zero rows, so the
    // presence of `SELECT` is pinned POSITIVELY: if a future package revoked it, `★` would
    // start failing instead of quietly degrading into a privilege test.
    const held: Record<string, boolean> = {};

    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const result = await migrator.query<{ granted: boolean }>(
        'select has_table_privilege($1, $2, $3) as granted',
        ['copilot_app', 'practice_memberships', privilege],
      );

      held[privilege] = result.rows[0]?.granted ?? false;
    }

    expect(held).toStrictEqual({ SELECT: true, INSERT: false, UPDATE: false, DELETE: false });
  });

  it('given practice_memberships then PUBLIC and copilot_system hold nothing at all', async () => {
    // The whole non-owner grant surface of the table, as one strict full-set comparison.
    const grants = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'practice_memberships'
          and grantee in ('PUBLIC', 'copilot_app', 'copilot_system')
        order by grantee, privilege_type`,
    );

    expect(grants.rows).toStrictEqual([{ grantee: 'copilot_app', privilege_type: 'SELECT' }]);

    const columnGrants = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select distinct grantee, privilege_type
         from information_schema.role_column_grants
        where table_schema = 'public'
          and table_name = 'practice_memberships'
          and grantee in ('PUBLIC', 'copilot_system')
        order by grantee, privilege_type`,
    );

    expect(columnGrants.rows).toStrictEqual([]);
  });
});

// =============================================================================
// C. ★ — THE SIMULTANEOUS FINDING
// =============================================================================

describe('★ P5-I2V — referential integrity versus row-level security, in ONE transaction', () => {
  it('★ given caller A then co-member B is ACCEPTED as responsible physician AND stays INVISIBLE', async () => {
    // -------------------------------------------------------------------------
    // THE PHYSICAL-EXISTENCE DIFFERENTIAL CONTROL.
    //
    // A SEPARATE transaction, on the SAME `copilot_app` connection, with the SAME SQL and the
    // SAME `(P, B)` parameters, differing in NOTHING but `app.user_id`. It must return EXACTLY
    // ONE row. This is what makes the later zero rows attributable to the POLICY: the row is
    // physically present, the role can read the table, and only the identity changed.
    //
    // It is a CONTROL, not a half of `★`, and it is rolled back before the `★` transaction
    // begins — which the transaction-id comparison below proves mechanically.
    // -------------------------------------------------------------------------
    const control = await withAppContext(
      app,
      { authSubject: COMEMBER_B_SUBJECT, userId: COMEMBER_B, practiceId: PRACTICE },
      async (client) => {
        const session = await client.query<{ pid: number; xid: string }>(
          'select pg_backend_pid() as pid, pg_current_xact_id()::text as xid',
        );
        const visible = await client.query<MembershipRow>(MEMBERSHIP_LOOKUP, [
          PRACTICE,
          COMEMBER_B,
        ]);

        return {
          sameClient: client === app,
          pid: session.rows[0]?.pid,
          xid: session.rows[0]?.xid,
          rowCount: visible.rowCount,
          rows: visible.rows,
        };
      },
    );

    // -------------------------------------------------------------------------
    // THE PRIMARY ★ TRANSACTION.
    //
    // ONE `BEGIN`, opened before any context is established; context set in the canonical
    // order auth subject -> `app.user_id` -> `app.practice_id`, all transaction-local; BOTH
    // halves inside it; NO context reset between them; NO `COMMIT`; it ends by `ROLLBACK`.
    //
    // The order is not incidental: `app_security.set_user_context` clears `app.practice_id` by
    // design (§16.2.2), so the practice GUC is established AFTER it.
    // -------------------------------------------------------------------------
    const star = await withAppContext(
      app,
      { authSubject: CALLER_A_SUBJECT, userId: CALLER_A, practiceId: PRACTICE },
      async (client) => {
        const opened = await client.query<{ pid: number; xid: string }>(
          'select pg_backend_pid() as pid, pg_current_xact_id()::text as xid',
        );

        // The context actually in force, read back from the GUCs rather than assumed.
        const context = await client.query<{ user_id: string | null; practice_id: string | null }>(
          `select nullif(current_setting('app.user_id', true), '') as user_id,
                  nullif(current_setting('app.practice_id', true), '') as practice_id`,
        );

        // THE IN-TRANSACTION OWN-MEMBERSHIP CONTROL. Same query shape, exactly one row. It
        // proves, INSIDE the `★` transaction, that `SELECT` executes, that the privilege is
        // present, that `app.user_id` really is `A`, and that the policy admits the rows it is
        // supposed to admit. Without it, zero rows for `B` could equally mean a dead context.
        const own = await client.query<MembershipRow>(MEMBERSHIP_LOOKUP, [PRACTICE, CALLER_A]);

        // OPTIONAL PRE-INSERT DIAGNOSTIC. Recorded, and never a substitute for half B: the
        // required half B is the read taken AFTER half A has succeeded.
        const preInsert = await client.query<MembershipRow>(MEMBERSHIP_LOOKUP, [
          PRACTICE,
          COMEMBER_B,
        ]);

        // The transaction-local `patient_references` parent the encounter requires. Random
        // UUIDs: obviously synthetic, and incapable of colliding with a seeded row.
        const patientReferenceId = randomUUID();
        const encounterId = randomUUID();

        await client.query(INSERT_PATIENT_REFERENCE, [
          patientReferenceId,
          PRACTICE,
          EXTERNAL_PATIENT_REF_HASH,
          PSEUDONYM,
        ]);

        // HALF ★.A. The `INSERT` is awaited directly; nothing is caught and discarded. The
        // wrapper exists ONLY to CLASSIFY a failure into the exact class the gate requires,
        // and that classification is then asserted on — so a failure is louder, not quieter.
        let proofA = PROOF_A_PASS;
        let proofARowCount: number | null = null;
        let proofARows: EncounterRow[] = [];

        try {
          const inserted = await client.query<EncounterRow>(INSERT_ENCOUNTER, [
            encounterId,
            PRACTICE,
            patientReferenceId,
            COMEMBER_B,
            CALLER_A,
          ]);

          proofARowCount = inserted.rowCount;
          proofARows = inserted.rows;
        } catch (error) {
          proofA = classifyProofAFailure(error);
        }

        // HALF ★.B. Same connection, same transaction, same context, same query shape. It runs
        // ONLY after half A succeeded, because `★` is the CONJUNCTION and a half B taken from
        // an already aborted transaction would prove nothing at all.
        let proofB = PROOF_B_NOT_REACHED;
        let proofBRowCount: number | null = null;
        let proofBRows: MembershipRow[] = [];

        if (proofA === PROOF_A_PASS) {
          try {
            const visible = await client.query<MembershipRow>(MEMBERSHIP_LOOKUP, [
              PRACTICE,
              COMEMBER_B,
            ]);

            proofBRowCount = visible.rowCount;
            proofBRows = visible.rows;
            proofB =
              visible.rowCount === 0
                ? PROOF_B_PASS
                : `P5_I2V_EXECUTION_HOLD_SECURITY_ISOLATION_FAILURE_${visible.rowCount}_ROWS_VISIBLE`;
          } catch (error) {
            proofB = classifyProofBFailure(error);
          }
        }

        const closed = await client.query<{ pid: number; xid: string }>(
          'select pg_backend_pid() as pid, pg_current_xact_id()::text as xid',
        );

        return {
          sameClient: client === app,
          openedPid: opened.rows[0]?.pid,
          openedXid: opened.rows[0]?.xid,
          closedPid: closed.rows[0]?.pid,
          closedXid: closed.rows[0]?.xid,
          context: context.rows[0],
          ownRowCount: own.rowCount,
          ownRows: own.rows,
          preInsertRowCount: preInsert.rowCount,
          proofA,
          proofARowCount,
          proofARows,
          proofB,
          proofBRowCount,
          proofBRows,
        };
      },
    );

    // -------------------------------------------------------------------------
    // THE COMBINED FINDING, ASSERTED AS ONE OBJECT.
    //
    // A and B are presented together and compared in a single strict comparison, so neither
    // half can ever be reported, quoted or regressed on its own.
    // -------------------------------------------------------------------------
    expect({
      callerIsNotComember: CALLER_A_ID !== COMEMBER_B_ID,
      bPhysicallyExistsUnderItsOwnContext: control.rowCount,
      ownMembershipVisibleInsideStar: star.ownRowCount,
      proofA: star.proofA,
      proofARowCount: star.proofARowCount,
      responsiblePhysicianAccepted: star.proofARows[0]?.responsible_physician_id,
      proofB: star.proofB,
      proofBRowCount: star.proofBRowCount,
      proofBRows: star.proofBRows,
    }).toStrictEqual({
      callerIsNotComember: true,
      bPhysicallyExistsUnderItsOwnContext: 1,
      ownMembershipVisibleInsideStar: 1,
      proofA: PROOF_A_PASS,
      proofARowCount: 1,
      responsiblePhysicianAccepted: COMEMBER_B,
      proofB: PROOF_B_PASS,
      proofBRowCount: 0,
      proofBRows: [],
    });

    // -------------------------------------------------------------------------
    // THE PROOF-A ANTI-FALSE-POSITIVE SPINE, RESTATED EXPLICITLY.
    // -------------------------------------------------------------------------
    // `A != B`, asserted rather than assumed — at both the user and the membership identity.
    expect(CALLER_A_ID).not.toBe(COMEMBER_B_ID);
    expect(MEMBERSHIP_A).not.toBe(MEMBERSHIP_B);

    // `B` physically exists, proven independently by the differential control: exactly one
    // row, and it is the canonical `B` membership of practice `P`.
    expect(control.rowCount).toBe(1);
    expect(control.rows).toStrictEqual([
      { id: MEMBERSHIP_B, practice_id: PRACTICE, user_id: COMEMBER_B },
    ]);

    // The `★` transaction really carried `A`'s context, read back from the live GUCs.
    expect(star.context).toStrictEqual({ user_id: CALLER_A, practice_id: PRACTICE });

    // The own-membership control: exactly one row, same query shape, same transaction.
    expect(star.ownRowCount).toBe(1);
    expect(star.ownRows).toStrictEqual([
      { id: MEMBERSHIP_A, practice_id: PRACTICE, user_id: CALLER_A },
    ]);

    // The pre-`INSERT` diagnostic. Recorded; it is NOT half B.
    expect(star.preInsertRowCount).toBe(0);

    // The inserted row itself, column by column, and NOT NULL.
    expect(star.proofA).toBe(PROOF_A_PASS);
    expect(star.proofARowCount).toBe(1);
    expect(star.proofARows).toHaveLength(1);
    expect(star.proofARows[0]?.practice_id).toBe(PRACTICE);
    expect(star.proofARows[0]?.responsible_physician_id).toBe(COMEMBER_B);
    expect(star.proofARows[0]?.responsible_physician_id).not.toBeNull();

    // ONE physical client, ONE physical transaction — and the control was a DIFFERENT
    // transaction that had already rolled back before `★` began.
    expect(control.sameClient).toBe(true);
    expect(star.sameClient).toBe(true);
    expect(star.openedPid).toBe(control.pid);
    expect(star.closedPid).toBe(star.openedPid);
    expect(star.closedXid).toBe(star.openedXid);
    expect(star.openedXid).not.toBe(control.xid);

    // -------------------------------------------------------------------------
    // THE PROOF-B ANTI-FALSE-POSITIVE SPINE.
    //
    // Physical existence, `B` belonging to `P`, the same `(P, B)` pair being the key's target,
    // the same SQL yielding one row for `B` and zero under `A`'s context, the own-membership
    // control, `B != A`, and one client / one transaction are all asserted above. Privilege
    // and `FORCE` plus the exact policy are the dedicated specs of section B. Only with ALL of
    // them in place may zero rows be attributed to row-level security.
    // -------------------------------------------------------------------------
    expect(star.proofB).toBe(PROOF_B_PASS);
    expect(star.proofBRowCount).toBe(0);
    expect(star.proofBRows).toStrictEqual([]);

    // The row half B could not see is EXACTLY the parent row half A's key resolved against:
    // same practice, same user, same membership identity.
    expect(control.rows[0]?.practice_id).toBe(PRACTICE);
    expect(control.rows[0]?.user_id).toBe(star.proofARows[0]?.responsible_physician_id);

    // `42501` IS NOT HALF B — recorded as an executable claim, never as prose alone.
    expect(star.proofB).not.toBe(INSUFFICIENT_PRIVILEGE);
    expect(star.proofB.includes(INSUFFICIENT_PRIVILEGE)).toBe(false);
  });

  it('given the ★ transaction then it left NOTHING behind — every row was rolled back', async () => {
    // `withAppContext` always rolls back, and `★` is worthless if it did not: a surviving
    // encounter would mean the proof MUTATED the database it was only supposed to observe.
    //
    // The count is taken as `copilot_app` inside the tenant context of `P`, because that is
    // the identity the phase 5 `SELECT` policies actually admit — the owner is subject to
    // `FORCE ROW LEVEL SECURITY` and would report zero whatever the table held.
    const survivors = await withAppContext(
      app,
      { authSubject: CALLER_A_SUBJECT, userId: CALLER_A, practiceId: PRACTICE },
      async (client) => {
        const encounters = await client.query<{ total: string }>(
          'select count(*)::text as total from encounters',
        );
        const patientReferences = await client.query<{ total: string }>(
          'select count(*)::text as total from patient_references',
        );

        return {
          encounters: encounters.rows[0]?.total,
          patientReferences: patientReferences.rows[0]?.total,
        };
      },
    );

    expect(survivors).toStrictEqual({ encounters: '0', patientReferences: '0' });
  });
});

// =============================================================================
// D. NO WIDENING WAS INTRODUCED TO MAKE ★ PASS
// =============================================================================

describe('★ P5-I2V — no escape was opened (D-064; D-062 Dio K; 02 §23.4.4b)', () => {
  it('given the cluster then the roles are the canonical three and NONE holds BYPASSRLS', async () => {
    const roles = await migrator.query<{
      rolname: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `select rolname, rolbypassrls, rolsuper from pg_roles
        where rolname like 'copilot%' order by rolname`,
    );

    expect(roles.rows).toStrictEqual([
      { rolname: 'copilot_app', rolbypassrls: false, rolsuper: false },
      { rolname: 'copilot_migrator', rolbypassrls: false, rolsuper: false },
      { rolname: 'copilot_system', rolbypassrls: false, rolsuper: false },
    ]);
  });

  it('given the schema then NO function is SECURITY DEFINER', async () => {
    // The single most tempting escape from an RI-versus-RLS problem is a `SECURITY DEFINER`
    // membership lookup. There is none — and `★` proves none is needed.
    const definers = await migrator.query<{ proname: string }>(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app_security', 'public') and p.prosecdef
        order by p.proname`,
    );

    expect(definers.rows).toStrictEqual([]);
  });

  it('given practice_memberships then NO policy targets the owner and the allowlist is still six', async () => {
    const ownerPolicies = await migrator.query<{ polname: string }>(
      `select p.polname from pg_policy p
         join pg_class c on c.oid = p.polrelid
        where c.relname = 'practice_memberships'
          and 'copilot_migrator'::regrole::oid = any(p.polroles)
        order by p.polname`,
    );

    expect(ownerPolicies.rows).toStrictEqual([]);

    // §23.4.4b: `★` needed no trusted maintenance window, so the allowlist did not move.
    expect([...FORCE_RLS_MAINTENANCE_ALLOWLIST]).toStrictEqual([
      'users',
      'practices',
      'practice_membership_roles',
      'platform_role_assignments',
      'practice_memberships',
      'practice_settings',
    ]);
    expect(FORCE_RLS_MAINTENANCE_ALLOWLIST).toHaveLength(6);
  });

  it('given the AAD trigger on encounters then it is BEFORE UPDATE only and cannot have fired on ★', async () => {
    // D-064 correction B. `tgtype` decomposed: ROW = 1, BEFORE = 2, INSERT = 4, DELETE = 8,
    // UPDATE = 16. `BEFORE UPDATE FOR EACH ROW` is therefore exactly 19, and the INSERT bit is
    // provably clear — so package `014` played no part in half A, and `★` required no change
    // to it. Package `014` does not alter `responsible_physician_id`; it only refuses UPDATEs.
    const trigger = await migrator.query<{ tgname: string; tgtype: number; tgenabled: string }>(
      `select t.tgname, t.tgtype::int as tgtype, t.tgenabled::text as tgenabled
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'encounters' and not t.tgisinternal
        order by t.tgname`,
    );

    expect(trigger.rows).toStrictEqual([
      { tgname: 'encounters_aad_immutable_trg', tgtype: 19, tgenabled: 'O' },
    ]);

    // The INSERT bit (4) is clear: this trigger is structurally incapable of firing on `★.A`.
    expect((trigger.rows[0]?.tgtype ?? 0) & 4).toBe(0);
  });
});

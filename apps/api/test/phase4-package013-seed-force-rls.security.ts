/**
 * Package `013_rls_policies` — the seed / `FORCE ROW LEVEL SECURITY` compatibility contract
 * (02 §23.4, §23.4.3, §23.4.4a, §23.4.5, §25.1.2; D-048, D-052 part B; 08 §21.6, §21.8).
 *
 * WHY THIS SUITE OWNS ITS OWN DATABASE
 *
 * Every other security spec runs against the shared disposable database, which the suite's
 * global setup has ALREADY migrated AND seeded. That makes one whole class of assertion
 * impossible there: the state BETWEEN migration and seed. This suite therefore creates,
 * bootstraps, migrates and seeds a disposable database of its own, capturing the catalogue at
 * each step, so the sequence itself becomes assertable:
 *
 *     empty  ->  001 -> 002 -> 013  ->  [assert FORCE before seed]  ->  seed  ->  [assert after]
 *
 * It is the executable form of the D-052 part B mandate that the later implementation slice
 * inherits: `FORCE RLS` restored after the seed, failure and rollback paths restoring `FORCE`,
 * and steady-state `ENABLE` + `FORCE` proven BEFORE AND AFTER the seed rather than once.
 *
 * WHAT IT DOES NOT DO
 *
 * It never touches the development database `copilot` and never the shared integration database
 * `copilot_test` — the same `assertDisposableTarget` guard as every other security spec applies
 * (08 §3). It introduces no credential: `copilot_migrator` is `CREATEDB` and owns what it
 * creates, so no superuser is involved anywhere (02 §3.1, §3.4, D-048 clause 1).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FORCE_RLS_MAINTENANCE_ALLOWLIST,
  PHASE_3_SEED,
  PHASE_4_FORCE_RLS_ALLOWLIST,
  forceRowSecurityAssertionSql,
  runInForceRlsMaintenanceWindow,
  runPhase3Seed,
} from '../prisma/seed.js';
import {
  createDisposableDatabase,
  dropDisposableDatabase,
  generateDisposableDatabaseName,
  type DisposableDatabase,
} from './support/disposable-database.js';
import {
  INSUFFICIENT_PRIVILEGE,
  OBJECT_NOT_IN_PREREQUISITE_STATE,
  connect,
} from './support/phase3-security-context.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

const apiRoot = resolve(import.meta.dirname, '..');

/**
 * The canonical chain, in application order.
 *
 * Package `003_patient_encounter_documents` carries a LOWER number but a LATER timestamp, and
 * both phase 5 slices are later still: package numbers carry OWNERSHIP, not execution order
 * (D-052, D-062 Dio B.3, D-064 `OD-8`). All three are listed here because this assertion is an
 * EXACT chain and must model the deployed reality; none of them changes anything this file
 * proves. The chain grew from FOUR to FIVE with sub-gate `P5-I2A` and from FIVE to SIX with
 * `P5-I2B` — canonical old-exact-set -> new-exact-set evolutions authorised by D-064 `OD-9`,
 * never a weakening.
 *
 * WHAT `P5-I2B` DOES NOT CHANGE HERE, AND MUST NEVER: the §23.4 FORCE-RLS MAINTENANCE
 * ALLOWLIST STAYS AT EXACTLY SIX TABLES. The phase 5 slice of `013_rls_policies` puts seven
 * further tables under `ENABLE` + `FORCE ROW LEVEL SECURITY`, but §23.4.4b (D-062 Dio K)
 * records that NO phase 5 table is ever seeded, so trusted DML never touches one and the
 * maintenance window stays permanently away from medical data. A table under FORCE is NOT
 * automatically a maintenance-window table, and this file asserts both halves separately: the
 * allowlist contract below stays at six, while the whole-schema FORCE count is owned by
 * `phase5-rls-grants.security.ts`.
 */
const EXPECTED_MIGRATIONS = [
  '20260810213856_001_extensions_and_roles',
  '20260814013200_002_identity_and_practices',
  '20260816111141_013_rls_policies',
  '20260823104252_003_patient_encounter_documents',
  '20260823211546_011_jobs_idempotency_outbox_audit_phase5',
  '20260825013452_013_rls_policies_phase5',
] as const;

interface RowSecurityState {
  readonly enabled: boolean;
  readonly forced: boolean;
}

let disposable: DisposableDatabase;
let migrator: Client;

/** The catalogue AFTER `migrate deploy` and BEFORE the seed — the state no other spec can see. */
let stateAfterMigration: Record<string, RowSecurityState> = {};
/** The catalogue AFTER a successful seed. */
let stateAfterSeed: Record<string, RowSecurityState> = {};
/** SQLSTATE of a trusted owner write attempted WITHOUT a window, per phase 4 table. */
const ownerWriteWithoutWindow: Record<string, string | undefined> = {};
/** Whatever the seed threw, or `undefined` when it succeeded. */
let seedFailure: unknown;
/** Physical row counts after the seed, read through the planner statistic. */
let physicalRows: Record<string, number> = {};

async function rowSecurityOfAll(client: Client): Promise<Record<string, RowSecurityState>> {
  const result = await client.query<{ relname: string; enabled: boolean; forced: boolean }>(
    `select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])
      order by c.relname`,
    [[...FORCE_RLS_MAINTENANCE_ALLOWLIST]],
  );

  return Object.fromEntries(
    result.rows.map((row) => [row.relname, { enabled: row.enabled, forced: row.forced }]),
  );
}

/**
 * A trusted owner write to `table`, attempted WITHOUT a maintenance window, always rolled back.
 *
 * This is the exact statement the seed would execute if D-052 part B had NOT been implemented,
 * which is what makes its SQLSTATE the whole justification for the allowlist extension.
 */
async function ownerWriteOutsideWindow(table: string): Promise<string | undefined> {
  await migrator.query('begin');

  try {
    if (table === 'practice_memberships') {
      await migrator.query(
        `insert into "practice_memberships" ("id", "practice_id", "user_id",
                                             "professional_gln", "active",
                                             "created_at", "updated_at")
         values ('00000000-0000-4000-8000-0000000000b1',
                 '00000000-0000-4000-8000-0000000000b2',
                 '00000000-0000-4000-8000-0000000000b3', null, true, now(), now())`,
      );
    } else {
      await migrator.query(
        `insert into "practice_settings" ("id", "practice_id", "billing_review_required",
                                          "allow_mpa_approval", "allow_billing_specialist_approval",
                                          "require_reason_for_manual_change", "ai_enabled",
                                          "axenita_export_enabled", "retention_policy_code",
                                          "configuration", "version", "updated_by", "updated_at")
         values ('00000000-0000-4000-8000-0000000000b4',
                 '00000000-0000-4000-8000-0000000000b5',
                 true, false, false, true, false, false,
                 'DEV-PROBE', '{}'::jsonb, 1, null, now())`,
      );
    }

    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await migrator.query('rollback');
  }
}

beforeAll(async () => {
  disposable = await createDisposableDatabase(generateDisposableDatabaseName());

  expect(disposable.name).toMatch(/^copilot_gate3b_/);
  for (const url of [disposable.app, disposable.migration]) {
    expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
    expect(new URL(url).pathname).toBe(`/${disposable.name}`);
  }

  // Step 1 — the full disposable chain, through the REAL deployment command.
  runPrismaCli(['migrate', 'deploy'], disposable.migration);

  migrator = await connect(disposable.migration);

  // Step 2 — the catalogue AFTER migration and BEFORE the seed.
  stateAfterMigration = await rowSecurityOfAll(migrator);

  // Step 3 — what a trusted owner write would do at this exact point, without a window.
  for (const table of PHASE_4_FORCE_RLS_ALLOWLIST) {
    ownerWriteWithoutWindow[table] = await ownerWriteOutsideWindow(table);
  }

  // Step 4 — the canonical seed. Capturing rather than rethrowing keeps the failure assertable
  // as a value: a seed that throws here must fail ONE named spec, not every spec in the file.
  try {
    await runPhase3Seed(disposable.migration);
  } catch (error) {
    seedFailure = error;
  }

  // Step 5 — the catalogue AFTER the seed.
  stateAfterSeed = await rowSecurityOfAll(migrator);

  // Under FORCE the owner is filtered by policies it does not match, so `count(*)` legitimately
  // returns zero. The planner statistic is the honest read that needs no bypass identity.
  for (const table of FORCE_RLS_MAINTENANCE_ALLOWLIST) {
    await migrator.query(`analyze "${table}"`);
  }
  const counts = await migrator.query<{ relname: string; physical: number }>(
    `select c.relname, c.reltuples::int as physical
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])`,
    [[...FORCE_RLS_MAINTENANCE_ALLOWLIST]],
  );
  physicalRows = Object.fromEntries(counts.rows.map((row) => [row.relname, row.physical]));
}, 180000);

afterAll(async () => {
  await migrator.end();

  if (disposable !== undefined) {
    await dropDisposableDatabase(disposable);
  }
}, 60000);

describe('the disposable chain 001 -> 002 -> 013 applies and the seed then succeeds', () => {
  it('given an empty bootstrapped database when migrate deploy runs then exactly the canonical chain is applied', async () => {
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

    expect(result.rows.map((row) => row.migration_name)).toStrictEqual([...EXPECTED_MIGRATIONS]);
    expect(result.rows.every((row) => row.finished && !row.rolled_back)).toBe(true);
  });

  it('given the migrated database when migrate status runs then it reports up to date', () => {
    expect(runPrismaCli(['migrate', 'status'], disposable.migration)).toContain(
      'Database schema is up to date!',
    );
  });

  it('given the canonical seed when it runs after 013 then it SUCCEEDS', () => {
    // THE MERGE BLOCKER THIS GATE EXISTS TO REMOVE. Before D-052 part B was implemented in
    // code, this failed with SQLSTATE 42501 on `practice_memberships`, and the security suite's
    // own global setup could not complete.
    expect(seedFailure).toBeUndefined();
  });

  it('given the seeded database then every seeded table physically holds its accepted rows', () => {
    expect(physicalRows['practices']).toBe(PHASE_3_SEED.practices.length);
    expect(physicalRows['users']).toBe(PHASE_3_SEED.users.length);
    expect(physicalRows['practice_memberships']).toBe(PHASE_3_SEED.memberships.length);
    expect(physicalRows['practice_membership_roles']).toBe(PHASE_3_SEED.membershipRoles.length);
    expect(physicalRows['practice_settings']).toBe(PHASE_3_SEED.practiceSettings.length);
    expect(physicalRows['platform_role_assignments']).toBe(
      PHASE_3_SEED.platformRoleAssignments.length,
    );
  });

  it('given package 013 then it created NO table — `review_decision_change_links` does not exist', async () => {
    // D-052 clause A.7 — the phase 4 assertion for the deferred slice is NEGATIVE and verifiable
    // here. The table is created by package `009_review_approvals` in PHASE 10.
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename = 'review_decision_change_links'`,
    );

    expect(result.rows).toStrictEqual([]);
  });
});

describe('steady state BEFORE and AFTER the seed (02 §23.4.4a; D-052 clause B.3; 08 §21.8)', () => {
  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given %s AFTER migration and BEFORE the seed then relrowsecurity = true and relforcerowsecurity = true',
    (table) => {
      expect(stateAfterMigration[table]).toStrictEqual({ enabled: true, forced: true });
    },
  );

  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given %s AFTER a successful seed then relrowsecurity = true and relforcerowsecurity = true',
    (table) => {
      // `FORCE RLS` is RESTORED AFTER THE SEED. A seed that opened a window and forgot to close
      // it would leave `forced: false` here, which is the single most dangerous outcome the
      // protocol exists to make impossible.
      expect(stateAfterSeed[table]).toStrictEqual({ enabled: true, forced: true });
    },
  );

  it('given ALL SIX allowlisted tables then the seed changed no FORCE flag at all', () => {
    expect(stateAfterSeed).toStrictEqual(stateAfterMigration);
    expect(Object.keys(stateAfterSeed)).toHaveLength(6);

    for (const state of Object.values(stateAfterSeed)) {
      expect(state).toStrictEqual({ enabled: true, forced: true });
    }
  });
});

describe('the window solves a real problem for the two PHASE 4 tables (08 §21.6.2)', () => {
  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given the table OWNER when it writes to %s WITHOUT a window then it is denied with 42501',
    (table) => {
      // Captured at the exact point between migration and seed. Under FORCE even
      // `copilot_migrator` is subject to the policies, and no policy created by `013` permits an
      // owner write — every one is FOR SELECT/FOR UPDATE and scoped TO `copilot_app`. This is
      // the whole justification for the D-052 part B allowlist extension.
      expect(ownerWriteWithoutWindow[table]).toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given the same write INSIDE a window on %s then it succeeds and FORCE is restored before COMMIT',
    async (table) => {
      const probeId =
        table === 'practice_memberships'
          ? '00000000-0000-4000-8000-0000000000a1'
          : '00000000-0000-4000-8000-0000000000a2';

      await runInForceRlsMaintenanceWindow(migrator, table, async (client) => {
        // The window is observable from inside: ENABLE stays true, only FORCE moves.
        const inside = await client.query<{ enabled: boolean; forced: boolean }>(
          `select relrowsecurity as enabled, relforcerowsecurity as forced
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = $1`,
          [table],
        );
        expect(inside.rows[0]).toStrictEqual({ enabled: true, forced: false });

        // A real write, against real seeded parents, so nothing here is a no-op.
        if (table === 'practice_memberships') {
          await client.query(
            `insert into "practice_memberships" ("id", "practice_id", "user_id",
                                                 "professional_gln", "active",
                                                 "created_at", "updated_at")
             values ($1, $2, $3, null, true, now(), now())`,
            [probeId, PHASE_3_SEED.practices[2]?.id, PHASE_3_SEED.users[1]?.id],
          );
        } else {
          await client.query(
            `update "practice_settings" set "ai_enabled" = true where "practice_id" = $1`,
            [PHASE_3_SEED.practices[0]?.id],
          );
        }
      });

      const after = await rowSecurityOfAll(migrator);
      expect(after[table]).toStrictEqual({ enabled: true, forced: true });

      // Undo the probe through the same protocol, so the suite leaves the state it found.
      await runInForceRlsMaintenanceWindow(migrator, table, async (client) => {
        if (table === 'practice_memberships') {
          await client.query('delete from "practice_memberships" where "id" = $1', [probeId]);
        } else {
          await client.query(
            `update "practice_settings" set "ai_enabled" = false where "practice_id" = $1`,
            [PHASE_3_SEED.practices[0]?.id],
          );
        }
      });

      expect((await rowSecurityOfAll(migrator))[table]).toStrictEqual({
        enabled: true,
        forced: true,
      });
    },
  );
});

describe('an interrupted window on a PHASE 4 table never leaves FORCE off (D-052 clause B.3)', () => {
  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given trusted DML on %s that fails then the transaction aborts and FORCE is restored',
    async (table) => {
      let failure: unknown;

      try {
        await runInForceRlsMaintenanceWindow(migrator, table, async (client) => {
          const inside = await client.query<{ enabled: boolean; forced: boolean }>(
            `select relrowsecurity as enabled, relforcerowsecurity as forced
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = $1`,
            [table],
          );
          expect(inside.rows[0]).toStrictEqual({ enabled: true, forced: false });

          throw new Error(`simulated trusted seed failure on ${table}`);
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(Error);
      expect((await rowSecurityOfAll(migrator))[table]).toStrictEqual({
        enabled: true,
        forced: true,
      });
    },
  );

  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given a FAILED POST-RESTORE ASSERTION on %s then it RAISES 55000 and COMMIT becomes impossible',
    async (table) => {
      // The assertion lives in SQL precisely so a mismatch puts PostgreSQL's own transaction
      // into the aborted state (02 §23.4.3 step 6, §23.4.5, D-048 clause 4). An unsafe steady
      // state is therefore not merely detected — it cannot be committed.
      await migrator.query('begin');
      let assertionState: string | undefined;
      let afterAssertionState: string | undefined;

      try {
        await migrator.query(`alter table "public"."${table}" no force row level security`);

        try {
          await migrator.query(forceRowSecurityAssertionSql(table, true));
        } catch (error) {
          assertionState = (error as { code?: string }).code;
        }

        try {
          await migrator.query('select 1');
        } catch (error) {
          afterAssertionState = (error as { code?: string }).code;
        }
      } finally {
        await migrator.query('rollback');
      }

      expect(assertionState).toBe(OBJECT_NOT_IN_PREREQUISITE_STATE);
      // 25P02 — `in_failed_sql_transaction`: nothing else can run, so COMMIT cannot be reached.
      expect(afterAssertionState).toBe('25P02');

      expect((await rowSecurityOfAll(migrator))[table]).toStrictEqual({
        enabled: true,
        forced: true,
      });
    },
  );

  it.each(PHASE_4_FORCE_RLS_ALLOWLIST)(
    'given a raw aborted maintenance transaction on %s then ROLLBACK alone restores FORCE',
    async (table) => {
      // The same guarantee, proven without the helper: transactional DDL is what makes the
      // protocol fail closed.
      await migrator.query('begin');
      await migrator.query(`alter table "public"."${table}" no force row level security`);

      const inside = await migrator.query<{ forced: boolean }>(
        `select relforcerowsecurity as forced from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = $1`,
        [table],
      );
      expect(inside.rows[0]?.forced).toBe(false);

      await migrator.query('rollback');

      expect((await rowSecurityOfAll(migrator))[table]).toStrictEqual({
        enabled: true,
        forced: true,
      });
    },
  );
});

describe('the permanently rejected alternatives are absent AFTER 013 (D-052 clause B.3)', () => {
  it('given the cluster then no project role holds BYPASSRLS', async () => {
    const result = await migrator.query<{ rolname: string }>(
      `select rolname from pg_roles where rolbypassrls and rolname like 'copilot%' order by rolname`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the database then no SECURITY DEFINER function exists — including set_request_context', async () => {
    const result = await migrator.query<{ proname: string }>(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_security') and p.prosecdef
        order by p.proname`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the database then no permanent copilot_migrator RLS policy exists', async () => {
    // A permanent owner-write policy would make the maintenance window unnecessary and would
    // leave the owner permanently able to write behind FORCE. It is a rejected alternative.
    const result = await migrator.query<{ polname: string }>(
      `select p.polname from pg_policy p
        where 'copilot_migrator' = any (select pg_get_userbyid(r) from unnest(p.polroles) r)`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the seed identity then it is copilot_migrator and NOT a superuser', async () => {
    const result = await migrator.query<{ current_user: string; is_super: boolean }>(
      `select current_user, (select rolsuper from pg_roles where rolname = current_user) as is_super`,
    );

    expect(result.rows[0]?.current_user).toBe('copilot_migrator');
    expect(result.rows[0]?.is_super).toBe(false);
  });

  it('given package 013 specifically then its forward SQL executes no DISABLE ROW LEVEL SECURITY', () => {
    // 02 §23.4.5 forbids it in forward migrations, seeds and maintenance windows alike. The
    // prohibition does NOT extend to the documented full-reversal rollback, which package `013`
    // records in prose — so comments are stripped before the scan, exactly as the D-048 source
    // scan does. Flagging documentation would push a future author to delete the very text that
    // records the decision.
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', EXPECTED_MIGRATIONS[2], 'migration.sql'),
      'utf8',
    );

    const operational = sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

    expect(/\bdisable\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bsecurity\s+definer\b/i.test(operational)).toBe(false);
    expect(/\b(?:create|alter)\s+role\b[^;]*\bbypassrls\b/i.test(operational)).toBe(false);

    // The rollback prose IS present and must stay present — the scan tolerating it is the point.
    expect(sql).toContain('disable row level security');
  });

  it('given the runtime application source then the phase 4 allowlist and the window are unreachable from it', () => {
    // 02 §23.4.5 / D-048 clause 4: the mechanism is MAINTENANCE ONLY. Extending the allowlist
    // must not have made it importable from a request path, so `src/` is scanned for the seed
    // module, for the protocol's DDL and for the new constants by name.
    const offenders: string[] = [];

    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts')) {
          continue;
        }

        const source = readFileSync(path, 'utf8');
        if (
          /prisma\/seed/.test(source) ||
          /force\s+row\s+level\s+security/i.test(source) ||
          /FORCE_RLS_MAINTENANCE_ALLOWLIST/.test(source) ||
          /PHASE_4_FORCE_RLS_ALLOWLIST/.test(source) ||
          /runInForceRlsMaintenanceWindow/.test(source)
        ) {
          offenders.push(path);
        }
      }
    };

    walk(resolve(apiRoot, 'src'));

    expect(offenders).toStrictEqual([]);
  });

  it('given the maintenance window then it is not a database function and no such callable exists', () => {
    // D-048 clause 1: the protocol must never become a callable database function. It is
    // TypeScript in the seed module, and the catalogue assertion above already proves
    // `app_security` holds exactly the three SECURITY INVOKER context functions.
    const seed = readFileSync(resolve(apiRoot, 'prisma/seed.ts'), 'utf8');

    expect(seed).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(seed).not.toMatch(/create\s+trigger/i);
  });
});

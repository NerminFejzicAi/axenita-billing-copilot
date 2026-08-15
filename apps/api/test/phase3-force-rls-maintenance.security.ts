import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PHASE_3_FORCE_RLS_ALLOWLIST,
  TableNotAllowlistedError,
  forceRowSecurityAssertionSql,
  runInForceRlsMaintenanceWindow,
} from '../prisma/seed.js';
import {
  INSUFFICIENT_PRIVILEGE,
  OBJECT_NOT_IN_PREREQUISITE_STATE,
  connect,
  securityDatabase,
} from './support/phase3-security-context.js';

/**
 * D-048 — the `FORCE ROW LEVEL SECURITY` maintenance protocol (02 §23.4, §25.1.2; 08 §21.6.2).
 *
 * The steady-state assertions here are PERMANENT REGRESSION TESTS, not a one-off check
 * (02 §23.4.5). The window specs prove the protocol solves a real problem, restores FORCE on
 * failure, and refuses a target outside the frozen allowlist before touching the table.
 */
const database = securityDatabase();
const apiRoot = resolve(import.meta.dirname, '..');

let migrator: Client;

/** A row this suite writes and removes again, so no spec depends on another spec's leftovers. */
const PROBE_PRACTICE_ID = '00000000-0000-4000-8000-0000000000c1';

beforeAll(async () => {
  migrator = await connect(database.migration);
});

afterAll(async () => {
  await migrator.end();
});

async function rowSecurityOf(table: string): Promise<{ enabled: boolean; forced: boolean }> {
  const result = await migrator.query<{ enabled: boolean; forced: boolean }>(
    `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1`,
    [table],
  );

  const row = result.rows[0];
  expect(row).toBeDefined();

  return row ?? { enabled: false, forced: false };
}

describe('steady state after migration and after seed (08 §21.6.1)', () => {
  it.each(PHASE_3_FORCE_RLS_ALLOWLIST)(
    'given %s when inspected then row level security is enabled AND forced',
    async (table) => {
      await expect(rowSecurityOf(table)).resolves.toStrictEqual({ enabled: true, forced: true });
    },
  );

  it('given the two tables outside the allowlist then neither carries phase 3 RLS', async () => {
    // Both first receive it in `013_rls_policies` (02 §17.3, §20.2b, §22.13), so neither
    // needs nor may have a phase 3 maintenance window (D-048 clause 5).
    await expect(rowSecurityOf('practice_memberships')).resolves.toStrictEqual({
      enabled: false,
      forced: false,
    });
    await expect(rowSecurityOf('practice_settings')).resolves.toStrictEqual({
      enabled: false,
      forced: false,
    });
  });

  it('given the frozen allowlist then it contains exactly the four accepted tables', () => {
    // 02 §23.4.4 / D-048 clause 5 as grown by D-051 clause 7. Silent extension is forbidden,
    // so the list itself is asserted, not merely used.
    expect([...PHASE_3_FORCE_RLS_ALLOWLIST]).toStrictEqual([
      'users',
      'practices',
      'practice_membership_roles',
      'platform_role_assignments',
    ]);
  });
});

describe('the window solves a real problem (08 §21.6.2)', () => {
  it('given the table OWNER when it writes to a FORCE table WITHOUT a window then it is denied', async () => {
    // Under FORCE, even `copilot_migrator` is subject to the policies, and no accepted policy
    // permits an owner write. This is the problem D-048 exists to solve; without this spec the
    // whole protocol could be dead code protecting nothing.
    await migrator.query('begin');
    let sqlState: string | undefined;
    try {
      await migrator.query(
        `insert into practices (id, code, name, status, updated_at)
         values ($1, 'probe-no-window', 'Probe', 'ACTIVE', now())`,
        [PROBE_PRACTICE_ID],
      );
    } catch (error) {
      sqlState = (error as { code?: string }).code;
    } finally {
      await migrator.query('rollback');
    }

    expect(sqlState).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given the same write INSIDE a window then it succeeds and FORCE is restored before COMMIT', async () => {
    await runInForceRlsMaintenanceWindow(migrator, 'practices', async (client) => {
      // The window is observable from inside: enabled stays true, only FORCE moves.
      const inside = await client.query<{ enabled: boolean; forced: boolean }>(
        `select relrowsecurity as enabled, relforcerowsecurity as forced
           from pg_class where relname = 'practices'`,
      );
      expect(inside.rows[0]).toStrictEqual({ enabled: true, forced: false });

      await client.query(
        `insert into practices (id, code, name, status, updated_at)
         values ($1, 'probe-window', 'Probe', 'ACTIVE', now())`,
        [PROBE_PRACTICE_ID],
      );
    });

    await expect(rowSecurityOf('practices')).resolves.toStrictEqual({
      enabled: true,
      forced: true,
    });

    // Remove the probe row again, through the same protocol.
    await runInForceRlsMaintenanceWindow(migrator, 'practices', async (client) => {
      await client.query('delete from practices where id = $1', [PROBE_PRACTICE_ID]);
    });

    await expect(rowSecurityOf('practices')).resolves.toStrictEqual({
      enabled: true,
      forced: true,
    });
  });
});

describe('an interrupted window never leaves FORCE off (08 §21.6.2)', () => {
  it('given trusted DML that fails then the transaction aborts and FORCE is restored', async () => {
    let failure: unknown;

    try {
      await runInForceRlsMaintenanceWindow(migrator, 'users', async (client) => {
        const inside = await client.query<{ enabled: boolean; forced: boolean }>(
          `select relrowsecurity as enabled, relforcerowsecurity as forced
             from pg_class where relname = 'users'`,
        );
        expect(inside.rows[0]).toStrictEqual({ enabled: true, forced: false });

        throw new Error('simulated trusted seed failure');
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    await expect(rowSecurityOf('users')).resolves.toStrictEqual({ enabled: true, forced: true });
  });

  it('given a restore assertion that does not hold then it RAISES 55000 and aborts the transaction', async () => {
    // The assertion lives in SQL precisely so a mismatch puts PostgreSQL's own transaction
    // into the aborted state, which makes COMMIT impossible (02 §23.4.3 step 6, §23.4.5,
    // D-048 clause 4). Here the closing assertion is executed against a catalogue that
    // deliberately disagrees with it.
    await migrator.query('begin');
    let assertionState: string | undefined;
    let afterAssertionState: string | undefined;

    try {
      await migrator.query(
        'alter table "public"."platform_role_assignments" no force row level security',
      );

      try {
        await migrator.query(forceRowSecurityAssertionSql('platform_role_assignments', true));
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

    await expect(rowSecurityOf('platform_role_assignments')).resolves.toStrictEqual({
      enabled: true,
      forced: true,
    });
  });

  it('given the opening assertion when FORCE is still on then it also raises 55000', async () => {
    // Proves the assertion is genuinely two-sided rather than a formality that only ever
    // passes.
    await migrator.query('begin');
    let sqlState: string | undefined;

    try {
      await migrator.query(forceRowSecurityAssertionSql('users', false));
    } catch (error) {
      sqlState = (error as { code?: string }).code;
    } finally {
      await migrator.query('rollback');
    }

    expect(sqlState).toBe(OBJECT_NOT_IN_PREREQUISITE_STATE);
  });

  it('given a raw aborted maintenance transaction then ROLLBACK restores FORCE', async () => {
    // The same guarantee, proven without the helper: transactional DDL is what makes the
    // protocol fail closed.
    await migrator.query('begin');
    await migrator.query(
      'alter table "public"."practice_membership_roles" no force row level security',
    );

    const inside = await migrator.query<{ enabled: boolean; forced: boolean }>(
      `select relrowsecurity as enabled, relforcerowsecurity as forced
         from pg_class where relname = 'practice_membership_roles'`,
    );
    expect(inside.rows[0]).toStrictEqual({ enabled: true, forced: false });

    await migrator.query('rollback');

    await expect(rowSecurityOf('practice_membership_roles')).resolves.toStrictEqual({
      enabled: true,
      forced: true,
    });
  });
});

describe('allowlist enforcement (08 §21.6.2)', () => {
  it.each(['practice_memberships', 'practice_settings', '_prisma_migrations', 'users; drop table'])(
    'given the non-allowlisted target %s then it is rejected BEFORE any ALTER TABLE',
    async (table) => {
      let dmlWasCalled = false;

      await expect(
        runInForceRlsMaintenanceWindow(migrator, table, async () => {
          dmlWasCalled = true;
          await Promise.resolve();
        }),
      ).rejects.toBeInstanceOf(TableNotAllowlistedError);

      expect(dmlWasCalled).toBe(false);
    },
  );

  it('given a rejected target then no transaction was opened and no FORCE flag moved', async () => {
    await expect(
      runInForceRlsMaintenanceWindow(migrator, 'practice_memberships', async () => {
        await Promise.resolve();
      }),
    ).rejects.toBeInstanceOf(TableNotAllowlistedError);

    // `VACUUM` cannot run inside a transaction block: PostgreSQL raises SQLSTATE 25001 when
    // one is open. It succeeding therefore proves the rejection happened before `begin`.
    await expect(migrator.query('vacuum practice_memberships')).resolves.toBeDefined();

    await expect(rowSecurityOf('practice_memberships')).resolves.toStrictEqual({
      enabled: false,
      forced: false,
    });
  });
});

describe('permanently rejected alternatives are absent (02 §23.4.2, 08 §21.6.2)', () => {
  it('given the cluster when inspected then no project role holds BYPASSRLS', async () => {
    const result = await migrator.query<{ rolname: string }>(
      `select rolname from pg_roles where rolbypassrls and rolname like 'copilot%' order by rolname`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the database when inspected then no SECURITY DEFINER function exists', async () => {
    const result = await migrator.query<{ proname: string }>(
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_security') and p.prosecdef
        order by p.proname`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the database when inspected then no permanent copilot_migrator RLS policy exists', async () => {
    const result = await migrator.query<{ polname: string }>(
      `select p.polname from pg_policy p
        where 'copilot_migrator' = any (select pg_get_userbyid(r) from unnest(p.polroles) r)`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the seed when inspected then it connects as copilot_migrator and never as a superuser', async () => {
    const result = await migrator.query<{ current_user: string; is_super: boolean }>(
      `select current_user, (select rolsuper from pg_roles where rolname = current_user) as is_super`,
    );

    expect(result.rows[0]?.current_user).toBe('copilot_migrator');
    expect(result.rows[0]?.is_super).toBe(false);
  });
});

describe('static source scan (08 §21.6.2)', () => {
  /**
   * The three permanently rejected constructs, matched as EXECUTABLE statements.
   *
   * `bypassrls` is anchored to `CREATE ROLE` / `ALTER ROLE` rather than matched bare: the
   * catalogue column is called `rolbypassrls`, and migration `001` reads it precisely in
   * order to REJECT the attribute. A bare match would fail the build for asserting the
   * invariant, which is the opposite of the intent.
   */
  const FORBIDDEN = [
    /\balter\s+table\b[^;]*\bdisable\s+row\s+level\s+security\b/i,
    /\bsecurity\s+definer\b/i,
    /\b(?:create|alter)\s+role\b[^;]*\bbypassrls\b/i,
  ] as const;

  /**
   * Strips SQL and TypeScript comments so the scan reads OPERATIONAL statements only.
   *
   * This matters: migration `002` documents the rejected alternatives and the full-reversal
   * rollback in prose, and 02 §23.4.5 exempts a documented rollback from the prohibition
   * explicitly. A naive substring search would flag that documentation and would push future
   * authors to delete the very text that records the decision.
   */
  function operationalSource(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, '').replace(/\/\/.*$/, ''))
      .join('\n');
  }

  function sourcesUnderTest(): { path: string; source: string }[] {
    const files: { path: string; source: string }[] = [];

    const seedPath = resolve(apiRoot, 'prisma/seed.ts');
    files.push({ path: seedPath, source: readFileSync(seedPath, 'utf8') });

    const migrationsRoot = resolve(apiRoot, 'prisma/migrations');
    for (const entry of readdirSync(migrationsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const sqlPath = resolve(migrationsRoot, entry.name, 'migration.sql');
      files.push({ path: sqlPath, source: readFileSync(sqlPath, 'utf8') });
    }

    return files;
  }

  it('given the seed and every forward migration then no rejected construct is executed', () => {
    for (const file of sourcesUnderTest()) {
      const operational = operationalSource(file.source);

      for (const pattern of FORBIDDEN) {
        expect(
          pattern.test(operational),
          `${file.path} contains an operational ${pattern.source}`,
        ).toBe(false);
      }
    }
  });

  it('given the scan itself then it is proven to detect a violation', () => {
    // A scanner that cannot fail is not a control. This asserts the comment stripping does not
    // swallow real code.
    const violating = operationalSource(
      '-- documented only\nalter table x disable row level security;',
    );

    expect(FORBIDDEN[0].test(violating)).toBe(true);
  });

  it('given documentation of the rejected constructs then the scan does not flag it', () => {
    const documented = operationalSource(
      '-- alter table x disable row level security is forbidden here\n' +
        '-- no SECURITY DEFINER, no BYPASSRLS\nselect 1;',
    );

    for (const pattern of FORBIDDEN) {
      expect(pattern.test(documented)).toBe(false);
    }
  });

  it('given a catalogue read of rolbypassrls then the scan does not mistake it for the attribute', () => {
    // Migration 001 asserts `NOT rolbypassrls`. Flagging that would punish the invariant.
    const assertion = operationalSource('select rolbypassrls from pg_roles;');

    for (const pattern of FORBIDDEN) {
      expect(pattern.test(assertion)).toBe(false);
    }

    expect(FORBIDDEN[2].test(operationalSource('alter role copilot_app bypassrls;'))).toBe(true);
  });

  it('given the runtime application source then the maintenance mechanism is unreachable from it', () => {
    // 02 §23.4.5 / D-048 clause 4: the mechanism is maintenance only and must never be
    // reachable from a request path. `src/` is the Nest runtime; it must not import the seed
    // and must not contain the protocol's DDL.
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
        if (/prisma\/seed/.test(source) || /force\s+row\s+level\s+security/i.test(source)) {
          offenders.push(path);
        }
      }
    };

    walk(resolve(apiRoot, 'src'));

    expect(offenders).toStrictEqual([]);
  });
});

describe('the seed leaves the database in the accepted steady state', () => {
  it('given the seeded database when read as the owner then FORCE hides even the owner', async () => {
    // A consequence worth pinning: under FORCE the owner is filtered by policies it does not
    // match, so `copilot_migrator` reads zero rows from these tables outside a window. Any
    // future "the seed did not write anything" report should start here.
    const result = await migrator.query<{ total: string }>(
      'select count(*)::text as total from practices',
    );

    expect(result.rows[0]?.total).toBe('0');
  });

  it('given the seeded database when the physical row count is read then the rows are there', async () => {
    await migrator.query('analyze practices');
    const result = await migrator.query<{ physical: number }>(
      `select c.reltuples::int as physical from pg_class c where c.relname = 'practices'`,
    );

    expect(result.rows[0]?.physical).toBeGreaterThanOrEqual(3);
  });
});

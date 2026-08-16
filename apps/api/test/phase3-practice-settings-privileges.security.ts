import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED, PHASE_3_SEED_IDS } from '../prisma/seed.js';
import {
  INSUFFICIENT_PRIVILEGE,
  connect,
  securityDatabase,
  sqlStateOf,
} from './support/phase3-security-context.js';

/**
 * D-049 and D-053 — the readable and writable surface of `practice_settings`
 * (02 §20.2b, §20.2b.1, §20.2b.2, §25.1.3; 08 §21.7, §21.8).
 *
 * PHASE 4 STATE. Two things changed with `013_rls_policies` and both are asserted here:
 *
 *   * the column surface EXTENDED from the three phase 3 `SELECT` columns of D-049 clause 2 to
 *     NINE `SELECT` and NINE `UPDATE` columns (D-053 parts A and B). No phase 3 grant was
 *     revoked — the old three are a strict subset of the new nine;
 *   * the table gained `ENABLE` + `FORCE` row level security and the §17.1 tenant policy, so
 *     the column grant is no longer the ONLY control. Both barriers are asserted separately,
 *     because either one silently disappearing must fail a test.
 *
 * Every forbidden column is still asserted individually rather than as a group.
 */
const database = securityDatabase();

let app: Client;
let system: Client;

/**
 * The columns `copilot_app` may NEVER read — the exact complement of the nine-column `SELECT`
 * surface (D-053 clause A.4). `updated_at` is writable but NOT readable: internal metadata is
 * not exposed merely because it exists in the table.
 */
const FORBIDDEN_COLUMNS = ['id', 'updated_at', 'updated_by', 'configuration'] as const;

/** The nine columns D-053 clause A.1 and A.2 make readable. */
const READABLE_COLUMNS = [
  'practice_id',
  'billing_review_required',
  'allow_mpa_approval',
  'allow_billing_specialist_approval',
  'require_reason_for_manual_change',
  'ai_enabled',
  'axenita_export_enabled',
  'retention_policy_code',
  'version',
] as const;

/** The nine columns D-053 clause B.1 makes writable. `practice_id` is deliberately absent. */
const WRITABLE_COLUMNS = [
  'billing_review_required',
  'allow_mpa_approval',
  'allow_billing_specialist_approval',
  'require_reason_for_manual_change',
  'ai_enabled',
  'axenita_export_enabled',
  'retention_policy_code',
  'version',
  'updated_at',
] as const;

/** The columns that carry NO `UPDATE` grant at all (D-053 clause B.2). */
const UNWRITABLE_COLUMNS = ['practice_id', 'id', 'configuration', 'updated_by'] as const;

/**
 * Runs `statement` as `copilot_app` with a full request context established through the
 * canonical path, then rolls back. This is the ONLY way a row of this table is reachable after
 * `013`, so a privilege test that means to isolate the GRANT must establish it — otherwise RLS
 * would return zero rows and every negative assertion would pass for the wrong reason.
 */
async function sqlStateInTenantContext(statement: string): Promise<string | undefined> {
  await app.query('begin');
  try {
    await app.query('select app_security.set_user_context($1::uuid)', [
      PHASE_3_SEED_IDS.userPracticeAdmin,
    ]);
    await app.query('select app_security.set_request_context($1::uuid)', [
      PHASE_3_SEED_IDS.practiceDemo,
    ]);
    await app.query(statement);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await app.query('rollback');
  }
}

beforeAll(async () => {
  [app, system] = await Promise.all([connect(database.app), connect(database.system)]);
});

afterAll(async () => {
  await Promise.all([app.end(), system.end()]);
});

describe('permitted surface (08 §21.7.1, §21.8)', () => {
  it('given copilot_app in tenant context when it reads all NINE permitted columns then it succeeds', async () => {
    await expect(
      sqlStateInTenantContext(`select ${READABLE_COLUMNS.join(', ')} from practice_settings`),
    ).resolves.toBeUndefined();
  });

  it.each(READABLE_COLUMNS)(
    'given copilot_app when it reads the permitted column %s then the GRANT admits it',
    async (column) => {
      // Asserted per column: the counted list in the catalogue spec proves the grant EXISTS,
      // and this proves each granted column is genuinely usable rather than merely recorded.
      await expect(
        sqlStateInTenantContext(`select ${column} from practice_settings`),
      ).resolves.toBeUndefined();
    },
  );

  it('given the phase 3 three-column surface then it SURVIVED the phase 4 extension (D-053 clause A.5)', async () => {
    // No phase 3 grant was revoked, so no phase 3 consumer breaks at the privilege level.
    await expect(
      sqlStateInTenantContext(
        `select practice_id, allow_mpa_approval, allow_billing_specialist_approval
           from practice_settings`,
      ),
    ).resolves.toBeUndefined();
  });

  it('given the established tenant then EXACTLY ONE row is visible, and it is that tenant row', async () => {
    // The §17.1 policy, in its positive form. In phase 3 this returned every row.
    await app.query('begin');

    try {
      await app.query('select app_security.set_user_context($1::uuid)', [
        PHASE_3_SEED_IDS.userPracticeAdmin,
      ]);
      await app.query('select app_security.set_request_context($1::uuid)', [
        PHASE_3_SEED_IDS.practiceDemo,
      ]);

      const result = await app.query<{
        practice_id: string;
        allow_mpa_approval: boolean;
        allow_billing_specialist_approval: boolean;
        version: number;
      }>(
        `select practice_id, allow_mpa_approval, allow_billing_specialist_approval, version
           from practice_settings`,
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.practice_id).toBe(PHASE_3_SEED_IDS.practiceDemo);
      // D-041: approval outside PHYSICIAN/PRACTICE_ADMIN is an opt-in decision of the practice,
      // never a default state.
      expect(result.rows[0]?.allow_mpa_approval).toBe(false);
      expect(result.rows[0]?.allow_billing_specialist_approval).toBe(false);
      // D-053 clause A.2 — `version` carries the `ETag` and is now readable.
      expect(result.rows[0]?.version).toBe(1);
    } finally {
      await app.query('rollback');
    }
  });

  it('given the seed then it still writes one settings row per practice', () => {
    expect(PHASE_3_SEED.practiceSettings).toHaveLength(PHASE_3_SEED.practices.length);
  });
});

describe('the bounded UPDATE surface (02 §20.2b.1; D-053 part B)', () => {
  it.each(WRITABLE_COLUMNS.filter((column) => column !== 'version' && column !== 'updated_at'))(
    'given copilot_app in tenant context when it updates %s then the grant and the policy admit it',
    async (column) => {
      // Boolean and text settings columns, written with a value of their own type. The write is
      // always rolled back, so no spec sees another spec's mutation.
      const value = column === 'retention_policy_code' ? `'DEV-RETENTION-PROBE'` : 'true';

      await expect(
        sqlStateInTenantContext(`update practice_settings set ${column} = ${value}`),
      ).resolves.toBeUndefined();
    },
  );

  it('given copilot_app in tenant context when it updates version and updated_at then both are admitted', async () => {
    // D-053 clause B.1: `version` is the D-029 optimistic-locking column and `updated_at` is set
    // BY THE DATABASE during the UPDATE. Neither is ever sent by an API caller (clause B.6).
    await expect(
      sqlStateInTenantContext(
        'update practice_settings set version = version + 1, updated_at = now()',
      ),
    ).resolves.toBeUndefined();
  });

  it.each(UNWRITABLE_COLUMNS)(
    'given copilot_app when it attempts to update %s then it is denied on PRIVILEGE',
    async (column) => {
      // Including `practice_id`: a tenant-key move is rejected twice over — once here on the
      // missing column privilege, and once by the `WITH CHECK` of the tenant policy
      // (D-053 clause B.2). This asserts the FIRST barrier in isolation.
      const value =
        column === 'practice_id' || column === 'id' || column === 'updated_by'
          ? `'${PHASE_3_SEED_IDS.practiceNord}'::uuid`
          : `'{}'::jsonb`;

      await expect(
        sqlStateInTenantContext(`update practice_settings set ${column} = ${value}`),
      ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it('given copilot_app WITHOUT tenant context when it updates a permitted column then it affects ZERO rows', async () => {
    // The SECOND barrier, in isolation: the grant admits the statement, and the policy `USING`
    // clause means no row is even visible to the UPDATE.
    await app.query('begin');

    try {
      await app.query('select app_security.set_user_context($1::uuid)', [
        PHASE_3_SEED_IDS.userPracticeAdmin,
      ]);

      const result = await app.query('update practice_settings set allow_mpa_approval = true');

      expect(result.rowCount).toBe(0);
    } finally {
      await app.query('rollback');
    }
  });

  it('given an established tenant when it updates then it reaches ONLY its own row', async () => {
    // Cross-tenant write, in the sharpest form the seed allows: the statement carries no
    // predicate at all, and the `USING` clause still confines it to one row.
    await app.query('begin');

    try {
      await app.query('select app_security.set_user_context($1::uuid)', [
        PHASE_3_SEED_IDS.userPracticeAdmin,
      ]);
      await app.query('select app_security.set_request_context($1::uuid)', [
        PHASE_3_SEED_IDS.practiceDemo,
      ]);

      const result = await app.query('update practice_settings set allow_mpa_approval = true');

      // One row — not the three the table holds.
      expect(result.rowCount).toBe(1);
    } finally {
      await app.query('rollback');
    }
  });
});

describe('forbidden surface (08 §21.7.2)', () => {
  it('given copilot_app when it runs SELECT * then it is denied', async () => {
    await expect(sqlStateOf(app, 'select * from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it.each(FORBIDDEN_COLUMNS)(
    'given copilot_app when it selects %s then it is denied',
    async (column) => {
      await expect(sqlStateOf(app, `select ${column} from practice_settings`)).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it.each(FORBIDDEN_COLUMNS)(
    'given copilot_app when %s appears only in a WHERE predicate then it is denied',
    async (column) => {
      // A column privilege is checked wherever the column is REFERENCED, not only where it is
      // projected. That is the property 02 §20.2b relies on.
      await expect(
        sqlStateOf(app, `select practice_id from practice_settings where ${column} is not null`),
      ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it.each(FORBIDDEN_COLUMNS)(
    'given copilot_app when %s appears only in ORDER BY then it is denied',
    async (column) => {
      await expect(
        sqlStateOf(app, `select practice_id from practice_settings order by ${column}`),
      ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it('given copilot_app when it attempts INSERT then it is denied', async () => {
    // Still denied in phase 4: §20.2b.1 grants NO `INSERT` to any runtime role, and no `INSERT`
    // policy exists. The settings row is created by the trusted seed path (§23.4), never by a
    // request path.
    await expect(
      sqlStateOf(
        app,
        `insert into practice_settings
           (id, practice_id, billing_review_required, require_reason_for_manual_change,
            ai_enabled, axenita_export_enabled, configuration, updated_at)
         values ('00000000-0000-4000-8000-0000000000f1',
                 '${PHASE_3_SEED.practices[0]?.id ?? ''}',
                 true, true, false, false, '{}'::jsonb, now())`,
      ),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_app when it attempts DELETE then it is denied', async () => {
    // Still denied in phase 4: no `DELETE` grant and no `DELETE` policy, because business
    // delete is not permitted (§17.1, §20.2b.1).
    await expect(sqlStateOf(app, 'delete from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_app when it attempts UPDATE on an UNGRANTED column then it is still denied', async () => {
    // D-049 clause 5 required the `UPDATE` grant and the tenant policy that bounds it to be
    // introduced TOGETHER, which `013` does. The grant is bounded to nine columns, so an
    // unbounded write is still impossible.
    await expect(
      sqlStateOf(app, "update practice_settings set configuration = '{}'::jsonb"),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_system when it reads practice_settings then it is denied', async () => {
    // A tenant table; `copilot_system` holds no grant on any tenant table (D-023).
    await expect(sqlStateOf(system, 'select practice_id from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
    await expect(sqlStateOf(system, 'select * from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

describe('THE PHASE 3 CONDITIONAL-SETTINGS READ EXPOSURE IS CLOSED (08 §21.7.4 -> §21.8)', () => {
  /**
   * The phase 3 counterpart of this block asserted a KNOWN, ACCEPTED, DOCUMENTED LIMITATION:
   * `practice_settings` carried no RLS, so the holder of the shared `copilot_app` credential
   * could enumerate the permitted columns for EVERY row and determine row existence and row
   * count with no tenant predicate (D-049 clause 3).
   *
   * `013_rls_policies` closes it. The specs below are converted to the final state and remain
   * the regression contract: the same statements that used to expose everything must now expose
   * nothing without an established tenant context.
   */
  it('given copilot_app WITHOUT tenant context when it enumerates practice_settings then it reads ZERO rows', async () => {
    const rows = await app.query<{ practice_id: string }>(
      'select practice_id from practice_settings order by practice_id',
    );
    const count = await app.query<{ total: string }>(
      'select count(*)::text as total from practice_settings',
    );

    expect(rows.rows).toStrictEqual([]);
    // Row existence and row count are gone too, not merely the column values.
    expect(count.rows[0]?.total).toBe('0');
  });

  it('given an established tenant then the settings of OTHER practices stay invisible', async () => {
    await app.query('begin');

    try {
      await app.query('select app_security.set_user_context($1::uuid)', [
        PHASE_3_SEED_IDS.userPracticeAdmin,
      ]);
      await app.query('select app_security.set_request_context($1::uuid)', [
        PHASE_3_SEED_IDS.practiceDemo,
      ]);

      const rows = await app.query<{ practice_id: string }>(
        'select practice_id from practice_settings order by practice_id',
      );

      expect(rows.rows.map((row) => row.practice_id)).toStrictEqual([
        PHASE_3_SEED_IDS.practiceDemo,
      ]);

      // The practice in which this identity holds NO membership — visible in phase 3, gone now.
      expect(rows.rows.map((row) => row.practice_id)).not.toContain(
        PHASE_3_SEED_IDS.practiceWithoutMembers,
      );
    } finally {
      await app.query('rollback');
    }
  });

  it('given no active membership when set_request_context requests that practice then it is REFUSED', async () => {
    // D-033 clause 11. `practice_settings` uses the strict literal `practice_id =
    // app.practice_id` predicate with NO independent membership subquery, so the tenant boundary
    // the application relies on is the context-establishment path itself: a practice in which the
    // established identity holds no active membership can never become the request context.
    //
    // This proves the accepted application context-establishment path rejects the non-membership
    // practice; it does not claim that a holder of the `copilot_app` database credential cannot
    // call `set_config` directly — `app.practice_id` is a GUC and the context function is not a
    // privilege boundary (§16.2a, D-047 clause 20). No HTTP path lets a caller choose that value.
    await app.query('begin');

    try {
      await app.query('select app_security.set_user_context($1::uuid)', [
        PHASE_3_SEED_IDS.userPracticeAdmin,
      ]);

      // The refusal itself, first: no membership, so no context (D-033 clause 11).
      let refused: string | undefined;
      try {
        await app.query('select app_security.set_request_context($1::uuid)', [
          PHASE_3_SEED_IDS.practiceWithoutMembers,
        ]);
      } catch (error) {
        refused = (error as { code?: string }).code;
      }

      expect(refused).toBe(INSUFFICIENT_PRIVILEGE);
    } finally {
      await app.query('rollback');
    }
  });

  it('given phase 4 when inspected then practice_settings carries EXACTLY the two accepted policies', async () => {
    // 08 §21.7.3 asserted the ABSENCE of a policy in phase 3 so that phase 4 introducing one
    // could not go unnoticed. It did not go unnoticed; the assertion is now the exact set.
    const result = await app.query<{ polname: string; polcmd: string }>(
      `select p.polname, p.polcmd::text as polcmd from pg_policy p
         join pg_class c on c.oid = p.polrelid
        where c.relname = 'practice_settings'
        order by p.polname`,
    );

    expect(result.rows).toStrictEqual([
      { polname: 'practice_settings_select', polcmd: 'r' },
      { polname: 'practice_settings_update', polcmd: 'w' },
    ]);
  });
});

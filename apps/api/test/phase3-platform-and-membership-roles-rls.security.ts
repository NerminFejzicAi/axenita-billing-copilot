import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS } from '../prisma/seed.js';
import {
  INSUFFICIENT_PRIVILEGE,
  connect,
  securityDatabase,
  sqlStateOf,
  withAppContext,
} from './support/phase3-security-context.js';

/**
 * D-051 — `platform_role_assignments` (02 §17.2) and `practice_membership_roles` (02 §17.4)
 * already carry their RLS in phase 3 (08 §21.6.3, §21.6.4).
 *
 * D-051 moved COMPLETE, already accepted artifacts from `013_rls_policies` into package
 * `002_identity_and_practices`. Only package ownership moved: names and bodies are identical.
 * Both patterns are bootstrap-safe by construction because they depend exclusively on
 * `app.user_id`, which phase 3 already establishes through `set_user_context`.
 */
const database = securityDatabase();

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

async function visiblePlatformRoles(context: {
  userId?: string;
  practiceId?: string;
}): Promise<{ id: string; user_id: string; revoked: boolean }[]> {
  return withAppContext(app, context, async (client) => {
    const result = await client.query<{ id: string; user_id: string; revoked: boolean }>(
      'select id, user_id, (revoked_at is not null) as revoked from platform_role_assignments order by id',
    );
    return result.rows;
  });
}

async function visibleMembershipRoles(context: {
  userId?: string;
  practiceId?: string;
}): Promise<{ practice_id: string; membership_id: string; role: string }[]> {
  return withAppContext(app, context, async (client) => {
    const result = await client.query<{
      practice_id: string;
      membership_id: string;
      role: string;
    }>(
      'select practice_id, membership_id, role from practice_membership_roles order by practice_id, role',
    );
    return result.rows;
  });
}

/**
 * Runs `sql` as `copilot_app` with the practice admin's user context and returns the
 * SQLSTATE, or `undefined` on success. It cannot reuse `sqlStateOf`, which opens its own
 * transaction: the context must be established inside the SAME transaction as the statement.
 */
async function sqlStateInUserContext(sql: string): Promise<string | undefined> {
  await app.query('begin');
  try {
    await app.query('select app_security.set_user_context($1::uuid)', [
      PHASE_3_SEED_IDS.userPracticeAdmin,
    ]);
    await app.query(sql);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await app.query('rollback');
  }
}

describe('platform_role_assignments — user-scoped RLS (02 §17.2, 08 §21.6.3)', () => {
  it('given no app.user_id then zero rows are visible', async () => {
    await expect(visiblePlatformRoles({})).resolves.toStrictEqual([]);
  });

  it('given user A then only user A assignments are visible', async () => {
    const rows = await visiblePlatformRoles({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PHASE_3_SEED_IDS.platformRoleActive);
    expect(rows[0]?.revoked).toBe(false);
  });

  it('given user B then user A assignments are invisible', async () => {
    const rows = await visiblePlatformRoles({ userId: PHASE_3_SEED_IDS.userPhysician });

    expect(rows).toStrictEqual([]);
  });

  it('given a user whose only assignment is REVOKED then the raw policy still returns it', async () => {
    // The §17.2 policy is user-scoped and deliberately does NOT filter `revoked_at`.
    // `platformRoles[]` in `GET /me` is derived from `revoked_at IS NULL` rows in the
    // APPLICATION (D-051 clause 3). That application step is phase 3 scope and is not
    // implemented in this gate; this spec pins the database half so the filter cannot later
    // be assumed to happen here.
    const rows = await visiblePlatformRoles({ userId: PHASE_3_SEED_IDS.userInactive });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PHASE_3_SEED_IDS.platformRoleRevoked);
    expect(rows[0]?.revoked).toBe(true);
  });

  it('given app.practice_id set or unset then the result is identical', async () => {
    // The policy uses neither `app.practice_id` nor `set_request_context`, which is why it
    // works in phase 3 at all (D-051 clause 1).
    const without = await visiblePlatformRoles({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });
    const withContext = await visiblePlatformRoles({
      userId: PHASE_3_SEED_IDS.userPracticeAdmin,
      practiceId: PHASE_3_SEED_IDS.practiceWithoutMembers,
    });

    expect(withContext).toStrictEqual(without);
  });

  it('given copilot_system then every row is visible', async () => {
    const result = await system.query<{ id: string }>(
      'select id from platform_role_assignments order by id',
    );

    expect(result.rows.map((row) => row.id)).toStrictEqual([
      PHASE_3_SEED_IDS.platformRoleActive,
      PHASE_3_SEED_IDS.platformRoleRevoked,
    ]);
  });

  it.each([
    ['copilot_app', (): Client => app],
    ['copilot_system', (): Client => system],
  ])('given %s then no write privilege exists', async (_role, clientOf) => {
    const client = clientOf();

    for (const statement of [
      `insert into platform_role_assignments (id, user_id, platform_role)
       values ('00000000-0000-4000-8000-0000000000d1', '${PHASE_3_SEED_IDS.userPhysician}', 'SYSTEM_ADMIN')`,
      'update platform_role_assignments set revoked_at = null',
      'delete from platform_role_assignments',
    ]) {
      await expect(sqlStateOf(client, statement)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    }
  });

  it('given D-023 clause 11 then copilot_app has no unrestricted SELECT — the invariant holds from phase 3', async () => {
    const unrestricted = await visiblePlatformRoles({});
    const scoped = await visiblePlatformRoles({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });

    expect(unrestricted).toHaveLength(0);
    expect(scoped).toHaveLength(1);
  });
});

describe('practice_membership_roles — self-scoped RLS (02 §17.4, 08 §21.6.4)', () => {
  it('given no app.user_id then zero rows are visible', async () => {
    await expect(visibleMembershipRoles({})).resolves.toStrictEqual([]);
  });

  it('given user A then only roles of memberships owned by user A are visible', async () => {
    const rows = await visibleMembershipRoles({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });

    expect(rows).toStrictEqual([
      // `order by role` is enum ORDER, i.e. the declaration order of 02 §4.1, not alphabetical.
      {
        practice_id: PHASE_3_SEED_IDS.practiceDemo,
        membership_id: PHASE_3_SEED_IDS.membershipAdminInDemo,
        role: 'PRACTICE_ADMIN',
      },
      {
        practice_id: PHASE_3_SEED_IDS.practiceDemo,
        membership_id: PHASE_3_SEED_IDS.membershipAdminInDemo,
        role: 'PHYSICIAN',
      },
      {
        practice_id: PHASE_3_SEED_IDS.practiceNord,
        membership_id: PHASE_3_SEED_IDS.membershipAdminInNord,
        role: 'READ_ONLY',
      },
    ]);
  });

  it('given a user whose ACTIVE membership carries ZERO roles then zero rows are visible', async () => {
    // The seed row 04 §5.3 clause 3 and 02 §23.2 require: an active membership with no role
    // at all. A permission resolver that assumes at least one role would be wrong.
    const rows = await visibleMembershipRoles({ userId: PHASE_3_SEED_IDS.userPhysician });

    expect(rows).toStrictEqual([]);
  });

  it('given user A when another user holds a role in the SAME practice then it does not leak', async () => {
    // The sharpest §17.4 assertion: the practice admin IS a member of `demo-praxis`, and the
    // inactive user's `MPA` row also lives in `demo-praxis`. The policy compares BOTH
    // `practice_id` and `membership_id`, so shared practice membership grants nothing.
    const rows = await withAppContext(
      app,
      { userId: PHASE_3_SEED_IDS.userPracticeAdmin },
      async (client) => {
        const result = await client.query<{ id: string }>(
          `select id from practice_membership_roles where role = 'MPA'`,
        );
        return result.rows;
      },
    );

    expect(rows).toStrictEqual([]);
  });

  it('given the other user then only their own role row is visible', async () => {
    const rows = await visibleMembershipRoles({ userId: PHASE_3_SEED_IDS.userInactive });

    expect(rows).toStrictEqual([
      {
        practice_id: PHASE_3_SEED_IDS.practiceDemo,
        membership_id: PHASE_3_SEED_IDS.membershipInactiveUserInDemo,
        role: 'MPA',
      },
    ]);
  });

  it('given phase 3 when the policy is exercised then practice_memberships still carries NO RLS', async () => {
    // The key assertion of D-051 clause 4: the policy does NOT require §17.3 RLS to work. It
    // relies on the EXISTENCE of the owning membership row, not on that table having a policy.
    const state = await migrator.query<{ enabled: boolean; forced: boolean }>(
      `select relrowsecurity as enabled, relforcerowsecurity as forced
         from pg_class where relname = 'practice_memberships'`,
    );

    expect(state.rows[0]).toStrictEqual({ enabled: false, forced: false });

    const rows = await visibleMembershipRoles({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });
    expect(rows).toHaveLength(3);
  });

  it('given copilot_app then no write privilege on practice_membership_roles exists', async () => {
    for (const statement of [
      `insert into practice_membership_roles (id, practice_id, membership_id, role, updated_at)
       values ('00000000-0000-4000-8000-0000000000d2', '${PHASE_3_SEED_IDS.practiceDemo}',
               '${PHASE_3_SEED_IDS.membershipAdminInDemo}', 'AUDITOR', now())`,
      `update practice_membership_roles set role = 'AUDITOR'`,
      'delete from practice_membership_roles',
    ]) {
      await expect(sqlStateOf(app, statement)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    }
  });
});

describe('phase 3 intermediate state on practice_memberships (08 §21.5.6)', () => {
  it('given phase 3 when copilot_app reads practice_memberships then it sees GENERIC rows, which is EXPECTED and DOCUMENTED', async () => {
    // This asserts a KNOWN, ACCEPTED intermediate state and is NOT a pass for tenant
    // isolation. §17.3 RLS for this table belongs to `013_rls_policies` and phase 4
    // (D-051 clause 5). Phase 4 must close it, and 08 §21.5.6 requires a regression test
    // there proving the same query then returns only the caller's own rows.
    const rows = await withAppContext(
      app,
      { userId: PHASE_3_SEED_IDS.userPhysician },
      async (client) => {
        const result = await client.query<{ id: string }>('select id from practice_memberships');
        return result.rows;
      },
    );

    // Four seeded memberships, including three that belong to other users.
    expect(rows).toHaveLength(4);
  });
});

describe('the supporting SELECT grant on practice_memberships (02 §17.4, §17.6, §20.2a; 08 §21.5.5, §21.6.4)', () => {
  it('given a transactional REVOKE then the grant is gone inside the transaction and restored by ROLLBACK', async () => {
    // The transactional half of the invariant. A catalogue change is invisible to other
    // sessions until COMMIT, so the SQLSTATE 42501 that a revoke causes cannot be observed
    // from a second connection while the transaction is still open — hence two specs.
    await migrator.query('begin');
    try {
      await migrator.query('revoke select on practice_memberships from copilot_app');

      const inside = await migrator.query<{ granted: boolean }>(
        `select has_table_privilege('copilot_app', 'practice_memberships', 'SELECT') as granted`,
      );
      expect(inside.rows[0]?.granted).toBe(false);
    } finally {
      await migrator.query('rollback');
    }

    const after = await migrator.query<{ granted: boolean }>(
      `select has_table_privilege('copilot_app', 'practice_memberships', 'SELECT') as granted`,
    );
    expect(after.rows[0]?.granted).toBe(true);
  });

  it('given a COMMITTED revoke then both dependent policies fail with 42501, and restoring the grant repairs them', async () => {
    // Runs only against the disposable database this suite created and drops. It is the
    // invariant test 08 §21.5.5 and §21.6.4 demand: narrowing this grant silently breaks the
    // `practices` and `practice_membership_roles` policies.
    await migrator.query('revoke select on practice_memberships from copilot_app');

    try {
      await expect(sqlStateInUserContext('select id from practice_membership_roles')).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      await expect(sqlStateInUserContext('select id from practices')).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    } finally {
      await migrator.query('grant select on practice_memberships to copilot_app');
    }

    const restored = await migrator.query<{ granted: boolean }>(
      `select has_table_privilege('copilot_app', 'practice_memberships', 'SELECT') as granted`,
    );
    expect(restored.rows[0]?.granted).toBe(true);

    await expect(
      visibleMembershipRoles({ userId: PHASE_3_SEED_IDS.userPracticeAdmin }),
    ).resolves.toHaveLength(3);
  });
});

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, PHASE_3_SEED_SUBJECTS } from '../prisma/seed.js';
import {
  INSUFFICIENT_PRIVILEGE,
  connect,
  securityDatabase,
  sqlStateOf,
  withAppContext,
} from './support/phase3-security-context.js';

/**
 * D-047 — the `users` and `practices` access model (02 §17.5, §17.6, §20.2a, §25.1.1;
 * 08 §21.5).
 *
 * Every assertion here traces to an explicit clause of D-047 or of 02 §17.5/§17.6/§20.2a.
 * 08 §21.5 is explicit that a test which invents an access model outside those sources is
 * itself a defect, so nothing below asserts behaviour the documents do not state.
 */
const database = securityDatabase();

let app: Client;
let system: Client;

beforeAll(async () => {
  [app, system] = await Promise.all([connect(database.app), connect(database.system)]);
});

afterAll(async () => {
  await Promise.all([app.end(), system.end()]);
});

async function visibleUsers(context: {
  authSubject?: string;
  userId?: string;
}): Promise<{ id: string; display_name: string }[]> {
  return withAppContext(app, context, async (client) => {
    const result = await client.query<{ id: string; display_name: string }>(
      'select id, display_name from users order by id',
    );
    return result.rows;
  });
}

async function visiblePractices(context: {
  userId?: string;
  practiceId?: string;
}): Promise<{ id: string; code: string }[]> {
  return withAppContext(app, context, async (client) => {
    const result = await client.query<{ id: string; code: string }>(
      'select id, code from practices order by code',
    );
    return result.rows;
  });
}

describe('users — identity bootstrap (02 §17.5, 08 §21.5.2)', () => {
  it('given no context at all when users is read then zero rows are visible', async () => {
    await expect(visibleUsers({})).resolves.toStrictEqual([]);
  });

  it('given a verified subject and no app.user_id when users is read then exactly one row is visible', async () => {
    const rows = await visibleUsers({ authSubject: PHASE_3_SEED_SUBJECTS.practiceAdmin });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PHASE_3_SEED_IDS.userPracticeAdmin);
  });

  it('given an unknown subject when users is read then zero rows are visible', async () => {
    await expect(visibleUsers({ authSubject: 'dev|nobody' })).resolves.toStrictEqual([]);
  });

  it('given MISMATCHED contexts when users is read then exactly ONE row is visible, and it is the app.user_id row', async () => {
    // THE regression test for the mandatory `app.user_id IS NULL` guard (D-047 clauses 3-4,
    // 02 §25.1.1). Permissive policies combine with OR and `set_user_context` does not clear
    // `app.auth_subject`; without the guard, TWO rows were empirically visible at once.
    const rows = await withAppContext(
      app,
      { authSubject: PHASE_3_SEED_SUBJECTS.practiceAdmin },
      async (client) => {
        await client.query('select set_config($1, $2, true)', [
          'app.user_id',
          PHASE_3_SEED_IDS.userPhysician,
        ]);
        const result = await client.query<{ id: string }>('select id from users order by id');
        return result.rows;
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PHASE_3_SEED_IDS.userPhysician);
  });

  it('given a stale app.auth_subject after set_user_context when users is read then only the self row is visible', async () => {
    const rows = await visibleUsers({
      authSubject: PHASE_3_SEED_SUBJECTS.practiceAdmin,
      userId: PHASE_3_SEED_IDS.userPracticeAdmin,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PHASE_3_SEED_IDS.userPracticeAdmin);
  });

  it("given user A's context when it asks explicitly for user B then zero rows are visible", async () => {
    // Reading another user's row is DENY / NOT IMPLEMENTED in v1, and the gate
    // `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` must not be silently bypassed
    // (D-047 clause 12, 13 §19). There is deliberately no third `users` policy.
    const rows = await withAppContext(
      app,
      { userId: PHASE_3_SEED_IDS.userPracticeAdmin },
      async (client) => {
        const result = await client.query<{ id: string }>('select id from users where id = $1', [
          PHASE_3_SEED_IDS.userPhysician,
        ]);
        return result.rows;
      },
    );

    expect(rows).toStrictEqual([]);
  });

  it('given a non-ACTIVE user when it bootstraps then the database still returns its row, because status is an application decision', async () => {
    // 02 §17.5 defines the two `users` policies as subject-scoped and self-scoped. Neither
    // filters `status`, so rejecting a non-`ACTIVE` user is the application boundary of
    // 08 §21.5.2 — a `403 ACCESS_DENIED` BEFORE `set_user_context`. This spec asserts the
    // database-side half of that contract and the seed row it will be written against; the
    // identity module itself is not implemented in this gate.
    const rows = await withAppContext(
      app,
      { authSubject: PHASE_3_SEED_SUBJECTS.inactive },
      async (client) => {
        const result = await client.query<{ id: string; status: string }>(
          'select id, status from users',
        );
        return result.rows;
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PHASE_3_SEED_IDS.userInactive);
    expect(rows[0]?.status).toBe('INACTIVE');
  });
});

describe('users — forbidden surface (02 §20.2a, 08 §21.5.2)', () => {
  it.each(['auth_subject', 'last_login_at', 'created_at', 'updated_at'])(
    'given copilot_app when it selects %s then it is denied',
    async (column) => {
      await expect(sqlStateOf(app, `select ${column} from users`)).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it('given copilot_app when it runs SELECT * on users then it is denied', async () => {
    await expect(sqlStateOf(app, 'select * from users')).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_app when auth_subject appears only in a WHERE predicate then it is denied', async () => {
    // The policy may reference `auth_subject` because PostgreSQL evaluates a policy as part
    // of the table's security definition, not as part of the caller's projection. The
    // application must therefore never name it (02 §20.2a).
    await expect(
      sqlStateOf(app, `select id from users where auth_subject = 'dev|physician'`),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it.each([
    [
      'INSERT',
      `insert into users (id, auth_subject, email, display_name, preferred_language, status, updated_at)
       values ('00000000-0000-4000-8000-0000000000e1', 'x', 'x@example.invalid', 'x', 'de-CH', 'ACTIVE', now())`,
    ],
    ['UPDATE', `update users set display_name = 'changed'`],
    ['DELETE', 'delete from users'],
  ])('given copilot_app when it attempts %s on users then it is denied', async (_label, sql) => {
    await expect(sqlStateOf(app, sql)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_system when it reads users then it is denied', async () => {
    await expect(sqlStateOf(system, 'select id from users')).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('context functions reject an empty identity (02 §16.2.2, §16.2.4)', () => {
  it.each([
    ['set_auth_subject_context(null)', 'select app_security.set_auth_subject_context(null)'],
    ["set_auth_subject_context('')", "select app_security.set_auth_subject_context('')"],
    ['set_user_context(null)', 'select app_security.set_user_context(null)'],
  ])('given %s then it raises 42501', async (_label, sql) => {
    await expect(sqlStateOf(app, sql)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('practices — membership visibility (02 §17.6, 08 §21.5.3)', () => {
  it('given no app.user_id when practices is read then zero rows are visible', async () => {
    await expect(visiblePractices({})).resolves.toStrictEqual([]);
  });

  it('given a user before practice context then every practice of their membership set is visible', async () => {
    const rows = await visiblePractices({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });

    expect(rows.map((row) => row.id)).toStrictEqual([
      PHASE_3_SEED_IDS.practiceDemo,
      PHASE_3_SEED_IDS.practiceNord,
    ]);
  });

  it('given a membership that is INACTIVE then its practice is still visible', async () => {
    // 02 §17.6 deliberately does NOT filter `pm.active`: a frozen `GET /me` requires an
    // inactive membership to still show its `practiceName`. RLS governs visibility of one's
    // own rows here, not authorisation.
    const rows = await visiblePractices({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });

    expect(rows.map((row) => row.id)).toContain(PHASE_3_SEED_IDS.practiceNord);
  });

  it('given another user then only their own membership set is visible', async () => {
    const rows = await visiblePractices({ userId: PHASE_3_SEED_IDS.userPhysician });

    expect(rows.map((row) => row.id)).toStrictEqual([PHASE_3_SEED_IDS.practiceNord]);
  });

  it('given a practice in which the user has no membership then it is invisible even when asked for explicitly', async () => {
    const rows = await withAppContext(
      app,
      { userId: PHASE_3_SEED_IDS.userPhysician },
      async (client) => {
        const result = await client.query<{ id: string }>(
          'select id from practices where id = $1',
          [PHASE_3_SEED_IDS.practiceDemo],
        );
        return result.rows;
      },
    );

    expect(rows).toStrictEqual([]);
  });
});

describe('practices — RESTRICTIVE context narrowing (02 §17.6, 08 §21.5.3, §21.5.4)', () => {
  it('given app.practice_id when practices is read WITHOUT a WHERE clause then exactly one row is visible', async () => {
    // Protection against a forgotten filter: the narrowing must not depend on the query.
    const rows = await visiblePractices({
      userId: PHASE_3_SEED_IDS.userPracticeAdmin,
      practiceId: PHASE_3_SEED_IDS.practiceDemo,
    });

    expect(rows.map((row) => row.id)).toStrictEqual([PHASE_3_SEED_IDS.practiceDemo]);
  });

  it('given app.practice_id when another practice of the SAME membership set is asked for then zero rows are visible', async () => {
    const rows = await withAppContext(
      app,
      {
        userId: PHASE_3_SEED_IDS.userPracticeAdmin,
        practiceId: PHASE_3_SEED_IDS.practiceNord,
      },
      async (client) => {
        const result = await client.query<{ id: string }>(
          'select id from practices where id = $1',
          [PHASE_3_SEED_IDS.practiceDemo],
        );
        return result.rows;
      },
    );

    expect(rows).toStrictEqual([]);
  });

  it('given a PLANTED app.practice_id for a practice without membership then zero rows are visible', async () => {
    // The RESTRICTIVE policy can only ever narrow. It can never broaden, so setting the GUC
    // to a practice the caller has no membership in yields nothing rather than everything.
    const rows = await visiblePractices({
      userId: PHASE_3_SEED_IDS.userPracticeAdmin,
      practiceId: PHASE_3_SEED_IDS.practiceWithoutMembers,
    });

    expect(rows).toStrictEqual([]);
  });

  it('given an UNSET app.practice_id then the narrowing policy does not block membership visibility', async () => {
    const withoutContext = await visiblePractices({ userId: PHASE_3_SEED_IDS.userPracticeAdmin });

    expect(withoutContext).toHaveLength(2);
  });
});

describe('practices — forbidden surface (02 §20.2a, 08 §21.5.3)', () => {
  it.each(['legal_name', 'zsr_number', 'gln_number'])(
    'given copilot_app when it selects %s then it is denied',
    async (column) => {
      await expect(sqlStateOf(app, `select ${column} from practices`)).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it('given copilot_app when it runs SELECT * on practices then it is denied', async () => {
    await expect(sqlStateOf(app, 'select * from practices')).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it.each([
    [
      'INSERT',
      `insert into practices (id, code, name, status, updated_at)
       values ('00000000-0000-4000-8000-0000000000e2', 'x', 'x', 'ACTIVE', now())`,
    ],
    ['UPDATE', `update practices set name = 'changed'`],
    ['DELETE', 'delete from practices'],
  ])(
    'given copilot_app when it attempts %s on practices then it is denied',
    async (_label, sql) => {
      await expect(sqlStateOf(app, sql)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it('given copilot_system when it reads practices then it is denied', async () => {
    await expect(sqlStateOf(system, 'select id from practices')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

describe('compromised credential — the accepted limitation (08 §21.5.8)', () => {
  it('given the shared copilot_app credential when the holder sets app.* themselves then they read that identity, which is a KNOWN limitation', async () => {
    // This asserts an ACCEPTED LIMITATION and must never be read as proof of authentication.
    // The database does NOT independently authenticate the end user: `app.*` are ordinary
    // custom GUCs and any role may set them, with or without the two context functions
    // (02 §16.2a, D-047 clause 20). The controls that survive a stolen credential are the
    // column grants, the absence of write grants, the absence of ownership and NOBYPASSRLS.
    const rows = await withAppContext(app, {}, async (client) => {
      await client.query('select set_config($1, $2, true)', [
        'app.user_id',
        PHASE_3_SEED_IDS.userPhysician,
      ]);
      const result = await client.query<{ id: string }>('select id from users');
      return result.rows;
    });

    expect(rows.map((row) => row.id)).toStrictEqual([PHASE_3_SEED_IDS.userPhysician]);
  });

  it('given that same holder when they reach for a column grant then it still holds', async () => {
    for (const statement of [
      'select auth_subject from users',
      'select zsr_number from practices',
      'select gln_number from practices',
      'select legal_name from practices',
      'select last_login_at from users',
    ]) {
      await expect(sqlStateOf(app, statement)).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    }
  });
});

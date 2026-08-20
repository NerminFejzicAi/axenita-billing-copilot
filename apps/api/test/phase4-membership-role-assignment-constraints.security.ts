import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, runInForceRlsMaintenanceWindow } from '../prisma/seed.js';
import {
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
  connect,
  securityDatabase,
  withAppContext,
} from './support/phase3-security-context.js';

/**
 * D-038 — the DATABASE half of tenant role assignment (02 §22.2; 04 §5.2, §5.3; 08 §21.6.4).
 *
 * `practice_membership_roles` is the only place a tenant role is assigned, and it carries two
 * invariants that no application layer is allowed to be the sole guardian of:
 *
 *   * `practice_membership_roles_membership_role_key` — UNIQUE (practice_id, membership_id,
 *     role): the same role is never assigned twice to the same membership (D-038 clause 5);
 *   * `practice_membership_roles_membership_fk` — FOREIGN KEY (practice_id, membership_id)
 *     REFERENCES practice_memberships(practice_id, id): a role row whose `practice_id` does
 *     not match the owning membership's practice has no parent to reference (02 §2.5).
 *
 * The unique index is deliberately NON-PARTIAL, which is the other half of the contract:
 * removing a role DELETES the row and therefore FREES the triple, so the same role can be
 * assigned again afterwards (D-038 clauses 25-32).
 *
 * These specs ATTEMPT the violating writes and assert the SQLSTATE PostgreSQL reports. A
 * catalogue read of `pg_constraint` would pass against a constraint that exists but does not
 * bite; only a real INSERT proves the invariant is enforced.
 *
 * WHY THE MAINTENANCE WINDOW
 *
 * `practice_membership_roles` carries `FORCE ROW LEVEL SECURITY`, and no accepted policy
 * permits a write — not even for the table owner (02 §23.4, D-048). The ONLY permitted way to
 * execute trusted DML against it is `runInForceRlsMaintenanceWindow`, so that is what these
 * specs use. Reaching the constraint at all requires it: `copilot_app` holds SELECT only and
 * would be rejected with 42501 long before the constraint is consulted, which would mask the
 * very invariant under test.
 */
const database = securityDatabase();

let app: Client;
let migrator: Client;

/**
 * Probe identifiers this suite writes and removes again inside the same window, so no spec
 * depends on another spec's leftovers and the committed state stays byte-identical to the seed.
 */
const PROBE_ROLE_ID = '00000000-0000-4000-8000-0000000000e1';
const PROBE_REASSIGNED_ROLE_ID = '00000000-0000-4000-8000-0000000000e2';

/** The role used by every probe. No seeded membership holds it, so a clash cannot be accidental. */
const PROBE_ROLE = 'AUDITOR';

const INSERT_ASSIGNMENT = `
  insert into practice_membership_roles (id, practice_id, membership_id, role, created_at, updated_at)
  values ($1, $2, $3, $4::membership_role, now(), now())`;

beforeAll(async () => {
  [app, migrator] = await Promise.all([connect(database.app), connect(database.migration)]);
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end()]);
});

interface DatabaseRejection {
  readonly sqlState?: string;
  readonly constraint?: string;
}

/**
 * Executes `statement` inside a SAVEPOINT that is ALWAYS rolled back, and reports what
 * PostgreSQL raised — or an empty rejection when the statement was accepted.
 *
 * Same discipline as `sqlStateOf` in the shared context, one level down: a negative constraint
 * test asserts the exact SQLSTATE, never merely "it threw". The savepoint is what lets a
 * failed statement be observed WITHOUT poisoning the surrounding maintenance window, whose
 * closing `FORCE ROW LEVEL SECURITY` and restore assertion must still run.
 *
 * The rollback is unconditional on purpose: if a violating write were ever ACCEPTED, this must
 * not silently leave the row behind for the next spec to trip over.
 */
async function rejectionOf(
  client: Client,
  statement: string,
  parameters: readonly unknown[],
): Promise<DatabaseRejection> {
  await client.query('savepoint constraint_probe');

  try {
    await client.query(statement, [...parameters]);
    return {};
  } catch (error) {
    return {
      sqlState: (error as { code?: string }).code,
      constraint: (error as { constraint?: string }).constraint,
    };
  } finally {
    await client.query('rollback to savepoint constraint_probe');
    await client.query('release savepoint constraint_probe');
  }
}

/** Counts the role rows matching one logical assignment. Runs INSIDE a window, as the owner. */
async function assignmentCount(
  client: Client,
  practiceId: string,
  membershipId: string,
  role: string,
): Promise<number> {
  const result = await client.query<{ total: string }>(
    `select count(*)::text as total from practice_membership_roles
      where practice_id = $1 and membership_id = $2 and role = $3::membership_role`,
    [practiceId, membershipId, role],
  );

  return Number(result.rows[0]?.total ?? '-1');
}

describe('duplicate role assignment is rejected by the database (02 §22.2, D-038 clause 5; 05 R347)', () => {
  it('given a membership that ALREADY holds a role when the same role is assigned again then the write is rejected with 23505', async () => {
    let precondition = -1;
    let rejection: DatabaseRejection = {};

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        // The window is what makes the row visible to its own owner at all: outside it, FORCE
        // filters the owner too, and this count would read 0 for the wrong reason.
        precondition = await assignmentCount(
          client,
          PHASE_3_SEED_IDS.practiceDemo,
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          'PRACTICE_ADMIN',
        );

        // A DIFFERENT surrogate id carrying the SAME logical tuple. The primary key cannot be
        // what rejects this; only the (practice_id, membership_id, role) uniqueness can.
        rejection = await rejectionOf(client, INSERT_ASSIGNMENT, [
          PROBE_ROLE_ID,
          PHASE_3_SEED_IDS.practiceDemo,
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          'PRACTICE_ADMIN',
        ]);
      },
    );

    expect(precondition).toBe(1);
    expect(rejection.sqlState).toBe(UNIQUE_VIOLATION);
    expect(rejection.constraint).toBe('practice_membership_roles_membership_role_key');
  });

  it('given the SECOND role of a multi-role membership then it is rejected the same way', async () => {
    // `membershipAdminInDemo` holds PRACTICE_ADMIN *and* PHYSICIAN (04 §5.3). The uniqueness is
    // per TRIPLE, not per membership, so the second role must duplicate exactly as the first
    // does — and the multi-role membership itself must remain legal.
    let rejection: DatabaseRejection = {};

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        rejection = await rejectionOf(client, INSERT_ASSIGNMENT, [
          PROBE_ROLE_ID,
          PHASE_3_SEED_IDS.practiceDemo,
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          'PHYSICIAN',
        ]);
      },
    );

    expect(rejection.sqlState).toBe(UNIQUE_VIOLATION);
    expect(rejection.constraint).toBe('practice_membership_roles_membership_role_key');
  });

  it('given a DIFFERENT role for the same membership then it is ACCEPTED — the rejection is about the triple, not the membership', async () => {
    // The control. Without it, a table that refused every insert would pass the two specs
    // above and prove nothing about the constraint actually under test.
    let rejection: DatabaseRejection = { sqlState: 'not-run' };

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        rejection = await rejectionOf(client, INSERT_ASSIGNMENT, [
          PROBE_ROLE_ID,
          PHASE_3_SEED_IDS.practiceDemo,
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          PROBE_ROLE,
        ]);
      },
    );

    expect(rejection).toStrictEqual({});
  });
});

describe('cross-practice role assignment is rejected by the composite FK (02 §2.5, §22.2, D-038; 05 R348)', () => {
  it('given a membership of practice A then the FK parent it needs under practice B does not exist', async () => {
    // The documented precondition of the negative below, read through the accepted runtime
    // path: `practice_memberships` is keyed UNIQUE (practice_id, id), and this membership's
    // one row names practice A — so the pair (practice B, this membership) cannot exist.
    const rows = await withAppContext(
      app,
      { userId: PHASE_3_SEED_IDS.userPracticeAdmin },
      async (client) => {
        const result = await client.query<{ practice_id: string }>(
          'select practice_id from practice_memberships where id = $1',
          [PHASE_3_SEED_IDS.membershipAdminInDemo],
        );
        return result.rows;
      },
    );

    expect(rows).toStrictEqual([{ practice_id: PHASE_3_SEED_IDS.practiceDemo }]);
    expect(rows[0]?.practice_id).not.toBe(PHASE_3_SEED_IDS.practiceNord);
  });

  it('given a membership of practice A when a role is assigned to it under practice B then the write is rejected with 23503', async () => {
    let rejection: DatabaseRejection = {};

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        // Practice B + a membership that lives in practice A. The tuple is unique, so 23505
        // cannot fire here and the composite FK is the only thing left to reject it.
        rejection = await rejectionOf(client, INSERT_ASSIGNMENT, [
          PROBE_ROLE_ID,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          PROBE_ROLE,
        ]);
      },
    );

    // NOT 42501: the window runs as the trusted maintenance identity precisely so an earlier
    // privilege or RLS rejection cannot stand in for the constraint under test.
    expect(rejection.sqlState).toBe(FOREIGN_KEY_VIOLATION);
    expect(rejection.constraint).toBe('practice_membership_roles_membership_fk');
  });

  it('given a practice that has no members at all then every membership is rejected under it', async () => {
    // `practiceWithoutMembers` is the isolation negative of 02 §25.1.1: no membership row
    // names it, so no role row may either, whichever membership is offered.
    const rejections: DatabaseRejection[] = [];

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        for (const membershipId of [
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PHASE_3_SEED_IDS.membershipInactiveUserInDemo,
        ]) {
          rejections.push(
            await rejectionOf(client, INSERT_ASSIGNMENT, [
              PROBE_ROLE_ID,
              PHASE_3_SEED_IDS.practiceWithoutMembers,
              membershipId,
              PROBE_ROLE,
            ]),
          );
        }
      },
    );

    expect(rejections).toHaveLength(3);
    for (const rejection of rejections) {
      expect(rejection.sqlState).toBe(FOREIGN_KEY_VIOLATION);
      expect(rejection.constraint).toBe('practice_membership_roles_membership_fk');
    }
  });

  it('given the SAME membership under its OWN practice then it is ACCEPTED — the rejection is about the practice, not the membership', async () => {
    // The control that makes the negative above meaningful: only `practice_id` differs.
    let rejection: DatabaseRejection = { sqlState: 'not-run' };

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        rejection = await rejectionOf(client, INSERT_ASSIGNMENT, [
          PROBE_ROLE_ID,
          PHASE_3_SEED_IDS.practiceDemo,
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          PROBE_ROLE,
        ]);
      },
    );

    expect(rejection).toStrictEqual({});
  });
});

describe('removing a role frees the uniqueness slot (D-038 clauses 25-32; 05 R369)', () => {
  it('given an assignment when it is DELETED then the SAME role can be assigned again', async () => {
    // The lifecycle the NON-PARTIAL unique index exists to permit, executed as real DML:
    // INSERT -> present -> DELETE -> absent -> INSERT the same triple -> present again.
    // A soft-delete or partial-unique design would fail at the final INSERT with 23505.
    let afterInsert = -1;
    let afterDelete = -1;
    let afterReassign = -1;
    let reassignedId: string | undefined;
    let reassignRejection: DatabaseRejection = { sqlState: 'not-run' };

    await runInForceRlsMaintenanceWindow(
      migrator,
      'practice_membership_roles',
      async (client) => {
        // `membershipPhysicianInNord` is ACTIVE and carries ZERO roles (04 §5.3 clause 3), so
        // the slot under test starts demonstrably empty.
        expect(
          await assignmentCount(
            client,
            PHASE_3_SEED_IDS.practiceNord,
            PHASE_3_SEED_IDS.membershipPhysicianInNord,
            PROBE_ROLE,
          ),
        ).toBe(0);

        await client.query(INSERT_ASSIGNMENT, [
          PROBE_ROLE_ID,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PROBE_ROLE,
        ]);

        afterInsert = await assignmentCount(
          client,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PROBE_ROLE,
        );

        await client.query('delete from practice_membership_roles where id = $1', [PROBE_ROLE_ID]);

        afterDelete = await assignmentCount(
          client,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PROBE_ROLE,
        );

        // Re-assigned under a DIFFERENT surrogate id: what has to be free again is the
        // (practice_id, membership_id, role) triple, not the primary key that happened to
        // carry it before.
        reassignRejection = await rejectionOf(client, INSERT_ASSIGNMENT, [
          PROBE_REASSIGNED_ROLE_ID,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PROBE_ROLE,
        ]);

        // `rejectionOf` rolled its savepoint back, so the row is re-applied here to be
        // observed, and removed again below.
        await client.query(INSERT_ASSIGNMENT, [
          PROBE_REASSIGNED_ROLE_ID,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PROBE_ROLE,
        ]);

        afterReassign = await assignmentCount(
          client,
          PHASE_3_SEED_IDS.practiceNord,
          PHASE_3_SEED_IDS.membershipPhysicianInNord,
          PROBE_ROLE,
        );

        const surviving = await client.query<{ id: string }>(
          `select id from practice_membership_roles
            where practice_id = $1 and membership_id = $2 and role = $3::membership_role`,
          [
            PHASE_3_SEED_IDS.practiceNord,
            PHASE_3_SEED_IDS.membershipPhysicianInNord,
            PROBE_ROLE,
          ],
        );
        reassignedId = surviving.rows[0]?.id;

        // The probe leaves no trace: the committed state must equal the seeded state.
        await client.query('delete from practice_membership_roles where id = any($1::uuid[])', [
          [PROBE_ROLE_ID, PROBE_REASSIGNED_ROLE_ID],
        ]);
      },
    );

    expect(afterInsert).toBe(1);
    expect(afterDelete).toBe(0);
    expect(reassignRejection).toStrictEqual({});
    expect(afterReassign).toBe(1);
    expect(reassignedId).toBe(PROBE_REASSIGNED_ROLE_ID);
  });

  it('given the completed lifecycle then the seeded state is restored and FORCE is back on', async () => {
    // Guards the specs above against becoming a source of drift for every later spec: the
    // zero-role membership must still be zero-role, and the table must be protected again.
    const rows = await withAppContext(
      app,
      { userId: PHASE_3_SEED_IDS.userPhysician },
      async (client) => {
        const result = await client.query<{ id: string }>(
          'select id from practice_membership_roles',
        );
        return result.rows;
      },
    );

    expect(rows).toStrictEqual([]);

    const state = await migrator.query<{ enabled: boolean; forced: boolean }>(
      `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'practice_membership_roles'`,
    );

    expect(state.rows[0]).toStrictEqual({ enabled: true, forced: true });
  });
});

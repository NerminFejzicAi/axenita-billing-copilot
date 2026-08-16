/**
 * The single-transaction invariant of the authenticated bootstrap.
 *
 * Normative sources: D-047 clauses 3, 4, 8, 9 and 17; `03` §3.1; `02` §16.2, §16.2.4, §17.2,
 * §17.4, §17.5, §17.6; `08` §21.5.7.
 *
 * "The code appears to call `$transaction`" is not a proof. This suite establishes the invariant
 * from three independent directions:
 *
 * 1. TRANSACTION LOCALITY IS LOAD-BEARING. Every `app.*` value is set with
 *    `set_config(..., true)`, so it exists only inside the transaction that set it. The specs
 *    below measure what a read sees when the context was established in a DIFFERENT transaction
 *    or on a DIFFERENT connection: zero rows, every time, for every one of the five reads the
 *    bootstrap performs. A `GET /me` that returns a complete document is therefore only possible
 *    if all of those reads shared one transaction with the two context calls — there is no other
 *    way to obtain those rows.
 *
 * 2. THE REAL ADAPTER, DRIVEN STEP BY STEP. `PrismaIdentityDatabase` is exercised directly
 *    against the disposable database: the canonical order yields real rows, and a variant that
 *    omits `set_user_context` yields zero rows from every RLS dependent read. If any of those
 *    reads escaped onto another connection, the positive case would fail.
 *
 * 3. REQUEST TO REQUEST ISOLATION. Consecutive HTTP requests by different users, with failures
 *    interleaved, never inherit each other's context.
 *
 * The ORDER of the chain — status check strictly before `set_user_context` — is asserted at unit
 * level in `src/identity/application/identity-bootstrap.service.spec.ts`, where the session can
 * be recorded call by call. Both halves are required; neither replaces the other.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, PHASE_3_SEED_SUBJECTS } from '../prisma/seed.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PrismaIdentityDatabase } from '../src/identity/infrastructure/prisma-identity.database.js';
import { type IdentityBootstrapSession } from '../src/identity/infrastructure/identity-database.port.js';
import { closeTestApplication } from './support/create-test-application.js';
import { developmentBearer } from './support/development-token.js';
import { createIdentityTestApplication } from './support/identity-test-application.js';
import { connect, securityDatabase } from './support/phase3-security-context.js';

const ADMIN_SUBJECT = PHASE_3_SEED_SUBJECTS.practiceAdmin;
const ADMIN_ID = PHASE_3_SEED_IDS.userPracticeAdmin;

describe('identity bootstrap transaction', () => {
  let app: NestExpressApplication;
  let database: PrismaIdentityDatabase;
  let probe: Client;
  let secondProbe: Client;

  beforeAll(async () => {
    const disposable = securityDatabase();

    expect(disposable.name).toMatch(/^copilot_gate3b_/);
    expect(['localhost', '127.0.0.1']).toContain(new URL(disposable.app).hostname);

    app = await createIdentityTestApplication();
    // The very same client the application uses, so this is the production adapter under test
    // and not a second database stack.
    database = new PrismaIdentityDatabase(app.get(PrismaService));

    probe = await connect(disposable.app);
    secondProbe = await connect(disposable.app);
  }, 120000);

  afterAll(async () => {
    await probe.end();
    await secondProbe.end();
    await closeTestApplication(app);
  });

  describe('transaction locality is load-bearing', () => {
    it('loses app.auth_subject at COMMIT, so a later read resolves nobody', async () => {
      await probe.query('begin');
      await probe.query('select app_security.set_auth_subject_context($1)', [ADMIN_SUBJECT]);
      const inside = await probe.query('select "id" from "users"');
      await probe.query('commit');

      const afterCommit = await probe.query('select "id" from "users"');
      const setting = await probe.query<{ value: string | null }>(
        `select nullif(current_setting('app.auth_subject', true), '') as "value"`,
      );

      expect(inside.rowCount).toBe(1);
      expect(afterCommit.rowCount).toBe(0);
      expect(setting.rows[0]?.value).toBeNull();
    });

    it('loses app.auth_subject at ROLLBACK, which is what a rejected request performs', async () => {
      await probe.query('begin');
      await probe.query('select app_security.set_auth_subject_context($1)', [ADMIN_SUBJECT]);
      await probe.query('rollback');

      const afterRollback = await probe.query('select "id" from "users"');
      const setting = await probe.query<{ value: string | null }>(
        `select nullif(current_setting('app.user_id', true), '') as "value"`,
      );

      expect(afterRollback.rowCount).toBe(0);
      expect(setting.rows[0]?.value).toBeNull();
    });

    it('does not share context across connections — a second connection resolves nobody', async () => {
      await probe.query('begin');
      await probe.query('select app_security.set_auth_subject_context($1)', [ADMIN_SUBJECT]);

      try {
        const otherConnection = await secondProbe.query('select "id" from "users"');
        expect(otherConnection.rowCount).toBe(0);
      } finally {
        await probe.query('rollback');
      }
    });

    it.each([
      ['practice_memberships', 'select "id" from "practice_memberships" where "user_id" = $1'],
      ['practice_membership_roles', 'select "id" from "practice_membership_roles"'],
      ['practices', 'select "id" from "practices"'],
      ['platform_role_assignments', 'select "id" from "platform_role_assignments"'],
    ])(
      'returns nothing from %s once app.user_id is gone (02 §17.2, §17.3, §17.4, §17.6)',
      async (_table, statement) => {
        await probe.query('begin');
        await probe.query('select app_security.set_user_context($1::uuid)', [ADMIN_ID]);
        const inside = await probe.query(statement, statement.includes('$1') ? [ADMIN_ID] : []);
        await probe.query('commit');

        const outside = await probe.query(statement, statement.includes('$1') ? [ADMIN_ID] : []);

        expect(inside.rowCount).toBeGreaterThan(0);

        // ALL FOUR tables now behave identically. `practice_memberships` was the one exception
        // in phase 3 — it carried no policy and stayed readable after the context was gone,
        // which 08 §21.5.6 recorded as a documented intermediate state. `013_rls_policies`
        // closes it, so the exception is gone and the table returns zero rows like the others.
        expect(outside.rowCount).toBe(0);
      },
    );
  });

  describe('the production adapter, driven step by step', () => {
    async function runCanonicalChain(): Promise<{
      users: number;
      memberships: number;
      practices: number;
      roles: number;
      settings: number;
      platformRoles: number;
    }> {
      return database.runBootstrapTransaction(async (session: IdentityBootstrapSession) => {
        await session.setAuthSubjectContext(ADMIN_SUBJECT);
        const users = await session.findUsersForVerifiedSubject();
        expect(users).toHaveLength(1);
        expect(users[0]?.id).toBe(ADMIN_ID);

        await session.setUserContext(ADMIN_ID);

        const memberships = await session.findMemberships(ADMIN_ID);
        const practices = await session.findPractices(
          memberships.map((membership) => membership.practiceId),
        );
        const roles = await session.findMembershipRoles(
          memberships.map((membership) => membership.id),
        );
        const settings = await session.findConditionalSettings(
          memberships.map((membership) => membership.practiceId),
        );
        const platformRoles = await session.findCurrentPlatformRoles(ADMIN_ID);

        return {
          users: users.length,
          memberships: memberships.length,
          practices: practices.length,
          roles: roles.length,
          settings: settings.length,
          platformRoles: platformRoles.length,
        };
      });
    }

    it('reads every row of the chain inside one transaction', async () => {
      const counts = await runCanonicalChain();

      // Two memberships, two practices, three role rows, one platform role. None of these are
      // reachable on a connection that did not run the context calls, so obtaining them proves
      // the whole chain shared one transaction.
      //
      // `settings: 0` is the POST-`013` state, not a defect. This chain is the NEUTRAL `/me`
      // path: it establishes `app.user_id` and deliberately no tenant context, and
      // `practice_settings` now carries the §17.1 tenant policy, so the conditional read is
      // confined to zero rows. In phase 3 it returned two. The application falls back to
      // `DISABLED_CONDITIONAL_SETTINGS`, which is FAIL-CLOSED and exactly what D-041 requires
      // of a configuration the route cannot read. Restoring the read is an APPLICATION-path
      // adaptation owned by a later phase 4 slice; the policy is deliberately NOT weakened to
      // accommodate `/me` (D-053 clauses D.11 and D.13).
      expect(counts).toEqual({
        users: 1,
        memberships: 2,
        practices: 2,
        roles: 3,
        settings: 0,
        platformRoles: 1,
      });
    });

    it('reads nothing RLS dependent when set_user_context is skipped', async () => {
      const counts = await database.runBootstrapTransaction(async (session) => {
        await session.setAuthSubjectContext(ADMIN_SUBJECT);
        const users = await session.findUsersForVerifiedSubject();

        // Deliberately NOT calling `setUserContext`, which is what a rejected admission does.
        const practices = await session.findPractices([
          PHASE_3_SEED_IDS.practiceDemo,
          PHASE_3_SEED_IDS.practiceNord,
        ]);
        const roles = await session.findMembershipRoles([
          PHASE_3_SEED_IDS.membershipAdminInDemo,
          PHASE_3_SEED_IDS.membershipAdminInNord,
        ]);
        const platformRoles = await session.findCurrentPlatformRoles(ADMIN_ID);

        return {
          users: users.length,
          practices: practices.length,
          roles: roles.length,
          platformRoles: platformRoles.length,
        };
      });

      expect(counts).toEqual({ users: 1, practices: 0, roles: 0, platformRoles: 0 });
    });

    it('rolls back and clears every app.* setting when the chain throws', async () => {
      await expect(
        database.runBootstrapTransaction(async (session) => {
          await session.setAuthSubjectContext(ADMIN_SUBJECT);
          await session.setUserContext(ADMIN_ID);
          throw new Error('bootstrap failed');
        }),
      ).rejects.toThrow('bootstrap failed');

      // A subsequent chain on the same pool starts from a clean context: it resolves the OTHER
      // user, which is impossible if any part of the previous context survived.
      const survivor = await database.runBootstrapTransaction(async (session) => {
        await session.setAuthSubjectContext(PHASE_3_SEED_SUBJECTS.physician);
        return session.findUsersForVerifiedSubject();
      });

      expect(survivor).toHaveLength(1);
      expect(survivor[0]?.id).toBe(PHASE_3_SEED_IDS.userPhysician);
    });

    it('rejects an empty subject in the database, not in application code (02 §16.2.4)', async () => {
      // `set_auth_subject_context` raises SQLSTATE 42501 for a null or empty subject. The
      // application does not re-implement that check, so the failure has to come back from
      // PostgreSQL itself.
      const failure = await database
        .runBootstrapTransaction(async (session) => {
          await session.setAuthSubjectContext('');
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(Error);
      expect(String((failure as Error).message)).toContain('42501');
    });
  });

  describe('request to request isolation', () => {
    async function me(subject: string): Promise<{ status: number; body: unknown }> {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(subject));

      return { status: response.status, body: response.body };
    }

    it('never lets one request context leak into the next (08 §21.5.7)', async () => {
      const sequence = [
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_SUBJECTS.physician,
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_SUBJECTS.physician,
      ];

      const results: string[] = [];
      for (const subject of sequence) {
        const { status, body } = await me(subject);
        expect(status).toBe(200);
        results.push((body as { id: string }).id);
      }

      expect(results).toEqual([
        PHASE_3_SEED_IDS.userPracticeAdmin,
        PHASE_3_SEED_IDS.userPhysician,
        PHASE_3_SEED_IDS.userPracticeAdmin,
        PHASE_3_SEED_IDS.userPhysician,
      ]);
    });

    it('leaves no usable context behind after a rejected request', async () => {
      // A rejection rolls back; the next request must be resolved entirely on its own merits.
      const rejected = await me(PHASE_3_SEED_SUBJECTS.inactive);
      expect(rejected.status).toBe(403);

      const afterRejection = await me(PHASE_3_SEED_SUBJECTS.physician);
      expect(afterRejection.status).toBe(200);
      expect((afterRejection.body as { id: string }).id).toBe(PHASE_3_SEED_IDS.userPhysician);

      const unknown = await me('dev|not-provisioned');
      expect(unknown.status).toBe(403);

      const afterUnknown = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      expect(afterUnknown.status).toBe(200);
      expect((afterUnknown.body as { id: string }).id).toBe(PHASE_3_SEED_IDS.userPracticeAdmin);
    });

    it('returns identical documents for concurrent requests of different users', async () => {
      const [admin, physician] = await Promise.all([
        me(PHASE_3_SEED_SUBJECTS.practiceAdmin),
        me(PHASE_3_SEED_SUBJECTS.physician),
      ]);

      expect((admin.body as { id: string }).id).toBe(PHASE_3_SEED_IDS.userPracticeAdmin);
      expect((physician.body as { id: string }).id).toBe(PHASE_3_SEED_IDS.userPhysician);
      expect((physician.body as { memberships: unknown[] }).memberships).toHaveLength(1);
    });
  });
});

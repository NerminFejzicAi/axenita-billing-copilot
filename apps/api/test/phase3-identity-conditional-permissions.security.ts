/**
 * Conditional tenant permissions in `GET /me`, proven against real practice settings.
 *
 * Normative sources: `03` §10 and §28.5; `15` §5–§6; D-041 (`analysis.approve` and
 * `analysis.approval.revoke` are `CONDITIONAL` for `MPA` and `BILLING_SPECIALIST`); D-049
 * clause 7 (phase 3 must derive conditional permissions correctly for BOTH states of BOTH
 * flags); `08` §24.9.
 *
 * WHY THIS SUITE OWNS ITS OWN DATABASE
 *
 * The accepted seed keeps both approval flags `false` for every practice, because approval
 * outside `PHYSICIAN`/`PRACTICE_ADMIN` is an opt-in decision and never a default state (D-041).
 * Proving that a flag reaches exactly one membership therefore requires flipping it, and
 * flipping it in the shared disposable database would invalidate the seed assertions the other
 * phase 3 security specs make. This suite consequently creates, migrates, seeds and drops a
 * disposable database of its own. It never touches `copilot` or `copilot_test` — the same
 * `assertDisposableTarget` guard applies (08 §3).
 *
 * All fixture writes use the canonical paths: `users`, `practice_memberships`,
 * `practice_membership_roles` and `practice_settings` all carry FORCE row level security once
 * `013_rls_policies` is applied, so every one of them goes through the D-048 maintenance
 * protocol (02 §23.4.4, §23.4.4a; D-052 part B).
 *
 * WHAT `013_rls_policies` CHANGED, AND WHAT D-053 RESTORES
 *
 * `practice_settings` now carries the §17.1 tenant policy: without an established
 * `app.practice_id` the conditional read returns ZERO rows. The policy is NOT weakened for `/me`
 * (D-053 clause D.11). Instead the application establishes tenant context INTERNALLY, once per
 * ACTIVE membership, from that membership's own already-resolved practice id, through
 * `app_security.set_request_context` alone — and reads each practice's flags under that
 * practice's own strict tenant scope (D-053 clauses D.2 to D.8).
 *
 * This suite is the regression contract for that restoration. It asserts the ACCEPTED phase 3
 * semantics, not the fail-closed intermediate state: an enabled flag reaches exactly the
 * membership of the practice that enabled it, and nothing else.
 *
 * THE FIXTURE IS BUILT TO MAKE LEAKS VISIBLE
 *
 * Three practices, each with a different settings row, and two users who hold the SAME role in
 * ALL THREE. The only difference between a user's three memberships is the settings row of their
 * practice, so any cross-practice union, any reuse of the previously established context, and any
 * confusion of one conditional flag for the other shows up as a permission in the wrong
 * membership rather than as a subtle absence.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, runInForceRlsMaintenanceWindow, runPhase3Seed } from '../prisma/seed.js';
import { closeTestApplication } from './support/create-test-application.js';
import { developmentBearer } from './support/development-token.js';
import {
  createDisposableDatabase,
  dropDisposableDatabase,
  generateDisposableDatabaseName,
  type DisposableDatabase,
} from './support/disposable-database.js';
import { createIdentityTestApplication } from './support/identity-test-application.js';
import { connect } from './support/phase3-security-context.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

interface MembershipBody {
  membershipId: string;
  practiceId: string;
  practiceName: string;
  active: boolean;
  roles: string[];
  permissions: string[];
}

interface MeBody {
  memberships: MembershipBody[];
  platformRoles: { role: string; permissions: string[] }[];
}

/** The two `CONDITIONAL` cells of `15` §5, for both `MPA` and `BILLING_SPECIALIST` (D-041). */
const CONDITIONAL_APPROVAL = ['analysis.approve', 'analysis.approval.revoke'] as const;

/**
 * The three practices, each opting into a DIFFERENT combination of the two flags.
 *
 * `demo-praxis-sued` has no seeded membership of its own, which is why it is free for this suite
 * to use as the billing-opted-in practice; the disposable database belongs to this file alone.
 */
const MPA_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const NEITHER_PRACTICE = PHASE_3_SEED_IDS.practiceNord;
const BILLING_PRACTICE = PHASE_3_SEED_IDS.practiceWithoutMembers;

const PRACTICE_NAMES: Readonly<Record<string, string>> = {
  [MPA_PRACTICE]: 'Demo Praxis Zuerich',
  [NEITHER_PRACTICE]: 'Demo Praxis Nord',
  [BILLING_PRACTICE]: 'Demo Praxis Sued',
};

/**
 * Two users, each holding the SAME conditional role in ALL THREE practices, plus one inactive
 * membership in the practice whose MPA flag is enabled.
 *
 * A user with three memberships also forces the read-order requirement of D-053 clause D.10 into
 * the open: `practices_context_narrow` is RESTRICTIVE, so a `practiceName` read taken after the
 * first internal `set_request_context` would leave two of the three memberships nameless.
 */
const FIXTURE = {
  mpaUser: '22222222-2222-4222-8222-2222220000c1',
  mpaSubject: 'dev|conditional-mpa',
  mpaInMpaPractice: '33333333-3333-4333-8333-3333330000c1',
  mpaInNeitherPractice: '33333333-3333-4333-8333-3333330000c2',
  mpaInBillingPractice: '33333333-3333-4333-8333-3333330000c5',

  billingUser: '22222222-2222-4222-8222-2222220000c3',
  billingSubject: 'dev|conditional-billing',
  billingInMpaPractice: '33333333-3333-4333-8333-3333330000c3',
  billingInNeitherPractice: '33333333-3333-4333-8333-3333330000c6',
  billingInBillingPractice: '33333333-3333-4333-8333-3333330000c7',

  /** An inactive membership that carries the conditional role AND sits in the opted-in practice. */
  inactiveUser: '22222222-2222-4222-8222-2222220000c4',
  inactiveSubject: 'dev|conditional-inactive',
  inactiveMembership: '33333333-3333-4333-8333-3333330000c4',
  inactiveRole: '44444444-4444-4444-8444-4444440000c4',
} as const;

/**
 * Every active membership of the fixture: which user, which practice, which role, and whether
 * that practice's own flag enables the role's conditional cells.
 *
 * The `expected` column is derived from the practice alone crossed with the role — never from
 * the other role's flag, which is what makes the cross-flag isolation cases assertable.
 */
const ACTIVE_MEMBERSHIPS = [
  {
    membershipId: FIXTURE.mpaInMpaPractice,
    roleId: '44444444-4444-4444-8444-4444440000c1',
    userId: FIXTURE.mpaUser,
    practiceId: MPA_PRACTICE,
    role: 'MPA',
    conditionalGranted: true,
  },
  {
    membershipId: FIXTURE.mpaInNeitherPractice,
    roleId: '44444444-4444-4444-8444-4444440000c2',
    userId: FIXTURE.mpaUser,
    practiceId: NEITHER_PRACTICE,
    role: 'MPA',
    conditionalGranted: false,
  },
  {
    membershipId: FIXTURE.mpaInBillingPractice,
    roleId: '44444444-4444-4444-8444-4444440000c5',
    userId: FIXTURE.mpaUser,
    practiceId: BILLING_PRACTICE,
    role: 'MPA',
    // Cross-flag: `allow_billing_specialist_approval` must not make an MPA eligible.
    conditionalGranted: false,
  },
  {
    membershipId: FIXTURE.billingInMpaPractice,
    roleId: '44444444-4444-4444-8444-4444440000c3',
    userId: FIXTURE.billingUser,
    practiceId: MPA_PRACTICE,
    role: 'BILLING_SPECIALIST',
    // Cross-flag, the other direction: `allow_mpa_approval` must not make a billing specialist
    // eligible, not even in the very practice that enabled it.
    conditionalGranted: false,
  },
  {
    membershipId: FIXTURE.billingInNeitherPractice,
    roleId: '44444444-4444-4444-8444-4444440000c6',
    userId: FIXTURE.billingUser,
    practiceId: NEITHER_PRACTICE,
    role: 'BILLING_SPECIALIST',
    conditionalGranted: false,
  },
  {
    membershipId: FIXTURE.billingInBillingPractice,
    roleId: '44444444-4444-4444-8444-4444440000c7',
    userId: FIXTURE.billingUser,
    practiceId: BILLING_PRACTICE,
    role: 'BILLING_SPECIALIST',
    conditionalGranted: true,
  },
] as const;

async function applyFixture(migrationUrl: string): Promise<void> {
  const client = await connect(migrationUrl);

  try {
    await runInForceRlsMaintenanceWindow(client, 'users', async (trusted) => {
      for (const [id, subject, name] of [
        [FIXTURE.mpaUser, FIXTURE.mpaSubject, 'Dev Conditional MPA'],
        [FIXTURE.billingUser, FIXTURE.billingSubject, 'Dev Conditional Billing'],
        [FIXTURE.inactiveUser, FIXTURE.inactiveSubject, 'Dev Conditional Inactive Membership'],
      ] as const) {
        await trusted.query(
          `insert into "users" ("id", "auth_subject", "email", "display_name",
                                "preferred_language", "status", "created_at", "updated_at")
           values ($1, $2, $3, $4, 'de-CH', 'ACTIVE'::entity_status, now(), now())`,
          [id, subject, `${subject.replace('dev|', '')}@example.invalid`, name],
        );
      }
    });

    await runInForceRlsMaintenanceWindow(client, 'practice_memberships', async (trusted) => {
      for (const [membershipId, practiceId, userId, active] of [
        ...ACTIVE_MEMBERSHIPS.map(
          (row) => [row.membershipId, row.practiceId, row.userId, true] as const,
        ),
        [FIXTURE.inactiveMembership, MPA_PRACTICE, FIXTURE.inactiveUser, false] as const,
      ]) {
        await trusted.query(
          `insert into "practice_memberships" ("id", "practice_id", "user_id",
                                               "professional_gln", "active",
                                               "created_at", "updated_at")
           values ($1, $2, $3, null, $4, now(), now())`,
          [membershipId, practiceId, userId, active],
        );
      }
    });

    // ONE FLAG PER PRACTICE, NEVER BOTH. The MPA practice enables only `allow_mpa_approval`, the
    // billing practice only `allow_billing_specialist_approval`, and the third practice neither.
    // That separation is what turns "a conditional cell was satisfied by the OTHER cell's flag"
    // from an invisible bug into a failing assertion.
    //
    // `practice_settings` carries FORCE row level security from `013_rls_policies` onward, so
    // this trusted write goes through the §23.4.3 maintenance protocol like every other one
    // (§23.4.4a, D-052 clause B.2).
    await runInForceRlsMaintenanceWindow(client, 'practice_settings', async (trusted) => {
      for (const [practiceId, mpa, billing] of [
        [MPA_PRACTICE, true, false],
        [NEITHER_PRACTICE, false, false],
        [BILLING_PRACTICE, false, true],
      ] as const) {
        await trusted.query(
          `update "practice_settings"
              set "allow_mpa_approval" = $2,
                  "allow_billing_specialist_approval" = $3
            where "practice_id" = $1`,
          [practiceId, mpa, billing],
        );
      }
    });

    await runInForceRlsMaintenanceWindow(client, 'practice_membership_roles', async (trusted) => {
      for (const [roleId, practiceId, membershipId, role] of [
        ...ACTIVE_MEMBERSHIPS.map(
          (row) => [row.roleId, row.practiceId, row.membershipId, row.role] as const,
        ),
        [FIXTURE.inactiveRole, MPA_PRACTICE, FIXTURE.inactiveMembership, 'MPA'] as const,
      ]) {
        await trusted.query(
          `insert into "practice_membership_roles" ("id", "practice_id", "membership_id",
                                                    "role", "created_at", "updated_at")
           values ($1, $2, $3, $4::membership_role, now(), now())`,
          [roleId, practiceId, membershipId, role],
        );
      }
    });
  } finally {
    await client.end();
  }
}

describe('conditional tenant permissions in GET /me', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;

  beforeAll(async () => {
    disposable = await createDisposableDatabase(generateDisposableDatabaseName());

    expect(disposable.name).toMatch(/^copilot_gate3b_/);
    for (const url of [disposable.app, disposable.migration]) {
      expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
      expect(new URL(url).pathname).toBe(`/${disposable.name}`);
    }

    runPrismaCli(['migrate', 'deploy'], disposable.migration);
    await runPhase3Seed(disposable.migration);
    await applyFixture(disposable.migration);

    app = await createIdentityTestApplication(disposable);
  }, 180000);

  afterAll(async () => {
    await closeTestApplication(app);

    if (disposable !== undefined) {
      await dropDisposableDatabase(disposable);
    }
  }, 60000);

  async function me(subject: string): Promise<MeBody> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', developmentBearer(subject));

    expect(response.status).toBe(200);

    return response.body as MeBody;
  }

  function membershipOf(body: MeBody, membershipId: string): MembershipBody {
    const membership = body.memberships.find((entry) => entry.membershipId === membershipId);

    if (membership === undefined) {
      throw new Error(`The response did not contain membership ${membershipId}.`);
    }

    return membership;
  }

  it.each<[string, boolean, boolean]>([
    [MPA_PRACTICE, true, false],
    [NEITHER_PRACTICE, false, false],
    [BILLING_PRACTICE, false, true],
  ])(
    'has the flags of %s genuinely written, and readable ONLY under that practice tenant context',
    async (practiceId, mpa, billing) => {
      // The fixture is real, and after `013` the ONLY way to read it as `copilot_app` is with an
      // established tenant context. Proving that here is what makes the specs below meaningful:
      // some of them assert an absence, and an absence over data that was never written proves
      // nothing.
      const client = await connect(disposable.app);

      try {
        await client.query('begin');
        await client.query('select app_security.set_user_context($1::uuid)', [FIXTURE.mpaUser]);
        await client.query('select app_security.set_request_context($1::uuid)', [practiceId]);

        const scoped = await client.query<{
          practice_id: string;
          allow_mpa_approval: boolean;
          allow_billing_specialist_approval: boolean;
        }>(
          `select "practice_id", "allow_mpa_approval", "allow_billing_specialist_approval"
             from "practice_settings"`,
        );

        // Exactly ONE row — the established tenant — and exactly the flags the fixture set. The
        // other two practices are invisible even though their rows exist.
        expect(scoped.rows).toHaveLength(1);
        expect(scoped.rows[0]?.practice_id).toBe(practiceId);
        expect(scoped.rows[0]?.allow_mpa_approval).toBe(mpa);
        expect(scoped.rows[0]?.allow_billing_specialist_approval).toBe(billing);

        await client.query('rollback');
      } finally {
        await client.end();
      }
    },
  );

  describe('conditional derivation is restored after 013 (D-053)', () => {
    // One spec per membership of the matrix above: every combination of the two conditional
    // roles with the three settings rows, asserted in both flag states.
    for (const membership of ACTIVE_MEMBERSHIPS) {
      const practiceLabel =
        membership.practiceId === MPA_PRACTICE
          ? 'the MPA-opted-in'
          : membership.practiceId === BILLING_PRACTICE
            ? 'the billing-opted-in'
            : 'the opted-out';

      it(`${membership.role} in ${practiceLabel} practice derives its conditional cells from its OWN practice flag`, async () => {
        const subject =
          membership.userId === FIXTURE.mpaUser ? FIXTURE.mpaSubject : FIXTURE.billingSubject;
        const body = membershipOf(await me(subject), membership.membershipId);

        expect(body.roles).toEqual([membership.role]);
        expect(body.active).toBe(true);

        for (const permission of CONDITIONAL_APPROVAL) {
          expect(body.permissions.includes(permission)).toBe(membership.conditionalGranted);
        }

        // The UNCONDITIONAL half of the role is present either way — the route derives the whole
        // effective set, and only the CONDITIONAL cells follow the flag.
        expect(body.permissions.length).toBeGreaterThan(0);
      });
    }

    it('grants MPA approval in the opted-in practice and refuses it in the other two, for ONE user', async () => {
      // The sharpest form of D-053 clause D.8: same user, same role, same transaction, three
      // practices. Only the practice that opted in may contribute.
      const body = await me(FIXTURE.mpaSubject);

      expect(membershipOf(body, FIXTURE.mpaInMpaPractice).permissions).toEqual(
        expect.arrayContaining([...CONDITIONAL_APPROVAL]),
      );
      for (const membershipId of [FIXTURE.mpaInNeitherPractice, FIXTURE.mpaInBillingPractice]) {
        const other = membershipOf(body, membershipId);
        for (const permission of CONDITIONAL_APPROVAL) {
          expect(other.permissions).not.toContain(permission);
        }
      }
    });

    it('grants BILLING_SPECIALIST approval in the billing practice only, for ONE user', async () => {
      const body = await me(FIXTURE.billingSubject);

      expect(membershipOf(body, FIXTURE.billingInBillingPractice).permissions).toEqual(
        expect.arrayContaining([...CONDITIONAL_APPROVAL]),
      );
      for (const membershipId of [FIXTURE.billingInMpaPractice, FIXTURE.billingInNeitherPractice]) {
        const other = membershipOf(body, membershipId);
        for (const permission of CONDITIONAL_APPROVAL) {
          expect(other.permissions).not.toContain(permission);
        }
      }
    });

    it('never lets one conditional flag satisfy the other role cell (cross-flag isolation)', async () => {
      // `allow_mpa_approval` is enabled in `MPA_PRACTICE` and `allow_billing_specialist_approval`
      // in `BILLING_PRACTICE`. Each user holds a membership in the OTHER role's practice, so a
      // resolver that read "either flag" instead of "this role's flag" would grant there.
      const billingInMpaPractice = membershipOf(
        await me(FIXTURE.billingSubject),
        FIXTURE.billingInMpaPractice,
      );
      const mpaInBillingPractice = membershipOf(
        await me(FIXTURE.mpaSubject),
        FIXTURE.mpaInBillingPractice,
      );

      for (const membership of [billingInMpaPractice, mpaInBillingPractice]) {
        for (const permission of CONDITIONAL_APPROVAL) {
          expect(membership.permissions).not.toContain(permission);
        }
      }

      // Both unconditional halves survive, which proves the derivation ran rather than collapsed.
      expect(billingInMpaPractice.permissions).toContain('analysis.correct_service');
      expect(mpaInBillingPractice.permissions).toContain('analysis.run');
    });

    it('derives no cross-practice union: no membership holds a permission its own practice denies', async () => {
      for (const subject of [FIXTURE.mpaSubject, FIXTURE.billingSubject]) {
        const body = await me(subject);

        for (const membership of body.memberships) {
          const expected = ACTIVE_MEMBERSHIPS.find(
            (row) => row.membershipId === membership.membershipId,
          );
          expect(expected).toBeDefined();

          for (const permission of CONDITIONAL_APPROVAL) {
            expect(membership.permissions.includes(permission)).toBe(
              expected?.conditionalGranted === true,
            );
          }
        }
      }
    });
  });

  describe('the frozen /me contract survives the internal tenant context', () => {
    it('keeps practiceName for EVERY membership after the internal context switches (D-053 clause D.10)', async () => {
      // `practices_context_narrow` is RESTRICTIVE: had the practice read been taken after the
      // first `set_request_context`, two of these three names would be missing and the request
      // would have failed the §17.6 invariant check instead.
      for (const subject of [FIXTURE.mpaSubject, FIXTURE.billingSubject]) {
        const body = await me(subject);

        expect(body.memberships).toHaveLength(3);
        for (const membership of body.memberships) {
          expect(membership.practiceName).toBe(PRACTICE_NAMES[membership.practiceId]);
        }
      }
    });

    it('keeps an inactive membership visible, named, and with zero permissions (D-053 clause D.4)', async () => {
      const body = await me(FIXTURE.inactiveSubject);
      const inactive = membershipOf(body, FIXTURE.inactiveMembership);

      expect(body.memberships).toHaveLength(1);
      expect(inactive.active).toBe(false);
      expect(inactive.roles).toEqual(['MPA']);
      // The practice enables `allow_mpa_approval`; the membership still gets nothing.
      expect(inactive.permissions).toEqual([]);
      expect(inactive.practiceName).toBe(PRACTICE_NAMES[MPA_PRACTICE]);
    });

    it('never establishes tenant context for an inactive membership', async () => {
      // `set_request_context` requires `active = true` and raises 42501 otherwise (D-033 clause
      // 11), so a `/me` that called it for this membership could not have answered 200 at all.
      // The direct call below shows the refusal is real rather than assumed.
      expect((await me(FIXTURE.inactiveSubject)).memberships).toHaveLength(1);

      const client = await connect(disposable.app);

      try {
        await client.query('begin');
        await client.query('select app_security.set_user_context($1::uuid)', [
          FIXTURE.inactiveUser,
        ]);

        await expect(
          client.query('select app_security.set_request_context($1::uuid)', [MPA_PRACTICE]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    });

    it('requires no X-Practice-ID, and lets none select which membership receives settings', async () => {
      const withoutHeader = await me(FIXTURE.mpaSubject);

      // A header naming the OPTED-OUT practice must not disable the opted-in membership's
      // conditional cells, and one naming the opted-in practice must not enable the others.
      for (const header of [NEITHER_PRACTICE, MPA_PRACTICE, BILLING_PRACTICE]) {
        const response = await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Authorization', developmentBearer(FIXTURE.mpaSubject))
          .set('X-Practice-ID', header);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(withoutHeader);
      }
    });

    it('keeps the settings values themselves out of the response', async () => {
      const serialised = JSON.stringify(await me(FIXTURE.mpaSubject));

      expect(serialised).not.toContain('allowMpaApproval');
      expect(serialised).not.toContain('allow_mpa_approval');
      expect(serialised).not.toContain('allowBillingSpecialistApproval');
      expect(serialised).not.toContain('"settings"');
      expect(serialised).not.toContain('"version"');
    });

    it('leaves no tenant context behind on the pooled connection (D-053 clause D.9)', async () => {
      // Every `app.*` value is set with `set_config(..., true)` and is therefore transaction
      // local. The internal switches of `/me` cannot outlive its transaction, so a later request
      // — and any other connection — starts with nothing.
      expect((await me(FIXTURE.mpaSubject)).memberships).toHaveLength(3);

      const client = await connect(disposable.app);

      try {
        const context = await client.query<{
          subject: string | null;
          user: string | null;
          practice: string | null;
        }>(
          `select nullif(current_setting('app.auth_subject', true), '') as "subject",
                  nullif(current_setting('app.user_id', true), '')      as "user",
                  nullif(current_setting('app.practice_id', true), '')  as "practice"`,
        );

        expect(context.rows[0]).toEqual({ subject: null, user: null, practice: null });

        // And without tenant context the §17.1 policy still exposes no settings row at all.
        expect((await client.query('select "practice_id" from "practice_settings"')).rowCount).toBe(
          0,
        );
      } finally {
        await client.end();
      }
    });

    it('answers identically across repeated requests, with no accumulated context', async () => {
      // If a previous request's `app.practice_id` could survive, the second and third answers
      // would differ from the first.
      const first = await me(FIXTURE.mpaSubject);
      await me(FIXTURE.billingSubject);
      const third = await me(FIXTURE.mpaSubject);

      expect(third).toEqual(first);
    });

    it('reads the settings of the caller practices only, never the whole table', async () => {
      // THE PHASE 3 EXPOSURE OF D-049 CLAUSE 3 IS NOW CLOSED (08 §21.7.4 -> §21.8).
      //
      // In phase 3 this broad read returned every row, and only an application-level filter kept
      // it from mattering. After `013` the §17.1 tenant policy makes the same statement return
      // ZERO rows without an established tenant context: the control is now in the database, and
      // the application filter is a second barrier rather than the only one.
      const client = await connect(disposable.app);

      try {
        const everything = await client.query(
          'select "practice_id" from "practice_settings" order by "practice_id"',
        );
        expect(everything.rowCount).toBe(0);

        // The inactive user is a member of ONE practice, so the two practices they do not belong
        // to never appear — the internal context switches cannot widen membership visibility,
        // which stays bound to `app.user_id` by the §17.3 policy.
        const body = await me(FIXTURE.inactiveSubject);
        expect(JSON.stringify(body)).not.toContain(NEITHER_PRACTICE);
        expect(JSON.stringify(body)).not.toContain(BILLING_PRACTICE);
      } finally {
        await client.end();
      }
    });

    it('adds no platform role to a user who holds none', async () => {
      expect((await me(FIXTURE.mpaSubject)).platformRoles).toEqual([]);
    });
  });
});

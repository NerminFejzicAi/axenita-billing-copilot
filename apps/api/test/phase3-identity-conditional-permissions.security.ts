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
 * WHAT `013_rls_policies` CHANGES FOR THIS SUITE
 *
 * `practice_settings` now carries the §17.1 tenant policy, and the NEUTRAL `GET /me` route
 * deliberately establishes no tenant context (D-053 clause D.13). The conditional read therefore
 * returns ZERO rows and the resolver falls back to `DISABLED_CONDITIONAL_SETTINGS`, which is the
 * fail-closed behaviour D-041 requires. Restoring conditional derivation on `/me` is an
 * APPLICATION-path adaptation owned by a later phase 4 slice, and is explicitly NOT part of the
 * database slice. The specs below therefore assert the post-`013` state: the flags are confined,
 * `/me` grants no conditional permission from either state of either flag, and the derivation
 * logic itself stays proven by the DB-free resolver unit suite
 * (`src/identity/domain/effective-permissions.spec.ts`), which covers both flag states.
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
  roles: string[];
  permissions: string[];
}

interface MeBody {
  memberships: MembershipBody[];
  platformRoles: { role: string; permissions: string[] }[];
}

/**
 * One user holding the SAME conditional role in TWO active memberships.
 *
 * That shape is what makes the assertion sharp: the only difference between the two memberships
 * is the settings row of their practice, so a permission that appears in both would prove a
 * cross-practice leak rather than a conditional grant.
 */
const FIXTURE = {
  mpaUser: '22222222-2222-4222-8222-2222220000c1',
  mpaSubject: 'dev|conditional-mpa',
  mpaOptedIn: '33333333-3333-4333-8333-3333330000c1',
  mpaOptedOut: '33333333-3333-4333-8333-3333330000c2',
  mpaRoleOptedIn: '44444444-4444-4444-8444-4444440000c1',
  mpaRoleOptedOut: '44444444-4444-4444-8444-4444440000c2',

  billingUser: '22222222-2222-4222-8222-2222220000c3',
  billingSubject: 'dev|conditional-billing',
  billingMembership: '33333333-3333-4333-8333-3333330000c3',
  billingRole: '44444444-4444-4444-8444-4444440000c3',

  /** An inactive membership that carries the conditional role AND sits in the opted-in practice. */
  inactiveUser: '22222222-2222-4222-8222-2222220000c4',
  inactiveSubject: 'dev|conditional-inactive',
  inactiveMembership: '33333333-3333-4333-8333-3333330000c4',
  inactiveRole: '44444444-4444-4444-8444-4444440000c4',
} as const;

/** `demo-praxis` opts into MPA approval; `demo-praxis-nord` opts into neither. */
const OPTED_IN_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const OPTED_OUT_PRACTICE = PHASE_3_SEED_IDS.practiceNord;

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
        [FIXTURE.mpaOptedIn, OPTED_IN_PRACTICE, FIXTURE.mpaUser, true],
        [FIXTURE.mpaOptedOut, OPTED_OUT_PRACTICE, FIXTURE.mpaUser, true],
        [FIXTURE.billingMembership, OPTED_IN_PRACTICE, FIXTURE.billingUser, true],
        [FIXTURE.inactiveMembership, OPTED_IN_PRACTICE, FIXTURE.inactiveUser, false],
      ] as const) {
        await trusted.query(
          `insert into "practice_memberships" ("id", "practice_id", "user_id",
                                               "professional_gln", "active",
                                               "created_at", "updated_at")
           values ($1, $2, $3, null, $4, now(), now())`,
          [membershipId, practiceId, userId, active],
        );
      }
    });

    // Exactly one practice opts in, and only to MPA approval. The billing flag stays `false`
    // everywhere, which is what makes the "eligible role, disabled flag" case assertable.
    //
    // `practice_settings` carries FORCE row level security from `013_rls_policies` onward, so
    // this trusted write goes through the §23.4.3 maintenance protocol like every other one
    // (§23.4.4a, D-052 clause B.2).
    await runInForceRlsMaintenanceWindow(client, 'practice_settings', async (trusted) => {
      await trusted.query(
        `update "practice_settings"
            set "allow_mpa_approval" = true,
                "allow_billing_specialist_approval" = false
          where "practice_id" = $1`,
        [OPTED_IN_PRACTICE],
      );
    });

    await runInForceRlsMaintenanceWindow(client, 'practice_membership_roles', async (trusted) => {
      for (const [roleId, practiceId, membershipId, role] of [
        [FIXTURE.mpaRoleOptedIn, OPTED_IN_PRACTICE, FIXTURE.mpaOptedIn, 'MPA'],
        [FIXTURE.mpaRoleOptedOut, OPTED_OUT_PRACTICE, FIXTURE.mpaOptedOut, 'MPA'],
        [FIXTURE.billingRole, OPTED_IN_PRACTICE, FIXTURE.billingMembership, 'BILLING_SPECIALIST'],
        [FIXTURE.inactiveRole, OPTED_IN_PRACTICE, FIXTURE.inactiveMembership, 'MPA'],
      ] as const) {
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

  it('has the opted-in flag genuinely enabled in the database, readable under tenant context', async () => {
    // The fixture is real, and after `013` the ONLY way to read it as `copilot_app` is with an
    // established tenant context. Proving that here is what makes the two specs below meaningful:
    // they assert an absence, and an absence over data that was never written proves nothing.
    const client = await connect(disposable.app);

    try {
      await client.query('begin');
      await client.query('select app_security.set_user_context($1::uuid)', [FIXTURE.mpaUser]);
      await client.query('select app_security.set_request_context($1::uuid)', [OPTED_IN_PRACTICE]);

      const scoped = await client.query<{
        practice_id: string;
        allow_mpa_approval: boolean;
        allow_billing_specialist_approval: boolean;
      }>(
        `select "practice_id", "allow_mpa_approval", "allow_billing_specialist_approval"
           from "practice_settings"`,
      );

      // Exactly ONE row — the established tenant — and the flag the fixture set.
      expect(scoped.rows).toHaveLength(1);
      expect(scoped.rows[0]?.practice_id).toBe(OPTED_IN_PRACTICE);
      expect(scoped.rows[0]?.allow_mpa_approval).toBe(true);
      expect(scoped.rows[0]?.allow_billing_specialist_approval).toBe(false);

      await client.query('rollback');
    } finally {
      await client.end();
    }
  });

  it('refuses an eligible role while the flag is disabled', async () => {
    const optedOut = membershipOf(await me(FIXTURE.mpaSubject), FIXTURE.mpaOptedOut);

    expect(optedOut.roles).toEqual(['MPA']);
    expect(optedOut.permissions).not.toContain('analysis.approve');
    expect(optedOut.permissions).not.toContain('analysis.approval.revoke');
  });

  it('grants no conditional permission on the NEUTRAL /me route after 013, in either flag state', async () => {
    // THE POST-`013` STATE, ASSERTED RATHER THAN PRETENDED AWAY (D-053 part D, clause D.13).
    //
    // `practice_settings` now carries the §17.1 tenant policy and `/me` establishes no tenant
    // context, so `findConditionalSettings` returns zero rows and the resolver falls back to
    // `DISABLED_CONDITIONAL_SETTINGS`. Both memberships therefore look identical, INCLUDING the
    // one whose practice has `allow_mpa_approval = true` in the database — proven true by the
    // spec above.
    //
    // This is FAIL-CLOSED, which is the direction D-041 requires: a configuration the route
    // cannot read never enables a CONDITIONAL grant. It is NOT a weakening of a phase 3 control
    // and must never be read as one. Restoring conditional derivation is an APPLICATION-path
    // adaptation owned by a later phase 4 slice; this migration deliberately does not weaken the
    // policy to accommodate `/me` (D-053 clause D.11).
    const body = await me(FIXTURE.mpaSubject);

    const optedIn = membershipOf(body, FIXTURE.mpaOptedIn);
    const optedOut = membershipOf(body, FIXTURE.mpaOptedOut);

    expect(optedIn.roles).toEqual(['MPA']);
    expect(optedIn.roles).toEqual(optedOut.roles);

    for (const membership of [optedIn, optedOut]) {
      expect(
        membership.permissions.filter((permission) => permission.startsWith('analysis.appro')),
      ).toEqual([]);
    }

    // The UNCONDITIONAL half of the role is untouched — the route still derives permissions, it
    // simply derives no CONDITIONAL cell.
    expect(optedIn.permissions.length).toBeGreaterThan(0);
    expect(optedIn.permissions).toEqual(optedOut.permissions);
  });

  it('refuses a different conditional role whose own flag is disabled in the same practice', async () => {
    // `allow_mpa_approval` is enabled in this very practice; the billing flag is not. One
    // conditional cell must never be satisfied by another cell's flag.
    const billing = membershipOf(await me(FIXTURE.billingSubject), FIXTURE.billingMembership);

    expect(billing.roles).toEqual(['BILLING_SPECIALIST']);
    expect(billing.permissions).not.toContain('analysis.approve');
    expect(billing.permissions).not.toContain('analysis.approval.revoke');
    // The unconditional part of the role is unaffected.
    expect(billing.permissions).toContain('analysis.correct_service');
  });

  it('grants nothing to an inactive membership even with an eligible role and an enabled flag', async () => {
    const inactive = membershipOf(await me(FIXTURE.inactiveSubject), FIXTURE.inactiveMembership);

    expect(inactive.roles).toEqual(['MPA']);
    expect(inactive.permissions).toEqual([]);
  });

  it('keeps the settings values themselves out of the response', async () => {
    const serialised = JSON.stringify(await me(FIXTURE.mpaSubject));

    expect(serialised).not.toContain('allowMpaApproval');
    expect(serialised).not.toContain('allow_mpa_approval');
    expect(serialised).not.toContain('allowBillingSpecialistApproval');
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

      const body = await me(FIXTURE.mpaSubject);
      expect(body.memberships.map((membership) => membership.membershipId).sort()).toEqual(
        [FIXTURE.mpaOptedIn, FIXTURE.mpaOptedOut].sort(),
      );
      expect(JSON.stringify(body)).not.toContain(PHASE_3_SEED_IDS.practiceWithoutMembers);
    } finally {
      await client.end();
    }
  });

  it('adds no platform role to a user who holds none', async () => {
    expect((await me(FIXTURE.mpaSubject)).platformRoles).toEqual([]);
  });
});

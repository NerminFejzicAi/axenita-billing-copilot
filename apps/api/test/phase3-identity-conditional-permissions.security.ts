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
 * All fixture writes use the canonical paths: `users` and `practice_membership_roles` carry
 * FORCE row level security and go through the D-048 maintenance protocol; `practice_memberships`
 * and `practice_settings` do not and are written in an ordinary explicit transaction
 * (02 §23.4.4).
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

    await client.query('begin');
    try {
      for (const [membershipId, practiceId, userId, active] of [
        [FIXTURE.mpaOptedIn, OPTED_IN_PRACTICE, FIXTURE.mpaUser, true],
        [FIXTURE.mpaOptedOut, OPTED_OUT_PRACTICE, FIXTURE.mpaUser, true],
        [FIXTURE.billingMembership, OPTED_IN_PRACTICE, FIXTURE.billingUser, true],
        [FIXTURE.inactiveMembership, OPTED_IN_PRACTICE, FIXTURE.inactiveUser, false],
      ] as const) {
        await client.query(
          `insert into "practice_memberships" ("id", "practice_id", "user_id",
                                               "professional_gln", "active",
                                               "created_at", "updated_at")
           values ($1, $2, $3, null, $4, now(), now())`,
          [membershipId, practiceId, userId, active],
        );
      }

      // Exactly one practice opts in, and only to MPA approval. The billing flag stays `false`
      // everywhere, which is what makes the "eligible role, disabled flag" case assertable.
      await client.query(
        `update "practice_settings"
            set "allow_mpa_approval" = true,
                "allow_billing_specialist_approval" = false
          where "practice_id" = $1`,
        [OPTED_IN_PRACTICE],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

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

  it('grants an eligible role with the flag enabled (MPA + allow_mpa_approval)', async () => {
    const optedIn = membershipOf(await me(FIXTURE.mpaSubject), FIXTURE.mpaOptedIn);

    expect(optedIn.roles).toEqual(['MPA']);
    expect(optedIn.permissions).toContain('analysis.approve');
    // D-041 keeps approval and revocation eligibility identical; they must never diverge.
    expect(optedIn.permissions).toContain('analysis.approval.revoke');
  });

  it('refuses an eligible role while the flag is disabled', async () => {
    const optedOut = membershipOf(await me(FIXTURE.mpaSubject), FIXTURE.mpaOptedOut);

    expect(optedOut.roles).toEqual(['MPA']);
    expect(optedOut.permissions).not.toContain('analysis.approve');
    expect(optedOut.permissions).not.toContain('analysis.approval.revoke');
  });

  it('confines the flag to its own practice — same user, same role, two practices', async () => {
    const body = await me(FIXTURE.mpaSubject);

    const optedIn = membershipOf(body, FIXTURE.mpaOptedIn);
    const optedOut = membershipOf(body, FIXTURE.mpaOptedOut);

    expect(optedIn.roles).toEqual(optedOut.roles);
    expect(optedIn.permissions).not.toEqual(optedOut.permissions);
    expect(
      optedIn.permissions.filter((permission) => permission.startsWith('analysis.appro')),
    ).toEqual(['analysis.approve', 'analysis.approval.revoke']);
    expect(
      optedOut.permissions.filter((permission) => permission.startsWith('analysis.appro')),
    ).toEqual([]);
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
    // The exposure being scoped is real: `practice_settings` carries no RLS policy in phase 3,
    // so a broad read WOULD return the settings of a practice the caller has no membership in
    // (D-049, 08 §21.7.4). The application filter is what prevents that from mattering.
    const client = await connect(disposable.app);

    try {
      const everything = await client.query(
        'select "practice_id" from "practice_settings" order by "practice_id"',
      );
      expect(everything.rowCount).toBe(3);

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

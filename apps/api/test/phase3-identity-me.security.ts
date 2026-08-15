/**
 * `GET /api/v1/me` against a real PostgreSQL — the phase 3 identity contract end to end.
 *
 * Normative sources: `03` §3.1, §3.4 and §10; `04` §5.4.1; `08` §8, §21.5 and §24.7; D-023,
 * D-038, D-047, D-049, D-051.
 *
 * WHY THIS SUITE AND NOT AN `*.e2e-spec.ts`
 *
 * The properties under test are database properties: the bootstrap policy of `02` §17.5, the
 * membership policy of §17.6, the self policies of §17.2 and §17.4, and the column grants of
 * §20.2a/§20.2b. A stubbed database would prove none of them. This suite therefore runs against
 * the disposable database the security global setup creates, migrates and seeds — never the
 * development database `copilot` and never the shared `copilot_test` (08 §3).
 *
 * The seed (`prisma/seed.ts`) is the single source of truth for the expected rows, so this file
 * asserts against `PHASE_3_SEED_IDS` and `PHASE_3_SEED_SUBJECTS` rather than against copied
 * UUID literals.
 *
 * This suite is strictly READ ONLY against the shared disposable database: it inserts nothing,
 * updates nothing, and leaves the frozen seed exactly as the other phase 3 security specs
 * expect it. The one phase 3 property that cannot be shown without mutating settings —
 * conditional permissions — lives in `phase3-identity-conditional-permissions.security.ts`,
 * which owns a disposable database of its own.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, PHASE_3_SEED_SUBJECTS } from '../prisma/seed.js';
import { closeTestApplication } from './support/create-test-application.js';
import { developmentBearer } from './support/development-token.js';
import { createIdentityTestApplication } from './support/identity-test-application.js';
import { connect, securityDatabase } from './support/phase3-security-context.js';

/** A membership object as `03` §10 defines it. */
interface MembershipBody {
  membershipId: string;
  practiceId: string;
  practiceName: string;
  active: boolean;
  roles: string[];
  permissions: string[];
}

interface MeBody {
  id: string;
  email: string;
  displayName: string;
  preferredLanguage: string;
  platformRoles: { role: string; permissions: string[] }[];
  memberships: MembershipBody[];
}

describe('GET /api/v1/me', () => {
  let app: NestExpressApplication;
  let appClient: Client;

  beforeAll(async () => {
    const disposable = securityDatabase();

    // Every target of this suite is a local disposable database; `securityDatabase()` runs
    // `assertDisposableTarget` for all three identities before anything connects (08 §3).
    expect(disposable.name).toMatch(/^copilot_gate3b_/);
    for (const url of [disposable.app, disposable.migration]) {
      expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
    }

    app = await createIdentityTestApplication();
    appClient = await connect(disposable.app);
  }, 120000);

  afterAll(async () => {
    await appClient.end();
    await closeTestApplication(app);
  });

  async function me(subject: string): Promise<{ status: number; body: MeBody }> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', developmentBearer(subject));

    return { status: response.status, body: response.body as MeBody };
  }

  describe('authentication and admission', () => {
    it('answers 200 for the seeded ACTIVE user and resolves exactly that user', async () => {
      const { status, body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      expect(status).toBe(200);
      expect(body.id).toBe(PHASE_3_SEED_IDS.userPracticeAdmin);
      expect(body.email).toBe('dev.practice-admin@example.invalid');
      expect(body.displayName).toBe('Dev Practice Admin');
      expect(body.preferredLanguage).toBe('de-CH');
    });

    it('resolves a different subject to a different user — the policy, not a hard coded id', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.physician);

      expect(body.id).toBe(PHASE_3_SEED_IDS.userPhysician);
      expect(body.displayName).toBe('Dev Physician');
    });

    it('answers 401 AUTHENTICATION_REQUIRED without a bearer credential', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/me');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    });

    it.each([
      ['a malformed token', 'Bearer not-a-token'],
      [
        'a foreign signature',
        developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin, {
          secret: 'another_secret_value_that_is_32_chars_x',
        }),
      ],
      [
        'a wrong issuer',
        developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin, { issuer: 'https://evil.example' }),
      ],
      [
        'a wrong audience',
        developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin, { audience: 'another-api' }),
      ],
      [
        'an expired token',
        developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin, { expiresInSeconds: -60 }),
      ],
    ])('answers 401 INVALID_TOKEN for %s (03 §3.1, 08 §8)', async (_label, authorization) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', authorization);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'INVALID_TOKEN', status: 401 });
    });

    it('answers 403 ACCESS_DENIED for an unknown but cryptographically valid subject', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer('dev|not-provisioned'));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 ACCESS_DENIED for an INACTIVE user and returns no tenant data at all', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.inactive));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain(PHASE_3_SEED_IDS.membershipInactiveUserInDemo);
      expect(serialised).not.toContain(PHASE_3_SEED_IDS.practiceDemo);
      expect(serialised).not.toContain('MPA');
      expect(serialised).not.toContain('memberships');
    });

    it('answers an unknown subject and an inactive user indistinguishably (03 §3.1)', async () => {
      const unknown = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer('dev|not-provisioned'));
      const inactive = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.inactive));

      expect(unknown.status).toBe(inactive.status);
      expect(unknown.body).toMatchObject({
        code: (inactive.body as { code: string }).code,
        detail: (inactive.body as { detail: string }).detail,
        title: (inactive.body as { title: string }).title,
      });
    });

    it('leaks no SQL, connection string, auth subject or stack trace in any rejection', async () => {
      for (const authorization of [
        'Bearer not-a-token',
        developmentBearer('dev|not-provisioned'),
        developmentBearer(PHASE_3_SEED_SUBJECTS.inactive),
      ]) {
        const response = await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Authorization', authorization);

        const serialised = JSON.stringify(response.body);
        expect(serialised).not.toContain('select');
        expect(serialised).not.toContain('postgresql://');
        expect(serialised).not.toContain('auth_subject');
        expect(serialised).not.toContain('dev|');
        expect(serialised).not.toContain('at Object.');
      }
    });
  });

  describe('memberships', () => {
    it('returns the memberships of the caller only, in a deterministic order', async () => {
      const first = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      const second = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      expect(first.body.memberships.map((membership) => membership.membershipId)).toEqual([
        PHASE_3_SEED_IDS.membershipAdminInDemo,
        PHASE_3_SEED_IDS.membershipAdminInNord,
      ]);
      expect(second.body.memberships).toEqual(first.body.memberships);
    });

    it('renders practiceName from the membership practice (02 §17.6)', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      expect(body.memberships[0]).toMatchObject({
        practiceId: PHASE_3_SEED_IDS.practiceDemo,
        practiceName: 'Demo Praxis Zuerich',
      });
      expect(body.memberships[1]).toMatchObject({
        practiceId: PHASE_3_SEED_IDS.practiceNord,
        practiceName: 'Demo Praxis Nord',
      });
    });

    it('returns an inactive membership with its roles but with zero permissions', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      const inactive = body.memberships.find(
        (membership) => membership.membershipId === PHASE_3_SEED_IDS.membershipAdminInNord,
      );

      expect(inactive).toMatchObject({
        active: false,
        practiceName: 'Demo Praxis Nord',
        roles: ['READ_ONLY'],
        permissions: [],
      });
    });

    it('returns an empty roles array for an active membership with no assignment', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.physician);

      expect(body.memberships).toHaveLength(1);
      expect(body.memberships[0]).toMatchObject({
        membershipId: PHASE_3_SEED_IDS.membershipPhysicianInNord,
        active: true,
        roles: [],
        permissions: [],
      });
    });

    it('scopes roles to the exact membership and orders them canonically', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      // Membership `...3001` carries two roles; the `15` §2.1 order puts PRACTICE_ADMIN first.
      expect(body.memberships[0]?.roles).toEqual(['PRACTICE_ADMIN', 'PHYSICIAN']);
      expect(body.memberships[1]?.roles).toEqual(['READ_ONLY']);
      for (const membership of body.memberships) {
        expect(new Set(membership.roles).size).toBe(membership.roles.length);
        expect(membership.roles).not.toContain('SYSTEM_ADMIN');
      }
    });

    it('never exposes a singular membership.role field (D-038)', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      for (const membership of body.memberships) {
        expect(Object.keys(membership).sort()).toEqual([
          'active',
          'membershipId',
          'permissions',
          'practiceId',
          'practiceName',
          'roles',
        ]);
      }
    });

    it('never leaks another user membership, role or practice', async () => {
      const physician = await me(PHASE_3_SEED_SUBJECTS.physician);
      const admin = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      const physicianBody = JSON.stringify(physician.body);
      // The physician has no membership in `demo-praxis`, where two other users do.
      expect(physicianBody).not.toContain(PHASE_3_SEED_IDS.practiceDemo);
      expect(physicianBody).not.toContain(PHASE_3_SEED_IDS.membershipAdminInDemo);
      expect(physicianBody).not.toContain(PHASE_3_SEED_IDS.membershipInactiveUserInDemo);
      expect(physicianBody).not.toContain('PRACTICE_ADMIN');
      expect(physicianBody).not.toContain('Dev Practice Admin');

      // The admin shares `demo-praxis` with the inactive user, yet must not see that user's
      // membership or its MPA role — the sharpest §17.4 assertion the seed allows.
      const adminBody = JSON.stringify(admin.body);
      expect(adminBody).not.toContain(PHASE_3_SEED_IDS.membershipInactiveUserInDemo);
      expect(adminBody).not.toContain('"MPA"');
      expect(adminBody).not.toContain(PHASE_3_SEED_IDS.userInactive);

      // A practice in which nobody holds a membership is invisible to everyone.
      expect(physicianBody).not.toContain(PHASE_3_SEED_IDS.practiceWithoutMembers);
      expect(adminBody).not.toContain(PHASE_3_SEED_IDS.practiceWithoutMembers);
    });
  });

  describe('permission derivation', () => {
    it('derives an active membership permissions from its own roles (15 §5)', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      const permissions = body.memberships[0]?.permissions ?? [];

      // Union of PRACTICE_ADMIN and PHYSICIAN, both approval flags off.
      expect(permissions).toContain('practice.read');
      expect(permissions).toContain('encounter.read');
      expect(permissions).toContain('analysis.approve');
      expect(new Set(permissions).size).toBe(permissions.length);
      expect(permissions).not.toContain('tariff.manage');
      // Reserved identifiers are not catalogue members and can never be produced (03 §28.2).
      for (const reserved of [
        'analysis.run_tariff',
        'configuration.manage',
        'integration.manage',
      ]) {
        expect(permissions).not.toContain(reserved);
      }
    });

    it('keeps the intermediate practice_settings read exposure out of the HTTP output (D-049)', async () => {
      // The exposure is real and named: `practice_settings` carries no RLS policy in phase 3,
      // so `copilot_app` can read the three granted columns of a practice it has no membership
      // in. This asserts the exposure rather than pretending it away (08 §21.7.4)...
      const visible = await appClient.query<{ practice_id: string }>(
        'select "practice_id" from "practice_settings" where "practice_id" = $1',
        [PHASE_3_SEED_IDS.practiceWithoutMembers],
      );
      expect(visible.rowCount).toBe(1);

      // ...and then asserts that none of it reaches a response.
      for (const subject of [
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_SUBJECTS.physician,
      ]) {
        const { body } = await me(subject);
        const serialised = JSON.stringify(body);

        expect(serialised).not.toContain('allowMpaApproval');
        expect(serialised).not.toContain('allow_mpa_approval');
        expect(serialised).not.toContain('allowBillingSpecialistApproval');
        expect(serialised).not.toContain('allow_billing_specialist_approval');
        // The only occurrences of "settings" a response may contain are the permission
        // identifiers `practice.settings.read` and `practice.settings.manage` of `15` §5 —
        // never a settings object, a flag or a version.
        expect(serialised).not.toContain('"settings"');
        expect(serialised).not.toContain('"version"');
        expect(serialised).not.toContain(PHASE_3_SEED_IDS.practiceWithoutMembers);
      }
    });
  });

  describe('platform roles', () => {
    it('returns a current SYSTEM_ADMIN assignment in platformRoles only', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);

      expect(body.platformRoles).toEqual([
        { role: 'SYSTEM_ADMIN', permissions: ['tariff.manage'] },
      ]);
      for (const membership of body.memberships) {
        expect(membership.roles).not.toContain('SYSTEM_ADMIN');
        expect(membership.permissions).not.toContain('tariff.manage');
      }
    });

    it('omits a revoked assignment (D-051 clause 3)', async () => {
      // The revoked row belongs to the inactive user, who cannot reach `/me` at all, so the
      // application filter is proven directly against the database instead: the §17.2 policy is
      // user scoped only and does NOT look at `revoked_at`, therefore the row IS visible to a
      // raw read and must still be excluded by the application predicate.
      await appClient.query('begin');

      try {
        await appClient.query('select app_security.set_user_context($1::uuid)', [
          PHASE_3_SEED_IDS.userInactive,
        ]);

        const all = await appClient.query<{ id: string; revoked_at: Date | null }>(
          'select "id", "revoked_at" from "platform_role_assignments"',
        );
        const current = await appClient.query<{ id: string }>(
          'select "id" from "platform_role_assignments" where "revoked_at" is null',
        );

        expect(all.rows.map((row) => row.id)).toEqual([PHASE_3_SEED_IDS.platformRoleRevoked]);
        expect(all.rows[0]?.revoked_at).not.toBeNull();
        expect(current.rowCount).toBe(0);
      } finally {
        await appClient.query('rollback');
      }
    });

    it('returns an empty platformRoles block for a user without an assignment', async () => {
      const { body } = await me(PHASE_3_SEED_SUBJECTS.physician);

      expect(body.platformRoles).toEqual([]);
    });

    it('does not let SYSTEM_ADMIN increase any membership permissions (D-038 clauses 12-14)', async () => {
      // The admin holds SYSTEM_ADMIN and two tenant roles in `demo-praxis`; the physician holds
      // no platform role and no tenant role at all. If the platform role contributed anything,
      // the admin's membership permissions would exceed the union of PRACTICE_ADMIN and
      // PHYSICIAN from `15` §5, and `tariff.manage` would appear somewhere in a membership.
      const admin = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      const physician = await me(PHASE_3_SEED_SUBJECTS.physician);

      expect(admin.body.platformRoles).toHaveLength(1);
      expect(physician.body.platformRoles).toHaveLength(0);

      for (const membership of [...admin.body.memberships, ...physician.body.memberships]) {
        expect(membership.permissions).not.toContain('tariff.manage');
      }

      // The zero-role membership of a user without any platform role stays empty, and the
      // inactive membership of the SYSTEM_ADMIN stays empty too.
      expect(physician.body.memberships[0]?.permissions).toEqual([]);
      expect(
        admin.body.memberships.find(
          (membership) => membership.membershipId === PHASE_3_SEED_IDS.membershipAdminInNord,
        )?.permissions,
      ).toEqual([]);
    });
  });

  describe('route classification', () => {
    it('needs no X-Practice-ID and establishes no phase 4 context (03 §3.4, D-047 clause 16)', async () => {
      const withoutHeader = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      expect(withoutHeader.status).toBe(200);

      // A sent header is ignored: `/me` is neutral, not tenant scoped.
      const withHeader = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin))
        .set('X-Practice-ID', PHASE_3_SEED_IDS.practiceWithoutMembers);

      expect(withHeader.status).toBe(200);
      expect(withHeader.body).toEqual(withoutHeader.body);
    });

    it('proves the phase 4 tenant context function does not exist in this package', async () => {
      const functions = await appClient.query<{ name: string | null }>(
        `select to_regprocedure('app_security.set_request_context(uuid)')::text as "name"`,
      );

      expect(functions.rows[0]?.name).toBeNull();
    });

    it('registers no practice settings route in this phase (D-049)', async () => {
      // The settings routes are normatively forbidden in phase 3, not merely unimplemented. The
      // practice route itself is a phase 3 endpoint and IS registered, so it is excluded here
      // and owned by `phase3-practice-read.security.ts`; a list or directory of practices does
      // not exist at all (D-047 clause 11).
      for (const path of [
        `/api/v1/practices/${PHASE_3_SEED_IDS.practiceDemo}/settings`,
        '/api/v1/practices',
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin))
          .set('X-Practice-ID', PHASE_3_SEED_IDS.practiceDemo);

        expect(response.status).toBe(404);
      }
    });

    it('keeps /me neutral now that a tenant route exists alongside it (03 §3.4)', async () => {
      // The tenant route rejects a missing `X-Practice-ID` with 400; `/me` must be unaffected by
      // the introduction of that rule, because it is neither tenant nor platform scoped.
      const neutral = await me(PHASE_3_SEED_SUBJECTS.practiceAdmin);
      expect(neutral.status).toBe(200);

      const tenant = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PHASE_3_SEED_IDS.practiceDemo}`)
        .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin));

      expect(tenant.status).toBe(400);
      expect(tenant.body).toMatchObject({ code: 'PRACTICE_CONTEXT_REQUIRED' });
    });
  });
});

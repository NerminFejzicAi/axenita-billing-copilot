/**
 * `GET /api/v1/practices/{practiceId}` against a real PostgreSQL — the tenant contract end to
 * end, including the tenant execution boundary.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1 and the accepted `GET /practices/{practiceId}`
 * section; `02` §16.2.3, §17.1 and §17.6; `08` §21.5, §24.14 and §24.17; `15` §5; D-033 clauses
 * 9–12; D-038 clauses 12–14; D-047 clauses 8, 10, 11 and 18; D-049; D-053.
 *
 * WHY THIS SUITE AND NOT AN `*.e2e-spec.ts`
 *
 * The properties under test are database properties: the membership policy of `02` §17.6 that
 * makes a foreign practice invisible, the column grants of §20.2a that make `zsr_number`,
 * `gln_number` and `legal_name` unreachable, the bootstrap policy of §17.5, and the
 * transaction-local `app.*` context that a rejected request must roll back. A stubbed database
 * would prove none of them, and `pnpm test:e2e` boots the application with stub dependency
 * listeners and no PostgreSQL at all. This suite therefore runs against a disposable database,
 * never the development database `copilot` and never the shared `copilot_test` (`08` §3).
 *
 * WHY IT OWNS ITS OWN DATABASE
 *
 * The accepted seed contains one `PRACTICE_ADMIN` and three `ACTIVE` practices. Proving the
 * complete `15` §5 column — every one of the six tenant roles — and proving the non-`ACTIVE`
 * practice rejection of D-047 clause 10 require rows the frozen seed deliberately does not
 * contain, and adding them to the SHARED disposable database would invalidate the row-count and
 * isolation assertions the other phase 3 security specs make. This suite therefore creates,
 * migrates, seeds and drops a disposable database of its own, exactly like
 * `phase3-identity-conditional-permissions.security.ts` does and for the same reason.
 *
 * All fixture writes use the canonical paths: every one of the six tables under FORCE row level
 * security — `practices`, `users`, `practice_memberships`, `practice_membership_roles`,
 * `practice_settings` and `platform_role_assignments` — goes through the D-048 maintenance
 * protocol (`02` §23.4.4, §23.4.4a; D-052 part B). No migration, schema, grant, policy or seed
 * file is modified.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PHASE_3_SEED,
  PHASE_3_SEED_IDS,
  PHASE_3_SEED_SUBJECTS,
  runInForceRlsMaintenanceWindow,
  runPhase3Seed,
} from '../prisma/seed.js';
import { IdentityBootstrapService } from '../src/identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../src/identity/application/tenant-request.pipeline.js';
import {
  IDENTITY_DATABASE,
  TenantContextRejectedError,
  type IdentityDatabase,
} from '../src/identity/infrastructure/identity-database.port.js';
import { closeTestApplication } from './support/create-test-application.js';
import { developmentBearer } from './support/development-token.js';
import {
  createDisposableDatabase,
  dropDisposableDatabase,
  generateDisposableDatabaseName,
  type DisposableDatabase,
} from './support/disposable-database.js';
import { createIdentityTestApplication } from './support/identity-test-application.js';
import { INSUFFICIENT_PRIVILEGE, connect, sqlStateOf } from './support/phase3-security-context.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

/** The canonical spelling of the tenant context header (`03` §3.2). */
const PRACTICE_HEADER = 'X-Practice-ID';

/**
 * One user per tenant role, each with exactly ONE `ACTIVE` membership carrying exactly ONE role
 * in the same `ACTIVE` practice.
 *
 * That shape is what makes the matrix assertion sharp: the callers differ in their assigned role
 * and in nothing else — same practice, same activity, same settings, no platform role — so a
 * difference in outcome can only come from `15` §5.
 */
const ROLE_CALLERS = [
  { role: 'PRACTICE_ADMIN', subject: 'dev|matrix-practice-admin', allowed: true },
  { role: 'PHYSICIAN', subject: 'dev|matrix-physician', allowed: false },
  { role: 'MPA', subject: 'dev|matrix-mpa', allowed: false },
  { role: 'BILLING_SPECIALIST', subject: 'dev|matrix-billing-specialist', allowed: false },
  { role: 'AUDITOR', subject: 'dev|matrix-auditor', allowed: false },
  { role: 'READ_ONLY', subject: 'dev|matrix-read-only', allowed: false },
] as const;

const FIXTURE = {
  /** `status = SUSPENDED` — the D-047 clause 10 rejection cannot be shown without it. */
  suspendedPractice: '11111111-1111-4111-8111-1111110000e9',

  /**
   * `SYSTEM_ADMIN` and NOTHING else: no membership in any practice. D-047 clause 11 and D-023
   * clause 10 require the platform role on its own to contribute nothing.
   */
  platformOnlyUser: '22222222-2222-4222-8222-2222220000e7',
  platformOnlySubject: 'dev|matrix-platform-only',
  platformOnlyAssignment: '66666666-6666-4666-8666-6666660000e7',

  /** `PRACTICE_ADMIN` in the SUSPENDED practice — eligible in every way except the status. */
  suspendedAdminUser: '22222222-2222-4222-8222-2222220000e8',
  suspendedAdminSubject: 'dev|matrix-suspended-admin',
  suspendedAdminMembership: '33333333-3333-4333-8333-3333330000e8',
  suspendedAdminRole: '44444444-4444-4444-8444-4444440000e8',

  /** `PRACTICE_ADMIN` in an ACTIVE practice, but the membership itself is inactive. */
  inactiveMemberUser: '22222222-2222-4222-8222-2222220000e9',
  inactiveMemberSubject: 'dev|matrix-inactive-member',
  inactiveMemberMembership: '33333333-3333-4333-8333-3333330000e9',
  inactiveMemberRole: '44444444-4444-4444-8444-4444440000e9',

  /**
   * A SECOND `ACTIVE` practice that a caller can genuinely be admitted to.
   *
   * The tenant-context isolation properties — one request must not leak `app.practice_id` into
   * the next, and two concurrent requests must not see each other's tenant — are unprovable
   * with a single admissible practice: every observation would be of the same practice id, and
   * a total leak would look exactly like correct behaviour. Two admissible practices are the
   * minimum that can tell the two apart.
   */
  secondPractice: '11111111-1111-4111-8111-1111110000d1',
  secondAdminUser: '22222222-2222-4222-8222-2222220000d1',
  secondAdminSubject: 'dev|matrix-second-admin',
  secondAdminMembership: '33333333-3333-4333-8333-3333330000d1',
  secondAdminRole: '44444444-4444-4444-8444-4444440000d1',

  /**
   * One caller with an ACTIVE `PRACTICE_ADMIN` membership in BOTH practices.
   *
   * The sharpest isolation subject there is: the same user, the same role and the same
   * credential, differing only in the practice each request names.
   */
  dualAdminUser: '22222222-2222-4222-8222-2222220000d2',
  dualAdminSubject: 'dev|matrix-dual-admin',
  dualAdminMembershipMatrix: '33333333-3333-4333-8333-3333330000d2',
  dualAdminMembershipSecond: '33333333-3333-4333-8333-3333330000d3',
  dualAdminRoleMatrix: '44444444-4444-4444-8444-4444440000d2',
  dualAdminRoleSecond: '44444444-4444-4444-8444-4444440000d3',
  secondPracticeSettings: '55555555-5555-4555-8555-5555550000d1',
} as const;

/** The practice every matrix caller is a member of. */
const MATRIX_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;

/** Deterministic fixture identifiers, derived from the caller index so nothing collides. */
function callerIds(index: number): {
  userId: string;
  membershipId: string;
  roleId: string;
} {
  const suffix = `0000e${index}`;

  return {
    userId: `22222222-2222-4222-8222-222222${suffix}`,
    membershipId: `33333333-3333-4333-8333-333333${suffix}`,
    roleId: `44444444-4444-4444-8444-444444${suffix}`,
  };
}

async function applyFixture(migrationUrl: string): Promise<void> {
  const client = await connect(migrationUrl);

  try {
    await runInForceRlsMaintenanceWindow(client, 'practices', async (trusted) => {
      // A SUSPENDED practice, populated with the sensitive columns on purpose: a negative test
      // that proves an unreachable column is only meaningful when the column holds a value.
      await trusted.query(
        `insert into "practices" ("id", "code", "name", "legal_name", "zsr_number", "gln_number",
                                  "default_language", "timezone", "status", "created_at", "updated_at")
         values ($1, 'demo-praxis-suspended', 'Demo Praxis Suspended', 'Demo Praxis Suspended AG',
                 'DEV-ZSR-0009', '7601000000009', 'de-CH', 'Europe/Zurich',
                 'SUSPENDED'::entity_status, now(), now())`,
        [FIXTURE.suspendedPractice],
      );

      // The second admissible practice of the isolation specs.
      await trusted.query(
        `insert into "practices" ("id", "code", "name", "legal_name", "zsr_number", "gln_number",
                                  "default_language", "timezone", "status", "created_at", "updated_at")
         values ($1, 'demo-praxis-zweit', 'Demo Praxis Zweit', 'Demo Praxis Zweit AG',
                 'DEV-ZSR-0011', '7601000000011', 'de-CH', 'Europe/Zurich',
                 'ACTIVE'::entity_status, now(), now())`,
        [FIXTURE.secondPractice],
      );
    });

    // Its own settings row, with BOTH conditional flags enabled — the opposite of the seeded
    // `demo-praxis` row. A derivation that read the wrong practice's settings would therefore
    // produce a different permission set, not merely the same one by luck (D-041, D-049).
    await runInForceRlsMaintenanceWindow(client, 'practice_settings', async (trusted) => {
      await trusted.query(
        `insert into "practice_settings" ("id", "practice_id", "billing_review_required",
                                          "allow_mpa_approval", "allow_billing_specialist_approval",
                                          "require_reason_for_manual_change", "ai_enabled",
                                          "axenita_export_enabled", "retention_policy_code",
                                          "configuration", "version", "updated_by", "updated_at")
         values ($1, $2, false, true, true, false, false, false, null, '{}'::jsonb, 1, null, now())`,
        [FIXTURE.secondPracticeSettings, FIXTURE.secondPractice],
      );
    });

    await runInForceRlsMaintenanceWindow(client, 'users', async (trusted) => {
      const users: readonly (readonly [string, string, string])[] = [
        ...ROLE_CALLERS.map(
          (caller, index) =>
            [callerIds(index).userId, caller.subject, `Dev Matrix ${caller.role}`] as const,
        ),
        [FIXTURE.platformOnlyUser, FIXTURE.platformOnlySubject, 'Dev Matrix Platform Only'],
        [FIXTURE.suspendedAdminUser, FIXTURE.suspendedAdminSubject, 'Dev Matrix Suspended Admin'],
        [FIXTURE.inactiveMemberUser, FIXTURE.inactiveMemberSubject, 'Dev Matrix Inactive Member'],
        [FIXTURE.secondAdminUser, FIXTURE.secondAdminSubject, 'Dev Matrix Second Admin'],
        [FIXTURE.dualAdminUser, FIXTURE.dualAdminSubject, 'Dev Matrix Dual Admin'],
      ];

      for (const [id, subject, name] of users) {
        await trusted.query(
          `insert into "users" ("id", "auth_subject", "email", "display_name",
                                "preferred_language", "status", "created_at", "updated_at")
           values ($1, $2, $3, $4, 'de-CH', 'ACTIVE'::entity_status, now(), now())`,
          [id, subject, `${subject.replace('dev|', '')}@example.invalid`, name],
        );
      }
    });

    // `practice_memberships` carries FORCE row level security from `013_rls_policies` onward
    // and is on the phase 4 half of the maintenance allowlist, so this fixture write uses the
    // same §23.4.3 protocol as every other trusted write here (§23.4.4a, D-052 clause B.2).
    await runInForceRlsMaintenanceWindow(client, 'practice_memberships', async (trusted) => {
      for (const [membershipId, practiceId, userId, active] of [
        ...ROLE_CALLERS.map(
          (_caller, index) =>
            [
              callerIds(index).membershipId,
              MATRIX_PRACTICE,
              callerIds(index).userId,
              true,
            ] as const,
        ),
        [
          FIXTURE.suspendedAdminMembership,
          FIXTURE.suspendedPractice,
          FIXTURE.suspendedAdminUser,
          true,
        ],
        [FIXTURE.inactiveMemberMembership, MATRIX_PRACTICE, FIXTURE.inactiveMemberUser, false],
        [FIXTURE.secondAdminMembership, FIXTURE.secondPractice, FIXTURE.secondAdminUser, true],
        [FIXTURE.dualAdminMembershipMatrix, MATRIX_PRACTICE, FIXTURE.dualAdminUser, true],
        [FIXTURE.dualAdminMembershipSecond, FIXTURE.secondPractice, FIXTURE.dualAdminUser, true],
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

    await runInForceRlsMaintenanceWindow(client, 'practice_membership_roles', async (trusted) => {
      for (const [roleId, practiceId, membershipId, role] of [
        ...ROLE_CALLERS.map(
          (caller, index) =>
            [
              callerIds(index).roleId,
              MATRIX_PRACTICE,
              callerIds(index).membershipId,
              caller.role,
            ] as const,
        ),
        [
          FIXTURE.suspendedAdminRole,
          FIXTURE.suspendedPractice,
          FIXTURE.suspendedAdminMembership,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.inactiveMemberRole,
          MATRIX_PRACTICE,
          FIXTURE.inactiveMemberMembership,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.secondAdminRole,
          FIXTURE.secondPractice,
          FIXTURE.secondAdminMembership,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.dualAdminRoleMatrix,
          MATRIX_PRACTICE,
          FIXTURE.dualAdminMembershipMatrix,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.dualAdminRoleSecond,
          FIXTURE.secondPractice,
          FIXTURE.dualAdminMembershipSecond,
          'PRACTICE_ADMIN',
        ],
      ] as const) {
        await trusted.query(
          `insert into "practice_membership_roles" ("id", "practice_id", "membership_id",
                                                    "role", "created_at", "updated_at")
           values ($1, $2, $3, $4::membership_role, now(), now())`,
          [roleId, practiceId, membershipId, role],
        );
      }
    });

    await runInForceRlsMaintenanceWindow(client, 'platform_role_assignments', async (trusted) => {
      await trusted.query(
        `insert into "platform_role_assignments" ("id", "user_id", "platform_role",
                                                  "granted_by", "granted_at",
                                                  "revoked_at", "revoked_by")
         values ($1, $2, 'SYSTEM_ADMIN'::platform_role, null, now(), null, null)`,
        [FIXTURE.platformOnlyAssignment, FIXTURE.platformOnlyUser],
      );
    });
  } finally {
    await client.end();
  }
}

describe('GET /api/v1/practices/{practiceId}', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;
  let appClient: Client;

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
    appClient = await connect(disposable.app);
  }, 180000);

  afterAll(async () => {
    await appClient.end();
    await closeTestApplication(app);

    if (disposable !== undefined) {
      await dropDisposableDatabase(disposable);
    }
  }, 60000);

  /**
   * One request. By default the path and `X-Practice-ID` name the same practice, which is the
   * canonical shape; `options.header` and `options.path` override each independently so that a
   * spec can produce a mismatch, a malformed header or no header at all.
   *
   * `options.header: null` means "send no header"; any string is sent verbatim, unvalidated.
   */
  async function readPractice(
    subject: string,
    practiceId: string,
    options: { header?: string | null; path?: string } = {},
  ): Promise<{ status: number; body: Record<string, unknown>; contentType: string }> {
    const headers: Record<string, string> = { Authorization: developmentBearer(subject) };
    const header = options.header === undefined ? practiceId : options.header;

    if (header !== null) {
      headers[PRACTICE_HEADER] = header;
    }

    const response = await request(app.getHttpServer())
      .get(`/api/v1/practices/${options.path ?? practiceId}`)
      .set(headers);

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      contentType: String(response.headers['content-type'] ?? ''),
    };
  }

  describe('authorisation matrix (15 §5, D-047 clause 11, 08 §24.14)', () => {
    it.each(
      ROLE_CALLERS.map(
        (caller) =>
          [
            `${caller.role} -> ${caller.allowed ? 200 : 403}`,
            caller.subject,
            caller.allowed,
          ] as const,
      ),
    )('%s', async (_label, subject, allowed) => {
      const { status, body } = await readPractice(subject, MATRIX_PRACTICE);

      if (allowed) {
        expect(status).toBe(200);
        expect(body['id']).toBe(MATRIX_PRACTICE);
      } else {
        expect(status).toBe(403);
        expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
      }
    });

    it('grants exactly one of the six tenant roles — no other combination is admitted', async () => {
      const granted: string[] = [];

      for (const caller of ROLE_CALLERS) {
        const { status } = await readPractice(caller.subject, MATRIX_PRACTICE);
        if (status === 200) {
          granted.push(caller.role);
        }
      }

      expect(granted).toEqual(['PRACTICE_ADMIN']);
    });

    it('refuses an ACTIVE membership with zero assigned roles (03 §3.7.2)', async () => {
      // The seeded physician is ACTIVE in `demo-praxis-nord` and carries no role at all.
      const { status, body } = await readPractice(
        PHASE_3_SEED_SUBJECTS.physician,
        PHASE_3_SEED_IDS.practiceNord,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('refuses SYSTEM_ADMIN without a tenant membership, for every practice', async () => {
      for (const practiceId of [
        PHASE_3_SEED_IDS.practiceDemo,
        PHASE_3_SEED_IDS.practiceNord,
        PHASE_3_SEED_IDS.practiceWithoutMembers,
      ]) {
        const { status, body } = await readPractice(FIXTURE.platformOnlySubject, practiceId);

        expect(status).toBe(403);
        expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
      }
    });

    it('admits SYSTEM_ADMIN with an ACTIVE membership carrying PRACTICE_ADMIN — through the tenant role only', async () => {
      // The seeded `practiceAdmin` holds BOTH: a current SYSTEM_ADMIN platform assignment and an
      // ACTIVE `demo-praxis` membership with PRACTICE_ADMIN.
      const { status, body } = await readPractice(
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_IDS.practiceDemo,
      );

      expect(status).toBe(200);
      expect(body['id']).toBe(PHASE_3_SEED_IDS.practiceDemo);

      // The platform role contributed nothing: the same platform role, held by a user WITHOUT a
      // tenant membership, produces 403 above. And `/me` shows the platform block's permissions
      // are exactly `tariff.manage` — `practice.read` is not among them (D-038 clauses 12-14).
      const me = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin));

      expect(
        (me.body as { platformRoles: { role: string; permissions: string[] }[] }).platformRoles,
      ).toEqual([{ role: 'SYSTEM_ADMIN', permissions: ['tariff.manage'] }]);
    });

    it('refuses the same SYSTEM_ADMIN for the practice where their membership is inactive', async () => {
      // `demo-praxis-nord`: same user, same platform role, inactive membership with READ_ONLY.
      const { status } = await readPractice(
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_IDS.practiceNord,
      );

      expect(status).toBe(403);
    });
  });

  describe('practice context and membership (03 §3.2, D-047 clauses 10 and 18)', () => {
    const admin = ROLE_CALLERS[0].subject;

    it('answers 400 PRACTICE_CONTEXT_REQUIRED without X-Practice-ID', async () => {
      const { status, body } = await readPractice(admin, MATRIX_PRACTICE, { header: null });

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'PRACTICE_CONTEXT_REQUIRED', status: 400 });
    });

    it.each([
      ['a plain word', 'not-a-uuid'],
      ['a truncated UUID', '11111111-1111-4111-8111-11111111100'],
      ['an unhyphenated UUID', '11111111111141118111111111111001'],
      ['a braced UUID', '{11111111-1111-4111-8111-111111111001}'],
      ['a SQL fragment', "11111111-1111-4111-8111-111111111001' or '1'='1"],
      ['whitespace only', '   '],
    ])('answers 400 PRACTICE_CONTEXT_INVALID for %s', async (_label, header) => {
      const { status, body } = await readPractice(admin, MATRIX_PRACTICE, { header });

      // Whitespace collapses to "no header at all", which is REQUIRED rather than INVALID.
      const expected =
        header.trim().length === 0 ? 'PRACTICE_CONTEXT_REQUIRED' : 'PRACTICE_CONTEXT_INVALID';

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: expected, status: 400 });
    });

    it('answers 403 when the path is not the practice of the header', async () => {
      const { status, body } = await readPractice(admin, MATRIX_PRACTICE, {
        path: PHASE_3_SEED_IDS.practiceNord,
      });

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for a non-existent practice', async () => {
      const absent = '11111111-1111-4111-8111-1111119999ff';
      const { status, body } = await readPractice(admin, absent);

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for an existing practice the caller is not a member of', async () => {
      // `demo-praxis-sued` exists and is ACTIVE; nobody holds a membership in it.
      const { status, body } = await readPractice(admin, PHASE_3_SEED_IDS.practiceWithoutMembers);

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers a non-existent practice and a foreign practice indistinguishably', async () => {
      const absent = await readPractice(admin, '11111111-1111-4111-8111-1111119999ff');
      const foreign = await readPractice(admin, PHASE_3_SEED_IDS.practiceWithoutMembers);

      expect(absent.status).toBe(foreign.status);
      expect(absent.body['code']).toBe(foreign.body['code']);
      expect(absent.body['detail']).toBe(foreign.body['detail']);
      expect(absent.body['title']).toBe(foreign.body['title']);
    });

    it('answers 403 for an INACTIVE membership that carries PRACTICE_ADMIN', async () => {
      const { status, body } = await readPractice(FIXTURE.inactiveMemberSubject, MATRIX_PRACTICE);

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for a non-ACTIVE practice with an ACTIVE PRACTICE_ADMIN membership', async () => {
      // Everything except the practice status is eligible, so this isolates D-047 clause 10.
      const { status, body } = await readPractice(
        FIXTURE.suspendedAdminSubject,
        FIXTURE.suspendedPractice,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 200 for an ACTIVE practice, an ACTIVE membership and PRACTICE_ADMIN', async () => {
      const { status, body } = await readPractice(admin, MATRIX_PRACTICE);

      expect(status).toBe(200);
      expect(body['status']).toBe('ACTIVE');
    });

    it('refuses an unknown and an INACTIVE user before the header is even considered', async () => {
      for (const subject of ['dev|not-provisioned', PHASE_3_SEED_SUBJECTS.inactive]) {
        const { status, body } = await readPractice(subject, MATRIX_PRACTICE, { header: null });

        // 403, not 400: `03` §3.7.1 admits the caller (step 2) before reading the header (step 3).
        expect(status).toBe(403);
        expect(body).toMatchObject({ code: 'ACCESS_DENIED' });
      }
    });

    it('answers 401 before anything else when no bearer credential is presented', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/practices/${MATRIX_PRACTICE}`)
        .set(PRACTICE_HEADER, MATRIX_PRACTICE);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    });
  });

  describe('response security (03, D-047 clauses 6 and 11)', () => {
    const admin = ROLE_CALLERS[0].subject;

    it('returns exactly the six accepted root keys', async () => {
      const { status, body } = await readPractice(admin, MATRIX_PRACTICE);

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual([
        'code',
        'defaultLanguage',
        'id',
        'name',
        'status',
        'timezone',
      ]);
      expect(body).toEqual({
        id: PHASE_3_SEED_IDS.practiceDemo,
        code: 'demo-praxis',
        name: 'Demo Praxis Zuerich',
        defaultLanguage: 'de-CH',
        timezone: 'Europe/Zurich',
        status: 'ACTIVE',
      });
    });

    it.each(['legal_name', 'zsr_number', 'gln_number', 'created_at', 'updated_at'])(
      'cannot select practices.%s at all — the grant, not the query, is the barrier (02 §20.2a)',
      async (column) => {
        // The route's projection is not the only thing keeping these columns out of a response:
        // `copilot_app` has no column grant for them, so a statement that merely NAMES one fails.
        // That control survives an application bug and a compromised credential alike
        // (D-047 clauses 6 and 20).
        expect(await sqlStateOf(appClient, `select "${column}" from "practices"`)).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      },
    );

    it('never renders zsrNumber, glnNumber or legalName, in any spelling or value', async () => {
      // The sensitive values the seed actually writes, taken from the seed itself rather than
      // copied — a negative assertion about an empty column would prove nothing. They cannot be
      // read back through any runtime credential, which is the point of the test above.
      const seeded = PHASE_3_SEED.practices.find(
        (practice) => practice.id === PHASE_3_SEED_IDS.practiceDemo,
      );

      expect(seeded?.zsrNumber).toBe('DEV-ZSR-0001');
      expect(seeded?.glnNumber).toBeTruthy();
      expect(seeded?.legalName).toBeTruthy();

      const { body } = await readPractice(admin, MATRIX_PRACTICE);
      const serialised = JSON.stringify(body);

      for (const forbidden of [
        'zsrNumber',
        'zsr_number',
        'glnNumber',
        'gln_number',
        'legalName',
        'legal_name',
        'createdAt',
        'created_at',
        'updatedAt',
        'updated_at',
        seeded?.zsrNumber ?? 'DEV-ZSR-0001',
        seeded?.glnNumber ?? '7601000000001',
        seeded?.legalName ?? 'Demo Praxis Zuerich AG',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('exposes no membership, role, permission, settings or identity information', async () => {
      const { body } = await readPractice(admin, MATRIX_PRACTICE);
      const serialised = JSON.stringify(body);

      for (const forbidden of [
        'membership',
        'roles',
        'permissions',
        'PRACTICE_ADMIN',
        'settings',
        'allowMpaApproval',
        'allow_mpa_approval',
        'authSubject',
        'auth_subject',
        'dev|',
        'version',
        callerIds(0).userId,
        callerIds(0).membershipId,
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('returns the practice of the path and header, never another one', async () => {
      // The seeded admin is a member of two practices; only the requested one may come back.
      const demo = await readPractice(
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_IDS.practiceDemo,
      );

      expect(demo.body['id']).toBe(PHASE_3_SEED_IDS.practiceDemo);
      expect(JSON.stringify(demo.body)).not.toContain(PHASE_3_SEED_IDS.practiceNord);
      expect(JSON.stringify(demo.body)).not.toContain('Demo Praxis Nord');
    });

    it('leaks no SQL, connection string, auth subject or stack trace in any rejection', async () => {
      const rejections = [
        await readPractice(admin, MATRIX_PRACTICE, { header: null }),
        await readPractice(admin, MATRIX_PRACTICE, { header: 'not-a-uuid' }),
        await readPractice(admin, PHASE_3_SEED_IDS.practiceWithoutMembers),
        await readPractice(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
      ];

      for (const rejection of rejections) {
        const serialised = JSON.stringify(rejection.body);

        expect(serialised).not.toContain('select ');
        expect(serialised).not.toContain('postgresql://');
        expect(serialised).not.toContain('auth_subject');
        expect(serialised).not.toContain('dev|');
        expect(serialised).not.toContain('at Object.');
        expect(serialised).not.toContain('practice_memberships');
      }
    });

    it('renders every problem document through the single Problem Details filter (D-008)', async () => {
      for (const rejection of [
        { practiceId: MATRIX_PRACTICE, header: null },
        { practiceId: MATRIX_PRACTICE, header: 'not-a-uuid' },
        { practiceId: PHASE_3_SEED_IDS.practiceWithoutMembers, header: undefined },
      ] as const) {
        const { body, contentType } = await readPractice(admin, rejection.practiceId, {
          header: rejection.header,
        });

        expect(contentType).toContain('application/problem+json');
        expect(body).toMatchObject({ instance: `/api/v1/practices/${rejection.practiceId}` });
        expect(body).toHaveProperty('requestId');
        expect(body).toHaveProperty('type');
        expect(body).toHaveProperty('title');
      }
    });
  });

  describe('transaction and context isolation (D-047 clause 8, 08 §21.5.7)', () => {
    const admin = ROLE_CALLERS[0].subject;

    it('leaves no auth subject or user context on the pool after a successful request', async () => {
      expect((await readPractice(admin, MATRIX_PRACTICE)).status).toBe(200);

      // A separate connection, and the same pool the application uses: every `app.*` value is
      // transaction local, so nothing may survive.
      const context = await appClient.query<{ subject: string | null; user: string | null }>(
        `select nullif(current_setting('app.auth_subject', true), '') as "subject",
                nullif(current_setting('app.user_id', true), '')      as "user"`,
      );

      expect(context.rows[0]?.subject).toBeNull();
      expect(context.rows[0]?.user).toBeNull();
      // Without a context, the bootstrap and self policies of 02 §17.5 expose nobody.
      expect((await appClient.query('select "id" from "users"')).rowCount).toBe(0);
      expect((await appClient.query('select "id" from "practices"')).rowCount).toBe(0);
    });

    it('does not let one request context leak into the next', async () => {
      const sequence = [
        [ROLE_CALLERS[0].subject, 200],
        [ROLE_CALLERS[1].subject, 403],
        [ROLE_CALLERS[0].subject, 200],
        [ROLE_CALLERS[4].subject, 403],
        [ROLE_CALLERS[0].subject, 200],
      ] as const;

      for (const [subject, expected] of sequence) {
        const { status } = await readPractice(subject, MATRIX_PRACTICE);
        expect(status).toBe(expected);
      }
    });

    it('does not let a denied practice request contaminate the next valid one', async () => {
      const denied = await readPractice(admin, PHASE_3_SEED_IDS.practiceWithoutMembers);
      expect(denied.status).toBe(403);

      const allowed = await readPractice(admin, MATRIX_PRACTICE);
      expect(allowed.status).toBe(200);
      expect(allowed.body['id']).toBe(MATRIX_PRACTICE);
    });

    it('rolls the whole chain back when the practice is not ACTIVE', async () => {
      const denied = await readPractice(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice);
      expect(denied.status).toBe(403);

      // The rollback discarded `app.auth_subject` and `app.user_id` — otherwise this read on the
      // application pool would expose a user row — and the refused practice is untouched.
      expect((await appClient.query('select "id" from "users"')).rowCount).toBe(0);

      const stillSuspended = await appClient.query<{ status: string }>(
        `select "status"::text as "status" from "practices" where "id" = $1`,
        [FIXTURE.suspendedPractice],
      );
      // Zero rows: without a user context the §17.6 membership policy exposes nothing at all.
      expect(stillSuspended.rowCount).toBe(0);

      // And the very next request of a different, eligible caller is unaffected.
      const allowed = await readPractice(ROLE_CALLERS[0].subject, MATRIX_PRACTICE);
      expect(allowed.status).toBe(200);
    });

    it('keeps concurrent requests of different users and practices isolated', async () => {
      const [matrixAdmin, seedAdmin, denied, physician] = await Promise.all([
        readPractice(ROLE_CALLERS[0].subject, MATRIX_PRACTICE),
        readPractice(PHASE_3_SEED_SUBJECTS.practiceAdmin, PHASE_3_SEED_IDS.practiceDemo),
        readPractice(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
        readPractice(ROLE_CALLERS[1].subject, MATRIX_PRACTICE),
      ]);

      expect(matrixAdmin.status).toBe(200);
      expect(matrixAdmin.body['id']).toBe(MATRIX_PRACTICE);
      expect(seedAdmin.status).toBe(200);
      expect(seedAdmin.body['id']).toBe(PHASE_3_SEED_IDS.practiceDemo);
      expect(denied.status).toBe(403);
      expect(physician.status).toBe(403);
    });
  });

  /**
   * THE INVERTED PHASE BOUNDARY.
   *
   * Until this slice, this block asserted the opposite: that the route established NO database
   * practice context, with a comment saying a later phase 4 application slice would have to
   * invert it. This is that slice, so the assertion is converted rather than deleted — the
   * security property it protects (a tenant route's context is exactly the requested practice,
   * and it never outlives its transaction) is stronger now, not absent.
   */
  describe('tenant context establishment (03 §3.7.1 steps 5-7, D-047 clause 10, D-033)', () => {
    it('establishes app.practice_id for exactly the admitted practice, inside the transaction', async () => {
      const bootstrap = app.get(IdentityBootstrapService);
      const pipeline = app.get(TenantRequestPipeline);

      // `app.practice_id` is transaction local, so it cannot be observed from outside the
      // transaction — by construction, and that is the property. It is therefore observed
      // through the two policies that read it, which is a database-enforced observation rather
      // than an application claim:
      //
      //   - `practice_settings_select` (§17.1) exposes a row ONLY for `app.practice_id`;
      //   - `practices_context_narrow` (§17.6) is RESTRICTIVE and, once the GUC exists, hides
      //     every practice except that one.
      const observed = await bootstrap.runAuthenticatedSession(
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        async (session, user) => {
          // The seeded admin is a member of `demo-praxis-nord` too, so it is visible while no
          // tenant context exists.
          const nordBefore = await session.findRequestedPractice(PHASE_3_SEED_IDS.practiceNord);
          const settingsBefore = await session.findConditionalSettings([
            PHASE_3_SEED_IDS.practiceDemo,
          ]);

          const admitted = await pipeline.admit(session, user.id, {
            requestedPracticeId: PHASE_3_SEED_IDS.practiceDemo,
            practiceContextHeader: PHASE_3_SEED_IDS.practiceDemo,
            requiredPermission: 'practice.read',
          });

          return {
            admittedPractice: admitted.practiceId,
            nordBefore: nordBefore?.id,
            settingsBefore: settingsBefore.length,
            // Established: the tenant row is now readable, and it is the requested one.
            settingsAfter: (
              await session.findConditionalSettings([PHASE_3_SEED_IDS.practiceDemo])
            ).map((row) => row.practiceId),
            // Established and EQUAL to the requested practice: another practice of the same
            // caller has become invisible to the RESTRICTIVE narrowing.
            nordAfter: (await session.findRequestedPractice(PHASE_3_SEED_IDS.practiceNord))?.id,
            demoAfter: (await session.findRequestedPractice(PHASE_3_SEED_IDS.practiceDemo))?.id,
          };
        },
      );

      expect(observed).toEqual({
        admittedPractice: PHASE_3_SEED_IDS.practiceDemo,
        nordBefore: PHASE_3_SEED_IDS.practiceNord,
        settingsBefore: 0,
        settingsAfter: [PHASE_3_SEED_IDS.practiceDemo],
        nordAfter: undefined,
        demoAfter: PHASE_3_SEED_IDS.practiceDemo,
      });
    });

    it('leaves no app.practice_id on the pooled connection after COMMIT', async () => {
      expect((await readPractice(ROLE_CALLERS[0].subject, MATRIX_PRACTICE)).status).toBe(200);

      // The same pool the application uses, on a separate connection. `set_request_context`
      // writes the GUC with `set_config(..., true)`, so it is discarded at COMMIT (02 §16.2,
      // 08 §21.5.7) and no pooled connection can inherit it.
      const context = await appClient.query<{ practice: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
      // And without a context the tenant policy of §17.1 exposes nothing at all.
      expect(
        (await appClient.query('select "practice_id" from "practice_settings"')).rowCount,
      ).toBe(0);
    });

    it('leaves no app.practice_id after a ROLLBACK that followed an established context', async () => {
      // PHYSICIAN is an ACTIVE member of the ACTIVE practice, so this request is refused at
      // step 10 — AFTER the context was established — which is the only refusal that can leave
      // a tenant context behind if the transaction did not discard it.
      expect((await readPractice(ROLE_CALLERS[1].subject, MATRIX_PRACTICE)).status).toBe(403);

      const context = await appClient.query<{ practice: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
      expect(
        (await appClient.query('select "practice_id" from "practice_settings"')).rowCount,
      ).toBe(0);
    });

    it('keeps sequential requests for DIFFERENT practices isolated', async () => {
      // One caller, one credential, one role — only the requested practice differs. A context
      // that survived a request would make the second response the first one's practice.
      const sequence = [
        MATRIX_PRACTICE,
        FIXTURE.secondPractice,
        FIXTURE.secondPractice,
        MATRIX_PRACTICE,
        FIXTURE.secondPractice,
      ];

      for (const practiceId of sequence) {
        const { status, body } = await readPractice(FIXTURE.dualAdminSubject, practiceId);

        expect(status).toBe(200);
        expect(body['id']).toBe(practiceId);
      }
    });

    it('keeps a refused tenant request from contaminating the next admitted one', async () => {
      const denied = await readPractice(FIXTURE.dualAdminSubject, FIXTURE.suspendedPractice);
      expect(denied.status).toBe(403);

      const allowed = await readPractice(FIXTURE.dualAdminSubject, FIXTURE.secondPractice);
      expect(allowed.status).toBe(200);
      expect(allowed.body['id']).toBe(FIXTURE.secondPractice);
    });

    it('keeps concurrent requests for DIFFERENT practices isolated', async () => {
      // Issued together, so they interleave on the pool. Each answer must be the practice its
      // own request named — a shared or leaked `app.practice_id` would cross them.
      const results = await Promise.all([
        readPractice(FIXTURE.dualAdminSubject, MATRIX_PRACTICE),
        readPractice(FIXTURE.dualAdminSubject, FIXTURE.secondPractice),
        readPractice(FIXTURE.secondAdminSubject, FIXTURE.secondPractice),
        readPractice(ROLE_CALLERS[0].subject, MATRIX_PRACTICE),
        readPractice(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
        readPractice(FIXTURE.dualAdminSubject, MATRIX_PRACTICE),
      ]);

      const expected = [
        MATRIX_PRACTICE,
        FIXTURE.secondPractice,
        FIXTURE.secondPractice,
        MATRIX_PRACTICE,
        undefined,
        MATRIX_PRACTICE,
      ];

      expect(results.map((result) => result.body['id'])).toEqual(expected);
      expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200, 403, 200]);
    });

    it('translates a real SQLSTATE 42501 from set_request_context into the typed refusal', async () => {
      // The application layer never inspects a driver error: the adapter raises
      // `TenantContextRejectedError` for THIS operation and this SQLSTATE, and the pipeline
      // turns that ONE type into the shared 403. This half of the mapping is proven here,
      // against a real refusal by the real function; the other half — that the type becomes
      // `403 ACCESS_DENIED` with nothing of the SQLSTATE in it — is proven in
      // `src/identity/application/tenant-request.pipeline.spec.ts`.
      const database = app.get<IdentityDatabase>(IDENTITY_DATABASE);

      const refusals = [
        // No membership at all in the requested practice (D-033 clause 11).
        [callerIds(0).userId, ROLE_CALLERS[0].subject, PHASE_3_SEED_IDS.practiceWithoutMembers],
        // A membership that exists but is not ACTIVE — the deactivation race, exactly.
        [FIXTURE.inactiveMemberUser, FIXTURE.inactiveMemberSubject, MATRIX_PRACTICE],
      ] as const;

      for (const [userId, subject, practiceId] of refusals) {
        const failure = await database
          .runBootstrapTransaction(async (session) => {
            await session.setAuthSubjectContext(subject);
            await session.findUsersForVerifiedSubject();
            await session.setUserContext(userId);
            await session.setRequestContext(practiceId);
          })
          .then(
            () => undefined,
            (error: unknown) => error,
          );

        expect(failure).toBeInstanceOf(TenantContextRejectedError);
      }
    });

    it('keeps GET /me header-independent and D-053 compatible', async () => {
      // `/me` is tenant NEUTRAL (03 §3.4): it requires no `X-Practice-ID`, reads none, and no
      // client-supplied practice id participates in it (D-053 clause D.6). Introducing the
      // tenant pipeline must not have changed that in either direction.
      const bodies: string[] = [];

      for (const header of [
        undefined,
        PHASE_3_SEED_IDS.practiceDemo,
        PHASE_3_SEED_IDS.practiceWithoutMembers,
        'not-a-uuid',
      ]) {
        const pending = request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin));

        const response = await (header === undefined
          ? pending
          : pending.set(PRACTICE_HEADER, header));

        expect(response.status).toBe(200);
        bodies.push(JSON.stringify(response.body));
      }

      // Byte identical: a malformed or foreign header changes neither the status nor one field.
      expect(new Set(bodies).size).toBe(1);
    });

    it('registers no settings route under the practice path (D-049)', async () => {
      for (const path of [`/api/v1/practices/${MATRIX_PRACTICE}/settings`, '/api/v1/practices']) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', developmentBearer(ROLE_CALLERS[0].subject))
          .set(PRACTICE_HEADER, MATRIX_PRACTICE);

        // There is no list or directory of practices either (D-047 clause 11).
        expect(response.status).toBe(404);
      }
    });
  });
});

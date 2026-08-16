/**
 * `GET /api/v1/practices/{practiceId}` against a real PostgreSQL — the phase 3 tenant contract
 * end to end.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1 and the accepted `GET /practices/{practiceId}`
 * section; `08` §21.5, §24.14 and §24.17; `15` §5; D-038 clauses 12–14; D-047 clauses 8, 10, 11
 * and 18; D-049.
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

  describe('phase boundary (D-047 clause 16, D-049)', () => {
    it('establishes no database practice context, even though set_request_context now exists', async () => {
      // `013_rls_policies` creates the function (02 §16.2.3), so its absence is no longer the
      // assertion. This route is still an APPLICATION-level tenant check: it validates
      // `X-Practice-ID` and the membership itself, and does not yet establish `app.practice_id`.
      // Wiring the route to `set_request_context` belongs to a later phase 4 application slice,
      // which this database slice deliberately does not pull forward (D-047 clause 16).
      expect((await readPractice(ROLE_CALLERS[0].subject, MATRIX_PRACTICE)).status).toBe(200);

      const functions = await appClient.query<{ name: string | null }>(
        `select to_regprocedure('app_security.set_request_context(uuid)')::text as "name"`,
      );

      expect(functions.rows[0]?.name).toBe('app_security.set_request_context(uuid)');

      // No tenant scope survives on the pool, and none was established in the first place.
      const context = await appClient.query<{ practice: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
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

/**
 * `GET /api/v1/practices/{practiceId}/settings` against a real PostgreSQL — the frozen settings
 * contract end to end, including the tenant execution boundary and the `ETag` channel.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1 and §28.5; `02` §16.2.3, §17.1, §17.6, §20.2b and
 * §20.2b.1; `08` §21.5, §24.14 and §24.17; `15` §5; D-033 clauses 9–12; D-038 clauses 12–14;
 * D-044; D-047 clauses 8, 10, 11 and 18; D-049; D-053 parts A, C and D; D-054 clause 12.
 *
 * WHY THIS SUITE AND NOT AN `*.e2e-spec.ts`
 *
 * The properties under test are database properties: the `02` §17.1 tenant policy that makes a
 * foreign settings row invisible and an un-contexted read empty, the NINE-column grant of
 * §20.2b.1 that makes `id`, `configuration`, `updated_at` and `updated_by` unreachable, and the
 * transaction-local `app.practice_id` that a rejected or failed request must roll back. A stubbed
 * database would prove none of them, and `pnpm test:e2e` boots the application with stub
 * dependency listeners and no PostgreSQL at all. This suite therefore runs against a disposable
 * database, never the development database `copilot` and never the shared `copilot_test` (`08` §3).
 *
 * WHY IT OWNS ITS OWN DATABASE
 *
 * Three of its fixtures cannot exist in the shared one. Proving the complete `15` §5 column needs
 * one user per tenant role; proving that the `ETag` is the row's VERSION and not a hash of its
 * rendering needs two practices whose settings differ while their versions agree; and proving the
 * missing-row invariant needs an `ACTIVE` practice with an `ACTIVE` `PRACTICE_ADMIN` membership
 * and NO `practice_settings` row at all — a state the frozen seed deliberately never produces.
 * Adding any of them to the SHARED disposable database would invalidate the row-count and
 * isolation assertions the other security specs make. This suite therefore creates, migrates,
 * seeds and drops a disposable database of its own, exactly like `phase3-practice-read.security.ts`
 * does and for the same reason.
 *
 * All fixture writes use the canonical paths: `practices`, `users`, `practice_memberships`,
 * `practice_membership_roles`, `practice_settings` and `platform_role_assignments` all carry FORCE
 * row level security, so every trusted write goes through the D-048 maintenance protocol
 * (`02` §23.4.4, §23.4.4a; D-052 part B). NO migration, schema, grant, policy or seed file is
 * modified, and the missing settings row is NEVER repaired — repairing it would delete the very
 * fixture the invariant spec exists to exercise.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
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

/** The eight members of the frozen representation (D-053 clause A.1), sorted. */
const FROZEN_KEYS = [
  'aiEnabled',
  'allowBillingSpecialistApproval',
  'allowMpaApproval',
  'axenitaExportEnabled',
  'billingReviewRequired',
  'practiceId',
  'requireReasonForManualChange',
  'retentionPolicyCode',
];

/**
 * One user per tenant role, each with exactly ONE `ACTIVE` membership carrying exactly ONE role
 * in the same `ACTIVE` practice.
 *
 * That shape is what makes the matrix assertion sharp: the callers differ in their assigned role
 * and in nothing else — same practice, same activity, same settings, no platform role — so a
 * difference in outcome can only come from `15` §5 and D-044.
 */
const ROLE_CALLERS = [
  { role: 'PRACTICE_ADMIN', subject: 'dev|settings-practice-admin', allowed: true },
  { role: 'PHYSICIAN', subject: 'dev|settings-physician', allowed: false },
  { role: 'MPA', subject: 'dev|settings-mpa', allowed: false },
  { role: 'BILLING_SPECIALIST', subject: 'dev|settings-billing-specialist', allowed: false },
  { role: 'AUDITOR', subject: 'dev|settings-auditor', allowed: false },
  { role: 'READ_ONLY', subject: 'dev|settings-read-only', allowed: false },
] as const;

const FIXTURE = {
  /**
   * PRACTICE B — a second admissible practice whose settings row differs from A's in EVERY
   * business field AND in its `version`.
   *
   * Tenant isolation is unprovable with a single admissible practice: every observation would be
   * of the same practice and a total leak would look exactly like correct behaviour. Making the
   * VALUES differ too is what turns "the right practice id came back" into "the right practice's
   * settings came back".
   */
  practiceB: '11111111-1111-4111-8111-1111110000f1',
  settingsB: '55555555-5555-4555-8555-5555550000f1',

  /**
   * PRACTICE C — settings that differ from A's in every business field, with the SAME `version`.
   *
   * This is the fixture that separates a version tag from a content tag. A and C render different
   * documents and must nevertheless carry the SAME `ETag`, because their rows carry the same
   * version; a content-hashed tag would necessarily differ. B then differs from both, because its
   * version does. Neither half proves it alone.
   */
  practiceC: '11111111-1111-4111-8111-1111110000f2',
  settingsC: '55555555-5555-4555-8555-5555550000f2',

  /**
   * PRACTICE D — `ACTIVE`, with an `ACTIVE` `PRACTICE_ADMIN` membership, and NO settings row.
   *
   * The database state the owner decision for this gate is about. Everything the route checks
   * passes: the user is admitted, the practice is admitted, the membership is ACTIVE twice over,
   * the tenant context is established and `practice.settings.read` is derived and held. Only the
   * representation is absent, which is a broken database and not an authorisation outcome.
   */
  practiceD: '11111111-1111-4111-8111-1111110000f3',
  settingsLessUser: '22222222-2222-4222-8222-2222220000f3',
  settingsLessSubject: 'dev|settings-no-settings-row',
  settingsLessMembership: '33333333-3333-4333-8333-3333330000f3',
  settingsLessRole: '44444444-4444-4444-8444-4444440000f3',

  /** `status = SUSPENDED` — the D-047 clause 10 rejection cannot be shown without it. */
  suspendedPractice: '11111111-1111-4111-8111-1111110000f4',
  suspendedSettings: '55555555-5555-4555-8555-5555550000f4',
  suspendedAdminUser: '22222222-2222-4222-8222-2222220000f4',
  suspendedAdminSubject: 'dev|settings-suspended-admin',
  suspendedAdminMembership: '33333333-3333-4333-8333-3333330000f4',
  suspendedAdminRole: '44444444-4444-4444-8444-4444440000f4',

  /** `PRACTICE_ADMIN` in an ACTIVE practice, but the membership itself is inactive. */
  inactiveMemberUser: '22222222-2222-4222-8222-2222220000f5',
  inactiveMemberSubject: 'dev|settings-inactive-member',
  inactiveMemberMembership: '33333333-3333-4333-8333-3333330000f5',
  inactiveMemberRole: '44444444-4444-4444-8444-4444440000f5',

  /**
   * `SYSTEM_ADMIN` and NOTHING else: no membership in any practice. D-047 clause 11 and D-023
   * clause 10 require the platform role on its own to contribute nothing — including no settings.
   */
  platformOnlyUser: '22222222-2222-4222-8222-2222220000f6',
  platformOnlySubject: 'dev|settings-platform-only',
  platformOnlyAssignment: '66666666-6666-4666-8666-6666660000f6',

  /**
   * One caller with an ACTIVE `PRACTICE_ADMIN` membership in A, B and C.
   *
   * The sharpest isolation subject there is: the same user, the same role and the same credential,
   * differing only in the practice each request names.
   */
  multiAdminUser: '22222222-2222-4222-8222-2222220000f7',
  multiAdminSubject: 'dev|settings-multi-admin',
  multiAdminMembershipA: '33333333-3333-4333-8333-3333330000f7',
  multiAdminMembershipB: '33333333-3333-4333-8333-3333330000f8',
  multiAdminMembershipC: '33333333-3333-4333-8333-3333330000f9',
  multiAdminRoleA: '44444444-4444-4444-8444-4444440000f7',
  multiAdminRoleB: '44444444-4444-4444-8444-4444440000f8',
  multiAdminRoleC: '44444444-4444-4444-8444-4444440000f9',
} as const;

/** PRACTICE A — the seeded `demo-praxis`, every matrix caller's practice. */
const PRACTICE_A = PHASE_3_SEED_IDS.practiceDemo;

/**
 * The settings the frozen seed writes for every seeded practice (`02` §23.2), reproduced as the
 * EXPECTATION for practice A. Version `1` is the column default and the seed never moves it.
 */
const SETTINGS_A = {
  practiceId: PRACTICE_A,
  billingReviewRequired: true,
  allowMpaApproval: false,
  allowBillingSpecialistApproval: false,
  requireReasonForManualChange: true,
  aiEnabled: false,
  axenitaExportEnabled: false,
  retentionPolicyCode: 'DEV-RETENTION-STANDARD',
} as const;

/** Practice B — every business field inverted against A, and a different version. */
const SETTINGS_B = {
  practiceId: FIXTURE.practiceB,
  billingReviewRequired: false,
  allowMpaApproval: true,
  allowBillingSpecialistApproval: true,
  requireReasonForManualChange: false,
  aiEnabled: true,
  axenitaExportEnabled: true,
  retentionPolicyCode: 'DEV-RETENTION-EXTENDED',
} as const;

/**
 * Practice C — a third distinct document, and `retentionPolicyCode` NULL.
 *
 * The nullable column is exercised here rather than anywhere else: the key set of the response
 * must stay the same eight names whether the column holds a value or not.
 */
const SETTINGS_C = {
  practiceId: FIXTURE.practiceC,
  billingReviewRequired: false,
  allowMpaApproval: true,
  allowBillingSpecialistApproval: false,
  requireReasonForManualChange: false,
  aiEnabled: true,
  axenitaExportEnabled: false,
  retentionPolicyCode: null,
} as const;

/** The version each practice's row carries. A and C agree on purpose; B does not. */
const VERSIONS = { a: 1, b: 3, c: 1 } as const;

/** Deterministic fixture identifiers, derived from the caller index so nothing collides. */
function callerIds(index: number): { userId: string; membershipId: string; roleId: string } {
  const suffix = `0000a${index}`;

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
      for (const [id, code, name, zsr, gln, status] of [
        [
          FIXTURE.practiceB,
          'demo-praxis-beta',
          'Demo Praxis Beta',
          'DEV-ZSR-0021',
          '7601000000021',
          'ACTIVE',
        ],
        [
          FIXTURE.practiceC,
          'demo-praxis-gamma',
          'Demo Praxis Gamma',
          'DEV-ZSR-0022',
          '7601000000022',
          'ACTIVE',
        ],
        // The practice whose settings row is deliberately never created.
        [
          FIXTURE.practiceD,
          'demo-praxis-delta',
          'Demo Praxis Delta',
          'DEV-ZSR-0023',
          '7601000000023',
          'ACTIVE',
        ],
        [
          FIXTURE.suspendedPractice,
          'demo-praxis-susp',
          'Demo Praxis Susp',
          'DEV-ZSR-0024',
          '7601000000024',
          'SUSPENDED',
        ],
      ] as const) {
        // The sensitive columns are populated on purpose: a negative test that proves an
        // unreachable column is only meaningful when the column holds a value.
        await trusted.query(
          `insert into "practices" ("id", "code", "name", "legal_name", "zsr_number", "gln_number",
                                    "default_language", "timezone", "status", "created_at", "updated_at")
           values ($1, $2, $3, $4, $5, $6, 'de-CH', 'Europe/Zurich', $7::entity_status, now(), now())`,
          [id, code, name, `${name} AG`, zsr, gln, status],
        );
      }
    });

    // NOTE: practice D receives NO `practice_settings` row here, and none is added anywhere else
    // in this file. That absence IS the fixture of the missing-row invariant spec.
    await runInForceRlsMaintenanceWindow(client, 'practice_settings', async (trusted) => {
      for (const [id, settings, version] of [
        [FIXTURE.settingsB, SETTINGS_B, VERSIONS.b],
        [FIXTURE.settingsC, SETTINGS_C, VERSIONS.c],
        [FIXTURE.suspendedSettings, { ...SETTINGS_B, practiceId: FIXTURE.suspendedPractice }, 9],
      ] as const) {
        await trusted.query(
          `insert into "practice_settings" ("id", "practice_id", "billing_review_required",
                                            "allow_mpa_approval", "allow_billing_specialist_approval",
                                            "require_reason_for_manual_change", "ai_enabled",
                                            "axenita_export_enabled", "retention_policy_code",
                                            "configuration", "version", "updated_by", "updated_at")
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   '{"secret":"never-rendered"}'::jsonb, $10, null, now())`,
          [
            id,
            settings.practiceId,
            settings.billingReviewRequired,
            settings.allowMpaApproval,
            settings.allowBillingSpecialistApproval,
            settings.requireReasonForManualChange,
            settings.aiEnabled,
            settings.axenitaExportEnabled,
            settings.retentionPolicyCode,
            version,
          ],
        );
      }
    });

    await runInForceRlsMaintenanceWindow(client, 'users', async (trusted) => {
      const users: readonly (readonly [string, string, string])[] = [
        ...ROLE_CALLERS.map(
          (caller, index) =>
            [callerIds(index).userId, caller.subject, `Dev Settings ${caller.role}`] as const,
        ),
        [FIXTURE.settingsLessUser, FIXTURE.settingsLessSubject, 'Dev Settings Without Row'],
        [FIXTURE.suspendedAdminUser, FIXTURE.suspendedAdminSubject, 'Dev Settings Suspended Admin'],
        [FIXTURE.inactiveMemberUser, FIXTURE.inactiveMemberSubject, 'Dev Settings Inactive Member'],
        [FIXTURE.platformOnlyUser, FIXTURE.platformOnlySubject, 'Dev Settings Platform Only'],
        [FIXTURE.multiAdminUser, FIXTURE.multiAdminSubject, 'Dev Settings Multi Admin'],
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

    await runInForceRlsMaintenanceWindow(client, 'practice_memberships', async (trusted) => {
      for (const [membershipId, practiceId, userId, active] of [
        ...ROLE_CALLERS.map(
          (_caller, index) =>
            [callerIds(index).membershipId, PRACTICE_A, callerIds(index).userId, true] as const,
        ),
        [FIXTURE.settingsLessMembership, FIXTURE.practiceD, FIXTURE.settingsLessUser, true],
        [
          FIXTURE.suspendedAdminMembership,
          FIXTURE.suspendedPractice,
          FIXTURE.suspendedAdminUser,
          true,
        ],
        [FIXTURE.inactiveMemberMembership, PRACTICE_A, FIXTURE.inactiveMemberUser, false],
        [FIXTURE.multiAdminMembershipA, PRACTICE_A, FIXTURE.multiAdminUser, true],
        [FIXTURE.multiAdminMembershipB, FIXTURE.practiceB, FIXTURE.multiAdminUser, true],
        [FIXTURE.multiAdminMembershipC, FIXTURE.practiceC, FIXTURE.multiAdminUser, true],
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
              PRACTICE_A,
              callerIds(index).membershipId,
              caller.role,
            ] as const,
        ),
        [
          FIXTURE.settingsLessRole,
          FIXTURE.practiceD,
          FIXTURE.settingsLessMembership,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.suspendedAdminRole,
          FIXTURE.suspendedPractice,
          FIXTURE.suspendedAdminMembership,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.inactiveMemberRole,
          PRACTICE_A,
          FIXTURE.inactiveMemberMembership,
          'PRACTICE_ADMIN',
        ],
        [FIXTURE.multiAdminRoleA, PRACTICE_A, FIXTURE.multiAdminMembershipA, 'PRACTICE_ADMIN'],
        [
          FIXTURE.multiAdminRoleB,
          FIXTURE.practiceB,
          FIXTURE.multiAdminMembershipB,
          'PRACTICE_ADMIN',
        ],
        [
          FIXTURE.multiAdminRoleC,
          FIXTURE.practiceC,
          FIXTURE.multiAdminMembershipC,
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

describe('GET /api/v1/practices/{practiceId}/settings', () => {
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

  interface SettingsResponse {
    readonly status: number;
    readonly body: Record<string, unknown>;
    readonly etag: string | undefined;
    readonly contentType: string;
  }

  /**
   * One settings request. By default the path and `X-Practice-ID` name the same practice, which
   * is the canonical shape; `options.header` and `options.path` override each independently so
   * that a spec can produce a mismatch, a malformed header or no header at all.
   *
   * `options.header: null` means "send no header"; any string is sent verbatim, unvalidated.
   */
  async function readSettings(
    subject: string,
    practiceId: string,
    options: { header?: string | null; path?: string } = {},
  ): Promise<SettingsResponse> {
    const headers: Record<string, string> = { Authorization: developmentBearer(subject) };
    const header = options.header === undefined ? practiceId : options.header;

    if (header !== null) {
      headers[PRACTICE_HEADER] = header;
    }

    const response = await request(app.getHttpServer())
      .get(`/api/v1/practices/${options.path ?? practiceId}/settings`)
      .set(headers);

    const etag = response.headers['etag'];

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      etag: typeof etag === 'string' ? etag : undefined,
      contentType: String(response.headers['content-type'] ?? ''),
    };
  }

  const admin = ROLE_CALLERS[0].subject;

  /**
   * Asserts that a response carries NO canonical version tag.
   *
   * Deliberately not "carries no `ETag` at all". Express writes a WEAK, content-hashed tag onto
   * any JSON response that does not already have one, including a Problem Details document, and
   * that generic behaviour is not this slice's to change. What must never happen is that a
   * refused or failed request hands back the resource's VERSION — the strong quoted-integer tag
   * of D-053 clause A.2 — because that would disclose the state of a resource the caller was not
   * allowed to read.
   */
  function expectNoVersionTag(response: SettingsResponse): void {
    expect(response.etag ?? '').not.toMatch(/^"\d+"$/);
  }

  /**
   * Counts the `practice_settings` rows visible for one practice, on the APPLICATION pool.
   *
   * The migration identity cannot be used for this: `practice_settings` carries FORCE row level
   * security, the owner is subject to it too, and no policy names `copilot_migrator` — so a
   * trusted read returns zero rows for every practice and would prove nothing. The runtime
   * credential with an established `app.practice_id` is the only identity that can see the table
   * at all, which makes this the honest observation as well as the only available one. `02` §25.1.1
   * permits a spec to set the GUC directly for policy verification; the transaction is always
   * rolled back.
   */
  async function settingsRowCountUnderContext(practiceId: string): Promise<number> {
    await appClient.query('begin');

    try {
      await appClient.query(`select set_config('app.practice_id', $1, true)`, [practiceId]);

      const rows = await appClient.query(
        `select "practice_id" from "practice_settings" where "practice_id" = $1`,
        [practiceId],
      );

      return rows.rowCount ?? 0;
    } finally {
      await appClient.query('rollback');
    }
  }

  /** The `version` the row genuinely holds, read through the same runtime credential. */
  async function versionUnderContext(practiceId: string): Promise<number | undefined> {
    await appClient.query('begin');

    try {
      await appClient.query(`select set_config('app.practice_id', $1, true)`, [practiceId]);

      const rows = await appClient.query<{ version: number }>(
        `select "version" from "practice_settings" where "practice_id" = $1`,
        [practiceId],
      );

      return rows.rows[0]?.version;
    } finally {
      await appClient.query('rollback');
    }
  }

  describe('the frozen representation (D-053 clause A.1)', () => {
    it('returns exactly the eight accepted root keys', async () => {
      const { status, body } = await readSettings(admin, PRACTICE_A);

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(FROZEN_KEYS);
      expect(body).toEqual(SETTINGS_A);
    });

    it('renders retentionPolicyCode as null without dropping the key', async () => {
      const { status, body } = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceC);

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(FROZEN_KEYS);
      expect(body).toEqual(SETTINGS_C);
      expect(body['retentionPolicyCode']).toBeNull();
    });

    it('never renders version, id, configuration, updatedAt or updatedBy in any spelling', async () => {
      const { body } = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceB);
      const serialised = JSON.stringify(body);

      for (const forbidden of [
        'version',
        'Version',
        'rowVersion',
        'etag',
        'ETag',
        'configuration',
        'updatedAt',
        'updated_at',
        'updatedBy',
        'updated_by',
        // The row's real, non-rendered values: a negative assertion about an empty column
        // would prove nothing, so the fixture writes a recognisable `configuration` payload
        // and this asserts that payload never appears.
        'never-rendered',
        FIXTURE.settingsB,
        // `version` of B is 3; asserting the bare digit would be noise, but the JSON member
        // it would produce must be absent.
        '"version":3',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }

      // `"id"` as a root key specifically: `practiceId` legitimately ends in `Id`.
      expect(body).not.toHaveProperty('id');
      expect(body).not.toHaveProperty('version');
    });

    it('exposes no membership, role, permission or identity information', async () => {
      const { body } = await readSettings(admin, PRACTICE_A);
      const serialised = JSON.stringify(body);

      for (const forbidden of [
        'membership',
        'roles',
        'permissions',
        'PRACTICE_ADMIN',
        'authSubject',
        'auth_subject',
        'dev|',
        callerIds(0).userId,
        callerIds(0).membershipId,
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('is served as ordinary JSON, not as a problem document', async () => {
      const { status, contentType } = await readSettings(admin, PRACTICE_A);

      expect(status).toBe(200);
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('problem');
    });
  });

  describe('the ETag (D-053 clause A.2)', () => {
    it('is present on 200 and is the quoted integer version of the row', async () => {
      for (const [subject, practiceId, version] of [
        [admin, PRACTICE_A, VERSIONS.a],
        [FIXTURE.multiAdminSubject, FIXTURE.practiceB, VERSIONS.b],
        [FIXTURE.multiAdminSubject, FIXTURE.practiceC, VERSIONS.c],
      ] as const) {
        const { status, etag } = await readSettings(subject, practiceId);

        expect(status).toBe(200);
        expect(etag).toBe(`"${String(version)}"`);
      }
    });

    it('is STRONG — it carries no W/ prefix', async () => {
      const { etag } = await readSettings(admin, PRACTICE_A);

      expect(etag).toBeDefined();
      expect(etag?.startsWith('W/')).toBe(false);
      // A quoted run of digits and nothing else: not a content hash, not a base64 digest.
      expect(etag).toMatch(/^"\d+"$/);
    });

    it('is the APPLICATION tag, not the weak content tag Express would generate', async () => {
      // Express's own generator is demonstrably active on this application: the practice route
      // sets no entity tag of its own and therefore receives a WEAK, content-hashed one. That is
      // what makes the assertion below meaningful rather than vacuous — the settings route's
      // strong tag genuinely displaced a generator that would otherwise have written a different
      // value into the same header.
      const practice = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A);

      expect(practice.status).toBe(200);
      expect(String(practice.headers['etag'] ?? '')).toMatch(/^W\//);

      const { etag } = await readSettings(admin, PRACTICE_A);

      expect(etag).toBe('"1"');
    });

    it('tracks the VERSION, never the rendering — same version, different bodies, same tag', async () => {
      // A and C carry different settings in every business field and the same `version`. A
      // content-hashed tag would necessarily differ here; a version tag cannot.
      const a = await readSettings(FIXTURE.multiAdminSubject, PRACTICE_A);
      const c = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceC);

      expect(a.status).toBe(200);
      expect(c.status).toBe(200);
      expect(a.body).not.toEqual(c.body);
      expect(a.etag).toBe('"1"');
      expect(c.etag).toBe('"1"');
      expect(a.etag).toBe(c.etag);
    });

    it('gives two practices with different versions their own tags', async () => {
      const a = await readSettings(FIXTURE.multiAdminSubject, PRACTICE_A);
      const b = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceB);

      expect(a.etag).toBe(`"${String(VERSIONS.a)}"`);
      expect(b.etag).toBe(`"${String(VERSIONS.b)}"`);
      expect(a.etag).not.toBe(b.etag);
    });

    it('reads back exactly the version the row holds, verified against the database', async () => {
      // The expectation is not a constant copied twice: the version is read from the row itself
      // and compared with the header the API produced.
      for (const practiceId of [PRACTICE_A, FIXTURE.practiceB, FIXTURE.practiceC]) {
        const version = await versionUnderContext(practiceId);
        const { etag } = await readSettings(FIXTURE.multiAdminSubject, practiceId);

        expect(version).toBeTypeOf('number');
        expect(etag).toBe(`"${String(version)}"`);
      }
    });

    it('emits no version tag on any refusal', async () => {
      for (const refusal of [
        await readSettings(admin, PRACTICE_A, { header: null }),
        await readSettings(admin, PRACTICE_A, { header: 'not-a-uuid' }),
        await readSettings(admin, PHASE_3_SEED_IDS.practiceWithoutMembers),
        await readSettings(ROLE_CALLERS[1].subject, PRACTICE_A),
        // The sharpest one: this practice HAS a settings row, at version 9. A refusal that
        // carried `"9"` would disclose the state of a resource the caller may not read.
        await readSettings(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
      ]) {
        expect(refusal.status).toBeGreaterThanOrEqual(400);
        expectNoVersionTag(refusal);
        expect(refusal.etag ?? '').not.toContain('"9"');
      }
    });
  });

  describe('authorisation matrix (15 §5, D-044, 08 §24.14)', () => {
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
      const { status, body } = await readSettings(subject, PRACTICE_A);

      if (allowed) {
        expect(status).toBe(200);
        expect(body['practiceId']).toBe(PRACTICE_A);
      } else {
        expect(status).toBe(403);
        expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
      }
    });

    it('grants exactly one of the six tenant roles — no other combination is admitted', async () => {
      const granted: string[] = [];

      for (const caller of ROLE_CALLERS) {
        const { status } = await readSettings(caller.subject, PRACTICE_A);
        if (status === 200) {
          granted.push(caller.role);
        }
      }

      expect(granted).toEqual(['PRACTICE_ADMIN']);
    });

    it('refuses SYSTEM_ADMIN without a tenant membership, for every practice', async () => {
      for (const practiceId of [
        PRACTICE_A,
        FIXTURE.practiceB,
        FIXTURE.practiceC,
        PHASE_3_SEED_IDS.practiceNord,
        PHASE_3_SEED_IDS.practiceWithoutMembers,
      ]) {
        const { status, body } = await readSettings(FIXTURE.platformOnlySubject, practiceId);

        expect(status).toBe(403);
        expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
      }
    });

    it('admits SYSTEM_ADMIN with an ACTIVE PRACTICE_ADMIN membership — through the tenant role only', async () => {
      // The seeded `practiceAdmin` holds BOTH: a current SYSTEM_ADMIN platform assignment and an
      // ACTIVE `demo-praxis` membership with PRACTICE_ADMIN. The platform role contributes
      // nothing — the same platform role held WITHOUT a tenant membership produces 403 above.
      const { status, body } = await readSettings(PHASE_3_SEED_SUBJECTS.practiceAdmin, PRACTICE_A);

      expect(status).toBe(200);
      expect(body).toEqual(SETTINGS_A);
    });

    it('refuses the same SYSTEM_ADMIN for the practice where their membership is inactive', async () => {
      const { status } = await readSettings(
        PHASE_3_SEED_SUBJECTS.practiceAdmin,
        PHASE_3_SEED_IDS.practiceNord,
      );

      expect(status).toBe(403);
    });

    it('refuses an ACTIVE membership with zero assigned roles (03 §3.7.2)', async () => {
      const { status, body } = await readSettings(
        PHASE_3_SEED_SUBJECTS.physician,
        PHASE_3_SEED_IDS.practiceNord,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED' });
    });
  });

  describe('practice context and canonical errors (03 §3.2, §8, D-047 clause 10)', () => {
    it('answers 401 before anything else when no bearer credential is presented', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set(PRACTICE_HEADER, PRACTICE_A);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    });

    it('refuses an unknown and an INACTIVE user before the header is even considered', async () => {
      for (const subject of ['dev|not-provisioned', PHASE_3_SEED_SUBJECTS.inactive]) {
        const { status, body } = await readSettings(subject, PRACTICE_A, { header: null });

        // 403, not 400: `03` §3.7.1 admits the caller (step 2) before reading the header (step 3).
        expect(status).toBe(403);
        expect(body).toMatchObject({ code: 'ACCESS_DENIED' });
      }
    });

    it('answers 400 PRACTICE_CONTEXT_REQUIRED without X-Practice-ID', async () => {
      const { status, body } = await readSettings(admin, PRACTICE_A, { header: null });

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
      const { status, body } = await readSettings(admin, PRACTICE_A, { header });

      // Whitespace collapses to "no header at all", which is REQUIRED rather than INVALID.
      const expected =
        header.trim().length === 0 ? 'PRACTICE_CONTEXT_REQUIRED' : 'PRACTICE_CONTEXT_INVALID';

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: expected, status: 400 });
    });

    it('answers 403 when the path is not the practice of the header', async () => {
      const { status, body } = await readSettings(admin, PRACTICE_A, {
        path: PHASE_3_SEED_IDS.practiceNord,
      });

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for a non-existent practice', async () => {
      const { status, body } = await readSettings(admin, '11111111-1111-4111-8111-1111119999ff');

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for an existing practice the caller is not a member of', async () => {
      // `demo-praxis-sued` exists, is ACTIVE and HAS a settings row; nobody holds a membership.
      const { status, body } = await readSettings(admin, PHASE_3_SEED_IDS.practiceWithoutMembers);

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for an INACTIVE membership that carries PRACTICE_ADMIN', async () => {
      const { status, body } = await readSettings(FIXTURE.inactiveMemberSubject, PRACTICE_A);

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('answers 403 for a non-ACTIVE practice with an ACTIVE PRACTICE_ADMIN membership', async () => {
      // Everything except the practice status is eligible — the practice even HAS a settings row
      // with version 9 — so this isolates D-047 clause 10.
      const refusal = await readSettings(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice);

      expect(refusal.status).toBe(403);
      expect(refusal.body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
      expectNoVersionTag(refusal);
    });

    it('renders every problem document through the single Problem Details filter (D-008)', async () => {
      for (const rejection of [
        { practiceId: PRACTICE_A, header: null },
        { practiceId: PRACTICE_A, header: 'not-a-uuid' },
        { practiceId: PHASE_3_SEED_IDS.practiceWithoutMembers, header: undefined },
      ] as const) {
        const { body, contentType } = await readSettings(admin, rejection.practiceId, {
          header: rejection.header,
        });

        expect(contentType).toContain('application/problem+json');
        expect(body).toMatchObject({
          instance: `/api/v1/practices/${rejection.practiceId}/settings`,
        });
        expect(body).toHaveProperty('requestId');
        expect(body).toHaveProperty('type');
        expect(body).toHaveProperty('title');
      }
    });

    it('leaks no SQL, connection string, auth subject or stack trace in any rejection', async () => {
      const rejections = [
        await readSettings(admin, PRACTICE_A, { header: null }),
        await readSettings(admin, PRACTICE_A, { header: 'not-a-uuid' }),
        await readSettings(admin, PHASE_3_SEED_IDS.practiceWithoutMembers),
        await readSettings(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
        await readSettings(ROLE_CALLERS[1].subject, PRACTICE_A),
      ];

      for (const rejection of rejections) {
        const serialised = JSON.stringify(rejection.body);

        expect(serialised).not.toContain('select ');
        expect(serialised).not.toContain('postgresql://');
        expect(serialised).not.toContain('auth_subject');
        expect(serialised).not.toContain('dev|');
        expect(serialised).not.toContain('at Object.');
        expect(serialised).not.toContain('practice_settings');
        expect(serialised).not.toContain('practice_memberships');
      }
    });
  });

  describe('anti-enumeration (03, negative cases)', () => {
    it('answers EVERY canonical settings refusal with one identical document', async () => {
      // Anti-enumeration needs the whole SET to agree: a client must not be able to tell "no such
      // practice" from "not yours", from "yours but suspended", from "yours but your membership is
      // off", from "yours and active but you lack the permission". Any one branch drifting — a
      // distinct `title`, a more helpful `detail`, an `errors` array — reintroduces the oracle,
      // and only a set-wide assertion catches the branch that drifts alone.
      const refusals = await Promise.all([
        // The path is not the practice of the header.
        readSettings(admin, PRACTICE_A, { path: PHASE_3_SEED_IDS.practiceNord }),
        // No such practice.
        readSettings(admin, '11111111-1111-4111-8111-1111119999ff'),
        // Exists and is ACTIVE, but the caller holds no membership.
        readSettings(admin, PHASE_3_SEED_IDS.practiceWithoutMembers),
        // Membership exists and carries PRACTICE_ADMIN, but it is not ACTIVE.
        readSettings(FIXTURE.inactiveMemberSubject, PRACTICE_A),
        // ACTIVE membership with PRACTICE_ADMIN, but the practice is not ACTIVE.
        readSettings(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
        // Everything admitted, but the role does not derive `practice.settings.read`.
        readSettings(ROLE_CALLERS[1].subject, PRACTICE_A),
      ]);

      // `instance` is the request path and `requestId` is the per-request correlation id; both are
      // REQUIRED to differ (`03` §3.5, §8) and neither discloses anything about the practice.
      // Every other member must be byte-identical across the set.
      const documents = refusals.map(({ status, body }) => {
        const { instance: _instance, requestId: _requestId, ...rest } = body;

        return JSON.stringify({ status, ...rest });
      });

      expect(new Set(documents).size).toBe(1);
      expect(JSON.parse(documents[0] as string)).toMatchObject({
        status: 403,
        code: 'ACCESS_DENIED',
      });
    });

    it('keeps the two 400 header branches OUT of that equality set', async () => {
      // A missing and a malformed `X-Practice-ID` are request-format failures, not authorisation
      // outcomes, and `03` §9 classifies them as `400`. They must stay distinguishable from the
      // shared refusal — collapsing them into it would misreport a client bug as a denial.
      const missing = await readSettings(admin, PRACTICE_A, { header: null });
      const malformed = await readSettings(admin, PRACTICE_A, { header: 'not-a-uuid' });
      const denied = await readSettings(ROLE_CALLERS[1].subject, PRACTICE_A);

      expect(missing.status).toBe(400);
      expect(malformed.status).toBe(400);
      expect(denied.status).toBe(403);
      expect(missing.body['code']).toBe('PRACTICE_CONTEXT_REQUIRED');
      expect(malformed.body['code']).toBe('PRACTICE_CONTEXT_INVALID');
      expect(denied.body['code']).toBe('ACCESS_DENIED');
    });

    it('answers a non-existent practice and a foreign practice indistinguishably', async () => {
      const absent = await readSettings(admin, '11111111-1111-4111-8111-1111119999ff');
      const foreign = await readSettings(admin, PHASE_3_SEED_IDS.practiceWithoutMembers);

      expect(absent.status).toBe(foreign.status);
      expect(absent.body['code']).toBe(foreign.body['code']);
      expect(absent.body['detail']).toBe(foreign.body['detail']);
      expect(absent.body['title']).toBe(foreign.body['title']);
    });
  });

  describe('the missing settings row is 500 INTERNAL_ERROR (owner decision, P4-5C)', () => {
    it('has a fixture that is admissible in every way except the settings row', async () => {
      // Stated as a precondition rather than assumed. Without it, the 500 below could come from
      // an unrelated failure and the spec would still pass.
      //
      // The ADMISSIBILITY half is asserted through the practice route rather than by reading the
      // fixture rows back: `GET /practices/{id}` requires `practice.read`, which the `15` §5
      // matrix grants to `PRACTICE_ADMIN` alone and only for an ACTIVE membership in an ACTIVE
      // practice. A 200 there therefore proves all three facts at once, and proves them through
      // the same runtime credential the settings route uses — a stronger statement than a trusted
      // read of the same rows would be. It also proves the caller is admitted by a route that
      // needs NO settings row, which is what isolates the 500 below to the representation.
      const practiceRead = await request(app.getHttpServer())
        .get(`/api/v1/practices/${FIXTURE.practiceD}`)
        .set('Authorization', developmentBearer(FIXTURE.settingsLessSubject))
        .set(PRACTICE_HEADER, FIXTURE.practiceD);

      expect(practiceRead.status).toBe(200);
      expect((practiceRead.body as Record<string, unknown>)['status']).toBe('ACTIVE');

      // The ABSENCE half, observed under an established tenant context on the application pool.
      // `practice_settings_select` (§17.1) exposes exactly the contexted practice's row, so "no
      // row for D while there IS one for B" is a statement about the table and not about the
      // policy.
      expect(await settingsRowCountUnderContext(FIXTURE.practiceD)).toBe(0);
      expect(await settingsRowCountUnderContext(FIXTURE.practiceB)).toBe(1);
    });

    it('answers 500 INTERNAL_ERROR, never 404, 403 or an invented document', async () => {
      const failure = await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);

      expect(failure.status).toBe(500);
      expect(failure.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
      expect(failure.status).not.toBe(404);
      expect(failure.status).not.toBe(403);
      expectNoVersionTag(failure);
      // No settings-shaped member reached the caller: not a default, not an empty document,
      // and not a fabricated one.
      for (const key of FROZEN_KEYS) {
        expect(failure.body).not.toHaveProperty(key);
      }
    });

    it('discloses no practice id, table, SQL, SQLSTATE or query text', async () => {
      const { body, contentType } = await readSettings(
        FIXTURE.settingsLessSubject,
        FIXTURE.practiceD,
      );

      expect(contentType).toContain('application/problem+json');

      // `instance` is the request path and is REQUIRED to be present (`03` §3.5, §8). It is the
      // one member that legitimately echoes the practice id, because the CLIENT sent it in the
      // URL — it discloses nothing the caller did not already supply. It is therefore excluded
      // from the disclosure scan and asserted separately below; every other member must carry
      // nothing about the failure.
      const { instance: _instance, ...disclosable } = body;
      const serialised = JSON.stringify(disclosable);

      for (const forbidden of [
        FIXTURE.practiceD,
        FIXTURE.settingsLessMembership,
        FIXTURE.settingsLessUser,
        'dev|',
        'practice_settings',
        'practice_memberships',
        'select ',
        'SELECT ',
        '42501',
        'SQLSTATE',
        'invariant',
        'Invariant',
        'postgresql://',
        'at Object.',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }

      expect(body['instance']).toBe(`/api/v1/practices/${FIXTURE.practiceD}/settings`);
      expect(body).toHaveProperty('requestId');
      // The detail is the generic one of the shared filter, not a bespoke settings message.
      expect(body['detail']).toBe('An unexpected internal error occurred.');
    });

    it('is a STATIC document — two failures differ only in their correlation members', async () => {
      const first = await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);
      const second = await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);

      const strip = (body: Record<string, unknown>): string => {
        const { requestId: _requestId, ...rest } = body;
        return JSON.stringify(rest);
      };

      expect(strip(first.body)).toBe(strip(second.body));
      expect(first.body['requestId']).not.toBe(second.body['requestId']);
    });

    it('creates no row and repairs nothing', async () => {
      await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);
      await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);

      // Still absent after two failed requests. The route has no `INSERT` grant on this table at
      // all (D-053 clause B.2, `02` §20.2b.1), so a write-behind repair is unexpressible as well
      // as forbidden — which the negative privilege assertion below states directly.
      expect(await settingsRowCountUnderContext(FIXTURE.practiceD)).toBe(0);

      expect(
        await sqlStateOf(
          appClient,
          `insert into "practice_settings" ("practice_id", "billing_review_required",
                                            "require_reason_for_manual_change", "ai_enabled",
                                            "axenita_export_enabled")
           values ('${FIXTURE.practiceD}'::uuid, false, false, false, false)`,
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('leaves no tenant context behind and does not contaminate the next request', async () => {
      expect((await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD)).status).toBe(500);

      const context = await appClient.query<{ practice: string | null; user: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice",
                nullif(current_setting('app.user_id', true), '')     as "user"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
      expect(context.rows[0]?.user).toBeNull();

      // The very next request of a different, fully eligible caller is unaffected.
      const next = await readSettings(admin, PRACTICE_A);
      expect(next.status).toBe(200);
      expect(next.body).toEqual(SETTINGS_A);
    });
  });

  describe('multi-practice isolation (02 §17.1, D-053 clause D.1)', () => {
    it('answers each practice with its OWN settings and its OWN ETag', async () => {
      const a = await readSettings(FIXTURE.multiAdminSubject, PRACTICE_A);
      const b = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceB);

      expect(a.status).toBe(200);
      expect(a.body).toEqual(SETTINGS_A);
      expect(a.etag).toBe(`"${String(VERSIONS.a)}"`);

      expect(b.status).toBe(200);
      expect(b.body).toEqual(SETTINGS_B);
      expect(b.etag).toBe(`"${String(VERSIONS.b)}"`);

      // The same user, the same role and the same credential: only the requested practice
      // differed, and every rendered value differs with it.
      expect(a.body).not.toEqual(b.body);
      expect(JSON.stringify(a.body)).not.toContain(FIXTURE.practiceB);
      expect(JSON.stringify(b.body)).not.toContain(PRACTICE_A);
      expect(JSON.stringify(b.body)).not.toContain('DEV-RETENTION-STANDARD');
    });

    it("never answers A with B's settings, whatever the caller is a member of", async () => {
      for (const [practiceId, expected] of [
        [PRACTICE_A, SETTINGS_A],
        [FIXTURE.practiceB, SETTINGS_B],
        [FIXTURE.practiceC, SETTINGS_C],
      ] as const) {
        const { status, body } = await readSettings(FIXTURE.multiAdminSubject, practiceId);

        expect(status).toBe(200);
        expect(body).toEqual(expected);
      }
    });

    it('keeps sequential requests for DIFFERENT practices isolated', async () => {
      // One caller, one credential, one role — only the requested practice differs. A context
      // that survived a request would make the second response the first one's practice.
      const sequence = [
        [PRACTICE_A, SETTINGS_A, VERSIONS.a],
        [FIXTURE.practiceB, SETTINGS_B, VERSIONS.b],
        [FIXTURE.practiceB, SETTINGS_B, VERSIONS.b],
        [FIXTURE.practiceC, SETTINGS_C, VERSIONS.c],
        [PRACTICE_A, SETTINGS_A, VERSIONS.a],
        [FIXTURE.practiceB, SETTINGS_B, VERSIONS.b],
      ] as const;

      for (const [practiceId, expected, version] of sequence) {
        const { status, body, etag } = await readSettings(FIXTURE.multiAdminSubject, practiceId);

        expect(status).toBe(200);
        expect(body).toEqual(expected);
        expect(etag).toBe(`"${String(version)}"`);
      }
    });

    it('keeps concurrent requests for DIFFERENT practices isolated', async () => {
      // Issued together, so they interleave on the pool. Each answer must be the practice its own
      // request named — a shared or leaked `app.practice_id` would cross them.
      const results = await Promise.all([
        readSettings(FIXTURE.multiAdminSubject, PRACTICE_A),
        readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceB),
        readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceC),
        readSettings(admin, PRACTICE_A),
        readSettings(FIXTURE.suspendedAdminSubject, FIXTURE.suspendedPractice),
        readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceB),
        readSettings(ROLE_CALLERS[1].subject, PRACTICE_A),
      ]);

      expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200, 403, 200, 403]);
      expect(results.map((result) => result.body['practiceId'])).toEqual([
        PRACTICE_A,
        FIXTURE.practiceB,
        FIXTURE.practiceC,
        PRACTICE_A,
        undefined,
        FIXTURE.practiceB,
        undefined,
      ]);
      // The four admitted reads carry their own practice's version; the two refusals carry no
      // version tag at all. Express writes a weak content tag onto a problem document, which is
      // why the refusals are asserted as "not a version tag" rather than "no tag".
      expect(results.map((result) => result.etag)).toEqual([
        '"1"',
        '"3"',
        '"1"',
        '"1"',
        results[4]?.etag,
        '"3"',
        results[6]?.etag,
      ]);
      expectNoVersionTag(results[4]);
      expectNoVersionTag(results[6]);
    });

    it("keeps a refused request from contaminating the caller's next admitted one", async () => {
      const denied = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.suspendedPractice);
      expect(denied.status).toBe(403);

      const allowed = await readSettings(FIXTURE.multiAdminSubject, FIXTURE.practiceB);
      expect(allowed.status).toBe(200);
      expect(allowed.body).toEqual(SETTINGS_B);
    });

    it('cannot represent a different practice: the tenant policy allows only one row', async () => {
      // The database-level statement of the same property, independent of the application. With
      // `app.practice_id` established for B, `practice_settings_select` (§17.1) exposes exactly
      // one row whatever the query asks for; with none established, it exposes none.
      await appClient.query('begin');

      try {
        await appClient.query(`select set_config('app.practice_id', $1, true)`, [
          FIXTURE.practiceB,
        ]);

        const visible = await appClient.query<{ practiceId: string }>(
          `select "practice_id" as "practiceId" from "practice_settings" order by "practice_id"`,
        );

        expect(visible.rows.map((row) => row.practiceId)).toEqual([FIXTURE.practiceB]);
      } finally {
        await appClient.query('rollback');
      }

      const withoutContext = await appClient.query(`select "practice_id" from "practice_settings"`);
      expect(withoutContext.rowCount).toBe(0);
    });
  });

  describe('the settings column grant (02 §20.2b.1, D-053 clauses A.3 and A.4)', () => {
    it.each(['id', 'configuration', 'updated_at', 'updated_by'])(
      'cannot select practice_settings.%s at all — the grant, not the query, is the barrier',
      async (column) => {
        // The route's projection is not the only thing keeping these columns out of a response:
        // `copilot_app` has no column grant for them, so a statement that merely NAMES one fails.
        // That control survives an application bug and a compromised credential alike.
        expect(await sqlStateOf(appClient, `select "${column}" from "practice_settings"`)).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      },
    );

    it.each(['id', 'configuration', 'updated_at', 'updated_by'])(
      'cannot even use practice_settings.%s in a WHERE predicate',
      async (column) => {
        expect(
          await sqlStateOf(
            appClient,
            `select "practice_id" from "practice_settings" where "${column}" is not null`,
          ),
        ).toBe(INSUFFICIENT_PRIVILEGE);
      },
    );

    it('grants exactly the nine columns the representation and the ETag need', async () => {
      // The positive half: every column the route names is readable, so the nine-column list is
      // a complete statement of the surface and not merely a subset that happens to work.
      expect(
        await sqlStateOf(
          appClient,
          `select "practice_id", "billing_review_required", "allow_mpa_approval",
                  "allow_billing_specialist_approval", "require_reason_for_manual_change",
                  "ai_enabled", "axenita_export_enabled", "retention_policy_code", "version"
             from "practice_settings"`,
        ),
      ).toBeUndefined();
    });

    it('cannot select * from practice_settings', async () => {
      expect(await sqlStateOf(appClient, `select * from "practice_settings"`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    });
  });

  describe('tenant context lifecycle (03 §3.7.1 steps 5-7, D-033, 08 §21.5.7)', () => {
    it('leaves no app.practice_id on the pooled connection after COMMIT', async () => {
      expect((await readSettings(admin, PRACTICE_A)).status).toBe(200);

      // The same pool the application uses, on a separate connection. `set_request_context`
      // writes the GUC with `set_config(..., true)`, so it is discarded at COMMIT (02 §16.2,
      // 08 §21.5.7) and no pooled connection can inherit it.
      const context = await appClient.query<{ practice: string | null; user: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice",
                nullif(current_setting('app.user_id', true), '')     as "user"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
      expect(context.rows[0]?.user).toBeNull();
      // And without a context the tenant policy of §17.1 exposes nothing at all.
      expect(
        (await appClient.query('select "practice_id" from "practice_settings"')).rowCount,
      ).toBe(0);
    });

    it('leaves no app.practice_id after a ROLLBACK that followed an established context', async () => {
      // PHYSICIAN is an ACTIVE member of the ACTIVE practice, so this request is refused at step
      // 10 — AFTER the context was established — which is the only refusal that can leave a
      // tenant context behind if the transaction did not discard it.
      expect((await readSettings(ROLE_CALLERS[1].subject, PRACTICE_A)).status).toBe(403);

      const context = await appClient.query<{ practice: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
      expect(
        (await appClient.query('select "practice_id" from "practice_settings"')).rowCount,
      ).toBe(0);
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
        const { status } = await readSettings(subject, PRACTICE_A);
        expect(status).toBe(expected);
      }
    });

    it('reads the representation under the context, never before it', async () => {
      // Observed through the database rather than claimed by the application: the settings row of
      // the admitted practice is invisible on the pool without a context, so a representation
      // assembled before `set_request_context` could only ever have been empty. The 200 above
      // therefore proves the read happened after it.
      const withoutContext = await appClient.query(
        `select "practice_id" from "practice_settings" where "practice_id" = $1`,
        [PRACTICE_A],
      );

      expect(withoutContext.rowCount).toBe(0);
      expect((await readSettings(admin, PRACTICE_A)).body).toEqual(SETTINGS_A);
    });
  });

  describe('non-regression of the routes this slice did not touch', () => {
    it('keeps GET /me header-independent and byte-identical (D-053 clause D.2)', async () => {
      // `/me` is tenant NEUTRAL (`03` §3.4): it requires no `X-Practice-ID`, reads none, and no
      // client-supplied practice id participates in it. Adding a second tenant route must not
      // have changed that in either direction.
      const bodies: string[] = [];

      for (const header of [
        undefined,
        PRACTICE_A,
        FIXTURE.practiceB,
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

    it('renders no settings field in GET /me', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(PHASE_3_SEED_SUBJECTS.practiceAdmin));

      const serialised = JSON.stringify(response.body);

      for (const forbidden of [
        'billingReviewRequired',
        'aiEnabled',
        'axenitaExportEnabled',
        'retentionPolicyCode',
        'requireReasonForManualChange',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('keeps GET /practices/{practiceId} unchanged in its observable behaviour', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body as Record<string, unknown>).sort()).toEqual([
        'code',
        'defaultLanguage',
        'id',
        'name',
        'status',
        'timezone',
      ]);
      // Still no settings member, and still no version.
      expect(JSON.stringify(response.body)).not.toContain('version');
      expect(JSON.stringify(response.body)).not.toContain('billingReviewRequired');
    });
  });

  describe('route registration', () => {
    it('registers GET /practices/{practiceId}/settings', async () => {
      expect((await readSettings(admin, PRACTICE_A)).status).toBe(200);
    });

    it('registers NO PATCH /practices/{practiceId}/settings', async () => {
      // The write slice is not this one. A stub would have to answer something, and every answer
      // it could give would be a contract this phase has not accepted (D-053 clause B.4).
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .send({ aiEnabled: true });

      expect(response.status).toBe(404);
      expect([428, 409, 200, 204]).not.toContain(response.status);
    });

    it.each(['put', 'post', 'delete'] as const)(
      'registers no %s on the settings path',
      async (method) => {
        const path = `/api/v1/practices/${PRACTICE_A}/settings`;

        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', developmentBearer(admin))
          .set(PRACTICE_HEADER, PRACTICE_A);

        expect(response.status).toBe(404);
      },
    );

    it('registers no deeper route beneath settings, and still no practice directory', async () => {
      for (const path of [
        `/api/v1/practices/${PRACTICE_A}/settings/history`,
        `/api/v1/practices/${PRACTICE_A}/settings/version`,
        '/api/v1/practices',
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', developmentBearer(admin))
          .set(PRACTICE_HEADER, PRACTICE_A);

        expect(response.status).toBe(404);
      }
    });
  });
});

/**
 * `PATCH /api/v1/practices/{practiceId}/settings` against a real PostgreSQL — the optimistic
 * concurrency contract end to end, including the tenant execution boundary and the `ETag` channel.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1, §5.2, §9 and §28.5; `02` §6.4, §16.2.3, §17.1,
 * §20.2b.1 and §23.4.4; `08` §21.5, §24.14 and §24.17; `15` §5; D-028 clause 2; D-033 clauses
 * 9–12; D-038 clauses 12–14; D-044; D-047 clauses 8, 10, 11 and 18; D-049; D-053 parts A and B;
 * D-054 clause 12; D-055 parts D to K. Owner ratifications R1 and R2 of gate P4-5D.
 *
 * WHY THIS SUITE AND NOT AN `*.e2e-spec.ts`
 *
 * The properties under test are DATABASE properties, and for a write route most of them cannot
 * exist anywhere else: the `02` §17.1 tenant policy that makes a foreign settings row unwritable,
 * the §20.2b.1 grant that makes `updated_at` writable but unreadable (so `RETURNING updated_at`
 * would be `42501`), the real `version + 1` under two genuinely concurrent transactions, the real
 * `int4` overflow of owner ratification R2, and the transaction-local `app.*` context a rejected
 * write must roll back. A stubbed database proves none of them, and `pnpm test:e2e` boots the
 * application with stub dependency listeners and no PostgreSQL at all.
 *
 * WHAT ITS COMPANION SUITE OWNS INSTEAD
 *
 * `src/identity/application/practice-settings-write.service.spec.ts` owns the STATEMENT LOG: that
 * exactly one `UPDATE` is issued, that no settings read precedes or follows it (D-055 clauses 16
 * and 23), that an omitted field produces no assignment at all, and that every refusal happens at
 * its accepted position in the `03` §3.7.1 chain. Those are questions about which statements ran
 * and in what order, which a real database cannot be asked from outside. This suite owns what the
 * database actually DOES with them. Both halves are required; neither replaces the other.
 *
 * WHY IT OWNS ITS OWN DATABASE
 *
 * This suite MUTATES rows — that is the whole point of it — and several of its fixtures cannot
 * exist in the shared disposable database: an `ACTIVE` practice with an `ACTIVE` `PRACTICE_ADMIN`
 * membership and NO `practice_settings` row, a settings row parked at the `int4` ceiling, and a
 * settings row carrying a recognisable non-null `updated_by`. Adding any of them to the shared
 * database would invalidate the row-count and isolation assertions the other security specs make,
 * and mutating its rows would break the frozen-seed assertions outright. This suite therefore
 * creates, migrates, seeds and drops a disposable database of its own.
 *
 * All fixture writes use the canonical paths: every table under FORCE row level security goes
 * through the D-048 maintenance protocol (`02` §23.4.4, §23.4.4a; D-052 part B). NO migration,
 * schema, grant, policy or seed file is modified, and the practice without a settings row is
 * NEVER repaired — repairing it would delete the very fixture the zero-row spec exercises.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
import { INSUFFICIENT_PRIVILEGE, connect, sqlStateOf } from './support/phase3-security-context.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

/** The canonical spelling of the tenant context header (`03` §3.2). */
const PRACTICE_HEADER = 'X-Practice-ID';

/** The canonical spelling of the precondition header (`03` §5.2). */
const IF_MATCH_HEADER = 'If-Match';

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

/** The largest value `practice_settings.version` can hold (`02` §6.4, ratification R1). */
const MAX_INT4 = 2147483647;

/**
 * One user per tenant role, each with exactly ONE `ACTIVE` membership carrying exactly ONE role
 * in the same `ACTIVE` practice.
 *
 * That shape is what makes the matrix assertion sharp: the callers differ in their assigned role
 * and in nothing else — same practice, same activity, same settings, no platform role — so a
 * difference in outcome can only come from `15` §5 and D-044.
 */
const ROLE_CALLERS = [
  { role: 'PRACTICE_ADMIN', subject: 'dev|patch-practice-admin', allowed: true },
  { role: 'PHYSICIAN', subject: 'dev|patch-physician', allowed: false },
  { role: 'MPA', subject: 'dev|patch-mpa', allowed: false },
  { role: 'BILLING_SPECIALIST', subject: 'dev|patch-billing-specialist', allowed: false },
  { role: 'AUDITOR', subject: 'dev|patch-auditor', allowed: false },
  { role: 'READ_ONLY', subject: 'dev|patch-read-only', allowed: false },
] as const;

const FIXTURE = {
  /**
   * PRACTICE B — an `ACTIVE` practice with settings, in which NO caller of this suite holds a
   * membership.
   *
   * The cross-tenant target. Without it, "the write went to the right practice" and "the write
   * went to the only practice" are the same observation, and a total tenant failure would look
   * exactly like correct behaviour.
   */
  practiceB: '11111111-1111-4111-8111-1111110000b1',
  settingsB: '55555555-5555-4555-8555-5555550000b1',

  /**
   * PRACTICE D — `ACTIVE`, with an `ACTIVE` `PRACTICE_ADMIN` membership, and NO settings row.
   *
   * The database state D-055 clause 19 is about. Everything the route checks passes: the user is
   * admitted, the practice is admitted, the membership is ACTIVE twice over, the tenant context
   * is established and `practice.settings.manage` is derived and held. Only the row is absent,
   * and the accepted answer for that is the SAME `409` a stale version gets.
   */
  practiceD: '11111111-1111-4111-8111-1111110000b3',
  settingsLessUser: '22222222-2222-4222-8222-2222220000b3',
  settingsLessSubject: 'dev|patch-no-settings-row',
  settingsLessMembership: '33333333-3333-4333-8333-3333330000b3',
  settingsLessRole: '44444444-4444-4444-8444-4444440000b3',

  /**
   * PRACTICE M — an `ACTIVE` practice whose settings row is parked at the `int4` ceiling.
   *
   * The fixture of owner ratification R2. `If-Match: "2147483647"` against it is a VALID and
   * CURRENT token, so the request passes every barrier and the `version + 1` inside the statement
   * is what fails. It is a separate practice precisely so that the overflow cannot disturb any
   * other spec's row.
   */
  practiceMax: '11111111-1111-4111-8111-1111110000b5',
  settingsMax: '55555555-5555-4555-8555-5555550000b5',
  maxAdminUser: '22222222-2222-4222-8222-2222220000b5',
  maxAdminSubject: 'dev|patch-int4-max-admin',
  maxAdminMembership: '33333333-3333-4333-8333-3333330000b5',
  maxAdminRole: '44444444-4444-4444-8444-4444440000b5',

  /** `status = SUSPENDED` — the D-047 clause 10 rejection cannot be shown without it. */
  suspendedPractice: '11111111-1111-4111-8111-1111110000b4',
  suspendedSettings: '55555555-5555-4555-8555-5555550000b4',
  suspendedAdminUser: '22222222-2222-4222-8222-2222220000b4',
  suspendedAdminSubject: 'dev|patch-suspended-admin',
  suspendedAdminMembership: '33333333-3333-4333-8333-3333330000b4',
  suspendedAdminRole: '44444444-4444-4444-8444-4444440000b4',

  /** `PRACTICE_ADMIN` in an ACTIVE practice, but the membership itself is inactive. */
  inactiveMemberUser: '22222222-2222-4222-8222-2222220000b6',
  inactiveMemberSubject: 'dev|patch-inactive-member',
  inactiveMemberMembership: '33333333-3333-4333-8333-3333330000b6',
  inactiveMemberRole: '44444444-4444-4444-8444-4444440000b6',

  /**
   * `SYSTEM_ADMIN` and NOTHING else: no membership in any practice. D-047 clause 11, D-023
   * clause 10 and D-055 clause 29 require the platform role on its own to contribute nothing —
   * and a WRITE is where a platform bypass would matter most.
   */
  platformOnlyUser: '22222222-2222-4222-8222-2222220000b7',
  platformOnlySubject: 'dev|patch-platform-only',
  platformOnlyAssignment: '66666666-6666-4666-8666-6666660000b7',

  /**
   * `SYSTEM_ADMIN` AND a genuine `ACTIVE` `PRACTICE_ADMIN` membership in practice A.
   *
   * The other half of the bypass question. This caller succeeds — and must succeed BECAUSE of the
   * tenant permission, which the caller above proves is the only thing that can grant it.
   */
  platformTenantUser: '22222222-2222-4222-8222-2222220000b8',
  platformTenantSubject: 'dev|patch-platform-and-admin',
  platformTenantMembership: '33333333-3333-4333-8333-3333330000b8',
  platformTenantRole: '44444444-4444-4444-8444-4444440000b8',
  platformTenantAssignment: '66666666-6666-4666-8666-6666660000b8',
} as const;

/** PRACTICE A — the seeded `demo-praxis`, every matrix caller's practice and the write target. */
const PRACTICE_A = PHASE_3_SEED_IDS.practiceDemo;

/**
 * The baseline every mutating spec starts from.
 *
 * Practice A's row is RESET to exactly this before each test, so a spec never inherits another
 * spec's version or values and the suite has no ordering dependency. The reset uses the runtime
 * credential and the accepted `practice_settings_update` policy — no maintenance window, no DDL —
 * because that is both the cheapest path and the one that cannot touch a column the route may not
 * touch either.
 */
const BASELINE = {
  billingReviewRequired: true,
  allowMpaApproval: false,
  allowBillingSpecialistApproval: false,
  requireReasonForManualChange: true,
  aiEnabled: false,
  axenitaExportEnabled: false,
  retentionPolicyCode: 'DEV-RETENTION-STANDARD',
} as const;

/** The version practice A's row is reset to. Deliberately not `1`, so `+1` cannot be mistaken. */
const BASELINE_VERSION = 7;
const BASELINE_TAG = `"${String(BASELINE_VERSION)}"`;

/**
 * A recognisable `updated_by` written into every fixture settings row.
 *
 * D-053 clause B.3 and D-055 clause 17 say the `UPDATE` leaves `updated_by` UNTOUCHED. That is
 * unprovable while the column is `null`: "still null" is what an accidental `updated_by = null`
 * assignment would also produce. A distinctive non-null value turns the assertion into a real one.
 */
const FIXTURE_UPDATED_BY = PHASE_3_SEED_IDS.userPhysician;

/** Deterministic fixture identifiers, derived from the caller index so nothing collides. */
function callerIds(index: number): { userId: string; membershipId: string; roleId: string } {
  const suffix = `0000c${index}`;

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
          'patch-praxis-beta',
          'Patch Praxis Beta',
          'DEV-ZSR-0031',
          '7601000000031',
          'ACTIVE',
        ],
        // The practice whose settings row is deliberately never created.
        [
          FIXTURE.practiceD,
          'patch-praxis-delta',
          'Patch Praxis Delta',
          'DEV-ZSR-0033',
          '7601000000033',
          'ACTIVE',
        ],
        [
          FIXTURE.suspendedPractice,
          'patch-praxis-susp',
          'Patch Praxis Susp',
          'DEV-ZSR-0034',
          '7601000000034',
          'SUSPENDED',
        ],
        [
          FIXTURE.practiceMax,
          'patch-praxis-max',
          'Patch Praxis Max',
          'DEV-ZSR-0035',
          '7601000000035',
          'ACTIVE',
        ],
      ] as const) {
        await trusted.query(
          `insert into "practices" ("id", "code", "name", "legal_name", "zsr_number", "gln_number",
                                    "default_language", "timezone", "status", "created_at", "updated_at")
           values ($1, $2, $3, $4, $5, $6, 'de-CH', 'Europe/Zurich', $7::entity_status, now(), now())`,
          [id, code, name, `${name} AG`, zsr, gln, status],
        );
      }
    });

    // NOTE: practice D receives NO `practice_settings` row here, and none is added anywhere else
    // in this file. That absence IS the fixture of the zero-row spec.
    await runInForceRlsMaintenanceWindow(client, 'practice_settings', async (trusted) => {
      for (const [id, practiceId, version] of [
        [FIXTURE.settingsB, FIXTURE.practiceB, 3],
        [FIXTURE.suspendedSettings, FIXTURE.suspendedPractice, 9],
        [FIXTURE.settingsMax, FIXTURE.practiceMax, MAX_INT4],
      ] as const) {
        // The sensitive columns are populated on purpose: a negative test that proves an
        // unreachable or untouched column is only meaningful when the column holds a value.
        await trusted.query(
          `insert into "practice_settings" ("id", "practice_id", "billing_review_required",
                                            "allow_mpa_approval", "allow_billing_specialist_approval",
                                            "require_reason_for_manual_change", "ai_enabled",
                                            "axenita_export_enabled", "retention_policy_code",
                                            "configuration", "version", "updated_by", "updated_at")
           values ($1, $2, true, false, false, true, false, false, 'FIXTURE-RETENTION',
                   '{"secret":"never-rendered"}'::jsonb, $3, $4, timestamptz '2020-01-01T00:00:00Z')`,
          [id, practiceId, version, FIXTURE_UPDATED_BY],
        );
      }

      // Practice A's row exists from the frozen seed. Its `updated_by` and `updated_at` are given
      // the same recognisable values, so the "untouched" assertions can be made about it too.
      await trusted.query(
        `update "practice_settings"
            set "updated_by" = $2,
                "updated_at" = timestamptz '2020-01-01T00:00:00Z'
          where "practice_id" = $1`,
        [PRACTICE_A, FIXTURE_UPDATED_BY],
      );
    });

    await runInForceRlsMaintenanceWindow(client, 'users', async (trusted) => {
      const users: readonly (readonly [string, string, string])[] = [
        ...ROLE_CALLERS.map(
          (caller, index) =>
            [callerIds(index).userId, caller.subject, `Dev Patch ${caller.role}`] as const,
        ),
        [FIXTURE.settingsLessUser, FIXTURE.settingsLessSubject, 'Dev Patch Without Row'],
        [FIXTURE.suspendedAdminUser, FIXTURE.suspendedAdminSubject, 'Dev Patch Suspended Admin'],
        [FIXTURE.inactiveMemberUser, FIXTURE.inactiveMemberSubject, 'Dev Patch Inactive Member'],
        [FIXTURE.platformOnlyUser, FIXTURE.platformOnlySubject, 'Dev Patch Platform Only'],
        [FIXTURE.platformTenantUser, FIXTURE.platformTenantSubject, 'Dev Patch Platform Admin'],
        [FIXTURE.maxAdminUser, FIXTURE.maxAdminSubject, 'Dev Patch Int4 Max Admin'],
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
        [FIXTURE.platformTenantMembership, PRACTICE_A, FIXTURE.platformTenantUser, true],
        [FIXTURE.maxAdminMembership, FIXTURE.practiceMax, FIXTURE.maxAdminUser, true],
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
        [
          FIXTURE.platformTenantRole,
          PRACTICE_A,
          FIXTURE.platformTenantMembership,
          'PRACTICE_ADMIN',
        ],
        [FIXTURE.maxAdminRole, FIXTURE.practiceMax, FIXTURE.maxAdminMembership, 'PRACTICE_ADMIN'],
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
      for (const [id, userId] of [
        [FIXTURE.platformOnlyAssignment, FIXTURE.platformOnlyUser],
        [FIXTURE.platformTenantAssignment, FIXTURE.platformTenantUser],
      ] as const) {
        await trusted.query(
          `insert into "platform_role_assignments" ("id", "user_id", "platform_role",
                                                    "granted_by", "granted_at",
                                                    "revoked_at", "revoked_by")
           values ($1, $2, 'SYSTEM_ADMIN'::platform_role, null, now(), null, null)`,
          [id, userId],
        );
      }
    });
  } finally {
    await client.end();
  }
}

describe('PATCH /api/v1/practices/{practiceId}/settings', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;
  let appClient: Client;
  let migrationClient: Client;

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
    migrationClient = await connect(disposable.migration);
  }, 180000);

  afterAll(async () => {
    await migrationClient.end();
    await appClient.end();
    await closeTestApplication(app);

    if (disposable !== undefined) {
      await dropDisposableDatabase(disposable);
    }
  }, 60000);

  const admin = ROLE_CALLERS[0].subject;

  interface PatchResponse {
    readonly status: number;
    readonly body: Record<string, unknown>;
    readonly etag: string | undefined;
    readonly contentType: string;
  }

  interface PatchOptions {
    /** `null` means "send no `X-Practice-ID`"; a string is sent verbatim, unvalidated. */
    readonly header?: string | null;
    /** `null` means "send no `If-Match`"; a string is sent verbatim, unvalidated. */
    readonly ifMatch?: string | null;
    /** `undefined` means "send no body at all". */
    readonly body?: unknown;
    /** Raw text body, sent with an explicit content type — for the malformed-JSON regression. */
    readonly rawBody?: string;
    readonly path?: string;
    /** `null` means "send no `Authorization` header"; a string is sent verbatim. */
    readonly authorization?: string | null;
  }

  /**
   * One `PATCH` request. Every header is independently overridable so that a spec can produce a
   * mismatch, a malformed value, or an absent one — the three cases the accepted decisions treat
   * differently.
   */
  async function patchSettings(
    subject: string,
    practiceId: string,
    options: PatchOptions = {},
  ): Promise<PatchResponse> {
    const header = options.header === undefined ? practiceId : options.header;
    const ifMatch = options.ifMatch === undefined ? BASELINE_TAG : options.ifMatch;
    const authorization =
      options.authorization === undefined ? developmentBearer(subject) : options.authorization;

    let pending = request(app.getHttpServer()).patch(
      `/api/v1/practices/${options.path ?? practiceId}/settings`,
    );

    if (authorization !== null) {
      pending = pending.set('Authorization', authorization);
    }

    if (header !== null) {
      pending = pending.set(PRACTICE_HEADER, header);
    }

    if (ifMatch !== null) {
      pending = pending.set(IF_MATCH_HEADER, ifMatch);
    }

    if (options.rawBody !== undefined) {
      pending = pending.set('Content-Type', 'application/json').send(options.rawBody);
    } else if (options.body !== undefined) {
      pending = pending.send(options.body as object);
    }

    const response = await pending;
    const etag = response.headers['etag'];

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      etag: typeof etag === 'string' ? etag : undefined,
      contentType: String(response.headers['content-type'] ?? ''),
    };
  }

  /** One `GET` of the same resource, for the non-regression and round-trip assertions. */
  async function readSettings(subject: string, practiceId: string): Promise<PatchResponse> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/practices/${practiceId}/settings`)
      .set('Authorization', developmentBearer(subject))
      .set(PRACTICE_HEADER, practiceId);

    const etag = response.headers['etag'];

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      etag: typeof etag === 'string' ? etag : undefined,
      contentType: String(response.headers['content-type'] ?? ''),
    };
  }

  /**
   * The eight `SELECT`-granted business columns plus `version`, read on the APPLICATION pool.
   *
   * The migration identity cannot serve this: `practice_settings` carries FORCE row level
   * security, the owner is subject to it too, and no policy names `copilot_migrator` — a trusted
   * read returns zero rows for every practice. The runtime credential with an established
   * `app.practice_id` is the only identity that can see the table at all, which makes this the
   * honest observation as well as the only available one. `02` §25.1.1 permits a spec to set the
   * GUC directly for policy verification; the transaction is always rolled back.
   */
  async function grantedRowOf(practiceId: string): Promise<Record<string, unknown> | undefined> {
    await appClient.query('begin');

    try {
      await appClient.query(`select set_config('app.practice_id', $1, true)`, [practiceId]);

      const rows = await appClient.query<Record<string, unknown>>(
        `select "practice_id"                       as "practiceId",
                "billing_review_required"           as "billingReviewRequired",
                "allow_mpa_approval"                as "allowMpaApproval",
                "allow_billing_specialist_approval" as "allowBillingSpecialistApproval",
                "require_reason_for_manual_change"  as "requireReasonForManualChange",
                "ai_enabled"                        as "aiEnabled",
                "axenita_export_enabled"            as "axenitaExportEnabled",
                "retention_policy_code"             as "retentionPolicyCode",
                "version"
           from "practice_settings"
          where "practice_id" = $1`,
        [practiceId],
      );

      return rows.rows[0];
    } finally {
      await appClient.query('rollback');
    }
  }

  /** The `version` the row genuinely holds, read through the runtime credential. */
  async function versionOf(practiceId: string): Promise<number | undefined> {
    const row = await grantedRowOf(practiceId);

    return row?.['version'] as number | undefined;
  }

  /**
   * `updated_at` and `updated_by`, read through a D-048 maintenance window.
   *
   * These two columns are NOT readable by the runtime credential — `updated_at` has an `UPDATE`
   * grant and no `SELECT` grant, and `updated_by` has neither (`02` §20.2b.1) — so the only way
   * to observe them at all is the trusted maintenance path the fixtures already use. That is
   * exactly why the assertions about them belong in this suite and can exist nowhere else: from
   * outside, "the route did not touch `updated_by`" is unobservable.
   */
  async function privilegedMetadataOf(
    practiceId: string,
  ): Promise<{ updatedAt: string; updatedBy: string | null } | undefined> {
    let captured: { updatedAt: string; updatedBy: string | null } | undefined;

    await runInForceRlsMaintenanceWindow(migrationClient, 'practice_settings', async (trusted) => {
      const rows = await trusted.query<{ updatedAt: Date; updatedBy: string | null }>(
        `select "updated_at" as "updatedAt", "updated_by" as "updatedBy"
           from "practice_settings"
          where "practice_id" = $1`,
        [practiceId],
      );

      const row = rows.rows[0];

      captured =
        row === undefined
          ? undefined
          : { updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
    });

    return captured;
  }

  /**
   * Resets practice A's settings row to {@link BASELINE} at {@link BASELINE_VERSION}.
   *
   * Through the RUNTIME credential and the accepted `practice_settings_update` policy, so the
   * reset can touch only the columns the route itself may touch. `updated_by` is deliberately not
   * reset — it has no `UPDATE` grant, which is precisely the property the "untouched" assertions
   * rely on, and it keeps {@link FIXTURE_UPDATED_BY} for the life of the suite.
   */
  async function resetPracticeA(): Promise<void> {
    await appClient.query('begin');

    try {
      await appClient.query(`select set_config('app.practice_id', $1, true)`, [PRACTICE_A]);
      await appClient.query(
        `update "practice_settings"
            set "billing_review_required"           = $2,
                "allow_mpa_approval"                = $3,
                "allow_billing_specialist_approval" = $4,
                "require_reason_for_manual_change"  = $5,
                "ai_enabled"                        = $6,
                "axenita_export_enabled"            = $7,
                "retention_policy_code"             = $8,
                "version"                           = $9,
                "updated_at"                        = timestamptz '2020-01-01T00:00:00Z'
          where "practice_id" = $1`,
        [
          PRACTICE_A,
          BASELINE.billingReviewRequired,
          BASELINE.allowMpaApproval,
          BASELINE.allowBillingSpecialistApproval,
          BASELINE.requireReasonForManualChange,
          BASELINE.aiEnabled,
          BASELINE.axenitaExportEnabled,
          BASELINE.retentionPolicyCode,
          BASELINE_VERSION,
        ],
      );
      await appClient.query('commit');
    } catch (error) {
      await appClient.query('rollback');
      throw error;
    }
  }

  beforeEach(async () => {
    // Every spec starts from the same row, so the suite has NO ordering dependency and a failing
    // spec cannot cascade into the next one.
    await resetPracticeA();
  });

  /** Asserts that a response carries NO canonical version tag (D-053 clause A.2). */
  function expectNoVersionTag(response: PatchResponse): void {
    expect(response.etag ?? '').not.toMatch(/^"\d+"$/);
  }

  /** Asserts a Problem Details refusal that discloses no `errors[]` and no settings field name. */
  function expectOpaqueRefusal(response: PatchResponse): void {
    expect(response.contentType).toContain('application/problem+json');
    expect(response.body).not.toHaveProperty('errors');

    const serialised = JSON.stringify(response.body);

    for (const field of [
      'aiEnabled',
      'billingReviewRequired',
      'allowMpaApproval',
      'allowBillingSpecialistApproval',
      'requireReasonForManualChange',
      'axenitaExportEnabled',
      'retentionPolicyCode',
    ]) {
      expect(serialised).not.toContain(field);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Route surface
  // ---------------------------------------------------------------------------------------------

  describe('route registration', () => {
    it('registers PATCH /practices/{practiceId}/settings', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      expect(response.status).toBe(200);
      expect(response.status).not.toBe(404);
    });

    it.each(['put', 'post', 'delete'] as const)(
      'still registers no %s on the settings path',
      async (method) => {
        const response = await request(app.getHttpServer())
          [method](`/api/v1/practices/${PRACTICE_A}/settings`)
          .set('Authorization', developmentBearer(admin))
          .set(PRACTICE_HEADER, PRACTICE_A);

        expect(response.status).toBe(404);
      },
    );

    it('registers no deeper route beneath settings', async () => {
      for (const path of [
        `/api/v1/practices/${PRACTICE_A}/settings/history`,
        `/api/v1/practices/${PRACTICE_A}/settings/version`,
      ]) {
        const response = await request(app.getHttpServer())
          .patch(path)
          .set('Authorization', developmentBearer(admin))
          .set(PRACTICE_HEADER, PRACTICE_A)
          .set(IF_MATCH_HEADER, BASELINE_TAG)
          .send({ aiEnabled: true });

        expect(response.status).toBe(404);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Authorisation order — the body schema must never be reachable before authorisation
  // ---------------------------------------------------------------------------------------------

  describe('the D-047 order — authorisation strictly before the body (03 §3.7.1)', () => {
    /**
     * A body that would produce a very loud `422 errors[]` if it were ever evaluated: one
     * wrongly typed field and one unknown field. Every refusal below carries it, so a schema
     * evaluation leaking through would be unmistakable rather than subtle.
     */
    const MALFORMED_BODY = { aiEnabled: 'yes', totallyUnknownField: 1 } as const;

    it('answers 401 for no credential at all, whatever the body says', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        authorization: null,
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(401);
      expect(response.body['code']).toBe('AUTHENTICATION_REQUIRED');
      expectOpaqueRefusal(response);
      expectNoVersionTag(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 401 for an invalid token, whatever the body says', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        authorization: 'Bearer not-a-real-token',
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(401);
      expect(response.body['code']).toBe('INVALID_TOKEN');
      expectOpaqueRefusal(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers the canonical admission refusal for an unknown subject', async () => {
      const response = await patchSettings('dev|nobody-at-all', PRACTICE_A, {
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(403);
      expect(response.body['code']).toBe('ACCESS_DENIED');
      expectOpaqueRefusal(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers the canonical admission refusal for a non-ACTIVE user', async () => {
      // The seeded `INACTIVE` user. Indistinguishable from the unknown subject above, by design.
      const response = await patchSettings('dev|inactive', PRACTICE_A, {
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(403);
      expect(response.body['code']).toBe('ACCESS_DENIED');
      expectOpaqueRefusal(response);
    });

    it('preserves the canonical X-Practice-ID refusals ahead of the precondition', async () => {
      const missing = await patchSettings(admin, PRACTICE_A, {
        header: null,
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(missing.status).toBe(400);
      expect(missing.body['code']).toBe('PRACTICE_CONTEXT_REQUIRED');
      expectOpaqueRefusal(missing);

      const malformed = await patchSettings(admin, PRACTICE_A, {
        header: 'not-a-uuid',
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(malformed.status).toBe(400);
      expect(malformed.body['code']).toBe('PRACTICE_CONTEXT_INVALID');
      expectOpaqueRefusal(malformed);

      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 403 for a path/header mismatch, whatever the body says', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        header: FIXTURE.practiceB,
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(403);
      expectOpaqueRefusal(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      expect(await versionOf(FIXTURE.practiceB)).toBe(3);
    });

    it('answers 403 for a caller with no membership, whatever the body says', async () => {
      const response = await patchSettings(admin, FIXTURE.practiceB, {
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(403);
      expect(response.body['code']).toBe('ACCESS_DENIED');
      expectOpaqueRefusal(response);
      expect(await versionOf(FIXTURE.practiceB)).toBe(3);
    });

    it('answers 403 for an INACTIVE membership, whatever the body says', async () => {
      const response = await patchSettings(FIXTURE.inactiveMemberSubject, PRACTICE_A, {
        ifMatch: null,
        body: MALFORMED_BODY,
      });

      expect(response.status).toBe(403);
      expectOpaqueRefusal(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 403 for a non-ACTIVE practice, whatever the body says', async () => {
      const response = await patchSettings(
        FIXTURE.suspendedAdminSubject,
        FIXTURE.suspendedPractice,
        { ifMatch: null, body: MALFORMED_BODY },
      );

      expect(response.status).toBe(403);
      expectOpaqueRefusal(response);
      expect(await versionOf(FIXTURE.suspendedPractice)).toBe(9);
    });

    it.each(ROLE_CALLERS.filter((caller) => !caller.allowed))(
      'answers 403 for $role — who lacks practice.settings.manage — whatever the body says',
      async ({ subject }) => {
        const response = await patchSettings(subject, PRACTICE_A, {
          ifMatch: null,
          body: MALFORMED_BODY,
        });

        expect(response.status).toBe(403);
        expect(response.body['code']).toBe('ACCESS_DENIED');
        // NOT `428`, even though the precondition is genuinely missing: the permission decision
        // is step 10 and the precondition is step 11a, so an unauthorised caller never learns
        // that this route has a precondition at all.
        expect(response.status).not.toBe(428);
        expectOpaqueRefusal(response);
        expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      },
    );

    it('reaches the precondition and the body ONLY for a caller holding the permission', async () => {
      // The contrast that proves the ordering. The SAME malformed body that produced a bare
      // `403` for every caller above produces a `422` with `errors[]` for this one — because this
      // caller is authorised. A field-level `422` is a description of an internal contract, and
      // describing it is something only an authorised caller may receive.
      const response = await patchSettings(admin, PRACTICE_A, { body: MALFORMED_BODY });

      expect(response.status).toBe(422);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      expect(response.body['errors']).toBeDefined();
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Pre-authentication body parsing — COMPATIBLE_PREEXISTING, and unchanged by this slice
  // ---------------------------------------------------------------------------------------------

  describe('pre-auth JSON parsing is unchanged by registering this route', () => {
    it('answers the same static 400 for malformed JSON, with no errors[]', async () => {
      // TRANSPORT-LEVEL, ROUTE-INDEPENDENT, AND NOT PATCH SCHEMA DISCLOSURE.
      //
      // `express.json()` runs before routing and before authentication, so a syntactically broken
      // body is refused before this route is reached at all. That behaviour predates this slice,
      // is repository-wide, and was classified COMPATIBLE_PREEXISTING by owner review: the
      // document is static, carries NO `errors[]`, names no field of any DTO and is identical on
      // every route. This spec exists so that registering `PATCH` cannot quietly change it, and
      // so that nobody later "fixes" body parsing inside a settings slice.
      const response = await patchSettings(admin, PRACTICE_A, { rawBody: '{"aiEnabled":' });

      expect(response.status).toBe(400);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      expect(response.body).not.toHaveProperty('errors');
      expectOpaqueRefusal(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers that same static 400 even for an unauthenticated caller', async () => {
      // The proof that it is genuinely pre-auth: no credential, and still the transport refusal
      // rather than `401`. Nothing about the settings contract is disclosed either way.
      const response = await patchSettings(admin, PRACTICE_A, {
        authorization: null,
        rawBody: '{"aiEnabled":',
      });

      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty('errors');
    });

    it('is route-independent — the same 400 on a path that is not registered at all', async () => {
      // The sharpest available statement of route-independence. This path has NO handler, so a
      // well-formed request to it is `404`; a malformed one is `400`, because the body parser
      // refuses it BEFORE routing ever happens. The settings route gets the identical document,
      // which is what "not PATCH schema disclosure" means: nothing about this behaviour is a
      // property of the settings contract.
      const unregistered = await request(app.getHttpServer())
        .patch('/api/v1/no-such-resource')
        .set('Content-Type', 'application/json')
        .send('{"aiEnabled":');

      const settings = await patchSettings(admin, PRACTICE_A, { rawBody: '{"aiEnabled":' });

      expect(unregistered.status).toBe(400);
      expect(settings.status).toBe(400);
      expect((unregistered.body as Record<string, unknown>)['code']).toBe(settings.body['code']);
      expect((unregistered.body as Record<string, unknown>)['detail']).toBe(
        settings.body['detail'],
      );
      expect(unregistered.body).not.toHaveProperty('errors');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // If-Match
  // ---------------------------------------------------------------------------------------------

  describe('If-Match (D-055 clauses 10 to 13, ratification R1)', () => {
    it('answers 428 PRECONDITION_REQUIRED when the header is absent', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        ifMatch: null,
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(428);
      expect(response.body['code']).toBe('PRECONDITION_REQUIRED');
      expect(response.body).not.toHaveProperty('errors');
      expectNoVersionTag(response);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 400 — not 428 — when the header is present but empty', async () => {
      // The distinction of D-055 clauses 10 to 12, which is easy to lose and frozen: an EMPTY
      // value is a malformed validator, not a missing one. Folding it into `428` would tell a
      // client to add a header it demonstrably sent.
      const response = await patchSettings(admin, PRACTICE_A, {
        ifMatch: '',
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(400);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      expect(response.status).not.toBe(428);
      expect(response.body).not.toHaveProperty('errors');
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it.each([
      ['W/"7"', 'the WEAK form of the CURRENT version — refused by the grammar, never compared'],
      ['*', 'the wildcard would mean "write regardless of version"'],
      ['"7", "8"', 'a validator list'],
      ['7', 'unquoted'],
      ['"07"', 'a non-canonical decimal rendering'],
      ['"abc"', 'not an integer'],
      ['"-7"', 'negative'],
      ['" 7"', 'internal whitespace — the header is not trimmed'],
      ['"7', 'malformed quoting'],
      ['"2147483648"', 'one above the int4 ceiling (ratification R1)'],
      ['"99999999999999999999999999"', 'a huge decimal that must never be bound'],
    ])('answers 400 for %j — %s', async (ifMatch) => {
      const response = await patchSettings(admin, PRACTICE_A, {
        ifMatch,
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(400);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      // NEVER `409`: that would tell a client to re-read the resource and retry a request it
      // would malform in exactly the same way.
      expect(response.status).not.toBe(409);
      expect(response.body).not.toHaveProperty('errors');
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('a weak validator can NEVER satisfy If-Match, even naming the exact current version', async () => {
      // `W/"7"` names the version the row holds RIGHT NOW. It is still `400`, and the row still
      // does not move. `GET` revalidation uses weak comparison and may match this same token
      // (D-055 clause 5); that is expected HTTP semantics for a read and is NOT a precedent for a
      // write, which authorises against exactly one version (clause 13).
      const response = await patchSettings(admin, PRACTICE_A, {
        ifMatch: `W/${BASELINE_TAG}`,
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(400);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      expect((await grantedRowOf(PRACTICE_A))?.['aiEnabled']).toBe(false);
    });

    it('accepts the int4 maximum as a TOKEN and refuses the value above it', async () => {
      // Against practice A, whose version is 7, so both are ultimately refusals — but for
      // DIFFERENT reasons, and the difference is the parser. `"2147483647"` is well-formed and
      // reaches the statement, which matches no row: `409`. `"2147483648"` never gets there: `400`.
      const accepted = await patchSettings(admin, PRACTICE_A, {
        ifMatch: `"${String(MAX_INT4)}"`,
        body: { aiEnabled: true },
      });
      expect(accepted.status).toBe(409);

      const rejected = await patchSettings(admin, PRACTICE_A, {
        ifMatch: '"2147483648"',
        body: { aiEnabled: true },
      });
      expect(rejected.status).toBe(400);
    });

    it('no client-supplied If-Match can produce a PostgreSQL 22003', async () => {
      // The closing property of the parser, asserted against a REAL database: for every one of
      // these tokens the answer is a deliberate `400`, `409` or `428` — never the `500` a
      // `numeric_value_out_of_range` would produce through the generic internal-error path.
      const tokens = [
        '"2147483648"',
        '"4294967296"',
        '"9223372036854775808"',
        `"${'9'.repeat(40)}"`,
        `"${'1'.repeat(400)}"`,
      ];

      for (const ifMatch of tokens) {
        const response = await patchSettings(admin, PRACTICE_A, {
          ifMatch,
          body: { aiEnabled: true },
        });

        expect(response.status).toBe(400);
        expect(response.status).not.toBe(500);
      }

      // And the database confirms what the parser is protecting against: bind one of those
      // values directly and PostgreSQL raises `22003`.
      expect(await sqlStateOf(appClient, `select 2147483648::integer`)).toBe('22003');
    });

    it('accepts "0" syntactically and answers the ordinary 409 (ratification R1)', async () => {
      // `"0"` is valid grammar and is deliberately NOT special-cased. Because the persisted
      // version is constrained `>= 1`, it simply matches no row and takes the zero-row path.
      const response = await patchSettings(admin, PRACTICE_A, {
        ifMatch: '"0"',
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(409);
      expect(response.body['code']).toBe('VERSION_CONFLICT');
      expect(response.status).not.toBe(400);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 409 for a STALE but syntactically valid version', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        ifMatch: `"${String(BASELINE_VERSION - 1)}"`,
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(409);
      expect(response.body['code']).toBe('VERSION_CONFLICT');
      expect(response.body).not.toHaveProperty('errors');
      expectNoVersionTag(response);
      // A conflicted write consumes nothing.
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      expect((await grantedRowOf(PRACTICE_A))?.['aiEnabled']).toBe(false);
    });

    it('proceeds when the version matches', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      expect(response.status).toBe(200);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
    });

    it('ignores If-None-Match — it neither replaces If-Match nor changes an outcome', async () => {
      // With a valid `If-Match`, a matching `If-None-Match` changes nothing: the write happens.
      const withBoth = await request(app.getHttpServer())
        .patch(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set(IF_MATCH_HEADER, BASELINE_TAG)
        .set('If-None-Match', BASELINE_TAG)
        .send({ aiEnabled: true });

      expect(withBoth.status).toBe(200);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);

      // And without `If-Match`, an `If-None-Match` cannot stand in for it.
      const withoutIfMatch = await request(app.getHttpServer())
        .patch(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set('If-None-Match', `"${String(BASELINE_VERSION + 1)}"`)
        .send({ aiEnabled: false });

      expect(withoutIfMatch.status).toBe(428);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Body
  // ---------------------------------------------------------------------------------------------

  describe('the request body (D-053 clause B.1, D-055 clause 14)', () => {
    it('answers 400 for a request with no body at all, and writes nothing', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: undefined });

      expect(response.status).toBe(400);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      expect(response.body).not.toHaveProperty('errors');
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 400 for an array root, and writes nothing', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: [] });

      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty('errors');
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('answers 400 for an array root carrying what would be a valid object', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: [{ aiEnabled: true }] });

      expect(response.status).toBe(400);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      expect((await grantedRowOf(PRACTICE_A))?.['aiEnabled']).toBe(false);
    });

    it('answers 400 with NO errors[] for the empty object', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: {} });

      expect(response.status).toBe(400);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      // Endpoint-specific `400` (clause 14), NOT the generic `422` ValidationPipe document. The
      // absence of `errors[]` is what distinguishes them from outside.
      expect(response.status).not.toBe(422);
      expect(response.body).not.toHaveProperty('errors');
    });

    it('leaves version AND updated_at untouched after an empty patch (clause 14)', async () => {
      // The three prohibitions of clause 14, proven against the real row: no `UPDATE`, no version
      // increment, no `updated_at` change. `updated_at` is only observable through the trusted
      // maintenance path, which is why this assertion can live nowhere but a suite like this one.
      const before = await privilegedMetadataOf(PRACTICE_A);

      expect((await patchSettings(admin, PRACTICE_A, { body: {} })).status).toBe(400);

      const after = await privilegedMetadataOf(PRACTICE_A);

      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      expect(after?.updatedAt).toBe(before?.updatedAt);
      expect(after?.updatedBy).toBe(before?.updatedBy);
    });

    it('answers 422 UNKNOWN_FIELD for a body of only unknown fields, never an empty patch', async () => {
      // The ordering that matters: the schema runs BEFORE the emptiness count, so a body that
      // the whitelist would strip to `{}` is reported as what it actually is.
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { totallyUnknownField: true },
      });

      expect(response.status).toBe(422);
      expect(response.body['code']).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body['errors'])).toContain('UNKNOWN_FIELD');
      expect(response.status).not.toBe(400);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it.each([
      ['version', 8],
      ['updatedAt', '2026-08-20T00:00:00.000Z'],
      ['updatedBy', '22222222-2222-4222-8222-222222222001'],
      ['practiceId', FIXTURE.practiceB],
      ['id', '55555555-5555-4555-8555-555555555001'],
      ['configuration', { secret: 'x' }],
    ] as const)(
      'refuses the non-contract field %s with 422 UNKNOWN_FIELD',
      async (field, value) => {
        // D-053 clause B.6: `version`, `updatedAt` and `updatedBy` are not accepted in the body.
        // `practiceId`, `id` and `configuration` are not accepted either — none is mutable.
        const response = await patchSettings(admin, PRACTICE_A, {
          body: { aiEnabled: true, [field]: value },
        });

        expect(response.status).toBe(422);
        expect(JSON.stringify(response.body['errors'])).toContain('UNKNOWN_FIELD');
        expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
      },
    );

    it.each([
      ['aiEnabled', 'yes', 'INVALID_BOOLEAN'],
      ['aiEnabled', 1, 'INVALID_BOOLEAN'],
      ['aiEnabled', null, 'INVALID_BOOLEAN'],
      ['billingReviewRequired', null, 'INVALID_BOOLEAN'],
      ['allowMpaApproval', 'true', 'INVALID_BOOLEAN'],
      ['retentionPolicyCode', 7, 'INVALID_STRING'],
      ['retentionPolicyCode', true, 'INVALID_STRING'],
    ] as const)('refuses %s = %j with 422 %s', async (field, value, code) => {
      const response = await patchSettings(admin, PRACTICE_A, { body: { [field]: value } });

      expect(response.status).toBe(422);
      expect(JSON.stringify(response.body['errors'])).toContain(code);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('refuses a retentionPolicyCode of 101 characters with 422 INVALID_LENGTH', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { retentionPolicyCode: 'x'.repeat(101) },
      });

      expect(response.status).toBe(422);
      expect(JSON.stringify(response.body['errors'])).toContain('INVALID_LENGTH');
      // The value never reaches the statement, so the column's own `22001` — which would surface
      // as a generic `500` — is never triggered by a client input defect.
      expect(response.status).not.toBe(500);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('accepts exactly 100 characters and persists them verbatim', async () => {
      const code = 'y'.repeat(100);
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { retentionPolicyCode: code },
      });

      expect(response.status).toBe(200);
      expect(response.body['retentionPolicyCode']).toBe(code);
      // NOT TRUNCATED. This is the owner-correction C1 property: the parameter is cast to `text`,
      // never to `varchar(100)`, so a value at the bound survives byte for byte. A silent
      // `varchar(100)` cast would have made an over-long value truncate here instead of failing.
      expect((await grantedRowOf(PRACTICE_A))?.['retentionPolicyCode']).toBe(code);
    });

    it('accepts the empty retention string and keeps it distinct from NULL', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { retentionPolicyCode: '' },
      });

      expect(response.status).toBe(200);
      expect(response.body['retentionPolicyCode']).toBe('');
      expect(response.body['retentionPolicyCode']).not.toBeNull();
      expect((await grantedRowOf(PRACTICE_A))?.['retentionPolicyCode']).toBe('');
    });

    it('persists retentionPolicyCode: null as a real SQL NULL', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { retentionPolicyCode: null },
      });

      expect(response.status).toBe(200);
      expect(response.body['retentionPolicyCode']).toBeNull();

      const row = await grantedRowOf(PRACTICE_A);
      expect(row?.['retentionPolicyCode']).toBeNull();
      // And the key is still rendered, so the document keeps the same eight names.
      expect(Object.keys(response.body).sort()).toEqual(FROZEN_KEYS);
    });

    it('persists `false` — it is a SUBMITTED value, not an absence', async () => {
      // The single most likely presence bug on this route. `billingReviewRequired` starts `true`,
      // so a truthiness-based presence rule would drop the assignment and silently refuse to turn
      // the control off, while still answering `200`.
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { billingReviewRequired: false },
      });

      expect(response.status).toBe(200);
      expect(response.body['billingReviewRequired']).toBe(false);
      expect((await grantedRowOf(PRACTICE_A))?.['billingReviewRequired']).toBe(false);
    });

    it('leaves omitted fields unchanged', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        practiceId: PRACTICE_A,
        ...BASELINE,
        aiEnabled: true,
      });
      expect(await grantedRowOf(PRACTICE_A)).toEqual({
        practiceId: PRACTICE_A,
        ...BASELINE,
        aiEnabled: true,
        version: BASELINE_VERSION + 1,
      });
    });

    it('applies a partial patch and nothing else', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { aiEnabled: true, retentionPolicyCode: 'CH-10Y' },
      });

      expect(response.status).toBe(200);
      expect(await grantedRowOf(PRACTICE_A)).toEqual({
        practiceId: PRACTICE_A,
        ...BASELINE,
        aiEnabled: true,
        retentionPolicyCode: 'CH-10Y',
        version: BASELINE_VERSION + 1,
      });
    });

    it('applies all seven mutable fields in one request', async () => {
      const body = {
        billingReviewRequired: false,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
        requireReasonForManualChange: false,
        aiEnabled: true,
        axenitaExportEnabled: true,
        retentionPolicyCode: 'CH-ALL',
      };

      const response = await patchSettings(admin, PRACTICE_A, { body });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ practiceId: PRACTICE_A, ...body });
      expect(await grantedRowOf(PRACTICE_A)).toEqual({
        practiceId: PRACTICE_A,
        ...body,
        version: BASELINE_VERSION + 1,
      });
      // Still ONE increment, however many fields moved.
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
    });

    it('does not coerce "true" into true — implicit conversion stays off', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: 'true' } });

      expect(response.status).toBe(422);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The atomic statement
  // ---------------------------------------------------------------------------------------------

  describe('the atomic UPDATE (D-055 clauses 15 to 23)', () => {
    it('increments version by exactly one', async () => {
      expect((await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } })).status).toBe(
        200,
      );

      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
    });

    it('leaves updated_by UNTOUCHED after a successful PATCH (D-053 clause B.3)', async () => {
      // ASSERTED THROUGH THE PRIVILEGED FIXTURE READ, because the runtime role cannot `SELECT`
      // this column at all. The fixture wrote a recognisable non-null value precisely so that
      // "unchanged" is a real assertion rather than "still null".
      const before = await privilegedMetadataOf(PRACTICE_A);
      expect(before?.updatedBy).toBe(FIXTURE_UPDATED_BY);

      expect((await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } })).status).toBe(
        200,
      );

      const after = await privilegedMetadataOf(PRACTICE_A);

      expect(after?.updatedBy).toBe(FIXTURE_UPDATED_BY);
      expect(after?.updatedBy).toBe(before?.updatedBy);
      // And the write really did happen, so "unchanged" is not "nothing ran".
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
    });

    it('moves updated_at, and the database is what produced it', async () => {
      const before = await privilegedMetadataOf(PRACTICE_A);

      expect((await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } })).status).toBe(
        200,
      );

      const after = await privilegedMetadataOf(PRACTICE_A);

      expect(after?.updatedAt).not.toBe(before?.updatedAt);
      // The fixture parks `updated_at` in 2020; `now()` inside the statement cannot produce that,
      // and no application clock is involved.
      expect(new Date(after?.updatedAt ?? 0).getTime()).toBeGreaterThan(
        new Date('2020-01-01T00:00:00Z').getTime(),
      );
    });

    it('does not name updated_at in RETURNING — which would be 42501 (02 §20.2b.1)', async () => {
      // THE PROOF IS THE `200` ITSELF. `copilot_app` holds `UPDATE` on `updated_at` and no
      // `SELECT`, so a statement whose `RETURNING` named it would fail with
      // `insufficient_privilege` and the request would be a generic `500`. A successful write is
      // therefore evidence that the returning list stayed inside the nine readable columns.
      expect(await sqlStateOf(appClient, `select "updated_at" from "practice_settings"`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );

      const response = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      expect(response.status).toBe(200);
      expect(response.status).not.toBe(500);
      // Nor does the value reach the response document by any other route.
      expect(Object.keys(response.body).sort()).toEqual(FROZEN_KEYS);
      expect(JSON.stringify(response.body)).not.toContain('updatedAt');
      expect(JSON.stringify(response.body)).not.toContain('updated_at');
    });

    it.each(['id', 'configuration', 'updated_at', 'updated_by'])(
      'still cannot select practice_settings.%s at all',
      async (column) => {
        expect(await sqlStateOf(appClient, `select "${column}" from "practice_settings"`)).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      },
    );

    it.each(['practice_id', 'id', 'configuration', 'updated_by'])(
      'still cannot update practice_settings.%s at all',
      async (column) => {
        // The `UPDATE` surface is exactly nine columns (D-055 clause 18). These four are outside
        // it, and the GRANT is the barrier — not the statement — so the property survives an
        // application bug and a compromised credential alike.
        expect(
          await sqlStateOf(
            appClient,
            `update "practice_settings" set "${column}" = null where false`,
          ),
        ).toBe(INSUFFICIENT_PRIVILEGE);
      },
    );

    it('leaves the practiceId of the row unchanged', async () => {
      expect((await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } })).status).toBe(
        200,
      );

      expect((await grantedRowOf(PRACTICE_A))?.['practiceId']).toBe(PRACTICE_A);
    });

    it('has no INSERT or DELETE path on this table at all', async () => {
      // Clause 17: no `INSERT`, no `DELETE`, no upsert. Not merely unwritten — unexpressible.
      expect(
        await sqlStateOf(
          appClient,
          `insert into "practice_settings" ("practice_id", "billing_review_required",
                                            "require_reason_for_manual_change", "ai_enabled",
                                            "axenita_export_enabled")
           values ('${FIXTURE.practiceD}'::uuid, false, false, false, false)`,
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);

      expect(await sqlStateOf(appClient, `delete from "practice_settings"`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    });

    it('returns a body and an ETag that describe the SAME state', async () => {
      const response = await patchSettings(admin, PRACTICE_A, {
        body: { aiEnabled: true, retentionPolicyCode: 'CH-1Y' },
      });

      expect(response.status).toBe(200);
      expect(response.etag).toBe(`"${String(BASELINE_VERSION + 1)}"`);
      expect(response.body['aiEnabled']).toBe(true);
      expect(response.body['retentionPolicyCode']).toBe('CH-1Y');

      // A subsequent read of the resource agrees with both halves.
      const read = await readSettings(admin, PRACTICE_A);
      expect(read.body).toEqual(response.body);
      expect(read.etag).toBe(response.etag);
    });

    it('emits a STRONG tag and never publishes version in the body', async () => {
      const response = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      expect(response.etag).toMatch(/^"\d+"$/);
      expect(response.etag).not.toMatch(/^W\//);
      expect(Object.keys(response.body).sort()).toEqual(FROZEN_KEYS);
      expect(JSON.stringify(response.body)).not.toContain('version');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Same-value patch
  // ---------------------------------------------------------------------------------------------

  describe('a same-value patch is a real patch', () => {
    it('writes, increments and re-tags when the submitted value equals the stored one', async () => {
      // The row already holds `billingReviewRequired: true`. Submitting `true` is still a patch.
      // An `IS DISTINCT FROM` predicate or an application-level no-op check would answer `200`
      // with an unchanged version, and the caller's next `If-Match` would then be a guess.
      const before = await privilegedMetadataOf(PRACTICE_A);

      const response = await patchSettings(admin, PRACTICE_A, {
        body: { billingReviewRequired: true },
      });

      expect(response.status).toBe(200);
      expect(response.etag).toBe(`"${String(BASELINE_VERSION + 1)}"`);
      expect(response.body['billingReviewRequired']).toBe(true);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
      expect((await privilegedMetadataOf(PRACTICE_A))?.updatedAt).not.toBe(before?.updatedAt);
    });

    it('increments once per request, not once per changed value', async () => {
      const first = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: false } });
      expect(first.status).toBe(200);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);

      const second = await patchSettings(admin, PRACTICE_A, {
        ifMatch: first.etag ?? '',
        body: { aiEnabled: false },
      });
      expect(second.status).toBe(200);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 2);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Zero rows and cross-tenant
  // ---------------------------------------------------------------------------------------------

  describe('zero rows is one outcome (D-055 clauses 19 to 21)', () => {
    it('answers 409 — not 404, 403 or 500 — when the settings row does not exist', async () => {
      // Everything else passes for this caller: ACTIVE user, ACTIVE practice, ACTIVE membership,
      // tenant context established, `practice.settings.manage` held. Only the row is missing.
      const response = await patchSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD, {
        ifMatch: '"1"',
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(409);
      expect(response.body['code']).toBe('VERSION_CONFLICT');
      expect([404, 403, 500]).not.toContain(response.status);
      expect(response.body).not.toHaveProperty('errors');
      // NOTHING was created. There is no `INSERT` grant, so a write-behind repair is
      // unexpressible as well as forbidden.
      expect(await grantedRowOf(FIXTURE.practiceD)).toBeUndefined();
    });

    it('gives the missing row and a stale version the SAME status and the SAME body', async () => {
      // The indistinguishability clause 19 requires: a client cannot learn which cause applied,
      // and therefore cannot use this route as an existence oracle.
      const missing = await patchSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD, {
        ifMatch: '"1"',
        body: { aiEnabled: true },
      });
      const stale = await patchSettings(admin, PRACTICE_A, {
        ifMatch: '"1"',
        body: { aiEnabled: true },
      });

      expect(missing.status).toBe(stale.status);
      expect(missing.body['code']).toBe(stale.body['code']);
      expect(missing.body['detail']).toBe(stale.body['detail']);
      expect(missing.body['title']).toBe(stale.body['title']);
    });

    it('keeps the GET asymmetry of clause 21 intact', async () => {
      // The SAME database state, the SAME caller, two methods, two accepted answers: a read that
      // discovers a missing row is a broken-invariant `500`, and a write that discovers it
      // through zero matched rows is `409`. The asymmetry is deliberate — a write learns it for
      // free, and paying for the distinction on a read would cost nothing but paying for it on a
      // write would cost the atomicity.
      const read = await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);
      const write = await patchSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD, {
        ifMatch: '"1"',
        body: { aiEnabled: true },
      });

      expect(read.status).toBe(500);
      expect(write.status).toBe(409);
    });

    it('cannot modify a practice the caller is not a member of', async () => {
      const beforeB = await grantedRowOf(FIXTURE.practiceB);

      // Every way of naming the foreign practice: in the path AND header together, and as a
      // mismatched header alone.
      for (const options of [
        { header: FIXTURE.practiceB, path: FIXTURE.practiceB },
        { header: FIXTURE.practiceB, path: PRACTICE_A },
        { header: PRACTICE_A, path: FIXTURE.practiceB },
      ]) {
        const response = await patchSettings(admin, FIXTURE.practiceB, {
          ...options,
          ifMatch: '"3"',
          body: { aiEnabled: true, retentionPolicyCode: 'HIJACKED' },
        });

        expect(response.status).toBe(403);
      }

      // Byte for byte the row it was.
      expect(await grantedRowOf(FIXTURE.practiceB)).toEqual(beforeB);
      expect((await privilegedMetadataOf(FIXTURE.practiceB))?.updatedBy).toBe(FIXTURE_UPDATED_BY);
    });

    it('cannot write another tenant even at the database level (02 §17.1)', async () => {
      // The application-independent statement of the same property. With `app.practice_id`
      // established for A, the `practice_settings_update` policy exposes no other row to update
      // at all — so even a statement that deliberately named B changes nothing.
      await appClient.query('begin');

      try {
        await appClient.query(`select set_config('app.practice_id', $1, true)`, [PRACTICE_A]);

        const result = await appClient.query(
          `update "practice_settings" set "ai_enabled" = true where "practice_id" = $1`,
          [FIXTURE.practiceB],
        );

        expect(result.rowCount).toBe(0);
      } finally {
        await appClient.query('rollback');
      }

      // And with no context at all, the table is unwritable outright.
      const withoutContext = await appClient.query(
        `update "practice_settings" set "ai_enabled" = true`,
      );
      expect(withoutContext.rowCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------------------------------------------

  describe('concurrency (D-055 clauses 15 and 16)', () => {
    it('lets exactly ONE of two identical-ETag writers win, and increments exactly once', async () => {
      // THE PROPERTY THE WHOLE DESIGN EXISTS FOR, against a real database with real transactions.
      // Two requests assert the same current version at the same moment. The row lock serialises
      // them; the loser re-evaluates `version = 7` against a row that now holds `8`, matches zero
      // rows, and becomes `409`. A read-then-write implementation would let BOTH succeed and one
      // caller's change would vanish.
      const [first, second] = await Promise.all([
        patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } }),
        patchSettings(admin, PRACTICE_A, { body: { axenitaExportEnabled: true } }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);

      expect(statuses).toEqual([200, 409]);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);

      // The winner's change is present and the loser's is not — no silent merge, no lost update.
      const row = await grantedRowOf(PRACTICE_A);
      const winner = first.status === 200 ? 'aiEnabled' : 'axenitaExportEnabled';
      const loser = first.status === 200 ? 'axenitaExportEnabled' : 'aiEnabled';

      expect(row?.[winner]).toBe(true);
      expect(row?.[loser]).toBe(false);
    });

    it('lets exactly one of FIVE identical-ETag writers win', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } }),
        ),
      );

      expect(results.filter((result) => result.status === 200)).toHaveLength(1);
      expect(results.filter((result) => result.status === 409)).toHaveLength(4);
      // Five requests, ONE increment. Any other number means a version was consumed by a request
      // that did not write, or two writes shared one version.
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
    });

    it('keeps concurrent writes to DIFFERENT practices isolated', async () => {
      const [a, m] = await Promise.all([
        patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } }),
        patchSettings(FIXTURE.maxAdminSubject, FIXTURE.practiceMax, {
          ifMatch: '"1"',
          body: { aiEnabled: true },
        }),
      ]);

      expect(a.status).toBe(200);
      expect(a.body['practiceId']).toBe(PRACTICE_A);
      // The int4-max practice's row is untouched by A's write, and its own request conflicted.
      expect(m.status).toBe(409);
      expect(await versionOf(FIXTURE.practiceMax)).toBe(MAX_INT4);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Round trip
  // ---------------------------------------------------------------------------------------------

  describe('the ETag round trip (D-055 clauses 11 and 22)', () => {
    it('accepts the ETag of PATCH #1 verbatim as the If-Match of PATCH #2', async () => {
      // THE PROPERTY A CLIENT ACTUALLY DEPENDS ON, end to end. The emitted tag and the accepted
      // grammar are separate pieces of code; if either drifts, a well-behaved client that echoes
      // what it was given starts receiving `400`.
      const first = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      expect(first.status).toBe(200);
      expect(first.etag).toBe(`"${String(BASELINE_VERSION + 1)}"`);

      const second = await patchSettings(admin, PRACTICE_A, {
        ifMatch: first.etag ?? '',
        body: { aiEnabled: false, retentionPolicyCode: 'CH-2Y' },
      });

      expect(second.status).toBe(200);
      expect(second.etag).toBe(`"${String(BASELINE_VERSION + 2)}"`);
      expect(second.body['aiEnabled']).toBe(false);
      expect(second.body['retentionPolicyCode']).toBe('CH-2Y');
    });

    it('accepts a GET ETag as the If-Match of a PATCH, and vice versa', async () => {
      // `GET` and `PATCH` emit the SAME token for the same state (D-055 clause 13), so a client
      // may read then write without translating anything.
      const read = await readSettings(admin, PRACTICE_A);
      expect(read.etag).toBe(BASELINE_TAG);

      const written = await patchSettings(admin, PRACTICE_A, {
        ifMatch: read.etag ?? '',
        body: { aiEnabled: true },
      });
      expect(written.status).toBe(200);

      const readAgain = await readSettings(admin, PRACTICE_A);
      expect(readAgain.etag).toBe(written.etag);
    });

    it('refuses the PREVIOUS tag once a newer version exists', async () => {
      const first = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });
      expect(first.status).toBe(200);

      const replayed = await patchSettings(admin, PRACTICE_A, {
        ifMatch: BASELINE_TAG,
        body: { aiEnabled: false },
      });

      expect(replayed.status).toBe(409);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
      expect((await grantedRowOf(PRACTICE_A))?.['aiEnabled']).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The int4 ceiling — owner ratification R2
  // ---------------------------------------------------------------------------------------------

  describe('the int4 version ceiling (owner ratification R2)', () => {
    it('answers a static 500 and rolls back when version + 1 overflows int4', async () => {
      // THE RATIFIED EDGE, EXERCISED FOR REAL. The fixture row is parked at `2147483647`, so
      // `If-Match: "2147483647"` is a VALID and CURRENT token: the request passes the grammar,
      // passes every tenant barrier, and matches the row. `version + 1` inside the statement is
      // what fails, with PostgreSQL `22003`.
      //
      // The accepted handling is the GENERIC internal-error path — no `400` (the token is
      // well-formed and current), no `409` (there is no conflict to re-read), no pre-read, no
      // clamp and no dedicated `catch`. This spec is what proves the generic path really is what
      // runs, rather than being asserted from the source comment alone.
      const response = await patchSettings(FIXTURE.maxAdminSubject, FIXTURE.practiceMax, {
        ifMatch: `"${String(MAX_INT4)}"`,
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(500);
      expect(response.body['code']).toBe('INTERNAL_ERROR');
      expect([400, 409]).not.toContain(response.status);
      expect(response.body['detail']).toBe('An unexpected internal error occurred.');

      // The Problem Details body is static and non-sensitive: no SQLSTATE, no driver message, no
      // statement, no column, no table and no version.
      //
      // `instance` is EXCLUDED from this sweep on purpose. It is `request.originalUrl` — the
      // caller's own request URI, which necessarily contains the practice id the caller just
      // sent — and it is written by the single global Problem Details filter for every route in
      // the API. Echoing a caller's own path back to them discloses nothing they do not already
      // know, it predates this slice, and it is not this slice's to change (D-055 clause 33).
      // The members this slice actually produces are swept instead.
      const authored = JSON.stringify({
        title: response.body['title'],
        detail: response.body['detail'],
        code: response.body['code'],
      });

      for (const forbidden of [
        '22003',
        'numeric_value_out_of_range',
        'practice_settings',
        'version',
        'out of range',
        'overflow',
        String(MAX_INT4),
        FIXTURE.practiceMax,
      ]) {
        expect(authored).not.toContain(forbidden);
      }

      expect(response.body).not.toHaveProperty('errors');
      expectNoVersionTag(response);
    });

    it('rolls the transaction back completely — nothing about the row moved', async () => {
      const before = await privilegedMetadataOf(FIXTURE.practiceMax);
      const beforeRow = await grantedRowOf(FIXTURE.practiceMax);

      expect(
        (
          await patchSettings(FIXTURE.maxAdminSubject, FIXTURE.practiceMax, {
            ifMatch: `"${String(MAX_INT4)}"`,
            body: { aiEnabled: true, retentionPolicyCode: 'SHOULD-NOT-PERSIST' },
          })
        ).status,
      ).toBe(500);

      const after = await privilegedMetadataOf(FIXTURE.practiceMax);

      // Version unchanged, business fields unchanged, `updated_at` unchanged, `updated_by`
      // unchanged. A partially applied statement is what a failed rollback would look like.
      expect(await versionOf(FIXTURE.practiceMax)).toBe(MAX_INT4);
      expect(await grantedRowOf(FIXTURE.practiceMax)).toEqual(beforeRow);
      expect(after?.updatedAt).toBe(before?.updatedAt);
      expect(after?.updatedBy).toBe(before?.updatedBy);
    });

    it('leaves no GUC residue and does not contaminate the next request', async () => {
      expect(
        (
          await patchSettings(FIXTURE.maxAdminSubject, FIXTURE.practiceMax, {
            ifMatch: `"${String(MAX_INT4)}"`,
            body: { aiEnabled: true },
          })
        ).status,
      ).toBe(500);

      const context = await appClient.query<{ practice: string | null; user: string | null }>(
        `select nullif(current_setting('app.practice_id', true), '') as "practice",
                nullif(current_setting('app.user_id', true), '')     as "user"`,
      );

      expect(context.rows[0]?.practice).toBeNull();
      expect(context.rows[0]?.user).toBeNull();

      // The very next request of a different, fully eligible caller is unaffected.
      const next = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });
      expect(next.status).toBe(200);
    });

    it('is reached only by an authorised caller — the ceiling is not a bypass', async () => {
      // A caller with no membership in the int4-max practice gets the ordinary `403`, not the
      // overflow. The edge case does not create a path around the tenant barriers.
      const response = await patchSettings(admin, FIXTURE.practiceMax, {
        ifMatch: `"${String(MAX_INT4)}"`,
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(403);
      expect(await versionOf(FIXTURE.practiceMax)).toBe(MAX_INT4);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Tenant context lifecycle
  // ---------------------------------------------------------------------------------------------

  describe('tenant context lifecycle (03 §3.7.1 steps 5-7, D-033, 08 §21.5.7)', () => {
    /** Every outcome this route can produce, with the request that produces it. */
    const OUTCOMES = [
      ['200 success', 200, { body: { aiEnabled: true } }],
      ['428 missing precondition', 428, { ifMatch: null, body: { aiEnabled: true } }],
      ['400 malformed precondition', 400, { ifMatch: 'nonsense', body: { aiEnabled: true } }],
      ['422 body schema', 422, { body: { aiEnabled: 'yes' } }],
      ['400 empty patch', 400, { body: {} }],
      ['409 version conflict', 409, { ifMatch: '"1"', body: { aiEnabled: true } }],
    ] as const;

    it.each(OUTCOMES)(
      'leaves no app.practice_id or app.user_id behind after %s',
      async (_label, expected, options) => {
        expect((await patchSettings(admin, PRACTICE_A, options)).status).toBe(expected);

        // `set_request_context` writes both GUCs with `set_config(..., true)`, so COMMIT and
        // ROLLBACK alike discard them and no pooled connection can inherit one.
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
      },
    );

    it('does not let one request context leak into the next', async () => {
      const sequence = [
        [admin, PRACTICE_A, 200],
        [ROLE_CALLERS[1].subject, PRACTICE_A, 403],
        [FIXTURE.maxAdminSubject, FIXTURE.practiceMax, 409],
        [admin, PRACTICE_A, 409],
        [ROLE_CALLERS[4].subject, PRACTICE_A, 403],
      ] as const;

      for (const [subject, practiceId, expected] of sequence) {
        const response = await patchSettings(subject, practiceId, {
          ifMatch: practiceId === PRACTICE_A ? BASELINE_TAG : '"1"',
          body: { aiEnabled: true },
        });

        expect(response.status).toBe(expected);
      }

      // Exactly one write landed — the first — and the practices did not cross.
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
      expect(await versionOf(FIXTURE.practiceMax)).toBe(MAX_INT4);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------------------------

  describe('the permission decision (15 §5, D-044, D-055 clauses 28 and 29)', () => {
    it.each(ROLE_CALLERS)(
      '$role: practice.settings.manage is $allowed',
      async ({ subject, allowed }) => {
        const response = await patchSettings(subject, PRACTICE_A, { body: { aiEnabled: true } });

        expect(response.status).toBe(allowed ? 200 : 403);
        expect(await versionOf(PRACTICE_A)).toBe(allowed ? BASELINE_VERSION + 1 : BASELINE_VERSION);
      },
    );

    it('gives SYSTEM_ADMIN alone NO tenant bypass whatsoever', async () => {
      // The platform role contributes nothing to a tenant decision (D-023 clause 10, D-047
      // clause 11, D-055 clause 29) — and a WRITE is where a bypass would matter most.
      const response = await patchSettings(FIXTURE.platformOnlySubject, PRACTICE_A, {
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(403);
      expect(response.body['code']).toBe('ACCESS_DENIED');
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION);
    });

    it('lets SYSTEM_ADMIN with a real PRACTICE_ADMIN membership write — because of the membership', async () => {
      // The other half of the same question. This caller succeeds; the caller above, who differs
      // ONLY in holding no membership, does not. So the platform role is not what granted it.
      const response = await patchSettings(FIXTURE.platformTenantSubject, PRACTICE_A, {
        body: { aiEnabled: true },
      });

      expect(response.status).toBe(200);
      expect(await versionOf(PRACTICE_A)).toBe(BASELINE_VERSION + 1);
    });

    it('separates read from manage: a role may read the resource it may not write', async () => {
      // The two settings routes ask for two different permissions, and the matrix currently
      // answers both only for `PRACTICE_ADMIN`. What this asserts is that the WRITE route does
      // not inherit the READ route's answer for any caller — the two decisions are taken
      // separately, from separate cells.
      for (const caller of ROLE_CALLERS.filter((entry) => !entry.allowed)) {
        const read = await readSettings(caller.subject, PRACTICE_A);
        const write = await patchSettings(caller.subject, PRACTICE_A, {
          body: { aiEnabled: true },
        });

        expect(read.status).toBe(403);
        expect(write.status).toBe(403);
      }

      expect((await readSettings(admin, PRACTICE_A)).status).toBe(200);
      expect((await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } })).status).toBe(
        200,
      );
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Non-regression
  // ---------------------------------------------------------------------------------------------

  describe('non-regression of everything this slice did not own', () => {
    it('keeps GET /settings at exactly the eight frozen fields with a strong ETag', async () => {
      const response = await readSettings(admin, PRACTICE_A);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(FROZEN_KEYS);
      expect(response.etag).toBe(BASELINE_TAG);
      expect(JSON.stringify(response.body)).not.toContain('version');
    });

    it('keeps the GET missing-row invariant at 500 (D-055 clause 7)', async () => {
      const response = await readSettings(FIXTURE.settingsLessSubject, FIXTURE.practiceD);

      expect(response.status).toBe(500);
      expect(response.body['code']).toBe('INTERNAL_ERROR');
      expectNoVersionTag(response);
    });

    it('keeps the GET conditional 304 behaviour unchanged (D-055 clauses 3 and 6)', async () => {
      // Canonised existing behaviour that this slice must neither introduce nor remove. A
      // matching `If-None-Match` on an authorised `GET` still revalidates to `304` with an empty
      // body — and the tag it revalidates against is the one a `PATCH` most recently produced.
      const notModified = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set('If-None-Match', BASELINE_TAG);

      expect(notModified.status).toBe(304);
      expect(notModified.text).toBeFalsy();

      // After a write the OLD tag no longer revalidates, and the NEW one does.
      const written = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: true } });

      const stale = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set('If-None-Match', BASELINE_TAG);
      expect(stale.status).toBe(200);

      const fresh = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set('If-None-Match', written.etag ?? '');
      expect(fresh.status).toBe(304);
    });

    it('keeps an If-None-Match from turning a REFUSED GET into a 304 (clause 4)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(ROLE_CALLERS[1].subject))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set('If-None-Match', BASELINE_TAG);

      expect(response.status).toBe(403);
      expect(response.status).not.toBe(304);
    });

    it('keeps GET /me unchanged', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', developmentBearer(admin));

      expect(response.status).toBe(200);
      expect(Object.keys(response.body as Record<string, unknown>).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'memberships',
        'platformRoles',
        'preferredLanguage',
      ]);
      // `/me` stays tenant-neutral: it needs no `X-Practice-ID` and renders no settings.
      expect(JSON.stringify(response.body)).not.toContain('billingReviewRequired');
    });

    it('keeps GET /practices/{practiceId} unchanged', async () => {
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
      expect(JSON.stringify(response.body)).not.toContain('version');
    });

    it('keeps the DELAYED validator agreeing with the global one, option for option', async () => {
      // The shared `API_VALIDATION_PIPE_OPTIONS` constant is what makes "a valid request body"
      // mean one thing in this process. The validation-probe route pins the GLOBAL pipe and is
      // asserted in `test/problem-details.e2e-spec.ts`, which this slice did not touch; what is
      // asserted HERE is that the delayed validator produces the same dialect on the same inputs:
      // the same `422`, the same document shape, and the same stable field codes.
      const unknown = await patchSettings(admin, PRACTICE_A, { body: { unknownField: 1 } });
      const wrongType = await patchSettings(admin, PRACTICE_A, { body: { aiEnabled: 'yes' } });
      const tooLong = await patchSettings(admin, PRACTICE_A, {
        body: { retentionPolicyCode: 'z'.repeat(101) },
      });

      for (const response of [unknown, wrongType, tooLong]) {
        expect(response.status).toBe(422);
        expect(response.contentType).toContain('application/problem+json');
        expect(response.body['code']).toBe('VALIDATION_ERROR');
        expect(Array.isArray(response.body['errors'])).toBe(true);
      }

      expect(JSON.stringify(unknown.body['errors'])).toContain('UNKNOWN_FIELD');
      expect(JSON.stringify(wrongType.body['errors'])).toContain('INVALID_BOOLEAN');
      expect(JSON.stringify(tooLong.body['errors'])).toContain('INVALID_LENGTH');

      // `validationError.value: false` — the REJECTED VALUE is never copied into the document.
      expect(JSON.stringify(tooLong.body)).not.toContain('zzz');
      expect(JSON.stringify(wrongType.body['errors'])).not.toContain('"yes"');

      // `stopAtFirstError: false` — every invalid field of one request is reported together.
      const both = await patchSettings(admin, PRACTICE_A, {
        body: { aiEnabled: 'yes', retentionPolicyCode: 7 },
      });
      expect(JSON.stringify(both.body['errors'])).toContain('INVALID_BOOLEAN');
      expect(JSON.stringify(both.body['errors'])).toContain('INVALID_STRING');
    });

    it('changes no global cache policy (D-055 clauses 26 and 27)', async () => {
      // The observation P4-5CR made and D-055 deferred: authenticated tenant responses carry no
      // explicit `Cache-Control`. This slice must not opportunistically introduce one, on this
      // route or any other.
      const read = await request(app.getHttpServer())
        .get(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A);

      const written = await request(app.getHttpServer())
        .patch(`/api/v1/practices/${PRACTICE_A}/settings`)
        .set('Authorization', developmentBearer(admin))
        .set(PRACTICE_HEADER, PRACTICE_A)
        .set(IF_MATCH_HEADER, BASELINE_TAG)
        .send({ aiEnabled: true });

      expect(read.headers['cache-control']).toBeUndefined();
      expect(written.headers['cache-control']).toBeUndefined();
      expect(read.headers['vary']).toBe(written.headers['vary']);
    });

    it('keeps the database surface exactly nine SELECT and nine UPDATE columns', async () => {
      // D-055 clause 30: this slice introduces no schema, grant, policy or function change. The
      // grant catalogue is re-asserted here because the write route is the first thing that could
      // have motivated widening it.
      const granted = await migrationClient.query<{ privilege: string; count: string }>(
        `select privilege_type as "privilege", count(*)::text as "count"
           from information_schema.column_privileges
          where grantee = 'copilot_app'
            and table_name = 'practice_settings'
          group by privilege_type
          order by privilege_type`,
      );

      expect(granted.rows).toEqual([
        { privilege: 'SELECT', count: '9' },
        { privilege: 'UPDATE', count: '9' },
      ]);
    });
  });
});

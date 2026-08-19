/**
 * Unit contract of `GET /practices/{practiceId}/settings` (`03` §3.2 and §3.7.1; `15` §5;
 * D-044; D-047 clauses 10, 11 and 18; D-053 parts A and C; D-054 clause 12).
 *
 * This suite owns the properties that cannot be observed from a status code alone:
 *
 * 1. THE ORDER OF THE CHAIN. Every outcome is asserted against the FULL recorded call log, so a
 *    spec fails when the representation read moves before `set_request_context`, when a refusal
 *    moves even one step later than the accepted decisions put it, or when a step is skipped.
 * 2. THE AUTHORISATION PATH. `practice.settings.read` is decided through the single matrix
 *    representation, so every one of the six tenant roles is driven through the real resolver.
 *    The expected outcomes are taken from `15` §5 and D-044; the matrix itself is never restated,
 *    here or in production code.
 * 3. THE TWO SETTINGS SURFACES STAY TWO. The three-column permission input of step 9 and the
 *    nine-column representation of step 11 are separate statements, both are issued, and the
 *    second never replaces the first.
 * 4. THE O4 SEAM STAYS CLOSED. The first additional tenant route after D-054 introduces no
 *    second identity: no `userId` parameter, no membership lookup for a client-supplied
 *    identity, no `findMemberships`.
 *
 * Real PostgreSQL semantics — the `02` §17.1 tenant policy, the nine-column grant of §20.2b.1,
 * the transaction-local GUCs, real HTTP statuses and the `ETag` header Express must not replace —
 * are proven against a real database in `test/phase4-practice-settings-read.security.ts`. Both
 * halves are required; neither replaces the other.
 */

import { type PracticeSettingsResponseDto, type TenantMembershipRole } from '@axenita/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  RecordingDatabase,
  emptyWorld,
  practiceRow,
  settingsRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { IdentityInvariantError } from '../identity.errors.js';
import { type BootstrapUserRow } from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import {
  PracticeSettingsReadService,
  type PracticeSettingsReadResult,
} from './practice-settings-read.service.js';
import { TenantRequestPipeline } from './tenant-request.pipeline.js';

const SUBJECT = 'dev|practice-admin';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const OTHER_USER = '22222222-2222-4222-8222-222222222009';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';
const OTHER_MEMBERSHIP = '33333333-3333-4333-8333-333333333009';

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

/** The full recorded chain of a request that is refused before the header is even read. */
const CHAIN_UP_TO_USER_CONTEXT = [
  'BEGIN',
  `set_auth_subject_context(${SUBJECT})`,
  'select users',
  `set_user_context(${USER})`,
];

function activeUser(overrides: Partial<BootstrapUserRow> = {}): BootstrapUserRow {
  return {
    id: USER,
    email: 'dev.practice-admin@example.invalid',
    displayName: 'Dev Practice Admin',
    preferredLanguage: 'de-CH',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('PracticeSettingsReadService', () => {
  let world: World;
  let database: RecordingDatabase;
  let service: PracticeSettingsReadService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    // The very same bootstrap and the very same tenant pipeline the practice route uses. There
    // is no second implementation of `set_auth_subject_context`, of the users read, of the
    // ACTIVE-user check, of `set_user_context` or of steps 3 to 10, and this wiring is what
    // proves it. Neither collaborator is a double: the property under test is the ORDER of the
    // whole chain, and a stubbed pipeline would prove nothing about it.
    service = new PracticeSettingsReadService(
      new IdentityBootstrapService(database),
      new TenantRequestPipeline(),
    );
  });

  /** Seeds an ACTIVE user with an ACTIVE membership carrying `roles` in the ACTIVE practice. */
  function seedEligibleCaller(roles: readonly TenantMembershipRole[]): void {
    world.bootstrapUsers.push(activeUser());
    world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
    world.memberships.push({
      id: MEMBERSHIP,
      practiceId: PRACTICE,
      active: true,
      userId: USER,
    });
    world.settings.push(settingsRow(PRACTICE));

    for (const role of roles) {
      world.membershipRoles.push({ membershipId: MEMBERSHIP, practiceId: PRACTICE, role });
    }
  }

  interface ReadOverrides {
    readonly practiceId?: string;
    /** Absent means "send the practice of the path"; present means "send exactly this". */
    readonly header?: string | undefined;
    readonly subject?: string;
  }

  function read(overrides: ReadOverrides = {}): Promise<PracticeSettingsReadResult> {
    return service.loadSettings({
      verifiedAuthSubject: overrides.subject ?? SUBJECT,
      requestedPracticeId: overrides.practiceId ?? PRACTICE,
      practiceContextHeader: 'header' in overrides ? overrides.header : PRACTICE,
    });
  }

  async function settingsOf(overrides: ReadOverrides = {}): Promise<PracticeSettingsResponseDto> {
    return (await read(overrides)).settings;
  }

  async function refusalOf(overrides: ReadOverrides = {}): Promise<ApiException> {
    const failure = await read(overrides).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiException);

    return failure as ApiException;
  }

  describe('the frozen representation (D-053 clause A.1)', () => {
    it('returns exactly the eight accepted fields and nothing else', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings[0] = settingsRow(PRACTICE, {
        billingReviewRequired: true,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: false,
        requireReasonForManualChange: true,
        aiEnabled: false,
        axenitaExportEnabled: true,
        retentionPolicyCode: 'CH-10Y',
        version: 7,
      });

      const settings = await settingsOf();

      // An exact key set, not a list of `not.toHaveProperty` assertions: a future widening of
      // the projection has to break this test rather than slip past it.
      expect(Object.keys(settings).sort()).toEqual(FROZEN_KEYS);
      expect(settings).toEqual({
        practiceId: PRACTICE,
        billingReviewRequired: true,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: false,
        requireReasonForManualChange: true,
        aiEnabled: false,
        axenitaExportEnabled: true,
        retentionPolicyCode: 'CH-10Y',
      });
    });

    it('renders retentionPolicyCode as null rather than omitting the key', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings[0] = settingsRow(PRACTICE, { retentionPolicyCode: null });

      const settings = await settingsOf();

      // The key set of the document is the same eight names for every practice, whatever the
      // nullable column holds.
      expect(Object.keys(settings).sort()).toEqual(FROZEN_KEYS);
      expect(settings.retentionPolicyCode).toBeNull();
    });

    it('carries every boolean through unchanged, in both positions', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      for (const value of [true, false]) {
        world.settings[0] = settingsRow(PRACTICE, {
          billingReviewRequired: value,
          allowMpaApproval: value,
          allowBillingSpecialistApproval: value,
          requireReasonForManualChange: value,
          aiEnabled: value,
          axenitaExportEnabled: value,
        });

        expect(await settingsOf()).toEqual({
          practiceId: PRACTICE,
          billingReviewRequired: value,
          allowMpaApproval: value,
          allowBillingSpecialistApproval: value,
          requireReasonForManualChange: value,
          aiEnabled: value,
          axenitaExportEnabled: value,
          retentionPolicyCode: null,
        });
      }
    });

    it('never exposes version, in any spelling, however large it grows', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings[0] = settingsRow(PRACTICE, { version: 4242 });

      const settings = await settingsOf();
      const serialised = JSON.stringify(settings);

      for (const forbidden of [
        'version',
        'Version',
        '_version',
        'rowVersion',
        'etag',
        'ETag',
        '4242',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('never exposes the ungranted columns, in any spelling (D-053 clause A.4)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const serialised = JSON.stringify(await settingsOf());

      for (const forbidden of [
        'id"',
        'configuration',
        'updatedAt',
        'updated_at',
        'updatedBy',
        'updated_by',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('reports the ADMITTED practice as practiceId, never another one', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      // A second practice with a settings row the caller is also a member of. Only the requested
      // one may be represented.
      world.practices.push(practiceRow(OTHER_PRACTICE, 'Demo Praxis Nord'));
      world.memberships.push({
        id: OTHER_MEMBERSHIP,
        practiceId: OTHER_PRACTICE,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: OTHER_MEMBERSHIP,
        practiceId: OTHER_PRACTICE,
        role: 'PRACTICE_ADMIN',
      });
      world.settings.push(settingsRow(OTHER_PRACTICE, { aiEnabled: true, version: 99 }));

      const settings = await settingsOf();

      expect(settings.practiceId).toBe(PRACTICE);
      expect(JSON.stringify(settings)).not.toContain(OTHER_PRACTICE);
    });
  });

  describe('the ETag (D-053 clause A.2)', () => {
    it('is the quoted integer version of the row', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      for (const version of [1, 2, 3, 17, 1000]) {
        world.settings[0] = settingsRow(PRACTICE, { version });

        expect((await read()).etag).toBe(`"${String(version)}"`);
      }
    });

    it('is STRONG — never the weak form Express would generate', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings[0] = settingsRow(PRACTICE, { version: 3 });

      const { etag } = await read();

      expect(etag).toBe('"3"');
      expect(etag.startsWith('W/')).toBe(false);
      // A quoted run of digits and nothing else: not a content hash, not a base64 digest.
      expect(etag).toMatch(/^"\d+"$/);
    });

    it('changes with the version alone, while an identical body keeps its own tag', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      world.settings[0] = settingsRow(PRACTICE, { version: 1 });
      const first = await read();

      // Same eight field values, different version. A content-hashed tag would be unchanged
      // here, which is exactly the equality the optimistic-locking contract cannot use.
      world.settings[0] = settingsRow(PRACTICE, { version: 2 });
      const second = await read();

      expect(first.settings).toEqual(second.settings);
      expect(first.etag).toBe('"1"');
      expect(second.etag).toBe('"2"');
    });

    it('describes the same read as the body it accompanies', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings[0] = settingsRow(PRACTICE, { aiEnabled: true, version: 5 });

      const result = await read();

      // One row, one statement: the tag and the document cannot come from two different reads.
      expect(result.settings.aiEnabled).toBe(true);
      expect(result.etag).toBe('"5"');
      expect(
        database.calls.filter((call) => call.startsWith('select settings_representation')),
      ).toHaveLength(1);
    });
  });

  describe('the tenant chain (03 §3.7.1, D-047 clause 10, D-053 clause C.3)', () => {
    it('runs the whole chain in exactly one committed transaction (D-047 clause 8)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      expect(database.transactions).toBe(1);
      expect(database.committed).toBe(1);
      expect(database.rolledBack).toBe(0);
      // THE COMPLETE FROZEN ORDER, asserted as one literal sequence so that moving, adding or
      // dropping a single step fails this spec. The tenant context is established at step 7 —
      // after the practice status and the application membership check — and the representation
      // read is the LAST statement, strictly after the permission decision.
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        `set_request_context(${PRACTICE})`,
        `select membership_roles(${MEMBERSHIP})`,
        `select practice_settings(${PRACTICE})`,
        `select settings_representation(${PRACTICE})`,
        'COMMIT',
      ]);
    });

    it('reads the representation only AFTER the tenant context is established (step 11)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      const context = database.calls.indexOf(`set_request_context(${PRACTICE})`);
      const representation = database.calls.indexOf(`select settings_representation(${PRACTICE})`);

      expect(context).toBeGreaterThan(-1);
      expect(representation).toBeGreaterThan(context);
      // And it is the last statement before COMMIT: nothing runs between the authorised read and
      // the end of the transaction.
      expect(database.calls.at(-2)).toBe(`select settings_representation(${PRACTICE})`);
    });

    it('reads the representation only AFTER the permission decision', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      // The conditional-settings read is the last input of step 9; the permission is decided
      // immediately after it, at step 10. A representation read that preceded it would mean the
      // document was fetched before the caller was known to be allowed to have it.
      expect(database.calls.indexOf(`select settings_representation(${PRACTICE})`)).toBeGreaterThan(
        database.calls.indexOf(`select practice_settings(${PRACTICE})`),
      );
    });

    it('keeps the permission input and the representation two separate statements', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      // Step 9 still uses the narrow three-column input, unchanged and un-widened; step 11 uses
      // the nine-column representation. Exactly one of each, and neither substitutes the other.
      expect(
        database.calls.filter((call) => call.startsWith('select practice_settings(')),
      ).toHaveLength(1);
      expect(
        database.calls.filter((call) => call.startsWith('select settings_representation(')),
      ).toHaveLength(1);
    });

    it('never reads a settings row before the context exists', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      const context = database.calls.indexOf(`set_request_context(${PRACTICE})`);
      const settingsReads = database.calls
        .map((call, index) => ({ call, index }))
        .filter((entry) => entry.call.includes('settings'))
        .map((entry) => entry.index);

      expect(settingsReads).toHaveLength(2);
      for (const index of settingsReads) {
        expect(index).toBeGreaterThan(context);
      }
    });
  });

  describe('practice context (03 §3.2, §3.7.1 step 3)', () => {
    it('answers 400 PRACTICE_CONTEXT_REQUIRED for a missing header', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const failure = await refusalOf({ header: undefined });

      expect(failure.getStatus()).toBe(400);
      expect(failure.code).toBe('PRACTICE_CONTEXT_REQUIRED');
    });

    it('answers 400 PRACTICE_CONTEXT_INVALID for a header that is not a UUID', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      for (const header of [
        'not-a-uuid',
        '11111111-1111-4111-8111-11111111100',
        '11111111111141118111111111111001',
        `{${PRACTICE}}`,
        `${PRACTICE} or 1=1`,
      ]) {
        const failure = await refusalOf({ header });

        expect(failure.getStatus()).toBe(400);
        expect(failure.code).toBe('PRACTICE_CONTEXT_INVALID');
      }
    });

    it('reads the header only AFTER admission, and never before set_user_context', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await refusalOf({ header: undefined });

      // The complete log. `03` §3.7.1 makes the order mandatory: authentication, then the
      // current user, then the header. A caller who has not been admitted must not be answered
      // on the basis of their headers.
      expect(database.calls).toEqual([...CHAIN_UP_TO_USER_CONTEXT, 'ROLLBACK']);
      expect(database.rolledBack).toBe(1);
    });

    it('rejects a non-ACTIVE user before the header is considered at all', async () => {
      world.bootstrapUsers.push(activeUser({ status: 'INACTIVE' }));

      const failure = await refusalOf({ header: undefined });

      // 403, not 400: admission (step 2) precedes the header (step 3), so an unadmitted caller
      // learns nothing about their request format (D-047 clause 9).
      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
      expect(database.calls.some((call) => call.startsWith('set_user_context'))).toBe(false);
    });

    it('answers 403 ACCESS_DENIED when the path is not the practice of the header', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const failure = await refusalOf({ practiceId: OTHER_PRACTICE, header: PRACTICE });

      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
      // Nothing was read: the mismatch is decided before any practice or membership statement.
      expect(database.calls).toEqual([...CHAIN_UP_TO_USER_CONTEXT, 'ROLLBACK']);
    });
  });

  describe('the requested practice and the membership (D-047 clauses 10 and 18)', () => {
    it('answers 403 for a practice the membership policy does not expose', async () => {
      world.bootstrapUsers.push(activeUser());

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        'ROLLBACK',
      ]);
    });

    it.each(['INACTIVE', 'SUSPENDED', 'ARCHIVED'])(
      'refuses a practice with status %s strictly before any tenant context exists',
      async (status) => {
        seedEligibleCaller(['PRACTICE_ADMIN']);
        world.practices[0] = practiceRow(PRACTICE, 'Demo Praxis Zuerich', { status });

        const failure = await refusalOf();

        expect(failure.getStatus()).toBe(403);
        expect(database.calls).toEqual([
          ...CHAIN_UP_TO_USER_CONTEXT,
          `select practice(${PRACTICE})`,
          'ROLLBACK',
        ]);
        expect(database.calls.some((call) => call.startsWith('set_request_context'))).toBe(false);
      },
    );

    it('answers 403 for an INACTIVE membership even with PRACTICE_ADMIN assigned', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.memberships[0] = {
        id: MEMBERSHIP,
        practiceId: PRACTICE,
        active: false,
        userId: USER,
      };

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      // Refused on activity alone, before the roles of that membership are even loaded, and
      // therefore long before any settings row could be read.
      expect(database.calls.some((call) => call.startsWith('select membership_roles'))).toBe(false);
      expect(database.calls.some((call) => call.includes('settings'))).toBe(false);
    });

    it('answers 403 when the practice is visible but the caller has no membership row', async () => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.settings.push(settingsRow(PRACTICE));

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        'ROLLBACK',
      ]);
    });
  });

  describe('practice.settings.read authorisation (15 §5, D-044)', () => {
    // The expected column of `15` §5, reproduced ONLY as a test expectation. Production code
    // derives it through `resolveEffectivePermissions`, and no `role === 'PRACTICE_ADMIN'`
    // comparison exists anywhere in it.
    it.each([
      ['PRACTICE_ADMIN', true],
      ['PHYSICIAN', false],
      ['MPA', false],
      ['BILLING_SPECIALIST', false],
      ['AUDITOR', false],
      ['READ_ONLY', false],
    ] as const)('%s is granted practice.settings.read: %s', async (role, allowed) => {
      seedEligibleCaller([role]);

      if (allowed) {
        expect(await settingsOf()).toMatchObject({ practiceId: PRACTICE });
        return;
      }

      const failure = await refusalOf();
      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
      // A denied caller never reaches the representation: the document was not even read.
      expect(database.calls.some((call) => call.startsWith('select settings_representation'))).toBe(
        false,
      );
    });

    it('grants exactly one of the six tenant roles', async () => {
      const granted: string[] = [];

      for (const role of [
        'PRACTICE_ADMIN',
        'PHYSICIAN',
        'MPA',
        'BILLING_SPECIALIST',
        'AUDITOR',
        'READ_ONLY',
      ] as const) {
        world = emptyWorld();
        database = new RecordingDatabase(world);
        service = new PracticeSettingsReadService(
          new IdentityBootstrapService(database),
          new TenantRequestPipeline(),
        );
        seedEligibleCaller([role]);

        const outcome = await read().then(
          () => role,
          () => undefined,
        );

        if (outcome !== undefined) {
          granted.push(outcome);
        }
      }

      expect(granted).toEqual(['PRACTICE_ADMIN']);
    });

    it('refuses an active membership with zero assigned roles (03 §3.7.2, D-038)', async () => {
      seedEligibleCaller([]);

      expect((await refusalOf()).getStatus()).toBe(403);
    });

    it('grants when PRACTICE_ADMIN is one of several assigned roles', async () => {
      seedEligibleCaller(['PHYSICIAN', 'PRACTICE_ADMIN']);

      expect(await settingsOf()).toMatchObject({ practiceId: PRACTICE });
    });

    it('is not enabled by any practice_settings flag', async () => {
      // `practice.settings.read` is not a CONDITIONAL cell. Enabling both approval flags — the
      // only two the resolver consults — must change nothing for a role the matrix denies, and in
      // particular a practice must not be able to configure its way into reading its settings.
      seedEligibleCaller(['MPA']);
      world.settings[0] = settingsRow(PRACTICE, {
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
      });

      expect((await refusalOf()).getStatus()).toBe(403);
    });

    it('derives from the roles of the REQUESTED practice, never from another membership', async () => {
      // PRACTICE_ADMIN in the other practice must not authorise a settings read of this one.
      seedEligibleCaller([]);
      world.practices.push(practiceRow(OTHER_PRACTICE, 'Demo Praxis Nord'));
      world.memberships.push({
        id: OTHER_MEMBERSHIP,
        practiceId: OTHER_PRACTICE,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: OTHER_MEMBERSHIP,
        practiceId: OTHER_PRACTICE,
        role: 'PRACTICE_ADMIN',
      });

      expect((await refusalOf()).getStatus()).toBe(403);
    });
  });

  describe('the O4 seam stays closed (D-054 clause 12)', () => {
    it('binds the AUTHENTICATED user and the requested practice in one read', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      // The recorded identity is the one `set_user_context` established, because the read has no
      // user argument to be given another.
      expect(database.calls).toContain(`select current_membership(${USER},${PRACTICE})`);
      // Never "read all my memberships and filter afterwards": the historical
      // `findMemberships(userId)` surface is not on this route at all.
      expect(database.calls.some((call) => call.startsWith('select memberships('))).toBe(false);
    });

    it('accepts no identity parameter of its own', () => {
      // The request object this service takes carries a verified auth SUBJECT — the input to the
      // authenticated bootstrap — and two untrusted request values. It carries no user id, and
      // adding one would restore exactly the seam D-054 clause 12 closed.
      const source = PracticeSettingsReadService.prototype.loadSettings.toString();

      expect(source).not.toMatch(/\buserId\b/);
      expect(source).not.toMatch(/\bfindMemberships\b/);
      expect(source).not.toMatch(/findMembershipInPractice\s*\(/);
      // Two arguments to `admit`, and neither of them is a user.
      expect(source).toMatch(/admit\(\s*session\s*,/);
    });

    it('never reads a membership of another user', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.memberships.push({
        id: OTHER_MEMBERSHIP,
        practiceId: PRACTICE,
        active: true,
        userId: OTHER_USER,
      });
      world.membershipRoles.push({
        membershipId: OTHER_MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'PRACTICE_ADMIN',
      });

      await read();

      expect(database.calls).toContain(`select membership_roles(${MEMBERSHIP})`);
      expect(database.calls).not.toContain(`select membership_roles(${OTHER_MEMBERSHIP})`);
    });

    it('admits nobody when no user context was established', async () => {
      // The double models `user_id = nullif(current_setting('app.user_id', true), '')::uuid`, so
      // an unadmitted caller resolves no membership at all and the chain fails closed.
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.settings.push(settingsRow(PRACTICE));

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(database.calls.some((call) => call.includes('settings'))).toBe(false);
    });
  });

  describe('the missing settings row is an internal invariant failure', () => {
    /** Everything admitted, everything authorised — and no `practice_settings` row. */
    function seedAdmittedCallerWithoutSettings(): void {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings.length = 0;
    }

    it('raises the invariant type, never an ApiException', async () => {
      seedAdmittedCallerWithoutSettings();

      const failure = await read().then(
        () => undefined,
        (error: unknown) => error,
      );

      // NOT an `ApiException`: the single Problem Details filter therefore renders the generic
      // `500 INTERNAL_ERROR`, and no branch of this route can turn a broken database into a
      // routine refusal.
      expect(failure).toBeInstanceOf(IdentityInvariantError);
      expect(failure).not.toBeInstanceOf(ApiException);
    });

    it('is reached only after the whole chain has passed', async () => {
      seedAdmittedCallerWithoutSettings();

      await read().catch(() => undefined);

      // Admission, the tenant context and the permission decision all completed; the failure is
      // the representation read alone.
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        `set_request_context(${PRACTICE})`,
        `select membership_roles(${MEMBERSHIP})`,
        `select practice_settings(${PRACTICE})`,
        `select settings_representation(${PRACTICE})`,
        'ROLLBACK',
      ]);
    });

    it('rolls the transaction back and creates nothing', async () => {
      seedAdmittedCallerWithoutSettings();

      await read().catch(() => undefined);

      expect(database.committed).toBe(0);
      expect(database.rolledBack).toBe(1);
      // No row was invented, seeded or repaired: the world is exactly as it was.
      expect(world.settings).toHaveLength(0);
    });

    it('carries no practice, user, membership, table or statement in its message', async () => {
      seedAdmittedCallerWithoutSettings();

      const failure = (await read().then(
        () => undefined,
        (error: unknown) => error,
      )) as IdentityInvariantError;

      // The message is server-side only and never reaches a response, but it must still be
      // non-sensitive: a log line that captured it may not become a tenant disclosure (`09` §11).
      for (const forbidden of [PRACTICE, USER, MEMBERSHIP, SUBJECT, 'select ', '42501']) {
        expect(failure.message).not.toContain(forbidden);
      }
    });

    it('does not fabricate defaults, an empty document or a repaired row', async () => {
      seedAdmittedCallerWithoutSettings();

      const outcome = await read().then(
        (result) => result,
        () => undefined,
      );

      expect(outcome).toBeUndefined();
    });
  });

  describe('anti-enumeration (03, negative cases)', () => {
    it('answers every 403 branch with a byte-identical document', async () => {
      const branches: ApiException[] = [];

      // 1. No membership and no such practice.
      world.bootstrapUsers.push(activeUser());
      branches.push(await refusalOf());

      // 2. The practice exists and is visible, but the caller has no membership row.
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.settings.push(settingsRow(PRACTICE));
      branches.push(await refusalOf());

      // 3. The membership exists but is inactive.
      world.memberships.push({
        id: MEMBERSHIP,
        practiceId: PRACTICE,
        active: false,
        userId: USER,
      });
      branches.push(await refusalOf());

      // 4. The membership is active but the role does not hold `practice.settings.read`.
      world.memberships[0] = { id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER };
      world.membershipRoles.push({
        membershipId: MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'READ_ONLY',
      });
      branches.push(await refusalOf());

      // 5. The practice itself is not ACTIVE.
      world.practices[0] = practiceRow(PRACTICE, 'Demo Praxis Zuerich', { status: 'ARCHIVED' });
      branches.push(await refusalOf());

      // 6. The path does not match the context.
      branches.push(await refusalOf({ practiceId: OTHER_PRACTICE }));

      expect(branches).toHaveLength(6);
      for (const branch of branches) {
        expect(branch.getStatus()).toBe(403);
        expect(branch.code).toBe('ACCESS_DENIED');
        expect(branch.detail).toBe('Access denied.');
        expect(branch.errors).toBeUndefined();
      }
    });

    it('rolls back on every refusal and commits on none of them', async () => {
      world.bootstrapUsers.push(activeUser());

      await refusalOf();

      expect(database.committed).toBe(0);
      expect(database.rolledBack).toBe(1);
      expect(database.calls.at(-1)).toBe('ROLLBACK');
    });
  });
});

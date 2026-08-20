/**
 * Unit contract of `PATCH /practices/{practiceId}/settings` (`03` §3.2, §3.7.1 and §5.2; `15` §5;
 * D-044; D-047 clauses 10, 11 and 18; D-053 part B; D-054 clause 12; D-055 parts D to H).
 *
 * This suite owns the properties that cannot be observed from a status code alone:
 *
 * 1. THE ORDER OF THE CHAIN. Every outcome is asserted against the FULL recorded call log, so a
 *    spec fails when the `UPDATE` moves before `set_request_context`, when a refusal moves even
 *    one step earlier or later than the accepted decisions put it, or when a step is skipped.
 *    Most importantly, an unauthorised caller's log must end at the refusal and contain NO
 *    `update settings(...)` at all.
 * 2. THE PRECEDENCE OF THE PRECONDITION. `If-Match` is parsed before the body is validated, so a
 *    caller with a missing precondition and a malformed body gets `428`, not `422`. That ordering
 *    is invisible from a single request and is asserted as a matrix.
 * 3. RAW PRESENCE. `false` and `retentionPolicyCode: null` are SUBMITTED values, an omitted field
 *    produces NO assignment, and a body of nothing but unknown fields is `422` rather than an
 *    empty patch. The recorded `SET` list is what proves it — a status code cannot.
 * 4. ONE STATEMENT, AND NO PRE-READ. `findPracticeSettings` never appears on a write log, before
 *    or after the `UPDATE` (D-055 clauses 16 and 23).
 * 5. THE O4 SEAM STAYS CLOSED. The write route introduces no second identity: no `userId`
 *    parameter, no membership lookup for a client-supplied identity, no `findMemberships`.
 *
 * Real PostgreSQL semantics — the `02` §17.1 tenant policy, the nine-column grant of §20.2b.1,
 * the absent `SELECT` grant on `updated_at`, real transaction rollback, real HTTP statuses, real
 * concurrency and the genuine int4 overflow — are proven against a real database in
 * `test/phase4-practice-settings-patch.security.ts`. Both halves are required; neither replaces
 * the other.
 */

import { type TenantMembershipRole } from '@axenita/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  RecordingDatabase,
  emptyWorld,
  practiceRow,
  settingsRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { type BootstrapUserRow } from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import {
  PracticeSettingsWriteService,
  type PracticeSettingsWriteResult,
} from './practice-settings-write.service.js';
import { TenantRequestPipeline } from './tenant-request.pipeline.js';

const SUBJECT = 'dev|practice-admin';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';

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

/** The version the fixture row starts at, and therefore the tag a caller must echo. */
const SEEDED_VERSION = 7;
const SEEDED_TAG = `"${String(SEEDED_VERSION)}"`;

/** The full recorded chain of a request refused before the header is even read. */
const CHAIN_UP_TO_USER_CONTEXT = [
  'BEGIN',
  `set_auth_subject_context(${SUBJECT})`,
  'select users',
  `set_user_context(${USER})`,
];

/** The complete admitted prefix — steps 1 to 10 — that every authorised request must show. */
const ADMITTED_CHAIN = [
  ...CHAIN_UP_TO_USER_CONTEXT,
  `select practice(${PRACTICE})`,
  `select current_membership(${USER},${PRACTICE})`,
  `set_request_context(${PRACTICE})`,
  `select membership_roles(${MEMBERSHIP})`,
  `select practice_settings(${PRACTICE})`,
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

describe('PracticeSettingsWriteService', () => {
  let world: World;
  let database: RecordingDatabase;
  let service: PracticeSettingsWriteService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    // The very same bootstrap and the very same tenant pipeline the two read routes use. There is
    // no second implementation of `set_auth_subject_context`, of the users read, of the
    // ACTIVE-user check, of `set_user_context` or of steps 3 to 10, and this wiring is what proves
    // it. Neither collaborator is a double: the property under test is the ORDER of the whole
    // chain, and a stubbed pipeline would prove nothing about it.
    service = new PracticeSettingsWriteService(
      new IdentityBootstrapService(database),
      new TenantRequestPipeline(),
    );
  });

  /** Seeds an ACTIVE user with an ACTIVE membership carrying `roles` in the ACTIVE practice. */
  function seedEligibleCaller(roles: readonly TenantMembershipRole[]): void {
    world.bootstrapUsers.push(activeUser());
    world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
    world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
    world.settings.push(
      settingsRow(PRACTICE, {
        billingReviewRequired: true,
        allowMpaApproval: false,
        allowBillingSpecialistApproval: false,
        requireReasonForManualChange: true,
        aiEnabled: false,
        axenitaExportEnabled: false,
        retentionPolicyCode: 'DEV-RETENTION-STANDARD',
        version: SEEDED_VERSION,
      }),
    );

    for (const role of roles) {
      world.membershipRoles.push({ membershipId: MEMBERSHIP, practiceId: PRACTICE, role });
    }
  }

  interface WriteOverrides {
    readonly practiceId?: string;
    /** Absent means "send the practice of the path"; present means "send exactly this". */
    readonly header?: string | undefined;
    readonly subject?: string;
    /** Absent means "send the current tag"; present means "send exactly this". */
    readonly ifMatch?: string | undefined;
    readonly body?: unknown;
  }

  function write(overrides: WriteOverrides = {}): Promise<PracticeSettingsWriteResult> {
    return service.updateSettings({
      verifiedAuthSubject: overrides.subject ?? SUBJECT,
      requestedPracticeId: overrides.practiceId ?? PRACTICE,
      practiceContextHeader: 'header' in overrides ? overrides.header : PRACTICE,
      ifMatchHeader: 'ifMatch' in overrides ? overrides.ifMatch : SEEDED_TAG,
      body: 'body' in overrides ? overrides.body : { aiEnabled: true },
    });
  }

  async function refusalOf(overrides: WriteOverrides = {}): Promise<ApiException> {
    const failure = await write(overrides).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiException);

    return failure as ApiException;
  }

  /** The `SET` list the double recorded for the one `UPDATE`, or `undefined` if none was issued. */
  function recordedUpdate(): string | undefined {
    return database.calls.find((call) => call.startsWith('update settings('));
  }

  describe('the D-047 order — authorisation strictly before the body (03 §3.7.1)', () => {
    /**
     * The refusal matrix. Each row is a caller who must be refused BEFORE the body schema is
     * evaluated, paired with a body that would produce a very loud `422` if it ever were.
     *
     * The body is deliberately awful — an unknown field AND a wrongly typed one — so that a
     * `422 errors[]` leaking through would be unmistakable.
     */
    const MALFORMED_BODY = { aiEnabled: 'yes', totallyUnknownField: 1 } as const;

    it('refuses an unknown subject before reading the header or the body', async () => {
      // No `bootstrapUsers` at all: the policy exposes no row for this subject.
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));

      const refusal = await refusalOf({
        body: MALFORMED_BODY,
        header: undefined,
        ifMatch: undefined,
      });

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.code).toBe('ACCESS_DENIED');
      expect(refusal.errors).toBeUndefined();
      // The chain stops before `set_user_context`: no context is ever established for an
      // unadmitted subject, and nothing about the request's headers or body was consulted.
      expect(database.calls).toEqual([
        'BEGIN',
        `set_auth_subject_context(${SUBJECT})`,
        'select users',
        'ROLLBACK',
      ]);
    });

    it('refuses a non-ACTIVE user before reading the header or the body', async () => {
      world.bootstrapUsers.push(activeUser({ status: 'SUSPENDED' }));
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));

      const refusal = await refusalOf({ body: MALFORMED_BODY, ifMatch: undefined });

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.code).toBe('ACCESS_DENIED');
      expect(refusal.errors).toBeUndefined();
      expect(database.calls).toEqual([
        'BEGIN',
        `set_auth_subject_context(${SUBJECT})`,
        'select users',
        'ROLLBACK',
      ]);
    });

    it('answers the canonical header refusals, not a body or precondition error', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      // Missing `X-Practice-ID` — `400 PRACTICE_CONTEXT_REQUIRED`, decided at step 3, which is
      // still BEFORE the precondition and the body.
      const missing = await refusalOf({
        header: undefined,
        body: MALFORMED_BODY,
        ifMatch: undefined,
      });
      expect(missing.getStatus()).toBe(400);
      expect(missing.code).toBe('PRACTICE_CONTEXT_REQUIRED');

      // Malformed `X-Practice-ID` — `400 PRACTICE_CONTEXT_INVALID`, likewise.
      const invalid = await refusalOf({
        header: 'not-a-uuid',
        body: MALFORMED_BODY,
        ifMatch: undefined,
      });
      expect(invalid.code).toBe('PRACTICE_CONTEXT_INVALID');

      // Neither refusal is a `428`, a `422` or an `errors[]` document, and neither wrote.
      expect(missing.errors).toBeUndefined();
      expect(invalid.errors).toBeUndefined();
      expect(recordedUpdate()).toBeUndefined();
    });

    it('refuses a path/header mismatch with 403 and no body evaluation', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const refusal = await refusalOf({
        header: OTHER_PRACTICE,
        body: MALFORMED_BODY,
        ifMatch: undefined,
      });

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.code).toBe('ACCESS_DENIED');
      expect(refusal.errors).toBeUndefined();
      expect(recordedUpdate()).toBeUndefined();
    });

    it('refuses a caller with no membership with 403 and no body evaluation', async () => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.settings.push(settingsRow(PRACTICE, { version: SEEDED_VERSION }));

      const refusal = await refusalOf({ body: MALFORMED_BODY, ifMatch: undefined });

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.errors).toBeUndefined();
      // The chain stops at the active-membership barrier of step 4 — the second half of D-047
      // clause 10 — which is still well before `set_request_context` and long before any write.
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        'ROLLBACK',
      ]);
      expect(database.calls).not.toContain(`set_request_context(${PRACTICE})`);
    });

    it('refuses an INACTIVE membership with 403 and never establishes tenant context', async () => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: false, userId: USER });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'PRACTICE_ADMIN',
      });
      world.settings.push(settingsRow(PRACTICE, { version: SEEDED_VERSION }));

      const refusal = await refusalOf({ body: MALFORMED_BODY, ifMatch: undefined });

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.errors).toBeUndefined();
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        'ROLLBACK',
      ]);
      expect(database.calls).not.toContain(`set_request_context(${PRACTICE})`);
    });

    it('refuses a non-ACTIVE practice with 403 and never establishes tenant context', async () => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich', { status: 'SUSPENDED' }));
      world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'PRACTICE_ADMIN',
      });
      world.settings.push(settingsRow(PRACTICE, { version: SEEDED_VERSION }));

      const refusal = await refusalOf({ body: MALFORMED_BODY, ifMatch: undefined });

      expect(refusal.getStatus()).toBe(403);
      expect(refusal.errors).toBeUndefined();
      expect(database.calls).not.toContain(`set_request_context(${PRACTICE})`);
      expect(recordedUpdate()).toBeUndefined();
    });

    it.each(['PHYSICIAN', 'MPA', 'BILLING_SPECIALIST', 'AUDITOR', 'READ_ONLY'] as const)(
      'refuses %s — who lacks practice.settings.manage — before the body (15 §5)',
      async (role) => {
        seedEligibleCaller([role]);

        const refusal = await refusalOf({ body: MALFORMED_BODY, ifMatch: undefined });

        expect(refusal.getStatus()).toBe(403);
        expect(refusal.code).toBe('ACCESS_DENIED');
        // NO field-level disclosure. A caller who may not manage this resource must not be told
        // what its fields are called or what types they take.
        expect(refusal.errors).toBeUndefined();
        expect(JSON.stringify(refusal.detail)).not.toContain('aiEnabled');
        // The chain ran to the permission decision — the refusal is a PERMISSION outcome, not an
        // earlier barrier — and stopped there.
        expect(database.calls).toEqual([...ADMITTED_CHAIN, 'ROLLBACK']);
        expect(recordedUpdate()).toBeUndefined();
      },
    );

    it('reaches the precondition and the body ONLY for a caller holding the permission', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      // The very same malformed body that produced a bare `403` for every caller above now
      // produces a `422` with `errors[]` — because THIS caller is authorised. That contrast is
      // the whole property: the schema is a thing only an authorised caller may learn about.
      const refusal = await refusalOf({ body: MALFORMED_BODY });

      expect(refusal.getStatus()).toBe(422);
      expect(refusal.code).toBe('VALIDATION_ERROR');
      expect(refusal.errors).toBeDefined();
      expect(database.calls).toEqual([...ADMITTED_CHAIN, 'ROLLBACK']);
    });

    it('derives the permission through the matrix, never from a hard-coded role', async () => {
      // `PRACTICE_ADMIN` succeeds. The assertion that matters is the one above — five other
      // roles fail — because together they show the decision came from the resolver rather than
      // from a literal comparison that happened to agree for one role.
      seedEligibleCaller(['PRACTICE_ADMIN']);

      expect((await write()).settings.aiEnabled).toBe(true);
    });

    it('never looks a membership up by a caller-supplied identity (D-054 clause 12)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await write();

      // `findMemberships(userId)` is the neutral `/me` read and takes a user as an argument. The
      // tenant path must never use it: its membership comes from `findCurrentUserMembership...`,
      // which derives the identity from the established `app.user_id`.
      expect(database.calls.some((call) => call.startsWith('select memberships('))).toBe(false);
      expect(database.calls).toContain(`select current_membership(${USER},${PRACTICE})`);
    });
  });

  describe('If-Match precedence and outcomes (D-055 clauses 10 to 13)', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    /**
     * The frozen precedence matrix. `If-Match` is decided BEFORE the body, so the precondition's
     * answer wins over any body fault.
     */
    it.each([
      [undefined, { aiEnabled: 'yes' }, 428, 'PRECONDITION_REQUIRED'],
      ['not-a-tag', { aiEnabled: 'yes' }, 400, 'VALIDATION_ERROR'],
      [SEEDED_TAG, { aiEnabled: 'yes' }, 422, 'VALIDATION_ERROR'],
      [undefined, {}, 428, 'PRECONDITION_REQUIRED'],
      ['not-a-tag', {}, 400, 'VALIDATION_ERROR'],
      [SEEDED_TAG, {}, 400, 'VALIDATION_ERROR'],
    ] as const)('If-Match %j with body %j answers %i %s', async (ifMatch, body, status, code) => {
      const refusal = await refusalOf({ ifMatch, body });

      expect(refusal.getStatus()).toBe(status);
      expect(refusal.code).toBe(code);
      // Whatever the outcome, no write happened and no version was consumed.
      expect(recordedUpdate()).toBeUndefined();
    });

    it('distinguishes an absent header (428) from an empty one (400)', async () => {
      expect((await refusalOf({ ifMatch: undefined })).getStatus()).toBe(428);
      expect((await refusalOf({ ifMatch: '' })).getStatus()).toBe(400);
    });

    it('rejects the WEAK validator, which can never satisfy If-Match here (clause 13)', async () => {
      // `W/"7"` names the very version the row holds. It is refused anyway, by the grammar,
      // BEFORE any comparison — a weak validator asserts semantic equivalence and a write needs
      // an exact version.
      const refusal = await refusalOf({ ifMatch: `W/${SEEDED_TAG}` });

      expect(refusal.getStatus()).toBe(400);
      expect(refusal.code).toBe('VALIDATION_ERROR');
      expect(refusal.getStatus()).not.toBe(409);
      expect(recordedUpdate()).toBeUndefined();
    });

    it.each(['*', '"7", "8"', '7', '"07"', '"abc"', '"-7"', '" 7"'])(
      'rejects the unaccepted validator %j with 400 and no write',
      async (ifMatch) => {
        expect((await refusalOf({ ifMatch })).getStatus()).toBe(400);
        expect(recordedUpdate()).toBeUndefined();
      },
    );

    it('accepts the int4 maximum and refuses the value above it', async () => {
      // Both reach the same authorised caller, so the difference can only be the parser. The
      // accepted one proceeds to the statement (and conflicts, because the row holds 7); the
      // rejected one never gets there.
      expect((await refusalOf({ ifMatch: '"2147483647"' })).getStatus()).toBe(409);
      expect(recordedUpdate()).toBeDefined();

      database.calls.length = 0;
      expect((await refusalOf({ ifMatch: '"2147483648"' })).getStatus()).toBe(400);
      expect(recordedUpdate()).toBeUndefined();
    });

    it('takes "0" through the ordinary conflict path, not a special case', async () => {
      const refusal = await refusalOf({ ifMatch: '"0"' });

      expect(refusal.getStatus()).toBe(409);
      expect(refusal.code).toBe('VERSION_CONFLICT');
      // It reached the statement — that is what "not special-cased" means — and matched no row.
      expect(recordedUpdate()).toContain('v=0');
    });

    it('ignores If-None-Match entirely — there is no parameter for one (clause 24)', async () => {
      // The strongest form this assertion can take at the unit level: the request type has no
      // `ifNoneMatch` member, so no conditional header other than `If-Match` can reach this
      // service at all. A valid `If-Match` still decides the outcome.
      expect((await write()).etag).toBe(`"${String(SEEDED_VERSION + 1)}"`);
    });
  });

  describe('the root shape and the empty patch (D-055 clause 14, owner correction C2)', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    it.each([
      [{}, 'an object with no members'],
      [[], 'an array root'],
      [[{ aiEnabled: true }], 'an array root carrying what would be a valid object'],
      [undefined, 'no body at all'],
      [null, 'a null root'],
      ['aiEnabled=true', 'a string root'],
      [42, 'a number root'],
      [true, 'a boolean root'],
    ] as const)('refuses %j — %s — with 400 and no errors[]', async (body, _reason) => {
      const refusal = await refusalOf({ body });

      expect(refusal.getStatus()).toBe(400);
      expect(refusal.code).toBe('VALIDATION_ERROR');
      // NO `errors[]`: the fault is the body as a whole, not a named field. This is the
      // endpoint-specific `400` of clause 14 and not the generic `422` ValidationPipe document.
      expect(refusal.errors).toBeUndefined();
    });

    it('writes NOTHING for an empty patch — no UPDATE, no version, no updated_at', async () => {
      await refusalOf({ body: {} });

      // The three prohibitions of clause 14, asserted at the only place they can be: the double
      // records the statement, so its absence is the proof. The stored row is then re-checked to
      // show the version did not move.
      expect(recordedUpdate()).toBeUndefined();
      expect(world.settings[0]?.version).toBe(SEEDED_VERSION);
    });

    it('reports unknown fields as 422, and never strips them into an empty patch', async () => {
      // THE ORDER THAT MATTERS MOST IN THIS BLOCK. A body of nothing but unknown members would
      // be whitelisted down to `{}` if the emptiness check ran first, and the caller would be
      // told "you sent nothing" when they in fact sent something invalid. The schema runs first,
      // so they are told what is actually wrong.
      const refusal = await refusalOf({ body: { totallyUnknownField: true } });

      expect(refusal.getStatus()).toBe(422);
      expect(refusal.code).toBe('VALIDATION_ERROR');
      expect(refusal.errors?.map((error) => error.code)).toContain('UNKNOWN_FIELD');
      expect(refusal.getStatus()).not.toBe(400);
      expect(recordedUpdate()).toBeUndefined();
    });
  });

  describe('body schema semantics (D-053 clause B.1)', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    it.each([
      ['aiEnabled', 'yes', 'INVALID_BOOLEAN'],
      ['aiEnabled', 1, 'INVALID_BOOLEAN'],
      ['aiEnabled', null, 'INVALID_BOOLEAN'],
      ['billingReviewRequired', null, 'INVALID_BOOLEAN'],
      ['allowMpaApproval', 'true', 'INVALID_BOOLEAN'],
      ['retentionPolicyCode', 7, 'INVALID_STRING'],
      ['retentionPolicyCode', true, 'INVALID_STRING'],
    ] as const)('refuses %s = %j with 422 %s', async (field, value, code) => {
      const refusal = await refusalOf({ body: { [field]: value } });

      expect(refusal.getStatus()).toBe(422);
      expect(refusal.errors?.map((error) => error.code)).toContain(code);
      expect(recordedUpdate()).toBeUndefined();
    });

    it('refuses a boolean field set to null — @IsOptional would have let it through', async () => {
      // The reason the DTO uses `@ValidateIf(value !== undefined)` rather than `@IsOptional()`:
      // the latter also skips `null`, which would leave a `null` to reach the write path for a
      // `NOT NULL boolean` column.
      const refusal = await refusalOf({ body: { aiEnabled: null } });

      expect(refusal.getStatus()).toBe(422);
      expect(refusal.errors?.map((error) => error.code)).toContain('INVALID_BOOLEAN');
    });

    it('refuses a retentionPolicyCode longer than 100 characters with INVALID_LENGTH', async () => {
      const refusal = await refusalOf({ body: { retentionPolicyCode: 'x'.repeat(101) } });

      expect(refusal.getStatus()).toBe(422);
      expect(refusal.errors?.map((error) => error.code)).toContain('INVALID_LENGTH');
      // The point of validating the bound at the edge: the over-long value never reaches the
      // statement, so it can never become a PostgreSQL `22001` and a generic `500`.
      expect(recordedUpdate()).toBeUndefined();
    });

    it('accepts exactly 100 characters', async () => {
      const code = 'x'.repeat(100);

      expect(
        (await write({ body: { retentionPolicyCode: code } })).settings.retentionPolicyCode,
      ).toBe(code);
    });

    it('accepts the empty retention string and does not fold it into null', async () => {
      const result = await write({ body: { retentionPolicyCode: '' } });

      expect(result.settings.retentionPolicyCode).toBe('');
      expect(result.settings.retentionPolicyCode).not.toBeNull();
    });

    it('does not coerce "true" into true — implicit conversion stays off', async () => {
      // `enableImplicitConversion: false` is why this is a refusal rather than a silent write of
      // a value the caller never sent. On a settings resource that difference is the whole point.
      expect((await refusalOf({ body: { aiEnabled: 'true' } })).getStatus()).toBe(422);
      expect(recordedUpdate()).toBeUndefined();
    });
  });

  describe('raw presence — which fields are actually assigned', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    it('assigns exactly the submitted field for a one-field patch', async () => {
      await write({ body: { aiEnabled: true } });

      // Exactly one assignment in the `SET` list. This is the assertion that a `Partial`-shaped
      // implementation would fail: it would carry six `undefined` members alongside the one real
      // value, and each would become an SQL NULL.
      expect(recordedUpdate()).toBe(
        `update settings(${PRACTICE},v=${String(SEEDED_VERSION)},[aiEnabled=true])`,
      );
    });

    it('treats `false` as a SUBMITTED value, not as an absence', async () => {
      // The single most likely presence bug. A truthiness-based rule would drop this assignment
      // entirely and silently refuse to turn the control off.
      const result = await write({ body: { billingReviewRequired: false } });

      expect(recordedUpdate()).toContain('billingReviewRequired=false');
      expect(result.settings.billingReviewRequired).toBe(false);
      expect(world.settings[0]?.billingReviewRequired).toBe(false);
    });

    it('treats `retentionPolicyCode: null` as a SUBMITTED SQL NULL', async () => {
      const result = await write({ body: { retentionPolicyCode: null } });

      expect(recordedUpdate()).toContain('retentionPolicyCode=null');
      expect(result.settings.retentionPolicyCode).toBeNull();
      expect(world.settings[0]?.retentionPolicyCode).toBeNull();
    });

    it('assigns NOTHING for an omitted field, and leaves it unchanged', async () => {
      await write({ body: { aiEnabled: true } });

      const set = recordedUpdate() ?? '';

      for (const omitted of [
        'billingReviewRequired',
        'allowMpaApproval',
        'allowBillingSpecialistApproval',
        'requireReasonForManualChange',
        'axenitaExportEnabled',
        'retentionPolicyCode',
      ]) {
        expect(set).not.toContain(omitted);
      }

      // And the stored row kept every one of them.
      expect(world.settings[0]?.billingReviewRequired).toBe(true);
      expect(world.settings[0]?.requireReasonForManualChange).toBe(true);
      expect(world.settings[0]?.retentionPolicyCode).toBe('DEV-RETENTION-STANDARD');
    });

    it('assigns exactly the submitted subset for a partial patch', async () => {
      await write({ body: { aiEnabled: true, retentionPolicyCode: 'CH-10Y' } });

      const set = recordedUpdate() ?? '';

      expect(set).toContain('aiEnabled=true');
      expect(set).toContain('retentionPolicyCode="CH-10Y"');
      expect(set).not.toContain('allowMpaApproval');
      expect(set).not.toContain('axenitaExportEnabled');
    });

    it('assigns all seven when all seven are submitted', async () => {
      const result = await write({
        body: {
          billingReviewRequired: false,
          allowMpaApproval: true,
          allowBillingSpecialistApproval: true,
          requireReasonForManualChange: false,
          aiEnabled: true,
          axenitaExportEnabled: true,
          retentionPolicyCode: 'CH-ALL',
        },
      });

      const set = recordedUpdate() ?? '';

      for (const assignment of [
        'billingReviewRequired=false',
        'allowMpaApproval=true',
        'allowBillingSpecialistApproval=true',
        'requireReasonForManualChange=false',
        'aiEnabled=true',
        'axenitaExportEnabled=true',
        'retentionPolicyCode="CH-ALL"',
      ]) {
        expect(set).toContain(assignment);
      }

      expect(result.settings).toEqual({
        practiceId: PRACTICE,
        billingReviewRequired: false,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
        requireReasonForManualChange: false,
        aiEnabled: true,
        axenitaExportEnabled: true,
        retentionPolicyCode: 'CH-ALL',
      });
    });

    it('does not derive presence from an inherited property', async () => {
      // `Object.hasOwn` and not `in`. A prototype-borne member is not something the caller sent,
      // and treating it as one would let a crafted payload steer an assignment.
      const body = Object.create({ aiEnabled: true }) as Record<string, unknown>;
      body['billingReviewRequired'] = false;

      await write({ body });

      const set = recordedUpdate() ?? '';

      expect(set).toContain('billingReviewRequired=false');
      expect(set).not.toContain('aiEnabled');
    });
  });

  describe('the atomic statement (D-055 clauses 15 to 18, 22 and 23)', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    it('issues exactly ONE update, with the practice and version predicate', async () => {
      await write();

      const updates = database.calls.filter((call) => call.startsWith('update settings('));

      expect(updates).toHaveLength(1);
      expect(updates[0]).toContain(PRACTICE);
      expect(updates[0]).toContain(`v=${String(SEEDED_VERSION)}`);
    });

    it('performs NO settings pre-read and NO settings post-read (clauses 16 and 23)', async () => {
      await write();

      // `select settings_representation(...)` is the READ route's step 11 statement, recorded
      // under its own name precisely so that its ABSENCE here can be asserted. The three-column
      // `select practice_settings(...)` that does appear is the permission-derivation input of
      // step 9, which every tenant route issues; it is not a representation read.
      expect(
        database.calls.some((call) => call.startsWith('select settings_representation(')),
      ).toBe(false);

      const updateIndex = database.calls.findIndex((call) => call.startsWith('update settings('));
      const afterUpdate = database.calls.slice(updateIndex + 1);

      expect(afterUpdate).toEqual(['COMMIT']);
    });

    it('runs the whole chain in ONE transaction and commits it once', async () => {
      await write();

      expect(database.transactions).toBe(1);
      expect(database.committed).toBe(1);
      expect(database.rolledBack).toBe(0);
      expect(database.calls).toEqual([
        ...ADMITTED_CHAIN,
        `update settings(${PRACTICE},v=${String(SEEDED_VERSION)},[aiEnabled=true])`,
        'COMMIT',
      ]);
    });

    it('writes only AFTER the tenant context is established', async () => {
      await write();

      const contextIndex = database.calls.indexOf(`set_request_context(${PRACTICE})`);
      const updateIndex = database.calls.findIndex((call) => call.startsWith('update settings('));

      expect(contextIndex).toBeGreaterThanOrEqual(0);
      expect(updateIndex).toBeGreaterThan(contextIndex);
    });

    it('names the ADMITTED practice, never the raw path segment', async () => {
      await write();

      expect(recordedUpdate()).toContain(PRACTICE);
      expect(recordedUpdate()).not.toContain(OTHER_PRACTICE);
    });

    it('increments version exactly once and returns the new strong ETag', async () => {
      const result = await write();

      expect(world.settings[0]?.version).toBe(SEEDED_VERSION + 1);
      expect(result.etag).toBe(`"${String(SEEDED_VERSION + 1)}"`);
      expect(result.etag).toMatch(/^"\d+"$/);
      expect(result.etag).not.toMatch(/^W\//);
    });

    it('returns exactly the frozen eight fields, with no version in the body', async () => {
      const result = await write();

      expect(Object.keys(result.settings).sort()).toEqual(FROZEN_KEYS);
      expect(JSON.stringify(result.settings)).not.toContain('version');
      // No MEMBER of the document carries the version, under any key. A substring search would
      // be the wrong instrument here — the practice UUID contains most digits — so the values
      // themselves are checked.
      expect(Object.values(result.settings)).not.toContain(SEEDED_VERSION + 1);
      expect(Object.values(result.settings)).not.toContain(String(SEEDED_VERSION + 1));
    });

    it('derives both the body and the ETag from the SAME returned row (clause 23)', async () => {
      const result = await write({ body: { aiEnabled: true, retentionPolicyCode: 'CH-1Y' } });

      // The document shows the values this very statement wrote, and the tag shows the version
      // that same statement produced. A second read could have observed a later state for either.
      expect(result.settings.aiEnabled).toBe(true);
      expect(result.settings.retentionPolicyCode).toBe('CH-1Y');
      expect(result.etag).toBe(`"${String(SEEDED_VERSION + 1)}"`);
    });

    it('leaves the practice id of the row untouched', async () => {
      const result = await write();

      expect(result.settings.practiceId).toBe(PRACTICE);
      expect(recordedUpdate()).not.toContain('practiceId=');
    });
  });

  describe('the same-value patch is a real patch (D-055 — no no-op detection)', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    it('writes, increments and re-tags when the submitted value equals the stored one', async () => {
      // The stored row has `billingReviewRequired: true`. Submitting `true` is STILL a patch: a
      // caller asked for a state and the resource moved to a new version reflecting that request.
      // An `IS DISTINCT FROM` predicate or an application-level no-op check would answer `200`
      // with an unchanged version, and the caller's next `If-Match` would then be a guess.
      const result = await write({ body: { billingReviewRequired: true } });

      expect(recordedUpdate()).toContain('billingReviewRequired=true');
      expect(result.etag).toBe(`"${String(SEEDED_VERSION + 1)}"`);
      expect(world.settings[0]?.version).toBe(SEEDED_VERSION + 1);
      expect(result.settings.billingReviewRequired).toBe(true);
    });

    it('increments once per same-value patch, not once per changed value', async () => {
      await write({ body: { aiEnabled: false } });
      expect(world.settings[0]?.version).toBe(SEEDED_VERSION + 1);

      await write({ ifMatch: `"${String(SEEDED_VERSION + 1)}"`, body: { aiEnabled: false } });
      expect(world.settings[0]?.version).toBe(SEEDED_VERSION + 2);
    });
  });

  describe('zero rows is one outcome (D-055 clauses 19 to 21)', () => {
    it('answers 409 for a STALE but syntactically valid version', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const refusal = await refusalOf({ ifMatch: `"${String(SEEDED_VERSION - 1)}"` });

      expect(refusal.getStatus()).toBe(409);
      expect(refusal.code).toBe('VERSION_CONFLICT');
      expect(refusal.errors).toBeUndefined();
      // The row did not move: a conflicted write must not consume a version either.
      expect(world.settings[0]?.version).toBe(SEEDED_VERSION);
      expect(world.settings[0]?.aiEnabled).toBe(false);
    });

    it('answers the SAME 409 when the settings row does not exist at all', async () => {
      // Everything else passes: ACTIVE user, ACTIVE practice, ACTIVE membership, tenant context,
      // `practice.settings.manage` held. Only the row is missing. Note the DELIBERATE asymmetry
      // with `GET`, which answers `500` for the same database state (clause 21) — a write learns
      // it for free from the row count, and paying for the distinction would cost the atomicity.
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'PRACTICE_ADMIN',
      });

      const refusal = await refusalOf();

      expect(refusal.getStatus()).toBe(409);
      expect(refusal.code).toBe('VERSION_CONFLICT');
      expect(refusal.getStatus()).not.toBe(404);
      expect(refusal.getStatus()).not.toBe(403);
      expect(refusal.getStatus()).not.toBe(500);
    });

    it('never issues a second statement to discover WHY zero rows matched (clause 20)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await refusalOf({ ifMatch: '"1"' });

      const updateIndex = database.calls.findIndex((call) => call.startsWith('update settings('));

      // Nothing follows the failed statement except the rollback. No discriminating read exists,
      // so no race window exists either.
      expect(database.calls.slice(updateIndex + 1)).toEqual(['ROLLBACK']);
    });

    it('rolls the transaction back on every refusal', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      for (const overrides of [
        { ifMatch: undefined },
        { ifMatch: 'bad' },
        { body: { unknownField: true } },
        { body: {} },
        { ifMatch: '"1"' },
      ] as const) {
        database.calls.length = 0;
        await refusalOf(overrides);

        expect(database.calls[database.calls.length - 1]).toBe('ROLLBACK');
        expect(database.calls).not.toContain('COMMIT');
      }
    });
  });

  describe('the ETag round trip (D-055 clauses 11 and 22)', () => {
    beforeEach(() => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
    });

    it('accepts the ETag of one successful PATCH verbatim as the If-Match of the next', async () => {
      // THE PROPERTY A CLIENT ACTUALLY DEPENDS ON. The emitted tag and the accepted grammar are
      // two separate pieces of code, and if either drifts a well-behaved client that echoes what
      // it was given starts receiving `400`.
      const first = await write({ body: { aiEnabled: true } });

      const second = await write({ ifMatch: first.etag, body: { aiEnabled: false } });

      expect(second.settings.aiEnabled).toBe(false);
      expect(second.etag).toBe(`"${String(SEEDED_VERSION + 2)}"`);
      expect(world.settings[0]?.version).toBe(SEEDED_VERSION + 2);
    });

    it('refuses the PREVIOUS tag once a newer version exists', async () => {
      const first = await write();
      const stale = `"${String(SEEDED_VERSION)}"`;

      expect(first.etag).not.toBe(stale);
      expect((await refusalOf({ ifMatch: stale })).getStatus()).toBe(409);
    });
  });
});

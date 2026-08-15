/**
 * Unit contract of `GET /practices/{practiceId}` (`03` §3.2, §3.7.1 and the accepted
 * `GET /practices/{practiceId}` section; `15` §5; D-047 clauses 10, 11 and 18).
 *
 * This suite owns the two properties that cannot be observed from a status code alone:
 *
 * 1. THE ORDER OF THE CHAIN. Every refusal is asserted against the FULL recorded call log, so a
 *    spec fails when a rejection moves even one step later than the accepted decisions put it —
 *    for instance if the practice-status check ran after the membership read, or if the header
 *    were validated before the caller was admitted.
 * 2. THE AUTHORISATION PATH. `practice.read` is decided through the single matrix
 *    representation, so every one of the six tenant roles is driven through the real resolver.
 *    The expected outcomes are taken from `15` §5 and D-047 clause 11; the matrix itself is
 *    never restated, here or in production code.
 *
 * Real PostgreSQL semantics — the `02` §17.5/§17.6 policies, the column grants of §20.2a, the
 * transaction-local GUCs and real HTTP statuses — are proven against a real database in
 * `test/phase3-practice-read.security.ts`. Both halves are required; neither replaces the other.
 */

import { type PracticeResponseDto, type TenantMembershipRole } from '@axenita/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  RecordingDatabase,
  emptyWorld,
  practiceRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { type BootstrapUserRow } from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import { PracticeReadService } from './practice-read.service.js';

const SUBJECT = 'dev|practice-admin';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const OTHER_USER = '22222222-2222-4222-8222-222222222009';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';
const OTHER_MEMBERSHIP = '33333333-3333-4333-8333-333333333009';

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

describe('PracticeReadService', () => {
  let world: World;
  let database: RecordingDatabase;
  let service: PracticeReadService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    // The very same bootstrap the `/me` route uses. There is no second implementation of
    // `set_auth_subject_context`, of the users read, of the ACTIVE-user check or of
    // `set_user_context`, and this wiring is what proves it.
    service = new PracticeReadService(new IdentityBootstrapService(database));
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
    world.settings.push({
      practiceId: PRACTICE,
      allowMpaApproval: false,
      allowBillingSpecialistApproval: false,
    });

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

  function read(overrides: ReadOverrides = {}): Promise<PracticeResponseDto> {
    return service.loadPractice({
      verifiedAuthSubject: overrides.subject ?? SUBJECT,
      requestedPracticeId: overrides.practiceId ?? PRACTICE,
      practiceContextHeader: 'header' in overrides ? overrides.header : PRACTICE,
    });
  }

  async function refusalOf(overrides: ReadOverrides = {}): Promise<ApiException> {
    const failure = await read(overrides).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiException);

    return failure as ApiException;
  }

  describe('the successful read', () => {
    it('returns exactly the six accepted fields and nothing else', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const practice = await read();

      // An exact key set, not a list of `not.toHaveProperty` assertions: a future widening of
      // the projection has to break this test rather than slip past it.
      expect(Object.keys(practice).sort()).toEqual([
        'code',
        'defaultLanguage',
        'id',
        'name',
        'status',
        'timezone',
      ]);
      expect(practice).toEqual({
        id: PRACTICE,
        code: 'code-1001',
        name: 'Demo Praxis Zuerich',
        defaultLanguage: 'de-CH',
        timezone: 'Europe/Zurich',
        status: 'ACTIVE',
      });
    });

    it('runs the whole chain in exactly one committed transaction (D-047 clause 8)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      expect(database.transactions).toBe(1);
      expect(database.committed).toBe(1);
      expect(database.rolledBack).toBe(0);
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select membership(${USER},${PRACTICE})`,
        `select membership_roles(${MEMBERSHIP})`,
        `select practice_settings(${PRACTICE})`,
        'COMMIT',
      ]);
    });

    it('reads the requested practice only after the user context exists (03 §3.7.1)', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      expect(database.calls.indexOf(`select practice(${PRACTICE})`)).toBeGreaterThan(
        database.calls.indexOf(`set_user_context(${USER})`),
      );
    });

    it('reads the settings of the requested practice only', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings.push({
        practiceId: OTHER_PRACTICE,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
      });

      await read();

      expect(database.calls).toContain(`select practice_settings(${PRACTICE})`);
      expect(
        database.calls.filter((call) => call.startsWith('select practice_settings')),
      ).toHaveLength(1);
    });

    it('accepts an upper case header and path — a UUID is not case sensitive', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const practice = await read({
        practiceId: PRACTICE.toUpperCase(),
        header: PRACTICE.toUpperCase(),
      });

      expect(practice.id).toBe(PRACTICE);
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

    it('answers 403 for a path that is not a UUID, never PRACTICE_CONTEXT_INVALID', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const failure = await refusalOf({ practiceId: 'not-a-uuid', header: PRACTICE });

      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
    });
  });

  describe('the requested practice (D-047 clause 10)', () => {
    it('answers 403 for a practice the membership policy does not expose', async () => {
      world.bootstrapUsers.push(activeUser());

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        'ROLLBACK',
      ]);
    });

    it.each(['INACTIVE', 'SUSPENDED', 'ARCHIVED'])(
      'refuses a practice with status %s and rolls back before anything else is read',
      async (status) => {
        seedEligibleCaller(['PRACTICE_ADMIN']);
        world.practices[0] = practiceRow(PRACTICE, 'Demo Praxis Zuerich', { status });

        const failure = await refusalOf();

        expect(failure.getStatus()).toBe(403);
        expect(failure.code).toBe('ACCESS_DENIED');
        // The status check is step 6 of D-047 clause 10 and precedes everything downstream. In
        // phase 4 `set_request_context` becomes step 7, so this rejection will still stand
        // strictly before any tenant context exists.
        expect(database.calls).toEqual([
          ...CHAIN_UP_TO_USER_CONTEXT,
          `select practice(${PRACTICE})`,
          'ROLLBACK',
        ]);
        expect(database.rolledBack).toBe(1);
        expect(database.committed).toBe(0);
      },
    );

    it('answers a non-existent practice and a foreign practice identically', async () => {
      world.bootstrapUsers.push(activeUser());
      const nonExistent = await refusalOf();

      // A practice that exists but belongs to somebody else: the policy hides it just the same.
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      world.memberships.push({
        id: OTHER_MEMBERSHIP,
        practiceId: PRACTICE,
        active: true,
        userId: OTHER_USER,
      });
      const foreign = await refusalOf();

      expect(foreign.getStatus()).toBe(nonExistent.getStatus());
      expect(foreign.code).toBe(nonExistent.code);
      expect(foreign.detail).toBe(nonExistent.detail);
    });
  });

  describe('membership narrowing (D-047 clause 18)', () => {
    it('binds the resolved user and the requested practice in one read', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await read();

      expect(database.calls).toContain(`select membership(${USER},${PRACTICE})`);
      // Never "read all my memberships and filter afterwards".
      expect(database.calls.some((call) => call.startsWith('select memberships('))).toBe(false);
    });

    it('answers 403 when the practice is visible but the caller has no membership row', async () => {
      // The `02` §17.6 policy would not expose such a practice, so this is defence in depth:
      // `practice_memberships` has no RLS in phase 3, and the application predicate is the only
      // thing standing between the caller and another tenant's membership.
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(database.calls).toEqual([
        ...CHAIN_UP_TO_USER_CONTEXT,
        `select practice(${PRACTICE})`,
        `select membership(${USER},${PRACTICE})`,
        'ROLLBACK',
      ]);
    });

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
      expect(failure.code).toBe('ACCESS_DENIED');
      // Refused on activity alone, before the roles of that membership are even loaded.
      expect(database.calls.some((call) => call.startsWith('select membership_roles'))).toBe(false);
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
  });

  describe('practice.read authorisation (15 §5, D-047 clause 11)', () => {
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
    ] as const)('%s is granted practice.read: %s', async (role, allowed) => {
      seedEligibleCaller([role]);

      if (allowed) {
        expect(await read()).toMatchObject({ id: PRACTICE });
        return;
      }

      const failure = await refusalOf();
      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
    });

    it('refuses an active membership with zero assigned roles (03 §3.7.2, D-038)', async () => {
      seedEligibleCaller([]);

      expect((await refusalOf()).getStatus()).toBe(403);
    });

    it('grants when PRACTICE_ADMIN is one of several assigned roles', async () => {
      seedEligibleCaller(['PHYSICIAN', 'PRACTICE_ADMIN']);

      expect(await read()).toMatchObject({ id: PRACTICE });
    });

    it('is not enabled by any practice_settings flag', async () => {
      // `practice.read` is not a CONDITIONAL cell. Flipping both approval flags on must change
      // nothing for a role the matrix denies.
      seedEligibleCaller(['MPA']);
      world.settings[0] = {
        practiceId: PRACTICE,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
      };

      expect((await refusalOf()).getStatus()).toBe(403);
    });

    it('derives from the roles of the REQUESTED practice, never from another membership', async () => {
      // PRACTICE_ADMIN in the other practice must not authorise a read of this one.
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

  describe('anti-enumeration (03, negative cases)', () => {
    it('answers every 403 branch with a byte-identical document', async () => {
      const branches: ApiException[] = [];

      // 1. No membership and no such practice.
      world.bootstrapUsers.push(activeUser());
      branches.push(await refusalOf());

      // 2. The practice exists and is visible, but the caller has no membership row.
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
      branches.push(await refusalOf());

      // 3. The membership exists but is inactive.
      world.memberships.push({
        id: MEMBERSHIP,
        practiceId: PRACTICE,
        active: false,
        userId: USER,
      });
      branches.push(await refusalOf());

      // 4. The membership is active but the role does not hold `practice.read`.
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

/**
 * Unit contract of the tenant request/context pipeline — `03` §3.7.1 steps 3 to 10,
 * `02` §16.2.3, `15` §5, D-033 clauses 9–12, D-041, D-047 clauses 10, 11 and 18, D-049, D-053.
 *
 * This suite owns the properties of the tenant boundary that a status code cannot show:
 *
 * 1. WHERE `set_request_context` sits. Every refusal is asserted against the FULL recorded call
 *    log, so the spec fails if the call moves one step earlier or one step later — and the
 *    whole point of D-047 clause 10 is that it may do neither.
 * 2. THAT IT IS NEVER REACHED BY A REFUSED REQUEST. Nine distinct refusals are each driven to
 *    completion and each asserted to have established no tenant context at all.
 * 3. THAT A DATABASE-SIDE REFUSAL FAILS CLOSED. The D-033 clause 11 race is injected at exactly
 *    the point the database would raise it, and must produce the shared `403 ACCESS_DENIED`
 *    with nothing of the SQLSTATE, the statement or the function name in it.
 * 4. THAT THE DERIVATION IS SCOPED. Roles come from the requested membership only, settings from
 *    the requested practice only, and platform roles from nowhere.
 *
 * Real PostgreSQL semantics — the §17.1/§17.3/§17.4/§17.6 policies, the transaction-local GUCs,
 * the real `42501` and its translation — are proven against a real database in
 * `test/phase3-practice-read.security.ts`. Both halves are required; neither replaces the other.
 */

import { type Permission } from '@axenita/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  RecordingDatabase,
  emptyWorld,
  practiceRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { ApiException } from '../../common/errors/api-exception.js';
import {
  type BootstrapUserRow,
  type IdentityBootstrapSession,
} from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import { TenantRequestPipeline, type AdmittedTenantRequest } from './tenant-request.pipeline.js';

const SUBJECT = 'dev|practice-admin';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const OTHER_USER = '22222222-2222-4222-8222-222222222009';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';
const OTHER_MEMBERSHIP = '33333333-3333-4333-8333-333333333009';

const REQUIRED_PERMISSION: Permission = 'practice.read';

/** The recorded chain of the authenticated half, which the pipeline never performs itself. */
const ADMISSION = [
  'BEGIN',
  `set_auth_subject_context(${SUBJECT})`,
  'select users',
  `set_user_context(${USER})`,
];

/** The recorded call that establishes the tenant context of the requested practice. */
const ESTABLISH_CONTEXT = `set_request_context(${PRACTICE})`;

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

describe('TenantRequestPipeline', () => {
  let world: World;
  let database: RecordingDatabase;
  let bootstrap: IdentityBootstrapService;
  let pipeline: TenantRequestPipeline;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    bootstrap = new IdentityBootstrapService(database);
    pipeline = new TenantRequestPipeline();
  });

  /** An ACTIVE user with an ACTIVE membership carrying `roles` in the ACTIVE practice. */
  function seedEligibleCaller(roles: readonly string[]): void {
    world.bootstrapUsers.push(activeUser());
    world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
    world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
    world.settings.push({
      practiceId: PRACTICE,
      allowMpaApproval: false,
      allowBillingSpecialistApproval: false,
    });

    for (const role of roles) {
      world.membershipRoles.push({ membershipId: MEMBERSHIP, practiceId: PRACTICE, role });
    }
  }

  interface AdmitOverrides {
    readonly practiceId?: string;
    /** Absent means "send the practice of the path"; present means "send exactly this". */
    readonly header?: string | undefined;
    readonly subject?: string;
    readonly permission?: Permission;
  }

  /**
   * Drives the pipeline exactly as a route does: inside the ONE authenticated transaction, on
   * the session that transaction pins, and never on a session of its own.
   */
  function admit(overrides: AdmitOverrides = {}): Promise<AdmittedTenantRequest> {
    return bootstrap.runAuthenticatedSession(
      overrides.subject ?? SUBJECT,
      // Two arguments, and neither of them is a user. The admitted `user` the bootstrap yields
      // is deliberately NOT forwarded: after D-054 clause 12 the pipeline has no parameter that
      // could receive it (see the `admit` signature specs below).
      async (session: IdentityBootstrapSession) =>
        pipeline.admit(session, {
          requestedPracticeId: overrides.practiceId ?? PRACTICE,
          practiceContextHeader: 'header' in overrides ? overrides.header : PRACTICE,
          requiredPermission: overrides.permission ?? REQUIRED_PERMISSION,
        }),
    );
  }

  async function refusalOf(overrides: AdmitOverrides = {}): Promise<ApiException> {
    const failure = await admit(overrides).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiException);

    return failure as ApiException;
  }

  describe('membership identity is bound to the session (D-054 clause 12)', () => {
    it('exposes no user parameter on admit at all', () => {
      // The seam D-054 clause 12 requires removed was the SECOND, independently supplied
      // identity value. Its absence is asserted on the arity itself, because that is the thing
      // that made the wrong user expressible: `(session, request)` and nothing else.
      expect(pipeline.admit.bind(pipeline)).toHaveLength(2);

      const source = TenantRequestPipeline.prototype.admit.toString();

      expect(source).not.toContain('userId');
      // The predecessor session method took `(userId, practiceId)`. Neither it nor any other
      // user-accepting lookup may reappear on this path.
      expect(source).not.toContain('findMembershipInPractice');
    });

    it('carries no user identity on the request object either', async () => {
      // Moving the parameter into `TenantRequest` would restore the seam verbatim, so the
      // admitted request is checked for any identity-shaped member as well.
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const admitted = await admit();

      expect(Object.keys(admitted)).not.toContain('userId');
    });

    it('resolves the membership against the established app.user_id', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await admit();

      // The recorded identity is the one `set_user_context` established, not one the pipeline
      // supplied: the double derives it from the modelled GUC exactly as the real predicate
      // `user_id = nullif(current_setting('app.user_id', true), '')::uuid` does.
      const contextCall = database.calls.indexOf(`set_user_context(${USER})`);
      const membershipCall = database.calls.indexOf(
        `select current_membership(${USER},${PRACTICE})`,
      );

      expect(contextCall).toBeGreaterThanOrEqual(0);
      expect(membershipCall).toBeGreaterThan(contextCall);
    });

    it('admits nobody when no user context is established, however eligible the data', async () => {
      // The session method has no user argument, so with `app.user_id` unset the predicate is
      // NULL and the read is zero rows — the same fail-closed outcome the database produces.
      // A pipeline that still carried an identity of its own could not fail this way.
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const failure = await database
        .runBootstrapTransaction(async (session) => {
          // Deliberately NO set_user_context: the authenticated half never ran.
          await session.setAuthSubjectContext(SUBJECT);

          return pipeline.admit(session, {
            requestedPracticeId: PRACTICE,
            practiceContextHeader: PRACTICE,
            requiredPermission: REQUIRED_PERMISSION,
          });
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect((failure as ApiException).getStatus()).toBe(403);
      expect(database.calls).toContain(`select current_membership(null,${PRACTICE})`);
      expect(database.calls.some((call) => call.startsWith('set_request_context('))).toBe(false);
    });

    it('cannot be pointed at another user’s membership by any caller-supplied value', async () => {
      // The whole of the removed seam, driven as an attack: the ACTIVE, role-bearing membership
      // in the requested practice belongs to OTHER_USER, and the authenticated caller is USER.
      // There is no argument through which the caller could nominate OTHER_USER, and the
      // session-derived predicate does not match, so admission fails.
      world.bootstrapUsers.push(activeUser());
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
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

      expect((await refusalOf()).getStatus()).toBe(403);
      // The foreign membership was never even read under this identity, so its roles could not
      // have contributed to any permission decision.
      expect(database.calls.some((call) => call.includes(OTHER_USER))).toBe(false);
      expect(database.calls.some((call) => call.includes(OTHER_MEMBERSHIP))).toBe(false);
    });
  });

  describe('the admitted tenant request (03 §3.7.1, D-047 clause 10)', () => {
    it('performs steps 3 to 10 in exactly the frozen order', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await admit();

      // One literal sequence, so a reordering cannot pass. Every step of D-047 clause 10 is
      // present, once, in its accepted position.
      expect(database.calls).toEqual([
        ...ADMISSION,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        ESTABLISH_CONTEXT,
        `select membership_roles(${MEMBERSHIP})`,
        `select practice_settings(${PRACTICE})`,
        'COMMIT',
      ]);
    });

    it('establishes the tenant context exactly once, for the requested practice', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const admitted = await admit();

      expect(database.calls.filter((call) => call.startsWith('set_request_context('))).toEqual([
        ESTABLISH_CONTEXT,
      ]);
      expect(admitted.practiceId).toBe(PRACTICE);
    });

    it('returns a narrow description of one admitted request and nothing more', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const admitted = await admit();

      // No practice row: step 11 must read under the established context rather than project a
      // row that was read before it existed.
      expect(Object.keys(admitted).sort()).toEqual(['membershipId', 'permissions', 'practiceId']);
      expect(admitted.membershipId).toBe(MEMBERSHIP);
      expect(admitted.permissions).toContain(REQUIRED_PERMISSION);
    });

    it('places every user-admission step before any practice-context work', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await admit();

      const firstTenantCall = database.calls.findIndex((call) =>
        call.startsWith('select practice('),
      );

      // Steps 2a to 2d complete first, in order, without exception (03 §3.7.1 steps 1-2).
      expect(database.calls.slice(0, firstTenantCall)).toEqual(ADMISSION);
    });

    it('checks the practice status and the application membership before the context', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await admit();

      const context = database.calls.indexOf(ESTABLISH_CONTEXT);

      expect(database.calls.indexOf(`select practice(${PRACTICE})`)).toBeLessThan(context);
      expect(database.calls.indexOf(`select current_membership(${USER},${PRACTICE})`)).toBeLessThan(
        context,
      );
    });

    it('loads roles and settings only after the context exists', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);

      await admit();

      const context = database.calls.indexOf(ESTABLISH_CONTEXT);

      expect(database.calls.indexOf(`select membership_roles(${MEMBERSHIP})`)).toBeGreaterThan(
        context,
      );
      expect(database.calls.indexOf(`select practice_settings(${PRACTICE})`)).toBeGreaterThan(
        context,
      );
    });

    it('reads the real settings row of the requested practice once the context exists', async () => {
      // Before this slice the read ran without `app.practice_id`, the §17.1 policy returned zero
      // rows for EVERY practice, and derivation always fell back to the D-041 defaults. With the
      // context established the actual row is readable, which is observable on a CONDITIONAL
      // cell: `analysis.approve` x `MPA` is enabled by `allowMpaApproval` alone.
      seedEligibleCaller(['MPA']);
      world.settings[0] = {
        practiceId: PRACTICE,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: false,
      };

      const admitted = await admit({ permission: 'analysis.approve' });

      expect(admitted.permissions).toContain('analysis.approve');
    });

    it('leaves the practice.read outcome unchanged, because it is not a CONDITIONAL cell', async () => {
      // The settings read is now a live row rather than a fail-closed default, and that must
      // change nothing for this route: `practice.read` is ALLOW for PRACTICE_ADMIN and DENY for
      // everyone else, with or without either flag (15 §5, D-047 clause 11).
      for (const flags of [
        { allowMpaApproval: false, allowBillingSpecialistApproval: false },
        { allowMpaApproval: true, allowBillingSpecialistApproval: true },
      ]) {
        world = emptyWorld();
        database = new RecordingDatabase(world);
        bootstrap = new IdentityBootstrapService(database);

        seedEligibleCaller(['MPA']);
        world.settings[0] = { practiceId: PRACTICE, ...flags };

        expect((await refusalOf()).getStatus()).toBe(403);
      }
    });
  });

  describe('no refused request establishes a tenant context (D-047 clause 10)', () => {
    /**
     * Every refusal that can occur before step 5, each seeded to be eligible in EVERY other
     * respect, so that the named cause is the only thing producing the refusal.
     */
    const REFUSALS: readonly (readonly [string, () => AdmitOverrides])[] = [
      [
        'an unknown user',
        (): AdmitOverrides => {
          world.bootstrapUsers.length = 0;
          return {};
        },
      ],
      [
        'an INACTIVE user',
        (): AdmitOverrides => {
          world.bootstrapUsers[0] = activeUser({ status: 'INACTIVE' });
          return {};
        },
      ],
      ['a missing X-Practice-ID', (): AdmitOverrides => ({ header: undefined })],
      ['a malformed X-Practice-ID', (): AdmitOverrides => ({ header: 'not-a-uuid' })],
      [
        'a path that is not the practice of the header',
        (): AdmitOverrides => ({ practiceId: OTHER_PRACTICE }),
      ],
      [
        'a non-existent practice',
        (): AdmitOverrides => {
          world.practices.length = 0;
          return {};
        },
      ],
      [
        'a foreign practice',
        (): AdmitOverrides => {
          // The practice exists and belongs to somebody else, so the §17.6 policy hides it.
          world.memberships[0] = {
            id: OTHER_MEMBERSHIP,
            practiceId: PRACTICE,
            active: true,
            userId: OTHER_USER,
          };
          return {};
        },
      ],
      [
        'a practice that is not ACTIVE',
        (): AdmitOverrides => {
          world.practices[0] = practiceRow(PRACTICE, 'Demo Praxis Zuerich', {
            status: 'SUSPENDED',
          });
          return {};
        },
      ],
      [
        'an INACTIVE membership',
        (): AdmitOverrides => {
          world.memberships[0] = {
            id: MEMBERSHIP,
            practiceId: PRACTICE,
            active: false,
            userId: USER,
          };
          return {};
        },
      ],
    ];

    it.each(REFUSALS.map(([label, arrange]) => [label, arrange] as const))(
      'never calls set_request_context for %s',
      async (_label, arrange) => {
        seedEligibleCaller(['PRACTICE_ADMIN']);
        const overrides = arrange();

        await refusalOf(overrides);

        expect(database.calls.some((call) => call.startsWith('set_request_context('))).toBe(false);
        expect(database.rolledBack).toBe(1);
        expect(database.committed).toBe(0);
      },
    );

    it('refuses a zero-role ACTIVE membership only AFTER the context, and rolls it back', async () => {
      // The one refusal that legitimately comes after step 5: the permission decision is step
      // 10 and cannot be taken before the roles and settings have been read (03 §28.5).
      seedEligibleCaller([]);

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(database.calls).toContain(ESTABLISH_CONTEXT);
      // The context was transaction-local and the transaction was discarded.
      expect(database.calls.at(-1)).toBe('ROLLBACK');
      expect(database.committed).toBe(0);
    });

    it('answers every pre-context refusal with the one shared document', async () => {
      const branches: ApiException[] = [];

      for (const [, arrange] of REFUSALS) {
        world = emptyWorld();
        database = new RecordingDatabase(world);
        bootstrap = new IdentityBootstrapService(database);
        seedEligibleCaller(['PRACTICE_ADMIN']);

        const overrides = arrange();
        branches.push(await refusalOf(overrides));
      }

      // The two header rejections are 400 by contract (03 §3.2, §9); everything else is the
      // single anti-enumeration 403 and must be byte-identical.
      const forbidden = branches.filter((branch) => branch.getStatus() === 403);

      expect(branches).toHaveLength(REFUSALS.length);
      expect(forbidden).toHaveLength(REFUSALS.length - 2);
      for (const branch of forbidden) {
        expect(branch.code).toBe('ACCESS_DENIED');
        expect(branch.detail).toBe('Access denied.');
        expect(branch.errors).toBeUndefined();
      }
    });
  });

  describe('the set_request_context race fails closed (D-033 clause 11)', () => {
    /**
     * The application membership check passes and the database refuses anyway — the concurrent
     * deactivation D-047 clause 10 leaves to the function's own independent validation.
     */
    function arrangeRace(): void {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.contextRaces.push(PRACTICE);
    }

    it('maps a 42501 raised by set_request_context to the canonical 403 ACCESS_DENIED', async () => {
      arrangeRace();

      const failure = await refusalOf();

      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
      expect(failure.detail).toBe('Access denied.');
    });

    it('exposes no SQLSTATE, SQL, function name or database message', async () => {
      arrangeRace();

      const failure = await refusalOf();
      const serialised = JSON.stringify({
        code: failure.code,
        detail: failure.detail,
        errors: failure.errors,
        message: failure.message,
      });

      for (const forbiddenText of [
        '42501',
        'set_request_context',
        'app_security',
        'select ',
        'practice_memberships',
        'SQLSTATE',
        PRACTICE,
        USER,
        MEMBERSHIP,
      ]) {
        expect(serialised).not.toContain(forbiddenText);
      }
    });

    it('is indistinguishable from the refusal of a practice that does not exist', async () => {
      arrangeRace();
      const raced = await refusalOf();

      world = emptyWorld();
      database = new RecordingDatabase(world);
      bootstrap = new IdentityBootstrapService(database);
      world.bootstrapUsers.push(activeUser());
      const absent = await refusalOf();

      expect(raced.getStatus()).toBe(absent.getStatus());
      expect(raced.code).toBe(absent.code);
      expect(raced.detail).toBe(absent.detail);
    });

    it('establishes no tenant context and rolls the transaction back', async () => {
      arrangeRace();

      await refusalOf();

      // The function clears `app.practice_id` before it validates, so a refused target never
      // becomes active; the rollback then discards the whole chain (D-033 clauses 10 and 12).
      expect(database.calls).toEqual([
        ...ADMISSION,
        `select practice(${PRACTICE})`,
        `select current_membership(${USER},${PRACTICE})`,
        ESTABLISH_CONTEXT,
        'ROLLBACK',
      ]);
      expect(database.rolledBack).toBe(1);
    });

    it('does not translate a failure of any other statement', async () => {
      // The mapping is keyed to one operation. An `insufficient_privilege` from anywhere else —
      // a revoked column grant, for instance — must stay an internal failure, because answering
      // 403 for it would present a broken deployment as a routine refusal.
      seedEligibleCaller(['PRACTICE_ADMIN']);

      const failure = await bootstrap
        .runAuthenticatedSession(SUBJECT, async (session) => {
          const sabotaged: IdentityBootstrapSession = {
            ...session,
            findMembershipRoles: (): Promise<never> => {
              throw new Error('permission denied for table practice_membership_roles');
            },
          };

          return pipeline.admit(sabotaged, {
            requestedPracticeId: PRACTICE,
            practiceContextHeader: PRACTICE,
            requiredPermission: REQUIRED_PERMISSION,
          });
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(ApiException);
    });
  });

  describe('permission derivation is scoped to the admitted request (15 §5, 03 §28.5)', () => {
    it.each([
      ['PRACTICE_ADMIN', true],
      ['PHYSICIAN', false],
      ['MPA', false],
      ['BILLING_SPECIALIST', false],
      ['AUDITOR', false],
      ['READ_ONLY', false],
    ] as const)('%s holds practice.read: %s', async (role, allowed) => {
      seedEligibleCaller([role]);

      if (allowed) {
        expect((await admit()).permissions).toContain(REQUIRED_PERMISSION);
        return;
      }

      expect((await refusalOf()).getStatus()).toBe(403);
    });

    it('loads the roles of the requested membership only', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
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

      await admit();

      expect(database.calls).toContain(`select membership_roles(${MEMBERSHIP})`);
      expect(database.calls.some((call) => call.includes(OTHER_MEMBERSHIP))).toBe(false);
      // Never "read all my memberships and filter afterwards" either.
      expect(database.calls.some((call) => call.startsWith('select memberships('))).toBe(false);
    });

    it('never lets another membership of the same user contribute a role', async () => {
      // PRACTICE_ADMIN in the OTHER practice must not authorise a read of this one.
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

    it('reads the settings of the requested practice only', async () => {
      seedEligibleCaller(['PRACTICE_ADMIN']);
      world.settings.push({
        practiceId: OTHER_PRACTICE,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
      });

      await admit();

      const settingsReads = database.calls.filter((call) =>
        call.startsWith('select practice_settings'),
      );

      expect(settingsReads).toEqual([`select practice_settings(${PRACTICE})`]);
    });

    it('never lets another practice’s settings contribute', async () => {
      // The MPA cell of `approval.submit` is CONDITIONAL on `allowMpaApproval` (15 §5, D-041).
      // Enabling it in the OTHER practice must change nothing here, and the tenant policy makes
      // the foreign row unreadable in the first place.
      seedEligibleCaller(['MPA']);
      world.settings[0] = {
        practiceId: PRACTICE,
        allowMpaApproval: false,
        allowBillingSpecialistApproval: false,
      };
      world.settings.push({
        practiceId: OTHER_PRACTICE,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: true,
      });

      const withoutForeignFlag = await refusalOf({ permission: 'analysis.approve' });

      expect(withoutForeignFlag.getStatus()).toBe(403);
    });

    it('grants a CONDITIONAL cell from the requested practice’s own flag', async () => {
      // The mirror image of the spec above: the same role, the same permission, and the flag
      // enabled on THIS practice — which is the only thing that may enable it.
      seedEligibleCaller(['MPA']);
      world.settings[0] = {
        practiceId: PRACTICE,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: false,
      };

      const admitted = await admit({ permission: 'analysis.approve' });

      expect(admitted.permissions).toContain('analysis.approve');
    });

    it('reads no platform role, so SYSTEM_ADMIN cannot bypass the membership', async () => {
      // A SYSTEM_ADMIN with no tenant membership at all, and one with a membership that holds
      // no granting role: neither may be admitted (D-023 clause 10, D-038 clauses 12-14).
      world.bootstrapUsers.push(activeUser());
      world.platformRoles.push({ userId: USER, platformRole: 'SYSTEM_ADMIN' });
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));

      expect((await refusalOf()).getStatus()).toBe(403);

      world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'READ_ONLY',
      });

      expect((await refusalOf()).getStatus()).toBe(403);
      expect(database.calls.some((call) => call.startsWith('select platform_roles'))).toBe(false);
    });
  });
});

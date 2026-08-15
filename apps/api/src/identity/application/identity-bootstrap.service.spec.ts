/**
 * Unit contract of the authenticated bootstrap (`03` §3.1, §10; D-047 clauses 2–4 and 9).
 *
 * The database is replaced by a RECORDING session, not by a loose mock: it stores rows, applies
 * the same user scoping the real queries apply, and appends every call to an ordered log. That
 * makes the ORDER of the chain assertable, which is the property the accepted decisions actually
 * fix — a test that only checks the final HTTP status would pass even if `set_user_context` ran
 * before the status check.
 *
 * Real PostgreSQL semantics — RLS policies, transaction local GUCs, request to request isolation
 * — are proven separately against a real database in `test/phase3-identity-*.security.ts`. This
 * suite is the ordering and projection contract, not a substitute for those.
 */

import { type MeResponseDto } from '@axenita/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import { IdentityInvariantError } from '../identity.errors.js';
import {
  type BootstrapUserRow,
  type ConditionalSettingsRow,
  type IdentityBootstrapSession,
  type IdentityDatabase,
  type MembershipRoleRow,
  type MembershipRow,
  type PlatformRoleRow,
  type PracticeRow,
} from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';

const SUBJECT = 'dev|practice-admin';

const PRACTICE_A = '11111111-1111-4111-8111-111111111001';
const PRACTICE_B = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const OTHER_USER = '22222222-2222-4222-8222-222222222009';
const MEMBERSHIP_A = '33333333-3333-4333-8333-333333333001';
const MEMBERSHIP_B = '33333333-3333-4333-8333-333333333002';

interface OwnedMembership extends MembershipRow {
  readonly userId: string;
}

interface OwnedPlatformRole extends PlatformRoleRow {
  readonly userId: string;
}

interface World {
  /** Rows the bootstrap policy of `02` §17.5 would expose for the verified subject. */
  bootstrapUsers: BootstrapUserRow[];
  memberships: OwnedMembership[];
  practices: PracticeRow[];
  membershipRoles: MembershipRoleRow[];
  settings: ConditionalSettingsRow[];
  platformRoles: OwnedPlatformRole[];
}

/**
 * Records every session call and the arguments that matter, so a spec can assert the sequence.
 *
 * It also enforces one rule of its own: a session method called after the transaction callback
 * returned throws. That turns "the code kept a client and used it later" into a failure.
 */
class RecordingDatabase implements IdentityDatabase {
  public readonly calls: string[] = [];
  public transactions = 0;
  public committed = 0;
  public rolledBack = 0;

  public constructor(private readonly world: World) {}

  public async runBootstrapTransaction<T>(
    work: (session: IdentityBootstrapSession) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    this.calls.push('BEGIN');

    const session = this.createSession();

    try {
      const result = await work(session);
      this.calls.push('COMMIT');
      this.committed += 1;
      return result;
    } catch (error) {
      this.calls.push('ROLLBACK');
      this.rolledBack += 1;
      throw error;
    }
  }

  private createSession(): IdentityBootstrapSession {
    const world = this.world;
    const calls = this.calls;

    return {
      setAuthSubjectContext: async (authSubject: string): Promise<void> => {
        calls.push(`set_auth_subject_context(${authSubject})`);
        return Promise.resolve();
      },
      findUsersForVerifiedSubject: async (): Promise<readonly BootstrapUserRow[]> => {
        calls.push('select users');
        return Promise.resolve(world.bootstrapUsers);
      },
      setUserContext: async (userId: string): Promise<void> => {
        calls.push(`set_user_context(${userId})`);
        return Promise.resolve();
      },
      findMemberships: async (userId: string): Promise<readonly MembershipRow[]> => {
        calls.push(`select memberships(${userId})`);
        return Promise.resolve(world.memberships.filter((row) => row.userId === userId));
      },
      findPractices: async (practiceIds: readonly string[]): Promise<readonly PracticeRow[]> => {
        calls.push(`select practices(${[...practiceIds].sort().join(',')})`);
        return Promise.resolve(world.practices.filter((row) => practiceIds.includes(row.id)));
      },
      findMembershipRoles: async (
        membershipIds: readonly string[],
      ): Promise<readonly MembershipRoleRow[]> => {
        calls.push(`select membership_roles(${[...membershipIds].sort().join(',')})`);
        return Promise.resolve(
          world.membershipRoles.filter((row) => membershipIds.includes(row.membershipId)),
        );
      },
      findConditionalSettings: async (
        practiceIds: readonly string[],
      ): Promise<readonly ConditionalSettingsRow[]> => {
        calls.push(`select practice_settings(${[...practiceIds].sort().join(',')})`);
        return Promise.resolve(
          world.settings.filter((row) => practiceIds.includes(row.practiceId)),
        );
      },
      findCurrentPlatformRoles: async (userId: string): Promise<readonly PlatformRoleRow[]> => {
        calls.push(`select platform_roles(${userId})`);
        return Promise.resolve(world.platformRoles.filter((row) => row.userId === userId));
      },
    };
  }
}

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

function emptyWorld(): World {
  return {
    bootstrapUsers: [],
    memberships: [],
    practices: [],
    membershipRoles: [],
    settings: [],
    platformRoles: [],
  };
}

function settingsRow(practiceId: string, mpa: boolean, billing: boolean): ConditionalSettingsRow {
  return {
    practiceId,
    allowMpaApproval: mpa,
    allowBillingSpecialistApproval: billing,
  };
}

describe('IdentityBootstrapService', () => {
  let world: World;
  let database: RecordingDatabase;
  let service: IdentityBootstrapService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    service = new IdentityBootstrapService(database);
  });

  describe('admission', () => {
    it('resolves an ACTIVE user and returns its identity block (03 §10)', async () => {
      world.bootstrapUsers.push(activeUser());

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.id).toBe(USER);
      expect(me.email).toBe('dev.practice-admin@example.invalid');
      expect(me.displayName).toBe('Dev Practice Admin');
      expect(me.preferredLanguage).toBe('de-CH');
      expect(me.memberships).toEqual([]);
      expect(me.platformRoles).toEqual([]);
      expect(database.committed).toBe(1);
    });

    it('runs the whole chain inside exactly one transaction (D-047 clause 8)', async () => {
      world.bootstrapUsers.push(activeUser());

      await service.loadCurrentIdentity(SUBJECT);

      expect(database.transactions).toBe(1);
      expect(database.calls[0]).toBe('BEGIN');
      expect(database.calls.at(-1)).toBe('COMMIT');
      expect(database.calls.filter((call) => call === 'BEGIN')).toHaveLength(1);
    });

    it('sets the auth subject context before reading users (03 §3.1 steps 2-3)', async () => {
      world.bootstrapUsers.push(activeUser());

      await service.loadCurrentIdentity(SUBJECT);

      expect(database.calls.indexOf(`set_auth_subject_context(${SUBJECT})`)).toBeLessThan(
        database.calls.indexOf('select users'),
      );
    });

    it('reads users without naming auth_subject — the subject reaches the database only through the context function', async () => {
      world.bootstrapUsers.push(activeUser());

      await service.loadCurrentIdentity(SUBJECT);

      // The port has no parameter for it, so the bootstrap read cannot filter on it. The policy
      // of 02 §17.5 does the filtering, and the column has no grant anyway.
      const usersCall = database.calls.filter((call) => call.startsWith('select users'));
      expect(usersCall).toEqual(['select users']);
    });

    it('rejects an unknown subject with 403 ACCESS_DENIED (03 §3.1, D-047 clause 3)', async () => {
      await expect(service.loadCurrentIdentity('dev|nobody')).rejects.toMatchObject({
        code: 'ACCESS_DENIED',
      });

      const failure = await service
        .loadCurrentIdentity('dev|nobody')
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiException);
      expect((failure as ApiException).getStatus()).toBe(403);
    });

    it('never establishes a user context for an unknown subject', async () => {
      await expect(service.loadCurrentIdentity('dev|nobody')).rejects.toBeInstanceOf(ApiException);

      expect(database.calls.some((call) => call.startsWith('set_user_context'))).toBe(false);
      expect(database.rolledBack).toBe(1);
    });

    it('does not auto-create a user, fall back to another user or return an empty identity', async () => {
      world.bootstrapUsers.push(activeUser({ id: OTHER_USER }));
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: OTHER_USER,
      });

      // The policy exposes at most the row of the verified subject; when it exposes none, the
      // service must not reach for any other row that happens to exist.
      world.bootstrapUsers.length = 0;

      await expect(service.loadCurrentIdentity('dev|nobody')).rejects.toMatchObject({
        code: 'ACCESS_DENIED',
      });
      expect(database.calls.some((call) => call.startsWith('select memberships'))).toBe(false);
    });

    it('rejects a non-ACTIVE user with the SAME response as an unknown subject (03 §3.1)', async () => {
      world.bootstrapUsers.push(activeUser({ status: 'INACTIVE' }));

      const inactive = await service.loadCurrentIdentity(SUBJECT).catch((error: unknown) => error);

      expect(inactive).toBeInstanceOf(ApiException);
      expect((inactive as ApiException).getStatus()).toBe(403);
      expect((inactive as ApiException).code).toBe('ACCESS_DENIED');
      expect((inactive as ApiException).detail).toBe('Access denied.');
    });

    it.each(['INACTIVE', 'SUSPENDED', 'ARCHIVED'])(
      'rejects status %s BEFORE set_user_context and enumerates nothing (D-047 clause 9)',
      async (status) => {
        world.bootstrapUsers.push(activeUser({ status }));

        await expect(service.loadCurrentIdentity(SUBJECT)).rejects.toBeInstanceOf(ApiException);

        expect(database.calls).toEqual([
          'BEGIN',
          `set_auth_subject_context(${SUBJECT})`,
          'select users',
          'ROLLBACK',
        ]);
        expect(database.calls.some((call) => call.startsWith('set_user_context'))).toBe(false);
        expect(database.calls.some((call) => call.startsWith('select memberships'))).toBe(false);
        expect(database.calls.some((call) => call.startsWith('select platform_roles'))).toBe(false);
      },
    );

    it('treats more than one resolved user as an internal invariant violation, never "pick first"', async () => {
      world.bootstrapUsers.push(activeUser(), activeUser({ id: OTHER_USER }));

      await expect(service.loadCurrentIdentity(SUBJECT)).rejects.toBeInstanceOf(
        IdentityInvariantError,
      );
      expect(database.calls.some((call) => call.startsWith('set_user_context'))).toBe(false);
      expect(database.rolledBack).toBe(1);
    });

    it('establishes the user context only after admission, and before every RLS dependent read', async () => {
      world.bootstrapUsers.push(activeUser());
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.practices.push({ id: PRACTICE_A, name: 'Demo Praxis Zuerich' });

      await service.loadCurrentIdentity(SUBJECT);

      const setUserContext = database.calls.indexOf(`set_user_context(${USER})`);
      expect(setUserContext).toBeGreaterThan(database.calls.indexOf('select users'));

      for (const dependent of [
        'select memberships',
        'select practices',
        'select membership_roles',
        'select practice_settings',
        'select platform_roles',
      ]) {
        expect(database.calls.findIndex((call) => call.startsWith(dependent))).toBeGreaterThan(
          setUserContext,
        );
      }
    });

    it('propagates a database failure and rolls the transaction back', async () => {
      const failing: IdentityDatabase = {
        runBootstrapTransaction: async () => {
          return Promise.reject(new Error('connection lost'));
        },
      };

      await expect(
        new IdentityBootstrapService(failing).loadCurrentIdentity(SUBJECT),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('memberships', () => {
    beforeEach(() => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push(
        { id: PRACTICE_A, name: 'Demo Praxis Zuerich' },
        { id: PRACTICE_B, name: 'Demo Praxis Nord' },
      );
      world.settings.push(
        settingsRow(PRACTICE_A, false, false),
        settingsRow(PRACTICE_B, false, false),
      );
    });

    it('scopes the membership read to the resolved user id (02 §17.3 is phase 4)', async () => {
      world.memberships.push(
        { id: MEMBERSHIP_A, practiceId: PRACTICE_A, active: true, userId: USER },
        { id: MEMBERSHIP_B, practiceId: PRACTICE_B, active: true, userId: OTHER_USER },
      );

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(database.calls).toContain(`select memberships(${USER})`);
      expect(me.memberships.map((membership) => membership.membershipId)).toEqual([MEMBERSHIP_A]);
    });

    it('returns membershipId, practiceId, practiceName, active, roles and permissions — and no singular role', async () => {
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        role: 'PRACTICE_ADMIN',
      });

      const me = await service.loadCurrentIdentity(SUBJECT);
      const membership = me.memberships[0];

      expect(Object.keys(membership ?? {}).sort()).toEqual([
        'active',
        'membershipId',
        'permissions',
        'practiceId',
        'practiceName',
        'roles',
      ]);
      expect(membership).toMatchObject({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        practiceName: 'Demo Praxis Zuerich',
        active: true,
        roles: ['PRACTICE_ADMIN'],
      });
      expect('role' in (membership as object)).toBe(false);
    });

    it('returns an empty roles array for an active membership with no assignment', async () => {
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships[0]?.roles).toEqual([]);
      expect(me.memberships[0]?.permissions).toEqual([]);
    });

    it('keeps an inactive membership visible, keeps its roles, and grants it zero permissions', async () => {
      world.memberships.push({
        id: MEMBERSHIP_B,
        practiceId: PRACTICE_B,
        active: false,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_B,
        practiceId: PRACTICE_B,
        role: 'PRACTICE_ADMIN',
      });

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships).toHaveLength(1);
      expect(me.memberships[0]).toMatchObject({
        active: false,
        practiceName: 'Demo Praxis Nord',
        roles: ['PRACTICE_ADMIN'],
        permissions: [],
      });
    });

    it('scopes roles to their own membership and orders them by the 15 §2.1 vocabulary', async () => {
      world.memberships.push(
        { id: MEMBERSHIP_A, practiceId: PRACTICE_A, active: true, userId: USER },
        { id: MEMBERSHIP_B, practiceId: PRACTICE_B, active: true, userId: USER },
      );
      world.membershipRoles.push(
        { membershipId: MEMBERSHIP_A, practiceId: PRACTICE_A, role: 'PHYSICIAN' },
        { membershipId: MEMBERSHIP_A, practiceId: PRACTICE_A, role: 'PRACTICE_ADMIN' },
        { membershipId: MEMBERSHIP_B, practiceId: PRACTICE_B, role: 'READ_ONLY' },
      );

      const me = await service.loadCurrentIdentity(SUBJECT);

      // Canonical order, not insertion order: PRACTICE_ADMIN precedes PHYSICIAN.
      expect(me.memberships[0]?.roles).toEqual(['PRACTICE_ADMIN', 'PHYSICIAN']);
      expect(me.memberships[1]?.roles).toEqual(['READ_ONLY']);
    });

    it('collapses a duplicated role assignment into a single value', async () => {
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push(
        { membershipId: MEMBERSHIP_A, practiceId: PRACTICE_A, role: 'AUDITOR' },
        { membershipId: MEMBERSHIP_A, practiceId: PRACTICE_A, role: 'AUDITOR' },
      );

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships[0]?.roles).toEqual(['AUDITOR']);
    });

    it('refuses a value that is not one of the six tenant roles', async () => {
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        role: 'SYSTEM_ADMIN',
      });

      await expect(service.loadCurrentIdentity(SUBJECT)).rejects.toBeInstanceOf(
        IdentityInvariantError,
      );
    });

    it('orders memberships deterministically across repeated calls', async () => {
      world.memberships.push(
        { id: MEMBERSHIP_B, practiceId: PRACTICE_B, active: true, userId: USER },
        { id: MEMBERSHIP_A, practiceId: PRACTICE_A, active: true, userId: USER },
      );

      const first = await service.loadCurrentIdentity(SUBJECT);
      const second = await service.loadCurrentIdentity(SUBJECT);

      expect(first.memberships.map((membership) => membership.practiceId)).toEqual([
        PRACTICE_A,
        PRACTICE_B,
      ]);
      expect(second.memberships).toEqual(first.memberships);
    });

    it('fails closed when a membership resolves no visible practice row (02 §17.6)', async () => {
      world.practices.length = 0;
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });

      await expect(service.loadCurrentIdentity(SUBJECT)).rejects.toBeInstanceOf(
        IdentityInvariantError,
      );
    });
  });

  describe('tenant permission derivation', () => {
    beforeEach(() => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push(
        { id: PRACTICE_A, name: 'Demo Praxis Zuerich' },
        { id: PRACTICE_B, name: 'Demo Praxis Nord' },
      );
    });

    it('derives permissions from the accepted matrix for an active membership', async () => {
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        role: 'PRACTICE_ADMIN',
      });
      world.settings.push(settingsRow(PRACTICE_A, false, false));

      const me = await service.loadCurrentIdentity(SUBJECT);
      const permissions = me.memberships[0]?.permissions ?? [];

      expect(permissions).toContain('practice.read');
      expect(permissions).toContain('practice.settings.manage');
      // 15 §5 — PRACTICE_ADMIN is DENY for the whole medical path.
      expect(permissions).not.toContain('encounter.read');
      expect(new Set(permissions).size).toBe(permissions.length);
    });

    it('wires each membership to the conditional settings of its own practice', async () => {
      world.memberships.push(
        { id: MEMBERSHIP_A, practiceId: PRACTICE_A, active: true, userId: USER },
        { id: MEMBERSHIP_B, practiceId: PRACTICE_B, active: true, userId: USER },
      );
      world.membershipRoles.push(
        { membershipId: MEMBERSHIP_A, practiceId: PRACTICE_A, role: 'MPA' },
        { membershipId: MEMBERSHIP_B, practiceId: PRACTICE_B, role: 'MPA' },
      );
      // Only practice A opts in.
      world.settings.push(
        settingsRow(PRACTICE_A, true, false),
        settingsRow(PRACTICE_B, false, false),
      );

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships[0]?.permissions).toContain('analysis.approve');
      expect(me.memberships[1]?.permissions).not.toContain('analysis.approve');
    });

    it('never lets another practice settings row influence a membership', async () => {
      world.memberships.push({
        id: MEMBERSHIP_B,
        practiceId: PRACTICE_B,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_B,
        practiceId: PRACTICE_B,
        role: 'BILLING_SPECIALIST',
      });
      // The flag is enabled for an unrelated practice only.
      world.settings.push(
        settingsRow(PRACTICE_A, true, true),
        settingsRow(PRACTICE_B, false, false),
      );

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships[0]?.permissions).not.toContain('analysis.approve');
    });

    it('scopes the settings query to the practices of the caller memberships only (D-049 clause 3)', async () => {
      world.memberships.push({
        id: MEMBERSHIP_B,
        practiceId: PRACTICE_B,
        active: true,
        userId: USER,
      });
      world.settings.push(
        settingsRow(PRACTICE_A, true, true),
        settingsRow(PRACTICE_B, false, false),
      );

      await service.loadCurrentIdentity(SUBJECT);

      expect(database.calls).toContain(`select practice_settings(${PRACTICE_B})`);
      expect(database.calls).not.toContain('select practice_settings()');
    });

    it('fails closed when a practice has no settings row at all', async () => {
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        role: 'MPA',
      });

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships[0]?.permissions).not.toContain('analysis.approve');
    });

    it('does not union roles across memberships', async () => {
      world.memberships.push(
        { id: MEMBERSHIP_A, practiceId: PRACTICE_A, active: true, userId: USER },
        { id: MEMBERSHIP_B, practiceId: PRACTICE_B, active: true, userId: USER },
      );
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        role: 'PRACTICE_ADMIN',
      });
      world.settings.push(
        settingsRow(PRACTICE_A, false, false),
        settingsRow(PRACTICE_B, false, false),
      );

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships[0]?.permissions).toContain('practice.read');
      expect(me.memberships[1]?.permissions).toEqual([]);
    });
  });

  describe('platform roles', () => {
    beforeEach(() => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push({ id: PRACTICE_A, name: 'Demo Praxis Zuerich' });
      world.settings.push(settingsRow(PRACTICE_A, true, true));
    });

    it('returns SYSTEM_ADMIN as a separate block whose permissions are exactly tariff.manage', async () => {
      world.platformRoles.push({ platformRole: 'SYSTEM_ADMIN', userId: USER });

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.platformRoles).toEqual([{ role: 'SYSTEM_ADMIN', permissions: ['tariff.manage'] }]);
    });

    it('scopes the platform role read to the resolved user', async () => {
      world.platformRoles.push({ platformRole: 'SYSTEM_ADMIN', userId: OTHER_USER });

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(database.calls).toContain(`select platform_roles(${USER})`);
      expect(me.platformRoles).toEqual([]);
    });

    it('never synthesises a membership from a platform role and never adds tenant permissions', async () => {
      world.platformRoles.push({ platformRole: 'SYSTEM_ADMIN', userId: USER });
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.membershipRoles.push({
        membershipId: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        role: 'READ_ONLY',
      });

      const me = await service.loadCurrentIdentity(SUBJECT);

      expect(me.memberships).toHaveLength(1);
      // READ_ONLY holds zero ALLOW cells in 15 §5, and the platform role adds nothing.
      expect(me.memberships[0]?.permissions).toEqual([]);
      expect(me.memberships[0]?.roles).toEqual(['READ_ONLY']);
      expect(
        me.memberships.some((membership) =>
          (membership.roles as readonly string[]).includes('SYSTEM_ADMIN'),
        ),
      ).toBe(false);
      expect(me.platformRoles[0]?.permissions).toEqual(['tariff.manage']);
    });

    it('collapses duplicate assignments and refuses an unknown platform role', async () => {
      world.platformRoles.push(
        { platformRole: 'SYSTEM_ADMIN', userId: USER },
        { platformRole: 'SYSTEM_ADMIN', userId: USER },
      );

      const me = await service.loadCurrentIdentity(SUBJECT);
      expect(me.platformRoles).toHaveLength(1);

      world.platformRoles.push({ platformRole: 'PRACTICE_ADMIN', userId: USER });
      await expect(service.loadCurrentIdentity(SUBJECT)).rejects.toBeInstanceOf(
        IdentityInvariantError,
      );
    });
  });

  describe('response surface', () => {
    it('exposes no auth subject, no status and no internal assignment column', async () => {
      world.bootstrapUsers.push(activeUser());
      world.practices.push({ id: PRACTICE_A, name: 'Demo Praxis Zuerich' });
      world.settings.push(settingsRow(PRACTICE_A, true, true));
      world.memberships.push({
        id: MEMBERSHIP_A,
        practiceId: PRACTICE_A,
        active: true,
        userId: USER,
      });
      world.platformRoles.push({ platformRole: 'SYSTEM_ADMIN', userId: USER });

      const me: MeResponseDto = await service.loadCurrentIdentity(SUBJECT);
      const serialised = JSON.stringify(me);

      expect(Object.keys(me).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'memberships',
        'platformRoles',
        'preferredLanguage',
      ]);
      for (const forbidden of [
        'authSubject',
        'auth_subject',
        'status',
        'grantedBy',
        'revokedBy',
        'revokedAt',
        'allowMpaApproval',
        'allowBillingSpecialistApproval',
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
      expect(Object.keys(me.platformRoles[0] ?? {}).sort()).toEqual(['permissions', 'role']);
    });
  });
});

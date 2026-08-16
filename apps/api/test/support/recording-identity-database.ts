/**
 * The recording {@link IdentityDatabase} shared by the phase 3 application unit specs.
 *
 * WHY A RECORDER AND NOT A MOCK
 *
 * The property the accepted decisions fix is not "the endpoint answers 403" but WHERE in the
 * chain it answers it (`03` §3.1, §3.7.1, D-047 clauses 2–4, 9 and 10). A loose mock proves
 * nothing about order. This double therefore stores rows, applies the same scoping the real SQL
 * applies, and appends every call — including `BEGIN`, `COMMIT` and `ROLLBACK` — to one ordered
 * log, so a spec can assert the sequence itself.
 *
 * ONE HARNESS, NOT TWO. `GET /me` and `GET /practices/{practiceId}` share the same bootstrap
 * chain and therefore share this recorder. A second, parallel fake database stack would be free
 * to drift from this one and from the real adapter, which is exactly the failure mode these
 * specs exist to prevent.
 *
 * Real PostgreSQL semantics — RLS policies, transaction-local GUCs, column grants, request to
 * request isolation — are proven separately against a real database in
 * `test/phase3-identity-*.security.ts` and `test/phase3-practice-read.security.ts`. This module
 * is the ordering and projection harness and is not a substitute for those.
 */

import {
  type BootstrapUserRow,
  type ConditionalSettingsRow,
  type IdentityBootstrapSession,
  type IdentityDatabase,
  type MembershipRoleRow,
  type MembershipRow,
  type PlatformRoleRow,
  type PracticeRow,
  type RequestedPracticeRow,
} from '../../src/identity/infrastructure/identity-database.port.js';

/** A membership row plus the owning user, which the real query filters on. */
export interface OwnedMembership extends MembershipRow {
  readonly userId: string;
}

/** A platform assignment plus the owning user, which the real query filters on. */
export interface OwnedPlatformRole extends PlatformRoleRow {
  readonly userId: string;
}

export interface World {
  /** Rows the bootstrap policy of `02` §17.5 would expose for the verified subject. */
  bootstrapUsers: BootstrapUserRow[];
  memberships: OwnedMembership[];
  /**
   * Practices, held in their FULL granted shape.
   *
   * There is one `practices` table, so there is one row type here. `findPractices` projects it
   * down to what `GET /me` renders and `findRequestedPractice` returns all six granted columns,
   * exactly as the two real statements do.
   */
  practices: RequestedPracticeRow[];
  membershipRoles: MembershipRoleRow[];
  settings: ConditionalSettingsRow[];
  platformRoles: OwnedPlatformRole[];
}

/** An `ACTIVE` practice with the accepted development defaults of `02` §23.2. */
export function practiceRow(
  id: string,
  name: string,
  overrides: Partial<RequestedPracticeRow> = {},
): RequestedPracticeRow {
  return {
    id,
    code: `code-${id.slice(-4)}`,
    name,
    defaultLanguage: 'de-CH',
    timezone: 'Europe/Zurich',
    status: 'ACTIVE',
    ...overrides,
  };
}

export function emptyWorld(): World {
  return {
    bootstrapUsers: [],
    memberships: [],
    practices: [],
    membershipRoles: [],
    settings: [],
    platformRoles: [],
  };
}

/**
 * Records every session call and the arguments that matter, so a spec can assert the sequence.
 *
 * It also enforces one rule of its own: a session method called after the transaction callback
 * returned throws. That turns "the code kept a client and used it later" into a failure.
 */
export class RecordingDatabase implements IdentityDatabase {
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
      findMembershipInPractice: async (
        userId: string,
        practiceId: string,
      ): Promise<MembershipRow | undefined> => {
        calls.push(`select membership(${userId},${practiceId})`);
        // Both predicates, exactly as the real statement applies them.
        return Promise.resolve(
          world.memberships.find((row) => row.userId === userId && row.practiceId === practiceId),
        );
      },
      findPractices: async (practiceIds: readonly string[]): Promise<readonly PracticeRow[]> => {
        calls.push(`select practices(${[...practiceIds].sort().join(',')})`);
        return Promise.resolve(
          world.practices
            .filter((row) => practiceIds.includes(row.id))
            // `GET /me` renders `practiceName` only, so the real query selects two columns.
            .map((row): PracticeRow => ({ id: row.id, name: row.name })),
        );
      },
      findRequestedPractice: async (
        practiceId: string,
      ): Promise<RequestedPracticeRow | undefined> => {
        calls.push(`select practice(${practiceId})`);
        return Promise.resolve(world.practices.find((row) => row.id === practiceId));
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

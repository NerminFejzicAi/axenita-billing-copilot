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
 * IT MODELS THE TWO GUCS THE POLICIES READ. `app.user_id` and `app.practice_id` are held as
 * session state and the reads apply the same predicates the accepted policies apply — most
 * importantly the RESTRICTIVE narrowing of `practices` (`02` §17.6) and the tenant predicate on
 * `practice_settings` (§17.1, package `013`). Without that, a unit spec could not observe the
 * D-053 ordering requirement at all: a `practiceName` read after the first `set_request_context`
 * would look perfectly fine here while losing every other membership's name against a real
 * database. `set_request_context` reproduces the clear-before-validate order and the
 * ACTIVE-membership requirement of `02` §16.2.3 for the same reason.
 *
 * Real PostgreSQL semantics — RLS policies, transaction-local GUCs, column grants, request to
 * request isolation — are proven separately against a real database in
 * `test/phase3-identity-*.security.ts` and `test/phase3-practice-read.security.ts`. This module
 * is the ordering and projection harness and is not a substitute for those.
 */

import {
  TenantContextRejectedError,
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
  /**
   * Practices whose `set_request_context` refuses even though the membership rows say it
   * should succeed — the RACE of D-033 clause 11.
   *
   * It exists because that race is the one path to a real `42501` that an application cannot
   * reach by choosing its inputs: every deterministic cause is already refused, earlier and by
   * name, at the application layer. A concurrent transaction deactivating the membership
   * between the application check and the function call is not reproducible from a spec, so it
   * is injected here instead — at exactly the point where the database would refuse, in
   * exactly the shape it refuses with.
   */
  contextRaces: string[];
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
    contextRaces: [],
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

    // The two transaction-local GUCs the policies read. Modelling them is what lets a unit spec
    // observe the SAME narrowing the database performs — most importantly that `practices` goes
    // down to one row once `app.practice_id` exists (§17.6 RESTRICTIVE) and that
    // `practice_settings` is unreadable until it does (§17.1).
    let appUserId: string | undefined;
    let appPracticeId: string | undefined;

    /** `practices_context_narrow` (§17.6), RESTRICTIVE: no context, or exactly this practice. */
    const narrowed = (id: string): boolean => appPracticeId === undefined || id === appPracticeId;

    return {
      setAuthSubjectContext: async (authSubject: string): Promise<void> => {
        calls.push(`set_auth_subject_context(${authSubject})`);
        // 02 §16.2.4 — the function clears both downstream contexts.
        appUserId = undefined;
        appPracticeId = undefined;
        return Promise.resolve();
      },
      findUsersForVerifiedSubject: async (): Promise<readonly BootstrapUserRow[]> => {
        calls.push('select users');
        return Promise.resolve(world.bootstrapUsers);
      },
      setUserContext: async (userId: string): Promise<void> => {
        calls.push(`set_user_context(${userId})`);
        appUserId = userId;
        return Promise.resolve();
      },
      setRequestContext: async (practiceId: string): Promise<void> => {
        calls.push(`set_request_context(${practiceId})`);

        // CLEAR BEFORE VALIDATE, exactly as 02 §16.2.3 orders it (D-033 clause 10). A rejected
        // target must not leave the previous practice active, and modelling that here is what
        // makes "the application relies on the function to switch cleanly" testable.
        appPracticeId = undefined;

        if (appUserId === undefined) {
          throw new TenantContextRejectedError();
        }

        // The injected race, checked exactly where the function's own membership validation
        // sits: the GUC has already been cleared, and no context is established.
        if (world.contextRaces.includes(practiceId)) {
          throw new TenantContextRejectedError();
        }

        const eligible = world.memberships.some(
          (row) => row.practiceId === practiceId && row.userId === appUserId && row.active === true,
        );

        if (!eligible) {
          // The function raises 42501 for a foreign practice AND for an inactive membership
          // (D-033 clause 11). A spec can therefore assert that `/me` never calls it for one.
          //
          // The REAL adapter translates that SQLSTATE into `TenantContextRejectedError` and
          // never lets a driver error escape, so this double raises the same type. Raising a
          // bare `Error` here would let a spec pass while the production mapping was missing.
          throw new TenantContextRejectedError();
        }

        appPracticeId = practiceId;
        return Promise.resolve();
      },
      findMemberships: async (userId: string): Promise<readonly MembershipRow[]> => {
        calls.push(`select memberships(${userId})`);
        return Promise.resolve(world.memberships.filter((row) => row.userId === userId));
      },
      findCurrentUserMembershipInPractice: async (
        practiceId: string,
      ): Promise<MembershipRow | undefined> => {
        // The recorded user is the one the statement DERIVES, never one it was handed: the real
        // predicate is `user_id = nullif(current_setting('app.user_id', true), '')::uuid`, so the
        // modelled GUC is the only identity available here too (D-054 clause 12). Recording it
        // is what lets a spec assert that the membership was resolved against the authenticated
        // identity and not against some other value the caller supplied.
        calls.push(`select current_membership(${appUserId ?? 'null'},${practiceId})`);

        // No context, no identity, no rows — `user_id = NULL` is NULL, exactly as in the
        // database. Fail closed.
        if (appUserId === undefined) {
          return Promise.resolve(undefined);
        }

        // Both predicates, exactly as the real statement applies them.
        return Promise.resolve(
          world.memberships.find(
            (row) => row.userId === appUserId && row.practiceId === practiceId,
          ),
        );
      },
      findPractices: async (practiceIds: readonly string[]): Promise<readonly PracticeRow[]> => {
        calls.push(`select practices(${[...practiceIds].sort().join(',')})`);
        return Promise.resolve(
          world.practices
            .filter((row) => practiceIds.includes(row.id) && narrowed(row.id))
            // `GET /me` renders `practiceName` only, so the real query selects two columns.
            .map((row): PracticeRow => ({ id: row.id, name: row.name })),
        );
      },
      findRequestedPractice: async (
        practiceId: string,
      ): Promise<RequestedPracticeRow | undefined> => {
        calls.push(`select practice(${practiceId})`);
        return Promise.resolve(
          world.practices.find((row) => row.id === practiceId && narrowed(row.id)),
        );
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
        // `practice_settings_select` (§17.1, package `013`): the tenant predicate is the PRIMARY
        // control. Without `app.practice_id` it is `practice_id = NULL` and no row is visible at
        // all; with it, only that one practice's row is. The requested-id filter is applied on
        // top, as the second barrier the real statement also keeps.
        return Promise.resolve(
          world.settings.filter(
            (row) =>
              appPracticeId !== undefined &&
              row.practiceId === appPracticeId &&
              practiceIds.includes(row.practiceId),
          ),
        );
      },
      findCurrentPlatformRoles: async (userId: string): Promise<readonly PlatformRoleRow[]> => {
        calls.push(`select platform_roles(${userId})`);
        return Promise.resolve(world.platformRoles.filter((row) => row.userId === userId));
      },
    };
  }
}

/**
 * Authenticated bootstrap and the `GET /me` projection.
 *
 * Normative sources: `03` §3.1 (bootstrap order and rejections), `03` §10 (the response
 * contract), `03` §28.5 (permission derivation), `04` §5.4.1, D-023, D-038, D-047, D-049 and
 * D-051.
 *
 * ONE BOOTSTRAP, SEVERAL ROUTES. `03` §3.1 and §3.7.1 steps 1–2 prescribe the SAME opening
 * chain for every authenticated request, neutral or tenant scoped. It is therefore implemented
 * exactly once, in {@link IdentityBootstrapService.runAuthenticatedSession}, and every route
 * that needs an admitted current user enters through it — `GET /me` below, and
 * `GET /practices/{practiceId}` through `PracticeReadService`. Nothing else may call
 * `set_auth_subject_context`, read `users` for admission, judge `users.status` or call
 * `set_user_context`; a second implementation of that chain is the one thing that could make
 * two routes disagree about who the caller is.
 *
 * THE ORDER IS THE CONTRACT. `03` §3.1 and D-047 clauses 2–4 and 9 do not merely require the
 * right HTTP status for a rejected request; they require the rejection to happen at a specific
 * POINT of the chain, so that `app.user_id` is never established for an unknown subject or a
 * non-`ACTIVE` user and no membership is ever enumerated for them. That is why this service
 * drives the session step by step instead of asking the database layer for a finished
 * aggregate: the sequence is the thing under test.
 *
 *     BEGIN                                     (one interactive transaction, D-047 clause 8)
 *       set_auth_subject_context(subject)
 *       read users through the bootstrap policy  (no WHERE on auth_subject)
 *       0 rows            -> 403 ACCESS_DENIED, ROLLBACK
 *       more than 1 row   -> internal invariant violation, ROLLBACK
 *       status <> ACTIVE  -> 403 ACCESS_DENIED, ROLLBACK      <-- still before the next line
 *       set_user_context(users.id)
 *       memberships, practices, membership roles, platform roles   <-- ALL neutral reads first
 *       per ACTIVE membership: set_request_context(its own practice), read that practice's
 *                              conditional settings under strict tenant RLS
 *       derive permissions per membership (phase 3C resolver)
 *     COMMIT
 *
 * WHY THE NEUTRAL READS ALL COME FIRST (D-053 clause D.10)
 *
 * `practices_context_narrow` (`02` §17.6) is RESTRICTIVE, and restrictive policies combine with
 * AND. The moment `app.practice_id` exists, `practices` narrows to exactly one row — so a
 * `practiceName` read after the first `set_request_context` would survive for one membership and
 * vanish for every other. Every read whose result must span ALL memberships therefore completes
 * BEFORE the first tenant context is established. This ordering is a correctness requirement of
 * the frozen `GET /me` document, not an optimisation.
 *
 * WHY `/me` ESTABLISHES TENANT CONTEXT AT ALL (D-053)
 *
 * `/me` remains tenant-NEUTRAL as a route: it requires no `X-Practice-ID`, reads none, and no
 * client-supplied practice id participates in it (`03` §3.4, D-053 clause D.6). But package
 * `013_rls_policies` put `practice_settings` behind the §17.1 tenant policy, and `CONDITIONAL`
 * cells of the `15` matrix cannot be derived from a table that returns zero rows. The remedy is
 * this application-path adaptation and NOT a weakened policy: the context is established
 * INTERNALLY, once per active membership, from the practice id of that membership's own
 * already-resolved row, through the accepted `set_request_context` function alone. Each practice
 * is read under its own strict tenant scope, so Practice A's settings cannot reach Practice B's
 * membership and no cross-practice union is expressible.
 *
 * This service composes; it does not decide grants. Every tenant permission comes from
 * {@link resolveEffectivePermissions}, which is the single application representation of the
 * accepted matrix in `15` (`04` §6.4.1). No grant is restated here.
 */

import { Inject, Injectable } from '@nestjs/common';

import {
  TENANT_MEMBERSHIP_ROLES,
  isPlatformRole,
  isTenantMembershipRole,
  type MeMembershipDto,
  type MePlatformRoleDto,
  type MeResponseDto,
  type PlatformRole,
  type TenantMembershipRole,
} from '@axenita/contracts';

import {
  resolveEffectivePermissions,
  type ConditionalPermissionSettings,
} from '../domain/effective-permissions.js';
import {
  comparePlatformRoles,
  resolvePlatformPermissions,
} from '../domain/platform-permissions.js';
import { IdentityInvariantError, accessDenied } from '../identity.errors.js';
import {
  IDENTITY_DATABASE,
  type BootstrapUserRow,
  type IdentityBootstrapSession,
  type IdentityDatabase,
  type MembershipRow,
} from '../infrastructure/identity-database.port.js';

/**
 * The only `entity_status` value that admits a user (`02` §4.2, D-047 clause 4).
 *
 * Written as a literal rather than imported from the generated Prisma enum, so the persistence
 * layer's generated types stay out of the application and HTTP boundary (`12` §5, AGENTS.md §9).
 */
const ACTIVE_USER_STATUS = 'ACTIVE';

/**
 * Conditional flags of a practice that has no settings row at all.
 *
 * Fail closed: a missing configuration never enables a `CONDITIONAL` grant (D-041).
 *
 * Exported so that every route deriving permissions uses the SAME fallback. A second literal
 * elsewhere could drift into an enabling default, which is precisely the failure D-041 forbids.
 */
export const DISABLED_CONDITIONAL_SETTINGS: ConditionalPermissionSettings = Object.freeze({
  allowMpaApproval: false,
  allowBillingSpecialistApproval: false,
});

@Injectable()
export class IdentityBootstrapService {
  public constructor(@Inject(IDENTITY_DATABASE) private readonly database: IdentityDatabase) {}

  /**
   * Resolves the verified subject and builds the `GET /me` document.
   *
   * @param verifiedAuthSubject the subject of an already verified bearer credential. It must
   *   never originate from a request body, a query parameter or an untrusted header
   *   (`02` §16.2a, D-047 clause 20).
   */
  public async loadCurrentIdentity(verifiedAuthSubject: string): Promise<MeResponseDto> {
    return this.runAuthenticatedSession(verifiedAuthSubject, async (session, user) =>
      this.projectIdentity(session, user),
    );
  }

  /**
   * Opens the one interactive transaction, admits the caller, establishes the user context, and
   * hands both to `work` — steps 1 to 2 of `03` §3.7.1 and clauses 2–4, 8 and 9 of D-047.
   *
   * This is the ONLY entry point into an authenticated database session. `work` receives the
   * same pinned session, inside the same transaction, with `app.user_id` already established;
   * it cannot reach the database any other way and it cannot run before admission succeeded.
   * Anything `work` throws propagates, which rolls the transaction back and discards every
   * transaction-local `app.*` setting with it.
   *
   * @param verifiedAuthSubject the subject of an already verified bearer credential. It must
   *   never originate from a request body, a query parameter or an untrusted header
   *   (`02` §16.2a, D-047 clause 20).
   */
  public async runAuthenticatedSession<T>(
    verifiedAuthSubject: string,
    work: (session: IdentityBootstrapSession, user: BootstrapUserRow) => Promise<T>,
  ): Promise<T> {
    return this.database.runBootstrapTransaction(async (session) => {
      const user = await this.admitUser(session, verifiedAuthSubject);

      // Only now does an internal user context exist. Everything below depends on it: the
      // §17.4 and §17.2 policies return zero rows without `app.user_id`, and the §17.6
      // membership policy on `practices` does too.
      await session.setUserContext(user.id);

      return work(session, user);
    });
  }

  /**
   * Steps 2 to 4 of `03` §3.1 — resolve the subject and decide admission.
   *
   * Returns only when an `ACTIVE` user was resolved. Every other outcome throws, which rolls the
   * transaction back and discards `app.auth_subject` with it. `set_user_context` is deliberately
   * NOT called here: the caller invokes it after this method returns, so that no admission
   * failure can possibly precede it.
   */
  private async admitUser(
    session: IdentityBootstrapSession,
    verifiedAuthSubject: string,
  ): Promise<BootstrapUserRow> {
    await session.setAuthSubjectContext(verifiedAuthSubject);

    const candidates = await session.findUsersForVerifiedSubject();

    if (candidates.length > 1) {
      // `users_auth_subject_key` makes this impossible. If it happens, the schema guarantee is
      // broken and choosing a row would mean choosing an identity for the caller — so this is a
      // hard internal failure, never a "pick the first" fallback.
      throw new IdentityInvariantError(
        'The identity bootstrap resolved more than one user for a single verified subject, ' +
          'which users_auth_subject_key must prevent (02 §6.2).',
      );
    }

    const user = candidates[0];

    // An unknown subject and a non-ACTIVE user produce the SAME response on purpose (03 §3.1).
    // No user is created, no other user is substituted, and no empty identity is returned.
    if (user === undefined || user.status !== ACTIVE_USER_STATUS) {
      throw accessDenied();
    }

    return user;
  }

  /** Steps 5 onward — every read here runs with `app.user_id` established. */
  private async projectIdentity(
    session: IdentityBootstrapSession,
    user: BootstrapUserRow,
  ): Promise<MeResponseDto> {
    const memberships = await session.findMemberships(user.id);
    const practiceIds = memberships.map((membership) => membership.practiceId);
    const membershipIds = memberships.map((membership) => membership.id);

    // THE NEUTRAL BLOCK. Every one of these must see ALL memberships of the caller, so all four
    // complete before the first `app.practice_id` exists — see the RESTRICTIVE narrowing note in
    // the file header (D-053 clause D.10).
    const practices = await session.findPractices(practiceIds);
    const roleRows = await session.findMembershipRoles(membershipIds);
    const platformRoleRows = await session.findCurrentPlatformRoles(user.id);

    // THE TENANT BLOCK. Strictly after the neutral one, and never the other way round.
    const settingsByPractice = await readConditionalSettingsPerActiveMembership(
      session,
      memberships,
    );

    const practiceNames = new Map(practices.map((practice) => [practice.id, practice.name]));

    const projected = memberships.map((membership): MeMembershipDto => {
      const practiceName = practiceNames.get(membership.practiceId);

      if (practiceName === undefined) {
        // The §17.6 membership policy guarantees that the practice of one's own membership is
        // visible, with or without `pm.active`. A missing name means the policy, the grant or
        // the data changed underneath, and emitting a partial membership would be worse than
        // failing.
        throw new IdentityInvariantError(
          'A membership of the authenticated user resolved no visible practice row, which the ' +
            '02 §17.6 membership policy must prevent.',
        );
      }

      const roles = tenantRolesOf(membership.id, roleRows);

      return {
        membershipId: membership.id,
        practiceId: membership.practiceId,
        practiceName,
        active: membership.active,
        roles,
        // One derivation per membership, with that membership's own roles and that practice's
        // own settings. There is no cross-membership union and no cross-practice settings
        // leakage: an inactive membership yields `[]` regardless of roles or flags (`15` §3.2).
        permissions: resolveEffectivePermissions({
          active: membership.active,
          roles,
          settings: settingsByPractice.get(membership.practiceId) ?? DISABLED_CONDITIONAL_SETTINGS,
        }),
      };
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      preferredLanguage: user.preferredLanguage,
      // A separate top-level block, never merged into `memberships` and never unioned with
      // tenant permissions (D-023 clause 10, D-038 clauses 12-14).
      platformRoles: projectPlatformRoles(platformRoleRows),
      // Deterministic and independent of the driver: one user holds at most one membership per
      // practice (`unique (practice_id, user_id)`), so practice id is a total order.
      memberships: [...projected].sort((left, right) =>
        left.practiceId.localeCompare(right.practiceId),
      ),
    };
  }
}

/**
 * The conditional flags of every ACTIVE membership's own practice, each read under its own
 * strict tenant scope (D-053 clauses D.2 to D.8).
 *
 * ONE PRACTICE AT A TIME, AND ONLY ONE'S OWN. The loop establishes tenant context for exactly
 * the practice of the membership it is about to read, from that membership's ALREADY-RESOLVED
 * row, and then reads that practice's settings. Under the §17.1 tenant policy the read cannot
 * return anything else, so the returned map cannot associate Practice A's flags with Practice B
 * even if the code below it were wrong. There is no aggregate read and no union: a settings row
 * enters the map under its own practice id or not at all.
 *
 * MOVING BETWEEN PRACTICES needs no clearing step of its own. `set_request_context` clears
 * `app.practice_id` as its FIRST statement and re-establishes it only after re-validating the
 * next target's ACTIVE membership (D-033 clauses 10 and 12), so contexts can neither accumulate
 * nor mix. No new database function, no savepoint discipline and no direct GUC write is
 * introduced to achieve this.
 *
 * AN INACTIVE MEMBERSHIP IS SKIPPED ENTIRELY (D-053 clause D.4): `set_request_context` requires
 * `active = true` and would raise `42501`, and the resolver yields `[]` for it regardless
 * (`15` §3.2), so there is nothing to read and nothing a read could change.
 *
 * A practice absent from the result has no settings row that the caller can read, and the caller
 * falls back to {@link DISABLED_CONDITIONAL_SETTINGS} — fail closed, as D-041 requires.
 */
async function readConditionalSettingsPerActiveMembership(
  session: IdentityBootstrapSession,
  memberships: readonly MembershipRow[],
): Promise<ReadonlyMap<string, ConditionalPermissionSettings>> {
  const byPractice = new Map<string, ConditionalPermissionSettings>();

  for (const membership of memberships) {
    if (membership.active !== true) {
      continue;
    }

    // `unique (practice_id, user_id)` (02 §6.3) makes a repeat impossible, so this is a guard
    // against a broken invariant rather than a cache — it never merges two rows into one entry.
    if (byPractice.has(membership.practiceId)) {
      continue;
    }

    // The practice id comes from the membership row of `app.user_id` and from nowhere else. No
    // header, query, body or path value can reach this call (D-053 clause D.6).
    await session.setRequestContext(membership.practiceId);

    const rows = await session.findConditionalSettings([membership.practiceId]);
    const settings = rows.find((row) => row.practiceId === membership.practiceId);

    if (settings === undefined) {
      continue;
    }

    byPractice.set(
      membership.practiceId,
      // Strict equality, exactly as the resolver applies it: anything other than a literal
      // `true` fails closed.
      Object.freeze({
        allowMpaApproval: settings.allowMpaApproval === true,
        allowBillingSpecialistApproval: settings.allowBillingSpecialistApproval === true,
      }) satisfies ConditionalPermissionSettings,
    );
  }

  return byPractice;
}

/**
 * The roles of exactly one membership: unique, deterministically ordered, never a platform role.
 *
 * The order is the canonical vocabulary order of `15` §2.1, which is the only ordering the
 * accepted documents define for this enum.
 *
 * Exported so that `GET /practices/{practiceId}` derives the roles of the requested membership
 * through this exact function. Reimplementing it would mean a second place where a stored role
 * value is validated and ordered, and the two could disagree.
 */
export function tenantRolesOf(
  membershipId: string,
  rows: readonly { readonly membershipId: string; readonly role: string }[],
): readonly TenantMembershipRole[] {
  const assigned = new Set<TenantMembershipRole>();

  for (const row of rows) {
    if (row.membershipId !== membershipId) {
      continue;
    }

    // `SYSTEM_ADMIN` and every unknown value fail here. A platform role stored in a tenant role
    // column would be a schema violation (D-038 clause 12), and silently dropping it would hide
    // that; feeding it to the matrix would be worse still.
    if (!isTenantMembershipRole(row.role)) {
      throw new IdentityInvariantError(
        `A membership role assignment carries a value that is not one of the six tenant roles ` +
          `of 15 §2.1.`,
      );
    }

    assigned.add(row.role);
  }

  return Object.freeze(TENANT_MEMBERSHIP_ROLES.filter((role) => assigned.has(role)));
}

/** Current platform assignments, deduplicated and ordered by the `15` §2.2 vocabulary. */
function projectPlatformRoles(
  rows: readonly { readonly platformRole: string }[],
): readonly MePlatformRoleDto[] {
  const held = new Set<PlatformRole>();

  for (const row of rows) {
    if (!isPlatformRole(row.platformRole)) {
      throw new IdentityInvariantError(
        'A platform role assignment carries a value that is not an accepted platform role of ' +
          '15 §2.2.',
      );
    }

    held.add(row.platformRole);
  }

  return Object.freeze(
    [...held].sort(comparePlatformRoles).map((role): MePlatformRoleDto => ({
      role,
      // The platform mapping is separate from the tenant matrix by construction: this call
      // cannot reach `TENANT_PERMISSION_MATRIX` and cannot contribute to any membership.
      permissions: resolvePlatformPermissions(role),
    })),
  );
}

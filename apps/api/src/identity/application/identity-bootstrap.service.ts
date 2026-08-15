/**
 * Authenticated bootstrap and the `GET /me` projection.
 *
 * Normative sources: `03` §3.1 (bootstrap order and rejections), `03` §10 (the response
 * contract), `03` §28.5 (permission derivation), `04` §5.4.1, D-023, D-038, D-047, D-049 and
 * D-051.
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
 *       memberships, practices, membership roles, conditional settings, platform roles
 *       derive permissions per membership (phase 3C resolver)
 *     COMMIT
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
 */
const DISABLED_CONDITIONAL_SETTINGS: ConditionalPermissionSettings = Object.freeze({
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
    return this.database.runBootstrapTransaction(async (session) => {
      const user = await this.admitUser(session, verifiedAuthSubject);

      // Only now does an internal user context exist. Everything below depends on it: the
      // §17.4 and §17.2 policies return zero rows without `app.user_id`, and the §17.6
      // membership policy on `practices` does too.
      await session.setUserContext(user.id);

      return this.projectIdentity(session, user);
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

    const practices = await session.findPractices(practiceIds);
    const roleRows = await session.findMembershipRoles(membershipIds);
    const settingsRows = await session.findConditionalSettings(practiceIds);
    const platformRoleRows = await session.findCurrentPlatformRoles(user.id);

    const practiceNames = new Map(practices.map((practice) => [practice.id, practice.name]));
    const settingsByPractice = new Map(
      settingsRows.map((row) => [
        row.practiceId,
        Object.freeze({
          allowMpaApproval: row.allowMpaApproval === true,
          allowBillingSpecialistApproval: row.allowBillingSpecialistApproval === true,
        }) satisfies ConditionalPermissionSettings,
      ]),
    );

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
 * The roles of exactly one membership: unique, deterministically ordered, never a platform role.
 *
 * The order is the canonical vocabulary order of `15` §2.1, which is the only ordering the
 * accepted documents define for this enum.
 */
function tenantRolesOf(
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

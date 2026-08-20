/**
 * Effective-permission resolver.
 *
 * Normative sources: D-038 clauses 7–11 and 16–18; `03` §28.5; `04` §6.4.1; `15` §3.2 and §10.
 *
 * The resolver is pure domain logic. It performs no database access, reads no request
 * context, and consumes no ambient state: it receives one membership's already-resolved facts
 * and returns that membership's effective permissions. Loading memberships, roles and
 * practice settings belongs to the identity bootstrap that calls this module.
 *
 * Composition rules implemented here:
 *
 * - the union spans the roles of exactly **one** membership in **one** practice;
 * - `DENY` contributes no grant and is not a negative override over another role's `ALLOW`;
 * - `CONDITIONAL` contributes only when its own practice settings flag is enabled;
 * - an inactive membership yields zero permissions;
 * - an active membership with zero roles yields zero permissions;
 * - duplicate grants from two roles collapse into one permission;
 * - authorisation is deny-by-default;
 * - `platformRoles` are not an input, so they cannot enter the tenant union.
 */

import {
  ACTIVE_PERMISSIONS,
  isActivePermission,
  isTenantMembershipRole,
  type Permission,
  type TenantMembershipRole,
} from '@axenita/contracts';

import {
  PermissionMatrixInvariantError,
  resolveConditionalFlag,
  resolveMatrixCell,
  type ConditionalApprovalFlag,
} from './permission-matrix.js';

/**
 * The already-resolved practice settings that gate conditional grants (`03` §10, D-041).
 *
 * The resolver takes the settings as input rather than reading them, and that separation is what
 * survived the settings routes arriving. Phase 4 added `GET` and then `PATCH
 * /practices/{practiceId}/settings`, and this resolver gained nothing from either: it still
 * receives already-resolved flags, still performs no read, and still knows nothing about
 * `If-Match`, versions or the `UPDATE` that moves them (D-041, D-049, D-055).
 */
export type ConditionalPermissionSettings = Readonly<Record<ConditionalApprovalFlag, boolean>>;

/**
 * One practice membership, reduced to the facts that permission derivation depends on.
 *
 * There is intentionally no `platformRoles` field and no way to supply one: platform roles
 * are a separate class of application role and never contribute tenant permissions (D-038
 * clauses 12–14). `roles` is typed as {@link TenantMembershipRole}, which excludes
 * `SYSTEM_ADMIN` at compile time.
 */
export interface MembershipPermissionInput {
  /** Whether the membership itself is active. An inactive membership grants nothing. */
  readonly active: boolean;
  /** The tenant roles assigned to this exact membership, from `practice_membership_roles`. */
  readonly roles: readonly TenantMembershipRole[];
  /** The conditional settings of the practice this membership belongs to. */
  readonly settings: ConditionalPermissionSettings;
}

function contributes(
  permission: Permission,
  role: TenantMembershipRole,
  settings: ConditionalPermissionSettings,
): boolean {
  const cell = resolveMatrixCell(permission, role);

  switch (cell) {
    case 'ALLOW':
      return true;
    case 'DENY':
      // Contributes nothing. It does not veto an `ALLOW` from another assigned role, because
      // the union below never subtracts.
      return false;
    case 'CONDITIONAL':
      // Strict equality on purpose: anything other than a literal `true` fails closed.
      return settings[resolveConditionalFlag(permission, role)] === true;
  }
}

function assertUsableInput(membership: MembershipPermissionInput): void {
  if (!Array.isArray(membership.roles)) {
    throw new PermissionMatrixInvariantError(
      'Membership roles must be an array of accepted tenant roles.',
    );
  }

  for (const role of membership.roles) {
    // Guards against an unknown enum value, a platform role that slipped through an untyped
    // boundary, and any caller-supplied string. None of them may reach the matrix.
    if (typeof role !== 'string' || !isTenantMembershipRole(role)) {
      throw new PermissionMatrixInvariantError(
        `Membership carries '${String(role)}', which is not one of the six tenant roles of 15 §2.1.`,
      );
    }
  }

  const settings: unknown = membership.settings;

  if (typeof settings !== 'object' || settings === null) {
    throw new PermissionMatrixInvariantError(
      'Conditional permission settings must be supplied as a resolved object.',
    );
  }
}

/**
 * Derives the effective permissions of a single practice membership.
 *
 * The result is ordered by the canonical catalogue of `03` §28.1, so the output order is
 * deterministic and independent of the order in which roles were supplied. Every permission
 * appears at most once, which makes duplicate roles and overlapping grants collapse by
 * construction. Only active permissions can be produced; a reserved identifier is not in the
 * catalogue and therefore can never be returned.
 *
 * @throws PermissionMatrixInvariantError when an unknown role or malformed input is supplied.
 */
export function resolveEffectivePermissions(
  membership: MembershipPermissionInput,
): readonly Permission[] {
  assertUsableInput(membership);

  // `15` §3.2 — an inactive membership contributes zero permissions regardless of its roles
  // and regardless of any enabled practice flag.
  if (!membership.active) {
    return Object.freeze([]);
  }

  const granted: Permission[] = [];

  for (const permission of ACTIVE_PERMISSIONS) {
    const isGranted = membership.roles.some((role) =>
      contributes(permission, role, membership.settings),
    );

    if (isGranted) {
      granted.push(permission);
    }
  }

  return Object.freeze(granted);
}

/**
 * Derives permissions for several memberships, keeping each membership separate.
 *
 * The return value is one permission list **per membership**, positionally aligned with the
 * input. This is the only multi-membership entry point the domain offers, and it deliberately
 * cannot produce a cross-practice union: `GET /me` reports permissions inside each membership
 * object (`03` §10), never as a global tenant set.
 */
export function resolveEffectivePermissionsPerMembership(
  memberships: readonly MembershipPermissionInput[],
): readonly (readonly Permission[])[] {
  return Object.freeze(memberships.map((membership) => resolveEffectivePermissions(membership)));
}

/**
 * Checks a single permission against an already-derived effective set.
 *
 * This is the outward-facing, fail-closed surface: it never throws and never grants. An
 * unknown identifier, a reserved identifier and a permission the membership does not hold all
 * return `false`, so malformed input cannot produce access.
 */
export function hasEffectivePermission(granted: readonly Permission[], candidate: string): boolean {
  if (!isActivePermission(candidate)) {
    return false;
  }

  return granted.includes(candidate);
}

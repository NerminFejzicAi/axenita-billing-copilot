/**
 * The platform-scoped half of the accepted role-permission model.
 *
 * Normative source: `15_ROLE_PERMISSION_MATRIX_V1.md` §5 (the `SYSTEM_ADMIN` column) and §7,
 * D-023 clause 9, `03` §3.3 and §10.
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT A MATRIX COLUMN
 *
 * `permission-matrix.ts` represents tenant composition only, and deliberately excludes the
 * `SYSTEM_ADMIN` column: a platform role never enters the tenant union (D-038 clauses 12–14).
 * `GET /me` nevertheless has to render `platformRoles[].permissions` (`03` §10), so the platform
 * side needs its own, minimal representation. Keeping it here rather than adding a seventh
 * column to `TENANT_PERMISSION_MATRIX` is what makes the separation structural:
 *
 * - `resolveEffectivePermissions` cannot be fed a platform role — its input type excludes it;
 * - `resolvePlatformPermissions` cannot be fed a tenant role — its input type excludes it;
 * - no code path can union the two by accident, because neither function sees the other's input.
 *
 * The mapping is intentionally tiny and closed. `SYSTEM_ADMIN` holds exactly one `ALLOW` cell in
 * the canonical matrix — `tariff.manage` — and every other cell of that column is `DENY`. No
 * further platform permission exists, and inventing one requires a new accepted decision
 * (`15` §8: generic platform administration beyond `tariff.manage` is out of v1).
 */

import { PLATFORM_ROLES, type Permission, type PlatformRole } from '@axenita/contracts';

/**
 * Platform role to platform permissions, in canonical catalogue order.
 *
 * Typed as a total `Record` over {@link PlatformRole}, so a future platform role is a compile
 * error here rather than a silent empty set somewhere downstream.
 */
export const PLATFORM_PERMISSION_MATRIX: Readonly<Record<PlatformRole, readonly Permission[]>> = {
  SYSTEM_ADMIN: Object.freeze<Permission[]>(['tariff.manage']),
};

/**
 * Raised when the platform mapping is asked about something that is not a platform role.
 *
 * A tenant role, an unknown string or a malformed database value must never degrade into an
 * empty permission set that reads like a legitimate "no permissions" answer.
 */
export class PlatformPermissionInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PlatformPermissionInvariantError';
  }
}

/**
 * Returns the platform permissions of one platform role.
 *
 * @throws PlatformPermissionInvariantError when `role` is not an accepted platform role.
 */
export function resolvePlatformPermissions(role: PlatformRole): readonly Permission[] {
  const granted = PLATFORM_PERMISSION_MATRIX[role];

  // The lookup is total by type, but the value arrives from a database column at runtime, so
  // the guard is a real one: an unmapped role fails closed instead of returning `undefined`.
  if (granted === undefined) {
    throw new PlatformPermissionInvariantError(
      `'${String(role)}' is not one of the accepted platform roles of 15 §2.2.`,
    );
  }

  return granted;
}

/**
 * Orders platform roles by the canonical vocabulary of `15` §2.2.
 *
 * `GET /me` requires deterministic output (`03` §10), and the canonical order is the only
 * ordering the documents define for this vocabulary.
 */
export function comparePlatformRoles(left: PlatformRole, right: PlatformRole): number {
  return PLATFORM_ROLES.indexOf(left) - PLATFORM_ROLES.indexOf(right);
}

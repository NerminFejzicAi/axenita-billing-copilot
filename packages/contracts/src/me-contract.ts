/**
 * `GET /api/v1/me` response contract.
 *
 * Normative source: `03_API_CONTRACT_V1.md` §10, reproduced field for field. Supporting
 * decisions: D-023 (platform roles are a separate top-level block), D-038 (`memberships[].roles`
 * replaced the singular `memberships[].role`), D-047 (bootstrap self-enumeration) and D-051
 * (`platformRoles[]` carries current, non-revoked assignments only).
 *
 * `/me` is a NEUTRAL route (`03` §3.4): it is neither tenant nor platform scoped, and
 * `X-Practice-ID` is not applicable to it.
 *
 * What this contract deliberately does NOT contain:
 *
 * - `memberships[].role` — the singular field does not exist and never coexists with `roles`
 *   (`03` §10, D-038). There is no compatibility shape;
 * - `auth_subject`, `lastLoginAt`, `status`, `grantedBy`, `revokedBy`, `grantedAt`, `revokedAt`
 *   or any other database-internal column. Several of them have no runtime column grant at all
 *   (`02` §20.2a);
 * - the conditional `practice_settings` flags. They are an INPUT to permission derivation
 *   (`03` §28.5), not an output: phase 3 registers no settings route whatsoever (D-049).
 */

import { type Permission } from './permission-catalogue.js';
import { type PlatformRole, type TenantMembershipRole } from './membership-roles.js';

/**
 * One practice membership of the authenticated user.
 *
 * Visibility and authorisation are different things here (`03` §10): an inactive membership
 * MAY be listed and keeps its stored `roles`, yet contributes exactly zero effective
 * permissions, so `permissions` is empty for it.
 */
export interface MeMembershipDto {
  readonly membershipId: string;
  readonly practiceId: string;
  readonly practiceName: string;
  readonly active: boolean;
  /**
   * The tenant roles of exactly this membership in exactly this practice.
   *
   * Zero, one or more values; unique; deterministically ordered; never a platform role.
   */
  readonly roles: readonly TenantMembershipRole[];
  /**
   * Effective permissions derived at read time from `roles` and the conditional settings of
   * this membership's practice (`03` §28.5). Never persisted on the membership.
   */
  readonly permissions: readonly Permission[];
}

/**
 * One current platform role assignment of the authenticated user.
 *
 * A platform role is never rendered as a membership and never joins the tenant union
 * (D-023 clause 10, D-038 clauses 12–14).
 */
export interface MePlatformRoleDto {
  readonly role: PlatformRole;
  readonly permissions: readonly Permission[];
}

/** The complete `GET /me` document (`03` §10). */
export interface MeResponseDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLanguage: string;
  /** Empty array for a user without any current platform role assignment. */
  readonly platformRoles: readonly MePlatformRoleDto[];
  readonly memberships: readonly MeMembershipDto[];
}

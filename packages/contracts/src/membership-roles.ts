/**
 * Application role vocabulary of API v1.
 *
 * Normative sources:
 * - `15_ROLE_PERMISSION_MATRIX_V1.md` §2.1 — the six tenant application roles.
 * - `15_ROLE_PERMISSION_MATRIX_V1.md` §2.2 — the single platform application role.
 * - `03_API_CONTRACT_V1.md` §10 — `GET /me` returns `memberships[].roles[]` and a separate
 *   top-level `platformRoles[]` block.
 * - D-038 clauses 12–14 — platform roles are a distinct class of application role and never
 *   join the tenant union.
 *
 * These are **application** roles. They are not the database roles `copilot_app`,
 * `copilot_migrator` and `copilot_system` (`15` §2.3): a database grant never satisfies an
 * endpoint permission, and `SYSTEM_ADMIN` is not `copilot_system`.
 *
 * The values mirror the accepted `membership_role` and `platform_role` enums of `02` §4.1 and
 * §4.16, but this package stays free of any Prisma-generated type. The contract package
 * describes the HTTP surface; the generated client is a persistence implementation detail and
 * the repository keeps the two boundaries apart.
 */

/**
 * The six tenant application roles, in the canonical order of `15` §2.1.
 *
 * A role is only ever meaningful inside exactly one practice membership. Assignments live in
 * `practice_membership_roles` (`02` §6.3a); `practice_memberships` deliberately carries no
 * singular `role` column (D-038 clause 2).
 */
export const TENANT_MEMBERSHIP_ROLES = [
  'PRACTICE_ADMIN',
  'PHYSICIAN',
  'MPA',
  'BILLING_SPECIALIST',
  'AUDITOR',
  'READ_ONLY',
] as const;

/**
 * A tenant application role.
 *
 * This union deliberately excludes `SYSTEM_ADMIN`, so passing a platform role where a tenant
 * role is expected is a compile-time error rather than a silent privilege escalation.
 */
export type TenantMembershipRole = (typeof TENANT_MEMBERSHIP_ROLES)[number];

/**
 * The platform application roles (`15` §2.2).
 *
 * A platform role grants no tenant access whatsoever. `SYSTEM_ADMIN` reaches a practice only
 * by independently holding an active tenant membership with the appropriate tenant role
 * (D-038 clause 13, D-047 clause 11).
 */
export const PLATFORM_ROLES = ['SYSTEM_ADMIN'] as const;

/**
 * A platform application role.
 *
 * Kept as a separate union from {@link TenantMembershipRole} on purpose: the two classes are
 * structurally disjoint, so they cannot be mixed by accident.
 */
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const TENANT_MEMBERSHIP_ROLE_LOOKUP: ReadonlySet<string> = new Set<string>(TENANT_MEMBERSHIP_ROLES);
const PLATFORM_ROLE_LOOKUP: ReadonlySet<string> = new Set<string>(PLATFORM_ROLES);

/**
 * Narrows an untrusted string to a tenant application role.
 *
 * Returns `false` for `SYSTEM_ADMIN` and for anything outside the accepted enum, which keeps
 * an unknown role from reaching the permission matrix at all.
 */
export function isTenantMembershipRole(value: string): value is TenantMembershipRole {
  return TENANT_MEMBERSHIP_ROLE_LOOKUP.has(value);
}

/** Narrows an untrusted string to a platform application role. */
export function isPlatformRole(value: string): value is PlatformRole {
  return PLATFORM_ROLE_LOOKUP.has(value);
}

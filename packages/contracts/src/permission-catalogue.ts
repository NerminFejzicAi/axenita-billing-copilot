/**
 * Application permission catalogue of API v1.
 *
 * Normative sources:
 * - `03_API_CONTRACT_V1.md` §28.1 — the active catalogue holds exactly 32 permissions.
 * - `03_API_CONTRACT_V1.md` §28.2 — exactly 3 reserved identifiers, granted to no role.
 * - `15_ROLE_PERMISSION_MATRIX_V1.md` §4 — reproduces both catalogues unchanged.
 *
 * The catalogue belongs to the shared contract package because `GET /me` returns derived
 * `permissions[]` for every membership (`03` §10), which makes the permission strings part of
 * the HTTP contract rather than an implementation detail. They are centralised here exactly
 * once (12 §4 — no magic strings; AGENTS §9 — never duplicate permission strings).
 *
 * The role-to-permission assignment deliberately does **not** live here. `03` §28.4 keeps the
 * complete matrix in `15` precisely so that two independently editable matrices cannot exist;
 * the application representation of that matrix is the API-side permission domain.
 */

/**
 * Every active permission, in the canonical order of `03` §28.1.
 *
 * The order is normative for this package: the effective-permission resolver emits its result
 * in exactly this sequence so that `permissions[]` has a deterministic order (`04` §6.4.1).
 */
export const ACTIVE_PERMISSIONS = [
  'practice.read',
  'practice.settings.read',
  'practice.settings.manage',

  'patient_reference.read',
  'patient_reference.create',

  'encounter.read',
  'encounter.create',
  'encounter.update',
  'encounter.cancel',
  'encounter.close',

  'encounter.document.list',
  'encounter.document.read',
  'encounter.document.read_original',
  'encounter.document.create',
  'encounter.document.archive',

  'analysis.read',
  'analysis.run',
  'analysis.cancel',
  'analysis.correct_fact',
  'analysis.correct_service',
  'analysis.review_decision',
  'analysis.approve',
  'analysis.approval.revoke',
  'analysis.export',
  'analysis.export.read',

  'tariff_evaluation.read',
  'tariff.raw_result.read',

  'finding.resolve',

  'audit.read',
  'audit.export',

  'integration.read',

  'tariff.manage',
] as const;

/** A permission that is active in v1 and may gate an endpoint or a response block. */
export type Permission = (typeof ACTIVE_PERMISSIONS)[number];

/**
 * Reserved identifiers (`03` §28.2, `15` §8.4).
 *
 * They exist so the identifier can never be reused for a different action. They are assigned
 * to no role, gate no active endpoint, and must never become a production grant without a new
 * accepted decision (D-045). They are intentionally **not** assignable to {@link Permission}.
 */
export const RESERVED_PERMISSIONS = [
  'analysis.run_tariff',
  'configuration.manage',
  'integration.manage',
] as const;

/** A reserved, non-grantable permission identifier. */
export type ReservedPermission = (typeof RESERVED_PERMISSIONS)[number];

const ACTIVE_PERMISSION_LOOKUP: ReadonlySet<string> = new Set<string>(ACTIVE_PERMISSIONS);
const RESERVED_PERMISSION_LOOKUP: ReadonlySet<string> = new Set<string>(RESERVED_PERMISSIONS);

/**
 * Narrows an untrusted string to an active permission.
 *
 * Returns `false` for reserved identifiers and for anything outside the catalogue, so that a
 * caller cannot obtain a grant merely because some string exists somewhere (`15` §3.2 —
 * deny-by-default).
 */
export function isActivePermission(value: string): value is Permission {
  return ACTIVE_PERMISSION_LOOKUP.has(value);
}

/** Narrows an untrusted string to a reserved, non-grantable permission identifier. */
export function isReservedPermission(value: string): value is ReservedPermission {
  return RESERVED_PERMISSION_LOOKUP.has(value);
}

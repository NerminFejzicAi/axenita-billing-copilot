/**
 * Canonical role-permission matrix, transcribed from the accepted document.
 *
 * Source: `docs/15_ROLE_PERMISSION_MATRIX_V1.md` — §4.1 (active catalogue), §4.2 (reserved
 * catalogue), §2.1 and §2.2 (role inventory), §5 (the complete 32-row matrix) and §6
 * (conditional rules).
 *
 * ## Why a transcription and not the implementation
 *
 * This file exists so that the conformance test compares two **independently expressed**
 * representations. It imports nothing from `src/` and nothing from `@axenita/contracts`, and
 * it uses plain `string` types rather than the contract unions, so a change to the
 * implementation cannot silently change the expectation. If the implementation and this
 * fixture were derived from one object, the test would only prove that the object equals
 * itself.
 *
 * ## Why a transcription and not a Markdown parse at every assertion
 *
 * Parsing the document is brittle: the assertions would depend on table formatting, heading
 * numbering and inline code markers, so an editorial reflow of `15` would break the suite
 * without any grant having changed. The trade-off is handled by splitting the two concerns:
 *
 * - `canonical-matrix-document.spec.ts` parses `docs/15` once and proves that **this fixture**
 *   still matches the document, so a real documentation change fails the build;
 * - `permission-matrix.conformance.spec.ts` compares the **implementation** against this
 *   fixture, using stable structured data rather than Markdown.
 *
 * Drift is therefore detected at both hops — document to fixture, and fixture to code —
 * without making every matrix assertion depend on Markdown formatting.
 */

/** The six tenant application roles, `15` §2.1. */
export const CANONICAL_TENANT_ROLES: readonly string[] = [
  'PRACTICE_ADMIN',
  'PHYSICIAN',
  'MPA',
  'BILLING_SPECIALIST',
  'AUDITOR',
  'READ_ONLY',
];

/** The platform application role, `15` §2.2. Never a tenant matrix column in the resolver. */
export const CANONICAL_PLATFORM_ROLES: readonly string[] = ['SYSTEM_ADMIN'];

/**
 * Every column heading of the `15` §5 table, in document order.
 *
 * The document represents the platform role as a seventh column. The implementation
 * represents tenant composition only; the conformance test asserts that separation explicitly
 * instead of letting it pass unnoticed.
 */
export const CANONICAL_MATRIX_COLUMNS: readonly string[] = [
  ...CANONICAL_TENANT_ROLES,
  ...CANONICAL_PLATFORM_ROLES,
];

/** The active permission catalogue, `15` §4.1 / `03` §28.1 — exactly 32, in document order. */
export const CANONICAL_ACTIVE_PERMISSIONS: readonly string[] = [
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
];

/** The reserved catalogue, `15` §4.2 / `03` §28.2 — exactly 3, assigned to no role. */
export const CANONICAL_RESERVED_PERMISSIONS: readonly string[] = [
  'analysis.run_tariff',
  'configuration.manage',
  'integration.manage',
];

/** One row of the `15` §5 table. */
export interface CanonicalMatrixRow {
  /** The permission the row governs. */
  readonly permission: string;
  /** Cell state per role, keyed by the column headings of `15` §5. */
  readonly cells: Readonly<Record<string, string>>;
  /** The single originating ADR of the row, from the `Source` column. */
  readonly source: string;
}

function row(
  permission: string,
  practiceAdmin: string,
  physician: string,
  mpa: string,
  billingSpecialist: string,
  auditor: string,
  readOnly: string,
  systemAdmin: string,
  source: string,
): CanonicalMatrixRow {
  return {
    permission,
    cells: {
      PRACTICE_ADMIN: practiceAdmin,
      PHYSICIAN: physician,
      MPA: mpa,
      BILLING_SPECIALIST: billingSpecialist,
      AUDITOR: auditor,
      READ_ONLY: readOnly,
      SYSTEM_ADMIN: systemAdmin,
    },
    source,
  };
}

const A = 'ALLOW';
const D = 'DENY';
const C = 'CONDITIONAL';

/**
 * The complete accepted matrix, `15` §5 — 32 rows, 7 columns, no empty and no `OPEN` cell.
 *
 * Column order matches the document: PRACTICE_ADMIN, PHYSICIAN, MPA, BILLING_SPECIALIST,
 * AUDITOR, READ_ONLY, SYSTEM_ADMIN.
 */
export const CANONICAL_MATRIX_ROWS: readonly CanonicalMatrixRow[] = [
  row('practice.read', A, D, D, D, D, D, D, 'D-047'),
  row('practice.settings.read', A, D, D, D, D, D, D, 'D-044'),
  row('practice.settings.manage', A, D, D, D, D, D, D, 'D-044'),
  row('patient_reference.read', D, A, A, A, D, D, D, 'D-039'),
  row('patient_reference.create', D, A, A, D, D, D, D, 'D-039'),
  row('encounter.read', D, A, A, A, D, D, D, 'D-039'),
  row('encounter.create', D, A, A, D, D, D, D, 'D-039'),
  row('encounter.update', D, A, A, D, D, D, D, 'D-039'),
  row('encounter.cancel', D, A, D, D, D, D, D, 'D-042'),
  row('encounter.close', A, A, D, A, D, D, D, 'D-044'),
  row('encounter.document.list', D, A, A, A, D, D, D, 'D-039'),
  row('encounter.document.read', D, A, A, D, D, D, D, 'D-039'),
  row('encounter.document.read_original', D, A, D, D, D, D, D, 'D-043'),
  row('encounter.document.create', D, A, A, D, D, D, D, 'D-039'),
  row('encounter.document.archive', D, A, D, D, D, D, D, 'D-042'),
  row('analysis.read', D, A, A, A, D, D, D, 'D-039'),
  row('analysis.run', D, A, A, D, D, D, D, 'D-039'),
  row('analysis.cancel', D, A, A, D, D, D, D, 'D-042'),
  row('analysis.correct_fact', D, A, D, D, D, D, D, 'D-040'),
  row('analysis.correct_service', D, A, D, A, D, D, D, 'D-040'),
  row('analysis.review_decision', D, A, D, A, D, D, D, 'D-041'),
  row('analysis.approve', D, A, C, C, D, D, D, 'D-041'),
  row('analysis.approval.revoke', D, A, C, C, D, D, D, 'D-041'),
  row('analysis.export', D, A, D, A, D, D, D, 'D-043'),
  row('analysis.export.read', D, A, D, A, D, D, D, 'D-043'),
  row('tariff_evaluation.read', D, A, D, A, D, D, D, 'D-043'),
  row('tariff.raw_result.read', A, D, D, D, D, D, D, 'D-043'),
  row('finding.resolve', D, A, D, D, D, D, D, 'D-040'),
  row('audit.read', A, D, D, D, A, D, D, 'D-043'),
  row('audit.export', A, D, D, D, A, D, D, 'D-043'),
  row('integration.read', A, D, D, D, D, D, D, 'D-032'),
  row('tariff.manage', D, D, D, D, D, D, A, 'D-023'),
];

/** A conditional cell of `15` §6 and the practice settings flag it requires. */
export interface CanonicalConditionalRequirement {
  readonly permission: string;
  readonly role: string;
  readonly flag: string;
}

/**
 * The conditional mapping of `15` §6.1–§6.4.
 *
 * Revocation eligibility is identical to approval eligibility, and each flag widens
 * eligibility for its own role only.
 */
export const CANONICAL_CONDITIONAL_REQUIREMENTS: readonly CanonicalConditionalRequirement[] = [
  { permission: 'analysis.approve', role: 'MPA', flag: 'allowMpaApproval' },
  {
    permission: 'analysis.approve',
    role: 'BILLING_SPECIALIST',
    flag: 'allowBillingSpecialistApproval',
  },
  { permission: 'analysis.approval.revoke', role: 'MPA', flag: 'allowMpaApproval' },
  {
    permission: 'analysis.approval.revoke',
    role: 'BILLING_SPECIALIST',
    flag: 'allowBillingSpecialistApproval',
  },
];

/**
 * `practice.read` is granted to `PRACTICE_ADMIN` and to nobody else (D-047 clause 11).
 *
 * Held as its own expectation so that a widening of this specific rule fails on a named
 * assertion rather than only inside the bulk matrix comparison.
 */
export const CANONICAL_PRACTICE_READ_ALLOWED_ROLES: readonly string[] = ['PRACTICE_ADMIN'];

/**
 * Per-role tallies of `15` §7, mechanically derived in the document from the §5 table.
 *
 * Recorded here as a second, independent expression of the same matrix: a single mistyped
 * cell in the fixture would keep the row comparison self-consistent but break these counts.
 */
export const CANONICAL_ROLE_TALLIES: Readonly<
  Record<string, { readonly allow: number; readonly conditional: number; readonly deny: number }>
> = {
  PRACTICE_ADMIN: { allow: 8, conditional: 0, deny: 24 },
  PHYSICIAN: { allow: 24, conditional: 0, deny: 8 },
  MPA: { allow: 11, conditional: 2, deny: 19 },
  BILLING_SPECIALIST: { allow: 10, conditional: 2, deny: 20 },
  AUDITOR: { allow: 2, conditional: 0, deny: 30 },
  READ_ONLY: { allow: 0, conditional: 0, deny: 32 },
  SYSTEM_ADMIN: { allow: 1, conditional: 0, deny: 31 },
};

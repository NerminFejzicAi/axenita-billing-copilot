/**
 * The single application representation of the accepted tenant role-permission matrix.
 *
 * Normative source: `15_ROLE_PERMISSION_MATRIX_V1.md` §5, reproduced here without change.
 * The originating decisions are D-023, D-032 and D-039 to D-045, plus D-047 for
 * `practice.read`. `04` §6.4.1 requires exactly one implementation representation of those 32
 * accepted rows; no controller, service, guard or test may restate a grant next to it.
 *
 * Scope of this module — tenant composition only:
 *
 * - the columns are the six tenant roles of `15` §2.1;
 * - the `SYSTEM_ADMIN` column of `15` §5 is **not** represented here. It is a platform role,
 *   it never enters the tenant union (D-038 clauses 12–14, `15` §3.2), and its only `ALLOW`
 *   cell — `tariff.manage` — is `DENY` for all six tenant roles, so excluding the column
 *   removes no tenant grant. No platform permission matrix exists in this phase; the
 *   conformance test proves the exclusion against the canonical document.
 *
 * Fail-closed design: the matrix is typed as a total `Record` over both axes, so a missing
 * cell is a compile error rather than an `undefined` that some caller could coalesce into a
 * grant. Untrusted strings must go through {@link resolveMatrixCell}, which throws instead of
 * returning a default.
 */

import {
  ACTIVE_PERMISSIONS,
  TENANT_MEMBERSHIP_ROLES,
  isActivePermission,
  isTenantMembershipRole,
  type Permission,
  type TenantMembershipRole,
} from '@axenita/contracts';

/**
 * The three accepted cell states (`15` §3.1).
 *
 * `BLOCKED — D-OPEN-011` is a withdrawn value: D-047 resolved the open question and no cell
 * carries it any more. A future unresolved question needs its own ADR and its own explicit
 * classification, never this vocabulary.
 */
export const MATRIX_CELLS = ['ALLOW', 'DENY', 'CONDITIONAL'] as const;

/**
 * A single matrix cell.
 *
 * - `ALLOW` — the role contributes the permission to the effective set.
 * - `DENY` — the role contributes no grant. It is **not** a negative override: an `ALLOW`
 *   from another assigned tenant role still contributes (`15` §3.1, D-038).
 * - `CONDITIONAL` — contributes only when the role is assigned, the membership is active and
 *   the accepted practice flag for that exact cell is enabled.
 */
export type MatrixCell = (typeof MATRIX_CELLS)[number];

/**
 * The practice settings flags that gate conditional grants (`03` §10, D-041).
 *
 * Phase 3 accepts exactly these two conditions. No further configuration condition exists,
 * and none may be invented without a new accepted decision.
 */
export const CONDITIONAL_APPROVAL_FLAGS = [
  'allowMpaApproval',
  'allowBillingSpecialistApproval',
] as const;

/** A practice settings flag that can enable a `CONDITIONAL` cell. */
export type ConditionalApprovalFlag = (typeof CONDITIONAL_APPROVAL_FLAGS)[number];

/**
 * Raised when the matrix is asked something it cannot answer.
 *
 * A missing or unknown coordinate is a defect, not a runtime condition to be smoothed over.
 * The error exists so that no call site can degrade into an implicit allow.
 */
export class PermissionMatrixInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermissionMatrixInvariantError';
  }
}

/** One row of the matrix: the state of a single permission for every tenant role. */
export type PermissionMatrixRow = Readonly<Record<TenantMembershipRole, MatrixCell>>;

/**
 * The accepted matrix — 32 active permissions x 6 tenant roles, every cell explicit.
 *
 * Transcribed row by row from `15` §5. The `Source` column of that table is not repeated in
 * the executable matrix; it is carried by the canonical test fixture, which is where ADR
 * traceability is mechanically verified.
 */
export const TENANT_PERMISSION_MATRIX: Readonly<Record<Permission, PermissionMatrixRow>> = {
  'practice.read': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'practice.settings.read': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'practice.settings.manage': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'patient_reference.read': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'patient_reference.create': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.read': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.create': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.update': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.cancel': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.close': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.document.list': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.document.read': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.document.read_original': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.document.create': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'encounter.document.archive': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.read': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.run': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.cancel': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'ALLOW',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.correct_fact': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.correct_service': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.review_decision': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.approve': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'CONDITIONAL',
    BILLING_SPECIALIST: 'CONDITIONAL',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.approval.revoke': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'CONDITIONAL',
    BILLING_SPECIALIST: 'CONDITIONAL',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.export': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'analysis.export.read': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'tariff_evaluation.read': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'ALLOW',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'tariff.raw_result.read': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'finding.resolve': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'ALLOW',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  'audit.read': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'ALLOW',
    READ_ONLY: 'DENY',
  },
  'audit.export': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'ALLOW',
    READ_ONLY: 'DENY',
  },
  'integration.read': {
    PRACTICE_ADMIN: 'ALLOW',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
  // Platform-scoped (`03` §28.3 rule 4, D-023). Every tenant role is `DENY`; the permission
  // belongs to `SYSTEM_ADMIN`, which is outside tenant composition.
  'tariff.manage': {
    PRACTICE_ADMIN: 'DENY',
    PHYSICIAN: 'DENY',
    MPA: 'DENY',
    BILLING_SPECIALIST: 'DENY',
    AUDITOR: 'DENY',
    READ_ONLY: 'DENY',
  },
};

/** A `CONDITIONAL` cell together with the exact flag that can enable it. */
export interface ConditionalGrantRequirement {
  readonly permission: Permission;
  readonly role: TenantMembershipRole;
  readonly flag: ConditionalApprovalFlag;
}

/**
 * Every conditional cell of the matrix and the flag it depends on (`15` §6, D-041).
 *
 * Revocation eligibility is identical to approval eligibility (`15` §6.3, §6.4), so both
 * permissions map onto the same flag per role. A flag widens eligibility for its own role
 * only: `allowMpaApproval` never qualifies a `BILLING_SPECIALIST` and vice versa
 * (`03` §10).
 */
export const CONDITIONAL_GRANT_REQUIREMENTS: readonly ConditionalGrantRequirement[] = [
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

function conditionalKey(permission: string, role: string): string {
  return `${permission} ${role}`;
}

const CONDITIONAL_FLAG_BY_CELL: ReadonlyMap<string, ConditionalApprovalFlag> = new Map(
  CONDITIONAL_GRANT_REQUIREMENTS.map((requirement) => [
    conditionalKey(requirement.permission, requirement.role),
    requirement.flag,
  ]),
);

/**
 * Reads one cell for coordinates that may come from outside the type system.
 *
 * Throws for an unknown permission, a reserved permission, an unknown role and for
 * `SYSTEM_ADMIN`. There is deliberately no default and no optional return: a caller cannot
 * write `resolveMatrixCell(...) ?? 'ALLOW'` because the function never yields an absent value.
 */
export function resolveMatrixCell(permission: string, role: string): MatrixCell {
  if (!isActivePermission(permission)) {
    throw new PermissionMatrixInvariantError(
      `No matrix row for permission '${permission}': it is not an active permission of 03 §28.1.`,
    );
  }

  if (!isTenantMembershipRole(role)) {
    throw new PermissionMatrixInvariantError(
      `No matrix column for role '${role}': it is not one of the six tenant roles of 15 §2.1.`,
    );
  }

  return TENANT_PERMISSION_MATRIX[permission][role];
}

/**
 * Returns the flag that a `CONDITIONAL` cell depends on.
 *
 * A conditional cell without a registered flag is a defect: the grant would otherwise have no
 * condition left to fail, which is exactly the implicit allow the matrix must never produce.
 */
export function resolveConditionalFlag(
  permission: Permission,
  role: TenantMembershipRole,
): ConditionalApprovalFlag {
  const flag = CONDITIONAL_FLAG_BY_CELL.get(conditionalKey(permission, role));

  if (flag === undefined) {
    throw new PermissionMatrixInvariantError(
      `Cell '${permission}' x '${role}' is CONDITIONAL but no practice settings flag is mapped to it.`,
    );
  }

  return flag;
}

/**
 * Mechanical self-check of the matrix (`04` §6.4.1 — "Mehanička validacija matrice").
 *
 * This validates the matrix against itself: shape, totality and cell vocabulary. It is not
 * the conformance check against the accepted document — that comparison lives in the tests
 * and uses an independently expressed canonical fixture. Failure here is a defect, never a
 * warning.
 */
export function assertPermissionMatrixInvariants(): void {
  const rows = Object.keys(TENANT_PERMISSION_MATRIX);

  if (rows.length !== ACTIVE_PERMISSIONS.length) {
    throw new PermissionMatrixInvariantError(
      `Matrix holds ${rows.length} rows but the active catalogue holds ${ACTIVE_PERMISSIONS.length}.`,
    );
  }

  for (const permission of ACTIVE_PERMISSIONS) {
    const row = TENANT_PERMISSION_MATRIX[permission];
    const columns = Object.keys(row);

    if (columns.length !== TENANT_MEMBERSHIP_ROLES.length) {
      throw new PermissionMatrixInvariantError(
        `Row '${permission}' holds ${columns.length} columns but there are ${TENANT_MEMBERSHIP_ROLES.length} tenant roles.`,
      );
    }

    for (const role of TENANT_MEMBERSHIP_ROLES) {
      const cell = row[role];

      if (!MATRIX_CELLS.includes(cell)) {
        throw new PermissionMatrixInvariantError(
          `Cell '${permission}' x '${role}' carries the unknown state '${String(cell)}'.`,
        );
      }

      // A conditional cell must resolve to exactly one flag, and a flag must not be mapped
      // to a cell that is not conditional.
      const mappedFlag = CONDITIONAL_FLAG_BY_CELL.get(conditionalKey(permission, role));

      if (cell === 'CONDITIONAL' && mappedFlag === undefined) {
        throw new PermissionMatrixInvariantError(
          `Cell '${permission}' x '${role}' is CONDITIONAL but no practice settings flag is mapped to it.`,
        );
      }

      if (cell !== 'CONDITIONAL' && mappedFlag !== undefined) {
        throw new PermissionMatrixInvariantError(
          `Cell '${permission}' x '${role}' is ${cell} but a conditional flag is mapped to it.`,
        );
      }
    }
  }
}

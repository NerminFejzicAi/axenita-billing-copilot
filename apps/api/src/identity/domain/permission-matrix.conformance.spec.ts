/**
 * Mechanical conformance of the implemented matrix against the canonical fixture.
 *
 * This is the second conformance hop of `04` §6.4.1. The expectation comes from
 * `test/fixtures/canonical-role-permission-matrix.ts`, which is transcribed from `docs/15` and
 * imports nothing from the implementation; `canonical-matrix-document.spec.ts` keeps that
 * fixture honest against the document itself. Implementation and expectation therefore never
 * share an object, so this suite fails on drift instead of confirming that a constant equals
 * itself.
 */

import {
  ACTIVE_PERMISSIONS,
  PLATFORM_ROLES,
  RESERVED_PERMISSIONS,
  TENANT_MEMBERSHIP_ROLES,
  isActivePermission,
  isTenantMembershipRole,
} from '@axenita/contracts';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ACTIVE_PERMISSIONS,
  CANONICAL_CONDITIONAL_REQUIREMENTS,
  CANONICAL_MATRIX_ROWS,
  CANONICAL_PLATFORM_ROLES,
  CANONICAL_PRACTICE_READ_ALLOWED_ROLES,
  CANONICAL_RESERVED_PERMISSIONS,
  CANONICAL_ROLE_TALLIES,
  CANONICAL_TENANT_ROLES,
} from '../../../test/fixtures/canonical-role-permission-matrix.js';
import {
  CONDITIONAL_GRANT_REQUIREMENTS,
  MATRIX_CELLS,
  PermissionMatrixInvariantError,
  TENANT_PERMISSION_MATRIX,
  assertPermissionMatrixInvariants,
  resolveConditionalFlag,
  resolveMatrixCell,
} from './permission-matrix.js';

describe('permission catalogue conformance', () => {
  it('holds exactly the 32 active permissions of the canonical catalogue, in order', () => {
    expect([...ACTIVE_PERMISSIONS]).toEqual([...CANONICAL_ACTIVE_PERMISSIONS]);
  });

  it('holds exactly 32 active permissions', () => {
    expect(ACTIVE_PERMISSIONS).toHaveLength(32);
    expect(new Set(ACTIVE_PERMISSIONS).size).toBe(32);
  });

  it('holds exactly the 3 reserved permissions of the canonical catalogue', () => {
    expect([...RESERVED_PERMISSIONS]).toEqual([...CANONICAL_RESERVED_PERMISSIONS]);
  });

  it('holds exactly 3 reserved permissions', () => {
    expect(RESERVED_PERMISSIONS).toHaveLength(3);
    expect(new Set(RESERVED_PERMISSIONS).size).toBe(3);
  });

  it('never lets a reserved permission become an active permission', () => {
    for (const reserved of CANONICAL_RESERVED_PERMISSIONS) {
      expect(isActivePermission(reserved), `${reserved} must not be active`).toBe(false);
      expect(Object.hasOwn(TENANT_PERMISSION_MATRIX, reserved)).toBe(false);
    }
  });
});

describe('role inventory conformance', () => {
  it('holds exactly the six canonical tenant roles, in order', () => {
    expect([...TENANT_MEMBERSHIP_ROLES]).toEqual([...CANONICAL_TENANT_ROLES]);
  });

  it('holds exactly the canonical platform roles', () => {
    expect([...PLATFORM_ROLES]).toEqual([...CANONICAL_PLATFORM_ROLES]);
  });

  it('keeps every platform role out of the tenant role vocabulary', () => {
    for (const platformRole of CANONICAL_PLATFORM_ROLES) {
      expect(isTenantMembershipRole(platformRole), `${platformRole} is not a tenant role`).toBe(
        false,
      );
      expect([...TENANT_MEMBERSHIP_ROLES]).not.toContain(platformRole);
    }
  });
});

describe('tenant matrix conformance', () => {
  it('passes its own structural invariants', () => {
    expect(() => {
      assertPermissionMatrixInvariants();
    }).not.toThrow();
  });

  it('carries exactly one row per active permission and no other row', () => {
    expect(Object.keys(TENANT_PERMISSION_MATRIX).sort()).toEqual(
      [...CANONICAL_ACTIVE_PERMISSIONS].sort(),
    );
  });

  it('carries exactly the six tenant columns in every row', () => {
    for (const permission of CANONICAL_ACTIVE_PERMISSIONS) {
      const row: unknown = Reflect.get(TENANT_PERMISSION_MATRIX, permission);

      expect(Object.keys(row as object).sort(), `columns of ${permission}`).toEqual(
        [...CANONICAL_TENANT_ROLES].sort(),
      );
    }
  });

  it('reproduces every tenant cell of the canonical matrix', () => {
    for (const canonicalRow of CANONICAL_MATRIX_ROWS) {
      for (const role of CANONICAL_TENANT_ROLES) {
        expect(
          resolveMatrixCell(canonicalRow.permission, role),
          `${canonicalRow.permission} x ${role}`,
        ).toBe(canonicalRow.cells[role]);
      }
    }
  });

  it('uses only the three accepted cell states', () => {
    expect([...MATRIX_CELLS]).toEqual(['ALLOW', 'DENY', 'CONDITIONAL']);

    for (const canonicalRow of CANONICAL_MATRIX_ROWS) {
      for (const role of CANONICAL_TENANT_ROLES) {
        expect([...MATRIX_CELLS]).toContain(resolveMatrixCell(canonicalRow.permission, role));
      }
    }
  });

  it('reproduces the per-role tallies of the canonical matrix', () => {
    for (const role of CANONICAL_TENANT_ROLES) {
      const cells = CANONICAL_ACTIVE_PERMISSIONS.map((permission) =>
        resolveMatrixCell(permission, role),
      );

      expect(
        {
          allow: cells.filter((cell) => cell === 'ALLOW').length,
          conditional: cells.filter((cell) => cell === 'CONDITIONAL').length,
          deny: cells.filter((cell) => cell === 'DENY').length,
        },
        `tallies for ${role}`,
      ).toEqual(CANONICAL_ROLE_TALLIES[role]);
    }
  });

  it('grants practice.read to PRACTICE_ADMIN and to no other tenant role', () => {
    const granting = CANONICAL_TENANT_ROLES.filter(
      (role) => resolveMatrixCell('practice.read', role) !== 'DENY',
    );

    expect(granting).toEqual([...CANONICAL_PRACTICE_READ_ALLOWED_ROLES]);
  });
});

describe('platform column separation', () => {
  it('omits the platform column from the tenant matrix on purpose, losing no tenant grant', () => {
    // The canonical table has a seventh column. Its only `ALLOW` is `tariff.manage`, which is
    // `DENY` for all six tenant roles, so a tenant-only matrix drops no grant that tenant
    // composition could ever have produced.
    const platformAllowRows = CANONICAL_MATRIX_ROWS.filter(
      (canonicalRow) => canonicalRow.cells.SYSTEM_ADMIN === 'ALLOW',
    ).map((canonicalRow) => canonicalRow.permission);

    expect(platformAllowRows).toEqual(['tariff.manage']);

    for (const role of CANONICAL_TENANT_ROLES) {
      expect(resolveMatrixCell('tariff.manage', role), `tariff.manage x ${role}`).toBe('DENY');
    }
  });

  it('never carries a platform column inside the implemented matrix', () => {
    for (const permission of CANONICAL_ACTIVE_PERMISSIONS) {
      const row: unknown = Reflect.get(TENANT_PERMISSION_MATRIX, permission);

      for (const platformRole of CANONICAL_PLATFORM_ROLES) {
        expect(Object.hasOwn(row as object, platformRole), `${permission} x ${platformRole}`).toBe(
          false,
        );
      }
    }
  });
});

describe('conditional mapping conformance', () => {
  it('maps exactly the canonical conditional cells to their canonical flags', () => {
    const implemented = CONDITIONAL_GRANT_REQUIREMENTS.map((requirement) => ({
      permission: String(requirement.permission),
      role: String(requirement.role),
      flag: String(requirement.flag),
    }));

    expect(sortRequirements(implemented)).toEqual(
      sortRequirements(CANONICAL_CONDITIONAL_REQUIREMENTS.map((entry) => ({ ...entry }))),
    );
  });

  it('registers a flag for every CONDITIONAL cell and for no other cell', () => {
    for (const canonicalRow of CANONICAL_MATRIX_ROWS) {
      for (const role of CANONICAL_TENANT_ROLES) {
        const isConditional = canonicalRow.cells[role] === 'CONDITIONAL';
        const registered = CONDITIONAL_GRANT_REQUIREMENTS.some(
          (requirement) =>
            requirement.permission === canonicalRow.permission && requirement.role === role,
        );

        expect(registered, `${canonicalRow.permission} x ${role}`).toBe(isConditional);
      }
    }
  });

  it('refuses to invent a flag for a cell that is not conditional', () => {
    expect(() => resolveConditionalFlag('analysis.read', 'PHYSICIAN')).toThrow(
      PermissionMatrixInvariantError,
    );
  });
});

function sortRequirements(
  entries: readonly { permission: string; role: string; flag: string }[],
): readonly { permission: string; role: string; flag: string }[] {
  return [...entries].sort((left, right) =>
    `${left.permission} ${left.role}`.localeCompare(`${right.permission} ${right.role}`),
  );
}

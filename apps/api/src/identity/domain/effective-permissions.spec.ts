/**
 * Behavioural proof of the effective-permission resolver.
 *
 * Every expectation is derived from the canonical fixture rather than from the implemented
 * matrix, so these tests observe behaviour against the accepted document and not against the
 * constant they exercise.
 */

import { RESERVED_PERMISSIONS, type TenantMembershipRole } from '@axenita/contracts';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ACTIVE_PERMISSIONS,
  CANONICAL_CONDITIONAL_REQUIREMENTS,
  CANONICAL_MATRIX_ROWS,
  CANONICAL_TENANT_ROLES,
} from '../../../test/fixtures/canonical-role-permission-matrix.js';
import {
  hasEffectivePermission,
  resolveEffectivePermissions,
  resolveEffectivePermissionsPerMembership,
  type ConditionalPermissionSettings,
  type MembershipPermissionInput,
} from './effective-permissions.js';
import { PermissionMatrixInvariantError } from './permission-matrix.js';

const NO_FLAGS: ConditionalPermissionSettings = {
  allowMpaApproval: false,
  allowBillingSpecialistApproval: false,
};

const MPA_FLAG_ONLY: ConditionalPermissionSettings = {
  allowMpaApproval: true,
  allowBillingSpecialistApproval: false,
};

const BILLING_FLAG_ONLY: ConditionalPermissionSettings = {
  allowMpaApproval: false,
  allowBillingSpecialistApproval: true,
};

const BOTH_FLAGS: ConditionalPermissionSettings = {
  allowMpaApproval: true,
  allowBillingSpecialistApproval: true,
};

/** Expected permissions of one role, computed from the canonical fixture alone. */
function canonicalPermissionsOf(
  role: string,
  settings: ConditionalPermissionSettings,
): readonly string[] {
  return CANONICAL_MATRIX_ROWS.filter((row) => {
    const cell = row.cells[role];

    if (cell === 'ALLOW') {
      return true;
    }

    if (cell !== 'CONDITIONAL') {
      return false;
    }

    const requirement = CANONICAL_CONDITIONAL_REQUIREMENTS.find(
      (entry) => entry.permission === row.permission && entry.role === role,
    );

    return (
      requirement !== undefined &&
      settings[requirement.flag as keyof ConditionalPermissionSettings] === true
    );
  }).map((row) => row.permission);
}

function membership(
  roles: readonly TenantMembershipRole[],
  settings: ConditionalPermissionSettings = NO_FLAGS,
  active = true,
): MembershipPermissionInput {
  return { active, roles, settings };
}

describe('A — each tenant role in isolation', () => {
  for (const role of CANONICAL_TENANT_ROLES) {
    it(`derives the canonical permissions of ${role}`, () => {
      const resolved = resolveEffectivePermissions(
        membership([role as TenantMembershipRole], BOTH_FLAGS),
      );

      expect([...resolved]).toEqual([...canonicalPermissionsOf(role, BOTH_FLAGS)]);
    });
  }

  it('gives READ_ONLY nothing at all, with every flag enabled', () => {
    expect(resolveEffectivePermissions(membership(['READ_ONLY'], BOTH_FLAGS))).toEqual([]);
  });

  it('gives AUDITOR exactly the two audit permissions', () => {
    expect([...resolveEffectivePermissions(membership(['AUDITOR'], BOTH_FLAGS))]).toEqual([
      'audit.read',
      'audit.export',
    ]);
  });
});

describe('B — membership without roles', () => {
  it('returns an empty set for an active membership with zero roles', () => {
    expect(resolveEffectivePermissions(membership([]))).toEqual([]);
  });

  it('returns an empty set for an inactive membership regardless of its roles and flags', () => {
    expect(
      resolveEffectivePermissions(membership(['PHYSICIAN', 'PRACTICE_ADMIN'], BOTH_FLAGS, false)),
    ).toEqual([]);
  });
});

describe('C — union inside one membership', () => {
  it('unions the grants of every assigned role', () => {
    const resolved = resolveEffectivePermissions(
      membership(['PRACTICE_ADMIN', 'PHYSICIAN'], NO_FLAGS),
    );

    const expected = CANONICAL_ACTIVE_PERMISSIONS.filter(
      (permission) =>
        canonicalPermissionsOf('PRACTICE_ADMIN', NO_FLAGS).includes(permission) ||
        canonicalPermissionsOf('PHYSICIAN', NO_FLAGS).includes(permission),
    );

    expect([...resolved]).toEqual([...expected]);
  });

  it('does not let a DENY of one role veto an ALLOW of another', () => {
    // `practice.read` is DENY for PHYSICIAN and ALLOW for PRACTICE_ADMIN; the combination must
    // still hold it (`15` §3.1 — DENY is not a negative override).
    const resolved = resolveEffectivePermissions(membership(['PHYSICIAN', 'PRACTICE_ADMIN']));

    expect(hasEffectivePermission(resolved, 'practice.read')).toBe(true);
    expect(hasEffectivePermission(resolved, 'analysis.correct_fact')).toBe(true);
  });
});

describe('D — duplicate roles', () => {
  it('collapses a repeated role into a single set of permissions', () => {
    const once = resolveEffectivePermissions(membership(['MPA'], MPA_FLAG_ONLY));
    const thrice = resolveEffectivePermissions(membership(['MPA', 'MPA', 'MPA'], MPA_FLAG_ONLY));

    expect([...thrice]).toEqual([...once]);
    expect(new Set(thrice).size).toBe(thrice.length);
  });

  it('collapses a grant that two different roles both contribute', () => {
    const resolved = resolveEffectivePermissions(
      membership(['PHYSICIAN', 'MPA', 'BILLING_SPECIALIST']),
    );

    expect(new Set(resolved).size).toBe(resolved.length);
    expect(resolved.filter((permission) => permission === 'encounter.read')).toHaveLength(1);
  });
});

describe('E — role order independence', () => {
  it('returns the same result whatever order the roles arrive in', () => {
    const forward = resolveEffectivePermissions(
      membership(['PRACTICE_ADMIN', 'PHYSICIAN', 'AUDITOR'], BOTH_FLAGS),
    );
    const reversed = resolveEffectivePermissions(
      membership(['AUDITOR', 'PHYSICIAN', 'PRACTICE_ADMIN'], BOTH_FLAGS),
    );

    expect([...reversed]).toEqual([...forward]);
  });
});

describe('F, G, H — conditional grants', () => {
  const conditionalPermissions = ['analysis.approve', 'analysis.approval.revoke'] as const;

  for (const permission of conditionalPermissions) {
    it(`withholds ${permission} from MPA while allowMpaApproval is false`, () => {
      const resolved = resolveEffectivePermissions(membership(['MPA'], NO_FLAGS));

      expect(hasEffectivePermission(resolved, permission)).toBe(false);
    });

    it(`grants ${permission} to MPA once allowMpaApproval is true`, () => {
      const resolved = resolveEffectivePermissions(membership(['MPA'], MPA_FLAG_ONLY));

      expect(hasEffectivePermission(resolved, permission)).toBe(true);
    });

    it(`withholds ${permission} from BILLING_SPECIALIST while its flag is false`, () => {
      const resolved = resolveEffectivePermissions(membership(['BILLING_SPECIALIST'], NO_FLAGS));

      expect(hasEffectivePermission(resolved, permission)).toBe(false);
    });

    it(`grants ${permission} to BILLING_SPECIALIST once its flag is true`, () => {
      const resolved = resolveEffectivePermissions(
        membership(['BILLING_SPECIALIST'], BILLING_FLAG_ONLY),
      );

      expect(hasEffectivePermission(resolved, permission)).toBe(true);
    });

    it(`does not let the billing flag qualify an MPA for ${permission}`, () => {
      const resolved = resolveEffectivePermissions(membership(['MPA'], BILLING_FLAG_ONLY));

      expect(hasEffectivePermission(resolved, permission)).toBe(false);
    });

    it(`does not let the MPA flag qualify a BILLING_SPECIALIST for ${permission}`, () => {
      const resolved = resolveEffectivePermissions(
        membership(['BILLING_SPECIALIST'], MPA_FLAG_ONLY),
      );

      expect(hasEffectivePermission(resolved, permission)).toBe(false);
    });

    it(`gives PHYSICIAN ${permission} unconditionally`, () => {
      const resolved = resolveEffectivePermissions(membership(['PHYSICIAN'], NO_FLAGS));

      expect(hasEffectivePermission(resolved, permission)).toBe(true);
    });

    it(`never gives PRACTICE_ADMIN ${permission}, whatever the flags`, () => {
      const resolved = resolveEffectivePermissions(membership(['PRACTICE_ADMIN'], BOTH_FLAGS));

      expect(hasEffectivePermission(resolved, permission)).toBe(false);
    });
  }

  it('treats a non-boolean flag value as disabled', () => {
    const malformed = {
      allowMpaApproval: 'true',
      allowBillingSpecialistApproval: 1,
    } as unknown as ConditionalPermissionSettings;

    const resolved = resolveEffectivePermissions(membership(['MPA'], malformed));

    expect(hasEffectivePermission(resolved, 'analysis.approve')).toBe(false);
  });
});

describe('I — reserved permissions', () => {
  it('never returns a reserved permission for any role combination', () => {
    const resolved = resolveEffectivePermissions(
      membership([...CANONICAL_TENANT_ROLES] as TenantMembershipRole[], BOTH_FLAGS),
    );

    for (const reserved of RESERVED_PERMISSIONS) {
      expect([...resolved], `${reserved} must never be derived`).not.toContain(reserved);
      expect(hasEffectivePermission(resolved, reserved)).toBe(false);
    }
  });
});

describe('J, K, L — fail-closed input handling', () => {
  it('J. denies an unknown permission instead of granting it', () => {
    const resolved = resolveEffectivePermissions(membership(['PHYSICIAN'], BOTH_FLAGS));

    expect(hasEffectivePermission(resolved, 'analysis.definitely_not_a_permission')).toBe(false);
    expect(hasEffectivePermission(resolved, '')).toBe(false);
    expect(hasEffectivePermission(resolved, '__proto__')).toBe(false);
    expect(hasEffectivePermission(resolved, 'toString')).toBe(false);
  });

  it('K. refuses an unknown role rather than skipping it', () => {
    const roles = ['NOT_A_ROLE'] as unknown as readonly TenantMembershipRole[];

    expect(() => resolveEffectivePermissions(membership(roles, BOTH_FLAGS))).toThrow(
      PermissionMatrixInvariantError,
    );
  });

  it('L. refuses SYSTEM_ADMIN as a tenant role', () => {
    // @ts-expect-error SYSTEM_ADMIN is a platform role and must never be assignable here.
    const roles: readonly TenantMembershipRole[] = ['SYSTEM_ADMIN'];

    expect(() => resolveEffectivePermissions(membership(roles, BOTH_FLAGS))).toThrow(
      PermissionMatrixInvariantError,
    );
  });

  it('L. grants no tenant permission through a platform role', () => {
    // A platform assignment produces no membership, so the only faithful representation of a
    // SYSTEM_ADMIN without a tenant membership is a membership with zero tenant roles.
    expect(resolveEffectivePermissions(membership([], BOTH_FLAGS))).toEqual([]);
  });

  it('refuses malformed settings rather than defaulting them', () => {
    const malformed = null as unknown as ConditionalPermissionSettings;

    expect(() => resolveEffectivePermissions(membership(['MPA'], malformed))).toThrow(
      PermissionMatrixInvariantError,
    );
  });

  it('returns a frozen result so a caller cannot append a grant', () => {
    const resolved = resolveEffectivePermissions(membership(['AUDITOR']));

    expect(Object.isFrozen(resolved)).toBe(true);
  });
});

describe('M — membership scope', () => {
  it('keeps the roles of one membership out of another membership', () => {
    const [first, second] = resolveEffectivePermissionsPerMembership([
      membership(['PRACTICE_ADMIN']),
      membership(['AUDITOR']),
    ]);

    expect([...(first ?? [])]).toEqual([...canonicalPermissionsOf('PRACTICE_ADMIN', NO_FLAGS)]);
    expect([...(second ?? [])]).toEqual([...canonicalPermissionsOf('AUDITOR', NO_FLAGS)]);

    // `integration.read` belongs to the PRACTICE_ADMIN membership alone.
    expect(hasEffectivePermission(first ?? [], 'integration.read')).toBe(true);
    expect(hasEffectivePermission(second ?? [], 'integration.read')).toBe(false);
  });

  it('applies each practice its own conditional settings', () => {
    const [enabled, disabled] = resolveEffectivePermissionsPerMembership([
      membership(['MPA'], MPA_FLAG_ONLY),
      membership(['MPA'], NO_FLAGS),
    ]);

    expect(hasEffectivePermission(enabled ?? [], 'analysis.approve')).toBe(true);
    expect(hasEffectivePermission(disabled ?? [], 'analysis.approve')).toBe(false);
  });

  it('returns one result per membership and never a flattened union', () => {
    const results = resolveEffectivePermissionsPerMembership([
      membership(['PRACTICE_ADMIN']),
      membership(['PHYSICIAN']),
      membership([]),
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((entry) => Array.isArray(entry))).toBe(true);
    expect(results[2]).toEqual([]);
  });
});

describe('N — deterministic ordering', () => {
  it('emits permissions in the canonical catalogue order', () => {
    const resolved = resolveEffectivePermissions(
      membership(['AUDITOR', 'BILLING_SPECIALIST', 'PHYSICIAN'], BOTH_FLAGS),
    );

    const positions = resolved.map((permission) =>
      CANONICAL_ACTIVE_PERMISSIONS.indexOf(permission),
    );

    expect(positions).not.toContain(-1);
    expect([...positions]).toEqual([...positions].sort((left, right) => left - right));
  });

  it('is stable across repeated calls', () => {
    const first = resolveEffectivePermissions(membership(['PHYSICIAN', 'MPA'], BOTH_FLAGS));
    const second = resolveEffectivePermissions(membership(['MPA', 'PHYSICIAN'], BOTH_FLAGS));

    expect([...second]).toEqual([...first]);
  });
});

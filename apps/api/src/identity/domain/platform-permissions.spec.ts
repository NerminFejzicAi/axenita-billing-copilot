/**
 * The platform mapping, checked against the canonical fixture and against the tenant matrix.
 *
 * Two independent things are proven here:
 *
 * 1. CONFORMANCE — the mapping equals the `SYSTEM_ADMIN` column of `15` §5. The expectation
 *    comes from `test/fixtures/canonical-role-permission-matrix.ts`, which is transcribed from
 *    the document and imports nothing from the implementation, so this fails on drift instead of
 *    comparing a constant with itself.
 * 2. SEPARATION — the platform mapping and the tenant matrix cannot contaminate each other.
 */

import {
  ACTIVE_PERMISSIONS,
  PLATFORM_ROLES,
  TENANT_MEMBERSHIP_ROLES,
  isActivePermission,
  type Permission,
} from '@axenita/contracts';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MATRIX_ROWS,
  CANONICAL_PLATFORM_ROLES,
  CANONICAL_ROLE_TALLIES,
} from '../../../test/fixtures/canonical-role-permission-matrix.js';
import { resolveEffectivePermissions } from './effective-permissions.js';
import { TENANT_PERMISSION_MATRIX } from './permission-matrix.js';
import {
  PLATFORM_PERMISSION_MATRIX,
  PlatformPermissionInvariantError,
  comparePlatformRoles,
  resolvePlatformPermissions,
} from './platform-permissions.js';

/** Every permission the canonical document marks `ALLOW` in the `SYSTEM_ADMIN` column. */
const CANONICAL_SYSTEM_ADMIN_ALLOWS = CANONICAL_MATRIX_ROWS.filter(
  (row) => row.cells['SYSTEM_ADMIN'] === 'ALLOW',
).map((row) => row.permission);

describe('platform permission conformance', () => {
  it('covers exactly the platform roles of the canonical document', () => {
    expect(Object.keys(PLATFORM_PERMISSION_MATRIX).sort()).toEqual(
      [...CANONICAL_PLATFORM_ROLES].sort(),
    );
    expect([...PLATFORM_ROLES]).toEqual([...CANONICAL_PLATFORM_ROLES]);
  });

  it('grants SYSTEM_ADMIN exactly the ALLOW cells of the canonical SYSTEM_ADMIN column', () => {
    expect([...resolvePlatformPermissions('SYSTEM_ADMIN')]).toEqual(CANONICAL_SYSTEM_ADMIN_ALLOWS);
    expect(CANONICAL_SYSTEM_ADMIN_ALLOWS).toEqual(['tariff.manage']);
  });

  it('matches the accepted tally of one ALLOW and thirty-one DENY (15 §7)', () => {
    expect(resolvePlatformPermissions('SYSTEM_ADMIN')).toHaveLength(
      CANONICAL_ROLE_TALLIES['SYSTEM_ADMIN']?.allow ?? -1,
    );
    expect(CANONICAL_ROLE_TALLIES['SYSTEM_ADMIN']).toEqual({ allow: 1, conditional: 0, deny: 31 });
  });

  it('grants only active catalogue permissions — never a reserved identifier', () => {
    for (const permission of resolvePlatformPermissions('SYSTEM_ADMIN')) {
      expect(isActivePermission(permission)).toBe(true);
      expect(ACTIVE_PERMISSIONS).toContain(permission);
    }
  });

  it('is ordered by the canonical catalogue and free of duplicates', () => {
    const granted = resolvePlatformPermissions('SYSTEM_ADMIN');
    const expectedOrder = ACTIVE_PERMISSIONS.filter((permission) => granted.includes(permission));

    expect([...granted]).toEqual([...expectedOrder]);
    expect(new Set(granted).size).toBe(granted.length);
  });
});

describe('separation from tenant composition', () => {
  it('keeps SYSTEM_ADMIN out of the tenant matrix (D-038 clauses 12-14)', () => {
    for (const row of Object.values(TENANT_PERMISSION_MATRIX)) {
      expect(Object.keys(row).sort()).toEqual([...TENANT_MEMBERSHIP_ROLES].sort());
      expect(Object.keys(row)).not.toContain('SYSTEM_ADMIN');
    }
  });

  it('never lets a tenant role reach the platform mapping', () => {
    for (const role of TENANT_MEMBERSHIP_ROLES) {
      expect(() =>
        // Deliberate cast: the compiler already rejects this call, and the runtime guard has to
        // reject it as well, because the value arrives from a database column.
        resolvePlatformPermissions(role as unknown as (typeof PLATFORM_ROLES)[number]),
      ).toThrow(PlatformPermissionInvariantError);
    }
  });

  it('never lets a platform role reach tenant derivation', () => {
    expect(() =>
      resolveEffectivePermissions({
        active: true,
        roles: ['SYSTEM_ADMIN'] as unknown as (typeof TENANT_MEMBERSHIP_ROLES)[number][],
        settings: { allowMpaApproval: true, allowBillingSpecialistApproval: true },
      }),
    ).toThrow();
  });

  it('does not grant tariff.manage to any tenant role, with either flag enabled', () => {
    for (const role of TENANT_MEMBERSHIP_ROLES) {
      const granted: readonly Permission[] = resolveEffectivePermissions({
        active: true,
        roles: [role],
        settings: { allowMpaApproval: true, allowBillingSpecialistApproval: true },
      });

      expect(granted).not.toContain('tariff.manage');
    }
  });

  it('orders platform roles by the canonical vocabulary', () => {
    expect([...PLATFORM_ROLES].sort(comparePlatformRoles)).toEqual([...PLATFORM_ROLES]);
    expect(comparePlatformRoles('SYSTEM_ADMIN', 'SYSTEM_ADMIN')).toBe(0);
  });

  it('returns a frozen list that a caller cannot extend', () => {
    const granted = resolvePlatformPermissions('SYSTEM_ADMIN');

    expect(Object.isFrozen(granted)).toBe(true);
    expect(() => (granted as Permission[]).push('audit.read')).toThrow();
  });
});

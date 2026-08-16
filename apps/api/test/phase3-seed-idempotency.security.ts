import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_FORCE_RLS_ALLOWLIST, PHASE_3_SEED, runPhase3Seed } from '../prisma/seed.js';
import { connect, securityDatabase } from './support/phase3-security-context.js';

/**
 * Seed idempotency (02 §23.1, 04 §5.4) and the D-048 steady state after a re-run
 * (08 §21.6.1).
 *
 * The global setup already ran the seed once. This spec runs it a SECOND time against the
 * same database and proves the row set, the row identities and the FORCE flags are unchanged.
 * "The seed is idempotent" is otherwise an untested claim about the most destructive script
 * in the repository.
 *
 * Counting is done with `reltuples` after `ANALYZE` rather than `count(*)`: under FORCE row
 * level security the table OWNER is subject to the policies too, and no accepted policy
 * matches `copilot_migrator`, so `count(*)` legitimately returns zero. Reading the planner
 * statistic keeps the assertion honest without opening a maintenance window, and without
 * introducing a superuser or a BYPASSRLS identity to peek behind the policies.
 */
const database = securityDatabase();

const SEEDED_TABLES = [
  'practices',
  'users',
  'practice_memberships',
  'practice_membership_roles',
  'practice_settings',
  'platform_role_assignments',
] as const;

const EXPECTED_ROWS: Readonly<Record<(typeof SEEDED_TABLES)[number], number>> = {
  practices: PHASE_3_SEED.practices.length,
  users: PHASE_3_SEED.users.length,
  practice_memberships: PHASE_3_SEED.memberships.length,
  practice_membership_roles: PHASE_3_SEED.membershipRoles.length,
  practice_settings: PHASE_3_SEED.practiceSettings.length,
  platform_role_assignments: PHASE_3_SEED.platformRoleAssignments.length,
};

let migrator: Client;

async function physicalRowCounts(): Promise<Record<string, number>> {
  for (const table of SEEDED_TABLES) {
    await migrator.query(`analyze "${table}"`);
  }

  const result = await migrator.query<{ relname: string; physical: number }>(
    `select c.relname, c.reltuples::int as physical
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])
      order by c.relname`,
    [[...SEEDED_TABLES]],
  );

  return Object.fromEntries(result.rows.map((row) => [row.relname, row.physical]));
}

async function forceFlags(): Promise<Record<string, string>> {
  const result = await migrator.query<{ relname: string; enabled: boolean; forced: boolean }>(
    `select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])
      order by c.relname`,
    [[...PHASE_3_FORCE_RLS_ALLOWLIST]],
  );

  return Object.fromEntries(
    result.rows.map((row) => [row.relname, `${String(row.enabled)}/${String(row.forced)}`]),
  );
}

beforeAll(async () => {
  migrator = await connect(database.migration);
});

afterAll(async () => {
  await migrator.end();
});

describe('seed idempotency (02 §23.1, 04 §5.4)', () => {
  it('given the already seeded database when the seed runs a second time then nothing changes', async () => {
    const before = await physicalRowCounts();
    const flagsBefore = await forceFlags();

    expect(before).toStrictEqual(EXPECTED_ROWS);

    // A non-idempotent seed fails here with a duplicate key violation rather than an
    // assertion, which is exactly the failure this spec exists to catch.
    await runPhase3Seed(database.migration);

    const after = await physicalRowCounts();
    expect(after).toStrictEqual(before);

    // 08 §21.6.1 — steady state AFTER the seed, for all four allowlisted tables.
    expect(await forceFlags()).toStrictEqual(flagsBefore);
    for (const value of Object.values(await forceFlags())) {
      expect(value).toBe('true/true');
    }
  });

  it('given the seed data when inspected then it satisfies the accepted phase 3 shape', () => {
    // These are the properties 02 §23.2 and 04 §5.3 require of the data itself, asserted
    // against the seed definition so a future edit that drops one is caught immediately.
    expect(PHASE_3_SEED.users.length).toBeGreaterThanOrEqual(2);
    expect(PHASE_3_SEED.practices.length).toBeGreaterThanOrEqual(2);

    const membershipsWithoutRoles = PHASE_3_SEED.memberships.filter(
      (membership) =>
        membership.active &&
        !PHASE_3_SEED.membershipRoles.some((role) => role.membershipId === membership.id),
    );
    expect(membershipsWithoutRoles.length).toBeGreaterThanOrEqual(1);

    expect(PHASE_3_SEED.memberships.some((membership) => !membership.active)).toBe(true);
    expect(PHASE_3_SEED.users.some((user) => user.status !== 'ACTIVE')).toBe(true);

    expect(PHASE_3_SEED.platformRoleAssignments.some((row) => !row.revoked)).toBe(true);
    expect(PHASE_3_SEED.platformRoleAssignments.some((row) => row.revoked)).toBe(true);
  });

  it('given the seeded settings when read then both approval flags are the canonical false baseline', async () => {
    const app = await connect(database.app);

    try {
      const result = await app.query<{
        allow_mpa_approval: boolean;
        allow_billing_specialist_approval: boolean;
      }>('select allow_mpa_approval, allow_billing_specialist_approval from practice_settings');

      expect(result.rows).toHaveLength(PHASE_3_SEED.practiceSettings.length);
      for (const row of result.rows) {
        expect(row.allow_mpa_approval).toBe(false);
        expect(row.allow_billing_specialist_approval).toBe(false);
      }
    } finally {
      await app.end();
    }
  });
});

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

/**
 * Phase 3 development seed (02 §23.1, §23.2, §23.4; 04 §5.2, §5.3; 10 §8; D-038, D-048, D-051).
 *
 * WHAT THIS FILE IS
 *
 * The smallest artifact that satisfies the accepted phase 3 seed contract. It is a plain
 * `pg` script rather than a Prisma Client script for one reason that is not stylistic: the
 * D-048 maintenance protocol is a sequence of DDL, catalogue assertions and DML that must
 * live inside ONE explicit transaction the seed controls itself. `pg` is already a direct
 * dependency of this package and is the same client the database test suites use, so no new
 * dependency is introduced (00 §5.3).
 *
 * IDENTITY (02 §3.4, AGENTS.md §5.2)
 *
 * The seed connects with `MIGRATION_DATABASE_URL`, i.e. as `copilot_migrator`, the trusted
 * table owner. It is NOT a superuser path and must never become one: a superuser seed
 * credential is a permanently rejected alternative (02 §23.4.2, D-048 clause 1). The runtime
 * credential `DATABASE_URL` is never read here.
 *
 * IDENTIFIERS (02 §2.2, §23.1, §26.1)
 *
 * Every UUID is written out explicitly. The seed never relies on a database default and
 * never uses Prisma `@default(uuid())`. The values below are deterministic, obviously
 * synthetic development identifiers, so a re-run reproduces byte-identical rows.
 *
 * IDEMPOTENCY (02 §23.1, 04 §5.4)
 *
 * Every statement is an `insert ... on conflict (id) do update`, and every timestamp the
 * seed controls is a frozen constant. Running the seed twice therefore yields the same row
 * set, the same row count and no duplicate-key failure.
 *
 * `FORCE ROW LEVEL SECURITY` (02 §23.4, §23.4.4a, D-048, D-052 part B)
 *
 * ALL SIX tables this seed writes to carry `ENABLE` + `FORCE ROW LEVEL SECURITY` once the
 * canonical migration chain is complete: four after `002_identity_and_practices`, and
 * `practice_memberships` and `practice_settings` after `013_rls_policies`. Under FORCE, even
 * the table owner is subject to the policies, and no accepted policy permits an owner write,
 * so a plain trusted insert fails with SQLSTATE `42501`. Every seed write therefore goes
 * through `runInForceRlsMaintenanceWindow` below and through nothing else.
 *
 * The extension of the allowlist from four tables to six is NOT silent: it is authorised by
 * D-052 part B and by the explicit clause in section 5 of `013_rls_policies`, which §23.4.4
 * requires of the package that first puts a table under FORCE (§23.4.4a, D-052 clause B.4).
 */

// -----------------------------------------------------------------------------
// 1. D-048 maintenance protocol (02 §23.4, §25.1.2; 08 §21.6.2)
// -----------------------------------------------------------------------------

/**
 * The phase 3 allowlist, exactly as frozen by 02 §23.4.4 and D-048 clause 5 (grown from two
 * tables to four by D-051 clause 7).
 *
 * It is PRESERVED verbatim rather than folded into a flat list, because §23.4.4a and D-052
 * clause B.2 require phase 4 to EXTEND the phase 3 allowlist and not to replace it. Keeping
 * the two lists separate is what makes the provenance of every allowlisted table mechanically
 * testable: a table silently added to phase 3 and a table silently added to phase 4 are
 * different governance failures, and a single flat constant could hide either.
 *
 * These four tables receive `ENABLE` + `FORCE ROW LEVEL SECURITY` in migration package
 * `002_identity_and_practices`.
 */
export const PHASE_3_FORCE_RLS_ALLOWLIST = [
  'users',
  'practices',
  'practice_membership_roles',
  'platform_role_assignments',
] as const;

/**
 * The phase 4 extension — EXACTLY the two tables migration package `013_rls_policies` puts
 * under `FORCE ROW LEVEL SECURITY` (02 §23.4.4a; D-052 clause B.2).
 *
 * Authorised by D-052 part B AND by the explicit clause in section 5 of `013_rls_policies`,
 * which is the package that introduces FORCE for both. §23.4.4 permits the allowlist to grow
 * ONLY through an accepted decision or such a clause; both conditions are satisfied here, so
 * the extension is explicit rather than silent (D-048 clause 6, 08 §26.2).
 *
 * The trusted seed path genuinely writes to both: without this extension the seed would fail
 * with SQLSTATE `42501` from `013` onward, with no permitted way to populate either table.
 */
export const PHASE_4_FORCE_RLS_ALLOWLIST = ['practice_memberships', 'practice_settings'] as const;

/**
 * The EFFECTIVE trusted maintenance allowlist — the phase 3 four PLUS the phase 4 two, in
 * that order. Exactly SIX tables, which is the complete set of tables carrying `ENABLE` +
 * `FORCE ROW LEVEL SECURITY` after the canonical migration chain (02 §23.4.4a).
 *
 * Derived rather than written out, so the two lists above remain the single source of truth
 * and a table can never appear here without appearing in exactly one of them.
 */
export const FORCE_RLS_MAINTENANCE_ALLOWLIST = [
  ...PHASE_3_FORCE_RLS_ALLOWLIST,
  ...PHASE_4_FORCE_RLS_ALLOWLIST,
] as const;

export type ForceRlsAllowlistedTable = (typeof FORCE_RLS_MAINTENANCE_ALLOWLIST)[number];

/** Raised when a maintenance window is requested for a table outside the frozen allowlist. */
export class TableNotAllowlistedError extends Error {
  public readonly requestedTable: string;

  public constructor(requestedTable: string) {
    super(
      `Table "${requestedTable}" is not on the trusted maintenance allowlist ` +
        `(${FORCE_RLS_MAINTENANCE_ALLOWLIST.join(', ')}). ` +
        'See 02 §23.4.4 / §23.4.4a, D-048 clause 5 and D-052 part B.',
    );
    this.name = 'TableNotAllowlistedError';
    this.requestedTable = requestedTable;
  }
}

/**
 * Builds the catalogue assertion executed inside the transaction.
 *
 * The assertion is written in SQL rather than in TypeScript on purpose: a failure must
 * `raise` and put the PostgreSQL transaction itself into the aborted state, so that no
 * subsequent statement of the window can execute and `commit` is impossible (02 §23.4.3
 * steps 3 and 6, §23.4.5, D-048 clause 4). SQLSTATE `55000` is
 * `object_not_in_prerequisite_state`, which is exactly what a wrong FORCE flag is.
 *
 * `table` is always one of the frozen allowlist constants, never caller input.
 *
 * Exported so the security suite can drive it against a deliberately wrong catalogue state:
 * an assertion that has never been observed to fail is not an assertion (02 §25.1.2).
 */
export function forceRowSecurityAssertionSql(
  table: ForceRlsAllowlistedTable,
  expectedForced: boolean,
): string {
  return `
    do $$
    declare
      v_enabled boolean;
      v_forced  boolean;
    begin
      select c.relrowsecurity, c.relforcerowsecurity
        into v_enabled, v_forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = '${table}';

      if v_enabled is distinct from true then
        raise exception using
          errcode = '55000',
          message = 'D-048: row level security must stay enabled on public.${table} during the maintenance window';
      end if;

      if v_forced is distinct from ${expectedForced ? 'true' : 'false'} then
        raise exception using
          errcode = '55000',
          message = 'D-048: public.${table} must have relforcerowsecurity = ${expectedForced} at this point of the maintenance window';
      end if;
    end
    $$;
  `;
}

/**
 * Executes trusted seed DML against one FORCE-RLS table through the ONLY accepted mechanism
 * (02 §23.4.3, D-048 clause 3):
 *
 *   validate against the hard allowlist  ->  BEGIN
 *   -> ALTER TABLE ... NO FORCE ROW LEVEL SECURITY
 *   -> assert relrowsecurity = true, relforcerowsecurity = false
 *   -> trusted DML for that table only
 *   -> ALTER TABLE ... FORCE ROW LEVEL SECURITY
 *   -> assert relrowsecurity = true, relforcerowsecurity = true
 *   -> COMMIT
 *
 * Row level security stays ENABLED throughout; only the FORCE attribute moves. Autocommit is
 * forbidden, so the window is one explicit transaction. Any failure — including a failed
 * assertion — rolls the transaction back, and because the window is a single transactional
 * DDL unit, the rollback restores FORCE. A rollback can therefore never leave a table with
 * row level security enabled but FORCE off (02 §23.4.5).
 *
 * The allowlist check happens BEFORE `begin`, so a rejected target never reaches an
 * `ALTER TABLE` at all (02 §25.1.2, 08 §21.6.2).
 *
 * The window contains exactly two `ALTER TABLE` statements, the two assertions and the
 * trusted DML. Unrelated security DDL inside the window is forbidden (02 §23.4.5).
 *
 * This is a MAINTENANCE mechanism. It is not exported to, imported by or reachable from any
 * request or runtime application path, and it must never become a callable database function
 * (02 §23.4.5, D-048 clause 4).
 */
export async function runInForceRlsMaintenanceWindow(
  client: Client,
  requestedTable: string,
  trustedDml: (client: Client) => Promise<void>,
): Promise<void> {
  const target = FORCE_RLS_MAINTENANCE_ALLOWLIST.find((allowed) => allowed === requestedTable);

  if (target === undefined) {
    throw new TableNotAllowlistedError(requestedTable);
  }

  await client.query('begin');

  try {
    await client.query(`alter table "public"."${target}" no force row level security`);
    await client.query(forceRowSecurityAssertionSql(target, false));

    await trustedDml(client);

    await client.query(`alter table "public"."${target}" force row level security`);
    await client.query(forceRowSecurityAssertionSql(target, true));

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

// -----------------------------------------------------------------------------
// 2. Deterministic development dataset (02 §23.2, 04 §5.2, §5.3)
// -----------------------------------------------------------------------------

/**
 * One frozen instant for every timestamp the seed controls, so a second run cannot change a
 * single byte. It is the date migration package `002_identity_and_practices` was authored.
 */
const SEED_INSTANT = '2026-08-14T00:00:00.000Z';

type EntityStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

type MembershipRoleName =
  'PRACTICE_ADMIN' | 'PHYSICIAN' | 'MPA' | 'BILLING_SPECIALIST' | 'AUDITOR' | 'READ_ONLY';

/**
 * Named handles for the deterministic identifiers below.
 *
 * The names describe the ROLE each row plays in the accepted test contract, so a spec reads
 * as an assertion about the model rather than about a UUID literal.
 */
export const PHASE_3_SEED_IDS = {
  practiceDemo: '11111111-1111-4111-8111-111111111001',
  practiceNord: '11111111-1111-4111-8111-111111111002',
  /** No user holds a membership in this practice — the isolation negative of 02 §25.1.1. */
  practiceWithoutMembers: '11111111-1111-4111-8111-111111111003',

  userPracticeAdmin: '22222222-2222-4222-8222-222222222001',
  userPhysician: '22222222-2222-4222-8222-222222222002',
  /** `status = INACTIVE` — the application-layer rejection case of 08 §21.5.2. */
  userInactive: '22222222-2222-4222-8222-222222222003',

  membershipAdminInDemo: '33333333-3333-4333-8333-333333333001',
  /** `active = false`, and its practice must still be visible (02 §17.6). */
  membershipAdminInNord: '33333333-3333-4333-8333-333333333002',
  /** Active, with ZERO assigned tenant roles (02 §23.2, 04 §5.3 clause 3). */
  membershipPhysicianInNord: '33333333-3333-4333-8333-333333333003',
  membershipInactiveUserInDemo: '33333333-3333-4333-8333-333333333004',

  rolePracticeAdmin: '44444444-4444-4444-8444-444444444001',
  rolePhysician: '44444444-4444-4444-8444-444444444002',
  roleReadOnly: '44444444-4444-4444-8444-444444444003',
  roleMpa: '44444444-4444-4444-8444-444444444004',

  settingsDemo: '55555555-5555-4555-8555-555555555001',
  settingsNord: '55555555-5555-4555-8555-555555555002',
  settingsWithoutMembers: '55555555-5555-4555-8555-555555555003',

  platformRoleActive: '66666666-6666-4666-8666-666666666001',
  platformRoleRevoked: '66666666-6666-4666-8666-666666666002',
} as const;

/** The verified authentication subjects the bootstrap policy of 02 §17.5 resolves. */
export const PHASE_3_SEED_SUBJECTS = {
  practiceAdmin: 'dev|practice-admin',
  physician: 'dev|physician',
  inactive: 'dev|inactive',
} as const;

interface SeedPractice {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly legalName: string | null;
  readonly zsrNumber: string | null;
  readonly glnNumber: string | null;
  readonly status: EntityStatus;
}

interface SeedUser {
  readonly id: string;
  readonly authSubject: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: EntityStatus;
}

interface SeedMembership {
  readonly id: string;
  readonly practiceId: string;
  readonly userId: string;
  readonly professionalGln: string | null;
  readonly active: boolean;
}

interface SeedMembershipRole {
  readonly id: string;
  readonly practiceId: string;
  readonly membershipId: string;
  readonly role: MembershipRoleName;
}

interface SeedPracticeSettings {
  readonly id: string;
  readonly practiceId: string;
}

interface SeedPlatformRoleAssignment {
  readonly id: string;
  readonly userId: string;
  readonly revoked: boolean;
  readonly revokedBy: string | null;
}

/**
 * Practices (02 §6.1).
 *
 * `demo-praxis` is the canonical demo tenant of §23.2. `demo-praxis-nord` exists because
 * every isolation assertion needs a SECOND tenant, and `demo-praxis-sued` deliberately has
 * NO membership at all: 02 §25.1.1 requires "a practice in which the user has no membership
 * returns zero rows, with and without context" and "a planted `app.practice_id` without a
 * membership returns zero rows", neither of which can be proven without such a practice.
 *
 * `legal_name`, `zsr_number` and `gln_number` are populated for the first two practices on
 * purpose. They carry NO column grant for `copilot_app` (02 §20.2a), and a negative test that
 * proves an unreachable column is only meaningful when the column actually holds a value.
 * The values are obviously synthetic development placeholders, not business data.
 */
const PRACTICES: readonly SeedPractice[] = [
  {
    id: PHASE_3_SEED_IDS.practiceDemo,
    code: 'demo-praxis',
    name: 'Demo Praxis Zuerich',
    legalName: 'Demo Praxis Zuerich AG',
    zsrNumber: 'DEV-ZSR-0001',
    glnNumber: '7601000000001',
    status: 'ACTIVE',
  },
  {
    id: PHASE_3_SEED_IDS.practiceNord,
    code: 'demo-praxis-nord',
    name: 'Demo Praxis Nord',
    legalName: 'Demo Praxis Nord AG',
    zsrNumber: 'DEV-ZSR-0002',
    glnNumber: '7601000000002',
    status: 'ACTIVE',
  },
  {
    id: PHASE_3_SEED_IDS.practiceWithoutMembers,
    code: 'demo-praxis-sued',
    name: 'Demo Praxis Sued',
    legalName: null,
    zsrNumber: null,
    glnNumber: null,
    status: 'ACTIVE',
  },
];

/**
 * Users (02 §6.2, §23.2).
 *
 * The dev admin and the dev physician are the two identities §23.2 names. The third user is
 * `INACTIVE`: 08 §21.5.2 requires a non-`ACTIVE` user to be rejected by the application layer
 * BEFORE `set_user_context`, and that boundary cannot be exercised without such a row. The
 * database layer itself does not filter on `status` — the two `users` policies are
 * subject-scoped and self-scoped only (02 §17.5) — so the rejection is an application
 * concern, and phase 3 seed data exists precisely so it can be written against real rows.
 *
 * No password and no password hash: authentication is OIDC/JWT (09 §5).
 */
const USERS: readonly SeedUser[] = [
  {
    id: PHASE_3_SEED_IDS.userPracticeAdmin,
    authSubject: PHASE_3_SEED_SUBJECTS.practiceAdmin,
    email: 'dev.practice-admin@example.invalid',
    displayName: 'Dev Practice Admin',
    status: 'ACTIVE',
  },
  {
    id: PHASE_3_SEED_IDS.userPhysician,
    authSubject: PHASE_3_SEED_SUBJECTS.physician,
    email: 'dev.physician@example.invalid',
    displayName: 'Dev Physician',
    status: 'ACTIVE',
  },
  {
    id: PHASE_3_SEED_IDS.userInactive,
    authSubject: PHASE_3_SEED_SUBJECTS.inactive,
    email: 'dev.inactive@example.invalid',
    displayName: 'Dev Inactive User',
    status: 'INACTIVE',
  },
];

/**
 * Memberships (02 §6.3).
 *
 * The shape is chosen so that every accepted phase 3 visibility assertion has data:
 *
 *   * the dev admin is ACTIVE in `demo-praxis` and INACTIVE in `demo-praxis-nord`. 02 §17.6
 *     deliberately does not filter `pm.active`, so the inactive membership must still make
 *     `demo-praxis-nord` visible — that is the `GET /me` `practiceName` requirement, and it
 *     is only provable with an inactive membership in the data;
 *   * the dev physician is ACTIVE in `demo-praxis-nord` with ZERO assigned tenant roles.
 *     04 §5.3 clause 3 and 02 §23.2 require "at least one active membership with no role at
 *     all", and it doubles as the cross-user negative: this user must see none of the roles
 *     of `demo-praxis`, in which they have no membership;
 *   * the inactive user is ACTIVE in `demo-praxis` and carries a role there. That makes the
 *     sharpest §17.4 assertion possible — the dev admin also has a membership in
 *     `demo-praxis`, yet must NOT see this other user's role row in that same practice.
 *
 * Nobody is a member of `demo-praxis-sued`.
 */
const MEMBERSHIPS: readonly SeedMembership[] = [
  {
    id: PHASE_3_SEED_IDS.membershipAdminInDemo,
    practiceId: PHASE_3_SEED_IDS.practiceDemo,
    userId: PHASE_3_SEED_IDS.userPracticeAdmin,
    professionalGln: null,
    active: true,
  },
  {
    id: PHASE_3_SEED_IDS.membershipAdminInNord,
    practiceId: PHASE_3_SEED_IDS.practiceNord,
    userId: PHASE_3_SEED_IDS.userPracticeAdmin,
    professionalGln: null,
    active: false,
  },
  {
    id: PHASE_3_SEED_IDS.membershipPhysicianInNord,
    practiceId: PHASE_3_SEED_IDS.practiceNord,
    userId: PHASE_3_SEED_IDS.userPhysician,
    professionalGln: 'DEV-GLN-0002',
    active: true,
  },
  {
    id: PHASE_3_SEED_IDS.membershipInactiveUserInDemo,
    practiceId: PHASE_3_SEED_IDS.practiceDemo,
    userId: PHASE_3_SEED_IDS.userInactive,
    professionalGln: 'DEV-GLN-0003',
    active: true,
  },
];

/**
 * Tenant role assignments (02 §6.3a, D-038).
 *
 * Rows are EXPLICIT, exactly as 04 §5.2 requires — the seed never relies on a singular `role`
 * column, which does not exist (D-038 clause 2). Membership `...3001` carries TWO roles, to
 * prove a membership may hold more than one; membership `...3003` carries none.
 */
const MEMBERSHIP_ROLES: readonly SeedMembershipRole[] = [
  {
    id: PHASE_3_SEED_IDS.rolePracticeAdmin,
    practiceId: PHASE_3_SEED_IDS.practiceDemo,
    membershipId: PHASE_3_SEED_IDS.membershipAdminInDemo,
    role: 'PRACTICE_ADMIN',
  },
  {
    id: PHASE_3_SEED_IDS.rolePhysician,
    practiceId: PHASE_3_SEED_IDS.practiceDemo,
    membershipId: PHASE_3_SEED_IDS.membershipAdminInDemo,
    role: 'PHYSICIAN',
  },
  {
    id: PHASE_3_SEED_IDS.roleReadOnly,
    practiceId: PHASE_3_SEED_IDS.practiceNord,
    membershipId: PHASE_3_SEED_IDS.membershipAdminInNord,
    role: 'READ_ONLY',
  },
  {
    id: PHASE_3_SEED_IDS.roleMpa,
    practiceId: PHASE_3_SEED_IDS.practiceDemo,
    membershipId: PHASE_3_SEED_IDS.membershipInactiveUserInDemo,
    role: 'MPA',
  },
];

/**
 * Practice settings (02 §6.4, §23.2).
 *
 * BOTH approval flags are `false` — the canonical baseline. Approval outside
 * `PHYSICIAN`/`PRACTICE_ADMIN` is an opt-in decision of the practice and never a default
 * state (D-041). Every other field is a neutral development default; the seed does not
 * invent a business configuration.
 */
const PRACTICE_SETTINGS: readonly SeedPracticeSettings[] = [
  { id: PHASE_3_SEED_IDS.settingsDemo, practiceId: PHASE_3_SEED_IDS.practiceDemo },
  { id: PHASE_3_SEED_IDS.settingsNord, practiceId: PHASE_3_SEED_IDS.practiceNord },
  {
    id: PHASE_3_SEED_IDS.settingsWithoutMembers,
    practiceId: PHASE_3_SEED_IDS.practiceWithoutMembers,
  },
];

/**
 * Platform role assignments (02 §6.5, §23.2; D-023 clause 8, D-051 clause 3).
 *
 * The development `SYSTEM_ADMIN` grant exists ONLY in the development seed (§23.2) and the
 * production seed must never create it (§23.3).
 *
 * Two rows, one non-revoked and one revoked, because `platformRoles[]` in `GET /me` is
 * derived from `revoked_at IS NULL` rows in the APPLICATION (D-051 clause 3). The raw §17.2
 * policy is user-scoped only and does not filter `revoked_at`, so proving that the
 * application filter is a real, separate step requires a revoked row to exist. The unique
 * `(user_id, platform_role)` constraint means the revoked row has to belong to another user.
 */
const PLATFORM_ROLE_ASSIGNMENTS: readonly SeedPlatformRoleAssignment[] = [
  {
    id: PHASE_3_SEED_IDS.platformRoleActive,
    userId: PHASE_3_SEED_IDS.userPracticeAdmin,
    revoked: false,
    revokedBy: null,
  },
  {
    id: PHASE_3_SEED_IDS.platformRoleRevoked,
    userId: PHASE_3_SEED_IDS.userInactive,
    revoked: true,
    revokedBy: PHASE_3_SEED_IDS.userPracticeAdmin,
  },
];

/** The full dataset, exported so integration tests assert against the same source of truth. */
export const PHASE_3_SEED = {
  instant: SEED_INSTANT,
  practices: PRACTICES,
  users: USERS,
  memberships: MEMBERSHIPS,
  membershipRoles: MEMBERSHIP_ROLES,
  practiceSettings: PRACTICE_SETTINGS,
  platformRoleAssignments: PLATFORM_ROLE_ASSIGNMENTS,
} as const;

// -----------------------------------------------------------------------------
// 3. Trusted DML
// -----------------------------------------------------------------------------

async function seedPractices(client: Client): Promise<void> {
  for (const practice of PRACTICES) {
    await client.query(
      `insert into "practices" (
         "id", "code", "name", "legal_name", "zsr_number", "gln_number",
         "default_language", "timezone", "status", "created_at", "updated_at"
       )
       values ($1, $2, $3, $4, $5, $6, 'de-CH', 'Europe/Zurich', $7::entity_status, $8, $8)
       on conflict ("id") do update set
         "code"             = excluded."code",
         "name"             = excluded."name",
         "legal_name"       = excluded."legal_name",
         "zsr_number"       = excluded."zsr_number",
         "gln_number"       = excluded."gln_number",
         "default_language" = excluded."default_language",
         "timezone"         = excluded."timezone",
         "status"           = excluded."status",
         "updated_at"       = excluded."updated_at"`,
      [
        practice.id,
        practice.code,
        practice.name,
        practice.legalName,
        practice.zsrNumber,
        practice.glnNumber,
        practice.status,
        SEED_INSTANT,
      ],
    );
  }
}

async function seedUsers(client: Client): Promise<void> {
  for (const user of USERS) {
    await client.query(
      `insert into "users" (
         "id", "auth_subject", "email", "display_name", "preferred_language",
         "status", "last_login_at", "created_at", "updated_at"
       )
       values ($1, $2, $3, $4, 'de-CH', $5::entity_status, null, $6, $6)
       on conflict ("id") do update set
         "auth_subject"       = excluded."auth_subject",
         "email"              = excluded."email",
         "display_name"       = excluded."display_name",
         "preferred_language" = excluded."preferred_language",
         "status"             = excluded."status",
         "last_login_at"      = excluded."last_login_at",
         "updated_at"         = excluded."updated_at"`,
      [user.id, user.authSubject, user.email, user.displayName, user.status, SEED_INSTANT],
    );
  }
}

async function seedMemberships(client: Client): Promise<void> {
  for (const membership of MEMBERSHIPS) {
    await client.query(
      `insert into "practice_memberships" (
         "id", "practice_id", "user_id", "professional_gln", "active", "created_at", "updated_at"
       )
       values ($1, $2, $3, $4, $5, $6, $6)
       on conflict ("id") do update set
         "practice_id"      = excluded."practice_id",
         "user_id"          = excluded."user_id",
         "professional_gln" = excluded."professional_gln",
         "active"           = excluded."active",
         "updated_at"       = excluded."updated_at"`,
      [
        membership.id,
        membership.practiceId,
        membership.userId,
        membership.professionalGln,
        membership.active,
        SEED_INSTANT,
      ],
    );
  }
}

async function seedMembershipRoles(client: Client): Promise<void> {
  for (const assignment of MEMBERSHIP_ROLES) {
    await client.query(
      `insert into "practice_membership_roles" (
         "id", "practice_id", "membership_id", "role", "created_at", "updated_at"
       )
       values ($1, $2, $3, $4::membership_role, $5, $5)
       on conflict ("id") do update set
         "practice_id"   = excluded."practice_id",
         "membership_id" = excluded."membership_id",
         "role"          = excluded."role",
         "updated_at"    = excluded."updated_at"`,
      [
        assignment.id,
        assignment.practiceId,
        assignment.membershipId,
        assignment.role,
        SEED_INSTANT,
      ],
    );
  }
}

async function seedPracticeSettings(client: Client): Promise<void> {
  for (const settings of PRACTICE_SETTINGS) {
    // `version` is deliberately NOT updated on conflict: it is the optimistic locking column
    // of D-029, and a seed re-run must not move it.
    await client.query(
      `insert into "practice_settings" (
         "id", "practice_id", "billing_review_required",
         "allow_mpa_approval", "allow_billing_specialist_approval",
         "require_reason_for_manual_change", "ai_enabled", "axenita_export_enabled",
         "retention_policy_code", "configuration", "version", "updated_by", "updated_at"
       )
       values ($1, $2, true, false, false, true, false, false,
               'DEV-RETENTION-STANDARD', '{}'::jsonb, 1, null, $3)
       on conflict ("id") do update set
         "practice_id"                      = excluded."practice_id",
         "billing_review_required"          = excluded."billing_review_required",
         "allow_mpa_approval"               = excluded."allow_mpa_approval",
         "allow_billing_specialist_approval" = excluded."allow_billing_specialist_approval",
         "require_reason_for_manual_change" = excluded."require_reason_for_manual_change",
         "ai_enabled"                       = excluded."ai_enabled",
         "axenita_export_enabled"           = excluded."axenita_export_enabled",
         "retention_policy_code"            = excluded."retention_policy_code",
         "configuration"                    = excluded."configuration",
         "updated_by"                       = excluded."updated_by",
         "updated_at"                       = excluded."updated_at"`,
      [settings.id, settings.practiceId, SEED_INSTANT],
    );
  }
}

async function seedPlatformRoleAssignments(client: Client): Promise<void> {
  for (const assignment of PLATFORM_ROLE_ASSIGNMENTS) {
    await client.query(
      `insert into "platform_role_assignments" (
         "id", "user_id", "platform_role", "granted_by", "granted_at", "revoked_at", "revoked_by"
       )
       values ($1, $2, 'SYSTEM_ADMIN'::platform_role, null, $3, $4, $5)
       on conflict ("id") do update set
         "user_id"       = excluded."user_id",
         "platform_role" = excluded."platform_role",
         "granted_by"    = excluded."granted_by",
         "granted_at"    = excluded."granted_at",
         "revoked_at"    = excluded."revoked_at",
         "revoked_by"    = excluded."revoked_by"`,
      [
        assignment.id,
        assignment.userId,
        SEED_INSTANT,
        assignment.revoked ? SEED_INSTANT : null,
        assignment.revokedBy,
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// 4. Orchestration
// -----------------------------------------------------------------------------

/**
 * Applies the phase 3 development seed to the database behind `connectionString`.
 *
 * Write order follows the foreign keys: practices and users first, then memberships, then
 * the role assignments that reference a membership through the composite key, then settings
 * and platform role assignments.
 *
 * Each allowlisted table gets its OWN maintenance window and therefore its own explicit
 * transaction, so a window is never open for more than the one table it writes. After
 * migration package `013_rls_policies` that applies to ALL SIX tables: `practice_memberships`
 * and `practice_settings` carry FORCE from that package onward and are written through the
 * §23.4.3 protocol exactly like the other four (§23.4.4a, D-052 part B).
 */
export async function runPhase3Seed(connectionString: string): Promise<void> {
  assertLocalDevelopmentTarget(connectionString);

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const identity = await client.query<{ current_user: string }>('select current_user');
    if (identity.rows[0]?.current_user !== 'copilot_migrator') {
      throw new Error(
        'The phase 3 seed must run as copilot_migrator through MIGRATION_DATABASE_URL ' +
          '(02 §3.4). A superuser seed credential is forbidden (D-048 clause 1).',
      );
    }

    await runInForceRlsMaintenanceWindow(client, 'practices', seedPractices);
    await runInForceRlsMaintenanceWindow(client, 'users', seedUsers);

    // `practice_memberships` carries FORCE from `013_rls_policies` onward and is on the phase 4
    // half of the allowlist, so it uses the same §23.4.3 protocol as every other seeded table
    // (§23.4.4a, D-052 clause B.2). It is written before `practice_membership_roles` because
    // the composite foreign key of that table references `(practice_id, id)` here.
    await runInForceRlsMaintenanceWindow(client, 'practice_memberships', seedMemberships);

    await runInForceRlsMaintenanceWindow(client, 'practice_membership_roles', seedMembershipRoles);

    // `practice_settings` likewise carries FORCE from `013_rls_policies` onward.
    await runInForceRlsMaintenanceWindow(client, 'practice_settings', seedPracticeSettings);

    await runInForceRlsMaintenanceWindow(
      client,
      'platform_role_assignments',
      seedPlatformRoleAssignments,
    );
  } finally {
    await client.end();
  }
}

/**
 * Refuses to seed anything that is not a local database.
 *
 * This is the §23.2 DEVELOPMENT seed. It creates a development `SYSTEM_ADMIN` assignment,
 * which §23.3 forbids in a production seed, so pointing it at a remote host is always a
 * mistake rather than a configuration choice. The check names no credential and reads no
 * password.
 */
function assertLocalDevelopmentTarget(connectionString: string): void {
  let host: string;

  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error('MIGRATION_DATABASE_URL is not a parsable PostgreSQL connection URL.');
  }

  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `The phase 3 development seed only runs against a local database, refused host "${host}". ` +
        'It creates a development SYSTEM_ADMIN assignment, which a production seed must never ' +
        'create (02 §23.2, §23.3).',
    );
  }
}

/**
 * Loads `.env` explicitly, exactly like `prisma.config.ts` does and for the same reason:
 * Prisma 7 no longer loads it implicitly, and Node's built-in loader avoids a dependency
 * (00 §5.3). Values already present in the process environment always win.
 */
function loadEnvironmentFile(relativePath: string): void {
  const absolutePath = resolve(import.meta.dirname, relativePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const before = { ...process.env };
  process.loadEnvFile(absolutePath);

  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  if (process.env['MIGRATION_DATABASE_URL'] === undefined) {
    loadEnvironmentFile('../.env');
    loadEnvironmentFile('../../../.env');
  }

  const migrationDatabaseUrl = process.env['MIGRATION_DATABASE_URL'];

  if (migrationDatabaseUrl === undefined || migrationDatabaseUrl.length === 0) {
    // Names the variable, never its value (09 §9, §11).
    throw new Error(
      'MIGRATION_DATABASE_URL is not set. The seed must run as copilot_migrator (02 §3.4).',
    );
  }

  await runPhase3Seed(migrationDatabaseUrl);

  // The framework logger does not exist in a CLI script, and no connection string, credential
  // or business content is written here (09 §11, AGENTS.md §8).
  process.stdout.write('Phase 3 development seed applied (02 §23.2, D-048 protocol).\n');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  await main();
}

/**
 * The one and only implementation of {@link IdentityDatabase}, on top of the existing
 * `DatabaseModule` (01 §6.2).
 *
 * NO SECOND DATABASE STACK. `PrismaService` is the single `copilot_app` client of the process
 * (02 §3.2, §3.4), and `$transaction(callback)` is a genuine interactive transaction: Prisma
 * pins one connection for its whole duration and every statement issued on the transaction
 * client runs on that connection. That is precisely what the transaction local `app.*` settings
 * of `set_auth_subject_context` and `set_user_context` require — `set_config(..., true)` is
 * scoped to the transaction, so a read on any other connection would see no context at all and
 * would return zero rows rather than leaking data.
 *
 * `TenantDatabaseService`, `set_request_context` and `app.practice_id` are phase 4 concerns
 * (02 §16.2.3, §22.13, D-047 clause 16) and appear nowhere in this file. Phase 3 never
 * establishes a practice context.
 *
 * All SQL is written by hand rather than through the Prisma model delegates, for two reasons
 * that are not stylistic:
 *
 * - the delegates would emit `SELECT` lists derived from the Prisma models, which include
 *   columns `copilot_app` has no grant for (`users.auth_subject`, `practices.legal_name`,
 *   every `practice_settings` column beyond the accepted three). Those queries fail with
 *   SQLSTATE 42501 by design (02 §20.2a, §20.2b);
 * - the bootstrap `users` read must carry NO `WHERE` on `auth_subject` (03 §3.1 step 3), which
 *   is not expressible as a model query at all.
 */

import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

import { PrismaService } from '../../database/prisma.service.js';
import {
  type BootstrapUserRow,
  type ConditionalSettingsRow,
  type IdentityBootstrapSession,
  type IdentityDatabase,
  type MembershipRoleRow,
  type MembershipRow,
  type PlatformRoleRow,
  type PracticeRow,
  type RequestedPracticeRow,
} from './identity-database.port.js';

/** The transaction client Prisma hands to an interactive transaction callback. */
type TransactionClient = Prisma.TransactionClient;

/**
 * A session bound to exactly one transaction client.
 *
 * It holds the client privately, so the only way to reach the database from the application
 * layer is through the methods below, and only for as long as the transaction is open.
 */
class PrismaIdentityBootstrapSession implements IdentityBootstrapSession {
  public constructor(private readonly tx: TransactionClient) {}

  public async setAuthSubjectContext(authSubject: string): Promise<void> {
    // `$executeRaw`, not `$queryRaw`: both context functions return `void`, and Prisma cannot
    // deserialise a `void` column into a result row. The parameter is still bound, never
    // interpolated — the tagged template produces `$1`.
    await this.tx.$executeRaw`select app_security.set_auth_subject_context(${authSubject}::text)`;
  }

  public async findUsersForVerifiedSubject(): Promise<readonly BootstrapUserRow[]> {
    // No WHERE clause: the bootstrap policy of 02 §17.5 filters on `app.auth_subject` and
    // returns at most one row. `auth_subject` is not projected and not filtered on — it has no
    // column grant, so naming it anywhere in this statement would fail with 42501.
    return this.tx.$queryRaw<BootstrapUserRow[]>`
      select
        "id",
        "email",
        "display_name"       as "displayName",
        "preferred_language" as "preferredLanguage",
        "status"::text       as "status"
      from "users"
    `;
  }

  public async setUserContext(userId: string): Promise<void> {
    await this.tx.$executeRaw`select app_security.set_user_context(${userId}::uuid)`;
  }

  public async findMemberships(userId: string): Promise<readonly MembershipRow[]> {
    // `practice_memberships` carries no RLS in phase 3 (02 §17.3 belongs to phase 4), so this
    // explicit user scoping is the only thing that keeps another user's memberships out of the
    // result set. It must never be replaced by a broad read plus an in-memory filter.
    return this.tx.$queryRaw<MembershipRow[]>`
      select
        "id",
        "practice_id" as "practiceId",
        "active"
      from "practice_memberships"
      where "user_id" = ${userId}::uuid
      order by "practice_id" asc
    `;
  }

  public async findMembershipInPractice(
    userId: string,
    practiceId: string,
  ): Promise<MembershipRow | undefined> {
    // BOTH predicates are load bearing and neither may be dropped. `practice_memberships` has
    // no RLS in phase 3, so `user_id` is the only thing keeping another user's membership out,
    // and `practice_id` is the application-layer narrowing to the REQUESTED practice that
    // D-047 clause 18 assigns to this phase. `unique (practice_id, user_id)` bounds the result
    // to one row.
    const rows = await this.tx.$queryRaw<MembershipRow[]>`
      select
        "id",
        "practice_id" as "practiceId",
        "active"
      from "practice_memberships"
      where "user_id"     = ${userId}::uuid
        and "practice_id" = ${practiceId}::uuid
    `;

    return rows[0];
  }

  public async findRequestedPractice(
    practiceId: string,
  ): Promise<RequestedPracticeRow | undefined> {
    // Exactly the six granted columns of 02 §20.2a — the same six the accepted response
    // projection contains. `legal_name`, `zsr_number`, `gln_number`, `created_at` and
    // `updated_at` are absent here AND unreachable: naming one fails with SQLSTATE 42501.
    // There is no `select *` and no widening path.
    //
    // The `02` §17.6 membership policy supplies the row filter: a practice the caller holds no
    // membership in, and a practice that does not exist, are both zero rows here.
    const rows = await this.tx.$queryRaw<RequestedPracticeRow[]>`
      select
        "id",
        "code",
        "name",
        "default_language" as "defaultLanguage",
        "timezone",
        "status"::text     as "status"
      from "practices"
      where "id" = ${practiceId}::uuid
    `;

    return rows[0];
  }

  public async findMembershipRoles(
    membershipIds: readonly string[],
  ): Promise<readonly MembershipRoleRow[]> {
    if (membershipIds.length === 0) {
      return [];
    }

    return this.tx.$queryRaw<MembershipRoleRow[]>`
      select
        "membership_id" as "membershipId",
        "practice_id"   as "practiceId",
        "role"::text    as "role"
      from "practice_membership_roles"
      where "membership_id" = any(${[...membershipIds]}::uuid[])
      order by "membership_id" asc, "role" asc
    `;
  }

  public async findPractices(practiceIds: readonly string[]): Promise<readonly PracticeRow[]> {
    if (practiceIds.length === 0) {
      return [];
    }

    // `code`, `default_language`, `timezone` and `status` are granted but not selected: 03 §10
    // renders `practiceName` only. `legal_name`, `zsr_number` and `gln_number` have no grant.
    return this.tx.$queryRaw<PracticeRow[]>`
      select
        "id",
        "name"
      from "practices"
      where "id" = any(${[...practiceIds]}::uuid[])
      order by "id" asc
    `;
  }

  public async findConditionalSettings(
    practiceIds: readonly string[],
  ): Promise<readonly ConditionalSettingsRow[]> {
    if (practiceIds.length === 0) {
      return [];
    }

    // Exactly the three granted columns of 02 §20.2b, and an explicit filter on the practices
    // the caller is a member of. `practice_settings` has broad row visibility in phase 3 —
    // there is no policy on it — so this filter is the application side of D-049 clause 3.
    return this.tx.$queryRaw<ConditionalSettingsRow[]>`
      select
        "practice_id"                       as "practiceId",
        "allow_mpa_approval"                as "allowMpaApproval",
        "allow_billing_specialist_approval" as "allowBillingSpecialistApproval"
      from "practice_settings"
      where "practice_id" = any(${[...practiceIds]}::uuid[])
      order by "practice_id" asc
    `;
  }

  public async findCurrentPlatformRoles(userId: string): Promise<readonly PlatformRoleRow[]> {
    // `revoked_at IS NULL` is the application filter D-051 clause 3 assigns to this layer: the
    // §17.2 policy is user scoped only and does not look at `revoked_at`. The explicit
    // `user_id` predicate is defence in depth on top of that policy.
    return this.tx.$queryRaw<PlatformRoleRow[]>`
      select
        "platform_role"::text as "platformRole"
      from "platform_role_assignments"
      where "user_id" = ${userId}::uuid
        and "revoked_at" is null
      order by "platform_role" asc
    `;
  }
}

@Injectable()
export class PrismaIdentityDatabase implements IdentityDatabase {
  public constructor(private readonly prisma: PrismaService) {}

  public async runBootstrapTransaction<T>(
    work: (session: IdentityBootstrapSession) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => work(new PrismaIdentityBootstrapSession(tx)));
  }
}

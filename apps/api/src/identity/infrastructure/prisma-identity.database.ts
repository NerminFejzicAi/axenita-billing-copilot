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
 * `set_request_context` (02 §16.2.3) is exposed here as ONE session method — the single accepted
 * method for establishing `app.practice_id`, shared by the internal `/me` adaptation of D-053 and
 * by the tenant request pipeline of `GET /practices/{practiceId}`. The function call is the ONLY
 * way this file touches that GUC: there is no `set_config('app.practice_id', ...)` anywhere, so
 * the clear-before-validate ordering and the ACTIVE-membership check of D-033 clauses 10-12
 * cannot be bypassed. No second session method for that GUC exists and none may be added.
 *
 * No `TenantDatabaseService` class accompanies it. The property that name stands for (D-006,
 * 01 §6.2) — every tenant statement on one pinned connection inside one interactive transaction
 * with an established request context — is what this file already IS. A second facade would own
 * no client, open no transaction and hold no connection of its own, so it would add a name and
 * no control.
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
  TenantContextRejectedError,
  type BootstrapUserRow,
  type ConditionalSettingsRow,
  type IdentityBootstrapSession,
  type IdentityDatabase,
  type MembershipRoleRow,
  type MembershipRow,
  type PlatformRoleRow,
  type PracticeRow,
  type PracticeSettingsAssignment,
  type PracticeSettingsRow,
  type PracticeSettingsUpdate,
  type RequestedPracticeRow,
} from './identity-database.port.js';

/** The transaction client Prisma hands to an interactive transaction callback. */
type TransactionClient = Prisma.TransactionClient;

/**
 * `insufficient_privilege` — the SQLSTATE `app_security.set_request_context` raises for every
 * one of its three refusals (`02` §16.2.3, D-033 clauses 9–11).
 */
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * The exact rendered SQLSTATE token of a failed Prisma raw statement.
 *
 * The shipped stack renders a driver failure as, literally:
 *
 *     Invalid `prisma.$executeRaw()` invocation:
 *
 *     Raw query failed. Code: `42501`. Message: `User context is not established`
 *
 * The capture group is the SQLSTATE and the backticks are the delimiters, so the pattern matches
 * a POSITION in the driver's own format rather than an occurrence of five digits anywhere in the
 * text. Only the FIRST match is ever consulted — see {@link rendersInsufficientPrivilege}.
 */
const RENDERED_SQLSTATE = /Raw query failed\. Code: `([^`]*)`\./;

/** Narrowing helper: an indexable object, which neither `null` nor a primitive is. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether the error carries SQLSTATE `42501` in a STRUCTURED position the shipped driver uses.
 *
 * THE SHAPE IS RE-DERIVED, NOT ASSUMED. Against Prisma 7.9.1 with `@prisma/adapter-pg` 7.9.1 and
 * `pg` 8.23.0, a real `42501` from `app_security.set_request_context` arrives as:
 *
 *     PrismaClientKnownRequestError {
 *       code: 'P2010',                                   <-- Prisma's code, NOT the SQLSTATE
 *       meta: { driverAdapterError: { name: 'DriverAdapterError',
 *               cause: { originalCode: '42501', code: '42501', kind: 'postgres', ... } } },
 *       // no `cause` property at all
 *     }
 *
 * That is why the previous `.code` / `.meta.code` / `cause`-chain branches all missed and only
 * the message fallback ever fired: `code` is `P2010`, `meta` carries no `code`, and the error
 * exposes no `cause` to walk. The SQLSTATE nevertheless IS recoverable structurally — at
 * `meta.driverAdapterError.cause.originalCode` — so this check reads that position directly,
 * which needs no new dependency, no widened `catch` and no change to the database stack.
 *
 * Each position is compared for EXACT EQUALITY with the one SQLSTATE this translation covers.
 * The code is never pattern-matched as "some five-character SQLSTATE", because Prisma's own
 * `P2010` would satisfy such a pattern and would then be mistaken for a server code. `42883`,
 * `22P02` and every other SQLSTATE therefore fall through untouched.
 *
 * The bounded descent covers exactly two links — the adapter's `meta.driverAdapterError.cause`
 * and a plain `cause` — so a driver that reports the SQLSTATE at the top level (`pg`'s own
 * `DatabaseError.code`) or wraps it one level deeper is still recognised, without the walk ever
 * becoming an open-ended search.
 */
function hasInsufficientPrivilegeSqlState(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) {
      return false;
    }

    // `originalCode` is where `@prisma/adapter-pg` puts the server's SQLSTATE; `code` is where
    // a bare `pg` `DatabaseError` puts it. Both are exact positions, never substrings.
    if (
      current['originalCode'] === INSUFFICIENT_PRIVILEGE ||
      current['code'] === INSUFFICIENT_PRIVILEGE
    ) {
      return true;
    }

    const meta = current['meta'];
    const driverAdapterError = isRecord(meta) ? meta['driverAdapterError'] : undefined;

    current = isRecord(driverAdapterError) ? driverAdapterError['cause'] : current['cause'];
  }

  return false;
}

/**
 * Whether the RENDERED driver message reports SQLSTATE `42501` in the driver's own code position.
 *
 * This is the fallback for a future driver that stops exposing the structured position, and it
 * is deliberately not a substring test. `message.includes('42501')` — the previous implementation
 * — would classify `new Error('42501')`, a practice name containing those digits, or a server
 * message that merely quotes them.
 *
 * BOUND VALUES CANNOT REACH THE DECISION. Only the FIRST match is consulted, and the driver
 * always renders its own `Raw query failed. Code: ...` segment before the server's message. A
 * value that smuggled the token into the message segment — a `practiceId` crafted to appear
 * inside an `invalid input syntax for type uuid: "..."` text, say — therefore lands strictly
 * AFTER the authoritative token and cannot displace it. The captured code of that statement is
 * `22P02`, and `22P02` is not `42501`.
 */
function rendersInsufficientPrivilege(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return RENDERED_SQLSTATE.exec(error.message)?.[1] === INSUFFICIENT_PRIVILEGE;
}

/**
 * Whether a driver error is a PostgreSQL `insufficient_privilege` failure.
 *
 * Structured position first, rendered position second. A translation that stops working here
 * fails OPEN — it would turn a refused tenant context into an internal error instead of the
 * accepted `403` — which is why the rendered fallback is kept at all; it is kept EXACT so that
 * it cannot fire on anything but the driver's own code position.
 *
 * Recognition says only "this statement failed with 42501". WHICH statement is not this
 * function's business and never becomes a global rule: the single `catch` that consults it wraps
 * exactly one call, so an `insufficient_privilege` raised anywhere else is unaffected.
 */
function isInsufficientPrivilege(error: unknown): boolean {
  return hasInsufficientPrivilegeSqlState(error) || rendersInsufficientPrivilege(error);
}

/**
 * The SQL of ONE accepted assignment — column identifier, `=`, bound parameter, explicit cast.
 *
 * THIS IS THE WHOLE OF THE SQL-INJECTION ARGUMENT FOR THE SETTINGS WRITE, so it is worth being
 * precise about what is and is not derived from the request:
 *
 * - the COLUMN NAME is a source-code literal inside this function, selected by an exhaustive
 *   `switch` over a closed union of seven `field` discriminants. No client string reaches an
 *   identifier position, and there is no `Prisma.raw`, no `$queryRawUnsafe`, no
 *   `$executeRawUnsafe` and no string concatenation of SQL anywhere on this path. Building the
 *   `SET` list from `Object.keys(body)` — the shape this design exists to prevent — would put a
 *   client-controlled string exactly where the identifier goes;
 * - the VALUE is always a BOUND PARAMETER. `Prisma.sql` is the `sql-template-tag` tag, so every
 *   interpolation becomes a placeholder and its value travels out of band. That is as true of the
 *   retention string as of the booleans;
 * - the union is CLOSED, so adding an eighth mutable field is a compile error here rather than a
 *   silent widening of the accepted `UPDATE` surface (D-055 clause 18).
 *
 * WHY THE RETENTION CAST IS `::text` AND NOT `::varchar(100)`
 *
 * A `varchar(n)` CAST in PostgreSQL truncates silently — `select 'abcd'::varchar(3)` yields
 * `abc` with no error — whereas ASSIGNING an over-long value into a `varchar(100)` COLUMN raises
 * `22001` (`string_data_right_truncation`). Casting the parameter to `varchar(100)` would
 * therefore defeat the database's own last line of defence and quietly persist a truncated
 * retention code the caller never sent. `::text` preserves the value exactly and leaves the
 * column assignment to enforce the bound. The application's `@MaxLength(100)` is the normal
 * barrier and refuses such an input as `422` long before this statement; the column stays the
 * backstop it was designed to be.
 *
 * The boolean casts are `::boolean` for the same reason every read here casts: the parameter type
 * is pinned in the statement rather than inferred from the driver's serialisation.
 */
function assignmentSql(assignment: PracticeSettingsAssignment): Prisma.Sql {
  switch (assignment.field) {
    case 'billingReviewRequired':
      return Prisma.sql`"billing_review_required" = ${assignment.value}::boolean`;
    case 'allowMpaApproval':
      return Prisma.sql`"allow_mpa_approval" = ${assignment.value}::boolean`;
    case 'allowBillingSpecialistApproval':
      return Prisma.sql`"allow_billing_specialist_approval" = ${assignment.value}::boolean`;
    case 'requireReasonForManualChange':
      return Prisma.sql`"require_reason_for_manual_change" = ${assignment.value}::boolean`;
    case 'aiEnabled':
      return Prisma.sql`"ai_enabled" = ${assignment.value}::boolean`;
    case 'axenitaExportEnabled':
      return Prisma.sql`"axenita_export_enabled" = ${assignment.value}::boolean`;
    case 'retentionPolicyCode':
      return Prisma.sql`"retention_policy_code" = ${assignment.value}::text`;
  }
}

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

  public async setRequestContext(practiceId: string): Promise<void> {
    // The accepted context-establishment path and nothing else. `set_config('app.practice_id',
    // ...)` is deliberately not written here: the function clears the GUC first, re-derives the
    // user from `app.user_id` and re-validates an ACTIVE membership before setting it again
    // (02 §16.2.3, D-033 clauses 9-12). A direct assignment would have none of those properties.
    //
    // The parameter is bound, never interpolated — the tagged template produces `$1` — and it
    // is cast to `uuid`, so a value that is not a UUID fails in the database rather than
    // widening the statement.
    try {
      await this.tx.$executeRaw`select app_security.set_request_context(${practiceId}::uuid)`;
    } catch (error) {
      // THE NARROWEST POSSIBLE TRANSLATION: one statement, one SQLSTATE, one replacement type.
      // It is scoped to this method and not to the transaction, the session or the client, so
      // an `insufficient_privilege` raised by ANY other statement — a revoked column grant on
      // `practices`, say — still propagates unchanged and still becomes an internal failure.
      // Turning those into a tenant `403` would quietly present a broken deployment as a
      // routine refusal (`02` §20.2a, §20.2b).
      //
      // The driver error is dropped rather than attached as a `cause`: it carries the server's
      // message and the statement text, and neither may travel any further (`09` §11). What
      // the caller needs is the fact of the refusal, and that is the whole of the new error.
      if (isInsufficientPrivilege(error)) {
        throw new TenantContextRejectedError();
      }

      throw error;
    }
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

  public async findCurrentUserMembershipInPractice(
    practiceId: string,
  ): Promise<MembershipRow | undefined> {
    // BOTH predicates are load bearing and neither may be dropped.
    //
    // THE USER PREDICATE IS THE ESTABLISHED CONTEXT, NOT AN ARGUMENT (D-054 clause 12). It reads
    // the transaction-local `app.user_id` that `set_user_context` wrote on THIS connection
    // inside THIS transaction — the same expression the accepted §17.2/§17.3/§17.4/§17.6
    // policies use — so the identity this statement authorises against is the authenticated one
    // by construction. No TypeScript value can substitute another user, because there is no
    // parameter for one. With no context established the expression is NULL, `user_id = NULL`
    // is NULL, and the statement returns zero rows: fail closed.
    //
    // The practice predicate is the application-layer narrowing to the REQUESTED practice that
    // D-047 clause 18 assigns to this route. `unique (practice_id, user_id)` bounds the result
    // to one row.
    const rows = await this.tx.$queryRaw<MembershipRow[]>`
      select
        "id",
        "practice_id" as "practiceId",
        "active"
      from "practice_memberships"
      where "user_id"     = nullif(current_setting('app.user_id', true), '')::uuid
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
    // the caller is a member of.
    //
    // Since `013_rls_policies` the §17.1 tenant policy is the primary control: without
    // `app.practice_id` this statement returns zero rows, and with it, at most the row of the
    // established tenant. The explicit filter stays as the second barrier it became — it was
    // the whole of D-049 clause 3 in phase 3 — and reading every row and filtering in memory
    // remains forbidden.
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

  public async findPracticeSettings(practiceId: string): Promise<PracticeSettingsRow | undefined> {
    // Exactly the nine granted columns of 02 §20.2b.1 and D-053 clause A.3, named one by one.
    // `id`, `configuration`, `updated_at` and `updated_by` are absent here AND unreachable:
    // they carry no SELECT grant, so a statement naming one fails with SQLSTATE 42501 even if
    // it only used it in a predicate or an ORDER BY (D-053 clause A.4). There is no `select *`,
    // and no Prisma model delegate is used — the delegate would emit the model's full column
    // list and request exactly the four ungranted columns.
    //
    // This is the SECOND, separate practice_settings statement of the settings route.
    // `findConditionalSettings` above stays at three columns and stays the step 9 permission
    // input; this one is the step 11 representation and nothing else.
    //
    // The `02` §17.1 tenant policy is the primary control: reached before
    // `set_request_context` it returns zero rows for every practice, and after it, only the
    // admitted tenant's row. The explicit predicate is the second barrier and names the very
    // practice the caller was admitted to, so both agree by construction.
    const rows = await this.tx.$queryRaw<PracticeSettingsRow[]>`
      select
        "practice_id"                       as "practiceId",
        "billing_review_required"           as "billingReviewRequired",
        "allow_mpa_approval"                as "allowMpaApproval",
        "allow_billing_specialist_approval" as "allowBillingSpecialistApproval",
        "require_reason_for_manual_change"  as "requireReasonForManualChange",
        "ai_enabled"                        as "aiEnabled",
        "axenita_export_enabled"            as "axenitaExportEnabled",
        "retention_policy_code"             as "retentionPolicyCode",
        "version"
      from "practice_settings"
      where "practice_id" = ${practiceId}::uuid
    `;

    return rows[0];
  }

  public async updatePracticeSettings(
    update: PracticeSettingsUpdate,
  ): Promise<PracticeSettingsRow | undefined> {
    // THE ONE OPTIMISTIC-CONCURRENCY STATEMENT OF D-055 CLAUSES 15 TO 23.
    //
    // There is no `select` before it and none after it. The expected version arrives only from
    // `If-Match`, and its currency is established ONLY by this statement's own predicate
    // (clause 16), so no window exists between deciding that a version is current and writing
    // against it. A pre-read that distinguished "stale" from "no such row" would create exactly
    // that window, and would do so for information the caller is not entitled to (clauses 19-21).
    //
    // `$queryRaw` rather than `$executeRaw`, because the success representation AND the new
    // `ETag` are both built from the row this statement RETURNS (clause 23). A second read would
    // be free to observe a later version than the one just written, and the body and the
    // validator would then describe two different states.
    //
    // WHAT IS WRITTEN (clause 17): the submitted business fields, then `version + 1` and
    // `updated_at`. Nothing else. `updated_by` is left untouched by name (D-053 clause B.3),
    // `practice_id` is untouched because a row's tenant may not move, and `id` and
    // `configuration` carry no `UPDATE` grant at all (`02` §20.2b.1) — naming either would fail
    // with SQLSTATE 42501.
    //
    // `"version" + 1` IS THE ONLY WAY THE VERSION MOVES, and it moves once per matched row. It is
    // computed by the database from the row being updated, never from a value the application
    // read and sent back, so two concurrent transactions cannot both write the same successor:
    // once the first commits, the second's `version = <expected>` predicate no longer matches and
    // it updates zero rows.
    //
    // OWNER RATIFICATION R2 — THE INT4 CEILING. A row already at `2147483647` whose caller sends
    // the matching `If-Match: "2147483647"` reaches this line with a valid and CURRENT version,
    // and `"version" + 1` then raises PostgreSQL `22003` (`numeric_value_out_of_range`). That is
    // accepted and deliberately NOT special-cased: no pre-read, no clamp, no rejection of the
    // maximum in the parser, no dedicated schema constraint and no `catch` for this edge. The
    // error propagates like any other database failure, the transaction rolls back and discards
    // every transaction-local `app.*` setting, and the single Problem Details filter renders the
    // generic static `500 INTERNAL_ERROR`. Turning it into `400` would misdescribe a well-formed
    // and current token; `409` would tell the caller to re-read and retry a request that can
    // never succeed.
    //
    // `updated_at = now()` is the transaction's current time, matching the `CURRENT_TIMESTAMP` /
    // `now()` convention the rest of this schema uses. `clock_timestamp()` is deliberately not
    // introduced: within a single statement the distinction is unobservable, and the convention
    // is the thing worth keeping stable.
    //
    // `RETURNING` NAMES EXACTLY THE NINE `SELECT`-GRANTED COLUMNS. `updated_at` is deliberately
    // NOT among them even though this very statement just wrote it: the column carries an
    // `UPDATE` grant and no `SELECT` grant, so `returning "updated_at"` fails with SQLSTATE 42501
    // (`02` §20.2b.1, D-053 clause A.4). `updated_by`, `id` and `configuration` are absent and
    // unreachable for the same reason.
    //
    // BOTH PREDICATE HALVES ARE MANDATORY (clause 15). The `02` §17.1 tenant policy is the
    // primary control — reached without `app.practice_id` the policy predicate is
    // `practice_id = NULL` and this statement matches nothing at all — and the explicit
    // `practice_id` term is the second barrier both read statements also keep. `practiceId` is
    // the ADMITTED practice, so policy and predicate agree by construction and a cross-tenant
    // write is not expressible here.
    const rows = await this.tx.$queryRaw<PracticeSettingsRow[]>`
      update "practice_settings"
      set ${Prisma.join(update.assignments.map(assignmentSql), ', ')},
          "version"    = "version" + 1,
          "updated_at" = now()
      where "practice_id" = ${update.practiceId}::uuid
        and "version"     = ${update.expectedVersion}::integer
      returning
        "practice_id"                       as "practiceId",
        "billing_review_required"           as "billingReviewRequired",
        "allow_mpa_approval"                as "allowMpaApproval",
        "allow_billing_specialist_approval" as "allowBillingSpecialistApproval",
        "require_reason_for_manual_change"  as "requireReasonForManualChange",
        "ai_enabled"                        as "aiEnabled",
        "axenita_export_enabled"            as "axenitaExportEnabled",
        "retention_policy_code"             as "retentionPolicyCode",
        "version"
    `;

    // Zero rows becomes `undefined` and carries NO cause. A stale version, an absent row and a
    // row the tenant policy does not expose are ONE outcome here and ONE outcome to the client
    // (D-055 clauses 19 to 21).
    return rows[0];
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

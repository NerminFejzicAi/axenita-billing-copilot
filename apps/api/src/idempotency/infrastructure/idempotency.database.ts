/**
 * The idempotency feature adapter — four statements, all on the ONE admitted pinned session.
 *
 * Normative sources: `02` §15.2, §29.4a.3, `013_rls_policies_phase5` (`idempotency_keys_select`,
 * `idempotency_keys_insert`, `idempotency_keys_update`); `03` §4, §4.2; `04` §7.5a.3; `09` §4.2;
 * D-054 clauses 6-10; D-056 clause 5; D-072; D-079 `OD-P5-I4C-1`, `OD-P5-I4C-3`, `RULING D`.
 *
 * WHERE IT RUNS
 *
 * Through the `TenantDatabaseService` facade, on the transaction the identity bootstrap already
 * opened. It owns no `PrismaService`, no `PrismaClient` and no connection; it opens no
 * transaction, nests none and starts none in parallel; it establishes no identity and sets no
 * `app.practice_id`. The advisory lock is TRANSACTION-SCOPED precisely because it is taken on
 * that one transaction: it is released by the commit AND by the rollback, with no `unlock` call
 * to forget and no session-scoped leak into a pooled connection.
 *
 * TWO BARRIERS ON EVERY STATEMENT, AND NEITHER REPLACES THE OTHER
 *
 * The PRIMARY boundary is the database: `idempotency_keys` carries `ENABLE` + `FORCE ROW LEVEL
 * SECURITY`, and all three policies restrict rows to
 * `practice_id = nullif(current_setting('app.practice_id', true), '')::uuid`. Reached without an
 * established tenant context the predicate is `practice_id = NULL`, so the reads see nothing and
 * the writes are refused — fail closed. The SECOND barrier is the explicit
 * `practice_id = <admitted>` term written below, exactly as every other tenant statement in this
 * repository keeps it.
 *
 * THE ADVISORY LOCK IS NOT A SECURITY BOUNDARY (`09` §4.2). It is a concurrency control and
 * nothing more; tenant isolation is carried by `FORCE RLS`. Its key is bound as a parameter and
 * is neither persisted, returned, nor logged.
 */

import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { type IdempotencyScope } from '../idempotency.constants.js';
import {
  IDEMPOTENCY_ADVISORY_LOCK_STATEMENT,
  IDEMPOTENCY_CLAIM_INSERT_STATEMENT,
  IDEMPOTENCY_CLAIM_READ_STATEMENT,
  IDEMPOTENCY_COMPLETION_UPDATE_STATEMENT,
  type AdvisoryLockRow,
  type IdempotencyClaim,
  type IdempotencyClaimRow,
  type IdempotencyCompletion,
} from './idempotency-database.port.js';

/** The one row every write statement returns, so a zero-row outcome is observable. */
interface WrittenRow {
  readonly id: string;
}

@Injectable()
export class IdempotencyDatabase {
  /**
   * Takes the NON-BLOCKING, TRANSACTION-SCOPED advisory lock of one idempotency scope.
   *
   * `pg_try_advisory_xact_lock` and NOT `pg_advisory_xact_lock`: the blocking form would make a
   * concurrent duplicate wait for the winner's transaction to finish before learning that it lost,
   * which `08` §12.12 obligation 5 and D-079 `RULING D` both forbid. It is equally NOT
   * `pg_try_advisory_lock`, whose session scope would survive the transaction and leak onto a
   * pooled connection.
   *
   * THE KEY IS BOUND AS TEXT AND CAST IN SQL. `bigint` values do not survive every driver's
   * JavaScript number handling intact, and an `int64` silently narrowed to a double would collide
   * across scopes. Rendering the exact decimal and casting `::bigint` keeps the value a BOUND
   * PARAMETER — no client string reaches an identifier position and no SQL is concatenated —
   * while guaranteeing the server sees the same integer the derivation produced.
   *
   * @returns `true` when this transaction now owns the scope; `false` when another one does.
   */
  public async tryAdvisoryLock(tenant: AdmittedTenantSession, lockKey: bigint): Promise<boolean> {
    const rows = await tenant.run<AdvisoryLockRow>({
      label: IDEMPOTENCY_ADVISORY_LOCK_STATEMENT,
      sql: Prisma.sql`
        select pg_try_advisory_xact_lock(${lockKey.toString()}::bigint) as "acquired"
      `,
    });

    // `pg_try_advisory_xact_lock` always returns exactly one row. Treating a missing row as
    // "not acquired" fails closed rather than proceeding without the lock.
    return rows[0]?.acquired === true;
  }

  /**
   * Reads the claim of ONE canonical scope, if any — step 5 of `04` §7.5a.3.
   *
   * The predicate is the full four-component scope of `02` §15.2, so at most one row can match:
   * `idempotency_keys_scope_key` is `unique (practice_id, user_id, endpoint, idempotency_key)`.
   * `endpoint` carries the canonical `03` §4 literal, never the runtime mount path
   * (`OD-P5-I4C-1`).
   *
   * @returns the row, or `undefined` for zero rows — which means "no claim in this scope" and
   *   nothing more specific.
   */
  public async findClaim(
    tenant: AdmittedTenantSession,
    scope: IdempotencyScope,
  ): Promise<IdempotencyClaimRow | undefined> {
    const rows = await tenant.run<IdempotencyClaimRow>({
      label: IDEMPOTENCY_CLAIM_READ_STATEMENT,
      // FOUR COLUMNS, NAMED ONE BY ONE. `select *` would hand the caller the whole scope, the
      // TTL and the claim timestamps; the table grant will not refuse one, so the list is the
      // control.
      sql: Prisma.sql`
        select
          "id",
          "request_sha256"  as "requestSha256",
          "response_status" as "responseStatus",
          "response_body"   as "responseBody",
          "completed_at"    as "completedAt"
        from "idempotency_keys"
        where "practice_id"     = ${scope.practiceId}::uuid
          and "user_id"         = ${scope.userId}::uuid
          and "endpoint"        = ${scope.endpoint}
          and "idempotency_key" = ${scope.idempotencyKey}
      `,
    });

    return rows[0];
  }

  /**
   * Creates the claim of step 9.
   *
   * `locked_at` is the claim instant and `completed_at` is `NULL`: together they ARE the
   * "in progress" state, and `completed_at IS NULL` is the only discriminator the reader uses.
   * `expires_at` is written here, once, and no statement in this repository ever changes it.
   *
   * NO `ON CONFLICT`. The scope is already exclusive: this runs while THIS transaction holds the
   * scope's advisory lock and after the claim read found nothing, so a unique-violation here
   * would mean the lock did not do its job — a genuine internal failure, not a routine outcome to
   * swallow. `response_status` and `response_body` are deliberately not named at all, so a claim
   * cannot be born already carrying a cached answer.
   */
  public async createClaim(tenant: AdmittedTenantSession, claim: IdempotencyClaim): Promise<void> {
    await tenant.run<WrittenRow>({
      label: IDEMPOTENCY_CLAIM_INSERT_STATEMENT,
      sql: Prisma.sql`
        insert into "idempotency_keys" (
          "id",
          "practice_id",
          "user_id",
          "idempotency_key",
          "endpoint",
          "request_sha256",
          "locked_at",
          "expires_at"
        )
        values (
          ${claim.id}::uuid,
          ${claim.scope.practiceId}::uuid,
          ${claim.scope.userId}::uuid,
          ${claim.scope.idempotencyKey},
          ${claim.scope.endpoint},
          ${claim.requestSha256},
          ${claim.claimedAt}::timestamptz,
          ${claim.expiresAt}::timestamptz
        )
        returning "id"
      `,
    });
  }

  /**
   * Completes the claim of step 12 — the FOUR granted mutable columns, and no others.
   *
   *     response_status = 201
   *     response_body   = {"resourceId":"<patient-reference-uuid>"}
   *     completed_at    = <the completion instant>
   *     locked_at       = null
   *
   * `03` §4.2 fixes all four. `locked_at` returns to `NULL` because the claim is no longer being
   * held — the row now records a finished command rather than one in flight.
   *
   * THE CACHE IS BUILT HERE, FROM ONE MEMBER. `resourceId` is the only value this method is given
   * and `jsonb_build_object` is what turns it into the document, so no caller can widen the cache
   * by passing a richer object: there is no parameter for one. The value is a BOUND parameter and
   * the key is a SQL literal, so no client string reaches a JSON key either.
   *
   * The predicate names the row by `id` AND by the admitted practice: the policy is the primary
   * control and the explicit tenant term is the second barrier, exactly as elsewhere.
   */
  public async completeClaim(
    tenant: AdmittedTenantSession,
    completion: IdempotencyCompletion,
  ): Promise<void> {
    await tenant.run<WrittenRow>({
      label: IDEMPOTENCY_COMPLETION_UPDATE_STATEMENT,
      sql: Prisma.sql`
        update "idempotency_keys"
        set "response_status" = ${completion.responseStatus},
            "response_body"   = jsonb_build_object('resourceId', ${completion.resourceId}::uuid),
            "completed_at"    = ${completion.completedAt}::timestamptz,
            "locked_at"       = null
        where "id"          = ${completion.id}::uuid
          and "practice_id" = ${completion.practiceId}::uuid
        returning "id"
      `,
    });
  }
}

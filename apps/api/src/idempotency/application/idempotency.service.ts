/**
 * The idempotency service — the canonical thirteen-step order of `04` §7.5a.3, in one place.
 *
 * Normative sources: `03` §4, §4.1, §4.2; `02` §15.2; `04` §7.5a.3; `09` §4.2; D-054 clauses 6
 * and 8; D-072; D-079 `OD-P5-I4C-1`, `OD-P5-I4C-2`, `OD-P5-I4C-3` and `RULING D`;
 * `08` §12.12 obligations 1-6.
 *
 * THE ORDER IS THE CONTRACT, AND IT IS THE ORDER OF `04` §7.5a.3 LITERALLY
 *
 *      1  the EXISTING admitted pinned tenant transaction        the calling route service
 *      2  the validated request_sha256                           the calling route service
 *      3  NON-BLOCKING transaction-scoped advisory lock         \
 *      4  lock unavailable       -> 409 REQUEST_ALREADY_IN_PROGRESS
 *      5  lock acquired          -> inspect the canonical scope  |
 *      6  completed + same hash  -> replay                       |  THIS FILE
 *      7  completed + other hash -> 409 IDEMPOTENCY_CONFLICT     |
 *      8  unfinished claim       -> 409 REQUEST_ALREADY_IN_PROGRESS
 *      9  absent                 -> create the claim            /
 *     10  the business mutation                                  the operation
 *     11  the success audit event                                the operation
 *     12  finalise the idempotency record                        THIS FILE
 *     13  ONE commit                                             the calling route service
 *
 * WHY THE HEADER IS NOT VALIDATED HERE
 *
 * It already has been. `OD-P5-I4C-2` puts `Idempotency-Key` validation strictly BEFORE scope
 * inspection, the advisory lock and body hashing, so the route validates the header, then hashes
 * the body, and only then enters this service — which is why an unaccepted key can be proven to
 * touch `idempotency_keys` not at all. This service cannot be reached with one: its scope carries
 * an already-accepted key and there is no raw-header parameter anywhere below.
 *
 * WHY THIS TAKES A CALLBACK WHEN THE TENANT PIPELINE DOES NOT
 *
 * `TenantRequestPipeline.admit` refuses a callback because every one of its steps must run, in
 * order, with nothing interleaved. Here the opposite is required: steps 10 and 11 are the
 * business half and MUST run between the claim and the completion, inside the same transaction
 * and inside the same lock. Expressing that as a callback is what makes the sandwich structural —
 * a caller cannot complete a claim it never executed, and cannot execute without having claimed,
 * because neither `createClaim` nor `completeClaim` is reachable from outside this file.
 *
 * ROLLBACK IS THE TRANSACTION'S, NOT THIS SERVICE'S. Nothing here catches a failure from the
 * business half. An error propagates out of the one interactive transaction, which rolls back the
 * claim, the business row and the audit row together, and the transaction-scoped advisory lock is
 * released by that rollback with no `unlock` call to forget. There can therefore be no completed
 * cache without a successful mutation, and no orphaned claim (D-072).
 *
 * NO STALE-CLAIM TAKEOVER, AND NO CLEANUP. An unfinished claim is reported, never adopted, no
 * matter how old (D-072). `expires_at` is written once at claim time and never revised; the TTL
 * has no phase 5 consumer and a cleanup job is not invented here.
 */

import { Injectable } from '@nestjs/common';

import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { IDEMPOTENCY_TTL_MILLISECONDS, type IdempotencyScope } from '../idempotency.constants.js';
import {
  idempotencyCacheUnresolvable,
  idempotencyConflict,
  requestAlreadyInProgress,
} from '../idempotency.errors.js';
import { advisoryLockKey } from '../domain/advisory-lock-key.js';
import { IdempotencyDatabase } from '../infrastructure/idempotency.database.js';
import { type IdempotencyClaimRow } from '../infrastructure/idempotency-database.port.js';

/**
 * The `201` status the completion cache records (`03` §4.2).
 *
 * A constant rather than a parameter: this service serves one canonical create shape, and a
 * caller able to choose the cached status could record a replayable `204` or `200` for a command
 * whose contract is `201`.
 */
const CREATED_STATUS = 201;

/** The one member of the minimal completion cache (`03` §4.2). */
const RESOURCE_ID_MEMBER = 'resourceId';

/**
 * The business half of ONE idempotent command — steps 10 and 11, plus the replay reconstruction.
 *
 * Both members return the SAME document type, which is what makes "a replay is indistinguishable
 * from the original response" a property of the type rather than a convention.
 */
export interface IdempotentOperation<TResult> {
  /**
   * Steps 10 and 11 — the business mutation AND the success audit event, in that order, inside
   * the claim and inside the caller's one transaction.
   *
   * @returns the created resource's identifier — the ONLY value that is cached — together with
   *   the canonical response document built from the row that was just written.
   */
  execute(): Promise<{ readonly resourceId: string; readonly result: TResult }>;

  /**
   * The replay reconstruction — a tenant-scoped IMMUTABLE READ of the cached resource, projected
   * through the same canonical response path as the original `201` (`03` §4.2).
   *
   * @returns the reconstructed document, or `undefined` when the pointer resolves to nothing —
   *   which this service turns into `500 INTERNAL_ERROR` rather than into an invented answer.
   */
  replay(resourceId: string): Promise<TResult | undefined>;
}

/** Everything one idempotent command supplies besides its business half. */
export interface IdempotentRequest {
  /** The canonical four-component scope (`03` §4; `02` §15.2). */
  readonly scope: IdempotencyScope;
  /** `SHA-256( UTF8( JCS( VALIDATED_ORIGINAL_PARSED_BODY ) ) )` — computed BEFORE this call. */
  readonly requestSha256: string;
  /** The application-generated `idempotency_keys.id` of a claim, should one be created. */
  readonly claimId: string;
  /**
   * The single instant of this request.
   *
   * Generated exactly once by the route service and reused for `locked_at`, `expires_at`,
   * `completed_at` and the business timestamps, so one request describes one moment rather than
   * several that happen to be close together. Never a database `now()` substitute.
   */
  readonly instant: Date;
}

@Injectable()
export class IdempotencyService {
  public constructor(private readonly claims: IdempotencyDatabase) {}

  /**
   * Runs one command at most once per canonical scope, or answers the canonical refusal.
   *
   * @param tenant the statement surface of the ALREADY-ADMITTED request. Every statement below
   *   runs on it, so the advisory lock, the claim, the business mutation, the audit row and the
   *   completion are all in ONE transaction on ONE pinned connection (D-054 clauses 6 and 8).
   */
  public async runOnce<TResult>(
    tenant: AdmittedTenantSession,
    request: IdempotentRequest,
    operation: IdempotentOperation<TResult>,
  ): Promise<TResult> {
    // Step 3 — the NON-BLOCKING, TRANSACTION-SCOPED lock over the canonical scope. Its key is
    // derived from the exact bytes of `OD-P5-I4C-3` and is used here and nowhere else: it is not
    // persisted, not returned and not logged.
    const acquired = await this.claims.tryAdvisoryLock(tenant, advisoryLockKey(request.scope));

    // Step 4 — another transaction owns this scope RIGHT NOW. Answered immediately, without
    // waiting for it to finish, which is the whole reason the acquisition is non-blocking.
    if (!acquired) {
      throw requestAlreadyInProgress();
    }

    // Step 5 — the canonical-scope inspection, and it is reached ONLY under the lock. Doing it
    // before the lock would be a check-then-act race: two requests could both read "absent" and
    // both create a claim, and only the unique index would notice.
    const claim = await this.claims.findClaim(tenant, request.scope);

    if (claim !== undefined) {
      // Steps 6 to 8. The outer discriminator is COMPLETENESS, exactly as `04` §7.5a.3 orders
      // it: an unfinished claim is `409 REQUEST_ALREADY_IN_PROGRESS` whatever its hash, because
      // a command still in flight is not something to conflict with — it is something to
      // decline.
      return this.resolveExistingClaim(claim, request.requestSha256, operation);
    }

    // Step 9 — the claim. `expires_at` derives from the SAME single instant as `locked_at`, so
    // the TTL is measured from the moment the claim was taken and not from an unrelated read of
    // the clock.
    await this.claims.createClaim(tenant, {
      id: request.claimId,
      scope: request.scope,
      requestSha256: request.requestSha256,
      claimedAt: request.instant,
      expiresAt: new Date(request.instant.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
    });

    // Steps 10 and 11 — the business mutation and the success audit event. A failure in either
    // propagates and rolls back the claim written one line above along with everything else.
    const { resourceId, result } = await operation.execute();

    // Step 12 — the minimal completion cache. `resourceId` is the only value it carries; the
    // document itself is built inside the statement, so no richer object can be passed in.
    await this.claims.completeClaim(tenant, {
      id: request.claimId,
      practiceId: request.scope.practiceId,
      responseStatus: CREATED_STATUS,
      resourceId,
      completedAt: request.instant,
    });

    // Step 13 is the caller's single commit.
    return result;
  }

  /**
   * Steps 6 to 8 — what an existing claim in this scope means.
   *
   * The three outcomes are decided from TWO stored facts and nothing else: whether the claim is
   * completed, and whether its `request_sha256` equals this request's. No second read
   * discriminates them, and none of the three responses renders either digest.
   */
  private async resolveExistingClaim<TResult>(
    claim: IdempotencyClaimRow,
    requestSha256: string,
    operation: IdempotentOperation<TResult>,
  ): Promise<TResult> {
    // Step 8, taken first because completeness is the outer discriminator. `completed_at` is the
    // ONLY completeness signal; `locked_at` is deliberately not read, so no claim can be adopted
    // because its lock timestamp looks old (no stale-claim takeover in `P5-I4`).
    if (claim.completedAt === null) {
      throw requestAlreadyInProgress();
    }

    // Step 7 — the same key for a DIFFERENT body. `!==` over two 64-character lowercase hex
    // strings; there is no normalisation, no case folding and no prefix comparison.
    if (claim.requestSha256 !== requestSha256) {
      throw idempotencyConflict();
    }

    // Step 6 — the replay. The cache is a POINTER: the resource is re-read under the tenant
    // policy and the document is rebuilt through the same canonical projection the original
    // `201` used, so the two bodies cannot drift apart.
    const replayed = await operation.replay(readCachedResourceId(claim.responseBody));

    if (replayed === undefined) {
      // `03` §4.2 — an unresolvable pointer is `500`, never a `404` and never an invented body.
      throw idempotencyCacheUnresolvable();
    }

    return replayed;
  }
}

/**
 * The cached `resourceId`, or a refusal.
 *
 * THE STORED DOCUMENT IS NOT TRUSTED TO HAVE A SHAPE. It is `jsonb` and this code reads it back
 * across a transaction boundary from a row it did not necessarily write, so the shape is PROVEN
 * here rather than asserted by a cast. Anything that is not `{"resourceId": "<string>"}` is an
 * unresolvable pointer and takes the same `500` path as a pointer that resolves to no row.
 */
function readCachedResourceId(responseBody: unknown): string {
  if (typeof responseBody !== 'object' || responseBody === null || Array.isArray(responseBody)) {
    throw idempotencyCacheUnresolvable();
  }

  const resourceId = (responseBody as Record<string, unknown>)[RESOURCE_ID_MEMBER];

  if (typeof resourceId !== 'string') {
    throw idempotencyCacheUnresolvable();
  }

  return resourceId;
}

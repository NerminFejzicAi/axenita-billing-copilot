/**
 * The database port of the idempotency mechanism — statement labels, row shapes and the two
 * write payloads.
 *
 * Normative sources: `02` §15.2, §29.4a.3 and `013_rls_policies_phase5` (the `SELECT` + `INSERT`
 * grants and the FOUR-COLUMN `UPDATE` grant); `03` §4, §4.2; `04` §7.5a.3; D-072; D-079
 * `OD-P5-I4C-1`, `OD-P5-I4C-3` and `RULING D`.
 *
 * WHY THIS IS A SEPARATE PORT AND NOT A METHOD ON THE IDENTITY PORT
 *
 * The same rule that keeps the patient-reference statement in the patient-reference feature
 * adapter (D-073): `IdentityBootstrapSession` owns the identity/tenant ADMISSION statements and
 * must not acquire one method per business table. Idempotency statements therefore live here and
 * reach the pinned connection through the `TenantDatabaseService` facade, exactly as the
 * patient-reference statements do.
 *
 * COLUMN DISCIPLINE, AND WHY IT IS LOAD-BEARING HERE TOO
 *
 * `idempotency_keys` carries TABLE-level `SELECT` and `INSERT` grants, so — as with
 * `patient_references` — there is no column-level SQLSTATE `42501` backstop against
 * over-projection. The four projected columns below are consequently named one by one.
 * `idempotency_key`, `endpoint`, `practice_id` and `user_id` appear ONLY in predicates and are
 * never projected: they are the scope the caller already supplied, so returning them would add
 * nothing and would put client-controlled material one careless spread away from a response.
 *
 * THE `UPDATE` SURFACE IS EXACTLY THE GRANTED ONE. `copilot_app` may update
 * `response_status`, `response_body`, `locked_at` and `completed_at`, and nothing else
 * (`02` §29.4a.3, D-064 `OD-2`). {@link IdempotencyCompletion} therefore has no member that
 * names any other column: `practice_id`, `user_id`, `idempotency_key`, `endpoint`,
 * `request_sha256`, `expires_at` and `created_at` are immutable after the claim, on privilege
 * AND on policy.
 */

import { type IdempotencyScope } from '../idempotency.constants.js';

/**
 * The non-blocking, transaction-scoped advisory-lock acquisition (`OD-P5-I4C-3`).
 *
 * The label names WHICH statement ran and carries no value — in particular not the derived lock
 * key, which is never persisted, never rendered and never logged (`OD-P5-I4C-3`).
 */
export const IDEMPOTENCY_ADVISORY_LOCK_STATEMENT = 'select idempotency_advisory_lock';

/** The canonical-scope claim inspection of step 5. */
export const IDEMPOTENCY_CLAIM_READ_STATEMENT = 'select idempotency_key';

/** The claim creation of step 9. */
export const IDEMPOTENCY_CLAIM_INSERT_STATEMENT = 'insert idempotency_key';

/** The completion of step 12 — the four granted mutable columns, and no others. */
export const IDEMPOTENCY_COMPLETION_UPDATE_STATEMENT = 'update idempotency_key';

/**
 * The single row `pg_try_advisory_xact_lock` returns.
 *
 * `acquired = false` means ANOTHER transaction holds this exact scope's lock right now. The
 * statement does not wait to find that out, which is the whole point: a blocking acquisition
 * would make a concurrent duplicate WAIT for the winner to commit and only then discover the
 * outcome, turning a fast `409` into a request-length stall.
 */
export interface AdvisoryLockRow {
  readonly acquired: boolean;
}

/**
 * The projected claim — exactly the four columns the decision needs.
 *
 * ABSENT HERE AND ABSENT FROM THE STATEMENT: `practice_id`, `user_id`, `endpoint`,
 * `idempotency_key`, `request_sha256`'s neighbours `expires_at` and `created_at`, and
 * `locked_at`. `locked_at` in particular is NOT read: "unfinished" is decided by
 * `completed_at IS NULL` alone, so a claim cannot be adopted on the strength of a stale lock
 * timestamp — `P5-I4` performs no stale-claim takeover (D-072).
 */
export interface IdempotencyClaimRow {
  /** `idempotency_keys.id` — the row to complete, never rendered to a caller. */
  readonly id: string;
  /** The digest of the ORIGINAL validated parsed body of the request that created this claim. */
  readonly requestSha256: string;
  /** `null` while the claim is unfinished; `201` once completed. */
  readonly responseStatus: number | null;
  /**
   * The MINIMAL completion cache — `{"resourceId":"<uuid>"}` and nothing else (`03` §4.2).
   *
   * Typed `unknown` on purpose: it is `jsonb`, so the database can return any JSON value, and
   * the shape is proven by the reader rather than assumed by the type.
   */
  readonly responseBody: unknown;
  /** `null` while the claim is unfinished — the ONLY completeness discriminator. */
  readonly completedAt: Date | null;
}

/** Everything the claim INSERT of step 9 writes. */
export interface IdempotencyClaim {
  /** The application-generated `idempotency_keys.id`. */
  readonly id: string;
  /** The canonical four-component scope (`03` §4; `02` §15.2). */
  readonly scope: IdempotencyScope;
  /** `SHA-256( UTF8( JCS( VALIDATED_ORIGINAL_PARSED_BODY ) ) )` — 64 lowercase hex characters. */
  readonly requestSha256: string;
  /**
   * The single claim instant.
   *
   * Generated exactly ONCE per request and used for `locked_at` and as the base of
   * `expires_at = claim_time + 48h`. Never a database `now()` substitute, so the TTL a row
   * carries is the one the application decided.
   */
  readonly claimedAt: Date;
  /** `claimedAt + IDEMPOTENCY_TTL_HOURS`. Written once and NEVER changed afterwards. */
  readonly expiresAt: Date;
}

/** Everything the completion UPDATE of step 12 writes — the four granted columns only. */
export interface IdempotencyCompletion {
  /** The claim row created earlier in THIS transaction. */
  readonly id: string;
  /**
   * The ADMITTED practice — the explicit tenant predicate the application must be able to state,
   * on top of the `idempotency_keys_update` policy that is the primary control.
   */
  readonly practiceId: string;
  /** `201` (`03` §4.2). */
  readonly responseStatus: number;
  /**
   * The MINIMAL cache: the created resource's identifier, and NOTHING else.
   *
   * `pseudonym`, `birthYear`, `sexCode`, `sourceSystem` and `createdAt` are deliberately absent —
   * `03` §4.2 forbids caching them, and `02` §15.2 forbids medical content in this column
   * outright. The cache is a POINTER; a replay re-reads the row and rebuilds the document.
   */
  readonly resourceId: string;
  /** The completion instant, applied to `completed_at`. */
  readonly completedAt: Date;
}

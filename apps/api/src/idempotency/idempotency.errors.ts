/**
 * The five failures the idempotency mechanism is allowed to produce.
 *
 * Normative sources: `03` §4 (the rules), §4.2 (`400 IDEMPOTENCY_KEY_REQUIRED`), §8 (the frozen
 * error-code catalogue), §8.1 (`REQUEST_ALREADY_IN_PROGRESS = 409`,
 * `IDEMPOTENCY_KEY_REQUIRED = 400`), §9 (status usage); D-028 clause 1; D-055 clause 12;
 * D-062 part D; D-072; D-079 `OD-P5-I4C-2` and `RULING D`.
 *
 * NO NEW ERROR CODE AND NO NEW STATUS CODE IS INTRODUCED. All five codes below already exist in
 * the frozen catalogue of `03` §8, and `OD-P5-I4C-2` says so in terms: a present-but-unaccepted
 * header is a HEADER FORMAT fault, which `03` §9 and D-055 clause 12 already answer with
 * `400 VALIDATION_ERROR`.
 *
 * `428` DOES NOT APPEAR ANYWHERE ON THIS PATH. `428 PRECONDITION_REQUIRED` stays reserved
 * exclusively for a missing `If-Match` on the six optimistic-locking resources (D-028), and a
 * missing `Idempotency-Key` is `400`, never `428`.
 *
 * EVERY DETAIL IS STATIC AND REFLECTS NOTHING. None of them carries the submitted key, a prefix
 * or suffix of it, its length, the derived advisory-lock key, a scope component, a row, a
 * statement or a SQLSTATE. A rejected idempotency key is client-controlled input, and echoing
 * even a fragment turns a refusal into a mirror for crafted values (`09` §11).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/errors/api-exception.js';
import { detailForStatus } from '../common/problem-details/problem-details.factory.js';

/**
 * `Idempotency-Key` is absent, empty, or whitespace only (`03` §4.2; `OD-P5-I4C-2`).
 *
 * ONE ANSWER FOR ALL THREE, on purpose: none of them states a key, so all three are "you did not
 * supply one". It is deliberately DISTINCT from {@link idempotencyKeyInvalid} — absence and a
 * present-but-unaccepted value are different faults and `OD-P5-I4C-2` forbids merging them.
 */
export function idempotencyKeyRequired(): ApiException {
  return new ApiException({
    code: 'IDEMPOTENCY_KEY_REQUIRED',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The Idempotency-Key header is required for this operation.',
  });
}

/**
 * `Idempotency-Key` is present but outside the accepted domain (`OD-P5-I4C-2`).
 *
 *     length         1 .. 255 UTF-8 bytes
 *     allowed bytes  printable ASCII VCHAR 0x21 .. 0x7E, exclusively
 *
 * `400 VALIDATION_ERROR`, because the fault is the FORMAT OF A HEADER, which `03` §9 classifies
 * as `400` and D-055 clause 12 already settled for every present-but-unaccepted header. It is
 * NOT `422`: nothing about the request BODY has been judged at this point, and nothing about it
 * ever will be if this refusal fires.
 *
 * NO `errors[]` MEMBER. This is a header refusal, not the `422` body-schema document of `03` §8,
 * so it carries no field-level list — the same shape the malformed-identifier refusal of `P5-I4A`
 * already uses. The body is therefore byte-identical for every rejected key, whatever was wrong
 * with it: too long, non-ASCII, control character or embedded space.
 */
export function idempotencyKeyInvalid(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The Idempotency-Key header is not valid.',
  });
}

/**
 * The same scope is already being executed, or a previous claim never completed (`03` §4;
 * D-028 clause 1).
 *
 * TWO CAUSES, ONE ANSWER, AND NEITHER WAITS. It fires when the non-blocking advisory lock is
 * unavailable — another transaction owns this exact scope right now — and when the lock WAS
 * acquired but an unfinished claim row is visible. `P5-I4` performs NO stale-claim takeover
 * (D-072), so an unfinished claim is reported rather than adopted, however old it is.
 *
 * The distinction is deliberately not observable: both mean "this command is not yours to run at
 * this moment", and telling them apart would disclose the concurrency state of another caller's
 * request.
 */
export function requestAlreadyInProgress(): ApiException {
  return new ApiException({
    code: 'REQUEST_ALREADY_IN_PROGRESS',
    status: HttpStatus.CONFLICT,
    detail: 'A request with this idempotency key is already in progress.',
  });
}

/**
 * The same key was already used for a DIFFERENT request body (`03` §4, §8.1).
 *
 * The comparison is between the stored `request_sha256` and the digest of THIS request's
 * validated original parsed body. The two digests are never rendered, so the response cannot be
 * used to probe what the earlier body was.
 *
 * IT IS NOT REUSED FOR A DUPLICATE EXTERNAL REFERENCE. That is a different fault with its own
 * code, `PATIENT_REFERENCE_ALREADY_EXISTS`, and D-072 `OD-P5-I4-10` forbids collapsing the two.
 */
export function idempotencyConflict(): ApiException {
  return new ApiException({
    code: 'IDEMPOTENCY_CONFLICT',
    status: HttpStatus.CONFLICT,
    detail: 'This idempotency key was already used for a different request.',
  });
}

/**
 * A COMPLETED claim whose cached pointer cannot be resolved (`03` §4.2; D-079 `RULING D`).
 *
 * `03` §4.2 is explicit: an unresolvable completion cache is `500 INTERNAL_ERROR`. It is NOT
 * `404` — the resource was created, so reporting it as absent would contradict the `201` the
 * caller already received — and no answer is invented from the cached document, which holds only
 * a pointer and never a representation.
 *
 * Reaching it means the cache and `patient_references` disagree, which no code path in this phase
 * can produce: the two are written in one transaction and `patient_references` is
 * create-once/read-only with no delete route (`03` §11). It is therefore a genuine invariant
 * failure and is reported as one.
 *
 * THE BODY IS BYTE-IDENTICAL TO AN UNHANDLED FAILURE. The detail is taken from the shared
 * `500` mapping rather than written here, so a caller cannot tell a deliberate internal refusal
 * from an unexpected one — which is the point: the distinction is a fact about server state and
 * is not owed to the client (`09` §11).
 */
export function idempotencyCacheUnresolvable(): ApiException {
  return new ApiException({
    code: 'INTERNAL_ERROR',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: detailForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
  });
}

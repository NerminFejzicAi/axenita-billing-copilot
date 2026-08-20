/**
 * Every failure the identity slice is allowed to produce — nine factories and one invariant type.
 *
 * The historical header of this file said "the six failures the phase 3 identity slice is allowed
 * to produce". Phase 4's settings WRITE slice added four more (D-055 clauses 10, 12, 14 and 19),
 * so the count is restated here rather than left to go quietly stale. It is a count of FACTORIES,
 * not of error codes: no code below is new, and none may be.
 *
 * Normative sources: `03` §3.1 (`401 INVALID_TOKEN` is reserved exclusively for a failed token
 * verification; a cryptographically valid token whose verified subject has no `users` row is an
 * admission failure and therefore `403 ACCESS_DENIED`), `03` §3.2 (the two practice-context
 * rejections), `03` §5.2 and §9 (status usage), `03` §8 (frozen error catalogue). D-047 clauses
 * 3–4, 10 and 11 and `14` §2 fix the phase 3 rejections; D-053 clause B.4 and D-055 clauses 10
 * to 14 and 19 to 21 fix the four settings-write ones.
 *
 * NO NEW ERROR CODE IS INTRODUCED. Every factory below names a code that already exists in the
 * frozen catalogue of `03` §8; `GET /practices/{practiceId}` explicitly requires no addition to
 * it ("Nijedan novi error kod se ne uvodi; katalog iz §8 je dovoljan").
 *
 * Every factory returns an {@link ApiException}, so the response is rendered by the single
 * Problem Details filter (D-008) and no endpoint can invent an error shape.
 *
 * The `detail` strings are static and deliberately uninformative. `03` §3.1 requires the answer
 * to an unknown subject and the answer to a known but non-`ACTIVE` user to be INDISTINGUISHABLE,
 * and to disclose no membership or tenant information. They also never carry SQL, a connection
 * string, an `auth_subject`, a stack trace or any internal identifier (`09` §11, `03` §1).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/errors/api-exception.js';

/** No bearer credential was presented at all (`03` §3.1, `08` §8). */
export function authenticationRequired(): ApiException {
  return new ApiException({
    code: 'AUTHENTICATION_REQUIRED',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Authentication is required.',
  });
}

/**
 * A bearer credential was presented and failed verification — signature, issuer, audience,
 * expiration or subject (`03` §3.1). This is the ONLY situation that may use this code.
 */
export function invalidToken(): ApiException {
  return new ApiException({
    code: 'INVALID_TOKEN',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'The presented token is not valid.',
  });
}

/**
 * Admission failed: the verified subject has no `users` row, or the resolved user is not
 * `ACTIVE` (`03` §3.1, D-047 clauses 3–4).
 *
 * Both cases return this one exception with this one detail, on purpose. Distinguishing them
 * would let an unauthenticated caller enumerate provisioned subjects.
 */
export function accessDenied(): ApiException {
  return new ApiException({
    code: 'ACCESS_DENIED',
    status: HttpStatus.FORBIDDEN,
    detail: 'Access denied.',
  });
}

/**
 * A tenant route was called without `X-Practice-ID` (`03` §3.2, §3.4).
 *
 * `400`, because `03` §9 classifies `400` as the "header/query/request format" status. It is a
 * malformed REQUEST, not an authorisation outcome, so it must not be reported as `403`.
 */
export function practiceContextRequired(): ApiException {
  return new ApiException({
    code: 'PRACTICE_CONTEXT_REQUIRED',
    status: HttpStatus.BAD_REQUEST,
    detail: 'A practice context header is required for this route.',
  });
}

/**
 * `X-Practice-ID` was present but is not a valid UUID (`03` §3.2).
 *
 * The detail names neither the rejected value nor the header's content, so a malformed header
 * cannot be echoed back into a response body or a log line (`09` §11).
 */
export function practiceContextInvalid(): ApiException {
  return new ApiException({
    code: 'PRACTICE_CONTEXT_INVALID',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The practice context header is not a valid identifier.',
  });
}

/**
 * A database invariant the schema is supposed to guarantee did not hold.
 *
 * The only current example is more than one `users` row resolving for a single verified
 * subject, which `users_auth_subject_key` makes impossible. If it happens anyway, the correct
 * answer is a hard internal failure — never "pick the first row", which would silently choose an
 * identity for the caller.
 *
 * The message is server side only; the filter renders `500 INTERNAL_ERROR` with a static detail
 * and logs no exception text (`09` §11).
 */
export class IdentityInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'IdentityInvariantError';
  }
}

/**
 * `If-Match` was not sent at all on a route that requires it (`03` §5.2, D-053 clause B.4,
 * D-055 clause 10).
 *
 * `428`, and deliberately NOT `400`. D-028 clause 2 states that `400` is not used for a MISSING
 * `If-Match`, and D-055 clause 12 keeps that rule literally in force while separating it from a
 * header that is present but malformed — see {@link entityTagRejected}. The two are different
 * facts about the request and they must stay different answers: `428` tells a client to ADD the
 * precondition, `400` tells it to FIX the one it sent. Folding them together would teach clients
 * to resend a validator that can never be accepted.
 *
 * The detail names no header value, no resource, no version and no practice.
 */
export function preconditionRequired(): ApiException {
  return new ApiException({
    code: 'PRECONDITION_REQUIRED',
    status: HttpStatus.PRECONDITION_REQUIRED,
    detail: 'A precondition header is required for this operation.',
  });
}

/**
 * `If-Match` was present but is not the accepted strong version validator (D-055 clauses 11–13).
 *
 * `400 VALIDATION_ERROR`, because the fault is the FORMAT OF A HEADER, which `03` §9 classifies
 * as `400`. It is emphatically not `409`: `409 VERSION_CONFLICT` means "you sent a valid version
 * token and it no longer matches", so answering it here would tell a client to re-read the
 * resource and retry with a token it would malform in exactly the same way. It is not `428`
 * either — the header IS present, and asking for it again is nonsense (D-055, Alternatives).
 *
 * NO `errors[]` MEMBER, AND NO ECHO. This is a header-format refusal, not the `422` body-schema
 * document of `03` §8, so it carries no field-level list. The detail names neither the rejected
 * value nor the accepted grammar's current bound, so a crafted `If-Match` cannot be reflected
 * into a response body or a log line (`09` §11).
 */
export function entityTagRejected(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The precondition header is not a valid resource version.',
  });
}

/**
 * A `PATCH` body carried none of the accepted mutable fields (D-055 clause 14).
 *
 * `400 VALIDATION_ERROR`, and endpoint-specific on purpose. D-055 clause 14 is explicit that this
 * outcome is NOT derived from the generic `422` `ValidationPipe` path: an empty patch is the
 * ABSENCE OF A REQUESTED CHANGE, not a change that happens to change nothing, so it is refused
 * before any write and must never consume a version. `{}` is syntactically perfect JSON that asks
 * for nothing, which is a request-format fault under `03` §9.
 *
 * `204` was rejected because it suggests a write that did not happen, and `200` with the current
 * representation because the caller could not then tell "you sent nothing" from "it was written".
 *
 * NO `errors[]` MEMBER. There is no invalid FIELD to name — the fault is the body as a whole.
 */
export function patchBodyEmpty(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The request body must contain at least one modifiable field.',
  });
}

/**
 * The optimistic-concurrency `UPDATE` matched no row (D-055 clauses 19–21).
 *
 * ONE ANSWER FOR BOTH CAUSES. The caller's version may be stale, or the `practice_settings` row
 * may not exist at all. D-055 clause 19 gives both the same outcome and clause 20 forbids the
 * extra read that would tell them apart — that read is race-prone by construction and would
 * disclose internal state the contract never promised. `409` is truthful in both cases: the
 * caller's assumption about the resource state does not hold, so re-read it.
 *
 * The detail names no version, no practice, no table and no row count, so it cannot become an
 * existence oracle for a tenant the caller may not enumerate.
 */
export function versionConflict(): ApiException {
  return new ApiException({
    code: 'VERSION_CONFLICT',
    status: HttpStatus.CONFLICT,
    detail: 'The resource was modified by another request.',
  });
}

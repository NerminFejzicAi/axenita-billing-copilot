/**
 * Application-layer practice context for phase 3.
 *
 * Normative sources: `03` §3.2 (the `X-Practice-ID` contract), §3.4 (route classification),
 * §3.7.1 step 3 (WHERE in the chain the header is read and validated), the accepted
 * `GET /practices/{practiceId}` contract, and D-047 clause 18.
 *
 * WHAT THIS IS NOT
 *
 * This module establishes NO database practice context. `app.practice_id`,
 * `app_security.set_request_context`, `PracticeContextGuard` and `TenantDatabaseService` appear
 * nowhere in it (D-047 clauses 10 and 16, `02` §16.2.3, §22.13). D-047 clause 18 names the
 * phase 3 state explicitly: the tenant narrowing for `GET /practices/{id}` is performed
 * ADDITIONALLY at the application layer, and that is exactly — and only — what this module does.
 *
 * `set_request_context` DOES exist from package `013_rls_policies` onward, and the identity
 * bootstrap calls it internally for `GET /me` (D-053). That is a different route and a different
 * mechanism: it derives its practice ids from resolved membership rows, never from the header
 * this module validates. `PracticeContextGuard` and `TenantDatabaseService` remain unbuilt.
 *
 * It is also not a guard. `03` §3.7.1 fixes the order of the chain and forbids skipping steps:
 * the bearer token is verified first (step 1), the current user is resolved and admitted second
 * (step 2), and only then is `X-Practice-ID` read and validated (step 3). A guard would run
 * before step 2 and would answer a caller whose identity has not been admitted yet, which is
 * why the validation lives in the application service instead.
 */

import { practiceContextInvalid, practiceContextRequired } from '../identity.errors.js';

/**
 * The canonical spelling of the tenant context header (`03` §3.2).
 *
 * Node lower-cases incoming header names, and Express looks them up case-insensitively, so this
 * constant is safe to use for reading as well as for documentation. No alternative spelling and
 * no fallback header is accepted: a tenant route reads this header and nothing else.
 */
export const PRACTICE_CONTEXT_HEADER_NAME = 'X-Practice-ID';

/**
 * The canonical 8-4-4-4-12 hexadecimal UUID form.
 *
 * Deliberately not version- or variant-constrained. PostgreSQL's `uuid` type accepts any value
 * of this shape, and `practices.id` is populated by migration and seed (D-047 clause 15), so
 * constraining the version here could make a legitimately stored practice unrequestable. The
 * shape check is still strict enough to be the complete `PRACTICE_CONTEXT_INVALID` decision:
 * a value that passes it can always be cast to `uuid` without a database error.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `candidate` is a canonical UUID. Never throws and never grants. */
export function isUuid(candidate: string): boolean {
  return UUID_PATTERN.test(candidate);
}

/**
 * Normalises a UUID for comparison and for use as a query parameter.
 *
 * PostgreSQL stores and renders `uuid` values in lower case, so `ABCDEF...` and `abcdef...` are
 * the same practice. Comparing the raw strings would reject a correct request purely on the
 * client's letter case; comparing the normalised forms compares identities.
 */
function normaliseUuid(value: string): string {
  return value.toLowerCase();
}

/**
 * Reads and validates the practice context of a tenant request — step 3 of `03` §3.7.1.
 *
 * The three outcomes are exactly the ones `03` §3.2 and the `GET /practices/{practiceId}`
 * contract fix, and no fourth outcome and no new error code exists:
 *
 * - the header is absent (or empty) -> `400 PRACTICE_CONTEXT_REQUIRED`;
 * - the header is present but is not a UUID -> `400 PRACTICE_CONTEXT_INVALID`;
 * - the header is a valid UUID that is not the practice of the path -> `403 ACCESS_DENIED`,
 *   raised by the caller through {@link assertPathMatchesPracticeContext}.
 *
 * @param headerValue the raw `X-Practice-ID` value, or `undefined` when the client sent none.
 * @returns the normalised practice id the request is scoped to.
 */
export function readPracticeContext(headerValue: string | undefined): string {
  if (headerValue === undefined || headerValue.trim().length === 0) {
    throw practiceContextRequired();
  }

  const candidate = headerValue.trim();

  if (!isUuid(candidate)) {
    throw practiceContextInvalid();
  }

  return normaliseUuid(candidate);
}

/**
 * Proves that the `practiceId` of the path is the practice of the established context.
 *
 * `03` requires it in so many words: "`practiceId` iz putanje mora odgovarati uspostavljenom
 * practice contextu", and lists "`practiceId` iz putanje ≠ practice context" as a
 * `403 ACCESS_DENIED` case.
 *
 * A path segment that is not a UUID at all takes the same branch, on purpose. It cannot be the
 * validated context UUID, so it is a mismatch, and answering it with anything other than the
 * shared `403` would let a caller distinguish "no such practice" from "not your practice"
 * (anti-enumeration). It is deliberately NOT reported as `PRACTICE_CONTEXT_INVALID`: that code
 * belongs to the header, not to the path.
 *
 * @param pathPracticeId the raw `{practiceId}` path segment.
 * @param practiceContextId the already validated, normalised context from
 *   {@link readPracticeContext}.
 * @param onMismatch produces the exception to throw. The caller supplies it so that this module
 *   holds no opinion about the response, and so the mismatch cannot accidentally acquire a
 *   distinguishing detail of its own.
 */
export function assertPathMatchesPracticeContext(
  pathPracticeId: string,
  practiceContextId: string,
  onMismatch: () => Error,
): void {
  if (!isUuid(pathPracticeId) || normaliseUuid(pathPracticeId) !== practiceContextId) {
    throw onMismatch();
  }
}

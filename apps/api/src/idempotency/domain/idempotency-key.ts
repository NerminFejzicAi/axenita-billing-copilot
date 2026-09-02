/**
 * The accepted domain of an `Idempotency-Key` header value (D-079 `OD-P5-I4C-2`).
 *
 * Normative sources: `03` §4.2, §5.2, §8 and §9; `02` §15.2 (`idempotency_key varchar(255)`);
 * D-055 clause 12; D-062 part D; D-079 `OD-P5-I4C-2`; `08` §12.12 obligation 1.
 *
 *     absent / empty / whitespace-only  ->  400 IDEMPOTENCY_KEY_REQUIRED
 *     length                            =   1 .. 255 UTF-8 bytes
 *     allowed bytes                     =   printable ASCII VCHAR 0x21 .. 0x7E, exclusively
 *     present but outside that domain   ->  400 VALIDATION_ERROR
 *
 * CONSEQUENCES OF "VCHAR ONLY", STATED SO THAT NONE OF THEM IS A SURPRISE
 *
 * - the ASCII SPACE `0x20` is INVALID — it is not a VCHAR, and `03` treats a header whose shape
 *   the endpoint does not accept as a format fault, not as something to trim;
 * - every control character is invalid, including `\t`, `\r` and `\n`;
 * - EVERY non-ASCII character is invalid, whatever it normalises to;
 * - embedded whitespace is invalid, so a key is a single unbroken token.
 *
 * WHY 255 BYTES IS EXACTLY THE COLUMN WIDTH, AND WHY THAT NEEDS NO MIGRATION
 *
 * `idempotency_keys.idempotency_key` is `varchar(255)`, which PostgreSQL measures in CHARACTERS.
 * The accepted domain is ASCII-only, so 255 UTF-8 bytes ARE 255 characters and the application
 * bound coincides with the column bound exactly. No schema change is required and none is
 * authorised (`OD-P5-I4C-2`).
 *
 * WHERE THIS RUNS IN THE ORDER, AND WHY IT MATTERS
 *
 * This is a HEADER check. It runs BEFORE idempotency scope inspection, BEFORE the advisory lock
 * and BEFORE the request body is hashed. An unaccepted key therefore never derives a lock key,
 * never creates a claim and never touches `idempotency_keys` at all — which is a property of
 * ORDER, not of intent, and is asserted as such by the behavioural spec.
 *
 * IT IS A PURE FUNCTION, and it is deliberately not a `class-validator` DTO: there is no body to
 * validate here, the failure is `400` rather than the pipe's `422`, and the response carries no
 * `errors[]` list. Routing it through the body validator would produce the wrong status and the
 * wrong document shape.
 */

import { idempotencyKeyInvalid, idempotencyKeyRequired } from '../idempotency.errors.js';

/** Lowest accepted byte — `!`, the first printable ASCII VCHAR (RFC 5234 `VCHAR`). */
export const IDEMPOTENCY_KEY_MIN_BYTE = 0x21;

/** Highest accepted byte — `~`, the last printable ASCII VCHAR. */
export const IDEMPOTENCY_KEY_MAX_BYTE = 0x7e;

/** Maximum accepted length, in UTF-8 bytes — exactly the width of the persisted column. */
export const IDEMPOTENCY_KEY_MAX_UTF8_BYTES = 255;

/**
 * Whether every byte of `value` is a printable ASCII VCHAR.
 *
 * MEASURED OVER UTF-8 BYTES, not over string characters. A code point outside ASCII encodes to
 * bytes that are all `>= 0x80`, so it is rejected by the same comparison rather than by a
 * separate rule that could disagree with it.
 */
function isPrintableAsciiVchar(utf8: Buffer): boolean {
  for (const byte of utf8) {
    if (byte < IDEMPOTENCY_KEY_MIN_BYTE || byte > IDEMPOTENCY_KEY_MAX_BYTE) {
      return false;
    }
  }

  return true;
}

/**
 * Validates one raw `Idempotency-Key` header value, or throws.
 *
 * @param raw the header exactly as received, or `undefined` when the client sent none.
 *   `undefined` and `''` must reach this function as DIFFERENT values and nothing on the way in
 *   may collapse them — although, unlike `If-Match`, both produce the same answer here.
 * @returns the accepted key, unchanged. It is NEVER trimmed, NEVER normalised, NEVER lowercased
 *   and NEVER truncated: the key is an opaque client-chosen token, and repairing one would mean
 *   two different requests silently shared a scope.
 * @throws ApiException `400 IDEMPOTENCY_KEY_REQUIRED` when absent, empty or whitespace-only;
 *   `400 VALIDATION_ERROR` when present but outside the accepted domain. Neither message names
 *   the submitted value.
 */
export function validateIdempotencyKey(raw: string | undefined): string {
  // ABSENCE FIRST, and whitespace-only counts as absence (`03` §4.2, `OD-P5-I4C-2`). `trim()` is
  // used ONLY to make this decision — the value that travels on is always the untrimmed original,
  // because a key that needed trimming is refused two lines below rather than repaired.
  if (raw === undefined || raw.trim() === '') {
    throw idempotencyKeyRequired();
  }

  const utf8 = Buffer.from(raw, 'utf8');

  // The two domain rules, in one refusal. They are deliberately NOT reported separately: the
  // response body is identical for a too-long key and for a key containing a space, so the
  // refusal cannot be used to probe which rule a crafted value tripped.
  if (utf8.length > IDEMPOTENCY_KEY_MAX_UTF8_BYTES || !isPrintableAsciiVchar(utf8)) {
    throw idempotencyKeyInvalid();
  }

  return raw;
}

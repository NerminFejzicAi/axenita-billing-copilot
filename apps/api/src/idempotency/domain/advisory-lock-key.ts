/**
 * The transaction-scoped advisory-lock key of one idempotency scope — exact bytes, exact int64.
 *
 * Normative sources: D-072, *Ugovor advisory locka* (four scope components, five derivation
 * steps, three prohibitions); D-079 `OD-P5-I4C-3` (the frozen domain tag, the component order and
 * the length-prefix width); `08` §12.12 obligation 6; `09` §4.2.
 *
 * THE DERIVATION, IN FULL
 *
 *     LP32(X)  = uint32_be( length( UTF8(X) ) ) || UTF8(X)
 *
 *     preimage = LP32("idem-lock-v1")
 *             || LP32(practice_id)
 *             || LP32(user_id)
 *             || LP32(endpoint)
 *             || LP32(idempotency_key)
 *
 *     digest   = SHA-256(preimage)
 *     lock_key = first 8 bytes of digest, BIG-ENDIAN, SIGNED two's-complement int64
 *
 * WHY LENGTH PREFIXES AND NOT A DELIMITER
 *
 * `idempotency_key` is CLIENT-CONTROLLED. Under plain concatenation the scopes
 * `(user "ab", key "c")` and `(user "a", key "bc")` produce the same bytes and therefore the same
 * lock, so one caller could take the lock another caller's request needs. A delimiter merely
 * moves the problem to "which byte may a key not contain" — and the accepted key domain
 * (`OD-P5-I4C-2`) admits every printable ASCII character, including every plausible delimiter.
 * A length prefix has no such escape: the boundary is stated out of band, so no value can forge
 * one. The pinned vectors below prove exactly that pair of scopes diverges.
 *
 * WHY THE LENGTH IS A UTF-8 BYTE COUNT
 *
 * `length(UTF8(X))` is the number of BYTES, never `String.prototype.length` (UTF-16 code units)
 * and never a code-point count. The three differ for any non-ASCII value, and a prefix that
 * disagreed with the bytes that follow it would make the framing ambiguous again.
 *
 * WHAT THE DOMAIN TAG IS, AND IS NOT
 *
 * `idem-lock-v1` is a CONSTANT DOMAIN SEPARATOR and NOT a fifth scope component: it carries no
 * bit of scope information and exists only so that this lock space cannot collide with some
 * future, differently purposed advisory-lock space over the same database. D-072's "exactly four
 * scope components" therefore still holds, literally (D-079 `OD-P5-I4C-3`).
 *
 * WHAT THIS MODULE IS NOT
 *
 * The advisory lock is a CONCURRENCY CONTROL, never a security or authorisation boundary
 * (`09` §4.2) — tenant isolation is carried by `FORCE RLS`. The derived key is therefore never
 * persisted, never rendered into a response and never logged: it is returned to exactly one
 * caller, bound as a statement parameter, and discarded with the transaction.
 *
 * IT IS A PURE FUNCTION AND HAS NO NEST WIRING, deliberately and by the same ruling that keeps
 * the `P5-I4B` hash primitives unwired (D-078 `OD-P5-I4B-C5`, D-079 `RULING B`): it holds no
 * state, reaches no database and depends on no provider, so a token would add a lifecycle and
 * nothing else.
 */

import { createHash } from 'node:crypto';

import { type IdempotencyScope } from '../idempotency.constants.js';

/**
 * The frozen domain tag of this lock space (`OD-P5-I4C-3`).
 *
 * No alternative tag is authorised. Changing it would silently repartition the lock space, so a
 * request in flight under the old tag and a request under the new one would stop excluding each
 * other — which is why the value is a constant here and a literal in the pinned vectors.
 */
export const ADVISORY_LOCK_DOMAIN_TAG = 'idem-lock-v1';

/** The width of the length prefix, in bytes — FOUR, unsigned, big-endian (`OD-P5-I4C-3`). */
export const ADVISORY_LOCK_LENGTH_PREFIX_BYTES = 4;

/** How many leading digest bytes become the lock key — EIGHT, big-endian, signed. */
export const ADVISORY_LOCK_KEY_BYTES = 8;

/**
 * `LP32(value)` — the four-byte big-endian UTF-8 byte count, followed by those bytes.
 *
 * `Buffer.from(value, 'utf8').length` IS the UTF-8 byte count; it is read from the encoded buffer
 * rather than computed from the string, so the prefix and the payload can never disagree.
 */
function lengthPrefixed(value: string): Buffer {
  const utf8 = Buffer.from(value, 'utf8');
  const prefix = Buffer.alloc(ADVISORY_LOCK_LENGTH_PREFIX_BYTES);

  // `writeUInt32BE` is the big-endian, unsigned, four-byte encoding the contract names, and it
  // THROWS rather than truncating for a value outside the range — a length that did not fit
  // would otherwise wrap and reintroduce the framing ambiguity the prefix exists to remove.
  prefix.writeUInt32BE(utf8.length, 0);

  return Buffer.concat([prefix, utf8]);
}

/**
 * The exact advisory-lock preimage of one idempotency scope.
 *
 * Exported so that a specification-derived vector can assert the BYTES, not merely the resulting
 * integer: two different encodings can collide on one digest by chance far less often than a
 * reviewer can misread a hex string, but only the byte-level assertion catches a wrong component
 * ORDER that happens to be tested with symmetric fixtures.
 */
export function advisoryLockPreimage(scope: IdempotencyScope): Buffer {
  // THE ORDER IS THE CONTRACT (`OD-P5-I4C-3`): tag, practice, user, endpoint, key. It is written
  // out here rather than iterated over an array of fields, so that reordering it is an edit a
  // reviewer sees on the line that defines it.
  return Buffer.concat([
    lengthPrefixed(ADVISORY_LOCK_DOMAIN_TAG),
    lengthPrefixed(scope.practiceId),
    lengthPrefixed(scope.userId),
    lengthPrefixed(scope.endpoint),
    lengthPrefixed(scope.idempotencyKey),
  ]);
}

/**
 * The transaction-scoped advisory-lock key of one idempotency scope.
 *
 * @returns the first eight digest bytes read as a BIG-ENDIAN SIGNED two's-complement `int64` —
 *   the exact domain of `pg_try_advisory_xact_lock(bigint)`. Roughly half of all scopes therefore
 *   yield a NEGATIVE key, which is correct and must not be "fixed" by masking the sign bit:
 *   folding the sign away would halve the key space and double the collision rate.
 */
export function advisoryLockKey(scope: IdempotencyScope): bigint {
  const digest = createHash('sha256').update(advisoryLockPreimage(scope)).digest();

  // `readBigInt64BE` IS "first eight bytes, big-endian, signed two's-complement". There is no
  // string round trip, no `parseInt`, no `Number` and therefore no precision loss: a `number`
  // cannot represent an `int64` exactly, and a truncated key would collide across scopes.
  return digest.readBigInt64BE(0);
}

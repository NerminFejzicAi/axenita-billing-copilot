import { canonicaliseJson, type JsonValue } from './json-canonicalizer.js';
import { sha256HexUtf8 } from './sha256-utf8.js';

/**
 * The canonical request hash stored in `idempotency_keys.request_sha256`.
 *
 * ```text
 * request_sha256 = SHA-256( UTF8( JCS( VALIDATED_ORIGINAL_PARSED_BODY ) ) )
 * ```
 *
 * (D-069 `RULING 4`; D-072 `OD-P5-I4-3`; `03` §4.1; `04` §7.5a.1.)
 *
 * WHAT THE INPUT IS, EXACTLY. The PRESERVED ORIGINAL PARSED JSON VALUE: the thing `JSON.parse`
 * produced, kept aside after unknown-field validation has SUCCEEDED but BEFORE anything else
 * touches it. The canonical pipeline is
 *
 * ```text
 * parse -> preserve the parsed value -> validate -> JCS -> SHA-256
 * ```
 *
 * WHAT THE INPUT IS NOT. Not the raw HTTP byte stream, not the pre-parse JSON text, not a
 * transformed DTO, not a class instance, and not a server-widened object. Each of those would
 * make the digest depend on something the client did not send:
 *
 *  - a DTO or class instance carries SERVER DEFAULTS, and a default is a value the client never
 *    supplied, so hashing it would give two clients who sent identical bodies two different
 *    digests the moment a default changed;
 *  - the raw text carries WHITESPACE and KEY ORDER, both of which JCS exists to erase;
 *  - a server-widened object carries REQUEST CONTEXT, which §4.1 excludes outright.
 *
 * WHAT IS EXCLUDED, AND WHY IT NEEDS NO CODE HERE. The HTTP method, the path, the query string,
 * the headers, the `Idempotency-Key` itself, the caller's identity, the practice identity, the
 * request id, server-generated ids, server-derived status and server timestamps are all
 * excluded (`03` §4.1). They are excluded STRUCTURALLY: this function is handed a body and has
 * no access to any of them, so there is no filter to get wrong. The endpoint is not in the
 * digest because the key scope already carries it separately — `unique (practice_id, user_id,
 * endpoint, idempotency_key)` (`02` §11) — and putting it in both places would create a second
 * source of one truth.
 *
 * UNKNOWN FIELDS NEVER REACH HERE. They are rejected BEFORE hashing, by the validation step
 * that runs first, so no unknown field can ever enter a digest. That ordering is the caller's
 * obligation and is asserted at the integration boundary, not re-implemented here.
 *
 * THE INVARIANTS IT INHERITS FROM JCS
 *
 * ```text
 * input object key order   = INSIGNIFICANT
 * array element order      = SIGNIFICANT
 * input whitespace         = INSIGNIFICANT once parsed
 * explicit null vs absent  = DIFFERENT
 * Unicode normalisation    = NONE
 * output                   = 64 lowercase hexadecimal characters
 * ```
 *
 * `null` and absence differ because they are different JSON documents: one has the property and
 * one does not, so the canonical forms differ by the whole `"key":null` member.
 *
 * @returns exactly 64 lowercase hexadecimal characters.
 * @throws CryptoOperationError if the body is not I-JSON (RFC 8785 §3.1).
 */
export function requestSha256(validatedOriginalParsedBody: JsonValue): string {
  // Composition stays EXPLICIT and visible: canonicalise, then digest. `sha256HexUtf8` is the
  // canonical P5-I3 helper, reused unchanged — it is given a string and crosses the UTF-8
  // boundary itself (RFC 8785 §3.2.4). It never canonicalises on its own.
  return sha256HexUtf8(canonicaliseJson(validatedOriginalParsedBody));
}

/**
 * The `If-Match` parser of `PATCH /api/v1/practices/{practiceId}/settings`.
 *
 * Normative sources: `03` §5.2 and §9; D-028 clause 2; D-053 clause B.4; D-055 clauses 10 to 13;
 * `02` §6.4 (`practice_settings.version` is a PostgreSQL `integer`). Owner ratification R1 of the
 * P4-5D gate fixes the numeric domain.
 *
 * A DELIBERATELY NARROWER GRAMMAR THAN HTTP'S
 *
 * Generic HTTP `If-Match` admits `*`, comma-separated validator lists and weak forms. Every one
 * of those is either meaningless or dangerous for a resource whose validator IS an integer
 * version: `*` means "write regardless of the version", which is the exact negation of the
 * optimistic concurrency this token exists to carry, and a weak validator asserts only semantic
 * equivalence where a write needs an EXACT version. D-055 clause 11 therefore accepts exactly
 * one shape — the one `GET` emits:
 *
 *     "<N>"        N a canonical non-negative decimal integer
 *
 * The narrowing is a tightening, not a deviation (D-055 clause 11), and it is what keeps the tag
 * the single channel of the resource version.
 *
 * THREE OUTCOMES, AND THEY ARE NORMATIVELY DIFFERENT (D-055 clause 12)
 *
 *     header absent              -> 428 PRECONDITION_REQUIRED   "add the precondition"
 *     header present, malformed  -> 400 VALIDATION_ERROR        "fix the one you sent"
 *     header accepted, stale     -> 409 VERSION_CONFLICT        "re-read the resource"
 *
 * Only the first two are decided here; `409` is decided by the number of rows the atomic
 * `UPDATE` matches and never by this function. An absent header and an EMPTY header value are
 * different facts and get different answers — `undefined` is `428`, `''` is `400` — and D-055
 * clauses 10 to 12 freeze that distinction. Folding empty into missing would tell a client to
 * add a header it demonstrably already sent.
 *
 * WHY THE HEADER IS NOT TRIMMED
 *
 * The accepted token is compared byte for byte against the grammar. Trimming would silently
 * accept `  "1"  `, which is NOT what `GET` emitted and NOT what clause 11 accepts, and it would
 * make the set of accepted inputs depend on a normalisation step no canonical document names.
 * Node's HTTP parser already strips the optional whitespace RFC 9110 allows AROUND a field
 * value; anything left inside the value is part of the value and is rejected.
 */

import { entityTagRejected, preconditionRequired } from '../identity.errors.js';

/**
 * The accepted grammar of D-055 clause 11, anchored at both ends.
 *
 * `0|[1-9][0-9]*` is the CANONICAL decimal form: it admits `"0"` and forbids `"01"`, which is a
 * non-canonical rendering of the same number and therefore not a token `GET` could have emitted.
 * The surrounding quotes are literal, so `1`, `W/"1"`, `*`, `"1", "2"`, `"1`, `"abc"`, `"-1"`,
 * `"+1"`, `"1.0"`, `"1e3"`, `"0x1"`, `" 1 "` and `''` all fail here, by construction rather than
 * by enumeration. `^`/`$` (not `\d`, and no `m` flag) mean a newline cannot smuggle a second
 * line past the anchors.
 */
const STRONG_VERSION_TAG = /^"(0|[1-9][0-9]*)"$/;

/**
 * The largest value `practice_settings.version` can hold — PostgreSQL `int4` (`02` §6.4).
 *
 * OWNER RATIFICATION R1. The accepted APPLICATION token domain is the domain the COLUMN can
 * represent. `03` §10 makes the emitted `ETag` that very integer, and D-055 clause 11 makes the
 * accepted `If-Match` the exact form `GET` emits, so a token above this bound cannot be any
 * resource's current version and is a malformed validator rather than a stale one.
 *
 * Rejecting it HERE, before the value is ever bound or cast, is the point: a decimal token of
 * arbitrary length that reached `version = $n::integer` would raise PostgreSQL `22003`
 * (`numeric_value_out_of_range`), which is a generic driver failure and would surface as
 * `500 INTERNAL_ERROR` — a client-controlled input turning into an internal error. No
 * client-supplied `If-Match` may produce `22003`, and this bound is why none can.
 *
 * `"0"` is NOT special-cased in either direction. It is syntactically valid per clause 11, and
 * because the persisted `version` is constrained `>= 1` it simply matches no row and takes the
 * ordinary zero-row path to `409 VERSION_CONFLICT`.
 */
const MAX_INT4 = 2147483647;

/**
 * The digit count of {@link MAX_INT4}, used as a cheap bound BEFORE `BigInt` sees the string.
 *
 * `BigInt` on an unbounded run of digits is unbounded work — a body-limited request can still
 * carry a very long header — so the length is checked first. Any decimal longer than ten digits
 * is necessarily greater than `MAX_INT4`, so the guard rejects exactly what the numeric bound
 * below would have rejected, without doing the arbitrary-precision parse to find out.
 */
const MAX_INT4_DIGITS = 10;

/**
 * Parses the raw `If-Match` header into the expected `version` of the optimistic `UPDATE`.
 *
 * @param rawHeader the header EXACTLY as received, or `undefined` when the client sent none. It
 *   is never trimmed, lower-cased, split or otherwise normalised before it gets here.
 * @returns a `Number` proven to be a non-negative integer within PostgreSQL `int4`, and therefore
 *   safe to bind to an `::integer` parameter.
 * @throws the `428` of {@link preconditionRequired} when the header is absent, and the `400` of
 *   {@link entityTagRejected} for every present-but-unaccepted value. Neither carries the
 *   rejected text.
 */
export function parseIfMatchVersion(rawHeader: string | undefined): number {
  // 1. ABSENT. The one case that is not a format fault, and the only one that is `428`.
  if (rawHeader === undefined) {
    throw preconditionRequired();
  }

  // 2. GRAMMAR. Everything present but unaccepted — including the empty string — stops here.
  const match = STRONG_VERSION_TAG.exec(rawHeader);

  if (match === null) {
    throw entityTagRejected();
  }

  // 3. The captured decimal digits. The regex matched, so the group exists; the explicit check
  //    keeps this total rather than relying on a non-null assertion, which `12` §4 forbids.
  const digits = match[1];

  if (digits === undefined) {
    throw entityTagRejected();
  }

  // 4. BOUNDED LENGTH, BEFORE ANY ARBITRARY-PRECISION PARSE.
  if (digits.length > MAX_INT4_DIGITS) {
    throw entityTagRejected();
  }

  // 5. `BigInt`, not `Number`, and not `parseInt`. `Number('2147483648123456789')` silently
  //    loses precision above `Number.MAX_SAFE_INTEGER`, and `parseInt` stops at the first
  //    non-digit — both would compare a value that is not the one the client sent. The string
  //    here is proven to be a bounded run of decimal digits, so this conversion is exact.
  const value = BigInt(digits);

  // 6. THE INT4 BOUND (owner ratification R1).
  if (value > BigInt(MAX_INT4)) {
    throw entityTagRejected();
  }

  // 7. Only now, with `0 <= value <= 2147483647` proven, does the value become a `Number`. Every
  //    value in that range is exactly representable, so nothing is lost and the result can be
  //    bound to `::integer` without any possibility of `22003`.
  return Number(value);
}

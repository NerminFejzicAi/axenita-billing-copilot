/**
 * The canonical, deterministic cancel-`reason` sanitizer (`P5-I5D`).
 *
 * Normative sources: D-089 `RULING B` (L4-A required, L4-B lengths, L4-C `ACCEPT_AND_SANITIZE`)
 * and `RULING G` (`OD-P5-I5D-5`, the exact profile); D-062 part F.3; `09` §12.2.
 *
 * THE PROFILE, IN THIS ORDER AND IN NO OTHER:
 *
 *     1  Unicode well-formedness       a lone surrogate is refused; a valid pair is accepted
 *     2  raw length                    <= 255 UTF-8 bytes of the PARSED string, before step 3
 *     3  NFC                           never NFKC; applied exactly once
 *     4  Cc -> U+0020                  every code point of general category Cc
 *                                      (U+0000-U+001F, U+007F, U+0080-U+009F), one for one
 *     5  White_Space collapse          every run of Unicode White_Space -> ONE U+0020
 *     6  boundary trim                 the U+0020 left at either end by step 5, and nothing else
 *     7  final validation              >= 1 code point and <= 255 UTF-8 bytes
 *
 * WHAT IS DELIBERATELY NOT DONE. No semantic interpretation, no AI, no default or replacement
 * reason, no NFKC, no second NFC pass and no rejection of U+FFFD. Format characters (Cf, bidi
 * controls included) are PRESERVED: step 5 uses the explicit Unicode `White_Space` property and
 * step 6 removes only U+0020, because the generic regex whitespace class and the built-in string
 * trimming both treat U+FEFF as whitespace, which is not the contract. `encounter-cancel-reason
 * .spec.ts` guards this source against both.
 *
 * THE INPUT IS THE PARSED JSON STRING — not the HTTP transport bytes, not the JSON escape source
 * and not the length of the whole body. A parser that already replaced invalid transport UTF-8
 * with U+FFFD hands over a well-formed string, and nothing here reconstructs the original bytes.
 *
 * PURE. No I/O, no logging and no exception: the caller decides the HTTP answer, so the raw value
 * cannot leak through an error built here.
 */

import { isWellFormedUnicode } from '../../crypto/manual-v1-identifier-normalizer.js';

/** `RAW_REASON_MAX` — the parsed string, before normalisation (L4-B). */
export const CANCEL_REASON_RAW_MAX_UTF8_BYTES = 255;

/** The maximum of the final sanitised value (L4-B). */
export const CANCEL_REASON_SANITIZED_MAX_UTF8_BYTES = 255;

/** The minimum of the final sanitised value, in Unicode code points (L4-B). */
export const CANCEL_REASON_SANITIZED_MIN_CODE_POINTS = 1;

const SPACE = ' ';

/** General category Cc — exactly U+0000-U+001F and U+007F-U+009F. */
const CONTROL_CHARACTER = /\p{Cc}/gu;

/** One or more code points with the Unicode `White_Space` property. */
const WHITE_SPACE_RUN = /\p{White_Space}+/gu;

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Code points, not UTF-16 code units: a surrogate pair counts once. */
function codePointCount(value: string): number {
  let count = 0;

  for (const _codePoint of value) {
    count += 1;
  }

  return count;
}

/** Step 6 — at most ONE U+0020 can remain at either end after step 5. */
function stripBoundarySpace(value: string): string {
  const start = value.startsWith(SPACE) ? SPACE.length : 0;
  const end =
    value.endsWith(SPACE) && value.length > start ? value.length - SPACE.length : value.length;

  return value.slice(start, end);
}

/**
 * @returns the sanitised reason, or `undefined` when the canonical contract refuses the value —
 *   the caller answers every refusal with the same static `422`.
 */
export function sanitizeCancelReason(raw: string): string | undefined {
  // Step 1 — before anything measures, normalises or hashes the string. A lone surrogate has no
  // UTF-8 encoding and would otherwise reach the JCS canonicaliser.
  if (!isWellFormedUnicode(raw)) {
    return undefined;
  }

  // Step 2 — the parsed string as received.
  if (utf8ByteLength(raw) > CANCEL_REASON_RAW_MAX_UTF8_BYTES) {
    return undefined;
  }

  // Steps 3 to 6.
  const sanitized = stripBoundarySpace(
    raw.normalize('NFC').replace(CONTROL_CHARACTER, SPACE).replace(WHITE_SPACE_RUN, SPACE),
  );

  // Step 7 — NFC may EXPAND the string, so the byte limit is applied again to the result.
  if (
    codePointCount(sanitized) < CANCEL_REASON_SANITIZED_MIN_CODE_POINTS ||
    utf8ByteLength(sanitized) > CANCEL_REASON_SANITIZED_MAX_UTF8_BYTES
  ) {
    return undefined;
  }

  return sanitized;
}

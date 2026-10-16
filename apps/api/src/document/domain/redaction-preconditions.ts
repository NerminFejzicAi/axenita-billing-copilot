import {
  CLINICAL_TEXT_MAX_UTF8_BYTES,
  containsNul,
  containsRejectedControl,
} from '../../crypto/clinical-text-normalizer.js';
import { isWellFormedUnicode } from '../../crypto/manual-v1-identifier-normalizer.js';

import { RedactionPreconditionBreachError } from './redaction-precondition-breach.error.js';

/**
 * The mandatory, assertion-only re-assertion of the eight canonical `P5-I3C` postconditions
 * (D-093 `RULING C.3`, `G-3`).
 *
 * ASSERTION ONLY. Nothing here normalises, repairs, trims or otherwise transforms the value; it
 * is either accepted exactly as given or the call fails.
 *
 * NOT `normaliseClinicalText(x) === x`. That shortcut is forbidden: the normaliser removes ONE
 * leading `U+FEFF`, so a valid normalised value may itself start with `U+FEFF`, and a second pass
 * would wrongly reject it. Each predicate is therefore checked on its own.
 *
 * The predicates reuse the normaliser's own primitives wherever one exists, so the asserted set
 * can never drift from the set the normaliser enforces:
 *
 *   1  well-formed Unicode         `isWellFormedUnicode` (the P5-I3C step 1 predicate)
 *   2  no CR                       no `U+000D`
 *   3  no NUL                      `containsNul`
 *   4  no rejected C0/C1           `containsRejectedControl` (TAB and LF allowed; `U+007F` is
 *                                  not in the ratified set)
 *   5  NFC                         the value equals its `NFC` form
 *   6  no outer `White_Space`      the first and last code point are not Unicode `White_Space`
 *                                  (the P5-I3C step 7 property; a precondition, not a matcher,
 *                                  so `\p{…}` is permitted here — D-093 `RULING C.3`)
 *   7  non-empty                   length > 0
 *   8  size                        UTF-8 length <= 262144 bytes
 */

/** A leading Unicode `White_Space` code point. */
const LEADING_WHITE_SPACE = /^\p{White_Space}/u;

/** A trailing Unicode `White_Space` code point. */
const TRAILING_WHITE_SPACE = /\p{White_Space}$/u;

const CARRIAGE_RETURN = 0x0d;

/** Whether `value` contains `U+000D` (predicate 2). */
function containsCarriageReturn(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === CARRIAGE_RETURN) {
      return true;
    }
  }

  return false;
}

/**
 * Asserts that `text` is canonical normalised clinical text, or throws the static
 * {@link RedactionPreconditionBreachError}.
 *
 * The thrown error is identical for every violated predicate: it never says WHICH predicate
 * failed, so it cannot leak a property of the document.
 */
export function assertRedactionPreconditions(text: string): void {
  if (
    !isWellFormedUnicode(text) ||
    containsCarriageReturn(text) ||
    containsNul(text) ||
    containsRejectedControl(text) ||
    text.normalize('NFC') !== text ||
    LEADING_WHITE_SPACE.test(text) ||
    TRAILING_WHITE_SPACE.test(text) ||
    text.length === 0 ||
    Buffer.byteLength(text, 'utf8') > CLINICAL_TEXT_MAX_UTF8_BYTES
  ) {
    throw new RedactionPreconditionBreachError();
  }
}

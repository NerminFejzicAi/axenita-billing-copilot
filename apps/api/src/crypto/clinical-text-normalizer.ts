import { clinicalTextRejected } from './crypto.errors.js';
import { isWellFormedUnicode } from './manual-v1-identifier-normalizer.js';

/**
 * The clinical-text normalisation pipeline.
 *
 * WHY A PIPELINE AND NOT "SOME CLEANING"
 *
 * The normalised string is the value a later slice hashes and stores. Two spellings of one
 * document that normalise differently produce two different digests and therefore two
 * different documents, so the pipeline is fixed, ordered and immutable exactly like the
 * MANUAL-v1 identifier profile it sits beside.
 *
 * IT IS NOT THAT PROFILE, THOUGH. An identifier is a token; clinical text is a DOCUMENT. The
 * two differ in three deliberate places: line endings are normalised here (an identifier has
 * none), TAB and LF survive here (an identifier rejects them), and the size ceiling is 256 KiB
 * rather than 255 bytes.
 *
 * THE TEN STEPS, IN THIS EXACT ORDER
 *
 *   1. the input must be valid Unicode;
 *   2. `CRLF` and lone `CR` become `LF`;
 *   3. `U+0000` is rejected;
 *   4. the C0/C1 controls other than TAB and LF are rejected;
 *   5. ONE leading `U+FEFF` is removed;
 *   6. `NFC`;
 *   7. outer Unicode `White_Space` is trimmed at the WHOLE-DOCUMENT boundary;
 *   8. an empty result is rejected;
 *   9. the UTF-8 byte length of the FINAL value must be `<= 262144`;
 *  10. an oversized value is REJECTED, never truncated.
 *
 * WHAT THE PIPELINE DELIBERATELY DOES NOT DO. No `NFKC`, no case folding, no homoglyph or
 * confusable folding, no punctuation rewriting, no inner whitespace collapsing, no blank-line
 * squeezing and no clinical semantic rewriting. A discharge letter's indentation, its blank
 * lines and its tabulated findings are part of the record.
 *
 * IT ALSO REPAIRS NOTHING. Ill-formed input is REJECTED, never mended: `toWellFormed()` would
 * turn a lone surrogate into the replacement character and store a document the caller never
 * sent.
 *
 * IT IS NOT A REDACTOR EITHER. Nothing here detects, masks or removes personal data; that is a
 * separate concern owned by a later slice.
 */

/**
 * The maximum UTF-8 byte length of a normalised clinical document — 256 KiB.
 *
 * This is the POST-NORMALISATION output ceiling and nothing else. A pre-normalisation
 * request-size limit is an endpoint concern and is deliberately not implemented here.
 */
export const CLINICAL_TEXT_MAX_UTF8_BYTES = 262144;

/**
 * The byte-order mark `U+FEFF`, removed by step 5 in LEADING position only.
 *
 * Built from its code point rather than written as an escape so that the source file itself
 * stays free of an invisible character an editor would hide.
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * `CRLF` and lone `CR` (step 2).
 *
 * `\r\n?` is greedy on the optional `\n`, so one `CRLF` collapses to exactly one `LF` instead
 * of two. A `CR` not followed by `LF` becomes `LF` on its own. An existing `LF` is not matched
 * at all and passes through untouched.
 */
const LINE_ENDINGS = /\r\n?/g;

/**
 * Outer Unicode `White_Space` — the binary property, not ECMAScript's idea of whitespace
 * (OD-P5-I3C-1).
 *
 * `String.prototype.trim()` is deliberately NOT used. ECMAScript's `WhiteSpace` production
 * includes `U+FEFF`, so `.trim()` would strip a TRAILING byte-order mark, which step 5 removes
 * only in LEADING position. `U+FEFF` is not `White_Space` in Unicode, so a trailing one is a
 * character of the document and survives this step.
 *
 * Only the two ends of the WHOLE DOCUMENT are trimmed. TAB and LF are `White_Space`, so a
 * leading or trailing one goes; every inner one stays.
 */
const OUTER_WHITE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;

/** Whether `value` contains `U+0000` (step 3). */
function containsNul(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 0x00) {
      return true;
    }
  }

  return false;
}

/**
 * Whether `value` contains a rejected C0/C1 control (step 4).
 *
 * The rejected set is exactly `U+0001`-`U+0008`, `U+000B`, `U+000C`, `U+000E`-`U+001F` and
 * `U+0080`-`U+009F`.
 *
 * `U+0009` TAB and `U+000A` LF are ALLOWED: clinical text has structure. `U+000D` CR is not in
 * the set because step 2 has already replaced every one of them, so no `CR` can reach here.
 * `U+0000` is not in it either — it is its own ordered step and has already been rejected.
 *
 * `U+007F` DEL is NOT in the set and must not be added: the set is the ratified one, not
 * Unicode general category `Cc`, and widening it would reject documents this pipeline accepts
 * today.
 */
function containsRejectedControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if (unit === 0x09 || unit === 0x0a) {
      continue;
    }

    if ((unit >= 0x01 && unit <= 0x1f) || (unit >= 0x80 && unit <= 0x9f)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalises one clinical document body, or refuses.
 *
 * The refusal is a STATIC error naming the violated RULE and nothing else. Neither the raw
 * input, nor the partially transformed value, nor a substring of either, nor a byte length is
 * ever placed into it (09 §9, §11).
 *
 * Hashing is a SEPARATE, EXPLICIT step: a caller that wants the canonical digest of a document
 * writes `sha256HexUtf8(normaliseClinicalText(raw))`. The digest helper never normalises on its
 * own.
 *
 * @returns the canonical clinical value.
 */
export function normaliseClinicalText(raw: string): string {
  // Step 1 — valid Unicode. Rejected, never repaired. The surrogate predicate is the canonical
  // one of the MANUAL-v1 profile and is deliberately not duplicated here.
  if (!isWellFormedUnicode(raw)) {
    throw clinicalTextRejected('ILL_FORMED_UNICODE');
  }

  // Step 2 — line endings, BEFORE the control checks, because it is what removes every `CR`.
  const withUnixLineEndings = raw.replace(LINE_ENDINGS, '\n');

  // Step 3 — `U+0000`, as its own ordered check.
  if (containsNul(withUnixLineEndings)) {
    throw clinicalTextRejected('NUL');
  }

  // Step 4 — the ratified C0/C1 set, minus TAB and LF.
  if (containsRejectedControl(withUnixLineEndings)) {
    throw clinicalTextRejected('CONTROL_CHARACTER');
  }

  // Step 5 — ONE leading byte-order mark. Not generic `U+FEFF` trimming.
  const withoutBom = withUnixLineEndings.startsWith(BYTE_ORDER_MARK)
    ? withUnixLineEndings.slice(1)
    : withUnixLineEndings;

  // Step 6 — `NFC`. Never `NFKC`.
  const normalised = withoutBom.normalize('NFC');

  // Step 7 — outer Unicode `White_Space` at the whole-document boundary only (OD-P5-I3C-1).
  const trimmed = normalised.replace(OUTER_WHITE_SPACE, '');

  // Step 8 — a document that has become empty is not a document.
  if (trimmed.length === 0) {
    throw clinicalTextRejected('EMPTY');
  }

  // Step 9 — UTF-8 BYTES of the FINAL value, not code units, code points or graphemes, and
  // measured AFTER `NFC` and the trim because both can change the length.
  if (Buffer.byteLength(trimmed, 'utf8') > CLINICAL_TEXT_MAX_UTF8_BYTES) {
    // Step 10 — refused, never truncated. A truncated clinical document is a falsified one.
    throw clinicalTextRejected('TOO_LONG');
  }

  return trimmed;
}

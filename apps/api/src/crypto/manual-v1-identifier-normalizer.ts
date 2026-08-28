import { externalIdentifierRejected } from './crypto.errors.js';

/**
 * The MANUAL-v1 external-identifier normalisation profile.
 *
 * WHY A PROFILE AND NOT "SOME CLEANING"
 *
 * The normalised string is the thing that gets hashed. Two spellings of one identifier that
 * normalise differently produce two different tokens and therefore two different patients; two
 * genuinely different identifiers that normalise to one string produce one token and therefore
 * a collision. So the pipeline is fixed, ordered and immutable: it is part of the stored
 * format, exactly like the AAD of D-025 clause 5, and changing any step would silently orphan
 * every token already computed under the old one.
 *
 * THE NINE STEPS, IN THIS EXACT ORDER
 *
 *   1. the input must be valid Unicode;
 *   2. `U+0000` is rejected;
 *   3. `U+0001`-`U+001F` and `U+0080`-`U+009F` are rejected;
 *   4. ONE leading `U+FEFF` is removed;
 *   5. outer Unicode `White_Space` is trimmed;
 *   6. `NFC`;
 *   7. an empty result is rejected;
 *   8. the UTF-8 byte length must be `<= 255`;
 *   9. the accepted string is encoded as UTF-8 at the HMAC boundary and nowhere earlier.
 *
 * WHAT THE PROFILE DELIBERATELY DOES NOT DO. No case folding, no `NFKC`, no punctuation or
 * separator stripping, no homoglyph or confusable folding, no leading-zero stripping, no inner
 * whitespace collapsing and no truncation. Every one of those would merge identifiers a
 * practice considers distinct: `00123` and `123` are different patient numbers in most practice
 * management systems, and a normaliser that decided otherwise would merge two patients.
 *
 * IT ALSO REPAIRS NOTHING. Ill-formed input is REJECTED, never mended. `toWellFormed()` would
 * turn a lone surrogate into the replacement character and hash a value the caller never sent.
 */

/** The maximum UTF-8 byte length of a normalised external identifier. */
export const MANUAL_V1_MAX_UTF8_BYTES = 255;

/**
 * The byte-order mark `U+FEFF`, removed by step 4 in LEADING position only.
 *
 * Built from its code point rather than written as an escape so that the source file itself
 * stays free of an invisible character an editor would hide.
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * Outer Unicode `White_Space` — the binary property, not ECMAScript's idea of whitespace.
 *
 * `String.prototype.trim()` is deliberately NOT used. ECMAScript's `WhiteSpace` production
 * includes `U+FEFF`, so `.trim()` would strip a TRAILING byte-order mark, which step 4 removes
 * only in LEADING position. `U+FEFF` is not `White_Space` in Unicode, so a trailing one is a
 * character of the identifier and survives this step.
 */
const OUTER_WHITE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;

/**
 * Whether `value` contains no unpaired UTF-16 surrogate (step 1).
 *
 * Hand written on purpose: `String.prototype.isWellFormed()` is ES2024 and the workspace
 * compiles against `ES2023` (`tsconfig.base.json`), so the standard predicate is not part of
 * the typed surface here. The rule it implements is the same one — every high surrogate must be
 * followed by a low surrogate, and no low surrogate may stand alone.
 */
export function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if (unit >= 0xdc00 && unit <= 0xdfff) {
      // A low surrogate reached without having been consumed as the tail of a pair.
      return false;
    }

    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) {
        return false;
      }

      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) {
        return false;
      }

      index += 1;
    }
  }

  return true;
}

/** Whether `value` contains `U+0000` (step 2). */
function containsNul(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 0x00) {
      return true;
    }
  }

  return false;
}

/**
 * Whether `value` contains a character of the ratified C0/C1 set (step 3).
 *
 * The set is exactly `U+0001`-`U+001F` and `U+0080`-`U+009F`.
 *
 * `U+0000` is NOT in it — it is its own ordered step and has already been rejected. `U+007F`
 * DEL is NOT in it either and must not be added: the set is the ratified one, not Unicode
 * general category `Cc`, and widening it would reject identifiers this profile accepts today.
 *
 * TAB, LF and CR fall inside `U+0001`-`U+001F` and are therefore rejected. That is intended:
 * MANUAL-v1 normalises an IDENTIFIER, not clinical text, and has no line-break exception.
 */
function containsC0OrC1Control(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if ((unit >= 0x01 && unit <= 0x1f) || (unit >= 0x80 && unit <= 0x9f)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalises one externally supplied identifier under MANUAL-v1, or refuses.
 *
 * The refusal is a STATIC error naming the violated RULE and nothing else. Neither the raw
 * input, nor the partially transformed value, nor a substring of either, nor a byte length is
 * ever placed into it (09 §9, §11): a rejected identifier is still a patient identifier.
 *
 * @returns the canonical MANUAL-v1 value — the exact string the HMAC message consumes.
 */
export function normaliseManualV1ExternalIdentifier(raw: string): string {
  // Step 1 — valid Unicode. Rejected, never repaired.
  if (!isWellFormedUnicode(raw)) {
    throw externalIdentifierRejected('ILL_FORMED_UNICODE');
  }

  // Step 2 — `U+0000`, as its own ordered check.
  if (containsNul(raw)) {
    throw externalIdentifierRejected('NUL');
  }

  // Step 3 — the ratified C0/C1 set.
  if (containsC0OrC1Control(raw)) {
    throw externalIdentifierRejected('CONTROL_CHARACTER');
  }

  // Step 4 — ONE leading byte-order mark. Not generic `U+FEFF` trimming.
  const withoutBom = raw.startsWith(BYTE_ORDER_MARK) ? raw.slice(1) : raw;

  // Step 5 — outer Unicode `White_Space`. Inner whitespace is part of the identifier.
  const trimmed = withoutBom.replace(OUTER_WHITE_SPACE, '');

  // Step 6 — `NFC`. Never `NFKC`.
  const normalised = trimmed.normalize('NFC');

  // Step 7 — an identifier that has become empty is not an identifier.
  if (normalised.length === 0) {
    throw externalIdentifierRejected('EMPTY');
  }

  // Step 8 — UTF-8 BYTES of the FINAL value, not code units, code points or graphemes, and
  // measured AFTER `NFC` because `NFC` can change the length. Never truncated.
  if (Buffer.byteLength(normalised, 'utf8') > MANUAL_V1_MAX_UTF8_BYTES) {
    throw externalIdentifierRejected('TOO_LONG');
  }

  // Step 9 — the accepted string is the canonical value. It becomes UTF-8 bytes only at the
  // HMAC boundary, in `external-reference-hmac-message.ts`.
  return normalised;
}

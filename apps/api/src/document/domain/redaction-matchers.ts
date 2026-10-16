import { BLK_CLASS_BODY } from './redaction-boundary.js';

/**
 * The regex-based class matchers of the `phase5-basic-v1` redaction ruleset: `EMAIL`, `AHV`,
 * `IBAN` and `PHONE` (D-093 `RULING F.1`, `F.3`, `F.4`, `F.5`). `URL` is a scanner of its own
 * (`redaction-url.ts`, `RULING F.2`).
 *
 * THE REGEX SOURCES ARE THE FROZEN ONES. Each source below is the D-093 source with the macros
 * `LBL`, `DNS`, `J` and `BLK` substituted textually (`RULING F.0`); only the capture groups are
 * named, which D-093 declares non-normative. Flags are exactly `gu` (`RULING I`): no `i` (it
 * would fold `U+017F` into `s` and `U+212A` into `k`), no `s`, `m`, `y` or `d`. ASCII case
 * insensitivity is spelled out with explicit classes such as `[Tt]`.
 *
 * NO `\w`, `\d`, `\b` OR `\p{…}`. Boundaries come from the explicit `BLK` model only
 * (`RULING G`), so behaviour does not move with the Unicode tables of a future runtime.
 *
 * LINEARITY. Every source is a fixed-shape token with bounded lookarounds. The only unbounded
 * repetitions are (a) the `EMAIL` local part and domain, whose left boundary makes every start
 * inside a local-part run fail in one step, and whose atoms are separated by a mandatory `.`
 * so no two repetitions can split the same characters, and (b) the `PHONE_NAT` separator
 * `[ \t]*(?::[ \t]*)?`, which follows exactly one label. Neither admits nested ambiguous
 * repetition, so each pass is linear in the input length.
 *
 * PURITY. A `g` regex carries `lastIndex`, which is mutable state; a fresh `RegExp` is built per
 * pass from the frozen source so no state is shared between calls (`RULING C.8`).
 */

/** The five active classes (D-093 `RULING E`). */
export type RedactionClass = 'EMAIL' | 'URL' | 'AHV' | 'IBAN' | 'PHONE';

/**
 * One candidate over the immutable normalised input `T` (D-093 `RULING H.0`). Both spans are
 * half-open UTF-16 index intervals.
 *
 * `recognitionStart`/`recognitionEnd` is the span the candidate was validated on and MAY include
 * context that is not replaced (a `PHONE_NAT` label, a URL's trimmed punctuation).
 * `replaceStart`/`replaceEnd` is EXACTLY what the class token replaces, is non-empty and lies
 * inside the recognition span. Overlap resolution uses the replacement span only.
 *
 * Internal bookkeeping: it never leaves the engine and is never part of a redaction result.
 */
export interface RedactionCandidate {
  readonly redactionClass: RedactionClass;
  readonly recognitionStart: number;
  readonly recognitionEnd: number;
  readonly replaceStart: number;
  readonly replaceEnd: number;
}

/** `LBL` — one DNS label: 1-63 ASCII alphanumerics or hyphens, no hyphen at either end. */
const LBL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';

/** `DNS` — at least two labels, the last a letters-only TLD of 2-63 characters. */
const DNS = String.raw`(?:${LBL}\.)+[A-Za-z]{2,63}`;

/** `J` — the numeric joiners `. , ' / -`. */
const J = String.raw`[.,'/-]`;

/** `BLK`, for interpolation inside a character class. */
const BLK = BLK_CLASS_BODY;

/** The backtick, interpolated so the raw template below needs no escape for it. */
const BACKTICK = '`';

/** D-093 `RULING F.1`, with the owner-corrected left boundary. */
const EMAIL_SOURCE =
  String.raw`(?<![${BLK}!#$%&'*+\-/=?^${BACKTICK}{|}~.@])` +
  String.raw`(?<local>[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*)@(?<domain>${DNS})` +
  String.raw`(?![${BLK}\-@])(?!\.[${BLK}])`;

/** D-093 `RULING F.3`. */
const AHV_SOURCE =
  String.raw`(?<![${BLK}])(?<![0-9]${J})` +
  String.raw`(?:756[0-9]{10}|756\.[0-9]{4}\.[0-9]{4}\.[0-9]{2})` +
  String.raw`(?![${BLK}])(?!${J}[0-9])`;

/** D-093 `RULING F.4`. */
const IBAN_SOURCE =
  String.raw`(?<![${BLK}])` +
  String.raw`(?:CH[0-9]{7}[A-Z0-9]{12}|CH[0-9]{2} [0-9]{4} [0-9][A-Z0-9]{3} [A-Z0-9]{4} [A-Z0-9]{4} [A-Z0-9])` +
  String.raw`(?![${BLK}])(?:(?<=[0-9])(?!${J}[0-9])|(?<=[A-Z]))`;

/** D-093 `RULING F.5`, international form. */
const PHONE_INTL_SOURCE =
  String.raw`(?:(?<![${BLK}+])\+41|(?<![${BLK}])(?<![0-9]${J})(?<![0-9] )0041)` +
  String.raw`(?:[1-9][0-9]{8}|-[1-9][0-9]-[0-9]{3}-[0-9]{2}-[0-9]{2}| [1-9][0-9] [0-9]{3} [0-9]{2} [0-9]{2}(?! [0-9]))` +
  String.raw`(?![${BLK}])(?!${J}[0-9])`;

/** D-093 `RULING F.5`, national form: label + separator + number; only the number is replaced. */
const PHONE_NAT_SOURCE =
  String.raw`(?<![${BLK}])` +
  String.raw`(?:[Tt][Ee][Ll][Ee][Ff][Oo][Nn]|[Tt][Ee][Ll]\.?|[Mm][Oo][Bb][Ii][Ll][Ee]|[Nn][Aa][Tt][Ee][Ll]|[Ff][Aa][Xx])` +
  String.raw`[ \t]*(?::[ \t]*)?` +
  String.raw`(?<number>0[1-9][0-9]{8}|0[1-9][0-9]-[0-9]{3}-[0-9]{2}-[0-9]{2}|0[1-9][0-9] [0-9]{3} [0-9]{2} [0-9]{2}(?! [0-9]))` +
  String.raw`(?![${BLK}])(?!${J}[0-9])`;

/** The only flags any frozen matcher may carry (D-093 `RULING I`). */
export const MATCHER_REGEX_FLAGS = 'gu';

/** The frozen regex sources, by matcher pass. */
export const MATCHER_SOURCES = Object.freeze({
  EMAIL: EMAIL_SOURCE,
  AHV: AHV_SOURCE,
  IBAN: IBAN_SOURCE,
  PHONE_INTL: PHONE_INTL_SOURCE,
  PHONE_NAT: PHONE_NAT_SOURCE,
});

const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_DOMAIN_MAX_LENGTH = 253;

/** Post-validation of `EMAIL`: local part <= 64 and domain <= 253 (D-093 `RULING F.1`). */
function isValidEmail(match: RegExpExecArray): boolean {
  const local = match.groups?.['local'];
  const domain = match.groups?.['domain'];

  return (
    local !== undefined &&
    domain !== undefined &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    domain.length <= EMAIL_DOMAIN_MAX_LENGTH
  );
}

const DIGIT_ZERO = 0x30;
const DOT = 0x2e;
const SPACE = 0x20;

/** Post-validation of `AHV`: the EAN-13 check digit (D-093 `RULING F.3`). */
function isValidAhv(match: RegExpExecArray): boolean {
  const candidate = match[0];
  let weightedSum = 0;
  let position = 0;
  let checkDigit = -1;

  for (let index = 0; index < candidate.length; index += 1) {
    const unit = candidate.charCodeAt(index);
    if (unit === DOT) {
      continue;
    }

    const digit = unit - DIGIT_ZERO;
    if (position < 12) {
      weightedSum += position % 2 === 0 ? digit : digit * 3;
    } else {
      checkDigit = digit;
    }
    position += 1;
  }

  return position === 13 && (10 - (weightedSum % 10)) % 10 === checkDigit;
}

const IBAN_LENGTH = 21;
const IBAN_CHECK_DIGITS_MIN = 2;
const IBAN_CHECK_DIGITS_MAX = 98;
const LETTER_A = 0x41;

/**
 * Post-validation of `IBAN`: check digits `02..98` and ISO/IEC 7064 MOD 97-10 (D-093
 * `RULING F.4`).
 *
 * The remainder is computed digit by digit, so no value ever exceeds `96 * 10 + 9` and no
 * `BigInt` is needed. The `02..98` range check is mandatory: raw MOD 97 also accepts the alias
 * check digits `00`, `01` and `99`.
 */
function isValidIban(match: RegExpExecArray): boolean {
  let compact = '';
  for (let index = 0; index < match[0].length; index += 1) {
    if (match[0].charCodeAt(index) !== SPACE) {
      compact += match[0].charAt(index);
    }
  }

  if (compact.length !== IBAN_LENGTH) {
    return false;
  }

  const checkDigits =
    (compact.charCodeAt(2) - DIGIT_ZERO) * 10 + (compact.charCodeAt(3) - DIGIT_ZERO);
  if (checkDigits < IBAN_CHECK_DIGITS_MIN || checkDigits > IBAN_CHECK_DIGITS_MAX) {
    return false;
  }

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (let index = 0; index < rearranged.length; index += 1) {
    const unit = rearranged.charCodeAt(index);
    if (unit >= DIGIT_ZERO && unit <= DIGIT_ZERO + 9) {
      remainder = (remainder * 10 + (unit - DIGIT_ZERO)) % 97;
    } else {
      // A = 10 … Z = 35: always two decimal digits.
      const value = unit - LETTER_A + 10;
      remainder = (remainder * 10 + Math.floor(value / 10)) % 97;
      remainder = (remainder * 10 + (value % 10)) % 97;
    }
  }

  return remainder === 1;
}

/** Always accept: the class has no post-validation beyond its grammar. */
function acceptAll(): boolean {
  return true;
}

/**
 * Runs one matcher pass over `text` exactly as D-093 `RULING H.1` prescribes: after a match that
 * fails post-validation the scan resumes at `start + 1`; after an accepted one at its end.
 */
function runPass(
  text: string,
  source: string,
  redactionClass: RedactionClass,
  postValidate: (match: RegExpExecArray) => boolean,
  replacementGroup: string | undefined,
): RedactionCandidate[] {
  const regex = new RegExp(source, MATCHER_REGEX_FLAGS);
  const candidates: RedactionCandidate[] = [];
  let position = 0;

  while (position <= text.length) {
    regex.lastIndex = position;
    const match = regex.exec(text);
    if (match === null) {
      break;
    }

    const start = match.index;
    const end = start + match[0].length;

    if (!postValidate(match)) {
      position = start + 1;
      continue;
    }

    // The replacement group always ends where the match ends: everything after it is a
    // zero-width lookahead. Its start is therefore recovered from its length alone, without
    // the `d` flag.
    const group = replacementGroup === undefined ? undefined : match.groups?.[replacementGroup];
    const replaceStart = group === undefined ? start : end - group.length;

    candidates.push({
      redactionClass,
      recognitionStart: start,
      recognitionEnd: end,
      replaceStart,
      replaceEnd: end,
    });
    position = end;
  }

  return candidates;
}

/** `EMAIL` candidates (D-093 `RULING F.1`). Recognition span = replacement span. */
export function findEmailCandidates(text: string): RedactionCandidate[] {
  return runPass(text, EMAIL_SOURCE, 'EMAIL', isValidEmail, undefined);
}

/** `AHV` candidates (D-093 `RULING F.3`). Recognition span = replacement span. */
export function findAhvCandidates(text: string): RedactionCandidate[] {
  return runPass(text, AHV_SOURCE, 'AHV', isValidAhv, undefined);
}

/** `IBAN` candidates (D-093 `RULING F.4`). Recognition span = replacement span. */
export function findIbanCandidates(text: string): RedactionCandidate[] {
  return runPass(text, IBAN_SOURCE, 'IBAN', isValidIban, undefined);
}

/**
 * `PHONE` candidates (D-093 `RULING F.5`): the `PHONE_INTL` pass, then the `PHONE_NAT` pass.
 *
 * `PHONE_INTL` replaces its whole match. `PHONE_NAT` is RECOGNISED as label + separator + number
 * but REPLACES only the number; the label and separator stay visible.
 */
export function findPhoneCandidates(text: string): RedactionCandidate[] {
  return [
    ...runPass(text, PHONE_INTL_SOURCE, 'PHONE', acceptAll, undefined),
    ...runPass(text, PHONE_NAT_SOURCE, 'PHONE', acceptAll, 'number'),
  ];
}

import { isBlockingCodeUnit, isNeutralCodePoint } from './redaction-boundary.js';
import type { RedactionCandidate } from './redaction-matchers.js';

/**
 * The `URL` class of the `phase5-basic-v1` redaction ruleset (D-093 `RULING F.2`, `G-1`, `G-2`).
 *
 * WHY A SCANNER AND NOT A REGEX. The frozen semantics are MAXIMAL ENVELOPE + FULL CONSUMPTION +
 * NO VALID-PREFIX FALLBACK. A regex with a right lookahead after the authority cannot express
 * that, and a backtracking regex would happily salvage a shorter valid prefix. D-093 freezes the
 * semantics, not one regex trick, and expressly permits a scanner (`RULING F.2`, "Sloboda
 * implementacije").
 *
 * THE ALGORITHM, PER STARTER `S` (`RULING F.2`, steps 1-6).
 *
 *   1  starter     `http://` / `https://` (left neighbour not BLK), or `www.` (left neighbour not
 *                  in BLK or `. @ / : -`); scheme letters and `www` are ASCII case-insensitive.
 *                  `A` = `S` + starter length for the scheme form, `A` = `S` for the `www.` form.
 *   2  envelope    `envEnd` = first position >= `A` holding a URL_HARD_TERM (or the end).
 *                  recognitionSpan = [S, envEnd) — MAXIMAL.
 *   3  components  `tailStart` = first `/`, `?` or `#` in [A, envEnd), if any. The authority is
 *                  [A, tailStart) with a tail, else [A, envEnd). These boundaries never move.
 *   4  trim        the ratified trailing-punctuation trim over [floor, envEnd) gives `e`;
 *                  floor = tailStart with a tail, else A.
 *   5  validate    ALL of [S, e) must be consumed by the frozen `URL_FULL` grammar, plus the IPv4
 *                  octet check and `DNS_HOST_MAX_LENGTH = 253` (`G-2`).
 *   6  outcome     valid   -> candidate: recognition [S, envEnd), replacement [S, e); the scan
 *                             resumes at envEnd.
 *                  invalid -> NO MATCH, and nothing else: no shorter prefix, no host-only or
 *                             host+port salvage, no opaque zone for the other classes (N-2);
 *                             the scan resumes at S + 1.
 *
 * WHY THE WHOLE PASS IS LINEAR. Many starters may share one envelope or one long suffix of
 * trailing punctuation (`(www.a.ch')×N⧺!×M`), so nothing may be re-scanned per starter. Every
 * per-starter quantity is read from tables built once, in O(n), and only when a starter exists:
 *
 *   - envelope end, next `/?#`, next `@`, next `:`         one backward pass each;
 *   - prefix counts of `(`, `)`, `[`, `]` and of characters
 *     outside the userinfo set                              one forward pass;
 *   - for both trim sets, the start of the maximal run of
 *     trimmable characters ending at every position        one forward pass;
 *   - the positions of every `)` and `]`.
 *
 * The trim is then closed-form: walking back from `envEnd`, every character of the trimmable run
 * is removed until the walk meets a closer that is still balanced. Inside the run there are no
 * openers, so the `k`-th `)` of the run is balanced exactly when `k` is at most the number of
 * unmatched `(` in [floor, runStart) — one subtraction and one array lookup instead of a walk.
 * The tail [tailStart, e) needs no validation at all: `URL_ENV_CHAR` IS the ratified tail set, so
 * every envelope character is a valid tail character. What remains per starter is the authority,
 * and the only part of it scanned character by character is a host already bounded by `G-2` to
 * 253 characters; the userinfo is checked through its prefix count.
 *
 * Logical work is counted for evidence only (see {@link measureUrlScanSteps}); nothing about it
 * reaches a result.
 */

type StarterForm = 'SCHEME' | 'WWW';

interface Starter {
  readonly start: number;
  readonly authorityStart: number;
  readonly form: StarterForm;
}

/** Every table the per-starter work reads; each is built once, in O(n). */
interface UrlTables {
  /** First URL_HARD_TERM position at or after `p`. */
  readonly envelopeEnd: Int32Array;
  /** First `/`, `?` or `#` at or after `p`. */
  readonly nextTailStart: Int32Array;
  /** First `@` at or after `p`. */
  readonly nextAt: Int32Array;
  /** First `:` at or after `p`. */
  readonly nextColon: Int32Array;
  /** Prefix counts over [0, p). */
  readonly openParens: Int32Array;
  readonly closeParens: Int32Array;
  readonly openBrackets: Int32Array;
  readonly closeBrackets: Int32Array;
  readonly nonUserinfo: Int32Array;
  /** Start of the maximal run of trimmable characters ending at `p`, per trim set. */
  readonly trimRunStartWithTail: Int32Array;
  readonly trimRunStartWithoutTail: Int32Array;
  /** Positions of every `)` and every `]`, ascending. */
  readonly closeParenPositions: readonly number[];
  readonly closeBracketPositions: readonly number[];
}

/** `G-2`. */
export const DNS_HOST_MAX_LENGTH = 253;

const PORT_MAX_DIGITS = 5;
const DNS_LABEL_MAX_LENGTH = 63;
const TLD_MIN_LENGTH = 2;
const IPV4_OCTET_MAX = 255;
const LOCALHOST = 'localhost';

const SCHEME_STARTER_LENGTH_HTTP = 'http://'.length;
const SCHEME_STARTER_LENGTH_HTTPS = 'https://'.length;
const WWW_STARTER_LENGTH = 'www.'.length;

const COLON = 0x3a;
const SLASH = 0x2f;
const QUESTION_MARK = 0x3f;
const NUMBER_SIGN = 0x23;
const AT_SIGN = 0x40;
const DOT = 0x2e;
const HYPHEN = 0x2d;
const OPEN_PAREN = 0x28;
const CLOSE_PAREN = 0x29;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;
/** OR-ing an ASCII letter with this gives its lower-case form. */
const ASCII_LOWER_BIT = 0x20;

/** Builds an ASCII membership table from the characters of `members`. */
function asciiTable(members: string, withAlphanumerics: boolean): Uint8Array {
  const table = new Uint8Array(0x80);
  if (withAlphanumerics) {
    for (let unit = 0x30; unit <= 0x39; unit += 1) table[unit] = 1;
    for (let unit = 0x41; unit <= 0x5a; unit += 1) table[unit] = 1;
    for (let unit = 0x61; unit <= 0x7a; unit += 1) table[unit] = 1;
  }
  for (let index = 0; index < members.length; index += 1) {
    table[members.charCodeAt(index)] = 1;
  }
  return table;
}

/** ASCII part of `URL_ENV_CHAR` = the ratified tail set `[A-Za-z0-9\-._~:/?#[]@!$&'()*+,;=%]`. */
const ENVELOPE_ASCII = asciiTable("-._~:/?#[]@!$&'()*+,;=%", true);

/** The userinfo set `[A-Za-z0-9\-._~%!$&'()*+,;=:]`. */
const USERINFO_ASCII = asciiTable("-._~%!$&'()*+,;=:", true);

/**
 * Trimmable characters: the trailing-punctuation set `P` plus the closers `)` and `]`, which are
 * removed only while they are in excess. `P` has `:` and `?` only when a tail exists: without
 * one, `:` is a started port component and `?` would have started a tail.
 */
const TRIM_WITH_TAIL_ASCII = asciiTable(".,;:!?')]", false);
const TRIM_WITHOUT_TAIL_ASCII = asciiTable(".,;!')]", false);

/** Whether the code unit `unit` is a `URL_ENV_CHAR` (ASCII tail set, or non-ASCII non-NEUTRAL). */
function isEnvelopeUnit(unit: number): boolean {
  return unit < 0x80 ? ENVELOPE_ASCII[unit] === 1 : !isNeutralCodePoint(unit);
}

function isAsciiDigit(unit: number): boolean {
  return unit >= DIGIT_ZERO && unit <= DIGIT_NINE;
}

function isAsciiLetter(unit: number): boolean {
  const lower = unit | ASCII_LOWER_BIT;
  return lower >= 0x61 && lower <= 0x7a;
}

/** `[Hh][Tt][Tt][Pp][Ss]?:\/\/` at `index`: the starter length, or 0. */
function schemeStarterLength(text: string, index: number): number {
  if (
    (text.charCodeAt(index) | ASCII_LOWER_BIT) !== 0x68 ||
    (text.charCodeAt(index + 1) | ASCII_LOWER_BIT) !== 0x74 ||
    (text.charCodeAt(index + 2) | ASCII_LOWER_BIT) !== 0x74 ||
    (text.charCodeAt(index + 3) | ASCII_LOWER_BIT) !== 0x70
  ) {
    return 0;
  }

  const afterHttp = (text.charCodeAt(index + 4) | ASCII_LOWER_BIT) === 0x73 ? index + 5 : index + 4;
  if (
    text.charCodeAt(afterHttp) !== COLON ||
    text.charCodeAt(afterHttp + 1) !== SLASH ||
    text.charCodeAt(afterHttp + 2) !== SLASH
  ) {
    return 0;
  }

  return afterHttp === index + 5 ? SCHEME_STARTER_LENGTH_HTTPS : SCHEME_STARTER_LENGTH_HTTP;
}

/** `[Ww]{3}\.` at `index`. */
function isWwwStarter(text: string, index: number): boolean {
  return (
    (text.charCodeAt(index) | ASCII_LOWER_BIT) === 0x77 &&
    (text.charCodeAt(index + 1) | ASCII_LOWER_BIT) === 0x77 &&
    (text.charCodeAt(index + 2) | ASCII_LOWER_BIT) === 0x77 &&
    text.charCodeAt(index + 3) === DOT
  );
}

/** The `www.` left boundary: the previous code point is not in `BLK ∪ { . @ / : - }`. */
function wwwLeftBoundaryHolds(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previous = text.charCodeAt(index - 1);
  return (
    !isBlockingCodeUnit(previous) &&
    previous !== DOT &&
    previous !== AT_SIGN &&
    previous !== SLASH &&
    previous !== COLON &&
    previous !== HYPHEN
  );
}

/** Every valid starter, in ascending position. One pass. */
function findStarters(text: string): Starter[] {
  const starters: Starter[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const lower = text.charCodeAt(index) | ASCII_LOWER_BIT;

    if (lower === 0x68) {
      const length = schemeStarterLength(text, index);
      if (length > 0 && (index === 0 || !isBlockingCodeUnit(text.charCodeAt(index - 1)))) {
        starters.push({ start: index, authorityStart: index + length, form: 'SCHEME' });
      }
    } else if (lower === 0x77 && isWwwStarter(text, index) && wwwLeftBoundaryHolds(text, index)) {
      starters.push({ start: index, authorityStart: index, form: 'WWW' });
    }
  }

  return starters;
}

/** Builds every lookup table in O(n). */
function buildTables(text: string): UrlTables {
  const length = text.length;
  const envelopeEnd = new Int32Array(length + 1);
  const nextTailStart = new Int32Array(length + 1);
  const nextAt = new Int32Array(length + 1);
  const nextColon = new Int32Array(length + 1);

  envelopeEnd[length] = length;
  nextTailStart[length] = length;
  nextAt[length] = length;
  nextColon[length] = length;

  for (let index = length - 1; index >= 0; index -= 1) {
    const unit = text.charCodeAt(index);
    envelopeEnd[index] = isEnvelopeUnit(unit) ? (envelopeEnd[index + 1] ?? length) : index;
    nextTailStart[index] =
      unit === SLASH || unit === QUESTION_MARK || unit === NUMBER_SIGN
        ? index
        : (nextTailStart[index + 1] ?? length);
    nextAt[index] = unit === AT_SIGN ? index : (nextAt[index + 1] ?? length);
    nextColon[index] = unit === COLON ? index : (nextColon[index + 1] ?? length);
  }

  const openParens = new Int32Array(length + 1);
  const closeParens = new Int32Array(length + 1);
  const openBrackets = new Int32Array(length + 1);
  const closeBrackets = new Int32Array(length + 1);
  const nonUserinfo = new Int32Array(length + 1);
  const trimRunStartWithTail = new Int32Array(length + 1);
  const trimRunStartWithoutTail = new Int32Array(length + 1);
  const closeParenPositions: number[] = [];
  const closeBracketPositions: number[] = [];

  for (let index = 0; index < length; index += 1) {
    const unit = text.charCodeAt(index);
    const isAscii = unit < 0x80;

    openParens[index + 1] = (openParens[index] ?? 0) + (unit === OPEN_PAREN ? 1 : 0);
    closeParens[index + 1] = (closeParens[index] ?? 0) + (unit === CLOSE_PAREN ? 1 : 0);
    openBrackets[index + 1] = (openBrackets[index] ?? 0) + (unit === OPEN_BRACKET ? 1 : 0);
    closeBrackets[index + 1] = (closeBrackets[index] ?? 0) + (unit === CLOSE_BRACKET ? 1 : 0);
    nonUserinfo[index + 1] =
      (nonUserinfo[index] ?? 0) + (isAscii && USERINFO_ASCII[unit] === 1 ? 0 : 1);
    trimRunStartWithTail[index + 1] =
      isAscii && TRIM_WITH_TAIL_ASCII[unit] === 1 ? (trimRunStartWithTail[index] ?? 0) : index + 1;
    trimRunStartWithoutTail[index + 1] =
      isAscii && TRIM_WITHOUT_TAIL_ASCII[unit] === 1
        ? (trimRunStartWithoutTail[index] ?? 0)
        : index + 1;

    if (unit === CLOSE_PAREN) {
      closeParenPositions.push(index);
    } else if (unit === CLOSE_BRACKET) {
      closeBracketPositions.push(index);
    }
  }

  return {
    envelopeEnd,
    nextTailStart,
    nextAt,
    nextColon,
    openParens,
    closeParens,
    openBrackets,
    closeBrackets,
    nonUserinfo,
    trimRunStartWithTail,
    trimRunStartWithoutTail,
    closeParenPositions,
    closeBracketPositions,
  };
}

/** The number of tables {@link buildTables} fills per position, for the step count. */
const TABLES_PER_POSITION = 11;

/** `table[index]`, which is always in range for the indices this file uses. */
function at(table: Int32Array, index: number): number {
  return table[index] ?? 0;
}

/**
 * The end of the closers that must STAY in the URL: the `kept`-th closer of the run, counted
 * from its start, if any.
 */
function keptCloserEnd(
  prefix: Int32Array,
  positions: readonly number[],
  opens: Int32Array,
  floor: number,
  runStart: number,
  end: number,
): number {
  const unmatchedOpeners =
    at(opens, runStart) - at(opens, floor) - (at(prefix, runStart) - at(prefix, floor));
  const closersInRun = at(prefix, end) - at(prefix, runStart);
  const kept = Math.min(unmatchedOpeners, closersInRun);
  if (kept <= 0) {
    return runStart;
  }
  return (positions[at(prefix, runStart) + kept - 1] ?? runStart - 1) + 1;
}

/**
 * The ratified trailing-punctuation trim over [floor, end) (D-093 `RULING F.2`), closed-form.
 *
 * Equivalent to the frozen walk: `P` characters are always removed; a `)` / `]` is removed while
 * the closers of its kind in [floor, e) outnumber the openers; the walk stops at the first
 * character it may not remove.
 */
function trimmedEnd(tables: UrlTables, floor: number, end: number, hasTail: boolean): number {
  const runStartTable = hasTail ? tables.trimRunStartWithTail : tables.trimRunStartWithoutTail;
  const runStart = Math.max(at(runStartTable, end), floor);

  return Math.max(
    runStart,
    keptCloserEnd(
      tables.closeParens,
      tables.closeParenPositions,
      tables.openParens,
      floor,
      runStart,
      end,
    ),
    keptCloserEnd(
      tables.closeBrackets,
      tables.closeBracketPositions,
      tables.openBrackets,
      floor,
      runStart,
      end,
    ),
  );
}

/** Work counter for {@link measureUrlScanSteps}; carries numbers only, never text. */
interface StepMeter {
  steps: number;
}

/** `:[0-9]{1,5}` — the characters after the `:` in [start, end). */
function isPort(text: string, start: number, end: number, meter: StepMeter): boolean {
  const digits = end - start;
  if (digits < 1 || digits > PORT_MAX_DIGITS) {
    return false;
  }
  for (let index = start; index < end; index += 1) {
    meter.steps += 1;
    if (!isAsciiDigit(text.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

/**
 * `DNS` = `(?:LBL\.)+[A-Za-z]{2,63}` exactly over [start, end): at least two labels of 1-63
 * `[A-Za-z0-9-]` with no hyphen at either end, the last one letters only and 2-63 long.
 */
function isDnsName(text: string, start: number, end: number, meter: StepMeter): boolean {
  if (end <= start) {
    return false;
  }

  let labelStart = start;
  let labels = 0;
  let tldLettersOnly = true;

  for (let index = start; index <= end; index += 1) {
    meter.steps += 1;
    const unit = index === end ? DOT : text.charCodeAt(index);

    if (unit === DOT) {
      const labelLength = index - labelStart;
      if (
        labelLength < 1 ||
        labelLength > DNS_LABEL_MAX_LENGTH ||
        text.charCodeAt(labelStart) === HYPHEN ||
        text.charCodeAt(index - 1) === HYPHEN
      ) {
        return false;
      }
      labels += 1;
      if (index === end) {
        return labels >= 2 && tldLettersOnly && labelLength >= TLD_MIN_LENGTH;
      }
      labelStart = index + 1;
      tldLettersOnly = true;
      continue;
    }

    if (isAsciiLetter(unit)) {
      continue;
    }
    if (isAsciiDigit(unit) || unit === HYPHEN) {
      tldLettersOnly = false;
      continue;
    }
    return false;
  }

  return false;
}

/** `[0-9]{1,3}(\.[0-9]{1,3}){3}` over [start, end), each octet <= 255. */
function isIpv4(text: string, start: number, end: number, meter: StepMeter): boolean {
  let octets = 0;
  let digits = 0;
  let value = 0;

  for (let index = start; index <= end; index += 1) {
    meter.steps += 1;
    const unit = index === end ? DOT : text.charCodeAt(index);

    if (unit === DOT) {
      if (digits === 0 || value > IPV4_OCTET_MAX) {
        return false;
      }
      octets += 1;
      digits = 0;
      value = 0;
      continue;
    }
    if (!isAsciiDigit(unit) || digits === 3) {
      return false;
    }
    digits += 1;
    value = value * 10 + (unit - DIGIT_ZERO);
  }

  return octets === 4;
}

/** `[Ll][Oo][Cc][Aa][Ll][Hh][Oo][Ss][Tt]` exactly over [start, end). */
function isLocalhost(text: string, start: number, end: number, meter: StepMeter): boolean {
  if (end - start !== LOCALHOST.length) {
    return false;
  }
  for (let index = 0; index < LOCALHOST.length; index += 1) {
    meter.steps += 1;
    if ((text.charCodeAt(start + index) | ASCII_LOWER_BIT) !== LOCALHOST.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

/**
 * Splits [hostStart, authorityEnd) into host and optional port and validates the port. Returns
 * the host end, or -1 when the port component is malformed.
 */
function hostEndAfterPort(
  text: string,
  tables: UrlTables,
  hostStart: number,
  authorityEnd: number,
  meter: StepMeter,
): number {
  const colon = at(tables.nextColon, hostStart);
  if (colon >= authorityEnd) {
    return authorityEnd;
  }
  // An explicitly started port component commits to `:[0-9]{1,5}` (G-1).
  return isPort(text, colon + 1, authorityEnd, meter) ? colon : -1;
}

/** The scheme-form authority: `(userinfo@)?(DNS | IPv4 | localhost)(:port)?`, fully consumed. */
function isValidSchemeAuthority(
  text: string,
  tables: UrlTables,
  authorityStart: number,
  authorityEnd: number,
  meter: StepMeter,
): boolean {
  let hostStart = authorityStart;

  // An `@` in the authority commits to userinfo: everything before the FIRST `@`.
  const firstAt = at(tables.nextAt, authorityStart);
  if (firstAt < authorityEnd) {
    if (
      firstAt === authorityStart ||
      at(tables.nonUserinfo, firstAt) !== at(tables.nonUserinfo, authorityStart) ||
      at(tables.nextAt, firstAt + 1) < authorityEnd
    ) {
      return false;
    }
    hostStart = firstAt + 1;
  }

  const hostEnd = hostEndAfterPort(text, tables, hostStart, authorityEnd, meter);
  const hostLength = hostEnd - hostStart;
  if (hostEnd < 0 || hostLength < 1 || hostLength > DNS_HOST_MAX_LENGTH) {
    return false;
  }

  return (
    isDnsName(text, hostStart, hostEnd, meter) ||
    isIpv4(text, hostStart, hostEnd, meter) ||
    isLocalhost(text, hostStart, hostEnd, meter)
  );
}

/** The `www.` form authority: `www.` + `DNS`, then `(:port)?`, fully consumed. No userinfo. */
function isValidWwwAuthority(
  text: string,
  tables: UrlTables,
  start: number,
  authorityEnd: number,
  meter: StepMeter,
): boolean {
  const hostEnd = hostEndAfterPort(text, tables, start, authorityEnd, meter);
  if (hostEnd < 0 || hostEnd - start > DNS_HOST_MAX_LENGTH) {
    return false;
  }
  // G-2 counts the WHOLE host, including the leading `www` label.
  return isDnsName(text, start + WWW_STARTER_LENGTH, hostEnd, meter);
}

/** The scanner itself; `meter` only counts. */
function scanUrlCandidates(text: string, meter: StepMeter): RedactionCandidate[] {
  meter.steps += text.length;
  const starters = findStarters(text);
  if (starters.length === 0) {
    return [];
  }

  meter.steps += TABLES_PER_POSITION * (text.length + 1);
  const tables = buildTables(text);
  const candidates: RedactionCandidate[] = [];
  let resumeAt = 0;

  for (const starter of starters) {
    // NO MATCH resumes at S + 1, i.e. at the next starter; a match resumes at its envEnd.
    if (starter.start < resumeAt) {
      continue;
    }
    meter.steps += 1;

    const envelopeEnd = at(tables.envelopeEnd, starter.authorityStart);
    const tailCandidate = at(tables.nextTailStart, starter.authorityStart);
    const hasTail = tailCandidate < envelopeEnd;
    const floor = hasTail ? tailCandidate : starter.authorityStart;
    const end = trimmedEnd(tables, floor, envelopeEnd, hasTail);
    const authorityEnd = hasTail ? tailCandidate : end;

    const valid =
      starter.form === 'SCHEME'
        ? isValidSchemeAuthority(text, tables, starter.authorityStart, authorityEnd, meter)
        : isValidWwwAuthority(text, tables, starter.start, authorityEnd, meter);

    if (valid) {
      candidates.push({
        redactionClass: 'URL',
        recognitionStart: starter.start,
        recognitionEnd: envelopeEnd,
        replaceStart: starter.start,
        replaceEnd: end,
      });
      resumeAt = envelopeEnd;
    }
  }

  return candidates;
}

/** `URL` candidates (D-093 `RULING F.2`). */
export function findUrlCandidates(text: string): RedactionCandidate[] {
  return scanUrlCandidates(text, { steps: 0 });
}

/**
 * EVIDENCE ONLY — the deterministic logical work count of one URL pass over `text` (D-093
 * `RULING F.2` linearity; `08` §12.15 adversarial vectors).
 *
 * Returns a single number: positions visited by the starter scan, table cells built, starters
 * evaluated, and characters examined while validating hosts and ports. No text, span, class or
 * hash is returned. It runs the exact production scanner; it is not part of the redaction
 * engine's contract and is not used by it.
 */
export function measureUrlScanSteps(text: string): number {
  const meter: StepMeter = { steps: 0 };
  scanUrlCandidates(text, meter);
  return meter.steps;
}

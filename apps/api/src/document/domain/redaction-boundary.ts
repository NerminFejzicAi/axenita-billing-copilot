/**
 * The global `BLK` / `NEUTRAL` boundary model of the `phase5-basic-v1` redaction ruleset (D-093
 * `RULING G`).
 *
 * WHY AN EXPLICIT LIST AND NOT A UNICODE PROPERTY. `\p{L}`, `\p{M}`, `\p{N}`, `\w`, `\d` and `\b`
 * are forbidden for the frozen matching grammar (D-093 `RULING G.4`, `RULING I`). A property
 * table moves with every Node / ICU upgrade; a frozen ruleset version must not. The model below
 * is therefore spelled out code point by code point and never consults a property table.
 *
 * THE MODEL.
 *
 *   BLK     = ASCII [A-Za-z0-9_]  +  every non-ASCII code point U+0080-U+10FFFF except NEUTRAL
 *   NEUTRAL = exactly the 38 non-ASCII code points of `RULING G.2`
 *
 * Everything else — the remaining ASCII punctuation, `U+0020`, `U+0009`, `U+000A`, and the start
 * and end of the input — is neutral. An unknown neighbour therefore BLOCKS a match: the model is
 * deliberately conservative, and a combining mark next to a match blocks it, so the redacted
 * output stays `NFC`.
 *
 * Every non-ASCII value in this file is written as a number and turned into regex source
 * programmatically, so the source file contains no invisible or look-alike character.
 */

/** The 38 non-ASCII `NEUTRAL` code points, grouped exactly as D-093 `RULING G.2` lists them. */
export const NEUTRAL_CODE_POINTS: readonly number[] = Object.freeze([
  // spaces: U+00A0, U+1680, U+2000-U+200A, U+202F, U+205F, U+3000
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x202f, 0x205f, 0x3000,
  // line / paragraph separators
  0x2028, 0x2029,
  // quotation marks
  0x00ab, 0x00bb, 0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f, 0x2039, 0x203a,
  // dashes U+2010-U+2015
  0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015,
  // other: bullet, horizontal ellipsis
  0x2022, 0x2026,
]);

const NEUTRAL_SET: ReadonlySet<number> = new Set(NEUTRAL_CODE_POINTS);

/**
 * The non-ASCII `BLK` ranges (`NA`, D-093 `RULING G.3`) exactly as frozen: the complement of
 * {@link NEUTRAL_CODE_POINTS} over `U+0080`-`U+10FFFF`. Inclusive `[first, last]` pairs.
 */
export const NON_ASCII_BLOCKING_RANGES: readonly (readonly [number, number])[] = Object.freeze([
  [0x0080, 0x009f],
  [0x00a1, 0x00aa],
  [0x00ac, 0x00ba],
  [0x00bc, 0x167f],
  [0x1681, 0x1fff],
  [0x200b, 0x200f],
  [0x2016, 0x2017],
  [0x2020, 0x2021],
  [0x2023, 0x2025],
  [0x2027, 0x2027],
  [0x202a, 0x202e],
  [0x2030, 0x2038],
  [0x203b, 0x205e],
  [0x2060, 0x2fff],
  [0x3001, 0x10ffff],
] as const);

/** One backslash, built from its code point so no escape sequence appears in this source. */
const BACKSLASH = String.fromCharCode(0x5c);

/** `\u{…}` — an ECMAScript code-point escape, valid only under the `u` flag. */
function codePointEscape(codePoint: number): string {
  return `${BACKSLASH}u{${codePoint.toString(16).toUpperCase()}}`;
}

/**
 * `NA` — the body (no brackets) of a regex character class holding every non-ASCII `BLK` code
 * point, written as code-point escapes for a `u`-flag regex (D-093 `RULING F.0`).
 */
export const NA_CLASS_BODY: string = NON_ASCII_BLOCKING_RANGES.map(([first, last]) =>
  first === last ? codePointEscape(first) : `${codePointEscape(first)}-${codePointEscape(last)}`,
).join('');

/** `BLK` — the body (no brackets) of the `BLK` character class: `A-Za-z0-9_` plus `NA`. */
export const BLK_CLASS_BODY = `A-Za-z0-9_${NA_CLASS_BODY}`;

/** Whether `codePoint` is one of the 38 `NEUTRAL` code points. */
export function isNeutralCodePoint(codePoint: number): boolean {
  return NEUTRAL_SET.has(codePoint);
}

/** Whether the ASCII `unit` is in `[A-Za-z0-9_]`. */
function isAsciiWordUnit(unit: number): boolean {
  return (
    (unit >= 0x30 && unit <= 0x39) ||
    (unit >= 0x41 && unit <= 0x5a) ||
    (unit >= 0x61 && unit <= 0x7a) ||
    unit === 0x5f
  );
}

/**
 * Whether the UTF-16 code unit `unit` belongs to a `BLK` code point.
 *
 * Working on code units is exact here: every `NEUTRAL` code point is in the BMP, and every
 * supplementary code point is in `NA`, so both halves of a surrogate pair classify as `BLK` —
 * exactly what the code point they encode is.
 */
export function isBlockingCodeUnit(unit: number): boolean {
  if (unit < 0x80) {
    return isAsciiWordUnit(unit);
  }

  return !NEUTRAL_SET.has(unit);
}

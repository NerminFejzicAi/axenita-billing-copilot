import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CANCEL_REASON_RAW_MAX_UTF8_BYTES,
  CANCEL_REASON_SANITIZED_MAX_UTF8_BYTES,
  sanitizeCancelReason,
} from './encounter-cancel-reason.js';

/**
 * The canonical cancel-`reason` sanitizer (`P5-I5D`; D-089 `RULING B`, `RULING G`, `RULING I`
 * items 4–7) — every step, every boundary, and the source guard of NB-1C.
 */

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** The Unicode `White_Space` property, listed explicitly (Unicode 15 PropList.txt). */
const WHITE_SPACE_CODE_POINTS: readonly number[] = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002,
  0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000,
];

/** General category Cc, exactly as D-089 `RULING G` step 4 enumerates it. */
function isCc(codePoint: number): boolean {
  return codePoint <= 0x001f || (codePoint >= 0x007f && codePoint <= 0x009f);
}

describe('sanitizeCancelReason - presence after sanitisation (L4-A)', () => {
  it.each([
    ['the empty string', ''],
    ['spaces only', '     '],
    ['TAB / LF / CR only', '\t\n\r'],
    ['NUL only', '\u0000'],
    ['C0 only', '\u0001\u0002\u001f'],
    ['DEL only', '\u007f'],
    ['C1 only, U+0085 and U+009F included', '\u0080\u0085\u009f'],
    ['White_Space only (NBSP, ideographic space, line separator)', '\u00a0\u3000\u2028'],
  ])('refuses %s - the sanitised result is empty', (_name, raw) => {
    expect(sanitizeCancelReason(raw)).toBeUndefined();
  });

  it('accepts a single code point', () => {
    expect(sanitizeCancelReason('x')).toBe('x');
  });
});

describe('sanitizeCancelReason - Cc replacement, White_Space collapse, boundary trim', () => {
  it.each([
    ['embedded NUL', 'a\u0000b', 'a b'],
    ['embedded C0 (BEL)', 'a\u0007b', 'a b'],
    ['embedded DEL', 'a\u007fb', 'a b'],
    ['embedded C1 U+0080', 'a\u0080b', 'a b'],
    ['embedded C1 U+0085 (NEL)', 'a\u0085b', 'a b'],
    ['embedded C1 U+009F', 'a\u009fb', 'a b'],
    ['a Cc run is collapsed together with the spaces next to it', 'a \u0000\t\u0001 b', 'a b'],
    ['multiple whitespace runs', 'a   b \t\n c', 'a b c'],
    ['leading and trailing whitespace', '  \t a b \r\n ', 'a b'],
    ['NBSP is collapsed to U+0020', 'a\u00a0b', 'a b'],
    ['IDEOGRAPHIC SPACE is collapsed to U+0020', 'a\u3000b', 'a b'],
    ['mixed White_Space run', 'a\u00a0\u3000\u2003\u2028b', 'a b'],
  ])('%s', (_name, raw, expected) => {
    expect(sanitizeCancelReason(raw)).toBe(expected);
  });

  it('maps EXACTLY Cc and White_Space to U+0020 over the whole BMP, and leaves every other code point to NFC', () => {
    const whiteSpace = new Set(WHITE_SPACE_CODE_POINTS);
    const mismatches: string[] = [];

    for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        continue;
      }

      const raw = `a${String.fromCodePoint(codePoint)}b`;
      const expected = isCc(codePoint) || whiteSpace.has(codePoint) ? 'a b' : raw.normalize('NFC');

      if (sanitizeCancelReason(raw) !== expected) {
        mismatches.push(codePoint.toString(16));
      }
    }

    expect(mismatches).toStrictEqual([]);
  });
});

describe('sanitizeCancelReason - Cf preservation (NB-1C)', () => {
  it.each([
    ['U+FEFF leading', '\ufeffabc'],
    ['U+FEFF trailing', 'abc\ufeff'],
    ['U+FEFF internal', 'ab\ufeffc'],
    ['U+200B ZERO WIDTH SPACE', 'ab\u200bc'],
    ['U+200E LEFT-TO-RIGHT MARK', 'ab\u200ec'],
    ['U+202E RIGHT-TO-LEFT OVERRIDE', 'ab\u202ec'],
    ['U+2066 LEFT-TO-RIGHT ISOLATE', 'ab\u2066c'],
  ])('preserves %s byte for byte', (_name, raw) => {
    expect(sanitizeCancelReason(raw)).toBe(raw);
  });

  it('trims ONLY the U+0020 boundary - a Cf next to it survives', () => {
    expect(sanitizeCancelReason(' \ufeff a \u200b ')).toBe('\ufeff a \u200b');
  });

  it('accepts a reason that consists of a Cf only - it is not removed, so it is not empty', () => {
    expect(sanitizeCancelReason('\u200b')).toBe('\u200b');
  });

  it('does not reject U+FFFD', () => {
    expect(sanitizeCancelReason('a\ufffdb')).toBe('a\ufffdb');
  });
});

describe('sanitizeCancelReason - NFC', () => {
  it('leaves NFC input unchanged', () => {
    const raw = 'Patientin w\u00fcnscht Abbruch - \u00e9t\u00e9';

    expect(raw.normalize('NFC')).toBe(raw);
    expect(sanitizeCancelReason(raw)).toBe(raw);
  });

  it('composes decomposed input: e + U+0301 -> U+00E9', () => {
    expect(sanitizeCancelReason('cafe\u0301')).toBe('caf\u00e9');
  });

  it('never applies NFKC: compatibility characters survive', () => {
    // U+FB01 LATIN SMALL LIGATURE FI and U+2460 CIRCLED DIGIT ONE have only COMPATIBILITY
    // decompositions, which NFKC would apply and NFC must not.
    expect(sanitizeCancelReason('\ufb01 \u2460')).toBe('\ufb01 \u2460');
  });
});

describe('sanitizeCancelReason - Unicode well-formedness (NB-PF-2)', () => {
  it.each([
    ['a lone high surrogate', 'a\ud800b'],
    ['a lone low surrogate', 'a\udc00b'],
    ['a reversed pair', '\ude00\ud83d'],
    ['a trailing lone high surrogate', 'abc\ud83d'],
  ])('refuses %s', (_name, raw) => {
    expect(sanitizeCancelReason(raw)).toBeUndefined();
  });

  it('accepts a valid surrogate pair', () => {
    expect(sanitizeCancelReason('ok \u{1f600}')).toBe('ok \u{1f600}');
  });
});

describe('sanitizeCancelReason - length (L4-B)', () => {
  it('pins both limits at 255 UTF-8 bytes', () => {
    expect([
      CANCEL_REASON_RAW_MAX_UTF8_BYTES,
      CANCEL_REASON_SANITIZED_MAX_UTF8_BYTES,
    ]).toStrictEqual([255, 255]);
  });

  it('accepts 255 ASCII bytes and refuses 256', () => {
    expect(sanitizeCancelReason('a'.repeat(255))).toBe('a'.repeat(255));
    expect(sanitizeCancelReason('a'.repeat(256))).toBeUndefined();
  });

  it('measures the RAW parsed string before sanitising it: 256 raw bytes that would sanitise to 1 are refused', () => {
    const raw = `a${' '.repeat(255)}`;

    expect(utf8Bytes(raw)).toBe(256);
    expect(sanitizeCancelReason(raw)).toBeUndefined();
    expect(sanitizeCancelReason(`a${' '.repeat(254)}`)).toBe('a');
  });

  it('counts bytes, not UTF-16 code units: the euro sign (3 bytes)', () => {
    expect(utf8Bytes('\u20ac'.repeat(85))).toBe(255);
    expect(sanitizeCancelReason('\u20ac'.repeat(85))).toBe('\u20ac'.repeat(85));
    expect(sanitizeCancelReason('\u20ac'.repeat(86))).toBeUndefined();
  });

  it('counts bytes, not UTF-16 code units: an astral emoji (4 bytes, 2 code units)', () => {
    const fits = `${'\u{1f600}'.repeat(63)}abc`;
    const over = '\u{1f600}'.repeat(64);

    expect([utf8Bytes(fits), fits.length]).toStrictEqual([255, 129]);
    expect(sanitizeCancelReason(fits)).toBe(fits);
    expect(utf8Bytes(over)).toBe(256);
    expect(sanitizeCancelReason(over)).toBeUndefined();
  });

  it('NB-1B: 85 x U+0958 passes the raw limit but EXPANDS under NFC beyond 255 bytes, and is refused', () => {
    const raw = '\u0958'.repeat(85);

    // Mechanically asserted in THIS runtime, not assumed: U+0958 is a composition exclusion, so
    // NFC decomposes it to U+0915 U+093C (3 + 3 bytes).
    expect(utf8Bytes(raw)).toBe(255);
    expect(utf8Bytes(raw.normalize('NFC'))).toBe(510);

    expect(sanitizeCancelReason(raw)).toBeUndefined();
  });

  it('measures the final value in code points for the minimum: one astral code point is enough', () => {
    expect(sanitizeCancelReason('\u{1f600}')).toBe('\u{1f600}');
  });
});

describe('sanitizeCancelReason - determinism and purity', () => {
  it('returns the same value for the same input, and sanitising the result again changes nothing', () => {
    const raw = '  Termin\u00a0\u00a0abgesagt\t(Patient)\u0000 ';
    const first = sanitizeCancelReason(raw);

    expect(first).toBe('Termin abgesagt (Patient)');
    expect(sanitizeCancelReason(raw)).toBe(first);
    expect(sanitizeCancelReason(first ?? '')).toBe(first);
  });
});

describe('encounter-cancel-reason.ts - source guard (NB-1C)', () => {
  const source = readFileSync(new URL('./encounter-cancel-reason.ts', import.meta.url), 'utf8');

  it('uses the explicit Unicode White_Space property and never the generic regex whitespace class', () => {
    expect(source).toContain('\\p{White_Space}');
    expect(source.includes('\\s')).toBe(false);
  });

  it('never uses the built-in string trimming (it removes U+FEFF)', () => {
    expect(/\.trim(Start|End|Left|Right)?\(/.test(source)).toBe(false);
  });

  it('normalises exactly once, with NFC', () => {
    expect(source.match(/\.normalize\(/g)).toStrictEqual(['.normalize(']);
    expect(source).toContain(".normalize('NFC')");
  });
});

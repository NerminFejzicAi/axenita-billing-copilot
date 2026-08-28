import { describe, expect, it } from 'vitest';

import { CryptoOperationError } from './crypto.errors.js';
import {
  MANUAL_V1_MAX_UTF8_BYTES,
  isWellFormedUnicode,
  normaliseManualV1ExternalIdentifier,
} from './manual-v1-identifier-normalizer.js';

/**
 * Characters that would be invisible or destructive in the source file are built from their
 * code points, so the fixtures below say exactly what they are.
 */
const chr = (code: number): string => String.fromCharCode(code);

const NUL = chr(0x00);
const TAB = chr(0x09);
const LF = chr(0x0a);
const CR = chr(0x0d);
const DEL = chr(0x7f);
const BOM = chr(0xfeff);
/** U+3000 IDEOGRAPHIC SPACE — `White_Space`, and not ASCII. */
const IDEOGRAPHIC_SPACE = chr(0x3000);
/** U+0301 COMBINING ACUTE ACCENT. */
const COMBINING_ACUTE = chr(0x0301);
/** U+00E9, the composed form of `e` plus {@link COMBINING_ACUTE}. */
const COMPOSED_E_ACUTE = chr(0x00e9);
/** A lone high surrogate and a lone low surrogate. */
const HIGH_SURROGATE = chr(0xd83d);
const LOW_SURROGATE = chr(0xde00);
/** U+1F600 — the well formed pair those two surrogates make together. */
const ASTRAL_PAIR = String.fromCodePoint(0x1f600);
/** U+20AC EURO SIGN — three UTF-8 bytes, one UTF-16 code unit. */
const EURO_SIGN = chr(0x20ac);

const utf8 = (value: string): number => Buffer.byteLength(value, 'utf8');

describe('isWellFormedUnicode', () => {
  it.each([
    ['plain BMP text', 'PAT-000123'],
    ['a well formed surrogate pair', `A${ASTRAL_PAIR}B`],
    ['the empty string', ''],
  ])('given %s then it is well formed', (_label, value) => {
    expect(isWellFormedUnicode(value)).toBe(true);
  });

  it.each([
    ['a lone high surrogate', HIGH_SURROGATE],
    ['a lone low surrogate', LOW_SURROGATE],
    ['a high surrogate followed by a BMP character', `${HIGH_SURROGATE}A`],
    ['a high surrogate at the very end', `A${HIGH_SURROGATE}`],
    ['a reversed pair', `${LOW_SURROGATE}${HIGH_SURROGATE}`],
    ['two consecutive high surrogates', `${HIGH_SURROGATE}${HIGH_SURROGATE}`],
  ])('given %s then it is not well formed', (_label, value) => {
    expect(isWellFormedUnicode(value)).toBe(false);
  });
});

describe('normaliseManualV1ExternalIdentifier — step 1, valid Unicode', () => {
  it('given normal BMP text then it is accepted unchanged', () => {
    expect(normaliseManualV1ExternalIdentifier('PAT-000123')).toBe('PAT-000123');
  });

  it('given a well formed surrogate pair then it is accepted and preserved', () => {
    expect(normaliseManualV1ExternalIdentifier(`ID${ASTRAL_PAIR}`)).toBe(`ID${ASTRAL_PAIR}`);
  });

  it.each([
    ['a lone high surrogate', `ID${HIGH_SURROGATE}`],
    ['a lone low surrogate', `ID${LOW_SURROGATE}`],
    ['a malformed surrogate sequence', `${HIGH_SURROGATE}X${LOW_SURROGATE}`],
  ])('given %s then it is rejected', (_label, value) => {
    expect(() => normaliseManualV1ExternalIdentifier(value)).toThrow(CryptoOperationError);
  });

  it('given ill formed input then it is rejected and never repaired', () => {
    // `toWellFormed()` would return `ID` plus U+FFFD, and the caller would never learn that the
    // value stored is not the value it sent. MANUAL-v1 refuses instead.
    expect(() => normaliseManualV1ExternalIdentifier(`ID${HIGH_SURROGATE}`)).toThrow(
      /ILL_FORMED_UNICODE/u,
    );
  });
});

describe('normaliseManualV1ExternalIdentifier — steps 2 and 3, NUL and controls', () => {
  it('given U+0000 then it is rejected by its own ordered step', () => {
    expect(() => normaliseManualV1ExternalIdentifier(`ID${NUL}1`)).toThrow(/\(NUL\)/u);
  });

  it.each([
    ['U+0001', chr(0x01)],
    ['U+001F', chr(0x1f)],
    ['U+0080', chr(0x80)],
    ['U+009F', chr(0x9f)],
    ['TAB', TAB],
    ['LF', LF],
    ['CR', CR],
  ])('given %s then it is rejected as a C0/C1 control', (_label, control) => {
    // TAB, LF and CR are ordinary members of U+0001-U+001F here: MANUAL-v1 normalises an
    // identifier, not clinical text, so it has no line-break exception.
    expect(() => normaliseManualV1ExternalIdentifier(`ID${control}1`)).toThrow(
      /\(CONTROL_CHARACTER\)/u,
    );
  });

  it('given U+007F DEL then it is NOT rejected as a C0/C1 control', () => {
    // DEL is not part of the ratified C0/C1 set. Widening the check to Unicode general
    // category `Cc` would reject this value and change what the profile accepts.
    expect(normaliseManualV1ExternalIdentifier(`ID${DEL}1`)).toBe(`ID${DEL}1`);
  });
});

describe('normaliseManualV1ExternalIdentifier — steps 4 and 5, BOM and whitespace', () => {
  it('given one leading U+FEFF then it is removed', () => {
    expect(normaliseManualV1ExternalIdentifier(`${BOM}PAT-1`)).toBe('PAT-1');
  });

  it('given a trailing U+FEFF then it is preserved', () => {
    // U+FEFF is not Unicode `White_Space`, so step 5 does not touch it, and step 4 removes a
    // LEADING mark only. This assertion fails if `.trim()` is ever used for step 5, because
    // ECMAScript trim strips U+FEFF at both ends.
    const value = `PAT-1${BOM}`;

    expect(normaliseManualV1ExternalIdentifier(value)).toBe(value);
    expect(normaliseManualV1ExternalIdentifier(value)).not.toBe('PAT-1');
  });

  it('given two leading U+FEFF then only the first is removed', () => {
    // Step 4 removes ONE leading mark; the second is an ordinary character of the identifier.
    // `.trim()` semantics would remove both.
    expect(normaliseManualV1ExternalIdentifier(`${BOM}${BOM}PAT-1`)).toBe(`${BOM}PAT-1`);
  });

  it('given outer ASCII spaces then they are trimmed', () => {
    expect(normaliseManualV1ExternalIdentifier('  PAT-1  ')).toBe('PAT-1');
  });

  it('given outer U+3000 ideographic spaces then they are trimmed', () => {
    expect(
      normaliseManualV1ExternalIdentifier(`${IDEOGRAPHIC_SPACE}PAT-1${IDEOGRAPHIC_SPACE}`),
    ).toBe('PAT-1');
  });

  it('given inner whitespace then it is preserved', () => {
    expect(normaliseManualV1ExternalIdentifier('  PAT 00 1  ')).toBe('PAT 00 1');
  });
});

describe('normaliseManualV1ExternalIdentifier — step 6, NFC', () => {
  it('given decomposed and composed spellings then both normalise identically', () => {
    const decomposed = `PAT-e${COMBINING_ACUTE}`;
    const composed = `PAT-${COMPOSED_E_ACUTE}`;

    expect(normaliseManualV1ExternalIdentifier(decomposed)).toBe(
      normaliseManualV1ExternalIdentifier(composed),
    );
    expect(normaliseManualV1ExternalIdentifier(decomposed)).toBe(composed);
  });

  it.each([
    // NFKC would fold each of these; NFC does not, and folding them would merge identifiers a
    // practice considers distinct.
    ['a fullwidth letter', chr(0xff21)],
    ['the fi ligature', chr(0xfb01)],
    ['a superscript digit', chr(0x00b2)],
  ])('given %s then NFKC-only equivalence is not applied', (_label, value) => {
    expect(normaliseManualV1ExternalIdentifier(value)).toBe(value);
  });

  it('given differing case then case is preserved', () => {
    expect(normaliseManualV1ExternalIdentifier('pat-abc')).toBe('pat-abc');
    expect(normaliseManualV1ExternalIdentifier('PAT-ABC')).not.toBe(
      normaliseManualV1ExternalIdentifier('pat-abc'),
    );
  });

  it('given punctuation then it is preserved', () => {
    expect(normaliseManualV1ExternalIdentifier('PAT/00-12.3_X')).toBe('PAT/00-12.3_X');
  });

  it('given leading zeros then they are preserved', () => {
    // `000123` and `123` are different patient numbers in most practice management systems.
    expect(normaliseManualV1ExternalIdentifier('000123')).toBe('000123');
    expect(normaliseManualV1ExternalIdentifier('000123')).not.toBe(
      normaliseManualV1ExternalIdentifier('123'),
    );
  });
});

describe('normaliseManualV1ExternalIdentifier — step 7, empty', () => {
  it.each([
    ['the empty string', ''],
    ['ASCII whitespace only', '   '],
    ['non-ASCII whitespace only', `${IDEOGRAPHIC_SPACE}${IDEOGRAPHIC_SPACE}`],
    ['a byte-order mark followed by whitespace', `${BOM}   `],
    ['a byte-order mark alone', BOM],
  ])('given %s then it is rejected', (_label, value) => {
    expect(() => normaliseManualV1ExternalIdentifier(value)).toThrow(/\(EMPTY\)/u);
  });
});

describe('normaliseManualV1ExternalIdentifier — step 8, 255 UTF-8 bytes', () => {
  it('given exactly 255 UTF-8 bytes then it is accepted and never truncated', () => {
    const value = 'A'.repeat(MANUAL_V1_MAX_UTF8_BYTES);

    const normalised = normaliseManualV1ExternalIdentifier(value);

    expect(utf8(value)).toBe(255);
    expect(normalised).toBe(value);
    expect(utf8(normalised)).toBe(255);
  });

  it('given 256 UTF-8 bytes then it is rejected rather than truncated', () => {
    const value = 'A'.repeat(MANUAL_V1_MAX_UTF8_BYTES + 1);

    expect(utf8(value)).toBe(256);
    expect(() => normaliseManualV1ExternalIdentifier(value)).toThrow(/\(TOO_LONG\)/u);
  });

  it('given multibyte characters then BYTES are counted, not code units or code points', () => {
    // 85 x U+20AC is 85 code points, 85 UTF-16 code units and 255 UTF-8 bytes.
    const accepted = EURO_SIGN.repeat(85);
    const rejected = EURO_SIGN.repeat(86);

    expect(accepted.length).toBe(85);
    expect(utf8(accepted)).toBe(255);
    expect(normaliseManualV1ExternalIdentifier(accepted)).toBe(accepted);

    expect(utf8(rejected)).toBe(258);
    expect(() => normaliseManualV1ExternalIdentifier(rejected)).toThrow(/\(TOO_LONG\)/u);
  });

  it('given input whose length NFC changes then the POST-NFC size governs', () => {
    // Decomposed `e` + U+0301 is 3 bytes; composed U+00E9 is 2. A hundred of them are 300
    // bytes before NFC and 200 after, so measuring the INPUT rather than the RESULT would
    // reject a value the profile accepts.
    const decomposed = `e${COMBINING_ACUTE}`.repeat(100);

    expect(utf8(decomposed)).toBe(300);

    const normalised = normaliseManualV1ExternalIdentifier(decomposed);

    expect(utf8(normalised)).toBe(200);
    expect(normalised).toBe(COMPOSED_E_ACUTE.repeat(100));
  });

  it('given input NFC shrinks to 256 bytes then it is still rejected', () => {
    // The converse of the test above: post-NFC is the measurement, and post-NFC is still over.
    const decomposed = `e${COMBINING_ACUTE}`.repeat(128);

    expect(utf8(decomposed)).toBe(384);
    expect(utf8(decomposed.normalize('NFC'))).toBe(256);
    expect(() => normaliseManualV1ExternalIdentifier(decomposed)).toThrow(/\(TOO_LONG\)/u);
  });
});

describe('normaliseManualV1ExternalIdentifier — error safety', () => {
  it.each([
    ['ill formed Unicode', `SECRET-PATIENT-1${HIGH_SURROGATE}`, 'SECRET-PATIENT-1'],
    ['a NUL', `SECRET-PATIENT-2${NUL}`, 'SECRET-PATIENT-2'],
    ['a control character', `SECRET-PATIENT-3${chr(0x01)}`, 'SECRET-PATIENT-3'],
    ['an over long value', `SECRET-PATIENT-4${'9'.repeat(300)}`, 'SECRET-PATIENT-4'],
  ])('given %s then no fragment of the input reaches the error', (_label, value, fragment) => {
    let thrown: unknown;
    try {
      normaliseManualV1ExternalIdentifier(value);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoOperationError);
    const error = thrown as Error;
    const serialised = `${error.message}${error.stack ?? ''}`;

    expect(serialised).not.toContain(fragment);
    expect(serialised).not.toContain(value);
    expect(error.cause).toBeUndefined();
  });

  it('given an empty result then the error names the rule and not the input', () => {
    let thrown: unknown;
    try {
      normaliseManualV1ExternalIdentifier(`${BOM}  ${IDEOGRAPHIC_SPACE} `);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toBe(
      'The external identifier is not accepted by the MANUAL-v1 normalisation profile (EMPTY).',
    );
  });
});

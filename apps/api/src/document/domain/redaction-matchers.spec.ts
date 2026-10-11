import { describe, expect, it } from 'vitest';

import {
  BLK_CLASS_BODY,
  NA_CLASS_BODY,
  NEUTRAL_CODE_POINTS,
  NON_ASCII_BLOCKING_RANGES,
  isBlockingCodeUnit,
} from './redaction-boundary.js';
import {
  MATCHER_REGEX_FLAGS,
  MATCHER_SOURCES,
  findAhvCandidates,
  findEmailCandidates,
  findIbanCandidates,
  findPhoneCandidates,
} from './redaction-matchers.js';
import { REDACTION_RULESET_VERSION, applyRedactionRuleset } from './redaction-ruleset.js';

/**
 * `P5-I6A` — the `EMAIL`, `AHV`, `IBAN` and `PHONE` matchers and the `BLK` / `NEUTRAL` boundary
 * model (D-093 `RULING F.1`, `F.3`-`F.5`, `RULING G`, `RULING I`; `08` §12.15.2).
 *
 * Every vector states its exact expected output. `=` in `08` means "output identical to input".
 * Non-ASCII and control characters are built from code points, never written as literals or
 * escapes (`08` §12.15). All data is synthetic.
 */

const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const BACKSLASH = String.fromCharCode(0x5c);

const EMAIL = '[REDACTED:EMAIL]';
const AHV = '[REDACTED:AHV]';
const IBAN = '[REDACTED:IBAN]';
const PHONE = '[REDACTED:PHONE]';

const TAB = cp(0x09);
const LF = cp(0x0a);
const NBSP = cp(0x00a0);
const BACKTICK = cp(0x60);
const COMBINING_ACUTE = cp(0x0301);
const U_UMLAUT = cp(0x00fc);
const LEFT_GUILLEMET = cp(0x00ab);
const RIGHT_GUILLEMET = cp(0x00bb);
const RIGHT_SINGLE_QUOTE = cp(0x2019);
const FULLWIDTH_AT = cp(0xff20);
const ARABIC_INDIC_THREE = cp(0x0663);

/** A 253-character DNS name and its 254-character twin (`08` §12.15.2 `G-2`). */
const H253 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.ch`;
const H254 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(59)}.ch`;

/** Runs the engine twice and returns the redacted text of the (identical) COMPLETED results. */
function redact(input: string): string {
  const first = applyRedactionRuleset(input);
  const second = applyRedactionRuleset(input);
  expect(second).toEqual(first);
  expect(first.status).toBe('COMPLETED');
  if (first.status !== 'COMPLETED') {
    throw new Error('expected COMPLETED');
  }
  expect(first.rulesetVersion).toBe(REDACTION_RULESET_VERSION);
  return first.redactedText;
}

describe('BLK / NEUTRAL boundary model (D-093 RULING G)', () => {
  it('NEUTRAL has exactly the 38 frozen code points, all distinct and non-ASCII', () => {
    expect(NEUTRAL_CODE_POINTS).toHaveLength(38);
    expect(new Set(NEUTRAL_CODE_POINTS).size).toBe(38);
    expect(NEUTRAL_CODE_POINTS.every((codePoint) => codePoint >= 0x80)).toBe(true);
    expect([...NEUTRAL_CODE_POINTS].sort((a, b) => a - b)).toEqual([
      0x00a0, 0x00ab, 0x00bb, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
      0x2007, 0x2008, 0x2009, 0x200a, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2018,
      0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f, 0x2022, 0x2026, 0x2028, 0x2029,
      0x202f, 0x2039, 0x203a, 0x205f, 0x3000,
    ]);
  });

  it('the frozen NA ranges are exactly the complement of NEUTRAL over U+0080-U+10FFFF', () => {
    const neutral = new Set(NEUTRAL_CODE_POINTS);
    const inRanges = (codePoint: number): boolean =>
      NON_ASCII_BLOCKING_RANGES.some(([first, last]) => codePoint >= first && codePoint <= last);

    let mismatches = 0;
    for (let codePoint = 0x80; codePoint <= 0x10ffff; codePoint += 1) {
      if (inRanges(codePoint) === neutral.has(codePoint)) {
        mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
    expect(NON_ASCII_BLOCKING_RANGES).toHaveLength(15);
  });

  it('the NA and BLK class bodies are code-point escapes only and agree with the model', () => {
    expect(/^[!-~]+$/.test(NA_CLASS_BODY)).toBe(true);
    expect(NA_CLASS_BODY.startsWith(`${BACKSLASH}u{80}-${BACKSLASH}u{9F}`)).toBe(true);
    expect(BLK_CLASS_BODY.startsWith('A-Za-z0-9_')).toBe(true);

    const blk = new RegExp(`^[${BLK_CLASS_BODY}]$`, 'u');
    const neutral = new Set(NEUTRAL_CODE_POINTS);
    let mismatches = 0;
    for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        continue;
      }
      const expected =
        codePoint < 0x80
          ? /[A-Za-z0-9_]/.test(String.fromCharCode(codePoint))
          : !neutral.has(codePoint);
      if (blk.test(cp(codePoint)) !== expected) {
        mismatches += 1;
      }
    }
    for (const astral of [0x10000, 0x1f600, 0x10ffff]) {
      expect(blk.test(cp(astral))).toBe(true);
    }
    expect(mismatches).toBe(0);
  });

  it('per-code-unit BLK classification matches the model, surrogate halves included', () => {
    const neutral = new Set(NEUTRAL_CODE_POINTS);
    for (let unit = 0; unit <= 0xffff; unit += 1) {
      const expected =
        unit < 0x80 ? /[A-Za-z0-9_]/.test(String.fromCharCode(unit)) : !neutral.has(unit);
      if (isBlockingCodeUnit(unit) !== expected) {
        throw new Error(`classification mismatch at unit ${unit}`);
      }
    }
  });
});

describe('frozen regex sources (D-093 RULING F.0, G.4, I)', () => {
  it('every matcher compiles with exactly the flags gu', () => {
    expect(MATCHER_REGEX_FLAGS).toBe('gu');
    for (const source of Object.values(MATCHER_SOURCES)) {
      expect(new RegExp(source, MATCHER_REGEX_FLAGS).flags).toBe('gu');
    }
  });

  it('no matcher uses the forbidden shorthands \\w, \\d, \\b or \\p{...}', () => {
    for (const source of Object.values(MATCHER_SOURCES)) {
      for (const shorthand of ['w', 'W', 'd', 'D', 'b', 'B', 'p{', 'P{', 's', 'S']) {
        expect(source.includes(`${BACKSLASH}${shorthand}`)).toBe(false);
      }
    }
  });

  it('there is no matcher for any class outside EMAIL, AHV, IBAN and PHONE', () => {
    expect(Object.keys(MATCHER_SOURCES).sort()).toEqual([
      'AHV',
      'EMAIL',
      'IBAN',
      'PHONE_INTL',
      'PHONE_NAT',
    ]);
  });
});

describe('EMAIL — positive (08 §12.15.2)', () => {
  it.each([
    ['a@b.cd', EMAIL],
    ['john.doe@example.ch', EMAIL],
    ['x_y+tag@mail.example.co.uk', EMAIL],
    ['JOHN@X.CH', EMAIL],
    [
      `${LEFT_GUILLEMET}info@test.ch${RIGHT_GUILLEMET}`,
      `${LEFT_GUILLEMET}${EMAIL}${RIGHT_GUILLEMET}`,
    ],
    [
      `${RIGHT_SINGLE_QUOTE}a@b.ch${RIGHT_SINGLE_QUOTE}`,
      `${RIGHT_SINGLE_QUOTE}${EMAIL}${RIGHT_SINGLE_QUOTE}`,
    ],
    ['(info@test-praxis.ch)', `(${EMAIL})`],
    [`${'a'.repeat(64)}@x.ch`, EMAIL],
    ['foo+bar@x.ch', EMAIL],
    ['foo%bar@x.ch', EMAIL],
    ['foo-bar@x.ch', EMAIL],
    ['a@b.ch.', `${EMAIL}.`],
    ['a@b.ch,', `${EMAIL},`],
    ['Kontakt: a@b.ch; danke', `Kontakt: ${EMAIL}; danke`],
    [`a@${H253}`, EMAIL],
  ])('%s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('the recognition span equals the replacement span and covers the whole address', () => {
    expect(findEmailCandidates('x (john@x.ch) y')).toEqual([
      {
        redactionClass: 'EMAIL',
        recognitionStart: 3,
        recognitionEnd: 12,
        replaceStart: 3,
        replaceEnd: 12,
      },
    ]);
  });
});

describe('EMAIL — owner-corrected left boundary (OBLIGATORY, D-093 RULING F.1)', () => {
  it.each(['foo!bar@x.ch', 'foo&bar@x.ch', 'foo=bar@x.ch'])('%s stays unchanged', (input) => {
    expect(redact(input)).toBe(input);
  });

  it('the rejected variant foo![REDACTED:EMAIL] is never produced', () => {
    expect(redact('foo!bar@x.ch')).not.toBe(`foo!${EMAIL}`);
  });

  it.each([..."!#$&'*/=?^{|}~", BACKTICK])(
    'foo%sbar@x.ch stays unchanged (excluded RFC atext character)',
    (character) => {
      const input = `foo${character}bar@x.ch`;
      expect(redact(input)).toBe(input);
    },
  );
});

describe('EMAIL — negative (08 §12.15.2, all =)', () => {
  it.each([
    'foo#bar@x.ch',
    'foo$bar@x.ch',
    "foo'bar@x.ch",
    'foo*bar@x.ch',
    'foo/bar@x.ch',
    'foo?bar@x.ch',
    'foo^bar@x.ch',
    'foo{bar@x.ch',
    'foo|bar@x.ch',
    'foo}bar@x.ch',
    'foo~bar@x.ch',
    "'a@b.ch'",
    '*a@b.ch*',
    'x=a@b.ch',
    '/a@b.ch',
    `${BACKTICK}a@b.ch${BACKTICK}`,
    'john@localhost',
    'john@x.c',
    'john@x.c1',
    'john..doe@x.ch',
    '.john@x.ch',
    'john.@x.ch',
    'john@-x.ch',
    'john@x-.ch',
    'john@x..ch',
    'john@x.ch-foo',
    'john@x.ch_',
    'a@b@c.ch',
    'john @x.ch',
    `m${U_UMLAUT}ller@x.ch`,
    `john@m${U_UMLAUT}ller.ch`,
    `john${FULLWIDTH_AT}x.ch`,
    `john@x.ch${COMBINING_ACUTE}`,
    `${'a'.repeat(65)}@x.ch`,
    `a@${H254}`,
    'john@[192.168.1.1]',
    'john@192.168.1.1',
    'a@b.ch.x',
  ])('%s', (input) => {
    expect(redact(input)).toBe(input);
  });

  it('a quoted local part is never redacted, neither whole nor in part', () => {
    const input = '"john doe"@x.ch';
    expect(redact(input)).toBe(input);
  });
});

describe('EMAIL — length boundaries (D-093 RULING F.1 post-validation)', () => {
  it('local part 64 is accepted and 65 is rejected WHOLE (no suffix salvage)', () => {
    expect(redact(`${'a'.repeat(64)}@x.ch`)).toBe(EMAIL);
    expect(redact(`${'a'.repeat(65)}@x.ch`)).toBe(`${'a'.repeat(65)}@x.ch`);
  });

  it('domain 253 is accepted and 254 is rejected', () => {
    expect(H253).toHaveLength(253);
    expect(H254).toHaveLength(254);
    expect(redact(`a@${H253}`)).toBe(EMAIL);
    expect(redact(`a@${H254}`)).toBe(`a@${H254}`);
  });

  it('a DNS label of 63 is accepted and 64 is rejected', () => {
    expect(redact(`a@${'b'.repeat(63)}.ch`)).toBe(EMAIL);
    expect(redact(`a@${'b'.repeat(64)}.ch`)).toBe(`a@${'b'.repeat(64)}.ch`);
  });

  it('a TLD of 2 and 63 letters is accepted; 1, 64 or a digit is rejected', () => {
    expect(redact('a@b.cd')).toBe(EMAIL);
    expect(redact(`a@b.${'c'.repeat(63)}`)).toBe(EMAIL);
    expect(redact('a@b.c')).toBe('a@b.c');
    expect(redact(`a@b.${'c'.repeat(64)}`)).toBe(`a@b.${'c'.repeat(64)}`);
    expect(redact('a@b.c1')).toBe('a@b.c1');
  });
});

describe('AHV (08 §12.15.2)', () => {
  it.each([
    ['756.1234.5678.97', AHV],
    ['7561234567897', AHV],
    ['756.0000.0000.02', AHV],
    ['756.9876.5432.17', AHV],
    ['AHV: 756.1234.5678.97.', `AHV: ${AHV}.`],
    ['756.1234.5678.97,', `${AHV},`],
    ['(7561234567897)', `(${AHV})`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    '756.1234.5678.98',
    '7561234567898',
    '756 1234 5678 97',
    '756-1234-5678-97',
    '756.1234.567897',
    '1756.1234.5678.97',
    '756.1234.5678.971',
    'AHV756.1234.5678.97',
    '1.756.1234.5678.97',
    '756.1234.5678.97.5',
    '7561234567897/2',
    '757.1234.5678.97',
    `756.1234.5678.97${ARABIC_INDIC_THREE}`,
    `${cp(0x0667, 0x0665, 0x0666)}1234567897`,
    `7561234567897${COMBINING_ACUTE}`,
  ])('%s stays unchanged', (input) => {
    expect(redact(input)).toBe(input);
  });

  it('the EAN-13 check digit is mandatory: every wrong check digit stays unchanged', () => {
    for (let digit = 0; digit <= 9; digit += 1) {
      const input = `756123456789${digit}`;
      expect(redact(input)).toBe(digit === 7 ? AHV : input);
    }
  });

  it('the span is the whole candidate', () => {
    expect(findAhvCandidates('AHV 756.1234.5678.97')).toEqual([
      {
        redactionClass: 'AHV',
        recognitionStart: 4,
        recognitionEnd: 20,
        replaceStart: 4,
        replaceEnd: 20,
      },
    ]);
  });
});

/** An independent ISO 7064 MOD 97-10 reference using `BigInt`, for evidence only. */
function referenceMod97(compact: string): number {
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let digits = '';
  for (const character of rearranged) {
    const code = character.charCodeAt(0);
    digits += code >= 0x41 && code <= 0x5a ? String(code - 55) : character;
  }
  return Number(BigInt(digits) % 97n);
}

describe('IBAN (08 §12.15.2)', () => {
  it.each([
    ['CH09 0070 0123 4567 8901 2', IBAN],
    ['CH0900700123456789012', IBAN],
    ['CH05 0839 0000 0000 0000 1', IBAN],
    ['IBAN CH65 0070 0ABC DEFG H123 4.', `IBAN ${IBAN}.`],
    ['CH09 0070 0123 4567 8901 2,', `${IBAN},`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    'CH0900700123456789013',
    'CH0000700000000000083',
    'CH0100700000000000065',
    'ch0900700123456789012',
    'LI0900700123456789012',
    'DE89370400440532013000',
    'CH09 0070 01234567 8901 2',
    'CH09  0070 0123 4567 8901 2',
    'CH09-0070-0123-4567-8901-2',
    `CH09${TAB}0070 0123 4567 8901 2`,
    `CH09${LF}0070 0123 4567 8901 2`,
    `CH09${NBSP}0070 0123 4567 8901 2`,
    'CH0900700123456789012X',
    'XCH0900700123456789012',
    'CH09007001234567890123',
    'CH0900700123456789012-5',
    'Ch0900700123456789012',
  ])('%s stays unchanged', (input) => {
    expect(redact(input)).toBe(input);
  });

  it('the alias check digits 00 and 01 pass raw MOD 97 but are rejected by the 02..98 range', () => {
    expect(referenceMod97('CH0000700000000000083')).toBe(1);
    expect(referenceMod97('CH0100700000000000065')).toBe(1);
    expect(redact('CH0000700000000000083')).toBe('CH0000700000000000083');
    expect(redact('CH0100700000000000065')).toBe('CH0100700000000000065');
  });

  it('the alias check digits 99 pass raw MOD 97 but are rejected by the 02..98 range', () => {
    // Find a synthetic BBAN whose correct check digits are 02; then 99 (= 02 + 97) is its alias.
    let bban = '';
    for (let serial = 0; serial < 1000 && bban === ''; serial += 1) {
      const candidate = `00700${String(serial).padStart(12, '0')}`;
      if (referenceMod97(`CH02${candidate}`) === 1) {
        bban = candidate;
      }
    }
    expect(bban).not.toBe('');
    expect(referenceMod97(`CH99${bban}`)).toBe(1);
    expect(redact(`CH02${bban}`)).toBe(IBAN);
    expect(redact(`CH99${bban}`)).toBe(`CH99${bban}`);
  });

  it('every canonical accepted vector agrees with an independent MOD 97 reference', () => {
    for (const compact of [
      'CH0900700123456789012',
      'CH0508390000000000001',
      'CH6500700ABCDEFGH1234',
    ]) {
      expect(referenceMod97(compact)).toBe(1);
    }
    expect(referenceMod97('CH0900700123456789013')).not.toBe(1);
  });

  it('the span is the whole candidate, grouping spaces included', () => {
    expect(findIbanCandidates('IBAN CH09 0070 0123 4567 8901 2')).toEqual([
      {
        redactionClass: 'IBAN',
        recognitionStart: 5,
        recognitionEnd: 31,
        replaceStart: 5,
        replaceEnd: 31,
      },
    ]);
  });
});

describe('PHONE — positive (D-070 RULING 5 + D-093 RULING F.5)', () => {
  it.each([
    ['+41791234567', PHONE],
    ['0041791234567', PHONE],
    ['+41 79 123 45 67', PHONE],
    ['0041 79 123 45 67', PHONE],
    ['+41-79-123-45-67', PHONE],
    ['0041-79-123-45-67', PHONE],
    ['Tel 079 123 45 67', `Tel ${PHONE}`],
    ['Tel.: 079-123-45-67', `Tel.: ${PHONE}`],
    ['TELEFON:0791234567', `TELEFON:${PHONE}`],
    [`Mobile${TAB}079 123 45 67`, `Mobile${TAB}${PHONE}`],
    ['Natel : 0791234567', `Natel : ${PHONE}`],
    ['fax 0441234567', `fax ${PHONE}`],
    ['Tel/Fax: 044 123 45 67', `Tel/Fax: ${PHONE}`],
    ['Tel.0791234567', `Tel.${PHONE}`],
    ['Tel 079 123 45 67.', `Tel ${PHONE}.`],
    ['Tel 079 123 45 67, 079 765 43 21', `Tel ${PHONE}, 079 765 43 21`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('PHONE — negative (08 §12.15.2, all =)', () => {
  it.each([
    '0791234567',
    '079 123 45 67',
    'Hotel 0791234567',
    'Automobile 0791234567',
    'Telefax 0441234567',
    'Tel 079.123.45.67',
    '+41 (0)79 123 45 67',
    '+41 79-123 45 67',
    '+41 791234567',
    '+410791234567',
    '+417912345678',
    '10041791234567',
    'Tel 0012345678',
    'Tel 044 123 45 67/68',
    'Tel 0791234567.5',
    `Tel${LF}0791234567`,
    `Tel${NBSP}0791234567`,
    `Tel ${NBSP}0791234567`,
    '+41 79 123 45 67 89',
    '12 0041 79 123 45 67',
    'Tel::0791234567',
    '++41791234567',
    'Tel 07912345678',
    'Tel 079 123 4567',
    '1.0041791234567',
    `Tel ${cp(0xff10)}791234567`,
    'Tel 079-123 45 67',
  ])('%s stays unchanged', (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('PHONE — labels, separators and replacement span (D-093 RULING F.5)', () => {
  it.each(['Telefon', 'TELEFON', 'telefon', 'Tel.', 'TEL.', 'Tel', 'tel', 'Mobile', 'MOBILE'])(
    'label %s is recognised',
    (label) => {
      expect(redact(`${label} 0791234567`)).toBe(`${label} ${PHONE}`);
    },
  );

  it.each(['Natel', 'nAtEl', 'Fax', 'FAX'])('label %s is recognised', (label) => {
    expect(redact(`${label} 0791234567`)).toBe(`${label} ${PHONE}`);
  });

  it.each(['Telefax', 'Tele', 'Phone', 'Handy', 'Mob', 'Mobil'])('%s is not a label', (label) => {
    expect(redact(`${label} 0791234567`)).toBe(`${label} 0791234567`);
  });

  it.each(['Hotel', 'Automobile', 'xTel', '_Tel', `${U_UMLAUT}Tel`])(
    'a label embedded in a BLK word (%s) does not fire',
    (word) => {
      expect(redact(`${word} 0791234567`)).toBe(`${word} 0791234567`);
    },
  );

  it.each([
    ['', ''],
    [' ', ' '],
    ['   ', '   '],
    [TAB, TAB],
    [':', ':'],
    [': ', ': '],
    [' : ', ' : '],
    [`${TAB}:${TAB}`, `${TAB}:${TAB}`],
    [' :', ' :'],
  ])('separator %j is accepted and stays visible', (separator, visible) => {
    expect(redact(`Tel${separator}0791234567`)).toBe(`Tel${visible}${PHONE}`);
  });

  it.each(['::', ' :: ', LF, NBSP, ' - ', '-', '/', ';'])(
    'separator %j is rejected',
    (separator) => {
      const input = `Tel${separator}0791234567`;
      expect(redact(input)).toBe(input);
    },
  );

  it('PHONE_NAT recognises label + separator + number but replaces ONLY the number', () => {
    expect(findPhoneCandidates('Tel.: 079-123-45-67')).toEqual([
      {
        redactionClass: 'PHONE',
        recognitionStart: 0,
        recognitionEnd: 19,
        replaceStart: 6,
        replaceEnd: 19,
      },
    ]);
  });

  it('PHONE_INTL replaces the whole match', () => {
    expect(findPhoneCandidates('x +41 79 123 45 67')).toEqual([
      {
        redactionClass: 'PHONE',
        recognitionStart: 2,
        recognitionEnd: 18,
        replaceStart: 2,
        replaceEnd: 18,
      },
    ]);
  });

  it('a national number without its own label stays unchanged (canonical false negative)', () => {
    expect(redact('Tel 079 123 45 67, 079 765 43 21')).toBe(`Tel ${PHONE}, 079 765 43 21`);
  });
});

describe('Unicode and look-alike negatives (D-093 RULING I)', () => {
  it.each([
    ['fullwidth digits in AHV', `${cp(0xff17, 0xff15, 0xff16)}1234567897`],
    ['fullwidth plus in PHONE', `${cp(0xff0b)}41791234567`],
    ['fullwidth Latin in IBAN', `${cp(0xff23, 0xff28)}0900700123456789012`],
    ['long s in a phone label', `Te${cp(0x017f)} 0791234567`],
    ['dotless i inside an e-mail local part', `ma${cp(0x0131)}l@b.ch`],
    ['Cyrillic a in an e-mail local part', `${cp(0x0430)}@b.ch`],
    ['Arabic-Indic digits in a phone number', `Tel 0${cp(0x0667, 0x0669)}1234567`],
  ])('%s stays unchanged', (_label, input) => {
    expect(redact(input)).toBe(input);
  });
});

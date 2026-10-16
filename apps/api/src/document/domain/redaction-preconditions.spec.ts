import { describe, expect, it } from 'vitest';

import { normaliseClinicalText } from '../../crypto/clinical-text-normalizer.js';

import { RedactionPreconditionBreachError } from './redaction-precondition-breach.error.js';
import { assertRedactionPreconditions } from './redaction-preconditions.js';
import { REDACTION_RULESET_VERSION, applyRedactionRuleset } from './redaction-ruleset.js';

/**
 * `P5-I6A` — `G-3`: the mandatory assertion-only re-assertion of the eight canonical `P5-I3C`
 * postconditions (D-093 `RULING C.3`; `08` §12.15.2).
 *
 * A breach is `UNEXPECTED INTERNAL FAILURE — PRECONDITION BREACH`: it is thrown, it is never a
 * `FAILED` result, and its error carries no text. Control and non-ASCII characters are built from
 * code points, never written as literals or escapes.
 */

const chr = (code: number): string => String.fromCharCode(code);
const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const utf8 = (value: string): number => Buffer.byteLength(value, 'utf8');

const NUL = chr(0x00);
const TAB = chr(0x09);
const LF = chr(0x0a);
const CR = chr(0x0d);
const DEL = chr(0x7f);
const NBSP = chr(0x00a0);
const BOM = chr(0xfeff);
const HIGH_SURROGATE = chr(0xd800);
const LOW_SURROGATE = chr(0xdc00);
const COMBINING_ACUTE = chr(0x0301);

/** A marker that must never appear in an error. */
const SECRET = 'Patient Muster 756.1234.5678.97';

function expectBreach(input: string): RedactionPreconditionBreachError {
  expect(() => assertRedactionPreconditions(input)).toThrow(RedactionPreconditionBreachError);

  let thrown: unknown;
  try {
    applyRedactionRuleset(input);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RedactionPreconditionBreachError);
  return thrown as RedactionPreconditionBreachError;
}

function expectAcceptedUnchanged(input: string): void {
  expect(() => assertRedactionPreconditions(input)).not.toThrow();
  expect(applyRedactionRuleset(input)).toEqual({
    status: 'COMPLETED',
    rulesetVersion: REDACTION_RULESET_VERSION,
    redactedText: input,
  });
}

describe('G-3 canonical breach vectors (08 §12.15.2, all -> PRECONDITION BREACH)', () => {
  it.each([
    ['a lone surrogate U+D800 inside text', `ab${HIGH_SURROGATE}cd`],
    ['U+000D', `a${CR}b`],
    ['U+0000', `a${NUL}b`],
    ['U+0001', `a${chr(0x01)}b`],
    ['U+000B', `a${chr(0x0b)}b`],
    ['U+0085 (C1)', `a${chr(0x85)}b`],
    ['e + U+0301 (not NFC)', `e${COMBINING_ACUTE}`],
    ['a leading U+0020', ' abc'],
    ['a trailing U+000A', `abc${LF}`],
    ['a leading U+00A0', `${NBSP}abc`],
    ['the empty string', ''],
    ['x×262145', 'x'.repeat(262145)],
  ])('%s', (_label, input) => {
    expectBreach(input);
  });
});

describe('G-3 — each of the eight predicates in isolation', () => {
  it('1 well-formed Unicode: lone high, lone low and reversed surrogates breach', () => {
    for (const input of [
      `a${HIGH_SURROGATE}`,
      `${LOW_SURROGATE}a`,
      `a${LOW_SURROGATE}${HIGH_SURROGATE}b`,
    ]) {
      expectBreach(input);
    }
    expectAcceptedUnchanged(`a${cp(0x1f600)}b`);
  });

  it('2 no CR: a lone CR and a CRLF breach', () => {
    expectBreach(`a${CR}b`);
    expectBreach(`a${CR}${LF}b`);
  });

  it('3 no NUL', () => {
    expectBreach(`a${NUL}b`);
    expectBreach(`${NUL}`);
  });

  it('4 no rejected C0/C1: every code point of the ratified set breaches', () => {
    const rejected: number[] = [];
    for (let code = 0x01; code <= 0x08; code += 1) rejected.push(code);
    rejected.push(0x0b, 0x0c);
    for (let code = 0x0e; code <= 0x1f; code += 1) rejected.push(code);
    for (let code = 0x80; code <= 0x9f; code += 1) rejected.push(code);
    expect(rejected).toHaveLength(8 + 2 + 18 + 32);

    for (const code of rejected) {
      expectBreach(`a${chr(code)}b`);
    }
  });

  it('5 NFC: a decomposed sequence breaches, its composed form is accepted', () => {
    expectBreach(`Caf${'e'}${COMBINING_ACUTE}`);
    expectAcceptedUnchanged(`Caf${chr(0x00e9)}`);
  });

  it('6 no outer White_Space: leading or trailing White_Space of any kind breaches', () => {
    for (const space of [' ', TAB, LF, NBSP, chr(0x2028), chr(0x3000), chr(0x0b), chr(0x85)]) {
      expectBreach(`${space}abc`);
      expectBreach(`abc${space}`);
    }
  });

  it('7 non-empty', () => {
    expectBreach('');
  });

  it('8 size: 262145 UTF-8 bytes breach, also when made of multi-byte characters', () => {
    expectBreach('x'.repeat(262145));
    const euro = `${chr(0x20ac).repeat(87381)}xx`;
    expect(utf8(euro)).toBe(262145);
    expectBreach(euro);
  });
});

describe('G-3 — values that must NOT breach (the set is not wider than ratified)', () => {
  it('a leading U+FEFF is a valid normalised value (no second normaliser pass)', () => {
    const input = `${BOM}abc`;
    expectAcceptedUnchanged(input);
    // The forbidden mechanism `normaliseClinicalText(x) === x` would have rejected it.
    expect(normaliseClinicalText(input)).not.toBe(input);
  });

  it('a trailing U+FEFF is accepted unchanged', () => {
    expectAcceptedUnchanged(`abc${BOM}`);
  });

  it('U+007F is not in the ratified C0/C1 set', () => {
    expectAcceptedUnchanged(`a${DEL}b`);
  });

  it('inner TAB and LF are accepted unchanged', () => {
    expectAcceptedUnchanged(`a${TAB}b${LF}c`);
    expectAcceptedUnchanged(`Befund:${LF}${LF}${TAB}unauff${chr(0x00e4)}llig`);
  });

  it('exactly 262144 UTF-8 bytes are accepted, in 1-, 3- and 4-byte characters', () => {
    const ascii = 'x'.repeat(262144);
    const euro = `${chr(0x20ac).repeat(87381)}x`;
    const astral = cp(0x1f600).repeat(65536);
    for (const input of [ascii, euro, astral]) {
      expect(utf8(input)).toBe(262144);
      expectAcceptedUnchanged(input);
    }
  });

  it('inner whitespace is never trimmed, collapsed or otherwise repaired', () => {
    expectAcceptedUnchanged(`a  ${TAB}${TAB} b${LF}${LF}${LF}c`);
  });
});

describe('G-3 — the breach is static and carries no text', () => {
  it('the error has one constant message for every predicate', () => {
    const messages = new Set(
      [`${SECRET}${CR}`, `${SECRET}${NUL}`, `${SECRET} `, `${SECRET}${HIGH_SURROGATE}`, '']
        .map((input) => expectBreach(input))
        .map((error) => error.message),
    );
    expect(messages.size).toBe(1);
  });

  it('nothing derived from the input reaches the error', () => {
    const input = `${SECRET}${chr(0x01)} mail a@b.ch`;
    const error = expectBreach(input);

    expect(error.name).toBe('RedactionPreconditionBreachError');
    expect(error.cause).toBeUndefined();
    const rendered = [error.message, String(error), JSON.stringify(error)].join('\n');
    for (const fragment of ['Muster', '756', 'a@b.ch', 'mail', String(input.length)]) {
      expect(rendered.includes(fragment)).toBe(false);
    }
    // The stack's frames carry line numbers, so only its header is compared.
    expect(error.stack?.split('\n')[0]).toBe(`RedactionPreconditionBreachError: ${error.message}`);
    // `name` is the only own enumerable property: no input, length, predicate or cause field.
    expect(Object.keys(error)).toEqual(['name']);
  });

  it('the breach is thrown, never returned as a FAILED result', () => {
    let returned: unknown = 'not called';
    expect(() => {
      returned = applyRedactionRuleset(`a${CR}b`);
    }).toThrow(RedactionPreconditionBreachError);
    expect(returned).toBe('not called');
  });
});

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CLINICAL_TEXT_MAX_UTF8_BYTES, normaliseClinicalText } from './clinical-text-normalizer.js';
import { CryptoOperationError } from './crypto.errors.js';

/**
 * Characters that would be invisible or destructive in the source file are built from their
 * code points, so the fixtures below say exactly what they are.
 */
const chr = (code: number): string => String.fromCharCode(code);

const NUL = chr(0x00);
const TAB = chr(0x09);
const LF = chr(0x0a);
const VT = chr(0x0b);
const FF = chr(0x0c);
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
/** U+FB01 LATIN SMALL LIGATURE FI — `NFKC` folds it to `fi`; `NFC` must not. */
const LIGATURE_FI = chr(0xfb01);
/** U+00B2 SUPERSCRIPT TWO — `NFKC` folds it to `2`; `NFC` must not. */
const SUPERSCRIPT_TWO = chr(0x00b2);

const utf8 = (value: string): number => Buffer.byteLength(value, 'utf8');

describe('normaliseClinicalText — step 1, valid Unicode', () => {
  it('given ordinary well formed BMP text then it is accepted unchanged', () => {
    expect(normaliseClinicalText('Befund: unauffällig.')).toBe('Befund: unauffällig.');
  });

  it('given a well formed surrogate pair then it is accepted unchanged', () => {
    expect(normaliseClinicalText(`Status ${ASTRAL_PAIR} stabil`)).toBe(
      `Status ${ASTRAL_PAIR} stabil`,
    );
  });

  it.each([
    ['a lone high surrogate', HIGH_SURROGATE],
    ['a lone low surrogate', LOW_SURROGATE],
    ['a high surrogate followed by a BMP character', `${HIGH_SURROGATE}A`],
    ['a lone high surrogate at the very end', `A${HIGH_SURROGATE}`],
    ['a reversed surrogate sequence', `${LOW_SURROGATE}${HIGH_SURROGATE}`],
    ['two consecutive high surrogates', `${HIGH_SURROGATE}${HIGH_SURROGATE}`],
  ])('given %s then it is rejected', (_label, value) => {
    expect(() => normaliseClinicalText(value)).toThrow(CryptoOperationError);
    expect(() => normaliseClinicalText(value)).toThrow(/ILL_FORMED_UNICODE/);
  });

  it('given a lone surrogate then it is never silently repaired', () => {
    // `toWellFormed()` would produce U+FFFD here. Nothing is returned at all.
    expect(() => normaliseClinicalText(`A${HIGH_SURROGATE}B`)).toThrow(CryptoOperationError);
  });
});

describe('normaliseClinicalText — step 2, line endings', () => {
  it('given one CRLF then it becomes exactly one LF', () => {
    expect(normaliseClinicalText(`a${CR}${LF}b`)).toBe(`a${LF}b`);
  });

  it('given a lone CR then it becomes LF', () => {
    expect(normaliseClinicalText(`a${CR}b`)).toBe(`a${LF}b`);
  });

  it('given an existing LF then it is preserved', () => {
    expect(normaliseClinicalText(`a${LF}b`)).toBe(`a${LF}b`);
  });

  it('given mixed CRLF, lone CR and LF then every terminator becomes one LF', () => {
    expect(normaliseClinicalText(`a${CR}${LF}b${CR}c${LF}d`)).toBe(`a${LF}b${LF}c${LF}d`);
  });

  it('given two consecutive CRLF then it becomes two LF and not four', () => {
    expect(normaliseClinicalText(`a${CR}${LF}${CR}${LF}b`)).toBe(`a${LF}${LF}b`);
  });

  it('given LF followed by CR then it becomes two LF', () => {
    expect(normaliseClinicalText(`a${LF}${CR}b`)).toBe(`a${LF}${LF}b`);
  });

  it('given any CR bearing document then the canonical output contains no CR at all', () => {
    const output = normaliseClinicalText(`Zeile 1${CR}${LF}Zeile 2${CR}Zeile 3`);

    expect(output.includes(CR)).toBe(false);
  });
});

describe('normaliseClinicalText — steps 3 and 4, control characters', () => {
  it('given U+0000 then it is rejected under its own separate rule', () => {
    expect(() => normaliseClinicalText(`a${NUL}b`)).toThrow(/NUL/);
  });

  it.each([
    ['U+0001', chr(0x01)],
    ['U+0008', chr(0x08)],
    ['U+000B', VT],
    ['U+000C', FF],
    ['U+000E', chr(0x0e)],
    ['U+001F', chr(0x1f)],
    ['U+0080', chr(0x80)],
    ['U+009F', chr(0x9f)],
  ])('given %s then it is rejected as a control character', (_label, value) => {
    expect(() => normaliseClinicalText(`a${value}b`)).toThrow(CryptoOperationError);
    expect(() => normaliseClinicalText(`a${value}b`)).toThrow(/CONTROL_CHARACTER/);
  });

  it('given an internal TAB then it is allowed', () => {
    expect(normaliseClinicalText(`Wert${TAB}Einheit`)).toBe(`Wert${TAB}Einheit`);
  });

  it('given an internal LF then it is allowed', () => {
    expect(normaliseClinicalText(`Zeile 1${LF}Zeile 2`)).toBe(`Zeile 1${LF}Zeile 2`);
  });

  it('given U+007F DEL then the C0/C1 rule alone does not reject it', () => {
    expect(normaliseClinicalText(`a${DEL}b`)).toBe(`a${DEL}b`);
  });

  it('given a CR that step 2 already replaced then no control rejection follows', () => {
    expect(normaliseClinicalText(`a${CR}b`)).toBe(`a${LF}b`);
  });
});

describe('normaliseClinicalText — step 5, byte order mark', () => {
  it('given one leading U+FEFF then exactly that one is removed', () => {
    expect(normaliseClinicalText(`${BOM}Befund`)).toBe('Befund');
  });

  it('given two leading U+FEFF then the second one survives', () => {
    expect(normaliseClinicalText(`${BOM}${BOM}Befund`)).toBe(`${BOM}Befund`);
  });

  it('given a trailing U+FEFF then it survives', () => {
    expect(normaliseClinicalText(`Befund${BOM}`)).toBe(`Befund${BOM}`);
  });

  it('given an inner U+FEFF then it survives', () => {
    expect(normaliseClinicalText(`Be${BOM}fund`)).toBe(`Be${BOM}fund`);
  });
});

describe('normaliseClinicalText — step 7, outer Unicode White_Space trim', () => {
  it('given leading and trailing ASCII spaces then they are removed', () => {
    expect(normaliseClinicalText('   Befund   ')).toBe('Befund');
  });

  it('given leading and trailing U+3000 then the non ASCII White_Space is removed', () => {
    expect(normaliseClinicalText(`${IDEOGRAPHIC_SPACE}Befund${IDEOGRAPHIC_SPACE}`)).toBe('Befund');
  });

  it('given leading and trailing TAB then the whole document boundary is trimmed', () => {
    expect(normaliseClinicalText(`${TAB}Befund${TAB}`)).toBe('Befund');
  });

  it('given leading and trailing LF then the whole document boundary is trimmed', () => {
    expect(normaliseClinicalText(`${LF}${LF}Befund${LF}${LF}`)).toBe('Befund');
  });

  it('given a trailing CRLF then the LF it became is trimmed away', () => {
    expect(normaliseClinicalText(`Befund${CR}${LF}`)).toBe('Befund');
  });

  it('given inner spaces then they are preserved exactly', () => {
    expect(normaliseClinicalText('  Diagnose:    Verdacht  ')).toBe('Diagnose:    Verdacht');
  });

  it('given an inner TAB then it is preserved', () => {
    expect(normaliseClinicalText(` Wert${TAB}${TAB}Einheit `)).toBe(`Wert${TAB}${TAB}Einheit`);
  });

  it('given inner LF then they are preserved', () => {
    expect(normaliseClinicalText(` a${LF}b `)).toBe(`a${LF}b`);
  });

  it('given repeated inner blank lines then the clinical formatting is preserved', () => {
    const body = `Anamnese${LF}${LF}${LF}Befund${LF}${LF}Therapie`;

    expect(normaliseClinicalText(`${LF}  ${body}  ${LF}`)).toBe(body);
  });

  it('given a trailing U+FEFF then the trim keeps it, which ECMAScript trim() would not', () => {
    const raw = `  Befund${BOM}  `;

    // The guard rail for OD-P5-I3C-1: ECMAScript `WhiteSpace` includes U+FEFF, so `.trim()`
    // returns `Befund`. Unicode `White_Space` does not, so the mark stays part of the document.
    expect(raw.trim()).toBe('Befund');
    expect(normaliseClinicalText(raw)).toBe(`Befund${BOM}`);
    expect(normaliseClinicalText(raw)).not.toBe('Befund');
  });

  it('given a leading U+FEFF followed by another one then only the BOM step removes any', () => {
    expect(normaliseClinicalText(`${BOM}${BOM} Befund `)).toBe(`${BOM} Befund`);
  });
});

describe('normaliseClinicalText — step 6, NFC', () => {
  it('given decomposed and composed spellings then both produce the same output', () => {
    const decomposed = `There${COMBINING_ACUTE}sa`;
    const composed = `Ther${COMPOSED_E_ACUTE}sa`;

    expect(normaliseClinicalText(decomposed)).toBe(normaliseClinicalText(composed));
    expect(normaliseClinicalText(decomposed)).toBe(composed);
  });

  it('given an NFKC only equivalence then the characters stay distinct', () => {
    expect(normaliseClinicalText(LIGATURE_FI)).toBe(LIGATURE_FI);
    expect(normaliseClinicalText(LIGATURE_FI)).not.toBe('fi');
    expect(normaliseClinicalText(SUPERSCRIPT_TWO)).toBe(SUPERSCRIPT_TWO);
    expect(normaliseClinicalText(SUPERSCRIPT_TWO)).not.toBe('2');
  });

  it('given mixed case then the case is preserved', () => {
    expect(normaliseClinicalText('Patient MRT LWS')).toBe('Patient MRT LWS');
  });

  it('given punctuation and separators then they are preserved', () => {
    expect(normaliseClinicalText('Dr. med. Meier-Schmid; 12,5 mg/d (p.o.)')).toBe(
      'Dr. med. Meier-Schmid; 12,5 mg/d (p.o.)',
    );
  });
});

describe('normaliseClinicalText — step 8, empty', () => {
  it('given the empty string then it is rejected', () => {
    expect(() => normaliseClinicalText('')).toThrow(/EMPTY/);
  });

  it('given whitespace only then it is rejected after the trim', () => {
    expect(() => normaliseClinicalText(`  ${TAB}${LF}${IDEOGRAPHIC_SPACE} `)).toThrow(/EMPTY/);
  });

  it('given a BOM followed only by White_Space then it is rejected', () => {
    expect(() => normaliseClinicalText(`${BOM}   `)).toThrow(/EMPTY/);
  });

  it('given CRLF only then it is rejected', () => {
    expect(() => normaliseClinicalText(`${CR}${LF}`)).toThrow(/EMPTY/);
  });
});

describe('normaliseClinicalText — step 9, the 256 KiB ceiling', () => {
  it('exposes the ratified maximum', () => {
    expect(CLINICAL_TEXT_MAX_UTF8_BYTES).toBe(262144);
  });

  it('given exactly 262144 UTF-8 bytes then it is accepted', () => {
    const raw = 'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES);

    expect(utf8(raw)).toBe(262144);
    expect(normaliseClinicalText(raw)).toHaveLength(262144);
  });

  it('given 262145 UTF-8 bytes then it is rejected', () => {
    const raw = 'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES + 1);

    expect(utf8(raw)).toBe(262145);
    expect(() => normaliseClinicalText(raw)).toThrow(/TOO_LONG/);
  });

  it('given a multibyte character straddling the ceiling then bytes decide, not code units', () => {
    const accepted = `${'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES - 3)}${EURO_SIGN}`;
    const rejected = `${'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES - 2)}${EURO_SIGN}`;

    expect(utf8(accepted)).toBe(262144);
    expect(accepted.length).toBeLessThan(262144);
    expect(normaliseClinicalText(accepted)).toBe(accepted);

    expect(utf8(rejected)).toBe(262145);
    expect(rejected.length).toBeLessThan(262144);
    expect(() => normaliseClinicalText(rejected)).toThrow(/TOO_LONG/);
  });

  it('given a decomposed body then NFC shrinks it before the ceiling is evaluated', () => {
    const raw = `${'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES - 2)}e${COMBINING_ACUTE}`;

    expect(utf8(raw)).toBe(262145);
    expect(utf8(raw.normalize('NFC'))).toBe(262144);
    expect(normaliseClinicalText(raw)).toBe(raw.normalize('NFC'));
  });

  it('given trailing White_Space then the trim can bring the final value under the ceiling', () => {
    const body = 'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES);
    const raw = `   ${body}${LF}${TAB}  `;

    expect(utf8(raw)).toBeGreaterThan(CLINICAL_TEXT_MAX_UTF8_BYTES);
    expect(normaliseClinicalText(raw)).toBe(body);
  });

  it('given an oversized document then it is refused and never truncated', () => {
    const raw = 'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES + 4096);

    expect(() => normaliseClinicalText(raw)).toThrow(CryptoOperationError);
    // Nothing shorter is returned in its place.
    expect(() => normaliseClinicalText(raw)).toThrow(/TOO_LONG/);
  });
});

describe('normaliseClinicalText — rejection messages disclose nothing', () => {
  const secret = 'Meier Hans 1970-04-02 Verdacht auf Karzinom';

  it.each([
    ['a lone surrogate', `${secret}${HIGH_SURROGATE}`],
    ['a NUL', `${secret}${NUL}`],
    ['a control character', `${secret}${VT}`],
    ['an oversized body', `${secret}${'a'.repeat(CLINICAL_TEXT_MAX_UTF8_BYTES)}`],
  ])('given %s then no fragment of the document reaches the message', (_label, value) => {
    let caught: unknown;
    try {
      normaliseClinicalText(value);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CryptoOperationError);
    const rendered = (caught as Error).message;

    expect(rendered).not.toContain('Meier');
    expect(rendered).not.toContain('Karzinom');
    expect(rendered).not.toContain('1970');
    expect(rendered).not.toContain(HIGH_SURROGATE);
    expect(rendered).not.toContain('aaaa');
    // Nor a byte count, an offset or any other number derived from the rejected content.
    expect(rendered).not.toMatch(/\d/);
  });

  it('given a rejection then the error carries no cause holding the input', () => {
    let caught: unknown;
    try {
      normaliseClinicalText('');
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).cause).toBeUndefined();
  });
});

describe('clinical-text-normalizer.ts — implementation boundaries', () => {
  /**
   * The EXECUTABLE source, with comments removed.
   *
   * The prose of the module names the operations it deliberately refuses, so the assertions
   * below have to read the code rather than the documentation of the code.
   */
  const code = readFileSync(new URL('./clinical-text-normalizer.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('never calls ECMAScript trim(), which would strip a trailing U+FEFF', () => {
    expect(code).not.toMatch(/\.trim\(/);
    expect(code).not.toMatch(/\.trimStart\(|\.trimEnd\(/);
  });

  it('never repairs ill formed input', () => {
    expect(code).not.toContain('toWellFormed');
  });

  it('never applies a compatibility normalisation or a case fold', () => {
    expect(code).toContain("normalize('NFC')");
    expect(code).not.toContain('NFKC');
    expect(code).not.toContain('NFKD');
    expect(code).not.toMatch(/toUpperCase|toLowerCase|toLocaleUpperCase|toLocaleLowerCase/);
  });

  it('never truncates', () => {
    expect(code).not.toMatch(/\.slice\(0,|\.substring\(|\.substr\(/);
  });

  it('reuses the canonical surrogate predicate instead of duplicating it', () => {
    expect(code).toContain("from './manual-v1-identifier-normalizer.js'");
    expect(code).toContain('isWellFormedUnicode');
    expect(code).not.toMatch(/0xd800/i);
  });

  it('logs nothing', () => {
    expect(code).not.toMatch(/console\.|Logger/);
  });
});

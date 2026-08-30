import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CryptoOperationError } from './crypto.errors.js';
import { canonicaliseJson, type JsonValue } from './json-canonicalizer.js';

/**
 * PROVENANCE OF EVERY GOLDEN VALUE IN THIS FILE
 *
 * The literals below are transcribed from the RFC Editor edition of RFC 8785 (JSON
 * Canonicalization Scheme), retrieved read-only from
 * `https://www.rfc-editor.org/rfc/rfc8785.txt`. That retrieval is the evidence-acquisition path
 * D-077 `RULING C` authorises explicitly, and it authorises NOTHING ELSE: no package was
 * installed, no external JCS runtime is imported, and no library was copied into the source.
 *
 * ANTI-TAUTOLOGY (D-077 `RULING C`; `08` §12.11). Not one expected value here was produced by
 * `canonicaliseJson`. The canonical output strings are the RFC's own published outputs, and the
 * number serialisations are the RFC's own Appendix B table. Using the implementation under test
 * as its own oracle is PROHIBITED, and these vectors are what make that unnecessary.
 */

/**
 * A single REVERSE SOLIDUS, `U+005C`.
 *
 * The RFC's sample data is full of two-character escape sequences, and the vectors below have
 * to contain them as TEXT rather than as their meaning. Composing them from this constant keeps
 * the file free of raw control characters and of escape sequences a reader could mistake for
 * the character they denote.
 */
const BS = String.fromCharCode(0x5c);

/** One UTF-16 code unit as a string, so no raw control character is written into this file. */
function unit(codeUnit: number): string {
  return String.fromCharCode(codeUnit);
}

/**
 * RFC 8785 §3.2.3, the worked canonicalisation sample — INPUT, transcribed.
 *
 * The RFC's sample object has three members: `numbers`, holding the five values
 * `333333333.33333329`, `1E30`, `4.50`, `2e-3` and `0.000000000000000000000000001`; `string`,
 * holding a value written with the escapes `u20ac`, `u000F`, `u000a`, `u0042`, `u0022` and
 * `u005c` alongside a literal doubled reverse solidus, an escaped quote and an escaped solidus;
 * and `literals`, holding `null`, `true` and `false`.
 *
 * This is JSON TEXT, so those escapes are sequences of CHARACTERS in the document rather than
 * the characters they denote — which is exactly what forces the canonicaliser to prove its own
 * escaping, sorting and number rules rather than merely echoing its input.
 */
const RFC_8785_SAMPLE_INPUT = [
  '{',
  '  "numbers": [333333333.33333329, 1E30, 4.50,',
  '              2e-3, 0.000000000000000000000000001],',
  `  "string": "${BS}u20ac$${BS}u000F${BS}u000aA'${BS}u0042${BS}u0022${BS}u005c${BS}${BS}${BS}"${BS}/",`,
  '  "literals": [null, true, false]',
  '}',
].join('\n');

/**
 * RFC 8785 §3.2.3, the worked canonicalisation sample — EXPECTED CANONICAL OUTPUT, transcribed.
 *
 * Three things the RFC's published result proves at once: `literals` sorts before `numbers`
 * before `string`; every number has collapsed to its ECMAScript form; and the string keeps the
 * euro sign as a literal character while `U+000F` becomes a lowercase four-digit escape and the
 * line feed becomes the short escape.
 */
const RFC_8785_SAMPLE_OUTPUT =
  '{"literals":[null,true,false],' +
  '"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
  `"string":"€$${BS}u000f${BS}nA'B${BS}"${BS}${BS}${BS}${BS}${BS}"/"}`;

/**
 * RFC 8785 §3.2.4, the same result as the UTF-8 octets the RFC publishes.
 *
 * This is the §3.2.4 boundary stated as BYTES rather than as characters, and it is a genuinely
 * independent check on the previous constant: a wrong escape or a wrong character changes these
 * octets even where a string comparison might be read past.
 */
const RFC_8785_SAMPLE_OUTPUT_UTF8_HEX =
  '7b226c69746572616c73223a5b6e756c6c2c7472' +
  '75652c66616c73655d2c226e756d62657273223a' +
  '5b3333333333333333332e333333333333332c31' +
  '652b33302c342e352c302e3030322c31652d3237' +
  '5d2c22737472696e67223a22e282ac245c753030' +
  '30665c6e4127425c225c5c5c5c5c222f227d';

/**
 * RFC 8785 Appendix B, "Number Serialization Samples" — the IEEE-754 bit pattern and the exact
 * string a conforming implementation must emit for it.
 */
const RFC_8785_NUMBER_SAMPLES: ReadonlyArray<readonly [string, string, string]> = [
  ['0000000000000000', '0', 'zero'],
  ['8000000000000000', '0', 'minus zero'],
  ['0000000000000001', '5e-324', 'min positive number'],
  ['8000000000000001', '-5e-324', 'min negative number'],
  ['7fefffffffffffff', '1.7976931348623157e+308', 'max positive number'],
  ['ffefffffffffffff', '-1.7976931348623157e+308', 'max negative number'],
  ['4340000000000000', '9007199254740992', 'max positive integer'],
  ['c340000000000000', '-9007199254740992', 'max negative integer'],
  ['4430000000000000', '295147905179352830000', 'about 2**68'],
  ['44b52d02c7e14af5', '9.999999999999997e+22', 'just below the 1e+23 boundary'],
  ['44b52d02c7e14af6', '1e+23', 'the 1e+23 boundary'],
  ['3eb0c6f7a0b5ed8d', '0.000001', 'the smallest non exponential fraction'],
  ['41b3de4355555555', '333333333.3333333', 'the sample value from the sorting example'],
];

/** The `double` an Appendix B bit pattern names. Node builds it; the canonicaliser does not. */
function doubleFromIeee754Hex(hex: string): number {
  const view = new DataView(new ArrayBuffer(8));

  view.setBigUint64(0, BigInt(`0x${hex}`));

  return view.getFloat64(0);
}

/** A lone high surrogate — the RFC §3.2.2.2 invalid-Unicode case in its high-half form. */
const LONE_HIGH_SURROGATE = unit(0xd83d);
/** A lone low surrogate: the RFC names `U+DEAD` itself as its example. */
const LONE_LOW_SURROGATE = unit(0xdead);

describe('canonicaliseJson — RFC 8785 published vectors', () => {
  it('given the RFC sorting sample then it reproduces the published canonical output exactly', () => {
    const parsed = JSON.parse(RFC_8785_SAMPLE_INPUT) as JsonValue;

    expect(canonicaliseJson(parsed)).toBe(RFC_8785_SAMPLE_OUTPUT);
  });

  it('given the RFC sorting sample then its UTF-8 octets are the published ones', () => {
    const parsed = JSON.parse(RFC_8785_SAMPLE_INPUT) as JsonValue;

    // §3.2.4 — the canonical text is encoded as UTF-8, and THAT is what a digest consumes.
    expect(Buffer.from(canonicaliseJson(parsed), 'utf8').toString('hex')).toBe(
      RFC_8785_SAMPLE_OUTPUT_UTF8_HEX,
    );
  });

  it.each(RFC_8785_NUMBER_SAMPLES)(
    'given the appendix B sample %s (%s — %s) then it serialises to the published string',
    (hex, expected) => {
      expect(canonicaliseJson(doubleFromIeee754Hex(hex))).toBe(expected);
    },
  );
});

describe('canonicaliseJson — object property sorting (§3.2.3)', () => {
  it('sorts properties by UTF-16 code unit, not by insertion order', () => {
    expect(canonicaliseJson({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts a prefix before the longer name that extends it', () => {
    // `code` and `codingSystem` share `cod`; the shorter name wins on the first differing unit.
    expect(canonicaliseJson({ codingSystem: 'ICD-10', code: 'I10' })).toBe(
      '{"code":"I10","codingSystem":"ICD-10"}',
    );
    expect(canonicaliseJson({ ab: 1, a: 2 })).toBe('{"a":2,"ab":1}');
  });

  it('sorts by CODE UNIT rather than by code point', () => {
    // The decisive case. `U+1F600` is the surrogate pair `D83D DE00`; `U+FFFD` is the single
    // unit `FFFD`. By CODE POINT `U+1F600` (0x1F600) is the greater and would sort LAST. By
    // CODE UNIT its first unit `0xD83D` is less than `0xFFFD`, so it sorts FIRST — and that is
    // the ordering RFC 8785 §3.2.3 specifies.
    const supplementary = String.fromCodePoint(0x1f600);
    const replacement = unit(0xfffd);

    const canonical = canonicaliseJson({ [replacement]: 1, [supplementary]: 2 });

    expect(canonical).toBe(`{"${supplementary}":2,"${replacement}":1}`);
    expect(canonical.indexOf(supplementary)).toBeLessThan(canonical.indexOf(replacement));
  });

  it('sorts uppercase before lowercase, because that is what code units say', () => {
    // A locale-aware comparison would very likely interleave these; a code unit comparison
    // cannot, because every uppercase letter is below every lowercase one.
    expect(canonicaliseJson({ a: 1, B: 2 })).toBe('{"B":2,"a":1}');
  });

  it('sorts recursively, at every depth', () => {
    expect(canonicaliseJson({ outer: { b: 1, a: { d: 1, c: 2 } } })).toBe(
      '{"outer":{"a":{"c":2,"d":1},"b":1}}',
    );
  });
});

describe('canonicaliseJson — arrays (§3.2.3)', () => {
  it('never reorders array elements', () => {
    expect(canonicaliseJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicaliseJson(['b', 'a'])).toBe('["b","a"]');
  });

  it('sorts the properties of objects nested INSIDE an array while keeping element order', () => {
    // The §3.2.3 scan: arrays are searched for objects, those objects are sorted, and the array
    // itself is left alone.
    expect(
      canonicaliseJson([
        { b: 1, a: 2 },
        { d: 3, c: 4 },
      ]),
    ).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });

  it('sorts objects nested in arrays nested in objects', () => {
    expect(canonicaliseJson({ z: [{ b: [{ y: 1, x: 2 }], a: 1 }] })).toBe(
      '{"z":[{"a":1,"b":[{"x":2,"y":1}]}]}',
    );
  });

  it('given an empty array or object then it emits the empty literal', () => {
    expect(canonicaliseJson([])).toBe('[]');
    expect(canonicaliseJson({})).toBe('{}');
  });
});

describe('canonicaliseJson — string escaping (§3.2.2.2)', () => {
  it('uses the short escape for each of the seven characters that have one', () => {
    expect(canonicaliseJson('"')).toBe(`"${BS}""`);
    expect(canonicaliseJson(BS)).toBe(`"${BS}${BS}"`);
    expect(canonicaliseJson(unit(0x08))).toBe(`"${BS}b"`);
    expect(canonicaliseJson(unit(0x09))).toBe(`"${BS}t"`);
    expect(canonicaliseJson(unit(0x0a))).toBe(`"${BS}n"`);
    expect(canonicaliseJson(unit(0x0c))).toBe(`"${BS}f"`);
    expect(canonicaliseJson(unit(0x0d))).toBe(`"${BS}r"`);
  });

  it('escapes a C0 control without a short form as lowercase four digit hex', () => {
    expect(canonicaliseJson(unit(0x0f))).toBe(`"${BS}u000f"`);
    expect(canonicaliseJson(unit(0x00))).toBe(`"${BS}u0000"`);
    expect(canonicaliseJson(unit(0x01))).toBe(`"${BS}u0001"`);
    expect(canonicaliseJson(unit(0x1f))).toBe(`"${BS}u001f"`);
  });

  it('does NOT escape the solidus, `U+007F`, or any non ASCII character', () => {
    expect(canonicaliseJson('/')).toBe('"/"');
    expect(canonicaliseJson(unit(0x7f))).toBe(`"${unit(0x7f)}"`);
    expect(canonicaliseJson('€')).toBe('"€"');
    expect(canonicaliseJson('ärztlich')).toBe('"ärztlich"');
    expect(canonicaliseJson(String.fromCodePoint(0x1f600))).toBe(
      `"${String.fromCodePoint(0x1f600)}"`,
    );
  });

  it('escapes property names by the same rules as values', () => {
    expect(canonicaliseJson({ 'a"b': 1 })).toBe(`{"a${BS}"b":1}`);
    expect(canonicaliseJson({ [unit(0x0f)]: 1 })).toBe(`{"${BS}u000f":1}`);
  });
});

describe('canonicaliseJson — literals, and no emitted whitespace', () => {
  it('emits the three JSON literals unquoted', () => {
    expect(canonicaliseJson(null)).toBe('null');
    expect(canonicaliseJson(true)).toBe('true');
    expect(canonicaliseJson(false)).toBe('false');
  });

  it('emits no insignificant whitespace anywhere', () => {
    const canonical = canonicaliseJson({ b: [1, 2], a: { c: 3 } });

    expect(canonical).toBe('{"a":{"c":3},"b":[1,2]}');
    expect(canonical).not.toMatch(/[ \t\n\r]/);
  });
});

describe('canonicaliseJson — Unicode is never normalised', () => {
  it('given the composed and decomposed spellings of one character then they stay different', () => {
    // `e`-acute as `U+00E9` versus `e` + `U+0301`. `NFC` would merge them into one canonical
    // form and therefore into one digest; RFC 8785 performs NO normalisation, so they must stay
    // apart.
    const composed = unit(0x00e9);
    const decomposed = `e${unit(0x0301)}`;

    expect(canonicaliseJson(composed)).not.toBe(canonicaliseJson(decomposed));
    expect(canonicaliseJson(composed)).toBe(`"${composed}"`);
    expect(canonicaliseJson(decomposed)).toBe(`"${decomposed}"`);
  });

  it('does not case fold', () => {
    expect(canonicaliseJson('Strasse')).toBe('"Strasse"');
    expect(canonicaliseJson('ABC')).not.toBe(canonicaliseJson('abc'));
  });
});

describe('canonicaliseJson — ill formed Unicode terminates the operation (§3.2.2.2)', () => {
  // The mandatory negative conformance case (D-077 `RULING C`). A lone surrogate MUST make the
  // operation fail; it must NOT be silently accepted merely because `JSON.stringify` can render
  // it as an escape.
  it.each([
    ['a lone high surrogate', LONE_HIGH_SURROGATE],
    ['a lone low surrogate', LONE_LOW_SURROGATE],
    ['a high surrogate followed by a BMP character', `${LONE_HIGH_SURROGATE}A`],
    ['a lone high surrogate at the very end', `A${LONE_HIGH_SURROGATE}`],
    ['a reversed surrogate sequence', `${LONE_LOW_SURROGATE}${LONE_HIGH_SURROGATE}`],
  ])('given %s in a value then it throws', (_label, value) => {
    expect(() => canonicaliseJson(value)).toThrow(CryptoOperationError);
    expect(() => canonicaliseJson(value)).toThrow(/ILL_FORMED_UNICODE/);
  });

  it('given a lone surrogate in a PROPERTY NAME then it throws', () => {
    expect(() => canonicaliseJson({ [LONE_HIGH_SURROGATE]: 1 })).toThrow(CryptoOperationError);
  });

  it('given a lone surrogate nested deep inside then it still throws', () => {
    expect(() => canonicaliseJson({ a: [{ b: LONE_HIGH_SURROGATE }] })).toThrow(
      CryptoOperationError,
    );
  });

  it('is never silently repaired into the replacement character', () => {
    // The failure mode this rules out: emitting `U+FFFD` and hashing a document the caller
    // never supplied.
    let canonical: string | undefined;

    try {
      canonical = canonicaliseJson(`A${LONE_HIGH_SURROGATE}B`);
    } catch {
      canonical = undefined;
    }

    expect(canonical).toBeUndefined();
  });

  it('given a WELL FORMED surrogate pair then it is accepted unchanged', () => {
    // The rejection is of ill formed data only — valid supplementary characters pass through.
    expect(canonicaliseJson(`${LONE_HIGH_SURROGATE}${unit(0xde00)}`)).toBe(
      `"${String.fromCodePoint(0x1f600)}"`,
    );
  });
});

describe('canonicaliseJson — non I-JSON input is refused (§3.1)', () => {
  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('given %s then it throws rather than emitting `null`', (_label, value) => {
    expect(() => canonicaliseJson(value)).toThrow(CryptoOperationError);
    expect(() => canonicaliseJson(value)).toThrow(/NON_FINITE_NUMBER/);
  });

  it('given `undefined` as a property value then it throws rather than dropping the key', () => {
    // `JSON.stringify({a: undefined})` yields `{}` — a key silently vanishing from hash
    // material is exactly the class of failure this primitive exists to prevent.
    expect(() => canonicaliseJson({ a: undefined } as unknown as JsonValue)).toThrow(
      /UNSUPPORTED_VALUE/,
    );
  });

  it('given a hole in a sparse array then it throws rather than inventing `null`', () => {
    // Built by assignment rather than as a literal, so index 1 is a genuine HOLE.
    const sparse: unknown[] = [1];
    sparse[2] = 3;

    expect(sparse).toHaveLength(3);
    expect(1 in sparse).toBe(false);
    expect(() => canonicaliseJson(sparse as JsonValue)).toThrow(/UNSUPPORTED_VALUE/);
  });

  it.each([
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['a class instance', new (class Thing {})()],
  ])('given %s then it throws rather than calling `toJSON` or enumerating it', (_label, value) => {
    expect(() => canonicaliseJson(value as unknown as JsonValue)).toThrow(/UNSUPPORTED_VALUE/);
  });

  it('given a symbol keyed property then it throws rather than ignoring it', () => {
    const withSymbol: Record<string | symbol, unknown> = { a: 1 };
    withSymbol[Symbol('hidden')] = 2;

    expect(() => canonicaliseJson(withSymbol as JsonValue)).toThrow(/UNSUPPORTED_VALUE/);
  });

  it.each([
    ['a function', () => 1],
    ['a bigint', 1n],
    ['a symbol', Symbol('s')],
  ])('given %s then it throws', (_label, value) => {
    expect(() => canonicaliseJson(value as unknown as JsonValue)).toThrow(/UNSUPPORTED_VALUE/);
  });

  it('given a null-prototype object then it is accepted, because it is still plain data', () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { b: 1, a: 2 });

    expect(canonicaliseJson(bare as JsonValue)).toBe('{"a":2,"b":1}');
  });
});

describe('canonicaliseJson — determinism', () => {
  it('given two spellings of one document then it produces one canonical form', () => {
    const first = JSON.parse('{"b":[1,{"y":1,"x":2}],"a":null}') as JsonValue;
    const second = JSON.parse('{ "a" : null , "b" : [ 1 , { "x" : 2 , "y" : 1 } ] }') as JsonValue;

    expect(canonicaliseJson(first)).toBe(canonicaliseJson(second));
    expect(canonicaliseJson(first)).toBe('{"a":null,"b":[1,{"x":2,"y":1}]}');
  });

  it('is stable across repeated calls and idempotent under re-parsing', () => {
    const value = JSON.parse(RFC_8785_SAMPLE_INPUT) as JsonValue;
    const once = canonicaliseJson(value);

    expect(canonicaliseJson(value)).toBe(once);
    // Canonical output is itself valid JSON that parses back to the same document.
    expect(canonicaliseJson(JSON.parse(once) as JsonValue)).toBe(once);
  });
});

describe('canonicaliseJson — it is a LOCAL full implementation (`08` §12.11 obligation 2)', () => {
  /**
   * The obligation is structural, so the assertions read the SOURCE rather than the prose that
   * describes it — the same technique the `sha256-utf8` regression spec uses.
   */
  const source = readFileSync(new URL('./json-canonicalizer.ts', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('imports no canonicalisation package — every import is workspace-local', () => {
    const specifiers = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] as string);

    expect(specifiers.length).toBeGreaterThan(0);

    for (const specifier of specifiers) {
      expect(specifier.startsWith('./')).toBe(true);
    }
  });

  it('is not `JSON.stringify` with sorted keys', () => {
    expect(code).not.toContain('JSON.stringify');
    expect(code).not.toContain('JSON.parse');
  });

  it('does not normalise, case fold, or sort by locale', () => {
    expect(code).not.toContain('normalize(');
    expect(code).not.toContain('localeCompare');
    expect(code).not.toMatch(/toUpperCase|toLowerCase/);
    expect(code).not.toContain('Intl.');
  });

  it('does not hash — composition with the digest helper stays at the call site', () => {
    expect(code).not.toContain('createHash');
    expect(code).not.toContain('sha256HexUtf8');
  });

  it('no JCS or canonicalisation package is declared as a dependency', () => {
    // Obligation 2, stated where it is actually enforceable: the manifests.
    // `NEW_RUNTIME_DEPENDENCY_REQUIRED = NO` (D-077 `RULING F`).
    // The workspace root manifest, then this package's own.
    const manifests = ['../../../../package.json', '../../package.json'].map(
      (relative) =>
        JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        },
    );

    for (const manifest of manifests) {
      const declared = Object.keys({
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
      });

      expect(declared.length).toBeGreaterThan(0);

      for (const name of declared) {
        expect(name.toLowerCase()).not.toMatch(/jcs|canonicaliz|canonicalis|json-canonical/);
      }
    }
  });
});

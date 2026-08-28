import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  PSEUDONYM_BODY_ALPHABET,
  PSEUDONYM_BODY_LENGTH,
  PSEUDONYM_LENGTH,
  PSEUDONYM_PREFIX,
  canonicalisePseudonymUppercase,
  generatePseudonym,
} from './pseudonym.js';

/** A randomness seam that always answers with the same fixed bytes. */
const fixedBytes = (...values: number[]): ((size: number) => Buffer) => {
  return (size: number): Buffer => Buffer.from(values.slice(0, size));
};

describe('the pseudonym format constants', () => {
  it('fixes the prefix, the body length and the total length', () => {
    expect(PSEUDONYM_PREFIX).toBe('P-');
    expect(PSEUDONYM_BODY_LENGTH).toBe(10);
    expect(PSEUDONYM_LENGTH).toBe(12);
  });

  it('fixes the Crockford Base32 alphabet at exactly 32 symbols', () => {
    expect(PSEUDONYM_BODY_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    expect(PSEUDONYM_BODY_ALPHABET).toHaveLength(32);
    expect(new Set(PSEUDONYM_BODY_ALPHABET).size).toBe(32);
  });

  it.each([['I'], ['L'], ['O'], ['U']])(
    'excludes the confusable symbol %s from the alphabet',
    (symbol) => {
      expect(PSEUDONYM_BODY_ALPHABET).not.toContain(symbol);
    },
  );
});

describe('generatePseudonym — format', () => {
  it('given the production randomness then the prefix is exactly `P-`', () => {
    expect(generatePseudonym().startsWith(PSEUDONYM_PREFIX)).toBe(true);
  });

  it('given the production randomness then the body is exactly ten symbols', () => {
    expect(generatePseudonym().slice(PSEUDONYM_PREFIX.length)).toHaveLength(PSEUDONYM_BODY_LENGTH);
  });

  it('given the production randomness then the total length is exactly twelve', () => {
    expect(generatePseudonym()).toHaveLength(PSEUDONYM_LENGTH);
  });

  it('given many draws then every body symbol comes from the Crockford alphabet', () => {
    for (let draw = 0; draw < 500; draw += 1) {
      expect(generatePseudonym()).toMatch(/^P-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    }
  });

  it('given many draws then I, L, O and U are never produced', () => {
    for (let draw = 0; draw < 500; draw += 1) {
      expect(generatePseudonym().slice(PSEUDONYM_PREFIX.length)).not.toMatch(/[ILOU]/);
    }
  });
});

describe('generatePseudonym — the randomness seam', () => {
  it('given ten zero bytes then the result is the known all zero pseudonym', () => {
    expect(generatePseudonym(fixedBytes(0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('P-0000000000');
  });

  it('given ascending bytes then each one indexes the alphabet at its position', () => {
    expect(generatePseudonym(fixedBytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9))).toBe('P-0123456789');
    expect(generatePseudonym(fixedBytes(10, 11, 12, 13, 14, 15, 16, 17, 18, 19))).toBe(
      'P-ABCDEFGHJK',
    );
    expect(generatePseudonym(fixedBytes(20, 21, 22, 23, 24, 25, 26, 27, 28, 29))).toBe(
      'P-MNPQRSTVWX',
    );
  });

  it('given the two highest indexes then the tail of the alphabet is reachable', () => {
    expect(generatePseudonym(fixedBytes(30, 31, 30, 31, 30, 31, 30, 31, 30, 31))).toBe(
      'P-YZYZYZYZYZ',
    );
  });

  it('given bytes above 31 then only the low five bits select the symbol', () => {
    // 0x20 wraps to index 0, 0xff to index 31, and 0x9f to index 31 as well.
    expect(generatePseudonym(fixedBytes(0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0, 0, 0))).toBe(
      'P-0000000000',
    );
    expect(
      generatePseudonym(fixedBytes(0xff, 0x9f, 0x3f, 0x5f, 0x7f, 0xbf, 0xdf, 31, 31, 31)),
    ).toBe('P-ZZZZZZZZZZ');
    // The whole alphabet is still reachable from the high half of the byte range.
    expect(
      generatePseudonym(fixedBytes(0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9)),
    ).toBe('P-0123456789');
  });

  it('given one generated pseudonym then randomness is requested exactly once', () => {
    const seam = vi.fn(fixedBytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9));

    generatePseudonym(seam);

    expect(seam).toHaveBeenCalledTimes(1);
  });

  it('given one generated pseudonym then exactly ten bytes are requested', () => {
    const seam = vi.fn(fixedBytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9));

    generatePseudonym(seam);

    expect(seam).toHaveBeenCalledWith(PSEUDONYM_BODY_LENGTH);
  });

  it('given successive calls then each one consumes fresh randomness', () => {
    const draws = [
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      Buffer.from([31, 31, 31, 31, 31, 31, 31, 31, 31, 31]),
    ];
    let call = 0;
    const seam = vi.fn((): Buffer => {
      const draw = draws[call];
      call += 1;
      return draw ?? Buffer.alloc(PSEUDONYM_BODY_LENGTH);
    });

    expect(generatePseudonym(seam)).toBe('P-0000000000');
    expect(generatePseudonym(seam)).toBe('P-ZZZZZZZZZZ');
    expect(seam).toHaveBeenCalledTimes(2);
  });

  it('given the default seam then it is the Node CSPRNG', () => {
    // The default parameter is `randomBytes` itself, so a production call and a call with the
    // CSPRNG passed explicitly are the same code path.
    const explicit = generatePseudonym(randomBytes);

    expect(explicit).toMatch(/^P-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    // Two CSPRNG draws do not repeat.
    expect(generatePseudonym()).not.toBe(generatePseudonym());
  });
});

describe('canonicalisePseudonymUppercase — OD-P5-I3C-2, ASCII only', () => {
  it('given a lowercase ASCII pseudonym then it becomes uppercase', () => {
    expect(canonicalisePseudonymUppercase('p-k7m2qx4tb9')).toBe('P-K7M2QX4TB9');
  });

  it('given mixed ASCII case then it becomes uppercase', () => {
    expect(canonicalisePseudonymUppercase('P-k7M2qX4tB9')).toBe('P-K7M2QX4TB9');
  });

  it('given an already uppercase pseudonym then it is unchanged and idempotent', () => {
    const once = canonicalisePseudonymUppercase('P-K7M2QX4TB9');

    expect(once).toBe('P-K7M2QX4TB9');
    expect(canonicalisePseudonymUppercase(once)).toBe(once);
  });

  it('given surrounding whitespace then it is NOT trimmed', () => {
    expect(canonicalisePseudonymUppercase('  p-k7m2qx4tb9  ')).toBe('  P-K7M2QX4TB9  ');
    expect(canonicalisePseudonymUppercase('\tp-a\n')).toBe('\tP-A\n');
  });

  it('given U+017F LATIN SMALL LETTER LONG S then it is unchanged', () => {
    const longS = String.fromCharCode(0x017f);

    expect(canonicalisePseudonymUppercase(longS)).toBe(longS);
    expect(canonicalisePseudonymUppercase(longS)).not.toBe(longS.toUpperCase());
  });

  it('given U+0131 LATIN SMALL LETTER DOTLESS I then it is unchanged', () => {
    const dotlessI = String.fromCharCode(0x0131);

    expect(canonicalisePseudonymUppercase(dotlessI)).toBe(dotlessI);
    expect(canonicalisePseudonymUppercase(dotlessI)).not.toBe(dotlessI.toUpperCase());
  });

  it('given the fi ligature then it is not expanded', () => {
    const ligature = String.fromCharCode(0xfb01);

    expect(canonicalisePseudonymUppercase(ligature)).toBe(ligature);
    expect(canonicalisePseudonymUppercase(ligature)).not.toBe('FI');
  });

  it.each([
    ['a German umlaut', 'ä'],
    ['a Greek letter', 'α'],
    ['a Cyrillic letter', 'д'],
    ['an astral character', String.fromCodePoint(0x1f600)],
    ['digits and punctuation', '0-9_.'],
    ['the empty string', ''],
  ])('given %s then every character is unchanged', (_label, value) => {
    expect(canonicalisePseudonymUppercase(value)).toBe(value);
  });

  it('given a decomposed sequence then no Unicode normalisation happens', () => {
    // An already uppercase base, so that the ASCII mapping itself changes nothing here.
    const decomposed = `E${String.fromCharCode(0x0301)}`;

    expect(canonicalisePseudonymUppercase(decomposed)).toBe(decomposed);
    expect(canonicalisePseudonymUppercase(decomposed)).not.toBe(decomposed.normalize('NFC'));
  });

  it('validates nothing — it accepts a string that is not a pseudonym at all', () => {
    expect(canonicalisePseudonymUppercase('not a pseudonym')).toBe('NOT A PSEUDONYM');
  });
});

describe('pseudonym.ts — implementation boundaries', () => {
  /**
   * The EXECUTABLE source, with comments removed.
   *
   * The module documents the derivations it refuses to perform, so the assertions below have to
   * read the code rather than the documentation of the code.
   */
  const code = readFileSync(new URL('./pseudonym.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('draws from no weak randomness source', () => {
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('Date');
    expect(code).not.toContain('hrtime');
    expect(code).not.toContain('randomUUID');
  });

  it('derives the pseudonym from nothing — no digest and no keyed digest', () => {
    expect(code).not.toContain('createHash');
    expect(code).not.toContain('createHmac');
    expect(code).not.toContain('sha256');
    expect(code).not.toContain('normaliseManualV1ExternalIdentifier');
  });

  it('uses the Node CSPRNG', () => {
    expect(code).toContain("from 'node:crypto'");
    expect(code).toContain('randomBytes');
  });

  it('never uses a Unicode or locale uppercasing', () => {
    expect(code).not.toContain('toUpperCase');
    expect(code).not.toContain('toLocaleUpperCase');
    expect(code).not.toContain('normalize(');
  });

  it('touches no database and no ORM', () => {
    expect(code).not.toMatch(/prisma/i);
    expect(code).not.toContain('TenantDatabaseService');
    expect(code).not.toMatch(/\bSELECT\b|\bINSERT\b/);
  });

  it('contains no collision retry loop and claims no uniqueness', () => {
    expect(code).not.toMatch(/while\s*\(/);
    expect(code).not.toMatch(/do\s*\{/);
    expect(code).not.toMatch(/retry/i);
    expect(code).not.toMatch(/unique/i);
  });

  it('ships no syntax validator', () => {
    expect(code).not.toMatch(/[Vv]alidate/);
    expect(code).not.toMatch(/function\s+is\w*Pseudonym/);
  });
});

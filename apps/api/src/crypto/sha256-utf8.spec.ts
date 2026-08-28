import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { normaliseClinicalText } from './clinical-text-normalizer.js';
import { sha256HexUtf8 } from './sha256-utf8.js';

/** U+0301 COMBINING ACUTE ACCENT. */
const COMBINING_ACUTE = String.fromCharCode(0x0301);
/** U+00E9, the composed form of `e` plus {@link COMBINING_ACUTE}. */
const COMPOSED_E_ACUTE = String.fromCharCode(0x00e9);

/** The published SHA-256 digest of the three ASCII bytes `abc` (FIPS 180-4, appendix B.1). */
const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
/** The published SHA-256 digest of the empty byte string. */
const SHA256_OF_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('sha256HexUtf8 — known answers', () => {
  it('given the reference vector `abc` then it returns the published digest', () => {
    expect(sha256HexUtf8('abc')).toBe(SHA256_OF_ABC);
  });

  it('given the empty string then it returns the published digest of no bytes', () => {
    expect(sha256HexUtf8('')).toBe(SHA256_OF_EMPTY);
  });

  it('given non ASCII text then it hashes exactly its UTF-8 bytes', () => {
    const value = 'ärztlicher Befund — 12,5 mg/d';
    // The independent construction: the bytes are produced first, then digested as bytes.
    const overBytes = createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');

    expect(sha256HexUtf8(value)).toBe(overBytes);
    // And it is genuinely UTF-8, not UTF-16 or Latin-1.
    expect(sha256HexUtf8(value)).not.toBe(
      createHash('sha256').update(Buffer.from(value, 'latin1')).digest('hex'),
    );
  });
});

describe('sha256HexUtf8 — output shape', () => {
  it.each([
    ['ASCII', 'abc'],
    ['the empty string', ''],
    ['non ASCII text', 'unauffällig'],
    ['an astral character', String.fromCodePoint(0x1f600)],
  ])('given %s then the digest is 64 lowercase hexadecimal characters', (_label, value) => {
    const digest = sha256HexUtf8(value);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toHaveLength(64);
    expect(digest).toBe(digest.toLowerCase());
  });
});

describe('sha256HexUtf8 — determinism', () => {
  it('given the same string twice then the digest is identical', () => {
    expect(sha256HexUtf8('Befund')).toBe(sha256HexUtf8('Befund'));
  });

  it('given different bytes then the digests differ', () => {
    expect(sha256HexUtf8('Befund')).not.toBe(sha256HexUtf8('Befunde'));
  });
});

describe('sha256HexUtf8 — it performs no hidden normalisation', () => {
  it('given NFC and NFD spellings of one word then the digests differ', () => {
    const composed = `Ther${COMPOSED_E_ACUTE}sa`;
    const decomposed = `There${COMBINING_ACUTE}sa`;

    expect(composed).not.toBe(decomposed);
    expect(sha256HexUtf8(composed)).not.toBe(sha256HexUtf8(decomposed));
  });

  it('given both spellings normalised first then the digests agree', () => {
    const composed = `Ther${COMPOSED_E_ACUTE}sa`;
    const decomposed = `There${COMBINING_ACUTE}sa`;

    // The composition the future clinical consumer performs, written out explicitly.
    expect(sha256HexUtf8(normaliseClinicalText(decomposed))).toBe(
      sha256HexUtf8(normaliseClinicalText(composed)),
    );
  });

  it('given leading whitespace then the direct digest changes', () => {
    expect(sha256HexUtf8('  Befund')).not.toBe(sha256HexUtf8('Befund'));
    // Whereas the normalising composition folds it away.
    expect(sha256HexUtf8(normaliseClinicalText('  Befund'))).toBe(
      sha256HexUtf8(normaliseClinicalText('Befund')),
    );
  });

  it('given a different case then the direct digest changes', () => {
    expect(sha256HexUtf8('befund')).not.toBe(sha256HexUtf8('Befund'));
  });

  it('given CRLF then the direct digest differs from the LF spelling', () => {
    expect(sha256HexUtf8('a\r\nb')).not.toBe(sha256HexUtf8('a\nb'));
  });
});

describe('sha256-utf8.ts — implementation boundaries', () => {
  /**
   * The EXECUTABLE source, with comments removed.
   *
   * The module documents the transformations it refuses to perform, so the assertions below
   * have to read the code rather than the documentation of the code.
   */
  const code = readFileSync(new URL('./sha256-utf8.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('normalises nothing', () => {
    expect(code).not.toContain('normalize(');
    expect(code).not.toContain('NFC');
    expect(code).not.toContain('normaliseClinicalText');
  });

  it('trims nothing, validates nothing and changes no case', () => {
    expect(code).not.toMatch(/\.trim\(|\.trimStart\(|\.trimEnd\(/);
    expect(code).not.toMatch(/toUpperCase|toLowerCase/);
    expect(code).not.toContain('isWellFormedUnicode');
    expect(code).not.toContain('toWellFormed');
  });

  it('is unkeyed and is not a canonicalising JSON hasher', () => {
    expect(code).not.toContain('createHmac');
    expect(code).not.toContain('JSON.stringify');
  });

  it('uses the Node digest primitive over UTF-8 bytes', () => {
    expect(code).toContain("from 'node:crypto'");
    expect(code).toContain("createHash('sha256')");
    expect(code).toContain("'utf8'");
  });
});

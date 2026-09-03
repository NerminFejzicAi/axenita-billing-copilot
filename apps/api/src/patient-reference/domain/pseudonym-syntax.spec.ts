/**
 * The additive v1 pseudonym syntax validator (`CO-P5-I3-I4-1`; `04` §7.5a.3).
 *
 * The LOOKUP behaviour it guards — canonicalise, validate, then plain tenant-scoped equality, with
 * another practice's pseudonym not found — is proven in
 * `patient-reference-lookup.service.spec.ts` and against a real database in
 * `test/phase5-patient-reference-create.security.ts`. This file proves the PREDICATE.
 */

import { describe, expect, it } from 'vitest';

import { canonicalisePseudonymUppercase, generatePseudonym } from '../../crypto/pseudonym.js';
import { isCanonicalPseudonym } from './pseudonym-syntax.js';

describe('isCanonicalPseudonym (CO-P5-I3-I4-1)', () => {
  it('accepts the canonical form: P- plus exactly ten Crockford Base32 characters', () => {
    expect(isCanonicalPseudonym('P-K7M2QX4TB9')).toBe(true);
    expect(isCanonicalPseudonym('P-0000000000')).toBe(true);
    expect(isCanonicalPseudonym('P-ZZZZZZZZZZ')).toBe(true);
  });

  it('accepts every candidate the accepted generator can draw', () => {
    // The validator and the generator must agree by construction, not by coincidence: both read
    // the SAME canonical alphabet, prefix and body length from `crypto/pseudonym.ts`, which this
    // slice consumes WITHOUT MUTATION.
    for (let draw = 0; draw < 200; draw += 1) {
      const candidate = generatePseudonym();

      expect([candidate, isCanonicalPseudonym(candidate)]).toEqual([candidate, true]);
    }
  });

  it.each([
    ['the four excluded Crockford letters — I', 'P-IIIIIIIIII'],
    ['the four excluded Crockford letters — L', 'P-LLLLLLLLLL'],
    ['the four excluded Crockford letters — O', 'P-OOOOOOOOOO'],
    ['the four excluded Crockford letters — U', 'P-UUUUUUUUUU'],
    ['lowercase body (not canonicalised)', 'P-k7m2qx4tb9'],
    ['nine body characters', 'P-K7M2QX4TB'],
    ['eleven body characters', 'P-K7M2QX4TB99'],
    ['no prefix', 'K7M2QX4TB9'],
    ['a different prefix', 'Q-K7M2QX4TB9'],
    ['a lowercase prefix', 'p-K7M2QX4TB9'],
    ['a hyphen inside the body', 'P-K7M2-X4TB9'],
    ['whitespace', 'P-K7M2QX4TB '],
    ['empty', ''],
    ['a UUID', '77777777-7777-4777-8777-777777770001'],
    ['a SQL fragment', "P-' or 1=1 --"],
  ])('refuses %s', (_name, candidate) => {
    expect(isCanonicalPseudonym(candidate)).toBe(false);
  });

  it('is reached AFTER the accepted uppercase canonicaliser, which is ASCII-only', () => {
    // Case insensitivity lives in the canonicaliser, so lowercase input is accepted only once it
    // has passed through it. The canonicaliser is ASCII-only by construction: `toUpperCase()`
    // would map `ı` onto `I` — a letter Crockford excludes — and a Turkish-locale uppercasing
    // would map `i` onto `İ`. Neither can happen here.
    expect(isCanonicalPseudonym(canonicalisePseudonymUppercase('p-k7m2qx4tb9'))).toBe(true);
    expect(isCanonicalPseudonym(canonicalisePseudonymUppercase('P-K7M2QX4TBı'))).toBe(false);
  });
});

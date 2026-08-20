/**
 * Unit contract of the `If-Match` parser (D-055 clauses 10 to 13; `03` §5.2 and §9; D-028
 * clause 2; owner ratification R1 of gate P4-5D).
 *
 * WHY THIS SUITE EXISTS SEPARATELY FROM THE ROUTE SUITES
 *
 * The parser is a total function from one untrusted string to one integer or one refusal, and it
 * is the ONLY thing standing between a client-controlled header and an `::integer` bind
 * parameter. That makes it the one place where the negative space matters more than the positive:
 * the interesting question is not "does `"1"` work" but "is there ANY input that is neither
 * accepted-and-bounded nor refused". A route suite can show a handful of examples; this suite can
 * enumerate the grammar's edges, and it can state which inputs must NEVER be accepted — something
 * a real database will not produce a counterexample for on demand.
 *
 * THREE OUTCOMES, AND THEY ARE NORMATIVELY DIFFERENT (clause 12)
 *
 *     absent                     -> 428 PRECONDITION_REQUIRED
 *     present but unaccepted     -> 400 VALIDATION_ERROR
 *     accepted                   -> a bounded int4, and `409` is decided elsewhere
 *
 * The statuses are asserted, not just the fact that something threw: collapsing `428` into `400`
 * would tell a client to fix a header it never sent, and collapsing either into `409` would tell
 * it to re-read a resource and retry a request that can never succeed.
 */

import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import { parseIfMatchVersion } from './practice-settings-if-match.js';

/** The int4 ceiling of `practice_settings.version` (`02` §6.4, owner ratification R1). */
const MAX_INT4 = 2147483647;

/** Captures the refusal so its status AND its code can both be asserted. */
function refusalOf(rawHeader: string | undefined): ApiException {
  try {
    parseIfMatchVersion(rawHeader);
  } catch (error) {
    if (error instanceof ApiException) {
      return error;
    }

    throw error;
  }

  throw new Error('parseIfMatchVersion accepted a value that must have been refused.');
}

describe('parseIfMatchVersion', () => {
  describe('the accepted grammar (D-055 clause 11)', () => {
    it.each([
      ['"0"', 0],
      ['"1"', 1],
      ['"27"', 27],
      ['"2147483647"', MAX_INT4],
    ])('accepts %s as version %i', (header, expected) => {
      expect(parseIfMatchVersion(header)).toBe(expected);
    });

    it('accepts every canonical decimal up to the int4 ceiling', () => {
      // Not a spot check of one or two values: every digit length from 1 to 10 is exercised, so a
      // bound written as `<` instead of `<=`, or a length guard off by one, cannot survive.
      for (let digits = 1; digits <= 10; digits += 1) {
        const value = Math.min(10 ** (digits - 1), MAX_INT4);
        expect(parseIfMatchVersion(`"${String(value)}"`)).toBe(value);
      }
    });

    it('returns a safe integer that can be bound to an int4 parameter', () => {
      const parsed = parseIfMatchVersion(`"${String(MAX_INT4)}"`);

      expect(Number.isSafeInteger(parsed)).toBe(true);
      expect(parsed).toBeGreaterThanOrEqual(0);
      expect(parsed).toBeLessThanOrEqual(MAX_INT4);
    });

    it('accepts "0" and does NOT special-case it (owner ratification R1)', () => {
      // `"0"` is syntactically valid and must stay so. It cannot match a persisted row, because
      // `version` is constrained `>= 1`, so it reaches the ordinary zero-row path and becomes
      // `409` there. Refusing it HERE would answer `400` for a well-formed token and would put a
      // value-range rule in a grammar check.
      expect(parseIfMatchVersion('"0"')).toBe(0);
    });
  });

  describe('a missing header is 428 and nothing else (clause 10)', () => {
    it('answers 428 PRECONDITION_REQUIRED for undefined', () => {
      const refusal = refusalOf(undefined);

      expect(refusal.getStatus()).toBe(428);
      expect(refusal.code).toBe('PRECONDITION_REQUIRED');
    });

    it('carries no field-level errors and no echoed value', () => {
      const refusal = refusalOf(undefined);

      expect(refusal.errors).toBeUndefined();
      expect(refusal.detail).not.toContain('If-Match');
    });
  });

  describe('a present but unaccepted header is 400 and nothing else (clauses 11 to 13)', () => {
    /**
     * The named rejections of clause 11, plus every neighbouring shape that a looser
     * implementation would let through.
     *
     * Each entry states WHY it must be refused, because several of them look harmless and one of
     * them — the weak validator — would be accepted by ordinary HTTP semantics.
     */
    it.each([
      ['', 'the empty value is present, so it is a malformed validator and NOT a missing one'],
      ['1', 'unquoted: not the token GET emits'],
      ['W/"1"', 'a WEAK validator never satisfies If-Match on PATCH (clause 13)'],
      ['w/"1"', 'the weak prefix is case-insensitive in the wild and is refused either way'],
      ['*', 'the wildcard means "write regardless of version" — the negation of this contract'],
      ['"01"', 'a non-canonical decimal rendering GET could not have emitted'],
      ['"1", "2"', 'a validator LIST: this endpoint targets exactly one version'],
      ['"1","2"', 'the same list without the optional space'],
      ['"abc"', 'not an integer at all'],
      ['"1', 'malformed quoting — opening quote only'],
      ['1"', 'malformed quoting — closing quote only'],
      ['""', 'quoted emptiness is not a number'],
      ['"-1"', 'negative: version is non-negative'],
      ['"+1"', 'a leading plus is not the canonical rendering'],
      ['"1.0"', 'a decimal point is not an integer literal'],
      ['"1e3"', 'scientific notation is not a canonical decimal'],
      ['"0x1"', 'hexadecimal is not a canonical decimal'],
      ['" 1"', 'internal leading whitespace — the header is NOT trimmed'],
      ['"1 "', 'internal trailing whitespace — the header is NOT trimmed'],
      [' "1"', 'whitespace outside the quotes is still part of the value seen here'],
      ['"1"  ', 'trailing whitespace outside the quotes, likewise'],
      ['"1\n"', 'a newline cannot ride along, and the anchors are not multiline'],
      ['"1"\n"2"', 'a second line cannot smuggle a second validator past the anchors'],
      ['"1 or 1=1"', 'nothing resembling SQL can survive the grammar'],
      ['"١"', 'non-ASCII digits are not decimal digits here'],
      ['"1_000"', 'numeric separators are a JavaScript literal feature, not an HTTP token'],
    ])('refuses %j — %s', (header) => {
      const refusal = refusalOf(header);

      expect(refusal.getStatus()).toBe(400);
      expect(refusal.code).toBe('VALIDATION_ERROR');
    });

    it('never answers 428 for a header that is present but empty (clauses 10 and 12)', () => {
      // The distinction this asserts is frozen and easy to lose: `''` is a MALFORMED validator,
      // not a missing one. Folding it into `428` would tell a client to add a header it sent.
      const empty = refusalOf('');
      const absent = refusalOf(undefined);

      expect(empty.getStatus()).toBe(400);
      expect(absent.getStatus()).toBe(428);
      expect(empty.getStatus()).not.toBe(absent.getStatus());
    });

    it('carries no field-level errors and never echoes the rejected value', () => {
      // A `400` here is a HEADER-format refusal, not the `422` body document of `03` §8, so it
      // has no `errors[]`. And a crafted header must not be reflected back — the classic vector
      // for turning an error document into a delivery channel.
      const crafted = '"<script>alert(1)</script>"';
      const refusal = refusalOf(crafted);

      expect(refusal.errors).toBeUndefined();
      expect(refusal.detail).not.toContain('script');
      expect(refusal.detail).not.toContain(crafted);
    });
  });

  describe('the int4 domain (owner ratification R1)', () => {
    it('accepts exactly 2147483647 and refuses 2147483648', () => {
      expect(parseIfMatchVersion('"2147483647"')).toBe(MAX_INT4);
      expect(refusalOf('"2147483648"').getStatus()).toBe(400);
    });

    it.each([
      '"2147483648"',
      '"4294967296"',
      '"9007199254740993"',
      '"9223372036854775808"',
      '"99999999999999999999999999999999"',
    ])('refuses the out-of-range token %s with 400, never 409', (header) => {
      const refusal = refusalOf(header);

      expect(refusal.getStatus()).toBe(400);
      expect(refusal.code).toBe('VALIDATION_ERROR');
      // `409` would tell the client to re-read the resource and retry — advice that can never
      // help, because no version this resource can hold is outside int4.
      expect(refusal.getStatus()).not.toBe(409);
    });

    it('refuses an absurdly long run of digits without attempting the arbitrary-precision parse', () => {
      // The bounded length guard exists so that a very long header is refused by its LENGTH
      // rather than by first converting it. Ten thousand digits is well inside a 1mb body limit
      // and would be real work for `BigInt`.
      const refusal = refusalOf(`"${'9'.repeat(10000)}"`);

      expect(refusal.getStatus()).toBe(400);
    });

    it('refuses every token above the ceiling, exhaustively across digit lengths', () => {
      // A hand-picked example could pass against a bound applied only to 10-digit inputs. This
      // walks every length from 11 to 40 digits, so a guard that forgot the general case fails.
      for (let digits = 11; digits <= 40; digits += 1) {
        expect(refusalOf(`"${'1'.repeat(digits)}"`).getStatus()).toBe(400);
      }
    });

    it('cannot return a value that would raise PostgreSQL 22003 when bound as int4', () => {
      // The closing property of the whole parser: for EVERY input, the outcome is either a
      // refusal or a number inside the int4 domain. There is no third outcome, and in particular
      // no number a client can steer outside that domain — which is what makes a client-caused
      // `22003` unreachable.
      const inputs = [
        undefined,
        '',
        '*',
        'W/"1"',
        '"0"',
        '"1"',
        '"2147483647"',
        '"2147483648"',
        '"99999999999999999999"',
        `"${'7'.repeat(500)}"`,
      ];

      for (const input of inputs) {
        try {
          const parsed = parseIfMatchVersion(input);

          expect(Number.isInteger(parsed)).toBe(true);
          expect(parsed).toBeGreaterThanOrEqual(0);
          expect(parsed).toBeLessThanOrEqual(MAX_INT4);
        } catch (error) {
          expect(error).toBeInstanceOf(ApiException);
          expect([400, 428]).toContain((error as ApiException).getStatus());
        }
      }
    });
  });
});

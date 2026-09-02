/**
 * `08` §12.12 obligation 1 — the `Idempotency-Key` domain (D-079 `OD-P5-I4C-2`).
 *
 *     absent / empty / whitespace-only  ->  400 IDEMPOTENCY_KEY_REQUIRED
 *     1 .. 255 UTF-8 bytes of printable ASCII VCHAR 0x21..0x7E
 *     present but outside that domain   ->  400 VALIDATION_ERROR
 *
 * The ORDER property — that an unaccepted key never derives a lock key, never creates a claim and
 * never touches `idempotency_keys` — is a property of the create service and is proven there,
 * against the recording session, by the ABSENCE of every statement from the log. This file proves
 * the DOMAIN and the two codes.
 */

import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import {
  IDEMPOTENCY_KEY_MAX_BYTE,
  IDEMPOTENCY_KEY_MAX_UTF8_BYTES,
  IDEMPOTENCY_KEY_MIN_BYTE,
  validateIdempotencyKey,
} from './idempotency-key.js';

/** The exception thrown for one input, proven to be the repository's one error shape. */
function refusalOf(raw: string | undefined): ApiException {
  let thrown: unknown;

  try {
    validateIdempotencyKey(raw);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(ApiException);

  return thrown as ApiException;
}

describe('validateIdempotencyKey (OD-P5-I4C-2, 08 §12.12 obligation 1)', () => {
  describe('absent, empty and whitespace-only — 400 IDEMPOTENCY_KEY_REQUIRED', () => {
    it.each([
      ['absent', undefined],
      ['empty', ''],
      ['one space', ' '],
      ['tabs and spaces', ' \t '],
      ['newline', '\n'],
      ['non-breaking space', String.fromCharCode(0xa0)],
    ])('refuses %s', (_name, raw) => {
      const refusal = refusalOf(raw);

      expect(refusal.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(refusal.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      // `428 PRECONDITION_REQUIRED` stays reserved for a missing `If-Match` (D-028) and must not
      // appear on this path.
      expect(refusal.getStatus()).not.toBe(HttpStatus.PRECONDITION_REQUIRED);
    });
  });

  describe('present but outside the domain — 400 VALIDATION_ERROR', () => {
    it.each([
      ['an embedded space', 'p5i4c key'],
      ['a leading space', ' p5i4c'],
      ['a trailing space', 'p5i4c '],
      ['a tab', 'p5i4c\tkey'],
      ['a newline', 'p5i4c\nkey'],
      ['a carriage return', 'p5i4c\rkey'],
      ['a NUL', 'p5i4c' + String.fromCharCode(0x00) + 'key'],
      ['a DEL control (0x7f)', 'p5i4c' + String.fromCharCode(0x7f) + 'key'],
      ['a C1 control', 'p5i4c' + String.fromCharCode(0x85) + 'key'],
      ['a Latin-1 letter', 'p5i4c-kéy'],
      ['a CJK character', 'p5i4c-中'],
      ['an emoji', 'p5i4c-\u{1F600}'],
      ['256 ASCII characters', 'a'.repeat(256)],
    ])('refuses %s', (_name, raw) => {
      const refusal = refusalOf(raw);

      expect(refusal.code).toBe('VALIDATION_ERROR');
      expect(refusal.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('refuses a 256-BYTE key that is only 128 characters long', () => {
      // Two-byte code points: 128 characters, 256 UTF-8 bytes. It is refused on the character
      // class in any case, which is the point — the byte rule and the VCHAR rule agree that no
      // non-ASCII key is acceptable, so `varchar(255)` can never be overflowed.
      const refusal = refusalOf('é'.repeat(128));

      expect(refusal.code).toBe('VALIDATION_ERROR');
      expect(Buffer.from('é'.repeat(128), 'utf8').length).toBe(256);
    });
  });

  describe('the accepted domain', () => {
    it('accepts every printable ASCII VCHAR, one at a time', () => {
      for (let byte = IDEMPOTENCY_KEY_MIN_BYTE; byte <= IDEMPOTENCY_KEY_MAX_BYTE; byte += 1) {
        const key = String.fromCharCode(byte);

        expect([key, validateIdempotencyKey(key)]).toEqual([key, key]);
      }
    });

    it('accepts exactly 255 bytes and refuses 256', () => {
      const atLimit = 'a'.repeat(IDEMPOTENCY_KEY_MAX_UTF8_BYTES);

      // 255 ASCII bytes are 255 characters, which is exactly the width of
      // `idempotency_keys.idempotency_key`, so no schema change is required.
      expect(validateIdempotencyKey(atLimit)).toBe(atLimit);
      expect(refusalOf(`${atLimit}a`).code).toBe('VALIDATION_ERROR');
    });

    it('returns the key UNCHANGED — never trimmed, normalised, lowercased or truncated', () => {
      // An opaque client token. Repairing one would let two different requests share a scope.
      expect(validateIdempotencyKey('P5I4C-Key_1.~+:@!')).toBe('P5I4C-Key_1.~+:@!');
      expect(validateIdempotencyKey('AbC')).toBe('AbC');
    });
  });

  describe('non-reflection (D-062 part D)', () => {
    it('never places the submitted key in the response document', () => {
      const key = 'super-secret-client-token-\u{1F600}';
      const refusal = refusalOf(key);
      const rendered = JSON.stringify({
        detail: refusal.detail,
        errors: refusal.errors,
        message: refusal.message,
      });

      expect(rendered).not.toContain('super-secret-client-token');
      expect(rendered).not.toContain('\u{1F600}');
    });

    it('answers every rejected key with the SAME static document', () => {
      // One body for "too long", one body for "contains a space", one body for "not ASCII": a
      // caller cannot use the refusal to discover which rule a crafted value tripped.
      const bodies = [
        refusalOf('a'.repeat(300)),
        refusalOf('has a space'),
        refusalOf('é'),
        refusalOf('tab\there'),
      ].map((refusal) => ({
        code: refusal.code,
        status: refusal.getStatus(),
        detail: refusal.detail,
        errors: refusal.errors,
      }));

      expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
      // A header refusal carries no field-level list, exactly like the malformed-identifier
      // refusal of `P5-I4A`.
      expect(bodies[0]?.errors).toBeUndefined();
    });

    it('keeps the two codes distinct — absence is not the same fault as a bad value', () => {
      expect(refusalOf(undefined).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(refusalOf('   ').code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(refusalOf('a b').code).toBe('VALIDATION_ERROR');
    });
  });
});

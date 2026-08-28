import type * as NodeCrypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { CryptoConfigurationError } from './crypto.errors.js';
import { type EncryptionKeyProvider } from './encryption.port.js';
import { type HmacKeyProvider } from './external-reference.port.js';
import { KeySeparationGuard } from './key-separation.guard.js';

/**
 * Records every call the guard makes to `timingSafeEqual`, while still performing the real
 * comparison.
 *
 * D-070 requires a CONSTANT-TIME comparison of DECODED BYTES. A recording wrapper is the only
 * way to assert both halves of that at once: that the constant-time primitive is the one
 * actually used — a `Buffer.equals` or a `===` on the configured strings would return early and
 * leak how many leading bytes two secrets share — and that its operands are raw key buffers
 * rather than Base64 configuration values.
 */
const { timingSafeEqualCalls } = vi.hoisted(() => ({
  timingSafeEqualCalls: [] as Array<readonly [Buffer, Buffer]>,
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();

  return {
    ...actual,
    timingSafeEqual: (left: NodeJS.ArrayBufferView, right: NodeJS.ArrayBufferView): boolean => {
      timingSafeEqualCalls.push([
        Buffer.from(left.buffer, left.byteOffset, left.byteLength),
        Buffer.from(right.buffer, right.byteOffset, right.byteLength),
      ]);

      return actual.timingSafeEqual(left, right);
    },
  };
});

/**
 * Provider doubles that hand over RAW 32-BYTE BUFFERS.
 *
 * That is the whole point of testing the guard at this level. D-070 requires the comparison to
 * be made on DECODED KEY MATERIAL, not on configuration strings, and stubbing the providers is
 * what lets these tests assert exactly that: the bytes below are never Base64 anything.
 */
function encryptionProviderFor(key: Buffer): EncryptionKeyProvider {
  return {
    keyRef: 'test-double',
    keyVersion: 1,
    currentKey: (): Buffer => key,
    keyForVersion: (): Buffer => key,
  };
}

function hmacProviderFor(key: Buffer): HmacKeyProvider {
  return { currentKey: (): Buffer => key };
}

const ENCRYPTION_KEY = Buffer.from('axenita-unit-fixture-enc-key--32', 'utf8');
const HMAC_KEY = Buffer.from('axenita-unit-fixture-hmac-key-32', 'utf8');

function buildGuard(encryptionKey: Buffer, hmacKey: Buffer): KeySeparationGuard {
  return new KeySeparationGuard(encryptionProviderFor(encryptionKey), hmacProviderFor(hmacKey));
}

describe('KeySeparationGuard', () => {
  it('given two different 32-byte keys then the guard is built and startup continues', () => {
    expect(ENCRYPTION_KEY).toHaveLength(32);
    expect(HMAC_KEY).toHaveLength(32);

    expect(buildGuard(ENCRYPTION_KEY, HMAC_KEY)).toBeInstanceOf(KeySeparationGuard);
  });

  it('given two keys differing in a single byte then the guard still allows startup', () => {
    const almost = Buffer.from(ENCRYPTION_KEY);
    almost[31] = (almost[31] ?? 0) ^ 0x01;

    expect(buildGuard(ENCRYPTION_KEY, almost)).toBeInstanceOf(KeySeparationGuard);
  });

  it('given equal 32-byte key material then startup is refused', () => {
    expect(() => buildGuard(ENCRYPTION_KEY, Buffer.from(ENCRYPTION_KEY))).toThrow(
      CryptoConfigurationError,
    );
  });

  it('given equal key material then the refusal names the rule and no key byte', () => {
    let thrown: unknown;
    try {
      buildGuard(ENCRYPTION_KEY, Buffer.from(ENCRYPTION_KEY));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoConfigurationError);
    const error = thrown as Error;
    const serialised = `${error.message}${error.stack ?? ''}`;

    expect(error.message).toBe(
      'The HMAC key and the encryption key must not be the same key material (D-070).',
    );
    expect(serialised).not.toContain(ENCRYPTION_KEY.toString('utf8'));
    expect(serialised).not.toContain(ENCRYPTION_KEY.toString('base64'));
    expect(serialised).not.toContain(ENCRYPTION_KEY.toString('hex'));
    expect(error.cause).toBeUndefined();
  });

  it('given the guard when built then it holds no reference to either key', () => {
    const guard = buildGuard(ENCRYPTION_KEY, HMAC_KEY);

    // Both buffers are constructor locals. Nothing survives on the instance, so nothing can be
    // read back out of the container or serialised into a log line.
    expect(Object.keys(guard)).toStrictEqual([]);
    expect(JSON.stringify(guard)).toBe('{}');

    const inspected = Object.values(guard as unknown as Record<string, unknown>);
    expect(inspected).toStrictEqual([]);
  });

  it('given key material that is not 32 bytes then the guard refuses instead of throwing RangeError', () => {
    // `timingSafeEqual` raises a `RangeError` describing the operands on a length mismatch.
    // The guard checks the lengths first so that a future provider handing over a differently
    // sized buffer produces a static refusal instead.
    expect(() => buildGuard(ENCRYPTION_KEY, Buffer.alloc(16))).toThrow(CryptoConfigurationError);
    expect(() => buildGuard(Buffer.alloc(31), HMAC_KEY)).toThrow(
      'The key separation guard requires both keys to be exactly 32 bytes (D-070).',
    );
  });

  it('given the comparison then it uses the constant-time primitive on the DECODED key bytes', () => {
    timingSafeEqualCalls.length = 0;

    buildGuard(ENCRYPTION_KEY, HMAC_KEY);

    expect(timingSafeEqualCalls).toHaveLength(1);
    const [left, right] = timingSafeEqualCalls[0] ?? [];

    expect(left).toStrictEqual(ENCRYPTION_KEY);
    expect(right).toStrictEqual(HMAC_KEY);
    // The operands are 32 raw bytes, never a 44 character Base64 configuration string.
    expect(left).toHaveLength(32);
    expect(right).toHaveLength(32);
  });

  it('given a length mismatch then the constant-time primitive is never reached', () => {
    timingSafeEqualCalls.length = 0;

    expect(() => buildGuard(ENCRYPTION_KEY, Buffer.alloc(16))).toThrow(CryptoConfigurationError);
    expect(timingSafeEqualCalls).toHaveLength(0);
  });
});

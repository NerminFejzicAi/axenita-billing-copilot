import { type ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from '../config/app-config.service.js';
import { type EnvironmentVariables, validateEnvironment } from '../config/environment.schema.js';
import { CryptoConfigurationError, CryptoOperationError } from './crypto.errors.js';
import {
  LOCAL_STATIC_ENCRYPTION_KEY_REF,
  LocalStaticKeyProvider,
  PROHIBITED_DEVELOPMENT_ENCRYPTION_KEY_DIGEST,
} from './local-static-key.provider.js';

/**
 * Deterministic, clearly labelled NON-SECRET fixture key — `axenita-local-test-enc-key-32b!!`
 * in standard Base64. Not the prohibited all-zero fixture, not a production secret, and never
 * placed in `.env.example` (D-025 clauses 9 and 10).
 */
const FIXTURE_KEY_BASE64 = 'YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=';

/**
 * The 32 all-zero bytes of D-025 clause 10 — a PUBLIC, PROHIBITED fixture, not a secret. It
 * exists in this file for exactly one reason: to prove that startup refuses it.
 */
const PROHIBITED_ZERO_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function providerFor(overrides: Record<string, string> = {}): LocalStaticKeyProvider {
  const environment = validateEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://copilot_app:secret-password@db.internal:5432/copilot',
    REDIS_URL: 'redis://cache.internal:6379',
    OBJECT_STORAGE_ENDPOINT: 'http://storage.internal:9000',
    DEV_AUTH_JWT_SECRET: 'test_only_development_auth_secret_value_32+',
    ENCRYPTION_LOCAL_KEY: FIXTURE_KEY_BASE64,
    ENCRYPTION_KEY_VERSION: '1',
    // Mandatory since D-070 made `K_hmac` part of the runtime schema. This spec is about the
    // ENCRYPTION provider, so the value is only here to make the environment complete — it is a
    // deterministic NON-SECRET fixture and differs from the encryption fixture after decoding.
    HMAC_LOCAL_KEY: 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=',
    ...overrides,
  });

  const configService = {
    get: (key: keyof EnvironmentVariables) => environment[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return new LocalStaticKeyProvider(new AppConfigService(configService));
}

/**
 * An `AppConfigService` shaped stub that has NOT passed `validateEnvironment`.
 *
 * It exists so the provider's own guards can be exercised in isolation from the schema. A
 * future caller that builds the provider outside the validated configuration path must get the
 * same refusal, so the guards are not allowed to rely on the schema having run.
 */
function unvalidatedConfig(overrides: {
  readonly isProduction?: boolean;
  readonly encryptionLocalKey?: string;
  readonly encryptionKeyVersion?: number;
}): AppConfigService {
  return {
    isProduction: overrides.isProduction ?? false,
    encryptionLocalKey: overrides.encryptionLocalKey ?? FIXTURE_KEY_BASE64,
    encryptionKeyVersion: overrides.encryptionKeyVersion ?? 1,
  } as unknown as AppConfigService;
}

describe('LocalStaticKeyProvider', () => {
  it('given a valid non-production configuration when constructed then the provider comes up', () => {
    const provider = providerFor();

    expect(provider.keyRef).toBe(LOCAL_STATIC_ENCRYPTION_KEY_REF);
    expect(provider.keyVersion).toBe(1);
    expect(provider.currentKey()).toHaveLength(32);
  });

  it('given the configured key when read then it is exactly the decoded 32 bytes', () => {
    expect(providerFor().currentKey()).toStrictEqual(Buffer.from(FIXTURE_KEY_BASE64, 'base64'));
  });

  it('given the key reference when read then it is stable, non-secret and short enough to persist', () => {
    const provider = providerFor();

    // `encryption_key_ref` is `varchar(255)` (D-025 clause 3), and the reference must never be
    // derived from the key itself.
    expect(provider.keyRef.length).toBeGreaterThan(0);
    expect(provider.keyRef.length).toBeLessThanOrEqual(255);
    expect(provider.keyRef).not.toContain(FIXTURE_KEY_BASE64);
    expect(provider.keyRef).not.toContain(provider.currentKey().toString('utf8'));
    expect(provider.keyRef).toBe(providerFor().keyRef);
  });

  it('given a configured key version when read then it is the active generation', () => {
    expect(providerFor({ ENCRYPTION_KEY_VERSION: '7' }).keyVersion).toBe(7);
    expect(providerFor({ ENCRYPTION_KEY_VERSION: '7' }).keyForVersion(7)).toHaveLength(32);
  });

  it('given the active key version when requested then the active key is served', () => {
    const provider = providerFor();

    expect(provider.keyForVersion(provider.keyVersion)).toStrictEqual(provider.currentKey());
  });

  it.each([2, 99, 0, -1])(
    'given the unavailable key version %i when requested then it fails safely',
    (keyVersion) => {
      // The local provider knows ONE generation. Serving the current key for an envelope
      // written under another one would silently decrypt with the wrong key.
      const provider = providerFor();

      expect(() => provider.keyForVersion(keyVersion)).toThrow(CryptoOperationError);
    },
  );

  it('given NODE_ENV=production when constructed then the provider refuses (guard A)', () => {
    expect(() => providerFor({ NODE_ENV: 'production' })).toThrow(CryptoConfigurationError);
  });

  it('given the known all-zero development fixture when constructed then startup fails (guard C)', () => {
    expect(() => providerFor({ ENCRYPTION_LOCAL_KEY: PROHIBITED_ZERO_KEY_BASE64 })).toThrow(
      CryptoConfigurationError,
    );
  });

  it('given the pinned prohibited digest when compared then it is the SHA-256 of 32 zero bytes', () => {
    expect(PROHIBITED_DEVELOPMENT_ENCRYPTION_KEY_DIGEST).toBe(
      '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925',
    );
  });

  it('given a rejected key when the provider refuses then the failure names no material', () => {
    let thrown: unknown;
    try {
      providerFor({ ENCRYPTION_LOCAL_KEY: PROHIBITED_ZERO_KEY_BASE64 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoConfigurationError);
    const message = (thrown as Error).message;

    expect(message).not.toContain(PROHIBITED_ZERO_KEY_BASE64);
    expect(message).not.toContain(PROHIBITED_DEVELOPMENT_ENCRYPTION_KEY_DIGEST);
    expect(message).not.toContain('AAAA');
  });

  it('given the production refusal when raised then it names no configured value', () => {
    let thrown: unknown;
    try {
      providerFor({ NODE_ENV: 'production' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoConfigurationError);
    expect((thrown as Error).message).not.toContain(FIXTURE_KEY_BASE64);
  });

  it.each([
    ['a malformed Base64 value', 'not-base64'],
    ['a whitespace padded value', ` ${FIXTURE_KEY_BASE64} `],
    ['a 31 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw=='],
    ['an empty value', ''],
  ])(
    'given %s reaching the provider directly when constructed then it refuses (guard B)',
    (_label, key) => {
      // Bypasses `validateEnvironment` on purpose. The schema already rejects each of these,
      // and the provider rejects them again: this class is the thing that must never hold a
      // key it did not validate itself.
      expect(
        () => new LocalStaticKeyProvider(unvalidatedConfig({ encryptionLocalKey: key })),
      ).toThrow(CryptoConfigurationError);
    },
  );

  it.each([0, -1, 1.5, Number.NaN])(
    'given the unusable key version %p reaching the provider directly then it refuses (guard D)',
    (keyVersion) => {
      expect(
        () => new LocalStaticKeyProvider(unvalidatedConfig({ encryptionKeyVersion: keyVersion })),
      ).toThrow(CryptoConfigurationError);
    },
  );

  it('given the provider when described then nothing claims production readiness', () => {
    // D-OPEN-004a is still open: the production key provider, its access model, its rotation
    // cadence and its recovery procedure are all undecided (13 §3.1).
    const provider = providerFor();

    expect(provider.keyRef).toContain('development');
  });
});

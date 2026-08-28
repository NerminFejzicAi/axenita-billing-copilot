import { type DynamicModule, Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from '../config/app-config.service.js';
import { AesGcmEncryptionService } from './aes-gcm-encryption.service.js';
import { CryptoConfigurationError } from './crypto.errors.js';
import { CryptoModule } from './crypto.module.js';
import {
  ENCRYPTION_KEY_PROVIDER,
  ENCRYPTION_SERVICE,
  type EncryptionAad,
  type EncryptionService,
} from './encryption.port.js';
import { ExternalReferenceHmacService } from './external-reference-hmac.service.js';
import {
  EXTERNAL_REFERENCE_HMAC,
  EXTERNAL_REFERENCE_HMAC_TOKEN_PATTERN,
  HMAC_KEY_PROVIDER,
  type ExternalReferenceHmac,
  type ExternalReferenceIdentity,
} from './external-reference.port.js';

/** Deterministic NON-SECRET fixture: `axenita-local-test-enc-key-32b!!` in standard Base64. */
const FIXTURE_KEY_BASE64 = 'YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=';

/** Deterministic NON-SECRET fixture: `axenita-local-test-hmac-key-32b!` in standard Base64. */
const FIXTURE_HMAC_KEY_BASE64 = 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=';

/** The prohibited all-zero fixture of D-025 clause 10 — public, and never a secret. */
const PROHIBITED_ZERO_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

interface ConfigOverrides {
  readonly isProduction?: boolean;
  readonly encryptionLocalKey?: string;
  readonly encryptionKeyVersion?: number;
  readonly hmacLocalKey?: string;
}

/**
 * Stands in for the global `AppConfigModule` of the real application.
 *
 * `CryptoModule` does not import a configuration module of its own — in the running application
 * `AppConfigModule` is `@Global()` — so the test has to supply the same global binding.
 */
@Global()
@Module({})
class StubConfigModule {
  public static forRoot(overrides: ConfigOverrides): DynamicModule {
    const appConfig = {
      isProduction: overrides.isProduction ?? false,
      encryptionLocalKey: overrides.encryptionLocalKey ?? FIXTURE_KEY_BASE64,
      encryptionKeyVersion: overrides.encryptionKeyVersion ?? 1,
      hmacLocalKey: overrides.hmacLocalKey ?? FIXTURE_HMAC_KEY_BASE64,
    } as unknown as AppConfigService;

    return {
      module: StubConfigModule,
      providers: [{ provide: AppConfigService, useValue: appConfig }],
      exports: [AppConfigService],
    };
  }
}

const AAD: EncryptionAad = {
  practiceId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  table: 'patient_references',
  rowId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  column: 'display_name_ciphertext',
  envelopeVersion: 1,
};

const IDENTITY: ExternalReferenceIdentity = {
  domain: 'patient_external_ref',
  practiceId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  sourceSystem: 'MANUAL',
  value: 'PAT-000123',
};

describe('CryptoModule', () => {
  it('given a valid configuration when the module is built then ENCRYPTION_SERVICE resolves', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StubConfigModule.forRoot({}), CryptoModule],
    }).compile();

    const service = moduleRef.get<EncryptionService>(ENCRYPTION_SERVICE);

    expect(service).toBeInstanceOf(AesGcmEncryptionService);

    const plaintext = Buffer.from('round trip through the container', 'utf8');
    expect(service.decrypt(service.encrypt(plaintext, AAD), AAD)).toStrictEqual(plaintext);
  });

  it('given the resolved service when it encrypts then it uses the wired local key provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StubConfigModule.forRoot({ encryptionKeyVersion: 4 }), CryptoModule],
    }).compile();

    const envelope = moduleRef
      .get<EncryptionService>(ENCRYPTION_SERVICE)
      .encrypt(Buffer.from('x', 'utf8'), AAD);

    expect(envelope.keyRef).toBe('local-static-development-v1');
    expect(envelope.keyVersion).toBe(4);
  });

  it('given a valid configuration when the module is built then EXTERNAL_REFERENCE_HMAC resolves', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StubConfigModule.forRoot({}), CryptoModule],
    }).compile();

    const hmac = moduleRef.get<ExternalReferenceHmac>(EXTERNAL_REFERENCE_HMAC);

    expect(hmac).toBeInstanceOf(ExternalReferenceHmacService);
    expect(hmac.compute(IDENTITY)).toMatch(EXTERNAL_REFERENCE_HMAC_TOKEN_PATTERN);
  });

  it('given the wired HMAC key provider then the token depends on the configured key', async () => {
    const build = async (hmacLocalKey: string): Promise<string> => {
      const moduleRef = await Test.createTestingModule({
        imports: [StubConfigModule.forRoot({ hmacLocalKey }), CryptoModule],
      }).compile();

      return moduleRef.get<ExternalReferenceHmac>(EXTERNAL_REFERENCE_HMAC).compute(IDENTITY);
    };

    // `axenita-unit-fixture-hmac-key-32` in standard Base64 — a second NON-SECRET fixture.
    const other = 'YXhlbml0YS11bml0LWZpeHR1cmUtaG1hYy1rZXktMzI=';

    expect(await build(FIXTURE_HMAC_KEY_BASE64)).not.toBe(await build(other));
  });

  it('given the built module then no key provider is exported to consumers', async () => {
    // Raw key material stays inside `CryptoModule`. A business module that could inject a key
    // provider could read `K_enc` or `K_hmac`; it can encrypt and compute tokens instead.
    const moduleRef = await Test.createTestingModule({
      imports: [StubConfigModule.forRoot({}), CryptoModule],
    }).compile();

    expect(() => {
      moduleRef.get<unknown>(ENCRYPTION_KEY_PROVIDER, { strict: true });
    }).toThrow();
    expect(() => {
      moduleRef.get<unknown>(HMAC_KEY_PROVIDER, { strict: true });
    }).toThrow();
  });

  it.each([
    ['NODE_ENV=production', { isProduction: true }],
    ['the prohibited all-zero key', { encryptionLocalKey: PROHIBITED_ZERO_KEY_BASE64 }],
    ['a malformed key', { encryptionLocalKey: 'replace-me-with-a-32-byte-base64-key' }],
    ['a key version of zero', { encryptionKeyVersion: 0 }],
    ['a malformed HMAC key', { hmacLocalKey: 'replace-me-with-a-32-byte-base64-hmac-key' }],
    ['a missing HMAC key', { hmacLocalKey: '' }],
  ])(
    'given %s when the module is built then construction fails, which aborts startup',
    async (_label, overrides: ConfigOverrides) => {
      // This is the property D-025 clause 10 actually asks for. The providers' guards are
      // constructor guards, and `CryptoModule` is imported by the root module, so building the
      // container is what runs them: a misconfigured process cannot come up and then discover
      // the problem at its first encrypted write.
      await expect(
        Test.createTestingModule({
          imports: [StubConfigModule.forRoot(overrides), CryptoModule],
        }).compile(),
      ).rejects.toThrow(CryptoConfigurationError);
    },
  );

  it('given one key configured as both K_enc and K_hmac then building the module refuses (D-070)', async () => {
    // The canonical Base64 encoding of a byte sequence is UNIQUE, so configuring one key in
    // both variables is spelled with one string. That is exactly why the guard compares DECODED
    // BYTES: there is no second canonical spelling to manufacture, and the byte-level cases of
    // the guard's own spec cover the comparison itself.
    await expect(
      Test.createTestingModule({
        imports: [
          StubConfigModule.forRoot({
            encryptionLocalKey: FIXTURE_KEY_BASE64,
            hmacLocalKey: FIXTURE_KEY_BASE64,
          }),
          CryptoModule,
        ],
      }).compile(),
    ).rejects.toThrow(
      'The HMAC key and the encryption key must not be the same key material (D-070).',
    );
  });
});

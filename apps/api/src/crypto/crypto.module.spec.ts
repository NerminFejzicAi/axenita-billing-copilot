import { type DynamicModule, Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from '../config/app-config.service.js';
import { AesGcmEncryptionService } from './aes-gcm-encryption.service.js';
import { CryptoConfigurationError } from './crypto.errors.js';
import { CryptoModule } from './crypto.module.js';
import {
  ENCRYPTION_SERVICE,
  type EncryptionAad,
  type EncryptionService,
} from './encryption.port.js';

/** Deterministic NON-SECRET fixture: `axenita-local-test-enc-key-32b!!` in standard Base64. */
const FIXTURE_KEY_BASE64 = 'YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=';

/** The prohibited all-zero fixture of D-025 clause 10 — public, and never a secret. */
const PROHIBITED_ZERO_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

interface ConfigOverrides {
  readonly isProduction?: boolean;
  readonly encryptionLocalKey?: string;
  readonly encryptionKeyVersion?: number;
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

  it.each([
    ['NODE_ENV=production', { isProduction: true }],
    ['the prohibited all-zero key', { encryptionLocalKey: PROHIBITED_ZERO_KEY_BASE64 }],
    ['a malformed key', { encryptionLocalKey: 'replace-me-with-a-32-byte-base64-key' }],
    ['a key version of zero', { encryptionKeyVersion: 0 }],
  ])(
    'given %s when the module is built then construction fails, which aborts startup',
    async (_label, overrides: ConfigOverrides) => {
      // This is the property D-025 clause 10 actually asks for. The provider's guards are
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
});

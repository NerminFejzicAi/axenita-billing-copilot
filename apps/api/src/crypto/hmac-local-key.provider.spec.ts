import { describe, expect, it } from 'vitest';

import { type AppConfigService } from '../config/app-config.service.js';
import { CryptoConfigurationError } from './crypto.errors.js';
import { HmacLocalKeyProvider } from './hmac-local-key.provider.js';

/** Deterministic NON-SECRET fixture: `axenita-local-test-hmac-key-32b!` in standard Base64. */
const FIXTURE_KEY_BASE64 = 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=';

interface ConfigOverrides {
  readonly isProduction?: boolean;
  readonly hmacLocalKey?: string;
}

function appConfig(overrides: ConfigOverrides = {}): AppConfigService {
  return {
    isProduction: overrides.isProduction ?? false,
    hmacLocalKey: overrides.hmacLocalKey ?? FIXTURE_KEY_BASE64,
  } as unknown as AppConfigService;
}

describe('HmacLocalKeyProvider', () => {
  it('given a canonical 32-byte Base64 key then it decodes it once and serves the bytes', () => {
    const provider = new HmacLocalKeyProvider(appConfig());

    const key = provider.currentKey();

    expect(key).toHaveLength(32);
    expect(key).toStrictEqual(Buffer.from(FIXTURE_KEY_BASE64, 'base64'));
    // Decoded once in the constructor: repeated reads are the same buffer, not a re-decode.
    expect(provider.currentKey()).toBe(key);
  });

  it('given NODE_ENV=production then construction is refused', () => {
    // The local provider is a development adapter and nothing else. The production key
    // provider is still an open external dependency (D-OPEN-004a, `13` §3.1), so this is not a
    // claim of production readiness — it is a refusal to pretend.
    expect(() => new HmacLocalKeyProvider(appConfig({ isProduction: true }))).toThrow(
      CryptoConfigurationError,
    );
  });

  it('given production then the configured key is never even read', () => {
    let read = false;
    const config = {
      isProduction: true,
      get hmacLocalKey(): string {
        read = true;
        return FIXTURE_KEY_BASE64;
      },
    } as unknown as AppConfigService;

    expect(() => new HmacLocalKeyProvider(config)).toThrow(CryptoConfigurationError);
    expect(read).toBe(false);
  });

  it.each([
    // Layer A of the D-070 evidence: the alternative encodings that would decode to "32 bytes"
    // through a lax decoder are refused BEFORE a provider is ever constructed with them, which
    // is why a decoded-byte comparison never has to consider a second spelling of one key.
    ['inner whitespace', 'YXhlbml0YS1sb2NhbC10ZXN0LWht YWMta2V5LTMyYiE='],
    ['outer whitespace', ' YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE='],
    ['a trailing newline', `${FIXTURE_KEY_BASE64}${String.fromCharCode(10)}`],
    ['the URL-safe alphabet', 'u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1='],
    ['missing padding', 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE'],
    ['extra padding', `${FIXTURE_KEY_BASE64}=`],
    ['non-canonical trailing bits', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB='],
    ['a 31 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw=='],
    ['a 33 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH'],
    ['the `.env.example` placeholder', 'replace-me-with-a-32-byte-base64-hmac-key'],
    ['an empty value', ''],
  ])('given %s then construction is refused', (_label, hmacLocalKey) => {
    expect(() => new HmacLocalKeyProvider(appConfig({ hmacLocalKey }))).toThrow(
      CryptoConfigurationError,
    );
  });

  it('given a rejected key then neither the key nor its length reaches the error', () => {
    const key = 'Zm9yYmlkZGVuLXNlY3JldC1obWFjLW1hdGVyaWFs';

    let thrown: unknown;
    try {
      new HmacLocalKeyProvider(appConfig({ hmacLocalKey: key }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoConfigurationError);
    const error = thrown as Error;

    expect(error.message).toBe('The configured HMAC key is not accepted (D-070 RULING 3).');
    expect(`${error.message}${error.stack ?? ''}`).not.toContain(key);
    expect(error.cause).toBeUndefined();
  });

  it('given the production refusal then no key material is named', () => {
    let thrown: unknown;
    try {
      new HmacLocalKeyProvider(appConfig({ isProduction: true }));
    } catch (error) {
      thrown = error;
    }

    const error = thrown as Error;

    expect(error.message).not.toContain(FIXTURE_KEY_BASE64);
    expect(error.message).toContain('production');
  });
});

import { describe, expect, it } from 'vitest';

import { LogLevel, NodeEnvironment } from './environment.constants.js';
import { EnvironmentValidationError, validateEnvironment } from './environment.schema.js';

const VALID_ENVIRONMENT: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/copilot',
  REDIS_URL: 'redis://localhost:6379',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  // Isolated development authentication (09 §5). Deliberately has no default, so it belongs
  // to the minimal valid environment rather than to the optional overrides below.
  DEV_AUTH_JWT_SECRET: 'test_only_development_auth_secret_value_32+',
  // Local development encryption key (D-025 clause 9, D-070 `RULING 3`). Like the development
  // auth secret it has no default, so it belongs to the minimal valid environment. A
  // deterministic NON-SECRET fixture: `axenita-local-test-enc-key-32b!!` in standard Base64.
  ENCRYPTION_LOCAL_KEY: 'YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=',
  ENCRYPTION_KEY_VERSION: '1',
  // Keyed-digest key of D-070, `K_hmac`. Like the encryption key it has no default, so it
  // belongs to the minimal valid environment. A deterministic NON-SECRET fixture:
  // `axenita-local-test-hmac-key-32b!` in standard Base64.
  HMAC_LOCAL_KEY: 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=',
};

describe('validateEnvironment', () => {
  it('given a minimal valid environment when validated then defaults are applied', () => {
    const config = validateEnvironment({ ...VALID_ENVIRONMENT });

    expect(config.NODE_ENV).toBe(NodeEnvironment.Test);
    expect(config.API_PORT).toBe(3001);
    expect(config.API_HOST).toBe('127.0.0.1');
    expect(config.API_CORS_ALLOWED_ORIGINS).toBe('');
    expect(config.API_BODY_LIMIT).toBe('1mb');
    expect(config.LOG_LEVEL).toBe(LogLevel.Log);
    expect(config.OBJECT_STORAGE_HEALTH_PATH).toBe('/minio/health/live');
    expect(config.HEALTH_CHECK_TIMEOUT_MS).toBe(2000);
    expect(config.DEV_AUTH_JWT_ISSUER).toBe('axenita-development');
    expect(config.DEV_AUTH_JWT_AUDIENCE).toBe('axenita-api');
  });

  it('given a missing development auth secret when validated then bootstrap fails (09 §5)', () => {
    // "nema default production secret": the variable has no declared default, so an unset
    // value must stop the process instead of falling back to a well known string.
    const incomplete: Record<string, string> = { ...VALID_ENVIRONMENT };
    delete incomplete['DEV_AUTH_JWT_SECRET'];

    expect(() => validateEnvironment(incomplete)).toThrow(EnvironmentValidationError);
  });

  it('given a too short development auth secret when validated then bootstrap fails', () => {
    expect(() =>
      validateEnvironment({ ...VALID_ENVIRONMENT, DEV_AUTH_JWT_SECRET: 'too-short' }),
    ).toThrow(EnvironmentValidationError);
  });

  it('given an invalid development auth secret when validated then the value is never echoed', () => {
    const secret = 'weak';

    let thrown: unknown;
    try {
      validateEnvironment({ ...VALID_ENVIRONMENT, DEV_AUTH_JWT_SECRET: secret });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvironmentValidationError);
    expect((thrown as EnvironmentValidationError).message).toContain('DEV_AUTH_JWT_SECRET');
    expect((thrown as EnvironmentValidationError).variables).toContain('DEV_AUTH_JWT_SECRET');
    expect((thrown as EnvironmentValidationError).message).not.toContain(`"${secret}"`);
  });

  it('given numeric strings when validated then they are converted to numbers', () => {
    const config = validateEnvironment({
      ...VALID_ENVIRONMENT,
      API_PORT: '4000',
      HEALTH_CHECK_TIMEOUT_MS: '1500',
    });

    expect(config.API_PORT).toBe(4000);
    expect(config.HEALTH_CHECK_TIMEOUT_MS).toBe(1500);
  });

  it('given an empty string when validated then the declared default is used', () => {
    const config = validateEnvironment({ ...VALID_ENVIRONMENT, API_PORT: '' });

    expect(config.API_PORT).toBe(3001);
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['API_PORT', '0'],
    ['API_PORT', '70000'],
    ['API_PORT', 'not-a-number'],
    ['API_BODY_LIMIT', '1gigabyte'],
    ['LOG_LEVEL', 'trace'],
    ['DATABASE_URL', 'mysql://user:pw@localhost:3306/copilot'],
    ['REDIS_URL', 'http://localhost:6379'],
    ['OBJECT_STORAGE_ENDPOINT', 'localhost:9000'],
    ['OBJECT_STORAGE_HEALTH_PATH', 'minio/health/live'],
    ['HEALTH_CHECK_TIMEOUT_MS', '10'],
    ['API_PROBLEM_TYPE_BASE_URL', 'not-a-url'],
  ])('given an invalid %s when validated then bootstrap fails', (key, value) => {
    expect(() => validateEnvironment({ ...VALID_ENVIRONMENT, [key]: value })).toThrow(
      EnvironmentValidationError,
    );
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'OBJECT_STORAGE_ENDPOINT'])(
    'given a missing required %s when validated then bootstrap fails',
    (key) => {
      const incomplete: Record<string, string> = { ...VALID_ENVIRONMENT };
      delete incomplete[key];

      expect(() => validateEnvironment(incomplete)).toThrow(EnvironmentValidationError);
    },
  );

  it('given an invalid connection string when validated then the error never echoes the value', () => {
    const secret = 'super-secret-password';

    let thrown: unknown;
    try {
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        DATABASE_URL: `mysql://user:${secret}@localhost:3306/copilot`,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvironmentValidationError);
    const message = (thrown as EnvironmentValidationError).message;
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('mysql://');
  });

  it('given a migrator credential in the environment when validated then it is not exposed to the runtime', () => {
    // 02 §3.4, D-023 clause 6 and AGENTS.md §5.2: the runtime application must never be able
    // to read the migrator connection string, even when it is present in the process
    // environment. The same holds for the platform credential, whose first consumer is
    // phase 6, and for the test harness credentials.
    const migratorUrl = 'postgresql://copilot_migrator:migrator-pw@localhost:5432/copilot';
    const systemUrl = 'postgresql://copilot_system:system-pw@localhost:5432/copilot';

    const config = validateEnvironment({
      ...VALID_ENVIRONMENT,
      MIGRATION_DATABASE_URL: migratorUrl,
      SYSTEM_DATABASE_URL: systemUrl,
      TEST_DATABASE_URL: 'postgresql://copilot_app:test-pw@localhost:5433/copilot_test',
      TEST_MIGRATION_DATABASE_URL:
        'postgresql://copilot_migrator:test-pw@localhost:5433/copilot_test',
      SOME_UNRELATED_VARIABLE: 'value',
    });

    expect(config).not.toHaveProperty('MIGRATION_DATABASE_URL');
    expect(config).not.toHaveProperty('SYSTEM_DATABASE_URL');
    expect(config).not.toHaveProperty('TEST_DATABASE_URL');
    expect(config).not.toHaveProperty('TEST_MIGRATION_DATABASE_URL');
    expect(config).not.toHaveProperty('SOME_UNRELATED_VARIABLE');

    const serialised = JSON.stringify(config);
    expect(serialised).not.toContain('migrator-pw');
    expect(serialised).not.toContain('system-pw');
    expect(serialised).not.toContain('test-pw');
    expect(serialised).not.toContain('copilot_migrator');
  });

  it('given a valid encryption key when validated then it is accepted verbatim', () => {
    const config = validateEnvironment({ ...VALID_ENVIRONMENT });

    expect(config.ENCRYPTION_LOCAL_KEY).toBe('YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=');
    expect(config.ENCRYPTION_KEY_VERSION).toBe(1);
    expect(Buffer.from(config.ENCRYPTION_LOCAL_KEY, 'base64')).toHaveLength(32);
  });

  it.each(['ENCRYPTION_LOCAL_KEY', 'ENCRYPTION_KEY_VERSION'])(
    'given a missing %s when validated then bootstrap fails (D-025 clause 10)',
    (key) => {
      const incomplete: Record<string, string> = { ...VALID_ENVIRONMENT };
      delete incomplete[key];

      expect(() => validateEnvironment(incomplete)).toThrow(EnvironmentValidationError);
    },
  );

  it.each([
    // RFC 4648 standard Base64 only, decoding to exactly 32 bytes (D-070 `RULING 3` §3.2).
    ['inner whitespace', 'YXhlbml0YS1sb2NhbC10ZXN0LWVu Yy1rZXktMzJiISE='],
    ['outer whitespace', ' YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE='],
    [
      'a trailing newline',
      `YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=${String.fromCharCode(10)}`,
    ],
    // The URL-safe alphabet of RFC 4648 §5 is a different encoding, not a spelling variant.
    ['the URL-safe alphabet', 'u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1='],
    ['missing padding', 'YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE'],
    ['extra padding', 'YXhlbml0YS1sb2NhbC10ZXN0LWVuYy1rZXktMzJiISE=='],
    // Decodes to 32 bytes, but the unused trailing bits of the final quantum are non-zero, so
    // it re-encodes to a different string: a second spelling of one key is not canonical.
    ['non-canonical trailing bits', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB='],
    ['a 31 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw=='],
    ['a 33 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH'],
    ['a non-Base64 value', 'replace-me-with-a-32-byte-base64-key'],
  ])('given %s in ENCRYPTION_LOCAL_KEY when validated then bootstrap fails', (_label, value) => {
    expect(() =>
      validateEnvironment({ ...VALID_ENVIRONMENT, ENCRYPTION_LOCAL_KEY: value }),
    ).toThrow(EnvironmentValidationError);
  });

  it('given the `.env.example` placeholder when validated then bootstrap fails (D-025 clause 9)', () => {
    // The shipped example must never be an operational encryption configuration.
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        ENCRYPTION_LOCAL_KEY: 'replace-me-with-a-32-byte-base64-key',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('given an invalid encryption key when validated then the value is never echoed', () => {
    const key = 'Zm9yYmlkZGVuLXNlY3JldC1tYXRlcmlhbA';

    let thrown: unknown;
    try {
      validateEnvironment({ ...VALID_ENVIRONMENT, ENCRYPTION_LOCAL_KEY: key });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvironmentValidationError);
    const message = (thrown as EnvironmentValidationError).message;

    expect(message).toContain('ENCRYPTION_LOCAL_KEY');
    expect(message).not.toContain(key);
  });

  it.each([
    ['2', 2],
    ['9', 9],
  ])('given the key version %s when validated then it is accepted', (value, expected) => {
    expect(
      validateEnvironment({ ...VALID_ENVIRONMENT, ENCRYPTION_KEY_VERSION: value })
        .ENCRYPTION_KEY_VERSION,
    ).toBe(expected);
  });

  it.each([
    ['zero', '0'],
    ['negative', '-1'],
    ['non-integer', '1.5'],
    ['non-numeric', 'one'],
  ])(
    'given a %s ENCRYPTION_KEY_VERSION when validated then bootstrap fails (D-025 clauses 10, 14)',
    (_label, value) => {
      expect(() =>
        validateEnvironment({ ...VALID_ENVIRONMENT, ENCRYPTION_KEY_VERSION: value }),
      ).toThrow(EnvironmentValidationError);
    },
  );

  it('given a valid HMAC key when validated then it is accepted verbatim (D-070)', () => {
    const config = validateEnvironment({ ...VALID_ENVIRONMENT });

    expect(config.HMAC_LOCAL_KEY).toBe('YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=');
    expect(Buffer.from(config.HMAC_LOCAL_KEY, 'base64')).toHaveLength(32);
  });

  it('given the accepted fixtures then K_hmac and K_enc decode to different bytes', () => {
    // The schema cannot enforce this — both values are individually valid — so the property is
    // asserted here and REFUSED AT STARTUP by `KeySeparationGuard`, which compares the decoded
    // bytes in constant time (D-070).
    const config = validateEnvironment({ ...VALID_ENVIRONMENT });

    expect(Buffer.from(config.HMAC_LOCAL_KEY, 'base64')).not.toStrictEqual(
      Buffer.from(config.ENCRYPTION_LOCAL_KEY, 'base64'),
    );
  });

  it('given a missing HMAC_LOCAL_KEY when validated then bootstrap fails (D-070)', () => {
    // No default: a default would be a shipped key, and for a keyed digest a shipped key lets
    // anybody recompute every external reference token in the database.
    const incomplete: Record<string, string> = { ...VALID_ENVIRONMENT };
    delete incomplete['HMAC_LOCAL_KEY'];

    expect(() => validateEnvironment(incomplete)).toThrow(EnvironmentValidationError);
  });

  it.each([
    // The same strict RFC 4648 rule as the encryption key, through the same validator — a
    // second Base64 implementation would be a second set of accepted spellings.
    ['inner whitespace', 'YXhlbml0YS1sb2NhbC10ZXN0LWht YWMta2V5LTMyYiE='],
    ['outer whitespace', ' YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE='],
    [
      'a trailing newline',
      `YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=${String.fromCharCode(10)}`,
    ],
    ['the URL-safe alphabet', 'u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1-u_1='],
    ['missing padding', 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE'],
    ['extra padding', 'YXhlbml0YS1sb2NhbC10ZXN0LWhtYWMta2V5LTMyYiE=='],
    ['non-canonical trailing bits', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB='],
    ['a 31 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw=='],
    ['a 33 byte value', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH'],
    ['a non-Base64 value', 'replace-me-with-a-32-byte-base64-hmac-key'],
  ])('given %s in HMAC_LOCAL_KEY when validated then bootstrap fails', (_label, value) => {
    expect(() => validateEnvironment({ ...VALID_ENVIRONMENT, HMAC_LOCAL_KEY: value })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('given the `.env.example` HMAC placeholder when validated then bootstrap fails (D-070)', () => {
    // The shipped example must never be an operational keyed-digest configuration.
    expect(() =>
      validateEnvironment({
        ...VALID_ENVIRONMENT,
        HMAC_LOCAL_KEY: 'replace-me-with-a-32-byte-base64-hmac-key',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('given an invalid HMAC key when validated then the value is never echoed', () => {
    const key = 'Zm9yYmlkZGVuLXNlY3JldC1obWFjLW1hdGVyaWFs';

    let thrown: unknown;
    try {
      validateEnvironment({ ...VALID_ENVIRONMENT, HMAC_LOCAL_KEY: key });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvironmentValidationError);
    const message = (thrown as EnvironmentValidationError).message;

    expect(message).toContain('HMAC_LOCAL_KEY');
    expect(message).not.toContain(key);
  });

  it('given the runtime schema then no HMAC key version is configurable', () => {
    // Tokens carry the fixed `h1.` generation marker. There is deliberately no
    // `HMAC_KEY_VERSION`: rotation orchestration and a persisted key generation are not part of
    // this slice, and configuring one would be configuration for a mechanism that does not
    // exist.
    const config = validateEnvironment({ ...VALID_ENVIRONMENT, HMAC_KEY_VERSION: '1' });

    expect(Object.keys(config)).not.toContain('HMAC_KEY_VERSION');
  });

  it('given the runtime schema when inspected then DATABASE_URL is the only database credential', () => {
    // 02 §3.4 credential matrix: only `copilot_app` is a runtime credential for the API.
    const config = validateEnvironment({ ...VALID_ENVIRONMENT });

    const databaseKeys = Object.keys(config).filter((key) => key.includes('DATABASE'));
    expect(databaseKeys).toStrictEqual(['DATABASE_URL']);
  });
});

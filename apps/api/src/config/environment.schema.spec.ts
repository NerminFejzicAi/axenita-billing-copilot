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

  it('given the runtime schema when inspected then DATABASE_URL is the only database credential', () => {
    // 02 §3.4 credential matrix: only `copilot_app` is a runtime credential for the API.
    const config = validateEnvironment({ ...VALID_ENVIRONMENT });

    const databaseKeys = Object.keys(config).filter((key) => key.includes('DATABASE'));
    expect(databaseKeys).toStrictEqual(['DATABASE_URL']);
  });
});

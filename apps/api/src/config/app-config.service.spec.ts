import { type ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from './app-config.service.js';
import { LogLevel, NodeEnvironment } from './environment.constants.js';
import { type EnvironmentVariables, validateEnvironment } from './environment.schema.js';

function appConfigFor(overrides: Record<string, string> = {}): AppConfigService {
  const environment = validateEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://copilot_app:secret-password@db.internal:5432/copilot',
    REDIS_URL: 'redis://cache.internal:6379',
    OBJECT_STORAGE_ENDPOINT: 'http://storage.internal:9000',
    DEV_AUTH_JWT_SECRET: 'test_only_development_auth_secret_value_32+',
    ...overrides,
  });

  const configService = {
    get: (key: keyof EnvironmentVariables) => environment[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return new AppConfigService(configService);
}

describe('AppConfigService', () => {
  it('given a validated environment when read then typed values are exposed', () => {
    const appConfig = appConfigFor({ API_PORT: '4100', LOG_LEVEL: 'debug' });

    expect(appConfig.nodeEnvironment).toBe(NodeEnvironment.Test);
    expect(appConfig.isProduction).toBe(false);
    expect(appConfig.httpPort).toBe(4100);
    expect(appConfig.logLevel).toBe(LogLevel.Debug);
    expect(appConfig.bodyLimit).toBe('1mb');
  });

  it('given production when read then isProduction is true', () => {
    expect(appConfigFor({ NODE_ENV: 'production' }).isProduction).toBe(true);
  });

  it('given an empty allowlist when read then no origin is allowed', () => {
    expect(appConfigFor().corsAllowedOrigins).toStrictEqual([]);
  });

  it('given a comma separated allowlist when read then entries are trimmed', () => {
    const appConfig = appConfigFor({
      API_CORS_ALLOWED_ORIGINS: 'http://localhost:3000, https://app.example.ch ,',
    });

    expect(appConfig.corsAllowedOrigins).toStrictEqual([
      'http://localhost:3000',
      'https://app.example.ch',
    ]);
  });

  it('given a redis connection string when read then only host and port are exposed', () => {
    const appConfig = appConfigFor();

    expect(appConfig.redisEndpoint).toStrictEqual({ host: 'cache.internal', port: 6379 });
    expect(JSON.stringify(appConfig.redisEndpoint)).not.toContain('secret-password');
  });

  it('given a redis connection string without an explicit port when read then the default applies', () => {
    const appConfig = appConfigFor({ REDIS_URL: 'redis://cache.internal' });

    expect(appConfig.redisEndpoint.port).toBe(6379);
  });

  it('given the runtime database credential when read then it is returned verbatim for the driver', () => {
    // 02 §3.4 — the runtime client is built from DATABASE_URL (copilot_app) and nothing else.
    const appConfig = appConfigFor();

    expect(appConfig.databaseUrl).toBe(
      'postgresql://copilot_app:secret-password@db.internal:5432/copilot',
    );
  });

  it('given a migrator credential in the environment when read then the service exposes no accessor for it', () => {
    // D-023 clause 6 / AGENTS.md §5.2 — the runtime must not be able to reach
    // MIGRATION_DATABASE_URL. It is absent from the schema, so no accessor can exist.
    const appConfig = appConfigFor();

    expect(appConfig).not.toHaveProperty('migrationDatabaseUrl');
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(appConfig))).not.toContain(
      'migrationDatabaseUrl',
    );
  });

  it('given an object storage endpoint when read then the health URL is composed', () => {
    const appConfig = appConfigFor({ OBJECT_STORAGE_ENDPOINT: 'http://storage.internal:9000/' });

    expect(appConfig.objectStorageHealthUrl).toBe('http://storage.internal:9000/minio/health/live');
  });

  it('given a problem type base URL with a trailing slash when read then it is normalised', () => {
    const appConfig = appConfigFor({
      API_PROBLEM_TYPE_BASE_URL: 'https://api.example.ch/problems/',
    });

    expect(appConfig.problemTypeBaseUrl).toBe('https://api.example.ch/problems');
  });

  it('given the development auth configuration when read then the verifier policy is exposed', () => {
    // 09 §5 / 03 §3.1 — the guard verifies signature, issuer and audience from validated
    // configuration only, never from a token claim or a request header.
    const appConfig = appConfigFor({
      DEV_AUTH_JWT_ISSUER: 'axenita-local',
      DEV_AUTH_JWT_AUDIENCE: 'axenita-local-api',
    });

    expect(appConfig.developmentAuthSecret).toBe('test_only_development_auth_secret_value_32+');
    expect(appConfig.developmentAuthIssuer).toBe('axenita-local');
    expect(appConfig.developmentAuthAudience).toBe('axenita-local-api');
  });
});

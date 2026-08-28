import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LogLevel, NodeEnvironment } from './environment.constants.js';
import { type EnvironmentVariables } from './environment.schema.js';

/** Host and port pair derived from a connection string, without any credential material. */
export interface NetworkEndpoint {
  readonly host: string;
  readonly port: number;
}

/**
 * Typed, read-only accessor for validated configuration.
 *
 * Application code must depend on this service rather than on `process.env`, so that every
 * consumed value has passed the schema in `environment.schema.ts` (enforced by the
 * `no-restricted-syntax` lint rule).
 */
@Injectable()
export class AppConfigService {
  public constructor(private readonly configService: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.configService.get(key, { infer: true });
  }

  public get nodeEnvironment(): NodeEnvironment {
    return this.get('NODE_ENV');
  }

  public get isProduction(): boolean {
    return this.nodeEnvironment === NodeEnvironment.Production;
  }

  public get logLevel(): LogLevel {
    return this.get('LOG_LEVEL');
  }

  public get httpPort(): number {
    return this.get('API_PORT');
  }

  public get httpHost(): string {
    return this.get('API_HOST');
  }

  public get bodyLimit(): string {
    return this.get('API_BODY_LIMIT');
  }

  public get problemTypeBaseUrl(): string {
    return this.get('API_PROBLEM_TYPE_BASE_URL').replace(/\/+$/, '');
  }

  /**
   * Explicit CORS allowlist (09 §14). An empty array means no cross-origin browser request
   * is accepted, which is the default when the variable is unset.
   */
  public get corsAllowedOrigins(): readonly string[] {
    return this.get('API_CORS_ALLOWED_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  public get healthCheckTimeoutMs(): number {
    return this.get('HEALTH_CHECK_TIMEOUT_MS');
  }

  /**
   * Runtime PostgreSQL connection string — the `copilot_app` credential (02 §3.2, §3.4).
   *
   * Consumed by `PrismaService` only, to build the driver adapter. It must never be logged,
   * echoed in an error, or placed in a response body (09 §11).
   *
   * There is deliberately no accessor for `MIGRATION_DATABASE_URL`: that variable is not
   * part of the runtime schema, so the migrator credential is unreachable from runtime code
   * (D-023 clause 6, AGENTS.md §5.2).
   */
  public get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  /** Redis endpoint for the readiness probe. Credentials are not exposed. */
  public get redisEndpoint(): NetworkEndpoint {
    return toEndpoint(this.get('REDIS_URL'), 6379);
  }

  /**
   * Shared secret of the isolated development authentication mechanism (09 §5).
   *
   * Consumed by `DevelopmentAuthGuard` only. Like the database credential, it must never be
   * logged, echoed in an error or placed in a response body (09 §11).
   */
  public get developmentAuthSecret(): string {
    return this.get('DEV_AUTH_JWT_SECRET');
  }

  /** Expected `iss` claim of a development token (03 §3.1). */
  public get developmentAuthIssuer(): string {
    return this.get('DEV_AUTH_JWT_ISSUER');
  }

  /** Expected `aud` claim of a development token (03 §3.1). */
  public get developmentAuthAudience(): string {
    return this.get('DEV_AUTH_JWT_AUDIENCE');
  }

  /**
   * Application encryption key of local development, `K_enc` (D-025 clause 9).
   *
   * Consumed by `LocalStaticKeyProvider` only, which decodes and validates it again before it
   * holds it. Like the database credential and the development auth secret it must never be
   * logged, echoed in an error or placed in a response body (09 §9, §11).
   */
  public get encryptionLocalKey(): string {
    return this.get('ENCRYPTION_LOCAL_KEY');
  }

  /** Active encryption key generation, `>= 1` (D-025 clauses 10, 14). Non-secret. */
  public get encryptionKeyVersion(): number {
    return this.get('ENCRYPTION_KEY_VERSION');
  }

  /**
   * Keyed-digest key of local development, `K_hmac` (D-070).
   *
   * Consumed by `HmacLocalKeyProvider` only, which decodes and validates it again before it
   * holds it. Like the database credential, the development auth secret and the encryption key
   * it must never be logged, echoed in an error or placed in a response body (09 §9, §11).
   */
  public get hmacLocalKey(): string {
    return this.get('HMAC_LOCAL_KEY');
  }

  /** Absolute health URL of the S3-compatible object storage. */
  public get objectStorageHealthUrl(): string {
    const endpoint = this.get('OBJECT_STORAGE_ENDPOINT').replace(/\/+$/, '');
    return `${endpoint}${this.get('OBJECT_STORAGE_HEALTH_PATH')}`;
  }
}

function toEndpoint(connectionString: string, defaultPort: number): NetworkEndpoint {
  const url = new URL(connectionString);
  const port = url.port === '' ? defaultPort : Number.parseInt(url.port, 10);
  return { host: url.hostname, port };
}

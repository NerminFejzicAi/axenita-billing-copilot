import { Expose, plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
  type ValidationError,
} from 'class-validator';

import { LogLevel, NodeEnvironment } from './environment.constants.js';
import { IsStrictBase64Key } from './validators/is-strict-base64-key.validator.js';
import { IsUrlWithProtocol } from './validators/is-url-with-protocol.validator.js';

/**
 * Validated runtime configuration of the API process.
 *
 * Deliberately excluded from the runtime schema:
 * - `MIGRATION_DATABASE_URL` — the runtime application must never be able to read the
 *   migrator credential (00 §6.1, AGENTS.md §5.2). It is consumed by the Prisma CLI only.
 * - `TEST_DATABASE_URL` — consumed by the test harness only (08 §3).
 *
 * Both remain documented in `.env.example`; they are simply not part of the runtime surface.
 */
export class EnvironmentVariables {
  @Expose()
  @IsEnum(NodeEnvironment)
  public readonly NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  public readonly API_PORT: number = 3001;

  @Expose()
  @IsString()
  @IsNotEmpty()
  public readonly API_HOST: string = '127.0.0.1';

  /**
   * Comma separated CORS allowlist (09 §14). An empty value means "no cross-origin browser
   * client is allowed", which is the safe default.
   */
  @Expose()
  @IsString()
  public readonly API_CORS_ALLOWED_ORIGINS: string = '';

  /** Base URI used to build the `type` member of Problem Details documents (03 §8). */
  @Expose()
  @IsUrlWithProtocol(['http', 'https'])
  public readonly API_PROBLEM_TYPE_BASE_URL: string = 'https://api.example.ch/problems';

  /** Maximum accepted request body size (09 §14 — body limit). */
  @Expose()
  @Matches(/^\d+(b|kb|mb)$/i, {
    message: 'API_BODY_LIMIT must be a byte size such as 512kb or 1mb',
  })
  public readonly API_BODY_LIMIT: string = '1mb';

  @Expose()
  @IsEnum(LogLevel)
  public readonly LOG_LEVEL: LogLevel = LogLevel.Log;

  /**
   * Runtime PostgreSQL connection string. Phase 1 uses it only to derive the host and port
   * of the readiness probe; no database client is created yet (04 §3.4).
   */
  @Expose()
  @IsUrlWithProtocol(['postgresql', 'postgres'])
  public readonly DATABASE_URL!: string;

  @Expose()
  @IsUrlWithProtocol(['redis', 'rediss'])
  public readonly REDIS_URL!: string;

  @Expose()
  @IsUrlWithProtocol(['http', 'https'])
  public readonly OBJECT_STORAGE_ENDPOINT!: string;

  @Expose()
  @Matches(/^\/[\w\-./]*$/, {
    message: 'OBJECT_STORAGE_HEALTH_PATH must be an absolute path such as /minio/health/live',
  })
  public readonly OBJECT_STORAGE_HEALTH_PATH: string = '/minio/health/live';

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(30000)
  public readonly HEALTH_CHECK_TIMEOUT_MS: number = 2000;

  /**
   * Shared secret of the isolated development authentication mechanism (09 §5, 04 §5.2).
   *
   * DEVELOPMENT AND TEST ONLY. It has **no default**, exactly as 09 §5 requires ("nema default
   * production secret"), so a process that does not configure it refuses to start instead of
   * silently accepting tokens signed with a well known value. `DevelopmentAuthGuard`
   * additionally refuses to be constructed under `NODE_ENV=production`, which turns the same
   * mistake into a startup failure rather than a runtime one.
   *
   * The minimum length is a real constraint, not decoration: an HS256 secret shorter than the
   * digest it protects weakens the signature. The value is never logged and never echoed in an
   * error — only the variable name is (09 §9, §11).
   */
  @Expose()
  @IsString()
  @MinLength(32, {
    message: 'DEV_AUTH_JWT_SECRET must be at least 32 characters and has no default (09 §5)',
  })
  public readonly DEV_AUTH_JWT_SECRET!: string;

  /** Expected `iss` claim of a development token (03 §3.1 — issuer verification). */
  @Expose()
  @IsString()
  @IsNotEmpty()
  public readonly DEV_AUTH_JWT_ISSUER: string = 'axenita-development';

  /** Expected `aud` claim of a development token (03 §3.1 — audience verification). */
  @Expose()
  @IsString()
  @IsNotEmpty()
  public readonly DEV_AUTH_JWT_AUDIENCE: string = 'axenita-api';

  /**
   * Application encryption key of local development, `K_enc` (D-025 clause 9, D-070 `RULING 3`).
   *
   * DEVELOPMENT AND TEST ONLY, exactly like `DEV_AUTH_JWT_SECRET` above. The production key
   * provider — KMS, access model, rotation cadence, recovery — is still an open external
   * dependency (D-OPEN-004a, `13` §3.1), and `LocalStaticKeyProvider` refuses to be constructed
   * under `NODE_ENV=production`, which turns a production misconfiguration into a startup
   * failure rather than a runtime one.
   *
   * It has NO DEFAULT. A default would be a shipped key, and a shipped key is a key everybody
   * has. The strict validator accepts only RFC 4648 standard Base64 that decodes to exactly 32
   * bytes, because D-025 clause 1 fixes the AES-256-GCM key at that length and D-070 `RULING 3`
   * §3.2 makes any other decoded length a configuration error. The value is never logged and
   * never echoed in an error (09 §9, §11).
   */
  @Expose()
  @IsStrictBase64Key()
  public readonly ENCRYPTION_LOCAL_KEY!: string;

  /**
   * Active generation of the encryption key, persisted per row as `encryption_key_version`.
   *
   * Mandatory with NO DEFAULT (D-025 clause 10 — a missing key version refuses startup) and at
   * least `1` (D-025 clause 14). Defaulting it would let a process silently write rows under a
   * generation nobody chose, which is precisely what makes a later rotation undecidable.
   */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly ENCRYPTION_KEY_VERSION!: number;

  /**
   * Keyed-digest key of local development, `K_hmac` (D-070).
   *
   * DEVELOPMENT AND TEST ONLY, exactly like `ENCRYPTION_LOCAL_KEY` above, and validated by the
   * SAME strict validator: RFC 4648 standard Base64, no whitespace, canonical padding, decoding
   * to exactly 32 bytes. A second Base64 implementation would be a second set of accepted
   * spellings for key material, so there is deliberately only one.
   *
   * It has NO DEFAULT, for the same reason the encryption key has none: a default is a shipped
   * key, and a shipped key is a key everybody has — and for a keyed digest that means anybody
   * can recompute every external reference token in the database.
   *
   * IT MUST NOT BE `ENCRYPTION_LOCAL_KEY`. The schema cannot see that, because both values are
   * individually valid; `KeySeparationGuard` compares the DECODED BYTES at startup and refuses
   * to come up when they match (D-070).
   *
   * There is deliberately no `HMAC_KEY_VERSION`. Tokens carry the fixed `h1.` generation marker
   * and nothing reads a configured HMAC key generation, so declaring one would be configuration
   * for a rotation mechanism that does not exist. The value is never logged and never echoed in
   * an error (09 §9, §11).
   */
  @Expose()
  @IsStrictBase64Key()
  public readonly HMAC_LOCAL_KEY!: string;
}

/**
 * Error thrown when the process environment does not satisfy the schema.
 *
 * The message lists offending variable names and the constraints they violated. It never
 * contains the offending values, because environment variables carry credentials and
 * connection strings (09 §9, §11).
 */
export class EnvironmentValidationError extends Error {
  /**
   * Names of the offending variables, without any constraint text and without any value.
   *
   * These are declared property names of `EnvironmentVariables`, so they are compile time
   * constants and can never carry runtime data. This is the only part of the error that is
   * safe to place into a log line (09 §11).
   */
  public readonly variables: readonly string[];

  public constructor(
    public readonly failures: readonly string[],
    variables: readonly string[],
  ) {
    super(
      `Invalid environment configuration. The API refuses to start.\n${failures
        .map((failure) => `  - ${failure}`)
        .join('\n')}`,
    );
    this.name = 'EnvironmentValidationError';
    // Belt and braces: even though these come from declared property names, only plain
    // upper snake case identifiers survive, so no runtime data can slip through.
    this.variables = [...new Set(variables)].filter((name) => SAFE_VARIABLE_NAME.test(name)).sort();
  }
}

/** Shape every environment variable name in this schema has (12 §10). */
const SAFE_VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;

function describeFailure(error: ValidationError, parentPath = ''): string[] {
  const path = parentPath === '' ? error.property : `${parentPath}.${error.property}`;
  const own = Object.values(error.constraints ?? {}).map((message) => `${path}: ${message}`);
  const nested = (error.children ?? []).flatMap((child) => describeFailure(child, path));
  return [...own, ...nested];
}

/**
 * Removes keys whose value is an empty string so that class property defaults apply.
 *
 * An unset variable and a variable set to the empty string are the same thing for shell and
 * Compose driven configuration, except for the CORS allowlist where "empty" is meaningful
 * and already the default.
 */
function dropEmptyValues(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

/**
 * Validates the raw process environment and returns the typed configuration.
 *
 * Registered as the `validate` callback of `ConfigModule.forRoot`, so an invalid
 * environment makes the process fail during bootstrap instead of failing later at the first
 * request (09 §1 — never disguise a failure as a successful result).
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  // `excludeExtraneousValues` keeps every variable that is not declared above out of the
  // resulting object. Without it, `MIGRATION_DATABASE_URL` and every other unrelated
  // environment variable would be copied onto the runtime configuration and become
  // readable through `ConfigService` (00 §6.1, AGENTS.md §5.2).
  const candidate = plainToInstance(EnvironmentVariables, dropEmptyValues(config), {
    enableImplicitConversion: false,
    excludeExtraneousValues: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(candidate, {
    skipMissingProperties: false,
    forbidUnknownValues: true,
    whitelist: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    throw new EnvironmentValidationError(
      errors.flatMap((error) => describeFailure(error)),
      errors.map((error) => error.property),
    );
  }

  return candidate;
}

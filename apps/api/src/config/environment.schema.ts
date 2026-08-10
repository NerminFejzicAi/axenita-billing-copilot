import { Expose, plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
  type ValidationError,
} from 'class-validator';

import { LogLevel, NodeEnvironment } from './environment.constants.js';
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

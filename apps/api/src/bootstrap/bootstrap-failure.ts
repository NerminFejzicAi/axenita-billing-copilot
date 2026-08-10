import {
  type AllowlistedLogAttributes,
  API_SERVICE_NAME,
  logAttributes,
} from '../common/observability/log-attributes.js';
import { EnvironmentValidationError } from '../config/environment.schema.js';

/** Static message used when the process cannot start. Carries no exception data. */
export const BOOTSTRAP_FAILURE_MESSAGE = 'API startup failed';

/**
 * Static message used when startup failed because configuration is invalid. The names of
 * the offending variables are appended by `describeBootstrapFailure`.
 */
export const BOOTSTRAP_CONFIGURATION_FAILURE_MESSAGE =
  'API startup failed: invalid environment configuration';

/**
 * Builds the log payload for a startup failure.
 *
 * The rule this function exists to enforce (09 §11): an arbitrary exception raised during
 * bootstrap may contain a connection string, a credential, a provider payload or a file
 * path, so neither `error.message` nor `error.stack` is ever read.
 *
 * The single exception is `EnvironmentValidationError`, and even then only its `variables`
 * property is used — the declared, upper snake case property names of the environment
 * schema, filtered against a strict identifier pattern. Those are compile time constants,
 * never runtime data, and they are what makes a misconfigured deployment diagnosable at
 * all. The constraint text and every rejected value stay out of the log.
 *
 * Structured attributes are constrained to the allowlist by `logAttributes`.
 */
export function describeBootstrapFailure(error: unknown): AllowlistedLogAttributes {
  if (error instanceof EnvironmentValidationError && error.variables.length > 0) {
    return logAttributes({
      message: `${BOOTSTRAP_CONFIGURATION_FAILURE_MESSAGE}: ${error.variables.join(', ')}`,
      service: API_SERVICE_NAME,
      action: 'API_STARTUP_FAILED',
      errorCode: 'INTERNAL_ERROR',
      dependency: 'configuration',
    });
  }

  return logAttributes({
    message: BOOTSTRAP_FAILURE_MESSAGE,
    service: API_SERVICE_NAME,
    action: 'API_STARTUP_FAILED',
    errorCode: 'INTERNAL_ERROR',
  });
}

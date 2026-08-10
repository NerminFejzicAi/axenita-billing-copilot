/**
 * Structured allowlist logging (09 §11).
 *
 * `09_SECURITY_PRIVACY_BASELINE_V1.md` §11 lists the permitted structured log fields
 * exhaustively:
 *
 * ```text
 * service, environment, level, requestId, practiceId, userId, encounterId, analysisId,
 * jobId, action, status, errorCode, durationMs, dependency
 * ```
 *
 * and forbids, among others: medical text, document text, patient name, AHV, insurance
 * number, external ID plaintext, JWT, Authorization, cookies, credentials, database URL,
 * encryption keys, raw AI prompt/response and raw external provider responses.
 *
 * `AllowlistedLogAttributes` turns that list into a compile time constraint. Passing an
 * object literal with any other key through `logAttributes` is a type error, so a
 * non-allowlisted attribute cannot reach a log line by accident.
 *
 * `level` is omitted because the logger derives it from the called method.
 */
export interface AllowlistedLogAttributes {
  /** Static, human readable summary. Must not be built from request or exception data. */
  readonly message: string;
  readonly service?: string;
  readonly environment?: string;
  readonly requestId?: string;
  readonly practiceId?: string;
  readonly userId?: string;
  readonly encounterId?: string;
  readonly analysisId?: string;
  readonly jobId?: string;
  readonly action?: string;
  readonly status?: number;
  readonly errorCode?: string;
  readonly durationMs?: number;
  readonly dependency?: string;
}

/** Identifies this deployment unit in the `service` attribute (01 §5.1). */
export const API_SERVICE_NAME = 'api';

/**
 * Identity function that constrains a log payload to the allowlist.
 *
 * The excess property check on the object literal is what enforces the rule, so always
 * call this inline: `logger.error(logAttributes({ ... }))`.
 */
export function logAttributes(attributes: AllowlistedLogAttributes): AllowlistedLogAttributes {
  return attributes;
}

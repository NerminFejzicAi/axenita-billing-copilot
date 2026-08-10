import { type ProblemFieldError } from '../errors/api-exception.js';
import { type ErrorCode } from '../errors/error-codes.js';

/** Media type mandated for every error response (03 §2, D-008). */
export const PROBLEM_DETAILS_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/**
 * RFC 9457 Problem Details document, extended with the members required by 03 §8.
 *
 * Forbidden content (09 §11, 03 §1): stack traces, SQL, secrets, internal URLs, raw
 * external provider errors and any medical or patient identifying data.
 */
export interface ProblemDetailsDto {
  /** Absolute URI identifying the problem type, e.g. `<base>/validation-error`. */
  readonly type: string;
  /** Short, human readable summary of the problem type. */
  readonly title: string;
  /** HTTP status code of this response. */
  readonly status: number;
  /** Stable technical code from the frozen catalogue (03 §8). */
  readonly code: ErrorCode;
  /** Human readable explanation of this occurrence. */
  readonly detail: string;
  /** Request path this problem occurred on. */
  readonly instance: string;
  /** Correlation id of the request (03 §3.5). */
  readonly requestId: string;
  /** Field level failures, present for validation problems. */
  readonly errors?: readonly ProblemFieldError[];
}

import { HttpException } from '@nestjs/common';

import { type ErrorCode } from './error-codes.js';

/** One field level validation failure, rendered in the `errors` member (03 §8). */
export interface ProblemFieldError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

export interface ApiExceptionOptions {
  /** Stable technical code from the frozen catalogue. */
  readonly code: ErrorCode;
  /** HTTP status to return. */
  readonly status: number;
  /**
   * Human readable explanation. Must never contain medical content, credentials, SQL,
   * stack traces or internal URLs (09 §11, 03 §1).
   */
  readonly detail: string;
  /** Optional field level failures. */
  readonly errors?: readonly ProblemFieldError[];
}

/**
 * Base application exception.
 *
 * Every deliberate error response goes through this type so that controllers cannot invent
 * an ad-hoc error shape (D-008).
 */
export class ApiException extends HttpException {
  public readonly code: ErrorCode;
  public readonly detail: string;
  public readonly errors: readonly ProblemFieldError[] | undefined;

  public constructor(options: ApiExceptionOptions) {
    super(options.detail, options.status);
    this.name = 'ApiException';
    this.code = options.code;
    this.detail = options.detail;
    this.errors = options.errors;
  }
}

import { HttpStatus } from '@nestjs/common';

import { type ProblemFieldError } from '../errors/api-exception.js';
import { type ErrorCode, ERROR_TITLES, toProblemTypeSlug } from '../errors/error-codes.js';
import { type ProblemDetailsDto } from './problem-details.dto.js';

/**
 * Fallback mapping from HTTP status to a catalogue code.
 *
 * Only covers statuses that phase 1 can actually produce plus the generic families. It is a
 * fallback: a deliberate error carries its own code through `ApiException`, and the
 * normative code/status pairs of 03 §8.1 belong to the endpoints that own them.
 */
const STATUS_TO_CODE: ReadonlyMap<number, ErrorCode> = new Map<number, ErrorCode>([
  [HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR'],
  [HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED'],
  [HttpStatus.FORBIDDEN, 'ACCESS_DENIED'],
  [HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND'],
  [HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR'],
  [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED'],
  [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'],
  [HttpStatus.BAD_GATEWAY, 'DEPENDENCY_UNAVAILABLE'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'DEPENDENCY_UNAVAILABLE'],
  [HttpStatus.GATEWAY_TIMEOUT, 'DEPENDENCY_UNAVAILABLE'],
]);

/**
 * Safe, static explanations.
 *
 * Static on purpose: framework generated messages may embed internal routing or driver
 * detail, which must never reach a client (03 §1, 09 §11).
 */
const STATUS_TO_DETAIL: ReadonlyMap<number, string> = new Map<number, string>([
  [HttpStatus.BAD_REQUEST, 'The request could not be processed.'],
  [HttpStatus.UNAUTHORIZED, 'Authentication is required.'],
  [HttpStatus.FORBIDDEN, 'Access denied.'],
  [HttpStatus.NOT_FOUND, 'The requested resource was not found.'],
  [HttpStatus.METHOD_NOT_ALLOWED, 'The HTTP method is not allowed for this resource.'],
  [HttpStatus.UNPROCESSABLE_ENTITY, 'One or more fields are invalid.'],
  [HttpStatus.TOO_MANY_REQUESTS, 'Too many requests.'],
  [HttpStatus.INTERNAL_SERVER_ERROR, 'An unexpected internal error occurred.'],
  [HttpStatus.BAD_GATEWAY, 'A required dependency is unavailable.'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'A required dependency is unavailable.'],
  [HttpStatus.GATEWAY_TIMEOUT, 'A required dependency is unavailable.'],
]);

/** Lowest status of the client error family (03 §9). */
export const CLIENT_ERROR_MIN_STATUS = 400;

/** Lowest status of the server error family (03 §9). */
export const SERVER_ERROR_MIN_STATUS = 500;

export function errorCodeForStatus(status: number): ErrorCode {
  const mapped = STATUS_TO_CODE.get(status);
  if (mapped !== undefined) {
    return mapped;
  }
  return status >= SERVER_ERROR_MIN_STATUS ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
}

export function detailForStatus(status: number): string {
  const mapped = STATUS_TO_DETAIL.get(status);
  if (mapped !== undefined) {
    return mapped;
  }
  return status >= SERVER_ERROR_MIN_STATUS
    ? 'An unexpected internal error occurred.'
    : 'The request could not be processed.';
}

export interface ProblemDetailsInput {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly requestId: string;
  readonly typeBaseUrl: string;
  readonly errors?: readonly ProblemFieldError[] | undefined;
}

/** Builds the response body for an error, in the exact member order of the 03 §8 example. */
export function createProblemDetails(input: ProblemDetailsInput): ProblemDetailsDto {
  const base: ProblemDetailsDto = {
    type: `${input.typeBaseUrl}/${toProblemTypeSlug(input.code)}`,
    title: ERROR_TITLES[input.code],
    status: input.status,
    code: input.code,
    detail: input.detail,
    instance: input.instance,
    requestId: input.requestId,
  };

  if (input.errors === undefined || input.errors.length === 0) {
    return base;
  }

  return { ...base, errors: input.errors };
}

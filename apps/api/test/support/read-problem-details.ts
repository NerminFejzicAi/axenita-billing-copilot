import { type ProblemFieldError } from '../../src/common/errors/api-exception.js';
import { type ProblemDetailsDto } from '../../src/common/problem-details/problem-details.dto.js';

/** A Problem Details body as observed by a test, with the optional members widened. */
export interface ObservedProblemDetails extends ProblemDetailsDto {
  readonly errors?: readonly ProblemFieldError[];
}

/**
 * Reads a response body as a Problem Details document.
 *
 * Supertest types `body` as `any`; funnelling every assertion through this helper keeps the
 * specs type checked instead of silently accepting anything.
 */
export function readProblemDetails(response: { body: unknown }): ObservedProblemDetails {
  return response.body as ObservedProblemDetails;
}

import { type ReadinessResponseDto } from '../../src/health/dto/readiness-response.dto.js';

/**
 * Reads a response body as a readiness document.
 *
 * Supertest types `body` as `any`; funnelling every assertion through this helper keeps the
 * specs type checked instead of silently accepting anything.
 */
export function readReadiness(response: { body: unknown }): ReadinessResponseDto {
  return response.body as ReadinessResponseDto;
}

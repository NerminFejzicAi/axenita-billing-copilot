import { type DependencyChecks, type ReadinessStatus } from '../domain/dependency-status.js';

/**
 * Response body of `GET /api/v1/health/ready` (03 §27).
 *
 * Contains status values only. It must never expose an internal URL, host, port or
 * credential detail (03 §27, 09 §2 — health status is Class D data only without details).
 */
export interface ReadinessResponseDto {
  readonly status: ReadinessStatus;
  readonly checks: DependencyChecks;
}

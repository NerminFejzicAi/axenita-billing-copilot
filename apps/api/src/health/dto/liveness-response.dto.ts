/**
 * Response body of `GET /api/v1/health/live` (03 §27).
 *
 * Liveness answers one question only: is the process running and able to serve HTTP. It
 * intentionally reports nothing about dependencies, so a dependency outage never causes an
 * orchestrator to restart a healthy process.
 */
export interface LivenessResponseDto {
  readonly status: 'up';
}

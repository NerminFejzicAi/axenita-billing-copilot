import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { type Response } from 'express';

import { API_VERSION_1 } from '@axenita/contracts';

import { ReadinessService } from '../application/readiness.service.js';
import { type LivenessResponseDto } from '../dto/liveness-response.dto.js';
import { type ReadinessResponseDto } from '../dto/readiness-response.dto.js';

/**
 * Health endpoints (03 §27).
 *
 * Route class "neutral" (03 §3.4): no bearer token, no `X-Practice-ID`, no tenant context.
 * Resolved paths: `/api/v1/health/live` and `/api/v1/health/ready`.
 */
@Controller({ path: 'health', version: API_VERSION_1 })
export class HealthController {
  public constructor(private readonly readinessService: ReadinessService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  public live(): LivenessResponseDto {
    return { status: 'up' };
  }

  /**
   * Readiness probe.
   *
   * Returns `200` while every required dependency is up and `503` as soon as one is not,
   * so a load balancer stops routing traffic to a degraded instance (03 §9 — 503 signals a
   * dependency problem). The body keeps the structure of the 03 §27 example in both cases.
   */
  @Get('ready')
  public async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponseDto> {
    const result = await this.readinessService.check();

    response.status(result.status === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return { status: result.status, checks: result.checks };
  }
}

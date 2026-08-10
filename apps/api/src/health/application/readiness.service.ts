import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import {
  aggregateReadiness,
  type DependencyChecks,
  type ReadinessStatus,
} from '../domain/dependency-status.js';
import { probeHttpEndpoint } from '../infrastructure/http-dependency.probe.js';
import { probeTcpEndpoint } from '../infrastructure/tcp-dependency.probe.js';

export interface ReadinessResult {
  readonly status: ReadinessStatus;
  readonly checks: DependencyChecks;
}

/**
 * Evaluates readiness of the local infrastructure dependencies provisioned in phase 1:
 * PostgreSQL, Redis and the S3-compatible object storage (04 §3.3).
 *
 * All probes run concurrently and each one is individually bounded by
 * `HEALTH_CHECK_TIMEOUT_MS`, so a hanging dependency cannot stall the probe endpoint.
 */
@Injectable()
export class ReadinessService {
  public constructor(private readonly appConfig: AppConfigService) {}

  public async check(): Promise<ReadinessResult> {
    const timeoutMs = this.appConfig.healthCheckTimeoutMs;

    const [database, redis, objectStorage] = await Promise.all([
      probeTcpEndpoint(this.appConfig.databaseEndpoint, timeoutMs),
      probeTcpEndpoint(this.appConfig.redisEndpoint, timeoutMs),
      probeHttpEndpoint(this.appConfig.objectStorageHealthUrl, timeoutMs),
    ]);

    const checks: DependencyChecks = { database, redis, objectStorage };

    return { status: aggregateReadiness(checks), checks };
  }
}

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  aggregateReadiness,
  type DependencyChecks,
  type DependencyStatus,
  type ReadinessStatus,
} from '../domain/dependency-status.js';
import { probeHttpEndpoint } from '../infrastructure/http-dependency.probe.js';
import { probeTcpEndpoint } from '../infrastructure/tcp-dependency.probe.js';

export interface ReadinessResult {
  readonly status: ReadinessStatus;
  readonly checks: DependencyChecks;
}

/**
 * Evaluates readiness of the local infrastructure dependencies (04 §3.3).
 *
 * The `database` check runs a real `select 1` through the Prisma client using the
 * `copilot_app` credential, so readiness now proves an actual PostgreSQL round trip rather
 * than mere socket reachability. That replaces the phase 1 TCP placeholder, which could
 * report `up` for a listening but unusable server.
 *
 * `redis` and `objectStorage` keep their phase 1 probes: no client exists for either yet,
 * and inventing one would pull later phases forward (04 §4.3).
 *
 * All probes run concurrently and each is bounded by `HEALTH_CHECK_TIMEOUT_MS`, so a hanging
 * dependency cannot stall the endpoint.
 */
@Injectable()
export class ReadinessService {
  public constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  public async check(): Promise<ReadinessResult> {
    const timeoutMs = this.appConfig.healthCheckTimeoutMs;

    const [database, redis, objectStorage] = await Promise.all([
      this.probeDatabase(timeoutMs),
      probeTcpEndpoint(this.appConfig.redisEndpoint, timeoutMs),
      probeHttpEndpoint(this.appConfig.objectStorageHealthUrl, timeoutMs),
    ]);

    const checks: DependencyChecks = { database, redis, objectStorage };

    return { status: aggregateReadiness(checks), checks };
  }

  /**
   * Bounds the database round trip by the same timeout as the other probes.
   *
   * A driver that hangs on an unreachable host must not hold the probe open, and the
   * rejection reason is discarded rather than inspected: it can carry a connection string or
   * raw server detail (09 §11).
   */
  private async probeDatabase(timeoutMs: number): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<DependencyStatus>((resolve) => {
      timer = setTimeout(() => {
        resolve('down');
      }, timeoutMs);
    });

    try {
      const reachable = await Promise.race([
        this.prisma.isReachable().then((ok): DependencyStatus => (ok ? 'up' : 'down')),
        timeout,
      ]);

      return reachable;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

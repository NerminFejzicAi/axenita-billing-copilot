import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

import { API_SERVICE_NAME, logAttributes } from '../common/observability/log-attributes.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Single Prisma client for the API process (04 §4.4 step 7 — "PrismaService singleton").
 *
 * Credential boundary, the most important property of this class:
 *
 * - it is constructed **only** from `DATABASE_URL`, the `copilot_app` credential
 *   (02 §3.2, §3.4);
 * - `MIGRATION_DATABASE_URL` is not part of the runtime environment schema at all, so no
 *   runtime code path — including this one — can reach the migrator credential
 *   (02 §3.4, D-023 clause 6, AGENTS.md §5.2);
 * - `copilot_app` is `NOBYPASSRLS` and owns nothing, so the tenant isolation introduced in
 *   phase 4 rests on the database, not on this class.
 *
 * The connection string never reaches a log line (09 §11). Failures are reported with the
 * static message plus allowlisted attributes only.
 *
 * Extending `PrismaClient` keeps the generated model delegates available to repositories in
 * later phases. Business modules must still go through repositories and must never expose a
 * Prisma type as an API model (00 §5.2, 02 §26).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly startupConnectTimeoutMs: number;

  public constructor(appConfig: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: appConfig.databaseUrl }),
    });

    this.startupConnectTimeoutMs = appConfig.healthCheckTimeoutMs;
  }

  /**
   * Opens the pool eagerly so a healthy process reports readiness on its first probe.
   *
   * A failure here is logged and swallowed on purpose. 01 §17.1 states that an unavailable
   * PostgreSQL makes *readiness* fail — it does not make the process illegitimate. Throwing
   * would turn a recoverable dependency outage into a crash loop and would remove the very
   * endpoint an operator needs to diagnose it. The client reconnects on demand, and
   * `/health/ready` reports `down` until it succeeds.
   *
   * The rejection reason is never inspected: it can carry the connection string (09 §11).
   */
  public async onModuleInit(): Promise<void> {
    // The attempt is bounded: a driver retrying against an unreachable host must not hold
    // startup open. The rejection is absorbed here so no unhandled rejection escapes when
    // the race is won by the timer.
    const connected = this.$connect().then(
      () => true,
      () => false,
    );

    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, this.startupConnectTimeoutMs);
    });

    try {
      if (await Promise.race([connected, timedOut])) {
        this.logger.log(
          logAttributes({
            message: 'Database connection established',
            service: API_SERVICE_NAME,
            action: 'DATABASE_CONNECTED',
            dependency: 'database',
          }),
        );
        return;
      }

      this.logger.warn(
        logAttributes({
          message: 'Database not reachable at startup; readiness will report it as down',
          service: API_SERVICE_NAME,
          action: 'DATABASE_UNAVAILABLE',
          dependency: 'database',
          errorCode: 'DEPENDENCY_UNAVAILABLE',
        }),
      );
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Releases the pool on shutdown so `enableShutdownHooks` can drain cleanly.
   *
   * Bounded for the same reason as the startup connect: when the database is unreachable, a
   * connection attempt may still be in flight and `$disconnect()` would wait for it,
   * turning a shutdown into a hang. Shutdown must always complete.
   */
  public async onModuleDestroy(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.startupConnectTimeoutMs);
    });

    try {
      await Promise.race([this.$disconnect().catch(() => undefined), timedOut]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Cheap liveness query for the readiness probe.
   *
   * `select 1` requires no table and no grant beyond `CONNECT`, so it stays valid while the
   * schema is still empty and keeps working once phase 3 introduces tables. It proves a real
   * PostgreSQL round trip through the Prisma client, which the phase 1 TCP probe could not.
   *
   * Returns a boolean rather than throwing: the driver error may carry a connection string
   * or server detail, and none of that may reach a log line or an HTTP response
   * (09 §11, 03 §1).
   */
  public async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`select 1`;
      return true;
    } catch {
      return false;
    }
  }
}

import { type DynamicModule, Module } from '@nestjs/common';

import { CommonModule } from './common/common.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * Root module.
 *
 * Built through `forRoot()` so that configuration is read when an application instance is
 * created rather than when this file is imported (see `AppConfigModule`).
 *
 * Phase 1 wires only technical infrastructure: validated configuration, cross-cutting
 * error handling and the health endpoints. Business modules listed in 01 §6 are introduced
 * by their own phases and must not be stubbed here (04 §3.4).
 */
@Module({})
export class AppModule {
  public static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [AppConfigModule.forRoot(), CommonModule, HealthModule],
    };
  }
}

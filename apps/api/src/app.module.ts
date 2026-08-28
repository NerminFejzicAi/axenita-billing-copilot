import { type DynamicModule, Module } from '@nestjs/common';

import { CommonModule } from './common/common.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';

/**
 * Root module.
 *
 * Built through `forRoot()` so that configuration is read when an application instance is
 * created rather than when this file is imported (see `AppConfigModule`).
 *
 * Wires validated configuration, cross-cutting error handling, the database access layer, the
 * health endpoints and — from phase 3 — the identity domain that owns `GET /me` (04 §5.2).
 * The remaining business modules listed in 01 §6 are introduced by their own phases and must
 * not be stubbed here (04 §3.4).
 *
 * `CryptoModule` is imported although no route consumes it yet, and that is the whole point:
 * building it here is what makes `LocalStaticKeyProvider`'s D-025 clause 10 guards run at
 * STARTUP, so a process configured with a production environment, a malformed key, the
 * prohibited development fixture or no key version refuses to come up (04 §7.5 slice P5-I3A).
 */
@Module({})
export class AppModule {
  public static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(),
        CommonModule,
        CryptoModule,
        DatabaseModule,
        HealthModule,
        IdentityModule,
      ],
    };
  }
}

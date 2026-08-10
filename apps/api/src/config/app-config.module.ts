import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service.js';
import { validateEnvironment } from './environment.schema.js';

/**
 * Global configuration module.
 *
 * Exposed as a dynamic module on purpose. `ConfigModule.forRoot` reads the environment and
 * runs `validateEnvironment` at the moment it is called; if it were placed in a static
 * `@Module` decorator it would execute once per process at import time. Deferring it to a
 * `forRoot()` call means configuration is bound to an application instance, which keeps the
 * production bootstrap honest and lets the end-to-end suite assert behaviour under
 * different environments (08 §2.3).
 *
 * An invalid or incomplete environment aborts the bootstrap instead of producing a
 * half-configured process (04 §3.5 step 6, 09 §1).
 *
 * `.env` files are a development convenience only. Production configuration comes from the
 * deployment environment and a secrets manager (00 §12, 09 §9).
 */
@Global()
@Module({})
export class AppConfigModule {
  public static forRoot(): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          // Nearest file wins: the API-local file, then the repository root file.
          envFilePath: ['.env', '../../.env'],
          expandVariables: false,
          validate: validateEnvironment,
        }),
      ],
      providers: [AppConfigService],
      exports: [AppConfigService],
    };
  }
}

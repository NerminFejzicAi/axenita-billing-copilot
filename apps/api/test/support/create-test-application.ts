import { type DynamicModule, type INestApplication, type LoggerService } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap/configure-application.js';

/** Environment overrides applied for the lifetime of one application instance. */
export type EnvironmentOverrides = Readonly<Record<string, string>>;

interface CreateOptions {
  /**
   * Factory for the root module. Called while the environment overrides are active, which
   * is what makes per-test configuration possible: the module's `forRoot()` reads and
   * validates the environment at call time.
   */
  readonly rootModule?: () => DynamicModule;
  readonly environment?: EnvironmentOverrides;
  /**
   * Replaces the application logger after the global configuration is applied, so a spec
   * can assert exactly what the application would write to its logs.
   */
  readonly logger?: LoggerService;
}

/**
 * Boots the application exactly the way `main.ts` does, including every global concern
 * registered by `configureApplication`.
 *
 * The caller may swap the root module so that infrastructure such as the validation pipe
 * can be exercised without adding a placeholder business endpoint to `src` (04 §3.4).
 */
export async function createTestApplication(
  options: CreateOptions = {},
): Promise<NestExpressApplication> {
  const previous = applyEnvironment(options.environment ?? {});

  try {
    const rootModule = options.rootModule ?? ((): DynamicModule => AppModule.forRoot());

    const moduleRef = await Test.createTestingModule({
      imports: [rootModule()],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      bufferLogs: true,
    });

    configureApplication(app);

    // After `configureApplication`, which installs the configured log levels.
    if (options.logger !== undefined) {
      app.useLogger(options.logger);
    }

    await app.init();

    return app;
  } finally {
    restoreEnvironment(previous);
  }
}

/** Closes an application created by `createTestApplication`. */
export async function closeTestApplication(app: INestApplication | undefined): Promise<void> {
  if (app !== undefined) {
    await app.close();
  }
}

function applyEnvironment(
  overrides: EnvironmentOverrides,
): ReadonlyMap<string, string | undefined> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return previous;
}

function restoreEnvironment(previous: ReadonlyMap<string, string | undefined>): void {
  for (const [key, value] of previous) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

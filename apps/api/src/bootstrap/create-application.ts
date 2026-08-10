import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '../app.module.js';
import { configureApplication } from './configure-application.js';

/**
 * Builds the fully configured application without starting the HTTP listener.
 *
 * Factory options and why each one is set:
 *
 * - `bodyParser: false` — disables Nest's default parsers so that `configureApplication`
 *   can register them with an explicit size limit (09 §14).
 * - `bufferLogs: true` — holds startup logs until the configured log level is applied, so
 *   a production process cannot emit debug output before configuration is read.
 * - `autoFlushLogs: false` — on an initialisation failure Nest writes the raw exception,
 *   including its message and stack, through its own `ExceptionHandler` logger. Buffering
 *   without auto flush means that entry is discarded instead of printed, leaving the
 *   caller's sanitised bootstrap log as the only output (09 §11). The success path flushes
 *   explicitly in `configureApplication`.
 * - `abortOnError: false` — makes Nest rethrow instead of aborting the process, so the
 *   caller's own failure handler runs and decides what may be logged.
 */
export async function createApplication(): Promise<NestExpressApplication> {
  const rootModule = AppModule.forRoot();

  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    bodyParser: false,
    bufferLogs: true,
    autoFlushLogs: false,
    abortOnError: false,
  });

  configureApplication(app);

  return app;
}

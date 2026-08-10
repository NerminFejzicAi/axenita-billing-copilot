import 'reflect-metadata';

import { ConsoleLogger, Logger } from '@nestjs/common';

import { API_SERVICE_NAME, logAttributes } from './common/observability/log-attributes.js';
import { describeBootstrapFailure } from './bootstrap/bootstrap-failure.js';
import { createApplication } from './bootstrap/create-application.js';
import { AppConfigService } from './config/app-config.service.js';

/**
 * Process entry point.
 *
 * A configuration failure aborts the process with exit code 1 instead of starting a
 * half-configured API (09 §1 — a failure is never disguised as success).
 */
async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const appConfig = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  await app.listen(appConfig.httpPort, appConfig.httpHost);

  // 09 §11 — allowlisted attributes only. The listen host/port and the base path are
  // deliberately absent: they are not allowlisted fields, and the framework already
  // reports the mapped routes at LOG level.
  logger.log(
    logAttributes({
      message: 'API started',
      service: API_SERVICE_NAME,
      environment: appConfig.nodeEnvironment,
      action: 'API_STARTED',
    }),
  );
}

try {
  await bootstrap();
} catch (error) {
  // The factory attached a log buffer that is never auto flushed, so the framework's raw
  // exception dump stays unwritten. Detaching without flushing discards that entry and
  // restores direct logging, so the sanitised line below is what the operator sees.
  Logger.detachBuffer();

  // The exception is deliberately not inspected beyond its type. See
  // `describeBootstrapFailure` for why no message and no stack may be logged.
  new ConsoleLogger('Bootstrap').error(describeBootstrapFailure(error));
  process.exitCode = 1;
}

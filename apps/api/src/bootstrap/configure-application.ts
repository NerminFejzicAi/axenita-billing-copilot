import { ValidationPipe, VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { API_GLOBAL_PREFIX } from '@axenita/contracts';

import { createValidationException } from '../common/errors/validation-exception.factory.js';
import { REQUEST_ID_HEADER_NAME } from '../common/request-context/request-context.constants.js';
import { requestIdMiddleware } from '../common/request-context/request-id.middleware.js';
import { AppConfigService } from '../config/app-config.service.js';
import { resolveLogLevels } from './log-levels.js';

/**
 * Headers the API accepts from a browser client.
 *
 * Kept in sync with 03 §3 and 00 §8.2. Phase 1 does not implement authentication,
 * idempotency or optimistic locking, but the allowlist has to name the headers up front,
 * otherwise a browser preflight would fail the moment those phases land.
 */
const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  'If-Match',
  'Idempotency-Key',
  'X-Practice-ID',
  REQUEST_ID_HEADER_NAME,
];

const CORS_EXPOSED_HEADERS = [REQUEST_ID_HEADER_NAME, 'ETag'];

const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

/**
 * Applies every global HTTP concern of the API.
 *
 * Shared by the production bootstrap and the end-to-end tests, so tests exercise exactly
 * the configuration that runs in production (08 §2.3).
 */
export function configureApplication(app: NestExpressApplication): void {
  const appConfig = app.get(AppConfigService);

  app.useLogger(resolveLogLevels(appConfig.logLevel));

  // The factory buffers startup logs and does not auto flush them, so that a failed
  // initialisation cannot print the framework's raw exception dump. Initialisation has
  // succeeded by the time this runs, so the buffered framework logs are released here.
  app.flushLogs();

  // Correlation id first: every later middleware, guard, pipe and filter must be able to
  // read it (03 §3.5).
  app.use(requestIdMiddleware);

  // 09 §14 — Helmet and a bounded request body.
  app.use(helmet());
  app.useBodyParser('json', { limit: appConfig.bodyLimit });
  app.useBodyParser('urlencoded', { limit: appConfig.bodyLimit, extended: true });

  // D-007 — URI versioning under `/api/v1`.
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableVersioning({ type: VersioningType.URI });

  // 09 §14 — explicit CORS allowlist. An origin that is not listed simply receives no
  // CORS headers; the request is not answered with an error that would leak the policy.
  const allowedOrigins = appConfig.corsAllowedOrigins;
  app.enableCors({
    origin: (origin, callback) => {
      // A missing `Origin` header means a non-browser client, which CORS does not govern.
      callback(null, origin === undefined || allowedOrigins.includes(origin));
    },
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: false,
    maxAge: 600,
  });

  // 00 §8.4 — whitelist, reject unknown fields, no implicit type coercion.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
      validationError: { target: false, value: false },
      exceptionFactory: createValidationException,
    }),
  );

  app.enableShutdownHooks();
}

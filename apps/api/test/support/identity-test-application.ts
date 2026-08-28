import 'reflect-metadata';

import { type NestExpressApplication } from '@nestjs/platform-express';

import { type DisposableDatabase } from './disposable-database.js';
import { securityDatabase } from './phase3-security-context.js';
import { createTestApplication } from './create-test-application.js';
import { DEVELOPMENT_AUTH_FIXTURE } from './development-token.js';

/**
 * Boots the real application against the disposable phase 3 database.
 *
 * The suite this belongs to owns its database outright: it is created empty, migrated through
 * `migrate deploy` and seeded by the global setup, and dropped afterwards (08 §3). Neither the
 * development database `copilot` nor the shared integration database `copilot_test` is ever a
 * target — `assertDisposableTarget` refuses anything that is not a local `copilot_gate3b_*`
 * database before a connection is opened.
 *
 * The application is built through `createTestApplication`, so it runs the same
 * `configureApplication` bootstrap as production: same global prefix, same versioning, same
 * validation pipe, same Problem Details filter.
 *
 * A spec that has to MUTATE seeded rows passes its own disposable database instead of the
 * shared one, so the frozen phase 3 seed the other security specs assert against stays intact.
 */
export async function createIdentityTestApplication(
  target: DisposableDatabase = securityDatabase(),
): Promise<NestExpressApplication> {
  const disposable = target;

  return createTestApplication({
    environment: {
      NODE_ENV: 'test',
      API_PORT: '3001',
      API_HOST: '127.0.0.1',
      API_CORS_ALLOWED_ORIGINS: '',
      API_PROBLEM_TYPE_BASE_URL: 'https://api.example.ch/problems',
      API_BODY_LIMIT: '1mb',
      LOG_LEVEL: 'error',
      // The runtime credential of the disposable database — `copilot_app`, NOBYPASSRLS,
      // owner of nothing (02 §3.2, §3.4). The migrator credential is never given to the app.
      DATABASE_URL: disposable.app,
      REDIS_URL: 'redis://127.0.0.1:1',
      OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:1',
      OBJECT_STORAGE_HEALTH_PATH: '/minio/health/live',
      HEALTH_CHECK_TIMEOUT_MS: '5000',
      DEV_AUTH_JWT_SECRET: DEVELOPMENT_AUTH_FIXTURE.secret,
      DEV_AUTH_JWT_ISSUER: DEVELOPMENT_AUTH_FIXTURE.issuer,
      DEV_AUTH_JWT_AUDIENCE: DEVELOPMENT_AUTH_FIXTURE.audience,
      // Local development encryption key of D-025 clause 9. A deterministic, clearly labelled
      // NON-SECRET fixture, mandatory since the encryption primitives became part of the
      // application module: without it the application under test refuses to start.
      ENCRYPTION_LOCAL_KEY: 'YXhlbml0YS1zZWN1cml0eS10ZXN0LWVuYy1rZXkzMmI=',
      ENCRYPTION_KEY_VERSION: '1',
    },
  });
}

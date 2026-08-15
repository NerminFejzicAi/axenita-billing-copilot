import 'reflect-metadata';

import { DEVELOPMENT_AUTH_FIXTURE } from '../support/development-token.js';
import { integrationDatabaseUrls } from './integration-test-database.js';

/**
 * Baseline environment for the integration suite.
 *
 * The application under test is pointed at the isolated test database through the
 * `copilot_app` credential — never the development database and never a migration
 * credential (08 §3, 02 §3.4).
 *
 * Redis and object storage keep their real local endpoints: the compose stack is running
 * for these tests anyway, so readiness can be asserted as genuinely healthy.
 */
const urls = integrationDatabaseUrls();

const BASELINE_ENVIRONMENT: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  API_HOST: '127.0.0.1',
  API_CORS_ALLOWED_ORIGINS: '',
  API_PROBLEM_TYPE_BASE_URL: 'https://api.example.ch/problems',
  API_BODY_LIMIT: '1mb',
  LOG_LEVEL: 'error',
  DATABASE_URL: urls.app,
  REDIS_URL: process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
  OBJECT_STORAGE_ENDPOINT: process.env['OBJECT_STORAGE_ENDPOINT'] ?? 'http://127.0.0.1:9000',
  OBJECT_STORAGE_HEALTH_PATH: '/minio/health/live',
  HEALTH_CHECK_TIMEOUT_MS: '5000',
  DEV_AUTH_JWT_SECRET: DEVELOPMENT_AUTH_FIXTURE.secret,
  DEV_AUTH_JWT_ISSUER: DEVELOPMENT_AUTH_FIXTURE.issuer,
  DEV_AUTH_JWT_AUDIENCE: DEVELOPMENT_AUTH_FIXTURE.audience,
};

for (const [key, value] of Object.entries(BASELINE_ENVIRONMENT)) {
  process.env[key] = value;
}

// The migrator credential must never be visible to the application under test
// (02 §3.4, D-023 clause 6). The suite reads it from TEST_MIGRATION_DATABASE_URL only.
delete process.env['MIGRATION_DATABASE_URL'];

import 'reflect-metadata';

/**
 * Deterministic baseline environment for every test file.
 *
 * Values are fixtures, never real credentials (12 §14, 09 §9). Individual specs override
 * single variables before building an application instance.
 *
 * Dependency endpoints deliberately point at a closed local port so that a suite which
 * forgets to stub a dependency reports `down` instead of silently reaching a developer's
 * running Docker stack.
 */
const BASELINE_ENVIRONMENT: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  API_HOST: '127.0.0.1',
  API_CORS_ALLOWED_ORIGINS: '',
  API_PROBLEM_TYPE_BASE_URL: 'https://api.example.ch/problems',
  API_BODY_LIMIT: '1mb',
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://test_user:test_password@127.0.0.1:1/copilot_test',
  REDIS_URL: 'redis://127.0.0.1:1',
  OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:1',
  OBJECT_STORAGE_HEALTH_PATH: '/minio/health/live',
  HEALTH_CHECK_TIMEOUT_MS: '1000',
};

for (const [key, value] of Object.entries(BASELINE_ENVIRONMENT)) {
  process.env[key] = value;
}

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import {
  startHealthyDependencies,
  type StubbedDependencies,
  UNREACHABLE_DEPENDENCIES,
} from './support/stub-dependencies.js';

describe('GET /api/v1/health/live', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({ environment: UNREACHABLE_DEPENDENCIES });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given a running process when liveness is requested then it answers 200 up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ status: 'up' });
  });

  it('given unreachable dependencies when liveness is requested then it still answers 200', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
  });

  it('given the unversioned path when requested then it is not routed', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live');

    expect(response.status).toBe(404);
  });

  it('given the unprefixed path when requested then it is not routed', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health/live');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/v1/health/ready — socket-only dependencies', () => {
  let app: NestExpressApplication;
  let dependencies: StubbedDependencies;

  beforeAll(async () => {
    dependencies = await startHealthyDependencies();
    app = await createTestApplication({ environment: dependencies.environment });
  });

  afterAll(async () => {
    await closeTestApplication(app);
    await dependencies.close();
  });

  /**
   * Regression guard for the phase 2 probe upgrade.
   *
   * The stub is a plain TCP listener. It satisfied the phase 1 reachability probe, which is
   * exactly the weakness that probe had. Since the database check now performs a real
   * `select 1` through Prisma, a listening-but-not-PostgreSQL endpoint must report `down`.
   *
   * The fully healthy path needs a real PostgreSQL and therefore lives in the integration
   * suite (08 §2.2), which keeps this end-to-end suite runnable without Docker.
   */
  it('given a listener that is not PostgreSQL when readiness is requested then database is down', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toStrictEqual({
      status: 'degraded',
      checks: { database: 'down', redis: 'up', objectStorage: 'up' },
    });
  });
});

describe('GET /api/v1/health/ready — dependencies unreachable', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({ environment: UNREACHABLE_DEPENDENCIES });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given unreachable dependencies when readiness is requested then it answers 503 degraded', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toStrictEqual({
      status: 'degraded',
      checks: { database: 'down', redis: 'down', objectStorage: 'down' },
    });
  });

  it('given a readiness response when inspected then no endpoint or credential is exposed', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('127.0.0.1');
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('redis://');
    expect(serialised).not.toContain('test_password');
  });
});

describe('GET /api/v1/health/ready — partial outage', () => {
  let app: NestExpressApplication;
  let dependencies: StubbedDependencies;

  beforeAll(async () => {
    dependencies = await startHealthyDependencies();
    app = await createTestApplication({
      environment: {
        ...dependencies.environment,
        REDIS_URL: 'redis://127.0.0.1:1',
      },
    });
  });

  afterAll(async () => {
    await closeTestApplication(app);
    await dependencies.close();
  });

  it('given one failing dependency when readiness is requested then it is reported individually', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    // `objectStorage` stays up while `redis` is pointed at a closed port, which proves the
    // checks are independent. `database` is down because this suite runs without a real
    // PostgreSQL — see the socket-only describe above.
    expect(response.status).toBe(503);
    expect(response.body).toStrictEqual({
      status: 'degraded',
      checks: { database: 'down', redis: 'down', objectStorage: 'up' },
    });
  });
});

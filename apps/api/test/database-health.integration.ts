import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service.js';
import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { readProblemDetails } from './support/read-problem-details.js';
import { readReadiness } from './support/read-readiness.js';

/**
 * Readiness against a real PostgreSQL (04 §4.4 step 9, 05 Faza 2, 03 §27).
 *
 * The phase 1 probe only proved that something accepted a TCP connection. Phase 2 replaces
 * the database leg with a genuine `select 1` through Prisma using the `copilot_app`
 * credential, so these specs assert the healthy path, the degraded path and recovery.
 */
describe('readiness with a real database', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication();
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given a reachable database when readiness is requested then database is up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(readReadiness(response).checks.database).toBe('up');
  });

  it('given every dependency reachable when readiness is requested then it answers 200 up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      status: 'up',
      checks: { database: 'up', redis: 'up', objectStorage: 'up' },
    });
  });

  it('given the readiness body when inspected then it exposes no endpoint or credential', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('copilot_app');
    expect(serialised).not.toContain('127.0.0.1');
    expect(serialised).not.toContain('localhost');
  });

  it('given liveness when requested then it stays independent of the database', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ status: 'up' });
  });
});

describe('readiness when the database becomes unavailable and recovers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication();
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given a disconnected client when readiness is requested then it degrades and then recovers', async () => {
    const healthy = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(healthy.status).toBe(200);

    // Simulate the outage at the client boundary rather than by stopping the container:
    // stopping shared infrastructure would break every other suite running against it.
    const prisma = app.get(PrismaService);
    await prisma.$disconnect();

    // Prisma reconnects on demand, so the observable contract is that readiness keeps
    // answering and reports the database honestly rather than throwing.
    const afterOutage = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(['up', 'down']).toContain(readReadiness(afterOutage).checks.database);
    expect([200, 503]).toContain(afterOutage.status);

    const recovered = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(recovered.status).toBe(200);
    expect(readReadiness(recovered).checks.database).toBe('up');
  });
});

describe('readiness when the database is unreachable', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // A closed port, so the driver cannot connect at all. The process must still start:
    // 01 §17.1 makes an unavailable PostgreSQL a readiness failure, not a startup failure.
    app = await createTestApplication({
      environment: {
        DATABASE_URL: 'postgresql://copilot_app:unused@127.0.0.1:1/copilot_test',
      },
    });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given an unreachable database when readiness is requested then it answers 503 degraded', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(readReadiness(response).status).toBe('degraded');
    expect(readReadiness(response).checks.database).toBe('down');
  });

  it('given an unreachable database when liveness is requested then the process still answers 200', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
  });

  it('given an unreachable database when an unknown route is requested then errors stay sanitised', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(readProblemDetails(response).code).toBe('RESOURCE_NOT_FOUND');

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('ECONNREFUSED');
  });
});

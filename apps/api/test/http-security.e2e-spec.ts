import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { UNREACHABLE_DEPENDENCIES } from './support/stub-dependencies.js';
import { readProblemDetails } from './support/read-problem-details.js';

const ALLOWED_ORIGIN = 'http://localhost:3000';
const SECOND_ALLOWED_ORIGIN = 'https://app.example.ch';
const DISALLOWED_ORIGIN = 'https://evil.example.com';

describe('CORS allowlist', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({
      environment: {
        ...UNREACHABLE_DEPENDENCIES,
        API_CORS_ALLOWED_ORIGINS: `${ALLOWED_ORIGIN},${SECOND_ALLOWED_ORIGIN}`,
      },
    });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it.each([ALLOWED_ORIGIN, SECOND_ALLOWED_ORIGIN])(
    'given the allowlisted origin %s when requesting then the origin is echoed',
    async (origin) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('Origin', origin);

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    },
  );

  it('given an origin outside the allowlist when requesting then no CORS header is returned', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', DISALLOWED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('given an allowlisted preflight when sent then the contract headers are permitted', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/health/live')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-practice-id,idempotency-key');

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);

    const allowedHeaders = String(response.headers['access-control-allow-headers']).toLowerCase();
    expect(allowedHeaders).toContain('authorization');
    expect(allowedHeaders).toContain('x-practice-id');
    expect(allowedHeaders).toContain('x-request-id');
    expect(allowedHeaders).toContain('idempotency-key');
    expect(allowedHeaders).toContain('if-match');

    const exposedHeaders = String(response.headers['access-control-expose-headers']).toLowerCase();
    expect(exposedHeaders).toContain('x-request-id');
  });

  it('given a preflight from a foreign origin when sent then the origin is not echoed', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/health/live')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('given no Origin header when requesting then the request is served as a non-browser client', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CORS default deny', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({
      environment: { ...UNREACHABLE_DEPENDENCIES, API_CORS_ALLOWED_ORIGINS: '' },
    });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given an empty allowlist when a browser requests then no origin is allowed', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Security headers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({ environment: UNREACHABLE_DEPENDENCIES });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given any response when inspected then Helmet baseline headers are present', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('given any response when inspected then the framework is not advertised', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Request body limit', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({
      environment: { ...UNREACHABLE_DEPENDENCIES, API_BODY_LIMIT: '1kb' },
    });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given a body above the configured limit when posted then it is rejected as a client error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send({ padding: 'x'.repeat(4096) });

    // A body parser rejection is a request format problem, never a server failure.
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(readProblemDetails(response).code).toBe('VALIDATION_ERROR');
    expect(readProblemDetails(response).detail).toBe('The request could not be processed.');
    expect(JSON.stringify(response.body)).not.toContain('at ');
    expect(JSON.stringify(response.body)).not.toContain('node_modules');
  });

  it('given a body within the configured limit when posted then it reaches routing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send({ padding: 'x' });

    // No POST handler exists on the health resource, so routing answers 404 rather than
    // the body parser answering 400.
    expect(response.status).toBe(404);
    expect(readProblemDetails(response).code).toBe('RESOURCE_NOT_FOUND');
  });
});

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { readProblemDetails } from './support/read-problem-details.js';
import { UNREACHABLE_DEPENDENCIES } from './support/stub-dependencies.js';

/**
 * `POST /api/v1/encounters` through the full application module, with every dependency
 * unreachable (`P5-I5B`).
 *
 * The route is registered, sits behind the shared authentication guard, and refuses an
 * unauthenticated caller with the canonical `401` Problem Details document BEFORE the body is
 * judged — a malformed body must not earn a field-level `422`. The request id is propagated into
 * the header and the body. The database-backed behaviour (201, FK mapping, idempotency, audit) is
 * proven in `phase5-encounter-create.security.ts`.
 */

const CLIENT_REQUEST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('POST /api/v1/encounters (e2e envelope)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({ environment: UNREACHABLE_DEPENDENCIES });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('answers an unauthenticated caller 401 problem+json and propagates the request id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set('X-Request-ID', CLIENT_REQUEST_ID)
      .set('Idempotency-Key', 'p5i5b-e2e-0001')
      .send({ notes: 'unknown member that must not be judged' });

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.headers['x-request-id']).toBe(CLIENT_REQUEST_ID);

    const problem = readProblemDetails(response);

    expect(problem.code).toBe('AUTHENTICATION_REQUIRED');
    expect(problem.status).toBe(401);
    expect(problem.instance).toBe('/api/v1/encounters');
    expect(problem.requestId).toBe(CLIENT_REQUEST_ID);
    expect(problem.errors).toBeUndefined();
    expect(JSON.stringify(problem)).not.toContain('unknown member');
  });

  it('does not register the later GET and P5-I5D encounter routes', async () => {
    const id = '9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01';

    for (const [method, path] of [
      ['get', '/api/v1/encounters'],
      ['get', `/api/v1/encounters/${id}`],
      ['post', `/api/v1/encounters/${id}/cancel`],
    ] as const) {
      const response = await request(app.getHttpServer())[method](path);

      expect([method, path, response.status]).toStrictEqual([method, path, 404]);
    }
  });

  // N-1 (owner-approved P5-I5C reconciliation): PATCH is no longer absent. It is registered behind
  // the same authentication guard, so an unauthenticated caller gets 401 — not the router's 404.
  it('registers PATCH /api/v1/encounters/{encounterId} behind the authentication guard (P5-I5C)', async () => {
    const id = '9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01';
    const response = await request(app.getHttpServer()).patch(`/api/v1/encounters/${id}`);

    expect(response.status).toBe(401);
    expect(readProblemDetails(response).code).toBe('AUTHENTICATION_REQUIRED');
  });
});

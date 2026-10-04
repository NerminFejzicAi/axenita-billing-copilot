import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { readProblemDetails } from './support/read-problem-details.js';
import { UNREACHABLE_DEPENDENCIES } from './support/stub-dependencies.js';

/**
 * `PATCH /api/v1/encounters/{encounterId}` through the full application module, with every
 * dependency unreachable (`P5-I5C`; D-087).
 *
 * The route is registered behind the shared authentication guard, and authentication is decided
 * FIRST: before the path identifier, before `If-Match` and before the body — none of which may
 * earn a `400`, `428` or `422` for an unauthenticated caller. The database-backed behaviour is
 * proven in `phase5-encounter-patch.security.ts`.
 */

const CLIENT_REQUEST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

describe('PATCH /api/v1/encounters/{encounterId} (e2e envelope)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({ environment: UNREACHABLE_DEPENDENCIES });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it.each([
    ['a valid id, no If-Match, a forbidden member', '9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01', null],
    ['a malformed id', 'not-a-uuid', '"1"'],
    ['a malformed If-Match', '9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01', 'W/"1"'],
  ])(
    'answers an unauthenticated caller 401 problem+json first (%s)',
    async (_name, id, ifMatch) => {
      let call = request(app.getHttpServer())
        .patch(`/api/v1/encounters/${id}`)
        .set('X-Request-ID', CLIENT_REQUEST_ID);

      if (ifMatch !== null) {
        call = call.set('If-Match', ifMatch);
      }

      const response = await call.send({ status: 'CANCELLED', notes: 'must not be judged' });

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.headers['x-request-id']).toBe(CLIENT_REQUEST_ID);
      expect(response.headers['etag'] ?? '').not.toMatch(/^"\d+"$/);

      const problem = readProblemDetails(response);

      expect(problem.code).toBe('AUTHENTICATION_REQUIRED');
      expect(problem.requestId).toBe(CLIENT_REQUEST_ID);
      expect(problem.errors).toBeUndefined();
      expect(JSON.stringify(problem)).not.toContain('must not be judged');
    },
  );

  it('does not register PATCH on the collection or on a nested path', async () => {
    for (const path of [
      '/api/v1/encounters',
      '/api/v1/encounters/9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01/diagnoses',
    ]) {
      const response = await request(app.getHttpServer()).patch(path);

      expect([path, response.status]).toStrictEqual([path, 404]);
    }
  });
});

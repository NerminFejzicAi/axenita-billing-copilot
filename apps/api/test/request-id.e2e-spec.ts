import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { UNREACHABLE_DEPENDENCIES } from './support/stub-dependencies.js';
import { readProblemDetails } from './support/read-problem-details.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REQUEST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('X-Request-ID', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({ environment: UNREACHABLE_DEPENDENCIES });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given no client header when requesting then the server generates and returns one', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('given a valid client UUID when requesting then it is preserved', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-ID', CLIENT_REQUEST_ID);

    expect(response.headers['x-request-id']).toBe(CLIENT_REQUEST_ID);
  });

  it.each(['not-a-uuid', '../../etc/passwd', 'a'.repeat(512)])(
    'given the untrusted client value %s when requesting then it is replaced',
    async (untrusted) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('X-Request-ID', untrusted);

      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
      expect(response.headers['x-request-id']).not.toBe(untrusted);
    },
  );

  it('given two requests when compared then the generated ids differ', async () => {
    const first = await request(app.getHttpServer()).get('/api/v1/health/live');
    const second = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('given an error response when inspected then header and body carry the same id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(readProblemDetails(response).requestId).toBe(response.headers['x-request-id']);
  });
});

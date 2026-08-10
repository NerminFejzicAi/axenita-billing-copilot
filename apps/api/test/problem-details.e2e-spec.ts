import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { UNREACHABLE_DEPENDENCIES } from './support/stub-dependencies.js';
import { ValidationProbeModule } from './support/validation-probe/validation-probe.module.js';
import { readProblemDetails } from './support/read-problem-details.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('Problem Details', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApplication({
      rootModule: () => ValidationProbeModule.forRoot(),
      environment: UNREACHABLE_DEPENDENCIES,
    });
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given an unknown route when requested then a RESOURCE_NOT_FOUND problem is returned', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'https://api.example.ch/problems/resource-not-found',
      title: 'Resource not found',
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      detail: 'The requested resource was not found.',
      instance: '/api/v1/does-not-exist',
    });
    expect(readProblemDetails(response).requestId).toMatch(UUID_PATTERN);
  });

  it('given a valid payload when posted then the request is accepted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-probe')
      .send({ resourceId: VALID_UUID, label: 'TEST-LABEL-A', amount: 3 });

    expect(response.status).toBe(201);
    expect(response.body).toStrictEqual({ accepted: true });
  });

  it('given invalid fields when posted then a 422 VALIDATION_ERROR problem lists them', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-probe')
      .send({ resourceId: 'not-a-uuid', label: '' });

    expect(response.status).toBe(422);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'https://api.example.ch/problems/validation-error',
      title: 'Validation failed',
      status: 422,
      code: 'VALIDATION_ERROR',
      detail: 'One or more fields are invalid.',
      instance: '/api/v1/validation-probe',
    });

    const fields = (readProblemDetails(response).errors ?? []).map((error) => error.field);
    expect(fields).toContain('resourceId');
    expect(fields).toContain('label');
  });

  it('given an unknown property when posted then it is rejected as UNKNOWN_FIELD', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-probe')
      .send({ resourceId: VALID_UUID, label: 'TEST-LABEL-A', injectedField: 'value' });

    expect(response.status).toBe(422);
    expect(readProblemDetails(response).errors).toContainEqual(
      expect.objectContaining({ field: 'injectedField', code: 'UNKNOWN_FIELD' }),
    );
  });

  it('given a value out of range when posted then the range constraint is reported', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-probe')
      .send({ resourceId: VALID_UUID, label: 'TEST-LABEL-A', amount: 99 });

    expect(response.status).toBe(422);
    expect(readProblemDetails(response).errors).toContainEqual(
      expect.objectContaining({ field: 'amount', code: 'OUT_OF_RANGE' }),
    );
  });

  it('given a deliberate domain error when raised then its catalogue code is used verbatim', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/validation-probe/deliberate-conflict',
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      type: 'https://api.example.ch/problems/version-conflict',
      title: 'Version conflict',
      status: 409,
      code: 'VERSION_CONFLICT',
      detail: 'Resource was modified by another user.',
    });
    expect(response.body).not.toHaveProperty('errors');
  });

  it('given an unexpected exception when raised then no internal detail leaks', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/validation-probe/unexpected-failure',
    );

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      type: 'https://api.example.ch/problems/internal-error',
      title: 'Internal error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected internal error occurred.',
    });

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('boom');
    expect(serialised).not.toContain('internal detail that must never reach the client');
    expect(serialised).not.toContain('at ');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('given malformed JSON when posted then a problem document is returned', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-probe')
      .set('Content-Type', 'application/json')
      .send('{"resourceId": ');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(readProblemDetails(response).code).toBe('VALIDATION_ERROR');
    expect(readProblemDetails(response).detail).toBe('The request could not be processed.');
  });

  it('given a problem response when inspected then it carries the request correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-ID', VALID_UUID);

    expect(readProblemDetails(response).requestId).toBe(VALID_UUID);
    expect(response.headers['x-request-id']).toBe(VALID_UUID);
  });
});

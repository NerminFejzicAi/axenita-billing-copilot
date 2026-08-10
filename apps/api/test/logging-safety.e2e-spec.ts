import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CapturingLogger } from './support/capturing-logger.js';
import { closeTestApplication, createTestApplication } from './support/create-test-application.js';
import { readProblemDetails } from './support/read-problem-details.js';
import { UNREACHABLE_DEPENDENCIES } from './support/stub-dependencies.js';
import {
  LEAKY_MESSAGE_SECRET,
  LEAKY_STACK_SECRET,
  ValidationProbeModule,
} from './support/validation-probe/validation-probe.module.js';

/**
 * Regression suite for 09 §11 — structured allowlist logging.
 *
 * Proves that an unexpected exception produces the sanitised client response AND that
 * nothing from the exception itself reaches the application log.
 */
describe('Application logging safety', () => {
  let app: NestExpressApplication;
  const logger = new CapturingLogger();

  beforeAll(async () => {
    app = await createTestApplication({
      rootModule: () => ValidationProbeModule.forRoot(),
      environment: UNREACHABLE_DEPENDENCIES,
      logger,
    });
  });

  beforeEach(() => {
    logger.clear();
  });

  afterAll(async () => {
    await closeTestApplication(app);
  });

  it('given an unexpected exception when raised then the client still receives 500 INTERNAL_ERROR', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/validation-probe/leaky-failure',
    );

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(readProblemDetails(response)).toMatchObject({
      type: 'https://api.example.ch/problems/internal-error',
      title: 'Internal error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected internal error occurred.',
    });
    expect(JSON.stringify(response.body)).not.toContain(LEAKY_MESSAGE_SECRET);
    expect(JSON.stringify(response.body)).not.toContain(LEAKY_STACK_SECRET);
  });

  it('given sensitive text in the exception message when logged then it never reaches the log', async () => {
    await request(app.getHttpServer()).get('/api/v1/validation-probe/leaky-failure');

    expect(logger.output).not.toContain(LEAKY_MESSAGE_SECRET);
    expect(logger.output).not.toContain('query failed');
  });

  it('given sensitive text in the exception stack when logged then it never reaches the log', async () => {
    await request(app.getHttpServer()).get('/api/v1/validation-probe/leaky-failure');

    expect(logger.output).not.toContain(LEAKY_STACK_SECRET);
    expect(logger.output).not.toContain('    at ');
  });

  it('given a server failure when logged then only allowlisted technical metadata is emitted', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/validation-probe/leaky-failure',
    );
    const requestId = response.headers['x-request-id'];

    const failureEntries = logger.payloads.filter(
      (payload) => payload['action'] === 'HTTP_REQUEST_FAILED',
    );

    expect(failureEntries).toHaveLength(1);

    const entry = failureEntries[0] ?? {};
    expect(entry).toStrictEqual({
      message: 'Unhandled request failure',
      service: 'api',
      action: 'HTTP_REQUEST_FAILED',
      requestId,
      status: 500,
      errorCode: 'INTERNAL_ERROR',
    });

    // 09 §11 allowlist: no attribute outside the permitted set may appear.
    const allowed = new Set([
      'message',
      'service',
      'environment',
      'requestId',
      'practiceId',
      'userId',
      'encounterId',
      'analysisId',
      'jobId',
      'action',
      'status',
      'errorCode',
      'durationMs',
      'dependency',
    ]);
    for (const key of Object.keys(entry)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('given a server failure when logged then the correlation id matches the client document', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/validation-probe/leaky-failure',
    );

    const requestId = readProblemDetails(response).requestId;
    expect(requestId).toBe(response.headers['x-request-id']);
    expect(logger.output).toContain(requestId);
  });

  it('given a handled client error when raised then no server failure is logged', async () => {
    await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expect(
      logger.payloads.filter((payload) => payload['action'] === 'HTTP_REQUEST_FAILED'),
    ).toHaveLength(0);
  });
});

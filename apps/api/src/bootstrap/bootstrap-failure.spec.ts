import { describe, expect, it } from 'vitest';

import {
  type EnvironmentValidationError,
  validateEnvironment,
} from '../config/environment.schema.js';
import {
  BOOTSTRAP_CONFIGURATION_FAILURE_MESSAGE,
  BOOTSTRAP_FAILURE_MESSAGE,
  describeBootstrapFailure,
} from './bootstrap-failure.js';

const ALLOWLISTED_ATTRIBUTES = new Set([
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

function environmentFailure(overrides: Record<string, string>): EnvironmentValidationError {
  try {
    validateEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pw@localhost:5432/copilot',
      REDIS_URL: 'redis://localhost:6379',
      OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
      ...overrides,
    });
  } catch (error) {
    return error as EnvironmentValidationError;
  }

  throw new Error('expected the environment to be rejected');
}

describe('describeBootstrapFailure', () => {
  it('given an arbitrary exception when described then no message or stack is carried over', () => {
    const secretMessage = 'CONNECTION-SECRET-a91f22';
    const secretStack = 'STACK-SECRET-c40b71';
    const error = new Error(`connect failed: ${secretMessage}`);
    error.stack = `Error: connect failed: ${secretMessage}\n    at boot (${secretStack}:1:1)`;

    const attributes = describeBootstrapFailure(error);
    const serialised = JSON.stringify(attributes);

    expect(attributes.message).toBe(BOOTSTRAP_FAILURE_MESSAGE);
    expect(serialised).not.toContain(secretMessage);
    expect(serialised).not.toContain(secretStack);
    expect(serialised).not.toContain('connect failed');
    expect(serialised).not.toContain('    at ');
  });

  it('given a non-Error throw when described then a static payload is produced', () => {
    const attributes = describeBootstrapFailure({ password: 'THROWN-SECRET-77aa10' });

    expect(attributes.message).toBe(BOOTSTRAP_FAILURE_MESSAGE);
    expect(JSON.stringify(attributes)).not.toContain('THROWN-SECRET-77aa10');
  });

  it('given an invalid environment when described then only variable names are named', () => {
    const secret = 'ENV-SECRET-5b3d90';
    const error = environmentFailure({
      DATABASE_URL: `mysql://user:${secret}@localhost:3306/copilot`,
      API_PORT: '0',
    });

    const attributes = describeBootstrapFailure(error);
    const serialised = JSON.stringify(attributes);

    expect(attributes.message).toContain(BOOTSTRAP_CONFIGURATION_FAILURE_MESSAGE);
    expect(attributes.message).toContain('API_PORT');
    expect(attributes.message).toContain('DATABASE_URL');

    // The rejected value, the constraint text and any stack stay out of the log.
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain('mysql://');
    expect(serialised).not.toContain('must not be less than');
    expect(serialised).not.toContain('    at ');
  });

  it('given an invalid environment when described then variable names are plain identifiers', () => {
    const error = environmentFailure({ LOG_LEVEL: 'trace' });

    for (const variable of error.variables) {
      expect(variable).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it.each([
    ['arbitrary error', new Error('boom')],
    ['environment error', environmentFailure({ API_PORT: '0' })],
  ])('given %s when described then every attribute is allowlisted', (_label, error) => {
    const attributes = describeBootstrapFailure(error);

    for (const key of Object.keys(attributes)) {
      expect(ALLOWLISTED_ATTRIBUTES.has(key)).toBe(true);
    }
  });
});

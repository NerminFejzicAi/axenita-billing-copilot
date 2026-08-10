import { describe, expect, it } from 'vitest';

import {
  createProblemDetails,
  detailForStatus,
  errorCodeForStatus,
} from './problem-details.factory.js';

const TYPE_BASE_URL = 'https://api.example.ch/problems';

describe('createProblemDetails', () => {
  it('given a validation problem when built then it matches the contract example shape', () => {
    const problem = createProblemDetails({
      code: 'VALIDATION_ERROR',
      status: 422,
      detail: 'One or more fields are invalid.',
      instance: '/api/v1/encounters',
      requestId: '1c3b0a4e-6b1c-4f0e-9d2a-6b0a5f3f7c11',
      typeBaseUrl: TYPE_BASE_URL,
      errors: [
        {
          field: 'treatmentDate',
          code: 'INVALID_DATE',
          message: 'treatmentDate must be a valid date.',
        },
      ],
    });

    expect(problem).toStrictEqual({
      type: 'https://api.example.ch/problems/validation-error',
      title: 'Validation failed',
      status: 422,
      code: 'VALIDATION_ERROR',
      detail: 'One or more fields are invalid.',
      instance: '/api/v1/encounters',
      requestId: '1c3b0a4e-6b1c-4f0e-9d2a-6b0a5f3f7c11',
      errors: [
        {
          field: 'treatmentDate',
          code: 'INVALID_DATE',
          message: 'treatmentDate must be a valid date.',
        },
      ],
    });
  });

  it('given no field errors when built then the errors member is omitted', () => {
    const problem = createProblemDetails({
      code: 'VERSION_CONFLICT',
      status: 409,
      detail: 'Resource was modified by another user.',
      instance: '/api/v1/encounters/1',
      requestId: 'f0e1d2c3-b4a5-4967-8899-aabbccddeeff',
      typeBaseUrl: TYPE_BASE_URL,
    });

    expect(problem).not.toHaveProperty('errors');
    expect(problem.type).toBe('https://api.example.ch/problems/version-conflict');
    expect(problem.title).toBe('Version conflict');
  });
});

describe('errorCodeForStatus', () => {
  it.each([
    [401, 'AUTHENTICATION_REQUIRED'],
    [403, 'ACCESS_DENIED'],
    [404, 'RESOURCE_NOT_FOUND'],
    [422, 'VALIDATION_ERROR'],
    [429, 'RATE_LIMIT_EXCEEDED'],
    [500, 'INTERNAL_ERROR'],
    [503, 'DEPENDENCY_UNAVAILABLE'],
  ])('given status %i when mapped then the code is %s', (status, expected) => {
    expect(errorCodeForStatus(status)).toBe(expected);
  });

  it('given an unmapped server error when mapped then it falls back to INTERNAL_ERROR', () => {
    expect(errorCodeForStatus(507)).toBe('INTERNAL_ERROR');
  });

  it('given an unmapped client error when mapped then it falls back to VALIDATION_ERROR', () => {
    expect(errorCodeForStatus(418)).toBe('VALIDATION_ERROR');
  });
});

describe('detailForStatus', () => {
  it('given a server error when described then the text carries no internal detail', () => {
    expect(detailForStatus(500)).toBe('An unexpected internal error occurred.');
    expect(detailForStatus(599)).toBe('An unexpected internal error occurred.');
  });

  it('given a client error when described then a safe generic text is used', () => {
    expect(detailForStatus(404)).toBe('The requested resource was not found.');
    expect(detailForStatus(418)).toBe('The request could not be processed.');
  });
});

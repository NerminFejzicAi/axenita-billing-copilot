import { describe, expect, it } from 'vitest';

import { ERROR_CODES, ERROR_TITLES, isErrorCode, toProblemTypeSlug } from './error-codes.js';

/**
 * Regression guard for the frozen catalogue of 03 §8.
 *
 * The literal list below is a copy of the contract. If this test fails, either the
 * catalogue drifted from the contract or the contract changed without an accepted ADR
 * (00 §16).
 */
const CONTRACT_ERROR_CODES = [
  'AUTHENTICATION_REQUIRED',
  'INVALID_TOKEN',
  'ACCESS_DENIED',
  'PRACTICE_CONTEXT_REQUIRED',
  'PRACTICE_CONTEXT_INVALID',
  'RESOURCE_NOT_FOUND',
  'VALIDATION_ERROR',
  'INVALID_CURSOR',
  'VERSION_CONFLICT',
  'PRECONDITION_REQUIRED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'REQUEST_ALREADY_IN_PROGRESS',
  'INVALID_STATE_TRANSITION',
  'REVISION_CONFLICT',
  'ENCOUNTER_NOT_ANALYSABLE',
  'ANALYSIS_ALREADY_RUNNING',
  'ANALYSIS_NOT_APPROVABLE',
  'OPEN_BLOCKING_FINDINGS',
  'APPROVAL_REQUIRED',
  'APPROVAL_REVOKED',
  'INTEGRATION_CONNECTION_NOT_CONFIGURED',
  'INTEGRATION_CONNECTION_REQUIRED',
  'TARIFF_RELEASE_NOT_FOUND',
  'TARIFF_RELEASE_NOT_ACTIVE',
  'TARIFF_ENGINE_UNAVAILABLE',
  'TARIFF_RESPONSE_INVALID',
  'AI_EXTRACTION_FAILED',
  'AI_RESPONSE_INVALID',
  'INTEGRATION_UNAVAILABLE',
  'EXPORT_FAILED',
  'RATE_LIMIT_EXCEEDED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

describe('error code catalogue', () => {
  it('given the frozen contract when compared then the catalogue matches exactly', () => {
    expect([...ERROR_CODES]).toStrictEqual([...CONTRACT_ERROR_CODES]);
  });

  it('given the catalogue when inspected then every code has a title', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_TITLES[code]).toBeTypeOf('string');
      expect(ERROR_TITLES[code].length).toBeGreaterThan(0);
    }
  });

  it('given the catalogue when inspected then codes follow the DOMAIN_REASON convention', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    }
  });

  it('given the catalogue when inspected then there are no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('given a known code when narrowed then the type guard accepts it', () => {
    expect(isErrorCode('VALIDATION_ERROR')).toBe(true);
    expect(isErrorCode('NOT_A_REAL_CODE')).toBe(false);
  });

  it('given a code when converted then the problem type slug matches the contract example', () => {
    expect(toProblemTypeSlug('VALIDATION_ERROR')).toBe('validation-error');
    expect(toProblemTypeSlug('VERSION_CONFLICT')).toBe('version-conflict');
  });

  it('given the contract examples when compared then the titles match verbatim', () => {
    expect(ERROR_TITLES.VALIDATION_ERROR).toBe('Validation failed');
    expect(ERROR_TITLES.VERSION_CONFLICT).toBe('Version conflict');
  });
});

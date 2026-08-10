/**
 * Central, frozen catalogue of stable API error codes.
 *
 * Normative source: `03_API_CONTRACT_V1.md` §8 ("Stabilni error code katalog"), D-008.
 * `12_NAMING_AND_CODE_STANDARDS.md` §11 requires exactly one central catalogue and the
 * `DOMAIN_REASON` shape.
 *
 * Rules:
 * - the set below must stay byte-identical to §8; adding, renaming or removing a code
 *   requires an accepted ADR (00 §16);
 * - a code is stable across localisation — only the human readable message is localised
 *   (D-020);
 * - most codes belong to later phases. They are listed here because the catalogue is a
 *   single frozen artefact, not because the corresponding behaviour exists yet.
 */
export const ERROR_CODES = [
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

export type ErrorCode = (typeof ERROR_CODES)[number];

const ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(ERROR_CODES);

export function isErrorCode(candidate: string): candidate is ErrorCode {
  return ERROR_CODE_SET.has(candidate);
}

/**
 * Short, non-localised titles used as the `title` member of a Problem Details document.
 *
 * The wording of `VALIDATION_ERROR` and `VERSION_CONFLICT` is taken verbatim from the
 * examples in 03 §8 so that the contract examples stay reproducible.
 */
export const ERROR_TITLES: Readonly<Record<ErrorCode, string>> = {
  AUTHENTICATION_REQUIRED: 'Authentication required',
  INVALID_TOKEN: 'Invalid token',
  ACCESS_DENIED: 'Access denied',
  PRACTICE_CONTEXT_REQUIRED: 'Practice context required',
  PRACTICE_CONTEXT_INVALID: 'Practice context invalid',
  RESOURCE_NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation failed',
  INVALID_CURSOR: 'Invalid cursor',
  VERSION_CONFLICT: 'Version conflict',
  PRECONDITION_REQUIRED: 'Precondition required',
  IDEMPOTENCY_KEY_REQUIRED: 'Idempotency key required',
  IDEMPOTENCY_CONFLICT: 'Idempotency conflict',
  REQUEST_ALREADY_IN_PROGRESS: 'Request already in progress',
  INVALID_STATE_TRANSITION: 'Invalid state transition',
  REVISION_CONFLICT: 'Revision conflict',
  ENCOUNTER_NOT_ANALYSABLE: 'Encounter not analysable',
  ANALYSIS_ALREADY_RUNNING: 'Analysis already running',
  ANALYSIS_NOT_APPROVABLE: 'Analysis not approvable',
  OPEN_BLOCKING_FINDINGS: 'Open blocking findings',
  APPROVAL_REQUIRED: 'Approval required',
  APPROVAL_REVOKED: 'Approval revoked',
  INTEGRATION_CONNECTION_NOT_CONFIGURED: 'Integration connection not configured',
  INTEGRATION_CONNECTION_REQUIRED: 'Integration connection required',
  TARIFF_RELEASE_NOT_FOUND: 'Tariff release not found',
  TARIFF_RELEASE_NOT_ACTIVE: 'Tariff release not active',
  TARIFF_ENGINE_UNAVAILABLE: 'Tariff engine unavailable',
  TARIFF_RESPONSE_INVALID: 'Tariff response invalid',
  AI_EXTRACTION_FAILED: 'AI extraction failed',
  AI_RESPONSE_INVALID: 'AI response invalid',
  INTEGRATION_UNAVAILABLE: 'Integration unavailable',
  EXPORT_FAILED: 'Export failed',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  DEPENDENCY_UNAVAILABLE: 'Dependency unavailable',
  INTERNAL_ERROR: 'Internal error',
};

/**
 * Converts an error code into the slug used by the `type` URI, e.g.
 * `VERSION_CONFLICT` becomes `version-conflict` (03 §8).
 */
export function toProblemTypeSlug(code: ErrorCode): string {
  return code.toLowerCase().replace(/_/g, '-');
}

/**
 * URI versioning surface of the REST API.
 *
 * Normative sources:
 * - D-007 (ACCEPTED): the API uses URI versioning under `/api/v1`.
 * - `03_API_CONTRACT_V1.md` §2: base path `/api/v1`.
 * - `00_PROJECT_RULES.md` §8.1: a breaking change moves to `/api/v2`, it never mutates v1.
 *
 * These identifiers are the single source of truth for the prefix and version segment so
 * that the server, the tests and any generated client cannot drift apart (12 §4 — no magic
 * strings).
 */

/** Global HTTP prefix applied in front of every versioned route. */
export const API_GLOBAL_PREFIX = 'api' as const;

/** Version identifier of the current contract. Rendered as `v1` in the URI. */
export const API_VERSION_1 = '1' as const;

/** Every API version that this contract package knows about. */
export type ApiVersion = typeof API_VERSION_1;

/** Fully qualified base path of API v1, e.g. `https://api.example.ch` + `/api/v1`. */
export const API_BASE_PATH = `/${API_GLOBAL_PREFIX}/v${API_VERSION_1}` as const;

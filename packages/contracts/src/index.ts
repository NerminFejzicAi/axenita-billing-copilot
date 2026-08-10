/**
 * Public surface of the shared API contract package.
 *
 * Phase 1 publishes only the versioning surface of the HTTP API. Domain DTOs, the
 * permission catalogue and the error catalogue are introduced by the phases that own the
 * corresponding endpoints.
 */
export {
  API_BASE_PATH,
  API_GLOBAL_PREFIX,
  API_VERSION_1,
  type ApiVersion,
} from './api-versioning.js';

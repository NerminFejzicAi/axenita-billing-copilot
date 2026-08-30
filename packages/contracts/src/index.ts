/**
 * Public surface of the shared API contract package.
 *
 * Phase 1 published only the versioning surface of the HTTP API. Phase 3 adds the permission
 * catalogue and the application role vocabulary, because `GET /me` returns `roles[]` and
 * derived `permissions[]` per membership (`03` §10) and both are part of the HTTP contract.
 * Phase 3 also owns the `GET /me` and `GET /practices/{practiceId}` documents themselves, so
 * their DTOs are published here. Phase 4 adds the frozen settings representation of D-053 clause
 * A.1, because `GET /practices/{practiceId}/settings` renders it. Phase 5 adds the public
 * patient-reference document of `03` §11, because `GET /patient-references/{id}` renders it
 * (D-072 `OD-P5-I4-13`, D-073). The DTOs of later endpoints and the error catalogue are
 * introduced by the phases that own them.
 *
 * The role-to-permission matrix is intentionally absent here: `03` §28.4 keeps the complete
 * matrix in `15_ROLE_PERMISSION_MATRIX_V1.md` so that two independently editable matrices
 * cannot exist. Its single application representation lives in the API permission domain.
 */
export {
  API_BASE_PATH,
  API_GLOBAL_PREFIX,
  API_VERSION_1,
  type ApiVersion,
} from './api-versioning.js';

export {
  ACTIVE_PERMISSIONS,
  RESERVED_PERMISSIONS,
  isActivePermission,
  isReservedPermission,
  type Permission,
  type ReservedPermission,
} from './permission-catalogue.js';

export {
  PLATFORM_ROLES,
  TENANT_MEMBERSHIP_ROLES,
  isPlatformRole,
  isTenantMembershipRole,
  type PlatformRole,
  type TenantMembershipRole,
} from './membership-roles.js';

export { type MeMembershipDto, type MePlatformRoleDto, type MeResponseDto } from './me-contract.js';

export { type PracticeResponseDto } from './practice-contract.js';

export { type PracticeSettingsResponseDto } from './practice-settings-contract.js';

export { type PatientReferenceResponseDto } from './patient-reference-contract.js';

# @axenita/contracts

Workspace package reserved for the shared, transport-level API contract that both the backend
and any generated client consume (04 §3.3, README §4).

## Phase 1 scope

Only the **versioning surface** of the API is published here:

- the global HTTP prefix (`api`) and URI version (`v1`) required by D-007 / 03 §2;
- the resulting base path `/api/v1`.

No DTOs, no domain enums, no permission catalogue and no error catalogue live here yet.
Those belong to the phases that introduce the corresponding endpoints, and the generated
OpenAPI client is a phase 12 concern (04 §14).

## Rules

- this package must never import from `apps/api` (00 §5.2 dependency direction);
- it must stay free of Prisma types and framework types;
- it is ESM/NodeNext like every other Node package in the workspace (D-021).

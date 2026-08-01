# 05 — Implementation Checklist

**Uputstvo:** Checkbox se označava samo ako postoji izvršena provjera ili konkretan dokaz.  
**Status vrijednosti:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

---

# 0. Project metadata

| Polje | Vrijednost |
|---|---|
| Current phase | NOT_STARTED |
| Current branch | |
| Last completed phase | |
| Last commit | |
| Local environment owner | |
| Test DB | |
| Documentation version | 1.0 |
| Last updated | |

---

# 1. Pre-flight

- [ ] Dokumenti su kopirani u root projekta.
- [ ] Cursor vidi `AGENTS.md`.
- [ ] Pročitan `00_PROJECT_RULES.md`.
- [ ] Pročitan `06_DECISION_LOG.md`.
- [ ] Git repository postoji.
- [ ] Working tree je čist.
- [ ] Nema stvarnih secrets u fajlovima.
- [ ] Docker radi.
- [ ] Node/pnpm rade.
- [ ] Project owner je potvrdio fazni pristup.

Evidence:

```text
git status:
node --version:
pnpm --version:
docker version:
```

---

# 2. Faza 1 — Bootstrap

Status: `NOT_STARTED`

## Repository

- [ ] Root `package.json`.
- [ ] `pnpm-workspace.yaml`.
- [ ] lockfile.
- [ ] `.gitignore`.
- [ ] `.editorconfig`.
- [ ] Node version pin.
- [ ] pnpm version pin.
- [ ] `apps/api`.
- [ ] `services/tariff-engine-java`.
- [ ] `packages/contracts`.
- [ ] `infra`.
- [ ] `scripts`.

## API bootstrap

- [ ] NestJS 11.
- [ ] TypeScript strict.
- [ ] ConfigModule.
- [ ] env validation.
- [ ] global `/api` prefix.
- [ ] URI v1.
- [ ] validation pipe.
- [ ] Helmet.
- [ ] CORS allowlist.
- [ ] request ID.
- [ ] Problem Details base.
- [ ] live health.
- [ ] ready health base.

## Docker

- [ ] PostgreSQL 16.
- [ ] Redis 7.
- [ ] MinIO.
- [ ] health checks.
- [ ] named volumes.
- [ ] no production secrets.

## Verification

- [ ] `pnpm lint`.
- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `pnpm build`.
- [ ] `docker compose config`.
- [ ] `docker compose up -d`.
- [ ] live health 200.

Evidence:

```text
Branch:
Commit:
Commands:
Test result:
Open issues:
```

---

# 3. Faza 2 — Prisma i DB role

Status: `NOT_STARTED`

- [ ] Prisma 7 installed.
- [ ] `prisma.config.ts`.
- [ ] generated client path.
- [ ] module format consistent.
- [ ] `DATABASE_URL`.
- [ ] `MIGRATION_DATABASE_URL`.
- [ ] `copilot_migrator`.
- [ ] `copilot_app`.
- [ ] `NOBYPASSRLS`.
- [ ] runtime not owner.
- [ ] PrismaService singleton.
- [ ] DatabaseModule global.
- [ ] migration scripts.
- [ ] test database documented.

Verification:

- [ ] `prisma format`.
- [ ] `prisma validate`.
- [ ] migration on empty DB.
- [ ] runtime current_user test.
- [ ] runtime CREATE TABLE denied.
- [ ] owner query confirms migrator/owner.

Evidence:

```text
Migration:
Owner:
Runtime user:
Test output:
```

---

# 4. Faza 3 — Identity/practices

Status: `NOT_STARTED`

## Schema

- [ ] practices.
- [ ] users.
- [ ] practice_memberships.
- [ ] practice_settings.
- [ ] unique constraints.
- [ ] indexes.
- [ ] grants.

## Seed

- [ ] demo practice.
- [ ] dev admin.
- [ ] dev physician.
- [ ] memberships.
- [ ] settings.
- [ ] seed idempotent.

## API

- [ ] dev auth isolated.
- [ ] user resolution.
- [ ] `/me`.
- [ ] role permission map.
- [ ] inactive user test.
- [ ] inactive membership test.

Evidence:

```text
Migration:
Seed command:
API tests:
```

---

# 5. Faza 4 — Tenant/RLS

Status: `NOT_STARTED`

- [ ] `app_security` schema.
- [ ] security-definer context function.
- [ ] fixed search path.
- [ ] public execute revoked.
- [ ] membership validation.
- [ ] PracticeContext guard.
- [ ] `X-Practice-ID` validation.
- [ ] TenantDatabaseService.
- [ ] interactive transaction.
- [ ] RLS enabled.
- [ ] FORCE RLS.
- [ ] no-context default deny.
- [ ] pooled connection leakage test.
- [ ] inactive membership denied.
- [ ] Practice A/B read isolation.
- [ ] Practice A/B write isolation.
- [ ] runtime role cannot bypass.

Gate:

- [ ] **ALL RLS TESTS GREEN — required before phase 5.**

Evidence:

```text
Policies:
Tables:
Test command:
Test result:
```

---

# 6. Faza 5 — Encounter/documents

Status: `NOT_STARTED`

## Schema

- [ ] patient_references.
- [ ] encounters.
- [ ] encounter_diagnoses.
- [ ] storage_objects.
- [ ] encounter_documents.
- [ ] composite FK.
- [ ] RLS.
- [ ] indexes.
- [ ] checks.

## Services

- [ ] pseudonym generator.
- [ ] external ID HMAC.
- [ ] encryption interface.
- [ ] local encryption implementation.
- [ ] text normalization.
- [ ] redaction.
- [ ] state machine.
- [ ] idempotency service.
- [ ] optimistic locking.
- [ ] audit.
- [ ] outbox base.

## API

- [ ] POST patient reference.
- [ ] GET patient reference.
- [ ] POST encounter.
- [ ] GET encounter list.
- [ ] GET encounter detail.
- [ ] PATCH encounter.
- [ ] cancel encounter.
- [ ] POST text document.
- [ ] list documents.
- [ ] read redacted.
- [ ] read original permission.
- [ ] archive.

## Tests

- [ ] unknown field rejected.
- [ ] duplicate idempotency.
- [ ] idempotency conflict.
- [ ] stale ETag.
- [ ] cross-tenant GET.
- [ ] cross-tenant FK.
- [ ] document read audit.
- [ ] no text in logs.

Evidence:

```text
Migration:
Endpoints:
Tests:
```

---

# 7. Faza 6 — Tariff releases

Status: `NOT_STARTED`

- [ ] system storage table.
- [ ] tariff_releases.
- [ ] artifacts.
- [ ] catalog entries.
- [ ] activation history.
- [ ] one-active index.
- [ ] package SHA-256.
- [ ] validation command.
- [ ] activation transaction.
- [ ] admin permission.
- [ ] audit.
- [ ] mock release seed.
- [ ] two-active negative test.

Evidence:

```text
Migration:
Active release:
Test:
```

---

# 8. Faza 7 — Analysis/queue

Status: `NOT_STARTED`

- [ ] ai_prompt_versions.
- [ ] analysis_runs.
- [ ] input snapshots.
- [ ] async_jobs.
- [ ] outbox final.
- [ ] analysis state machine.
- [ ] revision numbering.
- [ ] POST analysis.
- [ ] response 202.
- [ ] BullMQ connection.
- [ ] queue registration.
- [ ] outbox publisher.
- [ ] SKIP LOCKED.
- [ ] processor.
- [ ] job status API.
- [ ] Redis outage test.
- [ ] duplicate publisher test.
- [ ] immutable snapshot test.
- [ ] no medical text in job payload.

Evidence:

```text
Migration:
Queue:
Tests:
```

---

# 9. Faza 8 — Mock AI/Tariff

Status: `NOT_STARTED`

- [ ] ai_extraction_runs.
- [ ] extracted_facts.
- [ ] service_candidates.
- [ ] candidate_evidence.
- [ ] tariff_evaluations.
- [ ] tariff_evaluation_items.
- [ ] tariff_messages.
- [ ] AI provider interface.
- [ ] mock AI.
- [ ] output schema.
- [ ] invalid schema test.
- [ ] tariff client interface.
- [ ] mock tariff client.
- [ ] request hash.
- [ ] response hash.
- [ ] pipeline checkpoints.
- [ ] retry no duplicates.
- [ ] workspace endpoint.
- [ ] deterministic fixture.

Evidence:

```text
Migration:
Fixture:
Pipeline test:
```

---

# 10. Faza 9 — Safety rules

Status: `NOT_STARTED`

- [ ] safety_rules.
- [ ] versions.
- [ ] findings.
- [ ] evidence.
- [ ] rule interface.
- [ ] registry.
- [ ] duration rule.
- [ ] performer role rule.
- [ ] duplicate rule.
- [ ] tariff release rule.
- [ ] evidence rule.
- [ ] approval readiness.
- [ ] finding dedup.
- [ ] accepted risk policy.
- [ ] findings API.
- [ ] cross-tenant finding test.

Evidence:

```text
Migration:
Rules:
Tests:
```

---

# 11. Faza 10 — Review/approval

Status: `NOT_STARTED`

- [ ] review_decisions.
- [ ] review_item_changes.
- [ ] approvals.
- [ ] correction endpoint.
- [ ] correction reason.
- [ ] revision required logic.
- [ ] finding resolution.
- [ ] approval row lock.
- [ ] approval readiness.
- [ ] canonical payload.
- [ ] payload hash.
- [ ] immutable trigger.
- [ ] revoke.
- [ ] double approval concurrency test.
- [ ] blocker prevents approval.
- [ ] approved edit fails.
- [ ] revoke history preserved.

Evidence:

```text
Migration:
Approval hash:
Tests:
```

---

# 12. Faza 11 — Export/audit package

Status: `NOT_STARTED`

- [ ] integration_connections.
- [ ] external links.
- [ ] export_jobs.
- [ ] adapter interface.
- [ ] ManualAdapter.
- [ ] manual JSON artifact.
- [ ] export worker.
- [ ] approval hash check.
- [ ] retry.
- [ ] audit timeline.
- [ ] audit package JSON.
- [ ] PDF job decision.
- [ ] no approval negative test.
- [ ] revoked approval negative test.
- [ ] duplicate retry test.

Evidence:

```text
Migration:
Artifact:
Tests:
```

---

# 13. Faza 12 — Hardening

Status: `NOT_STARTED`

- [ ] OpenAPI 3.1 generated.
- [ ] contract validation.
- [ ] client generation smoke.
- [ ] Problem Details complete.
- [ ] rate limiting.
- [ ] ready health.
- [ ] structured logs.
- [ ] log redaction.
- [ ] no PHI log test.
- [ ] CI pipeline.
- [ ] migration deploy CI.
- [ ] RLS suite CI.
- [ ] e2e CI.
- [ ] dependency scan.
- [ ] backup script.
- [ ] restore test.
- [ ] release smoke.
- [ ] milestone report.
- [ ] docs synchronized.

Evidence:

```text
OpenAPI hash:
CI run:
Backup/restore:
Final commit:
```

---

# 14. External integration gates

## AI production

- [ ] provider selected.
- [ ] DPA/privacy review.
- [ ] retention/training disabled/defined.
- [ ] region approved.
- [ ] redaction verified.
- [ ] extraction baseline.
- [ ] cost limits.
- [ ] timeout/retry.

## OAAT

- [ ] license.
- [ ] official package.
- [ ] release version.
- [ ] Java wrapper.
- [ ] baseline cases.
- [ ] contract tests.
- [ ] deployment rights.

## Axenita

- [ ] partnership.
- [ ] API contract.
- [ ] sandbox.
- [ ] auth.
- [ ] import scope.
- [ ] write-back scope.
- [ ] webhook verification.
- [ ] reconciliation.
- [ ] audit attachment.

---

# 15. Production pilot gate

- [ ] OIDC production.
- [ ] MFA.
- [ ] Swiss hosting approved.
- [ ] secrets manager.
- [ ] KMS.
- [ ] TLS.
- [ ] DB encryption.
- [ ] backup encryption.
- [ ] restore test.
- [ ] retention.
- [ ] DPIA/legal review.
- [ ] incident response.
- [ ] monitoring/alerts.
- [ ] penetration/security review.
- [ ] support/runbook.
- [ ] rollback plan.

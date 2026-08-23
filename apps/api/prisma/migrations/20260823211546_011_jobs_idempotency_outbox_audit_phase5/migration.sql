-- =============================================================================
-- Migration package 011_jobs_idempotency_outbox_audit — PHASE 5 SLICE
-- Directory: <timestamp>_011_jobs_idempotency_outbox_audit_phase5 (§29.10; D-064 `OD-8`)
--
-- Normative sources: 02_DATABASE_SCHEMA_V1.md §2.1, §2.2, §2.3, §2.5, §15, §15.2, §15.4,
-- §21, §22.11, §26, §29.9, §29.10; D-022, D-023, D-025, D-049, D-050, D-052, D-062, D-063,
-- D-064 (`OD-1`, `OD-4`, `OD-5`, `OD-7`, `OD-8`). Implementation plan 04 §7.5a.
-- Test contract 08 §12.9.4 items 26a-26b. Naming standard 12 §8.
--
-- This is the phase 5 slice of package `011_jobs_idempotency_outbox_audit`. It is the FIRST
-- CREATOR of `idempotency_keys` and `audit_events`, of their primary keys, of their three
-- unique constraints, of the TWO `practices` foreign keys of §29.9.1 and of BOTH audit
-- indexes of §21. No new package number is introduced and no existing package is renumbered
-- (D-062 `OD-P5-D2-1`; D-063 clause 3; D-064 `OD-8`).
--
-- PACKAGE BOUNDARY — EXACTLY TWO TABLES (§22.11, §29.9; D-064 `OD-5`)
-- Package `011` owns FOUR §15 tables. This slice creates TWO of them and deliberately NOT the
-- other two: `outbox_events` and `async_jobs` have NO consumer in phase 5, so neither table,
-- nor `outbox_unpublished_idx`, nor `async_jobs_queue_idx`, nor the `progress_percent` CHECK
-- appears anywhere in this file. Their slice stays deferred by the D-052 precedent — the
-- package keeps ownership, only the point of execution moves. `system_audit_events`,
-- `system_outbox_events`, `system_async_jobs` and `system_webhook_receipts` are NEVER created
-- (D-023 clause 2).
--
-- NEGATIVE ASSERTION — THIS PACKAGE GRANTS NO RUNTIME CAPABILITY (D-064 `OD-1`)
-- This file issues NO `GRANT`, NO `REVOKE`, NO `ENABLE ROW LEVEL SECURITY`, NO
-- `FORCE ROW LEVEL SECURITY`, NO `CREATE POLICY`, NO `CREATE FUNCTION`, NO `CREATE TRIGGER`,
-- NO `SECURITY DEFINER` and NO `COMMENT ON`. That is normative, not an omission. The
-- canonical intermediate state after this migration and BEFORE the phase 5 slice of
-- `013_rls_policies` is, for BOTH new tables:
--
--     table exists            yes
--     runtime table grants    ZERO
--     runtime column grants   ZERO
--     policies                ZERO
--     relrowsecurity          false
--     relforcerowsecurity     false
--
-- THAT STATE IS SAFE AND INTENDED, and it is the same pattern package `003` already uses for
-- the five PHI tables (D-062 Dio B.3). `copilot_migrator` owns both tables; migration `001`
-- asserts that schema `public` carries no `DEFAULT PRIVILEGES` that could pre-grant a future
-- table; and neither `copilot_app` nor `copilot_system` holds `CREATE` on the schema. A table
-- this file creates is therefore reachable by NO runtime role at all — PUBLIC included — until
-- the phase 5 slice of `013_rls_policies` grants it IN THE SAME TRANSACTION that enables and
-- forces RLS and creates the restricting tenant policies (D-049 clause 5; D-064 `OD-1`). The
-- window between the two migrations contains NO capability, which is strictly stronger than a
-- claim that the window is short. The absence of a grant IS the security control of this
-- slice, and it must NEVER be "fixed" here to make a test or a development flow convenient.
--
-- The three policies of `idempotency_keys` (§29.4a.3, D-064 `OD-2`) and the two of
-- `audit_events` (§29.4a.4, D-064 `OD-3`) belong exclusively to package `013`. The §19.2 audit
-- guard trigger belongs exclusively to package `014`. Neither is anticipated here.
--
-- THE `★` RI-VERSUS-RLS PROOF IS NOT DISCHARGED HERE (D-062 Dio D.6, D-064)
-- No phase 5 table carries RLS after this file, so nothing here can prove — or weaken —
-- how `encounters_responsible_physician_membership_fk` behaves under FORCE RLS. That proof
-- stays a HARD precondition of `P5-I5`.
--
-- AUTHORING MECHANISM (D-050, §26.3, 10 §7.1)
-- The structural portion of this file is the CANDIDATE produced by `prisma migrate diff`
-- against the canonical schema, reviewed statement by statement and reordered into the
-- dependency-safe order below. `migrate diff` output is A CANDIDATE, NOT TRUTH. The candidate
-- proposed NO `ALTER`, NO `DROP` and NO `RENAME` against any existing phase 3/4 or `P5-I1`
-- object. In particular `practices` receives NO structural change: both new foreign keys are
-- created ON THE CHILD TABLES, and their parent key `practices_pkey` has existed since package
-- `002`. NO index, NO constraint and NO column is added to `practices` (D-064 `OD-5`).
-- `prisma migrate dev --create-only` is NOT used: its shadow database is structurally
-- incompatible with the deliberate ownership and privilege guards of migration `001`, and no
-- guard of `001` may be weakened for it. `prisma db push` and `prisma migrate reset` stay
-- forbidden.
--
-- ORDER (normative, mirroring §22.3 / D-062 Dio B.1)
--     tables (with primary keys) -> unique constraints -> foreign keys -> non-unique indexes
-- Unique constraints precede the foreign keys because a composite foreign key requires a
-- unique constraint over exactly the referenced column pair (§2.5). Neither new key is
-- composite, but the order is kept identical to package `003` so no second convention exists.
--
-- ATOMICITY
-- This file is applied in ONE transaction. `CREATE INDEX CONCURRENTLY` and every other
-- statement that breaks a transaction is FORBIDDEN here — and unnecessary, because both
-- tables are empty. Documentation stays as `--` comments colocated in the file, exactly as in
-- the four existing packages; no `COMMENT ON` object is introduced.
--
-- IDENTIFIERS (§2.2, §26.1)
-- No column carries a UUID default. The application generates every identifier before
-- `INSERT`, so `gen_random_uuid()` never appears. The ONLY default in this file is
-- `idempotency_keys.created_at default current_timestamp`, which matches every other
-- `created_at` in the schema. §15.4 declares NO `created_at` on `audit_events`; `occurred_at`
-- is the event timestamp and carries no default, exactly like `encounters.occurred_at`.
--
-- ROLLBACK / REVERSAL CONVENTION (precedent `013` §7, `003` §5)
-- There is NO down-migration file and the repository convention is not changed. Full reversal
-- is documented as commentary at the end of this file, is never executed, is not a substitute
-- for the §23.4 maintenance window, and removes only what THIS package added.
--
-- NO `SECURITY DEFINER` FUNCTION, NO `BYPASSRLS`, NO `CREATE ROLE`, NO SUPERUSER PATH.
-- NO SEED AND NO DML OF ANY KIND: neither new table is ever seeded, and the §23.4 FORCE-RLS
-- maintenance allowlist stays at exactly six tables (D-064, preserved authority).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables (§15.2, §15.4; D-023 clauses 1-2)
--
-- Exactly the canonical column sets, in canonical order. No speculative column is added and
-- no canonical column is dropped.
--
-- `practice_id uuid not null` on BOTH tables. On `audit_events` that is D-023 clause 1
-- literally: a nullable tenant key under a FORCE RLS equality policy makes `NULL = <uuid>`
-- evaluate to `NULL`, so the runtime role could neither write nor read such a row — silently,
-- without an error. On `idempotency_keys` it is additionally the unconditional rule of §2.5.
--
-- `idempotency_keys.response_body` must never hold medical content (§15.2). `audit_events`
-- carries the §15.4 hash chain (`event_sha256`, `previous_event_sha256`) and requires
-- `previous_value` / `new_value` to be sanitised before they are written.
--
-- No generated identity and no sequence is introduced on either table: `id` is a plain `uuid`
-- supplied by the application (§2.2).
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "request_sha256" VARCHAR(64) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "locked_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "actor_type" VARCHAR(30) NOT NULL,
    "actor_user_id" UUID,
    "actor_service" VARCHAR(100),
    "action" VARCHAR(150) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "request_id" VARCHAR(100),
    "session_id_hash" VARCHAR(128),
    "ip_address" INET,
    "user_agent_hash" VARCHAR(128),
    "previous_value" JSONB,
    "new_value" JSONB,
    "metadata" JSONB NOT NULL,
    "event_sha256" VARCHAR(64) NOT NULL,
    "previous_event_sha256" VARCHAR(64),

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- 2. Unique constraints (§2.5, §15.2, §15.4; D-022)
--
-- THREE unique indexes, every one with an explicit name (12 §8).
--
-- `*_tenant_key` — `unique (practice_id, id)` — is the UNCONDITIONAL tenant constraint of
-- §2.5 / D-022 and exists on BOTH new tables regardless of whether either is currently the
-- target of a composite foreign key. Neither is: the two keys of section 3 are single-column
-- keys to `practices(id)`. The constraint is still mandatory, so that a future composite key
-- never requires a migration over a populated table.
--
-- `idempotency_keys_scope_key` is the canonical idempotency scope of §15.2 —
-- `(practice_id, user_id, endpoint, idempotency_key)`. It is what makes a replayed command
-- resolve to the same recorded response inside one practice, one user and one endpoint. It is
-- NOT `NULLS NOT DISTINCT`: all four columns are `NOT NULL`, so the question does not arise.
-- -----------------------------------------------------------------------------

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_key" ON "idempotency_keys"("practice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key" ON "idempotency_keys"("practice_id", "user_id", "endpoint", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_tenant_key" ON "audit_events"("practice_id", "id");

-- -----------------------------------------------------------------------------
-- 3. Foreign keys — EXACTLY TWO (§29.9.1; D-064 `OD-4`)
--
-- Both with an EXPLICIT `ON DELETE NO ACTION ON UPDATE NO ACTION`. No Prisma default is
-- relied upon in any position (§29.3): Prisma would otherwise substitute
-- `ON DELETE RESTRICT ON UPDATE CASCADE`, an invented rule that migration `002` already
-- rejected and package `003` re-rejected for all eight of its keys.
--
-- Names follow 12 §8 (`<table>_<relation>_fk`) and the `patient_references_practice_fk` /
-- `storage_objects_practice_fk` precedent of package `003`.
--
-- WHY `NO ACTION` (§29.2, D-062 Dio C.3, applied here by D-064 `OD-4`)
--   * `CASCADE` is rejected: deleting a practice must be REFUSED, never silently erase that
--     tenant's whole audit trail. An audit trail that a parent delete can cascade away is not
--     an audit trail.
--   * `SET NULL` is impossible over a `NOT NULL` tenant key.
--   * `RESTRICT` and `NO ACTION` are equivalent refusals; `NO ACTION` is checkable at
--     statement end and deferrable if ever needed. Packages `002` and `003` use `NO ACTION`
--     for all thirteen existing keys and no second convention is introduced.
--   * `ON UPDATE` is unreachable: `practices.id` is immutable after `INSERT`.
--
-- RELATIONS DELIBERATELY NOT DECLARED (§29.9.1; D-064 `OD-4`)
--   * `idempotency_keys (user_id) -> users (id)`;
--   * `audit_events (actor_user_id) -> users (id)`;
--   * any actor or service directory key for `audit_events.actor_type` /
--     `audit_events.actor_service`;
--   * any other new relation whatsoever.
-- Actor columns are an APPLICATION INVARIANT, not a foreign key — the same precedent §6.5
-- already applies to `granted_by` / `revoked_by` and to `created_by` / `updated_by` on the
-- five package `003` tables. A key to `users` would introduce an identity relation that D-061
-- explicitly does not widen, and `audit_events` must remain writable for an actor row that no
-- longer resolves.
-- -----------------------------------------------------------------------------

-- AddForeignKey
-- §29.9.1 row 1.
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_practice_fk" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.9.1 row 2.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_practice_fk" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- 4. Non-unique indexes — BOTH audit indexes of §21 (§29.9.2; D-064 `OD-7`)
--
-- Exactly two, both on `audit_events`, both with the canonical §21 column sequence.
--
-- `audit_resource_idx` serves the "what happened to this resource" path;
-- `audit_actor_idx` serves the "what did this actor do, most recent first" path, which is why
-- it and only it carries `occurred_at desc`.
--
-- These are created HERE, by the creator migration, and are NOT deferred to package `012`
-- merely because §21 catalogues them under `012`: `012` does not exist in phase 5, and a table
-- without its indexes is not finished. Package `012` may later VERIFY or reconcile them — the
-- same precedent as `platform_role_assignments_user_idx` from package `002` and the four
-- §29.6 indexes from package `003`.
--
-- No speculative index is added. `idempotency_keys` receives none beyond its two unique
-- constraints: §21 catalogues no non-unique index for it, and both documented lookup paths —
-- the scope lookup and the tenant lookup — are already covered by `idempotency_keys_scope_key`
-- and `idempotency_keys_tenant_key`. The retention/cleanup path over `expires_at` has NO
-- consumer in phase 5 (D-064 `OD-2`), so no index is created for it before its consumer.
--
-- `CREATE INDEX CONCURRENTLY` is forbidden here: it cannot run inside the single transaction
-- this file requires, and it is unnecessary over empty tables.
-- -----------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "audit_resource_idx" ON "audit_events"("practice_id", "resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_actor_idx" ON "audit_events"("practice_id", "actor_user_id", "occurred_at" DESC);

-- -----------------------------------------------------------------------------
-- 5. ROLLBACK — DOCUMENTATION ONLY, NOT EXECUTED BY THIS MIGRATION
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. Every line below is commentary. There is no
-- down-migration file and the repository convention (precedent `013` §7, `003` §5) is not
-- changed.
--
-- This package added no grant, no policy and no RLS flag, so its reversal has nothing to
-- revoke and nothing to disable. It is a pure structural reversal:
--
--     drop table audit_events;
--     drop table idempotency_keys;
--
-- Dropping the two tables removes their own constraints and indexes with them, including both
-- audit indexes and both `practices` foreign keys. NOTHING that belongs to package `002`,
-- `013` or `003` is touched: `practices` keeps every column, index, constraint, policy and
-- grant it had before this package ran.
--
-- The reversal removes only what THIS package added. It is non-destructive of phase 3/4 and
-- `P5-I1` state and fails closed; the project has no production data (§22.2). A rollback must
-- NEVER be used as a substitute for the §23.4 maintenance window, and must never leave any
-- table with RLS enabled but FORCE off.
-- -----------------------------------------------------------------------------

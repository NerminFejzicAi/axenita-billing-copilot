-- =============================================================================
-- Migration package 013_rls_policies_phase5 — PHASE 5 SECURITY SLICE, sub-gate `P5-I2B`
--
-- Normative sources: 02 §17.1, §17.3, §18.1, §19.2, §20.2b, §20.2b.1, §22.11, §22.13, §23.4,
-- §23.4.4b, §29.4, §29.4a, §29.4a.0, §29.4a.1, §29.4a.2, §29.4a.3, §29.4a.4, §29.4a.5, §29.5,
-- §29.7; D-023, D-033, D-047, D-048, D-049, D-051, D-052, D-053, D-061, D-062, D-063,
-- D-064 (`OD-1`, `OD-2`, `OD-3`, `OD-8`), D-065 (`RULING 1`, `RULING 2`).
-- Implementation plan 04 §7.5a. Test strategy 08 §12.9.4.
--
-- This file is the DATABASE-ONLY security slice of phase 5 and the EXCLUSIVE OWNER of every
-- `GRANT`, `REVOKE`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` and
-- `CREATE POLICY` for the SEVEN phase 5 tenant tables (§29.4a.1, D-064 `OD-1`):
--
--     patient_references · encounters · encounter_diagnoses · storage_objects
--     encounter_documents · idempotency_keys · audit_events
--
-- Package `003` (`P5-I1`) created five of them and package `011` (`P5-I2A`) the other two.
-- NEITHER issued a single security statement, which is why both left an intermediate state
-- carrying ZERO runtime capability: no runtime role held any privilege on any of the seven,
-- `pg_default_acl` is empty, and neither runtime role holds `CREATE` on schema `public`. A
-- table no role can reach needs no policy, so the window between those packages and this one
-- contains no capability at all rather than merely a short exposure.
--
-- No application code, no seed code, no test code and no Prisma model change belongs to this
-- file. The AAD immutability triggers of package `014` belong to sub-gate `P5-I2C` and are
-- NOT created here; the `★` RI-versus-RLS proof belongs to `P5-I2V` and is not discharged
-- here either.
--
-- AUTHORING MECHANISM (D-050, 02 §26.3, 10 §7.1):
-- The canonical `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma
-- --script` workflow was executed against a correctly bootstrapped canonical migration
-- database carrying `001` + `002` + `013` + `003` + `011_phase5`, and produced an EMPTY
-- structural candidate. That empty result is the expected and required outcome: this package
-- adds NO table, NO column, NO enum, NO constraint and NO index, and Prisma models none of the
-- security objects below (§29.9.3, D-064 `OD-5`). Every statement in this file is therefore
-- hand-written custom SQL and is authoritative on its own.
--
-- -----------------------------------------------------------------------------------------
-- THE EXPLICIT TRANSACTION (D-065 `RULING 2`, 02 §29.4a.0) — read this before editing.
-- -----------------------------------------------------------------------------------------
--
-- This migration carries EXACTLY ONE top-level `BEGIN;` / `COMMIT;` boundary, written
-- literally, and EVERY security statement below lives inside it.
--
-- Atomicity here must NOT be delegated to the assumption that the Prisma migration runtime
-- implicitly wraps `migration.sql` in a transaction. D-064 `OD-1` forbids any COMMITTED
-- intermediate state in which a runtime role holds a `GRANT` without the tenant policy that
-- constrains it. If the implicit behaviour ever changed — by version, by option, or by a
-- first statement that cannot run inside a transaction block — that forbidden state would be
-- exactly what a partially applied file produced. The explicit block makes the guarantee a
-- property of THIS FILE, readable in code review, instead of a property of a tool.
--
-- The precedent is 02 §23.4 (D-048), which already mandates an explicit `begin;` … `commit;`
-- boundary for the `NO FORCE` → DML → `FORCE` maintenance sequence, for the same reason.
--
-- D-065 scopes this obligation to THIS PACKAGE. It is deliberately NOT a general project-wide
-- policy of wrapping migrations, and the five already applied migrations are not rewritten to
-- match it (AGENTS.md §5.1: an applied migration is never modified).
--
-- FORBIDDEN INSIDE THIS FILE, PERMANENTLY: an intermediate `COMMIT`, a second top-level
-- `BEGIN`, `CREATE INDEX CONCURRENTLY`, `VACUUM`, `CREATE DATABASE`, or any other statement
-- that cannot run inside a transaction block. Adding one would silently split the single
-- boundary and reintroduce the committed intermediate state this package exists to prevent.
--
-- -----------------------------------------------------------------------------------------
-- THE COMMITTED-STATE INVARIANT
-- -----------------------------------------------------------------------------------------
--
-- BEFORE: seven tables, zero runtime capability, `relrowsecurity = false`,
--         `relforcerowsecurity = false`, zero policies.
--
-- AFTER ONE COMMIT: every intended grant exists AND all seven carry `ENABLE` + `FORCE ROW
--         LEVEL SECURITY` AND all fifteen policies of §29.4a.2 exist.
--
-- There is no observable state in between.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. `PUBLIC` and `copilot_system` baseline — default deny
--    (02 §19.2, §20, §29.5, §29.4a.4; D-023)
--
-- `REVOKE ALL … FROM PUBLIC` PRECEDES EVERY GRANT, on all seven tables, without exception.
-- PostgreSQL grants no table privilege to `PUBLIC` by default and migration `001` already
-- forbids a `DEFAULT PRIVILEGE` that could pre-grant a future table, so these seven
-- statements are belt AND braces: they make the intended end state — `PUBLIC` holds NOTHING —
-- an explicit, greppable statement of this package rather than an inherited default nobody
-- reasserted. The catalogue assertion that `PUBLIC` holds zero privileges is a PERMANENT
-- REGRESSION (§29.7).
--
-- `copilot_system` RECEIVES NOTHING ON ANY OF THE SEVEN and is therefore not named below at
-- all. All seven are tenant tables, and the platform identity never reaches tenant data
-- (D-023). That includes `audit_events`: §29.4a.4 grants the audit surface to `copilot_app`
-- ONLY, and a platform-wide audit reader would be exactly the cross-practice readability
-- D-063 clause 5 forbids categorically.
--
-- DELIBERATELY ABSENT AND NOT TO BE ADDED: any `copilot_system` grant · any sequence
-- privilege (no phase 5 table has a serial or identity column — §2.2, §20.3, §29.5) · any
-- `ALTER DEFAULT PRIVILEGES` · any schema `CREATE` grant · any `BYPASSRLS` · any new role ·
-- any policy for the owner. `copilot_migrator` remains the owner of all seven (§3.5) and no
-- runtime role owns anything.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE "patient_references" FROM PUBLIC;
REVOKE ALL ON TABLE "encounters" FROM PUBLIC;
REVOKE ALL ON TABLE "encounter_diagnoses" FROM PUBLIC;
REVOKE ALL ON TABLE "storage_objects" FROM PUBLIC;
REVOKE ALL ON TABLE "encounter_documents" FROM PUBLIC;
REVOKE ALL ON TABLE "idempotency_keys" FROM PUBLIC;
REVOKE ALL ON TABLE "audit_events" FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. `copilot_app` grants — the exact phase 5 privilege surface
--    (02 §20.2b, §20.2b.1, §29.5, §29.4a.3, §29.4a.4; D-049, D-064 `OD-2`, `OD-3`)
--
-- NO `DELETE` AND NO `TRUNCATE` IS GRANTED ANYWHERE IN THIS PACKAGE, on any table, to any
-- role. Business delete is not permitted in phase 5 (§17.1, §29.4), which is also why not one
-- `DELETE` policy is created in section 4.
--
-- `SELECT` stays TABLE-LEVEL on every table that receives it. Column-level `SELECT` is NOT
-- introduced (§29.5): no phase 5 column has the property that justified the column-level
-- `SELECT` on `users`/`practices` — each is needed in a response, or in a `WHERE` predicate,
-- or is ciphertext that is worthless without a key held outside the database.
-- `external_patient_ref_hash` in particular MUST carry `SELECT`, because the deterministic
-- lookup uses it in `WHERE` and a column without a grant fails with SQLSTATE `42501` even when
-- it appears ONLY in a `WHERE` predicate (§20.2b, §20.2b.1).
--
-- `UPDATE`, where it exists at all, is COLUMN-LEVEL ONLY. There is no table-level `UPDATE`
-- grant anywhere in this package. A table-level `UPDATE` would carry `practice_id` and `id`
-- with it, and the whole point of the column lists below is that those two are IMMOVABLE AT
-- THE PRIVILEGE LEVEL — a barrier that is reached BEFORE the `WITH CHECK` of the tenant
-- policy, so a tenant-key move is rejected twice over, independently (precedent: `013` §1).
-- -----------------------------------------------------------------------------

-- --- A. `patient_references` — SELECT + INSERT (§29.5) ------------------------
--
-- NO `UPDATE` IN PHASE 5 and no `DELETE`. A patient reference is created once and read; the
-- AAD-bound columns (`id`, `practice_id`) and the whole encryption envelope are therefore
-- unwritable after `INSERT` on the privilege level alone, WITHOUT depending on the package
-- `014` trigger that sub-gate `P5-I2C` will add as the SECOND barrier (§19.2, §19.3).
GRANT SELECT ON TABLE "patient_references" TO "copilot_app";
GRANT INSERT ON TABLE "patient_references" TO "copilot_app";

-- --- B. `encounters` — SELECT + INSERT + column-level UPDATE (§29.5) ----------
--
-- The `UPDATE` set is EXACTLY TWELVE columns and the list is normative, not illustrative:
--
--     status, version, updated_by, updated_at,
--     occurred_at, treatment_date, responsible_physician_id,
--     guarantor_type, insurance_context, specialty_code,
--     patient_age_at_encounter, patient_sex_at_encounter
--
-- `version` is the D-029 optimistic-locking counter and is the ACCEPTED MINIMUM the existing
-- concurrency architecture requires; `updated_at` is written BY THE DATABASE during the
-- `UPDATE` and is never sent by a caller (precedent `013` §1, D-053 clauses B.5-B.6).
--
-- WITHHELD, and each for its own reason (§29.5):
--
--     id, practice_id                      — tenant key and row identity: immovable on the
--                                            privilege level, the first of two barriers;
--     patient_reference_id                 — an encounter can never be silently re-pointed at
--                                            a different patient;
--     source_system, created_by, created_at — provenance, written once at INSERT;
--     external_encounter_ref_hash,
--     external_encounter_ref_ciphertext,
--     external_encounter_ref_iv,
--     external_encounter_ref_auth_tag,
--     encryption_algorithm, encryption_version,
--     encryption_key_ref, encryption_key_version
--                                          — the AAD-bound encryption envelope (D-025): the
--                                            ciphertext and every key coordinate it was
--                                            sealed under are immutable, with no trigger yet
--                                            in the chain.
GRANT SELECT ON TABLE "encounters" TO "copilot_app";
GRANT INSERT ON TABLE "encounters" TO "copilot_app";
GRANT UPDATE (
  "status",
  "version",
  "updated_by",
  "updated_at",
  "occurred_at",
  "treatment_date",
  "responsible_physician_id",
  "guarantor_type",
  "insurance_context",
  "specialty_code",
  "patient_age_at_encounter",
  "patient_sex_at_encounter"
) ON TABLE "encounters" TO "copilot_app";

-- --- C. `encounter_diagnoses` — SELECT + INSERT (§29.5) -----------------------
--
-- NO `UPDATE` IN PHASE 5 and no `DELETE`. A diagnosis line is appended; a correction creates a
-- new row rather than overwriting history (AGENTS.md §5.4).
GRANT SELECT ON TABLE "encounter_diagnoses" TO "copilot_app";
GRANT INSERT ON TABLE "encounter_diagnoses" TO "copilot_app";

-- --- D. `storage_objects` — DELIBERATELY NOTHING (§29.5, §29.4; D-065 `RULING 1`) ---
--
-- `storage_objects` receives NO `SELECT`, NO `INSERT`, NO `UPDATE` and NO `DELETE`, for any
-- role, and NO POLICY IS CREATED FOR IT in section 4 — while it still receives `ENABLE` and
-- `FORCE ROW LEVEL SECURITY` in section 3.
--
-- THIS COMBINATION IS INTENTIONAL AND IS THE SECURITY CONTROL, NOT AN OVERSIGHT. The table
-- exists because it is the foreign-key parent of `encounter_documents`; no phase 5 route
-- reads or writes it. RLS with zero policies is DEFAULT-DENY: even if a future grant were
-- issued by mistake, `copilot_app` would still see zero rows and be able to write none,
-- because a table with RLS enabled and no applicable policy admits nothing. That is strictly
-- stronger than relying on the absent grant alone.
--
-- DO NOT "FIX" THIS by adding a policy or a privilege. Doing so reopens a ratified decision
-- and is a phase-gate failure (D-064 `OD-6`, D-065 `RULING 1`).
--
-- (No statement is emitted here. The absence IS the contract.)

-- --- E. `encounter_documents` — SELECT + INSERT + UPDATE (`archived_at`) ------
--
-- The `UPDATE` set is EXACTLY ONE column — `archived_at` — and §29.5 states that this is the
-- COMPLETE LIST. Archiving is the only mutation phase 5 performs on a document.
--
-- Everything else is unwritable after `INSERT` on the privilege level: both status columns,
-- both ciphertext triples with their IVs and auth tags, both hashes, all four `encryption_*`
-- coordinates, `created_by`, `created_at`, `id`, `practice_id` and `encounter_id`.
GRANT SELECT ON TABLE "encounter_documents" TO "copilot_app";
GRANT INSERT ON TABLE "encounter_documents" TO "copilot_app";
GRANT UPDATE ("archived_at") ON TABLE "encounter_documents" TO "copilot_app";

-- --- F. `idempotency_keys` — SELECT + INSERT + column-level UPDATE ------------
--     (02 §15.2, §29.4a.3; D-064 `OD-2`)
--
-- The `UPDATE` set is EXACTLY FOUR columns:
--
--     response_status, response_body, locked_at, completed_at
--
-- `locked_at` is DELIBERATELY MUTABLE — it is the concurrency/claim-state field, and without
-- it an idempotency claim has no mechanism at all.
--
-- WITHHELD FROM `UPDATE`, exhaustively (D-064 `OD-2`):
--
--     id, practice_id, user_id, idempotency_key, endpoint, request_sha256,
--     expires_at, created_at
--
-- A blanket table-level `UPDATE` was CONSIDERED AND REJECTED: it would hand the caller
-- mutation of `practice_id` and of `idempotency_key` — the tenant boundary and the
-- deduplication key themselves.
--
-- `expires_at` is NOT mutable in phase 5: retention and the cleanup job have no phase 5
-- consumer, and a grant is not issued before its consumer exists (D-049).
GRANT SELECT ON TABLE "idempotency_keys" TO "copilot_app";
GRANT INSERT ON TABLE "idempotency_keys" TO "copilot_app";
GRANT UPDATE (
  "response_status",
  "response_body",
  "locked_at",
  "completed_at"
) ON TABLE "idempotency_keys" TO "copilot_app";

-- --- G. `audit_events` — SELECT + INSERT ONLY (02 §15.4, §19.2, §29.4a.4) -----
--     (D-064 `OD-3`; D-063 clause 5)
--
-- NO `UPDATE`. NO `DELETE`. NO `TRUNCATE`. NOT COLUMN-LEVEL EITHER.
--
-- This is the APPEND-ONLY contract of §15.4, and it is enforced by the GRANT, which is the
-- PRIMARY control (§19.2). The immutability trigger of §19.2 is an additional barrier, never
-- a substitute, and it is not part of this package. An audit trail that its own writer may
-- rewrite is not an audit trail.
--
-- This follows the TABLE-SPECIFIC contract of §15.4, not the generic matrix row of §18.1.
--
-- The two policies in section 4 are practice-scoped like every other. CROSS-PRACTICE
-- READABILITY OF `audit_events` IS CATEGORICALLY FORBIDDEN (D-063 clause 5) and its negative
-- test is a permanent regression.
GRANT SELECT ON TABLE "audit_events" TO "copilot_app";
GRANT INSERT ON TABLE "audit_events" TO "copilot_app";

-- -----------------------------------------------------------------------------
-- 3. `ENABLE` + `FORCE ROW LEVEL SECURITY` — all seven tables
--    (02 §17.3, §18.1, §22.13, §29.4, §29.4a.2; D-064 `OD-1`, D-065 `RULING 1`)
--
-- After this section THIRTEEN tables carry `relrowsecurity = true` AND
-- `relforcerowsecurity = true`: the six of packages `002`/`013` — `users`, `practices`,
-- `platform_role_assignments`, `practice_membership_roles`, `practice_memberships`,
-- `practice_settings` — and the seven below. The six are NOT re-altered here; they already
-- hold that state and this package does not touch them.
--
-- `FORCE` IS MANDATORY ALONGSIDE `ENABLE` and is not a stylistic choice: without it the table
-- OWNER `copilot_migrator` silently bypasses every policy, which would leave the trusted
-- migration identity with unrestricted read of every PHI table and make the isolation
-- assertions of §25.2.2 untrue.
--
-- CONSEQUENCE FOR THE TRUSTED SEED PATH — NONE, BY DESIGN. §23.4.4b (D-062 Dio K) records
-- that NO phase 5 table is ever seeded: trusted DML never touches any of these seven. The
-- §23.4 `FORCE RLS` maintenance allowlist therefore STAYS AT EXACTLY SIX TABLES and this
-- package contains no clause extending it. A silent extension is forbidden and fails the
-- phase gate (§23.4.4, 08 §26.2).
--
-- `storage_objects` is included here and receives NO policy in section 4. See section 2.D.
-- -----------------------------------------------------------------------------

ALTER TABLE "patient_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_references" FORCE ROW LEVEL SECURITY;

ALTER TABLE "encounters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encounters" FORCE ROW LEVEL SECURITY;

ALTER TABLE "encounter_diagnoses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encounter_diagnoses" FORCE ROW LEVEL SECURITY;

ALTER TABLE "storage_objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_objects" FORCE ROW LEVEL SECURITY;

ALTER TABLE "encounter_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encounter_documents" FORCE ROW LEVEL SECURITY;

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Policies — EXACTLY FIFTEEN new ones (02 §17.1, §29.4, §29.4a.2, §29.4a.5)
--    (D-065 `RULING 1`; naming per D-064, `<table>_<command>`)
--
--     patient_references  -> _select, _insert
--     encounters          -> _select, _insert, _update
--     encounter_diagnoses -> _select, _insert
--     encounter_documents -> _select, _insert, _update
--     idempotency_keys    -> _select, _insert, _update
--     audit_events        -> _select, _insert
--     storage_objects     -> NONE
--
-- TOTAL AFTER THIS PACKAGE: TWENTY-FIVE policies over THIRTEEN tables — the ten of phases
-- 3/4 plus these fifteen (`10 + 10 + 3 + 2 = 25`, D-065 `RULING 1`). The superseded totals
-- `8` PHI / `18` / `23` must never be used as an exit assertion. The TEN existing policies
-- are neither dropped, replaced, re-created, renamed nor semantically altered — including the
-- RESTRICTIVE mode of `practices_context_narrow`, which stays RESTRICTIVE (§17.6), and
-- `practice_memberships_self_select`, which stays byte-identical (D-062 Dio B.4).
--
-- EVERY policy below is `TO copilot_app` and carries the canonical §17.1 tenant predicate
-- LITERALLY AND UNWEAKENED:
--
--     practice_id = nullif(current_setting('app.practice_id', true), '')::uuid
--
-- `SELECT` carries `USING`. `INSERT` carries `WITH CHECK`. `UPDATE` carries BOTH, and that
-- pairing is NORMATIVE rather than redundant (§17.1): `USING` decides WHICH ROWS may be
-- updated, so a cross-tenant write affects ZERO ROWS, while `WITH CHECK` decides WHAT THE ROW
-- MAY BECOME, forbidding a move OUT of the established tenant by rewriting `practice_id`.
--
-- NO `DELETE` POLICY IS CREATED ANYWHERE, matching the absence of every `DELETE` grant.
--
-- PERMANENTLY FORBIDDEN IN THESE PREDICATES (§29.4, D-062, D-063):
--
--   * no permission/RBAC predicate — permissions stay in the application (03 §3.7.1, §28.5);
--   * no `archived_at` or soft-delete predicate — archival is a query question, not a security
--     boundary; in a policy it would hide rows from audit and make archival irreversible;
--   * NO SUBQUERY IN ANY OF THE FIFTEEN — every one is a plain comparison of a column against
--     a GUC, so there is structurally no surface for leaking co-member identity;
--   * no reference to `users` or to `practice_memberships`;
--   * no bootstrap exception, and none may ever be added — without `app.practice_id` the
--     predicate is `practice_id = NULL`, which yields ZERO ROWS for every practice
--     (fail-closed);
--   * no cross-tenant exception and no owner policy.
--
-- `practice_id` is `NOT NULL` on all seven, so the §17.1 assumption holds and no row can hide
-- behind a NULL tenant key.
-- -----------------------------------------------------------------------------

-- --- `patient_references` ----------------------------------------------------

CREATE POLICY "patient_references_select"
ON "patient_references"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

CREATE POLICY "patient_references_insert"
ON "patient_references"
AS PERMISSIVE
FOR INSERT
TO "copilot_app"
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- --- `encounters` ------------------------------------------------------------

CREATE POLICY "encounters_select"
ON "encounters"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

CREATE POLICY "encounters_insert"
ON "encounters"
AS PERMISSIVE
FOR INSERT
TO "copilot_app"
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- The `UPDATE` policy that constrains the twelve-column grant of section 2.B. D-049 clause 5
-- forbids that grant to exist without it, which is why both are in this one transaction.
CREATE POLICY "encounters_update"
ON "encounters"
AS PERMISSIVE
FOR UPDATE
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
)
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- --- `encounter_diagnoses` ---------------------------------------------------

CREATE POLICY "encounter_diagnoses_select"
ON "encounter_diagnoses"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

CREATE POLICY "encounter_diagnoses_insert"
ON "encounter_diagnoses"
AS PERMISSIVE
FOR INSERT
TO "copilot_app"
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- --- `encounter_documents` ---------------------------------------------------

CREATE POLICY "encounter_documents_select"
ON "encounter_documents"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

CREATE POLICY "encounter_documents_insert"
ON "encounter_documents"
AS PERMISSIVE
FOR INSERT
TO "copilot_app"
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- Constrains the single-column `archived_at` grant of section 2.E.
CREATE POLICY "encounter_documents_update"
ON "encounter_documents"
AS PERMISSIVE
FOR UPDATE
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
)
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- --- `idempotency_keys` (02 §29.4a.3; D-064 `OD-2`) --------------------------

CREATE POLICY "idempotency_keys_select"
ON "idempotency_keys"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

CREATE POLICY "idempotency_keys_insert"
ON "idempotency_keys"
AS PERMISSIVE
FOR INSERT
TO "copilot_app"
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- Constrains the four-column grant of section 2.F. `practice_id` carries no `UPDATE` grant
-- either, so a tenant-key move is rejected on privilege AND on policy.
CREATE POLICY "idempotency_keys_update"
ON "idempotency_keys"
AS PERMISSIVE
FOR UPDATE
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
)
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- --- `audit_events` (02 §29.4a.4; D-064 `OD-3`; D-063 clause 5) ---------------
--
-- TWO policies only, matching the append-only grant of section 2.G exactly. There is no
-- `UPDATE` policy and no `DELETE` policy because there is no such grant, and the tenant
-- predicate here is what makes cross-practice audit reads return ZERO ROWS.
CREATE POLICY "audit_events_select"
ON "audit_events"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

CREATE POLICY "audit_events_insert"
ON "audit_events"
AS PERMISSIVE
FOR INSERT
TO "copilot_app"
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

COMMIT;

-- =============================================================================
-- 5. WHAT THIS PACKAGE DELIBERATELY DOES NOT DO
--
-- Recorded so that a later reader finds the ABSENCE documented rather than assumed missing.
-- Everything below is outside the single transaction above because none of it exists at all.
--
-- SUB-GATE `P5-I2C` — package `014_immutability_triggers_phase5`. NOT created here:
--     app_security.reject_aad_bound_column_change() · patient_references_aad_immutable_trg ·
--     encounters_aad_immutable_trg · encounter_documents_aad_immutable_trg.
--     No function, no trigger and no function ACL of package `014` is touched by this file
--     (D-064, "Higijena ACL-a paketa 014"). `P5-I2B` DOES NOT AUTHORISE `P5-I2C`.
--
-- SUB-GATE `P5-I2V` / `★` — the RI-versus-RLS proof. NOT discharged here. `P5-I2B` creates
--     the RLS state that proof will eventually run against, but an ordinary `encounters`
--     INSERT naming a responsible physician through the composite FK is NOT the `★` proof and
--     must not be presented as one. `★` remains a HARD precondition of `P5-I5`, which stays
--     BLOCKED (D-064, `★` hard stop).
--
-- NO SECOND MIGRATION FOR `P5-I2B`. This file carries the entire capability transition; a
--     follow-up "part two" would by definition create a committed intermediate state.
--
-- NO DOWN MIGRATION. The repository does not carry reverse migrations (00 §6.2).
--
-- NO APPLICATION SURFACE. No service, repository, controller, DTO, route, encounter state
--     machine, document intake path, encryption/HMAC/redaction code and no change to
--     `schema.prisma` belongs to this package (§29.9.3, D-064 `OD-5`).
--
-- NO NEW ROLE, no `BYPASSRLS`, no `SECURITY DEFINER`, no fourth credential, no second Prisma
--     client, no third `users` policy, and no change of any kind to any policy or grant on
--     `practice_memberships` (D-061 clause 11, D-062 Dio B.4, §29.7).
-- =============================================================================

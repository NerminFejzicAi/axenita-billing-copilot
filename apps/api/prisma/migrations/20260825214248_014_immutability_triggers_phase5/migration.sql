-- =============================================================================
-- Migration package 014_immutability_triggers_phase5 — PHASE 5 AAD SLICE, sub-gate `P5-I2C`
--
-- Normative sources: 02 §2.7.4, §2.7.8, §19.3, §22.14, §25.8, §25.8a, §29.4a, §29.5, §29.7,
-- §29.10; D-025 clause 12, D-062 (`OD-P5-D2-1`), D-064 (function ACL hygiene of package
-- `014`, `OD-8`, `OD-9`), D-065, D-066. Implementation plan 04 §7.5a. Test strategy 08 §12.9.4.
--
-- This file is the phase 5 slice of package `014_immutability_triggers` and the EXCLUSIVE
-- OWNER of exactly FOUR database objects:
--
--     app_security.reject_aad_bound_column_change()   — the shared trigger function (§19.3)
--     patient_references_aad_immutable_trg            — BEFORE UPDATE FOR EACH ROW
--     encounters_aad_immutable_trg                    — BEFORE UPDATE FOR EACH ROW
--     encounter_documents_aad_immutable_trg           — BEFORE UPDATE FOR EACH ROW
--
-- plus the one `REVOKE` that belongs to that function.
--
-- WHY PHASE 5 AND NOT PHASE 7 (D-062 `OD-P5-D2-1`, 02 §22.14).
-- The canonical AAD of §2.7.4 binds `practice_id`, the table name, the ROW ID and the column
-- name. `encounter_documents` carries ciphertext FROM PHASE 5 ONWARDS, so an UPDATE that
-- moved `id` or `practice_id` after INSERT would leave existing ciphertext bound to an AAD it
-- no longer matches — permanently UNDECRYPTABLE data, not merely a policy violation. RLS
-- cannot prevent that: a same-tenant rewrite is legal from the policy's point of view.
-- Enforcement therefore executes here, applying the D-052 precedent in the EARLIER direction.
-- Package OWNERSHIP does not change; only the point of execution does.
--
-- THREE OF FIVE, DELIBERATELY. §19.3 names FIVE triggers. `candidate_evidence` and
-- `external_resource_links` DO NOT EXIST in phase 5, so their triggers follow in the phase
-- that owns their state (§22.14). Creating a fourth or fifth trigger here is impossible and
-- must not be attempted by an author who reads §19.3 without §22.14.
--
-- AUTHORING MECHANISM (D-050, 02 §26.3, 10 §7.1):
-- This package adds NO table, NO column, NO enum, NO constraint and NO index, and Prisma
-- models neither functions nor triggers (§29.9.3, D-064 `OD-5`). The canonical
-- `prisma migrate diff` workflow therefore produces an EMPTY structural candidate, which is
-- the expected and required outcome. Every statement below is hand-written custom SQL and is
-- authoritative on its own. `schema.prisma` is UNCHANGED by this package.
--
-- -----------------------------------------------------------------------------------------
-- THE EXPLICIT TRANSACTION — read this before editing.
-- -----------------------------------------------------------------------------------------
--
-- This file carries EXACTLY ONE top-level `BEGIN;` and EXACTLY ONE top-level `COMMIT;`, and
-- the function, its `REVOKE` and all three triggers live inside that single boundary. The
-- function and the triggers that reference it must become visible together: a committed state
-- in which the function exists WITHOUT its triggers is an unenforced AAD contract that looks
-- enforced in `pg_proc`, and a state in which a trigger exists without its `REVOKE` would
-- leave `PUBLIC` holding `EXECUTE` on a security object. Atomicity is a property of THIS
-- FILE and is NOT delegated to the assumption that the migration runtime implicitly wraps
-- `migration.sql` in a transaction.
--
-- THIS IS A LOCAL SAFETY CHOICE FOR THIS MIGRATION. D-065 `RULING 2` mandates the explicit
-- boundary for the phase 5 slice of package `013`; it does NOT establish a project-wide
-- transaction-wrapping policy, and this file must not be cited as if it did.
--
-- FORBIDDEN INSIDE THIS FILE, PERMANENTLY: an intermediate `COMMIT`, a second top-level
-- `BEGIN`, a `ROLLBACK`, a `SAVEPOINT`, `CREATE INDEX CONCURRENTLY`, `VACUUM`,
-- `CREATE DATABASE`, or any other statement that cannot run inside a transaction block.
--
-- -----------------------------------------------------------------------------------------
-- WHAT THIS PACKAGE DELIBERATELY DOES NOT DO
-- -----------------------------------------------------------------------------------------
--
-- NO GRANT AND NO TABLE-LEVEL REVOKE. Every `GRANT`, `REVOKE`, `ENABLE ROW LEVEL SECURITY`,
--     `FORCE ROW LEVEL SECURITY` and `CREATE POLICY` for the seven phase 5 tenant tables is
--     owned EXCLUSIVELY by the phase 5 slice of package `013` (§29.4a.1, D-064 `OD-1`), which
--     is canonical since `P5-I2B` (D-066). The ONLY `REVOKE` in this file targets THIS
--     package's own function. Not one statement here touches a table's ACL or RLS flags.
--
-- NO `EXECUTE` GRANT TO A RUNTIME ROLE (D-064, function ACL hygiene of package `014`; §19.3).
--     `REVOKE ALL … FROM PUBLIC` is issued and NOTHING is granted back. `copilot_app` and
--     `copilot_system` receive NO `EXECUTE`, and `copilot_migrator` holds owner rights only.
--     Trigger execution semantics are UNAFFECTED: PostgreSQL checks `EXECUTE` on a trigger
--     function when the TRIGGER IS CREATED — here, by the owner, inside this migration — and
--     the system executes the function in trigger context afterwards, not the caller through
--     a direct call. An `EXECUTE` grant to a runtime role would therefore add no capability
--     the triggers need and would hand `copilot_app` a directly callable security function.
--
-- NO `SECURITY DEFINER`. The function is `SECURITY INVOKER`, as §19.3 freezes it. A
--     `SECURITY DEFINER` variant is a PERMANENTLY REJECTED alternative for every `P5-I2`
--     addition (D-064, preserved authority).
--
-- NO NEW ROLE, no `BYPASSRLS`, no fourth credential, no second Prisma client, no owner
--     policy, no extension of the §23.4 maintenance allowlist, and no change of any kind to
--     any policy or grant on `practice_memberships` (D-061 clause 11, §29.7).
--
-- NO DML AND NO SEED. This package writes not one row.
--
-- NO APPLICATION SURFACE. No service, repository, controller, DTO, route, encryption/HMAC/
--     redaction code and no change to `schema.prisma` belongs to this package.
--
-- NO DOWN MIGRATION. The repository does not carry reverse migrations (00 §6.2). A
--     documented full reversal would drop the three triggers and then the function.
--
-- SUB-GATE `P5-I2V` / `★` — the RI-versus-RLS proof. NOT discharged here and NOT ADVANCED by
--     anything in this file. `★` requires, in ONE transaction under real `copilot_app` and
--     real `FORCE RLS`, that a same-practice co-member responsible-physician INSERT SUCCEEDS
--     through the composite foreign key WHILE a direct `SELECT` of that same
--     `practice_memberships` row returns ZERO ROWS. SQLSTATE `42501` is NOT that second half.
--     `★` remains a HARD precondition of `P5-I5`, which stays BLOCKED (D-064, `★` hard stop).
--
-- -----------------------------------------------------------------------------------------
-- THE COMMITTED-STATE INVARIANT
-- -----------------------------------------------------------------------------------------
--
-- BEFORE: `app_security` holds THREE context functions; the schema holds ZERO non-internal
--         triggers.
--
-- AFTER ONE COMMIT: `app_security` holds FOUR functions, the fourth being
--         `reject_aad_bound_column_change` with `PUBLIC` holding no `EXECUTE`, AND the schema
--         holds EXACTLY THREE non-internal triggers, all three `BEFORE UPDATE FOR EACH ROW`,
--         without a `WHEN` clause, all pointing at that one function.
--
-- There is no observable state in between.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. THE SHARED AAD TRIGGER FUNCTION (02 §19.3; D-025 clause 12)
--
-- ONE function for all trigger tables, exactly as §19.3 freezes it. It reads `NEW` and `OLD`
-- only, takes no argument, inspects no `TG_ARGV`, and does not branch on `TG_TABLE_NAME`:
-- the protected row-column set is IDENTICAL on all three tables (`id`, `practice_id`), so a
-- per-table branch would add a decision point without adding a decision.
--
-- `IS DISTINCT FROM` rather than `<>` is REQUIRED. `<>` yields NULL when either side is NULL,
-- and a NULL comparison in the `IF` would fall through to `RETURN NEW` — an AAD-bound column
-- rewritten to or from NULL would then pass silently. `IS DISTINCT FROM` is NULL-safe and
-- also makes the SAME-VALUE assignment succeed, which is the correct outcome: the AAD binding
-- is unchanged, so the ciphertext still matches.
--
-- SQLSTATE `23514` (`check_violation`) is the canonical code (§19.3, §25.8). It must never be
-- confused with `42501` (`insufficient_privilege`), which is what the INDEPENDENT FIRST
-- BARRIER of §29.5 raises: `copilot_app` holds no column-level `UPDATE` on `id` or
-- `practice_id` on any of the three tables, so a runtime attempt fails on PRIVILEGE before
-- this function is ever reached. The two barriers prove DIFFERENT THINGS and neither is
-- evidence for the other (§25.8a, proofs 2 and 3).
--
-- `SET search_path = pg_catalog, pg_temp` is the canonical configuration for THIS function
-- (§19.3). It deliberately differs from the `public, pg_temp` of the three context functions
-- of §16.2, which resolve `public` tables in their bodies; this one resolves nothing but
-- record fields and needs no application schema on its path. Neither configuration is
-- "corrected" towards the other.
--
-- `CREATE OR REPLACE` rather than `CREATE`: the function is idempotent by definition and a
-- replace keeps the identical body verifiable against §19.3 forever.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_security"."reject_aad_bound_column_change"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AAD-bound column (id, practice_id) is immutable after INSERT';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. FUNCTION ACL — RATIFIED (D-064; 02 §19.3, §22.14)
--
-- PostgreSQL grants `EXECUTE` on a newly created function to `PUBLIC` by default. That
-- default is REVOKED here and NOTHING is granted back, so the final explicit ACL surface is:
--
--     PUBLIC           — none
--     copilot_app      — none
--     copilot_system   — none
--     copilot_migrator — owner rights only
--
-- A `GRANT EXECUTE` to `copilot_app` or `copilot_system` is PERMANENTLY FORBIDDEN here
-- (D-064). The three triggers below are created by the owner in this same transaction, which
-- is the only moment `EXECUTE` is checked; afterwards the system runs the function in trigger
-- context. A runtime grant would therefore buy the triggers nothing and would expose a
-- security function to a direct call from the application role.
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION "app_security"."reject_aad_bound_column_change"() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. THE THREE AAD IMMUTABILITY TRIGGERS (02 §19.3, §22.14; D-062 `OD-P5-D2-1`)
--
-- Naming follows `<table>_<purpose>_trg` (12 §8), exactly as §19.3 fixes the three names.
--
-- `BEFORE UPDATE` — BEFORE, so the offending row version never reaches storage, and bare
--     `UPDATE`, NEVER `UPDATE OF id, practice_id`. `UPDATE OF` narrows the firing condition
--     in the trigger definition, where a later schema change can silently outgrow it; the
--     function compares the old and new row itself, which stays correct no matter which
--     columns a statement names.
--
-- `FOR EACH ROW` — the comparison is per row. A statement-level trigger has no `NEW`/`OLD`
--     record to compare and could not implement §19.3 at all.
--
-- NO `WHEN` CLAUSE — §19.3, verbatim. `WHEN` would move the condition out of the function and
--     into the trigger definition, where it is easier to overlook when the schema changes,
--     and the performance gain at MVP scale is negligible.
--
-- All three point at the SAME function. Three triggers, one behaviour, one place to audit.
-- -----------------------------------------------------------------------------

CREATE TRIGGER "patient_references_aad_immutable_trg"
BEFORE UPDATE ON "patient_references"
FOR EACH ROW
EXECUTE FUNCTION "app_security"."reject_aad_bound_column_change"();

CREATE TRIGGER "encounters_aad_immutable_trg"
BEFORE UPDATE ON "encounters"
FOR EACH ROW
EXECUTE FUNCTION "app_security"."reject_aad_bound_column_change"();

CREATE TRIGGER "encounter_documents_aad_immutable_trg"
BEFORE UPDATE ON "encounter_documents"
FOR EACH ROW
EXECUTE FUNCTION "app_security"."reject_aad_bound_column_change"();

COMMIT;

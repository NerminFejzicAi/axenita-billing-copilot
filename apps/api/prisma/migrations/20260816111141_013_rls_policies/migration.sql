-- =============================================================================
-- Migration package 013_rls_policies — PHASE 4 EXECUTABLE SLICE
--
-- Normative sources: 02_DATABASE_SCHEMA_V1.md §16.2.3, §17.0, §17.1, §17.1a, §17.3,
-- §18.1, §20.2b, §20.2b.1, §20.2b.2, §22.13, §23.4, §23.4.4a, §25.2.2;
-- D-023, D-029, D-033, D-046, D-047, D-048, D-049, D-050, D-051, D-052, D-053.
-- Implementation plan 04 §6.3. Test strategy 08 §21.8, §24a, §26.1, §26.2.
--
-- This file is the DATABASE-ONLY slice of phase 4. It introduces tenant isolation for the
-- two tables that phase 3 deliberately left without RLS, plus the tenant context function
-- that gates it. No application code, no seed code, no test code and no Prisma model change
-- belongs to this file.
--
-- AUTHORING MECHANISM (D-050, §26.3, 10 §7.1):
-- The canonical `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma
-- --script` workflow was executed against a correctly bootstrapped canonical migration
-- database carrying `001` + `002`, and produced an EMPTY structural candidate. That empty
-- result is the expected and required outcome: package `013` adds NO table, NO column, NO
-- enum, NO constraint and NO index, and Prisma models none of the security objects below.
-- Every statement in this file is therefore hand-written custom SQL and is authoritative
-- over the candidate (§26, §26.2). `prisma migrate dev --create-only` is NOT used: its
-- shadow database is structurally incompatible with the deliberate ownership and privilege
-- guards of migration `001`, and no guard of `001` may be weakened for it. `prisma db push`
-- stays forbidden.
--
-- ORDER (normative, §22.2, identical to the order package `002` follows):
--     grants -> ENABLE/FORCE RLS -> policies -> functions
--
-- PACKAGE BOUNDARY (§17.0, §22.13; D-047 clause 16, D-051 clauses 1, 5 and 6, D-052):
--   * package `002_identity_and_practices` is the FINAL owner of the §17.2, §17.4, §17.5 and
--     §17.6 RLS artifacts — `users`, `practices`, `platform_role_assignments` and
--     `practice_membership_roles`. THIS PACKAGE MUST NOT RECREATE, REPLACE OR OVERWRITE
--     THEM, and contains no `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY` or `FORCE ROW LEVEL
--     SECURITY` for those four tables. All SEVEN phase 3 policies stay catalogue-identical;
--   * this package owns `set_request_context` (§16.2.3) and creates it here, NOT in `002`;
--   * `set_auth_subject_context` (§16.2.4) and `set_user_context` (§16.2.2) belong to `002`
--     and are NOT touched here;
--   * package `014_immutability_triggers` is NOT touched: this file creates NO trigger
--     (D-053 clause B.3);
--   * no new package number is introduced and no existing package is renumbered
--     (§22, D-052 clause A.6).
--
-- WHAT PHASE 4 CLOSES. Phase 3 accepted two documented intermediate exposures, both of which
-- end with this file: the generic membership visibility of D-047 clause 18 as narrowed by
-- D-051 clause 5 (`practice_memberships`), and the
-- `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` of D-049 clause 3
-- (`practice_settings`). After this migration neither table is enumerable by a holder of the
-- shared `copilot_app` credential.
--
-- `GET /me` CONSEQUENCE (D-053 part D, §17.1a, §20.2b.2). Introducing the tenant policy on
-- `practice_settings` changes the result of the conditional read performed by the NEUTRAL
-- `GET /me` route, which never establishes tenant context. The policy is NOT weakened to
-- accommodate it: NO bootstrap exception, NO membership-wide branch and NO `X-Practice-ID`
-- requirement on `/me` is introduced here. The remedy is EXCLUSIVELY an application-path
-- adaptation and belongs to a later phase 4 slice, not to this migration (D-053 clause D.13).
--
-- NO `SECURITY DEFINER` FUNCTION IS INTRODUCED ANYWHERE (D-047 clause 2, D-048 clause 1,
-- D-052 clause B.3, D-053 clause B.5).
-- NO `BYPASSRLS`, NO `CREATE ROLE`, NO `ALTER ROLE`, NO SUPERUSER PATH, NO PERMANENT
-- MIGRATOR/OWNER WRITE POLICY.
-- NO OPERATIONAL `DISABLE ROW LEVEL SECURITY` EXISTS IN THIS FORWARD MIGRATION (§23.4.5).
-- NO TRIGGER IS CREATED. NO TABLE, COLUMN, ENUM, CONSTRAINT OR INDEX IS ADDED OR ALTERED.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `practice_settings` grants — EXACTLY NINE `SELECT` AND EXACTLY NINE `UPDATE` COLUMNS
--    (§20.2b.1, D-049 clause 5, D-053 parts A and B)
--
-- Both surfaces are COLUMN-LEVEL and COUNTED. `02` §20.2b forbids table-level `SELECT`, and
-- §20.2b.1 forbids table-level `UPDATE`. Neither is granted below.
--
-- `SELECT` — nine columns: eight carry the frozen settings representation of D-053 clause
-- A.1 (`03` §10), the ninth (`version`) carries the `ETag` of D-053 clause A.2.
--
-- The phase 3 three-column surface of D-049 clause 2 — `practice_id`, `allow_mpa_approval`,
-- `allow_billing_specialist_approval` — is a STRICT SUBSET of this nine-column list. Phase 4
-- EXTENDS it. NO PHASE 3 GRANT IS REVOKED (D-053 clause A.5), so the effective column
-- privilege set after this statement is exactly the nine columns named here, and no phase 3
-- consumer breaks at the privilege level. What changes for `GET /me` is RLS, not the grant
-- (§17.1a, §20.2b.2).
--
-- These columns stay UNREADABLE for `copilot_app` and appear in neither list:
--     id, configuration, updated_by
-- `updated_at` is writable but NOT readable — internal metadata is not exposed merely
-- because it exists in the table (D-053 clause A.4).
--
-- A column outside the granted set fails with SQLSTATE `42501` EVEN WHEN IT IS USED ONLY IN
-- A `WHERE` PREDICATE OR IN `ORDER BY` (§20.2b, §20.2b.1).
-- -----------------------------------------------------------------------------

GRANT SELECT (
  "practice_id",
  "billing_review_required",
  "allow_mpa_approval",
  "allow_billing_specialist_approval",
  "require_reason_for_manual_change",
  "ai_enabled",
  "axenita_export_enabled",
  "retention_policy_code",
  "version"
) ON TABLE "practice_settings" TO "copilot_app";

-- `UPDATE` — nine columns: seven business settings plus `version` and `updated_at` as
-- concurrency/maintenance metadata (D-053 clause B.1).
--
-- Runtime `UPDATE (version)` is the ACCEPTED MINIMUM that the existing optimistic-locking
-- architecture requires (D-029, D-009, `03` §5.2, D-053 clause B.5). The rejected
-- alternatives stay rejected in every form: NO trigger on `version`, NO `SECURITY DEFINER`,
-- NO privileged helper function, NO change to package `014_immutability_triggers`, NO new
-- migration package, NO API field carrying an arbitrary version.
--
-- `updated_at` is set BY THE DATABASE during the `UPDATE`; the API caller never sends it.
-- `version` is never sent either — the expected version comes exclusively from `If-Match`
-- (`03` §5.2, D-053 clause B.6).
--
-- These columns stay WITHOUT `UPDATE` for `copilot_app` (D-053 clause B.2):
--     practice_id, id, configuration, updated_by
--
-- `practice_id` is deliberately absent: without `UPDATE (practice_id)` a tenant-key move is
-- rejected on the PRIVILEGE level, before the `WITH CHECK` of the tenant policy is even
-- reached. Two independent barriers, not one.
--
-- `updated_by` stays untouched (D-053 clause B.3). The settings endpoint does not write it
-- and it is NOT an authoritative audit field; actorship remains in the canonical audit model,
-- WITHOUT a new trigger.
--
-- NO `INSERT` AND NO `DELETE` IS GRANTED TO ANY RUNTIME ROLE, in phase 4 either: the settings
-- row is created by the trusted seed path (§23.4), never by a request path (§20.2b.1).
--
-- This `UPDATE` grant is introduced TOGETHER WITH the tenant policy that constrains it in
-- section 3 below. An `UPDATE` grant without that policy is forbidden and fails the phase
-- gate (D-049 clause 5, unchanged by D-053).
GRANT UPDATE (
  "billing_review_required",
  "allow_mpa_approval",
  "allow_billing_specialist_approval",
  "require_reason_for_manual_change",
  "ai_enabled",
  "axenita_export_enabled",
  "retention_policy_code",
  "version",
  "updated_at"
) ON TABLE "practice_settings" TO "copilot_app";

-- NOTE: `practice_memberships` receives NO grant change in this package. Its table-level
-- `SELECT` grant to `copilot_app` was declared FINAL by package `002` and is deliberately
-- LEFT EXACTLY AS IS. Narrowing it here would break `practices_membership_select` (§17.6)
-- and `practice_membership_roles_self_select` (§17.4) with SQLSTATE 42501, because a policy
-- whose expression sub-queries another table requires the CALLER to hold privileges on that
-- table (D-047 clause 7, D-051 clause 4). Confinement of that table is achieved by RLS in
-- sections 2 and 3, NOT by removing the grant.
--
-- NO grant of any kind is issued to `copilot_system` or to `PUBLIC` on either table. Both are
-- tenant tables and `copilot_system` holds no privilege on any tenant table (D-023).
-- `copilot_migrator` remains the owner of both (§3.5); no runtime role owns anything.

-- -----------------------------------------------------------------------------
-- 2. `ENABLE` + `FORCE ROW LEVEL SECURITY` — the two remaining phase 4 tables
--    (§17.3, §18.1, §22.13; D-033 clause 5, D-049 clause 5, D-051 clause 5)
--
-- After this section SIX tables carry `relrowsecurity = true` AND
-- `relforcerowsecurity = true`: the four owned by package `002` — `users`, `practices`,
-- `platform_role_assignments`, `practice_membership_roles` — and the two below. The four are
-- NOT re-altered here; they already hold that state and this package does not touch them.
--
-- `FORCE` is mandatory alongside `ENABLE` and is not a stylistic choice: without it the table
-- OWNER `copilot_migrator` silently bypasses every policy, which would leave the trusted
-- migration/seed identity with unrestricted read of both tables and make the isolation
-- assertions of §25.2.2 untrue.
--
-- The consequence of `FORCE` for the trusted seed path is recorded in section 5.
-- -----------------------------------------------------------------------------

ALTER TABLE "practice_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_memberships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "practice_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_settings" FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Policies — exactly THREE new policies (§17.1, §17.3)
--
--     practice_memberships -> practice_memberships_self_select
--     practice_settings    -> practice_settings_select, practice_settings_update
--
-- Total after this package: TEN policies. The SEVEN policies of package `002` are neither
-- dropped, nor replaced, nor re-created, nor semantically altered — including the RESTRICTIVE
-- mode of `practices_context_narrow`, which stays RESTRICTIVE (§17.6, D-051 clause 6).
-- -----------------------------------------------------------------------------

-- `practice_memberships` — bootstrap-safe USER-SCOPED pattern (§17.3, D-033 clauses 5-6, 13).
--
-- THIS TABLE DELIBERATELY DOES NOT USE THE §17.1 TENANT PATTERN. `practice_memberships` is
-- read BEFORE `app.practice_id` exists, because `set_request_context` determines FROM THIS
-- VERY TABLE whether the tenant context may be established at all. A
-- `practice_id = app.practice_id` policy here would be circular: the context could never be
-- established, and `GET /me` — which enumerates memberships on a neutral route — would return
-- zero rows. The policy is therefore bound to `app.user_id`, NOT to `app.practice_id`
-- (D-033 clause 6). `app.practice_id` has NO effect on membership visibility.
--
-- `app.user_id` is set by `set_user_context` (§16.2.2) exclusively from a cryptographically
-- verified authenticated user, before any membership validation (§16.2a). Without it the
-- table returns ZERO ROWS. No user can read another user's membership rows.
--
-- The policy deliberately does NOT filter `active`. RLS governs VISIBILITY of one's own rows
-- here, not authorisation: `03` §10 requires an INACTIVE membership to remain visible in the
-- frozen `GET /me` response with `permissions = []`. Authorisation is enforced by the
-- application and by `set_request_context`, which DOES require `active = true`.
--
-- SELECT ONLY. No `INSERT`, `UPDATE` or `DELETE` policy and no such grant exists for any
-- runtime role (D-033 clause 13). Membership administration is not a v1 runtime operation.
--
-- EFFECT ON THE TWO PACKAGE `002` POLICIES THAT SUB-QUERY THIS TABLE. Once RLS is enabled
-- here, the `EXISTS` sub-queries inside `practices_membership_select` (§17.6) and
-- `practice_membership_roles_self_select` (§17.4) become subject to this policy. Both already
-- constrain `pm.user_id = nullif(current_setting('app.user_id', true), '')::uuid`, which is
-- the IDENTICAL predicate, so the row set they observe is unchanged and neither policy
-- regresses. This is why the supporting table-level `SELECT` grant of section 1 must survive.
CREATE POLICY "practice_memberships_self_select"
ON "practice_memberships"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
);

-- `practice_settings` — standard tenant pattern, verbatim from §17.1 (D-049 clause 5,
-- D-053 clause D.1).
--
-- The predicate is the canonical tenant predicate and is NOT weakened in any way. With
-- `app.practice_id` unset it evaluates to `practice_id = NULL`, which yields ZERO ROWS for
-- every practice — no bootstrap exception exists and none may be added (D-053 clause D.11).
-- Tenant context must already be established through the accepted `set_request_context` path
-- before this table is readable at all.
--
-- `practice_id` is `NOT NULL`, so the §17.1 assumption holds and no row can hide behind a
-- NULL tenant key.
CREATE POLICY "practice_settings_select"
ON "practice_settings"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- The `UPDATE` policy carries BOTH `USING` and `WITH CHECK` with the same tenant predicate,
-- and that pairing is normative, not redundant (§17.1):
--
--   * `USING`      decides WHICH ROWS may be updated — a row of another practice is not even
--                  visible to the `UPDATE`, so a cross-tenant write affects ZERO ROWS;
--   * `WITH CHECK` decides WHAT THE ROW MAY BECOME — it forbids moving a row OUT of the
--                  established tenant by rewriting `practice_id`.
--
-- Omitting `WITH CHECK` would leave the tenant key movable. Note that `practice_id` also
-- carries NO `UPDATE` grant (section 1), so a tenant-key move is rejected twice over: once on
-- privilege, once on policy.
--
-- NO `INSERT` POLICY AND NO `DELETE` POLICY IS CREATED, matching the absence of `INSERT` and
-- `DELETE` grants (§20.2b.1). The settings row is created by the trusted seed path (§23.4),
-- never by a request path. A `DELETE` policy is not created because business delete is not
-- permitted (§17.1).
CREATE POLICY "practice_settings_update"
ON "practice_settings"
AS PERMISSIVE
FOR UPDATE
TO "copilot_app"
USING (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
)
WITH CHECK (
  "practice_id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- -----------------------------------------------------------------------------
-- 4. Tenant context function — `set_request_context` (§16.2.3, D-033 clauses 7-12)
--
-- Signature, `SECURITY INVOKER` mode and body are EXACTLY as D-033 froze them and as §16.2.3
-- states them. D-038 clause 21, D-047 clause 10 and D-053 all leave this function unchanged.
--
-- `SECURITY INVOKER` (D-033 clause 8) is mandatory. The function executes AS `copilot_app`,
-- so its membership lookup is filtered by the very policy created in section 3 above. A
-- forged `user_id` could return no row even if it could be injected — and it cannot be, since
-- the function does NOT accept `p_user_id` and derives the user EXCLUSIVELY from
-- `app.user_id` (D-033 clause 9). A `SECURITY DEFINER` variant is a PERMANENTLY REJECTED
-- alternative (D-047 clause 2): it would reintroduce the construct D-033 rejected, would
-- itself escape FORCE RLS, and would create a privileged callable taking arbitrary input.
--
-- CLEAR-BEFORE-VALIDATE (D-033 clause 10) is the security-critical ordering: `app.practice_id`
-- is cleared as the FIRST statement, before any validation. A failed context switch therefore
-- CANNOT leave the previous tenant scope usable — a successful switch to practice A followed
-- by a rejected switch to practice B ends with NO tenant context, not with A still active.
-- `app.practice_id` is set ONLY after the membership is verified (D-033 clause 12), so
-- repeated calls can neither accumulate nor mix context (D-053 clause D.9).
--
-- The membership must be ACTIVE (D-033 clause 11). An inactive membership raises `42501`,
-- which is exactly why `GET /me` must not call this function for an inactive membership
-- (D-053 clause D.4).
--
-- `practices.status` IS DELIBERATELY NOT CHECKED HERE (D-047 clause 10, D-053 clause C.3).
-- That check is APPLICATION-LEVEL and runs BEFORE this call, as step 7 of the authoritative
-- eleven-step order in `03` §3.7.1. Adding it to this body is forbidden.
--
-- The function reads `practice_memberships` ONLY. It does NOT read
-- `practice_membership_roles`, does not accept a role, and does not establish platform
-- context (D-038 clauses 20-21).
--
-- Fixed `search_path` and transaction-local `set_config(..., true)`: no context survives the
-- transaction and none leaks into a pooled connection.
--
-- Like the two context functions of package `002`, this is NOT a privilege boundary and this
-- package does not claim it is — `copilot_app` may set the same GUC directly. The controls
-- that survive a stolen credential are the column grants, the absent write grants, the absent
-- ownership and NOBYPASSRLS (§16.2a, D-047 clause 20).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_security"."set_request_context"(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  PERFORM set_config('app.practice_id', '', true);

  v_user_id := nullif(current_setting('app.user_id', true), '')::uuid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'User context is not established';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM practice_memberships pm
    WHERE pm.practice_id = p_practice_id
      AND pm.user_id = v_user_id
      AND pm.active = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'User is not a member of requested practice';
  END IF;

  PERFORM set_config('app.practice_id', p_practice_id::text, true);
END;
$$;

REVOKE ALL ON FUNCTION "app_security"."set_request_context"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_security"."set_request_context"(uuid) TO "copilot_app";

-- After this section `app_security` contains EXACTLY THREE functions, all SECURITY INVOKER,
-- all owned by `copilot_migrator`, all with a fixed `search_path`, all with `PUBLIC` EXECUTE
-- revoked and `EXECUTE` held only by `copilot_app`:
--     set_auth_subject_context(text)   -- package 002 (§16.2.4)
--     set_user_context(uuid)           -- package 002 (§16.2.2)
--     set_request_context(uuid)        -- THIS package (§16.2.3)

-- -----------------------------------------------------------------------------
-- 5. PHASE 4 `FORCE RLS` SEED/MAINTENANCE ALLOWLIST EXTENSION — DOCUMENTATION ONLY
--    (§23.4, §23.4.4, §23.4.4a; D-048, D-052 part B)
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. Every line is commentary.
--
-- THIS IS THE EXPLICIT PACKAGE CLAUSE THAT §23.4.4 REQUIRES. Sections 2 and 3 above are what
-- first put `practice_memberships` and `practice_settings` under `FORCE ROW LEVEL SECURITY`,
-- and §23.4.4 permits the D-048 seed/maintenance allowlist to grow ONLY through an explicitly
-- accepted decision OR an explicit clause in the package that introduces `FORCE RLS` for that
-- table. Both conditions are satisfied: D-052 part B is the accepted decision, and this
-- section is that clause. A SILENT EXTENSION IS FORBIDDEN and fails the phase gate
-- (`08` §26.2).
--
-- WHY THE EXTENSION IS NECESSARY. Under `FORCE ROW LEVEL SECURITY` even the table OWNER
-- `copilot_migrator` is subject to the policies, and no policy created above permits an owner
-- write — every policy is `FOR SELECT`/`FOR UPDATE` and scoped `TO copilot_app`. Trusted seed
-- DML against these two tables therefore fails from this migration onward. Without this
-- clause phase 4 would sit in a dead end: `FORCE RLS` on tables the seed must populate, with
-- no permitted way to populate them — pressure toward exactly the four bypasses that are
-- permanently rejected.
--
-- PHASE 3 D-048 ALLOWLIST — EXACTLY FOUR TABLES (§23.4.4, UNCHANGED BY THIS PACKAGE):
--
--     users
--     practices
--     practice_membership_roles
--     platform_role_assignments
--
-- PHASE 4 EXTENSION — EXACTLY TWO TABLES, THE TWO THIS PACKAGE PUTS UNDER `FORCE RLS`
-- (§23.4.4a, D-052 clause B.2). The trusted seed path genuinely writes to BOTH:
--
--     practice_memberships
--     practice_settings
--
-- TOTAL ALLOWLIST AFTER PHASE 4 — EXACTLY SIX TABLES (four + two). Phase 4 EXTENDS the
-- phase 3 allowlist; it does NOT replace it (§23.4.4a, D-052 clause B.2).
--
-- THIS MIGRATION DOES NOT MODIFY SEED CODE. `seed.ts` and the allowlist constant in code are
-- NOT changed by this file, and no seed DML lives here. This clause RECORDS THE AUTHORISATION
-- that a later phase 4 implementation slice consumes; until that slice runs, the allowlist in
-- code remains the phase 3 allowlist (§23.4.4a, D-052 clause B.4).
--
-- MANDATORY CONDITIONS OF THE EXTENSION (§23.4.4a; D-052 clause B.3) — the later slice that
-- implements it inherits ALL of them, unchanged:
--
--     * the extension is EXPLICIT, never silent;
--     * `FORCE RLS` is RESTORED AFTER THE SEED;
--     * FAILURE AND ROLLBACK PATHS RESTORE `FORCE RLS` — rollback must NEVER leave FORCE off;
--     * NO `BYPASSRLS` ON ANY ROLE;
--     * NO `SECURITY DEFINER` BYPASS;
--     * NO SUPERUSER RUNTIME OR SEED PATH;
--     * NO `DISABLE ROW LEVEL SECURITY`;
--     * NO PERMANENT OWNER-WRITE POLICY (no permanent `copilot_migrator` RLS policy);
--     * tests prove steady-state `ENABLE` AND `FORCE` BEFORE AND AFTER the seed (`08` §21.8).
--
-- The §23.4.3 protocol and the §23.4.5 normative rules apply UNCHANGED: ONE explicit
-- `copilot_migrator` transaction, autocommit forbidden, which opens the window with
-- `NO FORCE ROW LEVEL SECURITY`, asserts `relrowsecurity = true` /
-- `relforcerowsecurity = false`, executes EXCLUSIVELY the trusted seed DML, closes the window
-- with `FORCE ROW LEVEL SECURITY`, and asserts `relrowsecurity = true` /
-- `relforcerowsecurity = true` before `COMMIT`. RLS STAYS ENABLED THROUGH THE ENTIRE WINDOW —
-- only the FORCE attribute changes. Unrelated security DDL inside the window is forbidden. A
-- failed restore assertion must raise and abort the transaction.
--
-- The maintenance mechanism is MAINTENANCE ONLY. It must NEVER be reachable from a
-- request/runtime application path and must never be implemented as a runtime-callable
-- function (§23.4.2, D-048 clause 1).
--
-- Steady-state `relrowsecurity = true` and `relforcerowsecurity = true` for all SIX
-- allowlisted tables — after migration AND after seed — are PERMANENT regression tests, not a
-- one-off check (§20.4, §25.1.2, `08` §21.6, §21.8).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 6. DEFERRED SLICE — `review_decision_change_links` — DOCUMENTATION ONLY
--    (§17.0, §22.13; D-052 clauses A.1-A.9)
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. Every line is commentary, and no statement
-- anywhere in this file references `review_decision_change_links` as an existing database
-- object.
--
-- THE TABLE DOES NOT EXIST YET AND PHASE 4 DOES NOT CREATE IT. It is created by package
-- `009_review_approvals` in PHASE 10 (§22.9). Earlier documentation assigned its `ENABLE`,
-- `FORCE`, tenant policy and grants to phase 4 through this package, which was physically
-- impossible: RLS and grants cannot exist on a table that has not been created, and phase 4
-- could not have closed truthfully.
--
-- D-052 separates two concepts that earlier documentation conflated:
--
--     package ownership -> 013_rls_policies   (UNCHANGED — this package still owns the slice)
--     execution phase   -> phase 10           (DEFERRED — formerly phase 4)
--
-- PHASE 4 EXECUTES NOTHING FOR THAT TABLE: no `CREATE TABLE`, no `ALTER TABLE`, no
-- `ENABLE`/`FORCE ROW LEVEL SECURITY`, no `CREATE POLICY`, no `GRANT`. The security semantics
-- of §13.2a, §18.1 and D-046 clauses 25-33 remain LITERALLY UNCHANGED — only the point of
-- execution moved. NO NEW PACKAGE NUMBER IS INTRODUCED AND NONE IS RENUMBERED (D-052 clause
-- A.6).
--
-- The deferred slice runs in phase 10 IMMEDIATELY AFTER package `009` creates the table, so
-- the table receives `ENABLE` + `FORCE RLS` and its final grants IN THE SAME PHASE IN WHICH IT
-- CAN FIRST HOLD A ROW. There is never a window in which it holds data without RLS.
--
-- The phase 4 assertion is NEGATIVE and verifiable here: the table does not exist after this
-- migration, and this package contains no RLS object for it (D-052 clause A.7).
--
-- The generic tenant RLS pattern itself is NOT deferred. Phase 4 establishes it in full on
-- `practice_settings` (D-052 clause A.8); only one slice over one non-existent table moved.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 7. ROLLBACK — DOCUMENTATION ONLY, NOT EXECUTED BY THIS MIGRATION
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. Every line below is commentary. The forward
-- migration above contains ZERO operational `DISABLE ROW LEVEL SECURITY`, which §23.4.5 and
-- D-048 clause 4 forbid in forward migrations, seeds and maintenance windows alike. The
-- prohibition does NOT extend to an explicitly documented rollback that fully reverses the
-- migration and removes the policies together with the RLS, because there the removal of RLS
-- is the intended consequence of undoing the migration and not a window for writing.
--
-- Full-reversal semantics, in this order — DROP the policies FIRST, then disable RLS, then
-- revoke the grants, then drop the function:
--
--     drop policy practice_memberships_self_select on practice_memberships;
--     drop policy practice_settings_select         on practice_settings;
--     drop policy practice_settings_update         on practice_settings;
--
--     alter table practice_memberships disable row level security;
--     alter table practice_settings    disable row level security;
--
--     revoke update (
--       billing_review_required, allow_mpa_approval, allow_billing_specialist_approval,
--       require_reason_for_manual_change, ai_enabled, axenita_export_enabled,
--       retention_policy_code, version, updated_at
--     ) on practice_settings from copilot_app;
--
--     revoke select (
--       billing_review_required, require_reason_for_manual_change, ai_enabled,
--       axenita_export_enabled, retention_policy_code, version
--     ) on practice_settings from copilot_app;
--
--     drop function app_security.set_request_context(uuid);
--
-- NOTE on the `SELECT` reversal: it revokes ONLY THE SIX COLUMNS THIS PACKAGE ADDED. The
-- phase 3 three-column surface — `practice_id`, `allow_mpa_approval`,
-- `allow_billing_specialist_approval` — belongs to package `002` (D-049 clause 2) and MUST
-- SURVIVE the rollback of this package, otherwise the phase 3 `GET /me` conditional read
-- breaks. Reverting the whole nine-column grant would be a package-boundary violation.
--
-- The rollback removes nothing that belongs to package `002`: the four `002` tables keep
-- their RLS, all seven `002` policies survive, and `set_auth_subject_context` and
-- `set_user_context` are not dropped.
--
-- Rollback is non-destructive and fails closed; the project has no production data (§22.2).
-- A rollback must NEVER be used as a substitute for the §23.4 maintenance window, and must
-- never leave a table with RLS enabled but FORCE off.
-- -----------------------------------------------------------------------------

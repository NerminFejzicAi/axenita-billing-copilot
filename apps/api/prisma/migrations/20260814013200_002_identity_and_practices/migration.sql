-- =============================================================================
-- Migration package 002_identity_and_practices
--
-- Normative sources: 02_DATABASE_SCHEMA_V1.md §4.1, §4.2, §4.16, §6.1–§6.5, §16.1,
-- §16.2.2, §16.2.4, §17.0, §17.2, §17.4, §17.5, §17.6, §18.2, §20.2, §20.2a, §20.2b, §21,
-- §22.2, §23.4, §26.3; D-023, D-033, D-038, D-047, D-048, D-049, D-050, D-051.
-- Implementation plan 04 §5.2, §5.2.1.
--
-- This package owns EVERY schema object of phase 3. No new package number is introduced
-- and no existing package is renumbered (§22.2, D-038, D-047, D-049 clause 1, D-051
-- clauses 1 and 6).
--
-- AUTHORING MECHANISM (D-050, §26.3, 10 §7.1):
-- The structural portion of this file is the CANDIDATE produced by
-- `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script`
-- against the correctly bootstrapped canonical migration database. `migrate diff` output is
-- A CANDIDATE, NOT TRUTH: every CHECK constraint, composite foreign key, grant, revoke,
-- ENABLE/FORCE RLS statement, policy, function and security assertion below is hand-written
-- custom SQL that Prisma does not express, and it is authoritative over the candidate (§26,
-- §26.2). `prisma migrate dev --create-only` is NOT used: its shadow database is structurally
-- incompatible with the deliberate ownership and privilege guards of migration `001`, and no
-- guard of `001` may be weakened for it. `prisma db push` stays forbidden.
--
-- ORDER (normative, §22.2 / D-047 clause 18 / D-051 `Migration/rollout`):
--     enums -> tables -> constraints/indexes -> app_security schema -> grants
--          -> ENABLE/FORCE RLS -> policies -> functions
--          -> (at seed time only) the §23.4 maintenance window
--
-- `practices_membership_select` and `practice_membership_roles_self_select` are created only
-- after `practice_memberships` exists AND after `copilot_app` holds SELECT on it: a policy
-- whose expression sub-queries another table requires the *caller* to hold privileges on that
-- table, otherwise every query fails with SQLSTATE 42501 (§17.4, §17.6, §20.2a, D-047
-- clause 7, D-051 clause 4).
--
-- PHASE BOUNDARY (D-047 clause 16 as amended by D-051 clauses 1, 5 and 6; §17.0, §22.13):
--   * this package owns `set_auth_subject_context` and `set_user_context`;
--   * `set_request_context` stays in `013_rls_policies` / phase 4 and is NOT created here;
--   * THIS PACKAGE IS THE FINAL OWNER of the §17.2 (`platform_role_assignments`) and §17.4
--     (`practice_membership_roles`) RLS artifacts. They were moved here from
--     `013_rls_policies` / phase 4 by D-051; only package ownership moved, while policy
--     names, policy bodies and the accepted grants stay IDENTICAL. Package `013` MAY later
--     use and verify them but MUST NOT recreate, replace or overwrite them, and contains no
--     `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY` or `FORCE ROW LEVEL SECURITY` for those
--     two tables (§22.13, D-051 clause 6);
--   * RLS for `practice_memberships` (§17.3) and RLS for `practice_settings` belong to
--     `013_rls_policies` / phase 4 and are deliberately NOT enabled here (D-049 clause 5,
--     D-051 clause 5). The phase 3 intermediate state of D-047 clause 18 therefore NARROWS
--     to `practice_memberships` alone; 08 §21.5.6 records that remaining generic membership
--     visibility as expected and documented, not as a defect.
--
-- NO `SECURITY DEFINER` FUNCTION IS INTRODUCED ANYWHERE (D-047 clause 2, D-048 clause 1).
-- NO `BYPASSRLS`, NO `CREATE ROLE`, NO SUPERUSER PATH, NO PERMANENT MIGRATOR BYPASS POLICY.
-- NO OPERATIONAL `DISABLE ROW LEVEL SECURITY` EXISTS IN THIS FORWARD MIGRATION (§23.4.5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums (§4.1, §4.2, §4.16)
--
-- `entity_status` is one shared type for `practices.status` and `users.status`: §4.2
-- declares a single value set for both. The value set is normative; the physical type name
-- is a naming resolution of the phase 3 implementation authorisation, not a new decision.
--
-- `membership_role` carries exactly the six tenant roles (§4.1) and is used only by
-- `practice_membership_roles` (D-038). `platform_role` carries exactly `SYSTEM_ADMIN`
-- (§4.16) and is used only by `platform_role_assignments`. The two enums never mix: a
-- platform role is not a tenant role and grants no tenant permission (D-038 clauses 12-13).
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "entity_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('PRACTICE_ADMIN', 'PHYSICIAN', 'MPA', 'BILLING_SPECIALIST', 'AUDITOR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('SYSTEM_ADMIN');

-- -----------------------------------------------------------------------------
-- 2. Tables (§6.1-§6.5)
--
-- No column carries a UUID default: the application generates every identifier before
-- INSERT, because the canonical AAD of the encryption envelope contains `row_id`
-- (§2.2, §26.1). `gen_random_uuid()` therefore never appears in this package.
--
-- `practice_memberships` is created WITHOUT a singular `role` column and WITHOUT the
-- `(practice_id, active, role)` index (D-038 clause 2). Tenant role assignment lives in
-- `practice_membership_roles` and nowhere else.
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "practices" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "zsr_number" VARCHAR(50),
    "gln_number" VARCHAR(50),
    "default_language" VARCHAR(10) NOT NULL DEFAULT 'de-CH',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Zurich',
    "status" "entity_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "preferred_language" VARCHAR(10) NOT NULL,
    "status" "entity_status" NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_memberships" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "professional_gln" VARCHAR(50),
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_membership_roles" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_settings" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "billing_review_required" BOOLEAN NOT NULL,
    "allow_mpa_approval" BOOLEAN NOT NULL DEFAULT false,
    "allow_billing_specialist_approval" BOOLEAN NOT NULL DEFAULT false,
    "require_reason_for_manual_change" BOOLEAN NOT NULL,
    "ai_enabled" BOOLEAN NOT NULL,
    "axenita_export_enabled" BOOLEAN NOT NULL,
    "retention_policy_code" VARCHAR(100),
    "configuration" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform_role" "platform_role" NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,

    CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- 3. Constraints and indexes (§6.1-§6.5, §21)
--
-- Only accepted indexes are created. §6.3 proves that every documented query path is
-- already covered by an existing constraint after the singular role column was removed, so
-- NO replacement and NO speculative index is added (04 §5.2 "Indeksi").
--
-- `unique (practice_id, id)` on every tenant table is the unconditional tenant constraint
-- of §2.5. On `practice_memberships` it doubles as the parent key of the composite foreign
-- key declared by `practice_membership_roles`.
--
-- `platform_role_assignments_user_idx` is created HERE. §22.2 assigns the index to this
-- package explicitly (D-023 clause 8) and is the earlier owner; §22.12 lists the same index
-- in the §21 catalogue of package `012_constraints_indexes`, which may later verify it.
-- Package 012 is not touched by phase 3.
-- -----------------------------------------------------------------------------

-- CreateIndex
CREATE UNIQUE INDEX "practices_code_key" ON "practices"("code");

-- CreateIndex
CREATE INDEX "practices_status_idx" ON "practices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "users"("auth_subject");

-- CreateIndex
CREATE INDEX "practice_memberships_user_active_idx" ON "practice_memberships"("user_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "practice_memberships_practice_user_key" ON "practice_memberships"("practice_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_memberships_tenant_key" ON "practice_memberships"("practice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_membership_roles_tenant_key" ON "practice_membership_roles"("practice_id", "id");

-- CreateIndex
-- Rejects a duplicate assignment of the same role to the same membership (D-038 clause 5)
-- and is at the same time the only index needed to enumerate and check roles (§21).
-- It stays NON-PARTIAL on purpose: removing a role deletes the row, which frees the triple,
-- so a later re-assignment cannot collide (D-038 clauses 25-32).
CREATE UNIQUE INDEX "practice_membership_roles_membership_role_key" ON "practice_membership_roles"("practice_id", "membership_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "practice_settings_practice_key" ON "practice_settings"("practice_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_settings_tenant_key" ON "practice_settings"("practice_id", "id");

-- CreateIndex
CREATE INDEX "platform_role_assignments_user_idx" ON "platform_role_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_role_assignments_user_role_key" ON "platform_role_assignments"("user_id", "platform_role");

-- AddForeignKey
-- Referential actions are deliberately NOT declared and therefore fall back to the
-- PostgreSQL default `NO ACTION`. §6.3a records this explicitly, and §28.1 tracks
-- ON DELETE / ON UPDATE as an open schema question for exactly this group of foreign keys.
-- Declaring CASCADE or RESTRICT here would decide that open question silently.
ALTER TABLE "practice_memberships" ADD CONSTRAINT "practice_memberships_practice_fk" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "practice_memberships" ADD CONSTRAINT "practice_memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- Composite foreign key (D-038 clause 19). This is what makes a cross-practice role
-- assignment STRUCTURALLY impossible rather than merely validated: a row whose
-- `practice_id` does not match the owning membership's practice has no parent to reference.
-- No separate `practice_id -> practices(id)` key is declared; §22.2 enumerates exactly three
-- constraints for this table and this key already carries `practice_id` into a parent that
-- is itself keyed to `practices`.
ALTER TABLE "practice_membership_roles" ADD CONSTRAINT "practice_membership_roles_membership_fk" FOREIGN KEY ("practice_id", "membership_id") REFERENCES "practice_memberships"("practice_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "practice_settings" ADD CONSTRAINT "practice_settings_practice_fk" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddCheckConstraint
-- Optimistic locking column of D-029: `PATCH /practices/{id}/settings` requires `If-Match`
-- and increments `version` atomically. Prisma cannot express CHECK, so it lives here (§26).
ALTER TABLE "practice_settings" ADD CONSTRAINT "practice_settings_version_check" CHECK ("version" >= 1);

-- -----------------------------------------------------------------------------
-- 4. `app_security` schema (§16.1)
--
-- Created idempotently because §22.2 says "create schema if not exists": later packages
-- (`013_rls_policies`, `014_immutability_triggers`) add their own objects to the same
-- schema and must not depend on who created it first.
--
-- USAGE on a schema only lets a role RESOLVE names inside it. It grants no privilege on any
-- table or function; every function below revokes EXECUTE from PUBLIC explicitly.
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS "app_security";

REVOKE ALL ON SCHEMA "app_security" FROM PUBLIC;
GRANT USAGE ON SCHEMA "app_security" TO "copilot_app";
GRANT USAGE ON SCHEMA "app_security" TO "copilot_system";

-- -----------------------------------------------------------------------------
-- 5. Grants (§20.2, §20.2a, §20.2b, §18.1, §18.2)
--
-- Least privilege, declared by the package that creates the table (§20). Migration 001
-- asserts that no DEFAULT PRIVILEGES exist on schema `public`, so a new table is
-- unreachable until it is granted here, one column list at a time.
--
-- COLUMN-LEVEL grants on `users`, `practices` and `practice_settings` are the single most
-- important control in this package. The RLS policies below depend on `app.*` settings, which
-- the holder of the shared `copilot_app` credential can set themselves (§16.2a). A column
-- privilege cannot be set by the caller, so it is the control that SURVIVES credential
-- compromise (D-047 clauses 14-15, §20.2a, §20.2b). On `practice_settings` it is in phase 3
-- the ONLY control, because that table carries no RLS until phase 4 (D-049 clause 3).
--
-- Grants stay TABLE-LEVEL exactly where §20.2 and §20.4 require that precise privilege set —
-- `practice_memberships`, `practice_membership_roles` and `platform_role_assignments`. D-051
-- changes NO grant anywhere; it moved only package ownership of RLS objects (§17.0, §20.2).
--
-- Deliberately NOT granted, on any table in this package, to any runtime role:
--   INSERT, UPDATE, DELETE. Identity and practice administration is not a runtime operation
--   in v1 (D-047 clause 15, D-033 clause 13, D-038 clause 24, D-023 clause 11).
-- -----------------------------------------------------------------------------

-- `users` — §20.2a. `auth_subject`, `last_login_at`, `created_at` and `updated_at` receive
-- NO grant. `auth_subject` is reachable ONLY through the policy expression in section 7:
-- PostgreSQL evaluates a policy as part of the table's security definition rather than as
-- part of the caller's projection, so the policy may reference the column while an
-- application level `SELECT auth_subject` or `WHERE auth_subject = ...` fails with 42501.
-- The bootstrap query therefore must NOT name `auth_subject` in its WHERE clause.
REVOKE ALL ON TABLE "users" FROM PUBLIC;
GRANT SELECT ("id", "email", "display_name", "preferred_language", "status") ON TABLE "users" TO "copilot_app";

-- `practices` — §20.2a. `legal_name`, `zsr_number` and `gln_number` receive NO grant:
-- `zsr_number` and `gln_number` are class B business data (09 §2) and stay unreachable even
-- with a compromised credential, because a column grant does not depend on `app.*` context.
REVOKE ALL ON TABLE "practices" FROM PUBLIC;
GRANT SELECT ("id", "code", "name", "default_language", "timezone", "status") ON TABLE "practices" TO "copilot_app";

-- `practice_memberships` — §20.2, §18.1: SELECT only, never INSERT/UPDATE/DELETE. The grant
-- stays TABLE-LEVEL, because §20.2 and §20.4 require exactly that privilege set; D-051 does
-- not change any grant, it moved package ownership of RLS objects only (§20.2, §17.0).
-- This grant is a hard dependency of TWO policies below — `practices_membership_select`
-- (§17.6) and `practice_membership_roles_self_select` (§17.4): a policy that sub-queries
-- another table requires the CALLER to hold privileges on it. Narrowing or revoking this
-- grant breaks both policies with 42501 and must never be done without checking that
-- dependency (§20.2a, D-051 clause 4, 08 §21.5.5, §21.6).
REVOKE ALL ON TABLE "practice_memberships" FROM PUBLIC;
GRANT SELECT ON TABLE "practice_memberships" TO "copilot_app";

-- `practice_membership_roles` — §20.2, §18.1: table-level SELECT only, bounded from phase 3
-- onward by the §17.4 policy created in section 7 of THIS package (D-051 clause 1). Read
-- access here is self-enumeration for `GET /me`, NOT role administration: without
-- INSERT/UPDATE/DELETE there is no runtime path that assigns or removes a role (D-038
-- clause 24). `copilot_system` receives no grant — this is a tenant table (D-023). `PUBLIC`
-- receives no grant.
REVOKE ALL ON TABLE "practice_membership_roles" FROM PUBLIC;
GRANT SELECT ON TABLE "practice_membership_roles" TO "copilot_app";

-- `practice_settings` — EXACTLY THREE COLUMNS, SELECT only (§20.2b, D-049 clauses 1-3).
--
-- THERE IS NO TABLE-LEVEL `SELECT` ON THIS TABLE IN PHASE 3. `copilot_app` reads exactly
-- `practice_id`, `allow_mpa_approval` and `allow_billing_specialist_approval` and nothing
-- else. `id`, `version`, `updated_at`, `updated_by`, `configuration`,
-- `retention_policy_code`, `billing_review_required`, `require_reason_for_manual_change`,
-- `ai_enabled` and `axenita_export_enabled` are unreachable and fail with SQLSTATE 42501 —
-- including when an unpermitted column is used ONLY in a `WHERE` predicate or ONLY in
-- `ORDER BY`. That surface is NECESSARY AND SUFFICIENT for the phase 3 effective-permission
-- resolver, which evaluates the CONDITIONAL cells of 15 §6 (`analysis.approve`,
-- `analysis.approval.revoke`) against the two approval flags for `GET /me` (D-041, D-044).
--
-- §18.1 accepts SELECT *and* UPDATE for `copilot_app` on this table, because
-- `PATCH /practices/{id}/settings` exists (D-028 clause 4, D-029). D-049 WITHDREW the phase
-- assignment of that endpoint: no settings route is registered in phase 3 at all. The UPDATE
-- grant is therefore NOT issued here — this table receives its tenant RLS policy
-- (`practice_id = app.practice_id`) only in `013_rls_policies`, and `app.practice_id` is
-- established only by `set_request_context`, which is phase 4. Granting UPDATE now would give
-- any authenticated request database level write access to EVERY practice's settings, with no
-- tenant predicate to constrain it. Grant and the policy that bounds it are introduced
-- TOGETHER, in package `013` (D-049 clause 5). No INSERT, no UPDATE, no DELETE for any
-- runtime role. `copilot_system` receives NO grant — this is a tenant table (D-023). `PUBLIC`
-- receives no grant. This package creates NO RLS policy on `practice_settings`, and neither
-- `ENABLE` nor `FORCE ROW LEVEL SECURITY`; all of that belongs to phase 4 (§22.13).
--
--   PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE
--
-- That is the named exposure of D-049 clause 3 / §20.2b and it is stated here in full, not
-- minimised. Because `practice_settings` carries NO RLS in phase 3, the holder of the shared
-- `copilot_app` credential can enumerate `practice_id`, `allow_mpa_approval` and
-- `allow_billing_specialist_approval` FOR EVERY ROW of this table, and can determine the row
-- count and the existence of a row. THIS IS A REAL EXPOSURE OF SECURITY CONFIGURATION AND
-- MUST NOT BE MINIMISED. It is accepted EXCLUSIVELY for the non-pilot intermediate state of
-- phase 3, on the same terms as the exposure of D-047 clause 18: at this gate there are no
-- real pilot users and no real data, and phase 4 is mandatory before phase 5. Phase 4 closes
-- it with `ENABLE` + `FORCE RLS` and the tenant policy.
REVOKE ALL ON TABLE "practice_settings" FROM PUBLIC;
GRANT SELECT ("practice_id", "allow_mpa_approval", "allow_billing_specialist_approval") ON TABLE "practice_settings" TO "copilot_app";

-- `platform_role_assignments` — §6.5, §17.2, §18.2. The grants stay TABLE-LEVEL, exactly as
-- §20.2 and §20.4 require; D-051 changes no grant.
-- `copilot_app` needs SELECT so that `GET /me` can return the caller's `platformRoles`, and
-- the §17.2 policy created in section 7 of THIS package narrows it to the caller's own rows
-- ALREADY IN PHASE 3 (D-051 clause 1). The invariant of D-023 clause 11 — `copilot_app` has
-- NO unrestricted SELECT on `platform_role_assignments` — therefore holds from phase 3
-- onward (D-051 clause 2, §6.5). `copilot_system` reads all rows (§6.5), bounded by its own
-- `USING (true)` policy. `PUBLIC` has no access. Writes are seed/migration only in the MVP
-- (D-023 clause 11); `platformRoles[]` in `GET /me` is derived from currently non-revoked
-- rows (`revoked_at IS NULL`) in the application, which introduces no write grant and no
-- role-administration capability (D-051 clause 3).
REVOKE ALL ON TABLE "platform_role_assignments" FROM PUBLIC;
GRANT SELECT ON TABLE "platform_role_assignments" TO "copilot_app";
GRANT SELECT ON TABLE "platform_role_assignments" TO "copilot_system";

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY — four tables (§17.2, §17.4, §17.5, §17.6, §18.2, D-051)
--
-- Both ENABLE and FORCE on every one of them. FORCE matters because `copilot_migrator` owns
-- these tables and an owner would otherwise bypass every policy.
--
-- The four tables that carry `ENABLE` + `FORCE ROW LEVEL SECURITY` after this package are
-- exactly:
--
--     users
--     practices
--     platform_role_assignments
--     practice_membership_roles
--
-- `platform_role_assignments` (§17.2) and `practice_membership_roles` (§17.4) are here
-- because D-051 moved the COMPLETE, ALREADY ACCEPTED artifacts out of `013_rls_policies` /
-- phase 4 and made THIS PACKAGE THEIR FINAL OWNER. Both patterns are bootstrap-safe by
-- construction: they depend exclusively on `app.user_id`, which phase 3 already establishes
-- through `set_user_context`. Package `013` must not recreate, replace or overwrite them
-- (§17.0, §22.13, D-051 clauses 1 and 6).
--
-- RLS is still deliberately NOT enabled here on:
--   * `practice_memberships` — §17.3 stays in `013_rls_policies` / phase 4, because it is
--     tied to `set_request_context` and the phase 4 tenant bootstrap (D-051 clause 5). The
--     phase 3 intermediate state of D-047 clause 18 narrows to exactly this table; 08 §21.5.6
--     requires the remaining generic membership visibility to be asserted by a test as an
--     EXPECTED, DOCUMENTED intermediate state;
--   * `practice_settings` — `ENABLE`/`FORCE RLS` and the tenant policy belong to
--     `013_rls_policies` / phase 4 and are introduced there together with the bounded UPDATE
--     grant (§20.2b, §22.13, D-049 clause 5).
-- -----------------------------------------------------------------------------

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "practices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practices" FORCE ROW LEVEL SECURITY;

ALTER TABLE "platform_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_role_assignments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "practice_membership_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_membership_roles" FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 7. Policies (§17.2, §17.4, §17.5, §17.6)
--
-- All SEVEN policies of this package are FINAL and this package is their FINAL OWNER. Phase 4
-- does not rewrite any of them; it merely starts setting `app.practice_id`, which activates
-- the RESTRICTIVE branch of §17.6 automatically (§17.0, §17.6, §22.13, D-051 clause 6).
--
--     users                     -> users_bootstrap_subject_select, users_self_select
--     practices                 -> practices_membership_select, practices_context_narrow
--     platform_role_assignments -> platform_role_assignments_self_select,
--                                  platform_role_assignments_system_select
--     practice_membership_roles -> practice_membership_roles_self_select
-- -----------------------------------------------------------------------------

-- `users` — identity bootstrap pattern (§17.5, D-047 clauses 3-4).
--
-- `auth_subject` must be resolved to `users.id` BEFORE `app.user_id` exists, so a
-- self-scoped policy cannot bootstrap itself. The cycle is broken by a second
-- transaction-local variable carrying an ALREADY VERIFIED subject.
--
-- The `app.user_id IS NULL` guard is MANDATORY and NORMATIVE. Permissive policies combine
-- with OR and `set_user_context` does not clear `app.auth_subject`; without the guard,
-- mismatched contexts were empirically shown to expose TWO user rows at once. With it,
-- exactly one row is visible and the two policies are mutually exclusive by construction:
-- bootstrap applies before the internal user context, self applies after it, never both.
CREATE POLICY "users_bootstrap_subject_select"
ON "users"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  nullif(current_setting('app.user_id', true), '') IS NULL
  AND "auth_subject" = nullif(current_setting('app.auth_subject', true), '')
);

CREATE POLICY "users_self_select"
ON "users"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "id" = nullif(current_setting('app.user_id', true), '')::uuid
);

-- NOTE: no third `users` policy exists. Reading ANOTHER user's row
-- (`responsiblePhysician.displayName`, `approvedBy.displayName`) is DENY / NOT IMPLEMENTED
-- in v1. The mandatory gate is `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`
-- (D-047 clause 12, 13 §19). Adding a third policy here would silently pass that gate.

-- `practices` — membership-scoped visibility with context narrowing (§17.6, D-047 5-6).
--
-- `GET /me` returns `memberships[].practiceName` on a NEUTRAL route, before any tenant
-- context exists (03 §10), so `practices` must be readable without `app.practice_id`. Once
-- tenant context exists, visibility must narrow to exactly the current practice. Two
-- requirements, therefore TWO POLICIES OF DIFFERENT MODE.
--
-- The membership policy deliberately does NOT filter `pm.active`: a frozen `GET /me`
-- requires an inactive membership to still show its practice name. RLS governs VISIBILITY
-- of one's own rows here, not authorisation — authorisation is enforced by the application
-- and, from phase 4, by `set_request_context`, which does require an ACTIVE membership.
CREATE POLICY "practices_membership_select"
ON "practices"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  EXISTS (
    SELECT 1
    FROM "practice_memberships" pm
    WHERE pm."practice_id" = "practices"."id"
      AND pm."user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  )
);

-- RESTRICTIVE mode is MANDATORY and NORMATIVE, not a stylistic choice. Restrictive policies
-- combine with AND against the OR-combined permissive set, so no future permissive policy
-- can OR away the narrowing rule. It was empirically shown that with a broad permissive
-- policy added and this policy in PERMISSIVE mode, three practices become visible after
-- context — including one with no membership at all. In RESTRICTIVE mode exactly one
-- remains. A single combined permissive policy must never be used instead.
CREATE POLICY "practices_context_narrow"
ON "practices"
AS RESTRICTIVE
FOR SELECT
TO "copilot_app"
USING (
  nullif(current_setting('app.practice_id', true), '') IS NULL
  OR "practices"."id" = nullif(current_setting('app.practice_id', true), '')::uuid
);

-- `platform_role_assignments` — user-scoped pattern (§17.2, D-051 clauses 1-3).
--
-- A GLOBAL table, not a tenant table. The policy depends EXCLUSIVELY on `app.user_id` and
-- uses NEITHER `app.practice_id`, NOR `set_request_context`, NOR `PracticeContextGuard`, NOR
-- `TenantDatabaseService` — which is precisely why it already works in phase 3. Name and body
-- are IDENTICAL to the accepted §17.2 text; only package ownership moved.
--
-- Without `app.user_id` the table returns zero rows. `copilot_app` sees only its own rows,
-- so the invariant of D-023 clause 11 holds from phase 3 onward, and this is not tenant RLS
-- and does not collide with §18.2 (D-023 clause 12). `PUBLIC` has no access.
CREATE POLICY "platform_role_assignments_self_select"
ON "platform_role_assignments"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
);

-- `copilot_system` keeps the accepted `SELECT` + `USING (true)` behaviour (§6.5, §17.2,
-- D-051 clause 2). It is unchanged by D-051 and is NOT a tenant-data path: `copilot_system`
-- holds no grant on any tenant table (D-023).
CREATE POLICY "platform_role_assignments_system_select"
ON "platform_role_assignments"
AS PERMISSIVE
FOR SELECT
TO "copilot_system"
USING (true);

-- `practice_membership_roles` — bootstrap-readable pattern (§17.4, D-038 clauses 22-23,
-- D-051 clauses 1 and 4).
--
-- `GET /me` enumerates the authenticated user's memberships and roles BEFORE tenant context
-- exists, so the policy must not depend on `app.practice_id`. The table has no `user_id`
-- column of its own, so ownership is derived through the owning `practice_memberships` row.
-- Name and body are IDENTICAL to the accepted §17.4 text; only package ownership moved.
--
-- The predicate compares BOTH `practice_id` AND `membership_id`, so a row of another practice
-- cannot become visible through somebody else's membership — there is no cross-practice leak.
-- It deliberately does NOT filter `pm.active`, exactly like §17.3: RLS governs VISIBILITY of
-- one's own rows here, not authorisation.
--
-- THIS POLICY DOES NOT REQUIRE §17.3 RLS ON `practice_memberships` TO WORK (D-051 clause 4).
-- The EXISTS sub-query relies on the EXISTENCE of the owning membership row and on
-- `pm.user_id = app.user_id`, not on whether `practice_memberships` already carries its own
-- policy. What IS mandatory is the supporting table-level `SELECT` grant on
-- `practice_memberships` in section 5 — the same proven asymmetry as §17.6 and D-047
-- clause 7. Revoking it breaks this policy with SQLSTATE 42501.
--
-- Created AFTER `practice_memberships` and after its `SELECT` grant, per §22.2.
-- No SECURITY DEFINER bypass is introduced. Without `app.user_id` the table returns zero rows.
CREATE POLICY "practice_membership_roles_self_select"
ON "practice_membership_roles"
AS PERMISSIVE
FOR SELECT
TO "copilot_app"
USING (
  EXISTS (
    SELECT 1
    FROM "practice_memberships" pm
    WHERE pm."practice_id" = "practice_membership_roles"."practice_id"
      AND pm."id"          = "practice_membership_roles"."membership_id"
      AND pm."user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  )
);

-- -----------------------------------------------------------------------------
-- 8. Context functions (§16.1, §16.2.2, §16.2.4)
--
-- BOTH functions are SECURITY INVOKER with a fixed `search_path`. No SECURITY DEFINER
-- function is introduced: D-047 rejected a SECURITY DEFINER resolver explicitly, because it
-- reintroduces the construct D-033 rejected for a structurally identical problem, would
-- itself be filtered under FORCE RLS, and creates a privileged callable with arbitrary
-- input (D-047, rejected alternatives).
--
-- Every `app.*` value is set transaction-locally (`set_config(..., true)`), so no context
-- survives the transaction and none leaks into a pooled connection.
--
-- These functions are NOT a privilege boundary and this package does not claim they are.
-- `copilot_app` can set the same GUCs directly with `set_config`, because any role may set
-- a custom GUC. They constrain normal query scope and application mistakes; the controls
-- that survive a stolen credential are the column grants above, the absence of write
-- grants, the absence of ownership and NOBYPASSRLS (§16.2a, D-047 clause 20).
-- -----------------------------------------------------------------------------

-- `set_auth_subject_context` — §16.2.4, D-047 clauses 1-2.
--
-- Clears `app.user_id` AND `app.practice_id` BEFORE setting the subject, following the same
-- clear-before-validate discipline D-033 clause 10 prescribes for tenant context. A stale
-- user or tenant context can therefore never survive the start of a new identity bootstrap.
--
-- `AuthService` calls this ONLY with a cryptographically verified JWT/OIDC subject. Request
-- bodies, query parameters and untrusted headers must never choose `p_auth_subject`, exactly
-- as they must never choose `user_id` (§16.2a, D-047 clause 20).
CREATE OR REPLACE FUNCTION "app_security"."set_auth_subject_context"(
  p_auth_subject text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_auth_subject IS NULL OR p_auth_subject = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Auth subject context requires a subject';
  END IF;

  PERFORM set_config('app.practice_id',  '', true);
  PERFORM set_config('app.user_id',      '', true);
  PERFORM set_config('app.auth_subject', p_auth_subject, true);
END;
$$;

REVOKE ALL ON FUNCTION "app_security"."set_auth_subject_context"(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_security"."set_auth_subject_context"(text) TO "copilot_app";

-- `set_user_context` — §16.2.2, D-033 clauses 3-4, moved into this package by D-047
-- clause 17. ONLY the package ownership changed: signature, SECURITY INVOKER mode and body
-- are exactly as D-033 froze them. Phase 3 needs it because `GET /me` and the
-- membership-scoped `practices` read both require an authenticated user context.
--
-- It sets `app.user_id` and clears `app.practice_id`, without membership validation.
-- Membership validation is impossible here: a `SYSTEM_ADMIN` has no membership, and
-- requiring one would make it impossible for that user to ever read their own platform role
-- (D-023 clause 11).
--
-- It deliberately does NOT clear `app.auth_subject`. That is not an oversight: the bootstrap
-- policy above carries `app.user_id IS NULL`, so it self-deactivates the moment this
-- function sets `app.user_id`. A stale `app.auth_subject` therefore has no effect on
-- visibility whatsoever (D-047 clause 3).
CREATE OR REPLACE FUNCTION "app_security"."set_user_context"(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'User context requires a user id';
  END IF;

  PERFORM set_config('app.practice_id', '', true);
  PERFORM set_config('app.user_id', p_user_id::text, true);
END;
$$;

REVOKE ALL ON FUNCTION "app_security"."set_user_context"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_security"."set_user_context"(uuid) TO "copilot_app";

-- NOTE: `set_request_context` is NOT created here. It stays in `013_rls_policies` and phase
-- 4 (§16.2.3, §22.13). Phase 3 never establishes `app.practice_id`; the RESTRICTIVE policy
-- above is already present and activates automatically once phase 4 starts setting it.

-- -----------------------------------------------------------------------------
-- 9. `FORCE RLS` SEED/MAINTENANCE ALLOWLIST — DOCUMENTATION ONLY (§23.4, D-048)
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. It records the allowlist that binds the
-- trusted phase 3 seed, because this package is what puts the tables under `FORCE RLS` in the
-- first place, and D-048 clause 6 forbids any SILENT extension of that allowlist.
--
-- Under `FORCE ROW LEVEL SECURITY` even the table OWNER `copilot_migrator` is subject to the
-- policies, and no accepted policy permits an owner write. Trusted seed DML against such a
-- table therefore fails, and §23.4 defines the ONLY permitted way to perform it: ONE explicit
-- `copilot_migrator` transaction that opens a window with `NO FORCE ROW LEVEL SECURITY`,
-- asserts `relrowsecurity = true` / `relforcerowsecurity = false`, executes exclusively the
-- trusted seed DML, closes the window with `FORCE ROW LEVEL SECURITY`, and asserts
-- `relrowsecurity = true` / `relforcerowsecurity = true` before COMMIT. RLS stays ENABLED
-- through the entire window — only the FORCE attribute changes. A failed restore assertion
-- must raise and abort the transaction; rollback must NEVER leave FORCE off.
--
-- PHASE 3 D-048 SEED-MAINTENANCE ALLOWLIST — EXACTLY FOUR TABLES (§23.4.4, D-048 clause 5,
-- as grown from two to four by D-051 clause 7):
--
--     users
--     practices
--     practice_membership_roles
--     platform_role_assignments
--
-- EXPLICITLY NOT ALLOWLISTED IN PHASE 3:
--
--     practice_memberships
--     practice_settings
--
-- Neither of those two carries `FORCE RLS` in phase 3 — both first receive it in
-- `013_rls_policies` (§17.3, §20.2b, §22.13) — so neither needs nor may have a phase 3
-- maintenance window. Any future extension of the allowlist requires an explicitly accepted
-- decision, or an explicit clause in the package that introduces `FORCE RLS` for that table.
--
-- NO SEED DML LIVES IN THIS FILE. The seed itself is not implemented by this package. The
-- maintenance mechanism is MAINTENANCE ONLY and must NEVER be reachable from request/runtime
-- application paths, and it must never be implemented as a runtime-callable function. The
-- permanently rejected alternatives stay rejected in every form: `BYPASSRLS` on any role, a
-- `SECURITY DEFINER` seed/migration function, a superuser seed credential, a permanent
-- `copilot_migrator` RLS policy, and globally disabling RLS (§23.4.2, D-048 clause 1).
--
-- Steady-state `relrowsecurity = true` and `relforcerowsecurity = true` for all four
-- allowlisted tables — after migration AND after seed — are PERMANENT regression tests, not a
-- one-off check (§20.4, §25.1.2, 08 §21.6).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 10. ROLLBACK — DOCUMENTATION ONLY, NOT EXECUTED BY THIS MIGRATION
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. Every line below is commentary. The forward
-- migration above contains ZERO operational `DISABLE ROW LEVEL SECURITY`, which §23.4.5 and
-- D-048 clause 4 forbid in forward migrations, seeds and maintenance windows alike. The
-- prohibition does NOT extend to an explicitly documented rollback that fully reverses the
-- migration and removes the policies together with the RLS, because there the removal of RLS
-- is the intended consequence of undoing the migration and not a window for writing.
--
-- Full-reversal semantics for the D-051 artifacts of this package (D-051 `Migration/rollout`;
-- §23.4.5), in this order — DROP the three policies FIRST, then disable RLS:
--
--     drop policy platform_role_assignments_self_select   on platform_role_assignments;
--     drop policy platform_role_assignments_system_select on platform_role_assignments;
--     drop policy practice_membership_roles_self_select   on practice_membership_roles;
--
--     alter table platform_role_assignments disable row level security;
--     alter table practice_membership_roles disable row level security;
--
-- The corresponding reversal of the D-047 artifacts is unchanged (D-047 `Migration/rollout`):
-- `DROP POLICY` for the four `users`/`practices` policies, `DISABLE ROW LEVEL SECURITY` on
-- those two tables, `REVOKE` of the grants, and `DROP FUNCTION` for the two context
-- functions. Rollback is non-destructive and fails closed; the project has no production data
-- (§22.2).
--
-- A rollback must never be used as a substitute for the §23.4 maintenance window, and must
-- never leave a table with RLS enabled but FORCE off.
-- -----------------------------------------------------------------------------

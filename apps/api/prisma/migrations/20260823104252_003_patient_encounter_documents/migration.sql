-- =============================================================================
-- Migration package 003_patient_encounter_documents
--
-- Normative sources: 02_DATABASE_SCHEMA_V1.md §2.2, §2.5, §2.7, §2.8, §2.9, §2.10, §2.11,
-- §2.11.4, §4.3-§4.8, §7.1, §7.2, §7.3, §8.1, §8.2, §21, §22.3, §26, §26.3, §29.1-§29.8;
-- D-022, D-025, D-029, D-049, D-050, D-052, D-060, D-061, D-062, D-063.
-- Implementation plan 04 §7.2. Test contract 08 §12.9.3. Naming standard 12 §8.
--
-- This package is the FIRST CREATOR of the five phase 5 enums, the five phase 5 tables, all
-- of their primary keys, all nine unique constraints, all eight foreign keys, all 23 CHECK
-- constraints and the four non-unique indexes of §29.6. No new package number is introduced
-- and no existing package is renumbered (D-062, `OD-P5-D2-1`; D-063 clause 3).
--
-- PACKAGE BOUNDARY (D-063 clauses 1-3, §22.3, §22.11)
-- This file owns the STRUCTURE of phase 5 and nothing else. It deliberately contains NO
-- `idempotency_keys`, NO `audit_events`, NO `outbox_events` and NO `async_jobs`: the phase 5
-- slice of package `011_jobs_idempotency_outbox_audit` was moved OUT of this slice by D-063
-- clause 3, so that its structural and its security half are resolved together. The phase 5
-- slices of packages `013_rls_policies` and `014_immutability_triggers` likewise belong to a
-- later slice. The published phase 5 migration order is unchanged:
--     `003` -> `011`-slice -> `013`-slice -> `014`-slice.
--
-- NEGATIVE ASSERTION — THIS PACKAGE GRANTS NO RUNTIME CAPABILITY (§22.3, D-062 Dio B.3)
-- This file issues NO `GRANT`, NO `REVOKE`, NO `ENABLE`/`FORCE ROW LEVEL SECURITY`, NO
-- `CREATE POLICY`, NO `CREATE FUNCTION` and NO `CREATE TRIGGER`. That is normative, not an
-- omission. After this package alone the five new tables exist with
-- `relrowsecurity = false` and `relforcerowsecurity = false`, ZERO policies and ZERO grants
-- to any runtime role. THAT STATE IS SAFE AND INTENDED: the tables are owned by
-- `copilot_migrator`, migration `001` already asserts that schema `public` carries no
-- `DEFAULT PRIVILEGES` that could pre-grant a future table, and neither `copilot_app` nor
-- `copilot_system` holds `CREATE` on the schema. A table this package creates is therefore
-- reachable by NO runtime role at all until the phase 5 slice of `013_rls_policies` grants
-- it IN THE SAME TRANSACTION that enables and forces RLS and creates the restricting tenant
-- policy (D-049 clause 5). The window between the two migrations contains no capability,
-- which is stronger than a claim that the window is short. The absence of a grant IS the
-- security control of this slice, and it must never be "fixed" here to make a test or a
-- development flow convenient.
--
-- THE `★` RI-VERSUS-RLS PROOF IS NOT DISCHARGED HERE (D-062 Dio D.6, D-063 clause 3)
-- This package creates `encounters_responsible_physician_membership_fk`. It does NOT prove
-- how that foreign key behaves under `FORCE ROW LEVEL SECURITY`, because no phase 5 table
-- carries RLS yet. That proof — a same-practice co-member assignment SUCCEEDS while a direct
-- `SELECT` of that co-member's `practice_memberships` row still returns ZERO rows, both in
-- one transaction under the real runtime roles — belongs to slice `P5-I2` and stays a HARD
-- precondition of `P5-I5`. Nothing in this file authorises weakening RLS to satisfy it.
--
-- AUTHORING MECHANISM (D-050, §26.3, 10 §7.1)
-- The structural portion of this file is the CANDIDATE produced by
-- `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script`
-- against the canonical migration database. `migrate diff` output is A CANDIDATE, NOT TRUTH:
-- the candidate was hand-reviewed statement by statement, reordered into the dependency-safe
-- order below, and every one of the 23 CHECK constraints was hand-written, because Prisma
-- cannot express `CHECK` (§26, §26.2). `prisma migrate dev --create-only` is NOT used: its
-- shadow database is structurally incompatible with the deliberate ownership and privilege
-- guards of migration `001`, and no guard of `001` may be weakened for it. `prisma db push`
-- and `prisma migrate reset` stay forbidden.
--
-- The candidate proposed NO `ALTER`, `DROP` or `RENAME` against any existing phase 3/4
-- object. In particular `practice_memberships` receives NO structural change: the composite
-- foreign key is created ON `encounters`, and its parent key
-- `practice_memberships_practice_user_key` has existed since package `002`. NO index and NO
-- constraint is added to `practice_memberships` (D-061 clause 11, D-062 Dio B.4).
--
-- ORDER (normative, §22.3 / D-062 Dio B.1)
--     enums -> tables (with primary keys) -> unique constraints -> foreign keys
--          -> CHECK constraints -> non-unique indexes
-- Unique constraints precede the foreign keys because a composite foreign key requires a
-- unique constraint over exactly the referenced column pair (§2.5). The CHECK constraints
-- follow the keys and precede the query indexes; every table is empty, so no validation cost
-- and no lock-ordering hazard arises.
--
-- ATOMICITY (D-062 Dio B.3)
-- This file is applied in ONE transaction. `CREATE INDEX CONCURRENTLY` and every other
-- statement that breaks a transaction is FORBIDDEN here — and unnecessary, because the
-- tables are empty. No `COMMENT ON` object is introduced; documentation stays as `--`
-- comments colocated in the file, exactly as in the three existing packages.
--
-- IDENTIFIERS (§2.2, §26.1)
-- No column carries a UUID default. The application generates every identifier before
-- `INSERT`, because the canonical AAD of the encryption envelope contains `row_id`.
-- `gen_random_uuid()` therefore never appears in this package. The only defaults are
-- `created_at default current_timestamp` and `encounters.version default 1`.
--
-- ROLLBACK / REVERSAL CONVENTION (D-062 Dio B.3, precedent `013` §7)
-- There is NO down-migration file and the repository convention is not changed. Full
-- reversal is documented as commentary at the end of this file, is never executed, is not a
-- substitute for the §23.4 maintenance window, and revokes only what THIS package added.
--
-- NO `SECURITY DEFINER` FUNCTION, NO `BYPASSRLS`, NO `CREATE ROLE`, NO SUPERUSER PATH.
-- NO SEED AND NO DML OF ANY KIND: no phase 5 PHI table is ever seeded (D-062 Dio K), and the
-- §23.4 FORCE-RLS maintenance allowlist stays at exactly six tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums (§4.3-§4.8, §29.1)
--
-- Five types, every value set FROZEN by §4.3-§4.8. Their earlier absence from §22.3 was
-- documentation incompleteness, not an open design question (D-062 Dio B.1). Physical names
-- follow the §2.1 + §22.2 precedent: snake_case singular.
--
-- `processing_status` and `redaction_status` are DELIBERATELY NOT enums. §2.11.4 keeps both
-- columns `varchar(30)`; converting them to a PostgreSQL enum is NOT authorised, because
-- D-060 clause 44 forbids changing the column. Their vocabularies are enforced by the named
-- CHECK constraints of section 5 instead. `PENDING`, `PROCESSING`, `ARCHIVED` and `SKIPPED`
-- are not introduced anywhere.
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('AXENITA', 'MANUAL', 'CSV', 'FHIR', 'OTHER');

-- CreateEnum
CREATE TYPE "encounter_status" AS ENUM ('DRAFT', 'READY_FOR_ANALYSIS', 'ANALYSIS_IN_PROGRESS', 'REVIEW_REQUIRED', 'APPROVED', 'EXPORT_PENDING', 'EXPORTED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "review_state" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('CONSULTATION_NOTE', 'DIAGNOSIS_LIST', 'PROCEDURE_NOTE', 'REFERRAL', 'LAB_RESULT', 'BILLING_DRAFT', 'AUDIT_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "document_source" AS ENUM ('MANUAL_TEXT', 'FILE_UPLOAD', 'AXENITA_API', 'CSV_IMPORT', 'FHIR_IMPORT', 'GENERATED');

-- -----------------------------------------------------------------------------
-- 2. Tables (§7.1-§7.3, §8.1, §8.2)
--
-- Exactly the canonical column sets. No speculative column is added, and several deliberate
-- ABSENCES are preserved (D-062 Dio B.2, §29.8):
--   * NO HMAC key-version column — the generation marker `h1` lives INSIDE the token, and
--     `h1.<64 hex>` is 67 characters, well inside `varchar(128)` (§2.8);
--   * NO column for the raw pre-normalisation clinical text, and NO second hash column for
--     the raw input — only the normalised artifact is persisted (§2.10.1);
--   * NO per-document redaction-ruleset-version column — `phase5-basic-v1` is a code and
--     configuration level identifier (§2.11.3);
--   * NO denormalised co-member `display_name` (D-061 Dio B.6 and E.3);
--   * NO `citext` pseudonym column, no functional index and no special collation (§2.9.4);
--   * NO encounter `reason` column and NO `encounters.archived_at`;
--   * NO status, version or archive column on `patient_references`.
--
-- `storage_objects.encryption_key_ref` and `.encryption_version` describe encryption of the
-- BLOB in object storage. They are NOT part of the §2.7 row envelope and carry none of its
-- CHECK constraints; the table has no `*_ciphertext` column at all (§8.1).
--
-- `encounter_diagnoses` carries `created_at` only — §7.3 declares no `updated_at`.
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "patient_references" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "source_system" "integration_provider" NOT NULL,
    "external_patient_ref_hash" VARCHAR(128) NOT NULL,
    "external_patient_ref_ciphertext" BYTEA,
    "external_patient_ref_iv" BYTEA,
    "external_patient_ref_auth_tag" BYTEA,
    "encryption_algorithm" VARCHAR(30),
    "encryption_version" INTEGER,
    "encryption_key_ref" VARCHAR(255),
    "encryption_key_version" INTEGER,
    "pseudonym" VARCHAR(50) NOT NULL,
    "birth_year" SMALLINT,
    "sex_code" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "patient_reference_id" UUID NOT NULL,
    "external_encounter_ref_hash" VARCHAR(128),
    "external_encounter_ref_ciphertext" BYTEA,
    "external_encounter_ref_iv" BYTEA,
    "external_encounter_ref_auth_tag" BYTEA,
    "encryption_algorithm" VARCHAR(30),
    "encryption_version" INTEGER,
    "encryption_key_ref" VARCHAR(255),
    "encryption_key_version" INTEGER,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "treatment_date" DATE NOT NULL,
    "responsible_physician_id" UUID,
    "guarantor_type" VARCHAR(30),
    "insurance_context" VARCHAR(30),
    "specialty_code" VARCHAR(50),
    "patient_age_at_encounter" SMALLINT,
    "patient_sex_at_encounter" VARCHAR(20),
    "status" "encounter_status" NOT NULL,
    "source_system" "integration_provider" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_diagnoses" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "coding_system" VARCHAR(30) NOT NULL,
    "diagnosis_code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "diagnosis_type" VARCHAR(30),
    "is_primary" BOOLEAN NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "review_state" "review_state" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "bucket_name" VARCHAR(100) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(150) NOT NULL,
    "original_filename" VARCHAR(255),
    "byte_size" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "encryption_key_ref" VARCHAR(255),
    "encryption_version" INTEGER,
    "antivirus_status" VARCHAR(30),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "retention_delete_after" TIMESTAMPTZ(6),

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_documents" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "document_type" "document_type" NOT NULL,
    "source" "document_source" NOT NULL,
    "storage_object_id" UUID,
    "source_storage_object_id" UUID,
    "normalized_text_ciphertext" BYTEA,
    "normalized_text_iv" BYTEA,
    "normalized_text_auth_tag" BYTEA,
    "redacted_text_ciphertext" BYTEA,
    "redacted_text_iv" BYTEA,
    "redacted_text_auth_tag" BYTEA,
    "encryption_algorithm" VARCHAR(30),
    "encryption_version" INTEGER,
    "encryption_key_ref" VARCHAR(255),
    "encryption_key_version" INTEGER,
    "source_text_hash" VARCHAR(64),
    "redacted_text_hash" VARCHAR(64),
    "language_code" VARCHAR(10),
    "page_count" INTEGER,
    "processing_status" VARCHAR(30) NOT NULL,
    "redaction_status" VARCHAR(30) NOT NULL,
    "external_document_ref_hash" VARCHAR(128),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "encounter_documents_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- 3. Unique constraints (§7.1-§7.3, §8.1, §8.2; D-062 Dio B.1)
--
-- Nine unique indexes. Every one carries an explicit name (12 §8).
--
-- `unique (practice_id, id)` — `*_tenant_key` — is the UNCONDITIONAL tenant constraint of
-- §2.5/D-022 and exists on all five new tables regardless of whether the table is currently
-- a composite foreign key target. On `patient_references`, `encounters` and `storage_objects`
-- it doubles as the parent key of a composite foreign key declared in section 4, which is
-- why this section must precede that one.
--
-- `patient_references_source_external_ref_key` is what makes the DETERMINISTIC LOOKUP of
-- §2.8 unambiguous inside one practice and one source system. It is the reason
-- `external_patient_ref_hash` must later carry a `SELECT` grant: a column without a grant
-- fails with SQLSTATE 42501 even when it is used only in a `WHERE` clause (§20.2b).
--
-- `patient_references_pseudonym_key` carries the uniqueness of the §2.9 pseudonym. Collision
-- is resolved by a bounded regenerate-and-retry, never by a deterministic fallback.
--
-- `storage_objects_bucket_object_key` is NOT tenant-scoped on purpose: a bucket and object
-- key pair identifies one physical blob globally (§8.1).
-- -----------------------------------------------------------------------------

-- CreateIndex
CREATE UNIQUE INDEX "patient_references_source_external_ref_key" ON "patient_references"("practice_id", "source_system", "external_patient_ref_hash");

-- CreateIndex
CREATE UNIQUE INDEX "patient_references_pseudonym_key" ON "patient_references"("practice_id", "pseudonym");

-- CreateIndex
CREATE UNIQUE INDEX "patient_references_tenant_key" ON "patient_references"("practice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_tenant_key" ON "encounters"("practice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "encounter_diagnoses_tenant_key" ON "encounter_diagnoses"("practice_id", "id");

-- CreateIndex
-- Rejects the same code from the same coding system twice on one encounter (§7.3).
CREATE UNIQUE INDEX "encounter_diagnoses_encounter_code_key" ON "encounter_diagnoses"("practice_id", "encounter_id", "coding_system", "diagnosis_code");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_bucket_object_key" ON "storage_objects"("bucket_name", "object_key");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_tenant_key" ON "storage_objects"("practice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "encounter_documents_tenant_key" ON "encounter_documents"("practice_id", "id");

-- -----------------------------------------------------------------------------
-- 4. Foreign keys (§29.2, D-062 Dio C)
--
-- Eight keys, EVERY one with an EXPLICIT `ON DELETE NO ACTION ON UPDATE NO ACTION`. No
-- Prisma default is relied upon in any position (§29.3): Prisma would otherwise substitute
-- `ON DELETE RESTRICT ON UPDATE CASCADE`, an invented rule that migration `002` already
-- rejected for the same reason.
--
-- WHY `NO ACTION` EVERYWHERE (§29.2, D-062 Dio C.3)
--   * `CASCADE` is rejected in every position. Phase 5 grants NO `DELETE` capability at all
--     (§18.1) and 09 §20 forbids an ad-hoc delete API, so `CASCADE` has no legitimate
--     trigger and exactly one destructive one: a single stray statement against a parent
--     would erase a whole tenant's encounters, diagnoses and documents. That is the single
--     largest PHI-loss vector in the schema.
--   * `SET NULL` is impossible over `NOT NULL` tenant and parent keys, and over the nullable
--     positions it would silently detach a document from its blob.
--   * `RESTRICT` and `NO ACTION` are equivalent refusals; `NO ACTION` is checkable at
--     statement end and deferrable if ever needed, `RESTRICT` never is. Package `002` uses
--     `NO ACTION` for all five of its keys and no second convention is introduced.
--   * `ON UPDATE` is unreachable: every parent key is `(practice_id, id)` or
--     `(practice_id, user_id)`, and `id`, `practice_id` and `user_id` are AAD-bound and
--     immutable after `INSERT` (§2.7.8, §19.3).
-- Historical medical integrity is preserved: deleting a parent is REFUSED, not cascaded.
--
-- `MATCH SIMPLE` (the PostgreSQL default, emitted by writing no `MATCH` clause) is MANDATORY
-- for the three mixed-nullability composite keys — rows #3, #7 and #8 of §29.2. In each,
-- `practice_id` is `NOT NULL` while the second column is nullable, so under `MATCH SIMPLE`
-- the constraint is satisfied whenever the nullable column is `NULL`. That is exactly what
-- lets "no responsible physician" and "no storage object" exist. **`MATCH FULL` would reject
-- both and must NEVER be used here.**
--
-- RELATIONS DELIBERATELY NOT DECLARED (§29.2):
--   * `encounters (practice_id) -> practices (id)` — the tenant key is carried TRANSITIVELY
--     through key #2 into key #1; a direct key would duplicate the same guarantee (precedent
--     §6.3a);
--   * `created_by` / `updated_by` -> `users` on all three tables — an application invariant,
--     not a foreign key (precedent §6.5: `granted_by`, `revoked_by`). The accepted
--     constraint set is not widened;
--   * `encounters.responsible_physician_id -> users (id)` — unnecessary: the existence of
--     the user is transitively guaranteed through the already existing
--     `practice_memberships_user_fk`. A second direct key would add global coupling and zero
--     additional guarantee.
--
-- `encounters_responsible_physician_membership_fk` is the database half of D-062 Dio D. Its
-- parent key `practice_memberships_practice_user_key` HAS EXISTED SINCE PACKAGE `002`; this
-- package adds NO index and NO constraint to `practice_memberships` (D-061 clause 11).
-- **This package does not prove its behaviour under FORCE RLS — see the header.**
-- -----------------------------------------------------------------------------

-- AddForeignKey
-- §29.2 row 1 — newly declared by D-062, Dio C (`OD-P5-D2-3`).
ALTER TABLE "patient_references" ADD CONSTRAINT "patient_references_practice_fk" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 2 — canonically declared in §7.2; the referential actions were the open question
-- closed by D-062 (`OD-P5-D2-2`).
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_reference_fk" FOREIGN KEY ("practice_id", "patient_reference_id") REFERENCES "patient_references"("practice_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 3 — composite, MATCH SIMPLE, nullable second column (`OD-P5-D2-5`).
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_responsible_physician_membership_fk" FOREIGN KEY ("practice_id", "responsible_physician_id") REFERENCES "practice_memberships"("practice_id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 4.
ALTER TABLE "encounter_diagnoses" ADD CONSTRAINT "encounter_diagnoses_encounter_fk" FOREIGN KEY ("practice_id", "encounter_id") REFERENCES "encounters"("practice_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 5 — newly declared by D-062, Dio C (`OD-P5-D2-3`).
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_practice_fk" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 6.
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_encounter_fk" FOREIGN KEY ("practice_id", "encounter_id") REFERENCES "encounters"("practice_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 7 — composite, MATCH SIMPLE, nullable second column.
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_storage_object_fk" FOREIGN KEY ("practice_id", "storage_object_id") REFERENCES "storage_objects"("practice_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
-- §29.2 row 8 — composite, MATCH SIMPLE, nullable second column; newly declared by D-062,
-- Dio C (`OD-P5-D2-3`).
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_source_storage_object_fk" FOREIGN KEY ("practice_id", "source_storage_object_id") REFERENCES "storage_objects"("practice_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- 5. CHECK constraints (§7.1, §7.2, §7.3, §8.1, §8.2, §2.11.4, §29.7a; D-063 clauses 6-8)
--
-- TWENTY-THREE constraints: 20 frozen bodies plus the 3 introduced by D-062, Dio E.
--   `patient_references`  5   `encounters` 6   `encounter_diagnoses` 0
--   `storage_objects`     1   `encounter_documents` 8 + 3 = 11
-- The earlier summary of `18` frozen constraints, and the attribution of `10` to
-- `encounter_documents`, are SUPERSEDED arithmetic errors (D-063 clause 6). NO constraint
-- body is invented to reach the number 23 — the authoritative source of every body is
-- §7.1, §7.2, §7.3, §8.1, §8.2 and §2.11.4, and no body is changed, added or removed.
--
-- EVERY constraint carries an EXPLICIT canonical name from §29.7a / D-063 clause 7, on the
-- `<table>_<rule>_check` standard of 12 §8 and the `practice_settings_version_check`
-- precedent of package `002`. THE NAME IS PART OF THE CONTRACT, not an implementer's choice:
-- no CHECK on these tables may ever be auto-named.
--
-- `encounter_diagnoses` receives NO CHECK constraint at all. That is a RATIFIED ABSENCE, not
-- an omission (§7.3, §29.7a): its constraints are the primary key, two uniques and the
-- composite foreign key.
--
-- Prisma cannot express `CHECK`, so all 23 are hand-written custom SQL and are authoritative
-- over the `migrate diff` candidate (§26, §26.2). `prisma migrate diff` will report them as
-- drift on regeneration; that is expected and must never be "fixed" by removing them.
-- -----------------------------------------------------------------------------

-- --- `patient_references` — 5 (§7.1) -----------------------------------------

-- AddCheckConstraint
ALTER TABLE "patient_references" ADD CONSTRAINT "patient_references_birth_year_check" CHECK ("birth_year" is null or "birth_year" between 1900 and 2200);

-- AddCheckConstraint
-- §2.7 envelope: ciphertext, IV and auth tag are present together or absent together.
ALTER TABLE "patient_references" ADD CONSTRAINT "patient_references_external_patient_ref_envelope_check" CHECK (
  ("external_patient_ref_ciphertext" is null
   and "external_patient_ref_iv" is null
   and "external_patient_ref_auth_tag" is null)
  or
  ("external_patient_ref_ciphertext" is not null
   and "external_patient_ref_iv" is not null
   and "external_patient_ref_auth_tag" is not null)
);

-- AddCheckConstraint
ALTER TABLE "patient_references" ADD CONSTRAINT "patient_references_external_patient_ref_iv_length_check" CHECK (
  "external_patient_ref_iv" is null
  or octet_length("external_patient_ref_iv") = 12
);

-- AddCheckConstraint
ALTER TABLE "patient_references" ADD CONSTRAINT "patient_references_external_patient_ref_auth_tag_length_check" CHECK (
  "external_patient_ref_auth_tag" is null
  or octet_length("external_patient_ref_auth_tag") = 16
);

-- AddCheckConstraint
ALTER TABLE "patient_references" ADD CONSTRAINT "patient_references_encryption_metadata_check" CHECK (
  "external_patient_ref_ciphertext" is null
  or (
    "encryption_algorithm" = 'AES-256-GCM'
    and "encryption_version" >= 1
    and "encryption_key_ref" is not null
    and "encryption_key_version" >= 1
  )
);

-- --- `encounters` — 6 (§7.2) -------------------------------------------------

-- AddCheckConstraint
-- D-029 optimistic locking guard, the same rule as `practice_settings_version_check`.
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_version_check" CHECK ("version" >= 1);

-- AddCheckConstraint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_age_check" CHECK (
  "patient_age_at_encounter" is null
  or "patient_age_at_encounter" between 0 and 130
);

-- AddCheckConstraint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_external_encounter_ref_envelope_check" CHECK (
  ("external_encounter_ref_ciphertext" is null
   and "external_encounter_ref_iv" is null
   and "external_encounter_ref_auth_tag" is null)
  or
  ("external_encounter_ref_ciphertext" is not null
   and "external_encounter_ref_iv" is not null
   and "external_encounter_ref_auth_tag" is not null)
);

-- AddCheckConstraint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_external_encounter_ref_iv_length_check" CHECK (
  "external_encounter_ref_iv" is null
  or octet_length("external_encounter_ref_iv") = 12
);

-- AddCheckConstraint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_external_encounter_ref_auth_tag_length_check" CHECK (
  "external_encounter_ref_auth_tag" is null
  or octet_length("external_encounter_ref_auth_tag") = 16
);

-- AddCheckConstraint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_encryption_metadata_check" CHECK (
  "external_encounter_ref_ciphertext" is null
  or (
    "encryption_algorithm" = 'AES-256-GCM'
    and "encryption_version" >= 1
    and "encryption_key_ref" is not null
    and "encryption_key_version" >= 1
  )
);

-- --- `encounter_diagnoses` — 0 (§7.3) ----------------------------------------
-- Intentionally none. Ratified absence, not an omission.

-- --- `storage_objects` — 1 (§8.1) --------------------------------------------

-- AddCheckConstraint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_byte_size_check" CHECK ("byte_size" >= 0);

-- --- `encounter_documents` — 8 frozen (§8.2) ---------------------------------

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_page_count_check" CHECK ("page_count" is null or "page_count" > 0);

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_normalized_text_envelope_check" CHECK (
  ("normalized_text_ciphertext" is null
   and "normalized_text_iv" is null
   and "normalized_text_auth_tag" is null)
  or
  ("normalized_text_ciphertext" is not null
   and "normalized_text_iv" is not null
   and "normalized_text_auth_tag" is not null)
);

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_normalized_text_iv_length_check" CHECK ("normalized_text_iv" is null or octet_length("normalized_text_iv") = 12);

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_normalized_text_auth_tag_length_check" CHECK ("normalized_text_auth_tag" is null or octet_length("normalized_text_auth_tag") = 16);

-- AddCheckConstraint
-- §2.7.3: the two encrypted fields share one key but NEVER share an IV — reusing an IV under
-- the same key is forbidden, which is why the IV and auth tag columns are per field.
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_redacted_text_envelope_check" CHECK (
  ("redacted_text_ciphertext" is null
   and "redacted_text_iv" is null
   and "redacted_text_auth_tag" is null)
  or
  ("redacted_text_ciphertext" is not null
   and "redacted_text_iv" is not null
   and "redacted_text_auth_tag" is not null)
);

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_redacted_text_iv_length_check" CHECK ("redacted_text_iv" is null or octet_length("redacted_text_iv") = 12);

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_redacted_text_auth_tag_length_check" CHECK ("redacted_text_auth_tag" is null or octet_length("redacted_text_auth_tag") = 16);

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_encryption_metadata_check" CHECK (
  ("normalized_text_ciphertext" is null and "redacted_text_ciphertext" is null)
  or (
    "encryption_algorithm" = 'AES-256-GCM'
    and "encryption_version" >= 1
    and "encryption_key_ref" is not null
    and "encryption_key_version" >= 1
  )
);

-- --- `encounter_documents` — 3 new (§2.11.4, D-062 Dio E, `OD-P5-D2-6`) ------
--
-- Ratified `A + A+`. The vocabulary objection recorded in D-060 was TEMPORAL, not
-- substantive — "a premature constraint would lock the vocabulary before the schema gate" —
-- and it EXPIRED exactly at that schema gate. Both vocabularies are frozen (D-060 clauses
-- 29-30, with `PENDING`, `PROCESSING`, `ARCHIVED` and `SKIPPED` explicitly excluded), so
-- these constraints encode a RATIFIED FACT rather than presuming an unratified one. Both
-- columns stay `varchar(30)`; a future vocabulary change requires a migration, which is
-- correct, because such a change is a decision-level event.

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_processing_status_check" CHECK ("processing_status" in ('READY','FAILED'));

-- AddCheckConstraint
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_redaction_status_check" CHECK ("redaction_status" in ('COMPLETED','FAILED'));

-- AddCheckConstraint
-- The artifact-consistency constraint (D-060 clauses 30 and 32). `COMPLETED` without a
-- redacted artifact is impossible, and `FAILED` WITH one is impossible. This is also what
-- excludes, in the database-checkable part, the logically impossible combination
-- `processing_status = 'FAILED'` together with `redaction_status = 'COMPLETED'`: redaction
-- operates on the normalised artifact and cannot succeed over an unusable source. The domain
-- layer must not construct that combination either (D-062 Dio E.2).
--
-- `COMPLETED` asserts ONLY that the configured deterministic ruleset ran successfully. It
-- does NOT assert anonymisation, de-identification or absence of identifiers, and the
-- redacted text REMAINS Class A medical data (§2.11.2 honesty clause).
ALTER TABLE "encounter_documents" ADD CONSTRAINT "encounter_documents_redacted_artifact_consistency_check" CHECK (
  ("redaction_status" = 'COMPLETED'
   and "redacted_text_ciphertext" is not null
   and "redacted_text_hash" is not null)
  or
  ("redaction_status" = 'FAILED'
   and "redacted_text_ciphertext" is null
   and "redacted_text_hash" is null)
);

-- -----------------------------------------------------------------------------
-- 6. Non-unique indexes (§21, §29.6, D-062 Dio J, `OD-P5-D2-13`)
--
-- Exactly four. §7.2 and §21 previously disagreed — §7.2 declared the responsible-physician
-- index that §21 omitted, and §21 added the `id desc` tie-breaker that §7.2 lacked. The
-- ratified outcome is the UNION, with the more specific `id desc` tie-breaker.
--
-- `id desc` is MANDATORY on all three encounter indexes: without it the tail of the sort is
-- unstable and cursor pagination breaks (03 §7).
--
-- `encounters_responsible_physician_idx` is NOT removed merely because the minimal §21
-- catalogue omitted it — the `responsiblePhysicianId` filter is canonical and was explicitly
-- preserved by D-061 clause 10, so the index is not speculative. None of the four is: each
-- has a documented query path in the frozen contract, and no speculative index is added.
--
-- Package `012_constraints_indexes` will later VERIFY these four, not create them — the same
-- precedent as `platform_role_assignments_user_idx` from package `002`.
--
-- `CREATE INDEX CONCURRENTLY` is forbidden here: it cannot run inside the single transaction
-- this file requires, and it is unnecessary over empty tables.
-- -----------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "encounters_review_queue_idx" ON "encounters"("practice_id", "status", "treatment_date" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "encounters_patient_timeline_idx" ON "encounters"("practice_id", "patient_reference_id", "treatment_date" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "encounters_responsible_physician_idx" ON "encounters"("practice_id", "responsible_physician_id", "treatment_date" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "documents_encounter_idx" ON "encounter_documents"("practice_id", "encounter_id", "created_at");

-- -----------------------------------------------------------------------------
-- 7. ROLLBACK — DOCUMENTATION ONLY, NOT EXECUTED BY THIS MIGRATION
--
-- THIS SECTION CONTAINS NO EXECUTABLE STATEMENT. Every line below is commentary. There is no
-- down-migration file and the repository convention (precedent `013` §7) is not changed.
--
-- This package added no grant, no policy and no RLS flag, so its reversal has nothing to
-- revoke and nothing to disable. It is a pure structural reversal, in dependency order —
-- children before parents, types last:
--
--     drop table encounter_documents;
--     drop table encounter_diagnoses;
--     drop table encounters;
--     drop table storage_objects;
--     drop table patient_references;
--
--     drop type document_source;
--     drop type document_type;
--     drop type review_state;
--     drop type encounter_status;
--     drop type integration_provider;
--
-- Dropping the five tables removes their own constraints and indexes with them, including
-- `encounters_responsible_physician_membership_fk`. NOTHING that belongs to package `002` or
-- `013` is touched: `practice_memberships` keeps every column, index, constraint, policy and
-- grant it had before this package ran, and its parent key
-- `practice_memberships_practice_user_key` survives untouched.
--
-- The reversal removes only what THIS package added. It is non-destructive of phase 3/4
-- state and fails closed; the project has no production data (§22.2). A rollback must NEVER
-- be used as a substitute for the §23.4 maintenance window, and must never leave any table
-- with RLS enabled but FORCE off.
-- -----------------------------------------------------------------------------

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, securityDatabase } from './support/phase3-security-context.js';

/**
 * Mechanical verification of the CANONICAL MIGRATION CHAIN — packages
 * `001_extensions_and_roles`, `002_identity_and_practices`, `013_rls_policies` and
 * `003_patient_encounter_documents` (02 §22.2, §22.3, §26.3 step 7; 08 §21.5.1, §21.6.1,
 * §21.6.5, §21.7.2, §21.8).
 *
 * These are catalogue assertions, not behaviour assertions: the schema, the ownership, the
 * grant surface, the RLS flags and the policy set are read straight out of `pg_catalog` and
 * compared against the accepted model, exactly. A WIDER grant than the least-privilege model
 * must fail the test, which is why every assertion is `toStrictEqual` on a full set rather
 * than a containment check (08 §5.1).
 *
 * PHASE 4 RECONCILIATION. The structural half — enums, tables, ownership, constraints,
 * indexes, the `002` table-level grants — is UNCHANGED by `013`, which adds no table, column,
 * enum, constraint or index. What `013` changes, and what the assertions below now describe,
 * is exactly four things: the applied migration history, the `practice_settings` column
 * privilege surface, the RLS flags of `practice_memberships` and `practice_settings`, and the
 * policy and context-function sets. Every phase 3 artifact is asserted to have SURVIVED
 * unchanged rather than deleted from the contract (D-047 clause 16, D-051 clauses 1, 5, 6).
 *
 * PHASE 5 RECONCILIATION (02 §22.3, §29; D-062; D-063). Package
 * `003_patient_encounter_documents` adds five enums, five tables, nine unique indexes, eight
 * foreign keys, 23 CHECK constraints and four non-unique indexes. Every assertion here that
 * reads the WHOLE schema — the migration history, the enum catalogue, the table set, the
 * constraint set, the index set, the tenant-key set and the RLS flags — is EXTENDED to model
 * the new state EXACTLY. None of them is narrowed, broadened or turned into a containment
 * check; the phase 5 contract itself (the 23-row CHECK catalogue, the foreign key MATCH types,
 * the zero-capability boundary) is owned by `phase5-schema-catalogue.security.ts`.
 *
 * What package `003` DOES NOT change is asserted here just as strictly: it issues no grant, no
 * policy and no RLS flag, and the three context functions below must be BYTE-IDENTICAL to
 * their phase 4 state. In particular `practice_memberships` receives no structural change of
 * any kind — the responsible-physician foreign key is created on `encounters`, against a
 * parent key that has existed since package `002` (D-061 clause 11, D-062 Dio B.4).
 *
 * `P5-I2B` RECONCILIATION (02 §29.4, §29.4a, §29.5; D-064 `OD-9`; D-065 `RULING 1`). The
 * phase 5 slice of `013_rls_policies` deliberately changes the security steady state: the
 * seven phase 5 tenant tables receive their grants, `ENABLE` + `FORCE ROW LEVEL SECURITY` and
 * fifteen new policies, all in ONE explicit transaction. The whole-schema assertions here —
 * the RLS flags, the policy catalogue, the `WITH CHECK` catalogue and the table-level grant
 * catalogue — are therefore REPLACED BY NEW EXACT SETS, never broadened into containment
 * checks. The TEN phase 3/4 policies are still asserted individually and must stay
 * byte-identical; the steady-state contract of the fifteen new ones is owned by
 * `phase5-rls-grants.security.ts` (D-064 `OD-9` part B).
 */
const database = securityDatabase();

let migrator: Client;

beforeAll(async () => {
  migrator = await connect(database.migration);
});

afterAll(async () => {
  await migrator.end();
});

describe('migration history', () => {
  it('given the disposable database when migrated then exactly packages 001, 002, 013, 003 and both phase 5 slices are applied', async () => {
    const result = await migrator.query<{
      migration_name: string;
      finished: boolean;
      rolled_back: boolean;
    }>(
      `select migration_name,
              (finished_at is not null) as finished,
              (rolled_back_at is not null) as rolled_back
         from _prisma_migrations
        order by started_at`,
    );

    expect(result.rows.map((row) => row.migration_name)).toStrictEqual([
      '20260810213856_001_extensions_and_roles',
      '20260814013200_002_identity_and_practices',
      '20260816111141_013_rls_policies',
      // Package `003` carries a LOWER number but a LATER timestamp, and both phase 5 slices
      // later ones still: package numbers carry OWNERSHIP, not execution order (D-052,
      // D-062 Dio B.3, D-064 `OD-8`). The chain grew from FOUR to FIVE with sub-gate `P5-I2A`
      // and from FIVE to SIX with `P5-I2B` — canonical old-exact-set -> new-exact-set
      // evolutions authorised by D-064 `OD-9`, never a weakening. The phase 5 slice of `014`
      // is still not applied: it belongs to `P5-I2C`, and the chain reaches SEVEN only then.
      '20260823104252_003_patient_encounter_documents',
      '20260823211546_011_jobs_idempotency_outbox_audit_phase5',
      '20260825013452_013_rls_policies_phase5',
    ]);
    expect(result.rows.every((row) => row.finished && !row.rolled_back)).toBe(true);
  });
});

describe('enums (02 §4.1, §4.2, §4.16)', () => {
  it('given the canonical chain when applied then the enum catalogue carries exactly its accepted values', async () => {
    const result = await migrator.query<{ typname: string; values: string }>(
      `select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as values
         from pg_type t
         join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname
        order by t.typname`,
    );

    // Three from package `002` and five from package `003` (02 §29.1). The phase 5 value sets
    // are frozen by 02 §4.3-§4.8 and are asserted in full by the phase 5 catalogue spec; they
    // appear here because this assertion is WHOLE-SCHEMA and must stay exact.
    expect(result.rows).toStrictEqual([
      {
        typname: 'document_source',
        values: 'MANUAL_TEXT,FILE_UPLOAD,AXENITA_API,CSV_IMPORT,FHIR_IMPORT,GENERATED',
      },
      {
        typname: 'document_type',
        values:
          'CONSULTATION_NOTE,DIAGNOSIS_LIST,PROCEDURE_NOTE,REFERRAL,LAB_RESULT,BILLING_DRAFT,AUDIT_REPORT,OTHER',
      },
      {
        typname: 'encounter_status',
        values:
          'DRAFT,READY_FOR_ANALYSIS,ANALYSIS_IN_PROGRESS,REVIEW_REQUIRED,APPROVED,EXPORT_PENDING,EXPORTED,CANCELLED,CLOSED',
      },
      { typname: 'entity_status', values: 'ACTIVE,INACTIVE,SUSPENDED,ARCHIVED' },
      { typname: 'integration_provider', values: 'AXENITA,MANUAL,CSV,FHIR,OTHER' },
      {
        typname: 'membership_role',
        values: 'PRACTICE_ADMIN,PHYSICIAN,MPA,BILLING_SPECIALIST,AUDITOR,READ_ONLY',
      },
      // `SYSTEM_ADMIN` is a PLATFORM role and must never appear in `membership_role`
      // (D-038 clause 12).
      { typname: 'platform_role', values: 'SYSTEM_ADMIN' },
      { typname: 'review_state', values: 'UNREVIEWED,CONFIRMED,CORRECTED,REJECTED' },
    ]);
  });
});

describe('tables and ownership (02 §3.5, §6.1-§6.5)', () => {
  it('given the canonical chain when applied then exactly the thirteen accepted tables exist', async () => {
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by tablename`,
    );

    // Six from packages `002`/`013`, five from package `003` (02 §22.3) and the two of the
    // phase 5 slice of package `011` (02 §22.11, §29.9). The old exact set of ELEVEN is
    // superseded by this one — a canonical old-exact-set -> new-exact-set evolution authorised
    // by D-064 `OD-9`, never a weakening. `outbox_events` and `async_jobs` are the other two
    // §15 tables of package `011` and are still absent: phase 5 does not create them at all
    // (D-064 `OD-5`).
    expect(result.rows.map((row) => row.tablename)).toStrictEqual([
      'audit_events',
      'encounter_diagnoses',
      'encounter_documents',
      'encounters',
      'idempotency_keys',
      'patient_references',
      'platform_role_assignments',
      'practice_membership_roles',
      'practice_memberships',
      'practice_settings',
      'practices',
      'storage_objects',
      'users',
    ]);
  });

  it('given every table when inspected then copilot_migrator owns it and no runtime role does', async () => {
    const result = await migrator.query<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner from pg_tables
        where schemaname not in ('pg_catalog', 'information_schema')
        order by tablename`,
    );

    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.tableowner).toBe('copilot_migrator');
    }
  });

  it('given schema public when inspected then copilot_migrator owns it', async () => {
    const result = await migrator.query<{ owner: string }>(
      `select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'public'`,
    );

    expect(result.rows[0]?.owner).toBe('copilot_migrator');
  });
});

describe('constraints and indexes (02 §6.1-§6.5, §21, §22.2)', () => {
  it('given package 002 when applied then every accepted constraint exists with its accepted definition', async () => {
    const result = await migrator.query<{ tbl: string; conname: string; def: string }>(
      `select rel.relname as tbl, con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname <> '_prisma_migrations'
        order by rel.relname, con.conname`,
    );

    expect(result.rows).toStrictEqual([
      // --- Phase 5 slice of package `011` (02 §29.9.1; D-064 `OD-4`). Its full contract —
      // the column catalogue, the index set and the zero-capability boundary — is asserted by
      // `phase5-package011-catalogue.security.ts`. The two rows appear here because THIS
      // assertion is WHOLE-SCHEMA and must stay an exact full-set comparison. NO `CHECK` and
      // NO key to `users` belongs to either new table.
      { tbl: 'audit_events', conname: 'audit_events_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'audit_events',
        conname: 'audit_events_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      // --- Package `003` (02 §29.2, §29.7a). Their full contract — the 23-row CHECK
      // catalogue, the eight foreign keys and their MATCH type — is asserted by
      // `phase5-schema-catalogue.security.ts`. They appear here because THIS assertion is
      // WHOLE-SCHEMA and must stay an exact full-set comparison.
      {
        tbl: 'encounter_diagnoses',
        conname: 'encounter_diagnoses_encounter_fk',
        def: 'FOREIGN KEY (practice_id, encounter_id) REFERENCES encounters(practice_id, id)',
      },
      { tbl: 'encounter_diagnoses', conname: 'encounter_diagnoses_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_encounter_fk',
        def: 'FOREIGN KEY (practice_id, encounter_id) REFERENCES encounters(practice_id, id)',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_encryption_metadata_check',
        def: "CHECK ((((normalized_text_ciphertext IS NULL) AND (redacted_text_ciphertext IS NULL)) OR (((encryption_algorithm)::text = 'AES-256-GCM'::text) AND (encryption_version >= 1) AND (encryption_key_ref IS NOT NULL) AND (encryption_key_version >= 1))))",
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_normalized_text_auth_tag_length_check',
        def: 'CHECK (((normalized_text_auth_tag IS NULL) OR (octet_length(normalized_text_auth_tag) = 16)))',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_normalized_text_envelope_check',
        def: 'CHECK ((((normalized_text_ciphertext IS NULL) AND (normalized_text_iv IS NULL) AND (normalized_text_auth_tag IS NULL)) OR ((normalized_text_ciphertext IS NOT NULL) AND (normalized_text_iv IS NOT NULL) AND (normalized_text_auth_tag IS NOT NULL))))',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_normalized_text_iv_length_check',
        def: 'CHECK (((normalized_text_iv IS NULL) OR (octet_length(normalized_text_iv) = 12)))',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_page_count_check',
        def: 'CHECK (((page_count IS NULL) OR (page_count > 0)))',
      },
      { tbl: 'encounter_documents', conname: 'encounter_documents_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_processing_status_check',
        def: "CHECK (((processing_status)::text = ANY ((ARRAY['READY'::character varying, 'FAILED'::character varying])::text[])))",
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_redacted_artifact_consistency_check',
        def: "CHECK (((((redaction_status)::text = 'COMPLETED'::text) AND (redacted_text_ciphertext IS NOT NULL) AND (redacted_text_hash IS NOT NULL)) OR (((redaction_status)::text = 'FAILED'::text) AND (redacted_text_ciphertext IS NULL) AND (redacted_text_hash IS NULL))))",
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_redacted_text_auth_tag_length_check',
        def: 'CHECK (((redacted_text_auth_tag IS NULL) OR (octet_length(redacted_text_auth_tag) = 16)))',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_redacted_text_envelope_check',
        def: 'CHECK ((((redacted_text_ciphertext IS NULL) AND (redacted_text_iv IS NULL) AND (redacted_text_auth_tag IS NULL)) OR ((redacted_text_ciphertext IS NOT NULL) AND (redacted_text_iv IS NOT NULL) AND (redacted_text_auth_tag IS NOT NULL))))',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_redacted_text_iv_length_check',
        def: 'CHECK (((redacted_text_iv IS NULL) OR (octet_length(redacted_text_iv) = 12)))',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_redaction_status_check',
        def: "CHECK (((redaction_status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'FAILED'::character varying])::text[])))",
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_source_storage_object_fk',
        def: 'FOREIGN KEY (practice_id, source_storage_object_id) REFERENCES storage_objects(practice_id, id)',
      },
      {
        tbl: 'encounter_documents',
        conname: 'encounter_documents_storage_object_fk',
        def: 'FOREIGN KEY (practice_id, storage_object_id) REFERENCES storage_objects(practice_id, id)',
      },
      {
        tbl: 'encounters',
        conname: 'encounters_encryption_metadata_check',
        def: "CHECK (((external_encounter_ref_ciphertext IS NULL) OR (((encryption_algorithm)::text = 'AES-256-GCM'::text) AND (encryption_version >= 1) AND (encryption_key_ref IS NOT NULL) AND (encryption_key_version >= 1))))",
      },
      {
        tbl: 'encounters',
        conname: 'encounters_external_encounter_ref_auth_tag_length_check',
        def: 'CHECK (((external_encounter_ref_auth_tag IS NULL) OR (octet_length(external_encounter_ref_auth_tag) = 16)))',
      },
      {
        tbl: 'encounters',
        conname: 'encounters_external_encounter_ref_envelope_check',
        def: 'CHECK ((((external_encounter_ref_ciphertext IS NULL) AND (external_encounter_ref_iv IS NULL) AND (external_encounter_ref_auth_tag IS NULL)) OR ((external_encounter_ref_ciphertext IS NOT NULL) AND (external_encounter_ref_iv IS NOT NULL) AND (external_encounter_ref_auth_tag IS NOT NULL))))',
      },
      {
        tbl: 'encounters',
        conname: 'encounters_external_encounter_ref_iv_length_check',
        def: 'CHECK (((external_encounter_ref_iv IS NULL) OR (octet_length(external_encounter_ref_iv) = 12)))',
      },
      {
        tbl: 'encounters',
        conname: 'encounters_patient_age_check',
        def: 'CHECK (((patient_age_at_encounter IS NULL) OR ((patient_age_at_encounter >= 0) AND (patient_age_at_encounter <= 130))))',
      },
      {
        tbl: 'encounters',
        conname: 'encounters_patient_reference_fk',
        def: 'FOREIGN KEY (practice_id, patient_reference_id) REFERENCES patient_references(practice_id, id)',
      },
      { tbl: 'encounters', conname: 'encounters_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'encounters',
        conname: 'encounters_responsible_physician_membership_fk',
        def: 'FOREIGN KEY (practice_id, responsible_physician_id) REFERENCES practice_memberships(practice_id, user_id)',
      },
      { tbl: 'encounters', conname: 'encounters_version_check', def: 'CHECK ((version >= 1))' },
      { tbl: 'idempotency_keys', conname: 'idempotency_keys_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'idempotency_keys',
        conname: 'idempotency_keys_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      {
        tbl: 'patient_references',
        conname: 'patient_references_birth_year_check',
        def: 'CHECK (((birth_year IS NULL) OR ((birth_year >= 1900) AND (birth_year <= 2200))))',
      },
      {
        tbl: 'patient_references',
        conname: 'patient_references_encryption_metadata_check',
        def: "CHECK (((external_patient_ref_ciphertext IS NULL) OR (((encryption_algorithm)::text = 'AES-256-GCM'::text) AND (encryption_version >= 1) AND (encryption_key_ref IS NOT NULL) AND (encryption_key_version >= 1))))",
      },
      {
        tbl: 'patient_references',
        conname: 'patient_references_external_patient_ref_auth_tag_length_check',
        def: 'CHECK (((external_patient_ref_auth_tag IS NULL) OR (octet_length(external_patient_ref_auth_tag) = 16)))',
      },
      {
        tbl: 'patient_references',
        conname: 'patient_references_external_patient_ref_envelope_check',
        def: 'CHECK ((((external_patient_ref_ciphertext IS NULL) AND (external_patient_ref_iv IS NULL) AND (external_patient_ref_auth_tag IS NULL)) OR ((external_patient_ref_ciphertext IS NOT NULL) AND (external_patient_ref_iv IS NOT NULL) AND (external_patient_ref_auth_tag IS NOT NULL))))',
      },
      {
        tbl: 'patient_references',
        conname: 'patient_references_external_patient_ref_iv_length_check',
        def: 'CHECK (((external_patient_ref_iv IS NULL) OR (octet_length(external_patient_ref_iv) = 12)))',
      },
      { tbl: 'patient_references', conname: 'patient_references_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'patient_references',
        conname: 'patient_references_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      {
        tbl: 'platform_role_assignments',
        conname: 'platform_role_assignments_pkey',
        def: 'PRIMARY KEY (id)',
      },
      {
        tbl: 'platform_role_assignments',
        conname: 'platform_role_assignments_user_fk',
        def: 'FOREIGN KEY (user_id) REFERENCES users(id)',
      },
      // The composite foreign key of D-038 clause 19: it is what makes a cross-practice role
      // assignment structurally impossible rather than merely validated.
      {
        tbl: 'practice_membership_roles',
        conname: 'practice_membership_roles_membership_fk',
        def: 'FOREIGN KEY (practice_id, membership_id) REFERENCES practice_memberships(practice_id, id)',
      },
      {
        tbl: 'practice_membership_roles',
        conname: 'practice_membership_roles_pkey',
        def: 'PRIMARY KEY (id)',
      },
      {
        tbl: 'practice_memberships',
        conname: 'practice_memberships_pkey',
        def: 'PRIMARY KEY (id)',
      },
      {
        tbl: 'practice_memberships',
        conname: 'practice_memberships_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      {
        tbl: 'practice_memberships',
        conname: 'practice_memberships_user_fk',
        def: 'FOREIGN KEY (user_id) REFERENCES users(id)',
      },
      { tbl: 'practice_settings', conname: 'practice_settings_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'practice_settings',
        conname: 'practice_settings_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      // D-029 optimistic locking guard. Prisma cannot express CHECK, so it is custom SQL.
      {
        tbl: 'practice_settings',
        conname: 'practice_settings_version_check',
        def: 'CHECK ((version >= 1))',
      },
      { tbl: 'practices', conname: 'practices_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'storage_objects',
        conname: 'storage_objects_byte_size_check',
        def: 'CHECK ((byte_size >= 0))',
      },
      { tbl: 'storage_objects', conname: 'storage_objects_pkey', def: 'PRIMARY KEY (id)' },
      {
        tbl: 'storage_objects',
        conname: 'storage_objects_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      { tbl: 'users', conname: 'users_pkey', def: 'PRIMARY KEY (id)' },
    ]);
  });

  it('given package 002 when applied then referential actions stay at the PostgreSQL default', async () => {
    // 02 §6.3a and §28.1 keep ON DELETE / ON UPDATE an OPEN question. A generated CASCADE or
    // RESTRICT would decide it silently, so every foreign key must be NO ACTION ('a').
    const result = await migrator.query<{
      conname: string;
      confdeltype: string;
      confupdtype: string;
    }>(
      `select con.conname, con.confdeltype, con.confupdtype
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
        order by con.conname`,
    );

    // Five from package `002`, the eight of 02 §29.2 and the two of 02 §29.9.1. Package `003`
    // and the phase 5 slice of package `011` both pin every one of their keys explicitly
    // rather than relying on a Prisma default (02 §29.3, D-062 Dio C.4, D-064 `OD-4`). The old
    // exact count of THIRTEEN is superseded by FIFTEEN (D-064 `OD-9`).
    expect(result.rows.length).toBe(15);
    for (const row of result.rows) {
      expect(row.confdeltype).toBe('a');
      expect(row.confupdtype).toBe('a');
    }
  });

  it('given package 002 when applied then exactly the accepted indexes exist', async () => {
    const result = await migrator.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by indexname`,
    );

    // No speculative index: 02 §6.3 proves every documented query path is already covered by
    // an existing constraint after the singular role column was removed (D-038 clause 2),
    // none of the four phase 5 indexes of 02 §29.6 is speculative either — each has a
    // documented query path in the frozen contract (D-062 Dio J) — and the two audit indexes
    // of 02 §21 are created by the package `011` CREATOR migration rather than deferred to
    // package `012`, which does not exist in phase 5 (D-064 `OD-7`).
    expect(result.rows.map((row) => row.indexname)).toStrictEqual([
      'audit_actor_idx',
      'audit_events_pkey',
      'audit_events_tenant_key',
      'audit_resource_idx',
      'documents_encounter_idx',
      'encounter_diagnoses_encounter_code_key',
      'encounter_diagnoses_pkey',
      'encounter_diagnoses_tenant_key',
      'encounter_documents_pkey',
      'encounter_documents_tenant_key',
      'encounters_patient_timeline_idx',
      'encounters_pkey',
      'encounters_responsible_physician_idx',
      'encounters_review_queue_idx',
      'encounters_tenant_key',
      'idempotency_keys_pkey',
      'idempotency_keys_scope_key',
      'idempotency_keys_tenant_key',
      'patient_references_pkey',
      'patient_references_pseudonym_key',
      'patient_references_source_external_ref_key',
      'patient_references_tenant_key',
      'platform_role_assignments_pkey',
      'platform_role_assignments_user_idx',
      'platform_role_assignments_user_role_key',
      'practice_membership_roles_membership_role_key',
      'practice_membership_roles_pkey',
      'practice_membership_roles_tenant_key',
      'practice_memberships_pkey',
      'practice_memberships_practice_user_key',
      'practice_memberships_tenant_key',
      'practice_memberships_user_active_idx',
      'practice_settings_pkey',
      'practice_settings_practice_key',
      'practice_settings_tenant_key',
      'practices_code_key',
      'practices_pkey',
      'practices_status_idx',
      'storage_objects_bucket_object_key',
      'storage_objects_pkey',
      'storage_objects_tenant_key',
      'users_auth_subject_key',
      'users_pkey',
    ]);
  });

  it('given the tenant tables when inspected then each carries the unconditional unique (practice_id, id)', async () => {
    // 02 §2.5 / D-022, unconditional. Three from package `002`, five from package `003` and
    // the two of the phase 5 slice of package `011` — TEN of the thirty tenant tables now
    // carry it (02 §29.7, 08 §12.9.3 item 13). The old exact set of EIGHT is superseded by
    // this one (D-064 `OD-9`). On `practice_memberships` it doubles as the parent key of the
    // composite FK.
    const result = await migrator.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname like '%_tenant_key'
        order by indexname`,
    );

    expect(result.rows.map((row) => row.indexdef)).toStrictEqual([
      'CREATE UNIQUE INDEX audit_events_tenant_key ON public.audit_events USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX encounter_diagnoses_tenant_key ON public.encounter_diagnoses USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX encounter_documents_tenant_key ON public.encounter_documents USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX encounters_tenant_key ON public.encounters USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX idempotency_keys_tenant_key ON public.idempotency_keys USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX patient_references_tenant_key ON public.patient_references USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_membership_roles_tenant_key ON public.practice_membership_roles USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_memberships_tenant_key ON public.practice_memberships USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX practice_settings_tenant_key ON public.practice_settings USING btree (practice_id, id)',
      'CREATE UNIQUE INDEX storage_objects_tenant_key ON public.storage_objects USING btree (practice_id, id)',
    ]);
  });
});

describe('privilege catalogue (02 §20.2, §20.2a, §20.2b; D-047, D-049, D-051)', () => {
  it('given the canonical chain when applied then exactly these table-level grants exist', async () => {
    const result = await migrator.query<{ table_name: string; grantee: string; privs: string }>(
      `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee <> 'copilot_migrator'
        group by table_name, grantee
        order by table_name, grantee`,
    );

    // PACKAGE `002` STILL GRANTS NO INSERT, UPDATE OR DELETE anywhere (D-047 clause 15,
    // D-033 clause 13, D-038 clause 24, D-023 clause 11) — the four phase 3/4 rows at the
    // bottom are byte-identical to their phase 4 state.
    //
    // The six `INSERT,SELECT` rows above them belong to `P5-I2B` (§29.5, §29.4a.3, §29.4a.4).
    // NO `UPDATE` APPEARS IN THIS RESULT AT ALL, because every phase 5 `UPDATE` grant is
    // COLUMN-LEVEL and therefore lives only in `role_column_grants` — which is exactly what
    // makes `practice_id` and `id` immovable at the privilege level. `storage_objects` is
    // ABSENT ON PURPOSE: it receives zero capability (§29.5), and `copilot_system` and
    // `PUBLIC` hold nothing on any phase 5 table (D-023).
    //
    // The old exact set of FOUR rows is superseded by this one of TEN (D-064 `OD-9`).
    expect(result.rows).toStrictEqual([
      { table_name: 'audit_events', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'encounter_diagnoses', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'encounter_documents', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'encounters', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'idempotency_keys', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'patient_references', grantee: 'copilot_app', privs: 'INSERT,SELECT' },
      { table_name: 'platform_role_assignments', grantee: 'copilot_app', privs: 'SELECT' },
      { table_name: 'platform_role_assignments', grantee: 'copilot_system', privs: 'SELECT' },
      { table_name: 'practice_membership_roles', grantee: 'copilot_app', privs: 'SELECT' },
      // The hard dependency of BOTH `practices_membership_select` and
      // `practice_membership_roles_self_select` (02 §17.4, §17.6, §20.2a, D-051 clause 4).
      { table_name: 'practice_memberships', grantee: 'copilot_app', privs: 'SELECT' },
    ]);
  });

  it('given users when inspected then copilot_app reads exactly the five accepted columns', async () => {
    const columns = await grantedColumns(migrator, 'users', 'copilot_app');

    // `auth_subject`, `last_login_at`, `created_at` and `updated_at` receive NO grant.
    // `auth_subject` is reachable only through the §17.5 policy expression (02 §20.2a).
    expect(columns).toStrictEqual(['display_name', 'email', 'id', 'preferred_language', 'status']);
  });

  it('given practices when inspected then copilot_app reads exactly the six accepted columns', async () => {
    const columns = await grantedColumns(migrator, 'practices', 'copilot_app');

    // `legal_name`, `zsr_number` and `gln_number` receive NO grant: class B business data
    // that stays unreachable even with a compromised credential (02 §20.2a, 09 §2).
    expect(columns).toStrictEqual(['code', 'default_language', 'id', 'name', 'status', 'timezone']);
  });

  it('given practice_settings when inspected then copilot_app reads exactly the nine D-053 columns', async () => {
    // D-053 part A. Package `013` EXTENDS the phase 3 three-column surface of D-049 clause 2 —
    // `practice_id`, `allow_mpa_approval`, `allow_billing_specialist_approval` — which is a
    // STRICT SUBSET of this list and is NOT revoked (D-053 clause A.5). `id`, `configuration`,
    // `updated_by` and `updated_at` stay unreadable (clause A.4).
    const columns = await grantedColumns(migrator, 'practice_settings', 'copilot_app');

    expect(columns).toStrictEqual([
      'ai_enabled',
      'allow_billing_specialist_approval',
      'allow_mpa_approval',
      'axenita_export_enabled',
      'billing_review_required',
      'practice_id',
      'require_reason_for_manual_change',
      'retention_policy_code',
      'version',
    ]);
    expect(columns).toHaveLength(9);

    // The phase 3 surface survived intact inside the extended one.
    for (const phase3Column of [
      'practice_id',
      'allow_mpa_approval',
      'allow_billing_specialist_approval',
    ]) {
      expect(columns).toContain(phase3Column);
    }
  });

  it('given practice_settings when inspected then copilot_app updates exactly the nine D-053 columns', async () => {
    // D-053 part B. `practice_id` is deliberately ABSENT: without `UPDATE (practice_id)` a
    // tenant-key move is rejected on the PRIVILEGE level, before the `WITH CHECK` of the tenant
    // policy is even reached (clause B.2). `id`, `configuration` and `updated_by` are absent too.
    const columns = await grantedColumns(migrator, 'practice_settings', 'copilot_app', 'UPDATE');

    expect(columns).toStrictEqual([
      'ai_enabled',
      'allow_billing_specialist_approval',
      'allow_mpa_approval',
      'axenita_export_enabled',
      'billing_review_required',
      'require_reason_for_manual_change',
      'retention_policy_code',
      'updated_at',
      'version',
    ]);
    expect(columns).toHaveLength(9);
    expect(columns).not.toContain('practice_id');
  });

  it('given practice_settings when inspected then NO table-level privilege of any kind exists', async () => {
    // 02 §20.2b forbids a table-level SELECT and §20.2b.1 forbids a table-level UPDATE. Both
    // surfaces are COLUMN-LEVEL only, which is what makes the counted lists above the whole
    // truth: a table-level grant would make every column reachable and would not appear in
    // `role_column_grants` as a per-column row.
    const result = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'practice_settings'
          and grantee <> 'copilot_migrator'
        order by grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given practice_settings when inspected then NO INSERT and NO DELETE is granted to any runtime role', async () => {
    // §20.2b.1 — the settings row is created by the trusted seed path (§23.4), never by a
    // request path, and business delete is not permitted.
    // `copilot_migrator` is excluded because it is the table OWNER and holds every privilege by
    // definition; it is not a runtime role, and under FORCE it is subject to the policies
    // anyway. Every other grantee must hold nothing.
    const result = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select distinct grantee, privilege_type from information_schema.role_column_grants
        where table_schema = 'public' and table_name = 'practice_settings'
          and grantee <> 'copilot_migrator'
          and privilege_type in ('INSERT', 'DELETE')
        order by grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given practice_settings when inspected then copilot_system and PUBLIC hold nothing', async () => {
    // A tenant table; `copilot_system` is a platform identity and never reaches tenant data
    // (D-023). 02 §20.2b also forbids a table-level SELECT here in phase 3.
    expect(await grantedColumns(migrator, 'practice_settings', 'copilot_system')).toStrictEqual([]);
    expect(await grantedColumns(migrator, 'practice_settings', 'PUBLIC')).toStrictEqual([]);
  });

  it('given every phase 3 table when inspected then PUBLIC holds no privilege at all', async () => {
    const result = await migrator.query<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'PUBLIC'`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given schema public when inspected then PUBLIC holds neither USAGE nor CREATE', async () => {
    const result = await migrator.query<{ usage: boolean; creation: boolean }>(
      `select has_schema_privilege('public', 'public', 'USAGE') as usage,
              has_schema_privilege('public', 'public', 'CREATE') as creation`,
    );

    expect(result.rows[0]).toStrictEqual({ usage: false, creation: false });
  });

  it('given schema public when inspected then no DEFAULT PRIVILEGE can pre-grant a future table', async () => {
    // Migration 001 asserts this too. Repeating it after package 002 proves the package did
    // not introduce one (02 §20).
    const result = await migrator.query<{ total: string }>(
      'select count(*)::text as total from pg_default_acl',
    );

    expect(result.rows[0]?.total).toBe('0');
  });

  it('given the runtime roles when inspected then neither may create objects in schema public', async () => {
    const result = await migrator.query<{
      app_create: boolean;
      system_create: boolean;
      app_usage: boolean;
      system_usage: boolean;
    }>(
      `select has_schema_privilege('copilot_app', 'public', 'CREATE') as app_create,
              has_schema_privilege('copilot_system', 'public', 'CREATE') as system_create,
              has_schema_privilege('copilot_app', 'public', 'USAGE') as app_usage,
              has_schema_privilege('copilot_system', 'public', 'USAGE') as system_usage`,
    );

    expect(result.rows[0]).toStrictEqual({
      app_create: false,
      system_create: false,
      app_usage: true,
      system_usage: true,
    });
  });
});

describe('RLS and policy catalogue (02 §17.2, §17.4, §17.5, §17.6; D-047, D-051)', () => {
  it('given the canonical chain when applied then ALL THIRTEEN tables carry ENABLE and FORCE RLS', async () => {
    const result = await migrator.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_prisma_migrations'
        order by c.relname`,
    );

    // The SIX business tables of packages `002`/`013` are every one of them `true`/`true`. The
    // four owned by package `002` are NOT re-altered by `013` and are asserted here to have
    // kept that state; `practice_memberships` (§17.3, D-051 clause 5) and `practice_settings`
    // (§20.2b, §22.13) receive it in `013`, which is what closes both phase 3 intermediate
    // exposures. Neither package `003` nor either phase 5 slice may disturb any of the six,
    // and this row-by-row comparison is the mechanical proof that none did.
    //
    // THE SEVEN PHASE 5 TABLES ARE NOW `true`/`true` TOO. They stood `false`/`false` after
    // `P5-I1` and `P5-I2A`, which was the accepted INTERMEDIATE state precisely because
    // neither slice issued a GRANT: a table no runtime role can reach needs no policy. The
    // phase 5 slice of `013_rls_policies` (`P5-I2B`) issues the grants, `ENABLE`, `FORCE` and
    // the ten policies of §29.4 plus the five of §29.4a TOGETHER, inside ONE explicit
    // `BEGIN`/`COMMIT` transaction (§29.4a.0, D-065 `RULING 2`), so no committed state ever
    // exposes a capability without the tenant policy that constrains it (D-049 clause 5).
    //
    // The old exact set — six `true`/`true` plus seven `false`/`false` — is superseded by this
    // one of thirteen `true`/`true` (D-064 `OD-9`). A phase 5 table left `true`/`false`, or
    // any of the six flipped, fails here.
    expect(result.rows).toStrictEqual([
      { relname: 'audit_events', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'encounter_diagnoses', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'encounter_documents', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'encounters', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'idempotency_keys', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'patient_references', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'platform_role_assignments', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_membership_roles', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_memberships', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practice_settings', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'practices', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'storage_objects', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'users', relrowsecurity: true, relforcerowsecurity: true },
    ]);
    expect(result.rows).toHaveLength(13);
  });

  it('given the canonical chain when applied then exactly TWENTY-FIVE policies exist, with their accepted mode, command and roles', async () => {
    const result = await migrator.query<{
      tbl: string;
      polname: string;
      mode: string;
      command: string;
      roles: string;
    }>(
      `select c.relname as tbl,
              p.polname,
              case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
              p.polcmd::text as command,
              (select string_agg(pg_get_userbyid(r), ',' order by pg_get_userbyid(r))
                 from unnest(p.polroles) r) as roles
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by c.relname, p.polname`,
    );

    // THE FIFTEEN POLICIES OF `P5-I2B` COME FIRST in `order by relname, polname`, because
    // every one of their tables sorts before `platform_role_assignments`. The named catalogue
    // of §29.4a.2 is authoritative and the count follows the names, never the reverse: the
    // superseded totals `8` PHI, `18 / 11` and `23` must never reappear as an expected value
    // (D-065 `RULING 1`). `storage_objects` is ABSENT ON PURPOSE with ZERO policies — its
    // `ENABLE` + `FORCE` with no policy is default-deny and is the security control (§29.4).
    //
    // The steady-state contract of these fifteen is owned by `phase5-rls-grants.security.ts`;
    // they are listed here because this assertion is WHOLE-SCHEMA and must stay an exact full
    // set (D-064 `OD-9`).
    expect(result.rows).toStrictEqual([
      {
        tbl: 'audit_events',
        polname: 'audit_events_insert',
        mode: 'PERMISSIVE',
        command: 'a',
        roles: 'copilot_app',
      },
      {
        tbl: 'audit_events',
        polname: 'audit_events_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'encounter_diagnoses',
        polname: 'encounter_diagnoses_insert',
        mode: 'PERMISSIVE',
        command: 'a',
        roles: 'copilot_app',
      },
      {
        tbl: 'encounter_diagnoses',
        polname: 'encounter_diagnoses_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'encounter_documents',
        polname: 'encounter_documents_insert',
        mode: 'PERMISSIVE',
        command: 'a',
        roles: 'copilot_app',
      },
      {
        tbl: 'encounter_documents',
        polname: 'encounter_documents_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      // MANDATORY (D-065 `RULING 1`). It constrains the single-column `archived_at` grant and
      // may never be deleted to make an obsolete policy total add up.
      {
        tbl: 'encounter_documents',
        polname: 'encounter_documents_update',
        mode: 'PERMISSIVE',
        command: 'w',
        roles: 'copilot_app',
      },
      {
        tbl: 'encounters',
        polname: 'encounters_insert',
        mode: 'PERMISSIVE',
        command: 'a',
        roles: 'copilot_app',
      },
      {
        tbl: 'encounters',
        polname: 'encounters_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      // MANDATORY (D-065 `RULING 1`). It constrains the twelve-column `UPDATE` grant of §29.5.
      {
        tbl: 'encounters',
        polname: 'encounters_update',
        mode: 'PERMISSIVE',
        command: 'w',
        roles: 'copilot_app',
      },
      {
        tbl: 'idempotency_keys',
        polname: 'idempotency_keys_insert',
        mode: 'PERMISSIVE',
        command: 'a',
        roles: 'copilot_app',
      },
      {
        tbl: 'idempotency_keys',
        polname: 'idempotency_keys_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'idempotency_keys',
        polname: 'idempotency_keys_update',
        mode: 'PERMISSIVE',
        command: 'w',
        roles: 'copilot_app',
      },
      {
        tbl: 'patient_references',
        polname: 'patient_references_insert',
        mode: 'PERMISSIVE',
        command: 'a',
        roles: 'copilot_app',
      },
      {
        tbl: 'patient_references',
        polname: 'patient_references_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'platform_role_assignments',
        polname: 'platform_role_assignments_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'platform_role_assignments',
        polname: 'platform_role_assignments_system_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_system',
      },
      {
        tbl: 'practice_membership_roles',
        polname: 'practice_membership_roles_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      // The three PHASE 4 policies of package `013`. `practice_memberships` deliberately uses
      // the bootstrap-safe USER-SCOPED pattern rather than the §17.1 tenant pattern, because
      // `set_request_context` determines FROM THIS VERY TABLE whether tenant context may be
      // established at all (§17.3, D-033 clauses 5-6).
      {
        tbl: 'practice_memberships',
        polname: 'practice_memberships_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'practice_settings',
        polname: 'practice_settings_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      // `w` is `FOR UPDATE`; it exists because `013` grants a bounded column-level UPDATE, and
      // D-049 clause 5 forbids that grant to exist without the tenant policy that constrains
      // it. It was the ONLY non-SELECT policy until `P5-I2B` added six INSERT and three
      // UPDATE policies above, each for exactly the same reason.
      {
        tbl: 'practice_settings',
        polname: 'practice_settings_update',
        mode: 'PERMISSIVE',
        command: 'w',
        roles: 'copilot_app',
      },
      // RESTRICTIVE is MANDATORY and NORMATIVE (02 §17.6): restrictive policies combine with
      // AND, so no future permissive policy can OR away the narrowing rule.
      {
        tbl: 'practices',
        polname: 'practices_context_narrow',
        mode: 'RESTRICTIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'practices',
        polname: 'practices_membership_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'users',
        polname: 'users_bootstrap_subject_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
      {
        tbl: 'users',
        polname: 'users_self_select',
        mode: 'PERMISSIVE',
        command: 'r',
        roles: 'copilot_app',
      },
    ]);
    expect(result.rows).toHaveLength(25);
  });

  it('given the catalogue when inspected then EXACTLY TEN policies carry a WITH CHECK expression', async () => {
    // Fifteen of the twenty-five policies are FOR SELECT, where a WITH CHECK expression would
    // mean an unaccounted write path. The other ten are the six phase 5 INSERT policies, the
    // three phase 5 UPDATE policies and `practice_settings_update`. On every UPDATE policy the
    // pairing is NORMATIVE rather than redundant (§17.1): `USING` decides which rows may be
    // updated, while `WITH CHECK` forbids moving a row OUT of the established tenant by
    // rewriting `practice_id`. Omitting it would leave the tenant key movable.
    //
    // The old exact set of ONE is superseded by this one of TEN (D-064 `OD-9`).
    const result = await migrator.query<{ polname: string; withcheck: string }>(
      `select p.polname, pg_get_expr(p.polwithcheck, p.polrelid) as withcheck
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polwithcheck is not null
        order by p.polname`,
    );

    expect(result.rows.map((row) => row.polname)).toStrictEqual([
      'audit_events_insert',
      'encounter_diagnoses_insert',
      'encounter_documents_insert',
      'encounter_documents_update',
      'encounters_insert',
      'encounters_update',
      'idempotency_keys_insert',
      'idempotency_keys_update',
      'patient_references_insert',
      'practice_settings_update',
    ]);

    // On `practice_settings_update` the WITH CHECK predicate is the SAME canonical tenant
    // predicate as the USING one. The same pairing on the three phase 5 UPDATE policies is
    // asserted by `phase5-rls-grants.security.ts`, which owns their contract.
    const using = await policyExpression(migrator, 'practice_settings_update');
    const settings = result.rows.find((row) => row.polname === 'practice_settings_update');
    expect(settings?.withcheck).toBe(using);
    expect(using).toContain("current_setting('app.practice_id'::text, true)");
  });

  it('given the practice_settings SELECT policy when inspected then it is the unweakened §17.1 tenant predicate', async () => {
    // D-053 clause D.11: NO bootstrap exception, NO membership-wide branch, NO `app.user_id`
    // fallback. With `app.practice_id` unset it evaluates to `practice_id = NULL`, which yields
    // zero rows for every practice.
    const expression = await policyExpression(migrator, 'practice_settings_select');

    expect(expression).toContain("current_setting('app.practice_id'::text, true)");
    expect(expression).toContain('practice_id');
    expect(expression).not.toContain('app.user_id');
    expect(expression).not.toContain('practice_memberships');
  });

  it('given the practice_memberships policy when inspected then it is USER-scoped and not tenant-scoped', async () => {
    // §17.3 / D-033 clause 6. A `practice_id = app.practice_id` policy here would be circular:
    // `set_request_context` reads THIS table to decide whether tenant context may be
    // established at all. `app.practice_id` therefore has NO effect on membership visibility.
    //
    // The policy also deliberately does NOT filter `active`: `03` §10 requires an INACTIVE
    // membership to stay visible in the frozen `GET /me` response with `permissions = []`.
    const expression = await policyExpression(migrator, 'practice_memberships_self_select');

    expect(expression).toContain("current_setting('app.user_id'::text, true)");
    expect(expression).toContain('user_id');
    expect(expression).not.toContain('app.practice_id');
    expect(expression).not.toContain('active');
  });

  it('given the users bootstrap policy when inspected then it carries the mandatory app.user_id IS NULL guard', async () => {
    // 02 §17.5 / D-047 clauses 3-4: without this guard, mismatched contexts were empirically
    // shown to expose TWO user rows at once. The guard is normative, not stylistic.
    const expression = await policyExpression(migrator, 'users_bootstrap_subject_select');

    expect(expression).toContain(
      "NULLIF(current_setting('app.user_id'::text, true), ''::text) IS NULL",
    );
    expect(expression).toContain('auth_subject');
  });

  it('given the practices membership policy when inspected then it deliberately does not filter pm.active', async () => {
    // A frozen `GET /me` requires an inactive membership to still show its practice name
    // (02 §17.6). RLS governs visibility here, not authorisation.
    const expression = await policyExpression(migrator, 'practices_membership_select');

    expect(expression).toContain('practice_memberships pm');
    expect(expression).not.toContain('pm.active');
  });

  it('given the membership-role policy when inspected then it compares BOTH practice_id and membership_id', async () => {
    // 02 §17.4: comparing both is what makes a cross-practice leak through somebody else's
    // membership impossible.
    const expression = await policyExpression(migrator, 'practice_membership_roles_self_select');

    expect(expression).toContain('pm.practice_id = practice_membership_roles.practice_id');
    expect(expression).toContain('pm.id = practice_membership_roles.membership_id');
    expect(expression).toContain("current_setting('app.user_id'::text, true)");
    expect(expression).not.toContain('app.practice_id');
  });

  it('given the platform role policy when inspected then it depends on app.user_id alone', async () => {
    // D-051 clause 1: the policy uses NEITHER `app.practice_id`, NOR `set_request_context`,
    // which is precisely why it already works in phase 3.
    const expression = await policyExpression(migrator, 'platform_role_assignments_self_select');

    expect(expression).toContain("current_setting('app.user_id'::text, true)");
    expect(expression).not.toContain('app.practice_id');
  });
});

describe('context functions (02 §16.1, §16.2.2, §16.2.3, §16.2.4)', () => {
  it('given the canonical chain when applied then app_security holds exactly THREE context functions, all SECURITY INVOKER', async () => {
    // Two belong to package `002` and are NOT touched by `013`; `set_request_context` belongs
    // to `013` (§16.2.3, §22.13). All three carry a fixed `search_path` and none is
    // `SECURITY DEFINER` — a `SECURITY DEFINER` variant is a PERMANENTLY REJECTED alternative
    // (D-047 clause 2, D-048 clause 1, D-052 clause B.3).
    const result = await migrator.query<{ proname: string; prosecdef: boolean; config: string }>(
      `select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_security'
        order by p.proname`,
    );

    expect(result.rows).toStrictEqual([
      {
        proname: 'set_auth_subject_context',
        prosecdef: false,
        config: 'search_path=public, pg_temp',
      },
      { proname: 'set_request_context', prosecdef: false, config: 'search_path=public, pg_temp' },
      { proname: 'set_user_context', prosecdef: false, config: 'search_path=public, pg_temp' },
    ]);
    expect(result.rows).toHaveLength(3);
  });

  it('given set_request_context when inspected then PUBLIC holds no EXECUTE and only copilot_app does', async () => {
    // The same least-privilege shape as the two package `002` functions.
    const result = await migrator.query<{
      app: boolean;
      system: boolean;
      everyone: boolean;
    }>(
      `select has_function_privilege('copilot_app', 'app_security.set_request_context(uuid)', 'EXECUTE') as app,
              has_function_privilege('copilot_system', 'app_security.set_request_context(uuid)', 'EXECUTE') as system,
              has_function_privilege('public', 'app_security.set_request_context(uuid)', 'EXECUTE') as everyone`,
    );

    expect(result.rows[0]).toStrictEqual({ app: true, system: false, everyone: false });
  });

  it('given set_request_context when inspected then it derives the user from app.user_id and accepts no user argument', async () => {
    // D-033 clause 9: the function does NOT accept `p_user_id`. A forged user id therefore has
    // nowhere to enter. It reads `practice_memberships` ONLY and requires `active = true`
    // (clauses 11-12), and it does NOT check `practices.status`, which is an APPLICATION-level
    // step of `03` §3.7.1 (D-047 clause 10, D-053 clause C.3).
    const result = await migrator.query<{ args: string; arity: number; body: string }>(
      `select pg_get_function_identity_arguments(p.oid) as args,
              p.pronargs as arity,
              p.prosrc as body
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_security' and p.proname = 'set_request_context'`,
    );

    // EXACTLY ONE argument, and it is the practice — there is no `p_user_id` parameter for a
    // forged user id to enter through.
    expect(result.rows[0]?.arity).toBe(1);
    expect(result.rows[0]?.args).toBe('p_practice_id uuid');

    const body = result.rows[0]?.body ?? '';
    expect(body).toContain("current_setting('app.user_id', true)");
    expect(body).toContain('pm.active = true');
    expect(body).not.toContain('p_user_id');
    expect(body).not.toContain('practices.status');
    expect(body).not.toContain('FROM practices');
    // It reads no role table either (D-038 clauses 20-21).
    expect(body).not.toContain('practice_membership_roles');

    // CLEAR-BEFORE-VALIDATE (D-033 clause 10) — `app.practice_id` is cleared as the FIRST
    // statement, before any validation, so a rejected switch cannot leave the previous tenant
    // scope usable.
    const clearAt = body.indexOf("set_config('app.practice_id', '', true)");
    const validateAt = body.indexOf('practice_memberships');
    expect(clearAt).toBeGreaterThanOrEqual(0);
    expect(validateAt).toBeGreaterThan(clearAt);
  });
});

async function grantedColumns(
  client: Client,
  table: string,
  grantee: string,
  privilege: 'SELECT' | 'UPDATE' = 'SELECT',
): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = $1 and grantee = $2
        and privilege_type = $3
      order by column_name`,
    [table, grantee, privilege],
  );

  return result.rows.map((row) => row.column_name);
}

async function policyExpression(client: Client, policyName: string): Promise<string> {
  const result = await client.query<{ expression: string }>(
    `select pg_get_expr(p.polqual, p.polrelid) as expression
       from pg_policy p where p.polname = $1`,
    [policyName],
  );

  const expression = result.rows[0]?.expression;
  expect(expression).toBeDefined();

  return expression ?? '';
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS } from '../prisma/seed.js';
import {
  connect,
  FOREIGN_KEY_VIOLATION,
  INSUFFICIENT_PRIVILEGE,
  securityDatabase,
  sqlStateOf,
} from './support/phase3-security-context.js';

/**
 * Mechanical verification of migration package `003_patient_encounter_documents` — the phase
 * 5 SCHEMA FOUNDATION (02 §7.1–§7.3, §8.1, §8.2, §22.3, §29.1–§29.8; D-062; D-063; test
 * contract 08 §12.9.3).
 *
 * These are catalogue assertions read straight out of `pg_catalog` and compared against the
 * accepted model EXACTLY. Every set comparison is `toStrictEqual` over a full set, never a
 * containment check: a constraint that is missing, one too many, one renamed or one whose
 * body drifted must all fail here (D-063 clause 8, 08 §12.9.3 item 14a). That prohibition is
 * PERMANENT and applies to every future edit of this file — no assertion below may ever be
 * weakened into `contains` / `subset` / partial matching.
 *
 * THE ZERO-CAPABILITY BOUNDARY OF PACKAGE `003` IS NOW A STATIC PROOF (D-064 `OD-9` part A).
 * Package `003` creates five tables and issues NO grant, NO revoke, NO policy and NO RLS flag
 * (§22.3, D-062 Dio B.3, D-063 clause 2). That was ALSO observable on the live database until
 * sub-gate `P5-I2B` deliberately changed the steady state: the phase 5 slice of
 * `013_rls_policies` is the EXCLUSIVE owner of the security statements for all seven phase 5
 * tenant tables (§29.4a.1), and it issues them.
 *
 * D-064 `OD-9` part A therefore requires the historical claim to be restated in the form that
 * stays true forever — "PACKAGE `003` ITSELF INTRODUCED ZERO RUNTIME CAPABILITY", proven
 * STATICALLY over its own `migration.sql` — rather than "the final live database still has
 * zero capability", which `P5-I2B` intentionally makes false. The static scan at the bottom of
 * this file is that proof and MUST NOT be deleted or weakened. Migration `003` itself is never
 * edited (AGENTS.md §5.1).
 *
 * WHAT THIS FILE OWNS (D-064 `OD-9` part A).
 * The STRUCTURAL CATALOGUE OF PACKAGE `003` — enums, tables, columns, foreign keys, CHECK
 * constraints, unique and index catalogue — plus the static package-boundary proof described
 * above. Its WHOLE-SCHEMA assertions grew from their old exact set to a new exact set twice:
 * once when `P5-I2A` added `idempotency_keys` and `audit_events`, and once when `P5-I2B` moved
 * all thirteen tables to `true`/`true` and the policy total to 25. Both evolutions are
 * explicitly authorised by D-064 `OD-9` and NEITHER is a weakening; `exact` may never become
 * `contains`, `subset` or `partial`. The package `011` contract is asserted by
 * `phase5-package011-catalogue.security.ts`, and the STEADY-STATE security catalogue of
 * `P5-I2B` — grants, policies, predicates, tenant behaviour — belongs to
 * `phase5-rls-grants.security.ts` (D-064 `OD-9` part B).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT PROVE.
 * Package `003` creates `encounters_responsible_physician_membership_fk`. It does NOT prove
 * how that key behaves under `FORCE ROW LEVEL SECURITY`, because no phase 5 table carries
 * RLS yet. The `★` RI-versus-RLS proof — a same-practice co-member assignment SUCCEEDS while
 * a direct `SELECT` of that co-member's `practice_memberships` row still returns ZERO rows,
 * both in ONE transaction under the real runtime roles — belongs to slice `P5-I2` and stays a
 * HARD precondition of `P5-I5` (D-062 Dio D.6, D-063). Nothing here anticipates or discharges
 * it.
 */
const database = securityDatabase();
const apiRoot = resolve(import.meta.dirname, '..');

/** The package `003` migration this file speaks for. It is NEVER edited (AGENTS.md §5.1). */
const PACKAGE_003_MIGRATION = '20260823104252_003_patient_encounter_documents';

/** The five tables package `003` creates, and the only tables this file speaks for. */
const PHASE_5_TABLES = [
  'encounter_diagnoses',
  'encounter_documents',
  'encounters',
  'patient_references',
  'storage_objects',
] as const;

/** The same five as a SQL list literal. Written out so every query names them identically. */
const PHASE_5_TABLE_LIST = PHASE_5_TABLES.map((table) => `'${table}'`).join(', ');

/**
 * The two tables the phase 5 slice of package `011` creates (sub-gate `P5-I2A`).
 *
 * They are NOT package `003`'s and this file asserts no contract of their own for them —
 * `phase5-package011-catalogue.security.ts` owns that. They are named here only because the
 * WHOLE-SCHEMA assertions below must stay exact full-set comparisons (D-064 `OD-9`).
 */
const PACKAGE_011_TABLES = ['audit_events', 'idempotency_keys'] as const;

/** The six tables of packages `002` and `013`, which package `003` must not touch. */
const PHASE_3_AND_4_TABLES = [
  'platform_role_assignments',
  'practice_membership_roles',
  'practice_memberships',
  'practice_settings',
  'practices',
  'users',
] as const;

/**
 * The complete `CHECK` catalogue of package `003` — the authoritative set of §29.7a and
 * D-063 clause 7, ordered by `conname`.
 *
 * TWENTY-THREE constraints: 20 frozen bodies (§7.1, §7.2, §7.3, §8.1, §8.2) plus the three
 * introduced by D-062 Dio E (§2.11.4). Per table: `patient_references` 5, `encounters` 6,
 * `encounter_diagnoses` 0, `storage_objects` 1, `encounter_documents` 8 + 3 = 11. The earlier
 * summary of `18`, and the attribution of `10` to `encounter_documents`, are SUPERSEDED
 * arithmetic errors and must never be used as an expected value (D-063 clause 6).
 *
 * EVERY name is explicit and canonical. The name is part of the contract, not an
 * implementer's choice, so a renamed constraint fails this test exactly like a deleted one.
 */
const EXPECTED_CHECK_CONSTRAINTS = [
  {
    conname: 'encounter_documents_encryption_metadata_check',
    tbl: 'encounter_documents',
    def: "CHECK ((((normalized_text_ciphertext IS NULL) AND (redacted_text_ciphertext IS NULL)) OR (((encryption_algorithm)::text = 'AES-256-GCM'::text) AND (encryption_version >= 1) AND (encryption_key_ref IS NOT NULL) AND (encryption_key_version >= 1))))",
  },
  {
    conname: 'encounter_documents_normalized_text_auth_tag_length_check',
    tbl: 'encounter_documents',
    def: 'CHECK (((normalized_text_auth_tag IS NULL) OR (octet_length(normalized_text_auth_tag) = 16)))',
  },
  {
    conname: 'encounter_documents_normalized_text_envelope_check',
    tbl: 'encounter_documents',
    def: 'CHECK ((((normalized_text_ciphertext IS NULL) AND (normalized_text_iv IS NULL) AND (normalized_text_auth_tag IS NULL)) OR ((normalized_text_ciphertext IS NOT NULL) AND (normalized_text_iv IS NOT NULL) AND (normalized_text_auth_tag IS NOT NULL))))',
  },
  {
    conname: 'encounter_documents_normalized_text_iv_length_check',
    tbl: 'encounter_documents',
    def: 'CHECK (((normalized_text_iv IS NULL) OR (octet_length(normalized_text_iv) = 12)))',
  },
  {
    conname: 'encounter_documents_page_count_check',
    tbl: 'encounter_documents',
    def: 'CHECK (((page_count IS NULL) OR (page_count > 0)))',
  },
  // D-062 Dio E, new #1 — the `processing_status` vocabulary. No `PENDING`, `PROCESSING`,
  // `ARCHIVED` or `SKIPPED` exists; archiving carries `archived_at` (§2.11.1).
  {
    conname: 'encounter_documents_processing_status_check',
    tbl: 'encounter_documents',
    def: "CHECK (((processing_status)::text = ANY ((ARRAY['READY'::character varying, 'FAILED'::character varying])::text[])))",
  },
  // D-062 Dio E, new #3 — the artifact-consistency constraint (D-060 clauses 30 and 32).
  {
    conname: 'encounter_documents_redacted_artifact_consistency_check',
    tbl: 'encounter_documents',
    def: "CHECK (((((redaction_status)::text = 'COMPLETED'::text) AND (redacted_text_ciphertext IS NOT NULL) AND (redacted_text_hash IS NOT NULL)) OR (((redaction_status)::text = 'FAILED'::text) AND (redacted_text_ciphertext IS NULL) AND (redacted_text_hash IS NULL))))",
  },
  {
    conname: 'encounter_documents_redacted_text_auth_tag_length_check',
    tbl: 'encounter_documents',
    def: 'CHECK (((redacted_text_auth_tag IS NULL) OR (octet_length(redacted_text_auth_tag) = 16)))',
  },
  {
    conname: 'encounter_documents_redacted_text_envelope_check',
    tbl: 'encounter_documents',
    def: 'CHECK ((((redacted_text_ciphertext IS NULL) AND (redacted_text_iv IS NULL) AND (redacted_text_auth_tag IS NULL)) OR ((redacted_text_ciphertext IS NOT NULL) AND (redacted_text_iv IS NOT NULL) AND (redacted_text_auth_tag IS NOT NULL))))',
  },
  {
    conname: 'encounter_documents_redacted_text_iv_length_check',
    tbl: 'encounter_documents',
    def: 'CHECK (((redacted_text_iv IS NULL) OR (octet_length(redacted_text_iv) = 12)))',
  },
  // D-062 Dio E, new #2 — the `redaction_status` vocabulary (§2.11.2).
  {
    conname: 'encounter_documents_redaction_status_check',
    tbl: 'encounter_documents',
    def: "CHECK (((redaction_status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'FAILED'::character varying])::text[])))",
  },
  {
    conname: 'encounters_encryption_metadata_check',
    tbl: 'encounters',
    def: "CHECK (((external_encounter_ref_ciphertext IS NULL) OR (((encryption_algorithm)::text = 'AES-256-GCM'::text) AND (encryption_version >= 1) AND (encryption_key_ref IS NOT NULL) AND (encryption_key_version >= 1))))",
  },
  {
    conname: 'encounters_external_encounter_ref_auth_tag_length_check',
    tbl: 'encounters',
    def: 'CHECK (((external_encounter_ref_auth_tag IS NULL) OR (octet_length(external_encounter_ref_auth_tag) = 16)))',
  },
  {
    conname: 'encounters_external_encounter_ref_envelope_check',
    tbl: 'encounters',
    def: 'CHECK ((((external_encounter_ref_ciphertext IS NULL) AND (external_encounter_ref_iv IS NULL) AND (external_encounter_ref_auth_tag IS NULL)) OR ((external_encounter_ref_ciphertext IS NOT NULL) AND (external_encounter_ref_iv IS NOT NULL) AND (external_encounter_ref_auth_tag IS NOT NULL))))',
  },
  {
    conname: 'encounters_external_encounter_ref_iv_length_check',
    tbl: 'encounters',
    def: 'CHECK (((external_encounter_ref_iv IS NULL) OR (octet_length(external_encounter_ref_iv) = 12)))',
  },
  {
    conname: 'encounters_patient_age_check',
    tbl: 'encounters',
    def: 'CHECK (((patient_age_at_encounter IS NULL) OR ((patient_age_at_encounter >= 0) AND (patient_age_at_encounter <= 130))))',
  },
  // D-029 optimistic locking guard, the same rule as `practice_settings_version_check`.
  {
    conname: 'encounters_version_check',
    tbl: 'encounters',
    def: 'CHECK ((version >= 1))',
  },
  {
    conname: 'patient_references_birth_year_check',
    tbl: 'patient_references',
    def: 'CHECK (((birth_year IS NULL) OR ((birth_year >= 1900) AND (birth_year <= 2200))))',
  },
  {
    conname: 'patient_references_encryption_metadata_check',
    tbl: 'patient_references',
    def: "CHECK (((external_patient_ref_ciphertext IS NULL) OR (((encryption_algorithm)::text = 'AES-256-GCM'::text) AND (encryption_version >= 1) AND (encryption_key_ref IS NOT NULL) AND (encryption_key_version >= 1))))",
  },
  {
    conname: 'patient_references_external_patient_ref_auth_tag_length_check',
    tbl: 'patient_references',
    def: 'CHECK (((external_patient_ref_auth_tag IS NULL) OR (octet_length(external_patient_ref_auth_tag) = 16)))',
  },
  {
    conname: 'patient_references_external_patient_ref_envelope_check',
    tbl: 'patient_references',
    def: 'CHECK ((((external_patient_ref_ciphertext IS NULL) AND (external_patient_ref_iv IS NULL) AND (external_patient_ref_auth_tag IS NULL)) OR ((external_patient_ref_ciphertext IS NOT NULL) AND (external_patient_ref_iv IS NOT NULL) AND (external_patient_ref_auth_tag IS NOT NULL))))',
  },
  {
    conname: 'patient_references_external_patient_ref_iv_length_check',
    tbl: 'patient_references',
    def: 'CHECK (((external_patient_ref_iv IS NULL) OR (octet_length(external_patient_ref_iv) = 12)))',
  },
  {
    conname: 'storage_objects_byte_size_check',
    tbl: 'storage_objects',
    def: 'CHECK ((byte_size >= 0))',
  },
] as const;

/**
 * The eight phase 5 foreign keys of §29.2, with their exact definitions.
 *
 * Rows #3, #7 and #8 are the mixed-nullability composite keys. They rely on PostgreSQL's
 * default `MATCH SIMPLE`, which is why no `MATCH` clause appears in the definitions below and
 * why `confmatchtype` is asserted separately: `MATCH FULL` would reject "no responsible
 * physician" and "no storage object" and must NEVER be used here.
 */
const EXPECTED_PHASE_5_FOREIGN_KEYS = [
  {
    conname: 'encounter_diagnoses_encounter_fk',
    tbl: 'encounter_diagnoses',
    def: 'FOREIGN KEY (practice_id, encounter_id) REFERENCES encounters(practice_id, id)',
  },
  {
    conname: 'encounter_documents_encounter_fk',
    tbl: 'encounter_documents',
    def: 'FOREIGN KEY (practice_id, encounter_id) REFERENCES encounters(practice_id, id)',
  },
  {
    conname: 'encounter_documents_source_storage_object_fk',
    tbl: 'encounter_documents',
    def: 'FOREIGN KEY (practice_id, source_storage_object_id) REFERENCES storage_objects(practice_id, id)',
  },
  {
    conname: 'encounter_documents_storage_object_fk',
    tbl: 'encounter_documents',
    def: 'FOREIGN KEY (practice_id, storage_object_id) REFERENCES storage_objects(practice_id, id)',
  },
  {
    conname: 'encounters_patient_reference_fk',
    tbl: 'encounters',
    def: 'FOREIGN KEY (practice_id, patient_reference_id) REFERENCES patient_references(practice_id, id)',
  },
  {
    conname: 'encounters_responsible_physician_membership_fk',
    tbl: 'encounters',
    def: 'FOREIGN KEY (practice_id, responsible_physician_id) REFERENCES practice_memberships(practice_id, user_id)',
  },
  {
    conname: 'patient_references_practice_fk',
    tbl: 'patient_references',
    def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
  },
  {
    conname: 'storage_objects_practice_fk',
    tbl: 'storage_objects',
    def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
  },
] as const;

/** The three mixed-nullability composite keys that MUST stay `MATCH SIMPLE` (§29.2). */
const MATCH_SIMPLE_FOREIGN_KEYS = [
  'encounter_documents_source_storage_object_fk',
  'encounter_documents_storage_object_fk',
  'encounters_responsible_physician_membership_fk',
] as const;

/**
 * Every index on the five new tables, with its exact definition, ordered by name.
 *
 * Nine unique indexes (§29.7 / D-062 Dio B.1) — including `unique (practice_id, id)` on all
 * five, the unconditional tenant constraint of §2.5 — the five primary keys, and the four
 * non-unique indexes of §29.6. No speculative index exists: each of the four has a documented
 * query path in the frozen contract.
 */
const EXPECTED_PHASE_5_INDEXES = [
  'CREATE INDEX documents_encounter_idx ON public.encounter_documents USING btree (practice_id, encounter_id, created_at)',
  'CREATE UNIQUE INDEX encounter_diagnoses_encounter_code_key ON public.encounter_diagnoses USING btree (practice_id, encounter_id, coding_system, diagnosis_code)',
  'CREATE UNIQUE INDEX encounter_diagnoses_pkey ON public.encounter_diagnoses USING btree (id)',
  'CREATE UNIQUE INDEX encounter_diagnoses_tenant_key ON public.encounter_diagnoses USING btree (practice_id, id)',
  'CREATE UNIQUE INDEX encounter_documents_pkey ON public.encounter_documents USING btree (id)',
  'CREATE UNIQUE INDEX encounter_documents_tenant_key ON public.encounter_documents USING btree (practice_id, id)',
  'CREATE INDEX encounters_patient_timeline_idx ON public.encounters USING btree (practice_id, patient_reference_id, treatment_date DESC, id DESC)',
  'CREATE UNIQUE INDEX encounters_pkey ON public.encounters USING btree (id)',
  'CREATE INDEX encounters_responsible_physician_idx ON public.encounters USING btree (practice_id, responsible_physician_id, treatment_date DESC, id DESC)',
  'CREATE INDEX encounters_review_queue_idx ON public.encounters USING btree (practice_id, status, treatment_date DESC, id DESC)',
  'CREATE UNIQUE INDEX encounters_tenant_key ON public.encounters USING btree (practice_id, id)',
  'CREATE UNIQUE INDEX patient_references_pkey ON public.patient_references USING btree (id)',
  'CREATE UNIQUE INDEX patient_references_pseudonym_key ON public.patient_references USING btree (practice_id, pseudonym)',
  'CREATE UNIQUE INDEX patient_references_source_external_ref_key ON public.patient_references USING btree (practice_id, source_system, external_patient_ref_hash)',
  'CREATE UNIQUE INDEX patient_references_tenant_key ON public.patient_references USING btree (practice_id, id)',
  'CREATE UNIQUE INDEX storage_objects_bucket_object_key ON public.storage_objects USING btree (bucket_name, object_key)',
  'CREATE UNIQUE INDEX storage_objects_pkey ON public.storage_objects USING btree (id)',
  'CREATE UNIQUE INDEX storage_objects_tenant_key ON public.storage_objects USING btree (practice_id, id)',
] as const;

/** SQLSTATE `check_violation` — the expected outcome of every CHECK enforcement test. */
const CHECK_VIOLATION = '23514';

let migrator: Client;

/**
 * The REAL runtime role. The constraint-enforcement probes need it because `P5-I2B` puts every
 * phase 5 table under `FORCE ROW LEVEL SECURITY`, which subjects the OWNER to the policies too
 * and leaves it with none it matches (§29.4, D-064 correction B).
 */
let app: Client;

beforeAll(async () => {
  migrator = await connect(database.migration);
  app = await connect(database.app);
});

afterAll(async () => {
  await migrator.end();
  await app.end();
});

describe('package 003 enums (02 §4.3-§4.8, §29.1)', () => {
  it('given package 003 when applied then exactly the eight accepted enums exist with their frozen values', async () => {
    const result = await migrator.query<{ typname: string; values: string }>(
      `select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as values
         from pg_type t
         join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname
        order by t.typname`,
    );

    // Three from package `002`, five from package `003`. Every value set is FROZEN by
    // §4.3-§4.8; a value added, removed, renamed or REORDERED fails here, and order matters
    // because `enumsortorder` is part of the physical type.
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
      { typname: 'platform_role', values: 'SYSTEM_ADMIN' },
      { typname: 'review_state', values: 'UNREVIEWED,CONFIRMED,CORRECTED,REJECTED' },
    ]);
  });

  it('given the document status vocabularies when inspected then they are varchar(30) and NOT enums', async () => {
    // §2.11.4 and D-060 clause 44: converting either column to a PostgreSQL enum is NOT
    // authorised. Their vocabulary is enforced by named CHECK constraints instead.
    const result = await migrator.query<{
      column_name: string;
      data_type: string;
      character_maximum_length: number;
    }>(
      `select column_name, data_type, character_maximum_length
         from information_schema.columns
        where table_schema = 'public' and table_name = 'encounter_documents'
          and column_name in ('processing_status', 'redaction_status')
        order by column_name`,
    );

    expect(result.rows).toStrictEqual([
      {
        column_name: 'processing_status',
        data_type: 'character varying',
        character_maximum_length: 30,
      },
      {
        column_name: 'redaction_status',
        data_type: 'character varying',
        character_maximum_length: 30,
      },
    ]);
  });
});

describe('package 003 tables (02 §7.1-§7.3, §8.1, §8.2, §22.3)', () => {
  it('given package 003 when applied then exactly the thirteen business tables exist', async () => {
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> '_prisma_migrations'
        order by tablename`,
    );

    // Six from packages `002`/`013`, the five of package `003` and the two of the phase 5
    // slice of package `011`, which sub-gate `P5-I2A` added AFTER this package. The old exact
    // set of ELEVEN is superseded by this one (D-064 `OD-9`). `outbox_events` and `async_jobs`
    // are still absent — phase 5 does not create them at all (D-064 `OD-5`).
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
    expect(result.rows).toHaveLength(
      PHASE_5_TABLES.length + PHASE_3_AND_4_TABLES.length + PACKAGE_011_TABLES.length,
    );
  });

  it('given the still-deferred package 011 tables when looked for then none of them exists', async () => {
    // D-064 `OD-5`, made mechanical. Sub-gate `P5-I2A` created `idempotency_keys` and
    // `audit_events`; `outbox_events` and `async_jobs` are the other two §15 tables of the
    // same package and have NO phase 5 consumer, so a table pulled forward from that deferred
    // half must fail here rather than pass silently. This is the same exact-set assertion as
    // before, narrowed to the set that is still deferred — the two that were created are now
    // asserted positively above and in `phase5-package011-catalogue.security.ts`.
    const result = await migrator.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public'
          and tablename in ('outbox_events', 'async_jobs')`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given every phase 5 table when inspected then copilot_migrator owns it and no runtime role does', async () => {
    const result = await migrator.query<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner from pg_tables
        where schemaname = 'public' and tablename in (${PHASE_5_TABLE_LIST})
        order by tablename`,
    );

    expect(result.rows).toStrictEqual(
      PHASE_5_TABLES.map((tablename) => ({ tablename, tableowner: 'copilot_migrator' })),
    );
  });

  it('given the phase 5 tables when inspected then no column carries a UUID default', async () => {
    // §2.2, §26.1: the application generates every identifier before INSERT, because the
    // canonical AAD of the encryption envelope contains `row_id`. `gen_random_uuid()` must
    // appear nowhere.
    const result = await migrator.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in (${PHASE_5_TABLE_LIST})
          and column_default is not null
          and column_default not in ('CURRENT_TIMESTAMP', '1')
        order by table_name, column_name`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given the phase 5 tables when inspected then the deliberately absent columns are absent', async () => {
    // D-062 Dio B.2 and §29.8, made mechanical. Each name below was CONSIDERED and REJECTED;
    // re-introducing any of them silently would reopen a closed decision.
    const result = await migrator.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in (${PHASE_5_TABLE_LIST})
          and column_name in (
            'hmac_key_version', 'external_patient_ref_hash_key_version',
            'raw_text', 'raw_text_ciphertext', 'raw_text_hash', 'source_text_raw_hash',
            'redaction_ruleset_version', 'responsible_physician_display_name',
            'reason'
          )
        order by table_name, column_name`,
    );

    expect(result.rows).toStrictEqual([]);
  });

  it('given encounters when inspected then it carries no archived_at column', async () => {
    // §29.8 / D-062 Dio B.2: `archived_at` belongs to `encounter_documents` and
    // `storage_objects`, never to `encounters`.
    const result = await migrator.query<{ table_name: string }>(
      `select table_name from information_schema.columns
        where table_schema = 'public' and table_name = 'encounters' and column_name = 'archived_at'`,
    );

    expect(result.rows).toStrictEqual([]);
  });
});

describe('CHECK constraint catalogue (02 §29.7a; D-063 clauses 6-8; 08 §12.9.3 item 14a)', () => {
  it('given package 003 when applied then the CHECK catalogue is EXACTLY the accepted 23-row set', async () => {
    // The primary authority is STRICT FULL-SET EQUALITY over `conname` + owning table +
    // `pg_get_constraintdef(oid)` — no surplus, no shortfall, no deviation in name or body.
    // A test that checked only `count = 23` would pass with two constraints swapped, one
    // renamed or one body weakened, and is explicitly INSUFFICIENT (D-063 clause 8).
    const result = await migrator.query<{ conname: string; tbl: string; def: string }>(
      `select con.conname, rel.relname as tbl, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'c'
          and rel.relname in (${PHASE_5_TABLE_LIST})
        order by con.conname`,
    );

    expect(result.rows).toStrictEqual(EXPECTED_CHECK_CONSTRAINTS.map((row) => ({ ...row })));
  });

  it('given the CHECK catalogue when counted then the total is 23, as an ADDITIONAL assertion', async () => {
    // Permitted as an extra assertion, never as the primary one. `18` is a superseded
    // arithmetic error and must never appear as an expected value (D-063 clause 6).
    const result = await migrator.query<{ total: string }>(
      `select count(*)::text as total
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'c'
          and rel.relname in (${PHASE_5_TABLE_LIST})`,
    );

    expect(result.rows[0]?.total).toBe('23');
    expect(EXPECTED_CHECK_CONSTRAINTS).toHaveLength(23);
  });

  it('given the CHECK catalogue when grouped then the per-table distribution is 5 / 6 / 0 / 1 / 11', async () => {
    const result = await migrator.query<{ tbl: string; total: string }>(
      `select rel.relname as tbl, count(*)::text as total
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'c'
          and rel.relname in (${PHASE_5_TABLE_LIST})
        group by rel.relname
        order by rel.relname`,
    );

    // `encounter_diagnoses` is ABSENT from this result on purpose: it carries no CHECK at
    // all, and that is a RATIFIED ABSENCE, not an omission (§7.3, §29.7a).
    expect(result.rows).toStrictEqual([
      { tbl: 'encounter_documents', total: '11' },
      { tbl: 'encounters', total: '6' },
      { tbl: 'patient_references', total: '5' },
      { tbl: 'storage_objects', total: '1' },
    ]);
  });

  it('given every phase 5 CHECK when inspected then it carries an explicit canonical name', async () => {
    // 12 §8 and D-063 clause 7: the name is part of the contract, never an implementer's
    // choice. The rule is read back out of the catalogue rather than off the expected array,
    // so an auto-named constraint fails here even if someone also edited the array to match.
    const result = await migrator.query<{ conname: string; tbl: string }>(
      `select con.conname, rel.relname as tbl
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'c'
          and rel.relname in (${PHASE_5_TABLE_LIST})
        order by con.conname`,
    );

    expect(result.rows).toHaveLength(23);
    for (const constraint of result.rows) {
      expect(constraint.conname).toMatch(/^[a-z0-9_]+_check$/);
      expect(constraint.conname.startsWith(`${constraint.tbl}_`)).toBe(true);
    }
  });
});

describe('foreign key catalogue (02 §29.2, §29.3; 08 §12.9.3 items 10, 11)', () => {
  it('given package 003 when applied then exactly FIFTEEN foreign keys exist', async () => {
    // Five from package `002`, the eight of §29.2 — four canonically declared and four newly
    // declared by D-062 Dio C — and the two of §29.9.1, added AFTER this package by the phase
    // 5 slice of `011` (D-064 `OD-4`). The old exact set of THIRTEEN is superseded by this one
    // (D-064 `OD-9`); the eight this file speaks for are asserted separately below.
    const result = await migrator.query<{ conname: string }>(
      `select con.conname
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
        order by con.conname`,
    );

    expect(result.rows.map((row) => row.conname)).toStrictEqual([
      'audit_events_practice_fk',
      'encounter_diagnoses_encounter_fk',
      'encounter_documents_encounter_fk',
      'encounter_documents_source_storage_object_fk',
      'encounter_documents_storage_object_fk',
      'encounters_patient_reference_fk',
      'encounters_responsible_physician_membership_fk',
      'idempotency_keys_practice_fk',
      'patient_references_practice_fk',
      'platform_role_assignments_user_fk',
      'practice_membership_roles_membership_fk',
      'practice_memberships_practice_fk',
      'practice_memberships_user_fk',
      'practice_settings_practice_fk',
      'storage_objects_practice_fk',
    ]);
    expect(result.rows).toHaveLength(15);
  });

  it('given EVERY foreign key when inspected then ON DELETE and ON UPDATE are NO ACTION', async () => {
    // §29.2 / D-062 Dio C.3. `CASCADE` is rejected in every position: phase 5 grants no
    // DELETE capability at all, so it has no legitimate trigger and exactly one destructive
    // one — a single stray statement erasing a whole tenant's encounters, diagnoses and
    // documents. `SET NULL` is impossible over NOT NULL keys. This must hold for all
    // fifteen, not only the eight this package declares.
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

    expect(result.rows).toHaveLength(15);
    for (const row of result.rows) {
      expect(row.confdeltype).toBe('a');
      expect(row.confupdtype).toBe('a');
    }
  });

  it('given the eight phase 5 foreign keys when inspected then each has its accepted definition', async () => {
    const result = await migrator.query<{ conname: string; tbl: string; def: string }>(
      `select con.conname, rel.relname as tbl, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
          and rel.relname in (${PHASE_5_TABLE_LIST})
        order by con.conname`,
    );

    expect(result.rows).toStrictEqual(EXPECTED_PHASE_5_FOREIGN_KEYS.map((row) => ({ ...row })));
  });

  it('given the three nullable composite keys when inspected then each is MATCH SIMPLE and never MATCH FULL', async () => {
    // §29.2 / D-062 Dio C.2: `practice_id` is NOT NULL while the second column is nullable,
    // so under MATCH SIMPLE the constraint is satisfied whenever that column is NULL. That is
    // exactly what lets "no responsible physician" and "no storage object" exist. MATCH FULL
    // ('f') would reject both and must never appear.
    const result = await migrator.query<{ conname: string; confmatchtype: string }>(
      `select con.conname, con.confmatchtype
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
        order by con.conname`,
    );

    const matchTypes = new Map(result.rows.map((row) => [row.conname, row.confmatchtype]));

    for (const conname of MATCH_SIMPLE_FOREIGN_KEYS) {
      expect(matchTypes.get(conname)).toBe('s');
    }

    // No foreign key anywhere in the schema is MATCH FULL or MATCH PARTIAL.
    expect(result.rows.filter((row) => row.confmatchtype !== 's')).toStrictEqual([]);
  });

  it('given the deliberately undeclared relations when looked for then none of them exists', async () => {
    // §29.2: `encounters (practice_id) -> practices` is carried transitively;
    // `created_by`/`updated_by` -> `users` are application invariants, not foreign keys; and
    // `responsible_physician_id -> users (id)` is unnecessary because membership already
    // guarantees the user exists. Each would widen the accepted constraint set.
    const result = await migrator.query<{ conname: string; def: string }>(
      `select con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and con.contype = 'f'
          and rel.relname in (${PHASE_5_TABLE_LIST})
          and (pg_get_constraintdef(con.oid) like '%REFERENCES users(%'
               or (rel.relname = 'encounters' and pg_get_constraintdef(con.oid) like '%REFERENCES practices(%'))
        order by con.conname`,
    );

    expect(result.rows).toStrictEqual([]);
  });
});

describe('unique and index catalogue (02 §2.5, §29.6; 08 §12.9.3 items 13, 16)', () => {
  it('given package 003 when applied then the phase 5 index set is EXACTLY the accepted one', async () => {
    const result = await migrator.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename in (${PHASE_5_TABLE_LIST})
        order by indexname`,
    );

    expect(result.rows.map((row) => row.indexdef)).toStrictEqual([...EXPECTED_PHASE_5_INDEXES]);
  });

  it('given the three encounter indexes when inspected then each carries the DESC tie-breakers', async () => {
    // §29.6 / D-062 Dio J: `id desc` is MANDATORY on all three. Without it the tail of the
    // sort is unstable and cursor pagination breaks (03 §7). `treatment_date desc` is the
    // primary ordering of every documented query path.
    const result = await migrator.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'encounters' and indexname like '%_idx'
        order by indexname`,
    );

    expect(result.rows.map((row) => row.indexname)).toStrictEqual([
      'encounters_patient_timeline_idx',
      'encounters_responsible_physician_idx',
      'encounters_review_queue_idx',
    ]);

    for (const row of result.rows) {
      expect(row.indexdef).toContain('treatment_date DESC, id DESC');
    }
  });

  it('given all five phase 5 tables when inspected then each carries the unconditional unique (practice_id, id)', async () => {
    // §2.5 / D-022, unconditional. TEN of thirty tenant tables now carry it: three from
    // package `002`, the five of package `003` (08 §12.9.3 item 13) and the two of the phase 5
    // slice of `011`. The query is WHOLE-SCHEMA, so the old exact set of EIGHT is superseded
    // by this one (D-064 `OD-9`).
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
    expect(result.rows).toHaveLength(10);
  });
});

describe('the package 003 privilege surface after P5-I2B (02 §29.5; D-064 `OD-1`, `OD-9`)', () => {
  it('given the five phase 5 tables then the table-level grant set is EXACTLY the P5-I2B one', async () => {
    // `copilot_migrator` is excluded because it is the table OWNER and holds every privilege
    // by definition. The old exact set was EMPTY, which was correct while package `003` was
    // the last word on these tables; the phase 5 slice of `013_rls_policies` deliberately
    // replaces it with the surface of §29.5 (D-064 `OD-9`).
    //
    // `copilot_system` and `PUBLIC` still hold NOTHING — that half of the boundary is
    // permanent (D-023) — and `storage_objects` is ABSENT ENTIRELY, because it receives zero
    // capability by design and keeps `ENABLE` + `FORCE` with no policy as default-deny.
    const result = await migrator.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name in (${PHASE_5_TABLE_LIST})
          and grantee <> 'copilot_migrator'
        order by table_name, grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'encounter_diagnoses', grantee: 'copilot_app', privilege_type: 'INSERT' },
      { table_name: 'encounter_diagnoses', grantee: 'copilot_app', privilege_type: 'SELECT' },
      { table_name: 'encounter_documents', grantee: 'copilot_app', privilege_type: 'INSERT' },
      { table_name: 'encounter_documents', grantee: 'copilot_app', privilege_type: 'SELECT' },
      { table_name: 'encounters', grantee: 'copilot_app', privilege_type: 'INSERT' },
      { table_name: 'encounters', grantee: 'copilot_app', privilege_type: 'SELECT' },
      { table_name: 'patient_references', grantee: 'copilot_app', privilege_type: 'INSERT' },
      { table_name: 'patient_references', grantee: 'copilot_app', privilege_type: 'SELECT' },
    ]);
  });

  it('given the five phase 5 tables then the only column-level UPDATE is encounters and archived_at', async () => {
    // Column-level grants are the other half of the surface: a column grant does not appear
    // in `role_table_grants`, so it has to be asserted separately (§20.2b). NO TABLE-LEVEL
    // `UPDATE` EXISTS on any of the five, which is what makes this list the whole truth about
    // what may be written into an existing row. The exact column lists are owned by
    // `phase5-rls-grants.security.ts`; asserted here is only that no OTHER table and no other
    // privilege joined them.
    const result = await migrator.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select distinct table_name, grantee, privilege_type
         from information_schema.role_column_grants
        where table_schema = 'public' and table_name in (${PHASE_5_TABLE_LIST})
          and grantee <> 'copilot_migrator' and privilege_type = 'UPDATE'
        order by table_name, grantee, privilege_type`,
    );

    expect(result.rows).toStrictEqual([
      { table_name: 'encounter_documents', grantee: 'copilot_app', privilege_type: 'UPDATE' },
      { table_name: 'encounters', grantee: 'copilot_app', privilege_type: 'UPDATE' },
    ]);
  });

  it('given copilot_app, copilot_system and PUBLIC when probed then only the §29.5 surface is held', async () => {
    // `has_table_privilege` is asked directly, so an inherited or implicit privilege that
    // never materialises as an `information_schema` row also fails. It reports TABLE-LEVEL
    // privilege only, so `UPDATE` is `false` even on `encounters` and `encounter_documents`:
    // their `UPDATE` is column-level, which is precisely the narrowing §29.5 requires.
    //
    // `copilot_system` and `PUBLIC` hold NOTHING ANYWHERE — permanent (D-023) — and
    // `storage_objects` holds nothing for anyone.
    const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'];
    const grantees = ['copilot_app', 'copilot_system', 'public'];
    const granted = new Set([
      'patient_references|copilot_app|SELECT',
      'patient_references|copilot_app|INSERT',
      'encounters|copilot_app|SELECT',
      'encounters|copilot_app|INSERT',
      'encounter_diagnoses|copilot_app|SELECT',
      'encounter_diagnoses|copilot_app|INSERT',
      'encounter_documents|copilot_app|SELECT',
      'encounter_documents|copilot_app|INSERT',
    ]);

    for (const table of PHASE_5_TABLES) {
      for (const grantee of grantees) {
        for (const privilege of privileges) {
          const result = await migrator.query<{ held: boolean }>(
            'select has_table_privilege($1, $2, $3) as held',
            [grantee, table, privilege],
          );

          expect({ table, grantee, privilege, held: result.rows[0]?.held }).toStrictEqual({
            table,
            grantee,
            privilege,
            held: granted.has(`${table}|${grantee}|${privilege}`),
          });
        }
      }
    }
  });

  it('given the five phase 5 tables then EXACTLY the TEN §29.4 policies exist on them', async () => {
    // Package `003` creates no policy of its own. The TEN policies of §29.4 — not eight; the
    // named catalogue controls and `8` is superseded arithmetic (D-065 `RULING 1`) — belong to
    // the phase 5 slice of `013_rls_policies`, created in the SAME transaction as the grants
    // they restrict (D-049 clause 5).
    //
    // `storage_objects` contributes ZERO and is absent from this list ON PURPOSE: `ENABLE` +
    // `FORCE` with no policy is default-deny, and adding one would reopen a ratified decision.
    const result = await migrator.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname = 'public' and tablename in (${PHASE_5_TABLE_LIST})
        order by tablename, policyname`,
    );

    expect(result.rows).toStrictEqual([
      { tablename: 'encounter_diagnoses', policyname: 'encounter_diagnoses_insert' },
      { tablename: 'encounter_diagnoses', policyname: 'encounter_diagnoses_select' },
      { tablename: 'encounter_documents', policyname: 'encounter_documents_insert' },
      { tablename: 'encounter_documents', policyname: 'encounter_documents_select' },
      { tablename: 'encounter_documents', policyname: 'encounter_documents_update' },
      { tablename: 'encounters', policyname: 'encounters_insert' },
      { tablename: 'encounters', policyname: 'encounters_select' },
      { tablename: 'encounters', policyname: 'encounters_update' },
      { tablename: 'patient_references', policyname: 'patient_references_insert' },
      { tablename: 'patient_references', policyname: 'patient_references_select' },
    ]);
    expect(result.rows).toHaveLength(10);
  });

  it('given the whole schema when inspected then ALL THIRTEEN tables force RLS after P5-I2B', async () => {
    // THE STEADY STATE, MODELLED EXACTLY. The five package `003` tables and the two of the
    // phase 5 slice of `011` stood `false`/`false` through `P5-I1` and `P5-I2A`, which was the
    // INTENDED intermediate state: neither slice issued a GRANT, so no runtime role could
    // reach any of them and there was nothing for a policy to restrict. Pulling the security
    // half forward would have granted capability outside the transaction that restricts it,
    // which is precisely what D-049 clause 5 forbids.
    //
    // `P5-I2B` — the phase 5 slice of `013_rls_policies` — issues the grants, `ENABLE`,
    // `FORCE` and all fifteen policies TOGETHER, inside ONE explicit `BEGIN`/`COMMIT`
    // transaction (§29.4a.0, D-065 `RULING 2`). This query is WHOLE-SCHEMA, so its old exact
    // set — six `true`/`true` plus seven `false`/`false` — is superseded by this one of
    // thirteen `true`/`true` (D-064 `OD-9`). That is an old-exact-set -> new-exact-set
    // replacement, never a broadening.
    //
    // The six phase 3/4 tables are asserted to have KEPT `true`/`true`. No phase 5 slice may
    // disturb them, and this row-by-row comparison is the mechanical proof that none did.
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
      // `ENABLE` + `FORCE` with ZERO policies and ZERO grants — deliberate default-deny, not
      // an oversight (§29.5, D-065 `RULING 1`).
      { relname: 'storage_objects', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'users', relrowsecurity: true, relforcerowsecurity: true },
    ]);
    expect(result.rows).toHaveLength(13);
  });

  it('given schema public when inspected then no DEFAULT PRIVILEGE could have pre-granted the new tables', async () => {
    // This is what makes "no GRANT statement" equal to "no capability". Migration `001`
    // asserts it; repeating it after package `003` proves the package did not introduce one
    // (02 §20, D-062 Dio B.3).
    const result = await migrator.query<{ total: string }>(
      'select count(*)::text as total from pg_default_acl',
    );

    expect(result.rows[0]?.total).toBe('0');
  });

  it('given the runtime roles when inspected then neither may create objects in schema public', async () => {
    const result = await migrator.query<{ app_create: boolean; system_create: boolean }>(
      `select has_schema_privilege('copilot_app', 'public', 'CREATE') as app_create,
              has_schema_privilege('copilot_system', 'public', 'CREATE') as system_create`,
    );

    expect(result.rows[0]).toStrictEqual({ app_create: false, system_create: false });
  });
});

describe('no existing-object drift (D-062 Dio B.4; D-063 clause 2)', () => {
  it('given practice_memberships when inspected then package 003 added no constraint and no index', async () => {
    // D-061 clause 11 and E.3, made mechanical. The responsible-physician key is created ON
    // `encounters`; its parent key `practice_memberships_practice_user_key` has existed since
    // package `002`. A new index or constraint here would be exactly the silent widening the
    // decision forbids.
    const constraints = await migrator.query<{ conname: string; def: string }>(
      `select con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname = 'practice_memberships'
        order by con.conname`,
    );

    expect(constraints.rows).toStrictEqual([
      { conname: 'practice_memberships_pkey', def: 'PRIMARY KEY (id)' },
      {
        conname: 'practice_memberships_practice_fk',
        def: 'FOREIGN KEY (practice_id) REFERENCES practices(id)',
      },
      {
        conname: 'practice_memberships_user_fk',
        def: 'FOREIGN KEY (user_id) REFERENCES users(id)',
      },
    ]);

    const indexes = await migrator.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'practice_memberships'
        order by indexname`,
    );

    expect(indexes.rows.map((row) => row.indexname)).toStrictEqual([
      'practice_memberships_pkey',
      'practice_memberships_practice_user_key',
      'practice_memberships_tenant_key',
      'practice_memberships_user_active_idx',
    ]);
  });

  it('given practice_memberships when inspected then its policy and its grant are unchanged', async () => {
    // D-062 Dio B.4: NO change to any policy or grant on `practice_memberships`.
    // `practice_memberships_self_select` stays byte-identical to its phase 4 body.
    const policies = await migrator.query<{ policyname: string; qual: string }>(
      `select policyname, qual from pg_policies
        where schemaname = 'public' and tablename = 'practice_memberships'
        order by policyname`,
    );

    expect(policies.rows).toStrictEqual([
      {
        policyname: 'practice_memberships_self_select',
        qual: "(user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)",
      },
    ]);

    const grants = await migrator.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'practice_memberships'
          and grantee <> 'copilot_migrator'
        order by grantee, privilege_type`,
    );

    expect(grants.rows).toStrictEqual([{ grantee: 'copilot_app', privilege_type: 'SELECT' }]);
  });

  it('given the whole schema when inspected then exactly TWENTY-FIVE policies exist', async () => {
    // Package `003` adds none of its own; the fifteen new rows belong to `P5-I2B` and their
    // contract is owned by `phase5-rls-grants.security.ts`. `users` still carries exactly two
    // (D-062 Dio B.4), and the old exact per-table set of six rows is superseded by this one
    // of twelve (D-064 `OD-9`). `storage_objects` is ABSENT with zero policies, by design.
    //
    // `23` and `18` are superseded arithmetic and must never reappear as an expected value
    // (D-065 `RULING 1`).
    const result = await migrator.query<{ tablename: string; total: string }>(
      `select tablename, count(*)::text as total from pg_policies
        where schemaname = 'public'
        group by tablename
        order by tablename`,
    );

    expect(result.rows).toStrictEqual([
      { tablename: 'audit_events', total: '2' },
      { tablename: 'encounter_diagnoses', total: '2' },
      { tablename: 'encounter_documents', total: '3' },
      { tablename: 'encounters', total: '3' },
      { tablename: 'idempotency_keys', total: '3' },
      { tablename: 'patient_references', total: '2' },
      { tablename: 'platform_role_assignments', total: '2' },
      { tablename: 'practice_membership_roles', total: '1' },
      { tablename: 'practice_memberships', total: '1' },
      { tablename: 'practice_settings', total: '2' },
      { tablename: 'practices', total: '2' },
      { tablename: 'users', total: '2' },
    ]);

    const total = await migrator.query<{ total: string }>(
      `select count(*)::text as total from pg_policies where schemaname = 'public'`,
    );

    expect(total.rows[0]?.total).toBe('25');
  });

  it('given the cluster when inspected then package 003 introduced no role and no BYPASSRLS', async () => {
    const result = await migrator.query<{ rolname: string; rolbypassrls: boolean }>(
      `select rolname, rolbypassrls from pg_roles
        where rolname like 'copilot%'
        order by rolname`,
    );

    expect(result.rows).toStrictEqual([
      { rolname: 'copilot_app', rolbypassrls: false },
      { rolname: 'copilot_migrator', rolbypassrls: false },
      { rolname: 'copilot_system', rolbypassrls: false },
    ]);
  });

  it('given schema app_security when inspected then no SECURITY DEFINER function exists and no trigger was added', async () => {
    const functions = await migrator.query<{ proname: string; prosecdef: boolean }>(
      `select p.proname, p.prosecdef
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app_security', 'public')
        order by p.proname`,
    );

    expect(functions.rows.filter((row) => row.prosecdef)).toStrictEqual([]);
    expect(functions.rows.map((row) => row.proname)).toStrictEqual([
      'set_auth_subject_context',
      'set_request_context',
      'set_user_context',
    ]);

    const triggers = await migrator.query<{ tgname: string }>(
      `select t.tgname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by t.tgname`,
    );

    // The three AAD immutability triggers of §19.3 belong to the phase 5 slice of
    // `014_immutability_triggers`, not to this package.
    expect(triggers.rows).toStrictEqual([]);
  });
});

describe('constraint enforcement (08 §12.9.3 items 12, 14, 15)', () => {
  // These specs prove the constraints REFUSE, not merely that they exist. Every statement
  // runs inside a transaction that is always rolled back. No row survives any spec, and no
  // PHI-shaped value is used: every literal below is obviously synthetic.
  //
  // THE IDENTITY CHANGED WITH `P5-I2B`, AND THE PROOF GOT STRONGER, NOT WEAKER.
  // These probes previously ran as `copilot_migrator`, which was then the only identity that
  // could reach these tables at all. Sub-gate `P5-I2B` puts all five under `FORCE ROW LEVEL
  // SECURITY`, so THE OWNER IS ITSELF SUBJECT TO THE POLICIES and holds no applicable one —
  // an owner INSERT is now refused by RLS before any CHECK or foreign key is ever evaluated.
  //
  // The canonical response is NOT to weaken the security model. An owner policy, a fourth
  // role, `BYPASSRLS` and an extension of the §23.4 maintenance allowlist to a phase 5 table
  // are ALL PERMANENTLY FORBIDDEN (D-064, D-062 Dio K, §23.4.4b). The probes therefore run as
  // the REAL RUNTIME ROLE `copilot_app`, inside a real tenant context — which is the identity
  // that will actually meet these constraints in production, so the proof is strictly better
  // than the one it replaces.
  //
  // THIS IS NOT THE `★` PROOF AND MUST NEVER BE READ AS ONE. `★` requires a co-member
  // responsible-physician assignment to SUCCEED **while a direct `SELECT` of that same
  // `practice_memberships` row returns ZERO ROWS**, both established in one transaction and
  // presented together (D-064, `★` hard stop). The second half is deliberately NOT asserted
  // anywhere in this file. `★` stays undischarged, belongs to the dedicated `P5-I2V` gate
  // after `P5-I2C`, and remains a HARD precondition of `P5-I5`.
  const patientReferenceId = '77777777-7777-4777-8777-777777777001';
  const encounterId = '77777777-7777-4777-8777-777777777002';
  const storageObjectId = '77777777-7777-4777-8777-777777777003';
  const documentId = '77777777-7777-4777-8777-777777777004';

  /** Establishes the tenant context of `practiceId` for the statements that follow. */
  const enterTenant = (practiceId: string): string =>
    `select set_config('app.practice_id', '${practiceId}', true)`;

  /**
   * Runs `statement` as the REAL `copilot_app` role inside a rolled-back transaction and
   * returns the SQLSTATE, or `undefined` when it succeeded.
   *
   * `app.practice_id` is set with `set_config` directly, which §25.1.1 permits for policy
   * verification: what is under test here is the CHECK or the foreign key, not the admission
   * path that establishes the GUC.
   */
  const appSqlState = async (statement: string): Promise<string | undefined> =>
    sqlStateOf(app, `${enterTenant(PHASE_3_SEED_IDS.practiceDemo)}; ${statement}`);

  const insertPatientReference = (practiceId: string): string =>
    `${enterTenant(practiceId)};
     insert into patient_references
       (id, practice_id, source_system, external_patient_ref_hash, pseudonym, updated_at)
     values ('${patientReferenceId}', '${practiceId}', 'MANUAL', 'h1.${'0'.repeat(64)}',
             'P-TESTTESTAA', current_timestamp)`;

  const insertEncounter = (
    practiceId: string,
    responsiblePhysicianId: string | null,
    referencePracticeId = practiceId,
  ): string =>
    `${insertPatientReference(referencePracticeId)};
     ${enterTenant(practiceId)};
     insert into encounters
       (id, practice_id, patient_reference_id, occurred_at, treatment_date,
        responsible_physician_id, status, source_system, created_by, updated_at)
     values ('${encounterId}', '${practiceId}', '${patientReferenceId}',
             current_timestamp, current_date,
             ${responsiblePhysicianId === null ? 'null' : `'${responsiblePhysicianId}'`},
             'DRAFT', 'MANUAL', '${PHASE_3_SEED_IDS.userPracticeAdmin}', current_timestamp)`;

  const insertDocument = (
    processingStatus: string,
    redactionStatus: string,
    withRedactedArtifact: boolean,
  ): string =>
    `${insertEncounter(PHASE_3_SEED_IDS.practiceDemo, null)};
     insert into encounter_documents
       (id, practice_id, encounter_id, document_type, source,
        redacted_text_ciphertext, redacted_text_iv, redacted_text_auth_tag, redacted_text_hash,
        encryption_algorithm, encryption_version, encryption_key_ref, encryption_key_version,
        processing_status, redaction_status, created_by)
     values ('${documentId}', '${PHASE_3_SEED_IDS.practiceDemo}', '${encounterId}',
             'CONSULTATION_NOTE', 'MANUAL_TEXT',
             ${
               withRedactedArtifact
                 ? `decode('00', 'hex'), decode('${'00'.repeat(12)}', 'hex'), decode('${'00'.repeat(16)}', 'hex'), '${'a'.repeat(64)}',
                    'AES-256-GCM', 1, 'test-key', 1,`
                 : 'null, null, null, null, null, null, null, null,'
             }
             '${processingStatus}', '${redactionStatus}', '${PHASE_3_SEED_IDS.userPracticeAdmin}')`;

  it('given a cross-tenant encounter when inserted then the composite foreign key refuses it AT THE DATABASE', async () => {
    // 08 §12.9.3 item 12: "Encounter A -> Patient B" must fail in PostgreSQL, not in
    // application validation. The patient reference is created in `demo`, the encounter in
    // `nord`; the composite parent key `(practice_id, id)` therefore has no matching row.
    //
    // The tenant context moves with the row, so the encounter's own `WITH CHECK` is SATISFIED
    // — this proves the FOREIGN KEY refuses the row, not the policy. Under `P5-I2B` a
    // cross-tenant write is rejected TWICE OVER by two independent mechanisms, and this spec
    // isolates the second one; the RLS half is proven separately in
    // `phase5-rls-grants.security.ts`.
    const state = await sqlStateOf(
      app,
      insertEncounter(PHASE_3_SEED_IDS.practiceNord, null, PHASE_3_SEED_IDS.practiceDemo),
    );

    expect(state).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('given a same-tenant encounter when inserted then the composite foreign key accepts it', async () => {
    const state = await sqlStateOf(app, insertEncounter(PHASE_3_SEED_IDS.practiceDemo, null));

    expect(state).toBeUndefined();
  });

  it('given a responsible physician who is not a member of the practice then the key refuses the row', async () => {
    // D-062 Dio D, database half. `userPhysician` holds a membership in `nord` only, so
    // assigning them in `demo` has no parent row in
    // `practice_memberships (practice_id, user_id)`.
    const state = await sqlStateOf(
      app,
      insertEncounter(PHASE_3_SEED_IDS.practiceDemo, PHASE_3_SEED_IDS.userPhysician),
    );

    expect(state).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('given a responsible physician who IS a member of the practice then the key accepts the row', async () => {
    // The positive half of the same invariant, and NOTHING MORE.
    //
    // THIS IS NOT THE `★` PROOF. `★` requires this INSERT to succeed **and** a direct `SELECT`
    // of that same `practice_memberships` row to return ZERO ROWS, both in one transaction and
    // presented together as the RI-versus-RLS finding (D-064, `★` hard stop). The second half
    // is deliberately absent here and is asserted nowhere in this gate. `★` belongs to the
    // dedicated `P5-I2V` gate after `P5-I2C` and stays a HARD precondition of `P5-I5`.
    const state = await sqlStateOf(
      app,
      insertEncounter(PHASE_3_SEED_IDS.practiceDemo, PHASE_3_SEED_IDS.userPracticeAdmin),
    );

    expect(state).toBeUndefined();
  });

  it('given a NULL responsible physician then MATCH SIMPLE lets the row through unchecked', async () => {
    // §29.2 / D-062 Dio C.2: this is the behaviour MATCH FULL would destroy.
    const state = await sqlStateOf(app, insertEncounter(PHASE_3_SEED_IDS.practiceDemo, null));

    expect(state).toBeUndefined();
  });

  it.each([
    ['PENDING', 'a value D-060 explicitly excluded'],
    ['PROCESSING', 'a value D-060 explicitly excluded'],
    ['ARCHIVED', 'a value D-060 explicitly excluded — archiving carries archived_at'],
    ['SKIPPED', 'a value D-060 explicitly excluded'],
  ])('given processing_status = %s (%s) then the CHECK refuses it', async (processingStatus) => {
    const state = await appSqlState(insertDocument(processingStatus, 'FAILED', false));

    expect(state).toBe(CHECK_VIOLATION);
  });

  it.each([['PENDING'], ['SKIPPED'], ['READY']])(
    'given redaction_status = %s then the CHECK refuses it',
    async (redactionStatus) => {
      const state = await appSqlState(insertDocument('READY', redactionStatus, false));

      expect(state).toBe(CHECK_VIOLATION);
    },
  );

  it('given redaction_status = COMPLETED without a redacted artifact then the CHECK refuses it', async () => {
    const state = await appSqlState(insertDocument('READY', 'COMPLETED', false));

    expect(state).toBe(CHECK_VIOLATION);
  });

  it('given redaction_status = FAILED WITH a redacted artifact then the CHECK refuses it', async () => {
    const state = await appSqlState(insertDocument('READY', 'FAILED', true));

    expect(state).toBe(CHECK_VIOLATION);
  });

  it('given the impossible FAILED / COMPLETED combination then it is refused', async () => {
    // D-062 Dio E.2: redaction operates on the normalised artifact and cannot succeed over an
    // unusable source. The database-checkable half of that is the artifact-consistency CHECK;
    // the domain layer must not construct the combination either.
    const state = await appSqlState(insertDocument('FAILED', 'COMPLETED', false));

    expect(state).toBe(CHECK_VIOLATION);
  });

  it('given the two accepted status combinations then they are allowed', async () => {
    expect(await appSqlState(insertDocument('READY', 'FAILED', false))).toBeUndefined();
    expect(await appSqlState(insertDocument('READY', 'COMPLETED', true))).toBeUndefined();
  });

  it('given storage_objects then its byte-size CHECK is proven from the catalogue, because no identity may insert', async () => {
    // THE ONE PROBE `P5-I2B` MAKES UNEXECUTABLE, AND WHY THAT IS THE INTENDED OUTCOME.
    //
    // `storage_objects` is the ONLY phase 5 table that receives ZERO capability: no grant of
    // any kind for any runtime role, `ENABLE` + `FORCE ROW LEVEL SECURITY`, and ZERO policies
    // (§29.5, §29.4, D-065 `RULING 1`). It exists because it is the foreign-key parent of
    // `encounter_documents`; no phase 5 route reads or writes it. It is therefore
    // DEFAULT-DENY-UNREACHABLE BY DESIGN — `copilot_app` is refused on privilege and
    // `copilot_migrator` is refused by FORCE RLS with no applicable policy.
    //
    // Restoring a row-level probe would require an owner policy, a fourth role, `BYPASSRLS`,
    // or extending the §23.4 maintenance allowlist to a phase 5 table. ALL FOUR ARE
    // PERMANENTLY FORBIDDEN (D-064; D-062 Dio K; §23.4.4b), and none may be added to make a
    // test executable. The unreachability IS the security property.
    //
    // The constraint itself stays mechanically proven, and by the STRONGER of the two forms
    // D-063 clause 8 recognises: strict full-set equality over `conname` + owning table +
    // `pg_get_constraintdef()`, asserted in the CHECK catalogue above and restated here
    // against its exact body. Both halves of the intended state are asserted below.
    const definition = await migrator.query<{ conname: string; def: string }>(
      `select con.conname, pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname = 'storage_objects' and con.contype = 'c'
        order by con.conname`,
    );

    expect(definition.rows).toStrictEqual([
      { conname: 'storage_objects_byte_size_check', def: 'CHECK ((byte_size >= 0))' },
    ]);

    const insert = `insert into storage_objects
         (id, practice_id, bucket_name, object_key, content_type, byte_size, sha256, created_by)
       values ('${storageObjectId}', '${PHASE_3_SEED_IDS.practiceDemo}', 'test-bucket',
               'test/object', 'text/plain', 0, '${'b'.repeat(64)}',
               '${PHASE_3_SEED_IDS.userPracticeAdmin}')`;

    // The runtime role is refused on PRIVILEGE — it holds none at all.
    expect(await appSqlState(insert)).toBe(INSUFFICIENT_PRIVILEGE);

    // The OWNER is refused too, because `FORCE ROW LEVEL SECURITY` subjects it to policies and
    // there is no policy it matches. This is a POSITIVE assertion of the intended state, and
    // it is the same mechanism D-064 correction B records for the package `014` triggers.
    expect(await sqlStateOf(migrator, insert)).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('package 003 forward SQL — static package boundary (D-064 `OD-9` part A)', () => {
  /**
   * The migration's OPERATIONAL SQL, with comments stripped.
   *
   * THIS BLOCK IS THE PERMANENT FORM OF THE PACKAGE `003` ZERO-CAPABILITY EVIDENCE.
   *
   * Until sub-gate `P5-I2B` the same claim was made against the LIVE DATABASE — "no runtime
   * role holds any privilege on these five tables". `P5-I2B` intentionally makes that live
   * claim false, because it is the exclusive owner of the security statements for all seven
   * phase 5 tenant tables (§29.4a.1, D-064 `OD-1`). D-064 `OD-9` part A therefore requires the
   * evidence to be RESTATED, not deleted: what must stay mechanically provable forever is that
   * PACKAGE `003` ITSELF INTRODUCED ZERO RUNTIME CAPABILITY.
   *
   * A static scan proves exactly that, and it keeps proving it no matter what a later package
   * does. Migration `003` is already applied and is NEVER edited (AGENTS.md §5.1, 00 §6.2), so
   * this assertion can only ever fail if someone rewrites history.
   *
   * Comments are stripped before the scan, exactly as the package `011` and `013` phase 5
   * scans do: the file DOCUMENTS the forbidden statements in prose in order to record why they
   * are absent, and flagging that prose would push a future author to delete the very text
   * that carries the decision.
   */
  const operationalSql = (): string => {
    const sql = readFileSync(
      resolve(apiRoot, 'prisma/migrations', PACKAGE_003_MIGRATION, 'migration.sql'),
      'utf8',
    );

    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  };

  it('given the package 003 forward SQL then it issues NO security statement of any kind', () => {
    // 02 §22.3, D-062 Dio B.3, D-063 clause 2, made mechanical and permanent. Every one of
    // these belongs exclusively to the phase 5 slice of `013_rls_policies`; the triggers
    // belong to the phase 5 slice of `014`.
    const operational = operationalSql();

    expect(/\bgrant\b/i.test(operational)).toBe(false);
    expect(/\brevoke\b/i.test(operational)).toBe(false);
    expect(/\benable\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bforce\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bdisable\s+row\s+level\s+security\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+policy\b/i.test(operational)).toBe(false);
    expect(/\bsecurity\s+definer\b/i.test(operational)).toBe(false);
    expect(/\bbypassrls\b/i.test(operational)).toBe(false);
    expect(/\balter\s+default\s+privileges\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+(or\s+replace\s+)?function\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+trigger\b/i.test(operational)).toBe(false);
    expect(/\bcreate\s+role\b/i.test(operational)).toBe(false);
    expect(/\balter\s+role\b/i.test(operational)).toBe(false);
  });

  it('given the package 003 forward SQL then it introduces no package 013 security capability', () => {
    // Named individually, because these are the exact statements whose ABSENCE is the security
    // control of this slice: a table no runtime role can reach needs no policy, so the window
    // between `003` and `P5-I2B` carried no capability at all.
    const operational = operationalSql();

    for (const table of PHASE_5_TABLES) {
      expect({
        table,
        granted: new RegExp(`\\bgrant\\b[^;]*\\b${table}\\b`, 'i').test(operational),
      }).toStrictEqual({ table, granted: false });
      expect({
        table,
        secured: new RegExp(`\\balter\\s+table\\s+"?${table}"?[^;]*row\\s+level`, 'i').test(
          operational,
        ),
      }).toStrictEqual({ table, secured: false });
    }
  });

  it('given the package 003 forward SQL then it contains no DML and no seed', () => {
    // §23.4.4b (D-062 Dio K): no phase 5 table is ever seeded, so the §23.4 FORCE-RLS
    // maintenance allowlist stays at exactly six tables.
    const operational = operationalSql();

    expect(/\binsert\s+into\b/i.test(operational)).toBe(false);
    expect(/\bupdate\s+"?\w+"?\s+set\b/i.test(operational)).toBe(false);
    expect(/\bdelete\s+from\b/i.test(operational)).toBe(false);
    expect(/\btruncate\b/i.test(operational)).toBe(false);
  });

  it('given the package 003 migration then it is applied unchanged, byte for byte', async () => {
    // The static proof above is only worth something if the file it reads is the file that was
    // applied. A drifting checksum means the applied migration and the repository disagree,
    // which 00 §6.2 forbids outright.
    const result = await migrator.query<{ checksum: string; finished_at: Date | null }>(
      'select checksum, finished_at from _prisma_migrations where migration_name = $1',
      [PACKAGE_003_MIGRATION],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.finished_at).not.toBeNull();
    expect(result.rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

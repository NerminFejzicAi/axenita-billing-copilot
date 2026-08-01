# 02 — Database Schema v1

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot  
**Baza:** PostgreSQL 16  
**ORM:** Prisma ORM 7 + custom PostgreSQL SQL  
**Verzija dokumenta:** 1.0  
**Status:** IMPLEMENTATION BASELINE

---

# 1. Ciljevi šeme

Database Schema v1 mora podržati:

1. multi-tenant rad više ordinacija;
2. database-level tenant izolaciju;
3. pseudonimizovane patient reference;
4. encounter i dokumente;
5. više immutable analysis revizija;
6. AI ekstrakciju sa evidence;
7. verzionisanu tarifnu evaluaciju;
8. safety findings;
9. ručni review i korekcije;
10. immutable approval payload;
11. integracije i export;
12. asinhrone poslove;
13. idempotency;
14. outbox;
15. append-only audit;
16. reprodukciju historijskog rezultata.

---

# 2. Konvencije

## 2.1 Imena

- tabele: `snake_case`, plural;
- kolone: `snake_case`;
- Prisma modeli: singular PascalCase;
- Prisma polja: camelCase uz `@map`;
- primary key: `id`;
- tenant key: `practice_id`;
- timestamp: `*_at`;
- datum: `*_date`;
- hash: `*_sha256` ili `*_hash`;
- enkriptovani sadržaj: `*_ciphertext`;
- vanjski ID: nikada obični tekst bez opravdanja.

## 2.2 Identifikatori

Sve poslovne tabele koriste UUID.

Preporučeni default:

```sql
gen_random_uuid()
```

Potrebna ekstenzija:

```sql
create extension if not exists pgcrypto;
```

UUID može generisati aplikacija ili baza, ali projekat mora koristiti jedan konzistentan pristup. Za Prisma modele je prihvatljivo `@default(uuid())`.

## 2.3 Vrijeme

- `timestamptz` za događaje;
- UTC u bazi;
- `date` za treatment/validity datum;
- practice timezone služi samo za prikaz i poslovnu interpretaciju.

## 2.4 Decimalne vrijednosti

```text
quantity       numeric(12,4)
points         numeric(14,4)
amount_chf     numeric(14,2)
confidence     numeric(5,4)
```

## 2.5 Tenant ključ

Sve tenant tabele imaju:

```sql
practice_id uuid not null
```

I, gdje ih druge tenant tabele referenciraju:

```sql
unique (practice_id, id)
```

## 2.6 Soft status

Business zapisi se ne brišu standardnim CRUD deleteom. Koriste se statusi, archive i retention tok.

---

# 3. Database role

## 3.1 `copilot_migrator`

```sql
create role copilot_migrator
login
nosuperuser
createdb
nocreaterole
inherit;
```

U produkciji se prava dodatno ograničavaju prema deployment modelu.

Odgovornosti:

- vlasnik schema objekata;
- migracije;
- functions/triggers/policies;
- grants.

## 3.2 `copilot_app`

```sql
create role copilot_app
login
nosuperuser
nocreatedb
nocreaterole
noinherit
nobypassrls;
```

Odgovornosti:

- runtime poslovni query;
- minimalna prava;
- podliježe RLS-u.

## 3.3 Zabranjeno

- API koristi `copilot_migrator`;
- tabela je owned by `copilot_app`;
- `copilot_app` dobije `BYPASSRLS`;
- `copilot_app` dobije blanket `ALL PRIVILEGES`.

---

# 4. Enum katalog

Prisma enum i PostgreSQL enum imena moraju biti mapirana konzistentno.

## 4.1 Membership

```text
PRACTICE_ADMIN
PHYSICIAN
MPA
BILLING_SPECIALIST
AUDITOR
READ_ONLY
```

## 4.2 Status ordinacije/korisnika

```text
ACTIVE
INACTIVE
SUSPENDED
ARCHIVED
```

## 4.3 Encounter status

```text
DRAFT
READY_FOR_ANALYSIS
ANALYSIS_IN_PROGRESS
REVIEW_REQUIRED
APPROVED
EXPORT_PENDING
EXPORTED
CANCELLED
CLOSED
```

## 4.4 Document type

```text
CONSULTATION_NOTE
DIAGNOSIS_LIST
PROCEDURE_NOTE
REFERRAL
LAB_RESULT
BILLING_DRAFT
AUDIT_REPORT
OTHER
```

## 4.5 Document source

```text
MANUAL_TEXT
FILE_UPLOAD
AXENITA_API
CSV_IMPORT
FHIR_IMPORT
GENERATED
```

## 4.6 Integration provider

```text
AXENITA
MANUAL
CSV
FHIR
OTHER
```

## 4.7 Analysis status

```text
QUEUED
PREPARING_INPUT
EXTRACTING
EXTRACTION_FAILED
EVALUATING_TARIFF
TARIFF_EVALUATION_FAILED
APPLYING_SAFETY_RULES
COMPLETED
REVIEW_REQUIRED
APPROVED
REJECTED
CANCELLED
SUPERSEDED
FAILED
```

## 4.8 Review state

```text
UNREVIEWED
CONFIRMED
CORRECTED
REJECTED
```

## 4.9 Candidate origin

```text
AI
USER
AXENITA
TARIFF_MAPPER
SYSTEM
```

## 4.10 Billing path

```text
TARDOC
AMBULATORY_FLAT_RATE
UNDETERMINED
NOT_BILLABLE
```

## 4.11 Finding severity

```text
INFO
WARNING
ERROR
CRITICAL
```

## 4.12 Finding status

```text
OPEN
RESOLVED
ACCEPTED_RISK
DISMISSED
OBSOLETE
```

## 4.13 Decision type

```text
APPROVE
REJECT
REQUEST_CHANGES
SAVE_DRAFT
```

## 4.14 Job status

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

## 4.15 Export status

```text
QUEUED
PROCESSING
SUCCEEDED
PARTIALLY_SUCCEEDED
FAILED
CANCELLED
```

---

# 5. Entity pregled

```text
Identity/Tenant
├── practices
├── users
├── practice_memberships
└── practice_settings

Clinical intake
├── patient_references
├── encounters
├── encounter_diagnoses
├── storage_objects
└── encounter_documents

Tariff configuration
├── tariff_releases
├── tariff_release_artifacts
├── tariff_catalog_entries
└── tariff_release_activation_history

AI/Analysis
├── ai_prompt_versions
├── analysis_runs
├── analysis_input_snapshots
├── ai_extraction_runs
├── extracted_facts
├── service_candidates
└── candidate_evidence

Tariff result
├── tariff_evaluations
├── tariff_evaluation_items
└── tariff_messages

Rules/Review
├── safety_rules
├── safety_rule_versions
├── rule_findings
├── finding_evidence
├── review_decisions
├── review_item_changes
└── analysis_approvals

Integration/System
├── integration_connections
├── external_resource_links
├── import_batches
├── export_jobs
├── webhook_receipts
├── async_jobs
├── idempotency_keys
├── outbox_events
└── audit_events
```

---

# 6. Identity i tenant tabele

## 6.1 `practices`

| Kolona | Tip | Null | Pravilo |
|---|---|---:|---|
| id | uuid | ne | PK |
| code | varchar(50) | ne | unique, stabilni tehnički kod |
| name | varchar(255) | ne | prikaz |
| legal_name | varchar(255) | da | pravni naziv |
| zsr_number | varchar(50) | da | osjetljiv poslovni podatak |
| gln_number | varchar(50) | da | poslovni identifikator |
| default_language | varchar(10) | ne | default `de-CH` |
| timezone | varchar(100) | ne | default `Europe/Zurich` |
| status | varchar/enum | ne | `ACTIVE` |
| created_at | timestamptz | ne | default now |
| updated_at | timestamptz | ne | app/update trigger |

Indeksi:

```sql
unique (code)
index (status)
```

## 6.2 `users`

| Kolona | Tip | Null | Pravilo |
|---|---|---:|---|
| id | uuid | ne | PK |
| auth_subject | varchar(255) | ne | unique |
| email | varchar(320) | ne | ne mora biti globalni login autoritet |
| display_name | varchar(255) | ne | |
| preferred_language | varchar(10) | ne | |
| status | enum | ne | |
| last_login_at | timestamptz | da | |
| created_at | timestamptz | ne | |
| updated_at | timestamptz | ne | |

Napomena: lozinke se ne čuvaju.

## 6.3 `practice_memberships`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid FK |
| user_id | uuid FK |
| role | membership_role |
| professional_gln | varchar(50), nullable |
| active | boolean |
| created_at | timestamptz |
| updated_at | timestamptz |

Constraint:

```sql
unique (practice_id, user_id)
unique (practice_id, id)
```

Indeksi:

```sql
(user_id, active)
(practice_id, active, role)
```

## 6.4 `practice_settings`

Jedan red po practice.

| Kolona | Tip |
|---|---|
| practice_id | uuid PK/FK |
| billing_review_required | boolean |
| allow_mpa_approval | boolean |
| require_reason_for_manual_change | boolean |
| ai_enabled | boolean |
| axenita_export_enabled | boolean |
| retention_policy_code | varchar(100), nullable |
| configuration | jsonb |
| updated_by | uuid nullable |
| updated_at | timestamptz |

`configuration` ne sadrži secrets.

---

# 7. Patient i encounter tabele

## 7.1 `patient_references`

| Kolona | Tip | Napomena |
|---|---|---|
| id | uuid PK | |
| practice_id | uuid | tenant |
| source_system | integration_provider | |
| external_patient_ref_hash | varchar(128) | HMAC/pretraživi token |
| external_patient_ref_ciphertext | bytea nullable | samo ako write-back zahtijeva |
| pseudonym | varchar(50) | UI identifikator |
| birth_year | smallint nullable | minimum |
| sex_code | varchar(20) nullable | kada tarifno potrebno |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Constraints:

```sql
unique (practice_id, source_system, external_patient_ref_hash)
unique (practice_id, pseudonym)
unique (practice_id, id)
check (birth_year is null or birth_year between 1900 and 2200)
```

Produkcijski pseudonim ne smije biti izveden direktnim skraćivanjem eksternog ID-a.

## 7.2 `encounters`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| patient_reference_id | uuid |
| external_encounter_ref_hash | varchar(128), nullable |
| external_encounter_ref_ciphertext | bytea, nullable |
| occurred_at | timestamptz |
| treatment_date | date |
| responsible_physician_id | uuid nullable |
| guarantor_type | varchar(30), nullable |
| insurance_context | varchar(30), nullable |
| specialty_code | varchar(50), nullable |
| patient_age_at_encounter | smallint, nullable |
| patient_sex_at_encounter | varchar(20), nullable |
| status | encounter_status |
| source_system | integration_provider |
| version | integer |
| created_by | uuid |
| created_at | timestamptz |
| updated_by | uuid nullable |
| updated_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)
check (version >= 1)
check (
  patient_age_at_encounter is null
  or patient_age_at_encounter between 0 and 130
)
foreign key (practice_id, patient_reference_id)
  references patient_references(practice_id, id)
```

Indeksi:

```sql
(practice_id, status, treatment_date desc, id desc)
(practice_id, patient_reference_id, treatment_date desc)
(practice_id, responsible_physician_id, treatment_date desc)
```

## 7.3 `encounter_diagnoses`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| encounter_id | uuid |
| coding_system | varchar(30) |
| diagnosis_code | varchar(50) |
| description | text nullable |
| diagnosis_type | varchar(30) nullable |
| is_primary | boolean |
| source | varchar(30) |
| review_state | review_state |
| created_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)
unique (practice_id, encounter_id, coding_system, diagnosis_code)
foreign key (practice_id, encounter_id)
  references encounters(practice_id, id)
```

---

# 8. Storage i dokumenti

## 8.1 `storage_objects`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| bucket_name | varchar(100) |
| object_key | varchar(500) |
| content_type | varchar(150) |
| original_filename | varchar(255), nullable |
| byte_size | bigint |
| sha256 | varchar(64) |
| encryption_key_ref | varchar(255), nullable |
| encryption_version | integer, nullable |
| antivirus_status | varchar(30), nullable |
| created_by | uuid |
| created_at | timestamptz |
| archived_at | timestamptz nullable |
| retention_delete_after | timestamptz nullable |

Constraints:

```sql
unique (bucket_name, object_key)
unique (practice_id, id)
check (byte_size >= 0)
```

## 8.2 `encounter_documents`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| encounter_id | uuid |
| document_type | document_type |
| source | document_source |
| storage_object_id | uuid nullable |
| source_storage_object_id | uuid nullable |
| normalized_text_ciphertext | bytea nullable |
| normalized_text_iv | bytea nullable |
| normalized_text_auth_tag | bytea nullable |
| redacted_text_ciphertext | bytea nullable |
| redacted_text_iv | bytea nullable |
| redacted_text_auth_tag | bytea nullable |
| source_text_hash | varchar(64) nullable |
| redacted_text_hash | varchar(64) nullable |
| language_code | varchar(10) nullable |
| page_count | integer nullable |
| processing_status | varchar(30) |
| redaction_status | varchar(30) |
| external_document_ref_hash | varchar(128) nullable |
| created_by | uuid |
| created_at | timestamptz |
| archived_at | timestamptz nullable |

Composite FK:

```sql
foreign key (practice_id, encounter_id)
  references encounters(practice_id, id)

foreign key (practice_id, storage_object_id)
  references storage_objects(practice_id, id)
```

Check:

```sql
check (page_count is null or page_count > 0)
```

---

# 9. Tariff konfiguracija

## 9.1 `tariff_releases`

Globalna tabela, bez `practice_id`.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| release_code | varchar(100) unique |
| tardoc_version | varchar(50) |
| ambulatory_flat_rate_version | varchar(50) |
| lkaat_version | varchar(50) |
| tarifmatcher_version | varchar(100) |
| casemaster_version | varchar(100) nullable |
| grouper_version | varchar(100) nullable |
| mapper_version | varchar(100) nullable |
| valid_from | date |
| valid_to | date nullable |
| package_sha256 | varchar(64) |
| status | varchar(30) |
| is_active | boolean |
| imported_by | uuid nullable |
| imported_at | timestamptz |
| activated_by | uuid nullable |
| activated_at | timestamptz nullable |

Constraints:

```sql
check (valid_to is null or valid_to >= valid_from)
```

Partial unique:

```sql
create unique index tariff_releases_one_active_idx
on tariff_releases ((1))
where is_active = true;
```

Napomena: kasnije može biti potrebna aktivnost po treatment periodu, a ne samo globalno. Za MVP jedna aktivna release verzija uz eksplicitno čuvanje release ID-a u analizi.

## 9.2 `tariff_release_artifacts`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| tariff_release_id | uuid FK |
| artifact_type | varchar(50) |
| filename | varchar(255) |
| storage_object_id | uuid |
| artifact_version | varchar(100) nullable |
| sha256 | varchar(64) |
| metadata | jsonb |
| created_at | timestamptz |

Napomena: global tariff artifacts ne bi idealno trebali koristiti tenant `storage_objects`. Za implementaciju izabrati jedno:

- posebna global `system_storage_objects` tabela; ili
- `storage_objects.practice_id` nullable uz zasebna stroga pravila.

**Zaključana preporuka v1:** kreirati zasebnu `system_storage_objects` tabelu za globalne tarifne artefakte, kako se tenant RLS ne bi komplikovao.

## 9.3 `system_storage_objects`

Ista metadata struktura kao `storage_objects`, ali bez practice ID-a. Samo admin/migrator pristup.

## 9.4 `tariff_catalog_entries`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| tariff_release_id | uuid |
| code_system | varchar(30) |
| code | varchar(100) |
| title_de | text nullable |
| description_de | text nullable |
| valid_from | date nullable |
| valid_to | date nullable |
| attributes | jsonb |

Unique:

```sql
unique (tariff_release_id, code_system, code)
```

## 9.5 `tariff_release_activation_history`

Append-only:

| Kolona | Tip |
|---|---|
| id | uuid |
| tariff_release_id | uuid |
| action | varchar(30) |
| actor_user_id | uuid |
| reason | text |
| baseline_test_reference | varchar(255) nullable |
| occurred_at | timestamptz |

---

# 10. AI i analysis

## 10.1 `ai_prompt_versions`

Globalna konfiguracija.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| prompt_code | varchar(100) |
| version | integer |
| purpose | varchar(100) |
| language_code | varchar(10) |
| system_prompt | text |
| output_schema | jsonb |
| status | varchar(30) |
| content_sha256 | varchar(64) |
| created_by | uuid |
| created_at | timestamptz |
| activated_by | uuid nullable |
| activated_at | timestamptz nullable |

Unique:

```sql
unique (prompt_code, version)
```

Aktivna verzija se ne updatea; kreira se nova verzija.

## 10.2 `analysis_runs`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| encounter_id | uuid |
| parent_analysis_run_id | uuid nullable |
| revision_number | integer |
| tariff_release_id | uuid |
| status | analysis_status |
| requested_by | uuid |
| request_reason | text nullable |
| application_version | varchar(100) |
| ruleset_version | varchar(100) |
| options | jsonb |
| started_at | timestamptz nullable |
| completed_at | timestamptz nullable |
| failure_code | varchar(100) nullable |
| failure_message_safe | text nullable |
| created_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)
unique (encounter_id, revision_number)
check (revision_number >= 1)
foreign key (practice_id, encounter_id)
  references encounters(practice_id, id)
foreign key (practice_id, parent_analysis_run_id)
  references analysis_runs(practice_id, id)
```

Indeksi:

```sql
(practice_id, encounter_id, revision_number desc)
(practice_id, status, created_at desc)
```

## 10.3 `analysis_input_snapshots`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| analysis_run_id | uuid |
| schema_version | varchar(30) |
| input_json | jsonb |
| input_sha256 | varchar(64) |
| source_document_hashes | jsonb |
| included_document_ids | uuid[] |
| created_at | timestamptz |

Constraints:

```sql
unique (analysis_run_id)
foreign key (practice_id, analysis_run_id)
  references analysis_runs(practice_id, id)
```

Runtime prava: insert/select, bez update/delete.

## 10.4 `ai_extraction_runs`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| analysis_run_id | uuid |
| prompt_version_id | uuid |
| provider | varchar(100) |
| model | varchar(150) |
| model_revision | varchar(150) nullable |
| request_sha256 | varchar(64) |
| response_sha256 | varchar(64) nullable |
| raw_request_storage_object_id | uuid nullable |
| raw_response_storage_object_id | uuid nullable |
| parsed_output | jsonb nullable |
| output_schema_version | varchar(30) |
| schema_validation_passed | boolean nullable |
| validation_errors | jsonb nullable |
| input_tokens | integer nullable |
| output_tokens | integer nullable |
| latency_ms | integer nullable |
| status | varchar(30) |
| error_code | varchar(100) nullable |
| error_message_safe | text nullable |
| started_at | timestamptz |
| completed_at | timestamptz nullable |

Indeks:

```sql
(practice_id, analysis_run_id, started_at)
```

## 10.5 `extracted_facts`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| analysis_run_id | uuid |
| ai_extraction_run_id | uuid nullable |
| fact_type | varchar(100) |
| value_json | jsonb |
| unit | varchar(50) nullable |
| confidence | numeric(5,4) nullable |
| origin | candidate_origin |
| review_state | review_state |
| corrected_value_json | jsonb nullable |
| corrected_by | uuid nullable |
| corrected_at | timestamptz nullable |
| correction_reason | text nullable |
| created_at | timestamptz |

Checks:

```sql
check (confidence is null or confidence between 0 and 1)
```

## 10.6 `service_candidates`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| analysis_run_id | uuid |
| session_reference | varchar(100) nullable |
| code_system | varchar(30) |
| service_code | varchar(100) |
| proposed_quantity | numeric(12,4) |
| proposed_unit | varchar(50) nullable |
| origin | candidate_origin |
| confidence | numeric(5,4) nullable |
| rationale | text nullable |
| review_state | review_state |
| effective_quantity | numeric(12,4) nullable |
| effective_service_code | varchar(100) nullable |
| corrected_by | uuid nullable |
| corrected_at | timestamptz nullable |
| correction_reason | text nullable |
| created_at | timestamptz |

Checks:

```sql
check (proposed_quantity > 0)
check (effective_quantity is null or effective_quantity > 0)
check (confidence is null or confidence between 0 and 1)
```

## 10.7 `candidate_evidence`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| service_candidate_id | uuid |
| document_id | uuid |
| start_offset | integer nullable |
| end_offset | integer nullable |
| quoted_text_ciphertext | bytea nullable |
| quoted_text_hash | varchar(64) nullable |
| evidence_type | varchar(30) |
| confidence | numeric(5,4) nullable |
| created_at | timestamptz |

Composite FK prema candidate i document tabeli.

Checks:

```sql
check (
  start_offset is null
  or end_offset is null
  or (start_offset >= 0 and end_offset >= start_offset)
)
```

---

# 11. Tarifni rezultat

## 11.1 `tariff_evaluations`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| analysis_run_id | uuid |
| tariff_release_id | uuid |
| billing_path | billing_path |
| matcher_request_json | jsonb |
| matcher_request_sha256 | varchar(64) |
| matcher_response_json | jsonb |
| matcher_response_sha256 | varchar(64) |
| casemaster_result | jsonb nullable |
| grouper_result | jsonb nullable |
| mapper_result | jsonb nullable |
| selected_flat_rate_code | varchar(100) nullable |
| status | varchar(30) |
| error_code | varchar(100) nullable |
| error_message_safe | text nullable |
| started_at | timestamptz |
| completed_at | timestamptz nullable |

Constraints:

```sql
unique (analysis_run_id)
```

Append-like: nema update/delete nakon `SUCCEEDED`, osim controlled status completion unutar transakcije.

## 11.2 `tariff_evaluation_items`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| tariff_evaluation_id | uuid |
| source_candidate_id | uuid nullable |
| output_code_system | varchar(30) |
| output_code | varchar(100) |
| output_description | text nullable |
| quantity | numeric(12,4) |
| unit | varchar(50) nullable |
| session_reference | varchar(100) nullable |
| mapper_action | varchar(50) nullable |
| mapper_reason | text nullable |
| included_in_flat_rate | boolean |
| billable | boolean |
| technical_points | numeric(14,4) nullable |
| medical_points | numeric(14,4) nullable |
| amount_chf | numeric(14,2) nullable |
| attributes | jsonb |
| sort_order | integer |
| created_at | timestamptz |

Checks:

```sql
check (quantity > 0)
check (amount_chf is null or amount_chf >= 0)
```

## 11.3 `tariff_messages`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| tariff_evaluation_id | uuid |
| source_component | varchar(30) |
| external_message_code | varchar(100) nullable |
| severity | finding_severity |
| message | text |
| related_service_code | varchar(100) nullable |
| details | jsonb |
| created_at | timestamptz |

Source values:

```text
CASEMASTER
GROUPER
MAPPER
TARIFF_ENGINE
```

---

# 12. Safety rule tabele

## 12.1 `safety_rules`

Globalna metadata tabela:

| Kolona | Tip |
|---|---|
| id | uuid |
| rule_code | varchar(100) unique |
| category | varchar(100) |
| title_de | text |
| description_de | text |
| owner | varchar(100) |
| active | boolean |
| created_at | timestamptz |

## 12.2 `safety_rule_versions`

| Kolona | Tip |
|---|---|
| id | uuid |
| safety_rule_id | uuid |
| version | integer |
| valid_from | timestamptz |
| valid_to | timestamptz nullable |
| severity | finding_severity |
| blocking | boolean |
| allow_accepted_risk | boolean |
| evaluation_type | varchar(30) |
| implementation_reference | varchar(255) |
| configuration | jsonb |
| description_de | text |
| remediation_de | text nullable |
| status | varchar(30) |
| content_sha256 | varchar(64) |
| created_by | uuid |
| created_at | timestamptz |

Unique:

```sql
unique (safety_rule_id, version)
```

## 12.3 `rule_findings`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| analysis_run_id | uuid |
| safety_rule_version_id | uuid nullable |
| tariff_message_id | uuid nullable |
| finding_code | varchar(100) |
| severity | finding_severity |
| blocking | boolean |
| status | finding_status |
| title | text |
| explanation | text |
| suggested_action | text nullable |
| related_service_candidate_id | uuid nullable |
| related_tariff_item_id | uuid nullable |
| missing_fields | jsonb nullable |
| details | jsonb |
| resolved_by | uuid nullable |
| resolved_at | timestamptz nullable |
| resolution_reason | text nullable |
| version | integer |
| created_at | timestamptz |
| updated_at | timestamptz |

Unique za determinističko ponovno izvršavanje:

```sql
unique (
  analysis_run_id,
  safety_rule_version_id,
  finding_code,
  related_service_candidate_id,
  related_tariff_item_id
)
```

Napomena: null semantika unique constrainta zahtijeva pažnju. Može se koristiti generisani `finding_dedup_key` ili expression unique index.

## 12.4 `finding_evidence`

Veza na document/fact/candidate/tariff item.

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| rule_finding_id | uuid |
| evidence_type | varchar(50) |
| document_id | uuid nullable |
| fact_id | uuid nullable |
| candidate_id | uuid nullable |
| tariff_item_id | uuid nullable |
| start_offset | integer nullable |
| end_offset | integer nullable |
| value_json | jsonb nullable |
| explanation | text nullable |
| created_at | timestamptz |

---

# 13. Review i approval

## 13.1 `review_decisions`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| analysis_run_id | uuid |
| decision | decision_type |
| reason | text nullable |
| decided_by | uuid |
| decided_at | timestamptz |
| analysis_revision_number | integer |
| request_id | varchar(100) nullable |

Append-only.

## 13.2 `review_item_changes`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| review_decision_id | uuid |
| entity_type | varchar(50) |
| entity_id | uuid |
| field_name | varchar(100) |
| old_value | jsonb nullable |
| new_value | jsonb nullable |
| reason | text |
| changed_by | uuid |
| changed_at | timestamptz |

Append-only.

## 13.3 `analysis_approvals`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| analysis_run_id | uuid |
| approved_by | uuid |
| approved_at | timestamptz |
| approval_statement_version | varchar(30) |
| approval_comment | text nullable |
| approved_payload_json | jsonb |
| approved_payload_sha256 | varchar(64) |
| revoked_at | timestamptz nullable |
| revoked_by | uuid nullable |
| revocation_reason | text nullable |

Constraints:

```sql
unique (analysis_run_id)
```

`approved_payload_json` mora sadržavati:

- analysis/revision;
- tariff release;
- billing path;
- final items;
- accepted warnings;
- approver;
- timestamp;
- source hashes;
- app/rules versions.

---

# 14. Integracije

## 14.1 `integration_connections`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| provider | integration_provider |
| connection_name | varchar(150) |
| environment | varchar(30) |
| status | varchar(30) |
| base_url | varchar(500) nullable |
| credentials_secret_ref | varchar(500) nullable |
| configuration | jsonb |
| last_successful_connection_at | timestamptz nullable |
| last_error_at | timestamptz nullable |
| last_error_code | varchar(100) nullable |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

Unique:

```sql
unique (practice_id, provider, connection_name)
```

## 14.2 `external_resource_links`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| integration_connection_id | uuid |
| local_resource_type | varchar(50) |
| local_resource_id | uuid |
| external_resource_type | varchar(100) |
| external_id_hash | varchar(128) |
| external_id_ciphertext | bytea nullable |
| external_version | varchar(100) nullable |
| last_synced_at | timestamptz nullable |

Unique:

```sql
unique (
  practice_id,
  integration_connection_id,
  external_resource_type,
  external_id_hash
)
```

## 14.3 `import_batches`

Brojači, source reference, status i summary. Raw import ide u object storage.

## 14.4 `export_jobs`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| analysis_run_id | uuid |
| approval_id | uuid |
| integration_connection_id | uuid |
| status | export_status |
| approved_payload_sha256 | varchar(64) |
| external_target_reference | varchar(255) nullable |
| external_response | jsonb nullable |
| attempts | integer |
| last_error_code | varchar(100) nullable |
| last_error_message_safe | text nullable |
| requested_by | uuid |
| requested_at | timestamptz |
| started_at | timestamptz nullable |
| completed_at | timestamptz nullable |

Export mora referencirati approval, ne samo analysis.

## 14.5 `webhook_receipts`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid nullable dok se ne resolva |
| integration_connection_id | uuid nullable |
| provider | integration_provider |
| external_event_id | varchar(255) |
| event_type | varchar(150) |
| signature_valid | boolean |
| payload_sha256 | varchar(64) |
| payload_storage_object_id | uuid nullable |
| processing_status | varchar(30) |
| processing_error_safe | text nullable |
| received_at | timestamptz |
| processed_at | timestamptz nullable |

Unique:

```sql
unique (provider, external_event_id)
```

---

# 15. Sistemske tabele

## 15.1 `async_jobs`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid nullable |
| job_type | varchar(100) |
| resource_type | varchar(50) nullable |
| resource_id | uuid nullable |
| status | job_status |
| progress_percent | integer |
| progress_message_code | varchar(100) nullable |
| attempts | integer |
| max_attempts | integer |
| error_code | varchar(100) nullable |
| error_message_safe | text nullable |
| queued_at | timestamptz |
| started_at | timestamptz nullable |
| completed_at | timestamptz nullable |

Check 0–100.

## 15.2 `idempotency_keys`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| user_id | uuid |
| idempotency_key | varchar(255) |
| endpoint | varchar(255) |
| request_sha256 | varchar(64) |
| response_status | integer nullable |
| response_body | jsonb nullable |
| locked_at | timestamptz nullable |
| completed_at | timestamptz nullable |
| expires_at | timestamptz |
| created_at | timestamptz |

Unique:

```sql
unique (practice_id, user_id, endpoint, idempotency_key)
```

Ne čuvati medicinski body u cached responseu.

## 15.3 `outbox_events`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid nullable |
| aggregate_type | varchar(100) |
| aggregate_id | uuid |
| event_type | varchar(150) |
| event_version | integer |
| payload | jsonb |
| created_at | timestamptz |
| published_at | timestamptz nullable |
| publish_attempts | integer |
| last_error_safe | text nullable |

Partial index:

```sql
create index outbox_unpublished_idx
on outbox_events(created_at, id)
where published_at is null;
```

Payload ne sadrži medicinski tekst.

## 15.4 `audit_events`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid nullable |
| occurred_at | timestamptz |
| actor_type | varchar(30) |
| actor_user_id | uuid nullable |
| actor_service | varchar(100) nullable |
| action | varchar(150) |
| resource_type | varchar(100) |
| resource_id | uuid nullable |
| request_id | varchar(100) nullable |
| session_id_hash | varchar(128) nullable |
| ip_address | inet nullable |
| user_agent_hash | varchar(128) nullable |
| previous_value | jsonb nullable |
| new_value | jsonb nullable |
| metadata | jsonb |
| event_sha256 | varchar(64) |
| previous_event_sha256 | varchar(64) nullable |

Runtime:

```sql
grant select, insert
revoke update, delete, truncate
```

`previous_value` i `new_value` moraju biti sanitizovani.

---

# 16. RLS helper

## 16.1 Schema

```sql
create schema if not exists app_security;
revoke all on schema app_security from public;
grant usage on schema app_security to copilot_app;
```

## 16.2 Context funkcija

```sql
create or replace function app_security.set_request_context(
  p_practice_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from practice_memberships pm
    where pm.practice_id = p_practice_id
      and pm.user_id = p_user_id
      and pm.active = true
  ) then
    raise exception using
      errcode = '42501',
      message = 'User is not a member of requested practice';
  end if;

  perform set_config('app.practice_id', p_practice_id::text, true);
  perform set_config('app.user_id', p_user_id::text, true);
end;
$$;

revoke all on function app_security.set_request_context(uuid, uuid) from public;
grant execute on function app_security.set_request_context(uuid, uuid) to copilot_app;
```

Security-definer owner mora biti kontrolisana non-login ili migrator role, uz fiksiran search path.

## 16.3 Context helper expressions

```sql
nullif(current_setting('app.practice_id', true), '')::uuid
nullif(current_setting('app.user_id', true), '')::uuid
```

---

# 17. RLS policy pattern

```sql
alter table encounters enable row level security;
alter table encounters force row level security;

create policy encounters_select
on encounters
for select
to copilot_app
using (
  practice_id =
  nullif(current_setting('app.practice_id', true), '')::uuid
);

create policy encounters_insert
on encounters
for insert
to copilot_app
with check (
  practice_id =
  nullif(current_setting('app.practice_id', true), '')::uuid
);

create policy encounters_update
on encounters
for update
to copilot_app
using (
  practice_id =
  nullif(current_setting('app.practice_id', true), '')::uuid
)
with check (
  practice_id =
  nullif(current_setting('app.practice_id', true), '')::uuid
);
```

DELETE policy se ne kreira ako business delete nije dozvoljen.

---

# 18. RLS matrica

Legenda:

- S: SELECT;
- I: INSERT;
- U: UPDATE;
- D: DELETE;
- `—`: nije dozvoljeno runtime aplikaciji.

| Tabela | S | I | U | D | FORCE RLS |
|---|---:|---:|---:|---:|---:|
| patient_references | da | da | ograničeno | — | da |
| encounters | da | da | da | — | da |
| encounter_diagnoses | da | da | ograničeno | — | da |
| storage_objects | da | da | status/archive | — | da |
| encounter_documents | da | da | archive/status | — | da |
| analysis_runs | da | da | status pipeline | — | da |
| analysis_input_snapshots | da | da | — | — | da |
| ai_extraction_runs | da | da | status completion | — | da |
| extracted_facts | da | da | correction fields samo prije approvala | — | da |
| service_candidates | da | da | correction fields samo prije approvala | — | da |
| candidate_evidence | da | da | — | — | da |
| tariff_evaluations | da | da | completion status samo | — | da |
| tariff_evaluation_items | da | da | — | — | da |
| tariff_messages | da | da | — | — | da |
| rule_findings | da | da | resolution fields | — | da |
| finding_evidence | da | da | — | — | da |
| review_decisions | da | da | — | — | da |
| review_item_changes | da | da | — | — | da |
| analysis_approvals | da | da | revoke fields kontrolisano | — | da |
| integration_connections | da | da | da | — | da |
| external_resource_links | da | da | sync fields | — | da |
| import_batches | da | da | status | — | da |
| export_jobs | da | da | status | — | da |
| webhook_receipts | da | da | processing status | — | da |
| async_jobs | da | da | status/progress | — | da |
| idempotency_keys | da | da | response completion | cleanup job | da |
| outbox_events | da | da | publish fields | retention job | da |
| audit_events | da | da | — | — | da |

"U ograničeno" se prvenstveno sprovodi kroz application service, permission i trigger; RLS štiti tenant, ali ne mora sam izraziti sve column-level poslovne zabrane.

---

# 19. Immutability triggers

## 19.1 Approved analysis guard

Funkcija provjerava aktivan approval.

```sql
create or replace function app_security.assert_analysis_not_approved(
  p_practice_id uuid,
  p_analysis_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from analysis_approvals aa
    where aa.practice_id = p_practice_id
      and aa.analysis_run_id = p_analysis_run_id
      and aa.revoked_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Approved analysis cannot be modified';
  end if;
end;
$$;
```

Triggeri na:

- extracted_facts update/delete;
- service_candidates update/delete;
- rule_findings business update osim kontrolisanog revoke flowa;
- tariff evaluation item update/delete.

Tačna trigger logika se testira u fazi 10.

## 19.2 Audit append-only

Runtime grants su primarna kontrola. Dodatno može postojati trigger:

```sql
before update or delete on audit_events
raise exception
```

Migrator može privremeno disableati u kontrolisanoj migraciji, ne aplikacija.

---

# 20. Grants matrica

## 20.1 Global read tabele

`copilot_app` može SELECT:

- tariff_releases;
- tariff_catalog_entries;
- active safety rule metadata;
- active AI prompt metadata bez prikaza punog prompta običnom korisniku.

Admin write ide kroz API sa posebnom DB funkcijom ili istom runtime rolom uz application permission i RLS-free global tabelu. Sigurniji production smjer je posebna administrativna DB procedura/role; MVP može koristiti runtime INSERT/UPDATE uz strogi admin endpoint, ali to mora biti testirano.

## 20.2 Tenant tabele

Grant tabela prati RLS matricu.

## 20.3 Sequence

Ako se koriste SQL sequence, dodijeliti minimalna prava. UUID dizajn izbjegava većinu sequence prava.

---

# 21. Indeksi

Obavezni minimalni indeks katalog:

```sql
create index encounters_review_queue_idx
on encounters(practice_id, status, treatment_date desc, id desc);

create index encounters_patient_timeline_idx
on encounters(practice_id, patient_reference_id, treatment_date desc, id desc);

create index analysis_encounter_revision_idx
on analysis_runs(practice_id, encounter_id, revision_number desc);

create index analysis_status_idx
on analysis_runs(practice_id, status, created_at desc);

create index documents_encounter_idx
on encounter_documents(practice_id, encounter_id, created_at);

create index facts_analysis_idx
on extracted_facts(practice_id, analysis_run_id, fact_type);

create index candidates_analysis_idx
on service_candidates(practice_id, analysis_run_id, review_state);

create index tariff_items_eval_idx
on tariff_evaluation_items(practice_id, tariff_evaluation_id, sort_order, id);

create index findings_analysis_idx
on rule_findings(practice_id, analysis_run_id, status, severity, blocking);

create index exports_status_idx
on export_jobs(practice_id, status, requested_at);

create index async_jobs_queue_idx
on async_jobs(status, queued_at, id);

create index audit_resource_idx
on audit_events(practice_id, resource_type, resource_id, occurred_at);

create index audit_actor_idx
on audit_events(practice_id, actor_user_id, occurred_at desc);
```

Indeksi se validiraju `EXPLAIN` planom na realističnim test podacima prije optimizacije.

---

# 22. Migration paketi

```text
001_extensions_and_roles
002_identity_and_practices
003_patient_encounter_documents
004_tariff_releases
005_ai_prompts_and_analysis
006_facts_candidates_evidence
007_tariff_evaluation
008_safety_findings
009_review_approvals
010_integrations
011_jobs_idempotency_outbox_audit
012_constraints_indexes
013_rls_policies
014_immutability_triggers
015_seed_baseline
```

Ne mora svaki paket biti jedna migracija, ali redoslijed zavisnosti mora ostati.

---

# 23. Seed podaci

Development seed je idempotentan i kreira:

- `demo-praxis`;
- dev admin;
- dev physician;
- memberships;
- practice settings;
- mock tariff release;
- prompt versions;
- safety rule metadata;
- minimalni test encounter, opciono posebnim demo seedom.

Production seed ne kreira demo medicinske podatke.

---

# 24. Backup i restore

Mora biti moguće:

```text
pg_dump custom format
→ enkriptovan backup
→ restore u izolovanu test bazu
→ migrate status
→ integrity smoke tests
```

Object storage backup/retention se rješava odvojeno, uz očuvanje referencijalne konzistentnosti.

---

# 25. Database acceptance testovi

## 25.1 RLS

- practice A ne vidi B;
- practice A ne updatea B;
- practice A ne inserta row sa B practice ID;
- bez contexta nema tenant rowova;
- inactive membership ne može postaviti context.

## 25.2 Composite FK

- A encounter ne referencira B patient;
- A candidate ne referencira B analysis;
- A evidence ne referencira B document.

## 25.3 Immutability

- snapshot update fail;
- approval payload update fail;
- audit update/delete fail;
- approved candidate update fail.

## 25.4 Numeric

- negativna quantity fail;
- confidence >1 fail;
- age >130 fail.

## 25.5 Idempotency

- duplicate unique key;
- isti key/drugi hash conflict;
- response cache bez medicinskog sadržaja.

---

# 26. Prisma implementacijske napomene

Prisma schema ne izražava sva pravila. Zato:

- model/relations u `schema.prisma`;
- RLS, grants, functions, triggers i pojedini composite FK u migration SQL-u;
- ne očekivati da `prisma generate` razumije RLS;
- raw SQL samo kroz kontrolisane repository/service metode;
- Decimal iz Prisma se mapira u API string;
- `Json` ne koristi se kao zamjena za ključne normalizovane kolone.

---

# 27. Definition of Done za Schema v1

- sve migracije rade na praznoj bazi;
- `migrate deploy` radi na testnoj bazi;
- runtime role nije owner;
- RLS pokriva sve tenant tabele;
- composite FK testovi prolaze;
- migration checksum nije ručno narušen;
- audit je append-only;
- approval je immutable;
- svi bitni inputi imaju hash;
- indeksi postoje;
- seed je idempotentan;
- backup/restore test je dokumentovan;
- Prisma validate i generate prolaze.

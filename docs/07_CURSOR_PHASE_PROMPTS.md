# 07 — Cursor Phase Prompts

## Uputstvo

Za svaku fazu kopirati samo odgovarajući prompt. Cursoru ne slati sve faze kao jednu implementaciju.

Prije prompta:

```text
git status
git branch --show-current
```

Nakon prompta zahtijevati završni report i zaustavljanje.

---

# Univerzalni header za svaki prompt

```text
Radiš na projektu Auditabilni Axenita TARDOC Billing Safety Copilot.

Prije bilo kakve izmjene obavezno pročitaj:
- AGENTS.md
- README.md
- docs/00_PROJECT_RULES.md
- docs/01_BACKEND_ARCHITECTURE_V1.md
- docs/02_DATABASE_SCHEMA_V1.md
- docs/03_API_CONTRACT_V1.md
- docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md
- docs/05_IMPLEMENTATION_CHECKLIST.md
- docs/06_DECISION_LOG.md
- docs/08_TEST_STRATEGY_V1.md
- docs/09_SECURITY_PRIVACY_BASELINE_V1.md
- docs/12_NAMING_AND_CODE_STANDARDS.md

Pregledaj trenutni Git status, postojeći kod, migracije, package fajlove i testove.

Prije pisanja koda prikaži plan:
1. cilj;
2. relevantna pravila;
3. fajlovi za kreiranje;
4. fajlovi za izmjenu;
5. migracije;
6. endpointi;
7. testovi;
8. rizici;
9. pretpostavke;
10. acceptance kriteriji.

Implementiraj isključivo traženi scope.
Ne prelazi u narednu fazu.
Ne koristi prisma db push.
Ne mijenjaj primijenjene migracije.
Ne resetuj bazu ili volume bez eksplicitne dozvole.
Ne zaobilazi TenantDatabaseService za tenant podatke.
Ne loguj medicinski sadržaj ili secrets.
Ne označavaj zadatak završenim dok relevantni testovi ne prođu.

Na kraju:
- navedi rezultat;
- listu fajlova;
- migracije i SQL sigurnosne objekte;
- API promjene;
- sve izvršene komande;
- rezultat svake provjere;
- otvorene probleme;
- ažuriraj docs/05_IMPLEMENTATION_CHECKLIST.md;
- ažuriraj docs/06_DECISION_LOG.md samo ako je donesena nova odluka;
- zaustavi se.
```

---

# Prompt — Faza 1

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 1 — Repository i lokalna infrastruktura iz docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md.

Scope:
- pnpm monorepo;
- NestJS 11 strict API;
- compose PostgreSQL 16, Redis 7, MinIO;
- validated env config;
- Helmet;
- CORS allowlist;
- request ID;
- base Problem Details;
- `/api/v1/health/live`;
- `/api/v1/health/ready`;
- lint, typecheck, test i build scripts.

Ne implementiraj Prisma business modele, auth, RLS, encounter, queue, AI, Tarif Engine ili Axenita.

Posebno:
- zaključi Node/pnpm/Nest/TypeScript verzije;
- predloži ESM ili CommonJS odluku i evidentiraj je u Decision Logu tek nakon tehničke provjere;
- `.env.example` ne smije sadržavati stvarne secrets;
- Docker servisi moraju imati health checks.

Obavezno izvrši acceptance komande faze 1.
Zaustavi se nakon završnog reporta.
```

---

# Prompt — Faza 2

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 2 — Prisma, database role i base migration.

Scope:
- Prisma ORM 7;
- prisma.config.ts;
- schema.prisma generator/output;
- `DATABASE_URL` za copilot_app;
- `MIGRATION_DATABASE_URL` za copilot_migrator;
- init SQL za runtime role;
- DatabaseModule;
- PrismaService singleton;
- migration scripts;
- DB health.

Obavezno dokaži:
- runtime current_user je copilot_app;
- copilot_app nije owner tabela;
- copilot_app ima NOBYPASSRLS;
- copilot_app ne može CREATE TABLE;
- migracija radi na praznoj test bazi;
- prisma validate/generate prolaze.

Ne kreiraj identity ili business tabele osim tehnički nužnih base objekata.
Ne koristi runtime credential za migracije.
```

---

# Prompt — Faza 3

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 3 — Identity i practice domena.

Kreiraj:
- practices;
- users;
- practice_memberships;
- practice_settings;
- migration/grants;
- idempotentan development seed;
- role-to-permission map;
- kontrolisani dev auth;
- GET /api/v1/me;
- osnovni practice read/settings endpoint prema contractu.

Ne implementiraj patient/encounter/RLS poslovne tabele iz naredne faze.
Dev auth mora biti nemoguće uključiti u production bez eksplicitne konfiguracije i startup zaštite.

Dodaj unit/integration/e2e testove za active/inactive user i membership.
```

---

# Prompt — Faza 4

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 4 — Tenant isolation i RLS.

Ovo je kritični security gate.

Kreiraj:
- app_security schema;
- sigurnu security-definer set_request_context funkciju;
- fixed search_path;
- execute grants;
- PracticeContext guard;
- X-Practice-ID validaciju;
- TenantDatabaseService sa Prisma interactive transactionom;
- RLS pattern;
- FORCE RLS;
- A/B tenant integration test harness.

Dokaži testovima:
- practice A ne čita/piše B;
- bez contexta default deny;
- inactive membership ne postavlja context;
- context ne curi između pooled requesta;
- runtime role ne zaobilazi RLS.

Ako bilo koji RLS test ne prolazi, faza mora ostati BLOCKED i ne smiješ nastaviti.
```

---

# Prompt — Faza 5

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 5 — Patient reference, encounter i dokumenti.

Schema:
- patient_references;
- encounters;
- encounter_diagnoses;
- storage_objects;
- encounter_documents;
- composite foreign keys;
- RLS;
- indeksi/checkovi.

API:
- patient reference create/read;
- encounter create/list/detail/update/cancel;
- manual text document create/list/read/archive.

Cross-cutting:
- Idempotency-Key;
- ETag/If-Match;
- encounter state machine;
- HMAC external ID;
- pseudonym;
- encryption service interface;
- local AES-GCM implementation prema odobrenoj odluci ili jasno označenom development adapteru;
- audit;
- outbox base.

Dokaži:
- no plaintext external ID response/log;
- no medical text log;
- original document access audit;
- cross-tenant FK fail;
- stale ETag;
- idempotency replay/conflict.
```

---

# Prompt — Faza 6

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 6 — Tarifne verzije.

Kreiraj:
- system_storage_objects;
- tariff_releases;
- tariff_release_artifacts;
- tariff_catalog_entries;
- tariff_release_activation_history;
- one-active partial unique index;
- mock release seed;
- admin list/create/validate/activate/deactivate API;
- package SHA-256;
- audit.

Ne implementiraj stvarni OAAT paket.
Obični physician ne smije upravljati releaseom.
Testiraj pokušaj aktivacije dvije verzije.
```

---

# Prompt — Faza 7

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 7 — Analysis modeli, jobs i transactional outbox.

Kreiraj:
- ai_prompt_versions;
- analysis_runs;
- analysis_input_snapshots;
- async_jobs;
- kompletni outbox_events;
- analysis state machine;
- POST encounter analysis;
- GET analysis/job;
- BullMQ;
- outbox publisher sa FOR UPDATE SKIP LOCKED;
- mock processor skeleton;
- progress/failure.

HTTP request mora samo kreirati DB command i vratiti 202.
Redis outage ne smije izgubiti analysis command.
Job payload ne smije sadržavati medicinski tekst.
Snapshot mora biti immutable.
```

---

# Prompt — Faza 8

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 8 — Mock AI i Mock Tarif Engine.

Kreiraj schema i kod za:
- ai_extraction_runs;
- extracted_facts;
- service_candidates;
- candidate_evidence;
- tariff_evaluations;
- tariff_evaluation_items;
- tariff_messages;
- AiExtractionProvider;
- deterministic MockAiExtractionProvider;
- output schema validator;
- TariffEngineClient;
- deterministic MockTariffEngineClient;
- pipeline checkpoints;
- workspace endpoint.

Ne pozivaj stvarni AI niti OAAT.
Testiraj invalid AI schema i job retry bez duplikata.
Raw request/response hash mora postojati.
```

---

# Prompt — Faza 9

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 9 — Safety rules.

Kreiraj:
- safety_rules;
- safety_rule_versions;
- rule_findings;
- finding_evidence;
- SafetyRule interface;
- registry;
- determinističko izvršavanje;
- approval readiness;
- findings API.

Minimalna pravila:
- missing consultation duration;
- missing performer role;
- duplicate service;
- inactive/outdated tariff release;
- missing evidence;
- mock flat-rate conflict.

Rule version, blocking i accepted-risk policy moraju biti eksplicitni.
Spriječi duple findings na retryu.
```

---

# Prompt — Faza 10

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 10 — Review i approval.

Kreiraj:
- review_decisions;
- review_item_changes;
- analysis_approvals;
- fact/candidate corrections;
- finding resolution;
- approval policy;
- row lock;
- canonical approved_payload_json;
- SHA-256;
- immutability grants/triggers;
- revocation.

Testiraj:
- open blocker;
- stale revision;
- concurrent double approval;
- edit after approval;
- revoke history;
- approval payload immutability.

Export još ne implementiraj.
```

---

# Prompt — Faza 11

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 11 — Manual export i audit package.

Kreiraj:
- integration_connections;
- external_resource_links;
- export_jobs;
- PracticeSystemAdapter;
- ManualAdapter;
- async export worker;
- JSON billing draft artifact;
- audit events timeline;
- audit package JSON;
- retry.

Export koristi isključivo aktivni approval i isti approved payload hash.
Ne pozivaj Axenita.
PDF je dozvoljen samo ako je odluka o generatoru zaključana; inače ostavi dokumentovan job stub.
```

---

# Prompt — Faza 12

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 12 — Hardening i MVP readiness.

Scope:
- OpenAPI 3.1 file generation;
- contract validation/client smoke;
- kompletan Problem Details;
- rate limiting;
- readiness checks;
- structured logging;
- log redaction;
- no-PHI log tests;
- CI;
- migration deploy test;
- RLS suite;
- full e2e;
- backup/restore scripts i dry run;
- dependency/security scan;
- documentation sync;
- final milestone report.

Ne priključuj stvarni AI, OAAT ili Axenita.
Na kraju popuni finalne acceptance kriterije, ali ne označavaj external integration gates završenim.
```

---

# Prompt za review završene faze

```text
Ne implementiraj novi kod.

Pregledaj upravo završenu fazu kao strogi reviewer prema:
- AGENTS.md
- docs/00_PROJECT_RULES.md
- relevantnom phase scopeu
- docs/08_TEST_STRATEGY_V1.md
- docs/09_SECURITY_PRIVACY_BASELINE_V1.md

Pregledaj git diff, migracije, grants, RLS, DTO, API, testove i dokumentaciju.

Pronađi:
1. security propuste;
2. cross-tenant rizike;
3. nedostajuće constraints;
4. pogrešan transaction boundary;
5. idempotency/retry probleme;
6. PHI/secrets u logovima;
7. odstupanja od API contracta;
8. testove koji daju lažnu sigurnost;
9. scope creep;
10. breaking promjene.

Prikaži nalaze po severity:
- BLOCKER
- HIGH
- MEDIUM
- LOW

Za svaki nalaz navedi fajl, liniju ili objekt, uzrok i tačnu preporuku.
Ne mijenjaj kod dok ne završimo pregled.
```

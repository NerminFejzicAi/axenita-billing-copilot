# 04 — Backend Implementation Plan v1

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot  
**Cilj:** Od praznog repozitorija do testiranog backend MVP-a  
**Metoda:** 12 zatvorenih faza  
**Pravilo:** Jedna faza → testovi → diff → commit → naredna faza

---

# 1. Način korištenja

Za svaku fazu:

1. kreirati poseban Git branch;
2. kopirati odgovarajući prompt iz `07_CURSOR_PHASE_PROMPTS.md`;
3. dozvoliti Cursoru da prvo prikaže plan;
4. provjeriti da plan ne prelazi scope;
5. pokrenuti implementaciju;
6. zahtijevati sve provjere;
7. pregledati završni izvještaj;
8. pregledati `git diff`;
9. ažurirati checklistu;
10. commitovati;
11. tek tada otvoriti naredni branch/fazu.

Ne pokretati više faza paralelno.

---

# 2. Globalni prerequisites

Prije faze 1:

- Git instaliran;
- Docker Desktop radi;
- Node.js LTS instaliran;
- Corepack/pnpm dostupan;
- Cursor otvoren nad root folderom;
- dokumentacijski paket kopiran u root;
- nema nepoznatih Git promjena;
- project owner potvrđuje stack iz Decision Loga.

---

# 3. Faza 1 — Repository i lokalna infrastruktura

## 3.1 Cilj

Kreirati stabilan monorepo i lokalne servise bez business domena.

## 3.2 Branch

```text
backend/01-bootstrap-infrastructure
```

## 3.3 Scope

Kreirati:

```text
package.json
pnpm-workspace.yaml
.gitignore
.editorconfig
.env.example
compose.yaml
apps/api
services/tariff-engine-java placeholder
packages/contracts
infra/database/init
scripts
```

NestJS API:

- strict TypeScript;
- config module;
- request ID;
- Helmet;
- CORS allowlist;
- global prefix/versioning;
- validation pipe;
- health live endpoint.

Docker:

- PostgreSQL 16;
- Redis 7;
- MinIO;
- persistent volumes;
- health checks.

## 3.4 Ne implementirati

- Prisma business modele;
- auth;
- RLS;
- AI;
- queue jobs;
- encounter;
- frontend;
- Axenita;
- OAAT.

## 3.5 Tačne aktivnosti

1. inicijalizovati Git/pnpm workspace;
2. generisati NestJS app;
3. zaključati Node/Nest/TypeScript/pnpm verzije;
4. konfigurirati lint/format/typecheck;
5. kreirati compose;
6. kreirati validated environment config;
7. kreirati `/api/v1/health/live`;
8. kreirati `/api/v1/health/ready` sa inicijalnim lokalnim checkovima;
9. dodati scripts;
10. dodati minimalne testove.

## 3.6 Obavezne komande

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
docker compose up -d
docker compose ps
```

## 3.7 Acceptance

- svi containeri healthy;
- API starta;
- live 200;
- ready ima strukturiran rezultat;
- `.env` nije commitovan;
- `.env.example` nema stvarne secrets;
- nema business tabela.

## 3.8 Commit

```text
chore(backend): bootstrap monorepo and local infrastructure
```

---

# 4. Faza 2 — Prisma, database role i base migration

## 4.1 Branch

```text
backend/02-prisma-database-roles
```

## 4.2 Cilj

Odvojiti migrator i runtime role i uspostaviti siguran Prisma workflow.

## 4.3 Scope

- Prisma 7;
- `schema.prisma`;
- `prisma.config.ts`;
- generated client output;
- `MIGRATION_DATABASE_URL`;
- `DATABASE_URL`;
- `copilot_migrator`;
- `copilot_app`;
- DatabaseModule;
- PrismaService;
- migration scripts;
- DB health.

## 4.4 Aktivnosti

1. instalirati Prisma i pg adapter;
2. zaključati module format;
3. konfigurirati migrator URL;
4. kreirati runtime role init SQL;
5. potvrditi `NOBYPASSRLS`;
6. kreirati praznu/base migraciju;
7. kreirati PrismaService singleton;
8. zabraniti runtime korištenje migrator URL-a;
9. dodati DB connectivity test;
10. dokumentovati migration workflow.

## 4.5 Testovi

- `prisma format`;
- `prisma validate`;
- migrate na praznu bazu;
- runtime konekcija;
- query current_user = `copilot_app`;
- owner tabele nije `copilot_app`;
- `copilot_app` ne može CREATE TABLE.

## 4.6 Stop uslov

Ako runtime koristi migrator credential, faza nije završena.

## 4.7 Commit

```text
feat(database): establish prisma workflow and separated database roles
```

---

# 5. Faza 3 — Identity i practice domena

## 5.1 Branch

```text
backend/03-identity-practices
```

## 5.2 Scope

Tabele:

- practices;
- users;
- practice_memberships;
- practice_settings.

API:

- `GET /me`;
- `GET /practices/{id}`;
- settings read/patch može biti minimalni stub ako auth još nije kompletan.

Development identity:

- kontrolisani dev auth guard ili signed dev JWT;
- nikada production fallback.

Ograničenja iz D-033:

- `practice_memberships` se kreira u ovoj fazi, ali njena **bootstrap RLS politika pripada
  Fazi 4**. U Fazi 3 se na nju ne postavlja RLS;
- `GET /me` vraća identitet pozivaoca, njegove `memberships` i njegove `platformRoles` kao
  **dva odvojena bloka** prema `03` §10. `platformRoles` se nikada ne prikazuju kao
  memberships niti se sa njima spajaju.

**Blocker — D-OPEN-011 je otvoren:**

- ne implementirati neograničen ni generički runtime pristup nad `users` i `practices`;
- tačan runtime access model za te dvije tabele **nije riješen**;
- implementacijski rad koji zavisi od tog modela **staje na phase gateu** dok odluka ne bude
  prihvaćena;
- bootstrap pristup kroz `practice_memberships` **ne rješava implicitno** opšti pristup nad
  `users` ni `practices`.

Seed:

- demo practice;
- admin;
- physician;
- memberships;
- settings.

## 5.3 Aktivnosti

1. Prisma modeli;
2. migration custom grants;
3. seed;
4. repositories/services;
5. dev auth subject resolution;
6. role-to-permission map;
7. DTO i OpenAPI;
8. unit/integration test.

## 5.4 Acceptance

- seed idempotentan;
- user se resolva po auth subjectu;
- inactive membership odbijen;
- `/me` vraća `memberships` i `platformRoles` kao dva odvojena bloka;
- `platformRoles` se ne pretvaraju u tenant membershipe;
- nema neograničenog runtime reada nad `users` ni `practices` (D-OPEN-011);
- nema password tabele;
- permission strings centralizovani.

## 5.5 Commit

```text
feat(identity): add practices users memberships and settings
```

---

# 6. Faza 4 — Tenant isolation i RLS

## 6.1 Branch

```text
backend/04-tenant-rls
```

## 6.2 Kritičnost

Ovo je sigurnosni gate. Ne nastavljati ako bilo koji RLS test ne prolazi.

### 6.2.1 Normativni model tenant bootstrapa (D-033)

Normativna odluka je **D-033** iz `06`. Implementacija tačno prati `02` §16.2, §16.2a i
§17.3, te `03` §3.

Obavezni redoslijed:

1. validiraj bearer token;
2. rezolviraj autentifikovanog aplikacijskog korisnika;
3. uspostavi identitet autentifikovanog korisnika u transakciji/sesiji —
   `set_user_context`, transakcijski lokalni `app.user_id`;
4. pročitaj traženi tenant identifikator iz `X-Practice-ID`;
5. pozovi `set_request_context(p_practice_id uuid)`;
6. evaluiraj **aktivan** membership kroz user-scoped `practice_memberships` RLS politiku;
7. postavi transakcijski lokalni practice context `app.practice_id` **tek nakon** uspješne
   membership validacije;
8. izvrši tenant-scoped upite;
9. završi transakciju — request context se automatski čisti.

### 6.2.2 Obavezna pravila

- membership bootstrap mora raditi **prije nego tenant practice context postoji**;
- zato `practice_memberships` koristi svoju posebnu user-scoped bootstrap politiku;
- **normalna tenant RLS se ne može koristiti za bootstrap konteksta koji ta ista RLS
  zahtijeva** — ciklična zavisnost; faza ostaje BLOCKED ako je tako implementirana;
- **nije dozvoljen SECURITY DEFINER bypass**;
- **ne vjeruje se caller-provided `user_id`**; funkcija ga ne prima;
- `X-Practice-ID` je **nepouzdan traženi tenant identifikator** dok membership validacija ne
  uspije;
- nevažeći, neaktivan ili nepostojeći membership mapira se na **403 na API sloju**;
- neuspjeh bootstrapa **ne smije ostaviti upotrebljiv practice context**;
- transakcijski lokalni kontekst **ne smije procuriti** u kasniji request ni u pooled
  konekciju;
- platform rute koriste **odvojena platform authorization pravila** (`03` §3.3);
- tenant membershipi i `platformRoles` se **ne kombinuju automatski**;
- opšti runtime pristup nad `users` i `practices` ostaje **blokiran po D-OPEN-011**.

### 6.2.3 Vlasništvo faze i migration paketa

| Artefakt | Faza | Migration paket (`02` §22) |
|---|---|---|
| autentifikovani user context (auth subject → `users.id`) | Faza 3 | `002_identity_and_practices` |
| `practice_memberships` bootstrap RLS | Faza 4 | `013_rls_policies` |
| `set_request_context(p_practice_id uuid)` | Faza 4 | `013_rls_policies` |
| `set_user_context(p_user_id uuid)` | Faza 4 | `013_rls_policies` |
| transakcijski lokalne tenant varijable | Faza 4 | `013_rls_policies` |
| redoslijed request middlewarea | Faza 3 auth guard → Faza 4 practice guard | — |
| negativni membership testovi | Faza 4 | — |
| testovi curenja konteksta na pooled konekciji | Faza 4 | — |

Brojevi migration paketa u `02` §22 su **redoslijed zavisnosti, ne brojevi faza**. Paket
`013_rls_policies` već posjeduje ove objekte — ne uvodi se novi broj paketa i ne mijenja se
postojeća numeracija.

## 6.3 Scope

- `app_security` schema;
- `app_security.set_user_context(p_user_id uuid)`;
- `app_security.set_request_context(p_practice_id uuid)` — **SECURITY INVOKER**;
- fiksiran `search_path` na obje funkcije;
- execute grants za `copilot_app`;
- `ENABLE` i `FORCE RLS` na `practice_memberships`;
- user-scoped bootstrap self-select politika na `practice_memberships`;
- PracticeContext guard;
- TenantDatabaseService;
- RLS policy za postojeće tenant tabele;
- force RLS;
- integration testovi;
- negative testovi.

U ovoj fazi može se kreirati minimalna test tenant tabela ili primijeniti RLS na settings gdje je primjenjivo. Ako patient/encounter tabele još ne postoje, obavezno uspostaviti pattern i test harness koji će se proširiti u fazi 5.

`practice_memberships` je izuzetak: ona dobija **bootstrap politiku vezanu za `app.user_id`**, ne standardni tenant predikat `practice_id = app.practice_id`. Standardni predikat bi bio cikličan, jer se ta tabela čita upravo da bi se tenant context uopšte mogao postaviti (§6.2.2).

## 6.4 Aktivnosti

Redoslijed prati §6.2.1.

1. `set_user_context(p_user_id uuid)` — uspostavlja `app.user_id`;
2. user-scoped bootstrap politika na `practice_memberships`;
3. `set_request_context(p_practice_id uuid)` kao **SECURITY INVOKER**, bez `user_id`
   parametra;
4. siguran, fiksiran search path na obje funkcije;
5. membership validacija kroz bootstrap politiku, prije postavljanja tenant konteksta;
6. transaction context — `app.practice_id` tek nakon uspješne validacije;
7. guard čita `X-Practice-ID` i tretira ga kao **nepouzdan** dok validacija ne uspije;
8. request context decorator;
9. RLS helper migration;
10. test practice A/B;
11. test no context;
12. test inactive membership;
13. test runtime owner/bypass.

## 6.5 Acceptance

- A ne vidi B;
- B ne vidi A;
- bez contexta 0 row/default deny;
- invalid membership ne može setovati context;
- context se ne prenosi na drugi pooled request;
- business repository koristi TenantDatabaseService;
- test dokazuje istu transakciju.

Obavezni D-033 testovi:

- aktivan membership uspostavlja tenant context;
- membership koji ne postoji vraća `403`;
- neaktivan membership vraća `403`;
- pozivalac ne može impersonirati drugog korisnika kroz parametar funkcije;
- `X-Practice-ID` sam po sebi ne može odabrati tenant;
- tenant-scoped upit prije bootstrapa pada;
- SECURITY INVOKER ne zaobilazi membership RLS;
- neuspjeh bootstrapa ne ostavlja tenant context;
- transakcijski lokalni kontekst nestaje na kraju transakcije;
- pooled konekcija ne nasljeđuje kontekst prethodnog requesta;
- `platformRoles` ne kreiraju tenant membership;
- opšti runtime pristup nad `users` i `practices` ostaje blokiran do D-OPEN-011.

## 6.6 Commit

```text
feat(security): enforce tenant isolation with transactional RLS context
```

---

# 7. Faza 5 — Patient reference, encounter i dokumenti

## 7.1 Branch

```text
backend/05-encounters-documents
```

## 7.2 Scope baze

- patient_references;
- encounters;
- encounter_diagnoses;
- storage_objects;
- encounter_documents;
- composite FK;
- RLS;
- indeksi.

## 7.3 Scope API-ja

```text
POST /patient-references
GET  /patient-references/{id}

POST /encounters
GET  /encounters
GET  /encounters/{id}
PATCH /encounters/{id}
POST /encounters/{id}/cancel

POST /encounters/{id}/documents/text
GET  /encounters/{id}/documents
GET  /encounters/{id}/documents/{documentId}
POST /encounters/{id}/documents/{documentId}/archive
```

## 7.4 Cross-cutting

- idempotency;
- optimistic locking;
- state machine;
- encryption abstraction;
- hash;
- audit;
- outbox base tables mogu biti uvedene ovdje ili najkasnije u fazi 7.

Preporuka: u fazi 5 uvesti `audit_events` i minimalni `outbox_events`, jer business command ne treba postojati bez audita.

## 7.5 Aktivnosti

1. schema/migration;
2. composite FK;
3. RLS policies;
4. DTO;
5. repositories;
6. state machine;
7. HMAC/pseudonym service;
8. encryption service interface + local implementation;
9. text normalization;
10. redaction mock/basic rule;
11. audit events;
12. idempotency service;
13. ETag/If-Match;
14. e2e.

## 7.6 Acceptance

- duplicate idempotency vraća isti resurs;
- isti key drugi body 409;
- stale If-Match 409;
- A ne vidi B;
- cross-tenant FK fail;
- original external ID nije u responseu/logu;
- document view audit;
- medical text nije u logu;
- DRAFT → READY prema dokument policy.

## 7.7 Commit

```text
feat(encounters): add patient references encounters and secure documents
```

---

# 8. Faza 6 — Tarifne verzije

## 8.1 Branch

```text
backend/06-tariff-releases
```

## 8.2 Scope

- system storage;
- tariff releases;
- artifacts;
- catalog;
- activation history;
- admin API;
- one-active constraint;
- mock release seed.

## 8.3 Aktivnosti

1. global schema;
2. runtime read/admin write prava;
3. import metadata;
4. SHA-256;
5. validate command;
6. activate transaction;
7. deactivate;
8. audit;
9. OpenAPI;
10. test two-active rejection.

## 8.4 Acceptance

- tačno jedna active;
- invalid release se ne aktivira;
- activation audit;
- package hash postoji;
- obični physician ne upravlja releaseom;
- mock release dostupan analysis fazi.

## 8.5 Commit

```text
feat(tariffs): add versioned tariff release management
```

---

# 9. Faza 7 — Analysis modeli, jobs i outbox

## 9.1 Branch

```text
backend/07-analysis-queue
```

## 9.2 Scope baze

- ai_prompt_versions;
- analysis_runs;
- analysis_input_snapshots;
- async_jobs;
- outbox_events final;
- idempotency final;
- audit expansion.

## 9.3 Scope aplikacije

- analysis creation;
- revision numbering;
- immutable snapshot builder;
- BullMQ config;
- outbox publisher;
- mock processor skeleton;
- job status API.

## 9.4 Aktivnosti

1. migration;
2. analysis state machine;
3. POST analysis;
4. DB transaction analysis+job+outbox;
5. publisher `SKIP LOCKED`;
6. queue job;
7. processor;
8. progress;
9. failure path;
10. retry idempotency;
11. GET analysis/job.

## 9.5 Acceptance

- HTTP vraća 202;
- Redis down ne gubi DB command;
- publisher nakon povratka enqueuea;
- duplicate publish ne kreira dupli analysis rezultat;
- snapshot je immutable;
- job payload nema text;
- failure ostavlja DB status.

## 9.6 Commit

```text
feat(analysis): add revisioned analysis jobs with transactional outbox
```

---

# 10. Faza 8 — Mock AI i Mock Tarif Engine

## 10.1 Branch

```text
backend/08-mock-ai-tariff
```

## 10.2 Scope baze

- ai_extraction_runs;
- extracted_facts;
- service_candidates;
- candidate_evidence;
- tariff_evaluations;
- tariff_evaluation_items;
- tariff_messages.

## 10.3 Scope koda

- provider interfaces;
- mock AI;
- AI schema validator;
- tariff client interface;
- mock tariff client;
- analysis pipeline;
- workspace endpoint.

## 10.4 Aktivnosti

1. contracts;
2. deterministic mock fixture;
3. request/response hash;
4. persist facts/candidates;
5. evidence offsets;
6. mock tariff mapping;
7. raw+normalized result;
8. pipeline checkpoints;
9. retry from failed step;
10. workspace aggregate.

## 10.5 Acceptance

- end-to-end analysis završava;
- AI invalid schema fail;
- mock deterministic;
- duplicate retry ne duplicira facts/items;
- raw hashes postoje;
- workspace ne izlaže raw medical secret;
- no real external API.

## 10.6 Commit

```text
feat(analysis): implement mock AI and tariff evaluation pipeline
```

---

# 11. Faza 9 — Safety rules

## 11.1 Branch

```text
backend/09-safety-rules
```

## 11.2 Scope

- safety_rules;
- safety_rule_versions;
- rule_findings;
- finding_evidence;
- TypeScript rule interface;
- registry;
- first rules;
- findings API;
- approval readiness calculation.

## 11.3 Minimalna pravila

1. missing consultation duration;
2. missing performer role;
3. duplicate service candidate;
4. outdated/inactive tariff release;
5. unsupported candidate evidence;
6. flat-rate inclusion conflict mock.

## 11.4 Acceptance

- rule version u findingu;
- deterministički ponovljiv rezultat;
- duplicate finding prevention;
- blocking policy;
- accepted risk policy;
- evidence;
- findings filtering;
- cross-tenant test.

## 11.5 Commit

```text
feat(rules): add versioned safety rules and review findings
```

---

# 12. Faza 10 — Review i approval

## 12.1 Branch

```text
backend/10-review-approval
```

## 12.2 Scope

- review_decisions;
- review_item_changes;
- analysis_approvals;
- correction endpoints;
- finding resolution;
- approval policy;
- immutable payload;
- revocation;
- database triggers.

## 12.3 Aktivnosti

1. migration;
2. review services;
3. correction reason;
4. new revision requirement;
5. approval readiness;
6. row lock;
7. payload builder;
8. canonical hash;
9. immutable grant/trigger;
10. revoke;
11. audit;
12. e2e concurrency test.

## 12.4 Acceptance

- open blocker prevents approval;
- stale revision prevents approval;
- concurrent double approval creates one;
- approved payload immutable;
- candidate modification after approval fail;
- revoke ne briše history;
- export readiness false after revoke.

## 12.5 Commit

```text
feat(review): add controlled corrections and immutable approvals
```

---

# 13. Faza 11 — Manual export i audit package

## 13.1 Branch

```text
backend/11-manual-export-audit
```

## 13.2 Scope

- integration_connections;
- external_resource_links;
- export_jobs;
- PracticeSystemAdapter;
- ManualAdapter;
- JSON export;
- audit package JSON;
- PDF job stub ili implementacija ako library odluka postoji.

## 13.3 Aktivnosti

1. adapter interface;
2. manual connection seed/config;
3. export command;
4. approval hash check;
5. async export;
6. object artefact;
7. audit timeline;
8. audit package;
9. retry;
10. failure.

## 13.4 Acceptance

- bez approvala 409;
- revoked approval 409;
- isti payload hash;
- retry idempotentan;
- output sadrži final items i audit summary;
- nema neodobrenog data sourcea;
- Axenita još nije pozvana.

## 13.5 Commit

```text
feat(exports): add manual billing draft export and audit package
```

---

# 14. Faza 12 — Hardening i pilot readiness

## 14.1 Branch

```text
backend/12-hardening-pilot-readiness
```

## 14.2 Scope

- OpenAPI 3.1 export;
- contract checks;
- rate limiting;
- ready health;
- structured logging/redaction;
- CI;
- backup/restore scripts;
- security tests;
- performance smoke;
- dependency scanning;
- documentation sync.

## 14.3 Aktivnosti

1. generate `docs/api/openapi-v1.json`;
2. client generation smoke;
3. Problem Details coverage;
4. rate limit;
5. health dependencies;
6. log redaction tests;
7. test DB containers;
8. full e2e;
9. CI;
10. backup/restore dry run;
11. compose production-like test;
12. milestone report.

## 14.4 Acceptance

- svi DoD kriteriji;
- CI green;
- migrations clean;
- RLS suite green;
- no secrets;
- no PHI log fixture;
- audit reconstruction;
- baseline performance;
- otvorene external dependencies jasno dokumentovane.

## 14.5 Commit

```text
chore(backend): harden API and complete MVP readiness gates
```

---

# 15. Nakon MVP core milestonea

Tek poslije faze 12:

## 15.1 Stvarni AI

- provider security/DPA;
- schema;
- redaction;
- baseline extraction tests;
- cost/latency;
- no training/retention konfiguracija.

## 15.2 Stvarni Tarif Engine

- licenca;
- package import;
- Java wrapper;
- contract test;
- baseline slučajevi;
- release loading;
- version health.

## 15.3 Axenita

- partner ugovor;
- sandbox;
- endpoint contract;
- webhook/auth;
- import mapping;
- draft write-back;
- reconciliation;
- audit attachment.

Svaka je zaseban epic, ne dio core faza.

---

# 16. Globalni stop kriteriji

Ne nastavljati narednu fazu ako:

- migracija ne prolazi na praznoj bazi;
- runtime role je owner;
- RLS test ne prolazi;
- cross-tenant test ne prolazi;
- lint/typecheck/build fail;
- test je preskočen bez razloga;
- dokumentacija nije ažurirana;
- unknown changes postoje u Git treeju;
- scope je prešao u narednu fazu;
- PHI se pojavljuje u logu/Redis payloadu.

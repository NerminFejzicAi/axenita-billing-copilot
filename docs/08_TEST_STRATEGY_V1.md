# 08 — Test Strategy v1

**Cilj:** Dokazati funkcionalnu ispravnost, tenant izolaciju, auditabilnost, idempotency i sigurnost backend MVP-a.

---

# 1. Principi

- Testovi su release gate, ne pomoćna dokumentacija.
- Security invariant mora imati negative test.
- Test koji samo mockuje sve zavisnosti ne dokazuje database sigurnost.
- RLS se testira sa stvarnim PostgreSQL-om i runtime rolom.
- Migracije se testiraju na praznoj bazi.
- Queue retry se testira sa stvarnim Redisom gdje je relevantno.
- OpenAPI contract se validira u CI-u.
- Svaki bug iz kritične oblasti dobija regression test.

---

# 2. Test piramida

## 2.1 Unit

Testiraju:

- state machine;
- canonical JSON/hash;
- pseudonym format;
- permission map;
- approval policy;
- safety rules;
- mapping;
- redaction helpers;
- retry classification.

Ne koriste stvarnu bazu.

## 2.2 Integration

Testiraju:

- Prisma repository;
- transaction boundary;
- composite FK;
- RLS;
- grants;
- triggers;
- outbox;
- idempotency unique;
- row lock;
- object storage adapter lokalno.

Koriste stvarni PostgreSQL/Redis/MinIO u test okruženju.

## 2.3 API e2e

Testiraju HTTP:

- auth;
- practice context;
- DTO;
- status;
- headers;
- idempotency;
- optimistic locking;
- business workflow;
- audit.

## 2.4 Contract

- OpenAPI validity;
- generated client compile;
- internal Tarif Engine schema;
- adapter fixtures;
- Problem Details shape.

## 2.5 Baseline

Kada stvarni AI/tariff bude dostupan:

- fixed anonymized input;
- expected facts;
- allowed candidates;
- expected tariff path;
- expected messages/findings;
- version-specific snapshot.

---

# 3. Test okruženje

Odvojeno:

```text
copilot_dev
copilot_test
```

Test DB credential nije production/dev credential.

Preporuka:

- Testcontainers ili compose test profile.
- Migracije se uvijek primjenjuju od nule.
- Seed je minimalan.
- Svaki suite čisti svoje tenant podatke bez destruktivnog resetovanja tuđe baze.

Za CI:

```text
PostgreSQL 16
Redis 7
MinIO
```

---

# 4. Naming

```text
*.spec.ts        unit
*.integration.ts integration
*.e2e-spec.ts    API e2e
*.contract.ts    contract
*.security.ts    security/RLS
```

Test opis:

```text
given / when / then
```

Primjer:

```text
given active membership in practice A
when user requests encounter from practice B
then API returns 404 and no audit detail leaks existence
```

---

# 5. Database migration test

Za svaku migration promjenu:

1. kreirati praznu test bazu;
2. `prisma migrate deploy`;
3. `prisma validate`;
4. introspection/check SQL;
5. seed;
6. application smoke;
7. RLS/grant test.

Provjeriti:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';

select rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin, rolbypassrls
from pg_roles
where rolname in ('copilot_app','copilot_migrator','copilot_system');

select tableowner
from pg_tables
where tablename = 'encounters';
```

## 5.1 Database role verifikacija (D-023)

Vlasnik migracije: **`001_extensions_and_roles`** (`02` §22.1). Ne uvodi se novi paket.

Prihvaćeni model ima **tri** database role (`02` §3.1–§3.3). Provjera mora obuhvatiti sve tri;
izostanak bilo koje je defekt migracije, ne propust testa.

| Rola | Credential | Uloga |
|---|---|---|
| `copilot_migrator` | `MIGRATION_DATABASE_URL` | vlasnik schema objekata, migracije |
| `copilot_app` | `DATABASE_URL` | tenant runtime upiti, podliježe RLS-u |
| `copilot_system` | `SYSTEM_DATABASE_URL` | platform/tarifne operacije |

`copilot_system` je **namjenska system/platform database rola iz D-023**, odvojena od tenant
aplikacijskog pristupa kroz `copilot_app`.

**`SYSTEM_ADMIN` nije `copilot_system`.** `SYSTEM_ADMIN` je aplikacijska platform rola iz
`02` §4.16, pohranjena u `platform_role_assignments`; `copilot_system` je database rola. Test
koji ih izjednačava je pogrešan.

### Obavezne asercije po roli

Za `copilot_app` i `copilot_system` — atributi tačno prema `02` §3.2 i §3.3:

```text
rolcanlogin    = true
rolsuper       = false
rolcreatedb    = false
rolcreaterole  = false
rolinherit     = false
rolbypassrls   = false
```

Za `copilot_migrator` prema `02` §3.1 — `createdb`, `nocreaterole`, `inherit`, i nije runtime
rola.

Nijedna od tri role nije `tableowner` osim `copilot_migrator`.

### Negativne asercije

- **migracija koja ne kreira `copilot_system` mora oboriti test** — provjera postojanja role
  je eksplicitna, ne izvedena iz uspjeha migracije;
- `copilot_system` **nema nijedan grant nad tenant tabelama** (`02` §3.5, §20.2) — provjeriti
  kroz `information_schema.role_table_grants`, ne samo kroz aplikacijski poziv;
- `copilot_system` nema `DELETE` nad `system_storage_objects`;
- `copilot_system` UPDATE izvan `(sha256, byte_size, antivirus_status)` pada (`02` §9.3.1);
- `copilot_app` nema INSERT ni UPDATE nad globalnom tarifnom konfiguracijom;
- nijedna runtime rola nema `BYPASSRLS` ni blanket `ALL PRIVILEGES`;
- nijedna runtime rola nije owner;
- **širi grant od prihvaćenog least-privilege modela obara test** — asercije su na tačan skup
  privilegija, ne na „barem ovo".

`copilot_system` **ne dobija tenant membership pristup** ni pod kojim uslovom. Nijedan test ne
smije implicirati suprotno; tenant pristup i dalje zahtijeva aktivan `practice_memberships`
red i bootstrap iz §21.

---

# 6. RLS test matrica

Za svaku tenant tabelu minimalno:

| Test | Očekivanje |
|---|---|
| A SELECT A | success |
| A SELECT B | 0 rows |
| A INSERT A | success ako grant |
| A INSERT B practice_id | denied |
| A UPDATE A | success ako dozvoljeno |
| A UPDATE B | 0/denied |
| no context SELECT | 0 rows |
| invalid member context | exception |
| inactive member context | exception |
| runtime owner bypass | false |
| pooled next request | nema prethodnog contexta |

Kritične tabele dodatno:

- analysis snapshot update denied;
- audit update/delete denied;
- approved result update denied.

---

# 7. Composite FK test

Fixtures:

```text
Practice A
  Patient A
  Encounter A

Practice B
  Patient B
  Encounter B
```

Pokušaji:

- Encounter A → Patient B;
- Candidate A → Analysis B;
- Evidence A → Document B;
- Export A → Approval B.

Svaki mora pasti na database constraintu, ne samo application validationu.

---

# 8. Auth testovi

- missing token → 401;
- malformed token → 401;
- expired → 401;
- wrong issuer → 401;
- wrong audience → 401;
- unknown subject → 401/403 prema policy;
- inactive user → 403;
- dev auth u production startupu → startup fail;
- missing practice header → 400;
- invalid UUID → 400;
- non-member → 403;
- missing permission → 403.

---

# 9. Idempotency testovi

Za svaki command endpoint:

1. prvi request → expected success;
2. isti key, isti body → isti resurs/response;
3. isti key, različit body → 409;
4. paralelni isti key → samo jedna poslovna posljedica;
5. failed operation prije commit → key ne ostaje lažno completed;
6. completed response ne sadrži medicinski tekst;
7. expired key cleanup ne briše poslovni resurs.

---

# 10. Optimistic locking

Normativno: D-028 i D-029; `03` §5.

- GET ETag 1;
- PATCH If-Match 1 → success, ETag 2;
- drugi PATCH If-Match 1 → **`409 VERSION_CONFLICT`**;
- PATCH bez obaveznog If-Match → **`428 PRECONDITION_REQUIRED`**;
- `400` se za nedostajući `If-Match` **ne koristi** (D-028, klauzula 2);
- response sadrži currentVersion;
- audit bilježi uspješnu promjenu, ne neuspješni overwrite kao business change.

Sva tri slučaja testirati za svih šest optimistic-locking resursa iz D-029:

```text
encounters
practice_settings
integration_connections
extracted_facts
service_candidates
rule_findings
```

---

# 11. State machine testovi

Normativni izvor za oba state machinea je `03` §29 (D-027, D-031). Testovi su table-driven i
generišu se iz jedne liste po mašini.

Terminalni markeri iz Mermaid dijagrama u `14` (`--> [*]`) **nisu domenske tranzicije** i ne
broje se.

## 11.1 Encounter

Normativno: `03` §29.1 (D-027). **15 dozvoljenih tranzicija:**

```text
DRAFT                 → READY_FOR_ANALYSIS
DRAFT                 → CANCELLED
READY_FOR_ANALYSIS    → ANALYSIS_IN_PROGRESS
READY_FOR_ANALYSIS    → CANCELLED
ANALYSIS_IN_PROGRESS  → REVIEW_REQUIRED
ANALYSIS_IN_PROGRESS  → READY_FOR_ANALYSIS
ANALYSIS_IN_PROGRESS  → CANCELLED
REVIEW_REQUIRED       → APPROVED
REVIEW_REQUIRED       → ANALYSIS_IN_PROGRESS
REVIEW_REQUIRED       → CANCELLED
APPROVED              → EXPORT_PENDING
APPROVED              → REVIEW_REQUIRED
EXPORT_PENDING        → EXPORTED
EXPORT_PENDING        → APPROVED
EXPORTED              → CLOSED
```

Zabranjeno je **svako** drugo uparivanje stanja. Eksplicitno testirati barem:

```text
CANCELLED → CLOSED
CANCELLED → ANALYSIS_IN_PROGRESS
CLOSED → DRAFT
CLOSED → EXPORTED
EXPORTED → DRAFT
DRAFT → APPROVED
ANALYSIS_IN_PROGRESS → APPROVED
```

Dodatno:

- `CANCELLED` i `CLOSED` su terminalna — nijedan izlaz;
- `REJECT` odluka nad analizom **ne mijenja** encounter status;
- svaka zabranjena tranzicija vraća `409 INVALID_STATE_TRANSITION`.

## 11.2 Analysis

Normativno: `03` §29.2 (D-031). **23 dozvoljene tranzicije:**

```text
QUEUED                    → PREPARING_INPUT
QUEUED                    → CANCELLED
PREPARING_INPUT           → EXTRACTING
PREPARING_INPUT           → FAILED
PREPARING_INPUT           → CANCELLED
EXTRACTING                → EVALUATING_TARIFF
EXTRACTING                → EXTRACTION_FAILED
EXTRACTING                → CANCELLED
EXTRACTION_FAILED         → EXTRACTING
EVALUATING_TARIFF         → APPLYING_SAFETY_RULES
EVALUATING_TARIFF         → TARIFF_EVALUATION_FAILED
EVALUATING_TARIFF         → CANCELLED
TARIFF_EVALUATION_FAILED  → EVALUATING_TARIFF
APPLYING_SAFETY_RULES     → REVIEW_REQUIRED
APPLYING_SAFETY_RULES     → COMPLETED
APPLYING_SAFETY_RULES     → FAILED
APPLYING_SAFETY_RULES     → CANCELLED
REVIEW_REQUIRED           → APPROVED
REVIEW_REQUIRED           → REJECTED
REVIEW_REQUIRED           → SUPERSEDED
COMPLETED                 → APPROVED
COMPLETED                 → SUPERSEDED
APPROVED                  → REVIEW_REQUIRED
```

Zabranjeno je **svako** drugo uparivanje. Eksplicitno testirati barem:

```text
APPROVED → SUPERSEDED
EXTRACTION_FAILED → EVALUATING_TARIFF
TARIFF_EVALUATION_FAILED → EXTRACTING
FAILED → EXTRACTING
FAILED → PREPARING_INPUT
REJECTED → REVIEW_REQUIRED
SUPERSEDED → REVIEW_REQUIRED
CANCELLED → QUEUED
```

Dodatno:

- `CANCELLED`, `FAILED`, `REJECTED` i `SUPERSEDED` su terminalna;
- retry se vraća isključivo na svoj korak — `EXTRACTION_FAILED → EXTRACTING` i
  `TARIFF_EVALUATION_FAILED → EVALUATING_TARIFF`, nikada naprijed;
- generički `FAILED` nema automatsku retry tranziciju;
- `SUPERSEDED` se dostiže isključivo iz `REVIEW_REQUIRED` ili `COMPLETED`;
- `APPROVED` mora prvo biti revoked prije nego ga druga revizija zamijeni;
- child revizija nad `REJECTED` ili `FAILED` roditeljem **ne mijenja** status roditelja (§22).

---

# 12. Document sigurnost

- source plaintext ne postoji u logu;
- external ID ne postoji u responseu;
- ciphertext nije jednak plaintextu;
- decrypt sa pogrešnim key/version fail;
- tampered auth tag fail;
- redacted view bez original permission;
- original view sa permission + audit;
- archive ne briše historijski hash;
- oversized upload 413;
- unsupported MIME 415;
- hash mismatch fail.

---

# 13. Analysis/outbox/queue

## HTTP

- valid request → analysis/job/outbox u jednoj transakciji;
- Redis down → HTTP command može biti accepted ako DB commit uspije;
- no document → 409;
- active analysis → 409;
- cancelled encounter → 409.

## Publisher

- unpublished event enqueue;
- published timestamp;
- crash nakon enqueue prije update → duplicate enqueue ne duplira rezultat;
- SKIP LOCKED dva publishera;
- poison event attempts/error.

## Processor

- deterministic job;
- retry from checkpoint;
- no duplicate snapshot;
- no duplicate facts;
- no duplicate tariff eval;
- no duplicate findings;
- failure status;
- job payload no medical text.

---

# 14. AI extraction

Mock:

- expected fixed output;
- invalid JSON;
- schema mismatch;
- confidence out of range;
- unknown fact type;
- invalid offsets;
- invalid quantity;
- provider timeout;
- provider retry classification;
- response hash.

Stvarni provider kasnije:

- anonymized baseline set;
- false positive;
- false negative;
- German abbreviations;
- empty note;
- contradictory note;
- prompt injection content treated as document text;
- identifier redaction.

---

# 15. Tariff Engine

Mock:

- TARDOC result;
- flat-rate result;
- not billable;
- warning;
- mapper adjustment;
- timeout;
- 400 no retry;
- 503 retry;
- invalid schema;
- version mismatch.

Stvarni engine:

- official baseline fixtures;
- release-specific expected output;
- backward historical replay;
- health loaded release;
- package hash.

---

# 16. Safety rules

Svako pravilo:

- positive trigger;
- negative no-trigger;
- boundary;
- missing input;
- version metadata;
- dedup retry;
- evidence;
- blocking;
- accepted risk allowed/forbidden.

Rule registry:

- samo active;
- tačna verzija;
- deterministic order;
- duplicate code fail.

---

# 17. Approval

- no tariff eval;
- analysis failed;
- superseded;
- open critical;
- open blocking error;
- warning without ack;
- correction without reason;
- stale revision;
- permission denied;
- valid approval;
- canonical hash stable;
- double concurrent approval;
- immutable payload;
- candidate edit after approval denied;
- revoke;
- second active approval denied.

## 17.1 Permisije odluka (D-036)

`POST /analyses/{analysisId}/decisions` — permisija se izvodi iz polja `decision`:

| `decision` | Permisija |
|---|---|
| `APPROVE` | `analysis.approve` |
| `REJECT` | `analysis.review_decision` |
| `REQUEST_CHANGES` | `analysis.review_decision` |
| `SAVE_DRAFT` | `analysis.review_decision` |

Autorizacijski testovi:

- pozivalac sa `analysis.review_decision` a **bez** `analysis.approve` može poslati `REJECT`;
- isti pozivalac može poslati `REQUEST_CHANGES`;
- isti pozivalac može poslati `SAVE_DRAFT`;
- isti pozivalac na `APPROVE` dobija **`403`**;
- pozivalac sa `analysis.approve` može poslati `APPROVE`;
- pozivalac sa samo `analysis.read` dobija **`403`** na sve četiri write odluke;
- **nijedna write odluka nije autorizovana kroz `analysis.read`**;
- nedostajuća permisija vraća standardni `403` Problem Details odgovor;
- izvođenje permisije zavisi od **tipa odluke**, ne samo od putanje endpointa — dva zahtjeva
  na isti path sa različitim `decision` daju različit authorization ishod.

Poslovno ponašanje uz `REJECT`:

- `reason` je obavezan; bez njega `422`;
- analiza prelazi `REVIEW_REQUIRED → REJECTED`;
- encounter ostaje `REVIEW_REQUIRED`;
- upisuje se `ANALYSIS_REJECTED` audit event;
- novi pokušaj nakon odbijanja zahtijeva child reviziju (§22);
- `APPROVE` i dalje prolazi kroz immutable approval workflow iz §17.

Ovaj dokument **ne dodjeljuje permisije rolama** — role matrica pripada `docs/15`.

---

# 18. Export

- mismatched hash;
- inactive connection;
- ManualAdapter success;
- dependency fail;
- retry;
- duplicate retry;
- partial result;
- artifact hash;
- audit;
- no unapproved current table read.

## 18.1 Approval preconditioni (D-037)

| Slučaj | Status | Kod |
|---|---:|---|
| ne postoji aktivan, neopozvan approval | **409** | **`APPROVAL_REQUIRED`** |
| referencirani approval postoji, ali je opozvan | **409** | **`APPROVAL_REVOKED`** |

Za oba slučaja dokazati:

- odgovor koristi normalni Problem Details envelope (§20);
- `code` polje razlikuje dva slučaja — status je isti, kod nije;
- **nije kreiran export artifact**;
- **nije kreiran `export_jobs` red**;
- **nije izvršen nijedan poziv prema eksternoj integraciji**;
- **nije emitovan success audit event**.

Negativne asercije nad mapiranjem — nijedan od dva slučaja ne smije vratiti:

```text
422
412
428
generički 409 bez tačnog koda
```

Pozitivna kontrola: validan aktivan approval dozvoljava nastavak export workflowa.

## 18.2 Rezolucija konekcije (D-032)

- nula aktivnih `MANUAL` konekcija → `409 INTEGRATION_CONNECTION_NOT_CONFIGURED`;
- dvije aktivne → `422 INTEGRATION_CONNECTION_REQUIRED`;
- tačno jedna aktivna → `202`, uz rezolviran ID u `export_jobs` i u audit eventu.

---

# 19. Audit testovi

- command creates audit in same transaction;
- failed transaction creates no false success audit;
- document original view audit;
- approval;
- revoke;
- export;
- admin activation;
- update/delete denied;
- no medical body;
- request ID correlation;
- timeline order;
- integrity hash deterministic.

---

# 20. Problem Details

Za svaki error family:

- content type;
- status;
- code;
- requestId;
- instance;
- no stack;
- no SQL;
- no secret;
- no external raw error;
- validation errors field mapping.

## 20.1 Regresijska matrica kodova

Jedan test po redu; svaki asertira **i status i `code`**.

| Code | Status | Endpoint familija |
|---|---:|---|
| `PRECONDITION_REQUIRED` | **428** | šest `If-Match` PATCH endpointa (§10) |
| `VERSION_CONFLICT` | 409 | isti endpointi, stale `If-Match` |
| `REQUEST_ALREADY_IN_PROGRESS` | 409 | endpointi sa `Idempotency-Key` (§9) |
| `REVISION_CONFLICT` | 409 | `POST /analyses/{id}/revisions` (§22) |
| `INVALID_STATE_TRANSITION` | 409 | revisions, cancel, close, decisions (§11, §23) |
| `APPROVAL_REQUIRED` | 409 | export (§18.1) |
| `APPROVAL_REVOKED` | 409 | export (§18.1) |
| `INTEGRATION_CONNECTION_NOT_CONFIGURED` | 409 | export (§18.2) |
| `INTEGRATION_CONNECTION_REQUIRED` | **422** | export (§18.2) |

Zabrane koje se testiraju eksplicitno:

- **`425` se nikada ne vraća** ni sa jednog endpointa; jedini dozvoljeni test nad `425` je
  negativna asercija da se ne pojavljuje;
- **`POST /analyses/{id}/tariff-evaluation` ne postoji** — poziv daje `404`, ne `202`;
- **`analysis.run_tariff` je rezervisana** i ne gate-uje nijedan aktivni endpoint; nijedan
  test ne smije zahtijevati tu permisiju za prolaz.

---

# 21. D-033 — Tenant context bootstrap

Normativno: D-033; `02` §16.2, §16.2a i §17.3; `03` §3.

## 21.1 Redoslijed i autentifikacija

Nivo: integration + e2e.

- bearer autentifikacija se izvršava **prije** tenant bootstrapa;
- identitet korisnika je uspostavljen iz pouzdanih auth podataka, ne iz requesta;
- funkcija ima tačan potpis `set_request_context(p_practice_id uuid)` — provjeriti kroz
  `pg_proc` katalog, ne kroz aplikacijski wrapper;
- funkcija je **SECURITY INVOKER** — asertirati `pg_proc.prosecdef = false`;
- funkcija **ne prima** `user_id` ni bilo koji caller-provided identifikator korisnika;
- pozivalac ne može impersonirati drugog korisnika kroz body, query, header ni argument
  funkcije;
- `X-Practice-ID` sam po sebi **nikada** ne autorizuje tenant pristup.

## 21.2 Membership bootstrap

Nivo: security/RLS integration.

- aktivan membership uspostavlja tenant context;
- membership koji ne postoji → **`403`**;
- neaktivan membership → **`403`**;
- opozvan membership → **`403`** gdje je primjenjivo;
- bootstrap politika nad `practice_memberships` radi **prije nego `app.practice_id` postoji`**;
- normalna tenant RLS **ne može** bootstrap-ovati kontekst koji ta ista RLS zahtijeva —
  ciklična zavisnost mora pasti, ne proći tiho;
- **SECURITY INVOKER ne zaobilazi** `practice_memberships` RLS;
- neuspjeh bootstrapa **ne ostavlja upotrebljiv `app.practice_id`**;
- tenant-scoped upit prije uspješnog bootstrapa pada.

## 21.3 Transakcija i konekcija

Nivo: integration.

- `app.user_id` je transakcijski lokalan;
- `app.practice_id` je transakcijski lokalan;
- context nestaje na završetku transakcije;
- rollback čisti context;
- neuspio bootstrap čisti context;
- pooled konekcija **ne nasljeđuje** `app.user_id` prethodnog requesta;
- pooled konekcija **ne nasljeđuje** `app.practice_id` prethodnog requesta;
- uzastopni requesti na istoj pooled konekciji **ne mogu preći granicu tenanta**.

## 21.4 Platform razdvajanje

Nivo: e2e + security.

- `platformRoles` ne kreiraju tenant membership;
- `platformRoles` i tenant membershipi se **ne spajaju automatski**;
- tenant ruta se **ne** može autorizovati isključivo kroz `platformRoles`;
- platform/system context se **ne** uspostavlja kroz `set_request_context`.

## 21.5 BLOCKED — D-OPEN-011

Testovi generičkog runtime pristupa nad `users` i `practices` su **BLOKIRANI** dok
D-OPEN-011 ne bude prihvaćen (`13` §16). Nisu izostavljeni — vode se kao blokirani.

Do tada su obavezni ovi negativni guard testovi, koji su izvodivi već sada:

- nema neograničenog `SELECT` nad `users`;
- nema neograničenog `SELECT` nad `practices`;
- nema generičkih runtime grantova prema `PUBLIC`;
- membership-bootstrap pristup **ne izlaže** opšte `users`/`practices` redove.

**Konačna access politika se ne izmišlja u testovima.** Test koji pretpostavi bilo koji
konkretan model pristupa nad te dvije tabele je sam po sebi defekt.

---

# 22. D-034 — Linearni lanac analysis revizija

Normativno: D-034; `02` §10.2.1 i §19.4; `03` §15.3.

## 22.1 Database constraint testovi

Nivo: integration nad stvarnim PostgreSQL-om.

- inicijalna revizija: `revision_number = 1` i `parent_analysis_run_id IS NULL` → prolazi;
- kasnija revizija: `revision_number > 1` i `parent_analysis_run_id IS NOT NULL` → prolazi;
- `revision_number = 1` uz non-NULL roditelja → **odbijeno**;
- `revision_number > 1` uz `NULL` roditelja → **odbijeno**;
- self-parent referenca (`parent_analysis_run_id = id`) → **odbijeno**;
- roditelj i dijete u različitim `practice_id` → **odbijeno**;
- roditelj i dijete u različitim `encounter_id` → **odbijeno**;
- više inicijalnih revizija kroz **različite encountere** → dozvoljeno;
- drugi direktni child istog roditelja → **odbijeno**;
- parcijalni unique indeks dopušta više `NULL` roditelja;
- `UPDATE` nad `parent_analysis_run_id` → **SQLSTATE `23514`**;
- `UPDATE` nad `revision_number` → **SQLSTATE `23514`**;
- `UPDATE` nad ostalim kolonama `analysis_runs` prolazi.

## 22.2 Concurrency

Nivo: integration, **deterministički**.

Dvije komande ciljaju istog roditelja, sinhronizovane barijerom:

- **tačno jedno** dijete je commitovano;
- gubitnik dobija **`409 REVISION_CONFLICT`**;
- nijedan retry ne kreira reviziju **N+2**;
- nakon trke ne postoji drugo dijete;
- audit historija ostaje linearna.

Test koristi **eksplicitne barijere sinhronizacije**, nikada `sleep` ni timing pretpostavke.

## 22.3 Redoslijed mapiranja greške

- postojanje djeteta se provjerava **prije** statusa roditelja;
- postojeće dijete uvijek daje `REVISION_CONFLICT`, **bez obzira** na to da li roditelj
  zadržava status ili prelazi u `SUPERSEDED`;
- nema djeteta + nedozvoljen status roditelja → `INVALID_STATE_TRANSITION`;
- konflikt nad database unique indeksom mapira se u `REVISION_CONFLICT`, **nikada u `500`**.

## 22.4 Pokrivenost statusa roditelja

Kreiranje revizije iz svih dozvoljenih roditelja:

| Roditelj | Roditelj nakon komande |
|---|---|
| `REVIEW_REQUIRED` | **`SUPERSEDED`** |
| `COMPLETED` | **`SUPERSEDED`** |
| `REJECTED` | zadržava `REJECTED` |
| `FAILED` | zadržava `FAILED` |
| `EXTRACTION_FAILED` | zadržava `EXTRACTION_FAILED` |
| `TARIFF_EVALUATION_FAILED` | zadržava `TARIFF_EVALUATION_FAILED` |
| `CANCELLED` | zadržava `CANCELLED` |

Za svaki slučaj dodatno asertirati:

- dijete počinje u `QUEUED`;
- `revisionNumber` djeteta = `roditelj.revisionNumber + 1`.

Odbijanje iz nedozvoljenih roditelja — `QUEUED`, `PREPARING_INPUT`, `EXTRACTING`,
`EVALUATING_TARIFF`, `APPLYING_SAFETY_RULES`, `SUPERSEDED`, `APPROVED`.

`APPROVED` mora prvo biti revoked u `REVIEW_REQUIRED`; tek tada revizija prolazi.

---

# 23. D-035 — Semantika otkazivanja

Normativno: D-035; `03` §12, §15.4; `14` §12.1 i §13.2.

## 23.1 Direktno otkazivanje analize

Nivo: e2e + audit.

Za **svako** aktivno async stanje — `QUEUED`, `PREPARING_INPUT`, `EXTRACTING`,
`EVALUATING_TARIFF`, `APPLYING_SAFETY_RULES`:

- prvo otkazivanje vraća **`202`** uz `CANCELLED` reprezentaciju;
- stanje je promijenjeno **tačno jednom**;
- kreiran je **tačno jedan** audit event.

Ponovljeno otkazivanje:

- vraća **`200`** uz postojeću reprezentaciju;
- **ne izvršava nikakvu mutaciju** stanja;
- **ne kreira dodatni audit event** — broj audit zapisa ostaje 1.

Ostalo:

- `Idempotency-Key` **nije obavezan**;
- otkazivanje iz drugog neaktivnog ili terminalnog stanja →
  **`409 INVALID_STATE_TRANSITION`**, bez promjene stanja.

## 23.2 Kaskadno otkazivanje encountera

Nivo: integration + e2e + audit.

`POST /encounters/{id}/cancel` iz `ANALYSIS_IN_PROGRESS`:

- tekuća aktivna analiza je identifikovana kao **dijete-bez-djeteta vrh lanca revizija**;
- **samo** ta analiza je otkazana;
- encounter je otkazan **u istoj transakciji**;
- `encounter.cancel` autorizuje kompletnu komandu;
- **`analysis.cancel` se ne traži dodatno**;
- kreirana su **dva odvojena audit eventa** — jedan za analizu, jedan za encounter;
- historijske revizije ostaju nepromijenjene;
- terminalne revizije ostaju nepromijenjene.

Rollback:

- simulirani neuspjeh pri otkazivanju analize **rollback-uje obje** promjene stanja;
- simulirani neuspjeh pri upisu bilo kojeg audit zapisa rollback-uje kompletnu komandu, u
  skladu sa prihvaćenim transakcijskim dizajnom;
- **nijedan djelimičan ishod nije observabilan** — ni kroz API, ni direktnim upitom.

Dodatno:

- `CANCELLED` encounter **ne može** preći u `CLOSED`;
- nakon uspješnog otkazivanja encountera **ne postoji zombie analiza** koja i dalje radi.

Ovaj dokument **ne dodjeljuje permisije konkretnim rolama**.

---

# 24. Fixtures i izolacija

## 24.1 Obavezne dimenzije fixtura

- najmanje dvije ordinacije;
- najmanje dva korisnika;
- aktivni, neaktivni i opozvani membershipi;
- kombinacije tenant korisnika i platform rola;
- više encountera;
- lanci analysis revizija;
- approvali: aktivan, opozvan i nepostojeći;
- aktivna i terminalna analysis stanja.

## 24.2 Pravila izolacije

- svaki test počinje sa poznatim transaction/context stanjem;
- nijedan test ne zavisi od redoslijeda izvršavanja;
- race testovi koriste **determinističke sinhronizacijske barijere**, ne `sleep` ni timing
  pretpostavke;
- tenant testovi dokazuju **i pozitivan pristup i cross-tenant odbijanje**;
- audit asercije provjeravaju actor, practice, resource, action i before/after stanje gdje je
  primjenjivo;
- osjetljivi payloadi se **ne upisuju** u test logove (§27).

---

# 25. Evidence i phase gates

## 25.1 Evidencija po test grupi

Za svaku grupu evidentirati: test nivo, vlasničku fazu, preduslovni migration paket, fixture,
očekivani status/kod, obaveznu audit asertaciju i da li blokira završetak faze.

| Grupa | Nivo | Faza | Paket (`02` §22) | Blokira fazu |
|---|---|---|---|---|
| §21.1–21.4 D-033 bootstrap | security/integration/e2e | Faza 4 | `013_rls_policies` | **da** |
| §21.5 D-OPEN-011 guard | security | Faza 3 | `002_identity_and_practices` | **da** za guard testove |
| §22.1 constraint | integration | Faza 7 | `005_ai_prompts_and_analysis` | **da** |
| §22.2 concurrency | integration | Faza 7 | `005_ai_prompts_and_analysis` | **da** |
| §22.1 immutability trigger | integration | Faza 7 | `014_immutability_triggers` | **da** |
| §22.3–22.4 revizije | e2e | Faza 10 | — | **da** |
| §23.1 cancel analize | e2e + audit | Faza 7 | — | **da** |
| §23.2 kaskada | integration + e2e | Faza 5 | — | **da** |
| §17.1 D-036 permisije | e2e | Faza 10 | — | **da** |
| §18.1 D-037 approval kodovi | contract + e2e | Faza 11 | — | **da** |
| §11.1–11.2 state machine | unit + e2e | prema fazi vlasnika stanja | — | **da** |
| §20.1 error matrica | contract | Faza 12 | — | **da** |

Vlasništvo migration paketa preuzeto je iz `02` §22 i `04`. **Nijedan novi broj paketa se ne
uvodi.**

## 25.2 Uslovi pada phase gatea

Phase gate **mora pasti** kada:

- D-033 security testovi padnu;
- D-034 concurrency ili constraint testovi padnu;
- D-035 testovi atomarnog otkazivanja padnu;
- D-036 authorization testovi padnu;
- D-037 export precondition testovi padnu.

D-OPEN-011 testovi ostaju **vidljivo BLOCKED**, nikada tiho izostavljeni. Suite koji ih
preskoči bez oznake tretira se kao neuspio gate.

---

# 26. OpenAPI

CI:

1. generate;
2. validate 3.1;
3. compile generated TS client;
4. compare committed file;
5. detect breaking change;
6. ensure security schemes;
7. ensure error response.

---

# 27. Logging security

Capture test logger output.

Assert absence:

```text
patient name fixture
external patient ID
medical sentence fixture
Authorization header
DATABASE_URL
encryption key
AI raw input
```

Assert presence:

```text
requestId
analysisId
errorCode
durationMs
```

---

# 28. Performance smoke

Nije load certification, ali minimalno:

- encounter list p95 lokalno prihvatljiv na 10k fixture redova;
- workspace query bounded, bez N+1;
- queue processes configured concurrency;
- DB connection pool ne eksplodira;
- large audit list cursor pagination.

Query count može biti instrumentovan u test modu.

---

# 29. CI gate

Pull request ne može biti green bez:

```text
format check
lint
typecheck
prisma validate
migration deploy
unit
integration
RLS/security
e2e
OpenAPI validation
build
dependency scan
```

---

# 30. Test evidence report

Nakon faze u checklistu upisati:

```text
Command:
Environment:
Result:
Number of tests:
Failed/skipped:
Relevant migration:
Relevant commit:
```

"Tests passed" bez komande i summaryja nije dovoljan dokaz.

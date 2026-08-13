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
- Export A → Approval B;
- Link A → Decision B;
- Link A → Change B;
- Link A → korekcija iste ordinacije ali **drugog `analysis_run_id`**.

Svaki mora pasti na database constraintu, ne samo application validationu.

Posljednja tri pokušaja pokrivaju oba trokolonska D-046 FK-a; detaljna pokrivenost je u §24a.

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

Pokrivenost review odluke i povezivanje korekcija testiraju se u **§24a** (D-046). Korekcija je
nezavisan immutable event bez direktne veze prema odluci; ovaj odjeljak je **ne pretpostavlja**.

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

## 21.5 Access model za `users` i `practices` — test ugovor (D-047)

**Normativna odluka: D-047.** Ranije je ova sekcija vodila testove kao `BLOCKED — D-OPEN-011`.
D-OPEN-011 je riješen 2026-08-12, pa su ti testovi sada **obavezan, izvršiv ugovor**, ne blokirana
stavka.

Nivo: integration nad stvarnim PostgreSQL-om. Vlasništvo: paket `002_identity_and_practices`,
**faza 3**, osim gdje je izričito navedena faza 4. Normativni izvor za očekivanja: `02` §17.5,
§17.6, §20.2a i §25.1.1.

### 21.5.1 Trajni guard testovi

Ostaju obavezni i nakon D-047 — zabrana nije ukinuta, nego je sada tehnički sprovedena:

- nema neograničenog `SELECT` nad `users`;
- nema neograničenog `SELECT` nad `practices`;
- nema generičkih runtime grantova prema `PUBLIC`;
- membership-bootstrap pristup **ne izlaže** opšte `users`/`practices` redove.

### 21.5.2 `users`

Pozitivni:

- validan verifikovan subjekt uz nepostavljen `app.user_id` vraća **tačno jedan** red;
- vlastiti red je čitljiv nakon `set_user_context`.

Negativni:

- nepoznat subjekt → **nula** redova;
- korisnik čiji `status` nije `ACTIVE` → `403 ACCESS_DENIED` prije `set_user_context`;
- bez `app.auth_subject` i bez `app.user_id` → **nula** redova;
- **neusklađeni konteksti** — `app.auth_subject` korisnika A uz `app.user_id` korisnika B →
  **tačno jedan** red, i to red korisnika B. Regresijski test obaveznog guarda `app.user_id IS
  NULL`; bez njega su dokazano vidljiva **dva** reda;
- **zastarjeli** `app.auth_subject` nakon `set_user_context` ne mijenja vidljivost;
- korisnik A ne čita red korisnika B;
- `SELECT auth_subject`, `SELECT last_login_at`, `SELECT *` → **`42501`**;
- `WHERE auth_subject = ...` → **`42501`**;
- `INSERT`, `UPDATE`, `DELETE` → **`42501`**;
- `set_auth_subject_context(null)` i `set_auth_subject_context('')` → **`42501`**;
- pristup redu drugog korisnika (co-member `displayName`) → **nula** redova; potvrđuje da gate
  `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` nije tiho zaobiđen (`13` §19).

### 21.5.3 `practices`

Pozitivni:

- prije `app.practice_id` vidljive su **sve** ordinacije vlastitog membership skupa;
- ordinacija sa **neaktivnim** membershipom je vidljiva — zahtjev `GET /me` za `practiceName`;
- nakon `app.practice_id` vidljiva je **tačno jedna** ordinacija.

Negativni:

- nakon `app.practice_id`, upit **bez `WHERE`** vraća **tačno jedan** red — zaštita od
  zaboravljenog filtera;
- nakon `app.practice_id`, eksplicitan `WHERE` za drugu ordinaciju u kojoj korisnik **jeste** član
  → **nula** redova;
- ordinacija bez membershipa → **nula** redova, sa i bez konteksta;
- podmetnut `app.practice_id` za ordinaciju bez membershipa → **nula** redova;
- bez `app.user_id` → **nula** redova;
- ordinacija čiji `status` nije `ACTIVE` → `403 ACCESS_DENIED` uz rollback, **prije**
  `set_request_context`;
- `SELECT zsr_number`, `gln_number`, `legal_name` → **`42501`**;
- `INSERT`, `UPDATE`, `DELETE` → **`42501`**;
- `copilot_system` bilo kakav pristup `users` ili `practices` → pada.

### 21.5.4 RESTRICTIVE politika — zaštita od budućeg proširenja

- uz dodatu široku PERMISSIVE politiku (`using (true)`), post-context vidljivost **ostaje jedan
  red**. Dokazano je da bi bez RESTRICTIVE moda ista situacija vratila **tri** reda, uključujući
  ordinaciju bez ijednog membershipa. Ovaj test je regresijska zaštita moda politike, ne stila.

### 21.5.5 Zavisnost od `practice_memberships`

- ukidanje ili sužavanje `SELECT` granta nad `practice_memberships` obara politiku nad `practices`
  sa **`42501`**. Test invarijante iz `02` §17.6 i §20.2a — sprječava tiho lomljenje politike
  budućim sužavanjem granta.

### 21.5.6 Međustanje faze 3 — očekivano, dokumentovano

- u fazi 3 `practice_memberships` **nema** RLS, pa `copilot_app` na nivou baze vidi **generičke**
  membership redove, uključujući tuđe. To je **očekivano zatečeno stanje** (`02` §20.2, `05` faza
  3), a **ne** defekt i **ne** posljedica D-047. Test to eksplicitno tvrdi, da promjena ne bi
  prošla nezapaženo;
- **faza 4:** nakon `02` §17.3 isti upit vraća **isključivo** vlastite membership redove —
  regresijski test koji dokazuje da je međustanje zatvoreno;
- **faza 4:** politika nad `practices` daje **identičan** rezultat prije i nakon uvođenja §17.3 —
  dokaz da faza 4 ne prepisuje politike faze 3.

### 21.5.7 Životni ciklus konteksta (faza 4)

- neuspjeh bootstrapa ne ostavlja upotrebljiv `app.practice_id`;
- na kraju transakcije `app.auth_subject`, `app.user_id` i `app.practice_id` su obrisani;
- pooled konekcija ne nasljeđuje kontekst prethodnog requesta.

### 21.5.8 Kompromitovan credential

Test mora **tvrditi prihvaćeno ograničenje**, ne izmišljati zaštitu:

- držalac `copilot_app` credentiala može sam postaviti `app.*` varijable i time pročitati red
  odgovarajućeg identiteta — test to **potvrđuje kao poznatu granicu**;
- **nijedan test ne smije tvrditi** da dijeljeni runtime credential dokazuje identitet krajnjeg
  korisnika;
- isti test potvrđuje da column grantovi i dalje važe: `auth_subject`, `last_login_at`,
  `zsr_number`, `gln_number` i `legal_name` ostaju nedostupni, a svi upisi padaju sa `42501`.

**Konačna access politika se ne izmišlja u testovima.** Svaka asercija mora se pozivati na
eksplicitnu klauzulu D-047 ili na `02` §17.5/§17.6/§20.2a. Test koji pretpostavi model pristupa
izvan tih izvora je sam po sebi defekt.

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

# 24. D-038 — Multi-role tenant membership i kompozicija permisija

Normativno: D-038; `02` §6.3, §6.3a, §17.4, §20.2, §22.2 i §25.10; `03` §3.7, §10 i §28.5;
`04` §5.2 i §6.4.1; `05` Faze 3 i 4.

Vlasništvo migracija ostaje nepromijenjeno: schema objekti u **`002_identity_and_practices`**,
RLS politike u **`013_rls_policies`**. Nijedan novi broj paketa se ne uvodi.

**Normativni test oracle: `15_ROLE_PERMISSION_MATRIX_V1.md`.**

- `15` je **normativni oracle produkcijske matrice**;
- `06` sadrži izvorne prihvaćene ADR-ove — D-023, D-032 i D-039 do D-045;
- `03` definiše **imena permisija koje endpointi traže**;
- produkcijski authorization testovi **mehanički porede** implementacijski izlaz sa `15`;
- **prozni primjeri i nazivi rola nisu validan test oracle**;
- **odstupanje od `15` obara test suite**.

Ovaj dokument **ne dodjeljuje permisije rolama** i **ne duplira** matricu — on je dokazuje.
Sintetička matrica se zadržava **isključivo** za izolovanu mehaniku resolvera koja se ne može
jasno pokazati produkcijskom matricom (§24.8).

## 24.1 Schema constrainti

Nivo: integration nad stvarnim PostgreSQL-om.

`practice_memberships`:

- `unique (practice_id, user_id)` postoji i odbija drugi membership istog korisnika u istoj
  ordinaciji;
- `unique (practice_id, id)` postoji;
- **singularna kolona `role` ne postoji** — asertirati kroz `information_schema.columns`,
  ne kroz aplikacijski model;
- **indeks `(practice_id, active, role)` ne postoji** — asertirati kroz `pg_indexes`;
- `active` je i dalje jedini lifecycle flag membershipa.

`practice_membership_roles`:

- tabela postoji sa kolonama `id`, `practice_id`, `membership_id`, `role membership_role`,
  `created_at` i `updated_at`;
- primarni ključ nad `id` postoji;
- `unique (practice_id, id)` postoji;
- `unique (practice_id, membership_id, role)` postoji;
- composite FK `(practice_id, membership_id)` → `practice_memberships(practice_id, id)`
  postoji;
- jedan membership prihvata **nula** role redova;
- jedan membership prihvata **jedan** role red;
- jedan membership prihvata **više različitih** role redova;
- **duplirana dodjela iste role istom membershipu je odbijena** na database constraintu;
- **role red koji referencira membership druge ordinacije je odbijen** na composite FK-u;
- **nevažeća `membership_role` enum vrijednost je odbijena.**

Svaka od ovih asercija mora pasti na database constraintu, ne na aplikacijskoj validaciji.

## 24.2 Životni ciklus dodjele

Nivo: integration.

Normativno: D-038, klauzule 25–33.

- `practice_membership_roles` sadrži **isključivo trenutne dodjele**;
- uklanjanje role **briše** trenutni red dodjele;
- brisanje **oslobađa** trojac `unique (practice_id, membership_id, role)`;
- ista rola se nakon uklanjanja **može ponovo dodijeliti**;
- ponovna dodjela **kreira novi trenutni red**, ne oživljava stari;
- kolone `revoked_at`, `revoked_by`, `active`, `valid_from` i `valid_to` **ne postoje** na ovoj
  tabeli — asertirati kroz `information_schema.columns`;
- **ne postoji append-only historija dodjele**;
- `practice_memberships.active` je vlasnik aktivnosti membershipa;
- neaktivan membership **smije zadržati** svoje role redove;
- zadržani role redovi neaktivnog membershipa doprinose **nula** permisija;
- ponovna aktivacija vraća **tačno** eksplicitno pohranjene trenutne role;
- ponovna aktivacija **ne zaključuje i ne rekreira** obrisane role;
- aktivan membership sa nula rola daje **nula** permisija.

**Runtime role-administration endpoint se ne testira jer nijedan nije prihvaćen u v1.** Gdje
je za database testove potrebna mutacija dodjele, koristi se kontrolisani migration ili
fixture setup, **nikada izmišljeni API**.

## 24.3 Audit — BLOCKED

Testovi audita za role administration su **BLOKIRANI** dok prihvaćeni administracijski put ne
bude uveden. Nisu izostavljeni — vode se kao blokirani.

Kada taj put bude prihvaćen, testovi moraju dokazati **immutable** audit dokaz koji sadrži:

- aktera;
- ordinaciju;
- membership;
- rolu;
- radnju — `ASSIGNED` ili `REMOVED`;
- vrijeme;
- prethodno stanje dodjele;
- rezultujuće stanje dodjele;
- authorization put.

Izvodivo već sada, na schema/domain nivou:

- **brisanje trenutnog reda dodjele ne briše postojeće audit zapise** (`02` §19.2).

**Komanda, endpoint ni permisija koja kreira te evente se ne izmišljaju u testovima.**

## 24.4 RLS self-enumeracija

Nivo: security/RLS integration. Normativno: `02` §17.4.

- RLS je **enabled** na `practice_membership_roles`;
- RLS je **forced**;
- autentifikovan korisnik enumeriše role vlastitih membershipa;
- self-enumeracija radi **prije nego `app.practice_id` postoji**;
- politika izvodi identitet iz pouzdanog `app.user_id`;
- politika se spaja kroz vlasnički `practice_memberships` red;
- role neaktivnog membershipa **ostaju vidljive vlasniku**;
- vidljivost neaktivnih rola **nikada ne autorizuje** tenant pristup;
- role redovi drugog korisnika su **odbijeni**;
- role redovi druge ordinacije ili drugog korisnika su **odbijeni**;
- neispravan ili nedostajući `app.user_id` **pada zatvoreno** — nula redova, ne svi redovi;
- politika **ne zavisi** od caller-supplied `user_id`;
- SELECT pristup **ne implicira** INSERT, UPDATE ni DELETE;
- `copilot_system` **nema** automatski pristup ovoj tenant tabeli;
- `PUBLIC` **nema** nijedan pristup;
- **nema SECURITY DEFINER bypassa**;
- SECURITY INVOKER ponašanje je očuvano.

Ova politika **nije** riješila D-OPEN-011 i ne smije se tako tumačiti; access model za `users` i
`practices` zasebno je riješen odlukom **D-047** kroz `02` §17.5 i §17.6 (§21.5, §24.12).

## 24.5 Interakcija sa D-033 bootstrapom

Nivo: security/integration. Proširuje §21 i ništa iz njega ne oslabljuje.

- `set_request_context(p_practice_id uuid)` ostaje **jednoargumentna**;
- funkcija **ne prima rolu**;
- funkcija **ne prima `user_id`**;
- funkcija validira **isključivo** aktivan `practice_memberships` red;
- funkcija **ne zahtijeva** `practice_membership_roles` za provjeru postojanja membershipa;
- **aktivan membership sa nula rola smije uspostaviti** transakcijski lokalni tenant context;
- taj membership dobija **`403`** na **svakoj** permission-gated tenant ruti;
- neaktivan membership dobija **`403` prije učitavanja rola**;
- nepostojeći membership dobija **`403`**;
- neuspio bootstrap **ne ostavlja upotrebljiv `app.practice_id`**;
- rollback čisti context;
- pooled konekcija **ne nasljeđuje** ni `app.user_id`, ni `app.practice_id`, ni membership ni
  učitane role prethodnog requesta;
- role redovi drugog membershipa **nikada ne ulaze** u odabrani context.

## 24.6 Redoslijed autorizacije

Nivo: integration + e2e. Normativno: `03` §3.7.1.

Testira se prihvaćeni redoslijed, sa negativnim testom na svakoj relevantnoj granici:

1. autentifikacija bearer tokena;
2. izvođenje pouzdanog `app.user_id`;
3. validacija `X-Practice-ID`;
4. poziv `set_request_context(p_practice_id uuid)`;
5. validacija aktivnog `practice_memberships` reda;
6. uspostavljanje transakcijski lokalnog tenant konteksta;
7. učitavanje dodijeljenih tenant rola;
8. izvođenje efektivnih permisija;
9. evaluacija tražene permisije i prihvaćenog uslova;
10. izvršenje pod tenant RLS-om.

Nijedan authorization put ne smije:

- učitati role **prije** autentifikacije;
- vjerovati caller-supplied roli;
- vjerovati caller-supplied `user_id`;
- koristiti `platformRoles` kao tenant role;
- zaobići provjeru aktivnog membershipa.

## 24.7 `GET /me` ugovor

Nivo: contract + e2e. Normativno: `03` §10.

Svaki membership objekt vraća: `membershipId`; `practiceId`; `practiceName`; `active`;
`roles[]`; izvedene `permissions[]`.

- **`memberships[].role` je odsutan**;
- **`role` i `roles` nikada ne koegzistiraju** — singularno polje je odsutno, a poslano
  singularno polje se odbija;
- `roles[]` prihvata **nula, jednu ili više** vrijednosti;
- `roles[]` sadrži **isključivo** `membership_role` vrijednosti;
- vrijednosti u `roles[]` su **jedinstvene**;
- redoslijed u `roles[]` je **determinističan** — dva uzastopna poziva daju isti niz;
- `roles[]` sadrži isključivo role pripadajućeg membershipa;
- **jedan korisnik smije imati različite role u različitim ordinacijama**;
- neaktivan membership i njegove role **smiju** biti vraćeni;
- role tuđeg membershipa **nikada** nisu vraćene;
- `platformRoles` ostaje **zaseban top-level blok**;
- `platformRoles` se **nikada** ne pojavljuju unutar `roles[]`;
- `permissions[]` je **izveden**, ne perzistiran na membershipu;
- **ilustrativni API primjeri ne definišu produkcijske grantove.**

Kompatibilnosti test za istovremena polja `role` i `roles` **nije potreban** — projekat nema
produkcijskog klijenta.

## 24.8 Kompozicija efektivnih tenant permisija

Nivo: unit + integration. Normativno: `03` §28.5.

**Produkcijska konformnost koristi matricu iz `15`.** Sintetičke permisije su dozvoljene
**isključivo** za izolovane mehaničke rubne slučajeve koji se ne mogu jasno demonstrirati
produkcijskom matricom; svaki takav test mora biti eksplicitno označen kao mehanički.

- grantovi svih dodijeljenih tenant rola se **spajaju unijom**;
- unija je ograničena na **jedan membership i jednu ordinaciju**;
- duplirani grant iz dvije role pojavljuje se u efektivnom skupu **samo jednom**;
- `DENY` **ne doprinosi** grant;
- `DENY` **ne poništava** `ALLOW` iz druge dodijeljene role;
- **nema implicitnog nasljeđivanja rola**;
- **nijedan per-user permission overrid ne učestvuje**;
- neaktivan membership daje **prazan** efektivni skup;
- aktivan membership sa nula rola daje **prazan** efektivni skup;
- **deny-by-default** važi kada nijedna rola ne daje traženu permisiju;
- rola dodijeljena u ordinaciji A **ne doprinosi ništa** u ordinaciji B;
- `platformRoles` **ne doprinose ništa** tenant uniji;
- `SYSTEM_ADMIN` bez aktivnog membershipa dobija **`403`** na tenant rutama;
- `SYSTEM_ADMIN` sa aktivnim membershipom dobija **isključivo** permisije koje doprinose
  tenant role tog membershipa.

- role iz **drugog membershipa** nikada ne doprinose odabranom kontekstu.

Test sa `PHYSICIAN` + `PRACTICE_ADMIN` u istoj ordinaciji dokazuje **uniju prema prihvaćenoj
matrici u `15`** — efektivni skup mora biti tačno unija `ALLOW` ćelija te dvije role.

## 24.9 Uslovne permisije

Nivo: integration + e2e.

Testira se **prihvaćena matrica**, ne sintetička podobnost. Normativno: D-041; `15` §5–§6.

`analysis.approve`:

- `PHYSICIAN` **ALLOW**, nezavisno od oba flaga;
- `MPA` **CONDITIONAL** uz `allow_mpa_approval = true`;
- `BILLING_SPECIALIST` **CONDITIONAL** uz `allow_billing_specialist_approval = true`;
- `PRACTICE_ADMIN`, `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **DENY**.

`analysis.approval.revoke`:

- role ćelije **strukturno identične** onima za `analysis.approve` — asertirati poređenjem, ne
  ponovnim prepisivanjem;
- `PHYSICIAN` **ALLOW**; `MPA` i `BILLING_SPECIALIST` **CONDITIONAL** uz iste flagove; ostale
  **DENY**.

Svaka kombinacija uslova mora biti testirana:

- podobna rola **+** uključen flag → **dozvoljeno**;
- podobna rola **+** isključen flag → **odbijeno**;
- uključen flag **bez** podobne role → **odbijeno**;
- neaktivan membership **+** podobna rola **+** uključen flag → **odbijeno**;
- podobna rola **iz druge ordinacije** **+** uključen flag → **odbijeno**;
- platform rola **+** uključen flag → **odbijeno**.

Opoziv mora dokazati:

- **opozivalac ne mora biti originalni odobravatelj**;
- podobnost se evaluira **u trenutku opoziva**;
- `reason` je **obavezan**;
- opoziv **bez** `reason` je odbijen;
- dokaz odobrenja se **nikada ne briše**;
- immutable approval historija je zadržana;
- **revocation audit event** je emitovan;
- **podobnost za odobravanje i opoziv nikada ne divergira.**

## 24.10 Injekcija role

Nivo: security.

Pokušaj pozivaoca da sam dostavi tenant role mora biti **odbijen** kroz svaki od ovih puteva:

- request body;
- query parametar;
- proizvoljan header;
- manipulacija `X-Practice-ID`;
- JWT polje koje prihvaćeno auth mapiranje ne prihvata;
- argument funkcije `set_request_context`;
- direktan app-setting koji pozivalac ne smije postavljati;
- `platformRoles` blok;
- identitet database role.

Pozitivna asercija: **dodjele rola se čitaju isključivo iz `practice_membership_roles`** za
odabrani membership.

## 24.11 Razdvajanje klasa rola

Nivo: security + e2e.

| Klasa | Vrijednosti |
|---|---|
| tenant aplikacijske role | `PRACTICE_ADMIN`, `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY` |
| platform aplikacijska rola | `SYSTEM_ADMIN` |
| database role | `copilot_app`, `copilot_migrator`, `copilot_system` |

- platform rola **nije** tenant rola;
- database rola **nije** aplikacijska rola;
- **`SYSTEM_ADMIN` nije `copilot_system`** (§5.1);
- database grant **nikada ne zadovoljava** permisiju endpointa;
- tenant membership role **nikada ne autorizuju** platform `tariff.manage`;
- platform `tariff.manage` **nikada ne autorizuje** tenant endpoint;
- dvije već prihvaćene dodjele ostaju nepromijenjene:
  - `integration.read` → `PRACTICE_ADMIN` (D-032, klauzula 8);
  - `tariff.manage` → isključivo `SYSTEM_ADMIN` (D-023, klauzula 9).

Sve ostale produkcijske dodjele dolaze iz prihvaćene matrice u `15` i testiraju se u
§24.13–§24.16. **Nijedna dodjela izvan `15` se ne dodaje ni ne testira.**

## 24.12 Granice self-enumeracije i role matrica

Autentifikovana self-enumeracija vlastitih membership rola:

- **nije** generički pristup nad `users`;
- **nije** generički pristup nad `practices`;
- **nije** role administration;
- **nije** cross-practice administracija;
- **ne definiše** platform administraciju;
- **nije riješila D-OPEN-011** — to je učinio D-047, zasebnim politikama iz `02` §17.5 i §17.6.
  Ta tvrdnja ostaje tačna i nakon rješavanja: access model nije nastao proširenjem ove
  enumeracije.

Testovi iz **§21.5 ostaju obavezni** i sada su izvršiv ugovor, a ne blokirana stavka (D-047).

Produkcijski role-to-permission testovi **više nisu blokirani** — D-039 do D-045 su prihvaćeni,
a `15` je kreiran i ACCEPTED. Testiraju se u §24.13 do §24.19.

Netestabilno ostaje isključivo ono što D-045 klasifikuje izvan v1.

`OUT OF V1` — ne izmišljati API testove:

- kreiranje, deaktivacija i administracija membershipa;
- dodjela i uklanjanje rola;
- generička runtime administracija rola;
- cross-practice support pristup;
- otkazivanje export joba.

`REQUIRES NEW PERMISSION AND ADR`:

- generička platform administracija izvan `tariff.manage`;
- `AUDITOR` discovery/listing endpoint;
- podjela `analysis.review_decision`;
- podjela `analysis.export.read`;
- finija permisija za rješavanje findinga.

Database-level mutacija fixtura ostaje dozvoljena **isključivo** za kontrolisani test setup, gdje
je već prihvaćena (§24.2).

**Blokirani testovi se vode vidljivo, nikada tiho izostavljeni.** Suite koji ih preskoči bez
oznake tretira se kao neuspio gate.

## 24.13 Konformnost produkcijske matrice

Nivo: unit + contract. Oracle: `15`.

Test parsira implementacijsku matricu i `15` te dokazuje **jednakost u oba smjera**:

- **tačno 32 reda**;
- svaki red ima **jednu aktivnu permisiju**, **sedam** aplikacijskih role ćelija i **jedan**
  prihvaćeni ADR `Source`;
- svaka ćelija je tačno jedno od: `ALLOW`, `DENY`, `CONDITIONAL`. Vrijednost
  `BLOCKED — D-OPEN-011` je **povučena** odlukom D-047 i **nijedna ćelija je više ne smije
  nositi** — njena pojava obara test (`15` §3.1);
- **nema dupliranog reda**;
- **nema reda koji nedostaje**;
- **nema viška reda**;
- **nema prazne ćelije**;
- **nema `OPEN` ćelije**;
- **nema nepoznatog stanja**;
- svaki `Source` je prihvaćen ADR;
- **nijedna rezervisana permisija se ne pojavljuje**;
- redoslijed role kolona je stabilan gdje se matrica serijalizuje;
- **odstupanje obara test**.

Katalog:

- **tačno 32** aktivne permisije;
- skup **i redoslijed** su jednaki `03` §28.1;
- nijedna aktivna permisija nije dodana, uklonjena, preimenovana, podijeljena ni spojena;
- **tačno tri** rezervisane: `analysis.run_tariff`, `configuration.manage`, `integration.manage`;
- rezervisane **nisu** redovi matrice;
- rezervisane **nemaju** nijedan produkcijski grant;
- nepoznata i rezervisana permisija **padaju zatvoreno**.

Inventar rola:

- **tačno sedam** aplikacijskih role kolona;
- database role **nikada** nisu kolone matrice;
- **`SYSTEM_ADMIN` nije `copilot_system`**;
- platform rola ne ulazi u tenant kompoziciju;
- `SYSTEM_ADMIN` nema nijednu automatsku tenant permisiju;
- database grant **ne zadovoljava** permisiju endpointa.

## 24.14 Profili rola — tačni brojevi

Nivo: unit. Profili se **mehanički izvode** iz `15` i porede sa implementacijom.

| Rola | ALLOW | CONDITIONAL | DENY | Ukupno |
|---|---:|---:|---:|---:|
| `PRACTICE_ADMIN` | 8 | 0 | 24 | 32 |
| `PHYSICIAN` | 24 | 0 | 8 | 32 |
| `MPA` | 11 | 2 | 19 | 32 |
| `BILLING_SPECIALIST` | 10 | 2 | 20 | 32 |
| `AUDITOR` | 2 | 0 | 30 | 32 |
| `READ_ONLY` | 0 | 0 | 32 | 32 |
| `SYSTEM_ADMIN` | 1 | 0 | 31 | 32 |

**Svaka kolona mora dati ukupno 32.**

**Kolona `BLOCKED` — povučena, isključivo historijska napomena.** Ranija verzija ove tabele
nosila je kolonu `BLOCKED` sa vrijednošću `1` za svaku rolu, iz vremena dok je `practice.read`
bio `BLOCKED — D-OPEN-011`. Ta vrijednost je **povučena** odlukom **D-047** (`15` §3.1 i §8.1;
`06` D-047, klauzula 11) i **nije važeći očekivani rezultat testa** — njena pojava **obara test**
prema §24.13. Od 2026-08-12 `practice.read` je `ALLOW` za `PRACTICE_ADMIN` i `DENY` za ostalih
šest rola, pa se taj red broji u `ALLOW` i `DENY` kolonama iznad. Brojevi u tabeli su
**mehanički izvedeni iz `15` §5** i **ne uvode novi model permisija**; `15` ostaje produkcijski
oracle.

Dodatno se imenom asertiraju:

- `PRACTICE_ADMIN` ima **tačno osam** `ALLOW`: `practice.read`, `practice.settings.read`,
  `practice.settings.manage`, `encounter.close`, `tariff.raw_result.read`, `audit.read`,
  `audit.export`, `integration.read`;
- `AUDITOR` ima **tačno dva** `ALLOW`: `audit.read` i `audit.export`;
- `READ_ONLY` ima **nula** `ALLOW` i **nula** `CONDITIONAL`;
- `SYSTEM_ADMIN` ima **tačno jedan** `ALLOW`: `tariff.manage`, i to na platform obuhvatu;
- `practice.read` je `ALLOW` **isključivo** za `PRACTICE_ADMIN`, a `DENY` za ostalih šest rola
  uključujući `SYSTEM_ADMIN` (D-047, klauzula 11);
- `SYSTEM_ADMIN` bez tenant membershipa dobija `403` na `GET /practices/{practiceId}`; sa aktivnim
  membershipom i `PRACTICE_ADMIN` tenant rolom dobija `200`, i to **isključivo** kroz tenant rolu;
- odgovor `GET /practices/{practiceId}` **ne sadrži** `zsrNumber`, `glnNumber` ni `legalName`.

## 24.15 Dodjele sa najvećim rizikom, korekcije i review odluka

Nivo: e2e + security. Za svaku permisiju testira se **i pozitivan i negativan** slučaj.

| Permisija | Dozvoljeno | Sve ostale role |
|---|---|---|
| `integration.read` | `PRACTICE_ADMIN` | odbijene |
| `tariff.manage` | `SYSTEM_ADMIN` (platform) | odbijene; `SYSTEM_ADMIN` ne dobija tenant pristup |
| `tariff.raw_result.read` | `PRACTICE_ADMIN` | odbijene; posebno `AUDITOR` i `SYSTEM_ADMIN` |
| `audit.read` | `PRACTICE_ADMIN`, `AUDITOR` | odbijene |
| `audit.export` | `PRACTICE_ADMIN`, `AUDITOR` | odbijene |
| `encounter.close` | `PRACTICE_ADMIN`, `PHYSICIAN`, `BILLING_SPECIALIST` | odbijene |
| `analysis.review_decision` | `PHYSICIAN`, `BILLING_SPECIALIST` | odbijene; posebno `MPA` |
| `analysis.export` | `PHYSICIAN`, `BILLING_SPECIALIST` | odbijene |
| `analysis.export.read` | `PHYSICIAN`, `BILLING_SPECIALIST` | odbijene |
| `finding.resolve` | `PHYSICIAN` | odbijene |
| `encounter.cancel` | `PHYSICIAN` | odbijene |
| `analysis.cancel` | `PHYSICIAN`, `MPA` | odbijene |
| `encounter.document.archive` | `PHYSICIAN` | odbijene |
| `analysis.correct_fact` | `PHYSICIAN` | odbijene |
| `analysis.correct_service` | `PHYSICIAN`, `BILLING_SPECIALIST` | odbijene |

Rješavanje findinga:

- `finding.resolve` pokriva `RESOLVED`, `ACCEPTED_RISK` i `DISMISSED`;
- **nijedna rola osim `PHYSICIAN` ne smije izvršiti nijedan od ta tri ishoda.**

Review odluka:

- `analysis.review_decision` ostaje **jedna grupna permisija** za `REJECT`, `REQUEST_CHANGES` i
  `SAVE_DRAFT`;
- dozvoljene role: `PHYSICIAN`, `BILLING_SPECIALIST`;
- odbijene: `PRACTICE_ADMIN`, `MPA`, `AUDITOR`, `READ_ONLY`, `SYSTEM_ADMIN`;
- **testabilan negativ:** `MPA` nema nijedan put za review bilješku kroz ovu permisiju;
- **podijeljena permisija se ne uvodi i ne testira.**

## 24.16 Baseline workflow

Nivo: e2e. Za svaki red testiraju se dozvoljene role **i sve izostavljene role kao `DENY`** —
ne samo pozitivni slučajevi.

| Permisija | Dozvoljeno |
|---|---|
| `patient_reference.read` | `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST` |
| `patient_reference.create` | `PHYSICIAN`, `MPA` |
| `encounter.read` | `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST` |
| `encounter.create` | `PHYSICIAN`, `MPA` |
| `encounter.update` | `PHYSICIAN`, `MPA` |
| `encounter.document.list` | `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST` |
| `encounter.document.read` | `PHYSICIAN`, `MPA` |
| `encounter.document.read_original` | `PHYSICIAN` |
| `encounter.document.create` | `PHYSICIAN`, `MPA` |
| `analysis.read` | `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST` |
| `analysis.run` | `PHYSICIAN`, `MPA` |

## 24.17 Autorizacija endpointa

Nivo: e2e + security.

- tražena permisija dolazi iz `03`;
- efektivna permisija dolazi iz evaluacije `15`;
- **ne koristi se nijedna alternativna hard-kodirana lista rola**;
- **RLS ostaje nezavisan drugi sloj**, ne zamjena za provjeru permisije.

Obavezni negativni testovi:

- nedostajuća permisija;
- neaktivan membership;
- membership sa nula rola;
- pokušaj pristupa tenant ruti sa samo `SYSTEM_ADMIN`;
- rola pozivaoca u request bodyju;
- rola pozivaoca u query parametru;
- rola pozivaoca u proizvoljnom headeru;
- nepouzdan JWT role claim;
- injekcija kroz role-setting;
- rola iz druge ordinacije;
- cross-user curenje;
- cross-practice curenje;
- isključen uslovni flag;
- **zastario permission cache nakon promjene role ili flaga**;
- curenje konteksta kroz pooled konekciju.

## 24.18 Otkazivanje i arhiviranje — role

Nivo: e2e + integration. Normativno: D-035 i D-042.

- `encounter.cancel` dozvoljen **isključivo** `PHYSICIAN` roli;
- `encounter.cancel` autorizuje **kompletnu internu kaskadu**;
- interno otkazivanje analize **ne izvršava drugu provjeru** `analysis.cancel` permisije;
- direktan `analysis.cancel` dozvoljen `PHYSICIAN` i `MPA`;
- `encounter.document.archive` dozvoljen **isključivo** `PHYSICIAN` roli;
- otkazivanje ostaje **atomarno**;
- neuspjeh kaskade **rollback-uje obje promjene**;
- postojeće state tranzicije **nepromijenjene**;
- postojeća mapiranja grešaka **nepromijenjena**;
- ponovljeno otkazivanje zadržava već prihvaćeno idempotentno/konfliktno ponašanje (§23.1).

## 24.19 Audit dokaz

Nivo: integration + e2e. Audit se zahtijeva za:

- odobravanje;
- opoziv odobrenja;
- kreiranje exporta;
- pristup export artefaktu;
- pristup `tariff.raw_result`;
- audit export;
- otkazivanje encountera;
- direktno otkazivanje analize;
- odbijen osjetljivi pristup gdje je već zahtijevano;
- ishod uslovne autorizacije gdje je već zahtijevano.

Testovi audita za **dodjelu i uklanjanje role** ostaju **BLOCKED** dok prihvaćeni runtime
administracijski put ne bude uveden (§24.3). **Takav put se ne izmišlja u testovima.**

---

# 24a. D-046 — Immutable correction eventi i deterministička pokrivenost review odluka

Normativno: D-046; `02` §13.1, §13.2, §13.2a, §13.2a.1, §18.1, §22.9, §22.13, §25.2.2 i §28.1;
`04` §12.3.1; `05` Faze 4 i 10.

Vlasništvo migracija: schema objekti u **`009_review_approvals`**, RLS objekti u
**`013_rls_policies`**. Nijedan novi broj paketa se ne uvodi.

`review_item_changes` je **nezavisan immutable correction event**. Nijedan test **ne smije**
pretpostaviti direktnu kolonu `review_decision_id` ni relaciju
`review_item_changes` → `review_decisions`; asocijacija postoji **isključivo** kroz
`review_decision_change_links`.

## 24a.1 Schema constrainti

Nivo: integration. Introspekcija, ne aplikacijski poziv.

- `review_item_changes` **nema kolonu `review_decision_id`** — ni nullable ni obaveznu;
- **ne postoji** composite FK `review_item_changes` → `review_decisions`;
- `review_item_changes.analysis_run_id` postoji i je `not null`;
- composite FK `review_item_changes (practice_id, analysis_run_id)` →
  `analysis_runs (practice_id, id)` postoji;
- composite FK `review_decisions (practice_id, analysis_run_id)` →
  `analysis_runs (practice_id, id)` postoji;
- **oba roditeljska kandidat ključa postoje** —
  `review_decisions unique (practice_id, analysis_run_id, id)` i
  `review_item_changes unique (practice_id, analysis_run_id, id)`;
- tabela `review_decision_change_links` postoji i ima **tačno** kolone `id`, `practice_id`,
  `analysis_run_id`, `review_decision_id`, `review_item_change_id` i `created_at`, sve `not null`;
- `primary key (id)`, `unique (practice_id, id)` i
  `unique (practice_id, review_decision_id, review_item_change_id)` postoje;
- **oba trokolonska composite FK-a postoje** — prema
  `review_decisions (practice_id, analysis_run_id, id)` i prema
  `review_item_changes (practice_id, analysis_run_id, id)`;
- **svi D-046 FK-ovi navode `NO ACTION`** i za `ON DELETE` **i** za `ON UPDATE`;
- `unique (practice_id, review_item_change_id)` **ne postoji** — korekcija nije ograničena na
  jednu odluku;
- **nijedan spekulativni samostalni indeks nije kreiran** (`02` §21).

## 24a.2 Integritet linkova

Nivo: integration. Svaki negativan slučaj mora pasti na **database constraintu**.

- validan same-practice, same-analysis-run link **prolazi**;
- **cross-practice link pada**;
- **same-practice ali cross-analysis-run link pada na database constraintu, ne na aplikacijskoj
  validaciji**;
- link prema **nepostojećoj odluci** pada;
- link prema **nepostojećoj korekciji** pada;
- **duplirani par** odluka/promjena pada;
- jedna odluka smije referencirati **više** korekcija;
- jedna korekcija smije biti referencirana od **više** odluka;
- **nula correction linkova je validno stanje** odluke;
- `analysis_run_id` u link redu **ne može odstupiti** od nijednog roditelja — oba FK-a ga vežu.

## 24a.3 Deterministička granica pokrivenosti

Nivo: integration + concurrency. Testovi su determinističi i koriste kontrolisane transakcije,
ne `sleep`.

- korekcija commitovana **prije** nego što decision transakcija zauzme
  `analysis_runs … FOR UPDATE` je **uključena**;
- correction transakcija koja dođe do iste revizije dok je decision lock držan **čeka** i
  nastavlja tek nakon otpuštanja;
- korekcija commitovana **nakon** granice je **isključena** iz tekuće odluke;
- **kasnija odluka za isti `analysis_run_id` je smije uključiti**;
- korekcija **već povezana** sa ranijom odlukom se **ne filtrira** i pojavljuje se i u kasnijoj
  odluci;
- odluka bira **sve** redove sa istim `practice_id` i `analysis_run_id` — selekcija se **ne
  sužava** postojećim linkovima;
- retry i prihvaćeno idempotency ponašanje **ne dupliraju** linkove **iste** odluke;
- obje vrste transakcija zauzimaju lock **prve**, u jednoj dosljednoj poziciji — lock-order
  ciklus se ne može reprodukovati;
- D-029 `version` / `If-Match` ponašanje nad `extracted_facts` i `service_candidates` je
  **nepromijenjeno** — zajednički lock ga dopunjuje, ne zamjenjuje;
- klijent **ne šalje** correction ID-eve; asocijacija je serverski izvedena i **nijedan request
  ni response payload se ne mijenja**.

## 24a.4 Atomarnost i rollback

Nivo: integration + audit.

- simulirani neuspjeh nakon `INSERT` odluke rollback-uje odluku, linkove i audit;
- simulirani neuspjeh pri upisu linka rollback-uje odluku i audit;
- simulirani neuspjeh pri upisu audit dokaza rollback-uje odluku i sve linkove;
- **nijedan djelimičan ishod nije observabilan** — ni kroz API, ni direktnim upitom;
- rollback otpušta zajednički lock i ne ostavlja upotrebljivo parcijalno stanje.

## 24a.5 Lifecycle, grants i RLS

Nivo: security + integration.

- `UPDATE` nad `review_decision_change_links` je **odbijen**;
- `DELETE` nad `review_decision_change_links` je **odbijen**;
- `UPDATE` nad `review_item_changes` je **odbijen** — veza se nikada ne dopisuje naknadno;
- brisanje bilo kojeg roditelja — `analysis_runs`, `review_decisions` ili
  `review_item_changes` — je **blokirano** `NO ACTION`-om;
- **cross-tenant RLS čitanje je odbijeno**;
- `review_decision_change_links` ima `ENABLE ROW LEVEL SECURITY` **i**
  `FORCE ROW LEVEL SECURITY`;
- politika je standardni tenant predikat `practice_id = app.practice_id`, **bez bootstrap
  izuzetka**;
- `copilot_app` ima **isključivo** `SELECT` i `INSERT`;
- `copilot_system` **nema** nijedan grant (D-023);
- `PUBLIC` **nema** nijedan grant;
- owner je `copilot_migrator`;
- **širi grant od prihvaćenog modela obara test** — asercija je na tačan skup privilegija.

## 24a.6 Introspekcija vlasništva i inventara

Nivo: integration.

- paket `009_review_approvals` posjeduje **schema** objekte iz `02` §22.9;
- paket `013_rls_policies` posjeduje **RLS** objekte iz `02` §22.13;
- **RLS nije u paketu `009`**;
- inventar tenant tabela iz `02` §2.5 i §18.1 sadrži **tačno 30** tabela;
- inventar deklarisanih composite FK-ova odgovara `02` §28.1 — **tačno četrnaest**;
- broj aktivnih permisija ostaje **32**, rezervisanih **3**;
- **nijedan migration paket nije dodan ni renumerisan**;
- nijedan novi endpoint, payload polje, permisija, aplikacijska ili database rola, state
  tranzicija, feature flag ni API error kod nije uveden.

Ovaj odjeljak **ne dodjeljuje permisije rolama**; **javni API ugovor je nepromijenjen** (D-046).

---

# 25. Fixtures i izolacija

## 25.1 Obavezne dimenzije fixtura

- najmanje dvije ordinacije;
- najmanje dva korisnika;
- aktivni, neaktivni i opozvani membershipi;
- kombinacije tenant korisnika i platform rola;
- više encountera;
- lanci analysis revizija;
- approvali: aktivan, opozvan i nepostojeći;
- aktivna i terminalna analysis stanja.

### D-038 dimenzije

- korisnik **bez ijednog** membershipa;
- aktivan membership sa **nula** rola;
- aktivan membership sa **jednom** rolom;
- aktivan membership sa **više** rola;
- neaktivan membership koji **zadržava** svoje role redove;
- **isti korisnik sa različitim rolama u dvije ordinacije**;
- **dva korisnika u istoj ordinaciji**;
- pokušaj duplirane dodjele iste role;
- pokušaj cross-practice membership-role FK-a;
- `SYSTEM_ADMIN` **bez** membershipa;
- `SYSTEM_ADMIN` **sa** zasebnim aktivnim tenant membershipom;
- `PRACTICE_ADMIN` **+** `PHYSICIAN`;
- `PRACTICE_ADMIN` **bez** `PHYSICIAN`;
- `PHYSICIAN`;
- `MPA`;
- `BILLING_SPECIALIST`;
- `AUDITOR`;
- `READ_ONLY`;
- approval flagovi u **sva četiri** stanja: oba isključena; samo `allow_mpa_approval`; samo
  `allow_billing_specialist_approval`; oba uključena;
- **obrisana rola pa kasnija ponovna dodjela** iste role.

Dodatna pravila za role fixture:

- **deterministički fixture identifikatori**;
- **nezavisnost od redoslijeda**;
- **nijedan test ne zavisi od mutacije role ni flaga iz prethodnog testa**;
- kontekst se **resetuje između testova**.

## 25.2 Pravila izolacije

- svaki test počinje sa poznatim transaction/context stanjem;
- nijedan test ne zavisi od redoslijeda izvršavanja;
- race testovi koriste **determinističke sinhronizacijske barijere**, ne `sleep` ni timing
  pretpostavke;
- tenant testovi dokazuju **i pozitivan pristup i cross-tenant odbijanje**;
- audit asercije provjeravaju actor, practice, resource, action i before/after stanje gdje je
  primjenjivo;
- osjetljivi payloadi se **ne upisuju** u test logove (§28);
- D-038 role fixture prate ista pravila — svaki test počinje od poznatog membership i role
  stanja i ne zavisi od redoslijeda izvršavanja.

---

# 26. Evidence i phase gates

## 26.1 Evidencija po test grupi

Za svaku grupu evidentirati: test nivo, vlasničku fazu, preduslovni migration paket, fixture,
očekivani status/kod, obaveznu audit asertaciju i da li blokira završetak faze.

| Grupa | Nivo | Faza | Paket (`02` §22) | Blokira fazu |
|---|---|---|---|---|
| §21.1–21.4 D-033 bootstrap | security/integration/e2e | Faza 4 | `013_rls_policies` | **da** |
| §21.5 `users`/`practices` access model (D-047) | security | Faza 3 (§21.5.6 i §21.5.7 dijelom Faza 4) | `002_identity_and_practices` | **da** |
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
| §24.1 D-038 schema constrainti | integration | Faza 3 | `002_identity_and_practices` | **da** |
| §24.2 D-038 životni ciklus | integration | Faza 3 | `002_identity_and_practices` | **da** |
| §24.3 D-038 audit | schema/domain | Faza 3 | `002_identity_and_practices` | **BLOCKED** za administracijski put |
| §24.4–24.6 D-038 RLS, bootstrap i redoslijed | security/integration/e2e | Faza 4 | `013_rls_policies` | **da** |
| §24.7 D-038 `GET /me` ugovor | contract + e2e | Faza 3 | `002_identity_and_practices` | **da** |
| §24.8–24.11 D-038 kompozicija, uslovi, injekcija i klase rola | unit/integration/security/e2e | Faza 4 | `013_rls_policies` | **da** |
| §24.13 konformnost produkcijske matrice | unit + contract | Faza 3 | `002_identity_and_practices` | **da** |
| §24.14 profili rola i tačni brojevi | unit | Faza 3 | `002_identity_and_practices` | **da** |
| §24.15 dodjele sa najvećim rizikom i korekcije | e2e + security | Faza 4 | `013_rls_policies` | **da** |
| §24.16 baseline workflow grantovi | e2e | Faza 4 | `013_rls_policies` | **da** |
| §24.17 autorizacija endpointa | e2e + security | Faza 4 | `013_rls_policies` | **da** |
| §24.18 otkazivanje i arhiviranje — role | e2e + integration | Faza 5 | — | **da** |
| §24.19 audit dokaz | integration + e2e | prema fazi vlasnika radnje | — | **da**; **BLOCKED** za role administration |
| §24a.1–24a.2 D-046 schema i integritet linkova | integration | Faza 10 | `009_review_approvals` | **da** |
| §24a.3–24a.4 D-046 pokrivenost i rollback | integration + e2e + audit | Faza 10 | `009_review_approvals` | **da** |
| §24a.5 D-046 lifecycle, grants i RLS | security + integration | Faza 4 | `013_rls_policies` | **da** |
| §24a.6 D-046 introspekcija vlasništva i inventara | integration | Faza 10 | `009_review_approvals` | **da** |

Vlasništvo migration paketa preuzeto je iz `02` §22 i `04`. **Nijedan novi broj paketa se ne
uvodi.**

## 26.2 Uslovi pada phase gatea

Phase gate **mora pasti** kada:

- D-033 security testovi padnu;
- D-034 concurrency ili constraint testovi padnu;
- D-035 testovi atomarnog otkazivanja padnu;
- D-036 authorization testovi padnu;
- D-037 export precondition testovi padnu;
- D-046 testovi integriteta linkova, granice pokrivenosti ili rollbacka padnu.

Faza 4 ili Faza 10 **mora pasti** i kada, prema §24a:

- `review_item_changes` nosi kolonu `review_decision_id` u bilo kojem obliku;
- postoji composite FK `review_item_changes` → `review_decisions`;
- `review_item_changes.analysis_run_id` nedostaje ili nije `not null`;
- `review_decision_change_links` nedostaje ili je neispravno definisana;
- bilo koji D-046 FK ne navodi `NO ACTION` za `ON DELETE` ili `ON UPDATE`;
- same-practice ali cross-analysis-run link uspije;
- duplirani par odluka/promjena uspije;
- već povezana korekcija bude isključena iz kasnije odluke;
- korekcija commitovana nakon granice uđe u tekuću odluku;
- odluka sa nula korekcija bude odbijena;
- `UPDATE` ili `DELETE` nad `review_decision_change_links` uspije;
- korekcija bude povezana sa odlukom naknadnim `UPDATE`-om;
- request ili response payload odluke dobije correction ID polje;
- RLS nad `review_decision_change_links` nije `ENABLE` **i** `FORCE`;
- vlasništvo pakete odstupi od `009_review_approvals` (schema) i `013_rls_policies` (RLS);
- inventar tenant tabela nije **30**;
- inventar deklarisanih composite FK-ova nije **14**.

Faza 3 ili Faza 4 **mora pasti** i kada:

- singularna kolona `practice_memberships.role` postoji;
- `practice_membership_roles` nedostaje ili je neispravno definisana;
- duplirana dodjela role uspije;
- cross-practice dodjela role uspije;
- testovi uklanjanja i ponovne dodjele iz §24.2 padnu;
- neaktivan ili zero-role membership dobije bilo koju permisiju;
- `GET /me` vrati `role` umjesto `roles[]`;
- `roles[]` je nedeterminističan ili izloži role drugog korisnika;
- injekcija role uspije;
- `platformRoles` uđu u tenant permission uniju;
- RLS self-enumeracija propusti cross-user ili cross-practice podatke;
- ponašanje D-033 bootstrapa se promijeni;
- vlasništvo migration paketa odstupi od `02` i `04`.

Faza 3 ili Faza 4 **mora pasti** i kada, prema §24.13–§24.19:

- implementacijska matrica odstupa od `15`;
- broj aktivnih permisija nije 32;
- broj rezervisanih permisija nije 3;
- bilo koja rezervisana permisija dobije grant;
- bilo koji aktivan red nedostaje ili je dupliran;
- bilo koja role ćelija je prazna, `OPEN` ili nepoznata;
- bilo koji `Source` nedostaje ili nije prihvaćen;
- bilo koji brojač profila role odstupa od `15`;
- injekcija role uspije;
- `DENY` poništi `ALLOW`;
- neaktivan ili zero-role membership dobije permisiju;
- `platformRoles` uđu u tenant kompoziciju;
- `READ_ONLY` dobije bilo koji grant;
- `AUDITOR` dobije treću permisiju;
- `PRACTICE_ADMIN` dobije opštu kliničku ovlast;
- podobnost za odobravanje i opoziv se razlikuje;
- `encounter.close` izgubi bilo koju od tri prihvaćene role;
- `GET /me` vrati singularni `role` ili netačan `permissions[]`;
- bilo koji test iz §21.5 bude izostavljen, preskočen ili oslabljen;
- bilo koja politika iz `02` §17.5 ili §17.6 nedostaje, ili je RESTRICTIVE politika zamijenjena
  permissive varijantom;
- bude uvedena treća `users` politika bez prihvaćenog ADR-a (`13` §19);
- permisija endpointa ili podobnost role odstupi od `03` ili `15`.

Testovi iz **§21.5 su obavezan izvršiv ugovor** (D-047) i **nikada se tiho ne izostavljaju**.
Suite koji ih preskoči bez oznake tretira se kao neuspio gate. Test koji tvrdi da dijeljeni
`copilot_app` credential dokazuje identitet krajnjeg korisnika je **sam po sebi defekt**
(§21.5.8).

Isto važi za testove role administration audita (§24.19) i za operacije klasifikovane kao
`OUT OF V1` ili `REQUIRES NEW PERMISSION AND ADR` (§24.12).

## 26.3 Status rekonsilijacije role-permission modela

| Dokument | Status |
|---|---|
| `06_DECISION_LOG.md` — D-039 do D-045 | **ACCEPTED** |
| `15_ROLE_PERMISSION_MATRIX_V1.md` | **kreiran i ACCEPTED** |
| `03_API_CONTRACT_V1.md` | **usklađen** |
| `04_BACKEND_IMPLEMENTATION_PLAN_V1.md` | **usklađen** |
| `05_IMPLEMENTATION_CHECKLIST.md` | **usklađen** |
| `07_CURSOR_PHASE_PROMPTS.md` | **usklađen** |
| `08_TEST_STRATEGY_V1.md` — ovaj dokument | **usklađen** |
| `MANIFEST.md` | čeka kontrolisani batch |

---

# 27. OpenAPI

CI:

1. generate;
2. validate 3.1;
3. compile generated TS client;
4. compare committed file;
5. detect breaking change;
6. ensure security schemes;
7. ensure error response.

---

# 28. Logging security

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

# 29. Performance smoke

Nije load certification, ali minimalno:

- encounter list p95 lokalno prihvatljiv na 10k fixture redova;
- workspace query bounded, bez N+1;
- queue processes configured concurrency;
- DB connection pool ne eksplodira;
- large audit list cursor pagination.

Query count može biti instrumentovan u test modu.

---

# 30. CI gate

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

# 31. Test evidence report

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

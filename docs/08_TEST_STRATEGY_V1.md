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

select rolname, rolbypassrls
from pg_roles
where rolname in ('copilot_app','copilot_migrator');

select tableowner
from pg_tables
where tablename = 'encounters';
```

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

- GET ETag 1;
- PATCH If-Match 1 → success, ETag 2;
- drugi PATCH If-Match 1 → 409;
- PATCH bez If-Match kada je obavezan → 428 ili dokumentovani 400;
- response sadrži currentVersion;
- audit bilježi uspješnu promjenu, ne neuspješni overwrite kao business change.

---

# 11. Encounter state machine

Testirati svaku dozvoljenu i zabranjenu tranziciju.

Dozvoljene:

```text
DRAFT → READY_FOR_ANALYSIS
READY_FOR_ANALYSIS → ANALYSIS_IN_PROGRESS
ANALYSIS_IN_PROGRESS → REVIEW_REQUIRED
REVIEW_REQUIRED → APPROVED
APPROVED → EXPORT_PENDING
EXPORT_PENDING → EXPORTED
EXPORTED → CLOSED
```

Zabranjene:

```text
DRAFT → APPROVED
CANCELLED → ANALYSIS_IN_PROGRESS
CLOSED → DRAFT
EXPORTED → DRAFT
```

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

---

# 18. Export

- no approval;
- revoked approval;
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

---

# 21. OpenAPI

CI:

1. generate;
2. validate 3.1;
3. compile generated TS client;
4. compare committed file;
5. detect breaking change;
6. ensure security schemes;
7. ensure error response.

---

# 22. Logging security

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

# 23. Performance smoke

Nije load certification, ali minimalno:

- encounter list p95 lokalno prihvatljiv na 10k fixture redova;
- workspace query bounded, bez N+1;
- queue processes configured concurrency;
- DB connection pool ne eksplodira;
- large audit list cursor pagination.

Query count može biti instrumentovan u test modu.

---

# 24. CI gate

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

# 25. Test evidence report

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

# 09 — Security and Privacy Baseline v1

**Namjena:** Tehnički minimum za razvoj i pilot pripremu.  
**Napomena:** Nije pravno mišljenje; pravna/DPIA provjera je zaseban produkcijski gate.

---

# 1. Security ciljevi

- spriječiti cross-tenant pristup;
- spriječiti neovlašten pristup medicinskom sadržaju;
- smanjiti količinu identifikacionih podataka;
- osigurati integritet analysis/approval/export lanca;
- zaštititi secrets;
- omogućiti audit;
- ograničiti štetu external provider incidenta;
- osigurati backup/restore;
- ne prikrivati failure kao uspješan rezultat.

---

# 2. Data klasifikacija

## Class A — posebno osjetljivo

- medicinski tekst;
- dijagnoze povezane sa osobom;
- dokumenti;
- originalni external patient/encounter ID;
- billing draft povezan sa osobom;
- AI raw payload sa medicinskim kontekstom.

Kontrole:

- minimal access;
- application encryption gdje definisano;
- audit read;
- no logs;
- no Redis;
- retention;
- controlled export.

## Class B — osjetljivo poslovno

- GLN/ZSR;
- integration config;
- practice membership;
- professional identity;
- audit event;
- tariff licensing artefact.

## Class C — tehničko pseudonimizovano

- internal UUID;
- patient pseudonym;
- analysis/job ID;
- hashes;
- status;
- metrics bez sadržaja.

## Class D — javno/konfiguraciono

- generički rule title;
- API docs bez realnih podataka;
- health status bez details.

---

# 3. Data minimization

Copilot ne kopira kompletan EHR.

Za tariff analizu čuvati samo:

- encounter context;
- potrebne diagnosis codes;
- age/sex kada potrebno;
- dokumente relevantne za billing;
- structured facts;
- candidates/result;
- audit.

Ne čuvati bez svrhe:

- adresu;
- telefon;
- e-mail pacijenta;
- kompletnu anamnezu izvan relevantnog encountera;
- AHV;
- insurance number;
- sve historijske dokumente.

---

# 4. Tenant isolation

Defense in depth:

1. user authentication;
2. active membership;
3. practice header;
4. permission;
5. TenantDatabaseService;
6. RLS;
7. composite FK;
8. object key prefix/authorization;
9. audit;
10. test.

Object storage key primjer:

```text
practices/{practiceId}/documents/{documentId}/source
```

Presigned URL se izdaje tek nakon tenant/permission provjere i kratko traje.

---

# 5. Authentication

Produkcija:

- OIDC;
- MFA;
- short-lived access tokens;
- issuer/audience verification;
- key rotation;
- logout/session policy prema provideru.

Backend ne čuva password hash.

Dev auth:

- samo development/test;
- startup fail ako `NODE_ENV=production`;
- jasno označen;
- nema default production secret.

---

# 6. Authorization

Permission-based.

Princip najmanjih prava.

Posebne permissions:

- original document read;
- approval;
- export;
- tariff management;
- integration credentials;
- raw tariff result;
- audit export.

System administrator ne dobija automatski medicinski read samo zato što održava infrastrukturu.

## 6.1 Identity i practice access model (D-047)

Normativno: D-047; `02` §16.2.1, §16.2.4, §17.5, §17.6, §20.2a.

- `users` i `practices` nose `ENABLE` **i** `FORCE ROW LEVEL SECURITY`; nijedna nije neograničeno
  runtime-čitljiva.
- **Column-level data minimization.** `copilot_app` dobija `SELECT` isključivo na
  `users(id, email, display_name, preferred_language, status)` i
  `practices(id, code, name, default_language, timezone, status)`.
- **Osjetljiva polja nemaju grant nijednoj runtime roli:** `practices.zsr_number` i
  `practices.gln_number` (klasa B, §2), `practices.legal_name`, `users.auth_subject` i
  `users.last_login_at`. Ne pojavljuju se ni u jednom API odgovoru u v1.
- **Nijedan runtime upis** nad `users` ni `practices`; obje se pune migracijom i seedom.
- `copilot_system` nema grant nad te dvije tabele; `PUBLIC` nema grant.
- **Transakcijski lokalan identity kontekst.** `app.auth_subject`, `app.user_id` i
  `app.practice_id` postavljaju se sa `set_config(..., true)` i ne preživljavaju transakciju, pa
  pooled konekcija ne nasljeđuje identitet prethodnog requesta.
- **Nijedna `SECURITY DEFINER` funkcija** nije uvedena za identity ni tenant bootstrap.
- **Status gate.** Korisnik čiji `status` nije `ACTIVE` odbija se prije `set_user_context`;
  ordinacija čija `status` nije `ACTIVE` odbija se prije nego `app.practice_id` postoji.
- Pristup redu **drugog** korisnika je `DENY / NOT IMPLEMENTED` u v1; gate je
  `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19).

**Granica koja se ne smije precijeniti.** RLS **ne autentifikuje** krajnjeg korisnika kada je
dijeljeni `copilot_app` credential ukraden: držalac credentiala može sam postaviti `app.*`
varijable kroz `set_config`. RLS štiti od aplikacijskih grešaka, zaboravljenih filtera i običnih
cross-tenant bugova. Pri kompromitovanom credentialu **preživljavaju**: column-level `SELECT`
ograničenje, nepostojanje write grantova, nepostojanje vlasništva, `NOBYPASSRLS` i nepostojanje
DDL prava. Tačka sprovođenja autorizacije je API, ne baza (D-023 klauzula 13, D-033, D-047
klauzula 20).

---

# 7. Enkripcija

## 7.1 Transit

Produkcija:

- HTTPS/TLS;
- DB TLS;
- Redis TLS/private network;
- S3 TLS;
- service-to-service auth;
- no plaintext external API.

## 7.2 At rest

- managed disk/database encryption;
- encrypted object storage;
- encrypted backup;
- application-level encryption za medicinski tekst/external IDs.

## 7.3 Application encryption proposal

AES-256-GCM envelope encryption.

Per encrypted value/object metadata:

```text
ciphertext
iv/nonce
auth tag
key reference
key version
algorithm version
```

Keys:

- KEK u KMS;
- DEK generisan prema odabranoj granularnosti;
- no key in DB/log;
- rotation plan;
- old version decrypt for retention.

Local development koristi jasno označen local key, nikada production.

---

# 8. Hash/HMAC

SHA-256 nije enkripcija.

Za low-entropy external ID koristiti keyed HMAC, ne obični hash, da se smanji dictionary attack.

Primjene:

- searchable external ref token: HMAC;
- content integrity: SHA-256;
- approval canonical payload: SHA-256;
- audit chain: SHA-256.

---

# 9. Secrets

Secrets ne idu u:

- Git;
- `.env.example`;
- database JSON;
- log;
- OpenAPI example;
- test snapshot;
- Cursor prompt;
- issue tracker.

Produkcija:

- secrets manager;
- scoped service identity;
- rotation;
- access audit.

Database čuva samo `credentials_secret_ref`.

---

# 10. AI privacy

Prije AI poziva:

1. odabrati samo relevantni dokument;
2. ukloniti direct identifiers;
3. zamijeniti external IDs;
4. provjeriti prompt template;
5. ne uključivati nepotrebnu practice identifikaciju;
6. request ID ne smije biti identifikator pacijenta;
7. provider retention/training politika mora biti odobrena.

Prompt injection:

Dokument je nepouzdan input. Tekst tipa "ignore instructions" se tretira kao medicinski dokument, ne sistemska komanda.

AI output:

- schema validate;
- no automatic approval;
- no direct write final billing;
- evidence;
- confidence;
- audit model/prompt version.

---

# 11. Logging

Structured allowlist logging.

**Bootstrap i identity događaji (D-047, klauzula 19).** Rezolucija subjekta — uspjeh i neuspjeh —
odbijanje po statusu korisnika, neuspjeh membershipa, odbijanje po statusu ordinacije i uspostava
konteksta idu **isključivo u strukturirani operativni log**, nikada u `audit_events`. Razlog je
strukturni: `audit_events.practice_id` je `NOT NULL` (D-023, klauzule 1–2), a u trenutku tih
događaja tenant još ne postoji. Obično, neosjetljivo `practice.read` **ne zahtijeva** trajni audit
red u v1; ako se ubuduće uvede osjetljiv practice DTO, trajni audit postaje dio tog ADR-a.

**`auth_subject` se nikada ne logira** — ni u sirovom ni u skraćenom obliku. U logu se koristi
interni `userId` (UUID).

Dozvoljena polja:

```text
service
environment
level
requestId
practiceId UUID
userId UUID
encounterId
analysisId
jobId
action
status
errorCode
durationMs
dependency
```

Zabranjena:

```text
medical text
document text
patient name
AHV
insurance number
external ID plaintext
JWT
Authorization
cookies
credentials
database URL
encryption keys
raw AI prompt/response
raw Axenita response
auth_subject
ZSR / GLN
```

Error adapter mora prevesti external error u safe code/message.

---

# 12. Audit

Audit događaji za:

- sensitive read;
- create/update/cancel;
- analysis;
- correction;
- finding resolution;
- approval/revoke;
- export;
- integration change;
- tariff activation.

Audit je append-only.

Ne čuva puno medicinsko prethodno/novo stanje. Čuva:

- resource ID;
- field;
- hash;
- kontrolisanu vrijednost kada nije PHI;
- actor;
- request;
- reason.

---

# 13. Upload sigurnost

- content length limit;
- MIME allowlist;
- extension ne smatra se dokazom tipa;
- magic byte check;
- antivirus scan gdje je dostupan;
- random object key;
- no public bucket;
- short presigned URL;
- hash verification;
- PDF active content razmatranje;
- no direct render unsafe HTML.

---

# 14. API sigurnost

- Helmet;
- CORS allowlist;
- rate limiting;
- body limit;
- validation whitelist;
- reject unknown fields;
- UUID validation;
- output DTO;
- no mass assignment;
- no raw Prisma errors;
- request timeout;
- pagination max;
- permission guard;
- idempotency;
- optimistic locking.

---

# 15. Database sigurnost

- private network;
- TLS;
- runtime/migrator split;
- no public access;
- RLS;
- FORCE RLS;
- composite FK;
- least privilege grants;
- no runtime DDL;
- append-only audit;
- backup role;
- query timeout gdje je primjenjivo.

---

# 16. Redis sigurnost

- private network;
- auth/TLS produkcija;
- no medical payload;
- no secrets;
- retention/eviction plan;
- BullMQ prefix environment-specific;
- no shared dev/prod instance.

---

# 17. Object storage sigurnost

- private;
- bucket policy least privilege;
- server-side encryption;
- application encryption za class A;
- versioning prema policy;
- lifecycle;
- access logs;
- tenant key prefix;
- presigned URL short TTL;
- checksum.

---

# 18. Threat model summary

## T1 Cross-tenant IDOR

Kontrole: practice context, RLS, composite FK, 404, tests.

## T2 Compromised runtime DB credential

Kontrole: RLS, least privilege, no owner, no BYPASSRLS, encryption.

Uz D-047, za `users` i `practices` razlikovati dvije klase kontrola:

- **preživljavaju krađu credentiala:** column-level `SELECT` (osjetljiva polja nedostupna),
  nepostojanje write grantova, nepostojanje vlasništva, `NOBYPASSRLS`, nepostojanje DDL prava;
- **ne preživljavaju:** RLS politike vezane za `app.*` varijable, jer ih držalac credentiala može
  sam postaviti. Ne tvrditi jaču database garanciju identiteta (§6.1).

## T3 PHI in logs

Kontrole: allowlist logger, redaction, tests.

## T4 Duplicate job/export

Kontrole: idempotency, outbox, unique constraints, processor checkpoints, approval hash.

## T5 AI hallucination

Kontrole: structured candidate, evidence, deterministic engine, safety rules, human approval.

## T6 Stale concurrent review

Kontrole: revision, ETag, row lock, approval expected revision.

## T7 Tampered approval/export

Kontrole: canonical payload SHA-256, immutable approval, export hash comparison.

## T8 Malicious upload

Kontrole: size/MIME/magic/AV/private storage.

## T9 Secret leak

Kontrole: secrets manager, no logs/Git, scanning/rotation.

## T10 Insider excessive access

Kontrole: permission, sensitive read audit, least privilege, periodic review.

---

# 19. Backup i disaster recovery

- encrypted backup;
- separate account/project;
- retention;
- restore test;
- RPO/RTO before pilot;
- DB + object storage consistency plan;
- secrets/KMS recovery;
- runbook.

Backup nije valjan dok restore nije testiran.

---

# 20. Retention i deletion

Prije produkcije definisati:

- dokument retention;
- analysis/audit retention;
- raw AI retention;
- failed upload cleanup;
- idempotency cleanup;
- outbox cleanup;
- log retention;
- backup retention.

Deletion:

- legal/business approval;
- tenant-scope;
- audit;
- object + DB;
- backup expiry;
- no ad-hoc DELETE API.

---

# 21. Incident response minimum

- detection;
- severity;
- containment;
- credential rotation;
- audit preservation;
- tenant impact analysis;
- communication owner;
- legal/privacy escalation;
- recovery;
- postmortem;
- regression controls.

---

# 22. Security release gate

Prije pilota:

- [ ] threat model review;
- [ ] RLS suite;
- [ ] permission review;
- [ ] log scan;
- [ ] secret scan;
- [ ] dependency scan;
- [ ] upload review;
- [ ] encryption/KMS;
- [ ] backup restore;
- [ ] OIDC/MFA;
- [ ] hosting/DPA;
- [ ] retention;
- [ ] incident plan;
- [ ] external provider agreements;
- [ ] penetration/security assessment.

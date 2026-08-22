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

**Redigovani tekst je i dalje Class A (D-060, klauzula 23).** Deterministička redakcija Faze 5 nije
anonimizacija ni de-identifikacija; `redaction_status = COMPLETED` ne mijenja klasu podatka. Class A
kontrole — minimalan pristup, aplikacijska enkripcija, audit čitanja, zabrana logovanja, zabrana
Redisa, retention i kontrolisan export — važe za **normalizovani i redigovani** tekst jednako.

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

**Class C nije sinonim za „loggable" (D-060, klauzule 38–39).** Dvije stavke iz ove liste su
izričito **izuzete iz allowliste tehničkog loga** (§11):

- **`patient pseudonym`** — Class C, ali **nije** dozvoljen log atribut; korelacija u logu ide
  isključivo preko internih UUID-eva;
- **deterministički lookup token eksternog ID-a** (`*_ref_hash`) — iako je formalno „hash", to je
  **keyed, linkabilan** token stabilan po pacijentu i ordinaciji, pa se tretira kao **osjetljiv**:
  nikada se ne logira, ne vraća u API odgovoru i ne pojavljuje u Problem Details tijelu.

Stavka „hashes" u ovoj listi odnosi se na **hasheve integriteta sadržaja** (approval payload, paket,
audit lanac), ne na keyed lookup token.

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

Sloj 5 imenuje **tenant database granicu** kao sigurnosnu odgovornost, ne obaveznu klasu (D-054,
klauzule 5–10; D-056, dio A): jedan `PrismaService`, **jedna** pinovana interaktivna transakcija,
`set_request_context` unutar nje, **nijedan** caller-supplied identitet i **nijedna** druga,
ugniježdena ni paralelna transakcija. Na kanonskom `main`-u tu granicu nosi `TenantRequestPipeline`.
**Konkretan `TenantDatabaseService` facade je uslovno odgođen** i postaje obavezan tek kada stvarni
tenant business modul zatraži tu apstrakciju; sigurnosna svojstva sloja 5 se time **ne slabe**.

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

## 8.1 Deterministički lookup token eksternog ID-a (D-060)

Normativno: D-060, dijelovi A i B; `02` §2.8.

- **Algoritam:** HMAC-SHA256; **encoding:** lowercase hex, 64 znaka; **perzistirani oblik:**
  `h1.<hex64>` u postojećem `varchar(128)`.
- **Namjenski ključ.** Token koristi **`K_hmac`**, ključ **odvojen od AES-GCM ključa podataka
  `K_enc`** (§7.3, D-025). **`K_hmac` ne smije biti jednak `K_enc` niti direktno izveden iz njega.**
  Razlog nije stilski: D-025, klauzula 7 propisuje da rotacija enkripcijskog ključa **ne mijenja
  `*_hash` kolone**, pa bi HMAC nad `K_enc` značio da rotacija razbija deterministički lookup
  identitet postojećih redova. Budući startup guard mora odbiti start pri `K_hmac == K_enc`.
- **Domenska separacija.** HMAC poruka je kanonski UTF-8 string sa LF separatorima koji sadrži
  verziju formata, **domen tokena**, `practice_id`, `source_system` i normalizovanu vrijednost. Bez
  `practice_id` u poruci jednakost tokena bi postala **cross-tenant orakl**.
- **Normalizacija.** Ulaz prolazi profil `MANUAL` v1 (NFC, vanjski trim, odbijanje kontrolnih
  znakova; **bez `NFKC`, bez case-foldinga, bez uklanjanja vodećih nula**), verzionisan **odvojeno**
  od generacijskog markera `h1`.
- **Osjetljivost.** Token je **linkabilan i osjetljiv**. **Nikada se ne logira**, **nikada ne vraća
  u API odgovoru** i **nikada ne pojavljuje u Problem Details tijelu** (§2, §11).
- **Ključni materijal.** Ni `K_hmac`, ni njegova referenca, ni verzija ne ulaze u bazu, log,
  odgovor ni test snapshot (§9). Produkcijski životni ciklus `K_hmac` pada pod isti otvoreni
  produkcijski gate kao i `K_enc` (D-OPEN-004a).

## 8.2 Hash normalizovanog i redigovanog teksta (D-060)

`source_text_hash` je lowercase hex SHA-256 UTF-8 kodiranja **kanonski normalizovanog,
neredigovanog** teksta, računat **prije** enkripcije, pa je **reproducibilan iz perzistiranog
ciphertexta** nakon ovlaštene dekripcije. `redacted_text_hash` se računa istim postupkom nad
redigovanim tekstom. Sirovi pre-normalizacioni tekst se **ne perzistira** i **druga hash kolona za
njega ne postoji** (`02` §2.10).

Ova dva hasha su hashevi integriteta sadržaja, ne keyed tokeni — ali su **izvedeni iz Class A
sadržaja** i **ne pojavljuju se u logu**.

## 8.3 Redakcija nije sigurnosna granica (D-060, klauzula 41)

Deterministička redakcija Faze 5 je **pomoć pri egressu i minimizaciji podataka**, ne sigurnosna
granica i **ne kontrola pristupa**.

- Sigurnosne granice ostaju: autentifikacija, permisije, tenant izolacija/RLS i aplikacijska
  enkripcija. **Nijedna se ne smije oslabiti** pozivom na to da je tekst redigovan.
- **`redaction_status = COMPLETED` znači isključivo** da je konfigurisani deterministički ruleset
  (`phase5-basic-v1`) izvršen uspješno. **Ne tvrdi** anonimizaciju, de-identifikaciju, odsustvo svih
  identifikatora ni sigurnost za neograničeno otkrivanje. **Rezultat ostaje Class A** (§2).
- Ruleset Faze 5 **ne uklanja** imena, adrese, dijagnoze, simptome, lijekove, doziranja, mjerenja,
  medicinski nužne datume ni kliničke nalaze. Nijedan dokument, test ni komentar **ne smije tvrditi
  suprotno**.
- Prepoznavanje telefonskih brojeva je **namjerno strogo**; kad je signal dvosmislen, **ne rediguje
  se**. Lažno negativni rezultati su prihvaćeni i dokumentovani za Fazu 5, jer lažno pozitivna
  redakcija doziranja ili laboratorijske vrijednosti nosi **kliničku** štetu.
- Zamjenski token je **konstantan po klasi** (npr. `[REDACTED:EMAIL]`) i **ne smije** sadržavati
  hash, prefiks, sufiks, skraćeni original ni bilo koji stabilan derivat uklonjene vrijednosti —
  takav derivat bi vratio linkabilnost.
- Pri `redaction_status = FAILED` `view=redacted` **ne smije** pasti nazad na normalizovani ni
  originalni tekst; fallback bi bio tiho zaobilaženje `encounter.document.read_original` (D-043).

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

**Doseg koraka 2 u Fazi 5 (D-060, klauzule 24–26).** Korak „ukloniti direct identifiers" je **cilj
kontrole**, a ne opis onoga što deterministički ruleset Faze 5 (`phase5-basic-v1`) stvarno postiže.
Taj ruleset uklanja **usku, validiranu klasu** identifikatora — e-mail, URL, validiran AHV/AVS,
validiran IBAN, kanonski definisan identifikator osiguranja, eksternu referenciju pacijenta iz
tekućeg zahtjeva i **strogo prepoznat** švicarski telefon. **Ne uklanja** imena, adrese, dijagnoze,
simptome, lijekove, doziranja, mjerenja, medicinski nužne datume ni kliničke nalaze.

Posljedica je normativna: **redigovani AI input Faze 5 i dalje sadrži klinički sadržaj i ostaje
Class A** (§2, §8.3). Prije nego što se korak 2 smije smatrati ispunjenim u punom značenju, potrebna
je **viša klasa redakcije/NER logike**, koja **nije obuhvat Faze 5**. Do tada teret nose koraci 1, 4,
5 i 7 — izbor minimalnog dokumenta, odobren prompt template, izostavljanje nepotrebne identifikacije
i **odobrena provider retention/training politika** — a ne redakcija.

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
external ref HMAC token
patient pseudonym
normalized document text
redacted document text
source_text_hash / redacted_text_hash
encryption IV / auth tag
odbijena PHI vrijednost iz validacije
```

**PHI dopuna allowliste (D-060, klauzule 38–40).** Uz postojeće zabrane:

- **deterministički lookup token eksternog ID-a** (`h1.<hex64>`) je keyed i linkabilan i **nije**
  dozvoljen log atribut, iako se kolona zove `*_hash`;
- **`patient pseudonym`** je Class C, ali **nije** na allowlisti — korelacija ide preko internih
  UUID-eva;
- **tekst dokumenta je zabranjen u svakom obliku** — izvorni, normalizovani i **redigovani**;
  redakcija **ne** čini tekst loggable;
- **ciphertext, ključevi, IV i auth tag** se nikada ne logiraju;
- **sporna PHI vrijednost koja je pala validaciju se nikada ne logira** — ni cijela, ni skraćena,
  ni kao prefiks/sufiks.

**Problem Details poruke.** Validacione poruke za PHI i eksterne identifikatore koriste **sigurne
generičke poruke**. Polje `errors[].message` (`03` §8) **ne smije** citirati odbijenu vrijednost,
njen prefiks, sufiks ni bilo koji njen derivat. Prekoračenje maksimuma manuelnog teksta
(`422 VALIDATION_ERROR`, `03` §13.1) **ne smije** vratiti nijedan dio poslanog teksta.

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

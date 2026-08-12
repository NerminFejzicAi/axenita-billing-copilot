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

**Projektno pravilo (D-025, klauzula 11):** aplikacijski kod eksplicitno generiše UUID i
navodi ga u INSERT-u. Baza ne generiše poslovne ID-eve.

- poslovne tabele nemaju database ID default;
- `gen_random_uuid()` se ne koristi kao column default;
- Prisma `@default(uuid())` se ne koristi za poslovne entitete (`26`);
- seed skripte i migracione skripte takođe eksplicitno navode UUID;
- pravilo važi za sve poslovne tabele, ne samo za enkriptovane.

Razlog: kanonski AAD (§2.7) sadrži `row_id`, pa `id` mora postojati u aplikaciji prije
nego što se bilo koje polje tog reda enkriptuje. Jednoobrazno pravilo uklanja potrebu za
procjenom po tabeli.

Za generisanje ID-a nije potrebna nijedna PostgreSQL ekstenzija.

### 2.2.1 Registar dokumentovanih iznimki

| Tabela | Kolona | Razlog | Odobreno u |
|---|---|---|---|
| — | — | — | — |

Registar je prazan. Novi unos zahtijeva novi ADR prema `00` §16.

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

**Bezuslovno pravilo (D-022):** svaka tenant tabela ima

```sql
practice_id uuid not null
unique (practice_id, id)
```

Constraint je obavezan bez obzira na to da li je tabela trenutno cilj composite foreign
keya. PostgreSQL composite FK zahtijeva unique constraint nad tačno referenciranim parom
kolona; uslovno pravilo je u v1 baselineu proizvelo šest tabela koje se koriste kao FK
ciljevi, a nemaju potreban constraint.

Posljedice pravila:

- nema procjene po tabeli;
- `11` §3 je mehanički provjerljiv;
- budući composite FK ne zahtijeva migraciju nad popunjenom tabelom.

`practice_id` je uvijek `not null`. Nijedna tenant tabela nema nullable tenant ključ, jer
`NULL = <uuid>` u RLS politici daje `NULL` i red postaje nevidljiv bez greške (D-023).

Tabele koje NISU tenant tabele i na koje se pravilo ne odnosi:

```text
practices                        (sama je tenant)
users                            (globalna)
platform_role_assignments        (globalna, user-scoped RLS)
tariff_releases                  (globalna)
tariff_release_artifacts         (globalna)
system_storage_objects           (globalna)
tariff_catalog_entries           (globalna)
tariff_release_activation_history(globalna)
ai_prompt_versions               (globalna)
safety_rules                     (globalna)
safety_rule_versions             (globalna)
```

Jedine dvije tenant tabele koje u v1 još nemaju constraint su `import_batches` i
`webhook_receipts`. Obje su **DEFERRED do Axenita epica** (D-023), gdje se odlučuje njihov
tenancy model. Nijedna od njih nije cilj postojećeg ni impliciranog composite FK-a.

## 2.6 Soft status

Business zapisi se ne brišu standardnim CRUD deleteom. Koriste se statusi, archive i retention tok.

## 2.7 Enkripcijski envelope

Normativni izvor je D-025. Ova sekcija je jedini kanonski opis; pojedinačne tabele samo
navode kolone i CHECK constrainte.

### 2.7.1 Algoritam

- AES-256-GCM;
- ključ je tačno 32 bajta, verzionisani aplikacijski ključ iz secrets managera;
- `envelope_version` počinje od 1;
- nema per-row DEK u v1;
- ključ nikada ne ulazi u bazu.

### 2.7.2 Kolone po polju

```sql
<field>_ciphertext bytea
<field>_iv         bytea   -- tačno 12 bajtova
<field>_auth_tag   bytea   -- tačno 16 bajtova
```

IV je uvijek svjež po polju i po upisu. Ponovna upotreba IV-a sa istim ključem je
zabranjena; svaki UPDATE ciphertext kolone generiše novi IV.

### 2.7.3 Kolone po redu

```sql
encryption_algorithm   varchar(30)
encryption_version     integer
encryption_key_ref     varchar(255)
encryption_key_version integer
```

Sva enkriptovana polja u jednom redu dijele jedan `encryption_key_ref` i jedan
`encryption_key_version`. Kada red ima više enkriptovanih polja, IV i auth tag ostaju
nezavisni po polju.

### 2.7.4 Kanonski AAD

UTF-8 string, LF separatori, bez završnog praznog reda:

```text
v1
practice_id=<canonical UUID or SYSTEM>
table=<table name>
row_id=<canonical UUID>
column=<column name>
envelope_version=<integer>
```

`row_id` zahtijeva aplikacijski generisan UUID prije INSERT-a (§2.2).

### 2.7.5 Obavezni CHECK constrainti

Po enkriptovanom polju:

```sql
check (
  (<field>_ciphertext is null
   and <field>_iv is null
   and <field>_auth_tag is null)
  or
  (<field>_ciphertext is not null
   and <field>_iv is not null
   and <field>_auth_tag is not null)
)
check (<field>_iv is null or octet_length(<field>_iv) = 12)
check (<field>_auth_tag is null or octet_length(<field>_auth_tag) = 16)
```

Po redu, kada je bilo koje enkriptovano polje non-NULL:

```sql
check (
  <nijedno enkriptovano polje nije non-null>
  or (
    encryption_algorithm = 'AES-256-GCM'
    and encryption_version >= 1
    and encryption_key_ref is not null
    and encryption_key_version >= 1
  )
)
```

### 2.7.6 Rotacija

Pri prelasku reda na novu verziju ključa sva non-null enkriptovana polja tog reda se
ponovo enkriptuju atomarno, u jednoj transakciji, sa svježim IV-ovima. Re-enkripcija ne
mijenja `*_hash` kolone. Stare verzije ključa se čuvaju za dekripciju kroz cijeli
retention period.

### 2.7.7 Obuhvat

Envelope se primjenjuje na tačno ova polja:

```text
patient_references.external_patient_ref      (§7.1)
encounters.external_encounter_ref            (§7.2)
encounter_documents.normalized_text          (§8.2)
encounter_documents.redacted_text            (§8.2)
candidate_evidence.quoted_text               (§10.7)
external_resource_links.external_id          (§14.2)
```

`storage_objects` i `system_storage_objects` NISU u obuhvatu. Njihove `encryption_key_ref`
i `encryption_version` kolone opisuju enkripciju blob sadržaja u object storageu i nisu
dio row envelopea.

### 2.7.8 AAD immutability

`id`, `practice_id`, ime tabele i ime kolone su immutable nakon INSERT-a. Enforcement je
opisan u §19.3.

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

Ograničenja (D-023, klauzula 4):

- isključivo SELECT na globalnim tarifnim tabelama;
- **nema INSERT ni UPDATE nad globalnom tarifnom konfiguracijom**;
- column-level SELECT na `system_storage_objects` prema D-024;
- SELECT-only na `practice_memberships`, ograničen user-scoped RLS-om (§17.3);
- SELECT-only na `practice_membership_roles`, ograničen bootstrap-readable politikom kroz
  vlasnički membership red (§17.4).

Credential: `DATABASE_URL`.

## 3.3 `copilot_system`

```sql
create role copilot_system
login
nosuperuser
nocreatedb
nocreaterole
noinherit
nobypassrls;
```

Odgovornosti (D-023, klauzula 5):

- upis globalne tarifne konfiguracije;
- upis u `tariff_release_activation_history`;
- SELECT nad svim kolonama `system_storage_objects`, INSERT i uski column-level UPDATE
  prema D-024;
- nije owner nijednog schema objekta.

Ograničenja:

- **nema nijedan grant nad tenant tabelama**;
- nema DELETE nad `system_storage_objects`;
- ne koristi se za tenant poslovne upite.

Credential: `SYSTEM_DATABASE_URL`.

## 3.4 Credential matrica

| Credential | Rola | Runtime upotreba |
|---|---|---|
| `DATABASE_URL` | `copilot_app` | da — tenant poslovni upiti |
| `SYSTEM_DATABASE_URL` | `copilot_system` | da — isključivo platform/tarifne operacije |
| `MIGRATION_DATABASE_URL` | `copilot_migrator` | **nikada** — samo migracije i deployment |

`MIGRATION_DATABASE_URL` se ne konfiguriše u runtime procesu aplikacije (D-023,
klauzula 6).

## 3.5 Zabranjeno

- API koristi `copilot_migrator`;
- `MIGRATION_DATABASE_URL` se koristi u runtimeu;
- tabela je owned by `copilot_app` ili `copilot_system`;
- bilo koja runtime rola je owner;
- `copilot_app` ili `copilot_system` dobije `BYPASSRLS`;
- `copilot_app` ili `copilot_system` dobije blanket `ALL PRIVILEGES`;
- `copilot_system` dobije bilo koji grant nad tenant tabelom;
- `copilot_app` dobije INSERT/UPDATE nad globalnom tarifnom konfiguracijom.

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

Membership role vrijede unutar jedne ordinacije.

**D-038:** dodjele tenant rola čuvaju se u `practice_membership_roles` (§6.3a), **ne** kao
singularna kolona na `practice_memberships`. Jedan membership može nositi nula, jednu ili
više rola, a svaka rola se za taj membership pojavljuje najviše jednom. Enum
`membership_role` se nikada ne upisuje u `platform_role_assignments` (§6.5).

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

## 4.16 Platform role

```text
SYSTEM_ADMIN
```

Platform rola je odvojena od membership role (D-023, klauzula 8). Čuva se u globalnoj
tabeli `platform_role_assignments` (§6.5), nikada u `practice_memberships` ni u
`practice_membership_roles` (D-038, klauzula 12).

`SYSTEM_ADMIN` nema automatski pristup encounterima, analizama ni medicinskim
dokumentima. **Platform rola sama ne daje nijednu tenant permisiju** (D-038,
klauzula 13). Pristup tenant podacima zahtijeva aktivan `practice_memberships` red **i**
odgovarajuću dodjelu tenant role u `practice_membership_roles` (D-038, klauzula 14).

---

# 5. Entity pregled

```text
Platform (globalno)
└── platform_role_assignments

Identity/Tenant
├── practices
├── users
├── practice_memberships
├── practice_membership_roles
└── practice_settings

Clinical intake
├── patient_references
├── encounters
├── encounter_diagnoses
├── storage_objects
└── encounter_documents

Tariff configuration (globalno)
├── tariff_releases
├── system_storage_objects
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
├── review_decision_change_links
└── analysis_approvals

Integration/System
├── integration_connections
├── external_resource_links
├── import_batches            (DEFERRED — Axenita epic)
├── export_jobs
├── webhook_receipts          (DEFERRED — Axenita epic)
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
```

**D-038 — nema singularne role.** Kolona `role membership_role` je uklonjena (D-038,
klauzula 2), a s njom i indeks `(practice_id, active, role)`. Tabela i dalje nosi tačno
jedan red po ordinaciji i korisniku (klauzula 1) i ostaje jedini izvor:

- članskog odnosa korisnika i ordinacije;
- `active` / neaktivnog statusa membershipa;
- identiteta membershipa kao cilja composite FK-a;
- lifecycle metapodataka.

Dodjela tenant rola je premještena u `practice_membership_roles` (§6.3a). Nijedan
authorization put više ne čita `practice_memberships.role`.

`unique (practice_id, user_id)` čuva pravilo "jedan membership po ordinaciji i korisniku";
`unique (practice_id, id)` je bezuslovni tenant constraint iz §2.5 i istovremeno roditeljski
ključ composite FK-a iz §6.3a.

**Indeks pokrivenost nakon uklanjanja `(practice_id, active, role)`.** Nijedan zamjenski
indeks se ne kreira — svaki dokumentovani query put već pokriva postojeći constraint:

| Dokumentovani query put | Pokriva |
|---|---|
| aktivan membership po ordinaciji i korisniku (`set_request_context`, D-033 klauzula 11) | `unique (practice_id, user_id)` |
| vlastiti membershipi prije tenant konteksta (`GET /me`, §17.3) | `(user_id, active)` |
| enumeracija rola jednog membershipa | `unique (practice_id, membership_id, role)` (§6.3a) |
| provjera jedne role unutar jedne ordinacije | isti unique indeks, tačno poklapanje |
| pretraga vlasničkog membershipa u politici §17.4 | `unique (practice_id, id)` |

Administracija membershipa (kreiranje, deaktivacija) nije runtime operacija `copilot_app`
role u v1; isto važi za dodjelu rola iz §6.3a.

**RLS napomena:** `practice_memberships` NE koristi standardnu tenant politiku
`practice_id = app.practice_id`, jer `set_request_context` mora provjeriti membership
prije nego što `app.practice_id` uopšte postoji. Tabela koristi bootstrap-safe
user-scoped SELECT politiku opisanu u §17.3. `copilot_app` dobija isključivo SELECT.
`practice_membership_roles` nasljeđuje istu user-scoped vidljivost kroz vlasnički
membership red (§17.4).

## 6.3a `practice_membership_roles`

**Normativna odluka: D-038.** Tabela je jedini izvor dodjele tenant aplikacijskih rola.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid not null FK |
| membership_id | uuid not null |
| role | membership_role not null |
| created_at | timestamptz not null |
| updated_at | timestamptz not null |

Constraints:

```sql
unique (practice_id, id)
unique (practice_id, membership_id, role)
foreign key (practice_id, membership_id)
  references practice_memberships(practice_id, id)
```

`id` generiše aplikacija prije INSERT-a (§2.2). `practice_id` je `not null` prema §2.5.

Osobine constraint seta:

- **composite FK `(practice_id, membership_id)`** čini dodjelu preko granice ordinacije
  strukturno nemogućom (D-038, klauzula 19). Roditeljski ključ
  `practice_memberships(practice_id, id)` već postoji (§6.3), pa nije potrebna nova
  schema priprema;
- **`unique (practice_id, membership_id, role)`** odbija duplu dodjelu iste role istom
  membershipu (D-038, klauzula 5) i istovremeno je jedini indeks potreban za enumeraciju
  i provjeru rola (§21);
- **`unique (practice_id, id)`** je bezuslovni tenant constraint iz §2.5;
- referencijalne akcije nisu deklarisane — FK pada na PostgreSQL default `NO ACTION`. Taj
  obrazac važi za pre-existing composite FK-ove sa nedeklarisanim akcijama, a **ne** za sve
  composite FK-ove u ovom dokumentu: D-046 composite FK-ovi `ON DELETE NO ACTION` i
  `ON UPDATE NO ACTION` navode **eksplicitno**. §28.1 razdvaja te dvije grupe. Otvoreno
  pitanje `ON DELETE`/`ON UPDATE` iz §28.1 obuhvata i ovaj FK.

**Timestampovi.** `created_at` i `updated_at` prate obrazac §6.3, a **ne**
`granted_by`/`granted_at`/`revoked_at` obrazac iz `platform_role_assignments` (§6.5). Taj
obrazac modelira historiju opoziva, koju ova tabela po D-038 klauzuli 26 **ne vodi**; vidi
životni ciklus ispod.

**Životni ciklus dodjela.** Normativna odluka: **D-038, klauzule 25–32**.

- tabela čuva **isključivo trenutno efektivne dodjele** tenant rola;
- tabela **nije append-only history tabela**;
- uklanjanje tenant role **briše** odgovarajući trenutni red dodjele;
- ponovna dodjela iste role kasnije **kreira novi trenutni red dodjele**;
- `unique (practice_id, membership_id, role)` ostaje **nepromijenjen** — brisanje reda
  **oslobađa** taj trojac, pa kasnija ponovna dodjela ne pada na constraintu i constraint
  **nikada ne mora postati parcijalan**;
- historija dodjele i uklanjanja čuva se u **immutable audit dokazu**, a ne kroz zadržane
  opozvane redove dodjele;
- u v1 se **ne uvode**: `revoked_at`; `revoked_by`; `active` na ovoj tabeli; `valid_from`;
  `valid_to`; append-only historija dodjele.

**Auditabilnost.** Dodjela i uklanjanje role su sigurnosno osjetljive mutacije. Kada
administracijski put bude prihvaćen, obavezni audit dokaz mora identifikovati: aktera;
ordinaciju; membership; rolu; **radnju — `ASSIGNED` ili `REMOVED`**; vrijeme; prethodno
stanje dodjele; rezultujuće stanje dodjele; i authorization put. Audit zapisi su
**immutable** prema prihvaćenom audit modelu (§19.2), pa je brisanje trenutnog reda dodjele
**nešto sasvim drugo** od brisanja audit historije (D-038, klauzula 35). Runtime
implementacija se ovdje **ne izmišlja** dok je izvan v1 obuhvata.

Tabela **ne modelira**: per-user permission overrid, nasljeđivanje rola, platform role,
database role ni generičke permission redove (D-038, klauzule 10–12, 15).

RLS: §17.4. Grants: §20.2. Migration paket: §22.2. Testovi: §25.10.

### 6.3a.1 Efektivne tenant permisije

**Normativna odluka: D-038, klauzule 7–11 i 16–18.**

- jedan aktivan membership može imati **nula, jednu ili više** tenant rola;
- **efektivne tenant permisije su unija** grantova svih dodijeljenih tenant rola tog istog
  membershipa i te iste ordinacije;
- `DENY` ćelija u role matrici znači da ta rola **ne doprinosi grant** za tu permisiju;
- `DENY` **nije negativni override** i ne poništava `ALLOW` dobijen od druge dodijeljene
  tenant role istog membershipa;
- **nema implicitnog nasljeđivanja rola**;
- **nema per-user permission overrida** u v1;
- **neaktivan membership** ne doprinosi nijednu rolu ni permisiju;
- **aktivan membership sa nula rola** ne autorizuje nijednu tenant operaciju;
- autorizacija je **deny-by-default**;
- uslovne permisije zahtijevaju **oboje**: podobnu dodijeljenu tenant rolu **i**
  odgovarajući prihvaćeni runtime uslov ili practice postavku — `allow_mpa_approval` i
  `allow_billing_specialist_approval` (§6.4).

Odnos prema životnom ciklusu membershipa (D-038, klauzule 10–12 i 33):

- aktivnost membershipa je **isključivo** u vlasništvu `practice_memberships.active`; ova
  tabela nema vlastitu `active` kolonu;
- kada membership postane neaktivan, njegovi role redovi **smiju ostati pohranjeni**,
  doprinose **nula** efektivnih permisija i **ne autorizuju** nijednu tenant operaciju;
- ponovna aktivacija membershipa **ne kreira i ne zaključuje** nijednu rolu — efektivni
  ponovo postaju **isključivo** eksplicitno pohranjeni trenutni redovi dodjele;
- aktivan membership sa **nula** trenutnih redova dodjele ostaje **važeći membership**, ali
  daje **nula** tenant permisija.

Ovaj dokument definiše **isključivo pravilo kompozicije**. Konkretni grantovi po roli
pripadaju budućoj role-to-permission matrici u `15` i ovdje se **ne dodjeljuju**.

### 6.3a.2 Tenant, platform i database role

**Normativna odluka: D-038, klauzule 12–15, uz D-023.**

- `practice_membership_roles` sadrži **isključivo tenant aplikacijske role** iz §4.1;
- `platformRoles` ostaju odvojeni i čuvaju se u `platform_role_assignments` (§6.5);
- `platformRoles` se **nikada ne spajaju unijom** sa tenant rolama;
- `SYSTEM_ADMIN` **ne dobija** nijednu tenant permisiju kroz svoju platform rolu;
- `SYSTEM_ADMIN` koristi tenant permisije samo kada isti korisnik ima aktivan membership u
  toj ordinaciji **i** potrebnu dodjelu tenant role;
- `copilot_app`, `copilot_migrator` i `copilot_system` su **database role** (§3) i nikada
  se ne pojavljuju u `practice_membership_roles` ni u kompoziciji aplikacijskih permisija.

## 6.4 `practice_settings`

Jedan red po practice.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid not null FK |
| billing_review_required | boolean |
| allow_mpa_approval | boolean not null default false |
| allow_billing_specialist_approval | boolean not null default false |
| require_reason_for_manual_change | boolean |
| ai_enabled | boolean |
| axenita_export_enabled | boolean |
| retention_policy_code | varchar(100), nullable |
| configuration | jsonb |
| version | integer not null default 1 |
| updated_by | uuid nullable |
| updated_at | timestamptz |

Constraints:

```sql
unique (practice_id)
unique (practice_id, id)
check (version >= 1)
```

`id` je surogat ključ i generiše ga aplikacija prije INSERT-a (§2.2). `unique (practice_id)`
čuva pravilo "tačno jedan settings red po ordinaciji"; `unique (practice_id, id)` je
bezuslovni tenant constraint iz §2.5.

**Approval flagovi:** i `allow_mpa_approval` i `allow_billing_specialist_approval` imaju
default `false`. Odobravanje izvan `PHYSICIAN`/`PRACTICE_ADMIN` je opt-in odluka
ordinacije, nikada podrazumijevano stanje.

`version` je optimistic locking kolona (D-029); `PATCH /practices/{id}/settings` zahtijeva
`If-Match`.

`configuration` ne sadrži secrets.

## 6.5 `platform_role_assignments`

Globalna tabela. Nema `practice_id` i nije tenant tabela.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| user_id | uuid not null FK → users(id) |
| platform_role | platform_role |
| granted_by | uuid nullable |
| granted_at | timestamptz |
| revoked_at | timestamptz nullable |
| revoked_by | uuid nullable |

Constraints:

```sql
unique (user_id, platform_role)
```

Indeks:

```sql
create index platform_role_assignments_user_idx
on platform_role_assignments(user_id);
```

Pravila (D-023, klauzule 8–12):

- `SYSTEM_ADMIN` je odvojen od `practice_memberships` i nikada se ne izvodi iz membership
  role;
- `tariff.manage` pripada isključivo `SYSTEM_ADMIN`, nikada `PRACTICE_ADMIN`;
- `SYSTEM_ADMIN` bez aktivnog membershipa nema pristup tenant podacima;
- tabela koristi **user-scoped RLS** (§17.2), ne tenant RLS;
- `copilot_app` NEMA neograničen SELECT nad ovom tabelom;
- `copilot_system` ima SELECT nad svim redovima;
- upis je u MVP-u isključivo seed/migracija.

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
| external_patient_ref_iv | bytea nullable | 12 bajtova |
| external_patient_ref_auth_tag | bytea nullable | 16 bajtova |
| encryption_algorithm | varchar(30) nullable | `AES-256-GCM` |
| encryption_version | integer nullable | envelope verzija |
| encryption_key_ref | varchar(255) nullable | referenca ključa |
| encryption_key_version | integer nullable | verzija ključa |
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

check (
  (external_patient_ref_ciphertext is null
   and external_patient_ref_iv is null
   and external_patient_ref_auth_tag is null)
  or
  (external_patient_ref_ciphertext is not null
   and external_patient_ref_iv is not null
   and external_patient_ref_auth_tag is not null)
)
check (
  external_patient_ref_iv is null
  or octet_length(external_patient_ref_iv) = 12
)
check (
  external_patient_ref_auth_tag is null
  or octet_length(external_patient_ref_auth_tag) = 16
)
check (
  external_patient_ref_ciphertext is null
  or (
    encryption_algorithm = 'AES-256-GCM'
    and encryption_version >= 1
    and encryption_key_ref is not null
    and encryption_key_version >= 1
  )
)
```

Enkripcijski envelope prema §2.7. AAD immutability trigger: §19.3.

Produkcijski pseudonim ne smije biti izveden direktnim skraćivanjem eksternog ID-a.

## 7.2 `encounters`

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid |
| patient_reference_id | uuid |
| external_encounter_ref_hash | varchar(128), nullable |
| external_encounter_ref_ciphertext | bytea, nullable |
| external_encounter_ref_iv | bytea, nullable |
| external_encounter_ref_auth_tag | bytea, nullable |
| encryption_algorithm | varchar(30), nullable |
| encryption_version | integer, nullable |
| encryption_key_ref | varchar(255), nullable |
| encryption_key_version | integer, nullable |
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

check (
  (external_encounter_ref_ciphertext is null
   and external_encounter_ref_iv is null
   and external_encounter_ref_auth_tag is null)
  or
  (external_encounter_ref_ciphertext is not null
   and external_encounter_ref_iv is not null
   and external_encounter_ref_auth_tag is not null)
)
check (
  external_encounter_ref_iv is null
  or octet_length(external_encounter_ref_iv) = 12
)
check (
  external_encounter_ref_auth_tag is null
  or octet_length(external_encounter_ref_auth_tag) = 16
)
check (
  external_encounter_ref_ciphertext is null
  or (
    encryption_algorithm = 'AES-256-GCM'
    and encryption_version >= 1
    and encryption_key_ref is not null
    and encryption_key_version >= 1
  )
)
```

`version` je optimistic locking kolona (D-029) i već je usklađena — ne dodaje se ponovo.

Enkripcijski envelope prema §2.7. AAD immutability trigger: §19.3.

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

**Napomena o imenovanju:** `encryption_key_ref` i `encryption_version` ovdje opisuju
enkripciju **blob sadržaja u object storageu**. Nisu dio row envelopea iz §2.7 i ne nose
njegove CHECK constrainte. `storage_objects` nema nijednu `*_ciphertext` kolonu.

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
| encryption_algorithm | varchar(30) nullable |
| encryption_version | integer nullable |
| encryption_key_ref | varchar(255) nullable |
| encryption_key_version | integer nullable |
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

Constraints:

```sql
unique (practice_id, id)

foreign key (practice_id, encounter_id)
  references encounters(practice_id, id)

foreign key (practice_id, storage_object_id)
  references storage_objects(practice_id, id)
```

Check:

```sql
check (page_count is null or page_count > 0)

check (
  (normalized_text_ciphertext is null
   and normalized_text_iv is null
   and normalized_text_auth_tag is null)
  or
  (normalized_text_ciphertext is not null
   and normalized_text_iv is not null
   and normalized_text_auth_tag is not null)
)
check (normalized_text_iv is null or octet_length(normalized_text_iv) = 12)
check (normalized_text_auth_tag is null or octet_length(normalized_text_auth_tag) = 16)

check (
  (redacted_text_ciphertext is null
   and redacted_text_iv is null
   and redacted_text_auth_tag is null)
  or
  (redacted_text_ciphertext is not null
   and redacted_text_iv is not null
   and redacted_text_auth_tag is not null)
)
check (redacted_text_iv is null or octet_length(redacted_text_iv) = 12)
check (redacted_text_auth_tag is null or octet_length(redacted_text_auth_tag) = 16)

check (
  (normalized_text_ciphertext is null and redacted_text_ciphertext is null)
  or (
    encryption_algorithm = 'AES-256-GCM'
    and encryption_version >= 1
    and encryption_key_ref is not null
    and encryption_key_version >= 1
  )
)
```

**Dva enkriptovana polja, jedan ključ (§2.7.3):** `normalized_text` i `redacted_text`
dijele isti red i zato dijele `encryption_algorithm`, `encryption_version`,
`encryption_key_ref` i `encryption_key_version`. IV i auth tag su **nezavisni po polju** —
`normalized_text_iv` i `redacted_text_iv` nikada nisu ista vrijednost, jer je ponovna
upotreba IV-a sa istim ključem zabranjena.

AAD immutability trigger: §19.3.

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
Globalna tabela, bez `practice_id`.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| tariff_release_id | uuid FK |
| artifact_type | varchar(50) |
| filename | varchar(255) |
| system_storage_object_id | uuid not null |
| artifact_version | varchar(100) nullable |
| sha256 | varchar(64) |
| metadata | jsonb |
| created_at | timestamptz |

Constraint:

```sql
foreign key (system_storage_object_id)
  references system_storage_objects(id)
```

Kolona se zove `system_storage_object_id` i referencira globalnu `system_storage_objects`
tabelu (D-024, klauzula 1). Tenant `storage_objects` se ne koristi za globalne tarifne
artefakte.

## 9.3 `system_storage_objects`

Globalna tabela. Nema `practice_id` i **ne koristi tenant RLS** (D-023, klauzula 7).
Zaštita je ownership, uski GRANT i negativni privilege testovi.

| Kolona | Tip |
|---|---|
| id | uuid PK |
| bucket_name | varchar(100) |
| object_key | varchar(500) |
| content_type | varchar(150) |
| original_filename | varchar(255), nullable |
| byte_size | bigint |
| sha256 | varchar(64) |
| encryption_key_ref | varchar(255), nullable |
| encryption_version | integer, nullable |
| antivirus_status | varchar(30), nullable |
| created_by | uuid nullable |
| created_at | timestamptz |
| archived_at | timestamptz nullable |
| retention_delete_after | timestamptz nullable |

Constraints:

```sql
unique (bucket_name, object_key)
check (byte_size >= 0)
```

`archived_at` namjerno ostaje izvan column-level UPDATE granta za `copilot_system`
(§9.3.1), pa je negativni test iz D-024 — "`copilot_system` UPDATE nad `archived_at`
pada" — provjerljiv.

Kao i kod `storage_objects` (§8.1), `encryption_key_ref` i `encryption_version` opisuju
enkripciju blob sadržaja u object storageu i nisu dio row envelopea iz §2.7.

### 9.3.1 Grants (D-024, klauzule 2–5)

| Rola | Prava |
|---|---|
| `copilot_migrator` | owner; DDL |
| `copilot_app` | **column-level SELECT** na `(id, original_filename, content_type, byte_size, sha256, created_at)` |
| `copilot_system` | SELECT nad svim kolonama; INSERT; **column-level UPDATE** isključivo na `(sha256, byte_size, antivirus_status)` |

Eksplicitno:

- `copilot_app` nema pristup kolonama `bucket_name`, `object_key`, `antivirus_status`,
  `created_by`, `retention_delete_after` ni bilo kojoj `encryption_*` koloni;
- `copilot_system` ne smije mijenjati nijednu kolonu izvan navedene tri;
- **nijedna runtime rola nema DELETE**;
- **nijedna runtime rola nije owner**;
- proširenje bilo kojeg granta zahtijeva novi ADR.

Sadržaj artefakta se i dalje dohvata kroz storage adapter uz posebnu permission.

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
unique (practice_id, encounter_id, id)
unique (encounter_id, revision_number)
check (revision_number >= 1)

foreign key (practice_id, encounter_id)
  references encounters(practice_id, id)

foreign key (
  practice_id,
  encounter_id,
  parent_analysis_run_id
)
references analysis_runs(
  practice_id,
  encounter_id,
  id
)

check (
  (
    revision_number = 1
    and parent_analysis_run_id is null
  )
  or
  (
    revision_number > 1
    and parent_analysis_run_id is not null
  )
)

check (
  parent_analysis_run_id is null
  or parent_analysis_run_id <> id
)
```

Indeksi:

```sql
(practice_id, encounter_id, revision_number desc)
(practice_id, status, created_at desc)

create unique index analysis_runs_one_child_per_parent_idx
on analysis_runs (
  practice_id,
  parent_analysis_run_id
)
where parent_analysis_run_id is not null;
```

### 10.2.1 Linearni lanac revizija (D-034)

Historija analysis revizija je **linearni lanac, ne stablo**.

**Parcijalni indeks `analysis_runs_one_child_per_parent_idx`:**

- **dopušta više inicijalnih revizija sa `NULL` roditeljem** — svaki encounter ima vlastitu
  inicijalnu reviziju, a `where parent_analysis_run_id is not null` te redove u potpunosti
  izuzima iz indeksa;
- **sprovodi najviše jedno direktno dijete po svakom non-NULL roditelju**;
- **ne smije se mijenjati u `NULLS NOT DISTINCT`.** Ta semantika je namjerno korištena samo
  za `rule_findings` (§12.3, D-030), gdje je izjednačavanje NULL-ova bilo cilj. Ovdje bi
  dozvolila samo jednu inicijalnu reviziju u cijeloj tabeli. Razlika je namjerna i ne
  ujednačava se.

**Alokacija `revision_number`:**

- `revision_number` djeteta je uvijek **`roditelj.revision_number + 1`**;
- **aplikacijska logika nikada ne izvodi retry reviziju kroz `MAX(revision_number)`.**
  Ponovno čitanje maksimuma nakon unique konflikta proizvelo bi reviziju N+2 i drugo dijete
  istog roditelja — upravo defekt koji D-034 zatvara.

Trokolonski self-FK garantuje da roditelj i dijete pripadaju istom `practice_id` i istom
`encounter_id`; zato je `unique (practice_id, encounter_id, id)` obavezan kao cilj tog FK-a.

Identitetska polja `parent_analysis_run_id` i `revision_number` su immutable nakon
INSERT-a; enforcement je u §19.4.

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
unique (practice_id, id)
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

Constraint:

```sql
unique (practice_id, id)
```

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
| version | integer not null default 1 |
| created_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)
check (confidence is null or confidence between 0 and 1)
check (version >= 1)
```

`version` je optimistic locking kolona (D-029); `PATCH /analyses/{id}/facts/{factId}`
zahtijeva `If-Match`.

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
| version | integer not null default 1 |
| created_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)
check (proposed_quantity > 0)
check (effective_quantity is null or effective_quantity > 0)
check (confidence is null or confidence between 0 and 1)
check (version >= 1)
```

`version` je optimistic locking kolona (D-029);
`PATCH /analyses/{id}/service-candidates/{candidateId}` zahtijeva `If-Match`.

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
| quoted_text_iv | bytea nullable |
| quoted_text_auth_tag | bytea nullable |
| encryption_algorithm | varchar(30) nullable |
| encryption_version | integer nullable |
| encryption_key_ref | varchar(255) nullable |
| encryption_key_version | integer nullable |
| quoted_text_hash | varchar(64) nullable |
| evidence_type | varchar(30) |
| confidence | numeric(5,4) nullable |
| created_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)

foreign key (practice_id, service_candidate_id)
  references service_candidates(practice_id, id)

foreign key (practice_id, document_id)
  references encounter_documents(practice_id, id)
```

Checks:

```sql
check (
  start_offset is null
  or end_offset is null
  or (start_offset >= 0 and end_offset >= start_offset)
)

check (
  (quoted_text_ciphertext is null
   and quoted_text_iv is null
   and quoted_text_auth_tag is null)
  or
  (quoted_text_ciphertext is not null
   and quoted_text_iv is not null
   and quoted_text_auth_tag is not null)
)
check (quoted_text_iv is null or octet_length(quoted_text_iv) = 12)
check (quoted_text_auth_tag is null or octet_length(quoted_text_auth_tag) = 16)
check (
  quoted_text_ciphertext is null
  or (
    encryption_algorithm = 'AES-256-GCM'
    and encryption_version >= 1
    and encryption_key_ref is not null
    and encryption_key_version >= 1
  )
)
```

Enkripcijski envelope prema §2.7. AAD immutability trigger: §19.3.

Oba composite FK-a su sada izvodljiva jer §2.5 garantuje `unique (practice_id, id)` na
`service_candidates` i `encounter_documents`.

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
unique (practice_id, id)
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

Constraints:

```sql
unique (practice_id, id)
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

Constraint:

```sql
unique (practice_id, id)
```

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

Constraints:

```sql
unique (practice_id, id)
check (version >= 1)
```

`version` je optimistic locking kolona (D-029); kolona je već postojala, dodaje se samo
check constraint.

Unique za determinističko ponovno izvršavanje (D-030):

```sql
unique nulls not distinct (
  analysis_run_id,
  safety_rule_version_id,
  finding_code,
  related_service_candidate_id,
  related_tariff_item_id
)
```

`NULLS NOT DISTINCT` je obavezan jer dvije kolone u ključu mogu biti NULL. U standardnoj
SQL semantici NULL nije jednak NULL, pa bi dva identična findinga bez relacijskih kolona
oba prošla.

`finding_dedup_key` se **ne** kreira. Expression unique index se **ne** koristi.

**Implementacijska napomena:** Prisma ne izražava `NULLS NOT DISTINCT`. Constraint se
piše kao custom migration SQL u `--create-only` migraciji (D-004), i `prisma migrate diff`
može prijavljivati drift na njemu. To je očekivano i ne ispravlja se. Vidi §26.

Schema time ima tvrdi minimum PostgreSQL 15; D-003 zaključava 16, pa je uslov ispunjen.

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

Constraint:

```sql
unique (practice_id, id)
```

---

# 13. Review i approval

## 13.1 `review_decisions`

**Normativna odluka: D-046, klauzule 21–24.**

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

Sve postojeće kolone ostaju; D-046 nijednu ne uklanja i ne preimenuje (klauzula 21).

Constraints:

```sql
unique (practice_id, id)
unique (practice_id, analysis_run_id, id)

foreign key (practice_id, analysis_run_id)
  references analysis_runs(practice_id, id)
  on delete no action
  on update no action
```

Append-only (klauzula 24).

`unique (practice_id, id)` ostaje bezuslovni tenant constraint iz §2.5 i **ne uklanja se**.
`unique (practice_id, analysis_run_id, id)` je roditeljski kandidat ključ prvog trokolonskog
composite FK-a iz §13.2a.

Composite FK `(practice_id, analysis_run_id)` veže odluku za **tačno jedan** `analysis_runs`
red. Jedan `analysis_runs` red **jeste** jedna analysis revizija, a `analysis_run_id` je
**autoritativni identitet revizije** (D-046, klauzule 3–4). `analysis_runs` se ovom odlukom
**ne redizajnira**: §10.2, §10.2.1 i D-034 semantika linearnog lanca revizija ostaju
nepromijenjeni, `unique (practice_id, id)` ostaje tenant-safe referencirani kandidat ključ, i
**tabela `analysis_revisions` se ne kreira**.

Referencijalne akcije su **eksplicitno deklarisane** kao `NO ACTION`, pa brisanje roditeljske
revizije ne može kaskadno ukloniti odluku. Ovaj FK zato **nije** obuhvaćen otvorenim pitanjem
referencijalnih akcija iz §28.1.

**`analysis_revision_number` ostaje immutable informacijski audit podatak** (klauzula 22).
D-046:

- ga **ne uklanja i ne preimenuje**;
- **ne uvodi database sprovođenje** njegove jednakosti sa `analysis_runs.revision_number`.

To postojeće pitanje denormalizovanog snapshota ostaje **izvan obuhvata D-046**, može
zahtijevati zasebnu buduću schema-governance odluku i **nije preduslov** za integritet
decision/change linkova iz §13.2a.

## 13.2 `review_item_changes`

**Normativna odluka: D-046, klauzule 1–20.**

`review_item_changes` je **nezavisan immutable correction event**. Korekcija smije biti
perzistirana **prije** i **bez** ijednog `review_decisions` reda, jer nastaje kroz
`PATCH /analyses/{id}/facts/{factId}` i
`PATCH /analyses/{id}/service-candidates/{candidateId}` — endpointe koji ne traže postojanje
odluke (klauzule 1–2).

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid |
| analysis_run_id | uuid not null |
| entity_type | varchar(50) |
| entity_id | uuid |
| field_name | varchar(100) |
| old_value | jsonb nullable |
| new_value | jsonb nullable |
| reason | text |
| changed_by | uuid |
| changed_at | timestamptz |

Postojeća identitetska i correction-event polja ostaju nepromijenjena (klauzula 16).

Constraints:

```sql
primary key (id)

unique (practice_id, id)
unique (practice_id, analysis_run_id, id)

foreign key (practice_id, analysis_run_id)
  references analysis_runs(practice_id, id)
  on delete no action
  on update no action
```

Životni ciklus i grants (klauzula 20):

- **append-only**;
- `copilot_app` dobija `SELECT` i `INSERT` prema prihvaćenom table-grant modelu (§18.1,
  §20.2);
- **bez `UPDATE` granta**;
- **bez `DELETE` granta**.

**Kolona `review_decision_id` je uklonjena** (klauzule 13–14, 17). Tabela **ne smije**
sadržavati ni nullable ni obavezan direktan `review_decision_id`:

- korekcije smiju prethoditi odlukama, pa bi kolona u normalnom toku **trajno ostala `NULL`**;
- tabela je append-only i `copilot_app` nema `UPDATE` grant, pa se veza ne bi mogla ni
  naknadno upisati;
- **naknadni `UPDATE` se ne koristi** za povezivanje korekcije sa odlukom (klauzula 15);
- **nijedan postojeći correction red se nikada ne updatea** radi dodavanja veze prema odluci
  (klauzula 10).

Asocijaciju odluke i promjene umjesto toga nose immutable link redovi iz §13.2a.

**Dodana kolona `analysis_run_id`** (klauzula 18) anchoruje svaki correction event na
**tačno jednu** analysis reviziju. Composite FK `(practice_id, analysis_run_id)` to pretvara
u database garanciju, a `unique (practice_id, analysis_run_id, id)` je roditeljski kandidat
ključ drugog trokolonskog composite FK-a iz §13.2a.

`analysis_revision_number` se na ovu tabelu **ne dodaje** (klauzula 20) — revizija **jeste**
`analysis_runs` red, pa je `analysis_run_id` dovoljan i autoritativan.

Referencijalne akcije su **eksplicitno deklarisane** kao `NO ACTION`, pa nijedno brisanje ne
može kaskadno ukloniti correction dokaz. Ovaj FK zato **nije** obuhvaćen otvorenim pitanjem
referencijalnih akcija iz §28.1.

Izbor korekcija po prefiksu `(practice_id, analysis_run_id)` pokriva
`unique (practice_id, analysis_run_id, id)`; zaseban indeks se **ne kreira** (§21).

## 13.2a `review_decision_change_links`

**Normativna odluka: D-046, klauzule 25–33.** Tabela je jedini izvor asocijacije review
odluke i correction eventa. Ime tabele je prihvaćeno (klauzula 25).

| Kolona | Tip |
|---|---|
| id | uuid PK |
| practice_id | uuid not null |
| analysis_run_id | uuid not null |
| review_decision_id | uuid not null |
| review_item_change_id | uuid not null |
| created_at | timestamptz not null |

`id` generiše aplikacija prije INSERT-a (§2.2). `practice_id` je `not null` prema §2.5.

Constraints:

```sql
primary key (id)

unique (practice_id, id)
unique (practice_id, review_decision_id, review_item_change_id)

foreign key (practice_id, analysis_run_id, review_decision_id)
  references review_decisions(practice_id, analysis_run_id, id)
  on delete no action
  on update no action

foreign key (practice_id, analysis_run_id, review_item_change_id)
  references review_item_changes(practice_id, analysis_run_id, id)
  on delete no action
  on update no action
```

**Jedan `analysis_run_id` u link redu konzumiraju oba trokolonska composite FK-a**
(klauzule 29–30). Vrijednost zato **ne može odstupiti** ni od jednog roditelja, pa sama baza
sprovodi:

| Pravilo | Sprovodi |
|---|---|
| ista ordinacija | oba composite FK-a |
| isti `analysis_run_id` | zajednička kolona u oba trokolonska FK-a |
| ista analysis revizija | revizija **jeste** `analysis_runs` red (§10.2) |
| odluka postoji | FK prema `review_decisions` |
| korekcija postoji | FK prema `review_item_changes` |
| nema dupliranog para | `unique (practice_id, review_decision_id, review_item_change_id)` |
| nema orphan linka | `not null` + oba FK-a |
| zaštita roditelja | `on delete no action` |

Dvokolonski model bi zaustavio cross-practice linkove, ali bi **unutar iste ordinacije** i
dalje dopuštao da odluka iz revizije A referencira korekciju iz revizije B. Trokolonski model
tu grešku čini strukturno nemogućom.

Kardinalnost (klauzule 31–33):

- jedna review odluka → **nula ili više** correction linkova;
- jedan correction event → **nula ili više** review-decision linkova;
- jedan par odluka/promjena → **najviše jedan** link red.

`unique (practice_id, review_item_change_id)` se **ne dodaje** — netačno bi ograničio
korekciju na jednu odluku. Već povezane korekcije se **ne isključuju** iz kasnijih odluka za
isti `analysis_run_id`.

Životni ciklus i grants (klauzula 28):

- **append-only**;
- `copilot_app` dobija **isključivo `SELECT` i `INSERT`**;
- **bez `UPDATE` granta**;
- **bez `DELETE` granta**;
- `copilot_system` **ne dobija** nijedan automatski grant nad tenant tabelom (D-023);
- `PUBLIC` **ne dobija** nijedan grant;
- owner ostaje `copilot_migrator` (§3.5).

Pretraga linkova po prefiksu `(practice_id, review_decision_id)` pokriva
`unique (practice_id, review_decision_id, review_item_change_id)`; zaseban indeks se **ne
kreira** (§21).

RLS: §17.1 i §18.1. Grants: §20.2. Migration paketi: §22.9 (schema) i §22.13 (RLS).
Testovi: §25.2.2.

### 13.2a.1 Integritet pokrivenosti na nivou schema

D-046 klauzule 34–43 definišu determinističku granicu pokrivenosti. Ovo je schema dokument i
**ne duplira** cijeli transakcijski algoritam; normativne su ovdje samo schema-level
posljedice:

- svaki correction event je anchorovan na `analysis_run_id` (§13.2);
- odluke i korekcije se povezuju **isključivo** kroz immutable link redove (§13.2a);
- same-practice i same-analysis-run integritet je **database garancija** oba trokolonska
  FK-a;
- **vidljivost korekcije na granici pokrivenosti je jedino pravilo koje nije izrazivo
  constraintom.** Sprovodi ga prihvaćena konvencija zajedničkog revision locka:

```sql
select ...
from analysis_runs
where practice_id = :practice_id
  and id = :analysis_run_id
for update;
```

- **obje** vrste transakcija — correction i review-decision — zauzimaju taj lock **prvi**, u
  jednoj dosljednoj poziciji, pa lock-order ciklus nije moguć;
- granica pokrivenosti nastaje u trenutku kada decision transakcija zauzme taj lock;
- zajednički revision lock **dopunjuje, a ne zamjenjuje** D-029 `version` / `If-Match`
  provjere nad `extracted_facts` i `service_candidates`;
- **odluka sa nula povezanih korekcija je validno stanje.**

Detaljno implementacijsko sekvenciranje pripada `04`; dokaz o konkurentnosti pripada `08`.
**Javni API ugovor se ne mijenja** — nijedan endpoint, request payload ni response payload
nije zahvaćen (D-046).

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
unique (practice_id, id)
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
| version | integer not null default 1 |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

Constraints:

```sql
unique (practice_id, id)
unique (practice_id, provider, connection_name)
check (version >= 1)
```

`version` je optimistic locking kolona (D-029);
`PATCH /integrations/connections/{id}` zahtijeva `If-Match`.

`credentials_secret_ref` je referenca na secrets manager, nikada sam secret.

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
| external_id_iv | bytea nullable |
| external_id_auth_tag | bytea nullable |
| encryption_algorithm | varchar(30) nullable |
| encryption_version | integer nullable |
| encryption_key_ref | varchar(255) nullable |
| encryption_key_version | integer nullable |
| external_version | varchar(100) nullable |
| last_synced_at | timestamptz nullable |

Constraints:

```sql
unique (practice_id, id)
unique (
  practice_id,
  integration_connection_id,
  external_resource_type,
  external_id_hash
)

check (
  (external_id_ciphertext is null
   and external_id_iv is null
   and external_id_auth_tag is null)
  or
  (external_id_ciphertext is not null
   and external_id_iv is not null
   and external_id_auth_tag is not null)
)
check (external_id_iv is null or octet_length(external_id_iv) = 12)
check (external_id_auth_tag is null or octet_length(external_id_auth_tag) = 16)
check (
  external_id_ciphertext is null
  or (
    encryption_algorithm = 'AES-256-GCM'
    and encryption_version >= 1
    and encryption_key_ref is not null
    and encryption_key_version >= 1
  )
)
```

Enkripcijski envelope prema §2.7. AAD immutability trigger: §19.3.

Composite FK prema `integration_connections` nije deklarisan u v1 — vidi §28.1.

## 14.3 `import_batches`

Brojači, source reference, status i summary. Raw import ide u object storage.

**Status: DEFERRED do Axenita epica (D-023).** Tenancy model tabele — uključujući
`unique (practice_id, id)` iz §2.5 i nullability `practice_id` kolone — odlučuje se u tom
epicu. Do tada tabela nije cilj nijednog composite FK-a i ne ulazi u §2.5 obuhvat.

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

Constraint:

```sql
unique (practice_id, id)
```

Composite FK prema `analysis_runs`, `analysis_approvals` i `integration_connections` nisu
deklarisani u v1 — vidi §28.1.

Export mora referencirati approval, ne samo analysis.

`integration_connection_id` se popunjava i kada ga klijent nije poslao — server ga
determinističkim upitom rezolvira prema D-032.

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

**Status: DEFERRED do Axenita epica (D-023).** Tenancy model tabele — uključujući
nullability `practice_id` kolone i `unique (practice_id, id)` iz §2.5 — odlučuje se u tom
epicu. Do tada tabela nije cilj nijednog composite FK-a i ne ulazi u §2.5 obuhvat.

`system_webhook_receipts` se **ne** kreira.

---

# 15. Sistemske tabele

**D-023, klauzula 1–2:** `practice_id` je `not null` na `audit_events`, `outbox_events` i
`async_jobs`. Nullable tenant ključ je pod FORCE RLS equality politikom značio da
`NULL = <uuid>` daje `NULL`, pa runtime rola takav red nije mogla ni upisati ni pročitati —
tiho, bez greške.

Ne kreiraju se `system_audit_events`, `system_outbox_events`, `system_async_jobs` ni
`system_webhook_receipts`. Jedini system-scope upis u MVP-u je aktivacija tarifne verzije,
za koju već postoji globalna `tariff_release_activation_history` (§9.5) i rola
`copilot_system` (§3.3).

## 15.1 `async_jobs`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid not null |
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

Constraints:

```sql
unique (practice_id, id)
check (progress_percent between 0 and 100)
```

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

Constraints:

```sql
unique (practice_id, id)
unique (practice_id, user_id, endpoint, idempotency_key)
```

Ne čuvati medicinski body u cached responseu.

## 15.3 `outbox_events`

| Kolona | Tip |
|---|---|
| id | uuid |
| practice_id | uuid not null |
| aggregate_type | varchar(100) |
| aggregate_id | uuid |
| event_type | varchar(150) |
| event_version | integer |
| payload | jsonb |
| created_at | timestamptz |
| published_at | timestamptz nullable |
| publish_attempts | integer |
| last_error_safe | text nullable |

Constraint:

```sql
unique (practice_id, id)
```

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
| practice_id | uuid not null |
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

Constraint:

```sql
unique (practice_id, id)
```

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
grant usage on schema app_security to copilot_system;
```

## 16.2 Context funkcije

**Normativna odluka: D-033.** Ova sekcija preslikava D-033 i ne smije od njega odstupiti.
Svaka ranija formulacija koja opisuje `set_request_context` kao `SECURITY DEFINER` ili koja
prima `p_user_id` je superseded (D-033, *Supersedes*).

Kontekst se postavlja u dva koraka. Redoslijed je obavezan.

### 16.2.1 Bootstrap tok

**Normativne odluke: D-033 i D-047.** Cijeli lanac se izvršava unutar **jedne interaktivne
transakcije** (D-047, klauzula 8); sav `app.*` kontekst je transakcijski lokalan, pa bi
razdvajanje sekvence izgubilo pouzdan kontekst i otvorilo TOCTOU prozor.

1. `AuthService` kriptografski verifikuje JWT/OIDC token — potpis, issuer, audience i
   istek — **prije** poziva bilo koje database context funkcije.
2. `set_auth_subject_context(p_auth_subject text)` postavlja transakcijski lokalni
   `app.auth_subject` i briše `app.user_id` i `app.practice_id` (§16.2.4, D-047 klauzula 2).
3. `AuthService` rezolvira verifikovani auth subjekt `users.auth_subject` → `users.id`
   kroz bootstrap politiku iz §17.5. Upit ne navodi `auth_subject` u `WHERE` klauzuli —
   politika sama filtrira i vraća najviše jedan red (D-047, klauzula 4).
4. Ako nijedan red nije vraćen, ili `users.status <> 'ACTIVE'`, zahtjev se odbija sa
   `403 ACCESS_DENIED` **prije** `set_user_context` (D-047, klauzula 9). Neaktivan korisnik
   ne uspostavlja `app.user_id`, ne enumeriše membershipe i ne uspostavlja tenant kontekst.
5. `set_user_context` postavlja transakcijski lokalni `app.user_id` **i briše**
   `app.practice_id`. Time bootstrap politika iz §17.5 prestaje važiti, a self politika
   preuzima — dvije politike su međusobno isključive po konstrukciji.
6. `copilot_app` sada može pročitati isključivo membership redove tog korisnika, kroz
   user-scoped politiku iz §17.3, i ordinacije vlastitog membership skupa kroz §17.6.
7. Ako je zatražena ordinacija, njen `status` se čita membership-scoped politikom iz §17.6
   **prije** promjene konteksta. Nula redova → `403 ACCESS_DENIED`; `status <> 'ACTIVE'` →
   `403 ACCESS_DENIED` uz `ROLLBACK` (D-047, klauzula 10). Time nijedna ne-ACTIVE ordinacija
   nikada ne dobija tenant kontekst.
8. `set_request_context(p_practice_id uuid)` se izvršava kao **SECURITY INVOKER**. Prvo
   briše `app.practice_id`, zatim izvodi korisnika isključivo iz `app.user_id`, pa
   validira **aktivan** membership za traženu ordinaciju.
9. `app.practice_id` se postavlja transakcijski lokalno **tek nakon** uspješne validacije.
   Pošto je obrisan prije validacije, stari tenant kontekst ne može preživjeti neuspješnu
   promjenu konteksta. Postavljanjem `app.practice_id` aktivira se i RESTRICTIVE politika iz
   §17.6, pa se vidljivost `practices` sužava na tačno tu ordinaciju.

Korak 7 dokazuje **postojanje** membershipa — politika iz §17.6 ne filtrira `active` — a korak 8
dokazuje **aktivan** membership. Oba su potrebna; nijedan ne zamjenjuje drugi.

**Vlasništvo faza (D-047, klauzula 16).** Koraci 2–7 pripadaju **fazi 3** i paketu
`002_identity_and_practices`. Koraci 8–9 pripadaju **fazi 4** i paketu `013_rls_policies`. U fazi
3 `app.practice_id` još ne postoji, pa je sužavanje na traženu ordinaciju dodatno sprovedeno
aplikacijski; politike iz §17.5 i §17.6 su već tada konačne i ne prepisuju se u fazi 4.

Bootstrap ne čita `practice_membership_roles` (D-038, klauzule 20–21). Postojanje i
`active` status membershipa utvrđuju se isključivo iz `practice_memberships`. Membership
sa **nula** dodijeljenih rola smije uspostaviti tenant kontekst, ali nakon toga ne
autorizuje nijednu tenant operaciju (§6.3a.1).

### 16.2.2 `set_user_context`

```sql
create or replace function app_security.set_user_context(
  p_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'User context requires a user id';
  end if;

  perform set_config('app.practice_id', '', true);
  perform set_config('app.user_id', p_user_id::text, true);
end;
$$;

revoke all on function app_security.set_user_context(uuid) from public;
grant execute on function app_security.set_user_context(uuid) to copilot_app;
```

Normativna odluka: **D-033, klauzule 3–4**.

Funkcija postavlja **transakcijski lokalni `app.user_id`** i **briše `app.practice_id`**,
bez membership validacije. `AuthService` je poziva isključivo sa autentifikovanim internim
`users.id` (D-033, klauzula 3).

Membership validacija ovdje nije moguća jer `SYSTEM_ADMIN` nema membership; kada bi je
funkcija tražila, korisnik nikada ne bi mogao pročitati vlastitu platform rolu (D-023,
klauzula 11).

**Vlasništvo paketa (D-047, klauzula 17).** Kreiranje ove funkcije pripada paketu
**`002_identity_and_practices`** i **fazi 3**, a ne paketu `013_rls_policies`. Razlog: faza 3 već
zahtijeva autentifikovan user context za `GET /me` i za membership-scoped čitanje `practices`
(§17.6), a `02` §22.13 i `04` §6.2.3 su po tom pitanju bili u međusobnom neslaganju. Ovo je
**isključivo izmjena vlasništva paketa**; potpis, `SECURITY INVOKER` mod i tijelo funkcije ostaju
tačno kako ih D-033 klauzule 3–4 propisuju.

Funkcija **ne briše** `app.auth_subject`. To nije propust: bootstrap politika iz §17.5 sadrži
uslov `app.user_id IS NULL`, pa se sama deaktivira čim `set_user_context` postavi `app.user_id`.
Zastarjeli `app.auth_subject` zato nema nikakav efekat na vidljivost (D-047, klauzula 3).

### 16.2.3 `set_request_context`

```sql
create or replace function app_security.set_request_context(
  p_practice_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  perform set_config('app.practice_id', '', true);

  v_user_id := nullif(current_setting('app.user_id', true), '')::uuid;

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'User context is not established';
  end if;

  if not exists (
    select 1
    from practice_memberships pm
    where pm.practice_id = p_practice_id
      and pm.user_id = v_user_id
      and pm.active = true
  ) then
    raise exception using
      errcode = '42501',
      message = 'User is not a member of requested practice';
  end if;

  perform set_config('app.practice_id', p_practice_id::text, true);
end;
$$;

revoke all on function app_security.set_request_context(uuid) from public;
grant execute on function app_security.set_request_context(uuid) to copilot_app;
```

Normativna odluka: **D-033, klauzule 7–12**. Obavezne osobine:

- **Potpis je `set_request_context(p_practice_id uuid)`** (klauzula 7).
- **SECURITY INVOKER** (klauzula 8). Funkcija se izvršava kao `copilot_app`, pa membership
  provjeru filtrira ista user-scoped politika iz §17.3. Podmetnut `user_id` ne bi vratio
  nijedan red.
- **Korisnik se izvodi isključivo iz `app.user_id`** (klauzula 9). Funkcija **ne prima
  `p_user_id`** i nikada ne uzima korisnika iz argumenta koji kontroliše request.
- **`app.practice_id` se briše prije validacije** (klauzula 10), pa neuspješna promjena
  konteksta ne ostavlja stari tenant scope.
- **Validira se aktivan membership** — `active = true` za `app.user_id` i `p_practice_id`
  (klauzula 11).
- **`app.practice_id` se postavlja tek nakon uspješne validacije** (klauzula 12).
- Fiksiran `search_path`.
- `practice_memberships` zadržava `ENABLE` i `FORCE ROW LEVEL SECURITY` (klauzula 5).

**D-038 ne mijenja ovu funkciju.** Potpis, security mode i tijelo ostaju nepromijenjeni
(D-038, klauzula 21). Funkcija validira membership isključivo nad `practice_memberships`,
**ne čita `practice_membership_roles`**, ne prima rolu, ne prima `user_id` i ne uspostavlja
platform kontekst. Dodijeljene role se evaluiraju tek nakon uspješnog bootstrapa (D-038,
klauzula 20).

**D-047 ne mijenja ovu funkciju.** Potpis, security mode, tijelo i vlasništvo paketa
(`013_rls_policies`, faza 4) ostaju nepromijenjeni. Provjera `practices.status` se **ne** dodaje
u ovo tijelo — ona se izvršava aplikacijski, prije poziva, prema §16.2.1 koraku 7 (D-047,
klauzula 10).

### 16.2.4 `set_auth_subject_context`

**Normativna odluka: D-047, klauzule 1–2.**

```sql
create or replace function app_security.set_auth_subject_context(
  p_auth_subject text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_auth_subject is null or p_auth_subject = '' then
    raise exception using
      errcode = '42501',
      message = 'Auth subject context requires a subject';
  end if;

  perform set_config('app.practice_id',  '', true);
  perform set_config('app.user_id',      '', true);
  perform set_config('app.auth_subject', p_auth_subject, true);
end;
$$;

revoke all on function app_security.set_auth_subject_context(text) from public;
grant execute on function app_security.set_auth_subject_context(text) to copilot_app;
```

Obavezne osobine:

- **SECURITY INVOKER** — nijedan `SECURITY DEFINER` bypass se ne uvodi;
- fiksiran `search_path`;
- null ili prazan ulaz odbijen sa SQLSTATE `42501`;
- briše `app.user_id` **i** `app.practice_id` prije postavljanja subjekta, prema istoj
  disciplini brisanja-prije-validacije koju D-033 klauzula 10 propisuje za tenant kontekst;
- postavlja `app.auth_subject` **transakcijski lokalno** (`set_config(..., true)`), pa varijabla
  ne preživljava kraj transakcije i ne curi u pooled konekciju;
- `PUBLIC` nema `EXECUTE`; `EXECUTE` ima isključivo `copilot_app`;
- vlasnik objekta je `copilot_migrator`; nijedna runtime rola nije vlasnik.

`app.auth_subject` postoji **isključivo** za identity bootstrap. Nijedna tenant politika ga ne
koristi, i nijedna buduća politika ga ne smije koristiti kao zamjenu za `app.user_id`.

`AuthService` je poziva isključivo sa **kriptografski verifikovanim** subjektom iz JWT/OIDC
tokena. Request body, query parametri i nepouzdani headeri **ne smiju** birati `p_auth_subject`,
jednako kao što ne smiju birati `user_id` (§16.2a).

**Vlasništvo paketa:** `002_identity_and_practices`, faza 3 (D-047, klauzula 16).

## 16.2a Trust boundary

Normativna odluka: **D-023, klauzula 13, uz amandman D-033**. D-033 proširuje granicu
povjerenja sa `set_user_context` na `set_request_context` i zaključava potpis, security
mode i izvor korisnika.

Prihvaćeni tekst (D-023, klauzula 13):

> Trust boundary za `set_user_context` dokumentovan je u `02` §16.2a i `09` §6:
> `p_user_id` dolazi isključivo iz kriptografski verifikovanog JWT/OIDC subjekta, nikada
> iz bodyja, query parametra ili nepouzdanog headera; poziva se samo unutar kratke
> autentifikacione transakcije; samo `AuthService` ga smije pozvati. Mehanizam ograničava
> normalni query scope i aplikacijske greške, ali NE autentifikuje korisnika nezavisno
> nakon kompromitacije dijeljenog `copilot_app` credentiala. Tačka sprovođenja
> autorizacije je API, ne baza.

Praktične posljedice (D-033, klauzule 13–16):

- API ne smije odabrati proizvoljan `user_id` iz requesta; request body, query parametri i
  nepouzdani headeri ne smiju birati `user_id`;
- `set_request_context` ne prima `p_user_id`, pa taj put strukturno ne postoji;
- na nivou aplikacijske arhitekture samo `AuthService` smije pozivati context funkcije;
- `copilot_app` dobija SELECT-only na `practice_memberships`, bez INSERT/UPDATE/DELETE;
- nijedan korisnik ne može pročitati membership ni platform rolu drugog korisnika;
- bez postavljenog `app.user_id` obje tabele vraćaju nula redova;
- mehanizam **ne autentifikuje korisnika nezavisno** nakon kompromitacije dijeljenog
  `copilot_app` database credentiala — napadač sa tim credentialom može sam pozvati
  `set_user_context` sa proizvoljnim `user_id`.

**Proširenje na `app.auth_subject` (D-047, klauzule 2 i 20).** Ista granica povjerenja važi i za
`set_auth_subject_context`: `p_auth_subject` dolazi isključivo iz kriptografski verifikovanog
JWT/OIDC subjekta, nikada iz bodyja, query parametra ni nepouzdanog headera; poziva ga samo
`AuthService`, unutar iste kratke transakcije.

Eksplicitno se **ne tvrdi** jača garancija: postojanje context funkcija **nije privilegijska
granica**. `copilot_app` može i bez njih postaviti `app.auth_subject`, `app.user_id` i
`app.practice_id` direktno kroz `set_config`, jer custom GUC varijable smije postaviti svaka
rola. Uvođenje `app.auth_subject` zato **ne slabi** postojeći model — napadač koji može postaviti
tu varijablu već može postaviti i `app.user_id`, što je granica prihvaćena u D-023 klauzuli 13.

RLS nad `users` i `practices` prvenstveno štiti od aplikacijskih grešaka, zaboravljenih filtera i
običnih cross-tenant bugova. Kontrole koje **preživljavaju** krađu `copilot_app` credentiala su:
column-level `SELECT` ograničenje (§20.2a), nepostojanje write grantova, nepostojanje vlasništva,
`NOBYPASSRLS` i nepostojanje DDL prava. Tačka sprovođenja autorizacije ostaje API, ne baza.

## 16.3 Context helper expressions

```sql
nullif(current_setting('app.practice_id', true), '')::uuid
nullif(current_setting('app.user_id', true), '')::uuid
nullif(current_setting('app.auth_subject', true), '')
```

`app.auth_subject` je `text` i **ne** kastuje se u `uuid`. Koristi se isključivo u bootstrap
politici iz §17.5 (D-047, klauzula 1).

---

# 17. RLS policy pattern

Postoje **šest** obrazaca:

| Obrazac | Predikat | Tabele |
|---|---|---|
| §17.1 tenant | `practice_id = app.practice_id` | sve tenant tabele osim `practice_memberships` i `practice_membership_roles` |
| §17.2 user-scoped, globalna | `user_id = app.user_id` | `platform_role_assignments` |
| §17.3 user-scoped, bootstrap | `user_id = app.user_id` | `practice_memberships` |
| §17.4 user-scoped, bootstrap kroz vlasnički membership | `exists (...)` nad `practice_memberships` uz `user_id = app.user_id` | `practice_membership_roles` |
| §17.5 identity bootstrap, međusobno isključive politike | `app.user_id IS NULL AND auth_subject = app.auth_subject` **ili** `id = app.user_id` | `users` |
| §17.6 membership-scoped uz RESTRICTIVE context narrowing | PERMISSIVE `exists (...)` nad `practice_memberships` **i** RESTRICTIVE `app.practice_id IS NULL OR id = app.practice_id` | `practices` |

Obrasci §17.5 i §17.6 uvedeni su odlukom **D-047** i zatvaraju D-OPEN-011.

Globalne tarifne tabele i `system_storage_objects` ne koriste nijedan od njih (§18.2).

## 17.1 Tenant obrazac

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

Obrazac pretpostavlja `practice_id not null` (§2.5). Nad nullable tenant ključem
`NULL = <uuid>` daje `NULL` i red postaje nevidljiv bez greške.

## 17.2 User-scoped obrazac — `platform_role_assignments`

Globalna tabela, nije tenant tabela, ne koristi `app.practice_id`.

```sql
alter table platform_role_assignments enable row level security;
alter table platform_role_assignments force row level security;

create policy platform_role_assignments_self_select
on platform_role_assignments
for select
to copilot_app
using (
  user_id =
  nullif(current_setting('app.user_id', true), '')::uuid
);

create policy platform_role_assignments_system_select
on platform_role_assignments
for select
to copilot_system
using (true);
```

Pravila:

- `copilot_app` NEMA neograničen SELECT — vidi isključivo vlastite redove;
- `copilot_app` nema INSERT, UPDATE ni DELETE; upis je u MVP-u seed/migracija;
- bez postavljenog `app.user_id` tabela vraća nula redova;
- ovo nije tenant RLS i nije u koliziji sa §18.2 (D-023, klauzula 12).

## 17.3 Bootstrap-safe obrazac — `practice_memberships`

**Normativna odluka: D-033, klauzule 5–6 i 13.**

`practice_memberships` se čita **prije** nego što `app.practice_id` postoji, jer
`set_request_context` upravo iz te tabele utvrđuje smije li kontekst biti postavljen.
Standardna tenant politika bi bila ciklična.

```sql
alter table practice_memberships enable row level security;
alter table practice_memberships force row level security;

create policy practice_memberships_self_select
on practice_memberships
for select
to copilot_app
using (
  user_id =
  nullif(current_setting('app.user_id', true), '')::uuid
);
```

Pravila:

- tabela koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY` (D-033,
  klauzula 5);
- politika je vezana za `app.user_id`, ne za `app.practice_id` (D-033, klauzula 6);
- `app.user_id` postavlja `set_user_context`, isključivo iz kriptografski verifikovanog
  autentifikovanog korisnika, prije membership validacije (§16.2a);
- `set_request_context(p_practice_id uuid)` je SECURITY INVOKER, ne prima `p_user_id`, pa i
  on vidi samo redove tog korisnika;
- funkcija briše `app.practice_id` prije validacije i postavlja ga **tek nakon**
  verifikovanog **aktivnog** membershipa;
- **nijedan korisnik ne može pročitati membership redove drugog korisnika**;
- `copilot_app` dobija **SELECT only** — bez INSERT, UPDATE i DELETE (D-033, klauzula 13);
- bez postavljenog `app.user_id` tabela vraća nula redova.

Administracija membershipa (kreiranje i deaktivacija) nije runtime operacija `copilot_app`
role u v1. Dodjela i uklanjanje tenant rola žive u `practice_membership_roles` (§6.3a) i
takođe nisu v1 runtime operacija (D-038, klauzula 24).

## 17.4 Bootstrap-readable obrazac — `practice_membership_roles`

**Normativna odluka: D-038, klauzule 22–23.**

`GET /me` enumeriše membershipe i role autentifikovanog korisnika **prije** nego što tenant
kontekst postoji, pa politika ne smije zavisiti od `app.practice_id`. Tabela nema vlastitu
`user_id` kolonu, pa se vlasništvo izvodi kroz vlasnički `practice_memberships` red.

```sql
alter table practice_membership_roles enable row level security;
alter table practice_membership_roles force row level security;

create policy practice_membership_roles_self_select
on practice_membership_roles
for select
to copilot_app
using (
  exists (
    select 1
    from practice_memberships pm
    where pm.practice_id = practice_membership_roles.practice_id
      and pm.id          = practice_membership_roles.membership_id
      and pm.user_id =
          nullif(current_setting('app.user_id', true), '')::uuid
  )
);
```

Pravila:

- tabela koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY`;
- politika je vezana za `app.user_id` kroz vlasnički membership red, **ne** za
  `app.practice_id`, pa radi prije uspostavljenog tenant konteksta;
- **nijedan korisnik ne može pročitati dodjele rola drugog korisnika**;
- **nema cross-practice curenja** — predikat poredi i `practice_id` i `membership_id`, pa
  red druge ordinacije ne može biti vidljiv kroz tuđi membership;
- politika **ne filtrira po `pm.active`**, jednako kao §17.3. RLS ovdje uređuje
  **vidljivost vlastitih redova**, a ne autorizaciju; validaciju aktivnog membershipa
  zadržavaju `set_request_context` (D-033, klauzula 11) i aplikacijska autorizacija
  (§6.3a.1);
- `copilot_app` dobija **SELECT only** — bez INSERT, UPDATE i DELETE, pa ovo **nije**
  role administration;
- politika je **SECURITY INVOKER kompatibilna**; podupirući EXISTS upit i sam podliježe
  user-scoped politici iz §17.3, jer `practice_memberships` nosi `FORCE RLS`;
- **nijedan SECURITY DEFINER bypass se ne uvodi**;
- bez postavljenog `app.user_id` tabela vraća nula redova;
- bootstrap-readable pristup nad vlastitim redovima **nije** riješio D-OPEN-011 i nije ga
  oslabio; D-OPEN-011 je zasebno riješen odlukom **D-047** kroz §17.5 i §17.6 (§28.2).

## 17.5 Identity bootstrap obrazac — `users`

**Normativna odluka: D-047, klauzule 3–4.**

`users.auth_subject` se mora rezolvirati u `users.id` **prije** nego što `app.user_id` postoji,
pa self-scoped politika vezana za `app.user_id` ne može bootstrapovati samu sebe. Ciklus se
prekida drugom transakcijski lokalnom varijablom koja nosi **već verifikovan** subjekt.

```sql
alter table users enable row level security;
alter table users force row level security;

create policy users_bootstrap_subject_select
on users
as permissive
for select
to copilot_app
using (
  nullif(current_setting('app.user_id', true), '') is null
  and auth_subject =
      nullif(current_setting('app.auth_subject', true), '')
);

create policy users_self_select
on users
as permissive
for select
to copilot_app
using (
  id = nullif(current_setting('app.user_id', true), '')::uuid
);
```

Pravila:

- tabela koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY`;
- **uslov `app.user_id IS NULL` u bootstrap politici je obavezan i normativan.** Permissive
  politike se kombinuju kroz `OR`, a `set_user_context` ne briše `app.auth_subject`. Bez tog
  uslova je **empirijski dokazano** da neusklađeni `app.auth_subject` i `app.user_id` konteksti
  izlažu **dva** korisnička reda istovremeno; sa njim je vidljiv **tačno jedan**;
- politike su time **međusobno isključive po konstrukciji** — bootstrap važi prije internog user
  contexta, self nakon njega, nikada obje;
- zastarjeli `app.auth_subject` nakon `set_user_context` **nema nikakav efekat**, pa se
  `set_user_context` ne mijenja;
- **nijedan korisnik ne može pročitati red drugog korisnika**;
- bez ijedne postavljene varijable tabela vraća nula redova;
- `copilot_app` dobija **column-level SELECT only** prema §20.2a — bez INSERT, UPDATE i DELETE;
- **nijedan SECURITY DEFINER bypass se ne uvodi**;
- pristup redu **drugog** korisnika je `DENY / NOT IMPLEMENTED` u v1; treća politika se ne
  kreira. Obavezan gate je `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (D-047, klauzula 12).

**Dokazano PostgreSQL ponašanje.** Politika smije referencirati `auth_subject` iako `copilot_app`
nema column `SELECT` na toj koloni, jer izraz politike pripada sigurnosnoj definiciji tabele, a ne
projekciji pozivaoca. Istovremeno aplikacijski `SELECT auth_subject` i `WHERE auth_subject = ...`
padaju sa SQLSTATE `42501`. Posljedica je jača od prvobitno projektovane: **politika je jedini put
do te kolone**, a aplikacija je ne može zaobići vlastitim filterom. Bootstrap upit zato **ne
navodi** `auth_subject` u `WHERE` klauzuli.

**Vlasništvo paketa:** `002_identity_and_practices`, faza 3.

## 17.6 Membership-scoped obrazac uz context narrowing — `practices`

**Normativna odluka: D-047, klauzule 5–6.**

`GET /me` vraća `memberships[].practiceName` na **neutralnoj** ruti, prije nego ijedan tenant
kontekst postoji (`03` §10), pa `practices` mora biti čitljiv i bez `app.practice_id`. Nakon što
tenant kontekst postoji, vidljivost se mora suziti na tačno tekuću ordinaciju. Ta dva zahtjeva se
rješavaju **dvjema politikama različitog moda**.

```sql
alter table practices enable row level security;
alter table practices force row level security;

create policy practices_membership_select
on practices
as permissive
for select
to copilot_app
using (
  exists (
    select 1
    from practice_memberships pm
    where pm.practice_id = practices.id
      and pm.user_id =
          nullif(current_setting('app.user_id', true), '')::uuid
  )
);

create policy practices_context_narrow
on practices
as restrictive
for select
to copilot_app
using (
  nullif(current_setting('app.practice_id', true), '') is null
  or practices.id =
     nullif(current_setting('app.practice_id', true), '')::uuid
);
```

Pravila:

- tabela koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY`;
- membership politika **namjerno ne filtrira `pm.active`** — zamrznuti `GET /me` zahtijeva da i
  neaktivni membershipi prikažu `practiceName`. Isto obrazloženje je već prihvaćeno u §17.4: RLS
  ovdje uređuje **vidljivost vlastitih redova**, ne autorizaciju;
- **RESTRICTIVE mod politike sužavanja je obavezan i normativan.** Restrictive politike se
  kombinuju kroz `AND` sa `OR`-kombinovanim permissive skupom, pa nijedna buduća permissive
  politika ne može `OR`-om ukloniti pravilo sužavanja;
- prije `app.practice_id` pozivalac vidi isključivo ordinacije iz vlastitog membership skupa;
- nakon `app.practice_id` vidljivost je **tačno jedna** ordinacija — i to važi i kada aplikacija
  zaboravi `WHERE` klauzulu;
- podmetnut `app.practice_id` za ordinaciju bez membershipa vraća nula redova, jer membership
  politika i dalje mora proći;
- bez postavljenog `app.user_id` tabela vraća nula redova;
- `copilot_app` dobija **column-level SELECT only** prema §20.2a — bez INSERT, UPDATE i DELETE;
- **nijedan SECURITY DEFINER bypass se ne uvodi**;
- lista ili direktorij ordinacija ne postoji ni kao ruta ni kao permisija.

**Dokazana zavisnost od `practice_memberships` (D-047, klauzula 7).** Politika koja sadrži podupit
nad drugom tabelom **zahtijeva da pozivalac ima privilegije nad tom tabelom**; bez granta upit
pada sa SQLSTATE `42501`. Minimalno dovoljno je `SELECT` na `(practice_id, user_id)`. PostgreSQL
je ovdje asimetričan, i ta asimetrija važi za svaku buduću politiku:

| Referenca unutar RLS politike | Potreban grant pozivaocu |
|---|---|
| kolona **vlastite** tabele politike | **ne** (§17.5) |
| **druga** tabela | **da** (§17.6) |

`copilot_app` već ima table-level `SELECT` nad `practice_memberships` (§20.2), pa D-047 ne uvodi
novi grant. Zavisnost je ipak **invarijanta**: sužavanje ili ukidanje tog granta **ne smije tiho
slomiti** ovu politiku.

**Vlasništvo paketa:** `002_identity_and_practices`, faza 3. Politike su konačne — faza 4 ih ne
prepisuje, nego samo počinje postavljati `app.practice_id`, čime se RESTRICTIVE grana aktivira
automatski. Dokazano: identične politike daju identičan rezultat prije i nakon što
`practice_memberships` dobije `FORCE RLS` iz §17.3.

---

# 18. RLS matrica

## 18.1 Tenant tabele

Matrica pokriva **isključivo tenant tabele** i rolu `copilot_app`.

Legenda:

- S: SELECT;
- I: INSERT;
- U: UPDATE;
- D: DELETE;
- `—`: nije dozvoljeno runtime aplikaciji.

| Tabela | S | I | U | D | FORCE RLS |
|---|---:|---:|---:|---:|---:|
| practice_memberships | da* | — | — | — | da |
| practice_membership_roles | da** | — | — | — | da |
| practice_settings | da | — | da | — | da |
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
| review_decision_change_links | da | da | — | — | da |
| analysis_approvals | da | da | revoke fields kontrolisano | — | da |
| integration_connections | da | da | da | — | da |
| external_resource_links | da | da | sync fields | — | da |
| export_jobs | da | da | status | — | da |
| async_jobs | da | da | status/progress | — | da |
| idempotency_keys | da | da | response completion | cleanup job | da |
| outbox_events | da | da | publish fields | retention job | da |
| audit_events | da | da | — | — | da |

`*` **`practice_memberships` ne koristi tenant predikat.** Politika je user-scoped
(`user_id = app.user_id`) i bootstrap-safe, prema §17.3. Rola vidi isključivo vlastite
membership redove i nema INSERT, UPDATE ni DELETE. Tabela je navedena u ovoj matrici jer
jeste tenant tabela, ali njen predikat je namjerno drugačiji.

`**` **`practice_membership_roles` takođe ne koristi tenant predikat.** Politika je
bootstrap-readable kroz vlasnički membership red, prema §17.4, jer `GET /me` enumeriše role
prije nego što `app.practice_id` postoji. Rola vidi isključivo dodjele vezane za vlastite
membershipe i nema INSERT, UPDATE ni DELETE.

`practice_settings` koristi standardni tenant predikat `practice_id = app.practice_id`.
UPDATE je dozvoljen jer `PATCH /practices/{id}/settings` postoji; concurrency se štiti
`version` kolonom i `If-Match` (D-029).

`review_decision_change_links` je **obična tenant tabela** (D-046) i koristi **standardni
tenant predikat** `practice_id = app.practice_id` iz §17.1, sa `ENABLE` **i**
`FORCE ROW LEVEL SECURITY`. `copilot_app` dobija `SELECT` i `INSERT`; `UPDATE` i `DELETE` su
odbijeni, u skladu sa append-only životnim ciklusom iz §13.2a. **Nijedan bootstrap izuzetak
se ne primjenjuje** — za razliku od §17.3 i §17.4, tenant kontekst mora već biti uspostavljen
prije čitanja, pa nema pre-context pristupa. `copilot_system` **nema nijedan grant** jer je
tabela tenant tabela (D-023), a `PUBLIC` nema nijedan. **D-023 razdvajanje database rola
ostaje nepromijenjeno**; runtime administracija aplikacijskih rola se ovdje ne definiše.

"U ograničeno" se prvenstveno sprovodi kroz application service, permission i trigger; RLS štiti tenant, ali ne mora sam izraziti sve column-level poslovne zabrane.

Matrica sadrži 30 tabela — tačno onoliko koliko ih nosi `unique (practice_id, id)` iz §2.5.
Broj je porastao sa 29 na 30 uvođenjem `review_decision_change_links` (D-046, §13.2a); ranije
je porastao sa 28 na 29 uvođenjem `practice_membership_roles` (D-038, §6.3a).
`import_batches` i `webhook_receipts` nisu u matrici; vidi §18.4.

## 18.2 Non-tenant RLS

| Tabela | RLS | Predikat | Sekcija |
|---|---|---|---|
| platform_role_assignments | ENABLE + FORCE | `user_id = app.user_id` (`copilot_app`), `true` (`copilot_system`) | §17.2 |
| users | ENABLE + FORCE | PERMISSIVE `app.user_id IS NULL AND auth_subject = app.auth_subject`; PERMISSIVE `id = app.user_id` | §17.5 |
| practices | ENABLE + FORCE | PERMISSIVE `exists (...)` nad `practice_memberships`; **RESTRICTIVE** `app.practice_id IS NULL OR id = app.practice_id` | §17.6 |

`platform_role_assignments` je globalna tabela i ne koristi `app.practice_id`.
User-scoped RLS nije tenant RLS i nije u koliziji sa §18.3 (D-023, klauzula 12).

`users` i `practices` su dodane odlukom **D-047**. Nijedna od njih nije tenant tabela u smislu
§18.1 — `users` nema `practice_id`, a `practices` je sama nosilac tenanta — pa ne koriste tenant
predikat `practice_id = app.practice_id` i **ne ulaze** u broj od 30 tenant tabela iz §18.1.
`practices` je jedina tabela u schemi koja koristi **RESTRICTIVE** politiku; razlog i dokaz su u
§17.6. `copilot_system` nema grant ni nad jednom od te dvije tabele (§20.2a).

## 18.3 Tabele bez RLS-a

Sljedeće globalne tabele **ne koriste tenant RLS** (D-023, klauzula 7). Zaštita je
ownership, uski GRANT i negativni privilege testovi (§20, §25.6):

```text
tariff_releases
tariff_release_artifacts
tariff_catalog_entries
tariff_release_activation_history
system_storage_objects
ai_prompt_versions
safety_rules
safety_rule_versions
```

Lista sadrži isključivo odobrene globalne konfiguracione tabele.

`users` i `practices` **nisu** na ovoj listi i nikada ne smiju biti. Njihov access model je
riješen odlukom **D-047**: obje nose `ENABLE` **i** `FORCE ROW LEVEL SECURITY` i navedene su u
§18.2 uz svoje politike iz §17.5 i §17.6. Nijedna od njih se **ne smije** opisivati ni
implementirati kao neograničeno, RLS-free runtime-čitljiv podatak (§28.2).

## 18.4 DEFERRED tabele

`import_batches` i `webhook_receipts` su **DEFERRED do Axenita epica** (D-023).

- nijedan migration paket 001–015 ih ne kreira;
- ne pojavljuju se u tenant matrici §18.1 jer u v1 nemaju RLS politiku;
- §2.5 se na njih ne primjenjuje dok se tenancy model ne odluči;
- `webhook_receipts.practice_id` ostaje nullable isključivo zato što tabela nije aktivna.
  Nijedna FORCE RLS equality politika se nad njom ne kreira u v1 — takva politika nad
  nullable tenant ključem bi tiho sakrila redove, što je upravo defekt koji D-023 zatvara.

Axenita epic mora odlučiti tenancy model, nullability `practice_id`,
`unique (practice_id, id)` i RLS politiku prije nego što bilo koja od njih uđe u
migration paket.

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

## 19.3 AAD immutability

Kanonski AAD (§2.7.4) sadrži `practice_id`, ime tabele, `row_id` i ime kolone. Ako se
`id` ili `practice_id` promijene nakon INSERT-a, postojeći ciphertext više ne odgovara
svom AAD-u i postaje nedekriptibilan. RLS to ne može spriječiti, jer je izmjena unutar
istog tenanta legalna sa stanovišta politike.

Jedna zajednička trigger funkcija (D-025, klauzula 12):

```sql
create or replace function app_security.reject_aad_bound_column_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.practice_id is distinct from old.practice_id then
    raise exception using
      errcode = '23514',
      message = 'AAD-bound column (id, practice_id) is immutable after INSERT';
  end if;

  return new;
end;
$$;
```

Osobine:

- `returns trigger`;
- `security invoker`;
- fiksiran `search_path`;
- odbija izmjenu `id` ili `practice_id` sa SQLSTATE `23514`;
- vraća `NEW` kada su zaštićene kolone nepromijenjene.

Pet imenovanih triggera, obrazac `<table>_<purpose>_trg`:

```sql
create trigger patient_references_aad_immutable_trg
before update on patient_references
for each row
execute function app_security.reject_aad_bound_column_change();

create trigger encounters_aad_immutable_trg
before update on encounters
for each row
execute function app_security.reject_aad_bound_column_change();

create trigger encounter_documents_aad_immutable_trg
before update on encounter_documents
for each row
execute function app_security.reject_aad_bound_column_change();

create trigger candidate_evidence_aad_immutable_trg
before update on candidate_evidence
for each row
execute function app_security.reject_aad_bound_column_change();

create trigger external_resource_links_aad_immutable_trg
before update on external_resource_links
for each row
execute function app_security.reject_aad_bound_column_change();
```

**`WHEN` klauzula se ne koristi.** Trigger se izvršava na svakom UPDATE-u i sam poredi
stare i nove vrijednosti. `WHEN` bi uslov premjestio u definiciju triggera, gdje ga je
lakše previdjeti pri izmjeni schema, a dobitak na performansama je na MVP obimu
zanemariv.

## 19.4 Immutability identiteta analysis revizije

D-034 klauzula 7 traži da `parent_analysis_run_id` i `revision_number` budu immutable nakon
INSERT-a. Bez enforcementa lanac revizija iz §10.2.1 može biti prepisan UPDATE-om, čime bi
dijete promijenilo roditelja ili redni broj, a audit veza revizija postala neistinita.

Zasebna trigger funkcija, jer štiti druge kolone od one iz §19.3:

```sql
create or replace function app_security.reject_analysis_revision_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.parent_analysis_run_id is distinct from old.parent_analysis_run_id
     or new.revision_number is distinct from old.revision_number then
    raise exception using
      errcode = '23514',
      message = 'Analysis revision identity (parent_analysis_run_id, revision_number) is immutable after INSERT';
  end if;

  return new;
end;
$$;

revoke all on function app_security.reject_analysis_revision_identity_change() from public;
```

Osobine:

- `returns trigger`;
- `language plpgsql`;
- `security invoker`;
- fiksiran `search_path`;
- odbija izmjenu `parent_analysis_run_id` ili `revision_number` sa SQLSTATE `23514`;
- vraća `NEW` kada nijedna zaštićena kolona nije promijenjena;
- `PUBLIC` privilegije su revoked.

Imenovani trigger:

```sql
create trigger analysis_runs_revision_immutable_trg
before update on analysis_runs
for each row
execute function app_security.reject_analysis_revision_identity_change();
```

Kao i u §19.3, **`WHEN` klauzula se ne koristi.**

Ovaj trigger **ne mijenja** pet AAD triggera iz §19.3. `analysis_runs` nije u obuhvatu
enkripcijskog envelopea (§2.7.7), pa nema AAD trigger; ova zaštita je nezavisna i pokriva
integritet lanca revizija, ne enkripciju.

---

# 20. Grants matrica

## 20.1 Globalne tarifne tabele

`copilot_app` ima **isključivo SELECT** (D-023, klauzula 4):

- tariff_releases;
- tariff_catalog_entries;
- active safety rule metadata;
- active AI prompt metadata bez prikaza punog prompta običnom korisniku.

`copilot_app` **nema INSERT ni UPDATE** nad globalnom tarifnom konfiguracijom. Nijedan
admin endpoint ne piše te tabele runtime rolom.

Sve upise nad globalnom tarifnom konfiguracijom izvršava `copilot_system` preko
`SYSTEM_DATABASE_URL` (D-023, klauzula 5):

| Tabela | `copilot_app` | `copilot_system` |
|---|---|---|
| tariff_releases | SELECT | SELECT, INSERT, UPDATE |
| tariff_catalog_entries | SELECT | SELECT, INSERT, UPDATE |
| tariff_release_artifacts | SELECT | SELECT, INSERT |
| tariff_release_activation_history | SELECT | SELECT, INSERT |
| system_storage_objects | column-level SELECT (§9.3.1) | SELECT, INSERT, column-level UPDATE (§9.3.1) |
| platform_role_assignments | user-scoped SELECT (§17.2) | SELECT |
| safety_rules, safety_rule_versions | SELECT | SELECT |
| ai_prompt_versions | SELECT (bez punog prompta) | SELECT |

Sadržaj `safety_rules`, `safety_rule_versions` i `ai_prompt_versions` u v1 se upisuje
isključivo seedom i migracijom. Admin CRUD nad njima je odgođen (D-023, analiza scopea:
MVP ima tačno jedan system-scope upis — aktivaciju tarifne verzije). Kada se admin CRUD
uvede, zahtijeva novi ADR i eksplicitan grant.

DELETE nema nijedna runtime rola ni nad jednom globalnom tabelom.

`MIGRATION_DATABASE_URL` se ne koristi u runtimeu (§3.4).

## 20.2 Tenant tabele

Grant tabela prati RLS matricu §18.1.

`copilot_system` **nema nijedan grant nad tenant tabelama** (D-023). Platform
administracija je odvojena od pristupa medicinskim podacima.

`copilot_app` na `practice_memberships` ima isključivo SELECT, ograničen user-scoped RLS
politikom iz §17.3.

`copilot_app` na `practice_membership_roles` ima isključivo SELECT, ograničen
bootstrap-readable politikom iz §17.4:

| Tabela | `copilot_migrator` | `copilot_app` | `copilot_system` | `PUBLIC` |
|---|---|---|---|---|
| practice_membership_roles | owner, kreira kroz migraciju `002` | SELECT (RLS §17.4) | — | — |

- **nema INSERT, UPDATE ni DELETE** za `copilot_app`; generička administracija dodjele rola
  ostaje izvan aktivnog v1 permission kataloga (D-038, klauzula 24) i dobiće grant tek uz
  prihvaćenu runtime permisiju i endpoint;
- **uklanjanje role (`DELETE`) nije dostupno** kroz trenutni `copilot_app` runtime put;
  buduća implementacija dodjele i uklanjanja zahtijeva **zasebno prihvaćen authorization
  put**, ne proširenje ovog granta;
- `copilot_system` **nema nijedan grant** — tabela je tenant tabela (D-023);
- `PUBLIC` nema nijedan grant;
- owner ostaje `copilot_migrator` (§3.5).

## 20.2a `users` i `practices`

**Normativna odluka: D-047, klauzule 4, 6, 7, 14 i 15.**

Obje tabele nose `ENABLE` + `FORCE RLS` (§17.5, §17.6). Grantovi su **column-level**, jer je
column privilegija jedina kontrola koja preživljava kompromitaciju `copilot_app` credentiala —
politike se oslanjaju na `app.*` varijable koje držalac credentiala može sam postaviti (§16.2a).

```sql
revoke all on users     from public;
revoke all on practices from public;

grant select (id, email, display_name, preferred_language, status)
  on users to copilot_app;

grant select (id, code, name, default_language, timezone, status)
  on practices to copilot_app;
```

| Tabela | `copilot_migrator` | `copilot_app` | `copilot_system` | `PUBLIC` |
|---|---|---|---|---|
| users | owner, kreira kroz migraciju `002` | column-level SELECT (§17.5) | — | — |
| practices | owner, kreira kroz migraciju `002` | column-level SELECT (§17.6) | — | — |

**`users` — kolone koje `copilot_app` NE dobija:** `auth_subject`, `last_login_at`, `created_at`,
`updated_at`.

**`practices` — kolone koje `copilot_app` NE dobija:** `legal_name`, `zsr_number`, `gln_number`,
`created_at`, `updated_at`.

Pravila:

- **nema INSERT, UPDATE ni DELETE** za nijednu runtime rolu nad nijednom od dvije tabele;
  administracija identiteta i ordinacija je u v1 isključivo migracijski/seed tok (§23), jednako
  kao za `practice_memberships`, `practice_membership_roles` i `platform_role_assignments`;
- `copilot_system` **nema nijedan grant** — nijedan konzument faze 3 ni poznati zahtjev faze 6 ga
  ne traži (§20.1, D-023 klauzula 5);
- `PUBLIC` nema nijedan grant;
- owner ostaje `copilot_migrator` (§3.5);
- `users.auth_subject` je čitljiv **isključivo kroz izraz politike** iz §17.5; aplikacijski
  `SELECT` ili `WHERE` nad tom kolonom pada sa `42501`;
- `practices.zsr_number` i `gln_number` su klasa B (`09` §2) i **nedostupni su i pri
  kompromitovanom credentialu**, jer column grant ne zavisi od `app.*` konteksta;
- **proširenje bilo kojeg od ovih grantova zahtijeva novi ADR**, jednako kao za
  `system_storage_objects` (D-024);
- politika iz §17.6 **zavisi** od `SELECT` granta nad `practice_memberships(practice_id, user_id)`
  (§20.2). Sužavanje tog granta obara politiku sa `42501` i **ne smije** se izvesti bez provjere
  te zavisnosti.

## 20.3 Sequence

Ako se koriste SQL sequence, dodijeliti minimalna prava. UUID dizajn i aplikacijsko
generisanje ID-a (§2.2) izbjegavaju većinu sequence prava.

## 20.4 Negativni privilege testovi

Obavezni testovi, prema D-023 i D-024:

- `copilot_app` INSERT/UPDATE nad `tariff_releases` pada;
- `copilot_app` SELECT nad `system_storage_objects.object_key` pada;
- `copilot_app` SELECT nad bilo kojom `system_storage_objects.encryption_*` kolonom pada;
- `copilot_app` SELECT nad `platform_role_assignments` redom drugog korisnika vraća nula
  redova;
- `copilot_app` SELECT nad `practice_memberships` redom drugog korisnika vraća nula redova;
- `copilot_app` INSERT/UPDATE/DELETE nad `practice_memberships` pada;
- `copilot_app` SELECT nad `practice_membership_roles` dodjelom drugog korisnika vraća nula
  redova;
- `copilot_app` INSERT/UPDATE/DELETE nad `practice_membership_roles` pada;
- `copilot_system` bilo koji pristup `practice_membership_roles` pada;
- bez postavljenog `app.user_id`, `platform_role_assignments`, `practice_memberships` i
  `practice_membership_roles` vraćaju nula redova;
- `copilot_system` UPDATE nad `system_storage_objects.archived_at` ili bilo kojom kolonom
  izvan `(sha256, byte_size, antivirus_status)` pada;
- `copilot_system` bilo koji pristup tenant tabeli pada;
- DELETE nad `system_storage_objects` pada za obje runtime role;
- nijedna runtime rola nije `tableowner` ni za jednu tabelu;
- nijedna runtime rola nema `BYPASSRLS`.

Dodatno, prema D-047 (klauzule 3–7, 15):

- `copilot_app` SELECT nad `users.auth_subject` pada sa `42501`;
- `copilot_app` `WHERE auth_subject = ...` nad `users` pada sa `42501`;
- `copilot_app` SELECT nad `users.last_login_at` pada sa `42501`;
- `copilot_app` `SELECT *` nad `users` pada sa `42501`;
- `copilot_app` SELECT nad `practices.zsr_number`, `practices.gln_number` ili
  `practices.legal_name` pada sa `42501`;
- `copilot_app` INSERT/UPDATE/DELETE nad `users` pada sa `42501`;
- `copilot_app` INSERT/UPDATE/DELETE nad `practices` pada sa `42501`;
- `copilot_system` bilo koji pristup `users` ili `practices` pada;
- bez postavljenog `app.user_id` i `app.auth_subject`, `users` vraća nula redova;
- bez postavljenog `app.user_id`, `practices` vraća nula redova;
- uz postavljen `app.auth_subject` i **istovremeno** postavljen `app.user_id` drugog korisnika,
  `users` vraća **tačno jedan** red — onaj iz `app.user_id`;
- uz postavljen `app.practice_id`, `practices` vraća **tačno jedan** red i kada upit nema `WHERE`
  klauzulu;
- uz podmetnut `app.practice_id` za ordinaciju bez membershipa, `practices` vraća nula redova.

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

create index platform_role_assignments_user_idx
on platform_role_assignments(user_id);
```

`platform_role_assignments_user_idx` podupire RLS predikat iz §17.2 —
`user_id = app.user_id` se izvršava na svakom autentifikacionom toku.

`practice_memberships` već ima `(user_id, active)` indeks (§6.3), koji podupire
bootstrap-safe politiku iz §17.3. Indeks `(practice_id, active, role)` je uklonjen zajedno
sa kolonom `role` (D-038); zamjenski indeks se ne kreira, jer je pokrivenost dokazana u
tabeli query putova u §6.3.

`practice_membership_roles` **ne dobija nijedan dodatni indeks**. Oba constrainta iz §6.3a
već stvaraju btree indekse koji pokrivaju svaki dokumentovani query put:

- `unique (practice_id, membership_id, role)` — enumeracija rola jednog membershipa
  (prefiks `(practice_id, membership_id)`) i provjera jedne role unutar jedne ordinacije
  (tačno poklapanje);
- `unique (practice_id, id)` — pretraga vlasničkog membershipa u `EXISTS` predikatu
  politike §17.4 poklapa se sa `practice_memberships(practice_id, id)`.

`review_decisions`, `review_item_changes` i `review_decision_change_links` **ne dobijaju
nijedan dodatni indeks** (D-046). Prihvaćeni unique constrainti već stvaraju btree indekse
koji pokrivaju svaki dokumentovani query put:

- `review_decisions unique (practice_id, analysis_run_id, id)` — roditeljski kandidat ključ
  prvog trokolonskog FK-a iz §13.2a;
- `review_item_changes unique (practice_id, analysis_run_id, id)` — roditeljski kandidat
  ključ drugog trokolonskog FK-a i **izbor korekcija iste ordinacije i iste analysis revizije
  po prefiksu** `(practice_id, analysis_run_id)`;
- `review_decision_change_links unique (practice_id, review_decision_id, review_item_change_id)`
  — **pretraga linkova jedne odluke po prefiksu** `(practice_id, review_decision_id)` i
  **sprječavanje dupliranog para** odluka/promjena.

Za v1 se **eksplicitno odbijaju**, dok mjereni query ne pokaže potrebu:
`review_item_changes (practice_id, analysis_run_id, changed_at, id)` i
`review_decision_change_links (practice_id, review_item_change_id)`.

Spekulativni indeksi bez dokumentovanog query puta se ne kreiraju.

Indeksi se validiraju `EXPLAIN` planom na realističnim test podacima prije optimizacije.

---

# 22. Migration paketi

## 22.1 `001_extensions_and_roles`

Kreira database role: `copilot_migrator`, `copilot_app` i **`copilot_system`** (D-023,
klauzula 3), te credential mapiranje iz §3.4 uključujući `SYSTEM_DATABASE_URL`.

**Nijedna PostgreSQL ekstenzija trenutno nije potrebna.** UUID-eve eksplicitno generiše
aplikacija prije INSERT-a (§2.2). Dio imena `extensions` zadržan je kao stabilna
historijska i buduće-kompatibilna oznaka; svaka buduća ekstenzija mora biti eksplicitno
dokumentovana i odobrena prije dodavanja.

## 22.2 `002_identity_and_practices`

`practices`, `users`, `practice_memberships`;
`practice_settings` sa `id`, `unique (practice_id)`, `unique (practice_id, id)`,
`allow_billing_specialist_approval`, `version` i `check (version >= 1)`;
enum `platform_role` (§4.16); globalna tabela `platform_role_assignments` (§6.5) i njen
`user_id` indeks (D-023, klauzula 8).

**D-038 u istom paketu — ne uvodi se novi broj paketa:**

- `practice_memberships` se kreira **bez kolone `role`** i **bez indeksa
  `(practice_id, active, role)`** (D-038, klauzula 2);
- kreira se `practice_membership_roles` (§6.3a) sa `unique (practice_id, id)`,
  `unique (practice_id, membership_id, role)` i composite FK
  `(practice_id, membership_id)` → `practice_memberships(practice_id, id)`;
- enum `membership_role` ostaje nepromijenjen (§4.1) i sada ga koristi
  `practice_membership_roles`.

**D-047 u istom paketu — ne uvodi se novi broj paketa:**

- `create schema if not exists app_security` uz `REVOKE`/`GRANT USAGE` iz §16.1, ako schema još
  ne postoji;
- **`app_security.set_auth_subject_context(text)`** (§16.2.4);
- **`app_security.set_user_context(uuid)`** — **premješteno iz paketa `013_rls_policies`**
  (§16.2.2, D-047 klauzula 17). Premješta se **isključivo vlasništvo paketa**; potpis,
  `SECURITY INVOKER` mod i tijelo ostaju tačno kako ih D-033 klauzule 3–4 propisuju;
- `ENABLE` + `FORCE ROW LEVEL SECURITY` nad `users` i nad `practices`;
- politike `users_bootstrap_subject_select` i `users_self_select` (§17.5);
- politike `practices_membership_select` (PERMISSIVE) i `practices_context_narrow`
  (**RESTRICTIVE**) (§17.6);
- column-level `SELECT` grantovi nad `users` i `practices` za `copilot_app`, uz
  `REVOKE ALL ... FROM PUBLIC` (§20.2a).

Redoslijed unutar paketa: tabele → grantovi → `ENABLE`/`FORCE RLS` → politike → funkcije.
Politika `practices_membership_select` se kreira **nakon** `practice_memberships`, jer je
referencira i zavisi od granta nad njom (§17.6, §20.2a).

`set_request_context` **ostaje** u paketu `013_rls_policies` i u fazi 4 (§22.13). §17.3 i §17.4 se
**ne premještaju** u ovaj paket.

Projekat nema produkcijske podatke, pa produkcijska backfill procedura nije potrebna.

## 22.3 `003_patient_encounter_documents`

`patient_references`, `encounters`, `encounter_diagnoses`, `storage_objects`,
`encounter_documents`, uključujući `_iv` i `_auth_tag` kolone, row-level `encryption_*`
kolone i sve CHECK constrainte iz §2.7.5 (D-025); `unique (practice_id, id)` na
`encounter_documents`.

## 22.4 `004_tariff_releases`

**`system_storage_objects` se kreira prije `tariff_release_artifacts`** (D-024).
`tariff_release_artifacts.system_storage_object_id` referencira `system_storage_objects(id)`.
Column-level grants za `copilot_app` i `copilot_system` prema §9.3.1; bez DELETE za
runtime role; owner ostaje `copilot_migrator`.

## 22.5 `005_ai_prompts_and_analysis`

`ai_prompt_versions`, `analysis_runs`, `analysis_input_snapshots`, `ai_extraction_runs`;
`unique (practice_id, id)` na `analysis_input_snapshots` i `ai_extraction_runs`.

**D-034 na `analysis_runs`:**

- `unique (practice_id, encounter_id, id)`;
- trokolonski self-FK `(practice_id, encounter_id, parent_analysis_run_id)` →
  `analysis_runs(practice_id, encounter_id, id)`;
- CHECK za par `revision_number` / `parent_analysis_run_id`;
- CHECK protiv self-parent reference;
- parcijalni unique indeks `analysis_runs_one_child_per_parent_idx`.

## 22.6 `006_facts_candidates_evidence`

`extracted_facts`, `service_candidates`, `candidate_evidence`;
`unique (practice_id, id)` na sve tri;
**`version integer not null default 1` i `check (version >= 1)` na `extracted_facts` i
`service_candidates`** (D-029);
`candidate_evidence` enkripcijske kolone i CHECK constrainti (D-025);
composite FK prema `service_candidates` i `encounter_documents`.

## 22.7 `007_tariff_evaluation`

`tariff_evaluations`, `tariff_evaluation_items`, `tariff_messages`;
`unique (practice_id, id)` na sve tri.

## 22.8 `008_safety_findings`

`safety_rules`, `safety_rule_versions`, `rule_findings`, `finding_evidence`;
`unique (practice_id, id)` na `rule_findings` i `finding_evidence`;
**`check (version >= 1)` na `rule_findings`** (D-029);
**D-030 constraint `unique nulls not distinct (...)` kao custom migration SQL u
`--create-only` migraciji.** Prisma ga ne izražava i može ga prijavljivati kao drift.

## 22.9 `009_review_approvals`

`review_decisions`, `review_item_changes`, `analysis_approvals`;
`unique (practice_id, id)` na sve tri.

**D-046 u istom paketu — nijedan migration paket se ne dodaje niti renumeriše.** Paket
posjeduje sve schema objekte D-046 rekonsilijacije:

- `review_decisions`: `unique (practice_id, analysis_run_id, id)`; composite FK
  `(practice_id, analysis_run_id)` → `analysis_runs(practice_id, id)` sa
  `on delete no action` i `on update no action` (§13.1);
- `review_item_changes`: **uklanjanje kolone `review_decision_id`**; dodavanje
  `analysis_run_id uuid not null`; `unique (practice_id, analysis_run_id, id)`; composite FK
  `(practice_id, analysis_run_id)` → `analysis_runs(practice_id, id)` sa
  `on delete no action` i `on update no action` (§13.2);
- `review_decision_change_links` (§13.2a): tabelu; `primary key (id)`;
  `unique (practice_id, id)`;
  `unique (practice_id, review_decision_id, review_item_change_id)`; **oba trokolonska
  composite FK-a** — prema `review_decisions(practice_id, analysis_run_id, id)` i prema
  `review_item_changes(practice_id, analysis_run_id, id)` — oba sa `on delete no action` i
  `on update no action`;
- prihvaćene table grantove: `SELECT` i `INSERT` za `copilot_app`, bez `UPDATE` i bez
  `DELETE`; bez ijednog granta za `copilot_system` i `PUBLIC`.

**Paket `009` ne kreira composite FK `review_item_changes` → `review_decisions`.** Ta
relacija je uklonjena zajedno sa kolonom `review_decision_id` (D-046, klauzule 13–14, 17);
raniji tekst koji je tvrdio da je paket kreira **bio je netačan** i nije opisivao nijedan
postojeći schema objekat.

**RLS objekti nisu u ovom paketu.** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`
i tenant politika nad `review_decision_change_links` pripadaju paketu `013_rls_policies`
(§22.13). **RLS se ne premješta u paket `009`.**

## 22.10 `010_integrations`

`integration_connections` sa `version` i `check (version >= 1)` (D-029);
`external_resource_links` sa enkripcijskim kolonama i CHECK constraintima (D-025);
`unique (practice_id, id)` na `integration_connections`, `external_resource_links` i
`export_jobs`.
`import_batches` i `webhook_receipts` ostaju DEFERRED do Axenita epica (§14.3, §14.5).

## 22.11 `011_jobs_idempotency_outbox_audit`

**`practice_id not null` na `audit_events`, `outbox_events` i `async_jobs`** (D-023,
klauzula 1); `unique (practice_id, id)` na sve četiri §15 tabele.
**Ne kreiraju se `system_audit_events`, `system_outbox_events`, `system_async_jobs` ni
`system_webhook_receipts`** (D-023, klauzula 2).

## 22.12 `012_constraints_indexes`

Verifikuje da svih 30 tenant tabela u obuhvatu nosi `unique (practice_id, id)` prema §2.5;
kreira indeks katalog iz §21, uključujući `platform_role_assignments_user_idx`.

## 22.13 `013_rls_policies`

Tenant politike prema §17.1 i §18.1 — **svih 30 tenant tabela** iz matrice §18.1;
**`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` i standardna tenant politika
`practice_id = app.practice_id` za `review_decision_change_links`** (§13.2a, §18.1, D-046);
**user-scoped RLS za `platform_role_assignments`** (§17.2);
**bootstrap-safe user-scoped SELECT politika za `practice_memberships`** (§17.3);
**bootstrap-readable SELECT politika za `practice_membership_roles`** (§17.4, D-038);
SECURITY INVOKER `app_security.set_request_context` (§16.2.3);
**globalne tarifne tabele i `system_storage_objects` ne dobijaju tenant RLS** (§18.3).

**Izmjena po D-047 (klauzula 17):** `app_security.set_user_context` **više nije u ovom paketu** —
premješten je u `002_identity_and_practices`, jer ga faza 3 već zahtijeva. Premještena je
isključivo pripadnost paketu; sigurnosna semantika D-033 se ne mijenja. `set_request_context`
ostaje ovdje.

**Ovaj paket ne dira `users` ni `practices`.** Njihove politike i grantovi su konačni već u paketu
`002` (§17.5, §17.6, §20.2a) i ovdje se **ne prepisuju**. Faza 4 samo počinje postavljati
`app.practice_id`, čime se RESTRICTIVE politika iz §17.6 aktivira automatski.

## 22.14 `014_immutability_triggers`

Approval guard iz §19.1 i audit guard iz §19.2;
**`app_security.reject_aad_bound_column_change()` i pet imenovanih AAD triggera** iz §19.3
(D-025, klauzula 12);
**`app_security.reject_analysis_revision_identity_change()` i trigger
`analysis_runs_revision_immutable_trg`** iz §19.4 (D-034, klauzula 7).

## 22.15 `015_seed_baseline`

Vidi §23.

---

Ne mora svaki paket biti jedna migracija, ali redoslijed zavisnosti mora ostati.

---

# 23. Seed podaci

## 23.1 Pravila

Sve seed skripte **eksplicitno generišu i navode UUID** za svaki red, prema §2.2. Seed se
ne oslanja na database default i ne koristi Prisma `@default(uuid())`.

Development seed je idempotentan.

## 23.2 Development seed

Kreira:

- `demo-praxis`;
- dev admin;
- dev physician;
- memberships;
- **eksplicitne `practice_membership_roles` redove za svaki seed membership** (D-038) —
  seed se ne oslanja na singularnu `role` kolonu, koja više ne postoji;
- **najmanje jedan aktivan membership sa nula dodijeljenih rola**, za negativne testove iz
  §25.10;
- practice settings, uz oba approval flaga na `false`;
- **development `SYSTEM_ADMIN` dodjelu u `platform_role_assignments`** (D-023, klauzula 8);
- **`integration_connections` red za ManualAdapter** — `provider = 'MANUAL'`,
  `status = 'ACTIVE'` (D-017);
- mock tariff release;
- `system_storage_objects` redove za tarifne artefakte;
- prompt versions;
- safety rule metadata;
- minimalni test encounter, opciono posebnim demo seedom.

ManualAdapter konekcija je u MVP-u jedina aktivna, pa deterministička rezolucija
integration konekcije pri exportu (D-032) na njoj radi bez dodatne konfiguracije.

Development `SYSTEM_ADMIN` postoji samo u development seedu.

## 23.3 Production seed

Production seed ne kreira demo medicinske podatke, ne kreira `SYSTEM_ADMIN` dodjelu i ne
kreira demo integration konekcije.

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
- inactive membership ne može postaviti context;
- bez `app.user_id` `set_request_context` pada sa `42501`;
- `set_request_context` briše `app.practice_id` i pri neuspjehu ne ostavlja stari tenant
  scope;
- korisnik A ne čita membership ni platform rolu korisnika B.

### 25.1.1 Identity bootstrap i `practices` vidljivost (D-047)

Nivo: integration nad stvarnim PostgreSQL-om. Puni ugovor je u `08` §21.5.

`users` (§17.5):

- validan verifikovan subjekt uz nepostavljen `app.user_id` vraća **tačno jedan** red;
- nepoznat subjekt vraća **nula** redova;
- bez `app.auth_subject` i bez `app.user_id` tabela vraća **nula** redova;
- **neusklađeni konteksti** — `app.auth_subject` korisnika A uz `app.user_id` korisnika B —
  vraćaju **tačno jedan** red, i to red korisnika B; ovo je regresijski test za obavezni guard
  `app.user_id IS NULL`;
- **zastarjeli** `app.auth_subject` nakon `set_user_context` ne mijenja vidljivost;
- korisnik A ne čita red korisnika B;
- `SELECT auth_subject`, `SELECT last_login_at` i `SELECT *` padaju sa `42501`;
- `WHERE auth_subject = ...` pada sa `42501`;
- INSERT, UPDATE i DELETE padaju sa `42501`;
- `set_auth_subject_context(null)` i `set_auth_subject_context('')` podižu `42501`.

`practices` (§17.6):

- prije `app.practice_id` vidljive su **sve** ordinacije vlastitog membership skupa, uključujući
  one sa **neaktivnim** membershipom — to je zahtjev `GET /me`;
- nakon `app.practice_id` vidljiva je **tačno jedna** ordinacija, i kada upit nema `WHERE`;
- ordinacija u kojoj korisnik nema membership vraća nula redova, sa i bez konteksta;
- podmetnut `app.practice_id` bez membershipa vraća nula redova;
- bez `app.user_id` tabela vraća nula redova;
- `SELECT zsr_number`, `gln_number` i `legal_name` padaju sa `42501`;
- INSERT, UPDATE i DELETE padaju sa `42501`;
- politika i dalje daje identičan rezultat nakon što `practice_memberships` dobije `FORCE RLS`
  iz §17.3 — regresijski test granice faze 3 prema fazi 4;
- ukidanje `SELECT` granta nad `practice_memberships` obara politiku sa `42501` — test invarijante
  iz §17.6 i §20.2a.

Kompromitovan credential:

- test mora **tvrditi prihvaćeno ograničenje** — držalac `copilot_app` credentiala može sam
  postaviti `app.*` varijable — i **nikada** tvrditi da baza nezavisno autentifikuje korisnika;
- isti test mora potvrditi da column grantovi i dalje važe: `zsr_number` i `auth_subject` ostaju
  nedostupni, a svi upisi padaju.

## 25.2 Composite FK

- A encounter ne referencira B patient;
- A candidate ne referencira B analysis;
- A evidence ne referencira B document;
- svaka tenant tabela u obuhvatu §2.5 ima `unique (practice_id, id)`;
- svaki composite FK ima unique constraint nad tačno referenciranim parom kolona.

### 25.2.1 Lanac analysis revizija (D-034)

Concurrency:

- dvije istovremene revision komande nad istim roditeljem kreiraju **tačno jedno** dijete;
- gubitnik trke mapira se na **`409 REVISION_CONFLICT`**;
- drugi **sekvencijalni** zahtjev nad istim roditeljem koji već ima dijete takođe daje
  `409 REVISION_CONFLICT`;
- retry nakon unique konflikta **nikada ne kreira reviziju N+2** od istog roditelja.

Integritet lanca:

- dijete i roditelj ne mogu pripadati različitim encounterima — pada na trokolonskom FK;
- `revision_number = 1` uz non-NULL `parent_analysis_run_id` je odbijen;
- `revision_number > 1` uz `NULL` `parent_analysis_run_id` je odbijen;
- self-parent referenca (`parent_analysis_run_id = id`) je odbijena;
- **više inicijalnih revizija kroz različite encountere ostaje dozvoljeno** — parcijalni
  indeks ih ne obuhvata.

Immutability identiteta (§19.4):

- UPDATE nad `parent_analysis_run_id` pada sa SQLSTATE `23514`;
- UPDATE nad `revision_number` pada sa SQLSTATE `23514`;
- UPDATE nad ostalim kolonama `analysis_runs` prolazi.

### 25.2.2 Immutable correction eventi i pokrivenost odluka (D-046)

Struktura schema:

- `review_item_changes` **više ne sadrži kolonu `review_decision_id`**;
- `review_item_changes` sadrži `analysis_run_id` sa `not null`;
- composite FK `review_item_changes (practice_id, analysis_run_id)` →
  `analysis_runs (practice_id, id)` postoji;
- composite FK `review_decisions (practice_id, analysis_run_id)` →
  `analysis_runs (practice_id, id)` postoji;
- **oba roditeljska kandidat ključa postoje** —
  `review_decisions unique (practice_id, analysis_run_id, id)` i
  `review_item_changes unique (practice_id, analysis_run_id, id)`;
- tabela `review_decision_change_links` postoji;
- ima **tačno** kolone `id`, `practice_id`, `analysis_run_id`, `review_decision_id`,
  `review_item_change_id` i `created_at`, sve `not null`, uz `primary key (id)`;
- **oba trokolonska composite FK-a postoje**;
- **oba navode `NO ACTION`** i za `ON DELETE` i za `ON UPDATE`.

Integritet linkova:

- validan same-practice, same-analysis-run link **prolazi**;
- **cross-practice link pada**;
- **same-practice ali cross-analysis-run link pada na database constraintu, ne na
  aplikacijskoj validaciji**;
- link prema **nepostojećoj odluci** pada;
- link prema **nepostojećoj korekciji** pada;
- **duplirani par** odluka/promjena pada;
- jedna odluka smije referencirati **više** korekcija;
- jedna korekcija smije biti referencirana od **više** odluka;
- **nula correction linkova je validno stanje** odluke.

Životni ciklus i pristup:

- `UPDATE` nad `review_decision_change_links` je **odbijen**;
- `DELETE` nad `review_decision_change_links` je **odbijen**;
- brisanje bilo kojeg roditelja — `analysis_runs`, `review_decisions` ili
  `review_item_changes` — je **blokirano** `NO ACTION`-om;
- **cross-tenant RLS čitanje je odbijeno**;
- `review_decision_change_links` ima `ENABLE ROW LEVEL SECURITY` **i**
  `FORCE ROW LEVEL SECURITY`.

Introspekcija vlasništva i inventara:

- paket `009_review_approvals` posjeduje **schema** objekte iz §22.9;
- paket `013_rls_policies` posjeduje **RLS** objekte iz §22.13;
- inventar tenant tabela iz §2.5 i §18.1 sadrži **tačno 30** tabela;
- inventar deklarisanih composite FK-ova odgovara §28.1 — **tačno četrnaest**.

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

## 25.6 Negativni privilege testovi

Kompletna lista je u §20.4. Minimum za acceptance:

- `copilot_app` ne piše globalnu tarifnu konfiguraciju;
- `copilot_app` ne čita `system_storage_objects.object_key` ni `encryption_*` kolone;
- `copilot_system` nema pristup nijednoj tenant tabeli;
- `copilot_system` ne mijenja `system_storage_objects` kolone izvan
  `(sha256, byte_size, antivirus_status)`;
- nijedna runtime rola nema DELETE nad `system_storage_objects`;
- nijedna runtime rola nije owner;
- `MIGRATION_DATABASE_URL` nije prisutan u runtime konfiguraciji.

## 25.7 Enkripcijski envelope

- ciphertext ≠ plaintext;
- dekripcija sa pogrešnim ključem ili verzijom pada;
- izmijenjen auth tag pada;
- ciphertext premješten u drugi red se ne dekriptuje;
- neusklađena NULL trojka (ciphertext/IV/tag) odbijena;
- IV od 11 bajtova odbijen;
- auth tag od 15 bajtova odbijen;
- non-null ciphertext bez `encryption_key_ref` odbijen;
- `encryption_algorithm` različit od `AES-256-GCM` odbijen;
- `encounter_documents` sa oba polja koristi jedan `encryption_key_ref`, ali različite
  IV vrijednosti.

## 25.8 AAD immutability

- UPDATE nad `id` pada sa SQLSTATE `23514`;
- UPDATE nad `practice_id` pada sa SQLSTATE `23514`;
- UPDATE nad ostalim kolonama prolazi;
- test se izvršava na svih pet tabela iz §19.3.

## 25.9 Deduplikacija findinga

- dva identična findinga sa NULL `related_service_candidate_id` i NULL
  `related_tariff_item_id` ne mogu oba biti upisana;
- drugi INSERT pada na database constraintu, ne na aplikacijskoj provjeri.

## 25.10 Dodjele tenant rola (D-038)

Testovi dokazuju **pravilo kompozicije**, ne konkretne grantove po roli — oni pripadaju
budućoj matrici u `15`.

Struktura i constrainti:

- jedan membership može nositi **više jedinstvenih** `practice_membership_roles` redova;
- **dupla dodjela iste role** istom membershipu pada na
  `unique (practice_id, membership_id, role)`;
- red dodjele **ne može referencirati membership druge ordinacije** — pada na composite FK
  `(practice_id, membership_id)`;
- ponašanje pri brisanju roditelja prati prihvaćene FK konvencije; referencijalne akcije
  nisu deklarisane, pa FK pada na `NO ACTION`, a odluka je otvorena u §28.1.

Životni ciklus dodjela (D-038, klauzule 25–32):

- uklanjanje role **briše** trenutni red dodjele;
- ista rola se nakon uklanjanja **može ponovo dodijeliti**, bez sudara sa
  `unique (practice_id, membership_id, role)`;
- neaktivan membership **zadržava** svoje role redove i i dalje daje **nula** efektivnih
  permisija;
- ponovna aktivacija membershipa vraća **tačno** pohranjene redove i **ne zaključuje**
  nijednu dodatnu rolu;
- aktivan membership sa nula redova dodjele ostaje **važeći membership** i daje **nula**
  permisija.

Efektivne permisije:

- **neaktivan membership** ne daje nijednu efektivnu permisiju, bez obzira na postojeće
  redove dodjele;
- **aktivan membership sa nula rola** ne daje nijednu efektivnu permisiju;
- membership sa više rola dobija **uniju** tenant grantova tih rola;
- `DENY` u jednoj roli **ne poništava** `ALLOW` iz druge dodijeljene tenant role.

Razdvajanje i izolacija:

- `platformRoles` **nikada ne doprinose** tenant permission uniji;
- `SYSTEM_ADMIN` bez aktivnog tenant membershipa nema pristup nijednoj tenant ruti ni
  tenant tabeli;
- enumeracija kroz politiku §17.4 izlaže **isključivo** dodjele vlastitih membershipa
  autentifikovanog korisnika;
- dodjele rola jedne ordinacije **ne mogu uticati** na autorizaciju u drugoj ordinaciji.

Uslovne permisije:

- uslovno odobravanje i dalje zahtijeva odgovarajući practice flag — `allow_mpa_approval`
  odnosno `allow_billing_specialist_approval` (§6.4) — pored podobne dodijeljene role.

---

# 26. Prisma implementacijske napomene

Prisma schema ne izražava sva pravila. Zato:

- model/relations u `schema.prisma`;
- RLS, grants, functions, triggers i pojedini composite FK u migration SQL-u;
- ne očekivati da `prisma generate` razumije RLS;
- raw SQL samo kroz kontrolisane repository/service metode;
- Decimal iz Prisma se mapira u API string;
- `Json` ne koristi se kao zamjena za ključne normalizovane kolone.

## 26.1 Identifikatori

`@default(uuid())` se **ne koristi** za poslovne entitete. Aplikacija generiše UUID i
navodi ga u `create`/`createMany` pozivu (§2.2). Isto važi za seed i migracione skripte.

## 26.2 `NULLS NOT DISTINCT`

Prisma ne izražava `NULLS NOT DISTINCT`. Constraint na `rule_findings` (§12.3, D-030) se
piše kao custom SQL u `--create-only` migraciji, prema D-004.

`prisma migrate diff` i `prisma migrate dev` mogu prijavljivati drift na tom constraintu.
**To je očekivano i ne ispravlja se.** Uklanjanje constrainta radi "čistog" drift izvještaja
je zabranjeno.

Isto važi za RLS politike, grants, trigger funkcije iz §19 i column-level privilegije iz
§9.3.1 — Prisma ih ne modelira.

---

# 27. Definition of Done za Schema v1

- sve migracije rade na praznoj bazi;
- `migrate deploy` radi na testnoj bazi;
- nijedna runtime rola nije owner;
- RLS pokriva sve tenant tabele;
- **svaka tenant tabela u obuhvatu §2.5 ima `unique (practice_id, id)`**;
- **svaki composite FK ima unique constraint nad referenciranim parom kolona**;
- **`practice_id` je `not null` na svim tenant tabelama u obuhvatu**;
- **nijedna runtime rola ne piše globalnu tarifnu konfiguraciju**;
- **`copilot_system` nema nijedan grant nad tenant tabelama**;
- **`MIGRATION_DATABASE_URL` se ne koristi u runtimeu**;
- **svako enkriptovano polje ima `_ciphertext`, `_iv` i `_auth_tag` kolonu**;
- **svaka tabela sa enkriptovanim poljem ima četiri row-level `encryption_*` kolone**;
- **svi CHECK constrainti iz §2.7.5 postoje**;
- **funkcija i svih pet AAD triggera iz §19.3 postoje**;
- **`rule_findings` koristi `unique nulls not distinct`**;
- **svih šest optimistic-locking resursa ima `version` i `check (version >= 1)`**;
- **svaka analysis revizija ima najviše jedno direktno dijete**;
- **historija analysis revizija je linearni lanac, ne stablo**;
- **identitetska polja revizije — `parent_analysis_run_id` i `revision_number` — su
  immutable nakon INSERT-a**;
- **`practice_memberships` nema singularnu kolonu `role`**;
- **`practice_membership_roles` postoji sa `unique (practice_id, id)`,
  `unique (practice_id, membership_id, role)` i composite FK-om prema
  `practice_memberships(practice_id, id)`**;
- **jedan membership može nositi nula, jednu ili više tenant rola**;
- **efektivne tenant permisije su unija dodijeljenih tenant rola istog membershipa**;
- **aktivan membership sa nula rola ne autorizuje nijednu tenant operaciju**;
- **`review_item_changes` nema kolonu `review_decision_id` i ima `analysis_run_id not null`
  uz composite FK prema `analysis_runs(practice_id, id)`**;
- **`review_decision_change_links` postoji sa oba trokolonska composite FK-a, koja
  eksplicitno navode `ON DELETE NO ACTION` i `ON UPDATE NO ACTION`**;
- **correction eventi i decision/change linkovi su append-only — bez `UPDATE` i bez `DELETE`
  granta**;
- composite FK testovi prolaze;
- negativni privilege testovi iz §20.4 prolaze;
- migration checksum nije ručno narušen;
- audit je append-only;
- approval je immutable;
- svi bitni inputi imaju hash;
- indeksi postoje;
- seed je idempotentan i eksplicitno navodi UUID-eve;
- backup/restore test je dokumentovan;
- Prisma validate i generate prolaze;
- očekivani drift iz §26.2 je dokumentovan i nije "ispravljen".

## 27.1 Rokovi za neriješene stavke

Stavke iz §28 nisu preduslov za Schema v1 baseline, ali **nemaju zajednički rok i ne
čekaju produkcijski pilot**. Svaka ima vlastiti, raniji rok:

| Stavka | Rok |
|---|---|
| §28.1 — odluke o composite FK relacijama | prije migration paketa koji prvi kreira izvornu tabelu te relacije (najraniji je `007_tariff_evaluation`) |
| §28.1 — referencijalne akcije za već deklarisane composite FK-ove | prije paketa `003_patient_encounter_documents` |
| §28.2 — access model za `users` i `practices` (D-OPEN-011) | ~~prije faze 3~~ — **RIJEŠENO 2026-08-12 odlukom D-047**; stavka više nije otvorena |
| Preostali pravni, hosting i eksterni integracijski gateovi | prema vlastitim, pojedinačno dokumentovanim rokovima u `06` i `13` |

Rok "prije produkcijskog pilota" važi isključivo za one otvorene odluke koje ga same
navode — na primjer D-OPEN-002, D-OPEN-007 i D-OPEN-004a. Ne primjenjuje se na §28.

---

# 28. Neriješene schema stavke

Ove stavke su svjesno ostavljene otvorene. Nijedna se ne rješava pretpostavkom u
implementaciji — svaka zahtijeva odluku prije nego što uđe u migraciju.

## 28.1 Nedeklarisane composite FK relacije

Tabela ispod **trenutno enumeriše sedam** relacija koje postoje kroz imena kolona, ali u v1
**nisu** deklarisane kao composite FK. Broj **sedam je broj redova te tabele**, a **ne**
tvrdnja da je to potpun globalni inventar svih nedeklarisanih relacija u ovom dokumentu —
vidi "Obuhvat ove tabele" niže.

| Source tabela | Source kolone | Target tabela | Rok — paket koji kreira source tabelu |
|---|---|---|---|
| `tariff_evaluation_items` | `(practice_id, tariff_evaluation_id)` | `tariff_evaluations` | `007_tariff_evaluation` |
| `tariff_messages` | `(practice_id, tariff_evaluation_id)` | `tariff_evaluations` | `007_tariff_evaluation` |
| `finding_evidence` | `(practice_id, rule_finding_id)` | `rule_findings` | `008_safety_findings` |
| `external_resource_links` | `(practice_id, integration_connection_id)` | `integration_connections` | `010_integrations` |
| `export_jobs` | `(practice_id, analysis_run_id)` | `analysis_runs` | `010_integrations` |
| `export_jobs` | `(practice_id, approval_id)` | `analysis_approvals` | `010_integrations` |
| `export_jobs` | `(practice_id, integration_connection_id)` | `integration_connections` | `010_integrations` |

**Relacija `review_item_changes (practice_id, review_decision_id)` → `review_decisions` je
uklonjena iz ove liste** (D-046, klauzule 13–14, 17). Kolona `review_decision_id` više ne
postoji, pa relacija nema izvornu kolonu i ne može biti ni deklarisana ni odgođena.
Asocijaciju odluke i promjene sada nosi **deklarisana** link tabela
`review_decision_change_links` (§13.2a), čija su oba composite FK-a stvarno deklarisana i
eksplicitno navode referencijalne akcije. Lista je time pala **sa osam na sedam** stavki.

### Obuhvat ove tabele

**Sedam je broj redova tabele iznad, a ne tvrdnja o globalnoj potpunosti.** Ovaj odjeljak
**ne tvrdi** da je enumerisao svaku nedeklarisanu relaciju u ovom dokumentu.

Poznato je da postoji i zaseban, još neriješen skup relacija nad kolonom `analysis_run_id`
koje **nisu** deklarisane kao composite FK i **nisu** u tabeli iznad:

- `extracted_facts.analysis_run_id` (§10.5);
- `service_candidates.analysis_run_id` (§10.6);
- `ai_extraction_runs.analysis_run_id` (§10.4);
- `tariff_evaluations.analysis_run_id` (§11.1);
- `rule_findings.analysis_run_id` (§12.3);
- `analysis_approvals.analysis_run_id` (§13.3).

Tih šest relacija čini **zasebnu, otvorenu stavku schema governance-a** i **ostaju izvan
D-046**. D-046 ih niti deklariše, niti rješava, niti ih uvodi u tabelu iznad; njihov
obuhvat, rok i referencijalne akcije nisu definisani u ovom odjeljku i moraju se odlučiti
posebno.

### Rok

**Svaka relacija iz sedmoredne tabele iznad mora biti riješena prije migration paketa koji
prvi kreira njenu izvornu tabelu**, prema koloni "Rok" te tabele. Najraniji rok je
`007_tariff_evaluation`. Rok za šest `analysis_run_id` relacija iz "Obuhvat ove tabele"
**nije** ovdje definisan.

Odgađanje samo do produkcijskog pilota **nije dovoljno**. Kada paket jednom kreira izvornu
tabelu bez FK-a, naknadno dodavanje traži migraciju nad popunjenom tabelom i provjeru
postojećih redova — trošak koji se izbjegava odlukom prije tog paketa.

Svi target ključevi već postoje — §2.5 garantuje `unique (practice_id, id)` na svakoj od
tih tabela, pa je deklaracija tehnički moguća u bilo kojem trenutku. Odluka je odgođena
namjerno, ne zbog tehničke prepreke.

### Šta se mora definisati po relaciji

Prije nego što se bilo koja od njih deklariše, za svaku se mora definisati:

1. da li je relacija obavezna ili opciona;
2. nullability source kolone;
3. `ON DELETE` ponašanje;
4. `ON UPDATE` ponašanje;
5. lifecycle i immutability implikacije;
6. da li historijski/audit redovi moraju preživjeti brisanje roditelja.

**`CASCADE` nikada nije default.** Tačka 6 je odlučujuća za append-only tabele
(`export_jobs`, `finding_evidence`, `tariff_messages`), gdje bi kaskadno brisanje uklonilo
audit trag. Nijedna od šest numerisanih tačaka iznad se ne rješava pretpostavkom — izostanak
odluke znači da se relacija ne deklariše, ne da se bira default.

Isto pitanje referencijalnih akcija je otvoreno i za **deset** već deklarisanih composite
FK-ova u ovom dokumentu — §6.3a, §7.2, §7.3, §8.2 (dva), §10.2 (dva), §10.3 i §10.7 (dva),
uključujući FK `(practice_id, membership_id)` iz §6.3a (D-038). Nijedan od tih deset ne
navodi `ON DELETE` ni `ON UPDATE`, pa svi padaju na PostgreSQL default `NO ACTION`. Odluka
mora obuhvatiti i njih, **prije paketa `003_patient_encounter_documents`**, koji prvi kreira
izvornu tabelu sa composite FK-om.

### Ukupan inventar deklarisanih composite FK-ova

Dokument deklariše **četrnaest** composite FK-ova:

- **deset** navedenih u prethodnom pasusu, koja referencijalne akcije **ne navode** i padaju
  na default `NO ACTION` — obuhvaćena su otvorenim pitanjem ovog odjeljka;
- **četiri** iz D-046, koja `ON DELETE NO ACTION` i `ON UPDATE NO ACTION` navode
  **eksplicitno**, pa **nisu** obuhvaćena tim otvorenim pitanjem:

| Source tabela | Source kolone | Target tabela | Sekcija |
|---|---|---|---|
| `review_decisions` | `(practice_id, analysis_run_id)` | `analysis_runs` | §13.1 |
| `review_item_changes` | `(practice_id, analysis_run_id)` | `analysis_runs` | §13.2 |
| `review_decision_change_links` | `(practice_id, analysis_run_id, review_decision_id)` | `review_decisions` | §13.2a |
| `review_decision_change_links` | `(practice_id, analysis_run_id, review_item_change_id)` | `review_item_changes` | §13.2a |

Jednokolonski FK `tariff_release_artifacts.system_storage_object_id` →
`system_storage_objects(id)` (§9.2) **nije** composite FK i ne ulazi ni u jedan od ova dva
broja.

Broj je mehanički provjerljiv iz normativnih constraint definicija ovog dokumenta i
verifikuje se testom iz §25.2.2.

## 28.2 Access model za `users` i `practices` — RIJEŠENO

- **Status:** **RIJEŠENO 2026-08-12** odlukom **D-047 — Runtime access model za `users` i
  `practices` (Bootstrap-Scoped RLS)**
- **Prijašnji status:** `MUST DECIDE BEFORE PHASE 3` (D-OPEN-011, sada `SUPERSEDED BY D-047`)

Ova stavka **više nije neriješena** i zadržana je u §28 radi historije i sljedivosti. Normativni
sadržaj sada živi u §16.2.1, §16.2.4, §17.5, §17.6, §18.2, §20.2a i §22.2.

Rezultat po tabeli:

- **`users`** — self-scoped identity access model, vezan za verifikovanog autentifikovanog
  korisnika, ostvaren kroz dvije **međusobno isključive** PERMISSIVE politike uz `ENABLE` +
  `FORCE RLS` (§17.5) i column-level `SELECT` na `(id, email, display_name, preferred_language,
  status)` (§20.2a). Bootstrap rezolucija `auth_subject` → `users.id` izvodi se kroz
  `app.auth_subject` i `set_auth_subject_context` (§16.2.4), **bez `SECURITY DEFINER`**. Širi
  pristup — uključujući red drugog korisnika — je `DENY / NOT IMPLEMENTED` u v1.
- **`practices`** — membership-scoped access model uz **RESTRICTIVE** context narrowing (§17.6) i
  column-level `SELECT` na `(id, code, name, default_language, timezone, status)` (§20.2a).
  Politika **ne izlaže sve ordinacije**: vidljive su isključivo ordinacije vlastitog membership
  skupa, a nakon uspostavljenog tenant konteksta tačno jedna. `zsr_number`, `gln_number` i
  `legal_name` **nemaju grant nijednoj runtime roli**, pa ostaju nedostupni i pri kompromitovanom
  credentialu. `practices.zsr_number` ostaje označen kao osjetljiv poslovni podatak u §6.1.

**Ni `users` ni `practices` se i dalje ne smiju tretirati kao neograničene globalne
runtime-čitljive tabele.** Ta zabrana **nije ukinuta** rješavanjem stavke — sada je sprovedena
kroz `ENABLE` + `FORCE RLS` i column-level grantove, a obje tabele su navedene u §18.2 i
eksplicitno isključene iz §18.3.

D-033 klauzula 2 je time **ispunjena**: tačan database put rezolucije `auth_subject` → `users.id`
definisan je u D-047, klauzulama 1–4. Sigurnosna semantika D-033 se ne mijenja; premješteno je
isključivo vlasništvo paketa za `set_user_context` (§16.2.2, §22.2, §22.13).

**D-038 nije riješio ovo pitanje** (D-038, klauzula 23), i ta tvrdnja ostaje tačna. Bootstrap-
readable pristup vlastitim redovima dodjele rola iz §17.4:

- **nije** generički runtime pristup nad `users`;
- **nije** generički runtime pristup nad `practices`;
- **nije** role administration — politika daje isključivo SELECT nad vlastitim redovima;
- **ne definiše** platform ni cross-practice pristup;
- **nije** riješio D-OPEN-011 — to je učinio D-047, zasebnom odlukom i zasebnim politikama.

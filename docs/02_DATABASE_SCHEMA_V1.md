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

## 2.8 Deterministički lookup token eksternog ID-a (`*_ref_hash`)

Normativni izvor je D-060, Dio A i Dio B. Ova sekcija je jedini kanonski opis; pojedinačne tabele
samo navode kolonu i njena ograničenja. **Nijedna kolona se ovim ne dodaje ni ne mijenja.**

### 2.8.1 Obuhvat

```text
patient_references.external_patient_ref_hash    (§7.1)
encounters.external_encounter_ref_hash          (§7.2)
encounter_documents.external_document_ref_hash  (§8.2)
```

Sve tri su `varchar(128)`.

### 2.8.2 Semantika

Kolona **nije** običan hash sadržaja. To je **keyed, deterministički lookup token**:
**HMAC-SHA256** nad kanonskom, domenski separisanom porukom, uz **namjenski HMAC ključ `K_hmac`**.

`K_hmac` je **odvojen od AES-GCM ključa podataka `K_enc`** iz §2.7. Upotreba `K_enc` za HMAC je
**zabranjena** (D-060, klauzula 2): §2.7.6 propisuje da re-enkripcija pri rotaciji **ne mijenja
`*_hash` kolone**, pa `*_hash` ne smije zavisiti od enkripcijskog ključa — inače bi rotacija
razbila lookup identitet postojećih redova.

### 2.8.3 Kanonska HMAC poruka

UTF-8 string, LF separatori, bez završnog praznog reda:

```text
v1
domain=<token domain>
practice_id=<canonical UUID>
source_system=<canonical enum literal>
value=<normalized external identifier>
```

Redoslijed redova je normativan. Katalog domena:

```text
patient_external_ref
encounter_external_ref
document_external_ref
```

Domenska separacija je obavezna: isti eksterni string u dvije ordinacije, dva `source_system`
literala ili dvije domene daje **različite** tokene. Bez `practice_id` u poruci jednakost tokena bi
postala cross-tenant orakl.

### 2.8.4 Perzistirani format

```text
h1.<64 lowercase hex>
```

Ukupno 67 znakova za v1, unutar postojećeg `varchar(128)`.

`h1` je **identifikator generacije tokena** i veže algoritam, generaciju HMAC ključa i generaciju
formata poruke. `h1` **nije** verzija normalizacionog profila — profil je verzionisan odvojeno
(§2.8.5).

### 2.8.5 Normalizacija ulazne vrijednosti

Aktivni profil je **`MANUAL` v1** (D-060, klauzula 10), tim redoslijedom: validan Unicode; odbij
`NUL`; odbij C0/C1 kontrolne znakove; ukloni vodeći `U+FEFF`; skrati vodeći/prateći Unicode
whitespace; **NFC**; odbij prazan rezultat; primijeni maksimum dužine iz postojećih schema/API
ograničenja; kodiraj UTF-8.

Zabranjeno je: `NFKC`; case-folding; uklanjanje vodećih nula; sažimanje unutrašnjeg whitespacea;
mijenjanje interpunkcije; homoglyph folding.

Profil je **immutable čim pod njim postoji ijedan perzistirani red**. Profil `AXENITA` se smije
definisati **tek nakon** što D-OPEN-009 bude odblokiran.

### 2.8.6 Verzionisanje bez schema promjene

Faza 5 ima **jednu** aktivnu generaciju HMAC ključa i **ne planira** rutinsku rotaciju. Format
svejedno podržava više generacija: budući lookup smije izračunati kandidate po generaciji i
porediti ih jednakošću ili `IN` listom.

**Ne uvodi se kolona za verziju HMAC ključa.** Marker živi unutar tokena.

### 2.8.7 Klasifikacija

Token je **osjetljiv i linkabilan**; **nikada se ne logira** i **nikada se ne vraća** u API
odgovoru (`09` §8, §11).

---

## 2.9 Pseudonim pacijenta (`patient_references.pseudonym`)

Normativni izvor je D-060, Dio C.

### 2.9.1 Kanonska v1 sintaksa

```text
P- + tačno 10 velikih Crockford Base32 znakova
```

Primjer **oblika**, ne fiksni uzorak: `P-K7M2QX4TB9`. Stane u postojeći `varchar(50)`.

### 2.9.2 Porijeklo i stabilnost

- generisan iz **CSPRNG-a**;
- **nije** izveden iz eksternog identifikatora — ni hashom, ni skraćivanjem, ni HMAC-om;
- **nije reverzibilan**;
- **immutable** nakon kreiranja i stabilan za cijeli životni vijek reda.

Ovo pooštrava, i ne slabi, pravilo iz §7.1 („produkcijski pseudonim ne smije biti izveden direktnim
skraćivanjem eksternog ID-a").

### 2.9.3 Entropija i kolizije

Ciljna entropija je **približno 50 bita ili više**. Jedinstvenost nosi **postojeći**
`unique (practice_id, pseudonym)`. Kolizija se rješava **ograničenim** regenerate-and-retry
postupkom pri unique violationu; **determinističkog fallbacka nema** — pri iscrpljenim pokušajima
zahtjev pada.

### 2.9.4 Pretraga bez schema promjene

Perzistira se **velikim slovima**, a **ulazni** `patientPseudonym` iz query parametra se kanonizuje
u velika slova **prije obične jednakosne pretrage** (`03` §12).

**Ne uvode se** `citext`, `LOWER(kolona)` indeks, posebne kolacije ni funkcijski indeksi; **schema
se ne mijenja** radi case-insensitive pretrage.

### 2.9.5 Klasifikacija

Pseudonim je **Class C** (`09` §2) i **nije** na allowlisti tehničkog loga (`09` §11).

---

## 2.10 Normalizacija kliničkog teksta i `source_text_hash`

Normativni izvor je D-060, Dio D i Dio E.

### 2.10.1 Šta je perzistirano

`encounter_documents.normalized_text_*` (§8.2) je **enkriptovani, kanonski normalizovani,
neredigovani** izvorni klinički tekst.

**Sirovi, pre-normalizacioni tekst zahtjeva se ne perzistira.** Kolona za sirovi tekst **ne
postoji** i **ne uvodi se**.

### 2.10.2 Normativni pipeline normalizacije

Minimalan i **semantički lossless**, tim redoslijedom: validan Unicode; `CRLF` i samostalni `CR` u
`LF`; odbij `NUL`; odbij C0/C1 kontrolne znakove **osim** `LF` i `TAB`; ukloni **jedan** vodeći
`U+FEFF`; **NFC**; skrati vodeći/prateći whitespace **isključivo na nivou cijelog dokumenta**;
odbij prazan rezultat; primijeni maksimum manuelnog teksta (`03` §13.1); **nikada ne skraćuj**.

Očuvani su: veličina slova, interpunkcija, unutrašnji whitespace, tabovi, ponovljeni prazni redovi,
medicinski simboli, decimalni zarezi i tačke, jedinice, datumi, nazivi lijekova, doziranja,
dijagnoze i nalazi. **`NFKC` se ne koristi.**

Redoslijed operacija je **dio ugovora o hashovanju** i ne mijenja se tiho.

### 2.10.3 `source_text_hash`

`source_text_hash` (`varchar(64)`) je **lowercase hex SHA-256 UTF-8 kodiranja kanonski
normalizovanog, neredigovanog teksta**:

```text
sirovi request -> normalizacija -> normalizovani UTF-8 -> SHA-256 -> lowercase hex
               -> source_text_hash -> enkripcija i pohrana normalizovanog teksta (§2.7)
```

Hash je time **reproducibilan iz perzistiranog ciphertexta** nakon ovlaštene dekripcije. **Druga
hash kolona za sirovi ulaz se ne uvodi.**

`redacted_text_hash` (`varchar(64)`) računa se istim postupkom nad **redigovanim** tekstom.

### 2.10.4 Redigovani tekst ostaje Class A

`redacted_text_*` je enkriptovan po §2.7 i **ostaje Class A medicinski podatak** (`09` §2).
Redakcija Faze 5 **nije** anonimizacija ni de-identifikacija (§2.11.2).

---

## 2.11 Statusni rječnici dokumenta u Fazi 5

Normativni izvor je D-060, Dio F i Dio G. Obje kolone su `varchar(30)` (§8.2).

### 2.11.1 `processing_status`

```text
READY     normalizacija uspjela; normalizovani source-side artefakt je validan,
          enkriptovan i hash-konzistentan
FAILED    dokument postoji, ali source-side artefakt obrade nije upotrebljiv
```

**Nema** `PENDING`, `PROCESSING` ni `ARCHIVED`. Arhiviranje i dalje nosi `archived_at` (§8.2).
**Ne uvode se** stanja upload putanje.

### 2.11.2 `redaction_status`

```text
COMPLETED  konfigurisani deterministički ruleset Faze 5 izvršen je uspješno i proizveo
           enkriptovani redigovani tekst i redacted_text_hash
FAILED     redakcija nije proizvela upotrebljiv redigovani artefakt
```

**Klauzula iskrenosti (normativno).** `COMPLETED` znači **isključivo** da je konfigurisani
deterministički ruleset izvršen uspješno. **Ne tvrdi** anonimizaciju, de-identifikaciju, odsustvo
svih identifikatora ni sigurnost za neograničeno otkrivanje. **Rezultat ostaje Class A.**

Pri `FAILED`: `redacted_text_*` i `redacted_text_hash` ostaju null, kako CHECK constrainti iz §8.2
već dozvoljavaju; `view=redacted` **ne smije** pasti nazad na normalizovani ni originalni tekst
(`03` §13.3); redakcija se smije ponoviti pod **istom** verzijom ruleseta, uz **svjež IV** (§2.7.2).
**Nema** `SKIPPED`.

### 2.11.3 Verzija redakcionog ruleseta

Verzija je **immutable identifikator na nivou koda/konfiguracije** — `phase5-basic-v1`.
**Kolona za verziju ruleseta po dokumentu se u Fazi 5 ne uvodi.**

### 2.11.4 Sloj sprovođenja — RIJEŠENO (D-062, Dio E)

**Normativni izvor: D-062, Dio E (`OD-P5-D2-6`, ratifikovano `A + A+`).**

Oba rječnika sprovode se **i aplikacijski i database `CHECK` constraintima**. Paket
`003_patient_encounter_documents` uvodi **tri** `CHECK`-a nad `encounter_documents`:

```sql
check (processing_status in ('READY','FAILED'))
check (redaction_status in ('COMPLETED','FAILED'))
check (
  (redaction_status = 'COMPLETED'
   and redacted_text_ciphertext is not null
   and redacted_text_hash is not null)
  or
  (redaction_status = 'FAILED'
   and redacted_text_ciphertext is null
   and redacted_text_hash is null)
)
```

**Fizički tip obje kolone ostaje `varchar(30)`** (§8.2). **Konverzija u PostgreSQL enum nije
autorizovana** — D-060, klauzula 44, zabranjuje izmjenu kolone. **Ne uvode se** `PENDING`,
`PROCESSING`, `ARCHIVED` ni `SKIPPED`.

Kombinacija `processing_status = 'FAILED'` uz `redaction_status = 'COMPLETED'` je **logički
nemoguća** i domenski se odbija; artefakt-konzistencijski `CHECK` je isključuje u database-
provjerljivom dijelu.

Prigovor D-060 bio je **vremenski, ne suštinski** — "*prerani constraint bi zaključao vokabular
prije schema gatea*" — i **istekao je na ovom schema gateu**. Vokabular je zamrznut, pa `CHECK`
kodira ratifikovanu činjenicu.

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
  vlasnički membership red (§17.4);
- u fazi 3 **isključivo trokolonski** column-level SELECT na `practice_settings`
  (`practice_id`, `allow_mpa_approval`, `allow_billing_specialist_approval`), bez ijednog upisa
  (§20.2b, D-049);
- u fazi 4 **tačno devetokolonski** column-level SELECT i **tačno devetokolonski** column-level
  UPDATE na `practice_settings`, bez INSERT-a i DELETE-a, ograničeni tenant politikom
  (§20.2b.1, D-053).

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

`version` je optimistic locking kolona (D-029); `PATCH /practices/{practiceId}/settings` zahtijeva
`If-Match`.

`configuration` ne sadrži secrets.

**Vlasništvo faza (D-049).** Paket `002_identity_and_practices` i **faza 3** kreiraju
**kompletnu** schemu iznad — uključujući `version`, `check (version >= 1)`, `updated_by` i **oba**
approval flaga. Runtime put te tabele pripada **fazi 4** i paketu `013_rls_policies`: `ENABLE` +
`FORCE RLS`, tenant politika, **devetokolonski `SELECT`**, **devetokolonski `UPDATE`**, te `GET` i
`PATCH` settings rute sa `ETag`/`If-Match`/`428`/`409 VERSION_CONFLICT`.

**Tačne runtime površine faze 4 (D-053, dijelovi A i B).** Ranija formulacija „proširena čitljiva
površina" je **zamijenjena prebrojanim listama** iz §20.2b. `copilot_app` čita **tačno devet**
kolona i piše **tačno devet** kolona. `configuration`, `updated_by` i `id` ostaju **nečitljivi**;
`practice_id`, `id`, `configuration` i `updated_by` ostaju **bez `UPDATE`-a**; `updated_at` je
upisiv, ali ga postavlja **baza**, nikada API pozivalac. `updated_by` **nije autoritativno audit
polje** i settings endpoint ga ne dira — akterstvo ostaje u kanonskom audit modelu, **bez novog
trigera** i **bez izmjene paketa `014_immutability_triggers`**.

U fazi 3 `copilot_app` dobija **isključivo trokolonski** `SELECT` iz §20.2b i **nijedan** upis;
nijedna settings ruta nije registrovana. Grantovi i tenant politika koja ograničava write
sposobnost uvode se **zajedno**, u paketu `013` (D-049, klauzula 5).

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

**Vlasništvo paketa (D-051):** `002_identity_and_practices`, **faza 3** — i tabela i njena RLS iz
§17.2. Invarijanta D-023 klauzule 11 zato važi **od faze 3 nadalje**.

**Semantika tekućih dodjela (D-051, klauzula 3).** `platformRoles[]` u `GET /me` predstavlja
**tekuće, neopozvane** dodjele: doprinose isključivo redovi gdje je `revoked_at IS NULL`. Kolone
`revoked_at` i `revoked_by` postoje radi buduće administracije; **revoke administracijski put,
endpoint ni write grant se ovim ne uvode**.

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

**Semantika `external_patient_ref_hash` (§2.8, D-060).** Kolona nosi **keyed deterministički lookup
token**, ne obični hash: HMAC-SHA256 nad domenski separisanom kanonskom porukom
(`domain=patient_external_ref`, `practice_id`, `source_system`, normalizovana vrijednost), uz
**namjenski HMAC ključ odvojen od AES-GCM ključa iz §2.7**. Perzistirani format je
`h1.<64 lowercase hex>` — 67 znakova unutar postojećeg `varchar(128)`. **Kolona za verziju HMAC
ključa se ne uvodi**; generacijski marker živi unutar tokena. Ulazna vrijednost prolazi
normalizacioni profil `MANUAL` v1 (§2.8.5), koji je **odvojeno verzionisan od `h1`** i **immutable
čim pod njim postoji ijedan perzistirani red**.

**Semantika `pseudonym` (§2.9, D-060).** Kanonska v1 sintaksa je `P-` + tačno 10 velikih Crockford
Base32 znakova, generisanih iz **CSPRNG-a**, **bez ikakve izvedenosti iz eksternog ID-a**, ciljne
entropije približno 50 bita ili više, **immutable** nakon kreiranja. Jedinstvenost nosi postojeći
`unique (practice_id, pseudonym)`; kolizija se rješava ograničenim regenerate-and-retry postupkom,
**bez determinističkog fallbacka**. Perzistira se velikim slovima, a ulazni query parametar se
kanonizuje u velika slova prije obične jednakosne pretrage — **`citext`, funkcijski indeks ni
posebna kolacija se ne uvode**.

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
  on delete no action on update no action

-- D-062, Dio D (OD-P5-D2-5): domenska validacija responsiblePhysicianId.
-- Parent ključ practice_memberships_practice_user_key postoji od paketa 002.
-- MATCH SIMPLE je obavezan: practice_id je NOT NULL, responsible_physician_id nije.
constraint encounters_responsible_physician_membership_fk
  foreign key (practice_id, responsible_physician_id)
  references practice_memberships(practice_id, user_id)
  match simple
  on delete no action on update no action

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

Indeksi (**pomireno sa §21 — D-062, Dio J, `OD-P5-D2-13`**; `id desc` je obavezan tie-breaker za
stabilnost cursor paginacije):

```sql
encounters_review_queue_idx
  (practice_id, status, treatment_date desc, id desc)
encounters_patient_timeline_idx
  (practice_id, patient_reference_id, treatment_date desc, id desc)
encounters_responsible_physician_idx
  (practice_id, responsible_physician_id, treatment_date desc, id desc)
```

Sva tri kreira paket `003`; paket `012_constraints_indexes` ih kasnije **verifikuje**, ne kreira.
`encounters_responsible_physician_idx` se **ne uklanja** zato što ga minimalni katalog §21
izostavlja — filter `responsiblePhysicianId` je kanonski i očuvan D-061, klauzulom 10.

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

**Semantika tekstualnih polja i hasheva (§2.10, D-060).** `normalized_text_*` je **enkriptovani,
kanonski normalizovani, neredigovani** izvorni klinički tekst; **sirovi pre-normalizacioni tekst se
ne perzistira** i kolona za njega **ne postoji**. `source_text_hash` je **lowercase hex SHA-256
UTF-8 kodiranja tog normalizovanog teksta**, računat **prije** enkripcije, pa je **reproducibilan
iz perzistiranog ciphertexta** nakon ovlaštene dekripcije; **druga hash kolona za sirovi ulaz se ne
uvodi**. `redacted_text_hash` se računa istim postupkom nad redigovanim tekstom.
**`redacted_text_*` ostaje Class A medicinski podatak** — redakcija Faze 5 nije anonimizacija ni
de-identifikacija.

**Semantika `external_document_ref_hash` (§2.8).** Isti keyed lookup-token ugovor kao u §7.1, uz
domen `document_external_ref`.

**Statusni rječnici Faze 5 (§2.11, D-060).** `processing_status` ∈ {`READY`, `FAILED`};
`redaction_status` ∈ {`COMPLETED`, `FAILED`}. Nema `PENDING`, `PROCESSING`, `ARCHIVED` ni
`SKIPPED`; arhiviranje i dalje nosi `archived_at`. `COMPLETED` znači **isključivo** da je
konfigurisani deterministički ruleset (`phase5-basic-v1`) izvršen uspješno i **ne tvrdi**
anonimizaciju ni odsustvo svih identifikatora. Pri `FAILED` redakciji `redacted_text_*` i
`redacted_text_hash` ostaju null, kako gornji CHECK constrainti već dozvoljavaju, a `view=redacted`
**ne smije** pasti nazad na normalizovani tekst (`03` §13.3); ponovni pokušaj koristi **svjež IV**.
**Kolona za verziju redakcionog ruleseta se ne uvodi.** U Fazi 5 oba rječnika sprovodi
**aplikacijska logika** — **`CHECK` constrainti za njih se u ovom gateu ne dodaju**; odluku
posjeduje P5-D2. *(**Superseded — D-062, Dio E / §2.11.4.** Gate `P5-D2` je izvršen: rječnici se
sprovode **i aplikacijski i database `CHECK` constraintima**, i paket `003` uvodi **tri** `CHECK`-a
nad `encounter_documents`. Rečenica iznad zadržana je nepromijenjena kao historijski D-060 zapis i
**više ne opisuje tekuće stanje**. Potpun katalog: §29.7a.)*

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
piše kao **ručno dopunjen custom migration SQL** u migration fajlu paketa (D-004, D-050), i
`prisma migrate diff` može prijavljivati drift na njemu. To je očekivano i ne ispravlja se.
Vidi §26.2 i §26.3.

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
**Izvršna faza je 10 za oba paketa** — schema kreira paket `009`, a odgođeni RLS slice paketa
`013` izvršava se neposredno nakon toga (D-052, klauzula A.5; §17.0, §22.13).
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

## 17.0 Vlasništvo paketa i faza — normativna podjela

**Normativne odluke: D-047 klauzula 16; D-049; D-051; D-052; D-056.**

**Status ove tabele.** Ona je **restatement svojih citiranih, više rangiranih odluka**, a ne
nezavisan izvor autoriteta. Dok stoji neizmijenjena, nijedan izvedeni dokument ne smije joj
kontradiktirati. Kada prihvaćena odluka izmijeni ijedan njen red, **tabela se pomjera zajedno sa tim
amandmanom** — mjerodavna je odluka, a tabela se usklađuje s njom. Pri sukobu su `03` §3.7.1 i
D-047, klauzula 10 nadređeni svakom izvedenom imenu artefakta (D-054; D-056).

| Obrazac / artefakt | Paket | Faza |
|---|---|---|
| §17.2 `platform_role_assignments` — `ENABLE` + `FORCE RLS` i obje politike | `002_identity_and_practices` | **3** |
| §17.4 `practice_membership_roles` — `ENABLE` + `FORCE RLS` i self politika | `002_identity_and_practices` | **3** |
| §17.5 `users` — `ENABLE` + `FORCE RLS` i obje politike | `002_identity_and_practices` | **3** |
| §17.6 `practices` — `ENABLE` + `FORCE RLS`, PERMISSIVE + RESTRICTIVE | `002_identity_and_practices` | **3** |
| `app_security.set_auth_subject_context(text)` (§16.2.4) | `002_identity_and_practices` | **3** |
| `app_security.set_user_context(uuid)` (§16.2.2) | `002_identity_and_practices` | **3** |
| §17.3 `practice_memberships` — `ENABLE` + `FORCE RLS` i self politika | `013_rls_policies` | 4 |
| `practice_settings` — `ENABLE` + `FORCE RLS`, tenant politika, `UPDATE` grant | `013_rls_policies` | 4 |
| `app_security.set_request_context(uuid)` (§16.2.3) | `013_rls_policies` | 4 |
| uspostava `app.practice_id` i tenant kontekst semantika (`set_request_context` **unutar** pinovane transakcije) | `013_rls_policies` / aplikacijski sloj | 4 |
| `PracticeContextGuard` — **semantička odgovornost** tenant admisije i uspostave konteksta (naziv faze, ne obavezan NestJS `Guard`; D-054, klauzule 2–4) | aplikacijski sloj | 4 |
| **konkretan `TenantDatabaseService` facade** — **`EXPLICITLY_DEFERRED` (D-056)**, uslovno na stvarni tenant business modul | aplikacijski sloj | **uslovno; najranije očekivano 5** |
| §17.1 preostale tenant politike **nad tabelama koje u fazi 4 postoje** | `013_rls_policies` | 4 |
| §17.1 tenant politika nad `review_decision_change_links` — **odgođeno izvršenje** | `013_rls_policies` | **10** |
| **pet PHI tabela Faze 5** — enumi, tabele, constrainti, svi FK-ovi sa eksplicitnim akcijama, `CHECK`-ovi, indeksi. **Bez granta, bez RLS-a** (D-062, §29) | `003_patient_encounter_documents` | **5** |
| `idempotency_keys` i `audit_events` — **isključivo te dvije** od četiri §15 tabele (D-062, `OD-P5-D2-1`) | `011_jobs_idempotency_outbox_audit` | **5** |
| §17.1 tenant politike i grantovi nad **pet PHI tabela Faze 5** — grant → `ENABLE`/`FORCE` → politika, jedna transakcija (D-062, §29.4, §29.5) | `013_rls_policies` | **5** |
| `app_security.reject_aad_bound_column_change()` i **tri** od pet AAD trigera iz §19.3 — `patient_references`, `encounters`, `encounter_documents` (D-062, `OD-P5-D2-1`) | `014_immutability_triggers` | **5** |
| preostala **dva** AAD trigera iz §19.3 | `014_immutability_triggers` | **faze vlasnika stanja** |

**Paket `002` je konačni vlasnik §17.2, §17.4, §17.5 i §17.6.** Paket `013` te objekte **ne smije
rekreirati, zamijeniti ni prepisati**; smije dodati isključivo preostale tenant sigurnosne
artefakte koje sam posjeduje (§22.13).

**Vlasništvo paketa nije izvršna faza (D-052).** Paket `013_rls_policies` posjeduje tenant RLS za
**svih 30** tabela iz §18.1, ali se izvršava **isključivo nad tabelama koje u datoj fazi postoje**.
**D-062 primjenjuje isti princip i u ranijem smjeru** za paket `014_immutability_triggers`: paket
zadržava vlasništvo nad svih pet AAD trigera, ali Faza 5 izvršava tri od njih, jer
`encounter_documents` nosi ciphertext već od Faze 5.
Zadnji red iznad je jedini **RLS** slice čije je izvršenje odgođeno: `review_decision_change_links` kreira
paket `009_review_approvals` u **fazi 10** (§22.9), pa **faza 4 tu tabelu ne kreira i nad njom ne
piše nijedan RLS ni grant objekat**. Vlasništvo slicea ostaje `013_rls_policies`, a sigurnosna
semantika iz §18.1 i D-046, klauzula 25–33, **ostaje nepromijenjena** — mijenja se isključivo
tačka izvršenja (D-052, klauzule A.1–A.9).

**Konkretan `TenantDatabaseService` facade — uslovno odgođen (D-056).** Sigurnosni **koncept**
tenant database facadea **ostaje kanonski i obavezan** (D-006; D-054, klauzula 5). **Faza 4 zadržava
tenant/kontekst sigurnosnu obavezu u cijelosti** — `set_request_context`, uspostavu
`app.practice_id`, obje membership barijere, kanonski redoslijed iz `03` §3.7.1 i tenant RLS. Ono
što **nije** deliverable zatvaranja faze 4 je **konkretna klasa**: tekući runtime već zadovoljava
semantiku koncepta kroz jedan `PrismaService`, jednu pinovanu interaktivnu transakciju i
`TenantRequestPipeline`, bez drugog klijenta, druge transakcije i caller-supplied identiteta.
Konkretan facade postaje obavezan **tek kada stvarni tenant business modul zatraži tu apstrakciju**;
faza 5 je najranija **očekivana**, ali ne i garantovana tačka. Svaki takav budući facade mora
omotati **postojeću** pinovanu granicu i **ponovo dokazati D-054, klauzule 6–10** (D-056, dio A).
**Nijedan sigurnosni zahtjev ovim nije uklonjen, oslabljen ni označen završenim**, i §17.1 se **ne
mijenja**.

**Nijedan novi broj migration paketa se ne uvodi.** Brojevi paketa u §22 su redoslijed zavisnosti,
ne brojevi faza.

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

## 17.1a `GET /me` i tenant obrazac nad `practice_settings` (D-053, dio D)

**Normativna odluka: D-053, dio D.** Ovaj odjeljak opisuje **jedinu** tačku u kojoj neutralna ruta
mora čitati tenant tabelu, i **kako se to radi bez ijednog izuzetka u politici**.

### 17.1a.1 Problem

`GET /me` izvodi **uslovne** permisije `analysis.approve` i `analysis.approval.revoke` iz
`allow_mpa_approval` i `allow_billing_specialist_approval` (D-041, D-044; `03` §10, §28.5). Ruta je
**neutralna**: ne traži `X-Practice-ID` i ne bira tenant. Kada faza 4 uvede tenant politiku iz
§17.1 nad `practice_settings`, a `app.practice_id` nije postavljen, predikat glasi
`practice_id = NULL` i vraća **nula redova za svaki membership**. Resolver pada **fail-closed** na
oba flaga `false`, pa bi ordinacija koja je odobravanje izričito uključila **tiho izgubila** te dvije
permisije u odgovoru `/me`. Regresija **ne baca grešku** — mijenja sadržaj zamrznutog ugovora.

### 17.1a.2 Politika se ne mijenja

`practice_settings` zadržava **doslovno** standardni tenant predikat iz §17.1:

```sql
practice_id =
nullif(current_setting('app.practice_id', true), '')::uuid
```

**Ne uvodi se bootstrap izuzetak, membership-wide grana, `SECURITY DEFINER`, `BYPASSRLS` ni ijedno
drugo slabljenje.** Rješenje je **isključivo** aplikacijska adaptacija.

### 17.1a.3 Prihvaćeni obrazac čitanja

1. **Sva čitanja koja nisu uređena tenant predikatom završavaju se prije prvog
   `set_request_context` poziva u toj transakciji** — `users` (§17.5), `practices` (§17.6),
   `practice_memberships` (§17.3), `practice_membership_roles` (§17.4) i
   `platform_role_assignments` (§17.2).

   Razlog je **RESTRICTIVE** politika `practices_context_narrow` (§17.6): čim `app.practice_id`
   postoji, `practices` vraća **tačno jednu** ordinaciju, pa bi čitanje `practiceName` za više
   membershipa nakon uspostavljenog konteksta bilo tiha regresija `03` §10.
2. **Neaktivan membership ne dobija kontekst** — njegove permisije su `[]` po `15` §3.2 i uslovne
   postavke mu nisu potrebne. `set_request_context` bi za njega ionako podigao `42501`, jer
   validira `pm.active = true` (§16.2.3).
3. Za **aktivan** membership čije izvođenje stvarno zahtijeva uslovne postavke, `app.practice_id`
   se uspostavlja **za taj membership**, kroz **prihvaćeni** `set_request_context` put (§16.2.3), i
   `practice_settings` se čita **pod istom strogom politikom** iz §17.1a.2.
4. **Identifikator ordinacije dolazi isključivo iz već razriješenog membership reda za
   `app.user_id`.** Nijedna vrijednost iz tijela, query parametra, headera ni putanje ne učestvuje.

### 17.1a.4 Izolacija bez novog mehanizma

**Ne uvodi se nijedan novi mehanizam čišćenja konteksta**; postojeći su dovoljni i kanonski:

- **između membershipa** — `set_request_context` **briše `app.practice_id` prije validacije** i
  postavlja ga tek nakon uspjeha (§16.2.3; D-033, klauzula 10), pa uzastopni pozivi ne akumuliraju
  i ne miješaju kontekst;
- **nakon transakcije** — `app.*` su transakcijski lokalne i gase se sa krajem transakcije; pooled
  konekcija ne nasljeđuje kontekst (§16.2).

Posljedica: postavke ordinacije A **nikada** ne doprinose permisijama ordinacije B, i obrada više
membershipa **nikada** ne unijira postavke ni role preko ordinacija.

### 17.1a.5 Šta se ovim ne uvodi

- `X-Practice-ID` na `/me` — **ne uvodi se**; ruta ostaje neutralna;
- provjera `practices.status` iz D-047, klauzule 10 — **ne uvodi se na `/me`**. Taj korak štiti
  **klijentski poslan** `X-Practice-ID` na tenant ruti; na `/me` klijent ne bira tenant, ruta ne
  autorizuje nijednu tenant operaciju, a uvođenje provjere bi promijenilo zamrznuti odgovor za
  aktivan membership u ne-`ACTIVE` ordinaciji (D-053, klauzula D.10);
- nijedna izmjena `03` §10 reprezentacije, `15` matrice, permisije ni role.

### 17.1a.6 Sigurnosni smjer

Ovo je **pooštrenje**, ne olakšica: read koji je u fazi 3 bio potpuno neograničen
(`PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE`, §20.2b) postaje ograničen
tenant politikom, **jedan membership po jedan**.

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
- ovo nije tenant RLS i nije u koliziji sa §18.2 (D-023, klauzula 12);
- politika zavisi **isključivo** od `app.user_id`; **ne koristi** `app.practice_id`,
  `set_request_context`, `PracticeContextGuard` ni `TenantDatabaseService`, pa radi već u fazi 3;
- `PUBLIC` nema nijedan pristup.

**Vlasništvo paketa:** `002_identity_and_practices`, **faza 3** (D-051, klauzula 1).
**Premješteno iz paketa `013_rls_policies`/faze 4**; imena i tijela obje politike ostaju
**identična**, a `copilot_system` zadržava prihvaćeno `SELECT` + `USING (true)` ponašanje.
**Paket `013` ove objekte ne smije rekreirati, zamijeniti ni prepisati** (§22.13).

Pošto tabela nosi `FORCE RLS` već u fazi 3, a faza 3 je i seeduje (§23.2), tabela je na
allowlisti maintenance protokola iz §23.4 (D-048).

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

**Vlasništvo paketa:** `013_rls_policies`, **faza 4** (D-047 klauzula 16; D-051, klauzula 5).
**Ovaj obrazac se ne premješta u fazu 3.** Posljedica je opisana u §20.2 i D-047, klauzuli 18:
u fazi 3 `copilot_app` na nivou baze vidi generičke membership redove. To je zatečeno,
dokumentovano međustanje koje faza 4 zatvara.

Pošto tabela **nema** `FORCE RLS` u fazi 3, ona **nije** na allowlisti maintenance protokola iz
§23.4 i taj joj prozor nije potreban (D-048, klauzula 5).

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

**Politika ne zahtijeva §17.3 RLS da bi radila** (D-051, klauzula 4). `EXISTS` podupit se oslanja
na **postojanje** vlasničkog `practice_memberships` reda i na uslov `pm.user_id = app.user_id`, a
ne na to da li `practice_memberships` već nosi vlastitu politiku. Podupirući `SELECT` grant nad
`practice_memberships` ostaje **obavezan** — ista dokazana asimetrija iz §17.6 i D-047, klauzule 7.

**Vlasništvo paketa:** `002_identity_and_practices`, **faza 3** (D-051, klauzula 1).
**Premješteno iz paketa `013_rls_policies`/faze 4**; ime i tijelo politike ostaju **identični**.
**Paket `013` ovaj objekat ne smije rekreirati, zamijeniti ni prepisati** (§22.13).

Pošto tabela nosi `FORCE RLS` već u fazi 3, a faza 3 je i seeduje (§23.2), tabela je na
allowlisti maintenance protokola iz §23.4 (D-048).

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

**Ova matrica opisuje v1 KRAJNJE stanje, a ne stanje bilo koje pojedine faze.** Sposobnost raste
po fazi i **grant se nikada ne izdaje prije svog konzumenta** (D-049; D-062, Dio I.3). Tačna,
uža runtime površina **Faze 5** za pet PHI tabela objavljena je u **§29.5** i **nije** ovaj skup:
`patient_references` i `encounter_diagnoses` u Fazi 5 **ne dobijaju `UPDATE`**, `storage_objects`
**ne dobija nijedan grant**, a `encounters` i `encounter_documents` dobijaju **column-level**
`UPDATE`. Čitati §18.1 kao obuhvat Faze 5 bilo bi grant creep.

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
`UPDATE` je dozvoljen jer `PATCH /practices/{practiceId}/settings` postoji; concurrency se štiti
`version` kolonom i `If-Match` (D-029).

**Obje površine su column-level i prebrojane (D-053).** `S` i `U` u redu `practice_settings`
znače **tačno devet** kolona za `SELECT` i **tačno devet** kolona za `UPDATE`, imenovanih u
§20.2b. **Nema table-level `SELECT` ni table-level `UPDATE`.** Runtime privilegija
`UPDATE (version)` je prihvaćena kao **minimalan mehanizam** koji atomičan inkrement iz `03` §5.2
zahtijeva; **triger, `SECURITY DEFINER` i privilegovana helper funkcija se ne uvode** (D-053,
klauzula B.5).

**Vlasništvo faze (D-049).** Cijeli red `practice_settings` u ovoj matrici — `ENABLE` +
`FORCE RLS`, tenant politika i `UPDATE` — pripada **fazi 4** i paketu `013_rls_policies`. **Grant
i politika koja ograničava write sposobnost uvode se zajedno**; `UPDATE` grant bez pripadajuće
tenant politike je zabranjen. U **fazi 3** tabela ima isključivo trokolonski `SELECT` iz §20.2b i
**nijedan** upis, a nijedna settings ruta nije registrovana.

`review_decision_change_links` je **obična tenant tabela** (D-046) i koristi **standardni
tenant predikat** `practice_id = app.practice_id` iz §17.1, sa `ENABLE` **i**
`FORCE ROW LEVEL SECURITY`. `copilot_app` dobija `SELECT` i `INSERT`; `UPDATE` i `DELETE` su
odbijeni, u skladu sa append-only životnim ciklusom iz §13.2a. **Nijedan bootstrap izuzetak
se ne primjenjuje** — za razliku od §17.3 i §17.4, tenant kontekst mora već biti uspostavljen
prije čitanja, pa nema pre-context pristupa. `copilot_system` **nema nijedan grant** jer je
tabela tenant tabela (D-023), a `PUBLIC` nema nijedan. **D-023 razdvajanje database rola
ostaje nepromijenjeno**; runtime administracija aplikacijskih rola se ovdje ne definiše.

**Vlasništvo faze (D-052).** Cijeli red `review_decision_change_links` u ovoj matrici pripada
paketu `013_rls_policies`, ali se **izvršava u fazi 10**, neposredno nakon što paket
`009_review_approvals` kreira tabelu (§17.0, §22.9, §22.13). **U fazi 4 tabela ne postoji**, pa
faza 4 nad njom ne izvršava `ENABLE`, `FORCE`, politiku ni grant. Gore navedena semantika je
**konačna i nepromijenjena** — odgođena je isključivo tačka izvršenja.

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
User-scoped RLS nije tenant RLS i nije u koliziji sa §18.3 (D-023, klauzula 12). Njena RLS
pripada paketu `002_identity_and_practices` i **fazi 3** (D-051; §17.0, §17.2).

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

Grantovi su **table-level** tamo gdje §20.2 i §20.4 zahtijevaju tačno taj skup privilegija; D-051
ih **ne mijenja** — premješta isključivo vlasništvo paketa za RLS objekte (§17.0).

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

## 20.2b `practice_settings`

**Normativna odluka: D-049, klauzule 1–4.**

U **fazi 3** `copilot_app` dobija **isključivo trokolonski column-level `SELECT`**:

```sql
revoke all on practice_settings from public;

grant select (practice_id, allow_mpa_approval, allow_billing_specialist_approval)
  on practice_settings to copilot_app;
```

| Tabela | `copilot_migrator` | `copilot_app` (faza 3) | `copilot_system` | `PUBLIC` |
|---|---|---|---|---|
| practice_settings | owner, kreira kroz migraciju `002` | column-level SELECT — tačno tri kolone | — | — |

Ta površina je **potrebna i dovoljna** za izračun uslovnih permisija `analysis.approve` i
`analysis.approval.revoke` u `GET /me` faze 3 (D-041, D-044; `03` §10).

**Nema table-level `SELECT`.** `copilot_app` **ne dobija** pristup kolonama `id`, `version`,
`updated_at`, `updated_by`, `configuration`, `retention_policy_code`, `billing_review_required`,
`require_reason_for_manual_change`, `ai_enabled` ni `axenita_export_enabled`.

Pravila:

- **nema `INSERT`, `UPDATE` ni `DELETE`** za nijednu runtime rolu u fazi 3;
- `copilot_system` **nema nijedan grant** — tabela je tenant tabela (D-023);
- `PUBLIC` nema nijedan grant;
- owner ostaje `copilot_migrator` (§3.5);
- nedozvoljena kolona pada sa `42501` **i kada se koristi samo u predikatu ili u `ORDER BY`**;
- proširenje ove površine na **tačno devet** kolona i **devetokolonski** `UPDATE` grant pripadaju
  **fazi 4** i paketu `013_rls_policies`, i uvode se **zajedno** sa tenant RLS politikom
  (§18.1, §20.2b.1; D-053).

**`PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE`** (D-049, klauzula 3).
Pošto `practice_settings` u fazi 3 još nema RLS iz §22.13, držalac dijeljenog `copilot_app`
credentiala može enumerisati `practice_id`, `allow_mpa_approval` i
`allow_billing_specialist_approval` **za svaki** red te tabele, te utvrditi broj redova i
postojanje reda. **To je stvarna izloženost sigurnosne konfiguracije i ne umanjuje se.** Prihvaćena
je **isključivo** za nepilotsko međustanje faze 3, pod istim uslovima kao izloženost iz D-047,
klauzule 18: na tom gateu ne postoje stvarni pilot korisnici ni podaci, a faza 4 je obavezna prije
faze 5. Faza 4 je zatvara `ENABLE` + `FORCE RLS` i tenant politikom.

### 20.2b.1 Runtime površina faze 4 — tačno devet `SELECT` i devet `UPDATE` kolona

**Normativna odluka: D-053, dijelovi A i B.** Ovaj odjeljak **zamjenjuje** raniju neodređenu
formulaciju „proširena čitljiva površina koju settings endpoint zahtijeva" (D-049, klauzula 5).
Obje površine su **column-level i prebrojane**, uvode se **zajedno** sa tenant politikom, u paketu
`013_rls_policies`.

```sql
grant select (
  practice_id,
  billing_review_required,
  allow_mpa_approval,
  allow_billing_specialist_approval,
  require_reason_for_manual_change,
  ai_enabled,
  axenita_export_enabled,
  retention_policy_code,
  version
) on practice_settings to copilot_app;

grant update (
  billing_review_required,
  allow_mpa_approval,
  allow_billing_specialist_approval,
  require_reason_for_manual_change,
  ai_enabled,
  axenita_export_enabled,
  retention_policy_code,
  version,
  updated_at
) on practice_settings to copilot_app;
```

| Tabela | `copilot_migrator` | `copilot_app` (faza 4) | `copilot_system` | `PUBLIC` |
|---|---|---|---|---|
| practice_settings | owner | column-level SELECT — **tačno devet** kolona; column-level UPDATE — **tačno devet** kolona | — | — |

**`SELECT` — osam kolona nosi reprezentaciju `03` §10, deveta (`version`) nosi `ETag`.**

**`UPDATE` — sedam poslovnih postavki, plus `version` i `updated_at` kao concurrency/maintenance
metadata.**

Kolone koje ostaju **nečitljive** za `copilot_app`:

```text
id            (ako postoji u kanonskoj schemi)
configuration
updated_at
updated_by
```

Kolone koje ostaju **bez `UPDATE`-a** za `copilot_app`:

```text
practice_id
id            (ako postoji u kanonskoj schemi)
configuration
updated_by
```

Pravila:

- **nema table-level `SELECT` i nema table-level `UPDATE`**;
- **nijedna druga kolona** nije obuhvaćena nijednom od dvije liste; interna metadata se **ne izlaže
  samo zato što postoji u tabeli**;
- **nema `INSERT` i nema `DELETE`** za runtime role ni u fazi 4 — settings red kreira pouzdani seed
  put (§23.4), ne request putanja;
- `copilot_system` **nema nijedan grant**; `PUBLIC` nema nijedan grant; owner ostaje
  `copilot_migrator`;
- nedozvoljena kolona pada sa `42501` **i kada se koristi samo u predikatu ili u `ORDER BY`**;
- **`UPDATE` grant bez pripadajuće tenant politike je zabranjen i obara phase gate** (D-049,
  klauzula 5, nepromijenjeno);
- **`updated_by` ostaje netaknut** — settings endpoint ga ne piše i on **nije autoritativno audit
  polje**; akterstvo ostaje u kanonskom audit modelu, **bez novog trigera** i bez izmjene paketa
  `014_immutability_triggers` (D-053, klauzula B.3);
- `updated_at` postavlja **baza** pri `UPDATE`-u; API pozivalac ga **nikada** ne šalje;
- `version` API pozivalac **nikada** ne šalje — očekivana verzija dolazi isključivo iz `If-Match`
  (`03` §5.2).

**Odnos prema fazi 3 (D-053, klauzula A.5).** Trokolonska površina iznad — `practice_id`,
`allow_mpa_approval`, `allow_billing_specialist_approval` — je **strogi podskup** ove
devetokolonske `SELECT` liste. Faza 4 je **proširuje**; **nijedan grant faze 3 se ne opoziva**, pa
se uslovni read `GET /me` ne lomi na nivou privilegija. Ono što se za `GET /me` mijenja je **RLS**,
a ne grant — vidi §17.1a.

### 20.2b.2 `GET /me` uslovni read pod tenant RLS-om faze 4

**Normativna odluka: D-053, dio D.** Vidi §17.1a. Tenant politika iz §17.1 se **ne slabi**;
adaptira se **isključivo aplikacijski put**.

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

Dodatno, prema **D-049** (`practice_settings`, faza 3):

- `copilot_app` `SELECT (practice_id, allow_mpa_approval, allow_billing_specialist_approval)`
  **prolazi**;
- `copilot_app` `SELECT *` nad `practice_settings` pada sa `42501`;
- `copilot_app` `SELECT` nad `id`, `version`, `updated_at`, `updated_by`, `configuration`,
  `retention_policy_code`, `billing_review_required`, `require_reason_for_manual_change`,
  `ai_enabled` ili `axenita_export_enabled` pada sa `42501`;
- nedozvoljena kolona pada sa `42501` **i kada se koristi isključivo u `WHERE` predikatu**;
- nedozvoljena kolona pada sa `42501` **i kada se koristi isključivo u `ORDER BY`**;
- `copilot_app` INSERT/UPDATE/DELETE nad `practice_settings` pada sa `42501`;
- `copilot_system` bilo koji pristup `practice_settings` pada;
- `PUBLIC` nema nijedan grant nad `practice_settings`.

Dodatno, prema **D-053** (`practice_settings`, faza 4; §20.2b.1):

- `copilot_app` `SELECT` nad **tačno devet** dozvoljenih kolona **prolazi**;
- `copilot_app` `SELECT *` nad `practice_settings` i dalje pada sa `42501`;
- `copilot_app` `SELECT` nad `id`, `configuration`, `updated_at` ili `updated_by` pada sa `42501`,
  **i kada se kolona koristi isključivo u `WHERE` ili u `ORDER BY`**;
- `copilot_app` `UPDATE` nad **tačno devet** dozvoljenih kolona **prolazi**;
- `copilot_app` `UPDATE` nad `practice_id`, `id`, `configuration` ili `updated_by` pada sa `42501`;
- `copilot_app` `INSERT` i `DELETE` nad `practice_settings` i dalje padaju sa `42501`;
- `copilot_system` bilo koji pristup i dalje pada; `PUBLIC` i dalje nema nijedan grant;
- `UPDATE` grant **bez** pripadajuće tenant politike **obara phase gate**.

Dodatno, prema **D-051** (§17.2 i §17.4 u fazi 3):

- nakon paketa `002`, `platform_role_assignments` ima `relrowsecurity = true` i
  `relforcerowsecurity = true`;
- nakon paketa `002`, `practice_membership_roles` ima `relrowsecurity = true` i
  `relforcerowsecurity = true`;
- politika §17.4 vraća vlastite dodjele **i prije** nego `practice_memberships` dobije §17.3 RLS;
- ukidanje `SELECT` granta nad `practice_memberships` obara politiku §17.4 sa `42501`;
- paket `013_rls_policies` **ne sadrži nijedan** `CREATE POLICY` ni `ENABLE`/`FORCE ROW LEVEL
  SECURITY` za `platform_role_assignments` i `practice_membership_roles`;
- `platformRoles[]` u `GET /me` sadrži isključivo redove sa `revoked_at IS NULL`.

Dodatno, prema **D-048** (steady-state `FORCE RLS`, §23.4):

- za **svaku** tabelu sa allowliste faze 3 — `users`, `practices`, `practice_membership_roles`,
  `platform_role_assignments` — vrijedi `relrowsecurity = true` **i** `relforcerowsecurity = true`
  nakon migracije **i** nakon seeda;
- prekinut ili neuspio seed **ne ostavlja** nijednu od te četiri tabele sa
  `relforcerowsecurity = false`;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` se **ne pojavljuje** ni u jednoj forward migraciji
  ni seed skripti (rollback iz §23.4.5 je izuzet);
- tabela koja **nije** na allowlisti ne prolazi verifikaciju maintenance prozora;
- maintenance mehanizam **nije dohvatljiv** iz runtime aplikacijskog koda.

---

# 21. Indeksi

Obavezni minimalni indeks katalog:

```sql
create index encounters_review_queue_idx
on encounters(practice_id, status, treatment_date desc, id desc);

create index encounters_patient_timeline_idx
on encounters(practice_id, patient_reference_id, treatment_date desc, id desc);

-- D-062, Dio J (OD-P5-D2-13): katalog je pomiren sa §7.2. Ovaj indeks je ranije
-- postojao samo u §7.2 i NE uklanja se — filter responsiblePhysicianId je kanonski
-- i eksplicitno očuvan D-061, klauzulom 10, pa indeks nije spekulativan.
create index encounters_responsible_physician_idx
on encounters(practice_id, responsible_physician_id, treatment_date desc, id desc);

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

**D-051 u istom paketu — ne uvodi se novi broj paketa:**

- `ENABLE` + `FORCE ROW LEVEL SECURITY` nad `platform_role_assignments`;
- politike `platform_role_assignments_self_select` i `platform_role_assignments_system_select`
  (§17.2);
- `ENABLE` + `FORCE ROW LEVEL SECURITY` nad `practice_membership_roles`;
- politika `practice_membership_roles_self_select` (§17.4).

Sva četiri artefakta su **premještena iz paketa `013_rls_policies`**. Premješta se **isključivo
vlasništvo paketa**; imena politika, tijela politika i prihvaćeni grantovi ostaju **identični**
(D-051, klauzule 1–4). **Paket `002` je njihov konačni vlasnik** (§17.0).

**D-049 u istom paketu — ne uvodi se novi broj paketa:**

- `practice_settings` zadržava **kompletnu** prihvaćenu schemu (§6.4);
- `copilot_app` dobija **isključivo** `SELECT (practice_id, allow_mpa_approval,
  allow_billing_specialist_approval)` uz `REVOKE ALL ... FROM PUBLIC` (§20.2b);
- **nijedan** `INSERT`, `UPDATE` ni `DELETE` grant; **nijedna** RLS politika nad
  `practice_settings` u ovom paketu — one pripadaju paketu `013` (§22.13).

**D-048 u istom paketu — ne uvodi se novi broj paketa:** seed/migration DML nad tabelama koje već
nose `FORCE RLS` izvršava se isključivo kroz maintenance protokol iz §23.4, nad allowlistom faze 3:
`users`, `practices`, `practice_membership_roles`, `platform_role_assignments`.

Redoslijed unutar paketa: tabele → grantovi → `ENABLE`/`FORCE RLS` → politike → funkcije →
(pri seedu) maintenance prozor iz §23.4. Politika `practices_membership_select` se kreira **nakon**
`practice_memberships`, jer je referencira i zavisi od granta nad njom (§17.6, §20.2a). Politika
`practice_membership_roles_self_select` se iz istog razloga kreira **nakon** `practice_memberships`
i njegovog `SELECT` granta (§17.4).

`set_request_context` **ostaje** u paketu `013_rls_policies` i u fazi 4 (§22.13). **§17.3 se ne
premješta** u ovaj paket, niti se u njega premješta RLS nad `practice_settings`.

Projekat nema produkcijske podatke, pa produkcijska backfill procedura nije potrebna.

Migration SQL ovog paketa se autoriše prema kanonskom toku iz **D-050** — `prisma migrate diff`
kao kandidat, ručna dopuna custom SQL-a, ljudski pregled, validacija na jednokratnoj praznoj bazi,
primjena kroz `prisma migrate deploy` i mehanička verifikacija (§26.2).

## 22.3 `003_patient_encounter_documents`

`patient_references`, `encounters`, `encounter_diagnoses`, `storage_objects`,
`encounter_documents`, uključujući `_iv` i `_auth_tag` kolone, row-level `encryption_*`
kolone i sve CHECK constrainte iz §2.7.5 (D-025); `unique (practice_id, id)` na
`encounter_documents`.

**Dopuna po D-062 (`OD-P5-D2-1`, `OD-P5-D2-2`, `OD-P5-D2-3`, `OD-P5-D2-6`, `OD-P5-D2-13`).**
Potpun obuhvat paketa objavljen je u §29. Sažeto, ovaj paket je **prvi kreator** i za:

- **pet enuma** koje raniji tekst ovog odjeljka nije imenovao: `integration_provider`,
  `encounter_status`, `review_state`, `document_type`, `document_source` (vrijednosti su zamrznute
  u §4.3–§4.8; fizička imena prate precedent §2.1 + §22.2). Njihov raniji izostanak bio je
  **dokumentaciona nepotpunost**, ne otvoreno dizajnersko pitanje;
- **osam FK-ova Faze 5**, svaki sa **eksplicitnim** `on delete no action on update no action`
  (§29.2) — četiri kanonski deklarisana i **četiri novodeklarisana** D-062, Dio C;
- **tri nova `CHECK` constrainta** nad statusnim rječnicima dokumenta (§2.11.4);
- **četiri ne-unique indeksa** iz §29.6, uključujući `encounters_responsible_physician_idx`.

**Ovaj paket ne izdaje nijedan `GRANT` i ne uvodi nijedan RLS objekat.** To je normativno: tabela
koju kreira dosežna je **nijednoj** runtime roli sve dok je Faza-5 slice paketa `013` ne dodijeli
zajedno sa politikom, u istoj transakciji (D-049, klauzula 5). Prozor između migracija time **ne
sadrži nikakvu sposobnost**.

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
**D-030 constraint `unique nulls not distinct (...)` kao ručno dopunjen custom migration SQL u
migration fajlu paketa** (D-050, §26.3). Prisma ga ne izražava i može ga prijavljivati kao drift.

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

**Redoslijed unutar faze 10 (D-052, klauzula A.5).** Ovaj paket je **jedini** koji kreira
`review_decision_change_links`, i to u **fazi 10**. Odgođeni RLS slice paketa `013_rls_policies`
izvršava se **neposredno nakon** ovog paketa, u istoj fazi. Faza 4 nad tom tabelom **ne izvršava
nijedan objekat** jer tabela tada ne postoji.

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

**Faza-5 slice (D-062, `OD-P5-D2-1`).** Svaka komandna ruta Faze 5 zahtijeva idempotency i audit,
pa ovaj paket dobija **Faza-5 slice koji kreira isključivo `idempotency_keys` i `audit_events`**.
**`outbox_events` i `async_jobs` se u Fazi 5 ne kreiraju** — nemaju konzumenta Faze 5. Paket
zadržava vlasništvo nad sve četiri tabele; odgađa se isključivo tačka izvršenja, po precedentu
D-052. **Nijedan novi broj paketa se ne uvodi i nijedan se ne renumeriše.**

## 22.12 `012_constraints_indexes`

Verifikuje da svih 30 tenant tabela u obuhvatu nosi `unique (practice_id, id)` prema §2.5;
kreira indeks katalog iz §21, uključujući `platform_role_assignments_user_idx`.

## 22.13 `013_rls_policies`

Tenant politike prema §17.1 i §18.1 — **svih 30 tenant tabela** iz matrice §18.1, ali **izvršene
tek nad tabelom koja u datoj fazi postoji** (§17.0; D-052, klauzula A.5);
**`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` i standardna tenant politika
`practice_id = app.practice_id` za `review_decision_change_links`** (§13.2a, §18.1, D-046) —
**odgođeni slice, izvršava se u fazi 10** nakon paketa `009_review_approvals` (§22.9);
**bootstrap-safe user-scoped SELECT politika za `practice_memberships`** (§17.3);
**`ENABLE` + `FORCE ROW LEVEL SECURITY`, tenant politika, devetokolonski `SELECT` i devetokolonski
`UPDATE` za `practice_settings`** (§6.4, §18.1, §20.2b.1, D-049 klauzula 5; D-053, dijelovi A i B);
SECURITY INVOKER `app_security.set_request_context` (§16.2.3);
**globalne tarifne tabele i `system_storage_objects` ne dobijaju tenant RLS** (§18.3).

**Izmjena po D-047 (klauzula 17):** `app_security.set_user_context` **više nije u ovom paketu** —
premješten je u `002_identity_and_practices`, jer ga faza 3 već zahtijeva. Premještena je
isključivo pripadnost paketu; sigurnosna semantika D-033 se ne mijenja. `set_request_context`
ostaje ovdje.

**Izmjena po D-051 (klauzule 1 i 6):** **user-scoped RLS za `platform_role_assignments` (§17.2) i
bootstrap-readable RLS za `practice_membership_roles` (§17.4) više nisu u ovom paketu** —
premješteni su u `002_identity_and_practices` i fazu 3. **Ovaj paket ih ne smije rekreirati,
zamijeniti ni prepisati**, i ne sadrži nijedan `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY` ni
`FORCE ROW LEVEL SECURITY` za te dvije tabele. Premještena je isključivo pripadnost paketu; imena
i tijela politika ostaju identična.

**Izmjena po D-052 (klauzule A.1–A.9): odgođeni slice `review_decision_change_links`.** Tabelu
kreira paket `009_review_approvals` u **fazi 10** (§22.9). Ovaj paket **zadržava vlasništvo** njenog
RLS-a i grantova, ali se taj slice **izvršava u fazi 10**, neposredno nakon paketa `009`.

**Faza 4 nad `review_decision_change_links` ne izvršava ništa** — ne kreira tabelu, ne izvršava
`ENABLE`, `FORCE`, politiku ni ijedan grant, i ne smije je referencirati kao postojeću. Sigurnosna
semantika iz §13.2a, §18.1 i D-046, klauzula 25–33, **ostaje doslovno nepromijenjena**; odgođena je
isključivo tačka izvršenja. **Nijedan novi broj paketa se ne uvodi i nijedan se ne renumeriše.**

**Ovaj paket ne dira `users` ni `practices`.** Njihove politike i grantovi su konačni već u paketu
`002` (§17.5, §17.6, §20.2a) i ovdje se **ne prepisuju**. Faza 4 samo počinje postavljati
`app.practice_id`, čime se RESTRICTIVE politika iz §17.6 aktivira automatski.

**`practice_settings` write sposobnost.** Devetokolonski `UPDATE` grant (§20.2b.1) i tenant RLS
politika koja ga ograničava uvode se **zajedno, u ovom paketu** (D-049, klauzula 5). `UPDATE` grant
bez pripadajuće politike je zabranjen. Tabela pri tome prvi put dobija `FORCE RLS`, pa od tada
podliježe i maintenance protokolu iz §23.4.

**Tačne površine (D-053, dijelovi A i B).** Ovaj paket dodjeljuje **tačno devet** `SELECT` i
**tačno devet** `UPDATE` kolona iz §20.2b.1 — **nikada table-level**. `configuration`, `updated_by`
i `id` ostaju nečitljivi; `practice_id`, `id`, `configuration` i `updated_by` ostaju bez
`UPDATE`-a. **Nijedan triger, `SECURITY DEFINER` ni privilegovana helper funkcija se ne uvodi**, i
paket `014_immutability_triggers` se **ne dira**.

**`GET /me` nakon ove politike (D-053, dio D).** Uvođenje tenant politike nad `practice_settings`
mijenja rezultat uslovnog reada neutralne rute `GET /me`. Politika se **ne slabi**; adaptira se
aplikacijski put prema §17.1a. Ovaj paket **ne uvodi** nijedan izuzetak, bootstrap granu ni
`X-Practice-ID` zahtjev na `/me`. Pouzdani seed put je stvarno popunjava, pa zajedno sa
`practice_memberships` (§17.3) ulazi na **allowlistu faze 4** iz §23.4.4a (D-052, dio B).
Proširenje allowliste je **eksplicitna klauzula ovog paketa** — tiho proširenje je zabranjeno.

**Faza-5 slice (D-062, Dio I).** Ovaj paket dobija Faza-5 slice nad **pet** tabela koje kreira
paket `003`. Interni redoslijed je onaj ovog paketa, doslovno: **grantovi → `ENABLE` + `FORCE
ROW LEVEL SECURITY` → politike**, sve u **jednoj transakciji**. Slice uvodi **osam** politika i
tačne grantove iz §29.4 i §29.5.

**`storage_objects` dobija `ENABLE` + `FORCE ROW LEVEL SECURITY`, ali nijednu politiku i nijedan
grant** — nijedna ruta Faze 5 je ne čita ni ne piše (upload putanja je `DEFERRED`). Default deny,
dokazivo nedosežna.

**Nijedna politika Faze 5 ne sadrži podupit**, i **nijedna ne referencira `users` ni
`practice_memberships`**. Ovaj slice **ne dira** `users`, `practices`, `practice_memberships`,
`practice_membership_roles` ni `practice_settings` — njihove politike i grantovi ostaju
**bajt-identični** stanju Faze 4 (D-061, klauzula 11 i E.3).

**Allowlista iz §23.4 se ovim slice-om NE proširuje** (`OD-P5-D2-14`) — nijedna PHI tabela Faze 5
se ne seeda, pa nijedna `§23.4.4b` klauzula ne postoji.

## 22.14 `014_immutability_triggers`

Approval guard iz §19.1 i audit guard iz §19.2;
**`app_security.reject_aad_bound_column_change()` i pet imenovanih AAD triggera** iz §19.3
(D-025, klauzula 12);
**`app_security.reject_analysis_revision_identity_change()` i trigger
`analysis_runs_revision_immutable_trg`** iz §19.4 (D-034, klauzula 7).

**Faza-5 slice (D-062, `OD-P5-D2-1`).** `encounter_documents` nosi ciphertext **od Faze 5**, pa se
AAD sprovođenje **ne smije** čekati do Faze 7. Faza 5 izvršava dijeljenu funkciju
`app_security.reject_aad_bound_column_change()` i **tri** od pet imenovanih trigera iz §19.3 —
`patient_references`, `encounters`, `encounter_documents`. **Preostala dva slijede u vlastitim
fazama**, primjenom precedenta D-052 u **ranijem** smjeru. Vlasništvo paketa se ne mijenja;
mijenja se isključivo tačka izvršenja. Dodatnu barijeru daje uskraćeni column-level `UPDATE` nad
`id` i `practice_id` (§29.5).

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

**`FORCE RLS` maintenance (D-048).** Seed faze 3 upisuje u tabele koje već nose `FORCE ROW LEVEL
SECURITY` — `users`, `practices`, `practice_membership_roles` i `platform_role_assignments`. Svaki
takav upis se izvršava **isključivo** kroz protokol iz §23.4, unutar jedne eksplicitne transakcije,
sa asercijama prije i poslije. `practice_memberships` i `practice_settings` u fazi 3 nemaju
`FORCE RLS`, pa im prozor nije potreban i **nisu** na allowlisti faze 3. Od faze 4 obje dobijaju
`FORCE RLS` i **ulaze na allowlistu faze 4** (§23.4.4a, D-052, dio B).

## 23.3 Production seed

Production seed ne kreira demo medicinske podatke, ne kreira `SYSTEM_ADMIN` dodjelu i ne
kreira demo integration konekcije.

## 23.4 Maintenance protokol za `FORCE RLS` tabele

**Normativna odluka: D-048.** Ovaj odjeljak definiše **jedini** dozvoljeni način na koji pouzdani
migration/seed put upisuje redove u tabelu koja već nosi `FORCE ROW LEVEL SECURITY`.

### 23.4.1 Problem

Pod `FORCE ROW LEVEL SECURITY` i **vlasnik tabele** `copilot_migrator` podliježe politikama.
Nijedna prihvaćena politika ne dozvoljava owner-write, pa pouzdani seed DML pada — iako je riječ o
migracijskom, a ne runtime putu.

### 23.4.2 Trajno odbijene alternative

**Nijedna se ne uvodi ni u kojem obliku:**

```text
BYPASSRLS na bilo kojoj roli
SECURITY DEFINER seed/migration funkcija
superuser seed credential
trajna copilot_migrator RLS politika
globalno isključivanje RLS-a
```

### 23.4.3 Obavezni protokol

Jedna **eksplicitna** transakcija, u vlasništvu i izvršenju pouzdanog `copilot_migrator`
maintenance puta:

```sql
begin;

  -- 1. ciljna tabela mora biti eksplicitno na allowlisti iz §23.4.4 (faza 3)
  --    ili §23.4.4a (faza 4)

  -- 2. otvaranje prozora
  alter table <table> no force row level security;

  -- 3. asercija stanja prozora
  --    relrowsecurity = true, relforcerowsecurity = false
  --    odstupanje -> raise -> abort

  -- 4. isključivo pouzdani seed/migration DML

  -- 5. zatvaranje prozora
  alter table <table> force row level security;

  -- 6. asercija prije COMMIT-a
  --    relrowsecurity = true, relforcerowsecurity = true
  --    odstupanje -> raise -> abort

commit;
```

Asercije se izvode iz `pg_class.relrowsecurity` i `pg_class.relforcerowsecurity`.

### 23.4.4 Allowlist faze 3

```text
users
practices
practice_membership_roles
platform_role_assignments
```

**Ne ulaze** u allowlist faze 3:

```text
practice_memberships
practice_settings
```

Obje dobijaju `FORCE RLS` tek u paketu `013_rls_policies` (§17.3, §22.13), pa u fazi 3 nemaju
maintenance prozor jer im on nije potreban.

Svako proširenje allowliste zahtijeva **eksplicitnu prihvaćenu odluku** ili **eksplicitnu klauzulu
u paketu koji za tu tabelu uvodi `FORCE RLS`**. Tiho proširenje je zabranjeno.

### 23.4.4a Allowlist faze 4

**Normativna odluka: D-052, dio B.** Ovo je eksplicitna prihvaćena odluka koju §23.4.4 zahtijeva.
**Tiho proširenje ostaje zabranjeno** i obara phase gate (`08` §26.2).

Kada paket `013_rls_policies` uvede `FORCE ROW LEVEL SECURITY` za `practice_memberships` i
`practice_settings` (§17.3, §22.13; D-049, klauzula 5), allowlist se **proširuje tačno onim tabelama
faze 4 u koje pouzdani seed put stvarno upisuje**. Pouzdani seed put upisuje u obje, pa allowlist
faze 4 sadrži **tačno dvije** tabele:

```text
practice_memberships
practice_settings
```

Allowlist faze 3 iz §23.4.4 ostaje **nepromijenjena** — faza 4 je **proširuje**, ne zamjenjuje.
Ukupna allowlist nakon faze 4 sadrži **tačno šest** tabela.

Obavezni uslovi proširenja (D-052, klauzula B.3):

- proširenje je **eksplicitno**, nikada tiho;
- `FORCE RLS` se **obnavlja nakon seeda**;
- **putevi neuspjeha i rollbacka obnavljaju `FORCE RLS`**;
- **bez `BYPASSRLS`**;
- **bez `SECURITY DEFINER` zaobilaznice**;
- **bez superuser runtime puta**;
- **bez `DISABLE ROW LEVEL SECURITY`** (rollback izuzet, §23.4.5);
- **bez trajne owner-write politike**;
- testovi dokazuju steady-state `ENABLE` **i** `FORCE` **prije i nakon** seeda (`08` §21.8).

Protokol iz §23.4.3 i normativna pravila iz §23.4.5 primjenjuju se **nepromijenjeni**. Proširenje
se izvršava **u paketu `013_rls_policies`**, u istoj migraciji koja tim tabelama uvodi `FORCE RLS`.

**Ovaj odjeljak evidentira ovlaštenje, ne implementaciju.** Do implementacijskog gatea faze 4
allowlist u kodu ostaje allowlist faze 3.

### 23.4.4b Faza 5 — allowlist se NE proširuje

**Normativna odluka: D-062, Dio K (`OD-P5-D2-14`).**

**Nijedna PHI tabela Faze 5 se ne seeda.** Pouzdani DML **nikada** ne dodiruje
`patient_references`, `encounters`, `encounter_diagnoses`, `storage_objects` ni
`encounter_documents`.

**Ukupna allowlist nakon Faze 5 ostaje na tačno šest tabela** — identična §23.4.4a. Ovaj odjeljak
**nije** klauzula proširenja: on evidentira da proširenje **nije zatraženo i nije dozvoljeno**, pa
Faza-5 slice paketa `013_rls_policies` ne sadrži nijednu klauzulu proširenja allowliste.

§23.2 demo encounter označava **opcionim**. Odricanje od njega ne košta ništa i **trajno drži
maintenance prozor dalje od medicinskih podataka** — za Fazu 5 i za svaku kasniju fazu. Ako se demo
encounter poželi, kreira se **kroz autentifikovani API** u razvojnoj skripti, čime se ruta dokazuje
umjesto da se zaobilazi.

**Tiho proširenje ostaje zabranjeno i obara phase gate** (§23.4.4, `08` §26.2).

### 23.4.5 Normativna pravila

- autocommit je **zabranjen** — protokol je jedna eksplicitna transakcija;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` je **zabranjen**;
- RLS ostaje **`ENABLED` kroz cijeli prozor**; mijenja se isključivo `FORCE` atribut;
- `BYPASSRLS`, `SECURITY DEFINER`, superuser seed credential i trajna migrator politika su
  zabranjeni (§23.4.2);
- **nepovezani sigurnosni DDL unutar prozora je zabranjen** — prozor sadrži isključivo dva
  `ALTER TABLE`-a, asercije i pouzdani DML;
- neuspjela restore asercija **mora podići izuzetak i prekinuti transakciju**;
- rollback **nikada** ne smije ostaviti `FORCE` isključenim;
- steady-state `relrowsecurity = true` i `relforcerowsecurity = true` su **trajni regresijski
  testovi**, ne jednokratna provjera (§20.4, §25.1.2);
- mehanizam je **isključivo maintenance** i **nikada** ne smije biti dohvatljiv iz request/runtime
  aplikacijskih putanja.

**Obuhvat zabrane `DISABLE ROW LEVEL SECURITY`.** Zabrana važi za **forward migracije, seed i
maintenance prozor** — svako mjesto gdje bi se koristila kao zamjena za `NO FORCE`. Ne odnosi se na
**eksplicitno dokumentovan rollback** koji u cijelosti uklanja RLS zajedno sa politikama tog paketa
(D-047 `Migration/rollout`, D-051 `Migration/rollout`); tamo je uklanjanje RLS-a namjeravana
posljedica poništavanja migracije, a ne prozor za upis.

### 23.4.6 Odnos prema D-047

D-048 **dopunjuje** D-047, klauzulu 15, definisanjem pouzdanog seed/migration mehanizma.
**Steady-state runtime threat model D-047 se ne mijenja i ne slabi**: nijedna runtime rola ne
dobija novi grant, politiku ni privilegiju, a prozor postoji isključivo na migration credentialu,
izvan request putanje.

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

### 25.1.2 Steady-state `FORCE RLS` i maintenance prozor (D-048)

Nivo: integration nad stvarnim PostgreSQL-om. Normativno: §23.4. Puni ugovor je u `08` §21.6.

Steady state — provjerava se **nakon migracije i nakon seeda**, za sve četiri tabele sa allowliste
faze 3 (`users`, `practices`, `practice_membership_roles`, `platform_role_assignments`):

- `relrowsecurity = true`;
- `relforcerowsecurity = true`.

Maintenance prozor:

- protokol se izvršava u **jednoj eksplicitnoj transakciji**; autocommit varijanta je odbijena;
- unutar prozora vrijedi `relrowsecurity = true` i `relforcerowsecurity = false`;
- neuspjela restore asercija **podiže izuzetak i abortira transakciju**;
- **prekinut ili neuspio seed ne ostavlja `FORCE` isključenim** — nakon rollbacka obje zastavice su
  ponovo `true`;
- pokušaj nad tabelom **izvan allowliste** je odbijen prije bilo kakvog `ALTER TABLE`-a;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` se ne pojavljuje ni u jednoj forward migraciji ni
  seed skripti;
- unutar prozora se ne izvršava nijedan nepovezani sigurnosni DDL;
- nijedna rola nema `BYPASSRLS`; nijedna `SECURITY DEFINER` funkcija ne postoji;
- mehanizam nije dohvatljiv iz runtime aplikacijskog koda.

### 25.1.3 Minimalna čitljiva površina `practice_settings` (D-049)

Nivo: integration. Normativno: §20.2b. Puni ugovor je u `08` §21.7.

- `SELECT (practice_id, allow_mpa_approval, allow_billing_specialist_approval)` **prolazi**;
- `SELECT *` → **`42501`**;
- `SELECT` nad `id`, `version`, `updated_at`, `updated_by`, `configuration`,
  `retention_policy_code`, `billing_review_required`, `require_reason_for_manual_change`,
  `ai_enabled`, `axenita_export_enabled` → **`42501`**;
- nedozvoljena kolona **isključivo u `WHERE`** → **`42501`**;
- nedozvoljena kolona **isključivo u `ORDER BY`** → **`42501`**;
- `INSERT`, `UPDATE`, `DELETE` → **`42501`**;
- `copilot_system` bilo kakav pristup → pada;
- u fazi 3 **nijedna** settings ruta nije registrovana;
- uslovne permisije u `GET /me` tačne su za **oba** stanja **oba** flaga.

Izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` se testom
**eksplicitno tvrdi** kao prihvaćeno međustanje, da promjena ne bi prošla nezapaženo. Faza 4 je
zatvara; regresijski test to dokazuje nakon §22.13.

### 25.1.3a Runtime površina `practice_settings` u fazi 4 (D-053)

Nivo: integration. Normativno: §20.2b.1, §18.1, §17.1a. Puni ugovor je u `08` §21.7.5 i §21.7.6.

Površina i grantovi:

- `SELECT` nad **tačno devet** dozvoljenih kolona **prolazi**;
- `SELECT *` → **`42501`**;
- `SELECT` nad `id`, `configuration`, `updated_at`, `updated_by` → **`42501`**, uključujući
  upotrebu isključivo u `WHERE` ili `ORDER BY`;
- `UPDATE` nad **tačno devet** dozvoljenih kolona **prolazi**;
- `UPDATE` nad `practice_id`, `id`, `configuration`, `updated_by` → **`42501`**;
- `INSERT` i `DELETE` → **`42501`**;
- **nema table-level `SELECT` ni table-level `UPDATE`** — introspekcija to potvrđuje;
- `copilot_system` bilo kakav pristup → pada; `PUBLIC` nema nijedan grant;
- `UPDATE` grant **bez** pripadajuće tenant politike **obara phase gate**.

Tenant izolacija i optimistic locking:

- `copilot_app` vidi **isključivo** red tekućeg tenanta — regresijski test dokazuje da je izloženost
  `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` **zatvorena**;
- `version` se inkrementira **atomično**, u istom `UPDATE`-u koji nosi predikat
  `practice_id = <tenant> and version = <očekivana>`;
- `updated_at` postavlja **baza**; `updated_by` je **nepromijenjen** nakon uspješnog `PATCH`-a.

`GET /me` regresija nakon uvođenja RLS-a (§17.1a; D-053, klauzula D.12):

- iste kanonske `/me` fixture daju **iste** `memberships[].permissions` prije i nakon RLS-a;
- uslovno ponašanje `MPA` i `BILLING_SPECIALIST` tačno je za **oba** stanja **oba** flaga;
- neaktivan membership ostaje `permissions = []`;
- multi-practice membership koristi postavke **svoje** ordinacije, nezavisno;
- `practiceName` je prisutan za **svaki** membership — dokaz redoslijeda iz §17.1a.3;
- nakon transakcije **nijedan** tenant kontekst ne curi;
- **nijedan** klijentski poslan practice identifikator ne učestvuje u neutralnom `/me`.

### 25.1.4 §17.2 i §17.4 u fazi 3 (D-051)

Nivo: security/RLS integration. Normativno: §17.2, §17.4, §17.0. Puni ugovor je u `08` §21.6 i
§24.4.

- obje tabele nose `ENABLE` **i** `FORCE RLS` već nakon paketa `002`;
- korisnik A ne čita platform rolu korisnika B;
- korisnik A ne čita role dodjele korisnika B;
- bez postavljenog `app.user_id` obje tabele vraćaju **nula** redova;
- `copilot_system` vidi **sve** redove `platform_role_assignments`;
- `copilot_system` **nema nijedan** pristup `practice_membership_roles`;
- politika §17.4 radi **prije** nego `practice_memberships` dobije §17.3 RLS;
- ukidanje `SELECT` granta nad `practice_memberships` obara politiku §17.4 sa **`42501`**;
- `platformRoles[]` sadrži isključivo redove sa `revoked_at IS NULL`;
- paket `013_rls_policies` ne sadrži nijedan RLS objekat za te dvije tabele — introspekcija
  vlasništva.

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
piše kao **ručno dopunjen custom SQL u migration fajlu paketa**, prema D-004 i **D-050**.

`prisma migrate diff` može prijavljivati drift na tom constraintu.
**To je očekivano i ne ispravlja se.** Uklanjanje constrainta radi "čistog" drift izvještaja
je zabranjeno.

Isto važi za RLS politike, grants, trigger funkcije iz §19 i column-level privilegije iz
§9.3.1 — Prisma ih ne modelira.

## 26.3 Kanonski tok autorstva migracija (D-050)

**Normativna odluka: D-050.** `prisma migrate dev --create-only` **nije** kanonski mehanizam
autorstva migracija za ovaj repozitorij: on kreira i zahtijeva shadow bazu čije je podrazumijevano
vlasništvo i privilegije nad `public` schemom **strukturno nespojivo** sa namjernim guardovima
migracije `001` (§22.1, §3.1, §3.5).

Kanonski tok (Prisma 7.9.1):

1. **ispravno bootstrapovana tekuća kanonska migration baza** je izvorno stanje;
2. generisati inkrementalni SQL kandidat:

   ```powershell
   npx prisma migrate diff `
     --from-config-datasource `
     --to-schema=prisma/schema.prisma `
     --script `
     -o prisma/migrations/<timestamp>_<package>/migration.sql
   ```

3. ručno dopuniti custom SQL za: constrainte koje Prisma ne izražava; grants; revokes; RLS;
   politike; funkcije; sigurnosne asercije; komentare;
4. **ljudski pregled** kompletnog generisanog **i** ručno napisanog SQL-a;
5. validirati kompletan migration lanac na **jednokratnoj, ispravno bootstrapovanoj praznoj bazi**;
6. primijeniti kroz `prisma migrate deploy`;
7. mehanički verifikovati schemu, vlasništvo, privilegije i sigurnosne objekte.

Normativno:

- izlaz `migrate diff` je **kandidat, ne istina**;
- `prisma db push` ostaje **zabranjen**;
- primijenjene migracije ostaju **immutable** (§22, `00` §6.2);
- `prisma migrate deploy` ostaje kanonski put primjene i deploymenta;
- `--from-empty` **nije** normalni izvor inkrementalnog autorstva;
- `--from-migrations` ostaje neprikladan jer zahtijeva shadow bazu;
- **nijedan guard migracije `001` se ne smije oslabiti** radi Prisma shadow baze.

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
- očekivani drift iz §26.2 je dokumentovan i nije "ispravljen";
- **migracija je autorisana kanonskim tokom iz §26.3 (D-050); nijedan guard migracije `001` nije
  oslabljen, i nijedna migracija ne zavisi od Prisma shadow baze**;
- **svaka `FORCE RLS` tabela koju pouzdani put popunjava ima steady-state
  `relrowsecurity = true` i `relforcerowsecurity = true`, i upisuje se isključivo kroz protokol iz
  §23.4**;
- **`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` se ne pojavljuje ni u jednoj forward migraciji ni
  seed skripti** (rollback izuzet, §23.4.5);
- **§17.2 i §17.4 su konačni u paketu `002`; paket `013` ih ne rekreira ni ne prepisuje**;
- **`practice_settings` u fazi 3 ima isključivo trokolonski `SELECT` i nijedan upisni grant; write
  grant i tenant politika koja ga ograničava uvode se zajedno u paketu `013`**;
- **`practice_settings` u fazi 4 ima tačno devetokolonski `SELECT` i tačno devetokolonski `UPDATE`
  iz §20.2b.1, nikada table-level; `configuration`, `updated_by` i `id` ostaju nečitljivi, a
  `practice_id`, `id`, `configuration` i `updated_by` ostaju bez `UPDATE`-a** (D-053);
- **`GET /me` ostaje neutralna ruta i nakon `practice_settings` RLS-a; tenant politika iz §17.1
  nije oslabljena, nego je aplikacijski put adaptiran prema §17.1a** (D-053, dio D).

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

### Status paketa `003` — RIJEŠENO (D-062)

**Rok "prije paketa `003_patient_encounter_documents`" je ispunjen.** D-062, Dio C
(`OD-P5-D2-2`, `OD-P5-D2-3`) ratifikuje `ON DELETE NO ACTION ON UPDATE NO ACTION` za **četiri**
već deklarisana composite FK-a koje taj paket kreira — §7.2, §7.3 i §8.2 (dva) — i **dodatno
deklariše četiri relacije** koje ranije nisu bile deklarisane:

| Source | Source kolone | Target | Status |
|---|---|---|---|
| `patient_references` | `(practice_id)` | `practices (id)` | **novodeklarisan**, `NO ACTION`/`NO ACTION` |
| `storage_objects` | `(practice_id)` | `practices (id)` | **novodeklarisan**, `NO ACTION`/`NO ACTION` |
| `encounter_documents` | `(practice_id, source_storage_object_id)` | `storage_objects (practice_id, id)` | **novodeklarisan**, `MATCH SIMPLE`, `NO ACTION`/`NO ACTION` |
| `encounters` | `(practice_id, responsible_physician_id)` | `practice_memberships (practice_id, user_id)` | **novodeklarisan**, `MATCH SIMPLE`, `NO ACTION`/`NO ACTION` — razrješava obavezu D-061, klauzule 19–21 |

**Preostalih šest** od deset nedeklarisanih akcija (paketi `005`, `007`, `010`) **ostaju otvorene**
i nisu obuhvaćene D-062. Šest `analysis_run_id` relacija iz "Obuhvat ove tabele" takođe ostaje
zasebna otvorena stavka.

**Manja dokumentaciona ispravka.** Tvrdnja da je paket `003` "prvi koji kreira izvornu tabelu sa
composite FK-om" **nije tačna** — paket `002` je to već učinio za `practice_membership_roles`
(§6.3a). Suština roka je time nepromijenjena i ispunjena je.

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

---

# 29. Faza 5 — objavljena schema, referencijalne akcije, RLS i grantovi (D-062)

**Normativni izvor: D-062.** Ovaj odjeljak je **objava dizajnerske vlasti**, ne implementacija.
Nijedan objekt iz njega ne postoji u bazi dok ga ne kreira imenovani migration paket, a to smije
tek nakon zasebnog implementacijskog gatea `P5-I0`.

## 29.1 Enumi koje kreira paket `003`

| Enum | Vrijednosti | Konzument | Izvor |
|---|---|---|---|
| `integration_provider` | AXENITA, MANUAL, CSV, FHIR, OTHER | `patient_references.source_system`, `encounters.source_system` | §4.6 — FROZEN |
| `encounter_status` | DRAFT, READY_FOR_ANALYSIS, ANALYSIS_IN_PROGRESS, REVIEW_REQUIRED, APPROVED, EXPORT_PENDING, EXPORTED, CANCELLED, CLOSED | `encounters.status` | §4.3 — FROZEN |
| `review_state` | UNREVIEWED, CONFIRMED, CORRECTED, REJECTED | `encounter_diagnoses.review_state` | §4.8 — FROZEN |
| `document_type` | CONSULTATION_NOTE, DIAGNOSIS_LIST, PROCEDURE_NOTE, REFERRAL, LAB_RESULT, BILLING_DRAFT, AUDIT_REPORT, OTHER | `encounter_documents.document_type` | §4.4 — FROZEN |
| `document_source` | MANUAL_TEXT, FILE_UPLOAD, AXENITA_API, CSV_IMPORT, FHIR_IMPORT, GENERATED | `encounter_documents.source` | §4.5 — FROZEN |

Fizička imena: snake_case jednina, `@@map`-irano, prema precedentu §2.1 + §22.2.

## 29.2 Potpuna FK matrica Faze 5 — svaka akcija eksplicitna

**Nijedan Prisma default se ne koristi ni u jednoj poziciji** (§29.3).

| # | Child | Parent | Oblik | Nullability | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|---|
| 1 | `patient_references (practice_id)` | `practices (id)` | jednokolonski | `NOT NULL` | `NO ACTION` | `NO ACTION` |
| 2 | `encounters (practice_id, patient_reference_id)` | `patient_references (practice_id, id)` | composite | `NOT NULL` | `NO ACTION` | `NO ACTION` |
| 3 | `encounters (practice_id, responsible_physician_id)` | `practice_memberships (practice_id, user_id)` | composite, **`MATCH SIMPLE`** | **nullable** | `NO ACTION` | `NO ACTION` |
| 4 | `encounter_diagnoses (practice_id, encounter_id)` | `encounters (practice_id, id)` | composite | `NOT NULL` | `NO ACTION` | `NO ACTION` |
| 5 | `storage_objects (practice_id)` | `practices (id)` | jednokolonski | `NOT NULL` | `NO ACTION` | `NO ACTION` |
| 6 | `encounter_documents (practice_id, encounter_id)` | `encounters (practice_id, id)` | composite | `NOT NULL` | `NO ACTION` | `NO ACTION` |
| 7 | `encounter_documents (practice_id, storage_object_id)` | `storage_objects (practice_id, id)` | composite, **`MATCH SIMPLE`** | **nullable** | `NO ACTION` | `NO ACTION` |
| 8 | `encounter_documents (practice_id, source_storage_object_id)` | `storage_objects (practice_id, id)` | composite, **`MATCH SIMPLE`** | **nullable** | `NO ACTION` | `NO ACTION` |

**`MATCH SIMPLE` je obavezan za #3, #7 i #8** — `practice_id` je `NOT NULL`, druga kolona nije, pa
`NULL` u drugoj koloni mora proći bez FK provjere. **`MATCH FULL` se ovdje ne smije koristiti
nikada.**

**Namjerno se NE deklarišu:** `encounters (practice_id) → practices` (tenant ključ se nosi
tranzitivno kroz #2 → #1, precedent §6.3a); `created_by`/`updated_by` → `users` na sve tri tabele
(aplikacijska invarijanta, precedent §6.5); `encounters.responsible_physician_id → users (id)`
(postojanje korisnika je tranzitivno garantovano kroz `practice_memberships_user_fk`).

**Zašto `NO ACTION` svugdje.** U Fazi 5 **ne postoji nijedna delete sposobnost** (§18.1 ne
dodjeljuje `DELETE`, `09` §20 zabranjuje ad-hoc delete API), pa `CASCADE` nema nijedan legitiman
okidač, a ima jedan destruktivan — brisanje encountera, dijagnoza i dokumenata cijelog tenanta
jednim iskazom. `SET NULL` je nemoguć nad `NOT NULL` ključevima. `ON UPDATE` je nedosežan jer su
`id`, `practice_id` i `user_id` immutable (§2.7.8, §19.3). **Historijski medicinski integritet je
time očuvan: brisanje roditelja se odbija, ne kaskadira.**

## 29.3 Obaveza prema Prisma sloju — normativno

**Svaka** relacija Faze 5 mora u Prisma modelu nositi doslovno:

```prisma
onDelete: NoAction, onUpdate: NoAction
```

Prisma za obaveznu relaciju podrazumijeva `onDelete: Restrict, onUpdate: Cascade` — izmišljeno
pravilo koje je migracija `002` već eksplicitno odbila. Bez eksplicitnog pina `prisma migrate diff`
pri regeneraciji **tiho vraća** Prisma akcije.

## 29.4 RLS Faze 5

| Tabela | `ENABLE` | `FORCE` | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|
| `patient_references` | da | da | `patient_references_select` | `patient_references_insert` | **nijedna u Fazi 5** | **nijedna** |
| `encounters` | da | da | `encounters_select` | `encounters_insert` | `encounters_update` | **nijedna** |
| `encounter_diagnoses` | da | da | `encounter_diagnoses_select` | `encounter_diagnoses_insert` | **nijedna u Fazi 5** | **nijedna** |
| `storage_objects` | da | da | **nijedna** | **nijedna** | **nijedna** | **nijedna** |
| `encounter_documents` | da | da | `encounter_documents_select` | `encounter_documents_insert` | `encounter_documents_update` | **nijedna** |

`USING` i `WITH CHECK` su na **svakoj** politici tenant predikat iz §17.1, doslovno i neoslabljeno:

```sql
practice_id = nullif(current_setting('app.practice_id', true), '')::uuid
```

`INSERT` politike nose `WITH CHECK`; `UPDATE` politike nose **i** `USING` **i** `WITH CHECK`.

**Normativna ograničenja:**

- **nijedan permission predikat** — permisije ostaju u aplikaciji (`03` §3.7.1, §28.5; `15`);
- **nijedan archive/soft-delete predikat** — `archived_at` je upitno pitanje, ne sigurnosna
  granica; u politici bi sakrio redove od audita i učinio arhivu nepovratnom;
- **nijedan podupit ni u jednoj od osam politika** — sve su obična poređenja kolone sa GUC-om, čime
  strukturno ne postoji površina za curenje co-member identiteta;
- **nijedna politika ne referencira `users` ni `practice_memberships`**;
- **nema bootstrap izuzetka i nijedan se ne smije dodati** — bez `app.practice_id` predikat daje
  nula redova za svaku ordinaciju (fail-closed);
- **`FORCE` je obavezan uz `ENABLE`** — bez njega vlasnik zaobilazi svaku politiku.

Ukupno **8 novih politika**. Nakon Faze 5: **18 politika** nad **11 tabela** sa `ENABLE` + `FORCE`.

## 29.5 Grantovi Faze 5 — default deny

`copilot_system` dobija **ništa** nad svih pet (D-023). `PUBLIC` dobija **ništa**;
`REVOKE ALL … FROM PUBLIC` prethodi svakom grantu. Vlasnik ostaje `copilot_migrator`.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `patient_references` | table-level | table-level | **nijedan** | **nijedan** |
| `encounters` | table-level | table-level | **column-level** (niže) | **nijedan** |
| `encounter_diagnoses` | table-level | table-level | **nijedan** | **nijedan** |
| `storage_objects` | **nijedan** | **nijedan** | **nijedan** | **nijedan** |
| `encounter_documents` | table-level | table-level | **column-level: `archived_at`** | **nijedan** |

**Nijedna sequence privilegija** — nijedna tabela Faze 5 nema serial/identity kolonu (§2.2, §20.3).

**`UPDATE` kolone na `encounters` — tačan skup:**

```text
status, version, updated_by, updated_at,
occurred_at, treatment_date, responsible_physician_id,
guarantor_type, insurance_context, specialty_code,
patient_age_at_encounter, patient_sex_at_encounter
```

**Uskraćeno:**

```text
id, practice_id, patient_reference_id, source_system, created_by, created_at,
external_encounter_ref_hash, external_encounter_ref_ciphertext,
external_encounter_ref_iv, external_encounter_ref_auth_tag,
encryption_algorithm, encryption_version, encryption_key_ref, encryption_key_version
```

Time `practice_id` i `id` postaju **nepomjerivi na nivou privilegije** (dvije nezavisne barijere,
precedent `013` §1), AAD-vezane kolone su nepromjenjive i bez trigera, a `patient_reference_id`
je immutable — encounter se ne može tiho prepokazati na drugog pacijenta.

**`UPDATE` kolone na `encounter_documents` — tačan skup:** `archived_at`. **To je potpuna lista.**
Sve ostale kolone — obje statusne, oba ciphertext trojca, oba hasha, sve četiri `encryption_*`,
`created_by`, `created_at`, `id`, `practice_id`, `encounter_id` — **nezapisive su nakon `INSERT`-a
na nivou privilegije**.

**Column-level `SELECT` se ne uvodi.** Nijedna kolona Faze 5 nema svojstvo koje je opravdalo
column-level `SELECT` nad `users`/`practices`: svaka je potrebna u odgovoru, u `WHERE` predikatu,
ili je ciphertext bezvrijedan bez ključa izvan baze. `external_patient_ref_hash` **mora** nositi
`SELECT`, jer deterministički lookup koristi njega u `WHERE`, a kolona bez granta pada na `42501`
i pri korištenju isključivo u `WHERE` (§20.2b).

**`storage_objects` namjerno ostaje bez ijedne sposobnosti** — tabela postoji jer je FK roditelj,
ali nijedna ruta Faze 5 je ne čita ni ne piše. **Ne dobija Faza-5 writer grant.**

## 29.6 Indeksi Faze 5 (kreira paket `003`)

```sql
encounters_review_queue_idx          (practice_id, status, treatment_date desc, id desc)
encounters_patient_timeline_idx      (practice_id, patient_reference_id, treatment_date desc, id desc)
encounters_responsible_physician_idx (practice_id, responsible_physician_id, treatment_date desc, id desc)
documents_encounter_idx              (practice_id, encounter_id, created_at)
```

`id desc` je obavezan tie-breaker na sva tri encounter indeksa — bez njega je rep sortiranja
nestabilan i cursor paginacija se lomi (`03` §7).

## 29.7 Obavezne post-migracijske katalog tvrdnje

- `relrowsecurity = true` **i** `relforcerowsecurity = true` na svih pet — **trajna regresija**;
- tačan skup i broj imena politika;
- `copilot_system` = **nula** grantova nad svih pet; `PUBLIC` = nula;
- `confdeltype = 'a'` **i** `confupdtype = 'a'` na **svakom** FK-u Faze 5;
- `unique (practice_id, id)` na svih pet — ukupno **8 od 30** tenant tabela;
- **potpun katalog `CHECK` constrainata paketa `003` — 20 zamrznutih plus tri iz §2.11.4, ukupno
  23** (§29.7a; **korigovano odlukom D-063, klauzula 6**; raniji broj `18` bio je aritmetička
  greška). Tvrdnja je **stroga jednakost punog skupa** nad `conname` + tabelom +
  `pg_get_constraintdef()`, ne brojanje;
- tačan skup column-level `UPDATE` kolona iz §29.5;
- **negativno:** nema nove role, `BYPASSRLS`-a, `SECURITY DEFINER` funkcije, četvrte role, drugog
  Prisma klijenta, treće `users` politike, **ni ijedne izmjene politike ili granta nad
  `practice_memberships`** (D-061, klauzula 11 i E.3).

## 29.7a Katalog `CHECK` constrainata paketa `003` — mjerodavan (D-063, klauzule 6–8)

**Normativni izvor: D-063, klauzule 6, 7 i 8.** Ovaj katalog je **tekući autoritet**. Svaki raniji
sažetak koji navodi **18** zamrznutih `CHECK`-ova, ili koji `encounter_documents` pripisuje **10**,
je **superseded kao aritmetička greška**. **Nijedno tijelo constrainta se time ne mijenja** —
mjerodavan izvor tijela ostaju §7.1, §7.2, §7.3, §8.1, §8.2 i §2.11.4.

| Tabela | Zamrznuti | Novi (§2.11.4) | Ukupno |
|---|---:|---:|---:|
| `patient_references` | **5** | 0 | **5** |
| `encounters` | **6** | 0 | **6** |
| `encounter_diagnoses` | **0** | 0 | **0** |
| `storage_objects` | **1** | 0 | **1** |
| `encounter_documents` | **8** | **3** | **11** |
| **Ukupno** | **20** | **3** | **23** |

`encounter_diagnoses` nema **nijedan** `CHECK` — to je **ratifikovano odsustvo**, ne propust (§7.3).

**Sva 23 constrainta nose eksplicitno ime** po standardu `12` §8 (`<table>_<rule>_check`), po
precedentu `practice_settings_version_check` iz paketa `002`. **Ime je dio ugovora.**

```text
patient_references_birth_year_check
patient_references_external_patient_ref_envelope_check
patient_references_external_patient_ref_iv_length_check
patient_references_external_patient_ref_auth_tag_length_check
patient_references_encryption_metadata_check

encounters_version_check
encounters_patient_age_check
encounters_external_encounter_ref_envelope_check
encounters_external_encounter_ref_iv_length_check
encounters_external_encounter_ref_auth_tag_length_check
encounters_encryption_metadata_check

storage_objects_byte_size_check

encounter_documents_page_count_check
encounter_documents_normalized_text_envelope_check
encounter_documents_normalized_text_iv_length_check
encounter_documents_normalized_text_auth_tag_length_check
encounter_documents_redacted_text_envelope_check
encounter_documents_redacted_text_iv_length_check
encounter_documents_redacted_text_auth_tag_length_check
encounter_documents_encryption_metadata_check

encounter_documents_processing_status_check
encounter_documents_redaction_status_check
encounter_documents_redacted_artifact_consistency_check
```

**Ugovor katalog testa (izvršava se u slice-u `P5-I1`).** Test mora nabrojati **potpun očekivani
skup** i za **svaki** constraint tvrditi najmanje `conname`, tabelu vlasnika (`conrelid::regclass`)
i `pg_get_constraintdef(oid)`. **Poređenje je stroga jednakost punog skupa** nad `pg_constraint`
(`contype = 'c'`, pet tabela Faze 5) — nijedan višak, nijedan manjak, nijedno odstupanje u imenu ni
u tijelu. **Tvrdnja tačnog skupa se nikada ne smije oslabiti u `contains`/`subset` poređenje.**
Numerički total **23** smije se tvrditi dodatno, ali **test koji provjerava isključivo `count = 23`
je nedovoljan**.

## 29.8 Kolone bez pisca u Fazi 5 — `NULL` po dizajnu

`storage_objects` (cijela tabela, nula redova) · `encounters.external_encounter_ref_*` i
`encounters.encryption_*` — **`encounters` u Fazi 5 ne nosi nikakav ciphertext** ·
`encounter_documents.external_document_ref_hash` · `encounter_documents.source_storage_object_id` ·
envelope i `encryption_*` kolone `patient_references` (write-back je iza `D-OPEN-009`) ·
`storage_objects.archived_at` i `retention_delete_after`.

**Nijedno API polje se ne kreira samo da bi schema kolona bila popunjena** (`03` §12, §13).

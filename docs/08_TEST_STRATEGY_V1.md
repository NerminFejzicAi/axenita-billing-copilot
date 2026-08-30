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

Steady-state `FORCE RLS` se provjerava iz `pg_class`, jer `pg_tables.rowsecurity` ne izlaže
`FORCE` atribut (D-048; `02` §23.4, §25.1.2):

```sql
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'users','practices','practice_membership_roles','platform_role_assignments'
  );
```

**Autorstvo migracije (D-050; `02` §26.3).** Kandidat SQL se generiše kroz
`prisma migrate diff --from-config-datasource --to-schema=... --script -o ...`, ručno se dopunjuje,
prolazi ljudski pregled, pa tek onda ulazi u korak 2 iznad. **`prisma migrate dev --create-only`
se ne koristi** — njegova shadow baza je strukturno nespojiva sa guardovima migracije `001`.
`prisma db push` ostaje zabranjen. **Nijedan guard migracije `001` se ne smije oslabiti**; test
koji to učini radi bi "prošao" je sam po sebi defekt.

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
- unknown subject — validan token, nula `users` redova → 403;
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

**Kanonski request hash — obavezni test vektori (D-069, `RULING 4`).** `idempotency_keys.request_sha256`
je definisan u `03` §4.1 i `04` §7.5a.1 kao **SHA-256 nad RFC 8785 (JCS) kanonskom
reprezentacijom validiranog parsiranog tijela zahtjeva**, UTF-8, izlaz **64 mala heksadecimalna
znaka**. **Format je perzistentan i MORA biti pinovan fiksnim test vektorima**, jer promjena
algoritma nakon prvog upisa retroaktivno obezvrjeđuje sve ranije redove.

Obavezni vektori:

- **isti parsirani objekat, različit ulazni redoslijed ključeva → ISTI digest**;
- **razlike u whitespaceu ulaznog JSON-a → ISTI digest**;
- **`null` naspram odsutnog polja → RAZLIČIT digest**;
- **različit redoslijed elemenata niza → RAZLIČIT digest**;
- **promjena metoda, patha, query stringa, headera, `Idempotency-Key`-a, identiteta korisnika ili
  ordinacije, request ID-a i bilo kojeg server-izvedenog polja → ISTI digest**, jer nijedno od njih
  nije ulaz hasha;
- **pinovani literalni digesti** za najmanje jedno kanonsko tijelo po obaveznom endpointu iz §4,
  zapisani kao konstante u testu, ne izračunati istom implementacijom koja se testira.

**Vlasnik implementacije i ovih testova je slice `P5-I4`** (`04` §7.5a). **`P5-I5` ih ne duplira i
ne forkuje.**

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

**Vlasništvo faze za `practice_settings` (D-049).** Ovaj runtime ugovor — `ETag`, `If-Match`,
`428`, `409 VERSION_CONFLICT` i atomičan inkrement `version` — testira se u **fazi 4**, zajedno sa
`GET`/`PATCH /practices/{practiceId}/settings` i tenant RLS-om te tabele. Ranija tvrdnja iz D-028,
klauzule 4, da optimistic locking počinje u fazi 3, je **povučena**. **Schema dio D-029 se ne
mijenja**: `version` i `check (version >= 1)` nastaju u paketu `002_identity_and_practices`, faza 3,
i tamo se i verifikuju introspekcijom (`02` §27). Za preostalih pet resursa ništa se ne mijenja.

**Preciziranje za `practice_settings` (D-053, dio A i B).** Za **ovaj** resurs tekuću verziju nosi
**isključivo `ETag`**:

- `GET` i **uspješan** `PATCH` vraćaju **istu zamrznutu osmopoljnu reprezentaciju** iz `03` §10;
- **`version` nije polje JSON tijela** — ni u odgovoru, ni u zahtjevu; opšta tvrdnja
  „response sadrži currentVersion" iznad je za ovaj resurs zadovoljena **`ETag` headerom**, i
  **ne uvodi** polje u tijelu;
- `409 VERSION_CONFLICT` vraća standardni error envelope iz `03` §8 i **ne nosi** reprezentaciju
  settingsa; **nijedno novo polje envelope-a se ne uvodi**;
- poslan `version`, `updated_at` ili `updated_by` u tijelu `PATCH`-a se **odbija**;
- `updated_by` je **nepromijenjen** nakon uspješnog `PATCH`-a;
- inkrement se dokazuje kao **jedan atomičan `UPDATE`** sa predikatom
  `practice_id = <tenant> and version = <očekivana>`.

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

**Dosežni podskup Faze 5 — tačno 4 od 15 (D-062, Dio F; `03` §29.1a).** Faza 5 nema analizu,
approval ni export rute, pa su u njoj dosežne isključivo:

```text
(kreiranje)           → DRAFT
DRAFT                 → READY_FOR_ANALYSIS
DRAFT                 → CANCELLED
READY_FOR_ANALYSIS    → CANCELLED
```

**Preostalih 11 kanonskih tranzicija mora u Fazi 5 biti testirano kao eksplicitno zabranjeno** →
`409 INVALID_STATE_TRANSITION`. Prećutno odsustvo koda **nije** ispunjenje ovog ugovora: table-driven
test ide nad **cijelom** mašinom, a ne samo nad dosežnim podskupom.

Dodatno se u Fazi 5 testira: `DRAFT → READY_FOR_ANALYSIS` je **idempotentan** (ponovljeni unos
dokumenta nad već `READY_FOR_ANALYSIS` encounterom je **no-op, ne greška**), **ne inkrementira
`version`** (istovremeni `PATCH` sa važećim `ETag`-om ne pada), i emituje **vlastiti** audit događaj
`ENCOUNTER_READY_FOR_ANALYSIS`; unos dokumenta nad `CANCELLED` encounterom daje
`409 INVALID_STATE_TRANSITION`.

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

**Encounter write semantika — `404` naspram `409` (D-069, `RULING 2`).** Lista iznad se **ne
mijenja**; dodaju se obavezni testovi koji razdvajaju dvije write putanje:

- **`PATCH /encounters/{id}`** — **jedan atomičan optimistički `UPDATE`**, **bez diskriminirajućeg
  pre-reada**. **Nula pogođenih redova → `409 VERSION_CONFLICT`** i za **zastarjelu verziju**, i za
  **nepostojeći red**, i za **tenant-nevidljiv red**. **`404 RESOURCE_NOT_FOUND` se na `PATCH`-u
  ne vraća**, i test to mora asertirati eksplicitno, po presedanu D-055, klauzule 16 i 19–21
  (`03` §10, §12).
- **`POST /encounters/{id}/cancel`** — **vidljiv** encounter u nedozvoljenom stanju →
  **`409 INVALID_STATE_TRANSITION`**; **nepostojeći ili tenant-nevidljiv** encounter →
  **`404 RESOURCE_NOT_FOUND`**. Test mora dokazati **oba** ishoda, i to iz **stvarnog** cross-tenant
  konteksta, ne iz simulacije.
- **Nijedan test ne smije zahtijevati ni dokumentovati opšti cross-tenant existence oracle.**
  Razlika `404` / `409` mora se dobiti **race-free**, unutar **iste admitovane tenant transakcije**.
  Negativni test: cross-tenant `cancel` daje **`404 RESOURCE_NOT_FOUND`** sa generičkom porukom
  koja ne citira nijednu vrijednost i ne razlikuje „ne postoji" od „postoji u drugom tenantu".

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

Stavke `oversized upload 413` i `unsupported MIME 415` pripadaju **isključivo DEFERRED upload
putanji** (`03` §13.2) i nisu dostižne dok je aktivna document putanja samo tekstualna. Prekoračenje
maksimuma **manuelnog teksta** testira se kao `422 VALIDATION_ERROR` (§12.4), ne kao `413`.

## 12.0 Status obaveza Faze 5 (D-060, D-061, D-062)

Sekcije §12.1–§12.7 su **dokumentovane, još neizvršene** test obaveze objavljene odlukom **D-060**;
sekcija **§12.8** je isto takva obaveza objavljena odlukom **D-061**; sekcija **§12.9** odlukom
**D-062**. Isto pravilo važi za sve njih.

- **Nijedan test iz ovih sekcija nije implementiran ni izvršen**, i njihovo postojanje **ne**
  označava nijednu kućicu Faze 5 (`05` §6).
- Kada Faza 5 bude autorizovana, ove obaveze su **obavezan izvršiv ugovor** po istom pravilu kao
  §21.6 i §21.7 (§26.2) i **ne izostavljaju se tiho**.
- Ugovori koje testovi štite su **immutable čim postoji prvi perzistirani red**: normalizacija,
  hashing i deterministički token nisu naknadno preračunljivi.

**DOKAZNA EVIDENCIJA FORMALNOG ZATVARANJA `P5-I3` (D-071, 2026-08-29) — §12.0 iznad se ne
prepisuje.** Rečenica „**Nijedan test iz ovih sekcija nije implementiran ni izvršen**" je **tačna
na dan svog zapisa (D-060/D-061/D-062)** i **više ne opisuje tekuće stanje** za **primitivni**
dio obaveza koje posjeduje `P5-I3`. Ona **i dalje tačno opisuje** sve obaveze u vlasništvu
`P5-I4`, `P5-I5`, `P5-I6` i `P5-I7`.

**Kanonski pod-gateovi.**

```text
P5-I3A   implementacijski commit   65a1cd962c52f72762468d8573c9e55b31984586
         kanonski merge            ea0769f1bc34baf8670aa8d4b4b5dfc3433e94db

P5-I3B   implementacijski commit   29aae651ab487cac2c77fd7b272ce6ffa976843c
         kanonski merge            13bee31fcdd5e4717eface4677e41f0d949ff080

P5-I3C   implementacijski commit   0e171b53d136987213d96c8af1aa4d0a6dcba165
         kanonski merge            6cffd9bf319068b78fa395b29ec76d9327593062
```

**`P5-I3A/B/C = IMPLEMENTED / VERIFIED / OWNER-REVIEWED / MERGED / CANONICAL`.**

**Agregatna evidencija na kanonskom `main`-u.**

```text
unit (tekuci kanonski agregat)   35 fajlova / 882 testa    PASS
e2e / bootstrap                   5 fajlova /  41 test     PASS
typecheck                                                  PASS
lint                                                       PASS
formatiranje u vlasnistvu P5-I3                            PASS
repo-wide format                  PASS_WITH_PRE_EXISTING_BASELINE_EXCEPTION
```

**Kanonski lanac unit dokaza i delte po pod-gateu.**

```text
526  ->  615  ->  753  ->  882
      +89      +138     +129
      P5-I3A   P5-I3B   P5-I3C
```

**Ovaj lanac je kanonski i mjerodavan.** Svaki raniji preflight broj koji mu protivrječi je
**historijski netačan zapis, ne alternativni izvor**, i **ne smije se koristiti** u budućim gate
izvještajima; historijski zapisi se pritom **ne falsifikuju**, nego se koriguju ovom anotacijom.

**Repo-wide format izuzetak nije u vlasništvu `P5-I3`.** Jedini fajl je
`apps/api/test/phase4-membership-role-assignment-constraints.security.ts`, kanonski blob
`05002fde83376e894af9e245fa65395242debb92`. On je **predefinisan**, **nepromijenjen kroz sva tri
pod-gatea `P5-I3`** i **namjerno nepopravljen** — popravka bi bila nepovezana mutacija izvora.

**Šta je od §12 obaveza izvršeno, a šta nije.**

- **§12.2** — `MANUAL` v1 normalizacija eksternog identifikatora: **izvršena na nivou primitiva**
  (`P5-I3B`), uključujući granicu od 255 UTF-8 bajtova nad post-NFC oblikom.
- **§12.1** — HMAC eksternog ID-a: **izvršen primitivni dio** (`P5-I3B`) — kanonska HMAC poruka,
  HMAC-SHA256, oblik tokena `h1.<hex64>`, katalog domena i guard `K_hmac != K_enc` nad dekodiranim
  bajtovima. **Perzistencija `external_ref_hmac` i tenant-scoped lookup NISU izvršeni** i preneseni
  su kao **`CO-P5-I3-I4-2`** u `P5-I4`.
- **§12.3** — pseudonim: **izvršen primitivni dio** (`P5-I3C`) — format, CSPRNG kroz mockabilan
  seam, uppercase kanonizacija i neizvedenost iz eksternog ID-a. **Jedinstvenost u bazi, ograničen
  retry, zabrana determinističkog fallbacka i lookup put NISU izvršeni** i preneseni su kao
  **`CO-P5-I3-I4-1`** u `P5-I4`.
- **§12.4** — normalizacija kliničkog teksta: **izvršena na nivou primitiva** (`P5-I3C`).
  Mapiranje prekoračenja u **`422 VALIDATION_ERROR`** je API ponašanje i **nije izvršeno**.
- **§12.5** — deterministička redakcija `phase5-basic-v1`: **NIJE implementirana ni izvršena**;
  vlasnik je **`P5-I6`**.
- **§12.6** — hashevi: **generički SHA-256 primitiv je izvršen** (`P5-I3C`). Reproducibilnost
  `source_text_hash` i `redacted_text_hash` traži perzistenciju i dekripciju dokumenta i **nije
  izvršena**; vlasnik je **`P5-I6`**.
- **§12.7** — API semantika Faze 5: **NIJE izvršena**; pripada kasnijim slice-ovima.
- **§12.8 i §12.9** — nepromijenjeni; njihov status opisuju vlastite anotacije.

**Ova evidencija ne označava nijednu kućicu iz ovog dokumenta i ne zatvara Fazu 5.** Checklist
Faze 5 je **`49 / 14`** (`05` §6), **Faza 5 ostaje `IN_PROGRESS`**, **`P5-I4` je
`NEXT` / `DEPENDENCY-SATISFIED` / `NOT AUTHORIZED` / `NOT STARTED`**, **`P5-I5` je `STILL
DEPENDENCY-BLOCKED`**, a **`P5-I6` je `NOT AUTHORIZED` / `NOT STARTED`**. Vidi D-071 u `06`.

## 12.1 HMAC eksternog ID-a

- isti ulaz, isti domen, ista ordinacija i isti `source_system` → **isti** token (determinizam);
- **druga ordinacija** → drugi token;
- **drugi `source_system`** → drugi token;
- **druga domena** (`patient_external_ref` vs `encounter_external_ref` vs
  `document_external_ref`) → drugi token;
- **`K_hmac` i `K_enc` ne smiju biti jednaki** — konfiguracija u kojoj jesu mora pasti;
- **guard poredi dekodirane bajtove ključeva, ne Base64 stringove** (D-070, `RULING 3`): dvije
  **različite** validne Base64 reprezentacije koje dekodiraju u **isti** 32-bajtni ključ **moraju**
  oboriti start; poređenje isključivo sirovih stringova je **neusklađeno** i test to tvrdi;
- **poređenje ključeva je u konstantnom vremenu** — npr. `timingSafeEqual` ili semantički
  ekvivalentan primitiv;
- **`ENCRYPTION_LOCAL_KEY` i `HMAC_LOCAL_KEY` su RFC 4648 standardni Base64 bez whitespacea, sa
  dekodiranih tačno 32 bajta**: nevalidan Base64 i svaka dekodirana dužina različita od 32 bajta
  **moraju** pasti kao startup/konfiguraciona greška;
- **`ENCRYPTION_KEY_VERSION` je obavezan** (D-025, klauzula 10) — njegov izostanak mora oboriti
  start; **varijabla `HMAC_KEY_VERSION` u Fazi 5 ne postoji** i nijedan test je ne smije zahtijevati;
- **test ne smije tvrditi da guard dokazuje neizvedenost `K_hmac` iz `K_enc`** — guard dokazuje
  **nejednakost bajtova**; provenijencija ostaje operativna obaveza (`09` §8.1);
- token prati format `h1.<64 lowercase hex>` i staje u `varchar(128)`;
- **malformisan ili nepoznat generacijski prefiks** se odbija **sigurno** — bez izlaganja tokena,
  ulazne vrijednosti ni materijala ključa u poruci greške;
- lookup preko više generacija (kad ijedna druga generacija bude postojala) vraća isti red;
- **nijedan HMAC token se ne pojavljuje u logu, odgovoru ni Problem Details tijelu.**

## 12.2 Normalizacija eksternog ID-a (profil `MANUAL` v1)

- **NFC** se primjenjuje (kompozitni i dekompozitni oblik daju isti token);
- **vanjski trim** se primjenjuje;
- **vodeće nule su očuvane** — `0012` i `12` daju **različite** tokene;
- **veličina slova je očuvana** — `abc` i `ABC` daju **različite** tokene;
- **unutrašnji whitespace je očuvan**;
- **`NFKC` se ne primjenjuje** — znakovi koje bi `NFKC` presložio ostaju različiti;
- `NUL`, C0/C1 kontrolni znakovi, prazan ulaz i ulaz prazan nakon normalizacije se **odbijaju**;
- vodeći `U+FEFF` se uklanja;
- **prekoračena dužina identifikatora se odbija na tačnoj granici od `255` UTF-8 bajtova mjerenoj
  nad finalnim normalizovanim oblikom, poslije NFC-a** (D-070, `RULING 2`): `255` bajtova prolazi,
  `256` bajtova pada; granica **nije** 255 UTF-16 code unita, **nije** 255 code pointa, **nije** 255
  grapheme clustera i **nije** pre-NFC brojanje — test uzima ulaz čije se **pre-NFC** i **post-NFC**
  bajtne dužine razlikuju i tvrdi da mjerodavna ostaje **post-NFC**;
- **poruka odbijanja ne citira ni jedan dio poslane vrijednosti.**

## 12.3 Pseudonim

- format: `P-` + tačno 10 velikih Crockford Base32 znakova;
- **izvor entropije je CSPRNG**, kroz **mockabilan seam** — test smije determinisati generator, a
  produkcijski put ne smije imati determinističku granu;
- **kolizija** na `unique (practice_id, pseudonym)` pokreće **ograničen** retry; iscrpljeni pokušaji
  **padaju**, bez determinističkog fallbacka;
- perzistirana vrijednost je **velikim slovima**;
- **query put:** `patientPseudonym` u malim slovima → kanonizacija u velika → **obična jednakost**
  vraća isti red; **nijedan `LOWER()`, `citext` ni posebna kolacija se ne koriste**;
- pseudonim **nije izveden** iz eksternog ID-a: isti eksterni ID u dva reda/ordinacije daje
  **različite** pseudonime;
- pseudonim je **immutable** nakon kreiranja;
- **pseudonim se ne pojavljuje u logu.**

## 12.4 Normalizacija kliničkog teksta

- `CRLF` i samostalni `CR` → `LF`;
- **NFC** se primjenjuje; **`NFKC` se ne primjenjuje**;
- **tabovi su očuvani**;
- **unutrašnji whitespace, prazni redovi i interpunkcija su očuvani**;
- klinički sadržaj je očuvan doslovno: decimalni zarezi i tačke, jedinice, doziranja, datumi,
  nazivi lijekova, ICD kodovi i simboli;
- vanjski trim se primjenjuje **isključivo na nivou cijelog dokumenta**;
- `NUL` i C0/C1 kontrolni znakovi osim `LF`/`TAB` se odbijaju;
- prazan tekst nakon normalizacije se odbija;
- **maksimum 256 KiB**: ulaz iznad maksimuma → **`422 VALIDATION_ERROR`**;
- **tekst se nikada ne skraćuje** — ni ulaz, ni izlaz normalizacije;
- **validacioni odgovor ne sadrži nijedan dio poslanog teksta.**

## 12.5 Deterministička redakcija (`phase5-basic-v1`)

- pozitivan slučaj po **svakoj podržanoj klasi**: e-mail; `http`/`https`/`www.` URL; **validiran**
  AHV/AVS; **validiran** IBAN; eksterna referenca pacijenta iz tekućeg zahtjeva;
- **zaseban pozitivan slučaj za identifikator osiguranja/kartice se NE zahtijeva** i **nije
  primjenjiv na `phase5-basic-v1`** (D-070, `RULING 4`): `AHV`/`AVS` je jedina validirana
  identifikatorska klasa te vrste u v1, a generički identifikator osiguranja, identifikator kartice,
  **`VeKa`** i broj članstva/kartice **nemaju kanonski uzorak** — **nijedan test ne smije tvrditi tu
  pokrivenost**; buduće dodavanje traži novu verziju ruleseta;
- **telefon — pozitivni slučajevi po tačnoj v1 sintaksi** (D-070, `RULING 5`): `+41` i `0041` uz
  **tačno 9** cifara kompaktno; `+41 XX XXX XX XX` i `0041 XX XXX XX XX`; `+41-XX-XXX-XX-XX` i
  `0041-XX-XXX-XX-XX`; te nacionalni oblici **isključivo uz neposrednu oznaku** `Tel`, `Tel.`,
  `Telefon`, `Mobile`, `Natel` ili `Fax` — case-insensitive, uz whitespace i opciono jednu `:` — u
  oblicima `0` + **tačno 9** cifara, `0XX XXX XX XX` i `0XX-XXX-XX-XX`; prva cifra područja je
  `1`–`9`;
- **telefon — strogi negativni slučajevi:** **goli nacionalni broj bez prihvaćene oznake**; oblici sa
  **tačkama** kao separatorima; **`(0)`** varijante u zagradi; **miješani** separatori (razmak i
  crtica u istom kandidatu); kandidat koji je **podniz dužeg decimalnog niza**; brojevi doziranja,
  laboratorijske vrijednosti, tarifni i ICD kodovi, datumi i mjerenja **ne smiju** biti redigovani;
  dvosmislen numerički niz **ostaje neredigovan**;
- **nema fallback generičkog telefonskog regexa** — kandidat koji ne prođe tačan v1 prepoznavač
  **ostaje nepromijenjen**, i **nijedan test ne smije tvrditi širu telefonsku pokrivenost**;
- AHV/IBAN sa **neispravnom kontrolnom cifrom/checksumom ostaju neredigovani** (validacija je uslov,
  ne heuristika);
- **imena, adrese, dijagnoze, simptomi, lijekovi, doziranja, mjerenja, medicinski nužni datumi i
  klinički nalazi se NE rediguju** — test tvrdi upravo to, i **nijedan test ne smije tvrditi** da su
  te klase pokrivene;
- **zamjenski token je konstantan po klasi** i **ne sadrži** hash, prefiks, sufiks, skraćeni original
  ni bilo koji stabilan derivat uklonjene vrijednosti;
- redakcija je **deterministička**: isti ulaz i ista verzija ruleseta daju identičan izlaz;
- **semantika `COMPLETED`:** status potvrđuje **isključivo** uspješno izvršenje konfigurisanog
  ruleseta i **ne tvrdi** anonimizaciju ni odsustvo identifikatora;
- **pri `redaction_status = FAILED` `view=redacted` NE vraća normalizovani ni originalni tekst** —
  ovo je najkritičniji negativni test cijele sekcije;
- ponovni pokušaj redakcije pod istom verzijom ruleseta koristi **svjež IV** (D-025, klauzula 6);
- **nijedan dio teksta — izvornog, normalizovanog ni redigovanog — ne pojavljuje se u logu ni u
  poruci greške.**

## 12.6 Hashevi

- `source_text_hash` je **reproducibilan**: dekripcija perzistiranog `normalized_text` i ponovni
  SHA-256 daju **istu** vrijednost;
- `redacted_text_hash` je reproducibilan iz dekriptovanog `redacted_text`;
- promjena bilo kojeg koraka normalizacije mijenja hash — test brani **redoslijed operacija** kao
  dio ugovora;
- rotacija enkripcijskog ključa (D-025, klauzula 7) **ne mijenja** nijedan `*_hash`.

## 12.7 API semantika Faze 5

- `redactBeforeAiProcessing = false` → **`422 VALIDATION_ERROR`**; `true` → prihvaćeno;
- `processingStatus` ∈ {`READY`, `FAILED`}; `redactionStatus` ∈ {`COMPLETED`, `FAILED`}; nijedna
  druga vrijednost se ne prihvata niti proizvodi;
- `view=original` vraća **dekriptovan, neredigovan, kanonski normalizovan** tekst i traži
  `encounter.document.read_original` uz `DOCUMENT_VIEWED` audit (D-043);
- `view=redacted` bez te permisije radi normalno; **fallback na originalni tekst ne postoji ni u
  jednom slučaju**;
- **čisti eksterni ID nije u nijednom odgovoru** i **nije u logu**;
- Problem Details poruke za PHI i eksterne identifikatore su **generičke** i ne citiraju odbijenu
  vrijednost.

## 12.8 Co-member `displayName` — izostavljanje u Fazi 5 (D-061)

Ove obaveze su **dokumentovane i još neizvršene**, po istom pravilu kao §12.0. **Nijedan test iz
ove sekcije nije implementiran ni izvršen** i njihovo postojanje **ne označava nijednu kućicu**
Faze 5 (`05` §6).

### 12.8.1 Novi testovi oblika odgovora (Faza 5)

1. **`GET /encounters` sa postavljenim odgovornim ljekarom** vraća
   `responsiblePhysician = { "id": "<uuid>" }`; ključ **`displayName` ne postoji u payloadu** —
   provjera je na **odsustvu ključa**, ne na vrijednosti `null`. Test mora pasti i ako se ključ
   pojavi sa `null`, praznim stringom ili placeholderom.
2. **`responsible_physician_id` je `NULL`** → `responsiblePhysician` je **`null`** (cijeli objekat),
   a ne objekat sa `id: null`.
3. **Query filter `responsiblePhysicianId`** i dalje filtrira ispravno — pozitivan slučaj (traženi
   encounter u rezultatu) i negativan slučaj (tuđi odgovorni ljekar nije u rezultatu).
4. **Serviranje `GET /encounters` ne izvršava nijedan `SELECT` nad `users`** radi obogaćivanja
   odgovora. Dokazuje se na nivou izvršenih upita (npr. Prisma query log / statement spy), ne samo
   inspekcijom payloada.

### 12.8.2 Regresije koje moraju ostati nepromijenjene i zelene

Ovi testovi **već postoje** i ova odluka ih **ne mijenja**; ovdje se navode kao obavezan dokaz da
gate nije tiho zaobiđen.

5. **Cross-user direktno čitanje `users`** — korisnik A ne vidi red korisnika B; **nula redova**
   (§21.5.2). Test ostaje **doslovno nepromijenjen**.
6. **`users` ima tačno dvije politike** — `users_bootstrap_subject_select` i `users_self_select`,
   nepromijenjenih imena i tijela. **Treća politika ne postoji.**
7. **`users` column grantovi su nepromijenjeni** — `copilot_app` ima `SELECT` na tačno
   `(id, email, display_name, preferred_language, status)`; `SELECT auth_subject` i
   `SELECT last_login_at` i dalje padaju sa **`42501`**.
8. **`FORCE ROW LEVEL SECURITY` nad `users` je `true`**, kao i `ENABLE`.
9. **`GET /me`** i dalje vraća **vlastiti** `email` i `displayName` nepromijenjeno — caller-self
   pristup nije zahvaćen (`03` §10).

Dodatno, kao dokaz da drugi put nije otvoren posrednim mehanizmom:

10. **`practice_memberships` ima tačno jednu politiku** — `practice_memberships_self_select`,
    caller-self, nepromijenjenog tijela; njen grant je nepromijenjen.

**Trigger za buduće testove.** Pozitivni i negativni testovi co-member vidljivosti (`13` §19.3) se
**ne pišu sada**. Oni pripadaju odluci koja zatvori gate
`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`, a taj se otvara prije prvog stvarnog konzumenta
tuđeg `display_name`-a — tekuće `GET /analyses/{analysisId}/workspace` (Faza 8), ili raniji
konzument, **šta prije nastupi** (D-061, klauzule 14–16).

## 12.9 Schema, referencijalni integritet i validacija odgovornog ljekara (D-062)

Ove obaveze su **dokumentovane i još neizvršene**, po istom pravilu kao §12.0. **Nijedan test iz
ove sekcije nije implementiran ni izvršen** i njihovo postojanje **ne označava nijednu kućicu**
Faze 5 (`05` §6).

### 12.9.1 `★` RI-naspram-RLS dokaz — **blokirajući prije encounter jezgra**

**Ovo je najvažniji test cijele Faze 5 i tvrdi preduslov za slice `P5-I5`.**

Ratifikovani mehanizam validacije `responsiblePhysicianId` (D-062, Dio D) je **composite foreign
key** prema `practice_memberships (practice_id, user_id)`. On počiva na jednoj nosećoj pretpostavci:
**PostgreSQL provjere referencijalnog integriteta zaobilaze row-level security**. Ta pretpostavka je
dokumentovano ponašanje i već je izvršena u ovom repozitoriju kroz
`practice_membership_roles_membership_fk`, ali **nije dokazana nad Faza-5 schemom**.

**Dokaz se izvršava u slice-u `P5-I2`, nad stvarnim PostgreSQL-om, pod stvarnim runtime rolama, u
jednoj transakciji, pod `copilot_app` i uspostavljenim tenant kontekstom:**

1. `INSERT` u `encounters` koji u `responsible_physician_id` imenuje `user_id` **co-membera** — dakle
   **ne** pozivaoca — **uspijeva**;
2. **u istoj transakciji** direktan `SELECT` **tog istog** `practice_memberships` reda vraća
   **nula redova**.

**Oba iskaza moraju vrijediti istovremeno.** Prvi dokazuje da referencijalni integritet radi pod
`FORCE RLS`; drugi dokazuje da RLS **nije** oslabljen da bi prvi prošao. Test koji dokaže samo
prvi je **nevažeći**.

**Neuspjeh je HARD HOLD:** slice `P5-I5` se ne smije započeti, `OD-P5-D2-5` se ponovo otvara i
vraća u dizajn. **Neuspjeh NE autorizuje** slabljenje RLS-a, proširenje
`practice_memberships_self_select`, `SECURITY DEFINER` primitiv, četvrtu rolu ni drugi Prisma
klijent.

Pretpostavka je **fail-loud**: da je netačna, **svaka** cross-member dodjela podigla bi `23503`, pa
bi ovaj test to uhvatio odmah.

**STATUS — IZVRŠENO, NEZAVISNO AUDITIRANO I KANONSKI (D-068, 2026-08-27); zahtjev iznad se ne
uklanja i ne slabi.** Ovaj odjeljak **više ne opisuje budući posao**. Dokaz je izveden
pod-gateom **`P5-I2V`** — implementacijski commit
`5b61a95a990b7179d62aa3338f8685cfa1c605fc`, audit `P5_I2V_I_A_PASS_READY_FOR_PUBLICATION`,
**PR #40**, merge SHA `31de95230da6ff1b97a28e6386ee93b5da19aca5` — i **formalno je zatvoren
(D-068)**.

**Trajni vlasnik dokaza:** `apps/api/test/phase5-responsible-physician-ri.security.ts`
(**13** testova). **`★` je bio TEST-ONLY** — nijedna migracija, schema izmjena, grant, politika,
rola ni izmjena aplikacijskog izvora.

**Oba iskaza su dokazana ISTOVREMENO**, u **jednoj** transakciji, na **istom** `pg.Client`-u, pod
**stvarnim** `copilot_app`-om, **stvarnim** `FORCE RLS`-om i **istim** autentifikovanim
user/practice kontekstom:

```text
A.  same-practice co-member B je PRIHVAĆEN kao encounters.responsible_physician_id
    kroz encounters_responsible_physician_membership_fk, sa tačnom relacijom

        encounters (practice_id, responsible_physician_id)
          ->  practice_memberships (practice_id, user_id)

    I ISTOVREMENO

B.  direktan SELECT tačno tog istog B practice_memberships reda, u istoj
    transakciji i istom kontekstu, vraća NULA REDOVA.
```

Obje polovine su asertirane **zajedno, u jednom strogom poređenju**, pa se **nijedna ne može
izvještavati, citirati ni regresirati zasebno**; polovina B je uzeta **tek nakon** uspjeha
polovine A. **`SQLSTATE 42501` nije polovina B**, i to je zapisano kao **izvršna tvrdnja**, ne
kao proza.

**Kanonske odgovornosti vlasničkog testa — tačno ono što on posjeduje:**

- **tačan katalog FK-a** — puna kataloška identičnost u jednom strogom poređenju cijelog reda;
- **pozicijsko mapiranje kolona FK-a** — `(practice_id, responsible_physician_id)` →
  `(practice_id, user_id)`;
- **`convalidated` / ne-odgodiv / ne inicijalno odgođen** stanje FK-a, uz `MATCH SIMPLE` i
  `NO ACTION` / `NO ACTION`;
- **tačan roditeljski ključ** — `practice_memberships_practice_user_key`, unique, valid, total,
  tačno `(practice_id, user_id)`;
- **tačno `practice_memberships` RLS / `FORCE` / politiku / grant** — `ENABLE` + `FORCE`, **tačno
  jedna** politika `practice_memberships_self_select` (`PERMISSIVE`, `SELECT`, `TO copilot_app`,
  bajt-identična i neoslabljena), `copilot_app` = `SELECT` i ništa drugo, `PUBLIC` i
  `copilot_system` = ništa;
- **fizičko-egzistencijalni diferencijal za `B`** — isti SQL i isti `(P, B)` parametri pod
  `app.user_id = B` vraćaju **tačno jedan** red;
- **same-client / same-transaction dokaz** — `pg_backend_pid()` i `pg_current_xact_id()`, uz
  dokaz da je kontrolna transakcija bila **druga** i rollbackovana **prije** `★`;
- **polovina A uspijeva** — red asertiran kolonu po kolonu, `responsible_physician_id` nije
  `NULL`;
- **polovina B vraća nula redova**;
- **own-membership kontrola** — unutar `★`, vlastiti `P/A` lookup vraća **tačno jedan** red;
- **`42501` je eksplicitno isključen** kao polovina B;
- **no-widening regresija** — tri kanonske role bez `BYPASSRLS`, **nula** `SECURITY DEFINER`
  funkcija nad cijelom bazom, **nijedna** politika nad `practice_memberships` koja cilja
  vlasnika, **§23.4** allowlista **tačno šest**, i dokaz da je AAD trigger nad `encounters`
  **`BEFORE UPDATE` only** i da na `★` **nije mogao okinuti**.

**`HARD HOLD` nije nastupio** i `OD-P5-D2-5` se **ne otvara ponovo**. **`★` ostaje trajna
regresija** — njegovo buduće rušenje je i dalje `HARD HOLD`, uz nepromijenjene zabrane iznad.
**Posljedica:** `P5-I2` je **`COMPLETE` / `VERIFIED` / `CANONICAL` / `FORMALLY CLOSED`**, a
`P5-I5` je **`ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION`** nakon što D-068 postane kanonski —
i **`NOT AUTHORIZED`**.

### 12.9.2 Ugovor validacije odgovornog ljekara

3. **Cross-practice dodjela → `422 VALIDATION_ERROR`**, i **neuspjeh nastaje u bazi** (`23503` nad
   `encounters_responsible_physician_membership_fk`), ne u aplikacijskoj pred-validaciji.
4. Poruka greške je **generička i ne citira nijednu vrijednost** (D-060, klauzule 39–40).
5. **Nema globalnog `23503 → 422` mapiranja** — povreda bilo kojeg **drugog** FK-a ostaje interna
   greška. Dokazuje se negativnim testom nad drugim constraintom.
6. **`responsiblePhysicianId = null` prolazi** — `MATCH SIMPLE` znači da `NULL` ne pokreće FK
   provjeru; `responsiblePhysician` u odgovoru je tada `null`.
7. **Dodjela co-membera sa `active = false` USPIJEVA**, i **dodjela MPA korisnika USPIJEVA** — to su
   **ratifikovane posljedice** (`OD-P5-D2-4`), pa test potvrđuje odluku, a ne defekt.
8. **`PATCH` koji mijenja `responsiblePhysicianId` revalidira istim FK-om**; cross-practice
   vrijednost → `422`.
9. **Historijska perzistencija:** nakon što membership postane `active = false`, encounter i dalje
   nosi isti `responsible_physician_id` i i dalje je čitljiv.

**Imenovani negativni constraint (D-069, `RULING 2`) — stavke iznad se ne mijenjaju.** „Drugi
constraint" iz stavke 5 je u Fazi 5 **imenovan**: **`encounters_patient_reference_fk`**.
Cross-tenant ili nepostojeći `patientReferenceId` obara **taj** FK i **NE SMIJE se mapirati kroz
translator odgovornog ljekara** — on ostaje **izvan** uskog izuzetka `23503 → 422` i **propada u
kanonsku internal-error putanju**. Obavezan negativan test dokazuje da `POST /encounters` sa
cross-tenant `patientReferenceId` **ne** vraća `422`. **Isključivo
`encounters_responsible_physician_membership_fk`** dobija `422 VALIDATION_ERROR`; **globalno
`23503 → 422` ostaje zabranjeno.**

**ANOTACIJA TEKUĆEG STATUSA (D-069, 2026-08-27) — §12.9.1 iznad se ne prepisuje.** Podobnost
`P5-I5` ostaje kako je zapisana, ali **zadovoljen tvrdi preduslov `★` nije ispunjena zavisnost**:
`P5-I5` po `04` §7.5 zavisi i od **`P5-I3`** i od **`P5-I4`**, koji su **`NOT_STARTED`**. **Tekući
izvršni redoslijed je `P5-I3 → P5-I4 → P5-I5`**, a **`P5-I5` je `POLICY-RESOLVED` /
`DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`**. **Checklist Faze 5 ostaje `49 / 9`**;
**Faza 5 ostaje `IN_PROGRESS`.**

### 12.9.3 Katalog referencijalnog integriteta

10. **Svaki FK Faze 5 nosi `confdeltype = 'a'` i `confupdtype = 'a'`** (`NO ACTION`), provjereno iz
    `pg_constraint`. Nijedan `CASCADE`, `RESTRICT` ni `SET NULL` ne postoji.
11. **Osam FK-ova Faze 5 postoji** prema `02` §29.2, uključujući **četiri novodeklarisana**.
12. **Cross-tenant composite FK fail** — "Encounter A → Patient B" mora pasti **na bazi**, ne u
    aplikacijskoj validaciji.
13. **`unique (practice_id, id)` postoji na svih pet** tabela; ukupno **8 od 30** tenant tabela.
14. **Tri nova `CHECK`-a nad `encounter_documents` postoje** i sprovode se: `processing_status` i
    `redaction_status` odbijaju vrijednost izvan vokabulara, a artefakt-konzistencijski `CHECK`
    odbija `COMPLETED` bez `redacted_text_ciphertext`/`redacted_text_hash` i `FAILED` sa njima.
15. **Kombinacija `processing_status = 'FAILED'` uz `redaction_status = 'COMPLETED'` se odbija.**
16. **Četiri indeksa iz `02` §29.6 postoje**, uključujući `encounters_responsible_physician_idx` i
    `id desc` tie-breaker na sva tri encounter indeksa.

**Stavka 14a — potpun katalog `CHECK` constrainata paketa `003`, stroga jednakost punog skupa
(D-063, klauzule 6–8).** Katalog kanonskih imena je u `02` §29.7a. Test **nabraja potpun očekivani
skup** i za **svaki** constraint tvrdi najmanje:

```text
conname
conrelid::regclass          -- tabela vlasnik
pg_get_constraintdef(oid)   -- doslovno tijelo
```

Očekivani skup i stvarni skup iz `pg_constraint` (`contype = 'c'`, nad pet tabela Faze 5) moraju
biti **identični** — nijedan višak, nijedan manjak, nijedno odstupanje u imenu ni u tijelu.
**Mjerodavan sastav je 20 zamrznutih + 3 nova = 23**: `patient_references` 5, `encounters` 6,
`encounter_diagnoses` **0**, `storage_objects` 1, `encounter_documents` 8 + 3. **Raniji broj `18`
je superseded aritmetička greška** i **ne smije se koristiti kao očekivana vrijednost.**

**Numerički total `23` smije se tvrditi dodatno, ali nije primarni autoritet. Test koji provjerava
isključivo `count = 23` je NEDOVOLJAN.** **Postojeća tvrdnja tačnog skupa se nikada ne smije
oslabiti u `contains`/`subset` poređenje** — zabrana je trajna i važi za svaku buduću izmjenu ovog
testa.

**Izvršava se u slice-u `P5-I1`**, uz paket `003`.

### 12.9.4 RLS i grantovi Faze 5 — negativni ugovor

**Statusna napomena (D-066, 2026-08-25) — ovaj odjeljak više ne opisuje budući posao.** Ugovori
17–26e su **implementirani i kanonski** pod-gateom **`P5-I2B`** (implementacijski commit
`6efee207c9ca52a22ca2cdeb97773832931711e7`, audit `P5_I2B_I_A_PASS_READY_FOR_PUBLICATION`,
**PR #36**, merge SHA `0e4d113f0eedddcd2db890180767768c5b422264`). **Trajni vlasnik njihovog
izvršnog dokaza je `apps/api/test/phase5-rls-grants.security.ts`**, uveden tim pod-gateom po
D-064, `OD-9`, dio B. **Izuzeci koji ostaju budući i neizvršeni:** stavka **26c** (behavioural
dokaz AAD trigera) pripada **`P5-I2C`**, koji je **`NOT IMPLEMENTED` i `NOT AUTHORIZED`**, i
**`★` RI-naspram-RLS dokaz** (`phase5-responsible-physician-ri.security.ts`) pripada
**`P5-I2V`**, koji je **`NOT EXECUTED`**. **Dokaz paketa `014` je odsutan.**

**Statusna napomena (D-067, 2026-08-26) — napomena iznad se ne prepisuje.** Njen popis izuzetaka
je tačan **na dan D-066** i **više ne opisuje tekuće stanje**. **Stavka `26c` je izvršena i
kanonska** — pod-gate **`P5-I2C`**, implementacijski commit
`fc6b38cea354f680f88ff9bf75d5e68a84538740`, audit `P5_I2C_I_A_PASS_READY_FOR_PUBLICATION`,
**PR #38**, merge SHA `46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee`, migracija
`20260825214248_014_immutability_triggers_phase5`. **Trajni vlasnik njenog izvršnog dokaza je
`apps/api/test/phase5-aad-immutability.security.ts`**, uveden tim pod-gateom po D-064, `OD-9`.
**Dokaz paketa `014` više NIJE odsutan.**

**Preostaje tačno jedan izuzetak:** **`★` RI-naspram-RLS dokaz**
(`apps/api/test/phase5-responsible-physician-ri.security.ts`) pripada **`P5-I2V`**, koji je
**`NOT EXECUTED` i `NOT AUTHORIZED`**. **Taj fajl i dalje NE POSTOJI**, i **paket `014` mu ne
doprinosi nijednim dijelom** — `SQLSTATE 42501` nije zero-rows `SELECT` dokaz koji **`★`**
zahtijeva.

**Statusna napomena (D-068, 2026-08-27) — nijedna napomena iznad se ne prepisuje.** Rečenica
„**Preostaje tačno jedan izuzetak**" i tvrdnja „**Taj fajl i dalje NE POSTOJI**" su tačne **na
dan D-067** i **više ne opisuju tekuće stanje**. **`★` je izvršen i kanonski** — pod-gate
**`P5-I2V`**, implementacijski commit `5b61a95a990b7179d62aa3338f8685cfa1c605fc`, audit
`P5_I2V_I_A_PASS_READY_FOR_PUBLICATION`, **PR #40**, merge SHA
`31de95230da6ff1b97a28e6386ee93b5da19aca5`. **Trajni vlasnik njegovog izvršnog dokaza je
`apps/api/test/phase5-responsible-physician-ri.security.ts`**, uveden tim pod-gateom po D-064,
`OD-9` — **13** testova; puni popis odgovornosti je u §12.9.1. **Nijedan izuzetak ne preostaje.**

Tvrdnja da **paket `014` dokazu `★` ne doprinosi nijednim dijelom** **ostaje trajno na snazi** i
sada je i **izvršno dokazana**: AAD trigger nad `encounters` je **`BEFORE UPDATE` only**, pa na
`★`, koji je `INSERT`, **nije mogao okinuti**. **`SQLSTATE 42501` i dalje nije polovina B**, i to
je asertirano, ne tvrđeno prozom.

17. `relrowsecurity` **i** `relforcerowsecurity` su `true` na svih pet tabela — **trajna regresija**.
    > **DOPUNA OBUHVATA — D-066 (tekući autoritet); tvrdnja iznad se ne slabi.** Pet PHI tabela
    > ostaje **doslovno** obavezno. **Puni `FORCE RLS` skup je nakon `P5-I2B` `13 / 13` tenant
    > tabela** — pet PHI tabela, `idempotency_keys`, `audit_events` i šest Faza-3/4 tabela — i
    > **taj puni skup je zatečeno kanonsko stanje**, u vlasništvu
    > `phase5-rls-grants.security.ts`. **`§23.4` maintenance allowlista ostaje na tačno šest
    > tabela** i **nije proširena** (`02` §23.4.4b) — allowlist i `FORCE` skup **nisu isti skup**,
    > i to je namjerno.
18. **Deset novih politika Faze 5** postoji — tačno imenovani katalog `02` §29.4:
    `patient_references_select`, `patient_references_insert`, `encounters_select`,
    `encounters_insert`, `encounters_update`, `encounter_diagnoses_select`,
    `encounter_diagnoses_insert`, `encounter_documents_select`, `encounter_documents_insert`,
    `encounter_documents_update`. **`storage_objects` ima nula politika.**
    > **KOREKCIJA — D-065, `RULING 1` (tekući autoritet).** Ranija formulacija ove stavke —
    > „**Osam novih politika** postoji; ukupno **18** nad **11** tabela" — je **superseded**:
    > PHI politika ima **deset**, ne osam, pa je i izvedeni `18 / 11` netačan. Nezavisno od
    > aritmetike, `18 / 11` je bio i **PHI-only / pre-paket-`011` podzbir** koji se **ne smije
    > koristiti kao exit tvrdnja `P5-I2`** (D-064, `OD-6`, u tom dijelu očuvan). Mjerodavan
    > puni post-`P5-I2B` katalog je **25 politika** nad **13 tabela** sa `ENABLE` + `FORCE`
    > (10 Faza-3/4 + 10 PHI + 3 `idempotency_keys` + 2 `audit_events` = 25; `02` §29.4a).
    > `P5-I2B` uvodi **15** novih politika. **Nijedno ime politike se ne uklanja da bi se stari
    > zbir `23` održao.** Vlasnik te
    > steady-state tvrdnje je **`phase5-rls-grants.security.ts`** (D-064, `OD-9`), koji uz
    > politike posjeduje i tačne table/column grantove, **nula** `PUBLIC`, **nula**
    > `copilot_system` nad Faza-5 tenant objektima, tenant izolaciju i negativno privilegijsko
    > ponašanje. `phase5-schema-catalogue.security.ts` zadržava strukturni katalog paketa `003`
    > i **package-boundary ZERO-CAPABILITY tvrdnju nad samom migracijom `003`**; `★` ostaje u
    > zasebnom `phase5-responsible-physician-ri.security.ts`. Exact-set ekspektacije smiju
    > evoluirati **stari tačan skup → novi tačan skup**; **`exact` → `contains`/`subset`/
    > `partial` ostaje kategorički zabranjeno**.
    >
    > **STATUS — D-066 (2026-08-25).** `phase5-rls-grants.security.ts` **postoji i kanonski je**
    > (`P5-I2B`, PR #36) i **jeste** vlasnik ove steady-state tvrdnje: **25 politika nad 13
    > tabela**, od čega je `P5-I2B` uveo **15**. Evolucija je izvedena **isključivo `stari tačan
    > skup → novi tačan skup`**; **nijedna tvrdnja nije oslabljena** u
    > `contains`/`subset`/`partial`. **Statički package-boundary ZERO-CAPABILITY dokaz paketa
    > `003` je očuvan**, kao i **statički package-boundary dokaz paketa `011`**
    > (`phase5-package011-catalogue.security.ts`) — oba dokazuju **forward SQL svog paketa**, ne
    > tekuće živo stanje, pa ih kanoničnost `P5-I2B` ne obesmišljava. **`★` dokaz
    > `phase5-responsible-physician-ri.security.ts` i dalje NE POSTOJI** — pripada `P5-I2V`,
    > koji je **`NOT EXECUTED`**.
    >
    > **STATUS — D-068 (2026-08-27); status iznad se ne prepisuje.** Zaključna rečenica
    > „**`★` dokaz `phase5-responsible-physician-ri.security.ts` i dalje NE POSTOJI**" je tačna
    > **na dan D-066** i **više ne opisuje tekuće stanje**: taj fajl **postoji i kanonski je**
    > (`P5-I2V`, **PR #40**), i **jeste** trajni vlasnik dokaza **`★`**. **Ova stavka se time ne
    > mijenja** — steady-state katalog **25 politika nad 13 tabela** ostaje u vlasništvu
    > `phase5-rls-grants.security.ts`, a `P5-I2V` **nije uveo nijednu politiku, grant, rolu,
    > migraciju ni schema izmjenu**; `practice_memberships` i dalje nosi **tačno jednu**
    > politiku `practice_memberships_self_select`, **bajt-identičnu i neoslabljenu**, uz
    > `copilot_app` = `SELECT` i ništa drugo.
19. **`copilot_system` ima nula grantova** nad svih pet tabela; **`PUBLIC` nula**.
20. **`storage_objects` nema nijedan grant i nijednu politiku**, i drži **nula redova**.
21. **Tačan skup column-level `UPDATE` kolona** na `encounters` (12 kolona) i na
    `encounter_documents` (**isključivo `archived_at`**); pokušaj `UPDATE`-a nad uskraćenom kolonom
    pada sa **`42501`**.
22. **Bez tenant konteksta svaki `SELECT` daje nula redova** (fail-closed).
23. **Nijedna politika Faze 5 ne sadrži podupit** i **nijedna ne referencira `users` ni
    `practice_memberships`** — provjerljivo iz tijela politika.
24. **Nema nove role, `BYPASSRLS`-a, `SECURITY DEFINER` funkcije, četvrte role, drugog Prisma
    klijenta ni treće `users` politike.**
25. **`practice_memberships_self_select` je bajt-identična** svom Faza-4 tijelu, i njen grant je
    nepromijenjen. **`users` i dalje ima tačno dvije politike.**
26. **`FORCE RLS` allowlista ostaje na šest tabela** — nijedna PHI tabela nije u njoj i nijedna nije
    seedana (`02` §23.4.4b).

**Stavka 26a — Faza-5 slice paketa `011`, sigurnosni preduslov odgođen u `P5-I2` (D-063, klauzule
3–5).** Faza-5 slice paketa `011` (`idempotency_keys`, `audit_events`) **ne izvršava se u
`P5-I1`**. Prije njegovog izvršenja `P5-I2` mora, za **svaku** od te dvije tabele, objaviti i
testom pokriti: paket koji je kreira · redoslijed izvršenja · `ENABLE ROW LEVEL SECURITY` ·
`FORCE ROW LEVEL SECURITY` · tačna tijela politika · tačne runtime grantove po roli · **negativne
grantove** (`copilot_system` = **nula**, `PUBLIC` = **nula**) · tenant predikat · katalog tvrdnje.

**Nijedna runtime rola ne smije imati `SELECT`, `INSERT` ni `UPDATE` nad tim tabelama prije nego
što je njena ograničavajuća tenant politika na snazi**, a **cross-practice čitljivost
`audit_events` je kategorički zabranjena** — negativni test je **trajna regresija**.

**Stavka 26b — objavljena enumeracija (D-064, `OD-1`–`OD-3`); IMPLEMENTIRANA I KANONSKA
(D-066).** Obaveza iz stavke 26a je **ispunjena** i **izvršno pokrivena** —
`phase5-rls-grants.security.ts`, `P5-I2B`, PR #36. Tačan katalog je `02` §29.4a. Testovi
`P5-I2B` tvrde: `idempotency_keys`
= `SELECT` + `INSERT` + **column-level** `UPDATE` nad **tačno** `response_status`,
`response_body`, `locked_at`, `completed_at`, **bez** `DELETE`/`TRUNCATE`/blanket `UPDATE`-a, uz
**tri** politike (`idempotency_keys_select|insert|update`, `UPDATE` sa `USING` **i**
`WITH CHECK`); `audit_events` = **samo** `SELECT` + `INSERT`, **bez** `UPDATE`/`DELETE`/
`TRUNCATE`, uz **dvije** politike (`audit_events_select|insert`); `copilot_system` i `PUBLIC` =
**nula** nad obje. Pokušaj `UPDATE`-a nad uskraćenom kolonom `idempotency_keys` pada sa
**`42501`**.

**Stavka 26c — behavioural test AAD trigera, korigovan (D-064, korekcija B; `02` §25.8a).
BUDUĆA — vlasništvo `P5-I2C`, koji je `NOT IMPLEMENTED` i `NOT AUTHORIZED` (D-066).**
**Ne smije se tražiti** `SQLSTATE 23514` od `copilot_migrator`-a nad **produkcijskom** Faza-5
tabelom nakon `FORCE RLS`-a — migrator je i sam podložan `FORCE RLS`-u i nema primjenjivu
politiku, pa red možda ne stigne do `BEFORE UPDATE` trigera. Dokaz se dijeli na **tri**:
(1) **atačiranje/katalog** nad stvarnim tabelama — **tačno 3** trigera, tačna imena,
`BEFORE UPDATE`, `FOR EACH ROW`, **bez `WHEN`**, tačna ciljna funkcija; (2) **runtime prva
barijera** — `copilot_app` mutacija `id`/`practice_id` odbijena grantom/RLS-om, **bez tvrdnje
da to dokazuje izvršenje trigera**; (3) **ponašanje funkcije** — **isključivo na guarded
disposable bazi**, na **test-only privremenoj** tabeli sa `id` + `practice_id` i **istom
kanonskom** funkcijom: zaštićena kolona → **`23514`**, nepromijenjene kolone → `NEW` / uspjeh,
objekat nestaje ili se rollbackuje. **Bez** owner politike, četvrte role, `BYPASSRLS`-a, trajne
test tabele i proširenja produkcijskog granta.

**STATUS — IZVRŠENO I KANONSKI (D-067, 2026-08-26).** Kvalifikacija „**BUDUĆA — vlasništvo
`P5-I2C`, koji je `NOT IMPLEMENTED` i `NOT AUTHORIZED`**" u naslovu stavke je **tačna na dan
D-066** i **više ne opisuje tekuće stanje**. Sva **tri** propisana dokaza su izvedena i trajno su
u vlasništvu `apps/api/test/phase5-aad-immutability.security.ts` (`P5-I2C`, **PR #38**):

- **(1) atačiranje/katalog** — **tačno tri** ne-interna trigera u schemi, tačna imena,
  `BEFORE UPDATE`, `FOR EACH ROW`, **bez `WHEN`**, **bez `UPDATE OF`**, tačna ciljna funkcija
  `app_security.reject_aad_bound_column_change()`; uz to **`app_security` = 4 funkcije**, sve
  `SECURITY INVOKER`, **nijedan `SECURITY DEFINER` nigdje u bazi**, i **tačan ACL** funkcije
  (`PUBLIC`, `copilot_app`, `copilot_system` = **nula** `EXECUTE`);
- **(2) runtime prva barijera** — stvarni `copilot_app` nad sve tri stvarne Faza-5 tabele pada sa
  **`42501`**, uz **eksplicitnu tvrdnju da to NE dokazuje izvršenje trigera** i da
  **`42501 ≠ 23514`**;
- **(3) ponašanje funkcije** — na **guarded disposable bazi**, nad **test-only privremenom**
  tabelom sa **istom kanonskom** funkcijom: izmjena **samo `id`** → **`23514`**, izmjena **samo
  `practice_id`** → **`23514`**, uz kanonsku poruku
  `AAD-bound column (id, practice_id) is immutable after INSERT`; **ne-AAD `UPDATE` uspijeva**,
  **dodjela iste vrijednosti uspijeva**, i **nijedan test objekat ne preživi**.

**Nijedna zabrana nije prekršena:** bez owner politike, četvrte role, `BYPASSRLS`-a, trajne test
tabele i proširenja produkcijskog granta; **`FORCE RLS` nije oslabljen**. **Produkcijski
`SQLSTATE 23514` od migratora se ni ovdje ne traži i nije tvrđen.**

**Obuhvat je tri trigera, ne pet.** `candidate_evidence_aad_immutable_trg` i
`external_resource_links_aad_immutable_trg` **ostaju budući** — njihove tabele u Fazi 5 ne postoje
(`02` §22.14). **Nijedna asercija ne tvrdi da svih pet trigera postoji.**

**Stavka 26d — eksplicitna transakcija migracije `P5-I2B` (D-065, `RULING 2`; `02` §29.4a.0).**
Faza-5 migracija paketa `013` mora nositi **tačno jednu eksplicitnu `BEGIN` / `COMMIT`
transakcijsku granicu najvišeg nivoa**, doslovno napisanu u `migration.sql`. **`REVOKE`,
`GRANT`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` i `CREATE POLICY` za svih
sedam tabela `P5-I2B` idu unutar te iste transakcije**, **bez međukoraka `COMMIT`** i **bez
transakcijski prekidajućeg iskaza**. **Dokaz atomičnosti se ne smije oslanjati na pretpostavku
da Prisma implicitno omotava `migration.sql` u transakciju** — ta pretpostavka je **zabranjena
kao osnov sigurnosne tvrdnje**. Ovo je izvršni mehanizam obaveze iz D-064, `OD-1`, i **vrijedi
specifično za ovu migraciju**; D-065 ne uvodi opštu projektnu politiku transakcijskog omotavanja
migracija.

**STATUS — ISPUNJENO I KANONSKI (D-066, 2026-08-25).** Ranija napomena „ova stavka opisuje
budući, još neautorizovan `P5-I2B`" je **historijska** i više ne opisuje tekuće stanje. Kanonska
migracija `20260825013452_013_rls_policies_phase5/migration.sql` nosi **tačno jedan** `BEGIN` i
**tačno jedan** `COMMIT` na najvišem nivou, sa svih **15** `CREATE POLICY` iskaza te svim
`REVOKE`, `GRANT`, `ENABLE RLS` i `FORCE RLS` iskazima unutar te iste transakcije. **Taj ugovor
je izvršno dokazan statički**, nad samim tekstom migracije, u
`apps/api/test/phase5-rls-grants.security.ts`.

**Stavka 26e — zastarjeli komentari u testovima (D-065).** Neizvršni komentari u
`phase3-schema-catalogue.security.ts` i `phase5-schema-catalogue.security.ts` koji §29.4 opisuju
kao „eight policies" su **zastarjeli i podređeni** korigovanoj kanonskoj dokumentaciji — tačno
je **deset**. **Nijedna izvršna asercija tih fajlova nije zahvaćena** (one tvrde **nula**
politika nad pet PHI tabela i **tačno deset** politika u cijeloj šemi, što je i dalje tačno
zatečeno stanje). Komentari se ispravljaju **isključivo** u zasebno autorizovanom
implementacijskom gateu `P5-I2B`, zajedno sa evolucijom exact-set asercija po D-064, `OD-9` —
**stari tačan skup → novi tačan skup**, nikada `exact` → `contains`/`subset`/`partial`.

**STATUS — IZVRŠENO (D-066, 2026-08-25).** Gate `P5-I2B` je izvršen i kanonski (PR #36).
Zastarjela komentarska formulacija i exact-set asercije oba fajla su evoluirale **u tom gateu i
nigdje drugdje**, isključivo **stari tačan skup → novi tačan skup**. **Nijedna tvrdnja nije
oslabljena** u `contains`/`subset`/`partial`, i **nijedna primijenjena migracija nije editovana.**

### 12.9.5 Semantika arhive, statusa i odsutnih površina

27. **Arhivirani dokument nije u `GET …/documents`**, ali **jest** na `GET …/documents/{id}`, sa
    prisutnim `archivedAt`.
28. **Ponovno arhiviranje već arhiviranog dokumenta je idempotentan uspjeh**, ne `409`.
29. **`includeArchived` parametar ne postoji** i nepoznat query parametar se odbija.
30. **`processingStatus` je `READY` na svakom redu kreiranom u Fazi 5** — `FAILED` procesiranje je
    nedosežno na manuelnoj putanji, jer neuspjela normalizacija daje `422` i **ne kreira red**.
31. **`latestAnalysis`, approval/export blok i `hasBlockingFindings` su odsutni** — provjera je na
    **odsustvu ključa** nad **sirovim** payloadom, ne na vrijednosti `null`; nepoznat query parametar
    **odbijen**.
32. **`sort` prihvata isključivo `treatmentDate desc, id desc`**; cursor kodira `(treatment_date,
    id)` i **nikada pseudonim**; nevalidan cursor → `400 INVALID_CURSOR`.
33. **`PATCH /encounters` prihvata tačno osam polja**; `status`, `patientReferenceId`,
    `sourceSystem`, `version` i `diagnoses[]` su odbijeni.
34. **Cancel `reason` se ne perzistira u `encounters`**, zapisuje se **sanitizovan** u audit i **ne
    vraća se** ni u jednom odgovoru.

---

## 12.10 `P5-I4A` — facade granica i `GET /patient-references/{id}` (D-072, `OD-P5-I4-12`, `OD-P5-I4-13`)

**Sekcije §12.0–§12.9 se NE prepisuju.** Ovo su **dokumentovane, još neizvršene** obaveze
objavljene odlukom **D-072**. **Nijedan test iz §12.10–§12.12 nije implementiran ni izvršen**, i
njihovo postojanje **ne označava nijednu kućicu Faze 5** (`05` §6). **`P5-I4` je `NOT AUTHORIZED` /
`NOT STARTED`.**

**Obavezni dokazi `P5-I4A` — obje klase su obavezne; lint pravilo samo po sebi NIJE dovoljno:**

1. **Statički import/source-boundary test.** Trajan test koji dokazuje da `P5-I4` poslovni i
   aplikacijski kod **ne može direktno koristiti** `PrismaService`, `PrismaClient` ni sirove
   database client primitive **izvan ovlaštenog facade/adapter sloja**.
2. **Bihevioralni recording-session / fake-session test.** Trajan test koji dokazuje: korištenje
   **postojeće admitted pinovane sesije**; **nijednu drugu, ugniježdenu ni paralelnu transakciju**;
   **tenant kontekst uspostavljen prije** poslovnog iskaza; **tačan redoslijed** izvršenih iskaza;
   i **nikakav caller-supplied identitet**.
3. **Ponovni dokaz D-054, klauzula 6–10** trajnim testovima, po D-056, klauzuli 5.
4. **`GET /patient-references/{id}` — tenant-scoped read.** Isti tenant, postojeći resurs → `200`
   sa kanonskim tijelom iz `03` §11.
5. **Nepostojeći `id` i cross-tenant `id` → NERAZLUČIV `404`.** Tijelo, kod, poruka i osmotrivo
   ponašanje moraju biti **identični**.
6. **Bez existence oracle-a.** Nijedna razlika u statusu, poruci, redoslijedu polja, zaglavljima ni
   mjerljivom ponašanju ne smije razlikovati „ne postoji" od „postoji u drugoj ordinaciji".

## 12.10a `P5-I4A` — tenant scope, malformisan resource ID i wire timestamp (D-073, `OD-P5-I4A-1..3`)

**§12.10 se NE prepisuje.** Ovo su **aditivne**, još neizvršene obaveze objavljene odlukom
**D-073**. **Nijedan test iz ove sekcije nije implementiran ni izvršen**, i njihovo postojanje
**ne označava nijednu kućicu Faze 5** (`05` §6 — i dalje **`49 / 14`**). **`P5-I4A` je
`NOT AUTHORIZED` / `NOT STARTED`.**

### Dokazi `OD-P5-I4A-1` — tenant request scope

1. **Postojeće practice rute eksplicitno vježbaju `PRACTICE_PATH` ponašanje** — practice read,
   practice settings `GET` i practice settings `PATCH` prolaze varijantu koja **nosi obavezan**
   path `practiceId` i **stvarno ga poredi** sa admitted header kontekstom.
2. **`GET /patient-references/{id}` koristi `HEADER_ONLY`** — test dokazuje da ruta **ne prima
   nikakav path/caller `practiceId`** i da se admitted `practiceId` izvodi **isključivo** iz
   validiranog header/kontekst puta.
3. **Opcioni `requestedPracticeId` seam je zabranjen** — trajan dokaz da varijantni ugovor **ne
   dopušta** `requestedPracticeId?: string` ni `requestedPracticeId: string | undefined`.
4. **Lažno poređenje headera kao patha je zabranjeno** — dokaz da se vrijednost headera **ne
   prosljeđuje nazad** kao path `practiceId` i da se **header-izvedeni `practiceId` nikada ne
   poredi sa samim sobom**.
5. **Tačno jedan tenant admission pipeline** (`TENANT_ADMISSION_PIPELINE_COUNT = 1`) — dokaz da
   **ne postoji** drugi, zasebni ni slabiji admission put, i da se `TenantRequestPipeline` **ne
   zaobilazi**.
6. **Dijeljeni koraci nakon obrade varijante** — dokaz da su postojanje ordinacije,
   `practices.status`, aktivan membership, uspostava konteksta i provjera permisije **identični**
   za `PRACTICE_PATH` i `HEADER_ONLY`.
7. **Regresija neslaganja patha i headera** — postojeće `PRACTICE_PATH` rute i dalje vraćaju
   kanonsko **`403 ACCESS_DENIED`**, nepromijenjeno.

### Dokazi `OD-P5-I4A-2` — malformisan resource ID i zaštićeni `404` par

8. **Malformisan `{id}` → `400 VALIDATION_ERROR`**
   (`MALFORMED_PATIENT_REFERENCE_ID = 400 VALIDATION_ERROR`), po postojećoj repozitorijskoj
   UUID-shape semantici.
9. **Statičan `detail`** — Problem Details tijelo je nepromjenljivo i ne zavisi od ulaza.
10. **`id` se ne odražava** — ni cijel, ni skraćen, ni kao prefiks ili sufiks; **nikakav namjenski
    field error** samo za ovaj slučaj.
11. **Nula čitanja baze** (`MALFORMED_RESOURCE_UUID_DB_READS = 0`) — dokaz da **nijedan
    `patient_references` upit nije izvršen** i da **nikakav cross-tenant lookup** ne postoji.
12. **Validan, nepostojeći `id` → `404 RESOURCE_NOT_FOUND`.**
13. **Validan cross-tenant `id` → ISTI `404 RESOURCE_NOT_FOUND`**
    (`CROSS_TENANT_PATIENT_REFERENCE_GET = 404 RESOURCE_NOT_FOUND`).
14. **Zaštićeni `404` par je osmotrivo nerazlučiv** — identično tijelo, kod, poruka, redoslijed
    polja, zaglavlja i mjerljivo ponašanje; **nikakav existence oracle** (`09` §18.1, `T1`).

### Vektori `OD-P5-I4A-3` — javni `createdAt` wire format

15. **Puna sekunda:**

```text
ulazni instant   2026-07-18T10:00:00Z
wire             2026-07-18T10:00:00.000Z
```

16. **Milisekunde:**

```text
ulaz             2026-07-18T10:00:00.123Z
wire             2026-07-18T10:00:00.123Z
```

17. **Negativne tvrdnje** — dokaz da javni `createdAt` **nikada** ne nosi locale serijalizaciju,
    **nikada** `+00:00` i **nikada** šest decimalnih cifara. Format je
    `PATIENT_REFERENCE_CREATED_AT_FORMAT = UTC_ISO8601_MILLISECONDS_Z` sa serijalizatorom
    `PATIENT_REFERENCE_CREATED_AT_SERIALIZER = DATE_TO_ISO_STRING`.
18. **Razdvajanje od audit hash timestampa** — dokaz da se `AUDIT_OCCURRED_AT_FORMAT =
    UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO` (D-072, `OD-P5-I4-4`; §12.11) **ne primjenjuje**
    na javni `createdAt`, i obrnuto. **Nisu konkurentski formati**; upravljaju različitim
    površinama.

**Nijedan test iz §12.10a nije implementiran ni izvršen, i D-073 ih ne izvršava.** Kada `P5-I4A`
bude zasebno autorizovan, ove obaveze su **obavezan izvršiv ugovor** po istom pravilu kao §12.10
(§26.2) i **ne izostavljaju se tiho**. Checklist Faze 5 je i dalje **`49 / 14`** (`05` §6). Vidi
D-073 u `06`, `04` §7.5a i `03` §11.

**STATUSNA ANOTACIJA (D-074, 2026-08-30) — §12.10 i §12.10a se NE prepisuju i NE proširuju.**
D-074 evidentira vlasničku autorizaciju implementacije `P5-I4A`
(`P5-I4A IMPLEMENTATION AUTHORIZATION DECISION = APPROVED`) i **ne dodaje nijednu novu dokaznu
obavezu niti ijednu uklanja**. Obavezni dokazi `P5-I4A` ostaju **tačno** §12.10 i §12.10a, uz
**obje obavezne dokazne klase facadea** iz §12.10 (statički import/source-boundary i bihevioralni
recording-session dokaz). **Nijedan test iz §12.10 ni §12.10a nije implementiran ni izvršen, i
D-074 ih ne izvršava** i ne tvrdi nijedan rezultat. Autorizacija postaje operativno efektivna
**tek nakon što D-074 bude vlasnički prihvaćen, kanonski i publikaciono verifikovan**, a
implementacija smije početi **tek nakon zasebnog gatea izvršenja**; formulacija „kada `P5-I4A`
bude zasebno autorizovan" iznad opisuje **pred-D-074 stanje** i **ne prepisuje se**. Checklist
Faze 5 je i dalje **`49 / 14`** uz **`PHASE5_CHECKBOX_TRANSITIONS = 0`**. **`P5-I4B`, `P5-I4C`,
`P5-I5` i `P5-I6` ostaju `NOT AUTHORIZED`**, pa §12.11 i §12.12 ostaju **neautorizovane**. Vidi
D-074 u `06`, `04` §7.5a, `05` §6 i `03` §11.

**DOKAZNO PRECIZIRANJE (D-075, 2026-08-30) — §12.10 i §12.10a se NE prepisuju i NE slabe.**
D-075 **ne dodaje nijednu novu dokaznu obavezu** i **nijednu ne uklanja**; on **precizira kako se
mjere već postojeće tačke 8–11 iznad**, i to isključivo u dijelu koji je nezavisni vlasnički
review `P5-I4A` prijavio kao ambiguitetan: odnos zabrane odražavanja malformisanog `{id}`-a i
**cross-cutting** RFC 9457 člana **`instance`**, koji **dijeljeni globalni Problem Details filter**
popunjava **uniformno za svaku rutu** iz **request targeta** (`03` §8, §3.5, D-008).

```text
MALFORMED_ID_NO_REFLECTION_EXTENDS_TO_SHARED_INSTANCE = NO
```

Za **malformisane identifikatore**, dokaz mora biti precizan ovako:

- **status**, **`code`**, **`title`**, **`detail`** i **svi endpoint-autorski semantički članovi**
  su **invarijantni preko različitih malformisanih ulaza** (tačka 9 se mjeri nad tim članovima);
- **nema `errors[]`** i **nema namjenskog field errora** za ovaj slučaj (tačka 10);
- **nema echo-a malformisanog identifikatora** ni u jednom **endpoint-autorskom** semantičkom
  članu — ni cijelog, ni skraćenog, ni kao prefiks/sufiks, ni transformisanog ili enkodiranog, i
  **nema nijednog novouvedenog člana odgovora** koji bi ga nosio (tačka 10);
- **`instance` smije i dalje biti jednak dijeljenom request targetu** — on je cross-cutting
  metapodatak dijeljenog filtera, **nije endpoint-autorski član**, i **izuzima se** iz sweepa
  odražavanja, tačno kao u postojećim kanonskim sigurnosnim testovima Faze 3 i Faze 4;
- **`requestId` smije varirati** kao korelacijski metapodatak (`03` §3.5);
- **`MALFORMED_RESOURCE_UUID_DB_READS = 0`** ostaje obavezan dokaz (tačka 11) — **nijedan
  `patient_references` upit** i **nikakav cross-tenant lookup**;
- **nikakva razlika u odgovoru zavisna od postojanja resursa**, tenant vlasništva ni stanja baze.

**Nijedan postojeći dokaz se ne slabi.** Dokazi **zaštićenog `404` para** (tačke 12–14),
**nula-čitanja resursa** (tačka 11), **tenant admissiona** (tačke 1–7), **RLS-a** (§12.9.4) i
**svaki drugi `P5-I4A` sigurnosni dokaz** ostaju **doslovno na snazi**. Kada se za **nepostojeću**
i za **cross-tenant** patient reference koristi **isti request target**, `instance` je **nužno
identičan**, pa se ekvivalencija `404` para **ne popušta**.

**Nijedan test iz §12.10 ni §12.10a nije implementiran ni izvršen, i D-075 ih ne izvršava** i ne
tvrdi nijedan rezultat. Checklist Faze 5 je i dalje **`49 / 14`** uz
**`PHASE5_CHECKBOX_TRANSITIONS = 0`**. **Nikakva izmjena koda nije autorizovana odlukom D-075**;
implementacijski kandidat `P5-I4A` ostaje **nekanonski** i traži **zasebnu re-adjudikaciju**.
**`P5-I4B`, `P5-I4C`, `P5-I5` i `P5-I6` ostaju `NOT AUTHORIZED`.** Vidi D-075 u `06`, `03` §11 i
`04` §7.5a.

## 12.11 `P5-I4B` — deterministički formati bez baze (D-072, `OD-P5-I4-3`, `OD-P5-I4-4`, `OD-P5-I4-5`)

**Svi dokazi ove sekcije su DB-free.** Formati su **perzistentni i retroaktivno nepopravljivi**, pa
**moraju** biti pinovani **doslovnim** vektorima. **Implementacija ne smije generisati vlastite
očekivane vrijednosti.**

**RFC 8785 (JCS):**

1. **Službeni/javni JCS vektori** sa **doslovnim očekivanim kanonskim izlazima**, uključujući
   kanonizaciju brojeva, escapiranje stringova i sortiranje ključeva po UTF-16 code unitima.
2. **Lokalna implementacija** — **nijedan JCS paket**; **reducirani vlastiti podskup se ne smije
   predstavljati kao JCS**.

**`request_sha256` (`VALIDATED_ORIGINAL_PARSED_BODY`):**

3. **Pinovani fiksni vektori** — doslovni digesti za najmanje jedno kanonsko tijelo po obaveznom
   endpointu iz §4 (nepromijenjena obaveza iz §9).
4. **`null` naspram odsutnog polja → RAZLIČIT digest.**
5. **Različit ulazni redoslijed ključeva → ISTI digest.**
6. **Različit redoslijed elemenata niza → RAZLIČIT digest.**
7. **Whitespace ulaznog JSON-a → ISTI digest.**
8. **Isključena server/request-context polja** — metod, path, query, headeri, `Idempotency-Key`,
   identitet korisnika i ordinacije, request id, server timestampovi i server-generisani id-evi →
   **ISTI digest**, jer nijedno nije ulaz.
9. **Hashira se sačuvano ORIGINALNO parsirano tijelo**, ne DTO, ne instanca klase i ne
   server-defaultovana reprezentacija: dodavanje server defaulta **ne smije** promijeniti digest
   ekvivalentnog zahtjeva, a **nepoznato polje se odbija prije hashiranja**.

**`AUDIT_EVENT_HASH_PAYLOAD_V1`:**

10. **Vektori audit payloada** sa doslovnim očekivanim `event_sha256` vrijednostima.
11. **Tačno sedamnaest ključeva**, imena kolona baze; **`event_sha256` je isključen**.
12. **`previous_event_sha256` je prisutan kao `null`** i **nikada izostavljen**.
13. **`occurred_at` u obliku `.SSS000Z`** — šest decimalnih cifara, **posljednje tri `000`**, UTC;
    isti instant koji se perzistira.
14. **UUID vrijednosti su male kanonske hyphenated stringove**; nullable UUID kolone su `null`.
15. **`previous_value`, `new_value` i `metadata` su JSON vrijednosti, ne JSON stringovi.**
16. **`session_id_hash`, `ip_address` i `user_agent_hash` su `null`** — **nikakva `inet`
    serijalizacija se ne testira ni ne izmišlja.**

## 12.12 `P5-I4C` — idempotencija, konkurencija, audit i `POST /patient-references` (D-072)

1. **Nedostajući `Idempotency-Key` → `400 IDEMPOTENCY_KEY_REQUIRED`**, statična poruka;
   **`428` se ne pojavljuje.**
2. **Replay:** isti ključ + isti hash → **rekonstruisano kanonsko `201` tijelo** iz cashiranog
   `resourceId`; **jedan** poslovni red.
3. **Konflikt:** isti ključ + drugi hash → **`409 IDEMPOTENCY_CONFLICT`**.
4. **Nezavršen claim → `409 REQUEST_ALREADY_IN_PROGRESS`**; **bez stale-claim takeovera.**
5. **Konkurencija:** paralelni zahtjevi sa istim ključem → **tačno jedna** poslovna posljedica;
   gubitnik dobija `409 REQUEST_ALREADY_IN_PROGRESS`.
6. **Ponašanje advisory locka:** **neblokirajuće** pribavljanje; **transaction-scoped**
   oslobađanje na commitu i na rollbacku; **pinovani vektori** enkodiranih bajtova scopea i
   očekivanog **signed int64** ključa; **lock ključ se ne perzistira ni ne logira**.
7. **Pet pokušaja pri koliziji pseudonima:** deterministički mockan CSPRNG seam koji vraća pet
   uzastopnih kolizija → **`500 INTERNAL_ERROR`**, statično ne-PHI tijelo; **svaki pokušaj koristi
   svjež kandidat**; **nijedan kandidat, broj pokušaja ni broj kolizija nije osmotriv**.
8. **Šesti scenarij:** kolizija na prva četiri pokušaja i uspjeh na petom → **`201`**.
9. **Duplirana eksterna referenca → `409 PATIENT_REFERENCE_ALREADY_EXISTS`**; **nijedno polje
   postojećeg reda nije u odgovoru**; **nema `200` fallbacka**; **nema pre-reada**.
10. **`sourceSystem` — samo `MANUAL`:** `AXENITA`, `CSV`, `FHIR` i `OTHER` → **`422
    VALIDATION_ERROR`**.
11. **Generičko, ne-reflektujuće `422`:** poruka **ne citira** poslanu vrijednost, ni za
    `sourceSystem`, ni za `externalPatientReference`, ni za bilo koje drugo polje.
12. **Servisni lookup po pseudonimu:** kanonska uppercase kanonizacija, aditivan v1 validator
    sintakse, **tenant-scoped obična jednakost**, **bez `LOWER()`/`citext`/posebne kolacije**;
    pseudonim druge ordinacije se **ne nalazi**. **Nema HTTP rute.**
13. **Servisni lookup po eksternoj referenci:** `MANUAL` v1 normalizacija → domen
    `patient_external_ref` → admitted `practice_id` → HMAC → tenant-scoped jednakost; ista
    vrijednost u drugoj ordinaciji se **ne nalazi**. **Nema HTTP rute.**
14. **Atomarnost transakcije:** injektovan neuspjeh audit `INSERT`-a → **nijedan** `patient_references`
    red i **nijedan** completed idempotency zapis; injektovan neuspjeh poslovnog `INSERT`-a →
    **nijedan** audit red.
15. **Audit obuhvat:** uspješan `POST` piše **tačno jedan** red
    `PATIENT_REFERENCE_CREATED` / `PATIENT_REFERENCE` / `USER`; **`GET` ne piše nijedan**;
    **neuspješan `POST` ne piše nijedan.**
16. **Rekomputacija iz pohranjenog reda:** iz **stvarnog** `audit_events` reda rekonstruisati svih
    sedamnaest vrijednosti i **reprodukovati tačan `event_sha256`**. Hashiranje in-memory objekta
    prije `INSERT`-a **ne zadovoljava**.
17. **Audit minimizacija:** `previous_value = null`, `new_value = null`,
    `metadata = {"sourceSystem":"MANUAL"}`; **nema pseudonima, `birthYear`-a, `sexCode`-a, HMAC-a,
    sirove eksterne reference ni sirovog tijela zahtjeva.**
18. **Nema plaintext eksternog ID-a nigdje:** ni u perzistenciji, ni u logu, ni u Problem Details
    tijelu, ni u auditu — uključujući putanje grešaka `422`, `409` i `500`.

**Nijedan test iz §12.10–§12.12 nije implementiran ni izvršen, i D-072 ih ne izvršava.** Kada
`P5-I4` bude zasebno autorizovan, ove obaveze su **obavezan izvršiv ugovor** po istom pravilu kao
§21.6 i §21.7 (§26.2) i **ne izostavljaju se tiho**. Checklist Faze 5 je i dalje **`49 / 14`**
(`05` §6). Vidi D-072 u `06` i `04` §7.5a.3.

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

**Faza-5 audit hash — SELF-HASH ONLY (D-069, `RULING 5`).** Stavka „integrity hash deterministic"
iznad se **ne mijenja**, ali se **precizira**: u Fazi 5 **nema predecessor lanca**.

- **`previous_event_sha256 = NULL`** za **svaki** Faza-5 audit događaj. **Nijedan test ne smije
  tvrditi da Faza 5 implementira linearni hash lanac**; per-practice, per-resource i globalno
  ulančavanje su **odgođeni** u kasniju governance odluku.
- **`event_sha256` = SHA-256 nad RFC 8785 (JCS) kanonskom reprezentacijom konačnog pohranjenog
  audit payloada, bez samog `event_sha256`**; UTF-8; **64 mala heksadecimalna znaka**; **JSON
  ključevi su imena kolona baze**; tačan skup polja je u `04` §7.5a.2.

Obavezni testovi:

- **determinizam** — isti pohranjeni događaj, različit ulazni redoslijed ključeva → **isti**
  digest; pinovan literalni vektor;
- **`previous_event_sha256` je u payloadu prisutan kao `null`**, ne izostavljen — izostavljanje
  daje **različit** digest i mora biti odbijeno;
- **`event_sha256` nije dio payloada** koji se hashira;
- **`id` i `occurred_at` u pohranjenom redu su bajt-identični onima korištenim pri hashiranju** —
  „generiši ponovo tokom `INSERT`-a" mora pasti;
- **`previous_value`, `new_value` i `metadata` se hashiraju u konačnom sanitizovanom obliku**, pa
  hash nikada ne pina nesanitizovan PHI (`02` §15.4; `09` §12);
- **rekomputacija nad pohranjenim redom reproducira `event_sha256`**.

**Vlasnik implementacije i ovih testova je slice `P5-I4`** (`04` §7.5a). **`P5-I5` audit writer
konzumira nepromijenjen.**

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
  `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` nije tiho zaobiđen (`13` §19). **D-061 ovaj test
  ne mijenja** — on ostaje doslovno nepromijenjen i mora ostati zelen (§12.8.2, red 5).

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

# 21.6 D-048 i D-051 — `FORCE RLS` steady state i user-scoped RLS u fazi 3

**Normativne odluke: D-048 i D-051.** Nivo: security/RLS integration nad stvarnim PostgreSQL-om.
**Vlasništvo: paket `002_identity_and_practices`, faza 3.** Normativni izvor za očekivanja:
`02` §17.0, §17.2, §17.4, §20.4, §23.4, §25.1.2 i §25.1.4.

## 21.6.1 Steady-state `FORCE RLS` (D-048)

Za **svaku** tabelu sa allowliste faze 3 — `users`, `practices`, `practice_membership_roles`,
`platform_role_assignments`:

- `relrowsecurity = true` **nakon migracije**;
- `relforcerowsecurity = true` **nakon migracije**;
- `relrowsecurity = true` **nakon seeda**;
- `relforcerowsecurity = true` **nakon seeda**.

Ovo je **trajni regresijski test**, ne jednokratna provjera.

## 21.6.2 Maintenance prozor (D-048)

- protokol se izvršava u **jednoj eksplicitnoj transakciji**; autocommit varijanta je odbijena;
- unutar prozora vrijedi `relrowsecurity = true` i `relforcerowsecurity = false`;
- pouzdani seed DML unutar prozora **uspijeva**;
- isti DML **bez** prozora, nad tabelom sa `FORCE RLS`, **pada** — dokaz da prozor rješava stvaran
  problem, a ne pretpostavljen;
- neuspjela restore asercija **podiže izuzetak i abortira transakciju**;
- **prekinut ili neuspio seed ne ostavlja `FORCE` isključenim** — nakon rollbacka obje zastavice su
  ponovo `true`. Ovo je obavezan test, ne opcioni;
- pokušaj nad tabelom **izvan allowliste** je odbijen **prije** bilo kakvog `ALTER TABLE`-a;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` se **ne pojavljuje** ni u jednoj forward migraciji
  ni seed skripti — statička provjera izvora; rollback skripte su izuzete (`02` §23.4.5);
- unutar prozora se ne izvršava **nijedan nepovezani sigurnosni DDL**;
- **nijedna rola nema `BYPASSRLS`**;
- **nijedna `SECURITY DEFINER` funkcija ne postoji**;
- **nijedan superuser seed credential** nije konfigurisan;
- **nijedna trajna `copilot_migrator` RLS politika** ne postoji;
- mehanizam **nije dohvatljiv** iz request/runtime aplikacijskog koda — statička provjera.

## 21.6.3 `platform_role_assignments` §17.2 u fazi 3 (D-051)

- tabela nosi `ENABLE` **i** `FORCE RLS` **već nakon paketa `002`**;
- politike `platform_role_assignments_self_select` i `platform_role_assignments_system_select`
  postoje, **nepromijenjenih imena i tijela**;
- `copilot_app` vidi **isključivo vlastite** redove;
- korisnik A **ne čita** platform rolu korisnika B;
- bez postavljenog `app.user_id` tabela vraća **nula** redova;
- politika **ne koristi** `app.practice_id` — postavljanje ili nepostavljanje `app.practice_id` ne
  mijenja rezultat;
- `copilot_system` vidi **sve** redove;
- `PUBLIC` nema nijedan pristup;
- `copilot_app` nema `INSERT`, `UPDATE` ni `DELETE`;
- **invarijanta D-023, klauzule 11, važi od faze 3** — regresijski test;
- `platformRoles[]` u `GET /me` sadrži **isključivo** redove sa `revoked_at IS NULL`; opozvana
  dodjela se **ne** vraća;
- **nijedan revoke endpoint, permisija ni write grant ne postoji** — negativna provjera.

## 21.6.4 `practice_membership_roles` §17.4 u fazi 3 (D-051)

- tabela nosi `ENABLE` **i** `FORCE RLS` **već nakon paketa `002`**;
- politika `practice_membership_roles_self_select` postoji, **nepromijenjenog imena i tijela**;
- politika **radi prije** nego `practice_memberships` dobije §17.3 RLS — ovo je ključna asercija
  D-051, klauzule 4;
- ista politika daje **identičan** rezultat i **nakon** što faza 4 uvede §17.3 — regresijski test
  granice faze 3 prema fazi 4;
- podupirući `SELECT` grant nad `practice_memberships` je **obavezan**; njegovo ukidanje obara
  politiku sa **`42501`**;
- puni funkcionalni ugovor politike ostaje u §24.4, ali sa **vlasništvom faze 3**.

## 21.6.5 Introspekcija vlasništva paketa (D-051, klauzula 6)

- paket `013_rls_policies` **ne sadrži nijedan** `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY` ni
  `FORCE ROW LEVEL SECURITY` za `platform_role_assignments` i `practice_membership_roles`;
- politike nakon primjene paketa `013` su **bajtovno iste** kao nakon paketa `002` — dokaz da faza
  4 ne prepisuje.

---

# 21.7 D-049 — minimalna čitljiva površina `practice_settings` u fazi 3

**Normativna odluka: D-049.** Nivo: security/integration. **Vlasništvo: paket
`002_identity_and_practices`, faza 3**, osim gdje je izričito navedena faza 4. Normativni izvor:
`02` §6.4, §20.2b i §25.1.3; `03` §5.1 i §10.

## 21.7.1 Dozvoljena površina

- `SELECT (practice_id, allow_mpa_approval, allow_billing_specialist_approval)` **prolazi**;
- uslovne permisije u `GET /me` tačne su za **sva četiri** kombinacije oba flaga;
- `MPA` sa `allow_mpa_approval = true` dobija `analysis.approve`; sa `false` ne dobija;
- `BILLING_SPECIALIST` sa `allow_billing_specialist_approval = true` dobija `analysis.approve`;
  sa `false` ne dobija;
- flag **sam po sebi** ne daje permisiju bez podobne dodijeljene role;
- neaktivan membership je odbijen i kada je flag uključen.

## 21.7.2 Zabranjena površina

- `SELECT *` → **`42501`**;
- `SELECT id`, `version`, `updated_at`, `updated_by`, `configuration`, `retention_policy_code`,
  `billing_review_required`, `require_reason_for_manual_change`, `ai_enabled`,
  `axenita_export_enabled` → **`42501`**, svaka zasebno;
- nedozvoljena kolona **isključivo u `WHERE` predikatu** → **`42501`**;
- nedozvoljena kolona **isključivo u `ORDER BY`** → **`42501`**;
- `INSERT`, `UPDATE`, `DELETE` → **`42501`**;
- `copilot_system` bilo kakav pristup → **pada**;
- `PUBLIC` nema nijedan grant.

## 21.7.3 Odsustvo ruta u fazi 3

- `GET /api/v1/practices/{practiceId}/settings` **nije registrovan** — provjera rute, ne odgovora;
- `PATCH /api/v1/practices/{practiceId}/settings` **nije registrovan**;
- OpenAPI izlaz faze 3 **ne sadrži** nijednu settings operaciju;
- nijedna RLS politika nad `practice_settings` ne postoji nakon paketa `002`.

## 21.7.4 Imenovana izloženost

Test **eksplicitno tvrdi** postojanje izloženosti
**`PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE`**:

- `copilot_app` može pročitati te tri kolone **za svaki** `practice_settings` red, i utvrditi broj
  redova;
- test to **potvrđuje kao prihvaćeno međustanje**, jednako kao §21.5.6, da promjena ne bi prošla
  nezapaženo;
- **nijedan test ne smije tvrditi** da je ta izloženost zatvorena u fazi 3.

## 21.7.5 Zatvaranje u fazi 4

- nakon `02` §22.13, `copilot_app` vidi **isključivo** `practice_settings` red tekućeg tenanta —
  regresijski test koji dokazuje da je izloženost zatvorena;
- `UPDATE` grant postoji **isključivo zajedno** sa tenant politikom koja ga ograničava; grant bez
  politike **obara phase gate**;
- optimistic-locking ugovor iz §10 se izvršava **u fazi 4**.

### 21.7.5a Tačne runtime površine faze 4 (D-053, dijelovi A i B)

Nivo: security/integration nad stvarnim PostgreSQL-om. Normativno: `02` §20.2b.1, §20.4, §25.1.3a.

`SELECT` površina — **tačno devet** kolona:

- `SELECT` nad svih devet dozvoljenih kolona **prolazi**;
- `SELECT *` → **`42501`**;
- `SELECT` nad `id`, `configuration`, `updated_at`, `updated_by` → **`42501`**, uključujući upotrebu
  **isključivo u `WHERE`** i **isključivo u `ORDER BY`**;
- introspekcija potvrđuje da **table-level `SELECT` ne postoji**;
- trokolonski grant faze 3 je **strogi podskup** — nijedan grant nije opozvan.

`UPDATE` površina — **tačno devet** kolona:

- `UPDATE` nad svih devet dozvoljenih kolona **prolazi**;
- `UPDATE` nad `practice_id`, `id`, `configuration`, `updated_by` → **`42501`**;
- `INSERT` i `DELETE` → **`42501`**;
- introspekcija potvrđuje da **table-level `UPDATE` ne postoji**;
- `copilot_system` bilo kakav pristup → pada; `PUBLIC` nema nijedan grant.

Reprezentacija i locking:

- `GET` i uspješan `PATCH` vraćaju **identičnu** osmopoljnu reprezentaciju iz `03` §10;
- nijedan odgovor ne sadrži `version` kao polje tijela; oba nose `ETag: "<version>"`;
- `PATCH` bez `If-Match` → **`428`**; sa zastarjelim `If-Match` → **`409 VERSION_CONFLICT`**; sa
  tačnim → **`200`**, `version + 1`, **novi** `ETag`;
- poslan `version`, `updated_at` ili `updated_by` u tijelu se **odbija**;
- `updated_by` **nepromijenjen** nakon uspješnog `PATCH`-a;
- `updated_at` je postavila **baza**, ne pozivalac;
- **nijedan triger nad `version` ne postoji**; **nijedna `SECURITY DEFINER` funkcija ne postoji**;
  paket `014_immutability_triggers` je **nepromijenjen**.

## 21.7.6 `GET /me` regresija nakon `practice_settings` RLS-a (D-053, dio D)

Nivo: security/integration + contract. **Vlasništvo: faza 4**, aplikacijski i test sloj.
Normativno: `02` §17.1a, §25.1.3a; `03` §10; D-053, klauzule D.1–D.12.

**Zašto postoji.** `GET /me` je neutralna ruta bez `app.practice_id`. Čim faza 4 uvede tenant
politiku nad `practice_settings`, predikat postaje `practice_id = NULL` i vraća nula redova, pa
resolver pada **fail-closed** i `MPA` odnosno `BILLING_SPECIALIST` **tiho gube**
`analysis.approve` i `analysis.approval.revoke`. Regresija **ne baca grešku** — mijenja sadržaj
zamrznutog odgovora, pa je test jedini mehanizam koji je hvata.

Obavezne tvrdnje:

- **iste kanonske `/me` fixture daju iste `memberships[].permissions` prije i nakon** uvođenja
  `practice_settings` RLS-a;
- uslovno ponašanje `MPA` i `BILLING_SPECIALIST` tačno je za **oba** stanja **oba** flaga;
- **neaktivan membership ostaje `permissions = []`**, i za njega `set_request_context` **nije
  pozvan**;
- **multi-practice** membership koristi postavke **svoje** ordinacije — postavke ordinacije A ne
  doprinose ordinaciji B;
- **`practiceName` je prisutan za svaki membership** — dokaz da su ne-tenant-scoped čitanja
  završena **prije** prvog `set_request_context` poziva (RESTRICTIVE politika `02` §17.6);
- **nijedan tenant kontekst ne curi** nakon transakcije — `app.practice_id` je prazan nakon
  commita i pooled konekcija ga ne nasljeđuje;
- **nijedan klijentski poslan practice identifikator ne učestvuje** — `/me` sa podmetnutim
  `X-Practice-ID` daje **identičan** odgovor kao `/me` bez njega;
- `X-Practice-ID` **nije postao obavezan** na `/me`;
- `practice_settings` politika je **doslovno** tenant predikat iz `02` §17.1 — introspekcija
  potvrđuje da **nema bootstrap izuzetka ni membership-wide grane**;
- **nijedna `SECURITY DEFINER` funkcija, `BYPASSRLS` rola ni superuser put ne postoji**.

---

# 21.8 D-052 — proširenje D-048 allowliste u fazi 4

**Normativna odluka: D-052, dio B.** Nivo: security/RLS integration nad stvarnim PostgreSQL-om.
**Vlasništvo: paket `013_rls_policies`, faza 4.** Normativni izvor: `02` §17.3, §22.13, §23.4.3,
§23.4.4a i §23.4.5; D-048; D-049, klauzula 5.

Faza 4 prvi put uvodi `FORCE ROW LEVEL SECURITY` nad `practice_memberships` i `practice_settings`,
a pouzdani seed put upisuje u obje.

## 21.8.1 Obuhvat allowliste

- allowlist faze 4 sadrži **tačno** `practice_memberships` i `practice_settings`;
- allowlist faze 3 iz `02` §23.4.4 je **nepromijenjena** — sve četiri tabele i dalje na njoj;
- ukupna allowlist nakon faze 4 ima **tačno šest** tabela;
- proširenje je **eksplicitno** i vezano za `02` §23.4.4a; **tiho proširenje obara phase gate**;
- tabela **izvan** proširene allowliste je i dalje odbijena **prije** bilo kakvog `ALTER TABLE`-a.

## 21.8.2 Steady state prije i nakon seeda

Za **obje** tabele faze 4:

- `relrowsecurity = true` i `relforcerowsecurity = true` **nakon migracije**;
- `relrowsecurity = true` i `relforcerowsecurity = true` **nakon seeda**.

Ovo je **trajni regresijski test**, ne jednokratna provjera.

## 21.8.3 Maintenance prozor i putevi neuspjeha

- pouzdani seed DML nad obje tabele ide **isključivo** kroz protokol iz `02` §23.4.3;
- isti DML **bez** prozora **pada** — dokaz da prozor rješava stvaran problem;
- **prekinut ili neuspio seed ne ostavlja `FORCE` isključenim** — nakon rollbacka obje zastavice
  su ponovo `true`, za obje tabele; obavezan test;
- neuspjela restore asercija **podiže izuzetak i abortira transakciju**;
- unutar prozora se ne izvršava **nijedan nepovezani sigurnosni DDL**.

## 21.8.4 Trajno odbijene zaobilaznice

- **nijedna rola nema `BYPASSRLS`**;
- **nijedna `SECURITY DEFINER` funkcija** nije uvedena kao zaobilaznica;
- **nijedan superuser runtime put** nije konfigurisan;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` se **ne pojavljuje** u forward migraciji ni seedu —
  statička provjera izvora; rollback je izuzet (`02` §23.4.5);
- **nijedna trajna owner-write politika** ne postoji;
- mehanizam **nije dohvatljiv** iz request/runtime aplikacijskog koda — statička provjera.

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

Vlasništvo migracija: schema objekti u **`002_identity_and_practices`**. **Ažurirano odlukom
D-051 (2026-08-14):** RLS politika nad `practice_membership_roles` (`02` §17.4) je **takođe u
paketu `002_identity_and_practices` i Fazi 3**, a ne u `013_rls_policies`. `02` §17.3 ostaje u
`013_rls_policies` i Fazi 4. Nijedan novi broj paketa se ne uvodi.

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

**Vlasništvo faze: Faza 3, paket `002_identity_and_practices`** (D-051, klauzula 1; `02` §17.0).
Ranije je ova grupa bila u Fazi 4 i paketu `013_rls_policies`; premješteno je isključivo
vlasništvo, a sve asercije ispod ostaju **nepromijenjene**. Politika **ne zahtijeva** §17.3 da bi
radila (§21.6.4).

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

Testira se prihvaćeni **jedanaestokoračni** redoslijed, sa negativnim testom na svakoj relevantnoj
granici:

1. autentifikacija bearer tokena;
2. izvođenje pouzdanog `app.user_id`;
3. validacija `X-Practice-ID`;
4. **membership-scoped čitanje `status`-a tražene ordinacije, prije promjene konteksta**
   (D-047, klauzula 10);
5. poziv `set_request_context(p_practice_id uuid)`;
6. validacija aktivnog `practice_memberships` reda;
7. uspostavljanje transakcijski lokalnog tenant konteksta;
8. učitavanje dodijeljenih tenant rola;
9. izvođenje efektivnih permisija;
10. evaluacija tražene permisije i prihvaćenog uslova;
11. izvršenje pod tenant RLS-om.

**Restitucija koraka 4 (D-053, dio C).** Raniji desetokoračni restatement u ovom odjeljku je
izostavljao korak 4 i odstupao od autoritativnog `03` §3.7.1. **Nijedna sigurnosna semantika se ne
mijenja.** Test ugovor za korak 4:

- **nula vidljivih redova → `403 ACCESS_DENIED`**;
- **`status <> 'ACTIVE'` → `403 ACCESS_DENIED` uz rollback**;
- **`app.practice_id` ne postoji** ni u jednom od ta dva slučaja — dokazuje se nakon odbijanja;
- korak 4 se izvršava **prije** koraka 5; obrnut redoslijed **obara gate**;
- provjera je **aplikacijska** — tijelo `set_request_context` **ne sadrži** provjeru
  `practices.status` (`02` §16.2.3), i introspekcija to potvrđuje;
- korak 4 dokazuje **postojanje** membershipa, korak 6 **aktivan** membership; test mora razlikovati
  oba i nijedan ne smije zamijeniti drugi.

Nijedan authorization put ne smije:

- učitati role **prije** autentifikacije;
- vjerovati caller-supplied roli;
- vjerovati caller-supplied `user_id`;
- koristiti `platformRoles` kao tenant role;
- zaobići provjeru aktivnog membershipa;
- **uspostaviti `app.practice_id` prije uspješnog koraka 4.**

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

**Izvršna faza: 10, za cijelu §24a (D-052).** Tabelu `review_decision_change_links` kreira paket
`009_review_approvals` u Fazi 10, pa **nijedna** grupa iz §24a nije izvodiva u Fazi 4. RLS slice
paketa `013_rls_policies` odgođen je u Fazu 10 i izvršava se neposredno nakon paketa `009`.
**Vlasništvo paketa i sve asercije ostaju nepromijenjeni** — mijenja se isključivo tačka
izvršenja.

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

Nivo: security + integration. **Faza 10, paket `013_rls_policies`** — premješteno iz Faze 4
odlukom **D-052**, jer tabela u Fazi 4 ne postoji. Izvršava se nakon paketa
`009_review_approvals`. Nijedna asercija ispod nije promijenjena.

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
| §21.6.1–21.6.2 `FORCE RLS` steady state i maintenance prozor (D-048) | security/integration | Faza 3 | `002_identity_and_practices` | **da** |
| §21.6.3–21.6.5 §17.2 i §17.4 u fazi 3 (D-051) | security/integration | Faza 3 (§21.6.4 regresija dijelom Faza 4) | `002_identity_and_practices` | **da** |
| §21.7.1–21.7.4 minimalna površina `practice_settings` (D-049) | security/integration | Faza 3 | `002_identity_and_practices` | **da** |
| §21.7.5 zatvaranje izloženosti i `UPDATE` grant (D-049) | security/integration | Faza 4 | `013_rls_policies` | **da** |
| §21.7.5a tačne runtime površine `practice_settings` — 9 `SELECT` + 9 `UPDATE` (D-053) | security/integration | **Faza 4** | `013_rls_policies` | **da** |
| §21.7.6 `GET /me` regresija nakon `practice_settings` RLS-a (D-053, dio D) | security/integration + contract | **Faza 4** | — (aplikacijski sloj) | **da** |
| §10 optimistic locking — `practice_settings` (D-049; reprezentacija i `ETag` po D-053) | contract + e2e | **Faza 4** | `013_rls_policies` | **da** |
| §22.1 constraint | integration | Faza 7 | `005_ai_prompts_and_analysis` | **da** |
| §22.2 concurrency | integration | Faza 7 | `005_ai_prompts_and_analysis` | **da** |
| §22.1 immutability trigger — **AAD slice repointiran na Fazu 5 (D-062, `OD-P5-D2-1`)** | integration | **Faza 5** za `patient_references`, `encounters`, `encounter_documents`; preostala dva trigera u fazi vlasnika stanja | `014_immutability_triggers` | **da** |
| §22.3–22.4 revizije | e2e | Faza 10 | — | **da** |
| §23.1 cancel analize | e2e + audit | Faza 7 | — | **da** |
| §23.2 kaskada otkazivanja (D-035) — **ISPRAVLJENO (D-062, Dio F.5)** | integration + e2e | **Faza 7** — kaskada zahtijeva `analysis_runs` (paket `005`), pa **nije testabilna u Fazi 5**; raniji unos "Faza 5" bio je netačan | — | **da** |
| §17.1 D-036 permisije | e2e | Faza 10 | — | **da** |
| §18.1 D-037 approval kodovi | contract + e2e | Faza 11 | — | **da** |
| §11.1–11.2 state machine | unit + e2e | prema fazi vlasnika stanja; **Faza 5 pokriva table-driven test nad svih 15 tranzicija — 4 dosežne prolaze, 11 daje `409`** (D-062, Dio F) | — | **da** |
| **§12.9 schema/RI/odgovorni ljekar (D-062)** — uključujući **`★` RI-naspram-RLS dokaz** | security/integration + contract | **Faza 5**; **§12.9.3 katalog test (stavka 14a) u slice-u `P5-I1`**; `★` u slice-u `P5-I2`, **blokirajuće prije `P5-I5`** | `003`, `011`, `013`, `014` | **da** |
| §20.1 error matrica | contract | Faza 12 | — | **da** |
| §24.1 D-038 schema constrainti | integration | Faza 3 | `002_identity_and_practices` | **da** |
| §24.2 D-038 životni ciklus | integration | Faza 3 | `002_identity_and_practices` | **da** |
| §24.3 D-038 audit | schema/domain | Faza 3 | `002_identity_and_practices` | **BLOCKED** za administracijski put |
| §24.4 D-038 RLS self-enumeracija — **premješteno odlukom D-051** | security/RLS integration | **Faza 3** | **`002_identity_and_practices`** | **da** |
| §24.5–24.6 D-038 bootstrap i redoslijed | security/integration/e2e | Faza 4 | `013_rls_policies` | **da** |
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
| §24a.5 D-046 lifecycle, grants i RLS — **premješteno odlukom D-052** | security + integration | **Faza 10** | `013_rls_policies` | **da** |
| §24a.6 D-046 introspekcija vlasništva i inventara | integration | Faza 10 | `009_review_approvals` | **da** |

Vlasništvo migration paketa preuzeto je iz `02` §22 i `04`. **Nijedan novi broj paketa se ne
uvodi.**

**Premještanja vlasništva, ne brisanja (D-049, D-051, D-052).** Nijedna test grupa nije uklonjena
ni oslabljena ovom rekonsilijacijom. Eksplicitno premješteno:

| Test grupa | Ranije | Sada |
|---|---|---|
| §24.4 RLS self-enumeracija (`practice_membership_roles`) | Faza 4 / `013_rls_policies` | **Faza 3 / `002_identity_and_practices`** |
| §17.2 asercije nad `platform_role_assignments` (`02` §20.4) | Faza 4 / `013_rls_policies` | **Faza 3 / `002_identity_and_practices`** |
| §10 optimistic locking — `practice_settings` | Faza 3 (D-028 klauzula 4) | **Faza 4 / `013_rls_policies`** |
| §24a.5 lifecycle, grants i RLS (`review_decision_change_links`) — D-052 | Faza 4 / `013_rls_policies` | **Faza 10 / `013_rls_policies`** |

**§24a.5 mijenja isključivo fazu izvršenja, ne vlasništvo paketa ni ijednu aserciju** (D-052,
klauzule A.4–A.5, A.9). Tabelu kreira paket `009_review_approvals` u Fazi 10, pa u Fazi 4 ne
postoji i nijedna od tih asercija nije izvodiva. Sve asercije ostaju **doslovno nepromijenjene** i
izvršavaju se u Fazi 10, nakon paketa `009`.

Novo dodano, bez ijednog brisanja: §21.6 (D-048, D-051), §21.7 (D-049) i §21.8 (D-052).

## 26.2 Uslovi pada phase gatea

Phase gate **mora pasti** kada:

- D-033 security testovi padnu;
- D-034 concurrency ili constraint testovi padnu;
- D-035 testovi atomarnog otkazivanja padnu;
- D-036 authorization testovi padnu;
- D-037 export precondition testovi padnu;
- D-046 testovi integriteta linkova, granice pokrivenosti ili rollbacka padnu.

**Faza 10 mora pasti** i kada, prema §24a. Cijeli blok ispod pripada **isključivo Fazi 10**
(D-052): svaka tvrdnja zahtijeva postojanje `review_decision_change_links`, koju kreira paket
`009_review_approvals` u toj fazi. **Faza 4 se po ovim uslovima ne ocjenjuje** — za nju važi
poseban blok niže.

Dakle, Faza 10 **mora pasti** kada:

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

Faza 4 **mora pasti** i kada, prema D-052, dio A:

- Faza 4 kreira `review_decision_change_links`;
- Faza 4 izvrši `ENABLE`, `FORCE`, tenant politiku ili bilo koji grant nad tom tabelom;
- migracija, test ili aplikacijski artefakt Faze 4 referencira tu tabelu kao postojeću;
- generički tenant RLS obrazac i harness Faze 4 ne postoje ili nisu dokazani nad
  `practice_settings`;
- bude uveden novi broj migration paketa ili bude renumerisan postojeći.

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

Faza 3 ili Faza 4 **mora pasti** i kada, prema §21.6, §21.7 i §21.8 (D-048, D-049, D-051, D-052):

- bilo koja tabela sa allowliste faze 3 nema `relrowsecurity = true` ili
  `relforcerowsecurity = true` nakon migracije ili nakon seeda;
- seed upisuje u `FORCE RLS` tabelu **izvan** protokola iz `02` §23.4;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` se pojavi u forward migraciji ili seedu;
- prekinut ili neuspio seed ostavi `FORCE` isključenim;
- bude uvedena `BYPASSRLS` rola, `SECURITY DEFINER` funkcija, superuser seed credential ili trajna
  `copilot_migrator` RLS politika;
- maintenance mehanizam postane dohvatljiv iz request/runtime putanje;
- allowlist bude proširen bez prihvaćene odluke ili eksplicitne klauzule paketa;
- `platform_role_assignments` ili `practice_membership_roles` nemaju `ENABLE` + `FORCE RLS` nakon
  paketa `002`;
- ime ili tijelo bilo koje politike iz `02` §17.2 ili §17.4 bude promijenjeno;
- paket `013_rls_policies` rekreira, zamijeni ili prepiše te politike;
- politika §17.4 prestane raditi bez §17.3, ili dâ različit rezultat prije i nakon §17.3;
- `platformRoles[]` uključi dodjelu sa `revoked_at IS NOT NULL`;
- `practice_settings` u fazi 3 dobije table-level `SELECT` ili bilo koji upisni grant;
- bilo koja settings ruta bude registrovana u fazi 3;
- nedozvoljena `practice_settings` kolona bude čitljiva, uključujući upotrebu samo u `WHERE` ili
  `ORDER BY`;
- `practice_settings` `UPDATE` grant u fazi 4 postoji **bez** pripadajuće tenant RLS politike;
- allowlist faze 4 ne sadrži **tačno** `practice_memberships` i `practice_settings`, ili je
  allowlist faze 3 pritom promijenjena (`02` §23.4.4a);
- `practice_memberships` ili `practice_settings` nemaju `relrowsecurity = true` i
  `relforcerowsecurity = true` nakon migracije ili nakon seeda faze 4;
- prekinut seed faze 4 ostavi `FORCE` isključenim nad bilo kojom od te dvije tabele;
- proširenje allowliste faze 4 bude izvedeno tiho, bez klauzule iz `02` §23.4.4a;
- izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` bude
  neopravdano tvrđena kao zatvorena u fazi 3, ili ne bude zatvorena u fazi 4;

Faza 4 **mora pasti** i kada, prema **D-053** (§21.7.5a, §21.7.6, §24.6):

- `practice_settings` `SELECT` površina u fazi 4 nije **tačno devet** kolona iz `02` §20.2b.1, ili
  postane table-level;
- `practice_settings` `UPDATE` površina u fazi 4 nije **tačno devet** kolona iz `02` §20.2b.1, ili
  postane table-level;
- `id`, `configuration`, `updated_at` ili `updated_by` postanu čitljivi `copilot_app`-u;
- `practice_id`, `id`, `configuration` ili `updated_by` dobiju `UPDATE`;
- `copilot_app` dobije `INSERT` ili `DELETE` nad `practice_settings`;
- `updated_by` bude promijenjen kroz settings endpoint, ili bude tretiran kao autoritativno audit
  polje;
- bude uveden triger nad `version`, `SECURITY DEFINER`, privilegovana helper funkcija, izmjena
  paketa `014_immutability_triggers`, novi migration paket ili API polje za proizvoljnu verziju;
- `version` se pojavi kao polje JSON tijela `GET`/`PATCH` settings odgovora ili `PATCH` zahtjeva;
- `GET` i uspješan `PATCH` ne vrate **identičnu** osmopoljnu reprezentaciju iz `03` §10, ili
  bilo koji od njih ne vrati `ETag`;
- `If-Match` prestane biti obavezan, ili inkrement `version`-a prestane biti jedan atomičan
  `UPDATE` sa predikatom na `practice_id` **i** očekivanu verziju;
- redoslijed autorizacije bude iskazan sa **deset** koraka, ili status tražene ordinacije bude
  provjeren **poslije** `set_request_context`, ili `app.practice_id` postoji nakon odbijenog
  koraka 4;
- `practice_settings` tenant politika bude oslabljena bootstrap izuzetkom, membership-wide granom
  ili bilo čim drugim, radi očuvanja `GET /me`;
- `GET /me` dobije zahtjev za `X-Practice-ID`, ili njegov odgovor prestane biti identičan sa i bez
  podmetnutog `X-Practice-ID`;
- `memberships[].permissions` za iste kanonske fixture odstupe prije i nakon uvođenja
  `practice_settings` RLS-a;
- `practiceName` nedostane za bilo koji membership, ili neaktivan membership prestane biti
  `permissions = []`;
- postavke jedne ordinacije doprinesu permisijama druge, ili tenant kontekst preživi transakciju;
- practice identifikator za interni `/me` read dođe iz tijela, query parametra, headera ili
  putanje;
- migracija bude autorisana kroz `prisma migrate dev --create-only` ili `prisma db push`, ili
  bilo koji guard migracije `001` bude oslabljen (D-050).

Testovi iz **§21.5 su obavezan izvršiv ugovor** (D-047) i **nikada se tiho ne izostavljaju**.
Suite koji ih preskoči bez oznake tretira se kao neuspio gate. Test koji tvrdi da dijeljeni
`copilot_app` credential dokazuje identitet krajnjeg korisnika je **sam po sebi defekt**
(§21.5.8).

Isto važi za testove role administration audita (§24.19) i za operacije klasifikovane kao
`OUT OF V1` ili `REQUIRES NEW PERMISSION AND ADR` (§24.12).

Testovi iz **§21.6 i §21.7 su takođe obavezan izvršiv ugovor** (D-048, D-049, D-051) i nikada se
tiho ne izostavljaju. Test koji tvrdi da je izloženost
`PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` zatvorena u fazi 3 je **sam po
sebi defekt** (§21.7.4).

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

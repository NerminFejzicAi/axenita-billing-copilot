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

**Imenovani vlasnik uslovnog triggera (D-069, 2026-08-27) — pasus iznad se ne mijenja.** Trigger
ostaje **uslovan**, ali sada ima **imenovanog budućeg vlasnika: slice `P5-I4`**, jer je `P5-I4`
prvi kanonski Faza-5 tenant business modul koji traži izvršavanje poslovnih iskaza nad već
otvorenom, pinovanom tenant transakcijom. **Devet obaveza iz `05` §6 postaju kriteriji prihvatanja
`P5-I4`**; nijedna nije oslabljena i **nijedna nije označena završenom**. **`P5-I4` je
`NOT_STARTED` i nije autorizovan**, pa **nijedan facade kod nije ovlašten**; do njegovog kanonskog
prihvatanja tenant database granicu nosi postojeći `TenantRequestPipeline`, uz nepromijenjene
sigurnosne invarijante.

**Pomirenje uslovnog facade triggera (D-081, 2026-09-05) — oba pasusa iznad se NE mijenjaju.**
D-069 anotacija je **tačna na dan svog zapisa**: tada je konkretan facade zaista bio **uslovno
odgođen**, `P5-I4` **`NOT_STARTED`** i nijedan facade kod **nije bio ovlašten**. Ta tvrdnja **ostaje
historijski važeća** i **ne prepisuje se**; ona **više ne opisuje tekuće stanje**.

**Uslovni trigger D-056 je u međuvremenu dosegnut i zadovoljen.** `P5-I4` je vlasnički autorizovan
(D-074, D-077, D-079), implementiran, verifikovan, objavljen i formalno pomiren po pod-gateovima
(D-076, D-078, D-080). Pod-gate `P5-I4A` je kanonski implementirao konkretan `TenantDatabaseService`
(`apps/api/src/database/tenant-database.service.ts`, registrovan u `database.module.ts`), a
**D-054, klauzule 6–10 i D-056, klauzula 5 su ponovo dokazani trajnim regresijama**
(`tenant-database.service.spec.ts`, `tenant-database-boundary.spec.ts`) **prije prihvatanja**.
**Svih devet facade obaveza iz `05` §6 je time dokazano** i **vlasnički autorizovano za prelazak u
označeno** gateom formalnog zatvaranja roditeljskog `P5-I4`.

**Ova anotacija ne mijenja nijedan sigurnosni zahtjev.** Sloj 5 zadržava identičnu semantiku:

```text
jedan PrismaService                                        NEPROMIJENJENO
jedna pinovana interaktivna transakcija po zahtjevu        NEPROMIJENJENO
set_request_context unutar te iste transakcije             NEPROMIJENJENO
nijedan caller-supplied identitet kao granica povjerenja   NEPROMIJENJENO
nijedna druga, ugnijezdena ni paralelna transakcija        NEPROMIJENJENO
default-deny bez uspostavljenog konteksta                  NEPROMIJENJENO
```

**Facade je tanak omotač postojeće pinovane granice `TenantRequestPipeline` — ne novi i ne paralelan
database stack** (D-054, dio C.2), i **ne posjeduje vlastiti `PrismaClient`** (D-054, klauzula 7).
**Nijedno transakciono, kontekstno ni default-deny pravilo nije oslabljeno**, **nijedan grant,
nijedna RLS politika i nijedan predikat izolacije se ne dira**, i **nijedan sigurnosni zahtjev nije
uklonjen ni ublažen**. Anotacija je **isključivo aditivno činjenično pomirenje** i **ne prepisuje
historiju**. Vidi D-081 u `06`, `05` §6, `04` §7.5a, `03` §4.1 i `08` §12.12.

Object storage key primjer:

```text
practices/{practiceId}/documents/{documentId}/source
```

Presigned URL se izdaje tek nakon tenant/permission provjere i kratko traje.

## 4.1 Tenant površina Faze 5 (D-062)

Faza 5 uvodi **pet** tenant tabela. Njihova izolacija počiva na **tri nezavisna sloja**:

1. **`ENABLE` + `FORCE ROW LEVEL SECURITY`** na svih pet, sa tenant predikatom `02` §17.1,
   doslovno i neoslabljeno. Bez `app.practice_id` predikat daje **nula redova za svaku ordinaciju**
   (fail-closed). **Nijedna politika Faze 5 ne sadrži podupit** i **nijedna ne referencira `users`
   ni `practice_memberships`** — pa strukturno ne postoji površina za curenje co-member identiteta.
2. **Composite FK-ovi**, koji cross-practice povezivanje čine **nemogućim, a ne samo odbijenim**:
   red koji bi povezao entitete dvije ordinacije **nema parent red**. Svih **osam** FK-ova Faze 5
   nosi eksplicitno `ON DELETE NO ACTION ON UPDATE NO ACTION` (`02` §29.2).
3. **Grant discipline — default deny.** `copilot_system` dobija **ništa**; `PUBLIC` **ništa**;
   **nijedan `DELETE` grant nigdje**; `storage_objects` **nijedan grant i nijednu politiku**;
   a `UPDATE` je column-level i uzak (`02` §29.5). `practice_id` i `id` na `encounters` su
   **nepomjerivi na nivou privilegije**, nezavisno od politike i trigera.

**Arhiviranje nije sigurnosna granica** i **ne smije** postati RLS predikat — u politici bi sakrilo
redove od audita i učinilo stanje nepovratnim (`02` §29.4).

---

## 4.2 Advisory lock nije tenant ni autorizacijska granica (D-072, 2026-08-29)

**§4 i §4.1 iznad se NE prepisuju.** `P5-I4` uvodi **prvog konkurentnog pisca** nad
`idempotency_keys` i sa njim **transaction-scoped advisory lock**:

```text
IDEMPOTENCY_TRANSACTION_MODEL = ONE_ADMITTED_TRANSACTION
IDEMPOTENCY_CONCURRENCY_GUARD = TRANSACTION_SCOPED_ADVISORY_LOCK
```

**Advisory lock je isključivo mehanizam kontrole konkurencije.** On **nije** sigurnosna granica,
**nije** autorizacijski mehanizam i **nije** identitet. **Stvarnu tenant granicu i dalje nose
`ROW LEVEL SECURITY` politike i admitted tenant sesija** (§4, §4.1; D-006; D-054). Neuspjeh
pribavljanja locka daje **`409 REQUEST_ALREADY_IN_PROGRESS`**, nikada pristup podacima druge
ordinacije, i **odsustvo locka ne smije nikada biti jedina prepreka cross-tenant čitanju ili
pisanju**.

**Izvođenje identiteta locka:** `practice_id`, `user_id`, `endpoint` i `idempotency_key` →
**length-prefixed UTF-8** reprezentacija scopea → **SHA-256** → **prvih 8 bajtova** →
**big-endian** → **signed int64**.

- **Bez ad-hoc konkatenacije sa delimiterom** — konkatenacija razdvojena znakom je ranjiva na
  koliziju granica polja i **nije dozvoljena**.
- **Bez direktne konverzije korisnički kontrolisanog stringa** u PostgreSQL lock integer.
- **Lock ključ se ne perzistira** — ni u koloni, ni u auditu, ni u logu (§11).
- **`practice_id` i `user_id` dolaze iz admitted stanja**, nikada iz tijela zahtjeva ili headera.
- Kolizija izvedenog int64 ključa je **problem propusnosti, ne izolacije**: najgori ishod je
  nepotreban `409`, nikada ukrštanje ordinacija.

**Tačni enkodirani bajtovi i očekivani int64 MORAJU biti pinovani fiksnim test vektorima prije
prihvatanja `P5-I4C`** (`08` §12.12). Vidi D-072 u `06` i `04` §7.5a.3.

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

**Pojašnjenje stavke „audit chain: SHA-256" (D-069, 2026-08-27) — lista iznad se ne mijenja.**
Ta stavka imenuje **primijenjeni algoritam** (SHA-256 za integritet audit zapisa). Ona **NIJE**
tvrdnja da Faza 5 već implementira **predecessor lanac**.

**Tekuće stanje Faze 5 je SELF-HASH ONLY:**

```text
previous_event_sha256 = NULL   za svaki Faza-5 audit događaj
```

**Faza 5 daje per-event integritet, ne tamper-evident sekvencu.** Per-practice, per-resource i
globalno predecessor ulančavanje su **eksplicitno odgođeni** u kasniju governance odluku, koja
mora zasebno riješiti obuhvat lanca, redoslijed, zaključavanje, konkurentne pisce, sprečavanje
forka, interakciju sa retentionom i genesis semantiku. **Faza 5 te semantike ne smije prećutno
izmisliti**, i **nijedan dokument, test ni izvještaj ne smije tvrditi da Faza 5 ima linearni audit
lanac.** Append-only garancija i dalje počiva na `revoke update, delete, truncate` nad
`audit_events` (`02` §15), ne na ulančavanju. Puna definicija je u `04` §7.5a.2.

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

**Lokalna/razvojna konfiguracija ključeva i startup guard (D-070, `RULING 3`, 2026-08-28).**

- **Kanonske Faza-5 varijable lokalnog razvoja:** `ENCRYPTION_LOCAL_KEY`, `ENCRYPTION_KEY_VERSION`
  i `HMAC_LOCAL_KEY`. **Varijabla `HMAC_KEY_VERSION` u Fazi 5 ne postoji** — aktivnu HMAC generaciju
  predstavlja **kanonski perzistirani prefiks tokena `h1.`**, pa marker generacije živi **unutar**
  tokena i **kolona za verziju HMAC ključa se ne uvodi** (`02` §2.8.6). Buduća višegeneracijska
  kompatibilnost iz D-060 ostaje očuvana.
- **Enkodiranje.** `ENCRYPTION_LOCAL_KEY` i `HMAC_LOCAL_KEY` koriste **RFC 4648 standardni Base64**,
  **bez whitespacea**, strogo validne reprezentacije; dekodiranje mora uspjeti, a **dekodirana
  vrijednost mora biti tačno `32` bajta**. **Nevalidan Base64 ili dekodirana dužina različita od 32
  bajta je startup/konfiguraciona greška.** `ENCRYPTION_KEY_VERSION` ostaje **obavezan** po D-025 i
  mora predstavljati aktivnu verziju enkripcijskog ključa.
- **Guard razdvajanja ključeva.** Startup guard poredi **dekodirane bajtove**, **ne** tekstualne
  Base64 reprezentacije, i koristi **poređenje u konstantnom vremenu** (npr. `timingSafeEqual` ili
  semantički ekvivalentan primitiv). Ako su dekodirane 32-bajtne vrijednosti identične —
  `K_hmac == K_enc` — **aplikacija MORA odbiti start**. **Poređenje sirovih Base64 stringova nije
  usklađeno**: dvije različite reprezentacije mogu dekodirati u isti ključ.
- **Granica tvrdnje.** Guard mehanički dokazuje **nejednakost bajtova**, ne **nezavisnost**.
  Zabrana izvedenosti `K_hmac` iz `K_enc` ostaje na snazi, ali **provenijencija ključa ostaje
  obaveza secret-provisioninga i operativnog upravljanja** i **ne smije se lažno predstaviti** kao
  matematički dokazana ovim poređenjem.
- **`.env.example`.** Buduća implementacija smije dodati **imena** varijabli u praćeni
  `.env.example`, ali svaka primjer-vrijednost ključa mora biti **namjerno nevalidan placeholder**
  (presedan D-025, klauzula 9), tako da startup guard padne ako se primjer isporuči. **Nijedan
  funkcionalan razvojni ključ ni secret se ne smije commitovati** (§9).
- **Produkcija ostaje otvorena.** D-070 **ne zatvara i ne slabi `D-OPEN-004a`**: izbor KMS/providera,
  produkcijski model pristupa ključu, rotation cadence i recovery **ostaju odgođeni** (`13` §3.1).
  **Local static key i dalje nikada nije produkcijski spreman.**

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

**Obuhvat v1 i vlasništvo — precizacija (D-070, 2026-08-28).** Nijedna tvrdnja iznad se ne slabi.

- **Identifikatori osiguranja/kartice nisu klasa `phase5-basic-v1`** (`RULING 4`). `AHV`/`AVS` je
  **jedina** validirana identifikatorska klasa te vrste u v1; generički identifikator osiguranja,
  identifikator kartice osiguranja, **`VeKa`** i broj članstva/kartice **nemaju kanonski definisan
  uzorak**, pa uslov iz D-060, klauzule 24 **nije ispunjen**. **Nijedan dokument, test ni komentar
  ne smije tvrditi tu pokrivenost**; buduće dodavanje traži **novu verziju ruleseta**.
- **Švicarski telefon ima tačnu, potpuno nabrojanu v1 sintaksu** (`RULING 5`): međunarodno
  `+41`/`0041` uz **tačno 9** cifara, kompaktno ili grupisano **jednim konzistentnim separatorom**
  (`XX XXX XX XX` ili `XX-XXX-XX-XX`); nacionalno **isključivo** uz neposrednu oznaku `Tel`, `Tel.`,
  `Telefon`, `Mobile`, `Natel` ili `Fax` — case-insensitive, uz whitespace i opciono jednu `:` — pa
  `0` + **tačno 9** cifara ili `0XX XXX XX XX` / `0XX-XXX-XX-XX`. Prva cifra područja je `1`–`9`, a
  kandidat **ne smije** biti podniz dužeg decimalnog niza. **Goli nacionalni brojevi bez oznake,
  oblici sa tačkama, `(0)` varijante i miješani separatori ostaju neredigovani**, i **fallback
  generički telefonski regex se ne primjenjuje** — kandidat koji ne prođe prepoznavač **ostaje
  nepromijenjen**. Ovo je doslovna primjena posture „dvosmisleno → ne rediguj" i klinička zaštita
  doziranja, laboratorijskih, tarifnih, ICD, datumskih i mjernih vrijednosti.
- **Imena, adrese i klinički sadržaj ostaju izvan v1 redakcione površine**, a **redakcija ostaje
  izričito NE sigurnosna granica** — obje tvrdnje iznad ostaju nepromijenjene.
- **Implementaciju `phase5-basic-v1` posjeduje `P5-I6`**, ne `P5-I3` (D-070, `RULING 1`). `P5-I3`
  posjeduje isključivo primitive bez baze, uključujući **generički** SHA-256 tekstualni helper koji
  `P5-I6` kasnije konzumira za `source_text_hash` i `redacted_text_hash`.

## 8.4 Kanonski status sigurnosnih primitiva Faze 5 — `P5-I3` (D-071, 2026-08-29)

**Nijedna tvrdnja iz §7, §8, §8.1, §8.2 ni §8.3 se ne slabi i ne prepisuje.** Ova sekcija
konstatuje **koji su sigurnosni primitivi Faze 5 sada kanonski**, i — jednako obavezujuće —
**koje granice tvrdnje ostaju netaknute**.

**Kanonski primitivi.** Pod-gateovi `P5-I3A` (merge `ea0769f1bc34baf8670aa8d4b4b5dfc3433e94db`),
`P5-I3B` (merge `13bee31fcdd5e4717eface4677e41f0d949ff080`) i `P5-I3C` (merge
`6cffd9bf319068b78fa395b29ec76d9327593062`) su **implementirani, verifikovani, vlasnički
pregledani i merged**. Kanonski su:

- **lokalna AES-256-GCM implementacija** enkripcije/dekripcije po **D-025**, iza kanonske
  `ENCRYPTION_SERVICE` granice;
- **kanonski D-025 AAD builder** — jedini izvor AAD-a za Fazu 5;
- **strogo lokalno rukovanje enkripcijskim ključem** — `LocalStaticKeyProvider`,
  `ENCRYPTION_LOCAL_KEY` i `ENCRYPTION_KEY_VERSION`, RFC 4648 standardni Base64 bez whitespacea,
  **tačno 32 dekodirana bajta**, uz startup/konfiguracionu grešku na svakom odstupanju;
- **`MANUAL` v1 normalizacija eksternog identifikatora** — NFC, očuvane vodeće nule i veličina
  slova, bez `NFKC`, maksimum **255 UTF-8 bajtova** nad post-NFC oblikom (D-070, `RULING 2`);
- **HMAC eksterne reference** — kanonska poruka, katalog domena, HMAC-SHA256, token `h1.<hex64>`,
  `HMAC_LOCAL_KEY` po istom Base64/32-bajtnom ugovoru;
- **guard `K_hmac != K_enc` nad dekodiranim bajtovima**, u **konstantnom vremenu**; identične
  dekodirane vrijednosti **obaraju start aplikacije**;
- **normalizacija kliničkog teksta** — `CRLF`/`CR` u `LF`, NFC bez `NFKC`, očuvani tabovi,
  unutrašnji whitespace i klinički sadržaj, odbijeni `NUL` i C0/C1 kontrolni znakovi, **tekst se
  nikada ne skraćuje**;
- **generički SHA-256 helper** — UTF-8 ulaz u 64 mala heksadecimalna znaka;
- **generator pseudonima** sa **CSPRNG** izvorom entropije kroz mockabilan seam i **uppercase
  kanonizator** pseudonima.

**Granice tvrdnje — izričito očuvane.**

- **Produkcijski KMS se NE tvrdi.** `P5-I3` je isporučio **lokalni/razvojni** adapter ključa.
  **`D-OPEN-004a` ostaje otvoren** — izbor KMS/providera, produkcijski model pristupa ključu,
  rotation cadence, recovery i uslovni per-row DEK. **Local static key i dalje nikada nije
  produkcijski spreman.**
- **Guard razdvajanja ključeva dokazuje nejednakost bajtova, ne nezavisnost.** Zabrana izvedenosti
  `K_hmac` iz `K_enc` ostaje na snazi, a **provenijencija ključa ostaje obaveza
  secret-provisioninga i operativnog upravljanja** — nikada se ne smije predstaviti kao
  matematički dokazana ovim poređenjem.
- **Redakcija NIJE implementirana u `P5-I3`.** **`phase5-basic-v1` ostaje u vlasništvu `P5-I6`** i
  **nije implementiran** (D-070, `RULING 1`). **Redakcija ostaje izričito NE sigurnosna granica**
  (§8.3), i nijedna tvrdnja iz §8.3 se ne mijenja.
- **Nikakva implementacija baze ni API-ja se ne tvrdi.** `P5-I3` je bio **slice primitiva bez
  baze**: nijedna migracija, schema, grant, rola, politika, trigger, ruta ni izmjena runtime
  zavisnosti paketa. Perzistencija `external_ref_hmac`, jedinstvenost i lookup pseudonima, i sva
  poslovna validacija su **prenesene obaveze `P5-I4`** — `CO-P5-I3-I4-2` i `CO-P5-I3-I4-1`
  (D-071, `RULING 2`; `05` §6).
- **`source_text_hash` i `redacted_text_hash` NISU izračunati ni perzistirani.** `P5-I3` posjeduje
  **generički** SHA-256 primitiv i samo njega; **`P5-I6`** ga kasnije konzumira (§8.2).
- **Profil `AXENITA` ne postoji i ne izmišlja se.** **`D-OPEN-009` ostaje `BLOCKED EXTERNAL`**
  (`13` §7); njegovo odsustvo **ne blokira** zatvaranje `P5-I3`, jer `P5-I3` taj profil nikada nije
  posjedovao.

**Kompletnost primitiva nije kompletnost nizvodnog posla.** Kanonski status ove sekcije se **ne
smije** čitati kao završenost perzistencije, API površine, redakcije, produkcijskog upravljanja
ključevima ni poslovne konzumacije. Vidi D-071 u `06`.

## 8.5 Sigurnosne posljedice `P5-I6` governancea (D-092, 2026-10-07)

**Nijedna tvrdnja iz §7, §8, §8.1–§8.4, §11 ni §12 se ne slabi i ne prepisuje.** Ova sekcija aditivno
bilježi sigurnosne / privatnosne posljedice vlasničkih odluka `OD-P5-I6-3` … `OD-P5-I6-5` i čuva
otvorene granice. Postaje kanonska tek nakon punog lifecyclea D-092. **D-092 ne autorizuje
implementaciju `P5-I6A`, `P5-I6B` ni `P5-I6C`.**

**Iskrenost redakcije.**

1. Redakcija `phase5-basic-v1` je **deterministička i rule-based**. **Nije AI semantički
   klasifikator** i ne koristi AI, heurističko ni semantičko izvođenje.
2. **Nepodržana ili inertna klasa se ne smije predstaviti kao uspješno redigovana.** Klasa eksterne /
   tekuće-intake reference pacijenta je u v1 **`INERT WITHOUT INPUT SOURCE`** (`OD-P5-I6-3`):
   manuelni tekstualni zahtjev ne nosi polje eksterne reference, nijedno se ne uvodi radi aktivacije
   klase, i nijedan status (uključujući `redaction_status = COMPLETED`), odgovor, log, test ni
   dokument ne smije tvrditi da je ta klasa redigovana dok ne postoji stvarni, kanonski definisan
   ulazni izvor. Formulacije §8.3 koje klasu nabrajaju se ne prepisuju; ovo ih aditivno kvalifikuje.
3. **Redakcija nije potpuna granica uklanjanja PHI-a i nije sigurnosna granica** (§8.3, D-060,
   klauzula 41). **Autorizacija i kontrole pristupa originalnom dokumentu ostaju nezavisno
   obavezne**: `view=original` i dalje traži `encounter.document.read_original` (D-043), i nijedna
   kontrola se ne smije oslabiti pozivom na to da je tekst redigovan.

**Prvi kanonski pisač ciphertexta i AAD literali (`OD-P5-I6-5`).**

4. **`P5-I6B` je prvi kanonski pisač ciphertexta** u Fazi 5 (envelope kolone `patient_references`
   ostaju nezapisane u Fazi 5). Kanonski D-025 AAD (`02` §2.7.4) uključuje `column=<column name>`,
   pa su **AAD literali kolona nepovratni ulazi interoperabilnosti pohrane**: red enkriptovan pod
   jednim literalom ne može se dekriptovati pod drugim.
5. Tačan AAD literal za ciphertext originalnog / normalizovanog teksta, tačan AAD literal za
   ciphertext redigovanog teksta i tačna vrijednost / format `encryption_key_ref` **MORAJU biti
   zamrznuti prije prvog perzistiranog `P5-I6B` reda**. **Nijedna implementacija ih ne smije
   pogađati.** Kasnija promjena tih literala za perzistirane redove je **nekompatibilna kriptografska
   / storage promjena**.
6. **Deterministički encrypt/decrypt test vektori** za upravo te vrijednosti su **obavezni prije
   implementacijske autorizacije `P5-I6B`**.

```text
AAD_ORIGINAL_LITERAL              = OPEN
AAD_REDACTED_LITERAL              = OPEN
ENCRYPTION_KEY_REF_VALUE_FORMAT   = OPEN
```

D-025 se **ne mijenja**; enkripcijska shema se **ne redizajnira**; `D-OPEN-004a` ostaje
neadjudiciran.

**Otvorene granice — izričito očuvane.**

7. **`request_sha256` nad PHI-nosivim tijelom** zahtijeva **izričitu potvrdu izvršnog ugovora**
   (`OD-P5-I6-7`, OPEN). D-092 ga **ne zabranjuje i ne odobrava**; §12.1 i D-069 ostaju nepromijenjeni.
8. **Minimizacija audit payloada:** **nijedan tekst dokumenta** — izvorni, normalizovani ni
   redigovani — ne ulazi u audit payload. Tačan create / read audit ugovor ostaje **OPEN**
   (`OD-P5-I6-9`).
9. Smjer `FAILED` politike je **`CLOSED / EXPLICIT FAILURE SET`** (`OD-P5-I6-4`); tačan skup ostaje
   za izvršni ugovor `P5-I6A`. Zabrana fallbacka `view=redacted` na normalizovani ili originalni
   tekst (§8.3) ostaje nepromijenjena.
10. **`D-OPEN-007` (retencija) ostaje OTVOREN** i ovom sekcijom se ne razrješava.

```text
SECURITY_REQUIREMENT_UNAUTHORIZED_MUTATION = 0
D_OPEN_004A   UNCHANGED / UNADJUDICATED
D_OPEN_007    OPEN / DEFERRED
D_OPEN_009    UNCHANGED / UNADJUDICATED
```

Vidi D-092 u `06`.

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
validiran IBAN, eksternu referenciju pacijenta iz tekućeg zahtjeva i **strogo prepoznat** švicarski
telefon, gdje „strogo prepoznat" znači **tačnu, potpuno nabrojanu v1 sintaksu** iz D-070,
`RULING 5`. **Zasebna klasa identifikatora osiguranja/kartice — uključujući `VeKa` — nije dio v1**
(D-070, `RULING 4`; §8.3). **Ne uklanja** imena, adrese, dijagnoze, simptome, lijekove, doziranja,
mjerenja, medicinski nužne datume ni kliničke nalaze.

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

**Obavezna sanitizacija slobodnog teksta (D-062, Dio F.3).** `POST /encounters/{encounterId}/cancel`
prima polje `reason` za koje **ne postoji kolona u `encounters`** i **ne uvodi se**. Ono završava
**isključivo u audit tragu** i **mora biti sanitizovano prije zapisa** — slobodan tekst koji unosi
klinički korisnik može sadržavati PHI. `02` §15.4 već traži da `previous_value`/`new_value` budu
sanitizovani; isti zahtjev vrijedi za `reason`. Nesanitizovan `reason` u auditu je **defekt klase
T3**, ne kozmetički propust.

**Faza-5 audit hash — SELF-HASH ONLY (D-069, 2026-08-27) — sekcija iznad se ne mijenja.**

Uz gore navedeni sadržaj audit zapisa, Faza 5 ima **ratifikovan hash ugovor**:

```text
event_sha256           = SHA-256( RFC 8785 (JCS) kanonski JSON konačnog pohranjenog
                                  audit payloada, bez samog event_sha256 )
                         UTF-8; 64 mala heksadecimalna znaka; JSON kljucevi = imena kolona baze
previous_event_sha256  = NULL
```

**Faza 5 NE tvrdi linearni hash lanac.** Ona daje **per-event integritet**, ne **tamper-evident
sekvencu**; append-only garancija i dalje počiva na `revoke update, delete, truncate` nad
`audit_events` (`02` §15). Per-practice, per-resource i globalno predecessor ulančavanje su
**eksplicitno odgođeni** u kasniju governance odluku, koja mora zasebno riješiti obuhvat lanca,
redoslijed, zaključavanje, konkurentne pisce, sprečavanje forka, interakciju sa retentionom i
genesis semantiku. **Faza 5 te semantike ne smije prećutno izmisliti.**

**Hash se računa nad KONAČNIM SANITIZOVANIM pohranjenim vrijednostima** `previous_value`,
`new_value` i `metadata`, pa nikada ne pina nesanitizovan PHI. **`id` i `occurred_at` se generišu
tačno jednom prije hashiranja** i **iste** vrijednosti se upisuju u `audit_events`. Tačan skup
polja i puna definicija su u `04` §7.5a.2; vlasnik implementacije je slice **`P5-I4`**.

---

## 12.1 `P5-I4` audit minimizacija i perzistentni hash format (D-072, 2026-08-29)

**Sekcija §12 iznad se NE prepisuje.** D-072 je **pooštrava** za `P5-I4` i **ne slabi** nijednu
njenu tvrdnju.

### Obuhvat audita u `P5-I4`

```text
P5_I4_AUDIT_SCOPE   = SUCCESSFUL_CREATE_ONLY
AUDIT_ACTOR_TYPE    = USER
AUDIT_RESOURCE_TYPE = PATIENT_REFERENCE
AUDIT_ACTION        = PATIENT_REFERENCE_CREATED
```

- **Samo uspješan `POST /patient-references`** piše trajan audit red.
- **`GET /patient-references/{id}` ne piše nijedan trajan `P5-I4` audit red.** Sensitive-read audit
  iz §12 ostaje kanonska obaveza kasnijih slice-ova nad dokumentima; `P5-I4` ga **ne uvodi i ne
  prejudicira**, i **`DOCUMENT_VIEWED` se ne reciklira**.
- **Neuspješan `POST` ne piše failure red.**
- **Poslovni `INSERT` i audit `INSERT` su u istoj transakciji**; neuspjeh bilo kojeg → **rollback
  oba**. Ne postoji lažan success audit.

### Minimizacija payloada

```text
previous_value = null
new_value      = null
metadata       = {"sourceSystem":"MANUAL"}
```

**U `P5-I4` audit payload se NIKADA ne upisuje:**

- sirovo tijelo zahtjeva;
- sirova eksterna referenca (Class A / Class C identifikator, §2, §11);
- HMAC eksterne reference (`external_patient_ref_hash`);
- pseudonim;
- `birthYear`;
- `sexCode`.

`resource_id` nosi UUID kreiranog `patient_references` reda i **jedini je** identifikator resursa u
zapisu. Ovo je **stroža** primjena §3 (data minimization) i §12, ne izuzetak od njih.

### Opcionalna audit telemetrija u Fazi 5

```text
session_id_hash = null
ip_address      = null
user_agent_hash = null
```

Faza 5 ta tri polja **ne popunjava**. **Nikakva `inet` serijalizacija se ne izmišlja**, i pitanje
kanonskog tekstualnog oblika te vrijednosti **ne nastaje** i **ne prejudicira se**.

### `AUDIT_EVENT_HASH_PAYLOAD_V1` — perzistentna sigurnosna semantika

```text
AUDIT_HASH_FORMAT        = AUDIT_EVENT_HASH_PAYLOAD_V1
AUDIT_OCCURRED_AT_FORMAT = UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO
event_sha256             = SHA-256( UTF8( RFC8785_JCS( AUDIT_EVENT_HASH_PAYLOAD_V1 ) ) )
```

- Payload nosi **tačno sedamnaest** ključeva — imena kolona `audit_events` — i **isključuje
  isključivo `event_sha256`**.
- **`previous_event_sha256` je uvijek prisutan kao `null`.** Faza 5 i dalje **NE tvrdi linearni
  hash lanac**; daje **per-event integritet**, ne tamper-evident sekvencu. Append-only garancija i
  dalje počiva na `revoke update, delete, truncate` nad `audit_events`.
- **Hashira se konačna sanitizovana pohranjena reprezentacija**, pa hash **nikada ne pina
  nesanitizovan PHI**.
- **`occurred_at` se generiše tačno jednom**, u obliku sa šest decimalnih cifara od kojih su
  **posljednje tri `000`**, i **isti instant se perzistira**; **nikakav DB-generisani zamjenski
  timestamp**.
- **Format je perzistentan i retroaktivno nepopravljiv** — promjena nakon prvog upisa obezvrjeđuje
  sve ranije redove. **Obavezna je reprodukcija `event_sha256` iz stvarnog pohranjenog reda**
  (`08` §12.11, §12.12).
- **RFC 8785 se implementira lokalno**, uz pinovane službene vektore; **nijedan JCS paket nije
  ovlašten**, i **reducirani vlastiti podskup se ne smije predstavljati kao JCS**.

### Hashiranje zahtjeva

```text
REQUEST_SHA256_INPUT = VALIDATED_ORIGINAL_PARSED_BODY
request_sha256       = SHA-256( UTF8( RFC8785_JCS( validirano ORIGINALNO parsirano tijelo ) ) )
```

Hashira se **sačuvana originalna parsirana JSON vrijednost nakon validacije** — **ne** sirovi HTTP
bajt-stream, **ne** pre-parse tekst, **ne** transformisani DTO i **ne** server-proširena
reprezentacija. **Nepoznata polja se odbijaju prije hashiranja**, pa nikada ne ulaze u digest;
**server defaulti se ne uvode**. Sva isključenja iz `03` §4.1 — identitet korisnika i ordinacije,
headeri, `Idempotency-Key`, request id, server timestampovi — ostaju **doslovno na snazi**, pa
digest **ne nosi identitet ni PHI-kontekst**.

### Granice tvrdnje — izričito očuvane

- **Produkcijski KMS se NE tvrdi.** `D-OPEN-004a` ostaje otvoren; local static key **nikada nije
  produkcijski spreman**.
- **AXENITA implementacija ne postoji.** `P5-I4` prihvata **isključivo `MANUAL`**
  (`SOURCE_SYSTEM_ACCEPTED = MANUAL_ONLY`), a `D-OPEN-009` ostaje **`BLOCKED EXTERNAL`** (`13` §7).
- **Nikakva izmjena scheme, migracije, RLS politike ni granta se ne tvrdi ni ne traži** —
  `P5-I4` konzumira kanonsku `P5-I2` sigurnosnu osnovu nepromijenjenu.

**`P5-I4` je `NOT AUTHORIZED` / `NOT STARTED`; ovo je ugovor, ne implementacija.** Vidi D-072 u
`06` i `04` §7.5a.3.

---

## 12.2 `P5-I5` encounter audit katalog, minimizacija i sanitizacija razloga otkazivanja (D-082, 2026-09-06)

**Sekcije §12 i §12.1 iznad se NE prepisuju.** D-082 ih **pooštrava** za `P5-I5` i **ne slabi**
nijednu njihovu tvrdnju. **Ovo je ugovor, ne implementacija:** `P5-I5` je **`NOT AUTHORIZED`** i
**`NOT STARTED`**.

### Obuhvat audita u `P5-I5` (`OD-D082-5`)

```text
AUDIT_ACTOR_TYPE    = USER
AUDIT_RESOURCE_TYPE = ENCOUNTER

katalog akcija P5-I5:
  ENCOUNTER_CREATED
  ENCOUNTER_UPDATED
  ENCOUNTER_CANCELLED
```

- **`P5-I5` konzumira postojeću `P5-I4` audit infrastrukturu i hash ugovor nepromijenjene.**
  **`P5-I5` NE SMIJE uvesti drugi audit mehanizam.**
- **Katalog je iscrpan za closure obuhvat `P5-I5`.** Audit akcija `ENCOUNTER_READY_FOR_ANALYSIS`
  (`03` §29.1a) pripada **komandi unosa dokumenta**, ostaje **izvan** ovog kataloga, i `P5-I5` je
  **ne piše** i **ne prejudicira**.
- **Poslovna mutacija i audit `INSERT` su u istoj admitovanoj tenant transakciji**; neuspjeh
  perzistencije audita **obara/abortira poslovnu transakciju**. **Ne postoji lažan success audit**, i
  **nikada se ne bilježi uspjeh za mutaciju koja se rollback-uje.**
- **Konzumira se kanonski `AUDIT_EVENT_HASH_PAYLOAD_V1`** (`04` §7.5a.2, §12.1 iznad):
  `previous_event_sha256` ostaje **`null`**; `id` i `occurred_at` se generišu **tačno jednom prije
  hashiranja** i **iste** vrijednosti se perzistiraju; hashira se **konačna sanitizovana pohranjena
  reprezentacija**.
- **Faza-5 opciona audit telemetrija ostaje neispunjena:** `session_id_hash`, `ip_address` i
  `user_agent_hash` ostaju **`null`** svuda gdje to zamrznuti Faza-5 audit ugovor traži.
- **Sirovi klinički / slobodno-tekstualni podaci se ne upisuju** — jedini izuzetak je **izričito
  dozvoljen sanitizovan sadržaj razloga otkazivanja**.

### Semantička minimizacija payloada — zamrznuto

```text
ENCOUNTER_CREATED
  previous_value = null
  new_value      = iskljucivo minimalno stanje kreiranja encountera nuzno za auditabilnost
  ZABRANJENO     = kompletan snapshot encountera
                   duplirani patient payload
                   nepotrebni podaci koji identifikuju pacijenta

ENCOUNTER_UPDATED
  previous_value = iskljucivo polja koja je prihvaceni PATCH stvarno promijenio
  new_value      = ista ta polja, u novoj vrijednosti
  ZABRANJENO     = nepromijenjena polja
                   snapshot cijelog reda

ENCOUNTER_CANCELLED
  previous_value / new_value = iskljucivo materijal tranzicije stanja nuzan da se dokaze
                               otkazivanje
  sanitizovan razlog         = iskljucivo u koloni metadata
  ZABRANJENO                 = sirov razlog, bilo gdje i bilo kada
```

Ovo je **stroža** primjena §3 (data minimization) i §12, **ne izuzetak od njih**. Cilj je da encounter
audit **ne postane sekundarni PHI store**.

**Granica ugovora.** Koriste se **postojeća kanonska imena** audit scheme i hash payloada.
**Fizička imena JSON članova unutar `previous_value`, `new_value` i `metadata` nisu kanonizovana ni u
jednom ranijem zapisu i ovdje se NE izmišljaju** — zamrznut je **semantički zahtjev**, a **fizičko
mapiranje je izričito odgođeno u kasniji autorizovani implementacijski gate**. To odgađanje **ne
slabi nijedno pravilo minimizacije iznad**.

### Sanitizacija razloga otkazivanja (`OD-D082-6`)

**`P5-I5` posjeduje uzak, determinističan sanitizer razloga otkazivanja encountera.** On **NE SMIJE
zavisiti od buduće `P5-I6` redakcije.** `encounters` **nema kolonu za razlog i ona se ne uvodi**
(D-062, Dio F.3); razlog završava **isključivo u audit tragu**, i to **isključivo sanitizovan**.

```text
 1  izvrsava se tek NAKON normalne validacije zahtjeva
 2  cuva vec kanonski required/optional i max-length API ugovor za reason
 3  deterministicki Unicode-normalizuje
 4  zamjenjuje CR, LF, TAB i druge sekvence kontrolnih znakova sigurnim razmakom,
    umjesto da zadrzi sirove kontrolne znakove
 5  sazima ponovljeni whitespace
 6  trimuje vodeci i prateci whitespace
 7  perzistira/auditira ISKLJUCIVO sanitizovan rezultat
 8  nikada ne pise i ne logira nesanitizovan ulaz
 9  ne radi nikakvo semanticko prepisivanje
10  ne koristi nikakvu AI/model-baziranu sanitizaciju
11  ne trazi nikakvu izmjenu baze ni scheme
```

- **Ako sanitizovan rezultat prekrši već kanonsko validacijsko pravilo za `reason`, primjenjuje se
  normalna validacijska greška.** **Sanitizer NE SMIJE prećutno proizvesti zamjenski sadržaj.**
- **Ovo je granica protiv audit/log injectiona i granica privatnosti.** Nesanitizovan `reason` u
  auditu je **defekt klase `T3`** (§11, §12, §18.1), ne kozmetički propust.
- **Ovo NIJE `P5-I6` klinička redakcija.** `phase5-basic-v1` ostaje `P5-I6`, a §8.3 / D-060,
  klauzula 41 („redakcija nije sigurnosna granica") ostaju **nepromijenjeni**.
- **Sirov `reason` se ne vraća ni u jednom odgovoru i ne logira se u sirovom obliku** (`03`, cancel
  ugovor).

**L-4 anotacija (D-083, `OD-D083-3`) — ugovor iznad se NE prepisuje.** Tačka 2 pretpostavlja već
kanonski required/optional i max-length ugovor za `reason`, ali **konkretno encounter-cancel pravilo
trenutno nije zamrznuto**. Status: **`DEFERRED — MUST BE ADJUDICATED BEFORE P5-I5D IMPLEMENTATION
AUTHORIZATION`**. D-083 **ne odlučuje** obaveznost, minimalnu ni maksimalnu dužinu, ponašanje praznog
stringa, sadržajne zahtjeve ni zamjenski/default tekst. **Nijedno pravilo sanitizacije iznad se ne
slabi.**

### Granice tvrdnje — izričito očuvane

- **Nijedno sigurnosno proširenje.** Ne uvodi se `SECURITY DEFINER`, `BYPASSRLS`, nova rola, owner
  politika, trigger, funkcija ni migracija.
- **Nikakva izmjena scheme, migracije, RLS politike ni granta se ne tvrdi ni ne traži** — `P5-I5`
  konzumira kanonsku `P5-I2` sigurnosnu osnovu **nepromijenjenu**.
- **Zabrana opšteg existence oraclea ostaje sigurnosna klauzula** — opšti read-before-write
  diskriminator nad `encounters` bio bi cross-tenant enumeracijski kanal (§18.1, `T1`).
- **Faza 5 i dalje NE tvrdi linearni audit lanac.** `previous_event_sha256` ostaje `NULL`.
- **Produkcijski KMS se NE tvrdi.** `D-OPEN-004a` ostaje otvoren.

```text
P5-I5    DEPENDENCY-SATISFIED
P5-I5    NOT AUTHORIZED / NOT STARTED
P5-I5A / P5-I5B / P5-I5C / P5-I5D   NOT AUTHORIZED / NOT STARTED
D-082    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
```

**`DEPENDENCY-SATISFIED != IMPLEMENTATION AUTHORIZED`.** Vidi D-082 u `06`, `04` §7.5a, `05` §6,
`03` §4 i §4.1, i `08` §12.13.

**STATUSNA ANOTACIJA (D-084, 2026-10-03) — sekcija, tačke 1–11 i L-4 anotacija iznad se NE
prepisuju.** D-084 formalno zatvara pod-gate `P5-I5A` (encounter domen / state machine; kanonski kroz
**PR #65**, `38976047…`). `P5-I5A` ne piše audit, ne perzistira `reason` i ne dodiruje sanitizer;
**nijedan sigurnosni zahtjev ove sekcije se ne mijenja ni ne slabi**, a **L-4 ostaje `DEFERRED —
MUST BE ADJUDICATED BEFORE P5-I5D IMPLEMENTATION AUTHORIZATION`**. Blok statusa iznad opisuje
**pred-D-084 stanje** i **ne prepisuje se**.

```text
P5-I5A   CANONICAL IMPLEMENTATION COMPLETE / FORMALLY CLOSING UNDER D-084 /
         NOT YET EFFECTIVE (tek po publikaciji i verifikaciji D-084)
P5-I5    IN_PROGRESS
P5-I5B / P5-I5C / P5-I5D   NOT AUTHORIZED / NOT STARTED
```

Vidi D-084 u `06`.

**STATUSNA ANOTACIJA (D-085, 2026-10-04) — sekcija, tačke 1–11 i anotacije iznad se NE prepisuju.**
D-085 zamrzava ugovor `P5-I5B` (Encounter Create). **Nijedan sigurnosni zahtjev se ne slabi**; za
`P5-I5B` se dodatno fiksira:

- **audit minimizacija**: `ENCOUNTER_CREATED.new_value` isključivo `{status, version}`, `metadata = {}`
  — bez `patientReferenceId`, `responsiblePhysicianId`, pseudonima, dijagnostičkih kodova,
  `insuranceContext`, `guarantorType`, `specialtyCode`, starosti/spola, `occurredAt`, `treatmentDate`,
  slobodnog teksta i snapshota zahtjeva;
- **nema existence oraclea**: bez membership i patient-reference pre-reada; jedino
  `encounters_responsible_physician_membership_fk` → generički `422`; globalno `23503 → 422`
  zabranjeno; cross-tenant/nepostojeći `patientReferenceId` → statični `500` (§18.1, `T1`);
- **higijena stringova** specifična za `P5-I5B` (bez NUL, C0/C1, CR/LF/TAB, rubnog whitespacea;
  bez prećutne transformacije) — **nije nova globalna politika**;
- **`★` RI-naspram-RLS** ostaje trajna regresija; pad → `HARD HOLD`.

```text
D-085    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
P5-I5B   CONTRACT FROZEN IN LOCAL D-085 CANDIDATE / NOT AUTHORIZED FOR MUTATION / NOT STARTED
P5-I5C / P5-I5D   NOT AUTHORIZED / NOT STARTED   (L-4 nepromijenjen)
```

Vidi D-085 u `06`.

**STATUSNA ANOTACIJA (D-086, 2026-10-04) — sekcija, tačke 1–11 i anotacije iznad se NE prepisuju.**
D-086 formalno zatvara pod-gate `P5-I5B` (Encounter Create; kanonski kroz **PR #68**, `8c465c32…`).
**Sigurnosni dokaz `P5-I5B` je prihvaćen** (audit minimizacija, bez existence oraclea, usko
`encounters_responsible_physician_membership_fk` → generički `422`, statični `500` za patient FK,
higijena stringova, `★` RI-naspram-RLS neizmijenjen); **nema preostalog sigurnosnog blokatora
`P5-I5B`**. **Nijedan sigurnosni zahtjev ove sekcije se ne mijenja ni ne slabi**, a **L-4 ostaje
`DEFERRED — MUST BE ADJUDICATED BEFORE P5-I5D IMPLEMENTATION AUTHORIZATION`**. Blok statusa D-085 iznad
opisuje **pred-D-086 stanje** i **ne prepisuje se**.

```text
D-086    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
P5-I5B   CANONICAL / POST-PUBLICATION VERIFIED / FORMALLY CLOSING UNDER D-086 / NOT YET EFFECTIVE
P5-I5C   NOT AUTHORIZED / NOT STARTED
P5-I5D   NOT AUTHORIZED / NOT STARTED / BEHIND L-4
```

Vidi D-086 u `06`.

**STATUSNA ANOTACIJA (D-087, 2026-10-04) — sekcija, tačke 1–11 i anotacije iznad se NE prepisuju.**
D-087 zamrzava ugovor `P5-I5C` (PATCH Encounter / optimistička konkurencija). **Nijedan sigurnosni
zahtjev se ne slabi**; za `P5-I5C` se dodatno fiksira:

- **fizičko mapiranje `ENCOUNTER_UPDATED`** (ranije odgođeno): `previous_value` / `new_value` sadrže
  **isključivo** stvarno promijenjena (`IS DISTINCT FROM`) `PATCH`-mutabilna poslovna polja, pod API
  camelCase imenima; `occurredAt` UTC ms `Z`; **bez `version`**; `metadata = {}`; value-no-op →
  `{}` / `{}`; stara/nova vrijednost se hvata u istom SQL iskazu kao update — **minimizacija iznad se
  primjenjuje, ne slabi**;
- **nema existence / state oraclea**: nepostojeći, tenant-nevidljiv, zastario i zastario +
  nedozvoljen status → isti `409 VERSION_CONFLICT`; `INVALID_STATE_TRANSITION` isključivo kada isti
  atomičan iskaz potvrdi vidljiv red sa tačnom verzijom; nema `404` ni diskriminirajućeg pre-reada;
- **malformiran `encounterId`** → `400` bez pristupa bazi i bez echo-a vrijednosti;
- **higijena stringova** `P5-I5B` reupotrijebljena za `P5-I5C` — **nije nova globalna politika**;
  usko `encounters_responsible_physician_membership_fk` → `422`; globalno `23503 → 422` zabranjeno;
- **`★` RI-naspram-RLS** ostaje trajna regresija; pad → `HARD HOLD`. **L-4 ostaje `DEFERRED`.**

```text
D-087    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
P5-I5C   CONTRACT FROZEN IN LOCAL D-087 CANDIDATE / NOT AUTHORIZED FOR MUTATION / NOT STARTED
P5-I5D   NOT AUTHORIZED / NOT STARTED / BEHIND L-4
```

Vidi D-087 u `06`.

**STATUSNA ANOTACIJA (D-088, 2026-10-04) — sekcija, tačke 1–11 i anotacije iznad se NE prepisuju.**
D-088 formalno zatvara pod-gate `P5-I5C` (PATCH Encounter / optimistička konkurencija; kanonski kroz
**PR #71**, `ce9e644c…`). **Sigurnosni dokaz `P5-I5C` je prihvaćen** (bez existence / state oraclea —
isti `409 VERSION_CONFLICT` za nepostojeći / nevidljiv / zastario encounter; minimizovan
`ENCOUNTER_UPDATED` audit; malformiran `encounterId` bez pristupa bazi i bez echo-a; usko
`encounters_responsible_physician_membership_fk` → `422`; negativan dokaz privilegije zabranjene
kolone; `★` RI-naspram-RLS neizmijenjen); **nema preostalog sigurnosnog blokatora `P5-I5C`**. Audit
`previous_value` se veže **posljednji**, pa raniji pozivaoci ostaju ponašajno nepromijenjeni i i dalje
upisuju SQL `NULL` (`F-1`, `FIXED`). `F-3` (Problem Details `instance` / `requestId` po D-075; sadržaj
rute ne echo-uje malformiranu vrijednost) i `F-4` (serverska poruka nije vidljiva klijentu) su
prihvaćeni AS-IS bez sigurnosnog uticaja. **Nijedan sigurnosni zahtjev ove sekcije se ne mijenja ni ne
slabi**, a **L-4 ostaje `DEFERRED — MUST BE ADJUDICATED BEFORE P5-I5D IMPLEMENTATION AUTHORIZATION`**;
D-088 ne definiše semantiku razloga otkazivanja i ne autorizuje cancel. Blok statusa D-087 iznad
opisuje **pred-D-088 stanje** i **ne prepisuje se**.

```text
D-088    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
P5-I5C   CANONICAL / POST-PUBLICATION VERIFIED / FORMALLY CLOSING UNDER D-088 / NOT YET EFFECTIVE
P5-I5D   NOT AUTHORIZED / NOT STARTED / BEHIND L-4
NEXT REQUIRED GATE (P5-I5D)   L-4 OWNER ADJUDICATION
```

Vidi D-088 u `06`.

**STATUSNA / L-4 ANOTACIJA (D-089, 2026-10-05) — sekcija, tačke 1–11, L-4 anotacija i anotacije iznad
se NE prepisuju.** D-088 je objavljen kroz **PR #72** (`be01969…`) i efektivan; `P5-I5C` je `FORMALLY
CLOSED / EFFECTIVE`. **D-089 kanonizuje L-4** i time popunjava tačku 2 (kanonski ugovor `reason` za
encounter cancel); **nijedno pravilo sanitizacije iznad se ne slabi**:

- **L4-A:** `reason` je **obavezan** ne-null JSON string; nema default / zamjenskog razloga;
- **L4-B:** sirov parsiran string ≤ **255 UTF-8 bajtova**; konačan sanitizovan / NFC rezultat
  ≥ **1 code point** i ≤ **255 UTF-8 bajtova**; inače `422 VALIDATION_ERROR`;
- **L4-C — `ACCEPT_AND_SANITIZE`:** reject-higijena `P5-I5B` / `P5-I5C` se **ne primjenjuje globalno**;
  nema semantičke klasifikacije, AI-ja, NFKC ni zamjenskog teksta.

**Tačan profil sanitizera (`OD-P5-I5D-5`)** — ulaz je parsiran JSON string (ne transportni bajtovi,
ne JSON escape izvor, ne dužina HTTP tijela):

```text
1  Unicode well-formedness      usamljeni surogat -> 422; validan surogatni par dozvoljen
2  sirova duzina                <= 255 UTF-8 bajtova prije NFC / sanitizacije; inace 422
3  NFC                          nikada NFKC
4  Cc -> U+0020                 U+0000-U+001F, U+007F, U+0080-U+009F, pojedinacno, prije sazimanja
5  sazimanje                    nizovi Unicode White_Space -> jedan U+0020
6  trim                         vodeci / prateci whitespace
7  konacna validacija           min 1 code point; max 255 UTF-8 bajtova; inace 422
```

- `Cf` (uključujući bidi formatiranje) se u `P5-I5D` ne uklanja i ne klasifikuje; `U+FFFD` se ne
  odbija; parser može nevalidan UTF-8 sa žice zamijeniti sa `U+FFFD` prije aplikacijske validacije —
  ugovor ne rekonstruiše originalne bajtove; **nema custom raw-body UTF-8 parsera**.
- **Privatnost:** sirov `reason` se **nikada** ne perzistira, ne vraća i ne logira; sanitizovan rezultat
  postoji **isključivo** u `audit_events.metadata.reason` (fizički ključ `reason`, bez dodatnih
  članova) i ulazi u SELF-HASH audit hash; `previous_value` / `new_value` nose isključivo `status` i
  `version`.
- **Anti-oracle:** jedan ograničen atomičan iskaz / CTE razlikuje nevidljiv / cross-tenant /
  nepostojeći (`404 RESOURCE_NOT_FOUND`) od vidljivog neotkazivog (`409 INVALID_STATE_TRANSITION`);
  **nema opšteg pre-reada** (§18.1, `T1`). Malformiran `encounterId` → `400` bez echo-a. Replay
  istog ključa nad drugim encounterom → `409 IDEMPOTENCY_CONFLICT` isključivo iz keširanog stanja.
- **Nema izmjene scheme / migracije / RLS-a / granta / grafa stanja.** `★` RI-naspram-RLS ostaje
  trajna regresija; pad → `HARD HOLD`.

Formulacije `L-4 … DEFERRED — MUST BE ADJUDICATED BEFORE P5-I5D IMPLEMENTATION AUTHORIZATION`, `P5-I5D
… BEHIND L-4` i `D-088 … NOT EFFECTIVE` iznad opisuju **pred-D-089 stanje** i **ne prepisuju se**.

```text
D-089    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
L-4      OWNER-ADJUDICATED / CANONICALIZED IN LOCAL D-089 CANDIDATE
P5-I5C   COMPLETE / VERIFIED / FORMALLY CLOSED / EFFECTIVE
P5-I5D   CONTRACT FROZEN LOCALLY UNDER D-089 / NOT YET IMPLEMENTATION-AUTHORIZED / NOT STARTED
```

Vidi D-089 u `06`.

**STATUSNA ANOTACIJA (D-090, 2026-10-06) — sekcija, tačke 1–11, L-4 anotacija i anotacije iznad se NE
prepisuju.** D-089 je objavljen kroz **PR #73** (`fab7df0f…`) i efektivan; **L-4 je kanonski i
implementiran** (kanonska implementacija `P5-I5D` kroz **PR #74**, `aa3220e5…`). D-090 formalno
zatvara pod-gate `P5-I5D`. **Sigurnosni dokaz `P5-I5D` je prihvaćen:**

- autorizacija prije obrade tijela — verifikovano;
- ekvivalentan `404` za nevidljiv / nepostojeći encounter — **bez existence oraclea**;
- idempotencijsko vezivanje resursa (keširani `resourceId` ≠ `encounterId` → `409
  IDEMPOTENCY_CONFLICT`);
- sirov `reason` se **nikada** ne pohranjuje, ne vraća i ne logira; sanitizovan `reason` **isključivo**
  u audit metadata (`audit_events.metadata.reason`);
- otkazivanje sigurno pri trci; atomičnost rollbacka (audit i transakcija).

**`D-OPEN-007` ostaje otvoren** — sanitizovan razlog otkazivanja može sadržavati PHI kao audit
metadata; pitanje retencije audita D-090 ne razrješava. **D-090 ne mijenja nijedan sigurnosni
zahtjev.** Formulacije D-089 anotacije iznad (`D-089 … NOT CANONICAL / NOT EFFECTIVE`, `L-4 …
CANONICALIZED IN LOCAL D-089 CANDIDATE`, `P5-I5D … NOT STARTED`) opisuju **pred-D-090 stanje** i **ne
prepisuju se**.

```text
D-090    LOCALLY AUTHORED / NOT CANONICAL / NOT EFFECTIVE
D-089    PUBLISHED / MERGED (PR #73) / CANONICAL / POST-PUBLICATION VERIFIED / EFFECTIVE
L-4      CANONICAL / IMPLEMENTED
P5-I5D   CANONICAL / POST-PUBLICATION VERIFIED / FORMALLY CLOSING UNDER D-090 / NOT YET EFFECTIVE
D-OPEN-007   OPEN
SECURITY REQUIREMENT MUTATION = 0
```

Vidi D-090 u `06`.

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

Za Fazu 5 (D-062): svih **osam** FK-ova je composite ili ukorijenjeno u `practices`, pa je
cross-practice referenca **nekonstruktibilna**, a ne samo odbijena (§4.1). Validacija
`responsiblePhysicianId` je dio te iste kontrole — i **ne dodaje nijednu sposobnost čitanja**.

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

**Validacija odgovornog ljekara ne širi insider pristup (D-062, Dio D).** Provjera se izvršava kao
database FK: **nijedan red ne ulazi u aplikaciju, nijedna kolona se ne projektuje, nijedan upit ne
imenuje ciljnog korisnika.** Rezidualna površina je **boolean orakl dodjeljivosti** nad UUID-om koji
pozivalac već posjeduje, ograničen na vlastiti tenant — kategorijski različit od čitanja identiteta.
`practice_memberships_self_select` ostaje bajt-identična, `users` i dalje ima tačno dvije politike, i
temeljni gate co-member identiteta ostaje **otvoren** (`13` §19).

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

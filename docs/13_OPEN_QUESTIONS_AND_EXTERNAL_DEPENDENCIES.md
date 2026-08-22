# 13 — Open Questions and External Dependencies

Ovaj dokument sprečava da Cursor izmisli odgovore za dijelove koji zavise od ugovora ili poslovne odluke.

---

# 1. Produkcijski identity provider

**Status:** OPEN  
**Potrebno:** prije pilota  
**Opcije:** Keycloak, Entra ID, Auth0, drugi OIDC  
**Kriteriji:**

- MFA;
- Swiss/prihvatljiv hosting;
- DPA;
- role/group support;
- audit;
- availability;
- cijena.

**Development:** isolated dev auth.

---

# 2. ESM/CommonJS

**Status:** MUST DECIDE PHASE 1  
**Preporuka:** ESM/NodeNext ako NestJS/Prisma testovi prolaze.  
**Zabrana:** ne mijenjati nakon faze 2 bez ADR-a.

---

# 3. Encryption/KMS

**Status:** OPEN BEFORE PHASE 5 FINALIZATION — **djelimično zatvoreno**  
**Potrebno odlučiti (historijska lista):**

- AES-GCM format;
- DEK granularnost;
- KMS provider;
- key rotation;
- local adapter;
- decrypt permission;
- backup recovery.

Cursor smije implementirati interface i development adapter, ali ne smije nazvati local static key produkcijski spremnim.

## 3.1 Tekuće stanje — šta je zatvoreno, a šta nije

**Historijska lista iznad se ne mijenja.** Ova podsekcija samo čini tekući autoritet nedvosmislenim
(D-025; D-060, klauzula 45).

**ZATVORENO odlukom D-025 (2026-08-02):**

- format AES-GCM ciphertexta;
- `iv` / `auth_tag` / kanonski AAD;
- granularnost DEK-a **u v1** — verzionisani aplikacijski ključ iz secrets managera, **bez per-row
  DEK-a**;
- ugovor local development adaptera (`LocalStaticKeyProvider`, startup guardovi);
- mehanika verzionisanja enkripcije po redu (`encryption_version`);
- mehanika rotacije — atomarna re-enkripcija reda sa svježim IV-ovima, **bez izmjene `*_hash`
  kolona**.

**I DALJE OTVORENO i isključivo PRODUKCIJSKO (D-OPEN-004a):**

- izbor KMS/providera;
- produkcijski model pristupa ključu;
- rotation cadence;
- procedura recoveryja/backupa ključa;
- uslovni per-row DEK i crypto-shredding, ako to retention (§8, D-OPEN-007) kasnije zahtijeva.

**D-060 ne zatvara nijednu od otvorenih stavki** i **ne kreira produkcijski KMS dizajn**. On uvodi
**namjenski HMAC ključ `K_hmac`** za deterministički lookup token eksternog ID-a — **zaseban ključni
materijal**, odvojen od `K_enc`, koji **ne dira** KEK/DEK hijerarhiju. Produkcijski životni ciklus
`K_hmac` (provisioning, čuvanje, rotacija, recovery) **pada pod isti otvoreni produkcijski gate** i
rješava se zajedno sa D-OPEN-004a.

**Local static key i dalje nikada nije produkcijski spreman.**

---

# 4. Produkcijski hosting

**Status:** OPEN  
**Kriteriji:**

- lokacija;
- PostgreSQL;
- object storage;
- Redis;
- KMS;
- backup;
- private networking;
- observability;
- ugovor/podobrađivači.

---

# 5. AI provider

**Status:** EXTERNAL/OPEN  
**Potrebno:**

- DPA;
- retention;
- training opt-out;
- region;
- structured output;
- SLA;
- cost;
- model version behavior.

Core koristi mock dok nije odobreno.

---

# 6. OAAT TarifMatcher

**Status:** BLOCKED EXTERNAL  
**Potrebno:**

- licenca;
- partner/software integrator uslovi;
- package artefakti;
- Java API;
- verzije;
- test cases;
- redistribution/deployment rights.

Cursor ne smije implementirati službenu logiku iz sekundarne dokumentacije.

---

# 7. Axenita

**Status:** BLOCKED EXTERNAL  
**Potrebno:**

- partner agreement;
- API docs;
- sandbox;
- auth;
- patient/encounter/document read;
- billing draft read/write;
- webhooks/polling;
- attachment;
- rate limit;
- idempotency;
- errors;
- reconciliation.

Do tada ManualAdapter.

**Normalizacija eksternog ID-a (D-060, klauzula 12).** Aktivni normalizacioni profil za
deterministički lookup token je **`MANUAL` v1** i **immutable je čim pod njim postoji ijedan
perzistirani red**. Zaseban profil **`AXENITA`** smije biti definisan **tek nakon** što ovo pitanje
bude odblokirano i stvarni format identifikatora bude poznat. **Axenita normalizacija se ne
izmišlja unaprijed**, i profil `MANUAL` v1 se ne mijenja da bi je „unaprijed pokrio".

---

# 8. Retention

**Status:** BUSINESS/LEGAL OPEN  
**Entiteti:**

- source document;
- redacted text;
- analysis;
- audit;
- raw AI;
- raw tariff;
- export artefact;
- log;
- backup.

Ne uvoditi fizički delete API prije odluke.

---

# 9. Approval role

**Status:** PRACTICE CONFIG DECISION  
Default:

- physician/admin approve;
- MPA ne;
- billing specialist configurable.

Potrebna pilot potvrda.

---

# 10. PDF audit generator

**Status:** DEFERRED  
Obavezan je JSON audit package. PDF izbor mora razmotriti:

- template;
- fonts/licence;
- rendering security;
- signature/hash;
- storage.

---

# 11. Exact tariff content display

**Status:** DEPENDS ON LICENSE  
UI catalog descriptions mogu imati licencna ograničenja. Ne seedovati stvarne kataloge bez prava.

---

# 12. Monetary calculation

**Status:** TARIFF ENGINE DEPENDENCY  
Da li službeni engine vraća amount/points ili backend dodatno mapira? Ne pretpostavljati. Polja ostaju nullable.

---

# 13. Diagnosis coding systems

**Status:** PILOT DISCOVERY  
MVP schema podržava generic system/code. Potvrditi šta Axenita/praxis koristi.

---

# 14. Object storage provider

**Status:** HOSTING DECISION  
Local MinIO; production adapter ostaje S3-compatible.

---

# 15. Monitoring provider

**Status:** OPEN  
Mora podržati data scrubbing i Swiss/privacy zahtjeve.

---

# 16. D-OPEN-011 — Runtime access model za `users` i `practices` — RIJEŠENO

**Status:** **RIJEŠENO / ZATVORENO 2026-08-12**

Riješeno odlukom **D-047 — Runtime access model za `users` i `practices` (Bootstrap-Scoped RLS)**
u `06`. D-OPEN-011 nosi status `SUPERSEDED BY D-047`.

Normativni sadržaj sada živi u: `02` §16.2.1, §16.2.4, §17.5, §17.6, §18.2, §20.2a, §22.2, §25.1.1
i §28.2; `03` §3.1, §3.7.1 i `GET /practices/{practiceId}`; `15` §5 i §8.1; `08` §21.5.

- **više ne blokira** implementacijski rad — raniji phase gate je zatvoren;
- pristup nad `users` i `practices` je ograničen kroz `ENABLE` + `FORCE RLS` i **column-level**
  grantove, a ne kroz neograničeni `SELECT`;
- **bootstrap pristup kroz `practice_memberships` i dalje NE predstavlja opšti runtime pristup**
  nad `users` ni `practices` — ta tvrdnja ostaje tačna; access model je riješen zasebnim
  politikama, ne proširenjem membership bootstrapa.

Sekcije §16.1–§16.6 ispod zadržane su **nepromijenjene radi historije i sljedivosti**. One opisuju
stanje prije 2026-08-12. Ispod svake je zabilježeno kako je D-047 zatvorio odgovarajuću stavku.

## 16.1 Prihvaćeni kontekst

Prihvaćeni model već definiše, i to nije predmet ovog pitanja:

- bearer autentifikacija prije tenant bootstrapa;
- identitet autentifikovanog korisnika uspostavljen iz pouzdanih auth podataka;
- user-scoped `practice_memberships` bootstrap RLS;
- `set_request_context(p_practice_id uuid)` kao SECURITY INVOKER;
- transakcijski lokalni `app.user_id` i `app.practice_id`;
- tenant rute i platform rute kao **odvojene** authorization klase;
- **nema automatske unije** `platformRoles` i tenant membershipa.

Neriješeno je **opšti runtime access model za `users` i `practices`**.

## 16.2 Otvorena pitanja

Pristup čitanju:

1. Koje runtime role smiju `SELECT` nad `users`?
2. Koje runtime role smiju `SELECT` nad `practices`?
3. Koje kolone smije čitati koja klasa ruta?
4. Smije li tenant korisnik čitati isključivo vlastiti `users` red?
5. Smije li tenant korisnik čitati isključivo `practices` u kojima ima aktivan membership?
6. Jesu li list/directory endpointi dozvoljeni, ili samo čitanje po ID-u?

Pristup upisu:

7. Koje runtime role smiju `INSERT`, `UPDATE` ili deaktivirati `users`?
8. Koje runtime role smiju `INSERT`, `UPDATE`, deaktivirati ili arhivirati `practices`?

Platform i system autorizacija:

9. Kako se autorizuju platform/system rute?
10. Jesu li `platformRoles` dovoljni za platform čitanja, ili je potrebna zasebna DB rola/kontekst?
11. Koje servisne putanje smiju koristiti `copilot_system`?
12. Jesu li usko ograničeni SECURITY DEFINER helperi dozvoljeni za platform operacije?
13. Ako jesu, koji grants, fiksiran `search_path`, validacija ulaza i audit zahtjevi važe?

Životni ciklus:

14. Kako se tretiraju deaktivirani korisnici?
15. Kako se tretiraju neaktivne ordinacije?
16. Kako se tretiraju opozvani ili neaktivni membershipi?

Audit i API:

17. Koji audit dokaz je obavezan za čitanja i izmjene nad `users` i `practices`?
18. Koje API permisije i endpointi zavise od ove odluke?

## 16.3 Zabranjene pretpostavke dok je pitanje otvoreno

- nema neograničenog `SELECT` nad `users`;
- nema neograničenog `SELECT` nad `practices`;
- nema generičkih runtime grantova prema `PUBLIC`;
- nema tenant RLS politike koja izlaže sve korisnike;
- nema tenant RLS politike koja izlaže sve ordinacije;
- membership bootstrap pristup **nije** opšti `users`/`practices` pristup;
- `platformRoles` se **ne** pretvaraju automatski u tenant pristup;
- tenant membershipi i `platformRoles` se **ne** spajaju unijom;
- **nijedan SECURITY DEFINER bypass se ne smije uvesti kao privremeno rješenje**;
- nijedna implementacija ne smije tiho riješiti D-OPEN-011;
- rad koji zavisi od generičkog `users`/`practices` pristupa **staje na phase gateu**.

## 16.4 Šta prihvaćena odluka mora definisati

- klase ruta;
- aplikacijske role;
- database role;
- RLS politike;
- grants;
- column-level izloženost;
- API endpointe;
- API permisije;
- tenant naspram platform razdvajanja;
- system/service pristup;
- SECURITY DEFINER politiku, ako je ima;
- audit ponašanje;
- vlasništvo migracije;
- pozitivne testove;
- negativne testove;
- rollback i migracijsku strategiju.

## 16.5 Zavisnosti

- D-023 i D-033 u `06`;
- `02` §17.3, §18.3 i §28.2 — tenant/RLS model;
- `03` §3 — klasifikacija ruta;
- `04` §5.2 i §6.2.2 — phase blocker;
- `05` — `BLOCKED` checklist grupe u fazama 3 i 4;
- `07` — phase gate u Fazi 3 i Fazi 4.

## 16.6 Izlazni kriteriji

D-OPEN-011 se smije zatvoriti tek kada prihvaćeni ADR definiše:

- tačan runtime read pristup nad `users`;
- tačan runtime write pristup nad `users`;
- tačan runtime read pristup nad `practices`;
- tačan runtime write pristup nad `practices`;
- tenant authorization putanju;
- platform authorization putanju;
- service/system authorization putanju;
- RLS i grant implementaciju;
- obavezne API permisije;
- audit ponašanje;
- vlasništvo migration paketa;
- vlasništvo pozitivnih i negativnih testova.

Do tada implementacija ostaje blokirana svuda gdje je potreban generički `users`/`practices` pristup.

## 16.7 Kako je D-047 zatvorio svaku stavku

*(Dopuna 2026-08-12. Sekcije §16.1–§16.6 iznad su historijske i nepromijenjene.)*

| Otvoreno pitanje iz §16.2 | Rješenje u D-047 |
|---|---|
| 1–3. koje role smiju `SELECT` nad `users`/`practices`, i koje kolone | isključivo `copilot_app`, **column-level**: `users` `(id, email, display_name, preferred_language, status)`; `practices` `(id, code, name, default_language, timezone, status)` — klauzule 4 i 6 |
| 4. smije li tenant korisnik čitati isključivo vlastiti `users` red | **da** — klauzula 3; red drugog korisnika je `DENY / NOT IMPLEMENTED` (klauzula 12) |
| 5. smije li čitati isključivo ordinacije vlastitog membershipa | **da** — klauzula 5; nakon tenant konteksta sužava se na tačno jednu |
| 6. jesu li list/directory endpointi dozvoljeni | **ne** — takva ruta ne postoji i ne uvodi se (klauzula 11) |
| 7–8. runtime `INSERT`/`UPDATE`/deaktivacija nad `users`/`practices` | **nijedna** — klauzula 15 |
| 9–10. autorizacija platform ruta; jesu li `platformRoles` dovoljni | platform put nad te dvije tabele **ne postoji** u v1 — klauzula 13 |
| 11. koje servisne putanje smiju koristiti `copilot_system` | **nijedna** nad `users`/`practices` — klauzula 14 |
| 12–13. jesu li SECURITY DEFINER helperi dozvoljeni i pod kojim uslovima | **nijedan se ne uvodi**; pitanje otpada — klauzula 2 |
| 14. deaktivirani korisnici | odbijeni prije `set_user_context` — klauzula 9 |
| 15. neaktivne ordinacije | odbijene prije `set_request_context` — klauzula 10 |
| 16. opozvani ili neaktivni membershipi | vidljivost da (`/me` ime), autorizacija ne — klauzule 5 i 10 |
| 17. obavezan audit dokaz | strukturirani operativni log; trajni `audit_events` red nije moguć pre-tenant — klauzula 19 |
| 18. koje API permisije i endpointi zavise | `practice.read` i `GET /practices/{practiceId}` — klauzula 11 |

Zabrane iz **§16.3 nisu ukinute**. Sve ostaju na snazi kao trajna pravila i sada su sprovedene
tehnički: nema neograničenog `SELECT` nad `users` ni `practices`; nema grantova prema `PUBLIC`;
nema politike koja izlaže sve korisnike ni sve ordinacije; membership bootstrap i dalje nije opšti
pristup; `platformRoles` se ne pretvaraju u tenant pristup i ne spajaju se unijom; **nijedan
SECURITY DEFINER bypass nije uveden**.

Izlazni kriteriji iz **§16.6** su ispunjeni u cijelosti — vidi `06` D-OPEN-011, sekciju o
zatvaranju.

---

# 17. External dependency readiness table

| Dependency | Mock | Contract | Credentials | Legal | Production |
|---|---:|---:|---:|---:|---:|
| OIDC | dev | no | no | no | no |
| AI | yes | internal | no | no | no |
| Tarif Engine | yes | internal v1 | no | no | no |
| Axenita | manual | interface | no | no | no |
| S3 | MinIO | yes | local | n/a | no |
| KMS | dev adapter | interface | no | no | no |

---

# 18. Kako se zatvara pitanje

Za svako pitanje:

1. pribaviti dokument/odluku;
2. kreirati accepted ADR u Decision Logu;
3. ažurirati architecture/schema/API ako treba;
4. definisati test;
5. tek onda implementirati.

---

# 19. Co-member `displayName` pristup — obavezan gate, trigger vezan za konzumenta

**Status — dvije odvojene stavke, ne smiju se miješati (D-061):**

| Stavka | Status |
|---|---|
| **konzument Faze 5** (`03` §12 `GET /encounters`) | **RIJEŠEN IZOSTAVLJANJEM / PRISTUP ODGOĐEN** — D-061, klauzule 6–10 |
| **temeljni dizajn pristupa co-member identitetu** | **OPEN / NOT IMPLEMENTED** — nepromijenjen |

**Naziv gatea:** `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` — **historijska labela, zadržana
doslovno** radi stabilnosti unakrsnih referenci (D-061, klauzula 13). Riječi „BEFORE PHASE 5" su
oznaka **porijekla**, ne opis tekućeg trigera; trigger je redefinisan u §19.2a.

**Izvor:** D-047, klauzula 12. Ovo pitanje **nije** dio D-OPEN-011 i nije njime bilo pokriveno;
izdvojeno je i imenovano upravo da ne bi bilo otkriveno tek u implementaciji.

**Šta D-061 jeste i šta nije.** D-061 **ne rješava** pristup co-member identitetu — on **uklanja
njegovog jedinog konzumenta u Fazi 5** i **pomjera trigger** na prvog stvarnog konzumenta. Nijedna
`users` politika, nijedan grant, nijedno proširenje `practice_memberships` RLS-a, nijedna
denormalizacija i nijedna `SECURITY DEFINER` funkcija njime **nisu** uvedeni. Zahtjevi iz §19.3 i
zabrane iz §19.4 ostaju **na snazi u cijelosti**.

## 19.1 Problem

Tri zamrznuta API odgovora izlagala su `displayName` **drugog** korisnika. Njihova tekuća
dispozicija nakon D-061:

| Odgovor | Vlasnička faza | Dispozicija |
|---|---|---|
| `responsiblePhysician.displayName` — `03` §12 `GET /encounters` | Faza 5 | **UKLONJEN iz aktivnog oblika.** Vraća se samo `responsiblePhysician.id`; ključ `displayName` je **odsutan**, ne `null` (D-061, klauzule 7–9) |
| `responsiblePhysician.displayName` — `03` §15 analysis workspace | **Faza 8** (`04` §10.3; `05` §9) | **BUDUĆI KONZUMENT POD GATEOM** — tekući prvi poznati trigger (D-061, klauzula 15) |
| `approvedBy.displayName` — `03` §20 odgovor kreiranja odobrenja | Faza 10 | **CALLER-SELF, nije co-member trigger** — odobravatelj jeste pozivalac (D-061, klauzula 17). Uslovno: read-back tuđeg odobrenja **jeste** trigger |

Nijedan od njih nije u fazi 3. D-047 je pristup redu drugog korisnika ostavio kao
**`DENY / NOT IMPLEMENTED` u v1**: `users` ima tačno dvije politike (`02` §17.5), obje vezane za
identitet pozivaoca, i treća se **ne** kreira bez prihvaćene odluke. **To i dalje važi.**

## 19.2 Kada gate mora biti zatvoren — historijska formulacija

*(Formulacija ispod je **historijska** i **superseded od D-061**. Zadržana je doslovno radi audita.
**Aktivni trigger je §19.2a.**)*

> **Prije implementacije prve funkcionalnosti faze 5 koja treba tuđi `displayName`.** Do tada rad na
> tim odgovorima **staje na phase gateu**. Implementacija ne smije tiho dodati politiku, proširiti
> grant niti denormalizovati ime u drugu tabelu.

**Tok vlasništva do danas.** Objava PHI dizajna Faze 5 (**D-060**, klauzula 45) ovo pitanje **nije
dodirnula, ni riješila, ni prejudicirala**: nijedna `users` politika, nijedan grant, nijedna
denormalizacija i nijedna izmjena `GET /encounters` odgovora nisu tom odlukom uvedene. Vlasništvo je
prenijela na **zaseban gate `P5-G1`**, koji je izvršen i objavljen kao **D-061**. Zabrana iz
citiranog historijskog teksta — bez politike, bez proširenog granta, bez denormalizacije — **ostaje
na snazi u cijelosti** (§19.4).

## 19.2a Aktivni trigger (D-061, klauzule 14–16, 18)

Gate se **mora ponovo otvoriti**:

> **prije implementacije prvog endpointa ili toka koji vraća `display_name` drugog korisnika.**

Trigger **više nije faza**. Tekući prvi poznati kanonski konzument je:

```text
GET /analyses/{analysisId}/workspace     (03 §15)
```

čija je vlasnička faza **Faza 8 — Mock AI/Tariff** (`04` §10.3; `05` §9, red „workspace endpoint").

Ako **bilo koji raniji** konzument stekne prihvaćen zahtjev da vrati ime drugog korisnika, gate se
otvara **tada**, u toj fazi. Vrijedi pravilo **šta prije nastupi**.

**Trajno pravilo.** Svaka buduća površina koja doda ime, prezime, email ili drugi identifikacioni
atribut **drugog** korisnika mora **prvo** proći ovaj gate prihvaćenom odlukom. Tiho dodavanje
takvog polja je **phase-gate defekt**.

### 19.2a.1 Zašto je Faza 5 discharged izostavljanjem, ne proširenjem pristupa

Faza 5 je gate **prošla tako što traženi pristup nije kupila**:

- `GET /encounters` više ne traži tuđi `display_name`, pa Fazi 5 co-member pristup **nije potreban**;
- **nijedan pristup nije proširen** — `users` i dalje ima tačno dvije caller-self politike,
  `practice_memberships` i dalje ima tačno jednu caller-self politiku, grantovi su nepromijenjeni;
- **temeljni problem nije riješen** i ne smije se tako opisivati.

Dokazi koje je `P5-G1` utvrdio i koji ostaju ulaz za buduću odluku:

- **RLS bira redove, ne kolone.** Svaka politika koja propusti tuđi `users` red čini ga čitljivim u
  **svih pet** grantovanih kolona — `id`, `email`, `display_name`, `preferred_language`, `status`
  (`02` §20.2a). `email` je Class B (`09` §2);
- **co-member politika nema ni dokaz membershipa.** `practice_memberships` nosi `ENABLE` + `FORCE
  RLS` i **caller-self** politiku `practice_memberships_self_select`. RLS referencirane tabele
  primjenjuje se i unutar podupita politike, pa bi naivna co-member politika nad `users` vidjela
  **nula** membership redova i propustila **nula** korisničkih redova;
- **druga širina košta dodatno.** Da bi takva politika radila, morao bi se proširiti i
  `practice_memberships` RLS — a ta tabela ima **table-level** `SELECT` grant (`02` §20.2), pa bi
  izloženost obuhvatila i `professional_gln`.

## 19.3 Šta prihvaćena odluka mora definisati

- tačan opseg politike — co-member iste ordinacije, ili uži kriterij;
- da li politika zavisi od `app.practice_id`, `app.user_id`, ili oba;
- **dokazano PostgreSQL ograničenje: column grantovi su vezani za rolu, ne za politiku.** Svaki
  red koji politika propusti čitljiv je u **svim** grantovanim kolonama, pa bi co-member politika
  izložila i `email`, ne samo `display_name`. Odluka mora eksplicitno prihvatiti tu posljedicu ili
  je izbjeći drugim mehanizmom;
- interakciju sa `practices_context_narrow` obrascem — da li je potrebna RESTRICTIVE politika i
  nad `users`;
- da li neaktivan membership co-membera i dalje izlaže ime;
- audit ponašanje;
- vlasništvo migration paketa — očekivano `013_rls_policies` ili kasniji;
- pozitivne i negativne testove, uključujući test da korisnik izvan ordinacije ne vidi ime;
- **kako se dobija dokaz membershipa ciljnog korisnika** bez proširenja caller-self
  `practice_memberships` RLS-a, ili uz eksplicitno prihvatanje te druge izloženosti
  (D-061, klauzule 4–5).

**Ovaj spisak D-061 ne skraćuje.** Nijedna njegova stavka nije riješena; sve ostaju obavezan sadržaj
buduće odluke.

## 19.4 Zabranjene pretpostavke dok je pitanje otvoreno

- nema treće `users` politike;
- nema proširenja `users` column granta;
- **nema proširenja `practice_memberships` RLS-a ni njegovog granta** kao posrednog puta do
  co-member vidljivosti (D-061, klauzule 5 i 11);
- nema denormalizacije `display_name` u tenant tabelu radi zaobilaženja gatea;
- **nema `SECURITY DEFINER` identity lookupa, projekcijskog viewa sa vlastitim grantom, četvrte
  database role ni drugog Prisma klijenta / privilegovane database putanje** (D-054, klauzula 7;
  D-061, klauzula 11);
- **nema zamjenskog identifikatora** — inicijali, skraćeno ime, hash imena ili stabilan nadimak
  **ne** rješavaju gate i tretiraju se kao njegovo zaobilaženje;
- nijedan konzument faze 5 ne smije tiho dobiti generičku vidljivost nad `users`;
- `BLOCKED` oznaka iz `15` §3.1 se **ne** koristi za ovu stavku — vrijednost je povučena; ovaj
  gate se vodi ovdje i u D-047 klauzuli 12.

---

# 20. Prihvaćene izloženosti međustanja faze 3 — obavezno zatvaranje u fazi 4

**Status:** PRIHVAĆENO, VREMENSKI OGRANIČENO
**Izvor:** D-047 klauzula 18; **D-049 klauzula 3**

Ovo **nisu otvorena pitanja** — obje izloženosti su prihvaćene odlukom. Vode se ovdje jer imaju
**obavezan izlazni gate** i ne smiju tiho preživjeti fazu 4.

## 20.1 Izloženosti

| Ime | Šta je izloženo | Izvor | Zatvara |
|---|---|---|---|
| `PHASE 3 IS AN INTERMEDIATE NON-PILOT SECURITY STATE` | `copilot_app` na nivou baze vidi **generičke** `practice_memberships` redove, jer §17.3 RLS još ne postoji | D-047, klauzula 18 | `02` §17.3, paket `013`, faza 4 |
| `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` | `copilot_app` može čitati `practice_id`, `allow_mpa_approval` i `allow_billing_specialist_approval` **za svaki** `practice_settings` red, te utvrditi broj i postojanje redova | D-049, klauzula 3 | `practice_settings` `ENABLE` + `FORCE RLS` i tenant politika, paket `013`, faza 4 |

## 20.2 Zašto su prihvaćene

Isti i jedini razlog za obje: **na tom gateu ne postoje stvarni pilot korisnici ni podaci**, a faza
4 je obavezna prije faze 5. Zamrznuti gate `ALL RLS TESTS GREEN — required before phase 5` ostaje
na snazi.

Za `practice_settings` postoji i drugi razlog: alternativa — funkcionalan settings endpoint u fazi
3 — tražila bi `UPDATE` grant nad tabelom bez ijedne tenant politike koja taj write ograničava. To
je **veći** rizik od trokolonskog reada, pa je D-049 izabrao manji.

## 20.3 Zabranjene pretpostavke

- **nijedna od dvije izloženosti se ne smije umanjivati** ni opisivati kao teorijska;
- nijedan test ne smije tvrditi da su zatvorene u fazi 3 (`08` §21.5.6, §21.7.4);
- `practice_settings` **ne dobija** table-level `SELECT` ni ijedan upisni grant u fazi 3;
- nijedna settings ruta se **ne registruje** u fazi 3;
- **nijedan pilot ni rad faze 5** se ne izvodi nad sigurnosnim stanjem faze 3.

## 20.4 Izlazni kriteriji

Obje se smatraju zatvorenim tek kada, u fazi 4:

- `02` §17.3 postoji i regresijski test dokazuje da `copilot_app` više ne vidi generičke
  `practice_memberships` redove (`08` §21.5.6);
- `practice_settings` nosi `ENABLE` + `FORCE RLS` i tenant politiku, a regresijski test dokazuje da
  `copilot_app` više ne vidi redove izvan tekućeg tenanta (`08` §21.7.5);
- `practice_settings` `UPDATE` grant postoji **isključivo zajedno** sa politikom koja ga ograničava.

**Dopuna (D-053, 2026-08-16).** Zatvaranje druge izloženosti je **prebrojano i uslovljeno**:
`copilot_app` u fazi 4 dobija **tačno devet** `SELECT` i **tačno devet** `UPDATE` kolona iz `02`
§20.2b.1 — nikada table-level, i bez `INSERT`-a i `DELETE`-a. Trokolonska površina faze 3 je
**strogi podskup** i **ne opoziva se**.

Uz to, zatvaranje **ne smije oboriti `GET /me`**: uvođenje tenant politike bi bez adaptacije tiho
uklonilo uslovne permisije iz zamrznutog `/me` odgovora. **Politika se ne slabi** — adaptira se
aplikacijski put (`02` §17.1a; `03` §10), a regresijski dokaz iz `08` §21.7.6 je **dio izlaznog
kriterija**. Izlazni kriterij nije ispunjen ako je `/me` sačuvan slabljenjem RLS-a, uvođenjem
`X-Practice-ID` na `/me`, `SECURITY DEFINER` funkcijom ili bilo kojom zaobilaznicom.

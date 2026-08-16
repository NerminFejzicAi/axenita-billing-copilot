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

**Status:** OPEN BEFORE PHASE 5 FINALIZATION  
**Potrebno odlučiti:**

- AES-GCM format;
- DEK granularnost;
- KMS provider;
- key rotation;
- local adapter;
- decrypt permission;
- backup recovery.

Cursor smije implementirati interface i development adapter, ali ne smije nazvati local static key produkcijski spremnim.

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

# 19. Co-member `displayName` pristup — obavezan gate prije faze 5

**Status:** OPEN / ODGOĐENO uz imenovani gate
**Naziv gatea:** `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`
**Izvor:** D-047, klauzula 12. Ovo pitanje **nije** dio D-OPEN-011 i nije njime bilo pokriveno;
izdvojeno je i imenovano upravo da ne bi bilo otkriveno tek u implementaciji.

## 19.1 Problem

Tri zamrznuta API odgovora izlažu `displayName` **drugog** korisnika:

- `responsiblePhysician.displayName` — `03` §12 `GET /encounters`;
- `responsiblePhysician.displayName` — `03` §15 analysis workspace;
- `approvedBy.displayName` — `03` §20 approval odgovor.

Nijedan od njih nije u fazi 3. D-047 je pristup redu drugog korisnika ostavio kao
**`DENY / NOT IMPLEMENTED` u v1**: `users` ima tačno dvije politike (`02` §17.5), obje vezane za
identitet pozivaoca, i treća se **ne** kreira bez prihvaćene odluke.

## 19.2 Kada gate mora biti zatvoren

**Prije implementacije prve funkcionalnosti faze 5 koja treba tuđi `displayName`.** Do tada rad na
tim odgovorima **staje na phase gateu**. Implementacija ne smije tiho dodati politiku, proširiti
grant niti denormalizovati ime u drugu tabelu.

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
- pozitivne i negativne testove, uključujući test da korisnik izvan ordinacije ne vidi ime.

## 19.4 Zabranjene pretpostavke dok je pitanje otvoreno

- nema treće `users` politike;
- nema proširenja `users` column granta;
- nema denormalizacije `display_name` u tenant tabelu radi zaobilaženja gatea;
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

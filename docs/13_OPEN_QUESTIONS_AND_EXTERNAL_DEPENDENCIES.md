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

# 16. D-OPEN-011 — Runtime access model za `users` i `practices`

**Status:** OPEN / NERIJEŠENO

- blokira implementacijski rad koji zavisi od generičkog runtime pristupa nad `users` ili `practices`;
- mora biti riješen prije relevantnog dijela faze 3;
- **bootstrap pristup kroz `practice_memberships` NE rješava opšti runtime pristup** nad `users` ni `practices`.

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

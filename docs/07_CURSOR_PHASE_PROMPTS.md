# 07 — Cursor Phase Prompts

## Uputstvo

Za svaku fazu kopirati samo odgovarajući prompt. Cursoru ne slati sve faze kao jednu implementaciju.

Prije prompta:

```text
git status
git branch --show-current
```

Nakon prompta zahtijevati završni report i zaustavljanje.

## Status rekonsilijacije role-permission modela

| Dokument | Status |
|---|---|
| `06_DECISION_LOG.md` — D-039 do D-045 | **ACCEPTED** |
| `15_ROLE_PERMISSION_MATRIX_V1.md` | **kreiran i ACCEPTED** |
| `03_API_CONTRACT_V1.md` | **usklađen** |
| `04_BACKEND_IMPLEMENTATION_PLAN_V1.md` | **usklađen** |
| `05_IMPLEMENTATION_CHECKLIST.md` | **usklađen** |
| `07_CURSOR_PHASE_PROMPTS.md` — ovaj dokument | **usklađen** |
| `08_TEST_STRATEGY_V1.md` | čeka kontrolisani batch |
| `MANIFEST.md` | čeka kontrolisani batch |

---

# Univerzalni header za svaki prompt

```text
Radiš na projektu Auditabilni Axenita TARDOC Billing Safety Copilot.

Prije bilo kakve izmjene obavezno pročitaj:
- AGENTS.md
- README.md
- docs/00_PROJECT_RULES.md
- docs/01_BACKEND_ARCHITECTURE_V1.md
- docs/02_DATABASE_SCHEMA_V1.md
- docs/03_API_CONTRACT_V1.md
- docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md
- docs/05_IMPLEMENTATION_CHECKLIST.md
- docs/06_DECISION_LOG.md
- docs/08_TEST_STRATEGY_V1.md
- docs/09_SECURITY_PRIVACY_BASELINE_V1.md
- docs/12_NAMING_AND_CODE_STANDARDS.md
- docs/15_ROLE_PERMISSION_MATRIX_V1.md

Pregledaj trenutni Git status, postojeći kod, migracije, package fajlove i testove.

Prije pisanja koda prikaži plan:
1. cilj;
2. relevantna pravila;
3. fajlovi za kreiranje;
4. fajlovi za izmjenu;
5. migracije;
6. endpointi;
7. testovi;
8. rizici;
9. pretpostavke;
10. acceptance kriteriji.

Implementiraj isključivo traženi scope.
Ne prelazi u narednu fazu.
Ne koristi prisma db push.
Ne mijenjaj primijenjene migracije.
Ne resetuj bazu ili volume bez eksplicitne dozvole.
Ne zaobilazi TenantDatabaseService za tenant podatke.
Ne loguj medicinski sadržaj ili secrets.
Ne označavaj zadatak završenim dok relevantni testovi ne prođu.
Ne dodavaj nove API permisije ni endpointe.
Ne uvodi novi broj migration paketa i ne renumeriši postojeće.
Role grantovi moraju tačno odgovarati docs/15_ROLE_PERMISSION_MATRIX_V1.md.
Ne izvodi nijedan grant iz proznih primjera, naziva role ni starije dokumentacije.
Ne implementiraj nijedan grant koji nije u docs/15.
Svaka buduća izmjena matrice zahtijeva novi prihvaćeni ADR i kontrolisanu rekonsilijaciju.
Pokreni git diff --check.
Prikaži tačnu listu izmijenjenih fajlova.
Ne commituj i ne pushuj bez zasebne instrukcije.

Na kraju:
- navedi rezultat;
- listu fajlova;
- migracije i SQL sigurnosne objekte;
- API promjene;
- sve izvršene komande;
- rezultat svake provjere;
- otvorene probleme;
- ažuriraj docs/05_IMPLEMENTATION_CHECKLIST.md;
- ažuriraj docs/06_DECISION_LOG.md samo ako je donesena nova odluka;
- zaustavi se.
```

---

# Prompt — Faza 1

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 1 — Repository i lokalna infrastruktura iz docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md.

Scope:
- pnpm monorepo;
- NestJS 11 strict API;
- compose PostgreSQL 16, Redis 7, MinIO;
- validated env config;
- Helmet;
- CORS allowlist;
- request ID;
- base Problem Details;
- `/api/v1/health/live`;
- `/api/v1/health/ready`;
- lint, typecheck, test i build scripts.

Ne implementiraj Prisma business modele, auth, RLS, encounter, queue, AI, Tarif Engine ili Axenita.

Posebno:
- zaključi Node/pnpm/Nest/TypeScript verzije;
- predloži ESM ili CommonJS odluku i evidentiraj je u Decision Logu tek nakon tehničke provjere;
- `.env.example` ne smije sadržavati stvarne secrets;
- Docker servisi moraju imati health checks.

Obavezno izvrši acceptance komande faze 1.
Zaustavi se nakon završnog reporta.
```

---

# Prompt — Faza 2

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 2 — Prisma, database role i base migration.

Scope:
- Prisma ORM 7;
- prisma.config.ts;
- schema.prisma generator/output;
- `DATABASE_URL` za copilot_app;
- `MIGRATION_DATABASE_URL` za copilot_migrator;
- init SQL za runtime role;
- DatabaseModule;
- PrismaService singleton;
- migration scripts;
- DB health.

Obavezno dokaži:
- runtime current_user je copilot_app;
- copilot_app nije owner tabela;
- copilot_app ima NOBYPASSRLS;
- copilot_app ne može CREATE TABLE;
- migracija radi na praznoj test bazi;
- prisma validate/generate prolaze.

Ne kreiraj identity ili business tabele osim tehnički nužnih base objekata.
Ne koristi runtime credential za migracije.
```

---

# Prompt — Faza 3

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 3 — Identity i practice domena.

Normativne odluke: D-033 i D-038. Prati docs/02 §6.3, §6.3a, §22.2 i §23.2;
docs/03 §10; docs/04 §5.2, §5.2.1 i §5.4.1; docs/05 Faza 3.

Vlasnik migration paketa za sve schema objekte ove faze je 002_identity_and_practices.
Ne uvodi novi broj paketa.

Kreiraj:
- practices;
- users;
- practice_memberships;
- practice_membership_roles;
- practice_settings;
- migration/grants;
- idempotentan development seed;
- effective-permission resolver interface;
- kontrolisani dev auth;
- GET /api/v1/me;
- osnovni practice read/settings endpoint prema contractu.

practice_memberships (D-038):
- tačno jedan red po ordinaciji i korisniku;
- unique (practice_id, user_id);
- unique (practice_id, id);
- active membership lifecycle;
- NEMA singularne kolone role;
- NEMA indeksa (practice_id, active, role).

practice_membership_roles (D-038):
- id;
- practice_id;
- membership_id;
- role membership_role;
- created_at i updated_at prema projektnim konvencijama;
- primarni ključ nad id;
- unique (practice_id, id);
- unique (practice_id, membership_id, role);
- composite FK (practice_id, membership_id) -> practice_memberships(practice_id, id).

Jedan membership smije nositi nula, jednu ili više tenant rola, svaku najviše jednom.

ZABRANJENO u ovoj tabeli i u ovoj fazi:
- nasljeđivanje rola;
- per-user permission overrid;
- revoked_at;
- revoked_by;
- active na practice_membership_roles;
- valid_from / valid_to;
- append-only historija dodjele;
- platform role u tenant role tabeli;
- database role u tenant role tabeli.

Životni ciklus dodjele (D-038, klauzule 25–33):
- practice_membership_roles čuva isključivo trenutno efektivne dodjele;
- uklanjanje role BRIŠE trenutni red dodjele;
- kasnija ponovna dodjela iste role KREIRA novi red;
- unique (practice_id, membership_id, role) ostaje neparcijalan — brisanje oslobađa trojac;
- historiju dodjele i uklanjanja čuva audit dokaz, ne zadržani redovi;
- aktivnost membershipa ostaje isključivo na practice_memberships.active;
- role redovi neaktivnog membershipa smiju ostati pohranjeni, ali daju nula permisija;
- ponovna aktivacija koristi isključivo eksplicitno pohranjene role redove;
- aktivan membership sa nula rola daje nula permisija.

Generička runtime administracija rola ostaje IZVAN v1. Ne kreiraj:
- role-administration endpoint;
- role-administration permisiju;
- copilot_app INSERT/UPDATE/DELETE grant za upravljanje rolama.

Effective-permission resolver učitava i primjenjuje PRIHVAĆENU normativnu matricu iz
docs/15_ROLE_PERMISSION_MATRIX_V1.md. Implementacijska matrica mora biti mehanički
uporediva sa docs/15; odstupanje obara testove ili build. Ne hard-koduj nijedan grant izvan
docs/15.

GET /api/v1/me — svaki membership vraća:
- membershipId;
- practiceId;
- practiceName;
- active;
- roles[];
- izvedene permissions[].

Obavezno:
- polje memberships[].role NE POSTOJI;
- nema compatibility oblika sa oba polja role i roles;
- roles[] ima jedinstvene vrijednosti i determinističan redoslijed;
- roles[] podržava nula, jednu ili više rola;
- roles[] sadrži isključivo role tog tačnog membershipa;
- neaktivni membershipi smiju biti vraćeni;
- platformRoles ostaje zaseban top-level blok;
- platformRoles se NIKADA ne pojavljuju unutar roles[];
- permissions[] se izvodi pri čitanju iz docs/15, ne čuva se kao stanje membershipa;
- permissions[] ima determinističan redoslijed;
- neaktivan membership smije biti izlistan, ali vraća nula efektivnih permisija;
- membershipi ni role drugog korisnika nikada nisu izloženi.

Grantovi dolaze TAČNO iz docs/15. Ne izvodi ih iz naziva role, iz API primjera ni iz
proznih nagovještaja.

Seed mora kreirati eksplicitne practice_membership_roles redove za svaki membership i
najmanje jedan aktivan membership sa nula dodijeljenih rola za negativne testove.
Seed se ne oslanja na singularnu role kolonu.

Ne implementiraj patient/encounter/RLS poslovne tabele iz naredne faze.
Dev auth mora biti nemoguće uključiti u production bez eksplicitne konfiguracije i startup zaštite.

Tabele practice_memberships i practice_membership_roles kreiraju se u ovoj fazi, ali njihove
bootstrap RLS politike pripadaju FAZI 4 i paketu 013_rls_policies (D-033, D-038).
Ne postavljaj RLS na njih u ovoj fazi.

D-OPEN-011 je OTVOREN — runtime access model za users i practices nije odlučen.
Zato u ovoj fazi:
- ne uvodi globalan neograničen read nad users ni practices;
- GET /api/v1/me vraća isključivo identitet pozivaoca, njegove memberships i njegove
  platformRoles, kao dva odvojena bloka prema docs/03 §10;
- platformRoles se nikada ne prikazuju kao memberships niti se sa njima spajaju.

Self-enumeracija vlastitih membership rola NIJE generički pristup nad users, NIJE generički
pristup nad practices, NIJE role administration, NIJE cross-practice administracija i NE
RJEŠAVA D-OPEN-011.

Ne rješavaj D-OPEN-011 u ovoj fazi. Ako scope zahtijeva širi pristup nad users ili
practices, zaustavi se i traži odluku.

Dodaj unit/integration/e2e testove za active/inactive user i membership.

Dokaži testovima:
- membership sa nula, jednom i više rola;
- duplirana dodjela iste role je odbijena;
- dodjela koja referencira membership druge ordinacije je odbijena na composite FK-u;
- uklanjanje role briše red, a ista rola se nakon toga može ponovo dodijeliti;
- GET /api/v1/me vraća roles[] i nikada role;
- roles[] ima determinističan redoslijed.

Role-to-permission implementacija je ODBLOKIRANA: D-039 do D-045 su prihvaćeni, a docs/15
je kreiran i ACCEPTED. Implementiraj prihvaćenu matricu.

I dalje ostaje BLOCKED, bez izuzetka:
- practice.read — BLOCKED — D-OPEN-011 za sve role;
- generički runtime pristup nad users;
- generički runtime pristup nad practices;
- generički cross-practice pristup nad users i practices;
- kreiranje, deaktivacija i administracija membershipa;
- dodjela i uklanjanje rola.
```

---

# Prompt — Faza 4

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 4 — Tenant isolation i RLS.

Ovo je kritični security gate.

Normativne odluke za tenant context bootstrap i kompoziciju permisija su D-033 i D-038 iz
docs/06_DECISION_LOG.md. Implementacija mora tačno pratiti docs/02_DATABASE_SCHEMA_V1.md
§16.2, §16.2a, §17.3, §17.4 i §20.2, docs/03_API_CONTRACT_V1.md §3, §3.7 i §28.5, te
docs/04 §6.4.1 i §6.4.2.

Kreiraj:
- app_security schema;
- app_security.set_user_context(p_user_id uuid);
- app_security.set_request_context(p_practice_id uuid) — SECURITY INVOKER;
- fixed search_path na obje funkcije;
- execute grants za copilot_app;
- ENABLE i FORCE RLS na practice_memberships;
- user-scoped bootstrap self-select politiku na practice_memberships;
- ENABLE i FORCE RLS na practice_membership_roles;
- bootstrap-readable self-enumeration SELECT politiku na practice_membership_roles;
- effective-permission resolver;
- PracticeContext guard;
- X-Practice-ID validaciju kroz membership provjeru;
- TenantDatabaseService sa Prisma interactive transactionom;
- RLS pattern;
- FORCE RLS;
- A/B tenant integration test harness.

Obavezni redoslijed autorizacije (D-033 i D-038; identičan docs/03 §3.7.1):
1. autentifikuj bearer token — potpis, issuer, audience i istek;
2. izvedi pouzdani app.user_id kroz set_user_context;
3. pročitaj i validiraj X-Practice-ID;
4. pozovi set_request_context(p_practice_id uuid);
5. validiraj AKTIVAN practice_memberships red kroz user-scoped bootstrap politiku;
6. uspostavi transakcijski lokalni tenant context app.practice_id;
7. učitaj dodijeljene tenant role za taj membership i tu ordinaciju;
8. izvedi efektivne tenant permisije;
9. provjeri permisiju koju endpoint zahtijeva i prihvaćene uslove;
10. izvrši komandu pod tenant RLS-om.

Kontekst se automatski čisti na kraju transakcije.

Pojašnjenja (D-038, klauzule 20–21):
- set_request_context NE PRIMA rolu;
- set_request_context NE PRIMA user_id;
- practice_membership_roles se NE KONSULTUJE za provjeru postojanja membershipa;
- aktivan membership sa nula rola SMIJE uspostaviti tenant context;
- takav membership pada na svakoj permission-gated ruti sa 403;
- nepostojeći ili neaktivan membership vraća 403;
- neuspjeh bootstrapa ne ostavlja upotrebljiv kontekst;
- pooled konekcija ne smije propustiti ni tenant ni role stanje.

Obavezna pravila:
- bootstrap poziv mora biti moguć PRIJE nego tenant context postoji;
- practice_memberships ima posebnu user-scoped bootstrap politiku vezanu za app.user_id;
- normalna tenant RLS se NE SMIJE koristiti za bootstrap konteksta koji joj je preduslov —
  to je ciklična zavisnost i faza mora ostati BLOCKED ako je implementirana tako;
- NEMA SECURITY DEFINER bypassa za tenant bootstrap;
- set_request_context NE PRIMA caller-supplied user_id; korisnik se izvodi isključivo iz
  app.user_id;
- aplikacija NE SMIJE vjerovati X-Practice-ID bez membership validacije;
- neuspjela rezolucija membershipa vraća 403 na aplikacijskom/API sloju i NE SMIJE ostaviti
  upotrebljiv tenant context u transakciji;
- platform/system context je odvojen i NE izvodi se unijom tenant membershipa i
  platformRoles;
- ne uvodi se globalan neograničen pristup nad users ni practices — to ostaje pod
  D-OPEN-011, koji je i dalje otvoren.

RLS za practice_membership_roles (paket 013_rls_policies; docs/02 §17.4):
- ENABLE ROW LEVEL SECURITY;
- FORCE ROW LEVEL SECURITY;
- SELECT politika za self-enumeraciju autentifikovanog korisnika;
- korisnik se izvodi iz pouzdanog app.user_id;
- politika se spaja kroz vlastite practice_memberships redove tog korisnika;
- politika NE SMIJE zavisiti od app.practice_id, jer GET /me enumeriše prije tenant konteksta;
- vlasniku smiju biti vidljive trenutne role neaktivnih membershipa;
- neaktivan membership i dalje NE AUTORIZUJE nijedan tenant pristup;
- role redovi drugog korisnika su odbijeni;
- cross-practice curenje je odbijeno;
- trenutni runtime put je SELECT-only — bez INSERT, UPDATE i DELETE;
- NEMA SECURITY DEFINER bypassa;
- politika ostaje SECURITY INVOKER kompatibilna;
- D-OPEN-011 ostaje neriješen — ova politika ga ne zatvara.

RLS za review_decision_change_links (paket 013_rls_policies; docs/02 §13.2a, §18.1, §22.13; D-046):
- ENABLE ROW LEVEL SECURITY;
- FORCE ROW LEVEL SECURITY;
- standardna tenant politika practice_id = app.practice_id;
- NEMA bootstrap izuzetka — tenant context mora već biti uspostavljen prije čitanja;
- copilot_app dobija ISKLJUČIVO SELECT i INSERT;
- copilot_app NEMA UPDATE grant;
- copilot_app NEMA DELETE grant;
- copilot_system NE DOBIJA nijedan automatski grant nad tom tenant tabelom;
- PUBLIC NE DOBIJA nijedan grant;
- owner ostaje copilot_migrator;
- cross-tenant čitanje je odbijeno;
- RLS se NE PREMJEŠTA u paket 009; schema objekti ostaju u 009_review_approvals (Faza 10).

Effective-permission resolver (D-038; docs/03 §28.5):
- unija ALLOW grantova svih tenant rola dodijeljenih odabranom AKTIVNOM membershipu;
- unija je ograničena na jednu ordinaciju i jedan membership;
- DENY znači da rola ne doprinosi grant;
- DENY NE PONIŠTAVA ALLOW iz druge dodijeljene tenant role;
- nema implicitnog nasljeđivanja rola;
- nema per-user permission overrida;
- neaktivan membership daje nula permisija;
- aktivan membership sa nula rola daje nula permisija;
- autorizacija je deny-by-default;
- uslovna permisija zahtijeva podobnu rolu I prihvaćeni practice flag ili runtime uslov;
- platformRoles NIKADA ne doprinose tenant permission uniji.

Dodatna pravila kompozicije:
- duplirani grantovi iz dvije role kolabiraju u jednu efektivnu permisiju;
- caller-supplied rola se nikada ne prihvata;
- deny-by-default kada nijedna dodijeljena rola ne daje traženu permisiju.

REPREZENTACIJA MATRICE (docs/15 je PRIHVAĆEN i normativan):
- implementacija predstavlja tačno 32 prihvaćena reda iz docs/15;
- svaka ćelija je tačno jedno od: ALLOW, DENY, CONDITIONAL, BLOCKED — D-OPEN-011;
- svaka aktivna permisija se pojavljuje tačno jednom;
- svaki red ima svih sedam aplikacijskih role ćelija;
- svaki Source se prati do prihvaćenog ADR-a;
- nijedna ćelija nije prazna, OPEN ni nepoznata;
- nijedna rezervisana permisija nije aktivan red;
- implementacijska matrica je jednaka docs/15 u OBA smjera;
- odstupanje obara testove ili build.

Katalog: tačno 32 aktivne i tačno 3 rezervisane permisije — analysis.run_tariff,
configuration.manage, integration.manage. Nijedna aktivna permisija se ne dodaje, uklanja,
preimenuje, dijeli ni spaja. Rezervisane permisije nisu aktivni redovi, nemaju produkcijski
grant, a nepoznata ili rezervisana permisija pada zatvoreno.

PRIHVAĆENE DODJELE SA NAJVEĆIM RIZIKOM — implementiraj i testiraj tačno ovako:
- integration.read -> PRACTICE_ADMIN only;
- tariff.manage -> isključivo SYSTEM_ADMIN (platform);
- tariff.raw_result.read -> PRACTICE_ADMIN only;
- audit.read -> PRACTICE_ADMIN + AUDITOR;
- audit.export -> PRACTICE_ADMIN + AUDITOR;
- encounter.close -> PRACTICE_ADMIN + PHYSICIAN + BILLING_SPECIALIST;
- analysis.review_decision -> PHYSICIAN + BILLING_SPECIALIST;
- analysis.export -> PHYSICIAN + BILLING_SPECIALIST;
- analysis.export.read -> PHYSICIAN + BILLING_SPECIALIST;
- finding.resolve -> PHYSICIAN only;
- encounter.cancel -> PHYSICIAN only;
- analysis.cancel -> PHYSICIAN + MPA;
- encounter.document.archive -> PHYSICIAN only.

NEGATIVNE TVRDNJE:
- PRACTICE_ADMIN sam po sebi nema nijednu opštu kliničku ovlast;
- AUDITOR ne pregleda encountere, analize ni sirovi tarifni rezultat;
- READ_ONLY ima nula ALLOW i nula CONDITIONAL;
- SYSTEM_ADMIN nema nijednu tenant permisiju kroz platform rolu;
- MPA nema analysis.review_decision;
- PRACTICE_ADMIN sam po sebi ne odobrava i ne opoziva odobrenje.

BASELINE WORKFLOW — grantovi se mehanički porede sa docs/15, ne izvode iz naziva role:
patient_reference.read; patient_reference.create; encounter.read; encounter.create;
encounter.update; encounter.document.list; encounter.document.read;
encounter.document.create; analysis.read; analysis.run.

USLOVNO ODOBRAVANJE I OPOZIV (D-041):
- analysis.approve — PHYSICIAN ALLOW; MPA CONDITIONAL uz allow_mpa_approval = true;
  BILLING_SPECIALIST CONDITIONAL uz allow_billing_specialist_approval = true; sve ostale DENY;
- analysis.approval.revoke — IDENTIČNE role ćelije kao analysis.approve;
- flag bez odgovarajuće role ne daje permisiju;
- rola bez uključenog flaga je odbijena;
- neaktivan membership je odbijen i kada je flag uključen;
- podobnost se evaluira u trenutku opoziva;
- opozivalac ne mora biti originalni odobravatelj;
- reason je obavezan;
- dokaz odobrenja se nikada ne briše;
- approval historija ostaje immutable;
- revocation audit event je obavezan.

Ne kreiraj: drugi approval flag; permisiju vezanu isključivo za originalnog odobravatelja;
zasebnu revocation rolu; novi endpoint.

PROFILI ROLA:
- AUDITOR — audit.read ALLOW; audit.export ALLOW; sve ostale aktivne permisije DENY;
  practice.read BLOCKED; bez discovery/listing endpointa;
- READ_ONLY — nula ALLOW; nula CONDITIONAL; practice.read BLOCKED; sve ostale DENY;
- PRACTICE_ADMIN — practice.settings.read; practice.settings.manage; encounter.close;
  tariff.raw_result.read; audit.read; audit.export; integration.read; bez kliničke ovlasti
  osim ako je zasebno dodijeljena druga prihvaćena tenant rola;
- SYSTEM_ADMIN — tariff.manage isključivo na platform obuhvatu; bez tenant permisije kroz
  platformRoles; bez practice.read; bez tariff.raw_result.read; tenant ruta zahtijeva aktivan
  tenant membership i prihvaćenu tenant rolu.

ENDPOINT AUTHORIZATION GUARDS:
- tražena permisija dolazi iz docs/03;
- podobnost role dolazi iz docs/15;
- guard koristi centralizovani effective-permission resolver;
- kod endpointa ne hard-koduje alternativnu listu rola;
- uslovi se evaluiraju nakon rezolucije membershipa i rola;
- RLS ostaje nezavisan drugi sloj, nikada zamjena.

Negativni testovi guardova: nedostajuća permisija; neaktivan membership; membership sa nula
rola; samo SYSTEM_ADMIN na tenant ruti; caller-supplied rola; rola iz druge ordinacije;
isključen uslovni flag; cross-user curenje rola; cross-practice curenje rola.

Klase rola se NE SMIJU miješati:
- tenant aplikacijske role: PRACTICE_ADMIN, PHYSICIAN, MPA, BILLING_SPECIALIST, AUDITOR,
  READ_ONLY;
- platform aplikacijska rola: SYSTEM_ADMIN;
- database role: copilot_app, copilot_migrator, copilot_system.

Obavezno:
- platformRoles se nikada ne spajaju unijom sa tenant rolama;
- SYSTEM_ADMIN ne dobija nijedan automatski tenant pristup;
- SYSTEM_ADMIN bez aktivnog membershipa dobija 403 na tenant rutama;
- copilot_system NIJE SYSTEM_ADMIN;
- database grant ne zamjenjuje permisiju endpointa;
- PUBLIC ne dobija nijedan grant.

Vlasništvo faze i migration paketa:
- membership bootstrap RLS politika — Faza 4, paket 013_rls_policies (docs/02 §22.13);
- practice_membership_roles RLS politika — Faza 4, paket 013_rls_policies (docs/02 §17.4);
- effective-permission resolver — Faza 4, aplikacijski sloj, bez migration paketa;
- set_request_context(p_practice_id uuid) — Faza 4, paket 013_rls_policies;
- set_user_context(p_user_id uuid) — Faza 4, paket 013_rls_policies;
- transakcijski lokalne context varijable — Faza 4, paket 013_rls_policies;
- negativni testovi za nevažeći ili neaktivan membership — Faza 4;
- test da kontekst ne ostaje nakon završetka transakcije — Faza 4.

Tabele practice_memberships i practice_membership_roles kreiraju se u Fazi 3 i paketu
002_identity_and_practices; njihove bootstrap RLS politike u Fazi 4 i paketu 013_rls_policies.
Ne premještaj kreiranje RLS-a u paket 002.
Brojevi migration paketa u docs/02 §22 su redoslijed zavisnosti, NE brojevi faza. Paket
013_rls_policies se primjenjuje inkrementalno kako tenant tabele nastaju. Ne mijenjaj
numeraciju migration paketa i ne uvodi novi broj paketa.

Obavezni D-038 fixture:
- membership sa nula rola;
- membership sa jednom rolom;
- membership sa više rola;
- korisnik sa PRACTICE_ADMIN i PHYSICIAN u istoj ordinaciji;
- isti korisnik sa drugačijim skupom rola u drugoj ordinaciji;
- neaktivan membership koji zadržava svoje role redove;
- pokušaj duplirane dodjele iste role;
- pokušaj cross-practice dodjele koji krši composite FK;
- SYSTEM_ADMIN bez tenant membershipa;
- SYSTEM_ADMIN sa zasebnim tenant membershipom;
- korisnik bez ijednog membershipa;
- PRACTICE_ADMIN bez PHYSICIAN;
- AUDITOR;
- READ_ONLY;
- uslovni approval flagovi u oba stanja — uključeni i isključeni.

Fixture moraju biti deterministički i nezavisni od redoslijeda izvršavanja.

Dokaži testovima:
- practice A ne čita/piše B;
- bez contexta default deny;
- inactive membership ne postavlja context;
- context ne curi između pooled requesta;
- runtime role ne zaobilazi RLS;
- validan aktivan membership uspostavlja kontekst;
- membership koji ne postoji je odbijen;
- neaktivan membership je odbijen;
- pozivalac ne može impersonirati drugog korisnika kroz parametar funkcije;
- pozivalac ne može odabrati practice samo slanjem X-Practice-ID;
- tenant-scoped upit prije uspješnog bootstrapa pada;
- kontekst je transakcijski lokalan i ne curi u sljedeći request;
- SECURITY INVOKER izvršavanje ne zaobilazi membership RLS;
- platformRoles se ne pretvaraju automatski u tenant membershipe.

D-038 testovi:
- schema constrainti practice_membership_roles;
- uklanjanje role briše red, pa se ista rola može ponovo dodijeliti;
- neaktivan membership daje nula permisija iako role redovi postoje;
- aktivan membership sa nula rola je deny-by-default;
- roles[] ima determinističan redoslijed;
- polje memberships[].role ne postoji;
- self-enumeracija radi, a pristup rolama drugog korisnika je odbijen;
- cross-practice pristup rolama je odbijen;
- unija tenant rola daje očekivani skup permisija;
- DENY u jednoj roli ne poništava ALLOW iz druge;
- platform i tenant klase rola ostaju odvojene;
- injekcija role kroz body, query, header i argument database funkcije je odbijena;
- kontekst i role ne cure kroz pooled konekciju;
- rollback bootstrapa čisti i kontekst i učitane role;
- uslovno odobravanje zahtijeva i podobnu rolu i odgovarajući practice flag.

Conformance test: implementacijska matrica se mehanički poredi sa docs/15 i odstupanje
obara test. Testovi tvrde isključivo prihvaćene ćelije iz docs/15 i ništa izvan njih.

Faza se NE SMIJE označiti završenom dok sve ovo ne vrijedi:
- singularna kolona practice_memberships.role ne postoji;
- practice_membership_roles postoji sa svim prihvaćenim constraintima;
- vlasništvo paketa odgovara docs/02 i docs/04;
- životni ciklus dodjele odgovara D-038;
- self-enumeration RLS testovi prolaze;
- GET /me vraća roles[];
- injekcija role nije moguća;
- neaktivan i zero-role membership ne daju nijednu permisiju;
- cross-user i cross-practice curenje rola je odbijeno;
- platformRoles ne ulaze u tenant permission uniju;
- svi D-038 schema, API i security testovi prolaze;
- implementacijska matrica ne odstupa od docs/15;
- broj aktivnih permisija je 32, a rezervisanih 3;
- nijedna rezervisana permisija nema grant;
- nijedan Source u matrici ne nedostaje i svaki je prihvaćen;
- nijedna role ćelija nije prazna ni nepoznata;
- DENY ne poništava ALLOW;
- platformRoles ne ulaze u tenant kompoziciju;
- READ_ONLY ne dobija nijedan grant;
- AUDITOR ne dobija nijednu permisiju izvan audit.read i audit.export;
- PRACTICE_ADMIN ne dobija klinički pristup automatski;
- podobnost za analysis.approve i analysis.approval.revoke je identična;
- encounter.close ima sve tri prihvaćene role;
- GET /me vraća roles[], nikada role;
- rad zavisan od D-OPEN-011 nije implementiran;
- endpoint guardovi ne odstupaju od docs/03 ni od docs/15.

GRANICE — ne implementiraj ništa sa ovih lista.

OUT OF V1:
- kreiranje membershipa;
- deaktivacija membershipa;
- administracija membershipa;
- dodjela role;
- uklanjanje role;
- generička runtime administracija rola;
- cross-practice support pristup;
- otkazivanje export joba.

REQUIRES NEW PERMISSION AND ADR:
- generička platform administracija izvan tariff.manage;
- AUDITOR discovery/listing endpoint;
- podjela analysis.review_decision;
- podjela analysis.export.read;
- finija permisija za rješavanje findinga.

practice.read ostaje BLOCKED — D-OPEN-011 za svaku aplikacijsku rolu. Ne pretvaraj BLOCKED u
obični DENY ni u ALLOW.

Self-enumeracija vlastitih membership rola NIJE generički pristup nad users, NIJE generički
pristup nad practices, NIJE role administration, NIJE cross-practice administracija i NE
RJEŠAVA D-OPEN-011.

Ako bilo koji RLS test ne prolazi, faza mora ostati BLOCKED i ne smiješ nastaviti.
```

---

# Prompt — Faza 5

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 5 — Patient reference, encounter i dokumenti.

Schema:
- patient_references;
- encounters;
- encounter_diagnoses;
- storage_objects;
- encounter_documents;
- composite foreign keys;
- RLS;
- indeksi/checkovi.

API:
- patient reference create/read;
- encounter create/list/detail/update/cancel;
- manual text document create/list/read/archive.

Cross-cutting:
- Idempotency-Key;
- ETag/If-Match;
- encounter state machine;
- HMAC external ID;
- pseudonym;
- encryption service interface;
- local AES-GCM implementation prema odobrenoj odluci ili jasno označenom development adapteru;
- audit;
- outbox base.

Dokaži:
- no plaintext external ID response/log;
- no medical text log;
- original document access audit;
- cross-tenant FK fail;
- stale ETag;
- idempotency replay/conflict.
```

---

# Prompt — Faza 6

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 6 — Tarifne verzije.

Kreiraj:
- system_storage_objects;
- tariff_releases;
- tariff_release_artifacts;
- tariff_catalog_entries;
- tariff_release_activation_history;
- one-active partial unique index;
- mock release seed;
- admin list/create/validate/activate/deactivate API;
- package SHA-256;
- audit.

Ne implementiraj stvarni OAAT paket.
Obični physician ne smije upravljati releaseom.
Testiraj pokušaj aktivacije dvije verzije.
```

---

# Prompt — Faza 7

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 7 — Analysis modeli, jobs i transactional outbox.

Kreiraj:
- ai_prompt_versions;
- analysis_runs;
- analysis_input_snapshots;
- async_jobs;
- kompletni outbox_events;
- analysis state machine;
- POST encounter analysis;
- GET analysis/job;
- BullMQ;
- outbox publisher sa FOR UPDATE SKIP LOCKED;
- mock processor skeleton;
- progress/failure.

HTTP request mora samo kreirati DB command i vratiti 202.
Redis outage ne smije izgubiti analysis command.
Job payload ne smije sadržavati medicinski tekst.
Snapshot mora biti immutable.
```

---

# Prompt — Faza 8

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 8 — Mock AI i Mock Tarif Engine.

Kreiraj schema i kod za:
- ai_extraction_runs;
- extracted_facts;
- service_candidates;
- candidate_evidence;
- tariff_evaluations;
- tariff_evaluation_items;
- tariff_messages;
- AiExtractionProvider;
- deterministic MockAiExtractionProvider;
- output schema validator;
- TariffEngineClient;
- deterministic MockTariffEngineClient;
- pipeline checkpoints;
- workspace endpoint.

Ne pozivaj stvarni AI niti OAAT.
Testiraj invalid AI schema i job retry bez duplikata.
Raw request/response hash mora postojati.
```

---

# Prompt — Faza 9

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 9 — Safety rules.

Kreiraj:
- safety_rules;
- safety_rule_versions;
- rule_findings;
- finding_evidence;
- SafetyRule interface;
- registry;
- determinističko izvršavanje;
- approval readiness;
- findings API.

Minimalna pravila:
- missing consultation duration;
- missing performer role;
- duplicate service;
- inactive/outdated tariff release;
- missing evidence;
- mock flat-rate conflict.

Rule version, blocking i accepted-risk policy moraju biti eksplicitni.
Spriječi duple findings na retryu.
```

---

# Prompt — Faza 10

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 10 — Review i approval.

Normativna odluka za immutable correction evente i pokrivenost review odluka je D-046 iz
docs/06_DECISION_LOG.md. Implementacija mora tačno pratiti docs/02_DATABASE_SCHEMA_V1.md
§13.1, §13.2, §13.2a, §13.2a.1, §18.1, §22.9, §22.13, §25.2.2 i §28.1, te docs/04 §12.3.1.
Ne izvodi nijedan schema objekat iz starije dokumentacije ni iz proznih primjera.

Kreiraj:
- review_decisions;
- review_item_changes;
- review_decision_change_links;
- analysis_approvals;
- fact/candidate corrections;
- zajednički analysis_runs revision lock (correction i decision put);
- finding resolution;
- approval policy;
- row lock;
- canonical approved_payload_json;
- SHA-256;
- immutability grants/triggers;
- revocation.

Schema D-046 (paket 009_review_approvals; nijedan novi broj paketa):
- review_item_changes dobija analysis_run_id uuid NOT NULL;
- composite FK review_item_changes (practice_id, analysis_run_id) → analysis_runs (practice_id, id);
- review_item_changes unique (practice_id, analysis_run_id, id);
- review_decisions unique (practice_id, analysis_run_id, id);
- composite FK review_decisions (practice_id, analysis_run_id) → analysis_runs (practice_id, id);
- review_decision_change_links sa kolonama id, practice_id, analysis_run_id, review_decision_id,
  review_item_change_id, created_at — sve NOT NULL;
- primary key (id); unique (practice_id, id);
- unique (practice_id, review_decision_id, review_item_change_id);
- composite FK (practice_id, analysis_run_id, review_decision_id)
  → review_decisions (practice_id, analysis_run_id, id);
- composite FK (practice_id, analysis_run_id, review_item_change_id)
  → review_item_changes (practice_id, analysis_run_id, id);
- SVI D-046 FK-ovi koriste ON DELETE NO ACTION i ON UPDATE NO ACTION;
- grantovi za review_decision_change_links: SELECT i INSERT za copilot_app, bez UPDATE i bez DELETE;
- RLS nad review_decision_change_links pripada paketu 013_rls_policies (Faza 4), ne ovom paketu.

Transakcija i granica pokrivenosti (D-046, klauzule 34–52):
- correction transakcija PRVO zauzima analysis_runs ... FOR UPDATE za (practice_id, analysis_run_id);
- decision transakcija PRVO zauzima ISTI lock;
- granica pokrivenosti nastaje kada decision transakcija zauzme taj lock;
- POST /analyses/{id}/decisions je JEDNA atomarna transakcija ovim redoslijedom:
  autorizacija i tenant context → analysis_runs FOR UPDATE → validacija →
  izbor svih review_item_changes sa istim practice_id i analysis_run_id →
  INSERT review_decisions → INSERT jednog review_decision_change_links reda po promjeni →
  audit → COMMIT;
- neuspjeh rollback-uje odluku, sve linkove i audit upise;
- odluka sa nula povezanih korekcija je VALIDNO stanje;
- korekcija smije biti perzistirana prije i bez ijedne odluke;
- D-029 optimistic locking ostaje i zajednički lock ga DOPUNJUJE, ne zamjenjuje.

ZABRANJENO — ne implementiraj ništa sa ove liste:
- kolona review_item_changes.review_decision_id u bilo kojem obliku, nullable ni obavezna;
- composite FK review_item_changes → review_decisions;
- povezivanje korekcije sa odlukom kroz naknadni UPDATE;
- UPDATE ili DELETE grant nad review_item_changes i review_decision_change_links;
- unique (practice_id, review_item_change_id) na link tabeli;
- filtriranje već povezanih korekcija pri izboru;
- polje sa correction ID-evima u request payloadu;
- bilo koje novo polje u response payloadu;
- novi endpoint, permisija, aplikacijska ili database rola, state tranzicija, feature flag,
  API error kod ili migration paket;
- spekulativni samostalni indeksi — prihvaćeni unique constrainti su dovoljni (docs/02 §21).

Testiraj:
- open blocker;
- stale revision;
- concurrent double approval;
- edit after approval;
- revoke history;
- approval payload immutability;
- validan same-practice i same-analysis-run link;
- odbijen cross-practice link;
- odbijen same-practice ali cross-analysis-run link — NA DATABASE CONSTRAINTU, ne u aplikaciji;
- odbijenu nepostojeću odluku i nepostojeću korekciju;
- odbijen duplirani par odluka/promjena;
- jednu odluku sa više korekcija;
- jednu korekciju povezanu sa više odluka;
- odluku sa nula korekcija;
- korekciju commitovanu prije granice — uključenu;
- konkurentnu correction transakciju koja ČEKA na zajedničkom locku;
- korekciju nakon granice — isključenu, uz kasniju odluku koja je smije uključiti;
- retry koji NE DUPLIRA linkove iste odluke;
- potpun rollback bez parcijalne odluke, linkova ni audit dokaza;
- odbijen UPDATE i odbijen DELETE nad review_decision_change_links;
- brisanje bilo kojeg roditelja blokirano NO ACTION-om;
- odbijeno cross-tenant RLS čitanje.

Tačna verifikacija na kraju faze:
- inventar tenant tabela je tačno 30;
- inventar deklarisanih composite FK-ova je tačno 14;
- broj aktivnih permisija je 32, a rezervisanih 3;
- schema objekti su u 009_review_approvals, RLS objekti u 013_rls_policies;
- nijedan migration paket nije dodan ni renumerisan;
- javni API ugovor je nepromijenjen.

Export još ne implementiraj.
```

---

# Prompt — Faza 11

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 11 — Manual export i audit package.

Kreiraj:
- integration_connections;
- external_resource_links;
- export_jobs;
- PracticeSystemAdapter;
- ManualAdapter;
- async export worker;
- JSON billing draft artifact;
- audit events timeline;
- audit package JSON;
- retry.

Export koristi isključivo aktivni approval i isti approved payload hash.
Ne pozivaj Axenita.
PDF je dozvoljen samo ako je odluka o generatoru zaključana; inače ostavi dokumentovan job stub.
```

---

# Prompt — Faza 12

```text
[Dodaj univerzalni header]

Implementiraj isključivo FAZU 12 — Hardening i MVP readiness.

Scope:
- OpenAPI 3.1 file generation;
- contract validation/client smoke;
- kompletan Problem Details;
- rate limiting;
- readiness checks;
- structured logging;
- log redaction;
- no-PHI log tests;
- CI;
- migration deploy test;
- RLS suite;
- full e2e;
- backup/restore scripts i dry run;
- dependency/security scan;
- documentation sync;
- final milestone report.

Ne priključuj stvarni AI, OAAT ili Axenita.
Na kraju popuni finalne acceptance kriterije, ali ne označavaj external integration gates završenim.
```

---

# Prompt za review završene faze

```text
Ne implementiraj novi kod.

Pregledaj upravo završenu fazu kao strogi reviewer prema:
- AGENTS.md
- docs/00_PROJECT_RULES.md
- relevantnom phase scopeu
- docs/08_TEST_STRATEGY_V1.md
- docs/09_SECURITY_PRIVACY_BASELINE_V1.md

Pregledaj git diff, migracije, grants, RLS, DTO, API, testove i dokumentaciju.

Pronađi:
1. security propuste;
2. cross-tenant rizike;
3. nedostajuće constraints;
4. pogrešan transaction boundary;
5. idempotency/retry probleme;
6. PHI/secrets u logovima;
7. odstupanja od API contracta;
8. testove koji daju lažnu sigurnost;
9. scope creep;
10. breaking promjene.

Prikaži nalaze po severity:
- BLOCKER
- HIGH
- MEDIUM
- LOW

Za svaki nalaz navedi fajl, liniju ili objekt, uzrok i tačnu preporuku.
Ne mijenjaj kod dok ne završimo pregled.
```

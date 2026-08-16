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
Ne koristi prisma migrate dev --create-only kao mehanizam autorstva migracije; kanonski tok je
prisma migrate diff -> ručna dopuna -> ljudski pregled -> validacija na praznoj bazi ->
prisma migrate deploy (D-050; docs/02 §26.3, docs/10 §7).
Ne oslabljuj nijedan guard migracije 001.
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

Normativne odluke: D-033, D-038, D-047, D-048, D-049, D-050 i D-051. Prati docs/02 §6.3, §6.3a,
§17.0, §17.2, §17.4, §20.2b, §22.2, §23.2, §23.4 i §26.3; docs/03 §5.1 i §10;
docs/04 §5.2, §5.2.1 i §5.4.1; docs/05 Faza 3.

Vlasnik migration paketa za sve schema i RLS objekte ove faze je 002_identity_and_practices.
Ne uvodi novi broj paketa.

Kreiraj:
- practices;
- users;
- practice_memberships;
- practice_membership_roles;
- practice_settings — SAMO schema i trokolonski SELECT grant, bez ijedne rute;
- platform_role_assignments;
- migration/grants;
- idempotentan development seed;
- effective-permission resolver interface;
- kontrolisani dev auth;
- GET /api/v1/me;
- GET /api/v1/practices/{practiceId} prema contractu.

NE kreiraj settings rute u ovoj fazi — ni GET ni PATCH, ni kao stub (D-049).

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

Tabela practice_memberships kreira se u ovoj fazi, ali njena bootstrap RLS politika (docs/02
§17.3) pripada FAZI 4 i paketu 013_rls_policies (D-033). Ne postavljaj RLS na nju u ovoj fazi.

AŽURIRANO ODLUKOM D-051 (2026-08-14): practice_membership_roles i platform_role_assignments
DOBIJAJU svoju RLS UPRAVO U OVOJ FAZI, u paketu 002_identity_and_practices. Ranija uputa da one
pripadaju FAZI 4 više NE VAŽI.

Implementiraj u paketu 002_identity_and_practices (docs/02 §17.2, §17.4, §22.2):
- platform_role_assignments: ENABLE + FORCE ROW LEVEL SECURITY;
    platform_role_assignments_self_select   -> user_id = app.user_id, to copilot_app
    platform_role_assignments_system_select -> using (true), to copilot_system
- practice_membership_roles: ENABLE + FORCE ROW LEVEL SECURITY;
    practice_membership_roles_self_select   -> EXISTS nad practice_memberships uz
                                               pm.user_id = app.user_id, to copilot_app

IMENA POLITIKA I TIJELA POLITIKA SE NE MIJENJAJU. Premješteno je isključivo vlasništvo paketa.

Obavezno:
- self politika nad platform_role_assignments zavisi ISKLJUČIVO od app.user_id;
- NE koristi app.practice_id, set_request_context, PracticeContextGuard ni TenantDatabaseService;
- politika §17.4 radi BEZ §17.3 RLS-a, ali ZAHTIJEVA postojeći SELECT grant nad
  practice_memberships — sužavanje tog granta obara politiku sa 42501;
- copilot_system zadržava SELECT + USING (true) nad platform_role_assignments;
- copilot_system NEMA nijedan pristup practice_membership_roles;
- PUBLIC nema pristup nijednoj od te dvije tabele;
- copilot_app NEMA neograničen SELECT nad platform_role_assignments — invarijanta D-023,
  klauzule 11, važi OD OVE FAZE;
- bez postavljenog app.user_id obje tabele vraćaju nula redova;
- NEMA SECURITY DEFINER bypassa;
- platformRoles[] u GET /me sadrži ISKLJUČIVO dodjele sa revoked_at IS NULL;
- NE kreiraj revoke endpoint, revoke permisiju ni ijedan write grant.

NE premještaj docs/02 §17.3 u ovu fazu.

D-OPEN-011 je RIJEŠEN odlukom D-047 (2026-08-12). Runtime access model za users i practices
je odlučen i OBAVEZAN je dio ove faze. Normativno: docs/02 §16.2.1, §16.2.4, §17.5, §17.6,
§20.2a, §22.2; docs/06 D-047.

Implementiraj u paketu 002_identity_and_practices:
- app_security schema ako ne postoji;
- app_security.set_auth_subject_context(p_auth_subject text) — SECURITY INVOKER, fiksiran
  search_path, 42501 na null/prazan ulaz, briše app.user_id i app.practice_id, postavlja
  app.auth_subject transakcijski lokalno, EXECUTE samo copilot_app, PUBLIC revoked;
- app_security.set_user_context(p_user_id uuid) — PREMJEŠTEN iz paketa 013 u paket 002.
  Potpis, SECURITY INVOKER mod i tijelo ostaju TAČNO kako ih propisuje D-033; mijenja se
  isključivo pripadnost paketu;
- users: ENABLE + FORCE RLS, dvije PERMISSIVE SELECT politike:
    bootstrap: app.user_id IS NULL AND auth_subject = app.auth_subject
    self:      id = app.user_id
  Uslov app.user_id IS NULL je OBAVEZAN — bez njega su dokazano vidljiva dva korisnička reda;
- practices: ENABLE + FORCE RLS, DVIJE politike RAZLIČITOG MODA:
    PERMISSIVE  practices_membership_select — EXISTS nad practice_memberships po app.user_id,
                BEZ filtera na pm.active (GET /me mora prikazati practiceName i za neaktivan
                membership);
    RESTRICTIVE practices_context_narrow — app.practice_id IS NULL OR id = app.practice_id.
  RESTRICTIVE mod je OBAVEZAN. Ne koristi jednu kombinovanu permissive politiku;
- column-level grantovi za copilot_app:
    users     (id, email, display_name, preferred_language, status)
    practices (id, code, name, default_language, timezone, status)
  NE grantuj: users.auth_subject, users.last_login_at, practices.legal_name,
  practices.zsr_number, practices.gln_number, ni created_at/updated_at;
- NEMA INSERT, UPDATE ni DELETE nad users i practices ni za jednu runtime rolu;
- copilot_system ne dobija nijedan grant; PUBLIC ne dobija nijedan grant.

Bootstrap upit nad users NE navodi auth_subject u WHERE klauzuli — politika sama filtrira.
Aplikacijski SELECT ili WHERE nad auth_subject pada sa 42501; to je dokazano ponašanje.

Redoslijed u jednoj interaktivnoj transakciji:
verifikuj token -> set_auth_subject_context -> pročitaj users(id, status) -> ako nema reda
403 ACCESS_DENIED uz rollback, ako status != ACTIVE 403 ACCESS_DENIED uz rollback -> obje
odbijenice nastupaju PRIJE set_user_context -> set_user_context -> pročitaj
status tražene ordinacije membership-scoped politikom -> nula redova ili status != ACTIVE
daje 403 ACCESS_DENIED uz rollback.

401 INVALID_TOKEN je rezervisan ISKLJUČIVO za neuspjelu kriptografsku verifikaciju tokena.
Validan token čiji verifikovani subjekt nema users red NIJE INVALID_TOKEN nego neuspjeh
admisije -> 403 ACCESS_DENIED. Odgovor NE razlikuje nepoznat subjekt od ne-ACTIVE korisnika
i ne otkriva membership ni tenant informaciju.

NE uvodi SECURITY DEFINER ni za jednu funkciju.
NE mijenjaj tijelo set_request_context; ono ostaje u FAZI 4.
NE premještaj §17.3 ni opštu tenant RLS u ovu fazu.

I dalje NE UVODI globalan neograničen read nad users ni practices — zabrana nije ukinuta,
nego je sada sprovedena kroz FORCE RLS i column-level grantove.

GET /api/v1/me vraća isključivo identitet pozivaoca, njegove memberships i njegove
platformRoles, kao dva odvojena bloka prema docs/03 §10. practiceName se čita kroz
membership-scoped politiku iz docs/02 §17.6. platformRoles se nikada ne prikazuju kao
memberships niti se sa njima spajaju.

Self-enumeracija vlastitih membership rola NIJE generički pristup nad users, NIJE generički
pristup nad practices, NIJE role administration i NIJE cross-practice administracija. Ta
tvrdnja ostaje tačna i nakon D-047 — access model je riješen zasebnim politikama, ne
proširenjem te enumeracije.

Pristup redu DRUGOG korisnika (responsiblePhysician.displayName, approvedBy.displayName) je
DENY / NOT IMPLEMENTED u v1. NE kreiraj treću users politiku. Obavezan gate je
BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS (docs/13 §19).

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

RIJEŠENO odlukom D-047 — više NIJE blocked:
- practice.read — PRACTICE_ADMIN ALLOW, ostalih šest rola DENY (docs/15 §5);
- runtime pristup nad users — column-level SELECT uz FORCE RLS (docs/02 §17.5, §20.2a);
- runtime pristup nad practices — column-level SELECT uz FORCE RLS i RESTRICTIVE narrowing
  (docs/02 §17.6, §20.2a).

GET /api/v1/practices/{practiceId} vraća isključivo:
id, code, name, defaultLanguage, timezone, status.
NE vraća zsrNumber, glnNumber ni legalName. Ne postoji lista ni direktorij ordinacija.
SYSTEM_ADMIN dobija ovu permisiju samo ako isti korisnik nezavisno ima aktivan tenant
membership i dodijeljenu PRACTICE_ADMIN tenant rolu.

D-049 — practice_settings u ovoj fazi (docs/02 §6.4 i §20.2b; docs/03 §5.1 i §10):

Kreiraj KOMPLETNU prihvaćenu practice_settings schemu — version, check (version >= 1),
updated_by, sva konfiguraciona polja i OBA approval flaga.

copilot_app dobija TAČNO:
  grant select (practice_id, allow_mpa_approval, allow_billing_specialist_approval)
    on practice_settings to copilot_app;

NEMA table-level SELECT. NE grantuj: id, version, updated_at, updated_by, configuration,
retention_policy_code, billing_review_required, require_reason_for_manual_change, ai_enabled,
axenita_export_enabled.

NEMA INSERT, UPDATE ni DELETE granta. copilot_system i PUBLIC ne dobijaju nijedan grant.
NE kreiraj nijednu RLS politiku nad practice_settings u ovoj fazi — one pripadaju paketu 013.

NE registruj GET /api/v1/practices/{practiceId}/settings.
NE registruj PATCH /api/v1/practices/{practiceId}/settings.
Raniji fazni dio D-028 klauzule 4 je POVUČEN; kompletan settings runtime put je FAZA 4.

Ta tri stupca su tačno ono što GET /me treba za uslovne permisije analysis.approve i
analysis.approval.revoke (D-041, D-044). Semantika permisija se NE MIJENJA: practice.settings.read
i practice.settings.manage ostaju PRACTICE_ADMIN only, docs/15 je nepromijenjen.

Izloženost PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE je prihvaćena samo za
ovo nepilotsko međustanje: bez RLS-a faze 4, držalac dijeljenog copilot_app credentiala može
enumerisati te tri kolone za svaki red. Dokumentuj je i testiraj eksplicitno; NE umanjuj je.

D-048 — maintenance protokol pri seedu (docs/02 §23.4):

Seed ove faze upisuje u tabele koje već nose FORCE ROW LEVEL SECURITY. Allowlist faze 3 je TAČNO:
users, practices, practice_membership_roles, platform_role_assignments.
practice_memberships i practice_settings NISU na allowlisti.

Svaki takav upis ide isključivo kroz jednu EKSPLICITNU transakciju:
  BEGIN
    -> provjeri da je tabela na allowlisti
    -> ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY
    -> assert relrowsecurity = true, relforcerowsecurity = false
    -> isključivo pouzdani seed/migration DML
    -> ALTER TABLE <table> FORCE ROW LEVEL SECURITY
    -> assert relrowsecurity = true, relforcerowsecurity = true
  COMMIT

ZABRANJENO:
- autocommit;
- ALTER TABLE ... DISABLE ROW LEVEL SECURITY;
- BYPASSRLS;
- SECURITY DEFINER;
- superuser seed credential;
- trajna copilot_migrator RLS politika;
- nepovezani sigurnosni DDL unutar prozora;
- bilo kakva dohvatljivost ovog mehanizma iz request/runtime aplikacijskih putanja.

Neuspjela restore asercija MORA podići izuzetak i prekinuti transakciju. Prekinut ili neuspio seed
NE SMIJE ostaviti FORCE isključenim. Dodaj trajne regresijske testove steady-state stanja
relrowsecurity = true i relforcerowsecurity = true, nakon migracije i nakon seeda.

D-050 — autorstvo migracije (docs/02 §26.3; docs/10 §7):

NE koristi prisma migrate dev --create-only. Njegova shadow baza je strukturno nespojiva sa
namjernim guardovima migracije 001. NE oslabljuj nijedan guard migracije 001.

Kanonski tok:
1. ispravno bootstrapovana tekuća kanonska migration baza je izvorno stanje;
2. npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
     -o prisma/migrations/<timestamp>_002_identity_and_practices/migration.sql
3. ručno dopuni custom SQL: constrainti, grants, revokes, RLS, politike, funkcije, asercije,
   komentari;
4. ljudski pregled kompletnog generisanog I ručno napisanog SQL-a;
5. validacija kompletnog lanca na jednokratnoj, ispravno bootstrapovanoj praznoj bazi;
6. primjena kroz prisma migrate deploy;
7. mehanička verifikacija scheme, vlasništva, privilegija i sigurnosnih objekata.

migrate diff izlaz je KANDIDAT, ne istina. prisma db push ostaje zabranjen. Primijenjene migracije
ostaju immutable. --from-empty nije izvor inkrementalnog autorstva. --from-migrations je
neprikladan jer zahtijeva shadow bazu.

I dalje ostaje zabranjeno, bez izuzetka:
- generički cross-practice pristup nad users i practices;
- pristup redu drugog korisnika (co-member displayName) — gate iz docs/13 §19;
- kreiranje, deaktivacija i administracija membershipa;
- dodjela i uklanjanje rola;
- registrovanje bilo koje settings rute u ovoj fazi;
- bilo kakav write grant nad practice_settings u ovoj fazi.
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
- app_security schema — create schema if not exists; već postoji iz FAZE 3, paket 002;
- app_security.set_request_context(p_practice_id uuid) — SECURITY INVOKER;
- fixed search_path na set_request_context;
- execute grants za copilot_app;
- ENABLE i FORCE RLS na practice_memberships;
- user-scoped bootstrap self-select politiku na practice_memberships;
- ENABLE i FORCE RLS na practice_settings;
- standardnu tenant politiku practice_id = app.practice_id na practice_settings;
- devetokolonski SELECT i devetokolonski UPDATE grant na practice_settings (D-053; docs/02
  §20.2b.1) — grant i politika se uvode ZAJEDNO, u istom paketu;
- GET /api/v1/practices/{practiceId}/settings;
- PATCH /api/v1/practices/{practiceId}/settings, sa ETag, If-Match,
  428 PRECONDITION_REQUIRED, 409 VERSION_CONFLICT i atomičnim inkrementom version;
- effective-permission resolver;
- PracticeContext guard;
- X-Practice-ID validaciju kroz membership provjeru;
- TenantDatabaseService sa Prisma interactive transactionom;
- RLS pattern;
- FORCE RLS;
- A/B tenant integration test harness.

NE kreiraj app_security.set_user_context(p_user_id uuid) u ovoj fazi. Ta funkcija je PREMJEŠTENA
iz paketa 013 u paket 002 i već je kreirana u FAZI 3 (D-047, klauzula 17; docs/02 §16.2.2 i
§22.2). Faza 4 je smije verifikovati i koristiti, ali je NE SMIJE ponovo kreirati, zamijeniti,
premjestiti ni redefinisati. Potpis, SECURITY INVOKER mod i tijelo ostaju TAČNO kako ih propisuje
D-033. Isto važi za app_security.set_auth_subject_context(p_auth_subject text) i za politike nad
users i practices iz docs/02 §17.5 i §17.6 — sve je kreirano u FAZI 3 i u ovoj fazi se ne dira.

Obavezni redoslijed autorizacije — JEDANAEST KORAKA (D-033, D-038 i D-047 klauzula 10;
identičan docs/03 §3.7.1; restituirano odlukom D-053, dio C):
1. autentifikuj bearer token — potpis, issuer, audience i istek;
2. izvedi pouzdani app.user_id kroz set_auth_subject_context, čitanje users, provjeru
   users.status, pa set_user_context;
3. pročitaj i validiraj X-Practice-ID;
4. MEMBERSHIP-SCOPED PROČITAJ status TRAŽENE ORDINACIJE, PRIJE PROMJENE KONTEKSTA —
   nula vidljivih redova => 403 ACCESS_DENIED;
   status <> 'ACTIVE' => 403 ACCESS_DENIED uz rollback;
   app.practice_id se NE uspostavlja dok ovaj korak ne uspije;
5. pozovi set_request_context(p_practice_id uuid);
6. validiraj AKTIVAN practice_memberships red kroz user-scoped bootstrap politiku;
7. uspostavi transakcijski lokalni tenant context app.practice_id;
8. učitaj dodijeljene tenant role za taj membership i tu ordinaciju;
9. izvedi efektivne tenant permisije;
10. provjeri permisiju koju endpoint zahtijeva i prihvaćene uslove;
11. izvrši komandu pod tenant RLS-om.

KORAK 4 JE OBAVEZAN I NE SMIJE SE PRESKOČITI. Raniji desetokoračni restatement u ovom
prompt fajlu je bio ZASTARIO i ispuštao ga je. Nijedna sigurnosna semantika se ne mijenja —
korak je obavezan od D-047. Provjera je APLIKACIJSKA: tijelo set_request_context se NE MIJENJA
(docs/02 §16.2.3) i NE dobija provjeru practices.status. Korak 4 dokazuje POSTOJANJE membershipa,
korak 6 dokazuje AKTIVAN membership; nijedan ne zamjenjuje drugi. Nijedan drugi korak se ne
uklanja.

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
- ne uvodi se globalan neograničen pristup nad users ni practices; taj model je odlučen u
  D-047 i njegove politike su već kreirane u FAZI 3 (paket 002). U ovoj fazi ih NE prepisuj
  i NE oslabljuj — one se automatski pooštravaju čim app.practice_id počne postojati.

RLS za practice_membership_roles i platform_role_assignments — NIJE U OVOJ FAZI:

AŽURIRANO ODLUKOM D-051 (2026-08-14). docs/02 §17.2 i §17.4 su PREMJEŠTENI u paket
002_identity_and_practices i FAZU 3. Ovaj paket ih NE SMIJE kreirati, rekreirati, zamijeniti ni
prepisati. Faza 4 ih smije verifikovati i koristiti.

Provjeri, ne kreiraj:
- obje tabele već nose ENABLE + FORCE ROW LEVEL SECURITY iz paketa 002;
- politike platform_role_assignments_self_select, platform_role_assignments_system_select i
  practice_membership_roles_self_select postoje, nepromijenjenih imena i tijela;
- paket 013_rls_policies ne sadrži nijedan CREATE POLICY, ENABLE ni FORCE ROW LEVEL SECURITY za
  te dvije tabele — introspekcija vlasništva;
- ove politike nisu riješile D-OPEN-011 i ne smiju se tako tumačiti; access model za users i
  practices riješen je odlukom D-047 kroz docs/02 §17.5 i §17.6, već u FAZI 3.

RLS i runtime put za practice_settings (paket 013_rls_policies; docs/02 §6.4, §18.1, §20.2b.1,
§22.13; docs/03 §5 i §10; D-049; D-053 dijelovi A i B):
- ENABLE ROW LEVEL SECURITY;
- FORCE ROW LEVEL SECURITY;
- standardna tenant politika practice_id = app.practice_id;
- SELECT grant nad TAČNO DEVET kolona;
- UPDATE grant nad TAČNO DEVET kolona, uveden ZAJEDNO sa politikom koja ga ograničava;
- UPDATE grant bez pripadajuće tenant politike obara phase gate;
- GET i PATCH /api/v1/practices/{practiceId}/settings;
- ETag na oba odgovora; If-Match obavezan na PATCH;
- 428 PRECONDITION_REQUIRED bez If-Match; 409 VERSION_CONFLICT na stale If-Match;
- version se inkrementira atomično;
- practice.settings.read i practice.settings.manage ostaju PRACTICE_ADMIN only (D-044,
  nepromijenjeno; docs/15);
- copilot_system NE DOBIJA nijedan grant; PUBLIC NE DOBIJA nijedan grant;
- regresijski test dokazuje da je izloženost PHASE 3 INTERMEDIATE NON-PILOT
  CONDITIONAL-SETTINGS READ EXPOSURE zatvorena — copilot_app više ne vidi redove izvan tenanta.

TAČNE POVRŠINE — NE IZMIŠLJAJ IH (D-053; docs/02 §20.2b.1). Formulacija "proširena čitljiva
površina" je POVUČENA i zamijenjena ovim listama:

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

- NEMA table-level SELECT i NEMA table-level UPDATE;
- NEMA INSERT i NEMA DELETE za runtime role;
- NEČITLJIVO ostaje: id (ako postoji), configuration, updated_at, updated_by;
- BEZ UPDATE-a ostaje: practice_id, id (ako postoji), configuration, updated_by;
- trokolonski grant Faze 3 je STROGI PODSKUP — NE OPOZIVAJ ga;
- nedozvoljena kolona pada sa 42501 i kada se koristi samo u WHERE ili ORDER BY.

ZAMRZNUTA SETTINGS REPREZENTACIJA (D-053 dio A; docs/03 §10). GET i uspješan PATCH vraćaju
ISTU reprezentaciju, TAČNO OSAM POLJA:

{
  "practiceId": "<uuid>",
  "billingReviewRequired": <boolean>,
  "allowMpaApproval": <boolean>,
  "allowBillingSpecialistApproval": <boolean>,
  "requireReasonForManualChange": <boolean>,
  "aiEnabled": <boolean>,
  "axenitaExportEnabled": <boolean>,
  "retentionPolicyCode": <string|null>
}

- oba odgovora nose ETag: "<version>", izveden iz practice_settings.version;
- version SE NE DUPLIRA u JSON tijelo — ni u GET, ni u PATCH odgovoru, ni u PATCH zahtjevu;
- updated_at, updated_by i configuration se NE VRAĆAJU.

MEHANIKA OPTIMISTIČKOG UPDATE-a (D-053 dio B):
- If-Match je OBAVEZAN; nedostajući => 428 PRECONDITION_REQUIRED;
- očekivana verzija se izvodi ISKLJUČIVO iz If-Match;
- izvrši JEDAN ATOMIČAN SQL UPDATE koji:
  - postavlja SAMO poslana poslovna polja;
  - postavlja version = version + 1;
  - postavlja updated_at na tekuće vrijeme baze;
  - nosi predikat practice_id = <uspostavljeni tenant> AND version = <očekivana verzija>;
- nula pogođenih redova zbog zastarjele verzije => 409 VERSION_CONFLICT;
- uspjeh vraća reprezentaciju i NOVI ETag;
- pozivalac NIKADA ne šalje version, updated_at ni updated_by; poslano se ODBIJA.

updated_by OSTAJE NETAKNUT. Settings endpoint ga NE PIŠE i on NIJE autoritativno audit polje —
akterstvo ostaje u kanonskom audit modelu.

NE UVODI (D-053 klauzula B.5):
- triger nad version;
- SECURITY DEFINER;
- privilegovanu helper funkciju;
- izmjenu paketa 014_immutability_triggers;
- novi migration paket;
- API polje za proizvoljnu verziju.

Runtime privilegija UPDATE (version) je PRIHVAĆEN minimalan mehanizam za atomičan inkrement.

ADAPTACIJA GET /me NAKON practice_settings RLS-a (D-053 dio D; docs/02 §17.1a; docs/03 §10).

PROBLEM: GET /me izvodi uslovne permisije iz allow_mpa_approval i allow_billing_specialist_approval,
a /me je NEUTRALNA ruta bez app.practice_id. Čim ova faza uvede tenant politiku, predikat postaje
practice_id = NULL i vraća NULA REDOVA za svaki membership; resolver pada fail-closed i MPA i
BILLING_SPECIALIST TIHO GUBE analysis.approve i analysis.approval.revoke. Regresija NE BACA GREŠKU.

NE SLABI POLITIKU DA BI /me PRORADIO. Politika ostaje doslovno:
  practice_id = nullif(current_setting('app.practice_id', true), '')::uuid

Adaptiraj ISKLJUČIVO aplikacijski put:
- GET /me OSTAJE neutralna autentifikovana ruta; NE uvodi X-Practice-ID;
- zamrznuti /me ugovor iz docs/03 §10 se NE MIJENJA;
- svaki practice_id za taj interni read dolazi ISKLJUČIVO iz već razriješenih membership redova
  za app.user_id; nijedna vrijednost iz tijela, query parametra, headera ni putanje NE UČESTVUJE;
- NEAKTIVAN membership NE DOBIJA kontekst i ostaje permissions = [] (set_request_context bi za
  njega ionako podigao 42501, jer validira pm.active = true);
- za AKTIVAN membership kojem uslovne postavke stvarno trebaju, uspostavi app.practice_id ZA TAJ
  MEMBERSHIP kroz prihvaćeni set_request_context put (docs/02 §16.2.3), pa tek onda čitaj;
- SVA ČITANJA KOJA NISU TENANT-SCOPED MORAJU SE ZAVRŠITI PRIJE PRVOG set_request_context POZIVA —
  users (§17.5), practices (§17.6), practice_memberships (§17.3), practice_membership_roles
  (§17.4), platform_role_assignments (§17.2). Razlog: RESTRICTIVE politika practices_context_narrow
  sužava practices na TAČNO JEDNU ordinaciju čim kontekst postoji, pa bi čitanje practiceName za
  više membershipa nakon toga bila tiha regresija;
- postavke ordinacije A NIKADA ne doprinose ordinaciji B; NEMA unije postavki ni rola preko
  ordinacija;
- NE UVODI novi mehanizam čišćenja konteksta — set_request_context već briše app.practice_id
  prije validacije (D-033 klauzula 10), a kraj transakcije gasi sve app.* varijable;
- NEMA SECURITY DEFINER, BYPASSRLS, superuser puta ni ijedne zaobilaznice;
- provjeru practices.status iz koraka 4 redoslijeda autorizacije NE UVODI na /me — ona štiti
  KLIJENTSKI POSLAN X-Practice-ID na tenant ruti, a /me ne bira tenant i ne autorizuje nijednu
  tenant operaciju (D-053 klauzula D.10).

OBAVEZAN REGRESIJSKI TEST (D-053 klauzula D.12):
- iste kanonske /me fixture daju ISTE memberships[].permissions PRIJE I NAKON RLS-a;
- uslovno ponašanje MPA i BILLING_SPECIALIST tačno za OBA stanja OBA flaga;
- neaktivan membership ostaje permissions = [];
- multi-practice membership koristi postavke SVOJE ordinacije, nezavisno;
- practiceName prisutan za SVAKI membership — dokaz redoslijeda čitanja;
- nijedan tenant kontekst ne curi nakon transakcije;
- nijedan klijentski poslan practice identifikator ne učestvuje u neutralnom /me.

review_decision_change_links NIJE U OBUHVATU OVE FAZE (D-052, dio A):
- tabelu kreira paket 009_review_approvals u FAZI 10 (docs/02 §22.9); u Fazi 4 ONA NE POSTOJI;
- NE kreiraj tu tabelu;
- NE izvršavaj ENABLE, FORCE, tenant politiku ni ijedan grant nad njom;
- NE referenciraj je kao postojeću ni u migraciji, ni u testu, ni u aplikacijskom kodu;
- vlasništvo RLS slicea OSTAJE paket 013_rls_policies — odgođena je isključivo tačka izvršenja;
- puni, nepromijenjeni sigurnosni zahtjevi izvršavaju se u Fazi 10 (docs/05 Faza 10,
  „RLS i grants — D-046"; docs/08 §24a.5);
- preostale tenant politike ove faze izvršavaj SAMO nad tabelama koje u Fazi 4 stvarno postoje;
- generički tenant RLS obrazac i test harness i dalje uspostavlja OVA faza, dokazano nad
  practice_settings — Faza 10 ga samo proširuje;
- NE uvodi novi broj paketa i NE renumeriši postojeće.

Proširenje D-048 allowliste (docs/02 §23.4.4a; D-052, dio B):
- ova faza prvi put uvodi FORCE RLS nad practice_memberships i practice_settings;
- pouzdani seed put upisuje u OBJE, pa se allowlist proširuje TAČNO tim dvjema tabelama;
- proširenje mora biti EKSPLICITNO — tiho proširenje obara phase gate;
- allowlist faze 3 ostaje nepromijenjena; ukupno šest tabela;
- FORCE RLS se obnavlja NAKON seeda;
- putevi neuspjeha i rollbacka obnavljaju FORCE RLS;
- ZABRANJENO: BYPASSRLS, SECURITY DEFINER zaobilaznica, superuser runtime put,
  DISABLE ROW LEVEL SECURITY, trajna owner-write politika;
- testovi dokazuju steady-state ENABLE I FORCE prije i nakon seeda.

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
- svaka ćelija je tačno jedno od: ALLOW, DENY, CONDITIONAL. Vrijednost BLOCKED — D-OPEN-011
  je povučena odlukom D-047 i nijedna ćelija je više ne smije nositi;
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
  practice.read DENY; bez discovery/listing endpointa;
- READ_ONLY — nula ALLOW; nula CONDITIONAL; practice.read DENY; sve ostale DENY;
- PRACTICE_ADMIN — practice.read; practice.settings.read; practice.settings.manage;
  encounter.close; tariff.raw_result.read; audit.read; audit.export; integration.read; bez
  kliničke ovlasti osim ako je zasebno dodijeljena druga prihvaćena tenant rola;
- SYSTEM_ADMIN — tariff.manage isključivo na platform obuhvatu; bez tenant permisije kroz
  platformRoles; practice.read DENY; bez tariff.raw_result.read; tenant ruta zahtijeva aktivan
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

Vlasništvo faze i migration paketa (docs/02 §17.0):
- membership bootstrap RLS politika, docs/02 §17.3 — Faza 4, paket 013_rls_policies (docs/02 §22.13);
- practice_membership_roles RLS politika, docs/02 §17.4 — Faza 3, paket 002_identity_and_practices;
  PREMJEŠTENA iz paketa 013 odlukom D-051; Faza 4 je samo verifikuje;
- platform_role_assignments RLS politike, docs/02 §17.2 — Faza 3, paket
  002_identity_and_practices; PREMJEŠTENE iz paketa 013 odlukom D-051; Faza 4 ih samo verifikuje;
- practice_settings ENABLE + FORCE RLS, tenant politika, devetokolonski SELECT, devetokolonski
  UPDATE i obje settings rute — Faza 4, paket 013_rls_policies (D-049; D-053 dijelovi A i B);
- adaptacija GET /me uslovnog reada pod practice_settings RLS-om i njen regresijski dokaz —
  Faza 4, aplikacijski i test sloj, bez migration paketa (D-053 dio D; docs/02 §17.1a);
- generalizovani tenant endpoint authorization/enforcement pipeline — Faza 4, aplikacijski sloj,
  bez migration paketa;
- set_request_context(p_practice_id uuid) — Faza 4, paket 013_rls_policies;
- uspostava app.practice_id, PracticeContextGuard, TenantDatabaseService — Faza 4;
- set_user_context(p_user_id uuid) — Faza 3, paket 002_identity_and_practices; PREMJEŠTEN iz
  paketa 013 u paket 002 i već kreiran prije Faze 4, koja ga samo verifikuje i koristi
  (D-047, klauzula 17);
- transakcijski lokalne context varijable — Faza 4, paket 013_rls_policies;
- negativni testovi za nevažeći ili neaktivan membership — Faza 4;
- test da kontekst ne ostaje nakon završetka transakcije — Faza 4.

Tabele practice_memberships i practice_membership_roles kreiraju se u Fazi 3 i paketu
002_identity_and_practices. Bootstrap RLS politika za practice_memberships (docs/02 §17.3) je u
Fazi 4 i paketu 013_rls_policies; RLS za practice_membership_roles (docs/02 §17.4) je u Fazi 3 i
paketu 002 (D-051). Ne premještaj docs/02 §17.3 u paket 002.
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
- politike iz docs/02 §17.5 i §17.6 postoje, nisu oslabljene, i RESTRICTIVE politika nije
  zamijenjena permissive varijantom;
- nije uvedena treća users politika za pristup redu drugog korisnika;
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

practice.read je riješen odlukom D-047: PRACTICE_ADMIN ALLOW, ostalih šest rola DENY.
Ne odstupaj od docs/15 §5 ni u jednom smjeru.

Self-enumeracija vlastitih membership rola NIJE generički pristup nad users, NIJE generički
pristup nad practices, NIJE role administration i NIJE cross-practice administracija. Ta
tvrdnja ostaje tačna i nakon D-047.

Pristup redu DRUGOG korisnika ostaje DENY / NOT IMPLEMENTED u v1 — gate BEFORE PHASE 5
CO-MEMBER DISPLAY NAME ACCESS (docs/13 §19). Ne kreiraj treću users politiku.

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
- RLS nad review_decision_change_links pripada paketu 013_rls_policies, NE ovom paketu.

RLS za review_decision_change_links — ODGOĐENI SLICE PAKETA 013_rls_policies, IZVRŠAVA SE U OVOJ
FAZI (D-052, dio A; docs/02 §13.2a, §18.1, §22.13; D-046, klauzule 25–33). Faza 4 ga NIJE
izvršila jer tabela tada nije postojala. Izvrši ga NEPOSREDNO NAKON schema objekata gore:
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
- RLS se NE PREMJEŠTA u paket 009; objekti pripadaju paketu 013_rls_policies;
- NE uvodi novi broj paketa i NE renumeriši postojeće.

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
- schema objekti su u 009_review_approvals, RLS objekti u 013_rls_policies, i OBOJE su izvršeni
  u ovoj fazi (D-052);
- review_decision_change_links nosi ENABLE I FORCE ROW LEVEL SECURITY nakon ove faze;
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

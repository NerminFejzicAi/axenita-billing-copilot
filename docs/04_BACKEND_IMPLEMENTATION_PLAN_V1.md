# 04 — Backend Implementation Plan v1

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot  
**Cilj:** Od praznog repozitorija do testiranog backend MVP-a  
**Metoda:** 12 zatvorenih faza  
**Pravilo:** Jedna faza → testovi → diff → commit → naredna faza

---

# 1. Način korištenja

Za svaku fazu:

1. kreirati poseban Git branch;
2. kopirati odgovarajući prompt iz `07_CURSOR_PHASE_PROMPTS.md`;
3. dozvoliti Cursoru da prvo prikaže plan;
4. provjeriti da plan ne prelazi scope;
5. pokrenuti implementaciju;
6. zahtijevati sve provjere;
7. pregledati završni izvještaj;
8. pregledati `git diff`;
9. ažurirati checklistu;
10. commitovati;
11. tek tada otvoriti naredni branch/fazu.

Ne pokretati više faza paralelno.

---

# 2. Globalni prerequisites

Prije faze 1:

- Git instaliran;
- Docker Desktop radi;
- Node.js LTS instaliran;
- Corepack/pnpm dostupan;
- Cursor otvoren nad root folderom;
- dokumentacijski paket kopiran u root;
- nema nepoznatih Git promjena;
- project owner potvrđuje stack iz Decision Loga.

---

# 3. Faza 1 — Repository i lokalna infrastruktura

## 3.1 Cilj

Kreirati stabilan monorepo i lokalne servise bez business domena.

## 3.2 Branch

```text
backend/01-bootstrap-infrastructure
```

## 3.3 Scope

Kreirati:

```text
package.json
pnpm-workspace.yaml
.gitignore
.editorconfig
.env.example
compose.yaml
apps/api
services/tariff-engine-java placeholder
packages/contracts
infra/database/init
scripts
```

NestJS API:

- strict TypeScript;
- config module;
- request ID;
- Helmet;
- CORS allowlist;
- global prefix/versioning;
- validation pipe;
- health live endpoint.

Docker:

- PostgreSQL 16;
- Redis 7;
- MinIO;
- persistent volumes;
- health checks.

## 3.4 Ne implementirati

- Prisma business modele;
- auth;
- RLS;
- AI;
- queue jobs;
- encounter;
- frontend;
- Axenita;
- OAAT.

## 3.5 Tačne aktivnosti

1. inicijalizovati Git/pnpm workspace;
2. generisati NestJS app;
3. zaključati Node/Nest/TypeScript/pnpm verzije;
4. konfigurirati lint/format/typecheck;
5. kreirati compose;
6. kreirati validated environment config;
7. kreirati `/api/v1/health/live`;
8. kreirati `/api/v1/health/ready` sa inicijalnim lokalnim checkovima;
9. dodati scripts;
10. dodati minimalne testove.

## 3.6 Obavezne komande

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
docker compose up -d
docker compose ps
```

## 3.7 Acceptance

- svi containeri healthy;
- API starta;
- live 200;
- ready ima strukturiran rezultat;
- `.env` nije commitovan;
- `.env.example` nema stvarne secrets;
- nema business tabela.

## 3.8 Commit

```text
chore(backend): bootstrap monorepo and local infrastructure
```

---

# 4. Faza 2 — Prisma, database role i base migration

## 4.1 Branch

```text
backend/02-prisma-database-roles
```

## 4.2 Cilj

Odvojiti migrator i runtime role i uspostaviti siguran Prisma workflow.

## 4.3 Scope

- Prisma 7;
- `schema.prisma`;
- `prisma.config.ts`;
- generated client output;
- `MIGRATION_DATABASE_URL`;
- `DATABASE_URL`;
- `copilot_migrator`;
- `copilot_app`;
- DatabaseModule;
- PrismaService;
- migration scripts;
- DB health.

## 4.4 Aktivnosti

1. instalirati Prisma i pg adapter;
2. zaključati module format;
3. konfigurirati migrator URL;
4. kreirati runtime role init SQL;
5. potvrditi `NOBYPASSRLS`;
6. kreirati praznu/base migraciju;
7. kreirati PrismaService singleton;
8. zabraniti runtime korištenje migrator URL-a;
9. dodati DB connectivity test;
10. dokumentovati migration workflow.

## 4.5 Testovi

- `prisma format`;
- `prisma validate`;
- migrate na praznu bazu;
- runtime konekcija;
- query current_user = `copilot_app`;
- owner tabele nije `copilot_app`;
- `copilot_app` ne može CREATE TABLE.

## 4.6 Stop uslov

Ako runtime koristi migrator credential, faza nije završena.

## 4.7 Commit

```text
feat(database): establish prisma workflow and separated database roles
```

---

# 5. Faza 3 — Identity i practice domena

## 5.1 Branch

```text
backend/03-identity-practices
```

## 5.2 Scope

Tabele:

- practices;
- users;
- practice_memberships;
- practice_membership_roles;
- practice_settings.

API:

- `GET /me`;
- `GET /practices/{practiceId}`.

**Settings rute nisu u obuhvatu faze 3 (D-049).** Ni `GET` ni `PATCH
/practices/{practiceId}/settings` se **ne registruju** u ovoj fazi, ni kao stub. Raniji fazni dio
D-028, klauzule 4, je povučen; kompletan settings runtime put pripada **fazi 4** (§6.3).

Development identity:

- kontrolisani dev auth guard ili signed dev JWT;
- nikada production fallback.

Ograničenja iz D-033 (uz amandman D-051):

- `practice_memberships` se kreira u ovoj fazi, ali njena **bootstrap RLS politika pripada
  Fazi 4** (`02` §17.3). U Fazi 3 se na nju ne postavlja RLS;
- **`practice_membership_roles`, međutim, dobija svoju RLS već u ovoj fazi** — `ENABLE` +
  `FORCE RLS` i politiku `practice_membership_roles_self_select` (`02` §17.4, D-051, klauzula 1).
  Politika ne zahtijeva §17.3 da bi radila;
- `GET /me` vraća identitet pozivaoca, njegove `memberships` i njegove `platformRoles` kao
  **dva odvojena bloka** prema `03` §10. `platformRoles` se nikada ne prikazuju kao
  memberships niti se sa njima spajaju.

**Normativni izvor dodjele permisija rolama (D-039 do D-045):**

- **`15_ROLE_PERMISSION_MATRIX_V1.md` je konsolidovana normativna v1 role-permission matrica**;
- `06` sadrži izvorne prihvaćene ADR-ove — D-023, D-032 i D-039 do D-045;
- `03` definiše **ime permisije koju endpoint traži**, ne dodjelu rolama;
- effective-permission resolver (§6.4.1) **konzumira** matricu iz `15`;
- role grantovi se **nikada ne izvode** iz primjera ni starije proze;
- svaki budući konflikt se rješava **kontrolisanom ADR/dokument rekonsilijacijom**, nikada
  tihim tumačenjem.

Ograničenja iz D-038:

- vlasništvo ostaje **`002_identity_and_practices`**; **ne uvodi se novi broj paketa**;
- `practice_memberships` zadržava **tačno jedan red po ordinaciji i korisniku**,
  `unique (practice_id, user_id)`, `unique (practice_id, id)` i `active` semantiku koju
  D-033 zahtijeva;
- **`practice_memberships` se kreira bez singularne kolone `role`** i bez indeksa
  `(practice_id, active, role)` (D-038, klauzula 2);
- kreira se `practice_membership_roles` kao izvor dodjele tenant rola, sa: `id`;
  `practice_id`; `membership_id`; `role membership_role`; timestampovima prema projektnim
  konvencijama; primarnim ključem; `unique (practice_id, id)`;
  `unique (practice_id, membership_id, role)`; i composite FK-om
  `(practice_id, membership_id)` → `practice_memberships(practice_id, id)`;
- jedan membership nosi **nula, jednu ili više** tenant rola, svaku najviše jednom;
- seed i fixture podaci kreiraju **eksplicitne** membership-role redove.

**Životni ciklus dodjele.** Tabela čuva **trenutne efektivne dodjele**, a ne append-only
historiju rola. Uklanjanje role **briše** trenutni red dodjele. Historija dodjele i
uklanjanja pripada audit dokazu kada administracijski put bude prihvaćen.

Ne implementirati: `revoked_at`; nasljeđivanje rola; per-user permission overrid; platform
role; database role; generičku permisiju ni endpoint za dodjelu rola (D-038, klauzule
10–12, 15, 24).

**Indeksi.** Koriste se isključivo indeksi već prihvaćeni u `02`. Dokumentovani query
putovi su pokriveni postojećim constraintima: membership po ordinaciji i korisniku —
`unique (practice_id, user_id)`; aktivan membership i `GET /me` enumeracija —
`(user_id, active)`; role po membershipu i provjera role unutar ordinacije —
`unique (practice_id, membership_id, role)`; pretraga vlasničkog membershipa —
`unique (practice_id, id)`. **Nijedan spekulativni indeks se ne kreira.**

### 5.2.1 Redoslijed implementacije za paket `002`

Redoslijed je obavezan. Kolone „Paket" i „Faza" prikazuju **postojeće prihvaćeno
vlasništvo** i ne mijenjaju ga.

| # | Korak | Paket (`02` §22) | Faza |
|---:|---|---|---:|
| 1 | kreirati ili zadržati enum `membership_role` | `002_identity_and_practices` | 3 |
| 2 | kreirati `practices` i `users` prema postojećem vlasništvu | `002_identity_and_practices` | 3 |
| 3 | kreirati `practice_memberships` **bez** singularne role | `002_identity_and_practices` | 3 |
| 4 | kreirati `practice_membership_roles` | `002_identity_and_practices` | 3 |
| 5 | dodati kompozitne ključeve i indekse | `002_identity_and_practices` | 3 |
| 6 | primijeniti grants, uključujući trokolonski `SELECT` na `practice_settings` (`02` §20.2b) | `002_identity_and_practices` | 3 |
| 7 | `ENABLE` i `FORCE ROW LEVEL SECURITY` na `practice_membership_roles` i `platform_role_assignments` | **`002_identity_and_practices`** | **3** |
| 8 | kreirati politike `practice_membership_roles_self_select`, `platform_role_assignments_self_select` i `platform_role_assignments_system_select` | **`002_identity_and_practices`** | **3** |
| 8a | `ENABLE` i `FORCE ROW LEVEL SECURITY` te bootstrap politika na `practice_memberships` (`02` §17.3) | `013_rls_policies` | 4 |
| 9 | seedovati eksplicitne membership-role redove, kroz maintenance prozor iz `02` §23.4 | `002_identity_and_practices` (`02` §23.2) | 3 |
| 10 | pokrenuti schema, RLS i authorization testove | — | 3 i 4 |

**Ažurirano odlukom D-051.** Koraci 7 i 8 pripadaju **Fazi 3 i paketu
`002_identity_and_practices`**; artefakti `02` §17.2 i §17.4 su premješteni iz paketa
`013_rls_policies` (`02` §17.0, §22.2, §22.13). Imena i tijela politika ostaju **identična**.
**§17.3 se ne premješta** — korak 8a ostaje u Fazi 4. **Nijedan broj paketa se ne dodaje niti
renumeriše.**

Korak 9 upisuje u tabele koje već nose `FORCE RLS`, pa se izvršava **isključivo** kroz maintenance
protokol iz `02` §23.4 (D-048). Allowlist faze 3: `users`, `practices`,
`practice_membership_roles`, `platform_role_assignments`.

Migration SQL paketa `002` autoriše se kanonskim tokom iz **D-050** (`02` §26.3): `prisma migrate
diff` kao kandidat → ručna dopuna custom SQL-a → ljudski pregled → validacija na jednokratnoj
praznoj bazi → `prisma migrate deploy` → mehanička verifikacija. **`prisma migrate dev
--create-only` se ne koristi**, jer njegova shadow baza nije spojiva sa guardovima migracije `001`.

**D-047 — runtime access model za `users` i `practices` je riješen (2026-08-12):**

Raniji blocker `D-OPEN-011` **više ne važi**. Umjesto njega vrijede sljedeći obavezni zahtjevi,
normativno definisani u `02` §16.2.1, §16.2.4, §17.5, §17.6, §20.2a i §22.2:

- `users` i `practices` dobijaju `ENABLE` **i** `FORCE ROW LEVEL SECURITY` **u ovoj fazi**;
- `users` dobija dvije **međusobno isključive** PERMISSIVE politike: bootstrap
  (`app.user_id IS NULL AND auth_subject = app.auth_subject`) i self (`id = app.user_id`);
- `practices` dobija PERMISSIVE membership politiku **i** **RESTRICTIVE** context narrowing
  politiku; RESTRICTIVE mod je obavezan;
- grantovi su **column-level**: `users` `(id, email, display_name, preferred_language, status)`;
  `practices` `(id, code, name, default_language, timezone, status)`;
- **nijedan** runtime `INSERT`, `UPDATE` ni `DELETE` nad te dvije tabele; `copilot_system` nema
  grant; `PUBLIC` nema grant;
- `auth_subject`, `last_login_at`, `zsr_number`, `gln_number` i `legal_name` **nemaju grant**;
- **i dalje se ne implementira** neograničen ni generički runtime pristup nad `users` i
  `practices` — zabrana nije ukinuta, nego je sada sprovedena kroz RLS i column grantove;
- pristup redu **drugog** korisnika ostaje `DENY / NOT IMPLEMENTED` u v1; obavezan gate je
  `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (D-047, klauzula 12);
- platform i system put nad te dvije tabele **ne postoje** u v1 i padaju zatvoreno.

**D-051 — §17.2 i §17.4 su obavezan dio ove faze (2026-08-14):**

Normativno: `02` §17.0, §17.2, §17.4, §22.2.

- `platform_role_assignments` dobija `ENABLE` + `FORCE RLS` i **obje** prihvaćene politike;
- `practice_membership_roles` dobija `ENABLE` + `FORCE RLS` i prihvaćenu self politiku;
- **imena i tijela politika se ne mijenjaju**; premješteno je isključivo vlasništvo paketa;
- self politika nad `platform_role_assignments` zavisi **isključivo** od `app.user_id` i **ne
  koristi** `app.practice_id`, `set_request_context`, `PracticeContextGuard` ni
  `TenantDatabaseService`;
- politika §17.4 radi **bez** §17.3 RLS-a, ali **zahtijeva** postojeći `SELECT` grant nad
  `practice_memberships`;
- **invarijanta D-023, klauzula 11 — `copilot_app` nema neograničen `SELECT` nad
  `platform_role_assignments` — važi od ove faze nadalje**;
- `platformRoles[]` u `GET /me` sadrži isključivo dodjele sa `revoked_at IS NULL`; revoke
  administracijski put se **ne uvodi**;
- paket `013_rls_policies` te objekte **ne smije rekreirati ni prepisati**.

**D-049 — `practice_settings` u ovoj fazi (2026-08-14):**

Normativno: `02` §6.4, §20.2b; `03` §5.1 i §10.

- paket `002` kreira **kompletnu** prihvaćenu `practice_settings` schemu — `version`,
  `check (version >= 1)`, `updated_by`, oba approval flaga;
- `copilot_app` dobija **isključivo** `SELECT (practice_id, allow_mpa_approval,
  allow_billing_specialist_approval)`; **nema table-level `SELECT`**;
- **nema `INSERT`, `UPDATE` ni `DELETE`** granta; `copilot_system` i `PUBLIC` nemaju nijedan grant;
- **nijedna settings ruta se ne registruje** u ovoj fazi;
- **nijedna RLS politika nad `practice_settings`** se ne kreira u paketu `002`;
- izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` je prihvaćena
  isključivo za ovo nepilotsko međustanje i zatvara je Faza 4.

**D-048 — maintenance protokol pri seedu (2026-08-14):**

Seed ove faze upisuje u četiri tabele koje već nose `FORCE RLS`. Svaki takav upis ide **isključivo**
kroz protokol iz `02` §23.4: `BEGIN` → provjera allowliste → `NO FORCE` → asercija → pouzdani DML →
`FORCE` → asercija → `COMMIT`. `BYPASSRLS`, `SECURITY DEFINER`, superuser seed credential, trajna
migrator politika i `DISABLE ROW LEVEL SECURITY` su **zabranjeni**.

Seed:

- demo practice;
- admin;
- physician;
- memberships;
- practice settings red, uz oba approval flaga na `false`.

## 5.3 Aktivnosti

1. Prisma modeli, uključujući `practice_membership_roles`;
2. migration custom grants;
3. seed sa eksplicitnim membership-role redovima i **jednim membershipom bez ijedne role**;
4. repositories/services;
5. dev auth subject resolution;
6. **effective-permission resolver** — komponuje permisije iz dodijeljenih tenant rola i
   **konzumira prihvaćenu matricu iz `15`**; **ne smije hard-kodirati** nijedan grant izvan te
   matrice (§6.4.1);
7. DTO i OpenAPI, uz `memberships[].roles` prema `03` §10;
8. unit/integration test.

## 5.4 Acceptance

- seed idempotentan;
- user se resolva po auth subjectu;
- inactive membership odbijen;
- `/me` vraća `memberships` i `platformRoles` kao dva odvojena bloka;
- `platformRoles` se ne pretvaraju u tenant membershipe;
- nema neograničenog runtime reada nad `users` ni `practices` — sprovedeno kroz `FORCE RLS` i
  column-level grantove (D-047; `02` §17.5, §17.6, §20.2a);
- `users` i `practices` nose `ENABLE` + `FORCE RLS`, sa tačno onim politikama koje D-047 propisuje;
- `platform_role_assignments` i `practice_membership_roles` nose `ENABLE` + `FORCE RLS`, sa tačno
  onim politikama koje `02` §17.2 i §17.4 propisuju (D-051);
- sve četiri tabele sa allowliste imaju steady-state `relrowsecurity = true` i
  `relforcerowsecurity = true` **nakon migracije i nakon seeda** (D-048);
- prekinut ili neuspio seed ne ostavlja nijednu od njih sa isključenim `FORCE` (D-048);
- `practice_settings` ima **isključivo** trokolonski `SELECT` i nijedan upisni grant; `SELECT *` i
  svaka nedozvoljena kolona padaju sa `42501` (D-049);
- **nijedna settings ruta nije registrovana** u ovoj fazi (D-049);
- migracija je autorisana kanonskim tokom iz `02` §26.3, bez Prisma shadow baze i bez slabljenja
  ijednog guarda migracije `001` (D-050);
- korisnik čiji `status` nije `ACTIVE` odbijen je prije `set_user_context`;
- ordinacija čiji `status` nije `ACTIVE` odbijena je prije nego `app.practice_id` postoji;
- negativni testovi iz `02` §25.1.1 i `08` §21.5 prolaze;
- nema password tabele;
- permission strings centralizovani.

Obavezni D-038 kriteriji:

- `practice_memberships` **nema singularnu kolonu `role`**;
- `practice_membership_roles` postoji sa svim prihvaćenim constraintima;
- jedan membership može nositi nula, jednu ili više rola;
- **dupla dodjela iste role** istom membershipu je odbijena;
- dodjela koja referencira membership **druge ordinacije** je odbijena na composite FK-u;
- seed kreira eksplicitne role redove **i** najmanje jedan membership bez ijedne role;
- `GET /me` vraća `memberships[].roles` i **nikada** `memberships[].role`;
- **svaki grant dolazi isključivo iz prihvaćene matrice u `15`**; nijedan grant nije
  hard-kodiran izvan nje.

### 5.4.1 `GET /me` implementacija

Normativni ugovor: `03` §10.

Response po membershipu izlaže: `membershipId`; `practiceId`; `practiceName`; `active`;
`roles[]`; izvedene `permissions[]`. `platformRoles` ostaje **zaseban top-level blok**.

Obavezno ponašanje:

- **nikada** ne vraćati `memberships[].role`;
- `roles[]` sadrži **jedinstvene** vrijednosti;
- `roles[]` ima **determinističan redoslijed**;
- `roles[]` sadrži isključivo role pripadajućeg membershipa;
- neaktivni membershipi **smiju** biti vidljivi;
- `platformRoles` se **nikada** ne pojavljuju unutar `roles[]`;
- `permissions[]` se **izvodi pri čitanju** (§6.4.1) iz prihvaćene matrice u `15`, a ne čuva
  kao stanje membershipa;
- `permissions[]` ima **determinističan redoslijed**;
- neaktivan membership smije biti izlistan, ali vraća **nula** efektivnih permisija;
- `platformRoles` ostaje zaseban i **nikada ne ulazi** u tenant kompoziciju.

Prelazni period nije potreban: projekat nema produkcijskog klijenta, pa se **ne implementira**
compatibility endpoint ni istovremeno postojanje polja `role` i `roles`.

**Bootstrap self-enumeracija.** `GET /me` smije nabrojati membershipe i njihove dodijeljene
role prije nego što je izabran ijedan tenant kontekst. Ta enumeracija: ograničena je na
autentifikovanog korisnika; **nije** generički pristup nad `users`; **nije** generički
pristup nad `practices`; **nije** role administration; **nije** cross-practice administracija;
**ne autorizuje** nijednu tenant operaciju; i **nije riješila D-OPEN-011** — to je učinio D-047.
Generički `users`/`practices` pristup i dalje **ne postoji**: `practiceName` se čita kroz
membership-scoped politiku iz `02` §17.6, a vlastiti `users` red kroz self politiku iz `02` §17.5.
Pristup redu **drugog** korisnika ostaje `DENY / NOT IMPLEMENTED` u v1.

## 5.5 Commit

```text
feat(identity): add practices users memberships and settings
```

---

# 6. Faza 4 — Tenant isolation i RLS

## 6.1 Branch

```text
backend/04-tenant-rls
```

## 6.2 Kritičnost

Ovo je sigurnosni gate. Ne nastavljati ako bilo koji RLS test ne prolazi.

### 6.2.1 Normativni model tenant bootstrapa (D-033)

Normativne odluke su **D-033** i **D-038** iz `06`. Implementacija tačno prati `02` §16.2,
§16.2a, §17.3 i §17.4, te `03` §3 i §3.7.

Obavezni redoslijed — **jedanaest koraka**, identičan `03` §3.7.1:

1. autentifikacija bearer tokena;
2. izvođenje pouzdanog `app.user_id` iz verifikovanog subjekta — `set_auth_subject_context`,
   čitanje `users`, provjera `users.status`, pa `set_user_context`;
3. čitanje i validacija `X-Practice-ID`;
4. **membership-scoped čitanje `status`-a tražene ordinacije, prije promjene konteksta**
   (D-047, klauzula 10): nula redova → `403 ACCESS_DENIED`; `status <> 'ACTIVE'` →
   `403 ACCESS_DENIED` uz rollback;
5. poziv SECURITY INVOKER funkcije `set_request_context(p_practice_id uuid)`;
6. provjera **aktivnog** `practice_memberships` reda kroz user-scoped bootstrap politiku;
7. uspostavljanje transakcijski lokalnog tenant konteksta `app.practice_id` **tek nakon**
   uspješne validacije;
8. učitavanje dodijeljenih tenant rola za taj membership i tu ordinaciju;
9. izvođenje efektivnih tenant permisija (§6.4.1);
10. evaluacija permisije koju endpoint zahtijeva i svakog prihvaćenog uslovnog pravila;
11. izvršenje komande pod tenant RLS-om.

**Restitucija koraka 4 (D-053, dio C).** Raniji desetokoračni restatement u ovom odjeljku je
**izostavljao** korak 4 i time odstupao od autoritativnog `03` §3.7.1 i dijagrama `14` §2.
**Nijedna sigurnosna semantika se ne mijenja** — korak je od D-047 obavezan; ispravlja se
isključivo zastarjeli restatement. `app.practice_id` **se ne uspostavlja** dok korak 4 ne uspije, a
tijelo `set_request_context` se **ne mijenja** (`02` §16.2.3): provjera statusa je **aplikacijska** i
izvršava se **prije** poziva. Korak 4 dokazuje **postojanje** membershipa, korak 6 dokazuje
**aktivan** membership; oba su potrebna i nijedan ne zamjenjuje drugi.

Na kraju transakcije request context se automatski čisti; transakcijski lokalne varijable ne
preživljavaju request.

Pojašnjenja (D-038, klauzule 20–21):

- `set_request_context` **ne čita i ne zahtijeva** `practice_membership_roles`;
- `set_request_context` **ne prima rolu** i **ne prima `user_id`**;
- `set_request_context` **ne uspostavlja platform kontekst**;
- aktivan membership sa **nula** rola **smije** uspostaviti tenant kontekst;
- takav membership i dalje dobija **`403`** na svakoj permission-gated tenant operaciji;
- neuspjeh bootstrapa **ne smije ostaviti upotrebljiv kontekst**.

### 6.2.2 Obavezna pravila

- membership bootstrap mora raditi **prije nego tenant practice context postoji**;
- zato `practice_memberships` koristi svoju posebnu user-scoped bootstrap politiku;
- **normalna tenant RLS se ne može koristiti za bootstrap konteksta koji ta ista RLS
  zahtijeva** — ciklična zavisnost; faza ostaje BLOCKED ako je tako implementirana;
- **nije dozvoljen SECURITY DEFINER bypass**;
- **ne vjeruje se caller-provided `user_id`**; funkcija ga ne prima;
- `X-Practice-ID` je **nepouzdan traženi tenant identifikator** dok membership validacija ne
  uspije;
- nevažeći, neaktivan ili nepostojeći membership mapira se na **403 na API sloju**;
- neuspjeh bootstrapa **ne smije ostaviti upotrebljiv practice context**;
- transakcijski lokalni kontekst **ne smije procuriti** u kasniji request ni u pooled
  konekciju;
- platform rute koriste **odvojena platform authorization pravila** (`03` §3.3);
- tenant membershipi i `platformRoles` se **ne kombinuju automatski**;
- **`practice_membership_roles` nije dio provjere postojanja membershipa** — koraci 4–6
  čitaju isključivo `practice_memberships`, a role se evaluiraju tek nakon uspješnog
  bootstrapa (D-038, klauzule 20–21);
- opšti runtime pristup nad `users` i `practices` **ne postoji** — sprovedeno kroz `FORCE RLS` i
  column-level grantove već u fazi 3 (D-047; `02` §17.5, §17.6, §20.2a).

### 6.2.3 Vlasništvo faze i migration paketa

**Ažurirano odlukom D-047, klauzule 16–17, te odlukama D-049 i D-051 (2026-08-14).**
**Dopunjeno odlukom D-056 (2026-08-20)** — razdvaja tenant kontekst semantiku, koja **ostaje**
obaveza faze 4, od **konkretnog `TenantDatabaseService` facadea**, koji je **uslovno odgođen**.

| Artefakt | Faza | Migration paket (`02` §22) |
|---|---|---|
| autentifikovani user context (auth subject → `users.id`) | Faza 3 | `002_identity_and_practices` |
| `app.auth_subject` i `set_auth_subject_context(text)` (`02` §16.2.4) | **Faza 3** | **`002_identity_and_practices`** |
| `set_user_context(p_user_id uuid)` — premješteno iz `013` | **Faza 3** | **`002_identity_and_practices`** |
| `users` `ENABLE` + `FORCE RLS` i obje politike (`02` §17.5) | **Faza 3** | **`002_identity_and_practices`** |
| `practices` `ENABLE` + `FORCE RLS`, PERMISSIVE + RESTRICTIVE politike (`02` §17.6) | **Faza 3** | **`002_identity_and_practices`** |
| `platform_role_assignments` `ENABLE` + `FORCE RLS` i obje politike (`02` §17.2) — **premješteno iz `013` (D-051)** | **Faza 3** | **`002_identity_and_practices`** |
| `practice_membership_roles` `ENABLE` + `FORCE RLS` i self politika (`02` §17.4) — **premješteno iz `013` (D-051)** | **Faza 3** | **`002_identity_and_practices`** |
| column-level grantovi nad `users` i `practices` (`02` §20.2a) | **Faza 3** | **`002_identity_and_practices`** |
| trokolonski `SELECT` grant nad `practice_settings` (`02` §20.2b, D-049) | **Faza 3** | **`002_identity_and_practices`** |
| `FORCE RLS` maintenance protokol pri seedu (`02` §23.4, D-048) | **Faza 3** | **`002_identity_and_practices`** |
| odbijanje neaktivnog korisnika i ne-ACTIVE ordinacije | **Faza 3** | — (aplikacijski sloj) |
| izvođenje `permissions[]` za `GET /me`, uključujući uslovne (D-049, klauzula 7) | **Faza 3** | — (aplikacijski sloj) |
| `practice_memberships` bootstrap RLS (`02` §17.3) | Faza 4 | `013_rls_policies` |
| `practice_settings` `ENABLE` + `FORCE RLS`, tenant politika, **devetokolonski `SELECT`**, **devetokolonski `UPDATE`** (D-049; D-053, dijelovi A i B) | **Faza 4** | `013_rls_policies` |
| `GET` i `PATCH /practices/{practiceId}/settings`, zamrznuta osmopoljna reprezentacija, `ETag`, `If-Match`, `428`, `409 VERSION_CONFLICT` (D-049; D-053, dio A) | **Faza 4** | `013_rls_policies` |
| adaptacija `GET /me` uslovnog reada pod `practice_settings` RLS-om (`02` §17.1a; D-053, dio D) | **Faza 4** | — (aplikacijski sloj) |
| regresijski dokaz `GET /me` prije i nakon `practice_settings` RLS-a (D-053, klauzula D.12) | **Faza 4** | — (test sloj) |
| generalizovani tenant endpoint authorization/enforcement pipeline (§6.4.1) | Faza 4 | — (aplikacijski sloj) |
| `set_request_context(p_practice_id uuid)` | Faza 4 | `013_rls_policies` |
| uspostava `app.practice_id` i tenant kontekst semantika (`set_request_context` unutar pinovane transakcije) | Faza 4 | `013_rls_policies` / aplikacijski sloj |
| `PracticeContextGuard` — semantička odgovornost tenant admisije (naziv faze, ne obavezan NestJS `Guard`; D-054, klauzule 2–4) | Faza 4 | — (aplikacijski sloj) |
| **konkretan `TenantDatabaseService` facade** — **`EXPLICITLY_DEFERRED` (D-056)**, uslovno na stvarni tenant business modul | **uslovno; najranije očekivano Faza 5** | — (aplikacijski sloj) |
| transakcijski lokalne tenant varijable | Faza 4 | `013_rls_policies` |
| proširenje D-048 allowliste na `practice_memberships` i `practice_settings` (`02` §23.4.4a, D-052) | **Faza 4** | `013_rls_policies` |
| `ENABLE` + `FORCE RLS` i tenant politika nad `review_decision_change_links` (D-046) — **odgođeno izvršenje (D-052)** | **Faza 10** | `013_rls_policies` |
| redoslijed request middlewarea | Faza 3 auth guard → Faza 4 practice guard | — |
| negativni membership testovi | Faza 4 | — |
| testovi curenja konteksta na pooled konekciji | Faza 4 | — |

Premještanje `set_user_context` iz paketa `013` u paket `002` je **isključivo izmjena vlasništva
paketa**, ne sigurnosne semantike: potpis, `SECURITY INVOKER` mod i tijelo ostaju tačno kako ih
D-033 klauzule 3–4 propisuju (D-047, klauzula 17). Razlog je što faza 3 već zahtijeva
autentifikovan user context, a `02` §22.13 i raniji red ove tabele bili su u međusobnom
neslaganju. **Nijedan novi broj paketa se ne uvodi**, i **§17.3 se ne premješta** u fazu 3.

Politike nad `users` i `practices` napisane u paketu `002` su **konačne**; faza 4 ih ne prepisuje,
nego samo počinje postavljati `app.practice_id`, čime se RESTRICTIVE politika iz `02` §17.6
aktivira automatski. **Isto važi za politike iz `02` §17.2 i §17.4 nakon D-051**: paket `002` je
njihov konačni vlasnik, a paket `013` ih **ne smije rekreirati, zamijeniti ni prepisati**.

Brojevi migration paketa u `02` §22 su **redoslijed zavisnosti, ne brojevi faza**. Paket
`013_rls_policies` već posjeduje ove objekte — ne uvodi se novi broj paketa i ne mijenja se
postojeća numeracija.

## 6.3 Scope

- `app_security` schema;
- `app_security.set_user_context(p_user_id uuid)`;
- `app_security.set_request_context(p_practice_id uuid)` — **SECURITY INVOKER**;
- fiksiran `search_path` na obje funkcije;
- execute grants za `copilot_app`;
- `ENABLE` i `FORCE RLS` na `practice_memberships`;
- user-scoped bootstrap self-select politika na `practice_memberships`;
- `ENABLE` i `FORCE RLS` te tenant politika `practice_id = app.practice_id` na
  `practice_settings`, uz **devetokolonski `SELECT`** i **devetokolonski `UPDATE` — grant i
  politika se uvode zajedno** (D-049, klauzula 5; D-053, dijelovi A i B; `02` §18.1, §20.2b.1,
  §22.13);
- `GET` i `PATCH /practices/{practiceId}/settings`, sa **zamrznutom osmopoljnom reprezentacijom**,
  `ETag`, `If-Match`, `428 PRECONDITION_REQUIRED`, `409 VERSION_CONFLICT` i **jednim atomičnim
  `UPDATE`-om** koji inkrementira `version` (D-049, klauzula 5; D-053, dijelovi A i B; `03` §10);
- **adaptacija `GET /me` uslovnog reada pod `practice_settings` RLS-om** — `02` §17.1a; `03` §10
  (D-053, dio D);
- generalizovani tenant endpoint authorization/enforcement pipeline (§6.4.1);
- PracticeContext guard — **kao semantička faza** tenant admisije i uspostave konteksta, ne
  obavezno NestJS `CanActivate` (D-054, klauzule 2–4);
- **tenant database granica** — jedan `PrismaService`, **jedna** pinovana interaktivna transakcija,
  `set_request_context` unutar te iste transakcije, **nijedan** caller-supplied identitet i
  **nijedna** druga, ugniježdena ni paralelna transakcija. To je **obavezan** sadržaj faze 4.
  **Konkretna klasa `TenantDatabaseService` NIJE deliverable ove faze** — koncept ostaje kanonski,
  ali je konkretan facade **uslovno odgođen** (`EXPLICITLY_DEFERRED`, D-056, dio A) i postaje
  obavezan tek kada ga stvarni tenant business repozitorij/modul zatraži, uz ponovni dokaz D-054,
  klauzula 6–10;
- RLS policy za postojeće tenant tabele;
- force RLS;
- **eksplicitno proširenje D-048 allowliste** na `practice_memberships` i `practice_settings` —
  `02` §23.4.4a (D-052, dio B);
- integration testovi;
- negative testovi.

**`practice_settings` je tenant tabela na kojoj se RLS pattern ove faze primjenjuje u punom obimu**
(D-049, klauzula 5), zajedno sa oba settings endpointa. Ako patient/encounter tabele još ne postoje,
obavezno uspostaviti pattern i test harness koji će se proširiti u fazi 5.

**Tačne runtime površine `practice_settings` (D-053, dijelovi A i B; `02` §20.2b.1).** Formulacija
„prošireni `SELECT`" iz ranijih restatementa je **zamijenjena prebrojanim listama**:

```text
SELECT (9): practice_id, billing_review_required, allow_mpa_approval,
            allow_billing_specialist_approval, require_reason_for_manual_change,
            ai_enabled, axenita_export_enabled, retention_policy_code, version

UPDATE (9): billing_review_required, allow_mpa_approval,
            allow_billing_specialist_approval, require_reason_for_manual_change,
            ai_enabled, axenita_export_enabled, retention_policy_code,
            version, updated_at
```

- **nema table-level `SELECT` ni table-level `UPDATE`**; nema `INSERT` i nema `DELETE`;
- nečitljivo ostaje: `id`, `configuration`, `updated_at`, `updated_by`;
- bez `UPDATE`-a ostaje: `practice_id`, `id`, `configuration`, `updated_by`;
- **`updated_by` se ne piše** i **nije autoritativno audit polje** — akterstvo ostaje u kanonskom
  audit modelu; **nijedan novi triger se ne uvodi** i paket `014_immutability_triggers` se **ne
  dira**;
- `updated_at` postavlja **baza**; `version` dolazi isključivo iz `If-Match`; API pozivalac ne šalje
  nijedno od to troje;
- runtime `UPDATE (version)` je **prihvaćen minimalan mehanizam**; `SECURITY DEFINER`, privilegovana
  helper funkcija, triger i novi migration paket se **ne uvode**;
- trokolonska površina faze 3 je **strogi podskup** — **nijedan grant se ne opoziva**.

**Adaptacija `GET /me` (D-053, dio D; `02` §17.1a).** Uvođenje tenant politike nad
`practice_settings` bi bez adaptacije **tiho oborilo** uslovne permisije u zamrznutom `/me`
odgovoru: `/me` je neutralna ruta bez `app.practice_id`, pa politika vraća nula redova i resolver
pada fail-closed. **Politika se ne slabi.** Faza 4 adaptira interni put: sva ne-tenant-scoped
čitanja se završavaju prije prvog konteksta; neaktivan membership ne dobija kontekst i ostaje
`permissions = []`; za aktivan membership kojem uslovne postavke trebaju, kontekst se uspostavlja
**po membershipu** kroz `set_request_context` (`02` §16.2.3), a practice identifikator dolazi
**isključivo iz razriješenog membership reda**. `X-Practice-ID` se na `/me` **ne uvodi**.

**`02` §17.2 i §17.4 nisu u obuhvatu ove faze.** Premješteni su u paket
`002_identity_and_practices` i Fazu 3 (D-051). Faza 4 ih smije verifikovati i koristiti, ali ih
**ne smije rekreirati, zamijeniti ni prepisati**. Isto već važi za `02` §17.5 i §17.6 (D-047).

**`review_decision_change_links` nije u obuhvatu ove faze (D-052, klauzule A.1–A.9).** Tabelu
kreira paket `009_review_approvals` u **Fazi 10** (`02` §22.9), pa u Fazi 4 **ne postoji**. Faza 4
je **ne kreira** i nad njom **ne izvršava** `ENABLE`, `FORCE`, tenant politiku ni ijedan grant.
Vlasništvo tog RLS slicea ostaje paket `013_rls_policies`, ali se **izvršava u Fazi 10**,
neposredno nakon paketa `009` — vidi §12.3, aktivnost 14. Sigurnosni zahtjevi iz D-046, klauzula
25–33, **ostaju nepromijenjeni**; odgođena je isključivo tačka izvršenja, i **nijedan broj paketa
se ne uvodi ni renumeriše**.

**Generički obrazac ostaje u ovoj fazi.** Faza 4 i dalje uspostavlja generički tenant RLS obrazac i
test harness koji kasnije faze — uključujući odgođeni slice Faze 10 — samo proširuju (D-052,
klauzula A.8).

**Proširenje D-048 allowliste (D-052, dio B).** Ova faza prvi put uvodi `FORCE RLS` nad
`practice_memberships` i `practice_settings`, a pouzdani seed put upisuje u obje. Allowlist
maintenance protokola se zato **eksplicitno proširuje** tačno tim dvjema tabelama (`02` §23.4.4a).
Proširenje mora biti eksplicitno; `FORCE RLS` se obnavlja nakon seeda i na putevima
neuspjeha/rollbacka; `BYPASSRLS`, `SECURITY DEFINER` zaobilaznica, superuser runtime put,
`DISABLE ROW LEVEL SECURITY` i trajna owner-write politika ostaju **zabranjeni**. **Tiho
proširenje obara phase gate** (`08` §26.2).

`practice_memberships` je izuzetak: ona dobija **bootstrap politiku vezanu za `app.user_id`**, ne standardni tenant predikat `practice_id = app.practice_id`. Standardni predikat bi bio cikličan, jer se ta tabela čita upravo da bi se tenant context uopšte mogao postaviti (§6.2.2).

## 6.4 Aktivnosti

Redoslijed prati §6.2.1.

1. `set_user_context(p_user_id uuid)` — uspostavlja `app.user_id`;
2. user-scoped bootstrap politika na `practice_memberships`;
3. `set_request_context(p_practice_id uuid)` kao **SECURITY INVOKER**, bez `user_id`
   parametra;
4. siguran, fiksiran search path na obje funkcije;
5. membership validacija kroz bootstrap politiku, prije postavljanja tenant konteksta;
6. transaction context — `app.practice_id` tek nakon uspješne validacije;
7. `ENABLE` + `FORCE RLS`, tenant politika, prošireni `SELECT` i **ograničen `UPDATE`** nad
   `practice_settings`, te oba settings endpointa (D-049); politika §17.4 se **ne** kreira ovdje —
   ona je već konačna u paketu `002` (D-051);
8. effective-permission resolver koji komponuje permisije iz dodijeljenih tenant rola;
9. guard čita `X-Practice-ID` i tretira ga kao **nepouzdan** dok validacija ne uspije;
10. request context decorator;
11. RLS helper migration;
12. test practice A/B;
13. test no context;
14. test inactive membership;
15. test membershipa bez ijedne role;
16. test runtime owner/bypass.

Politika nad `practice_membership_roles` mora:

- biti upotrebljiva **prije** nego što `app.practice_id` postoji;
- izvoditi korisnika iz pouzdanog `app.user_id`;
- spajati se kroz **vlasnički `practice_memberships` red**;
- izlagati **isključivo** role vlastitih membershipa autentifikovanog korisnika;
- dozvoliti enumeraciju **neaktivnih** membershipa i njihovih trenutnih role redova;
- **nikada** ne učiniti da neaktivan membership autorizuje tenant pristup;
- **ne izlagati** dodjele rola drugog korisnika;
- **ne dozvoljavati** izmjenu rola — politika je SELECT-only;
- **ne zahtijevati SECURITY DEFINER** i ostati SECURITY INVOKER kompatibilna;
- **ne biti tretirana kao rješenje D-OPEN-011** — taj model je zasebno riješen odlukom D-047 kroz
  `02` §17.5 i §17.6, a ova politika ostaje ograničena na vlastite role redove.

Normalna tenant autorizacija i dalje zahtijeva **aktivan, odabrani** membership.

### 6.4.1 Effective-permission resolver

Normativni izvor: D-038 i `03` §28.5.

- **unija** grantova svih tenant rola dodijeljenih odabranom **aktivnom** membershipu;
- unija je ograničena na **jednu ordinaciju** i **jedan membership**;
- `DENY` **ne doprinosi** grant;
- `DENY` **ne poništava** `ALLOW` druge dodijeljene tenant role;
- **nema implicitnog nasljeđivanja rola**;
- **nema per-user permission overrida**;
- **neaktivan membership** ne daje nijednu permisiju;
- **aktivan membership sa nula rola** ne daje nijednu permisiju;
- autorizacija je **deny-by-default**;
- uslovna permisija zahtijeva **oboje**: podobnu rolu **i** prihvaćeni practice flag ili
  runtime uslov (`allowMpaApproval`, `allowBillingSpecialistApproval`).

Dodatna pravila kompozicije:

- **duplirani grant iz dvije role kolabira u jednu** efektivnu permisiju;
- **caller-supplied rola se nikada ne prihvata**;
- `platformRoles` su **isključeni** iz tenant kompozicije;
- **deny-by-default** važi kada nijedna dodijeljena rola ne daje traženu permisiju.

#### Reprezentacija matrice

Implementacija predstavlja **tačno 32 prihvaćena reda** iz `15_ROLE_PERMISSION_MATRIX_V1.md`.
Matrica se **ne prepisuje ručno** u kod iz proze; izvor je `15`, a izvorne odluke su D-023,
D-032 i D-039 do D-045.

Svaka ćelija podržava **tačno četiri** stanja:

| Stanje | Semantika u implementaciji |
|---|---|
| `ALLOW` | rola doprinosi permisiju efektivnom skupu |
| `DENY` | rola ne doprinosi grant; **nije negativni override** nad `ALLOW` druge dodijeljene role |
| `CONDITIONAL` | doprinosi **samo** kada je rola dodijeljena, membership aktivan, prihvaćeni practice flag uključen i svi uslovi endpointa zadovoljeni |
| ~~`BLOCKED — D-OPEN-011`~~ | **povučena vrijednost** — nijedna ćelija matrice je više ne nosi. D-OPEN-011 je riješen odlukom D-047, a `practice.read` ima eksplicitne dodjele (`15` §5). Nova ćelija se **ne smije** označiti ovom vrijednošću |

#### Mehanička validacija matrice

Obavezna provjera pri startupu, build-u ili u testovima — neuspjeh je **defekt**, ne upozorenje:

- svih **32 aktivne** permisije pojavljuju se **tačno jednom**;
- **nijedna rezervisana** permisija (`analysis.run_tariff`, `configuration.manage`,
  `integration.manage`) nije aktivan red matrice;
- svaka rola u matrici je **poznata** — šest tenant rola i `SYSTEM_ADMIN`;
- svaki `Source` se prati do **prihvaćenog ADR-a**;
- **nijedno nepoznato stanje ćelije** se ne prihvata;
- rezervisana permisija referencirana u runtimeu **pada zatvoreno** dok ne postoji budući
  prihvaćeni ADR.

#### 6.4.1.1 Uslovno odobravanje i opoziv

Normativno: D-041; `03` §10 i §20; matrica u `15`.

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `analysis.approve` | DENY | ALLOW | CONDITIONAL | CONDITIONAL | DENY | DENY | DENY |
| `analysis.approval.revoke` | DENY | ALLOW | CONDITIONAL | CONDITIONAL | DENY | DENY | DENY |

- `MPA` uslov: `allow_mpa_approval = true`;
- `BILLING_SPECIALIST` uslov: `allow_billing_specialist_approval = true`;
- **podobnost opoziva je identična podobnosti odobravanja.**

Implementacija opoziva mora sprovesti:

- **opozivalac ne mora biti originalni odobravatelj**;
- podobnost se evaluira **u trenutku opoziva**;
- `reason` je **obavezan**;
- dokaz odobrenja se **nikada ne briše**;
- immutable approval historija ostaje;
- **revocation audit event je obavezan**.

**Ne kreirati:** permisiju vezanu isključivo za originalnog odobravatelja; novi flag; novi
endpoint; novu rolu.

**Vlasništvo faza — D-058 (2026-08-20).** Ova subsekcija nosi **dvije klase obaveza** i one nemaju
istog vlasnika faze:

```text
matrica, uslovni flagovi, kompozicija (D-041, kl. 1-5 i 12)  -> Faza 4   (implementirano i dokazano)
sest pravila opoziva iznad (D-041, kl. 6-11)                 -> Faza 10  (§12.2, §12.3 akt. 10, §12.4)
```

Šest pravila iz „Implementacija opoziva mora sprovesti" zahtijeva tabelu `analysis_approvals`, koju
kreira paket `009_review_approvals` **u Fazi 10** (`02` §22.9; §12.3, aktivnost 13), pa ih Faza 4
**ne može izvršiti ni dokazati**. Odlukom **D-058** su, po precedentu **D-052, A.7**, premještena u
Fazu 10 uz **doslovno očuvan tekst** — `05`, Faza 10, „Opoziv odobrenja — preuzeto iz Faze 4
(D-058)". **Nijedno pravilo nije uklonjeno, oslabljeno ni označeno završenim**, a **D-041 se ne
mijenja**: premješta se izvršna i dokazna tačka, ne norma.

**Faza 4 zadržava sve preduslove** — uslovne ćelije, pravilo „flag bez podobne role ne daje
permisiju", pravilo „rola bez uključenog flaga je odbijena", odbijanje **neaktivnog membershipa** i
guard ishod **`403` pri isključenom flagu** (D-058, klauzule 2 i 5).

#### 6.4.1.2 Prihvaćene dodjele sa najvećim rizikom

Normativni izvor je `15`; ova lista je podsjetnik, ne druga matrica.

| Permisija | Prihvaćene role |
|---|---|
| `integration.read` | `PRACTICE_ADMIN` only |
| `tariff.manage` | `SYSTEM_ADMIN` only (platform) |
| `tariff.raw_result.read` | `PRACTICE_ADMIN` only |
| `audit.read` | `PRACTICE_ADMIN` + `AUDITOR` |
| `audit.export` | `PRACTICE_ADMIN` + `AUDITOR` |
| `encounter.close` | `PRACTICE_ADMIN` + `PHYSICIAN` + `BILLING_SPECIALIST` |
| `analysis.review_decision` | `PHYSICIAN` + `BILLING_SPECIALIST` |
| `analysis.export` | `PHYSICIAN` + `BILLING_SPECIALIST` |
| `analysis.export.read` | `PHYSICIAN` + `BILLING_SPECIALIST` |
| `finding.resolve` | `PHYSICIAN` only |
| `encounter.cancel` | `PHYSICIAN` only |
| `analysis.cancel` | `PHYSICIAN` + `MPA` |
| `encounter.document.archive` | `PHYSICIAN` only |

**Zastarjeli nagovještaji koji se ne smiju pojaviti u implementaciji:**

- odobravanje kroz `PRACTICE_ADMIN` samu po sebi;
- `tariff.raw_result.read` za `AUDITOR`;
- bilo kakav tenant pristup za `SYSTEM_ADMIN` kroz platform rolu;
- bilo kakav pristup za `READ_ONLY` u v1.

Baseline workflow redovi — `patient_reference.read`, `patient_reference.create`,
`encounter.read`, `encounter.create`, `encounter.update`, `encounter.document.list`,
`encounter.document.read`, `encounter.document.create`, `analysis.read` i `analysis.run` —
implementiraju se i testiraju **tačno prema `15`** (D-039). Širi pristup se **ne izvodi iz
naziva role**.

### 6.4.2 Razdvajanje platform i database rola

- `SYSTEM_ADMIN` je **platform aplikacijska rola**;
- `copilot_system` je **database rola** — to su različite stvari i ne smiju se miješati;
- `platformRoles` **nisu** tenant role i **nikada** se ne spajaju unijom sa tenant rolama;
- `SYSTEM_ADMIN` **bez** aktivnog tenant membershipa dobija `403` na tenant rutama;
- `SYSTEM_ADMIN` **sa** membershipom izvodi tenant permisije isključivo iz dodijeljenih
  tenant rola tog membershipa;
- `tariff.manage` ostaje **platform** permisija i platform ruta (`03` §24);
- `integration.read` ostaje tenant-scoped i ograničen na `PRACTICE_ADMIN` (D-032; `03` §28.4;
  `15` §5);
- **database role se nikada ne pojavljuju kao kolone aplikacijske matrice**;
- **database grant nikada ne zadovoljava permisiju endpointa.**

Grants prema `02` §20.2:

- `copilot_migrator` je owner i kreira schema objekte kroz migracije;
- `copilot_app` dobija **isključivo prihvaćeni runtime pristup**, uključujući RLS-zaštićeni
  bootstrap SELECT nad `practice_membership_roles`;
- `copilot_app` **ne dobija** generičke role-administration grantove;
- `copilot_system` **ne dobija** nijedan grant nad tenant tabelama;
- `PUBLIC` **ne dobija** nijedan grant.

Database grant **nikada ne zamjenjuje** permisiju endpointa.

### 6.4.3 Endpoint authorization guards

Za **svaki** endpoint:

- **tražena permisija** dolazi iz `03`;
- **podobnost role** dolazi iz `15`;
- guard **ne smije hard-kodirati alternativnu listu rola** koja može odlutati od matrice;
- autorizacija endpointa **mora ići kroz effective-permission resolver** (§6.4.1);
- uslovi se evaluiraju **tek nakon** provjere aktivnog membershipa i učitavanja rola;
- **RLS je drugi sloj zaštite, nikada zamjena** za provjeru permisije na endpointu.

Obavezni negativni testovi — direktan pristup endpointu pada kada:

- tražena permisija nedostaje;
- membership je neaktivan;
- membership nema nijednu rolu;
- prisutan je samo `SYSTEM_ADMIN`, a ruta je tenant ruta;
- pozivalac sam dostavi rolu;
- practice flag za uslovnu permisiju je isključen;
- potrebna rola postoji, ali **u drugoj ordinaciji**.

## 6.5 Acceptance

- A ne vidi B;
- B ne vidi A;
- bez contexta 0 row/default deny;
- invalid membership ne može setovati context;
- context se ne prenosi na drugi pooled request;
- tenant pristup se izvršava **isključivo** kroz prihvaćenu tenant database granicu — jedna
  pinovana interaktivna transakcija sa tenant kontekstom uspostavljenim u njoj; **ako u fazi
  postoji stvarni tenant business repozitorij, on tu granicu koristi kroz konkretan
  `TenantDatabaseService` facade**, koji tada mora zadovoljiti D-054, klauzule 6–10. Dok takav
  repozitorij ne postoji, konkretan facade je **uslovno odgođen** i **nije** kriterij
  prihvatanja ove faze (D-056, dio A);
- test dokazuje istu transakciju.

Obavezni D-033 testovi:

- aktivan membership uspostavlja tenant context;
- membership koji ne postoji vraća `403`;
- neaktivan membership vraća `403`;
- pozivalac ne može impersonirati drugog korisnika kroz parametar funkcije;
- `X-Practice-ID` sam po sebi ne može odabrati tenant;
- tenant-scoped upit prije bootstrapa pada;
- SECURITY INVOKER ne zaobilazi membership RLS;
- neuspjeh bootstrapa ne ostavlja tenant context;
- transakcijski lokalni kontekst nestaje na kraju transakcije;
- pooled konekcija ne nasljeđuje kontekst prethodnog requesta;
- `platformRoles` ne kreiraju tenant membership;
- opšti runtime pristup nad `users` i `practices` **ne postoji** — negativni testovi iz `02`
  §25.1.1 i `08` §21.5 to potvrđuju (D-047);
- politika nad `practices` daje **identičan** rezultat prije i nakon uvođenja §17.3 — regresijski
  test granice faze 3 prema fazi 4;
- nakon §17.3 `copilot_app` više **ne vidi** generičke `practice_memberships` redove, čime se
  zatvara međustanje faze 3 (D-047, klauzula 18);
- politike iz `02` §17.2 i §17.4 su **nepromijenjene** i **nisu rekreirane** u paketu `013` —
  introspekcija vlasništva (D-051, klauzula 6);
- nakon uvođenja `practice_settings` tenant RLS-a zatvorena je izloženost
  `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` — `copilot_app` više ne vidi
  redove izvan tekućeg tenanta (D-049, klauzula 5);
- `practice_settings` `UPDATE` grant postoji **isključivo zajedno** sa tenant politikom koja ga
  ograničava; grant bez politike obara phase gate (D-049, klauzula 5);
- optimistic-locking ugovor za `practice_settings` — `ETag`, `If-Match`, `428`,
  `409 VERSION_CONFLICT`, atomičan inkrement `version` — testira se **u ovoj fazi** (`08` §10);
- `practice_settings` ima **tačno devet** `SELECT` i **tačno devet** `UPDATE` kolona; `SELECT *`,
  te `SELECT`/`UPDATE` nad nedozvoljenom kolonom padaju sa `42501`, uključujući upotrebu isključivo
  u `WHERE` ili `ORDER BY` (D-053; `02` §20.4, §25.1.3a);
- `updated_by` je **nepromijenjen** nakon uspješnog `PATCH`-a, a `version` se **ne pojavljuje** kao
  polje ni u zahtjevu ni u odgovoru (D-053, klauzule A.2 i B.3);
- **`GET /me` ne regresira** nakon uvođenja `practice_settings` RLS-a — iste kanonske fixture daju
  iste `memberships[].permissions` prije i nakon, uslovno ponašanje `MPA` i `BILLING_SPECIALIST` je
  tačno za oba stanja oba flaga, neaktivan membership ostaje `permissions = []`, multi-practice
  membership koristi postavke svoje ordinacije, `practiceName` je prisutan za svaki membership,
  tenant kontekst ne curi nakon transakcije i nijedan klijentski poslan practice identifikator ne
  učestvuje (D-053, klauzula D.12; `08` §21.7.6).

Obavezni D-038 fixture i testovi:

- membership sa **nula** rola;
- membership sa **jednom** rolom;
- membership sa **više** rola;
- dupla dodjela iste role je odbijena;
- dodjela preko granice ordinacije je odbijena na composite FK-u;
- neaktivan membership ima **vidljive** role, ali **ne autorizuje** nijednu operaciju;
- enumeracija rola je ograničena na autentifikovanog korisnika;
- `roles[]` ima **determinističan redoslijed**;
- unija tenant rola daje očekivani skup permisija;
- `DENY` u jednoj roli **ne poništava** `ALLOW` iz druge;
- `platformRoles` su isključeni iz unije;
- `SYSTEM_ADMIN` bez aktivnog membershipa je odbijen;
- uslovno odobravanje zahtijeva **i** podobnu rolu **i** practice flag;
- kontekst i dodijeljene role ne cure kroz pooled konekciju;
- rollback bootstrapa čisti i kontekst i učitane role.

Obavezni fixture za matricu iz `15`:

- aktivan membership sa **nula** rola;
- membership sa **jednom** rolom;
- membership sa **više** rola;
- neaktivan membership koji **zadržava** role redove;
- **isti korisnik sa različitim rolama u dvije ordinacije**;
- `PRACTICE_ADMIN` **+** `PHYSICIAN`;
- `PRACTICE_ADMIN` **bez** `PHYSICIAN`;
- `AUDITOR`;
- `READ_ONLY`;
- `SYSTEM_ADMIN` **bez** tenant membershipa;
- `SYSTEM_ADMIN` **sa** zasebnim tenant membershipom;
- approval flagovi uključeni i isključeni;
- pokušaj duplirane dodjele role;
- pokušaj cross-practice dodjele role.

Fixture **ne smiju zavisiti od redoslijeda izvršavanja**.

Testovi tvrde **isključivo prihvaćene ćelije iz `15`** i ništa izvan njih.

### 6.5.1 Phase gate

Faza nije završena dok:

- `practice_memberships` nema singularnu `role` kolonu;
- `practice_membership_roles` postoji sa svim prihvaćenim constraintima;
- RLS self-enumeracijski testovi prolaze;
- `GET /me` vraća `memberships[].roles`;
- injekcija role kroz body, query, header ili argument funkcije je nemoguća;
- testovi cross-practice curenja rola prolaze;
- deny-by-default testovi za membership bez rola prolaze;
- testovi razdvajanja platform i tenant klase prolaze;
- contract testovi iz `02` §25.10 i `03` §33.5 prolaze;
- **matrica iz `15` je predstavljena tačno** — 32 aktivne i 3 rezervisane permisije;
- **svaki `Source` u matrici je prihvaćen ADR**;
- **nijedna role ćelija ne nedostaje**;
- `READ_ONLY` ima **nula** grantova;
- `SYSTEM_ADMIN` ima **isključivo** `tariff.manage`, i to na platform obuhvatu;
- `PRACTICE_ADMIN` **ne dobija** klinički pristup automatski;
- `AUDITOR` ima **isključivo** `audit.read` i `audit.export`;
- podobnost za `analysis.approve` i `analysis.approval.revoke` je **identična**;
- `encounter.close` ima **tri** prihvaćene role;
- unija rola radi;
- `DENY` **ne poništava** `ALLOW`;
- neaktivan i zero-role membership daju **nula**;
- injekcija role **pada**;
- cross-practice curenje rola **pada**;
- `GET /me` vraća `roles[]` i izvedene `permissions[]`;
- `practice.read` je implementiran tačno prema `15` §5 — `PRACTICE_ADMIN` `ALLOW`, ostalih šest
  `DENY` — i vraća projekciju **bez** `zsrNumber`, `glnNumber` i `legalName` (D-047, klauzula 11).

Faza se **ne smije** označiti završenom dok:

- bilo koja lista rola u implementaciji odstupa od `15`;
- bilo koja rezervisana permisija ima grant;
- bilo koji grant izveden iz zastarjele proze ostaje u kodu;
- je implementiran generički `users`/`practices` pristup;
- je bilo koja politika iz `02` §17.5 ili §17.6 izostavljena, oslabljena ili zamijenjena
  permissive varijantom;
- je uvedena treća `users` politika za pristup redu drugog korisnika bez prihvaćenog ADR-a;
- je uvedena nova permisija ili endpoint bez prihvaćenog ADR-a.

### 6.5.2 Granice — izvan v1 i buduće odluke

Klasifikacija je prihvaćena u D-045 i **ćutanje se ne smije čitati kao dozvola**.

**RIJEŠENO ODLUKOM D-047 (2026-08-12)** — ranije `BLOCKED — D-OPEN-011`: `practice.read` ima
eksplicitne dodjele (`15` §5); generički pristup nad `users` i nad `practices` **ne postoji**, jer
obje tabele nose `FORCE RLS` uz column-level grantove (`02` §17.5, §17.6, §20.2a); generički
cross-practice pristup je `DENY / NOT IMPLEMENTED`. Nijedna od te četiri stavke više nije blokirana
niti otvorena.

**DENY / NOT IMPLEMENTED U V1, uz imenovani gate:** pristup redu **drugog** korisnika
(`responsiblePhysician.displayName`, `approvedBy.displayName`). Obavezan gate je
`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (D-047, klauzula 12; `13` §19). Nijedan konzument
faze 5 ne smije tiho dobiti generičku vidljivost nad `users`.

**Trigger tog gatea je repointiran (D-061, klauzule 13–17).** Historijska labela ostaje **doslovno**
nepromijenjena, ali njene riječi „BEFORE PHASE 5" su oznaka **porijekla**, ne izvršni trigger. Gate
se otvara **prije implementacije prvog endpointa ili toka koji vraća `display_name` drugog
korisnika**:

- **Faza 5 nije više takav konzument.** `GET /encounters` (`03` §12) vraća `responsiblePhysician`
  kao **samo `{ id }`**; ključ `displayName` je **odsutan**, ne `null`. Faza 5 tako gate **prolazi
  izostavljanjem**, bez ijednog proširenja pristupa.
- **Tekući prvi poznati konzument je `GET /analyses/{analysisId}/workspace`** (`03` §15), čiji
  obuhvat pripada **Fazi 8** (§10.3, red „workspace endpoint") — ili bilo koji **raniji** konzument
  koji stekne takav prihvaćen zahtjev, **šta prije nastupi**.
- **`approvedBy.displayName`** u odgovoru kreiranja odobrenja (Faza 10) **nije** co-member trigger —
  odobravatelj je sam pozivalac. Uslovno: **read-back tuđeg odobrenja jeste** trigger.

**Temeljni problem pristupa co-member identitetu ostaje OTVOREN i NEIMPLEMENTIRAN.** D-061 ga **ne
rješava** — uklanja mu konzumenta u Fazi 5 i pomjera trenutak rješavanja. Zabrane iz `13` §19.4
važe **nepromijenjeno i prošireno**: nema treće `users` politike; nema proširenja `users` granta;
nema proširenja `practice_memberships` RLS-a ni granta; nema denormalizacije; nema `SECURITY
DEFINER` lookupa; nema četvrte database role; nema drugog Prisma klijenta; nema zamjenskog
identifikatora.

**OUT OF V1:** kreiranje, deaktivacija i administracija membershipa; dodjela i uklanjanje rola;
generička runtime administracija rola; cross-practice support pristup; otkazivanje export joba.

**REQUIRES NEW PERMISSION AND ADR:** generička platform administracija izvan `tariff.manage`;
`AUDITOR` discovery/listing putanja; podjela `analysis.review_decision`; podjela
`analysis.export.read`; finija permisija za rješavanje findinga.

**RESERVED:** `analysis.run_tariff`; `configuration.manage`; `integration.manage` — bez grantova,
bez aktivnog endpointa.

Audit se zahtijeva za: odobravanje; opoziv odobrenja; kreiranje exporta; pristup export artefaktu;
pristup sirovom tarifnom rezultatu; audit export; otkazivanje; te odbijene osjetljive autorizacije
gdje je već specificirano. **Audit dodjele i uklanjanja role ostaje BLOCKED** dok ne postoji
prihvaćen mutation put; runtime role-administration endpoint se **ne izmišlja**.

**D-OPEN-011 je riješen odlukom D-047.** Autentifikovana self-enumeracija vlastitih membership
rola i dalje **nije** generički pristup nad `users`, **nije** generički pristup nad `practices`,
**nije** role administration i **nije** cross-practice administracija — ta tvrdnja ostaje tačna i
nakon D-047, jer je access model riješen zasebnim politikama iz `02` §17.5 i §17.6, a ne
proširenjem ove enumeracije. Generički `users`/`practices` pristup i dalje ne postoji ni u jednom
obliku.

## 6.6 Commit

```text
feat(security): enforce tenant isolation with transactional RLS context
```

---

# 7. Faza 5 — Patient reference, encounter i dokumenti

## 7.1 Branch

```text
backend/05-encounters-documents
```

**Stanje izvršenja (2026-08-23).** Slice `P5-I1` je izveden na **slice-skopiranoj** grani
`feat/p5-i1-schema-foundation`, nezavisno reviewovan i **objavljen kroz PR #30** — **merged** u
kanonski `main`, merge SHA `fcd88fbef6c398ae7f0404eb54edb8f7f8175634`. Ovo je zapis činjenice;
prescripcija fazne grane iznad se **ne mijenja**. Dokazni blok je `05`, Faza 5, `Slice P5-I1`.

**Stanje izvršenja pod-gatea `P5-I2A` (2026-08-24).** Strukturni pod-gate `P5-I2A` je izveden na
**slice-skopiranoj** grani `feat/p5-i2a-package011-structure`, nezavisno reviewovan i **objavljen
kroz PR #33** — **merged** u kanonski `main`, merge SHA
`2e606ed3690653ecaef9126ffb8b9fb67e9354b3`. Ovo je zapis činjenice; prescripcija fazne grane iznad
se **ne mijenja**. Dokazni blok je `05`, Faza 5, `Slice P5-I2A`.

## 7.2 Scope baze

- patient_references;
- encounters;
- encounter_diagnoses;
- storage_objects;
- encounter_documents;
- composite FK;
- RLS;
- indeksi.

**Objavljeni obuhvat (D-062, `02` §29).** Paket `003_patient_encounter_documents` kreira i **pet
enuma** (`integration_provider`, `encounter_status`, `review_state`, `document_type`,
`document_source`), **osam FK-ova sa eksplicitnim `NO ACTION`/`NO ACTION`**, **tri nova `CHECK`-a**
nad statusnim rječnicima i **četiri indeksa**. **Ne izdaje nijedan `GRANT` i ne uvodi nijedan RLS
objekat** — to radi Faza-5 slice paketa `013`, atomično sa politikom.

Uz to Faza 5 izvršava **Faza-5 slice paketa `011`** koji kreira **isključivo `idempotency_keys` i
`audit_events`**, te **Faza-5 slice paketa `014`** sa AAD funkcijom i **tri** trigera.

**Tačka izvršenja — korigovano (D-063, klauzule 1–5).** Paket `003` nastaje u slice-u **`P5-I1`**.
**Faza-5 slice paketa `011` NIJE u `P5-I1`** — izvršava se u **`P5-I2`**, zajedno sa Faza-5 slice-om
paketa `013` i `014`, jer njegovo **strukturno** i **sigurnosno** izvršenje mora biti razriješeno
istovremeno. **Redoslijed migracijskih fajlova se ne mijenja** (`003` → `011`-slice → `013`-slice →
`014`-slice), niti se mijenja vlasništvo paketa. `P5-I2` mora, prije izvršenja, za **svaku** od
`idempotency_keys` i `audit_events` eksplicitno nabrojati paket koji je kreira, redoslijed, `ENABLE`
i `FORCE RLS`, tačna tijela politika, tačne runtime grantove, **negativne** grantove, tenant
predikat i katalog tvrdnje. **Nijedna runtime rola ne smije dobiti `SELECT`, `INSERT` ni `UPDATE`
nad tim tabelama prije nego što je njena ograničavajuća tenant politika na snazi; runtime
čitljivost `audit_events` preko granica ordinacija je kategorički zabranjena.**

**Objavljena sigurnosna granica `P5-I2` (D-064).** Enumeracija koju D-063, klauzula 4, traži je
objavljena: **Faza-5 slice paketa `013` je isključivi vlasnik** grantova, `ENABLE`/`FORCE RLS`-a
i politika za **svih sedam** tenant tabela `P5-I2`; **Faza-5 slice paketa `011` kreira isključivo
strukturne objekte** (dvije tabele, **dva** `practices` FK-a, **oba** audit indeksa), i njegovo
međustanje ima **nula grantova, nula politika, `relrowsecurity = false`,
`relforcerowsecurity = false`** — dakle **nula runtime sposobnosti**. Runtime grantovi:
`idempotency_keys` = `SELECT` + `INSERT` + **column-level** `UPDATE` nad `response_status`,
`response_body`, `locked_at`, `completed_at`; `audit_events` = **samo** `SELECT` + `INSERT`.
`copilot_system` i `PUBLIC` = **nula** nad obje. Tačan katalog: `02` §29.4a, §29.9, §29.10.

**Puni post-`P5-I2` katalog je 13 tabela sa `ENABLE` + `FORCE` i 25 politika** (10 Faza-3/4 + 10
PHI + 3 `idempotency_keys` + 2 `audit_events`), a kanonski lanac migracija tada sadrži **tačno
sedam** direktorija (`001`, `002`, `013` Faza-4, `003`, `011_phase5`, `013_phase5`,
`014_phase5`). **`P5-I2B` uvodi tačno 15 novih politika.** **Ranije objavljeni `18 / 11` i
`23` se ne smiju koristiti kao exit tvrdnja `P5-I2`**: `18 / 11` je PHI-only podzbir (D-064,
`OD-6`), a total `23` je **superseded D-065, `RULING 1`** — PHI član je bio `8` umjesto stvarnih
`10` imenovanih politika iz `02` §29.4. **Mjerodavan je imenovani katalog `02` §29.4 / §29.4a;
nijedno ime politike se ne uklanja radi starog zbira** (D-064, `OD-8`, ostaje na snazi).

**Zatečeno kanonsko stanje (2026-08-25; D-066).** Katalog **13 tabela `true`/`true` i 25
politika je ispunjen i kanonski** — uveo ga je `P5-I2B` (PR #36). **Lanac migracija ima šest
primijenjenih direktorija**; sedmi, `014_phase5`, pripada **`P5-I2C`** i **nije implementiran ni
autorizovan**.

**AŽURIRANJE STATUSA (D-067, 2026-08-26) — pasus iznad se ne prepisuje.** Rečenica „**Lanac
migracija ima šest primijenjenih direktorija**; sedmi, `014_phase5`, pripada **`P5-I2C`** i
**nije implementiran ni autorizovan**" je **tačna na dan svog zapisa** i **više ne opisuje tekuće
stanje**. **Faza-5 slice paketa `014` je implementiran, auditiran i kanonski** (`P5-I2C`,
**PR #38**, merge SHA `46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee`; migracija
`20260825214248_014_immutability_triggers_phase5`). **Zatečeni tačan broj primijenjenih
migracijskih direktorija = 7**, i **nijedna Faza-5 migracija ne preostaje** — očekivani konačan
broj iz D-064, `OD-8`, je **dostignut**. **Katalog `13` tabela i `25` politika se time NE
mijenja**: paket `014` ne izdaje nijedan `GRANT`, nijedan table-level `REVOKE`, nijednu RLS
zastavicu i nijednu politiku (`02` §22.14, §29.4a).

**Transakcijski mehanizam (D-065, `RULING 2`).** Faza-5 slice paketa `013` je **jedna** migracija
sa **tačno jednom eksplicitnom `BEGIN` / `COMMIT` transakcijskom granicom najvišeg nivoa**;
`REVOKE`, `GRANT`, `ENABLE RLS`, `FORCE RLS` i `CREATE POLICY` za **svih sedam** tabela idu
**unutar te iste transakcije**, **bez međukoraka `COMMIT`** i **bez transakcijski prekidajućeg
iskaza**. **Atomičnost se ne smije oslanjati na pretpostavku da Prisma implicitno omotava
`migration.sql` u transakciju** — tačan ugovor: `02` §29.4a.0.

**`storage_objects` nema pisca u Fazi 5** — upload putanja je `DEFERRED` (`03` §13.2). Tabela se
kreira jer je FK roditelj, drži **nula redova**, i **ne dobija nijedan grant ni politiku**.

## 7.3 Scope API-ja

```text
POST /patient-references
GET  /patient-references/{id}

POST /encounters
GET  /encounters
GET  /encounters/{id}
PATCH /encounters/{id}
POST /encounters/{id}/cancel

POST /encounters/{id}/documents/text
GET  /encounters/{id}/documents
GET  /encounters/{id}/documents/{documentId}
POST /encounters/{id}/documents/{documentId}/archive
```

## 7.4 Cross-cutting

- idempotency;
- optimistic locking;
- state machine;
- encryption abstraction;
- hash;
- audit;
- idempotency i audit prerequisite tabele.

**Ratifikovano (D-062, `OD-P5-D2-1`).** Faza 5 kreira **isključivo `idempotency_keys` i
`audit_events`**, kroz Faza-5 slice paketa `011_jobs_idempotency_outbox_audit`. **`outbox_events` i
`async_jobs` se u Fazi 5 NE kreiraju** — nemaju konzumenta Faze 5, a tabela se ne uvodi prije svog
konzumenta. Raniji tekst ovog odjeljka je preporučivao "minimalni `outbox_events`"; ta preporuka je
**zamijenjena** ratifikovanom odlukom.

**Tačka izvršenja (D-063, klauzula 3):** taj slice se izvršava u **`P5-I2`**, ne u `P5-I1`. Vidi
§7.2 i D-063, klauzule 1–5.

## 7.5 Aktivnosti

1. schema/migration;
2. composite FK;
3. RLS policies;
4. DTO;
5. repositories;
6. state machine;
7. HMAC/pseudonym service;
8. encryption service interface + local implementation;
9. text normalization;
10. redaction mock/basic rule;
11. audit events;
12. idempotency service;
13. ETag/If-Match;
14. e2e.

### Objavljena sekvenca slice-ova (D-062, Dio L)

Aktivnosti iznad grupišu se u **osam slice-ova**. **Nijedan se ovim planom ne autorizuje** —
autorizaciju daje zaseban gate `P5-I0`, i on autorizuje **isključivo `P5-I1`**.

| Slice | Obuhvat | Zavisi od |
|---|---|---|
| `P5-I1` | **Prisma modeli i paket `003`**, plus schema/katalog testovi paketa `003`. **Bez paketa `011`, `013` i `014`; bez granta, `REVOKE`-a, RLS zastavice, politike, trigera i servisa** (D-063, klauzule 1–2) | gate `P5-I0` |
| `P5-I2` | **Faza-5 slice paketa `011`** (`idempotency_keys`, `audit_events`) — **odgođen iz `P5-I1` odlukom D-063** i vezan uz sigurnosnu granicu; Faza-5 slice paketa `013` i `014`; trajna negative-privilege regresija; **`★` dokaz iz §7.6a** | `P5-I1` |
| `P5-I3` | Kripto/HMAC/normalizacijski primitivi — **bez baze, paralelizabilno** | — |
| `P5-I4` | Servis i rute `patient_references` | `P5-I2`, `P5-I3` |
| `P5-I5` | **Encounter jezgro** — table-driven state machine nad svih 15 tranzicija, 4 dosežne | `P5-I2` **uključujući `★`**, `P5-I3`, `P5-I4` |
| `P5-I6` | Ručni unos dokumenta i redakcija | `P5-I3`, `P5-I5` |
| `P5-I7` | Čitanje, lista, filteri, arhiva | `P5-I5`, `P5-I6` |
| `P5-I8` | Integracijsko i sigurnosno zatvaranje Faze 5 | sve |

**Stanje slice-ova (2026-08-24).** **`P5-I1` je implementiran, nezavisno reviewovan**
(`P5_I1_V_PASS_READY_FOR_PUBLICATION`) **i kanonski** — objavljen kroz **PR #30** i merged u
kanonski `main`, merge SHA `fcd88fbef6c398ae7f0404eb54edb8f7f8175634`. **`P5-I2` je
`IN_PROGRESS` i `NOT COMPLETE`**: njegov strukturni pod-gate **`P5-I2A` je implementiran,
nezavisno reviewovan** (`P5_I2A_V_PASS_READY_FOR_PUBLICATION`) **i kanonski** — objavljen kroz
**PR #33** i merged u kanonski `main`, merge SHA
`2e606ed3690653ecaef9126ffb8b9fb67e9354b3`. **Pod-gate `P5-I2B` je takođe implementiran,
nezavisno auditiran** (`P5_I2B_I_A_PASS_READY_FOR_PUBLICATION`) **, kanonski i formalno zatvoren**
(D-066) — implementacijski commit `6efee207c9ca52a22ca2cdeb97773832931711e7`, objavljen kroz
**PR #36**, merge SHA `0e4d113f0eedddcd2db890180767768c5b422264`. **`P5-I2C` i `P5-I2V` nisu
implementirani i nisu autorizovani**, i **`P5-I2B` ih ne autorizuje**. Preostalih **šest**
slice-ova (`P5-I3`–`P5-I8`) su **`NOT_STARTED`**. Raniji preduslov „`P5-I1` mora postati kanonski"
je time **ispunjen**, ali to **nije autorizacija**: svaki preostali pod-gate `P5-I2`-a traži
**zaseban, vlasnički kontrolisan, sigurnosno osjetljiv gate**. Faza-5 slice paketa `011`
(`P5-I2A`, PR #33) i **runtime sigurnosna granica** (`P5-I2B`, PR #36) su **kanonski**; `P5-I2` i
dalje posjeduje Faza-5 slice paketa `014` (pod-gate `P5-I2C`) i **`★`** dokaz iz §7.6a (pod-gate
`P5-I2V`), koji ostaje **tvrdi preduslov za `P5-I5`** uz `HARD HOLD` pri neuspjehu; **`P5-I5`
ostaje neautorizovan**. Kompletan dokaz `P5-I1`-a je u `05`, Faza 5, blok `Slice P5-I1`,
`P5-I2A`-a u bloku `Slice P5-I2A`, a `P5-I2B`-a u bloku `Pod-gate P5-I2B — Faza-5 slice paketa
013`.

**AŽURIRANJE STATUSA (D-067, 2026-08-26) — pasus iznad se ne prepisuje.** Rečenica „**`P5-I2C` i
`P5-I2V` nisu implementirani i nisu autorizovani**" je **tačna na dan svog zapisa (2026-08-25)**
i **više ne opisuje tekuće stanje** za `P5-I2C`. **Pod-gate `P5-I2C` je implementiran, nezavisno
auditiran** (`P5_I2C_I_A_PASS_READY_FOR_PUBLICATION`)**, kanonski i formalno zatvoren** (D-067) —
implementacijski commit `fc6b38cea354f680f88ff9bf75d5e68a84538740`, objavljen kroz **PR #38**,
merge SHA `46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee`, migracija
`20260825214248_014_immutability_triggers_phase5`. **Faza-5 slice paketa `014` je time kanonski i
`P5-I2` ga više ne posjeduje kao budući posao.** **Nepromijenjeno ostaje:** **`P5-I2V` / `★` nije
izvršen i nije autorizovan** i **`P5-I2C` ga ne autorizuje**; **`P5-I5` ostaje neautorizovan** uz
`HARD HOLD` pri neuspjehu **`★`**; **`P5-I2` ostaje `IN_PROGRESS` / `NOT COMPLETE`**; preostalih
**šest** slice-ova (`P5-I3`–`P5-I8`) ostaje **`NOT_STARTED`**. Kompletan dokaz `P5-I2C`-a je u
`05`, Faza 5, blok `Pod-gate P5-I2C — Faza-5 slice paketa 014`.

**AŽURIRANJE STATUSA (D-068, 2026-08-27) — nijedan pasus ni anotacija iznad se ne prepisuju.**
Rečenica „**`P5-I2V` / `★` nije izvršen i nije autorizovan**" je **tačna na dan svog zapisa
(2026-08-26)** i **više ne opisuje tekuće stanje**. **Pod-gate `P5-I2V` je izvršen, nezavisno
auditiran** (`P5_I2V_I_A_PASS_READY_FOR_PUBLICATION`)**, kanonski i formalno zatvoren** (D-068) —
implementacijski commit `5b61a95a990b7179d62aa3338f8685cfa1c605fc`, objavljen kroz **PR #40**,
merge SHA `31de95230da6ff1b97a28e6386ee93b5da19aca5`, trajni vlasnik dokaza
`apps/api/test/phase5-responsible-physician-ri.security.ts`. **`P5-I2V` je bio TEST-ONLY** —
nijedna migracija, schema izmjena, grant, politika, rola ni izmjena izvora.

**Time su sva četiri ratifikovana pod-gatea `P5-I2` iscrpljena**, pa je **`P5-I2` = `COMPLETE` /
`VERIFIED` / `CANONICAL` / `FORMALLY CLOSED`** (D-068) i **checklist Faze 5 je `49 / 9`**
(`05` §6). **`P5-I5` prelazi iz `BLOCKED` u `ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION` i ostaje
`NOT AUTHORIZED`** — podobnost nije autorizacija. **Nepromijenjeno ostaje:** **Faza 5 je
`IN_PROGRESS`, nije `DONE`**, a preostalih **šest** slice-ova (`P5-I3`–`P5-I8`) ostaje
**`NOT_STARTED`**. Kompletan dokaz `P5-I2V`-a je u `05`, Faza 5, blok
`Pod-gate P5-I2V — ★ RI-naspram-RLS dokaz`.

### Segmentacija `P5-I2` na četiri pod-gatea (D-064)

`P5-I2` se **ne izvršava kao jedan potez**. Ratifikovana su četiri pod-gatea:

| Pod-gate | Obuhvat | Zavisi od |
|---|---|---|
| **`P5-I2A`** | strukturni preduslov — Faza-5 slice paketa `011`: dvije tabele, **dva** `practices` FK-a, **oba** audit indeksa, **dva** Prisma modela. **Bez granta, `REVOKE`-a, RLS zastavice, politike i trigera** | `P5-I1` (kanonski) |
| **`P5-I2B`** | Faza-5 slice paketa `013` — grantovi, `ENABLE`/`FORCE RLS`, politike **svih sedam** tabela, sigurnosni testovi | `P5-I2A` |
| **`P5-I2C`** | Faza-5 slice paketa `014` — AAD funkcija, **tri** trigera, `REVOKE ALL … FROM PUBLIC` nad funkcijom | `P5-I2B` |
| **`P5-I2V`** | **`★`** RI-naspram-RLS dokaz iz §7.6a + trajne regresije | `P5-I2C` |

**Nijedan pod-gate ne smije prećutno apsorbovati naredni.** `P5-I2A` **ne autorizuje**
`P5-I2B`; `P5-I2B` **ne autorizuje** `P5-I2C`; `P5-I2C` **ne razrješava `★`**. **`P5-I5` ostaje
blokiran dok `P5-I2V PASS` ne postane kanonski.** Svaki pod-gate traži **zasebnu vlasničku
autorizaciju**; **D-064 nijedan od njih ne autorizuje**.

**Tekuće stanje pod-gateova (2026-08-24).** **`P5-I2A` je implementiran, nezavisno reviewovan**
(`P5_I2A_V_PASS_READY_FOR_PUBLICATION`) **i kanonski**; izveden je na grani
`feat/p5-i2a-package011-structure`, commitovima
`828daa5ea385e087c2912e4f2b20f9d4bb3b7c5e` (struktura paketa `011`) i
`a37f6e014cd9f34ac449d90b2527303abc7167b2` (kataloški testovi), uz dokazni commit
`df7a1a55a6f13598fccf3f9a4d415821c60d0bb3`. Grana je **gurana i merged kroz PR #33**, merge SHA
`2e606ed3690653ecaef9126ffb8b9fb67e9354b3` — `P5-I2A` je dakle **`CANONICAL`**, a Faza-5 slice
paketa `011` je kanonski. Dokazni blok je `05`, Faza 5, `Slice P5-I2A`.

**Tekuće stanje pod-gateova (2026-08-25; D-066).** **`P5-I2A` = `CANONICAL`** (PR #33).
**`P5-I2B` = `IMPLEMENTED` / `AUDITED` / `MERGED` / `CANONICAL` / `FORMALLY CLOSED`** — commit
`6efee207c9ca52a22ca2cdeb97773832931711e7`, audit `P5_I2B_I_A_PASS_READY_FOR_PUBLICATION`,
**PR #36**, merge SHA `0e4d113f0eedddcd2db890180767768c5b422264`, migracija
`20260825013452_013_rls_policies_phase5`, vlasnik dokaza
`apps/api/test/phase5-rls-grants.security.ts`. **`P5-I2C` = `NOT IMPLEMENTED` /
`NOT AUTHORIZED`**, **`P5-I2V` / `★` = `NOT EXECUTED`**. Sigurnosna tranzicija na **13 tabela
`true`/`true` i 25 politika** (`02` §29.4a) **je izvršena i kanonska** — `P5-I2B` je uveo **15**
novih politika unutar **jedne eksplicitne `BEGIN` / `COMMIT`** transakcije; raniji zapis
„6 `true`/`true`, 7 `false`/`false`, 10 politika" je bio **međustanje nakon `P5-I2A`** i više ne
opisuje tekuće stanje. **§23.4 maintenance allowlista ostaje na šest tabela**, neproširena.
Dokazni blok je `05`, Faza 5, `Pod-gate P5-I2B — Faza-5 slice paketa 013`.

**`P5-I2` u cjelini i dalje NIJE zatvoren.** Kanoničnost `P5-I2B` **ne autorizuje `P5-I2C`**, **ne
izvršava i ne slabi `★`**, i **ne odblokira `P5-I5`**. **Faza 5 ostaje `IN_PROGRESS`.**

**Tekuće stanje pod-gateova (2026-08-26; D-067).** **`P5-I2A` = `CANONICAL`** (PR #33).
**`P5-I2B` = `CANONICAL` / `FORMALLY CLOSED`** (PR #36). **`P5-I2C` = `IMPLEMENTED` / `AUDITED` /
`MERGED` / `CANONICAL` / `FORMALLY CLOSED`** — commit
`fc6b38cea354f680f88ff9bf75d5e68a84538740`, audit `P5_I2C_I_A_PASS_READY_FOR_PUBLICATION`,
**PR #38**, merge SHA `46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee`, migracija
`20260825214248_014_immutability_triggers_phase5`, vlasnik dokaza
`apps/api/test/phase5-aad-immutability.security.ts`. **`P5-I2V` / `★` = `NOT EXECUTED` i
`NOT AUTHORIZED`.**

Zatečeno stanje paketa `014` je **tačno jedna funkcija** —
`app_security.reject_aad_bound_column_change()`, `SECURITY INVOKER`, `search_path = pg_catalog,
pg_temp`, sa `REVOKE ALL … FROM PUBLIC` i **bez ijednog `EXECUTE` granta** — i **tačno tri**
trigera (`patient_references_aad_immutable_trg`, `encounters_aad_immutable_trg`,
`encounter_documents_aad_immutable_trg`), svi `BEFORE UPDATE` `FOR EACH ROW`, **bez `WHEN`** i
**bez `UPDATE OF`**, sve unutar **jedne eksplicitne `BEGIN` / `COMMIT`** transakcije. **Preostala
dva trigera iz `02` §19.3 ostaju budući** — njihove tabele u Fazi 5 ne postoje. Sigurnosno stanje
`P5-I2B` je **regresijski dokazano netaknutim**: `13 / 13`, **25** politika, tačni column
grantovi, `storage_objects` na nuli, `§23.4` allowlista **tačno 6**. Dokazni blok je `05`,
Faza 5, `Pod-gate P5-I2C — Faza-5 slice paketa 014`.

**`P5-I2` u cjelini i dalje NIJE zatvoren.** Kanoničnost `P5-I2C` **ne izvršava i ne slabi `★`**,
**ne autorizuje `P5-I2V`** i **ne odblokira `P5-I5`**. **Faza 5 ostaje `IN_PROGRESS`.**
**Naredni obavezni gate je `P5-I2V`**, i traži **zaseban vlasnički potez**.

**Tekuće stanje pod-gateova (2026-08-27; D-068).** **`P5-I2A` = `CANONICAL`** (PR #33).
**`P5-I2B` = `CANONICAL` / `FORMALLY CLOSED`** (PR #36). **`P5-I2C` = `CANONICAL` /
`FORMALLY CLOSED`** (PR #38). **`P5-I2V` = `IMPLEMENTED` / `INDEPENDENTLY AUDITED` / `MERGED` /
`CANONICAL` / `FORMALLY CLOSED`** — commit `5b61a95a990b7179d62aa3338f8685cfa1c605fc`, audit
`P5_I2V_I_A_PASS_READY_FOR_PUBLICATION`, **PR #40**, merge SHA
`31de95230da6ff1b97a28e6386ee93b5da19aca5`, vlasnik dokaza
`apps/api/test/phase5-responsible-physician-ri.security.ts` (**13** testova).

**`★` je dokazan kao KONJUNKCIJA** — u **jednoj** transakciji, na **istom** klijentu, pod
**stvarnim** `copilot_app`-om i **stvarnim** `FORCE RLS`-om: same-practice co-member `B` je
**prihvaćen** kao `responsible_physician_id` kroz
`encounters_responsible_physician_membership_fk`, **a istovremeno** direktan `SELECT` tog istog
`practice_memberships` reda vraća **nula redova**. **`SQLSTATE 42501` nije polovina B**, i to je
izvršna tvrdnja. Puni nalaz, kontrole isključenja lažno pozitivnog i kataloško stanje su u
`02` §29.2a. Sigurnosno stanje je **regresijski dokazano netaknutim**: tri role bez `BYPASSRLS`,
**nula** `SECURITY DEFINER` funkcija, **§23.4** allowlista **tačno 6**, nijedan novi grant,
politika, rola ni migracija. Dokazni blok je `05`, Faza 5,
`Pod-gate P5-I2V — ★ RI-naspram-RLS dokaz`.

**`P5-I2` je time ZATVOREN.** Sva **četiri** ratifikovana pod-gatea (D-064) su iscrpljena, i
**nijedan `P5-I2` posao ne preostaje**: **`P5-I2` = `COMPLETE` / `VERIFIED` / `CANONICAL` /
`FORMALLY CLOSED`** (D-068). **Checklist Faze 5 je `49 / 9`** — red `Schema → RLS` je označen,
`Tests → cross-tenant FK` ostaje **neoznačen** jer njegovo značenje uključuje API/`422` ponašanje
u vlasništvu `P5-I5` (D-064).

**Naredni obavezni gate je `P5-I5` — Encounter jezgro.** Njegov tvrdi preduslov **`★`** je
**ispunjen**, pa je gate **`ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION`** nakon što D-068 postane
kanonski — i **`NOT AUTHORIZED`**. **Podobnost nije autorizacija**; nijedan korak `P5-I5` ne
počinje automatski, a zavisnosti `P5-I3` i `P5-I4` (§7.5) ostaju nepromijenjene. **Faza 5 ostaje
`IN_PROGRESS`; nije `DONE`.**

**`P5-I2B` Security Boundary Preflight — `HOLD`, pa D-065 (2026-08-25).** Read-only preflight
`P5-I2B` je završio ishodom **`HOLD`** sa razlogom **`POLICY_CATALOGUE_ARITHMETIC_INCONSISTENT`**:
objavljeni PHI zbir (`8`) nije se poklapao sa vlastitim imenovanim katalogom (`10` politika,
`02` §29.4), pa ni izvedeni total `23`. Vlasnički pregled je uz to zatražio da mehanizam
atomičnosti bude eksplicitan prije implementacije. Oba blokera rješava **D-065**: imenovani
katalog je mjerodavan, PHI = **10**, `P5-I2B` = **15** novih politika, puni total = **25**;
migracija nosi **eksplicitnu `BEGIN` / `COMMIT`** transakciju. **D-065 ne autorizuje
implementaciju.** **Preflight `P5-I2B` se mora ponoviti** nad kanonskim `main`-om koji sadrži
D-065, i **samo** ishod `P5_I2B_PREFLIGHT_PASS_READY_FOR_OWNER_AUTHORIZATION` smije voditi u
zaseban vlasnički autorizacijski gate. Do tada: **`P5-I2B` = `NOT IMPLEMENTED` /
`NOT AUTHORIZED`**.

**Anotacija (D-066, 2026-08-25) — pasus iznad se ne prepisuje.** On opisuje **redoslijed gateova
kako je stajao na dan D-065** i tačan je kao takav. **Ta sekvenca je u međuvremenu dovršena:**
preflight je ponovljen, vlasnik je autorizovao pod-gate zasebnim potezom, implementacija je
izvedena i nezavisno auditirana, a auditirani commit je merged nepromijenjen kroz **PR #36**.
**Zaključna rečenica „Do tada: `P5-I2B` = `NOT IMPLEMENTED` / `NOT AUTHORIZED`" je time
historijska i više ne opisuje tekući status** — vidi *Tekuće stanje pod-gateova (2026-08-25)*
iznad i **D-066**.

**Vlasništvo sigurnosnih testova (D-064, `OD-9`).** `phase5-schema-catalogue.security.ts`
zadržava strukturni katalog paketa `003` i **package-boundary ZERO-CAPABILITY tvrdnju nad samom
migracijom `003`**; **`phase5-rls-grants.security.ts`** je vlasnik steady-state
sigurnosnog kataloga `P5-I2` — **uveden i kanonski od `P5-I2B`** (PR #36); **`★`** ostaje u
zasebnom
**`phase5-responsible-physician-ri.security.ts`**. Exact-set ekspektacije smiju evoluirati
**stari tačan skup → novi tačan skup**; **`exact` → `contains`/`subset`/`partial` ostaje
kategorički zabranjeno**.

**STATUS vlasništva testova (D-067, 2026-08-26).** `phase5-rls-grants.security.ts` ostaje vlasnik
steady-state sigurnosnog kataloga `P5-I2` (`P5-I2B`, PR #36). **Novi
`apps/api/test/phase5-aad-immutability.security.ts` je trajni vlasnik steady-state dokaza
`P5-I2C`** — uveden i kanonski od PR #38: lanac migracija **= 7**, statički dokaz eksplicitne
transakcije i tačnog obuhvata forward SQL-a paketa `014`, **četiri** funkcije u `app_security`
sve `SECURITY INVOKER`, **nijedan `SECURITY DEFINER` nigdje u bazi**, tačan ACL funkcije,
**tačno tri** ne-interna trigera, **prva barijera `42501`**, **druga barijera `23514`** na
test-only privremenoj tabeli, uspjeh ne-AAD i same-value `UPDATE`-a, te **regresija `P5-I2B`**.
Exact-set ekspektacije su evoluirale isključivo **stari tačan skup → novi tačan skup**;
**nijedna tvrdnja nije oslabljena**. **`phase5-responsible-physician-ri.security.ts` i dalje NE
POSTOJI** — **`★`** pripada `P5-I2V`, koji je **`NOT EXECUTED`**.

**STATUS vlasništva testova (D-068, 2026-08-27) — status iznad se ne prepisuje.** Zaključna
rečenica „**`phase5-responsible-physician-ri.security.ts` i dalje NE POSTOJI**" je **tačna na dan
D-067** i **više ne opisuje tekuće stanje**. **`apps/api/test/phase5-responsible-physician-ri.security.ts`
postoji, kanonski je i trajni je vlasnik dokaza `★`** — uveden i kanonski od **PR #40**, **13**
testova. On posjeduje: **punu katalošku identičnost** composite FK-a u jednom strogom poređenju
cijelog reda (`MATCH SIMPLE`, `NO ACTION` / `NO ACTION`, `convalidated`, ne-odgodiv, ne inicijalno
odgođen, tačan roditeljski indeks); **pozicijsko mapiranje kolona**
`(practice_id, responsible_physician_id)` → `(practice_id, user_id)`; **identičnost roditeljskog
ključa** `practice_memberships_practice_user_key`; **`ENABLE` + `FORCE RLS`** nad
`practice_memberships`; **tačno jednu politiku** `practice_memberships_self_select`
(`PERMISSIVE` / `SELECT` / `TO copilot_app`, bajt-identična i neoslabljena); **tačan grant**
(`copilot_app` = `SELECT` i ništa drugo; `PUBLIC` i `copilot_system` = ništa);
**fizičko-egzistencijalnu diferencijalnu kontrolu** za `B`; **same-client / same-transaction
dokaz**; **polovinu A** (uspjeh) i **polovinu B** (nula redova), asertirane **zajedno**;
**own-membership kontrolu**; **izvršnu tvrdnju da `42501` nije polovina B**; **dokaz da `★` nije
ostavio nijedan red**; i **no-widening regresiju**. Exact-set ekspektacije su i ovdje evoluirale
isključivo **stari tačan skup → novi tačan skup**; **nijedna tvrdnja nije oslabljena**, a
steady-state dokazi `phase5-schema-catalogue.security.ts`,
`phase5-package011-catalogue.security.ts`, `phase5-rls-grants.security.ts` i
`phase5-aad-immutability.security.ts` su **očuvani**.

## 7.6 Acceptance

- duplicate idempotency vraća isti resurs;
- isti key drugi body 409;
- stale If-Match 409;
- A ne vidi B;
- cross-tenant FK fail;
- original external ID nije u responseu/logu;
- document view audit;
- medical text nije u logu;
- **DRAFT → READY_FOR_ANALYSIS prema ratifikovanoj politici (D-062, `OD-P5-D2-7`)** — postavlja je
  komanda unosa dokumenta, **isključivo iz `DRAFT`**, pri **svakom** uspješnom unosu, idempotentno
  (već `READY_FOR_ANALYSIS` je **no-op, ne greška**), **bez `version` inkrementa**, uz vlastiti
  audit događaj `ENCOUNTER_READY_FOR_ANALYSIS`; unos dokumenta se **odbija pri `CANCELLED`** →
  `409 INVALID_STATE_TRANSITION`;
- **svih 15 kanonskih tranzicija je pokriveno table-driven testom**: 4 dosežne prolaze, preostalih
  **11 daje `409 INVALID_STATE_TRANSITION`** — eksplicitno zabranjene, ne prećutno odsutne;
- **cross-practice dodjela odgovornog ljekara daje `422`, i neuspjeh nastaje u bazi**, ne u
  aplikacijskoj validaciji;
- **`★` RI-naspram-RLS dokaz iz §7.6a prolazi prije `P5-I5`**;
- **`PATCH /encounters/{id}` mijenja tačno osam polja** iz `03` §12; `status`,
  `patientReferenceId`, `sourceSystem`, `version` i `diagnoses[]` su odbijeni;
- **`view=redacted` pri `redactionStatus = FAILED` odbija i NIKADA ne pada nazad** na normalizovani
  ni originalni tekst — trajna regresija;
- **arhivirani dokument nije u listi, jest na detaljnoj ruti**; ponovno arhiviranje je idempotentan
  uspjeh;
- **`latestAnalysis`, approval/export blok i `hasBlockingFindings` su odsutni**, a nepoznat query
  parametar je odbijen;
- **`copilot_system` ima nula grantova nad svih pet tabela**; `PUBLIC` nula;
- **`storage_objects` nema nijedan grant ni politiku** i drži nula redova;
- **nijedna PHI tabela nije seedana**, i `FORCE RLS` allowlista ostaje na **šest** tabela;
- **`GET /encounters` vraća `responsiblePhysician` kao samo `{ id }`** — ključ `displayName` je
  **odsutan**, ne `null`; `responsiblePhysician` je `null` kada odgovorni ljekar ne postoji; filter
  `responsiblePhysicianId` radi nepromijenjeno; **serviranje liste ne čita `users`** (D-061).

## 7.6a Ograničenja pristupa identitetu — D-061

**Faza 5 ne konzumira `display_name` drugog korisnika ni u jednom obliku** i **ne uvodi** nijedan
mehanizam koji bi ga učinio čitljivim. Konkretno, u ovoj fazi se **ne** kreira treća `users`
politika, **ne** širi `users` column grant, **ne** širi `practice_memberships` RLS ni grant, **ne**
denormalizuje `display_name`, **ne** uvodi `SECURITY DEFINER` lookup, četvrta database rola, drugi
Prisma klijent ni zamjenski identifikator (D-061, klauzula 11; `13` §19.4).

### `P5-D2 BLOCKING DESIGN OBLIGATION` — validacija `responsiblePhysicianId` — **RAZRIJEŠENO (D-062)**

**Historijski opis obaveze.** Domenska validacija `responsiblePhysicianId` na `POST /encounters` —
i na `PATCH /encounters/{id}` ako on to polje mijenja — prirodno traži provjeru da je referencirani
korisnik član tekuće ordinacije. Jedini izvor tog dokaza je `practice_memberships`, čija je jedina
politika **caller-self** (`practice_memberships_self_select`), pa bi naivna cross-member provjera
vratila **nula redova**.

**Dispozicija: obaveza je RAZRIJEŠENA odlukom D-062, Dio D (`OD-P5-D2-5`, opcija `RP-B` + `RP-E`).**
Gate `P5-D2` je zaključen, a D-062 objavljuje njegov ratifikovani ishod.

**Ratifikovani mehanizam** je **composite foreign key**, ne runtime upit:

```sql
alter table encounters
  add constraint encounters_responsible_physician_membership_fk
  foreign key (practice_id, responsible_physician_id)
  references practice_memberships (practice_id, user_id)
  match simple
  on delete no action on update no action;
```

Parent ključ `practice_memberships_practice_user_key` postoji od paketa `002`, pa se **nijedan novi
indeks i nijedan objekat nad `practice_memberships` ne uvodi**. Validacija prestaje biti nešto što
aplikacija **pita** i postaje nešto što baza čini **nemogućim za prekršiti**: cross-practice dodjela
nema parent red.

**Invarijanta dodjele (`OD-P5-D2-4`):** korisnik sa **bilo kojim** membershipom u **istoj**
ordinaciji. **Rola i `active` se ne traže** i **nisu sprovodivi u Fazi 5** — pa se eksplicitno
odgađaju. **Ratifikovana posljedica:** u Fazi 5 MPA, ili član sa neaktivnim membershipom, **smije**
biti imenovan odgovornim ljekarom. To je zapisana odluka, ne neotkrivena rupa.

**Sigurnosne invarijante Faze 4 nisu oslabljene** — mehanizam ne uvodi nijednu politiku, nijedan
grant, nijedan `SECURITY DEFINER`, nijednu novu rolu ni drugi klijent (D-062, Dio D.3).

**Mapiranje greške (usko, obavezno):** `23503` nad **tim jednim** imenom constrainta →
`422 VALIDATION_ERROR` sa generičkom porukom koja ne citira vrijednost. **Globalno `23503 → 422`
mapiranje je zabranjeno.**

### **NOVA BLOKIRAJUĆA OBAVEZA — `★` RI-naspram-RLS dokaz prije encounter jezgra**

**Dokumentovanje mehanizma u D-062 NE znači da je njegovo ponašanje dokazano.**

Mehanizam počiva na jednoj nosećoj pretpostavci: **PostgreSQL provjere referencijalnog integriteta
zaobilaze RLS**. Prije nego što se implementacija encounter jezgra smije osloniti na taj FK, slice
**`P5-I2` MORA empirijski dokazati**, nad **stvarnim PostgreSQL-om** i pod **stvarnim runtime
rolama**, da composite FK radi ispravno pod postojećim `FORCE RLS` modelom:

1. u istoj transakciji, pod `copilot_app` i uspostavljenim tenant kontekstom, `INSERT` u
   `encounters` koji imenuje `user_id` **co-membera** **uspijeva**;
2. direktan `SELECT` **tog istog** membership reda vraća **nula redova**.

Oba iskaza moraju vrijediti istovremeno: prvi dokazuje da RI radi, drugi da RLS **nije** oslabljen.

**Neuspjeh je HARD HOLD** — vraća se u dizajn i ponovo otvara `OD-P5-D2-5`. **Ne autorizuje
slabljenje RLS-a** ni bilo koje proširenje Faza-4 sigurnosne granice.

**Implementacija encounter jezgra (`P5-I5`) ne smije početi prije nego što `★` prođe.**

**STATUS — ISPUNJENO I KANONSKI (D-068, 2026-08-27); obaveza iznad se ne uklanja.** Obaveza je
**ispunjena**, ne povučena: **`★` je izvršen, nezavisno auditiran, merged i kanonski** —
pod-gate **`P5-I2V`**, commit `5b61a95a990b7179d62aa3338f8685cfa1c605fc`, audit
`P5_I2V_I_A_PASS_READY_FOR_PUBLICATION`, **PR #40**, merge SHA
`31de95230da6ff1b97a28e6386ee93b5da19aca5`. **Oba iskaza vrijede istovremeno**, u jednoj
transakciji na istom klijentu, pod stvarnim `copilot_app`-om i stvarnim `FORCE RLS`-om: `INSERT`
sa co-member `responsible_physician_id` **uspijeva** kroz
`encounters_responsible_physician_membership_fk`, **a** direktan `SELECT` tog istog
`practice_memberships` reda vraća **nula redova**. **`SQLSTATE 42501` nije taj drugi iskaz.**
Puni nalaz i kontrole isključenja lažno pozitivnog su u `02` §29.2a. **`HARD HOLD` nije
nastupio**, `OD-P5-D2-5` se **ne otvara ponovo**, i **nijedno slabljenje RLS-a ni proširenje
Faza-4 granice nije izvedeno.**

**Trajni vlasnik dokaza je `apps/api/test/phase5-responsible-physician-ri.security.ts`**, i
**`★` ostaje trajna regresija** — njegovo buduće rušenje je i dalje **`HARD HOLD`**.

**Posljedica za `P5-I5`:** rečenica „implementacija encounter jezgra ne smije početi prije nego
što `★` prođe" **ostaje na snazi** i **njen uslov je zadovoljen**. `P5-I5` je time **`ELIGIBLE
FOR SEPARATE OWNER AUTHORIZATION`** — nakon što D-068 postane kanonski — i **`NOT AUTHORIZED`**.
**Podobnost nije autorizacija**; `P5-I5` ne počinje automatski.

## 7.7 Commit

```text
feat(encounters): add patient references encounters and secure documents
```

---

# 8. Faza 6 — Tarifne verzije

## 8.1 Branch

```text
backend/06-tariff-releases
```

## 8.2 Scope

- system storage;
- tariff releases;
- artifacts;
- catalog;
- activation history;
- admin API;
- one-active constraint;
- mock release seed.

## 8.3 Aktivnosti

1. global schema;
2. runtime read/admin write prava;
3. import metadata;
4. SHA-256;
5. validate command;
6. activate transaction;
7. deactivate;
8. audit;
9. OpenAPI;
10. test two-active rejection.

## 8.4 Acceptance

- tačno jedna active;
- invalid release se ne aktivira;
- activation audit;
- package hash postoji;
- obični physician ne upravlja releaseom;
- mock release dostupan analysis fazi.

## 8.5 Commit

```text
feat(tariffs): add versioned tariff release management
```

---

# 9. Faza 7 — Analysis modeli, jobs i outbox

## 9.1 Branch

```text
backend/07-analysis-queue
```

## 9.2 Scope baze

- ai_prompt_versions;
- analysis_runs;
- analysis_input_snapshots;
- async_jobs;
- outbox_events final;
- idempotency final;
- audit expansion.

## 9.3 Scope aplikacije

- analysis creation;
- revision numbering;
- immutable snapshot builder;
- BullMQ config;
- outbox publisher;
- mock processor skeleton;
- job status API.

## 9.4 Aktivnosti

1. migration;
2. analysis state machine;
3. POST analysis;
4. DB transaction analysis+job+outbox;
5. publisher `SKIP LOCKED`;
6. queue job;
7. processor;
8. progress;
9. failure path;
10. retry idempotency;
11. GET analysis/job.

## 9.5 Acceptance

- HTTP vraća 202;
- Redis down ne gubi DB command;
- publisher nakon povratka enqueuea;
- duplicate publish ne kreira dupli analysis rezultat;
- snapshot je immutable;
- job payload nema text;
- failure ostavlja DB status.

## 9.6 Commit

```text
feat(analysis): add revisioned analysis jobs with transactional outbox
```

---

# 10. Faza 8 — Mock AI i Mock Tarif Engine

## 10.1 Branch

```text
backend/08-mock-ai-tariff
```

## 10.2 Scope baze

- ai_extraction_runs;
- extracted_facts;
- service_candidates;
- candidate_evidence;
- tariff_evaluations;
- tariff_evaluation_items;
- tariff_messages.

## 10.3 Scope koda

- provider interfaces;
- mock AI;
- AI schema validator;
- tariff client interface;
- mock tariff client;
- analysis pipeline;
- workspace endpoint.

**Obavezan gate prije `workspace endpoint` (D-061, klauzule 14–16).** Zamrznut kompletan v1 oblik
`GET /analyses/{analysisId}/workspace` (`03` §15) sadrži
`encounter.responsiblePhysician.displayName` — `display_name` **drugog** korisnika. To je tekući
**prvi poznati konzument** co-member pristupa, koji ostaje `DENY / NOT IMPLEMENTED` (D-047, klauzula
12).

Prije implementacije tog endpointa **mora** biti ponovo otvoren i prihvaćenom odlukom zatvoren
imenovani gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19). Tiho dodavanje tog polja —
kroz treću `users` politiku, proširen grant, prošireni `practice_memberships` RLS, denormalizaciju,
`SECURITY DEFINER` lookup ili zamjenski identifikator — je **phase-gate defekt**.

## 10.4 Aktivnosti

1. contracts;
2. deterministic mock fixture;
3. request/response hash;
4. persist facts/candidates;
5. evidence offsets;
6. mock tariff mapping;
7. raw+normalized result;
8. pipeline checkpoints;
9. retry from failed step;
10. workspace aggregate.

## 10.5 Acceptance

- end-to-end analysis završava;
- AI invalid schema fail;
- mock deterministic;
- duplicate retry ne duplicira facts/items;
- raw hashes postoje;
- workspace ne izlaže raw medical secret;
- no real external API.

## 10.6 Commit

```text
feat(analysis): implement mock AI and tariff evaluation pipeline
```

---

# 11. Faza 9 — Safety rules

## 11.1 Branch

```text
backend/09-safety-rules
```

## 11.2 Scope

- safety_rules;
- safety_rule_versions;
- rule_findings;
- finding_evidence;
- TypeScript rule interface;
- registry;
- first rules;
- findings API;
- approval readiness calculation.

## 11.3 Minimalna pravila

1. missing consultation duration;
2. missing performer role;
3. duplicate service candidate;
4. outdated/inactive tariff release;
5. unsupported candidate evidence;
6. flat-rate inclusion conflict mock.

## 11.4 Acceptance

- rule version u findingu;
- deterministički ponovljiv rezultat;
- duplicate finding prevention;
- blocking policy;
- accepted risk policy;
- evidence;
- findings filtering;
- cross-tenant test.

## 11.5 Commit

```text
feat(rules): add versioned safety rules and review findings
```

---

# 12. Faza 10 — Review i approval

## 12.1 Branch

```text
backend/10-review-approval
```

## 12.2 Scope

- review_decisions;
- review_item_changes;
- review_decision_change_links;
- analysis_approvals;
- correction endpoints;
- zajednički `analysis_runs` revision lock na correction i decision putu (D-046);
- finding resolution;
- approval policy;
- immutable payload;
- revocation;
- database triggers.

## 12.3 Aktivnosti

1. migration;
2. review services;
3. correction reason;
4. new revision requirement;
5. approval readiness;
6. row lock;
7. payload builder;
8. canonical hash;
9. immutable grant/trigger;
10. revoke;
11. audit;
12. e2e concurrency test;
13. schema objekti D-046 u paketu `009_review_approvals` prema `02` §22.9;
14. RLS nad `review_decision_change_links` u paketu `013_rls_policies` prema `02` §22.13 —
    **odgođeni slice iz D-052, izvršava se ovdje, neposredno nakon aktivnosti 13**, jer tabela
    prije ovog paketa ne postoji; Faza 4 ga **ne izvršava**;
15. `analysis_runs FOR UPDATE` na **početku** correction transakcije;
16. **isti** lock na početku decision transakcije;
17. deterministička granica pokrivenosti;
18. izbor **svih** correction eventa sa istim `practice_id` i `analysis_run_id`;
19. `INSERT` jednog `review_decision_change_links` reda po odabranoj promjeni;
20. audit dokaz u istoj transakciji;
21. atomarni commit i potpun rollback;
22. e2e test granice pokrivenosti i konkurentne korekcije.

### 12.3.1 D-046 implementacijski model

Normativno: D-046; `02` §13.1, §13.2, §13.2a, §13.2a.1, §18.1, §22.9, §22.13, §25.2.2 i §28.1.
Ovo je implementacijsko sekvenciranje; schema definicije se **ne dupliraju** iz `02`.

**Correction event**

- `review_item_changes` je **nezavisan immutable correction event**; korekcija smije biti
  perzistirana **prije** i **bez** ijednog `review_decisions` reda;
- tabela **nema** kolonu `review_decision_id` — ni nullable ni obaveznu;
- obavezan anchor je `analysis_run_id uuid NOT NULL` uz tenant-safe composite FK
  `(practice_id, analysis_run_id)` → `analysis_runs(practice_id, id)`;
- asocijacija odluke i promjene postoji **isključivo** kroz `review_decision_change_links`;
- **naknadni `UPDATE` se nikada ne koristi** za povezivanje korekcije sa odlukom —
  `copilot_app` nema `UPDATE` grant, a tabela je append-only;
- `review_decisions` ostaje append-only i dobija `unique (practice_id, analysis_run_id, id)` i
  composite FK prema `analysis_runs(practice_id, id)`;
- svi D-046 FK-ovi koriste `ON DELETE NO ACTION` i `ON UPDATE NO ACTION`.

**Deterministička granica pokrivenosti**

Obje vrste transakcija — correction i review-decision — zauzimaju **prvi** isti revision lock:

```sql
select ...
from analysis_runs
where practice_id = :practice_id
  and id = :analysis_run_id
for update;
```

- granica pokrivenosti nastaje **u trenutku kada decision transakcija zauzme taj lock**;
- korekcija commitovana **prije** granice je vidljiva i **uključena**;
- correction transakcija koja dođe do iste revizije dok je decision lock držan **čeka**;
- korekcija commitovana **nakon** granice je **isključena** iz tekuće odluke i smije biti
  pokrivena kasnijom;
- već povezana korekcija se **ne isključuje** iz kasnije odluke za isti `analysis_run_id`;
- zaključava se **jedan resurs u jednoj dosljednoj prvoj poziciji**, pa lock-order ciklus nije
  moguć;
- **D-029** optimistic locking nad `extracted_facts` i `service_candidates` ostaje i zajednički
  revision lock ga **dopunjuje, a ne zamjenjuje**.

**Decision transakcija**

`POST /analyses/{id}/decisions` je **jedna atomarna transakcija**:

1. autentifikacija i tenant context (D-033; `03` §3.7);
2. `analysis_runs … FOR UPDATE`;
3. validacija tekuće revizije i stanja;
4. izbor **svih** `review_item_changes` redova sa istim `practice_id` i `analysis_run_id`;
5. **bez** filtriranja već povezanih promjena;
6. `INSERT` u `review_decisions`;
7. `INSERT` jednog `review_decision_change_links` reda po odabranoj promjeni;
8. upis obaveznog audit dokaza;
9. atomarni `COMMIT`.

Neuspjeh **rollback-uje** odluku, sve linkove i audit upise; parcijalno stanje nije observabilno.
**Nula odabranih promjena je validno stanje.** Duplirani linkovi za **istu** odluku su spriječeni
prihvaćenim unique constraintom. Već prihvaćeno idempotency ponašanje ostaje nepromijenjeno.

**Granice ugovora**

- correction endpointi `PATCH /analyses/{id}/facts/{factId}` i
  `PATCH /analyses/{id}/service-candidates/{candidateId}` mijenjaju se **isključivo interno** —
  `If-Match`, `version`, payloadi, statusi i error kodovi ostaju identični;
- klijent **ne šalje** `review_item_change` ID-eve; asocijacija je **serverski izvedena**;
- **nema** novog polja u request ni response payloadu; **nema izmjene javnog API ugovora**;
- vlasništvo migracija: schema u **`009_review_approvals`**, RLS u **`013_rls_policies`**;
  **oba se izvršavaju u ovoj fazi** — RLS kao odgođeni slice iz D-052, neposredno nakon schema
  objekata; **nijedan migration paket se ne dodaje niti renumeriše**;
- **nijedan spekulativni samostalni indeks se ne kreira** (`02` §21).

## 12.4 Acceptance

- open blocker prevents approval;
- stale revision prevents approval;
- concurrent double approval creates one;
- approved payload immutable;
- candidate modification after approval fail;
- revoke ne briše history;
- export readiness false after revoke;
- podobnost opoziva se evaluira **u trenutku opoziva** (D-041, klauzula 7; D-058);
- opoziv od podobnog korisnika koji **nije** originalni odobravatelj **uspijeva** (D-041,
  klauzula 6; D-058);
- opoziv **bez** `reason` je odbijen (D-041, klauzula 8; D-058);
- dokaz odobrenja **nije obrisan** ni nakon opoziva (D-041, klauzula 9; D-058);
- approval historija ostaje **immutable** nakon opoziva (D-041, klauzula 10; D-016; D-058);
- opoziv emituje **revocation audit event** (D-041, klauzula 11; D-058);
- ruta odobravanja i ruta opoziva iz `03` §10 i §20 daju **`403`** kada podobna rola nema uključen
  odgovarajući practice flag (D-058, klauzula 6);
- korekcija je perzistirana **prije i bez** ijedne review odluke;
- odluka sa **nula** povezanih korekcija je validna;
- korekcija već povezana sa ranijom odlukom **ponovo se povezuje** sa kasnijom odlukom za isti
  `analysis_run_id`;
- korekcija commitovana **nakon** granice pokrivenosti je isključena iz tekuće odluke i
  prihvatljiva za kasniju;
- konkurentna correction transakcija **čeka** na zajedničkom `analysis_runs` locku;
- neuspjeh rollback-uje odluku, linkove i audit bez parcijalnog stanja;
- request nema polje za correction ID-eve i nijedan payload se ne mijenja.

## 12.5 Commit

```text
feat(review): add controlled corrections and immutable approvals
```

---

# 13. Faza 11 — Manual export i audit package

## 13.1 Branch

```text
backend/11-manual-export-audit
```

## 13.2 Scope

- integration_connections;
- external_resource_links;
- export_jobs;
- PracticeSystemAdapter;
- ManualAdapter;
- JSON export;
- audit package JSON;
- PDF job stub ili implementacija ako library odluka postoji.

## 13.3 Aktivnosti

1. adapter interface;
2. manual connection seed/config;
3. export command;
4. approval hash check;
5. async export;
6. object artefact;
7. audit timeline;
8. audit package;
9. retry;
10. failure.

## 13.4 Acceptance

- bez approvala 409;
- revoked approval 409;
- isti payload hash;
- retry idempotentan;
- output sadrži final items i audit summary;
- nema neodobrenog data sourcea;
- Axenita još nije pozvana.

## 13.5 Commit

```text
feat(exports): add manual billing draft export and audit package
```

---

# 14. Faza 12 — Hardening i pilot readiness

## 14.1 Branch

```text
backend/12-hardening-pilot-readiness
```

## 14.2 Scope

- OpenAPI 3.1 export;
- contract checks;
- rate limiting;
- ready health;
- structured logging/redaction;
- CI;
- backup/restore scripts;
- security tests;
- performance smoke;
- dependency scanning;
- documentation sync.

## 14.3 Aktivnosti

1. generate `docs/api/openapi-v1.json`;
2. client generation smoke;
3. Problem Details coverage;
4. rate limit;
5. health dependencies;
6. log redaction tests;
7. test DB containers;
8. full e2e;
9. CI;
10. backup/restore dry run;
11. compose production-like test;
12. milestone report.

## 14.4 Acceptance

- svi DoD kriteriji;
- CI green;
- migrations clean;
- RLS suite green;
- no secrets;
- no PHI log fixture;
- audit reconstruction;
- baseline performance;
- otvorene external dependencies jasno dokumentovane.

## 14.5 Commit

```text
chore(backend): harden API and complete MVP readiness gates
```

---

# 15. Nakon MVP core milestonea

Tek poslije faze 12:

## 15.1 Stvarni AI

- provider security/DPA;
- schema;
- redaction;
- baseline extraction tests;
- cost/latency;
- no training/retention konfiguracija.

## 15.2 Stvarni Tarif Engine

- licenca;
- package import;
- Java wrapper;
- contract test;
- baseline slučajevi;
- release loading;
- version health.

## 15.3 Axenita

- partner ugovor;
- sandbox;
- endpoint contract;
- webhook/auth;
- import mapping;
- draft write-back;
- reconciliation;
- audit attachment.

Svaka je zaseban epic, ne dio core faza.

---

# 16. Globalni stop kriteriji

Ne nastavljati narednu fazu ako:

- migracija ne prolazi na praznoj bazi;
- runtime role je owner;
- RLS test ne prolazi;
- cross-tenant test ne prolazi;
- lint/typecheck/build fail;
- test je preskočen bez razloga;
- dokumentacija nije ažurirana;
- unknown changes postoje u Git treeju;
- scope je prešao u narednu fazu;
- PHI se pojavljuje u logu/Redis payloadu;
- `practice_memberships` i dalje nosi singularnu kolonu `role`, ili
  `practice_membership_roles` i njeni prihvaćeni constrainti nedostaju (D-038);
- implementirana role-permission matrica odstupa od `15_ROLE_PERMISSION_MATRIX_V1.md`.

---

# 17. Dokumentacijska sekvenca

Stanje rekonsilijacije role-permission modela:

| Dokument | Status |
|---|---|
| `06` — D-039 do D-045 | **prihvaćeno** |
| `15_ROLE_PERMISSION_MATRIX_V1.md` | **kreirano i prihvaćeno** |
| `03` — API contract | **usklađeno** |
| `04` — ovaj dokument | **usklađeno** |
| `05` — implementation checklist | **čeka kontrolisani batch** |
| `07` — Cursor fazni promptovi | **čeka kontrolisani batch** |
| `08` — test strategija | **čeka kontrolisani batch** |
| `MANIFEST.md` | **čeka kontrolisani batch** |

Dok ta četiri dokumenta ne budu usklađena, njihove `BLOCKED` oznake za produkcijske role grantove
ostaju na snazi i **ne uklanjaju se iz ovog dokumenta**.

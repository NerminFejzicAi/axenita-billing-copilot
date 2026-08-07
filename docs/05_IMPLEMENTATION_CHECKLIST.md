# 05 — Implementation Checklist

**Uputstvo:** Checkbox se označava samo ako postoji izvršena provjera ili konkretan dokaz.  
**Status vrijednosti:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

---

# 0. Project metadata

| Polje | Vrijednost |
|---|---|
| Current phase | NOT_STARTED |
| Current branch | |
| Last completed phase | |
| Last commit | |
| Local environment owner | |
| Test DB | |
| Documentation version | 1.0 |
| Last updated | |

---

# 1. Pre-flight

- [ ] Dokumenti su kopirani u root projekta.
- [ ] Cursor vidi `AGENTS.md`.
- [ ] Pročitan `00_PROJECT_RULES.md`.
- [ ] Pročitan `06_DECISION_LOG.md`.
- [ ] Git repository postoji.
- [ ] Working tree je čist.
- [ ] Nema stvarnih secrets u fajlovima.
- [ ] Docker radi.
- [ ] Node/pnpm rade.
- [ ] Project owner je potvrdio fazni pristup.

Evidence:

```text
git status:
node --version:
pnpm --version:
docker version:
```

---

# 2. Faza 1 — Bootstrap

Status: `NOT_STARTED`

## Repository

- [ ] Root `package.json`.
- [ ] `pnpm-workspace.yaml`.
- [ ] lockfile.
- [ ] `.gitignore`.
- [ ] `.editorconfig`.
- [ ] Node version pin.
- [ ] pnpm version pin.
- [ ] `apps/api`.
- [ ] `services/tariff-engine-java`.
- [ ] `packages/contracts`.
- [ ] `infra`.
- [ ] `scripts`.

## API bootstrap

- [ ] NestJS 11.
- [ ] TypeScript strict.
- [ ] ConfigModule.
- [ ] env validation.
- [ ] global `/api` prefix.
- [ ] URI v1.
- [ ] validation pipe.
- [ ] Helmet.
- [ ] CORS allowlist.
- [ ] request ID.
- [ ] Problem Details base.
- [ ] live health.
- [ ] ready health base.

## Docker

- [ ] PostgreSQL 16.
- [ ] Redis 7.
- [ ] MinIO.
- [ ] health checks.
- [ ] named volumes.
- [ ] no production secrets.

## Verification

- [ ] `pnpm lint`.
- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `pnpm build`.
- [ ] `docker compose config`.
- [ ] `docker compose up -d`.
- [ ] live health 200.

Evidence:

```text
Branch:
Commit:
Commands:
Test result:
Open issues:
```

---

# 3. Faza 2 — Prisma i DB role

Status: `NOT_STARTED`

- [ ] Prisma 7 installed.
- [ ] `prisma.config.ts`.
- [ ] generated client path.
- [ ] module format consistent.
- [ ] `DATABASE_URL`.
- [ ] `MIGRATION_DATABASE_URL`.
- [ ] `copilot_migrator`.
- [ ] `copilot_app`.
- [ ] `NOBYPASSRLS`.
- [ ] runtime not owner.
- [ ] PrismaService singleton.
- [ ] DatabaseModule global.
- [ ] migration scripts.
- [ ] test database documented.

Verification:

- [ ] `prisma format`.
- [ ] `prisma validate`.
- [ ] migration on empty DB.
- [ ] runtime current_user test.
- [ ] runtime CREATE TABLE denied.
- [ ] owner query confirms migrator/owner.

Evidence:

```text
Migration:
Owner:
Runtime user:
Test output:
```

---

# 4. Faza 3 — Identity/practices

Status: `NOT_STARTED`

Normativno: D-033 i D-038; `02` §6.3, §6.3a, §22.2 i §23.2; `03` §10; `04` §5.2, §5.2.1 i §5.4.1.

Vlasnik migration paketa za sve schema stavke ove faze: **`002_identity_and_practices`**. Ne uvodi
se novi broj paketa.

## Schema

Paket: `002_identity_and_practices`.

- [ ] practices.
- [ ] users.
- [ ] practice_memberships.
- [ ] practice_settings.
- [ ] unique constraints.
- [ ] indexes.
- [ ] grants.

### `membership_role` enum

- [ ] enum `membership_role` postoji.
- [ ] enum sadrži tačno šest prihvaćenih tenant rola: `PRACTICE_ADMIN`, `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY`.

### `practice_memberships`

- [ ] `id`.
- [ ] `practice_id`.
- [ ] `user_id`.
- [ ] `professional_gln`.
- [ ] `active`.
- [ ] `created_at` i `updated_at`.
- [ ] `unique (practice_id, user_id)`.
- [ ] `unique (practice_id, id)`.
- [ ] **`practice_memberships` NEMA singularnu kolonu `role`** (D-038, klauzula 2).
- [ ] **Indeks `(practice_id, active, role)` ne postoji** — uklonjen zajedno sa kolonom.
- [ ] `(user_id, active)` indeks postoji.

### `practice_membership_roles`

- [ ] tabela postoji.
- [ ] `id`.
- [ ] `practice_id`.
- [ ] `membership_id`.
- [ ] `role membership_role`.
- [ ] `created_at` i `updated_at`.
- [ ] primarni ključ nad `id`.
- [ ] `unique (practice_id, id)`.
- [ ] `unique (practice_id, membership_id, role)`.
- [ ] composite FK `(practice_id, membership_id)` → `practice_memberships(practice_id, id)`.
- [ ] duplirana dodjela iste role istom membershipu je **odbijena**.
- [ ] dodjela koja referencira membership druge ordinacije je **odbijena**.
- [ ] jedan membership smije imati **nula, jednu ili više** role redova.
- [ ] **nijedan spekulativni indeks** nije kreiran — pokrivenost je dokazana u `02` §6.3 i §21.

## Životni ciklus dodjele rola

Normativno: D-038, klauzule 25–33; `02` §6.3a.

- [ ] `practice_membership_roles` čuva **isključivo trenutno efektivne dodjele**.
- [ ] tabela **nije** append-only history tabela.
- [ ] uklanjanje role **briše** trenutni red dodjele.
- [ ] ponovna dodjela iste role kasnije **kreira novi** red dodjele.
- [ ] `unique (practice_id, membership_id, role)` ostaje **neparcijalan**.
- [ ] historija dodjele i uklanjanja pripada **immutable audit dokazu**, ne zadržanim redovima.
- [ ] na `practice_membership_roles` **ne postoje** kolone `revoked_at`, `revoked_by`, `active`, `valid_from` ni `valid_to`.
- [ ] **`practice_memberships.active` je jedini flag aktivnosti membershipa.**
- [ ] role redovi neaktivnog membershipa **smiju ostati pohranjeni** i doprinose **nula** permisija.
- [ ] ponovna aktivacija membershipa vraća **isključivo** eksplicitno pohranjene trenutne role.
- [ ] aktivan membership sa nula rola daje **nula** tenant permisija.
- [ ] **generička runtime administracija rola ostaje izvan v1** — bez endpointa, permisije i bez `copilot_app` mutation granta.

## Seed

- [ ] demo practice.
- [ ] dev admin.
- [ ] dev physician.
- [ ] memberships.
- [ ] **eksplicitni `practice_membership_roles` redovi za svaki seed membership.**
- [ ] **najmanje jedan aktivan membership sa nula dodijeljenih rola** za negativne testove.
- [ ] seed se **ne oslanja** na singularnu `role` kolonu.
- [ ] settings.
- [ ] seed idempotent.

## API

- [ ] dev auth isolated.
- [ ] user resolution.
- [ ] `/me` vraća `memberships` i `platformRoles` kao dva odvojena bloka.
- [ ] `platformRoles` se ne pretvaraju u tenant membershipe.
- [ ] `practice_memberships` bez RLS-a u ovoj fazi — bootstrap politika pripada Fazi 4 (D-033).
- [ ] **effective-permission resolver postoji** i konzumira **prihvaćenu** matricu iz `15`; **ne hard-koduje** nijedan grant izvan nje (`04` §5.3, aktivnost 6).
- [ ] inactive user test.
- [ ] inactive membership test.

### `GET /me` ugovor

Normativno: `03` §10.

- [ ] svaki membership vraća `membershipId`.
- [ ] svaki membership vraća `practiceId`.
- [ ] svaki membership vraća `practiceName`.
- [ ] svaki membership vraća `active`.
- [ ] svaki membership vraća `roles[]`.
- [ ] svaki membership vraća izvedene `permissions[]`.
- [ ] **polje `memberships[].role` ne postoji.**
- [ ] `roles[]` sadrži nula, jednu ili više rola.
- [ ] vrijednosti u `roles[]` su **jedinstvene**.
- [ ] redoslijed u `roles[]` je **determinističan**.
- [ ] `roles[]` sadrži isključivo role tog tačnog membershipa.
- [ ] neaktivni membershipi **smiju** biti vidljivi.
- [ ] `platformRoles` ostaje **zaseban** top-level blok.
- [ ] `platformRoles` se **nikada** ne pojavljuju unutar `roles[]`.
- [ ] `permissions[]` se **izvodi**, ne čuva kao stanje membershipa.
- [ ] **nema compatibility dual polja** `role` + `roles`.
- [ ] membershipi ni role drugog korisnika **nikada** nisu izloženi.

## BLOCKED — D-OPEN-011

- [ ] Nema neograničenog ni generičkog runtime pristupa nad `users` i `practices`.
- [ ] Phase gate pada ako je takav pristup tiho uveden.
- [ ] Self-enumeracija vlastitih membership rola **nije** generički pristup nad `users`.
- [ ] Self-enumeracija vlastitih membership rola **nije** generički pristup nad `practices`.
- [ ] Self-enumeracija **nije** role administration.
- [ ] Self-enumeracija **nije** cross-practice administracija.
- [ ] Self-enumeracija **ne rješava D-OPEN-011** — status ostaje `BLOCKED`.

## Role matrica — prihvaćena

Preduslovi su ispunjeni: vlasničke odluke su prihvaćene, **D-039 do D-045 su zabilježeni**, a
**`15_ROLE_PERMISSION_MATRIX_V1.md` je kreiran i ACCEPTED**. Raniji blocker više ne važi.

### Normativni izvor

- [ ] `15_ROLE_PERMISSION_MATRIX_V1.md` **postoji** i status mu je **ACCEPTED**.
- [ ] `15` je **konsolidovana normativna v1 role-permission matrica**.
- [ ] `06` zadržava izvorne ADR-ove — D-023, D-032 i D-039 do D-045.
- [ ] `03` definiše **imena permisija koje endpointi traže**.
- [ ] `04` definiše **vlasništvo i sekvencu implementacije**.
- [ ] Role grantovi se **ne izvode** iz proznih primjera ni starije dokumentacije.
- [ ] Budući konflikt zahtijeva **ADR/dokument rekonsilijaciju**, nikada tiho tumačenje.

### Katalog permisija

- [ ] Postoji **tačno 32** aktivne permisije.
- [ ] Nijedna aktivna permisija nije **dodana, uklonjena, preimenovana, podijeljena ni spojena**.
- [ ] Postoje **tačno tri** rezervisane permisije: `analysis.run_tariff`, `configuration.manage`, `integration.manage`.
- [ ] Nijedna rezervisana permisija **nije aktivan red matrice**.
- [ ] Nijedna rezervisana permisija **nema produkcijski grant**.
- [ ] Nepoznata ili rezervisana permisija **pada zatvoreno**.

### Inventar rola

- [ ] Tenant role su tačno: `PRACTICE_ADMIN`, `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY`.
- [ ] Platform rola je tačno: `SYSTEM_ADMIN`.
- [ ] Database role su tačno: `copilot_app`, `copilot_migrator`, `copilot_system`.
- [ ] **Database role nisu kolone matrice.**
- [ ] **`SYSTEM_ADMIN` nije `copilot_system`.**
- [ ] `platformRoles` **nikada** ne ulaze u tenant kompoziciju.
- [ ] `SYSTEM_ADMIN` **ne dobija** nijedan automatski tenant pristup.
- [ ] **Database grant ne zadovoljava** permisiju endpointa.

### Reprezentacija matrice

- [ ] Implementacija predstavlja **tačno 32 reda** iz `15`.
- [ ] Svaka ćelija je jedno od: `ALLOW`, `DENY`, `CONDITIONAL`, `BLOCKED — D-OPEN-011`.
- [ ] Svaka aktivna permisija se pojavljuje **tačno jednom**.
- [ ] Svaki red ima **svih sedam** aplikacijskih role ćelija.
- [ ] Svaki `Source` se prati do **prihvaćenog ADR-a**.
- [ ] **Nema prazne, `OPEN` ni nepoznate** ćelije.
- [ ] Nijedna rezervisana permisija nije aktivan red.
- [ ] Implementacijski izlaz se **mehanički poredi** sa `15`.
- [ ] **Odstupanje od `15` obara build ili testove.**

Evidence:

```text
Migration paket: 002_identity_and_practices
Seed command:
API tests:
practice_membership_roles constraints:
GET /me response sample:
```

---

# 5. Faza 4 — Tenant/RLS

Status: `NOT_STARTED`

Normativno: D-033 i D-038; `02` §16.2, §17.3, §17.4, §20.2 i §22.13; `03` §3.7 i §28.5;
`04` §6.2, §6.4.1 i §6.4.2; `07` Faza 4.

Vlasnik migration paketa za sve RLS stavke ove faze: **`013_rls_policies`**. Schema objekti ostaju
u `002_identity_and_practices` (Faza 3). Ne uvodi se novi broj paketa.

## Schema i funkcije

- [ ] `app_security` schema.
- [ ] `set_user_context(p_user_id uuid)`.
- [ ] `set_request_context(p_practice_id uuid)` — tačno taj potpis.
- [ ] `set_request_context` je **SECURITY INVOKER**.
- [ ] `set_request_context` ne prima `p_user_id` ni bilo koji caller-provided identifikator korisnika.
- [ ] fixed search path na obje funkcije.
- [ ] public execute revoked na obje funkcije.
- [ ] **SECURITY DEFINER se ne koristi za zaobilaženje `practice_memberships` RLS-a.**

## Autentifikovani user context

- [ ] Bearer token validiran prije tenant bootstrapa.
- [ ] Autentifikovani aplikacijski korisnik rezolviran iz pouzdanih auth podataka.
- [ ] Identitet korisnika uspostavljen u transakciji/sesiji prije poziva `set_request_context`.
- [ ] Klijent ne može poslati ni pregaziti identitet korisnika kroz `set_request_context`.
- [ ] `set_user_context` je isključivo korak pouzdanog identiteta i nikada se ne puni iz request bodyja, query parametra ni `X-Practice-ID`.
- [ ] `set_user_context` se ne uklanja i ne preimenuje samo zato što `set_request_context` ne smije primati `user_id` — to su odvojene odgovornosti.

## Membership validacija

- [ ] `X-Practice-ID` se tretira samo kao nepouzdan traženi tenant identifikator.
- [ ] Tražena practice se prihvata tek nakon pronađenog aktivnog membershipa.
- [ ] Rezolucija membershipa koristi posebnu user-scoped `practice_memberships` bootstrap politiku.
- [ ] Bootstrap radi prije nego `app.practice_id` postoji.
- [ ] Normalna tenant RLS se ne koristi za bootstrap konteksta koji ta ista RLS zahtijeva.
- [ ] Nepostojeći membership mapira se na `403`.
- [ ] Neaktivan membership mapira se na `403`.
- [ ] Neuspjeh bootstrapa ne ostavlja upotrebljiv tenant context.
- [ ] **`practice_membership_roles` NIJE potreban** za provjeru postojanja membershipa (D-038, klauzule 20–21).
- [ ] `set_request_context` **ne čita** `practice_membership_roles`.
- [ ] `set_request_context` ne prima ni `user_id` ni rolu.
- [ ] **Aktivan membership sa nula rola SMIJE uspostaviti tenant context.**
- [ ] Takav membership dobija **`403`** na svakoj permission-gated tenant ruti.

## RLS za `practice_membership_roles`

Paket: `013_rls_policies`. Normativno: `02` §17.4; D-038, klauzule 22–23.

- [ ] `ENABLE ROW LEVEL SECURITY`.
- [ ] `FORCE ROW LEVEL SECURITY`.
- [ ] SELECT politika za self-enumeraciju autentifikovanog korisnika postoji.
- [ ] Politika radi **prije** nego `app.practice_id` postoji.
- [ ] Politika izvodi identitet korisnika iz pouzdanog `app.user_id`.
- [ ] Politika se spaja kroz vlastite `practice_memberships` redove tog korisnika.
- [ ] Politika smije vlasniku izložiti **trenutne role neaktivnih membershipa**.
- [ ] Neaktivan membership i dalje **ne autorizuje** nijednu tenant operaciju.
- [ ] Role redovi drugog korisnika su **odbijeni**.
- [ ] Cross-practice curenje je **odbijeno**.
- [ ] SELECT politika **ne dozvoljava** INSERT, UPDATE ni DELETE.
- [ ] **Nema SECURITY DEFINER bypassa.**
- [ ] SECURITY INVOKER kompatibilnost je zadržana.
- [ ] **D-OPEN-011 ostaje neriješen** — ova politika ga ne zatvara.

## RLS za `review_decision_change_links`

Paket: `013_rls_policies`. Normativno: `02` §13.2a, §18.1 i §22.13; D-046, klauzule 25–33.

- [ ] `ENABLE ROW LEVEL SECURITY`.
- [ ] `FORCE ROW LEVEL SECURITY`.
- [ ] Standardna tenant politika `practice_id = app.practice_id`.
- [ ] **Nijedan bootstrap izuzetak se ne primjenjuje** — tenant context mora već biti uspostavljen.
- [ ] `copilot_app` ima **isključivo** `SELECT` i `INSERT`.
- [ ] `copilot_app` **nema** `UPDATE` grant.
- [ ] `copilot_app` **nema** `DELETE` grant.
- [ ] `copilot_system` **nema** nijedan automatski grant (D-023).
- [ ] `PUBLIC` **nema** nijedan grant.
- [ ] Owner ostaje `copilot_migrator`.
- [ ] Cross-tenant čitanje je **odbijeno**.
- [ ] Vlasnik paketa je `013_rls_policies`; **ne uvodi se novi broj paketa**.

## Database grants

Normativno: `02` §20.2.

- [ ] `copilot_migrator` je owner i kreira tabelu kroz migraciju.
- [ ] `copilot_app` ima **isključivo** RLS-zaštićeni runtime SELECT.
- [ ] `copilot_app` **nema** generički role-assignment mutation pristup.
- [ ] `copilot_app` **nema** DELETE za uklanjanje role kroz trenutni runtime put.
- [ ] `copilot_system` **nema** nijedan automatski grant nad tenant tabelom.
- [ ] `PUBLIC` **nema** nijedan grant.
- [ ] **Database role nisu aplikacijske role.**
- [ ] **`SYSTEM_ADMIN` nije `copilot_system`** — platform aplikacijska rola naspram database role.

## Redoslijed autorizacije

Normativno: `03` §3.7.1; `04` §6.2.1. Svaka granica se dokazuje **zasebno**.

- [ ] 1. bearer token je autentifikovan.
- [ ] 2. pouzdani `app.user_id` je izveden iz verifikovanog subjekta.
- [ ] 3. `X-Practice-ID` je pročitan i validiran.
- [ ] 4. `set_request_context(p_practice_id uuid)` je pozvan.
- [ ] 5. aktivan `practice_memberships` red je validiran.
- [ ] 6. transakcijski lokalni tenant context je uspostavljen.
- [ ] 7. dodijeljene tenant role su učitane.
- [ ] 8. efektivne permisije su izvedene.
- [ ] 9. tražena permisija i prihvaćeni uslovi su evaluirani.
- [ ] 10. komanda je izvršena pod tenant RLS-om.

## Kompozicija efektivnih permisija

Normativno: D-038, klauzule 7–11 i 16–18; `03` §28.5; `04` §6.4.1.

- [ ] Efektivne permisije se izvode iz **svih** rola dodijeljenih odabranom aktivnom membershipu.
- [ ] Unija je ograničena na **jednu ordinaciju**.
- [ ] `DENY` **ne doprinosi** grant.
- [ ] `DENY` **ne poništava** `ALLOW` druge dodijeljene tenant role.
- [ ] **Nema implicitnog nasljeđivanja rola.**
- [ ] **Nema per-user permission overrida.**
- [ ] Neaktivan membership doprinosi **nula** permisija.
- [ ] Aktivan membership sa nula rola doprinosi **nula** permisija.
- [ ] Autorizacija je **deny-by-default**.
- [ ] Uslovna permisija zahtijeva podobnu tenant rolu **i** prihvaćenu practice postavku ili runtime uslov.
- [ ] `platformRoles` **nikada** ne doprinose tenant permission uniji.
- [ ] `SYSTEM_ADMIN` bez aktivnog tenant membershipa dobija **`403`** na tenant rutama.
- [ ] **Svaki grant dolazi iz prihvaćene matrice u `15`**; resolver je učitava, a nijedan grant nije hard-kodiran izvan nje.
- [ ] Duplirani grantovi iz dvije role **kolabiraju** u jednu efektivnu permisiju.
- [ ] Trenutne role se učitavaju iz `practice_membership_roles` za **odabrani aktivni membership**.
- [ ] **Caller-supplied rola se nikada ne prihvata.**

## Transaction-local context

- [ ] `app.user_id` uspostavljen iz pouzdanog auth stanja.
- [ ] `app.practice_id` postavljen tek nakon uspješne membership validacije.
- [ ] Tenant context je transakcijski lokalan.
- [ ] interactive transaction.
- [ ] Tenant-scoped upiti se izvršavaju tek nakon uspješnog bootstrapa.
- [ ] Context se automatski čisti na kraju transakcije.
- [ ] Pooled konekcija ne nasljeđuje context prethodnog requesta.
- [ ] Failure i rollback putanje ne propuštaju `app.practice_id`.

## Platform i tenant razdvajanje

- [ ] `platformRoles` se obrađuju odvojeno od tenant membershipa.
- [ ] `platformRoles` se ne pretvaraju automatski u tenant permisije.
- [ ] Tenant membershipi i platform role se ne spajaju unijom.
- [ ] Platform/system context se ne uspostavlja kroz `set_request_context`.
- [ ] Tenant role dolaze **isključivo** iz `practice_membership_roles`.
- [ ] `SYSTEM_ADMIN` sa aktivnim membershipom izvodi tenant permisije **samo** iz dodijeljenih tenant rola.
- [ ] `tariff.manage` ostaje platform permisija i platform ruta.
- [ ] `integration.read` ostaje tenant-scoped i ograničen na `PRACTICE_ADMIN`.
- [ ] **Database grant nikada ne zamjenjuje permisiju endpointa.**

## BLOCKED — D-OPEN-011

- [ ] **BLOCKED** — generički runtime pristup nad `users` i `practices` se ne implementira dok D-OPEN-011 ne bude prihvaćen.
- [ ] `practice_memberships` bootstrap pristup ne rješava opšti runtime pristup nad `users`.
- [ ] `practice_memberships` bootstrap pristup ne rješava opšti runtime pristup nad `practices`.
- [ ] Phase gate pada ako implementacija tiho uvede neograničen pristup nad bilo kojom od te dvije tabele.
- [ ] Self-enumeracija vlastitih membership rola (§17.4) **ne rješava D-OPEN-011**.

## Role matrica — prihvaćene dodjele

Normativni izvor: `15` §5; izvorne odluke D-023, D-032 i D-039 do D-045.

### Dodjele sa najvećim rizikom

- [ ] `integration.read` → `PRACTICE_ADMIN` only.
- [ ] `tariff.manage` → `SYSTEM_ADMIN` only (platform).
- [ ] `tariff.raw_result.read` → `PRACTICE_ADMIN` only.
- [ ] `audit.read` → `PRACTICE_ADMIN` + `AUDITOR`.
- [ ] `audit.export` → `PRACTICE_ADMIN` + `AUDITOR`.
- [ ] `encounter.close` → `PRACTICE_ADMIN` + `PHYSICIAN` + `BILLING_SPECIALIST`.
- [ ] `analysis.review_decision` → `PHYSICIAN` + `BILLING_SPECIALIST`.
- [ ] `analysis.export` → `PHYSICIAN` + `BILLING_SPECIALIST`.
- [ ] `analysis.export.read` → `PHYSICIAN` + `BILLING_SPECIALIST`.
- [ ] `finding.resolve` → `PHYSICIAN` only.
- [ ] `encounter.cancel` → `PHYSICIAN` only.
- [ ] `analysis.cancel` → `PHYSICIAN` + `MPA`.
- [ ] `encounter.document.archive` → `PHYSICIAN` only.

### Negativne provjere

- [ ] `PRACTICE_ADMIN` sam po sebi **nema nijednu kliničku ovlast**.
- [ ] `AUDITOR` **ne pregleda** encountere, analize ni sirovi tarifni rezultat.
- [ ] `READ_ONLY` ima **nula `ALLOW`** i **nula `CONDITIONAL`**.
- [ ] `SYSTEM_ADMIN` **nema nijednu tenant permisiju** kroz platform rolu.
- [ ] `MPA` **nema** `analysis.review_decision`.
- [ ] `PRACTICE_ADMIN` sam po sebi **ne odobrava i ne opoziva** odobrenje.

### Baseline workflow

Vrijednosti se **mehanički porede** sa `15`; ne izvode se iz naziva role.

- [ ] `patient_reference.read` odgovara `15`.
- [ ] `patient_reference.create` odgovara `15`.
- [ ] `encounter.read` odgovara `15`.
- [ ] `encounter.create` odgovara `15`.
- [ ] `encounter.update` odgovara `15`.
- [ ] `encounter.document.list` odgovara `15`.
- [ ] `encounter.document.read` odgovara `15`.
- [ ] `encounter.document.create` odgovara `15`.
- [ ] `analysis.read` odgovara `15`.
- [ ] `analysis.run` odgovara `15`.

### Uslovno odobravanje i opoziv

Normativno: D-041; `03` §10 i §20; `15` §6.

- [ ] `analysis.approve` — `PHYSICIAN` `ALLOW`.
- [ ] `analysis.approve` — `MPA` `CONDITIONAL` uz `allow_mpa_approval = true`.
- [ ] `analysis.approve` — `BILLING_SPECIALIST` `CONDITIONAL` uz `allow_billing_specialist_approval = true`.
- [ ] `analysis.approve` — sve ostale role `DENY`.
- [ ] `analysis.approval.revoke` ima **identične role ćelije** kao `analysis.approve`.
- [ ] Flag **bez** odgovarajuće role **ne daje** permisiju.
- [ ] Rola **bez** uključenog flaga je **odbijena**.
- [ ] **Neaktivan membership je odbijen** i kada je flag uključen.
- [ ] Podobnost se evaluira **u trenutku opoziva**.
- [ ] **Opozivalac ne mora biti originalni odobravatelj.**
- [ ] `reason` je **obavezan**.
- [ ] Dokaz odobrenja se **nikada ne briše**.
- [ ] Approval historija ostaje **immutable**.
- [ ] **Revocation audit event** je emitovan.

## Profili rola

### AUDITOR

- [ ] `audit.read` `ALLOW`.
- [ ] `audit.export` `ALLOW`.
- [ ] Sve ostale aktivne permisije `DENY`.
- [ ] `practice.read` ostaje `BLOCKED — D-OPEN-011`.
- [ ] **Nema discovery ni listing endpointa.**

### READ_ONLY

- [ ] **Nula `ALLOW`.**
- [ ] **Nula `CONDITIONAL`.**
- [ ] `practice.read` ostaje `BLOCKED — D-OPEN-011`.
- [ ] Sve ostale aktivne permisije `DENY`.

### PRACTICE_ADMIN

- [ ] `practice.settings.read`.
- [ ] `practice.settings.manage`.
- [ ] `encounter.close`.
- [ ] `tariff.raw_result.read`.
- [ ] `audit.read`.
- [ ] `audit.export`.
- [ ] `integration.read`.
- [ ] **Nema kliničkog pristupa** osim ako je zasebno dodijeljena druga prihvaćena tenant rola.

## Endpoint authorization guards

- [ ] Tražena permisija dolazi iz `03`.
- [ ] Podobnost role dolazi iz `15`.
- [ ] Guard koristi **centralizovani effective-permission resolver**.
- [ ] Kod endpointa **ne hard-koduje** alternativnu listu rola.
- [ ] Uslovi se provjeravaju **nakon** rezolucije membershipa i rola.
- [ ] **RLS ostaje nezavisan drugi sloj**, ne zamjena za provjeru permisije.

Negativne provjere:

- [ ] nedostajuća permisija → `403`.
- [ ] neaktivan membership → `403`.
- [ ] membership sa nula rola → `403`.
- [ ] samo `SYSTEM_ADMIN` na tenant ruti → `403`.
- [ ] injekcija role → odbijena.
- [ ] rola iz druge ordinacije → ne doprinosi.
- [ ] isključen approval flag → `403`.
- [ ] cross-user curenje rola → odbijeno.
- [ ] cross-practice curenje rola → odbijeno.

## Granice — izvan v1

Klasifikacija je prihvaćena u D-045. **Za ove stavke se ne otvaraju implementacijski zadaci.**

`OUT OF V1`:

- [ ] kreiranje membershipa — **ne implementira se**.
- [ ] deaktivacija membershipa — **ne implementira se**.
- [ ] administracija membershipa — **ne implementira se**.
- [ ] dodjela role — **ne implementira se**.
- [ ] uklanjanje role — **ne implementira se**.
- [ ] generička runtime administracija rola — **ne implementira se**.
- [ ] cross-practice support pristup — **ne implementira se**.
- [ ] otkazivanje export joba — **ne implementira se**.

`REQUIRES NEW PERMISSION AND ADR`:

- [ ] generička platform administracija izvan `tariff.manage`.
- [ ] `AUDITOR` discovery/listing endpoint.
- [ ] podjela `analysis.review_decision`.
- [ ] podjela `analysis.export.read`.
- [ ] finija permisija za rješavanje findinga.

## Guard i servisi

- [ ] PracticeContext guard.
- [ ] TenantDatabaseService.
- [ ] RLS enabled.
- [ ] FORCE RLS.

## Testovi

- [ ] Validan aktivan membership uspostavlja tenant context.
- [ ] Nepostojeći membership vraća `403`.
- [ ] Neaktivan membership vraća `403`.
- [ ] Pozivalac ne može impersonirati drugog korisnika kroz parametar funkcije.
- [ ] `X-Practice-ID` sam po sebi ne autorizuje tenant pristup.
- [ ] Tenant-scoped upit prije bootstrapa pada.
- [ ] SECURITY INVOKER ne zaobilazi membership RLS.
- [ ] Neuspjeh bootstrapa ne ostavlja `app.practice_id`.
- [ ] Context nestaje nakon završetka transakcije.
- [ ] Pooled konekcija ne dobija context prethodnog requesta.
- [ ] `platformRoles` ne kreiraju tenant membership.
- [ ] Opšti runtime pristup nad `users`/`practices` ostaje blokiran do D-OPEN-011.
- [ ] no-context default deny.
- [ ] pooled connection leakage test.
- [ ] inactive membership denied.
- [ ] Practice A/B read isolation.
- [ ] Practice A/B write isolation.
- [ ] runtime role cannot bypass.

## Fixtures — D-038

- [ ] membership sa **nula** rola.
- [ ] membership sa **jednom** rolom.
- [ ] membership sa **više** rola.
- [ ] korisnik sa `PRACTICE_ADMIN` **i** `PHYSICIAN` u istoj ordinaciji.
- [ ] **isti korisnik sa drugačijim skupom rola** u drugoj ordinaciji.
- [ ] neaktivan membership koji **zadržava** svoje role redove.
- [ ] pokušaj duplirane dodjele iste role.
- [ ] pokušaj cross-practice dodjele koji krši composite FK.
- [ ] `SYSTEM_ADMIN` **bez** tenant membershipa.
- [ ] `SYSTEM_ADMIN` **sa** zasebnim tenant membershipom.
- [ ] korisnik **bez ijednog** membershipa.
- [ ] `PRACTICE_ADMIN` **bez** `PHYSICIAN`.
- [ ] `AUDITOR`.
- [ ] `READ_ONLY`.
- [ ] uslovni approval flagovi u oba stanja — uključeni i isključeni.
- [ ] Fixture **ne zavise od redoslijeda izvršavanja**.

## Testovi — D-038

- [ ] schema constraint testovi.
- [ ] RLS self-enumeracija.
- [ ] odbijanje pristupa rolama drugog korisnika.
- [ ] odbijanje cross-practice pristupa.
- [ ] **determinističan redoslijed `roles[]`**.
- [ ] **odsustvo polja `memberships[].role`**.
- [ ] unija permisija za membership sa više rola.
- [ ] `DENY` u jednoj roli **ne poništava** `ALLOW` iz druge.
- [ ] zero-role membership — **deny-by-default**.
- [ ] neaktivan membership — odbijen na tenant rutama.
- [ ] razdvajanje platform i tenant klase rola.
- [ ] **odbijanje injekcije role** kroz request body, query parametar, header i argument database funkcije.
- [ ] uklanjanje role, pa **uspješna ponovna dodjela** iste role.
- [ ] zahtjevi za audit dokazom budućeg assignment/removal puta (`ASSIGNED` / `REMOVED`).
- [ ] **conformance test** — implementacijska matrica se mehanički poredi sa `15` i **odstupanje obara test**.
- [ ] testovi tvrde **isključivo prihvaćene ćelije iz `15`** i ništa izvan njih.

Gate:

- [ ] **ALL RLS TESTS GREEN — required before phase 5.**

D-038 gate — svaka stavka mora biti **dokazano ispunjena** prije nego što se faza smatra
završenom. Nijedan checkbox se ne označava bez izvršene provjere.

- [ ] singularna kolona `practice_memberships.role` **ne postoji**;
- [ ] tabela `practice_membership_roles` i svi njeni constrainti **postoje**;
- [ ] vlasništvo paketa je **identično** onome u `02` i `04`;
- [ ] RLS self-enumeracija **ne izlaže** role redove drugog korisnika;
- [ ] `GET /me` vraća `roles[]`, **nikada** `role`;
- [ ] tenant i platform role se **ne spajaju** unijom;
- [ ] membership sa nula rola **ne dobija** nijednu tenant permisiju;
- [ ] neaktivan membership **ne autorizuje** nijednu tenant rutu;
- [ ] duplirana i cross-practice dodjela role **padaju**;
- [ ] injekcija role **nije moguća**;
- [ ] generički `users`/`practices` pristup zavisan od D-OPEN-011 **nije implementiran** bez prihvaćene odluke;
- [ ] implementacijska matrica **ne odstupa** od `15`;
- [ ] broj aktivnih permisija je **32**;
- [ ] broj rezervisanih permisija je **3**;
- [ ] nijedna rezervisana permisija **nema grant**;
- [ ] nijedan `Source` u matrici **ne nedostaje** i svaki je **prihvaćen**;
- [ ] nijedna role ćelija nije **prazna ni nepoznata**;
- [ ] `DENY` **ne poništava** `ALLOW`;
- [ ] `platformRoles` **ne ulaze** u tenant uniju;
- [ ] `READ_ONLY` **ne dobija** nijedan grant;
- [ ] `AUDITOR` **ne dobija** treću permisiju;
- [ ] `PRACTICE_ADMIN` **ne dobija** klinički pristup automatski;
- [ ] podobnost za `analysis.approve` i `analysis.approval.revoke` je **identična**;
- [ ] `encounter.close` ima **sve tri** prihvaćene role;
- [ ] endpoint guardovi **ne odstupaju** od `03` ni od `15`.

Evidence:

```text
Policies:
Tables:
Migration paket: 013_rls_policies
Test command:
Test result:
Role matrica conformance (vs docs/15):
```

---

# 6. Faza 5 — Encounter/documents

Status: `NOT_STARTED`

## Schema

- [ ] patient_references.
- [ ] encounters.
- [ ] encounter_diagnoses.
- [ ] storage_objects.
- [ ] encounter_documents.
- [ ] composite FK.
- [ ] RLS.
- [ ] indexes.
- [ ] checks.

## Services

- [ ] pseudonym generator.
- [ ] external ID HMAC.
- [ ] encryption interface.
- [ ] local encryption implementation.
- [ ] text normalization.
- [ ] redaction.
- [ ] state machine.
- [ ] idempotency service.
- [ ] optimistic locking.
- [ ] audit.
- [ ] outbox base.

## API

- [ ] POST patient reference.
- [ ] GET patient reference.
- [ ] POST encounter.
- [ ] GET encounter list.
- [ ] GET encounter detail.
- [ ] PATCH encounter.
- [ ] cancel encounter.
- [ ] POST text document.
- [ ] list documents.
- [ ] read redacted.
- [ ] read original permission.
- [ ] archive.

## Tests

- [ ] unknown field rejected.
- [ ] duplicate idempotency.
- [ ] idempotency conflict.
- [ ] stale ETag.
- [ ] cross-tenant GET.
- [ ] cross-tenant FK.
- [ ] document read audit.
- [ ] no text in logs.

Evidence:

```text
Migration:
Endpoints:
Tests:
```

---

# 7. Faza 6 — Tariff releases

Status: `NOT_STARTED`

- [ ] system storage table.
- [ ] tariff_releases.
- [ ] artifacts.
- [ ] catalog entries.
- [ ] activation history.
- [ ] one-active index.
- [ ] package SHA-256.
- [ ] validation command.
- [ ] activation transaction.
- [ ] admin permission.
- [ ] audit.
- [ ] mock release seed.
- [ ] two-active negative test.

Evidence:

```text
Migration:
Active release:
Test:
```

---

# 8. Faza 7 — Analysis/queue

Status: `NOT_STARTED`

- [ ] ai_prompt_versions.
- [ ] analysis_runs.
- [ ] input snapshots.
- [ ] async_jobs.
- [ ] outbox final.
- [ ] analysis state machine.
- [ ] revision numbering.
- [ ] POST analysis.
- [ ] response 202.
- [ ] BullMQ connection.
- [ ] queue registration.
- [ ] outbox publisher.
- [ ] SKIP LOCKED.
- [ ] processor.
- [ ] job status API.
- [ ] Redis outage test.
- [ ] duplicate publisher test.
- [ ] immutable snapshot test.
- [ ] no medical text in job payload.

Evidence:

```text
Migration:
Queue:
Tests:
```

---

# 9. Faza 8 — Mock AI/Tariff

Status: `NOT_STARTED`

- [ ] ai_extraction_runs.
- [ ] extracted_facts.
- [ ] service_candidates.
- [ ] candidate_evidence.
- [ ] tariff_evaluations.
- [ ] tariff_evaluation_items.
- [ ] tariff_messages.
- [ ] AI provider interface.
- [ ] mock AI.
- [ ] output schema.
- [ ] invalid schema test.
- [ ] tariff client interface.
- [ ] mock tariff client.
- [ ] request hash.
- [ ] response hash.
- [ ] pipeline checkpoints.
- [ ] retry no duplicates.
- [ ] workspace endpoint.
- [ ] deterministic fixture.

Evidence:

```text
Migration:
Fixture:
Pipeline test:
```

---

# 10. Faza 9 — Safety rules

Status: `NOT_STARTED`

- [ ] safety_rules.
- [ ] versions.
- [ ] findings.
- [ ] evidence.
- [ ] rule interface.
- [ ] registry.
- [ ] duration rule.
- [ ] performer role rule.
- [ ] duplicate rule.
- [ ] tariff release rule.
- [ ] evidence rule.
- [ ] approval readiness.
- [ ] finding dedup.
- [ ] accepted risk policy.
- [ ] findings API.
- [ ] cross-tenant finding test.

Evidence:

```text
Migration:
Rules:
Tests:
```

---

# 11. Faza 10 — Review/approval

Status: `NOT_STARTED`

Vlasnik migration paketa: **`009_review_approvals`** (schema) i **`013_rls_policies`** (RLS).
Ne uvodi se novi broj paketa.

- [ ] review_decisions.
- [ ] review_item_changes.
- [ ] review_decision_change_links.
- [ ] approvals.
- [ ] correction endpoint.
- [ ] correction reason.
- [ ] revision required logic.
- [ ] finding resolution.
- [ ] approval row lock.
- [ ] approval readiness.
- [ ] canonical payload.
- [ ] payload hash.
- [ ] immutable trigger.
- [ ] revoke.
- [ ] double approval concurrency test.
- [ ] blocker prevents approval.
- [ ] approved edit fails.
- [ ] revoke history preserved.

## Schema — D-046

Normativno: `02` §13.1, §13.2, §13.2a, §22.9 i §25.2.2; D-046, klauzule 13–33.

- [ ] `review_item_changes.analysis_run_id` postoji i je `not null`.
- [ ] `review_item_changes` **nema** kolonu `review_decision_id` — ni nullable ni obaveznu.
- [ ] **Ne postoji** composite FK `review_item_changes` → `review_decisions`.
- [ ] Composite FK `review_item_changes (practice_id, analysis_run_id)` → `analysis_runs (practice_id, id)`.
- [ ] Composite FK `review_decisions (practice_id, analysis_run_id)` → `analysis_runs (practice_id, id)`.
- [ ] Kandidat ključ `review_decisions unique (practice_id, analysis_run_id, id)`.
- [ ] Kandidat ključ `review_item_changes unique (practice_id, analysis_run_id, id)`.
- [ ] Tabela `review_decision_change_links` postoji.
- [ ] Ima **tačno** kolone `id`, `practice_id`, `analysis_run_id`, `review_decision_id`, `review_item_change_id` i `created_at`, sve `not null`.
- [ ] `primary key (id)`.
- [ ] `unique (practice_id, id)`.
- [ ] `unique (practice_id, review_decision_id, review_item_change_id)`.
- [ ] Composite FK `(practice_id, analysis_run_id, review_decision_id)` → `review_decisions (practice_id, analysis_run_id, id)`.
- [ ] Composite FK `(practice_id, analysis_run_id, review_item_change_id)` → `review_item_changes (practice_id, analysis_run_id, id)`.
- [ ] **Oba** trokolonska FK-a navode `NO ACTION` i za `ON DELETE` **i** za `ON UPDATE`.
- [ ] `unique (practice_id, review_item_change_id)` se **ne dodaje**.
- [ ] Append-only grantovi: `SELECT` i `INSERT`, **bez** `UPDATE` i **bez** `DELETE`.
- [ ] **Nijedan spekulativni samostalni indeks se ne kreira** (`02` §21).
- [ ] Schema objekti pripadaju paketu `009_review_approvals`; RLS objekti paketu `013_rls_policies`.

## Transakcija i pokrivenost — D-046

Normativno: `02` §13.2a.1; `04` §12.3.1; D-046, klauzule 34–52.

- [ ] Correction transakcija zauzima `analysis_runs … FOR UPDATE` **prva**.
- [ ] Decision transakcija zauzima **isti** lock **prva**.
- [ ] Granica pokrivenosti nastaje u trenutku kada decision transakcija zauzme taj lock.
- [ ] Odluka bira **sve** `review_item_changes` redove sa istim `practice_id` i `analysis_run_id`.
- [ ] Već povezane korekcije se **ne filtriraju**.
- [ ] Korekcija commitovana prije granice je **uključena**.
- [ ] Konkurentna correction transakcija **čeka**.
- [ ] Korekcija commitovana nakon granice je **isključena** iz tekuće odluke.
- [ ] Kasnija odluka smije povezati istu korekciju.
- [ ] Odluka sa **nula** povezanih korekcija uspijeva.
- [ ] Jedna korekcija smije biti povezana sa **više** odluka.
- [ ] Odluka, linkovi i audit su **jedna atomarna transakcija**.
- [ ] Neuspjeh rollback-uje sve — bez parcijalne odluke, linka ni audit reda.
- [ ] Retry **ne duplira** linkove iste odluke.
- [ ] Korekcija je perzistirana **prije i bez** ijedne odluke.
- [ ] **Naknadni `UPDATE` se ne koristi** za povezivanje korekcije sa odlukom.
- [ ] `POST /analyses/{id}/decisions` **ne prima** polje sa correction ID-evima.
- [ ] Nema izmjene request ni response payloada.
- [ ] D-029 `version` / `If-Match` ponašanje je **nepromijenjeno**.

## Verifikacija inventara — D-046

- [ ] Inventar tenant tabela je **tačno 30** (`02` §2.5 i §18.1).
- [ ] Inventar deklarisanih composite FK-ova je **tačno 14** (`02` §28.1).
- [ ] Nijedan novi endpoint, payload polje, permisija, rola, state tranzicija, API error kod ni migration paket nije uveden.

Evidence:

```text
Migration:
RLS:
Coverage boundary:
Approval hash:
Tests:
```

---

# 12. Faza 11 — Export/audit package

Status: `NOT_STARTED`

- [ ] integration_connections.
- [ ] external links.
- [ ] export_jobs.
- [ ] adapter interface.
- [ ] ManualAdapter.
- [ ] manual JSON artifact.
- [ ] export worker.
- [ ] approval hash check.
- [ ] retry.
- [ ] audit timeline.
- [ ] audit package JSON.
- [ ] PDF job decision.
- [ ] no approval negative test.
- [ ] revoked approval negative test.
- [ ] duplicate retry test.

Evidence:

```text
Migration:
Artifact:
Tests:
```

---

# 13. Faza 12 — Hardening

Status: `NOT_STARTED`

- [ ] OpenAPI 3.1 generated.
- [ ] contract validation.
- [ ] client generation smoke.
- [ ] Problem Details complete.
- [ ] rate limiting.
- [ ] ready health.
- [ ] structured logs.
- [ ] log redaction.
- [ ] no PHI log test.
- [ ] CI pipeline.
- [ ] migration deploy CI.
- [ ] RLS suite CI.
- [ ] e2e CI.
- [ ] dependency scan.
- [ ] backup script.
- [ ] restore test.
- [ ] release smoke.
- [ ] milestone report.
- [ ] docs synchronized.

Evidence:

```text
OpenAPI hash:
CI run:
Backup/restore:
Final commit:
```

---

# 14. External integration gates

## AI production

- [ ] provider selected.
- [ ] DPA/privacy review.
- [ ] retention/training disabled/defined.
- [ ] region approved.
- [ ] redaction verified.
- [ ] extraction baseline.
- [ ] cost limits.
- [ ] timeout/retry.

## OAAT

- [ ] license.
- [ ] official package.
- [ ] release version.
- [ ] Java wrapper.
- [ ] baseline cases.
- [ ] contract tests.
- [ ] deployment rights.

## Axenita

- [ ] partnership.
- [ ] API contract.
- [ ] sandbox.
- [ ] auth.
- [ ] import scope.
- [ ] write-back scope.
- [ ] webhook verification.
- [ ] reconciliation.
- [ ] audit attachment.

---

# 15. Production pilot gate

- [ ] OIDC production.
- [ ] MFA.
- [ ] Swiss hosting approved.
- [ ] secrets manager.
- [ ] KMS.
- [ ] TLS.
- [ ] DB encryption.
- [ ] backup encryption.
- [ ] restore test.
- [ ] retention.
- [ ] DPIA/legal review.
- [ ] incident response.
- [ ] monitoring/alerts.
- [ ] penetration/security review.
- [ ] support/runbook.
- [ ] rollback plan.

---

# 16. Dokumentacijska sekvenca — role-permission model

Već usklađeno:

- [x] `06_DECISION_LOG.md` — D-039 do D-045 **ACCEPTED**.
- [x] `15_ROLE_PERMISSION_MATRIX_V1.md` — **kreiran i ACCEPTED**.
- [x] `03_API_CONTRACT_V1.md` — usklađen sa `15`.
- [x] `04_BACKEND_IMPLEMENTATION_PLAN_V1.md` — usklađen sa `15`.
- [x] `05_IMPLEMENTATION_CHECKLIST.md` — ovaj dokument, usklađen sa `15`.

Čeka kontrolisani batch:

- [ ] `07_CURSOR_PHASE_PROMPTS.md`.
- [ ] `08_TEST_STRATEGY_V1.md`.
- [ ] `MANIFEST.md`.

Dok ta tri dokumenta ne budu usklađena, njihove `BLOCKED` oznake za produkcijske role grantove
ostaju na snazi i **ne uklanjaju se iz ovog dokumenta**.

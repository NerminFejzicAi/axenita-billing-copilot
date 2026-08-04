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
- [ ] **effective-permission resolver postoji kao interface** koji konzumira buduću matricu iz `docs/15`; **ne hard-koduje** nijedan grant (`04` §5.3, aktivnost 6).
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

## BLOCKED — role matrica

- [ ] **BLOCKED** — nijedan konkretan role-to-permission grant se ne implementira dok Q1–Q9 ne budu prihvaćeni, D-039 do D-045 zabilježeni i `docs/15` kreiran. Vidi §5, sekcija `BLOCKED — role matrica`.

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
- [ ] **Nijedan grant koji pripada D-039 do D-045 ili `docs/15` nije hard-kodiran.**

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

## BLOCKED — role matrica

- [ ] **BLOCKED** — finalna role-to-permission implementacija ostaje blokirana dok:
      **(a)** vlasničke odluke Q1–Q9 ne budu prihvaćene;
      **(b)** D-039 do D-045 ne budu zabilježeni;
      **(c)** `docs/15` ne bude kreiran.
- [ ] Do tada resolver koristi **praznu ili test-only matricu**, nikada pogođene grantove.
- [ ] Nijedan test ne tvrdi konkretan `PHYSICIAN` ili `PRACTICE_ADMIN` grant koji još nije prihvaćen.

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
- [ ] uslovni approval flagovi u oba stanja — uključeni i isključeni.

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
- [ ] **BLOCKED** — testovi koji zahtijevaju konkretan grant po roli ostaju blokirani do D-039 do D-045 i `docs/15`; očekivani grantovi se **ne izmišljaju**.

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
- [ ] generički `users`/`practices` pristup zavisan od D-OPEN-011 **nije implementiran** bez prihvaćene odluke.

Evidence:

```text
Policies:
Tables:
Migration paket: 013_rls_policies
Test command:
Test result:
Role matrica status: BLOCKED (D-039 … D-045, docs/15)
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

- [ ] review_decisions.
- [ ] review_item_changes.
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

Evidence:

```text
Migration:
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

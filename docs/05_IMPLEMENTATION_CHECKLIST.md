# 05 — Implementation Checklist

**Uputstvo:** Checkbox se označava samo ako postoji izvršena provjera ili konkretan dokaz.  
**Status vrijednosti:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

---

# 0. Project metadata

| Polje | Vrijednost |
|---|---|
| Current phase | Faza 1 — `DONE`; Ecosystem Compatibility Audit `DONE`; Faza 2 — `DONE`; **D-OPEN-011 decision gate — `DONE` (D-047 prihvaćen 2026-08-12)**; **D-047 dokumentaciona rekonsilijacija — `DONE`, merged u kanonski `main` (PR #7)**; **D-048–D-051 governance gate — `DONE`, merged u kanonski `main` (PR #10)**; **Faza 3 — `DONE`, merged u kanonski `main` (PR #12, merge commit `5c2786d`) (§4)**; **Faza 4 — `DONE`, zatvorena (§5)**; **P4-5D je `MERGED` u kanonski `main` (PR #20)**; **retrospektivni evidence gate `P4-013` — `COMPLETE`** (`UNRESOLVED_REQUIRED = 0`, `SECURITY_CLOSURE_BLOCKERS = 0`; §5, „Gate zatvaranja Faze 4 — P4-013 — `COMPLETE`"); **prelazak `IN_PROGRESS → DONE` je izvršen zasebnim, vlasnički pregledanim gateom zatvaranja Faze 4 — odluka D-059** (§5, „Zatvaranje Faze 4 — D-059"). `DONE` je ovdje **rezervisani lifecycle status** i postaje kanonski **merge-om ove zatvaračke grane u `origin/main`**, po presedanu Faze 3 (`9af070d`); **Faza 5 — `IN_PROGRESS`** (§6): prelazak je izvršen kanonskim slice-om **`P5-I1`** (PR #30, merge `fcd88fbe`), checklist **49 / 8**; Faza 5 **nije** `DONE` |
| Current branch | Faza 3 je merged u kanonski `main`; implementacijski branch `backend/03-identity-practices` (tehnička implementacija HEAD, Gate 3E = `9f60d32c66023c4aad5ac34df267658ddfe5d6b1`; zatvarački dokumentacioni checkpoint = `2c7d7778a9ec1dae92fd0a5683d1f4afc7b36950`; završni head prije merge-a = `5c1699a0ea4d98e2f540c6e8cd9ae84997896a42`) je time potrošen. **Kanonska remote grana je `origin/main`. Živi kanonski commit se rezolvira iz te reference i ovaj dokument ga ne ugrađuje** (D-056, klauzule 15–16); tačni SHA-ovi ispod su **nepromjenljivi historijski lifecycle događaji**, ne živi pokazivač. Implementacijski branch Faze 4 `backend/04-practice-settings-patch` nosio je slice P4-5D i **merged je** u kanonski `main` kroz **PR #20** (`3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5`), pa je time potrošen. Historijski: `0866e530b6086e7dba7f0bc0d98b19eee69ee0d5` (PR #19, kanonski `main` neposredno prije merge-a P4-5D), `5c2786d689b50f73f49bfca52d2335ea50ee52c2` (PR #12, kanonski `main` po zatvaranju Faze 3), `251544f0b10abb00ee818f1ff5183c95b0ed0d03` (PR #11, kanonski `main` neposredno prije merge-a Faze 3) i `65e2552e13520ead86092f75ca3cc75d206b9f35` (PR #10) |
| Last completed phase | **Faza 4 — Tenant/RLS, `DONE`** — zatvorena odlukom **D-059** (§5, „Zatvaranje Faze 4 — D-059"); aplikacija merged kroz PR #20 (`3658c6e`), retrospektivni evidence gate **P4-013** `COMPLETE`, `UNRESOLVED_REQUIRED = 0`. Prethodna: Faza 3 — Identity & Practices, `DONE` (PR #12, `5c2786d`). **Naredna faza — Faza 5 — Encounter/documents — bila je `NOT_STARTED` u trenutku tog zatvaranja i njime nije autorizovana; tekući status Faze 5 je `IN_PROGRESS`** nakon kanonskog `P5-I1` (§6) |
| Last commit | `c4b89d0` (Phase 2 implementation), merged via `dae9649`; dokumentarno zatvaranje `98910b3`, merged via `d6b5efe`; D-047 rekonsilijacija `76dbc6d` + `dda7538`, merged via `ec7d100` (PR #7); dokumentaciona usklađivanja merged via `2befadc` i `5d38ba8` (PR #8, PR #9); D-048–D-051 rekonsilijacija `b2a99ce`, merged via `65e2552` (PR #10); dokumentaciono zatvaranje governancea merged via `251544f` (PR #11); **Faza 3 — sedam commitova branča `backend/03-identity-practices` (Gate 3A–3E, tehnička implementacija `HEAD` = `9f60d32`; zatvarački dokumentacioni checkpoint `2c7d777`; korekcija reference kanonskog `main`-a `5c1699a`), merged via `5c2786d` (PR #12)** (§4, „Gate checkpointi Faze 3"); historijski kanonski `main` prije P4-5D = `0866e530b6086e7dba7f0bc0d98b19eee69ee0d5` (PR #19); **PR #20 (slice P4-5D) je `MERGED`, merge commit `3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5`**. Živi kanonski commit se rezolvira iz `origin/main` i ovdje se **ne** upisuje (D-056, klauzule 15–16) |
| Local environment owner | Nermin Fejzic |
| Test DB | `copilot_test` @ `localhost:5433` (compose profil `test`); dokazi Faze 3 nad realnim PostgreSQL-om rade na **jednokratnim** bazama `copilot_gate3b_<suffix>` @ `localhost` |
| Documentation version | 1.0 |
| Last updated | 2026-08-21 |
| **Faza 3** | **`PHASE 3 STATUS: DONE`** — zatvaranje je merged u kanonski `main`. Tehnička implementacija je bila kompletna **prije** merge-a, `TECHNICAL_IMPLEMENTATION_MISSING = 0`. Gate 3A–3E su commitovani, reviewovani i pushovani na `origin/backend/03-identity-practices`; tehnička implementacija HEAD (Gate 3E) = `9f60d32c66023c4aad5ac34df267658ddfe5d6b1`, zatvarački dokumentacioni checkpoint = `2c7d7778a9ec1dae92fd0a5683d1f4afc7b36950`. **PR #12 `feat(identity): complete Phase 3 identity and practices` — `MERGED` 2026-08-16T00:15:08Z; normalan merge commit `5c2786d689b50f73f49bfca52d2335ea50ee52c2` je time postao kanonski `main` (historijski; kasniji historijski kanonski `main` je `0866e530b6086e7dba7f0bc0d98b19eee69ee0d5`, PR #19, a merge P4-5D je `3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5`, PR #20; živi kanonski commit se rezolvira iz `origin/main`).** Time je ispunjen uslov da je `DONE` rezervisan za zatvaranje merged u kanonski `main`. Governance bloker D-048–D-051 bio je `RESOLVED` merge-om PR #10 (`65e2552`, 2026-08-15T00:50:43Z) **prije** nastavka implementacije — vidi §3b |
| **Faza 4** | **`PHASE 4 STATUS: DONE`** — zatvorena **odlukom D-059** (2026-08-21) nakon što je finalni read-only audit zatvaranja nad kanonskim `9b8fcdd21a51935b7cc6cd810e0e91e44ec281e3` vratio `PHASE4_FINAL_CLOSURE_AUDIT_PASS` i `PHASE4_READY_FOR_FORMAL_CLOSURE = YES`. Aplikacijska implementacija je bila kompletna i merged **prije** zatvaranja (P4-5B, P4-5R1, P4-5C, P4-5D — **PR #20**, `3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5`), a retrospektivni evidence gate **P4-013** je `COMPLETE`: **398** redova, `SATISFIED_BY_EVIDENCE 375`, `HISTORICAL 1`, `NOT_APPLICABLE_IN_V1 8`, `EXPLICITLY_DEFERRED 2`, `FUTURE_SCOPE 12`, `SUPERSEDED 0`, **`UNRESOLVED_REQUIRED = 0`**, **`SECURITY_CLOSURE_BLOCKERS = 0`**, `SILENT_RETIREMENTS = 0` (§5). Kao i kod Faze 3, `DONE` je **rezervisan za lifecycle zatvaranja merged u kanonski `main`**: ovaj zapis je nastao na zatvaračkoj grani `docs/phase4-formal-closure` i postaje kanonski **merge-om te grane u `origin/main`** (presedan `9af070d`, Faza 3). Ono što `DONE` **ne** tvrdi: nije produkcijska spremnost, **ne autorizuje Fazu 5**, i **ne retirira nijednu `FUTURE_SCOPE` ni `EXPLICITLY_DEFERRED` obavezu** — `TenantDatabaseService` facade (§6) te `R267`–`R272` i rezidua `R303` (Faza 10, §11) ostaju **žive i u vlasništvu svojih budućih faza**. |

---

# 1. Pre-flight

- [x] Dokumenti su kopirani u root projekta.
- [x] Cursor vidi `AGENTS.md`.
- [x] Pročitan `00_PROJECT_RULES.md`.
- [x] Pročitan `06_DECISION_LOG.md`.
- [x] Git repository postoji.
- [x] Working tree je čist.
- [x] Nema stvarnih secrets u fajlovima.
- [x] Docker radi.
- [x] Node/pnpm rade.
- [x] Project owner je potvrdio fazni pristup.

Evidence:

```text
git status:      clean prije faze 1; HEAD potomak frozen baselinea 35aff83
node --version:  v24.19.0
pnpm --version:  11.17.0
docker version:  Docker 29.6.2, Docker Compose v5.3.1
```

---

# 2. Faza 1 — Bootstrap

Status: `DONE`

## Repository

- [x] Root `package.json`. — private ESM workspace root, `packageManager: pnpm@11.17.0`, `engines` pin.
- [x] `pnpm-workspace.yaml`. — `apps/*`, `packages/*`, eksplicitni `allowBuilds`.
- [x] lockfile. — `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` prolazi.
- [x] `.gitignore`. — dopunjen za `*.tsbuildinfo`, `.eslintcache`, `.pnpm-store/`, `.vitest/`.
- [x] `.editorconfig`.
- [x] Node version pin. — `.node-version` i `.nvmrc` = `24.19.0`, `engines.node` = `24.19.0`.
- [x] pnpm version pin. — `packageManager` i `engines.pnpm` = `11.17.0`, `engine-strict=true`.
- [x] `apps/api`. — NestJS 11 aplikacija.
- [x] `services/tariff-engine-java`. — placeholder README, bez koda (D-OPEN-010).
- [x] `packages/contracts`. — `@axenita/contracts`, samo `/api/v1` versioning površina.
- [x] `infra`. — `infra/database/init` (prazan, vlasništvo faze 2).
- [x] `scripts`. — `verify-toolchain.mjs`.

## API bootstrap

- [x] NestJS 11. — `@nestjs/common|core|platform-express` 11.1.28.
- [x] TypeScript strict. — 5.9.3, `strict` + `noUncheckedIndexedAccess`, `noUnused*`, `noImplicitReturns`.
- [x] ConfigModule. — `@nestjs/config` 4.0.4 kroz `AppConfigModule.forRoot()`.
- [x] env validation. — `validateEnvironment`, fail-fast, poruka bez vrijednosti varijabli.
- [x] global `/api` prefix. — `setGlobalPrefix(API_GLOBAL_PREFIX)`.
- [x] URI v1. — `VersioningType.URI`, rute `/api/v1/...` (D-007).
- [x] validation pipe. — whitelist, `forbidNonWhitelisted`, bez implicitne konverzije, 422.
- [x] Helmet. — `helmet()` + body limit iz konfiguracije.
- [x] CORS allowlist. — `API_CORS_ALLOWED_ORIGINS`, prazna lista = default deny.
- [x] request ID. — `X-Request-ID` middleware + `AsyncLocalStorage` kontekst (03 §3.5).
- [x] Problem Details base. — `application/problem+json`, centralni katalog od 34 koda (D-008).
- [x] structured allowlist logging (09 §11). — `AllowlistedLogAttributes` ograničava atribute na dozvoljeni skup; nijedan `exception.stack` ni `exception.message` ne ulazi u log iz HTTP ni bootstrap putanje.
- [x] live health. — `GET /api/v1/health/live` → `200 {"status":"up"}`.
- [x] ready health base. — `GET /api/v1/health/ready`, strukturirani `checks`, `503` kod `degraded`.

## Docker

- [x] PostgreSQL 16. — `postgres:16.14-alpine3.24@sha256:57c72fd2…07777`, potvrđeno `PostgreSQL 16.14`.
- [x] Redis 7. — `redis:7.4.10-alpine3.21@sha256:e7723ff7…19a2`, potvrđeno `redis_version:7.4.10`.
- [x] MinIO. — `minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493…936e`.
- [x] image digest pin. — sve četiri servisne reference su tag + immutable digest (README §5); `postgres` i `postgres-test` dijele identičan digest.
- [x] health checks. — `pg_isready`, `redis-cli ping`, `mc ready local`; sva 4 kontejnera `healthy` iz digest-pinovanih imagea.
- [x] named volumes. — `copilot-postgres-data`, `copilot-redis-data`, `copilot-minio-data`, `copilot-postgres-test-data`.
- [x] no production secrets. — samo eksplicitno označene lokalne dev vrijednosti.

## Verification

- [x] `pnpm lint`. — 0 grešaka (`typescript-eslint` type-checked).
- [x] `pnpm typecheck`. — oba paketa prolaze.
- [x] `pnpm test`. — 80/80 unit testova.
- [x] `pnpm build`. — `packages/contracts` + `apps/api` prolaze.
- [x] `docker compose config`. — validan.
- [x] `docker compose up -d`. — postgres/redis/minio + `--profile test` postgres-test.
- [x] live health 200. — potvrđeno protiv pokrenutog stacka.

Dodatno izvršeno izvan minimalne liste:

- [x] `pnpm format:check` — sve formatirano.
- [x] `pnpm test:e2e` — 41/41 API e2e testova.
- [x] `pnpm install --frozen-lockfile` — prolazi.
- [x] `pnpm verify:toolchain` — node 24.19.0, pnpm 11.17.0.
- [x] readiness degraded put dokazan zaustavljanjem Redisa → `503` + `redis: down`.
- [x] nevalidan environment obara bootstrap sa exit kodom 1; izlaz sadrži samo sanitizovanu
      liniju bez vrijednosti, bez stacka i bez framework dumpa.
- [x] running kontejneri potvrđeni protiv pinovanih digesta (`docker inspect .Image`).

Evidence:

```text
Branch:       implementation/backend-v1 → merged u main
Commit:       4ca591a962ef87f0b5f1f46650e786dba43e3db7 (Phase 1 implementation)
Merge:        PR #2 MERGED; merge commit 1fa4b19e3c9dc3a91df2cd70537564e147b68d67
              normal merge commit (bez squasha i bez rebasea); dva roditelja:
              35aff836 (frozen baseline) + 4ca591a (Phase 1 implementation)
Main:         lokalni main = origin/main = 1fa4b19; working tree čist
Commands:     pnpm install --frozen-lockfile | pnpm lint | pnpm format:check | pnpm typecheck |
              pnpm test | pnpm test:e2e | pnpm build | pnpm verify:toolchain |
              docker compose config | docker compose up -d | docker compose ps |
              docker compose --profile test up -d
Gates:        svi Faza 1 gateovi prolaze
Test result:  80/80 unit + 41/41 e2e = 121/121 testova, svi prolaze
Scope:        Faza 1 ne sadrži nikakvu Faza 2+ funkcionalnost (bez Prisma/scheme, auth,
              autorizacije/RLS, encounter domena, TARDOC/OAAT logike, AI, queueova,
              Axenita integracije i frontenda)
Review:       prvi read-only review — 2 blockera ispravljena (image digest pin;
              structured allowlist logging bez raw exception sadržaja); drugi read-only
              review CLEAN; commit, post-commit i push verifikacija prošli
Next gate:    Ecosystem Compatibility Audit — obavezan sljedeći korak prije Faze 2
              (vodeći princip: "ecosystem-ready, not ecosystem-built")
Open issues:  readiness pokriva database/redis/objectStorage; `tariffEngine` iz 03 §27 dolazi
              u fazi 8. Database/Redis provjera je trenutno TCP reachability jer faza 1 nema
              DB/queue klijent. Body-parser odbijanja se mapiraju na 400, ne 413 (03 §9).
              Bootstrap failure log imenuje samo varijable koje ne prolaze validaciju
              (deklarisana imena iz sheme), nikada vrijednosti ni constraint tekst.
```

---

# 2a. Gate — Ecosystem Compatibility Audit

Status: `DONE` — izvršen i prihvaćen nakon formalnog zatvaranja Faze 1.

- [x] Audit izvršen kao read-only arhitektonska analiza.
- [x] Eksterni arhitektonski review: `PASS`.
- [x] `FIX_NOW REGISTER: EMPTY`.
- [x] Zapis: `docs/ECOSYSTEM_COMPATIBILITY_AUDIT_2026-08-10.md`.

Evidence:

```text
Auditirani HEAD: 6f74caccf4df633d89e25d3d5f94a3649bca04f4
Zaključak:       Faza 2 smije početi pod trenutno zamrznutom arhitekturom, bez
                 ecosystem-driven pre-refactoringa.
FIX_NOW:         EMPTY — nijedno spajanje ne zadovoljava četvorodijelni prag.
Arhitektura:     D-001 do D-046 nepromijenjene; nijedan novi ADR; 06_DECISION_LOG.md
                 nepromijenjen.
D-OPEN-011:      i dalje OTVOREN. Nije nalaz ovog audita i nije njime riješen; ostaje
                 nezavisno obavezan prije Faze 3 (06, 02 §28.2, 13 §16).
Odgođeno:        W1 encounter lifecycle i W3/D3 eksterni identitet — ponovni pregled prije
                 implementacije Encountera; W2 finding_evidence prema roku iz 02 §28.1;
                 D1/D2/D4/D5 prema zabilježenim trigerima.
Napomena:        Audit ne odobrava implementaciju nijednog budućeg modula ni apstrakcije.
```

---

# 3. Faza 2 — Prisma i DB role

Status: `DONE`

- [x] Prisma 7 installed. — `prisma` i `@prisma/client` 7.9.1, driver adapter `@prisma/adapter-pg` 7.9.1 + `pg` 8.23.0 (D-004, D-021).
- [x] `prisma.config.ts`. — `defineConfig` sa `schema`, `migrations.path` i `datasource.url` iz `MIGRATION_DATABASE_URL`; bez `MIGRATION_DATABASE_URL` odmah baca grešku.
- [x] generated client path. — `generator client { provider = "prisma-client", output = "../src/generated/prisma" }`; putanja je u `.gitignore`, `.prettierignore` i ESLint ignores (02 §26 — generisano, nikad ručno mijenjano).
- [x] module format consistent. — `moduleFormat = "esm"`, `runtime = "nodejs"`; svi importi su ESM sa `.js` ekstenzijom (D-021).
- [x] `DATABASE_URL`. — jedini database credential u runtime shemi; `AppConfigService.databaseUrl`.
- [x] `MIGRATION_DATABASE_URL`. — isključivo CLI/Prisma config; nije u runtime shemi i nema accessor u `AppConfigService`.
- [x] `copilot_migrator`. — `NOSUPERUSER CREATEDB NOCREATEROLE INHERIT LOGIN NOBYPASSRLS`, vlasnik baze i `public` scheme (02 §3.1).
- [x] `copilot_app`. — `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOBYPASSRLS` (02 §3.2).
- [x] `NOBYPASSRLS`. — potvrđeno za sve tri role; `copilot_app` ne može sam sebi dodijeliti `BYPASSRLS` (SQLSTATE 42501).
- [x] runtime not owner. — `copilot_app` nije vlasnik nijednog objekta; `has_schema_privilege('copilot_app','public','CREATE') = f`.
- [x] PrismaService singleton. — `PrismaService extends PrismaClient`, `OnModuleInit`/`OnModuleDestroy` sa ograničenim `connect`/`disconnect`; jedna instanca po procesu.
- [x] DatabaseModule global. — `@Global()`, izvozi samo `PrismaService`; `TenantDatabaseService`/RLS ostaju Faza 4.
      *(Historijski zapis Faze 1. Tenant/RLS semantika je i ostala Faza 4; **konkretna klasa
      `TenantDatabaseService` je kasnije uslovno odgođena odlukom D-056** — vidi §5,
      „Konkretan `TenantDatabaseService` facade — uslovno odgođen (D-056)". Modul i dalje
      izvozi samo `PrismaService`.)*
- [x] migration scripts. — `db:format`, `db:validate`, `db:generate`, `db:migrate:dev`, `db:migrate:deploy`, `db:migrate:status`; `postinstall` i `build` pokreću `prisma generate`.
- [x] test database documented. — `TEST_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL`, `TEST_SYSTEM_DATABASE_URL` u `.env.example`; izolovana baza `copilot_test` @ `localhost:5433`.

Verification:

- [x] `prisma format`. — bez izmjena (idempotentno).
- [x] `prisma validate`. — `The schema at prisma\schema.prisma is valid`.
- [x] migration on empty DB. — `20260810213856_001_extensions_and_roles` primijenjena na praznu `copilot_test` iz `globalSetup`; ponovni `migrate deploy` je stabilan no-op.
- [x] runtime current_user test. — integracijski testovi potvrđuju `current_user = copilot_app` na runtime konekciji.
- [x] runtime CREATE TABLE denied. — SQLSTATE `42501` za `CREATE TABLE`, `CREATE SCHEMA`, `CREATE ROLE` i čitanje `_prisma_migrations`.
- [x] owner query confirms migrator/owner. — vlasnik baze `copilot`, scheme `public` i `_prisma_migrations` je `copilot_migrator`.

Evidence:

```text
Branch:       implementation/database-foundation-v1 → merged u main
Commit:       c4b89d033dfbb5df84f66ae9df83db87776f4f3b (Phase 2 implementation)
Merge:        PR #5 MERGED; merge commit dae9649a0d91e43a3a5d6f42c24f5eccb494e552
              normal merge commit (bez squasha i bez rebasea); dva roditelja:
              b427e9dc (ecosystem audit merge) + c4b89d03 (Phase 2 implementation)
Main:         lokalni main = origin/main = dae9649; merge tree identičan c4b89d03 tree-u
Diff:         41 fajl, +3108 / -146
Server:       PostgreSQL 16.14 (postgres:16.14-alpine3.24, digest-pinned) — D-003
Extensions:   samo plpgsql; paket 001 ne instalira nijednu ekstenziju (02 §22.1)
Migration:    20260810213856_001_extensions_and_roles; applied_steps_count=1;
              rolled_back_at=NULL; checksum 7ba61f9dea1a6ef7...; identična u
              `copilot` i `copilot_test`; `prisma migrate status` => "Database schema
              is up to date!"
Roles:        rolname          | super | createdb | createrole | inherit | login | bypassrls
              copilot_app      | f     | f        | f          | f       | t     | f
              copilot_migrator | f     | t        | f          | t       | t     | f
              copilot_system   | f     | f        | f          | f       | t     | f
              nijedno članstvo između copilot rola (pg_auth_members = 0 redova)
Owner:        database `copilot` owner = copilot_migrator
              schema  `public`  owner = copilot_migrator
              table   `_prisma_migrations` owner = copilot_migrator; relacl = NULL
Runtime user: copilot_app — db_connect=t, db_create=f, public_usage=t, public_create=f
              copilot_system — isto; nema nijedan table grant (Faza 6 je prvi konzument)
PUBLIC:       CONNECT=f, USAGE=f, CREATE=f; `pg_default_acl` = 0 redova (bez DEFAULT
              PRIVILEGES; grantovi po paketu, 02 §3.3)
RLS:          0 tabela sa rowsecurity, 0 policy redova — Faza 4 scope, nije anticipiran
Bootstrap:    role kreira cluster bootstrap superuser kroz `infra/database/init`
              (04 §4.4 korak 4, 10 §6); migracija 001 ih VERIFIKUJE i pada glasno
              (08 §5.1). `copilot_migrator` je NOCREATEROLE (02 §3.1) pa ne može
              kreirati role — zato verifikacija, ne kreiranje, u migraciji.
Commands:     pnpm install --frozen-lockfile | pnpm lint | pnpm format:check |
              pnpm typecheck | pnpm test | pnpm test:e2e | pnpm test:integration |
              pnpm build | pnpm verify:toolchain | docker compose config |
              pnpm db:validate | pnpm db:migrate:deploy | pnpm db:migrate:status
Test result:  83/83 unit + 41/41 e2e + 45/45 integration = 169/169 testova, svi prolaze;
              nula padova, nula preskočenih
Gates:        svi Faza 2 gateovi prolaze — lint, format:check, typecheck, test, test:e2e,
              test:integration, build, verify:toolchain, docker compose config,
              prisma migrate status; ponovni `migrate deploy` = no pending migrations
Privileges:   razdvajanje privilegija provjereno uživo protiv stvarnog PostgreSQL-a
              (atributi rola, vlasništvo, grantovi, DEFAULT PRIVILEGES, PUBLIC)
Review:       finalni nezavisni read-only PR review: PASS — nula blockera; tri nalaza
              klasifikovana kao NON-BLOCKING sa kasnijim gateom (NB-1/NB-2/NB-3)
Scope:        bez modela u `schema.prisma` — Faza 2 ne uvodi nijednu domensku tabelu.
              Bez RLS, bez practices/users, bez auth, bez encountera, bez TARDOC-a,
              bez AI/queueova, bez Axenita integracije, bez frontenda.
Governance:   06_DECISION_LOG.md nepromijenjen; D-001 do D-046 nepromijenjene; nijedan
              novi ADR. Prihvaćena tumačenja: A2 — role kreira cluster bootstrap, a
              migration paket 001 verifikuje role/ownership/privilege ugovor; B1 — Faza 2
              "prazna baza" znači bootstrapovanu praznu bazu; C2 — sprega
              `prisma generate` / `MIGRATION_DATABASE_URL` nije blokirajuća za trenutni
              workflow.
D-OPEN-011:   nije dodirnut niti riješen. Faza 2 nije naišla na tačku koja ga zahtijeva;
              granica ostaje fail-closed. OSTAJE OTVOREN i MORA BITI RIJEŠEN PRIJE FAZE 3.
Open issues:  NB-1 — sprega `prisma generate` / `MIGRATION_DATABASE_URL`: `prisma.config.ts`
              baca grešku bez te varijable, a `postinstall` i `build` pozivaju
              `prisma generate`. Neblokirajuće za zamrznuti lokalni workflow (10 §3 postavlja
              `.env` prije 10 §4); mora se riješiti prije prvog CI/container builda.
              NB-2 — Faza 1 compose je `copilot_migrator` činio cluster bootstrap superuserom,
              što je u suprotnosti sa 02 §3.1 i obesmislilo bi svaki privilege test.
              Ispravljeno na `POSTGRES_USER=postgres`; postojeći volume se ne može popraviti
              u mjestu (dokazano: `session user cannot be renamed`, `bootstrap user must have
              the SUPERUSER attribute`) — procedura u
              `infra/database/scripts/bootstrap-roles.md`. Operativno pitanje pri osvježavanju
              okruženja.
              NB-3 — ownership guard migracije 001 provjerava samo tabele (`pg_tables`);
              kontinuirano privilege-regression pokrivanje pripada Fazi 4.
              `SYSTEM_DATABASE_URL` je dokumentovan ali nema konzumenta u Fazi 2 (prvi
              konzument je Faza 6).
Closure:      PHASE 2 STATUS: FORMALLY CLOSED
              PHASE 3 IMPLEMENTATION IS NOT AUTHORIZED YET
              D-OPEN-011 MUST BE RESOLVED BEFORE PHASE 3
Next gate:    D-OPEN-011 DECISION GATE — sljedeća governance aktivnost nije implementacija
              Faze 3, nego odluka o runtime access modelu za `users` i `practices`
              (06 D-OPEN-011, 02 §28.2, 13 §16).
```

*(Historijski zapis zatvaranja Faze 2, nepromijenjen. Tamo naveden „next gate" — D-OPEN-011
decision gate — **izvršen je 2026-08-12** prihvatanjem odluke **D-047**; vidi §3a. Formulacije
„D-OPEN-011 MUST BE RESOLVED BEFORE PHASE 3" i „ostaje OTVOREN" opisuju stanje prije tog datuma i
**više ne opisuju tekuće stanje**. Rekonsilijacija iz §3a je u međuvremenu merged u kanonski
`main` (`ec7d100`, PR #7), pa je i formulacija „PHASE 3 IMPLEMENTATION IS NOT AUTHORIZED YET"
historijska: **u tom trenutku, neposredno nakon tog merge-a**, Faza 3 je bila **autorizovana**, ali
još **nije bila započeta**. Za tekuće stanje Faze 3 vidi §4.)*

---

# 3a. D-OPEN-011 decision gate — D-047

Status: **odluka `ACCEPTED`; dokumentaciona rekonsilijacija `DONE` — commitovana, reviewovana i
merged u kanonski `main` (PR #7, merge commit `ec7d100`)**

Ovo je governance korak između Faze 2 i Faze 3. **Nije implementacija** i ne označava nijednu
stavku Faze 3 kao urađenu.

## Odluka

- [x] Vlasnik prihvatio **D-047 — Runtime access model za `users` i `practices`
      (Bootstrap-Scoped RLS)**, 2026-08-12.
- [x] D-047 zabilježen u `06_DECISION_LOG.md` sa statusom `ACCEPTED`.
- [x] **D-OPEN-011** prebačen u status **`SUPERSEDED BY D-047`**; izvorni zapis zadržan
      nepromijenjen radi audita.
- [x] Prihvaćeni vlasnički izbori Q1–Q5 ugrađeni u odluku.
- [x] Nijedan novi broj odluke izvan `D-047` nije uveden.
- [x] Nijedna nova permisija, rola, endpoint, tabela ni migration paket nisu uvedeni.
- [x] Katalog ostaje **32 aktivne + 3 rezervisane** permisije.

## Empirijski dokaz (PostgreSQL 16.14, `copilot_test`)

Probe su izvršene transakcijski i u cijelosti rollbackovane; nijedan probe objekat nije ostao.

- [x] RLS politika smije referencirati `users.auth_subject` bez column granta pozivaocu.
- [x] Aplikacijski `SELECT`/`WHERE` nad `auth_subject` pada sa `42501`.
- [x] Politika sa podupitom nad **drugom** tabelom **zahtijeva** grant nad tom tabelom; bez njega
      `42501`. Minimalno dovoljno: `SELECT (practice_id, user_id)`.
- [x] Bez guarda `app.user_id IS NULL` neusklađeni konteksti izlažu **dva** korisnička reda; sa
      guardom **jedan**.
- [x] Kombinovana permissive `practices` politika pod budućom širokom permissive politikom vraća
      **tri** reda; PERMISSIVE + RESTRICTIVE varijanta vraća **jedan**.
- [x] `SET LOCAL` varijable ne preživljavaju `COMMIT` ni `ROLLBACK`.

## Rekonsilijacija dokumentacije

- [x] `06`, `02`, `03`, `04`, `05`, `07`, `08`, `09`, `13`, `14`, `15`, `MANIFEST.md`.
- [x] Nijedan aplikacijski, testni, konfiguracioni ni infrastrukturni fajl nije dodirnut.
- [x] Nezavisan governance review — **PASS**; izvršena i ciljana/finalna review sekvenca.
- [x] Commit, push, PR, normalni merge u `main` — **PR #7 MERGED**; rekonsilijacijski commitovi
      `76dbc6d` i `dda7538`, merge commit `ec7d100`.
- [x] Verifikacija kanonskog `main` nakon merge-a — **PASS**; `main` = `origin/main` =
      `ec7d1008fcffc2437a66b890a0fef3761730f711`; MANIFEST integritet 19/19 bez odstupanja.

## Autorizacija

```text
D-047 STATUS:        ACCEPTED
D-OPEN-011 STATUS:   SUPERSEDED BY D-047
RECONCILIATION:      COMPLETE — COMMITTED, REVIEWED, MERGED (PR #7, ec7d100)
CANONICAL MAIN:      ec7d1008fcffc2437a66b890a0fef3761730f711 — VERIFIED
PHASE 3 IMPLEMENTATION: AUTHORIZED
PHASE 3 STATUS:      NOT_STARTED   # historijski, na dan 2026-08-13
                                   # SUPERSEDED -> tekući lifecycle i tehnički status: vidi §4
```

**Ovaj blok je historijski zapis stanja na dan zatvaranja D-047 gatea.** Red
`PHASE 3 STATUS: NOT_STARTED` bio je tačan na taj dan, ali je **superseded** i **više ne odražava
stvarno stanje**. Autoritativna sekcija za tekući lifecycle i tehnički status Faze 3 je **§4**.
*(Međustanja `IN_PROGRESS — BLOCKED`, koje je važilo od 2026-08-14 do merge-a PR #10, i
`IN_PROGRESS — READY TO RESUME`, koje je važilo od tog merge-a do nastavka implementacije, takođe
su historijska.)* Red `PHASE 3 IMPLEMENTATION: AUTHORIZED` ostaje na snazi.

Uslovi autorizacije su bili: D-047 zabilježen; svi autoritativni dokumenti usklađeni; nezavisan
governance review prošao; rekonsilijacijski commit merged u kanonski `main`; kanonski `main`
verifikovan; D-OPEN-011 formalno superseded. **Svi su ispunjeni**, pa je Faza 3 autorizovana.

**`PHASE 3 AUTHORIZED` nije `PHASE 3 STARTED`.** U trenutku pisanja §3a nijedan Faza 3 artefakt
nije postojao, i nijedan checkbox u §4 nije bio označen. Autorizacija dozvoljava da implementacija
počne u zasebnom, eksplicitnom promptu; ona je ne pokreće. *(Za stvarno stanje implementacije
nakon tog trenutka vidi §3b i §4.)*

---

# 3b. Governance gate — D-048, D-049, D-050, D-051

Status: **odluke `ACCEPTED` (2026-08-14); dokumentaciona rekonsilijacija `DONE` — commitovana,
reviewovana i merged u kanonski `main` (PR #10, merge commit `65e2552`)**

Ovo je governance korak **unutar** Faze 3. **Nije implementacija** i ne označava nijednu stavku
Faze 3 kao urađenu.

## Zašto postoji

Implementacija Faze 3 je **započeta** na branchu `backend/03-identity-practices` i **zaustavljena**
kada su se pojavila četiri governance pitanja koja dokumentacija nije rješavala:

1. tabela pod `FORCE ROW LEVEL SECURITY` odbija i pouzdani seed DML vlasnika tabele → **D-048**;
2. `practice_settings` runtime put nije izvodiv u fazi bez tenant RLS-a, a `GET /me` ipak treba dva
   uslovna flaga → **D-049**;
3. `prisma migrate dev --create-only` zahtijeva shadow bazu nespojivu sa guardovima migracije
   `001` → **D-050**;
4. `02` §17.2 i §17.4 su bili u fazi 4, iako `GET /me` faze 3 te tabele stvarno čita → **D-051**.

## Odluke

- [x] Vlasnik prihvatio **D-048 — Protokol održavanja `FORCE RLS` pri pouzdanom seedu i
      migraciji**, 2026-08-14.
- [x] Vlasnik prihvatio **D-049 — Vlasništvo faza za `practice_settings` i minimalno čitanje u
      fazi 3**, 2026-08-14.
- [x] Vlasnik prihvatio **D-050 — Kanonski workflow autorstva Prisma migracija**, 2026-08-14.
- [x] Vlasnik prihvatio **D-051 — Premještanje user-scoped RLS-a u paket `002` i fazu 3**,
      2026-08-14.
- [x] Sve četiri zabilježene u `06_DECISION_LOG.md` kao **četiri zasebne** odluke sa statusom
      `ACCEPTED`; nijedna nije spojena sa drugom.
- [x] D-048 zabilježen kao **amandman na D-047, klauzulu 15**.
- [x] D-049 zabilježen kao **supersede/amandman faznog dijela D-028, klauzule 4**.
- [x] D-051 zabilježen kao **amandman na D-047, klauzule 16 i 18**.
- [x] Historijski tekst D-023, D-028, D-029 i D-047 **nije prepisan**; dodane su isključivo
      eksplicitne amandmanske reference izvan immutable tijela.
- [x] Nijedna nova permisija, rola, endpoint, tabela ni migration paket nisu uvedeni.
- [x] Katalog ostaje **32 aktivne + 3 rezervisane** permisije; `15` ostaje nepromijenjen.

## Rekonsilijacija dokumentacije

- [x] `AGENTS.md`, `00`, `02`, `03`, `04`, `05`, `06`, `07`, `08`, `10`, `11`, `13`, `MANIFEST.md`.
- [x] Nijedan aplikacijski, testni, konfiguracioni, Prisma ni migracijski fajl nije dodirnut.
- [x] Nezavisan governance review — **PASS** (PR #10).
- [x] Commit, push, PR, normalni merge u `main` — **PR #10 MERGED** (2026-08-15T00:50:43Z);
      rekonsilijacijski commit `b2a99ce`, merge commit `65e2552`.
- [x] Verifikacija kanonskog `main` nakon merge-a — **PASS**; u tom historijskom trenutku
      (2026-08-15T00:50:43Z) `main` = `origin/main` =
      `65e2552e13520ead86092f75ca3cc75d206b9f35`; MANIFEST integritet 19/19 bez odstupanja.
      *(Kanonski `origin/main` je otada pomjeren više puta — na `251544f0b10abb00ee818f1ff5183c95b0ed0d03`
      merge-om PR #11, na `5c2786d689b50f73f49bfca52d2335ea50ee52c2` merge-om PR #12 (Faza 3),
      na `0866e530b6086e7dba7f0bc0d98b19eee69ee0d5` merge-om PR #19, pa na
      `3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5` merge-om PR #20 (P4-5D). Svi ti SHA-ovi su
      **historijski lifecycle događaji**; **živi kanonski commit se rezolvira iz `origin/main`** i
      ovaj dokument ga ne ugrađuje (D-056, klauzule 15–16). Ovaj red bilježi stanje u trenutku
      merge-a PR #10.)*

## Stanje implementacije Faze 3

Ovaj blok je **historijski zapis governance gatea** i namjerno se ne briše. Opisuje stanje kakvo
je bilo **u trenutku merge-a PR #10 (2026-08-15T00:50:43Z)**, prije nego je implementacija
nastavljena. Trenutno autoritativno stanje Faze 3 nalazi se u §4.

- [x] Branch `backend/03-identity-practices` postoji.
- [x] Prisma schema i migracija `002` **djelimično** autorisane lokalno. *(Historijski. Oboje je
      naknadno dovršeno, pregledano i commitovano u Gateu 3A `42fdffb`.)*
- [x] Implementacija **zaustavljena** na governance blokeru. *(Historijski; bloker je od merge-a
      PR #10 `RESOLVED`.)*
- [x] **Ništa nije commitovano ni pushovano.** *(Historijski, tačno u trenutku merge-a PR #10.
      **Više ne opisuje trenutno stanje**: Gate 3A–3E su otada commitovani i pushovani na
      `origin/backend/03-identity-practices`, tehnička implementacija HEAD = `9f60d32` — vidi §4.)*
- [x] **Nijedna tvrdnja o završetku Faze 3 ne postoji.** *(Historijski. Tvrdnja o tehničkom
      završetku **sada postoji** i naslonjena je isključivo na dokaze u §4, ne na ovaj governance
      blok.)*
- [x] Faza 3 nastavljena nakon merge-a ove rekonsilijacije. *(Ispunjeno: implementacijski worktree
      je tada bio sinhronizovan sa tadašnjim kanonskim `main` `65e2552`, koji je dokazano direktni
      predak Gatea 3A `42fdffb` — `git merge-base --is-ancestor 65e2552 42fdffb` je istinito — i
      implementacija je stvarno nastavljena i tehnički dovršena kroz Gate 3A–3E. Branch je potom
      bio sinhronizovan i sa tada kanonskim `origin/main`
      `251544f0b10abb00ee818f1ff5183c95b0ed0d03` (PR #11): mehanički provjereno,
      `git merge-base origin/main HEAD` = `251544f0b10abb00ee818f1ff5183c95b0ed0d03` i
      `origin/main` je bio predak `HEAD`-a. Branch je otada **merged** u kanonski `main` kroz
      PR #12, merge commit `5c2786d689b50f73f49bfca52d2335ea50ee52c2` — vidi §4.)*

Stavka „Faza 3 nastavljena" bila je neoznačena sve dok implementacijski worktree nije bio
sinhronizovan sa novim kanonskim `main`. Ta sinhronizacija je izvršena i mehanički provjerena, pa
je stavka označena. Zatvaranje governance blokera samo po sebi i dalje **nije** dokaz
implementacije: ono je značilo isključivo `READY TO RESUME`. Dokazi za tehnički završetak Faze 3
su isključivo oni navedeni u §4. **Zatvaranje Faze 3 ne autorizuje Fazu 4.**

## Status

```text
D-048 STATUS:        ACCEPTED / CANONICAL
D-049 STATUS:        ACCEPTED / CANONICAL
D-050 STATUS:        ACCEPTED / CANONICAL
D-051 STATUS:        ACCEPTED / CANONICAL
D-028 klauzula 4:    fazni dio POVUČEN (D-049)
RECONCILIATION:      COMPLETE — COMMITTED, REVIEWED, MERGED (PR #10, 65e2552)
MERGED AT:           2026-08-15T00:50:43Z
CANONICAL MAIN (PR #10, historijski):
                     65e2552e13520ead86092f75ca3cc75d206b9f35 — VERIFIED
CANONICAL MAIN (PR #11, historijski — neposredno prije merge-a Faze 3):
                     251544f0b10abb00ee818f1ff5183c95b0ed0d03
CANONICAL MAIN (PR #12, historijski — po zatvaranju Faze 3):
                     5c2786d689b50f73f49bfca52d2335ea50ee52c2
GOVERNANCE BLOCKER:  RESOLVED
PHASE 3 IMPLEMENTATION: AUTHORIZED
PHASE 3 STATUS:      DONE (§4)
PHASE 3 COMPLETION:  TECHNICAL IMPLEMENTATION COMPLETE PRIJE MERGE-A — vidi §4 „Zatvaranje Faze 3"
PHASE 3 PULL REQUEST: PR #12 — MERGED 2026-08-16T00:15:08Z
PHASE 3 MERGE U main: IZVRŠEN — normalan merge commit 5c2786d689b50f73f49bfca52d2335ea50ee52c2
PHASE 4:             NOT AUTHORIZED, NOT STARTED
```

**Lokalni neizvršeni rad nije dokaz.** Nijedan checkbox u §4 nije označen zbog postojanja
necommitovanog lokalnog rada niti zbog zatvaranja governance blokera; za svaku označenu stavku
postoji izvršena provjera ili konkretan dokaz nad commitovanim stanjem repozitorija.

---

# 4. Faza 3 — Identity/practices

Status: `DONE` — **zatvaranje merged u kanonski `main`**; tehnička implementacija je bila kompletna
prije merge-a. PR: **#12, `MERGED` 2026-08-16T00:15:08Z**. Merge u kanonski `main`: **izvršen**,
normalan merge commit `5c2786d689b50f73f49bfca52d2335ea50ee52c2`.

**Autorizacija: `AUTHORIZED` od merge-a D-047 rekonsilijacije u kanonski `main` (§3a, `ec7d100`).**
Implementacija je bila **zaustavljena na governance blokeru** D-048–D-051 (§3b); taj bloker je
**`RESOLVED`** merge-om PR #10 (`65e2552`, 2026-08-15T00:50:43Z). Implementacija je nakon toga
nastavljena i dovršena kroz pet checkpointa, Gate 3A–3E, koji su **commitovani i pushovani**.

**Svaki označeni checkbox ispod naslonjen je na commitovan kod, commitovanu migraciju,
commitovani seed ili izvršeni test.** Nijedna stavka nije označena zbog lokalnog necommitovanog
rada niti zbog zatvaranja governance blokera.

**Zašto `DONE`.** Lifecycle status i tehnička kompletnost su **dvije odvojene dimenzije** ovog
dokumenta:

- `IN_PROGRESS` **smije** obuhvatati tehnički kompletnu implementaciju dok su zatvaranje, PR i
  merge još u toku — to je bilo stanje Faze 3 do 2026-08-16T00:15:08Z;
- `DONE` je u ovom repozitoriju **rezervisan** za završeni lifecycle zatvaranja merged u kanonski
  `main` — tako je korišten za Fazu 1, Fazu 2 i obje governance rekonsilijacije (PR #7, PR #10);
- Faza 3 je bila **tehnički kompletna prije** merge-a, a **`DONE` je od merge-a PR #12** u
  kanonski `main`, čime je taj rezervisani uslov ispunjen.

Tehnička dimenzija se i dalje izražava zasebno i eksplicitno: **`TECHNICAL IMPLEMENTATION
COMPLETE`**, **`TECHNICAL_IMPLEMENTATION_MISSING = 0`** — dokazana **prije** merge-a i nepromijenjena
njime. Ono što status `DONE` Faze 3 **ne** tvrdi:

- migracija `002` **nije** primijenjena na normalnu razvojnu bazu `copilot` @ `localhost:5432`
  (vidi „Status razvojne baze" niže) — merge sam po sebi ne izvršava operaterski korak;
- **nije** produkcijski deployment, nije produkcijska autentifikacija, nema OIDC/MFA;
- **ne** autorizuje Fazu 4 i **ne** znači pilot readiness.

`DONE` znači **lifecycle zatvaranje faze u kanonskom `main`-u**, a ne produkcijsku spremnost
proizvoda. Prelazak iz `IN_PROGRESS` u `DONE` je bio zaseban, rezervisan korak zatvaranja nakon
normalnog merge-a u kanonski `main`; taj merge je izvršen (PR #12) i verifikovan, pa je prelazak
sada evidentiran.

Normativno: D-033, D-038, D-047, **D-048**, **D-049**, **D-050** i **D-051**; `02` §6.3, §6.3a,
§17.0, §17.2, §17.4, §20.2b, §22.2, §23.2, §23.4 i §26.3; `03` §10; `04` §5.2, §5.2.1 i §5.4.1.

Vlasnik migration paketa za sve schema stavke ove faze: **`002_identity_and_practices`**. Ne uvodi
se novi broj paketa.

## Gate checkpointi Faze 3

Svih pet checkpointa je commitovano i pushovano na `origin/backend/03-identity-practices`.
Mehanički provjereno: tehnička implementacija HEAD (Gate 3E) =
`9f60d32c66023c4aad5ac34df267658ddfe5d6b1`; tadašnji kanonski `main` `65e2552` je predak Gatea 3A,
a kanonski `main` neposredno prije merge-a Faze 3, `251544f0b10abb00ee818f1ff5183c95b0ed0d03`
(PR #11), bio je predak branch `HEAD`-a. Svih sedam commitova branča — pet Gate checkpointa plus
dva zatvaračka dokumentaciona commita (`2c7d777`, `5c1699a`) — očuvano je merge-om PR #12; kanonski
`origin/main` je time postao merge commit `5c2786d689b50f73f49bfca52d2335ea50ee52c2` (historijski).

| Gate | Puni SHA | Commit | Obuhvat |
|---|---|---|---|
| 3A | `42fdffb8c0af1a3a3a6c6816303e785fd2bc1fae` | `feat(identity): add Phase 3 identity database foundation` | Prisma modeli šest tabela + tri enuma; migration paket `002_identity_and_practices` (763 linije) sa ručno pisanim sigurnosnim SQL-om; D-050 tooling (`db:migrate:diff`) |
| 3B | `8727ec813a67a186f33162c1083ffb10572c0773` | `test(identity): add Phase 3 database security validation` | D-048 deterministički dev seed; jednokratna DB harness (`copilot_gate3b_<suffix>`); osam `*.security.ts` RLS/privilegijskih specova; integracijski baseline migracija/rola |
| 3C | `9def79b57fb236250e1b6b3074cdecc0329a793e` | `feat(identity): add canonical permission derivation` | Katalog 32 aktivne + 3 rezervisane permisije; šest tenant rola disjunktnih od platform role; izvršna 32×6 matrica; membership-scoped resolver; conformance protiv nezavisnog fixturea `15` |
| 3D | `24a90ca0392ce283fa86f3c5412d271c1cedc291` | `feat(identity): implement authenticated get me bootstrap` | `GET /api/v1/me`; `DevelopmentAuthGuard` (HS256, odbija se konstruisati pod `NODE_ENV=production`); D-047 bootstrap lanac u jednoj interaktivnoj transakciji; tri nova sigurnosna suitea nad realnim PostgreSQL-om |
| 3E | `9f60d32c66023c4aad5ac34df267658ddfe5d6b1` | `feat(identity): add practice read endpoint` | `GET /api/v1/practices/{practiceId}`; `X-Practice-ID` validacija i path/context narrowing; `practice.read` kroz Gate 3C resolver; šestopoljna projekcija; `phase3-practice-read.security.ts` |

## Schema

Paket: `002_identity_and_practices`.

- [x] practices.
- [x] users.
- [x] practice_memberships.
- [x] practice_settings.
- [x] unique constraints.
- [x] indexes.
- [x] grants.

### `membership_role` enum

- [x] enum `membership_role` postoji.
- [x] enum sadrži tačno šest prihvaćenih tenant rola: `PRACTICE_ADMIN`, `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY`.

### `practice_memberships`

- [x] `id`.
- [x] `practice_id`.
- [x] `user_id`.
- [x] `professional_gln`.
- [x] `active`.
- [x] `created_at` i `updated_at`.
- [x] `unique (practice_id, user_id)`.
- [x] `unique (practice_id, id)`.
- [x] **`practice_memberships` NEMA singularnu kolonu `role`** (D-038, klauzula 2).
- [x] **Indeks `(practice_id, active, role)` ne postoji** — uklonjen zajedno sa kolonom.
- [x] `(user_id, active)` indeks postoji.

### `practice_membership_roles`

- [x] tabela postoji.
- [x] `id`.
- [x] `practice_id`.
- [x] `membership_id`.
- [x] `role membership_role`.
- [x] `created_at` i `updated_at`.
- [x] primarni ključ nad `id`.
- [x] `unique (practice_id, id)`.
- [x] `unique (practice_id, membership_id, role)`.
- [x] composite FK `(practice_id, membership_id)` → `practice_memberships(practice_id, id)`.
- [x] duplirana dodjela iste role istom membershipu je **odbijena**.
- [x] dodjela koja referencira membership druge ordinacije je **odbijena**.
- [x] jedan membership smije imati **nula, jednu ili više** role redova.
- [x] **nijedan spekulativni indeks** nije kreiran — pokrivenost je dokazana u `02` §6.3 i §21.

## Životni ciklus dodjele rola

Normativno: D-038, klauzule 25–33; `02` §6.3a.

- [x] `practice_membership_roles` čuva **isključivo trenutno efektivne dodjele**.
- [x] tabela **nije** append-only history tabela.
- [x] uklanjanje role **briše** trenutni red dodjele.
- [x] ponovna dodjela iste role kasnije **kreira novi** red dodjele.
- [x] `unique (practice_id, membership_id, role)` ostaje **neparcijalan**.
- [x] historija dodjele i uklanjanja pripada **immutable audit dokazu**, ne zadržanim redovima.
- [x] na `practice_membership_roles` **ne postoje** kolone `revoked_at`, `revoked_by`, `active`, `valid_from` ni `valid_to`.
- [x] **`practice_memberships.active` je jedini flag aktivnosti membershipa.**
- [x] role redovi neaktivnog membershipa **smiju ostati pohranjeni** i doprinose **nula** permisija.
- [x] ponovna aktivacija membershipa vraća **isključivo** eksplicitno pohranjene trenutne role.
- [x] aktivan membership sa nula rola daje **nula** tenant permisija.
- [x] **generička runtime administracija rola ostaje izvan v1** — bez endpointa, permisije i bez `copilot_app` mutation granta.

## Seed

- [x] demo practice.
- [x] dev admin.
- [x] dev physician.
- [x] memberships.
- [x] **eksplicitni `practice_membership_roles` redovi za svaki seed membership.**
- [x] **najmanje jedan aktivan membership sa nula dodijeljenih rola** za negativne testove.
- [x] seed se **ne oslanja** na singularnu `role` kolonu.
- [x] practice settings red, uz oba approval flaga na `false`.
- [x] seed idempotent.
- [x] **svaki upis u tabelu sa `FORCE RLS` ide kroz maintenance protokol iz `02` §23.4** (D-048).

## API

- [x] dev auth isolated.
- [x] user resolution.
- [x] `/me` vraća `memberships` i `platformRoles` kao dva odvojena bloka.
- [x] `platformRoles` se ne pretvaraju u tenant membershipe.
- [x] `practice_memberships` bez RLS-a u ovoj fazi — bootstrap politika pripada Fazi 4 (D-033;
      `02` §17.3). **`practice_membership_roles` i `platform_role_assignments`, međutim, dobijaju
      svoju RLS već u ovoj fazi** (D-051; `02` §17.2, §17.4).
- [x] **Nijedna settings ruta nije registrovana u ovoj fazi** (D-049).
- [x] **effective-permission resolver postoji** i konzumira **prihvaćenu** matricu iz `15`; **ne hard-koduje** nijedan grant izvan nje (`04` §5.3, aktivnost 6).
- [x] inactive user test.
- [x] inactive membership test.

### `GET /me` ugovor

Normativno: `03` §10.

- [x] svaki membership vraća `membershipId`.
- [x] svaki membership vraća `practiceId`.
- [x] svaki membership vraća `practiceName`.
- [x] svaki membership vraća `active`.
- [x] svaki membership vraća `roles[]`.
- [x] svaki membership vraća izvedene `permissions[]`.
- [x] **polje `memberships[].role` ne postoji.**
- [x] `roles[]` sadrži nula, jednu ili više rola.
- [x] vrijednosti u `roles[]` su **jedinstvene**.
- [x] redoslijed u `roles[]` je **determinističan**.
- [x] `roles[]` sadrži isključivo role tog tačnog membershipa.
- [x] neaktivni membershipi **smiju** biti vidljivi.
- [x] `platformRoles` ostaje **zaseban** top-level blok.
- [x] `platformRoles` se **nikada** ne pojavljuju unutar `roles[]`.
- [x] `permissions[]` se **izvodi**, ne čuva kao stanje membershipa.
- [x] **nema compatibility dual polja** `role` + `roles`.
- [x] membershipi ni role drugog korisnika **nikada** nisu izloženi.

### `GET /api/v1/practices/{practiceId}` ugovor

Normativno: `03` §3.2, §3.4, §3.7.1, §28.5 i prihvaćeni `GET /practices/{practiceId}` ugovor;
`04` §5.2; `15` §5; D-047, klauzule 6, 8, 10, 11 i 18; D-049.

Ovo je **druga i posljednja** ruta Faze 3 (`04` §5.2). Blok je zatvaračka checklist, **ne** drugi
normativni API dokument: pun ugovor ostaje u `03` i ovdje se ne duplira.

- [x] Ruta `GET /api/v1/practices/{practiceId}` je registrovana, i **samo ona** — nijedna settings
      podruta nije registrovana ni kao stub (D-049).
- [x] Autentifikacija je **isti već pregledani `DevelopmentAuthGuard`** koji koristi `/me`; nema
      drugog mehanizma ni druge verifikacije tokena u ovoj fazi.
- [x] `X-Practice-ID` se čita i validira na **koraku 3** iz `03` §3.7.1, tek **nakon** admisije
      korisnika; redoslijed nije preuređen.
- [x] Nedostajući ili prazan `X-Practice-ID` → `400 PRACTICE_CONTEXT_REQUIRED`.
- [x] Prisutan ali ne-UUID `X-Practice-ID` → `400 PRACTICE_CONTEXT_INVALID`.
- [x] Neslaganje `practiceId` iz putanje i `X-Practice-ID` → zajednički `403 ACCESS_DENIED`;
      **nijedan novi error kod nije uveden**.
- [x] Korisnik čiji `status` nije `ACTIVE` odbijen je prije nego se header uopšte razmatra.
- [x] Ordinacija čiji `status` nije `ACTIVE` odbijena je sa rollbackom (D-047, klauzula 10).
- [x] Membership mora postojati **i biti `active`**; neaktivan membership je odbijen i kada nosi
      `PRACTICE_ADMIN`.
- [x] Membership read eksplicitno veže **`user_id` I `practice_id`** — `practice_memberships` nema
      RLS u Fazi 3, pa je narrowing na aplikacijskom sloju obavezan (D-047, klauzula 18).
- [x] `practice.read` se izvodi kroz **Gate 3C `resolveEffectivePermissions`** i provjerava sa
      `hasEffectivePermission`; **nigdje ne postoji `role === 'PRACTICE_ADMIN'` prečica**.
- [x] `PRACTICE_ADMIN` sa aktivnim membershipom u aktivnoj ordinaciji → `200`.
- [x] Ostalih pet tenant rola i **aktivan membership sa nula rola** → `403`.
- [x] **`SYSTEM_ADMIN` sam po sebi → `403`**, za svaku ordinaciju; platform rola nije ulaz u tenant
      derivaciju i ne može podići tenant pristup (D-038, klauzule 12–14).
- [x] Odgovor je **tačno šest polja**: `id`, `code`, `name`, `defaultLanguage`, `timezone`,
      `status`; projektuju se polje po polje, red se nikada ne spreaduje.
- [x] `legalName`, `zsrNumber` i `glnNumber` **nisu u odgovoru, nisu u upitu i nemaju column
      grant**; `createdAt`/`updatedAt` takođe nemaju grant.
- [x] Odgovor ne izlaže nikakvu membership, role, permission, settings ni identity informaciju.
- [x] **Anti-enumeracija**: nepostojeća ordinacija, tuđa ordinacija, neaktivna ordinacija,
      neaktivan membership i nedostatak permisije daju **nerazlučiv** `403 ACCESS_DENIED`.
- [x] Cijeli lanac — `set_auth_subject_context`, bootstrap read, `ACTIVE` provjera,
      `set_user_context`, validacija konteksta, čitanja i derivacija — teče u **jednoj**
      interaktivnoj transakciji na jednoj pinovanoj konekciji; svako odbijanje radi rollback.
- [x] Nikakav kontekst ne preživljava request: pool ostaje bez `app.auth_subject` i `app.user_id`,
      i odbijeni request ne kontaminira sljedeći.
- [x] **Nijedan primitiv Faze 4 nije uveden** — nema `set_request_context`, `app.practice_id`,
      `PracticeContextGuard` ni `TenantDatabaseService`.
- [x] Dokaz je **stvarni HTTP nad stvarnim PostgreSQL-om** na jednokratnoj bazi, uz unit pokrivenost
      servisa; nije mock-only.

## Access model za `users` i `practices` — D-047

Normativno: D-047; `02` §16.2.1, §16.2.4, §17.5, §17.6, §20.2a, §22.2. Raniji
`BLOCKED — D-OPEN-011` blok više ne važi; umjesto njega vrijede **obavezne verifikacione stavke**.

- [x] `app_security.set_auth_subject_context(text)` postoji — SECURITY INVOKER, fiksiran
      `search_path`, `42501` na null/prazan ulaz, briše `app.user_id` i `app.practice_id`,
      `EXECUTE` samo `copilot_app`, `PUBLIC` revoked.
- [x] `app_security.set_user_context(uuid)` je kreiran u paketu **`002`**, sa nepromijenjenim
      potpisom, `SECURITY INVOKER` modom i tijelom iz D-033.
- [x] `users` ima `ENABLE` **i** `FORCE ROW LEVEL SECURITY`.
- [x] `users` ima **tačno dvije** PERMISSIVE `SELECT` politike.
- [x] Bootstrap politika sadrži obavezni uslov `app.user_id IS NULL`.
- [x] Self politika glasi `id = app.user_id`.
- [x] `practices` ima `ENABLE` **i** `FORCE ROW LEVEL SECURITY`.
- [x] `practices` ima PERMISSIVE membership politiku **bez** filtera na `pm.active`.
- [x] `practices` ima **RESTRICTIVE** `practices_context_narrow` politiku.
- [x] Column grant `users` = `(id, email, display_name, preferred_language, status)`.
- [x] Column grant `practices` = `(id, code, name, default_language, timezone, status)`.
- [x] `auth_subject`, `last_login_at`, `legal_name`, `zsr_number`, `gln_number`, `created_at` i
      `updated_at` **nemaju** grant.
- [x] Nema `INSERT`, `UPDATE` ni `DELETE` nad `users` i `practices` ni za jednu runtime rolu.
- [x] `copilot_system` nema nijedan grant nad te dvije tabele; `PUBLIC` nema nijedan.
- [x] **Nijedna `SECURITY DEFINER` funkcija nije uvedena.**
- [x] Korisnik čiji `status` nije `ACTIVE` odbijen je **prije** `set_user_context`.
- [x] Ordinacija čiji `status` nije `ACTIVE` odbijena je **prije** `set_request_context`.
- [x] Cijeli bootstrap lanac izvršava se u **jednoj** interaktivnoj transakciji.
- [x] Nema neograničenog ni generičkog runtime pristupa nad `users` i `practices` — zabrana nije
      ukinuta, nego je sprovedena kroz `FORCE RLS` i column grantove.
- [x] Phase gate pada ako je takav pristup tiho uveden.
- [x] Self-enumeracija vlastitih membership rola **nije** generički pristup nad `users`.
- [x] Self-enumeracija vlastitih membership rola **nije** generički pristup nad `practices`.
- [x] Self-enumeracija **nije** role administration.
- [x] Self-enumeracija **nije** cross-practice administracija.
- [x] **Treća `users` politika nije kreirana** — pristup redu drugog korisnika ostaje
      `DENY / NOT IMPLEMENTED`; gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19).
- [x] Negativni testovi iz `02` §25.1.1 i `08` §21.5 prolaze.

## RLS za `platform_role_assignments` i `practice_membership_roles` — D-051

Paket: **`002_identity_and_practices`**, Faza 3. Normativno: `02` §17.0, §17.2, §17.4, §22.2;
D-051, klauzule 1–6; D-023, klauzula 11.

- [x] `platform_role_assignments` ima `ENABLE ROW LEVEL SECURITY`.
- [x] `platform_role_assignments` ima `FORCE ROW LEVEL SECURITY`.
- [x] Politika `platform_role_assignments_self_select` postoji, **nepromijenjenog imena i tijela**.
- [x] Politika `platform_role_assignments_system_select` postoji, **nepromijenjenog imena i tijela**.
- [x] Self politika zavisi **isključivo** od `app.user_id`; **ne koristi** `app.practice_id`,
      `set_request_context`, `PracticeContextGuard` ni `TenantDatabaseService`.
- [x] `copilot_system` ima `SELECT` + `USING (true)`; `PUBLIC` nema pristup.
- [x] **`copilot_app` NEMA neograničen `SELECT` nad `platform_role_assignments`** — invarijanta
      D-023, klauzule 11, važi **od ove faze**.
- [x] `practice_membership_roles` ima `ENABLE ROW LEVEL SECURITY`.
- [x] `practice_membership_roles` ima `FORCE ROW LEVEL SECURITY`.
- [x] Politika `practice_membership_roles_self_select` postoji, **nepromijenjenog imena i tijela**.
- [x] Politika koristi `EXISTS` nad `practice_memberships` uz `pm.user_id = app.user_id`.
- [x] Politika radi **bez** §17.3 RLS-a nad `practice_memberships`.
- [x] Podupirući `SELECT` grant nad `practice_memberships` postoji; njegovo ukidanje obara politiku
      sa `42501`.
- [x] Bez postavljenog `app.user_id` obje tabele vraćaju **nula** redova.
- [x] `copilot_system` **nema nijedan** pristup `practice_membership_roles`.
- [x] **Nijedna od tih politika nije kreirana u paketu `013`** — paket `002` je konačni vlasnik.
- [x] `platformRoles[]` u `GET /me` sadrži isključivo dodjele sa `revoked_at IS NULL`.
- [x] **Nijedan revoke endpoint, permisija ni write grant nije uveden.**
- [x] `02` §17.3 **nije** premješten u ovu fazu.

## `practice_settings` u Fazi 3 — D-049

Normativno: `02` §6.4, §20.2b; `03` §5.1 i §10; D-049, klauzule 1–4 i 7.

- [x] Paket `002` kreira **kompletnu** prihvaćenu `practice_settings` schemu.
- [x] `version` i `check (version >= 1)` postoje (D-029, nepromijenjeno).
- [x] `updated_by` postoji.
- [x] **Oba** approval flaga postoje, sa defaultom `false`.
- [x] `copilot_app` ima **tačno** `SELECT (practice_id, allow_mpa_approval,
      allow_billing_specialist_approval)`.
- [x] **Nema table-level `SELECT`** nad `practice_settings`.
- [x] `SELECT *` pada sa `42501`.
- [x] Svaka nedozvoljena kolona pada sa `42501`, **i kada se koristi samo u `WHERE`**.
- [x] Svaka nedozvoljena kolona pada sa `42501`, **i kada se koristi samo u `ORDER BY`**.
- [x] `INSERT`, `UPDATE` i `DELETE` padaju sa `42501`.
- [x] `copilot_system` nema nijedan grant; `PUBLIC` nema nijedan grant.
- [x] **`GET /api/v1/practices/{practiceId}/settings` NIJE registrovan.**
- [x] **`PATCH /api/v1/practices/{practiceId}/settings` NIJE registrovan.**
- [x] **Nijedna RLS politika nad `practice_settings`** nije kreirana u paketu `002`.
- [x] Uslovne permisije u `GET /me` tačne su za **oba** stanja **oba** flaga.
- [x] Izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` je
      **eksplicitno dokumentovana i testom potvrđena**, ne umanjena.

## `FORCE RLS` maintenance protokol — D-048

Normativno: `02` §20.4, §23.4 i §25.1.2; D-048, klauzule 1–6.

- [x] Allowlist faze 3 je **tačno**: `users`, `practices`, `practice_membership_roles`,
      `platform_role_assignments`.
- [x] `practice_memberships` i `practice_settings` **nisu** na allowlisti.
- [x] Seed DML nad allowlistanom tabelom ide **isključivo** kroz protokol iz `02` §23.4.
- [x] Protokol se izvršava u **jednoj eksplicitnoj transakciji**; autocommit nije korišten.
- [x] Koristi se `NO FORCE ROW LEVEL SECURITY`, **nikada** `DISABLE ROW LEVEL SECURITY`.
- [x] RLS ostaje `ENABLED` kroz cijeli prozor.
- [x] Asercija prije DML-a: `relrowsecurity = true`, `relforcerowsecurity = false`.
- [x] Asercija prije `COMMIT`-a: `relrowsecurity = true`, `relforcerowsecurity = true`.
- [x] Neuspjela restore asercija **podiže izuzetak i abortira transakciju**.
- [x] **Prekinut ili neuspio seed ne ostavlja `FORCE` isključenim** — dokazano testom.
- [x] Unutar prozora se ne izvršava nijedan nepovezani sigurnosni DDL.
- [x] Nijedna rola nema `BYPASSRLS`.
- [x] Nijedna `SECURITY DEFINER` funkcija nije uvedena.
- [x] Nijedan superuser seed credential nije uveden.
- [x] Nijedna trajna `copilot_migrator` RLS politika nije kreirana.
- [x] Mehanizam **nije dohvatljiv** iz request/runtime aplikacijskih putanja.
- [x] Steady-state `relrowsecurity = true` i `relforcerowsecurity = true` provjereni **nakon
      migracije i nakon seeda**, kao trajni regresijski test.

## Autorstvo migracije — D-050

Normativno: `02` §26.3; `10` §7; D-050, klauzule 1–4.

- [x] Migracija `002` autorisana je kroz `prisma migrate diff --from-config-datasource
      --to-schema=prisma/schema.prisma --script -o ...`.
- [x] **`prisma migrate dev --create-only` nije korišten.**
- [x] **`prisma db push` nije korišten.**
- [x] Custom SQL — constrainti, grants, revokes, RLS, politike, funkcije, asercije, komentari — je
      ručno dopunjen.
- [x] Kompletan generisani **i** ručno napisani SQL je prošao ljudski pregled.
- [x] Kompletan migration lanac validiran je na **jednokratnoj, ispravno bootstrapovanoj praznoj
      bazi**.
- [x] Primjena je izvršena kroz `prisma migrate deploy`.
- [x] Schema, vlasništvo, privilegije i sigurnosni objekti su **mehanički verifikovani**.
- [x] **Nijedan guard migracije `001` nije oslabljen.**
- [x] Očekivani `migrate diff` drift iz `02` §26.2 nije "ispravljen".

## Role matrica — prihvaćena

Preduslovi su ispunjeni: vlasničke odluke su prihvaćene, **D-039 do D-045 su zabilježeni**, a
**`15_ROLE_PERMISSION_MATRIX_V1.md` je kreiran i ACCEPTED**. Raniji blocker više ne važi.

### Normativni izvor

- [x] `15_ROLE_PERMISSION_MATRIX_V1.md` **postoji** i status mu je **ACCEPTED**.
- [x] `15` je **konsolidovana normativna v1 role-permission matrica**.
- [x] `06` zadržava izvorne ADR-ove — D-023, D-032 i D-039 do D-045.
- [x] `03` definiše **imena permisija koje endpointi traže**.
- [x] `04` definiše **vlasništvo i sekvencu implementacije**.
- [x] Role grantovi se **ne izvode** iz proznih primjera ni starije dokumentacije.
- [x] Budući konflikt zahtijeva **ADR/dokument rekonsilijaciju**, nikada tiho tumačenje.

### Katalog permisija

- [x] Postoji **tačno 32** aktivne permisije.
- [x] Nijedna aktivna permisija nije **dodana, uklonjena, preimenovana, podijeljena ni spojena**.
- [x] Postoje **tačno tri** rezervisane permisije: `analysis.run_tariff`, `configuration.manage`, `integration.manage`.
- [x] Nijedna rezervisana permisija **nije aktivan red matrice**.
- [x] Nijedna rezervisana permisija **nema produkcijski grant**.
- [x] Nepoznata ili rezervisana permisija **pada zatvoreno**.

### Inventar rola

- [x] Tenant role su tačno: `PRACTICE_ADMIN`, `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY`.
- [x] Platform rola je tačno: `SYSTEM_ADMIN`.
- [x] Database role su tačno: `copilot_app`, `copilot_migrator`, `copilot_system`.
- [x] **Database role nisu kolone matrice.**
- [x] **`SYSTEM_ADMIN` nije `copilot_system`.**
- [x] `platformRoles` **nikada** ne ulaze u tenant kompoziciju.
- [x] `SYSTEM_ADMIN` **ne dobija** nijedan automatski tenant pristup.
- [x] **Database grant ne zadovoljava** permisiju endpointa.

### Reprezentacija matrice

- [x] Implementacija predstavlja **tačno 32 reda** iz `15`.
- [x] Svaka ćelija je jedno od: `ALLOW`, `DENY`, `CONDITIONAL`. Vrijednost `BLOCKED — D-OPEN-011`
      je **povučena** (D-047) i nijedna ćelija je više ne nosi.
- [x] Svaka aktivna permisija se pojavljuje **tačno jednom**.
- [x] Svaki red ima **svih sedam** aplikacijskih role ćelija.
- [x] Svaki `Source` se prati do **prihvaćenog ADR-a**.
- [x] **Nema prazne, `OPEN` ni nepoznate** ćelije.
- [x] Nijedna rezervisana permisija nije aktivan red.
- [x] Implementacijski izlaz se **mehanički poredi** sa `15`.
- [x] **Odstupanje od `15` obara build ili testove.**

Evidence:

```text
BRANCH / HEAD
  backend/03-identity-practices
  HEAD = origin/backend/03-identity-practices = 9f60d32c66023c4aad5ac34df267658ddfe5d6b1
  kanonski main 65e2552e13520ead86092f75ca3cc75d206b9f35 je predak Gatea 3A 42fdffb
  Gate 3A 42fdffb8c0af1a3a3a6c6816303e785fd2bc1fae
  Gate 3B 8727ec813a67a186f33162c1083ffb10572c0773
  Gate 3C 9def79b57fb236250e1b6b3074cdecc0329a793e
  Gate 3D 24a90ca0392ce283fa86f3c5412d271c1cedc291
  Gate 3E 9f60d32c66023c4aad5ac34df267658ddfe5d6b1

MIGRATION PAKET
  apps/api/prisma/migrations/20260814013200_002_identity_and_practices/migration.sql (763 linije)
  Sekcije: enumi -> tabele -> constrainti/indeksi -> app_security -> grantovi
           -> ENABLE/FORCE RLS -> 7 politika -> 2 SECURITY INVOKER funkcije
           -> D-048 allowlist (samo dokumentacija) -> rollback (samo dokumentacija)

AUTORSTVO MIGRACIJE / DEPLOYMENT VALIDACIJA (D-050)
  Autorstvo: prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma
             --script -o ...   (pnpm db:migrate:diff), pa ručna dopuna custom SQL-a i
             ljudski pregled kompletnog fajla. Bez migrate dev --create-only, bez db push,
             bez slabljenja ijednog guarda migracije 001.
  Deployment dokaz: apps/api/test/setup/security-global-setup.ts izvršava
             runPrismaCli(['migrate','deploy']) nad jednokratnom, ispravno bootstrapovanom
             praznom bazom copilot_gate3b_<suffix>, pa tek onda seed. Lanac 001 -> 002 se
             time dokazuje kroz stvarni deployment put, na svakom pokretanju test:security.
  Mehanička verifikacija: phase3-schema-catalogue.security.ts poredi enume, tabele, vlasništvo,
             constrainte (pg_get_constraintdef), indekse, grantove, RLS/FORCE, politike i
             funkcije sa prihvaćenim skupom, kroz toStrictEqual — svako odstupanje obara test.

SEED (D-048)
  apps/api/prisma/seed.ts (809 linija), entry point `pnpm db:seed`, konektuje se kao
  copilot_migrator preko MIGRATION_DATABASE_URL; odbija svaki ne-lokalni target.
  Deterministički dataset: fiksni UUID-evi i jedan zamrznuti instant.
  D-048 FORCE-RLS maintenance protokol: allowlist provjera PRIJE `begin`, pa
  BEGIN / NO FORCE / asercija (relrowsecurity=true, relforcerowsecurity=false) / pouzdani DML /
  FORCE / asercija (oboje true) / COMMIT — jedna eksplicitna transakcija po tabeli.
  Zamrznuta allowlist, tačno četiri tabele: users, practices, practice_membership_roles,
  platform_role_assignments. practice_memberships i practice_settings nisu na njoj.
  Idempotentnost: phase3-seed-idempotency.security.ts — drugo pokretanje ne mijenja ništa.
  Prekinut prozor: phase3-force-rls-maintenance.security.ts dokazuje da neuspio DML, neuspjela
  restore asercija (55000) i sirovi ROLLBACK svi vraćaju FORCE, te da odbijeni target uopšte ne
  otvara transakciju.

SCHEMA I CONSTRAINTI
  practice_membership_roles: PK(id); UNIQUE(practice_id, id);
    UNIQUE(practice_id, membership_id, role) — NEPARCIJALAN, odbija duplu dodjelu iste role;
    composite FK (practice_id, membership_id) -> practice_memberships(practice_id, id) —
    cross-practice dodjela je strukturno nemoguća, ne samo validirana.
    Nema kolona revoked_at/revoked_by/active/valid_from/valid_to; nema spekulativnog indeksa.
  practice_memberships: bez singularne kolone `role`; bez indeksa (practice_id, active, role);
    UNIQUE(practice_id, user_id), UNIQUE(practice_id, id), indeks (user_id, active).
  Enumi: entity_status(4), membership_role(6 tenant rola), platform_role(SYSTEM_ADMIN).
  practice_settings: version + CHECK (version >= 1), updated_by, oba approval flaga DEFAULT false.
  Referencijalne akcije ostaju na PostgreSQL default NO ACTION (§28.1 ostaje otvorena).

RLS I PRIVILEGIJE
  D-047: users i practices nose ENABLE + FORCE RLS; users ima tačno dvije PERMISSIVE SELECT
    politike (bootstrap sa obaveznim `app.user_id IS NULL` guardom, i self `id = app.user_id`);
    practices ima PERMISSIVE membership politiku bez filtera na pm.active i RESTRICTIVE
    practices_context_narrow. Column grant users = (id, email, display_name, preferred_language,
    status); practices = (id, code, name, default_language, timezone, status). auth_subject,
    last_login_at, legal_name, zsr_number, gln_number, created_at, updated_at bez granta.
    Nijedan INSERT/UPDATE/DELETE grant. Nijedna SECURITY DEFINER funkcija.
    Treća users politika NIJE kreirana — gate BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS ostaje.
  D-051: platform_role_assignments i practice_membership_roles nose ENABLE + FORCE RLS u paketu
    002; politike platform_role_assignments_self_select, platform_role_assignments_system_select i
    practice_membership_roles_self_select imaju nepromijenjeno ime i tijelo. copilot_app nema
    neograničen SELECT nad platform_role_assignments — invarijanta D-023 klauzule 11 važi od Faze 3.
    Bez app.user_id obje tabele vraćaju nula redova. copilot_system nema pristup
    practice_membership_roles. Podupirući SELECT grant nad practice_memberships je dokazana tvrda
    zavisnost: commitovan REVOKE obara obje zavisne politike sa 42501.
  D-049: practice_settings ima tačno trokolonski SELECT (practice_id, allow_mpa_approval,
    allow_billing_specialist_approval) i nijedan upisni grant; SELECT * i svaka nedozvoljena
    kolona padaju sa 42501 — uključujući kada se kolona pojavi SAMO u WHERE ili SAMO u ORDER BY.
    Nijedna RLS politika nad practice_settings u paketu 002. Nijedna settings ruta nije
    registrovana. Izloženost PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE je
    eksplicitno dokumentovana i potvrđena testom, ne umanjena.
  D-048 održavanje: steady-state relrowsecurity = true i relforcerowsecurity = true za sve četiri
    allowlistane tabele provjeren NAKON migracije I NAKON seeda, kao trajni regresijski test.
    Nijedna rola nema BYPASSRLS; nijedan SECURITY DEFINER; nijedan superuser seed credential;
    nijedna trajna copilot_migrator politika; nijedan operacioni DISABLE ROW LEVEL SECURITY.
    Statički scan dokazuje i da je mehanizam nedohvatljiv iz runtime aplikacijskih putanja.

PERMISSION MODEL
  packages/contracts/src/permission-catalogue.ts — 32 aktivne + 3 rezervisane
    (analysis.run_tariff, configuration.manage, integration.manage); nepoznata ili rezervisana
    permisija pada zatvoreno.
  packages/contracts/src/membership-roles.ts — šest tenant rola, strukturno disjunktnih od
    platform role, pa SYSTEM_ADMIN ne može ući u tenant uniju.
  apps/api/src/identity/domain/permission-matrix.ts — izvršna 32 x 6 tenant matrica, svaka ćelija
    eksplicitna, vrijednosti samo ALLOW/DENY/CONDITIONAL.
  apps/api/src/identity/domain/platform-permissions.ts — SYSTEM_ADMIN drži tačno jedan ALLOW
    (tariff.manage); sedma kolona iz `15` je time predstavljena, ali odvojeno od tenant matrice.
  Konformnost: apps/api/test/fixtures/canonical-role-permission-matrix.ts nezavisno izražava tabelu
    iz `15` §5 sa svih sedam kolona i ne importuje ništa iz implementacije;
    canonical-matrix-document.spec.ts i permission-matrix.conformance.spec.ts mehanički porede red
    po red, ćeliju po ćeliju i Source po Source — odstupanje od `15` obara testove.

GET /me
  Ugovor: packages/contracts/src/me-contract.ts (membershipId, practiceId, practiceName, active,
    roles[], permissions[]; platformRoles kao zaseban top-level blok; bez memberships[].role).
  Implementacija: identity-bootstrap.service.ts u jednoj interaktivnoj transakciji.
  Dokaz nad stvarnim HTTP/PostgreSQL: apps/api/test/phase3-identity-me.security.ts,
    phase3-identity-bootstrap-transaction.security.ts,
    phase3-identity-conditional-permissions.security.ts (oba stanja oba approval flaga).

GET /practices/{practiceId}
  Ugovor: packages/contracts/src/practice-contract.ts — tačno šest polja.
  Implementacija: practice-read.service.ts, practices.controller.ts, practice-context.ts.
  Dokaz nad stvarnim HTTP/PostgreSQL: apps/api/test/phase3-practice-read.security.ts
    (autorizaciona matrica po roli, SYSTEM_ADMIN sam odbijen, practice context, anti-enumeracija,
    zabranjena polja, transakciona izolacija, phase boundary).

TEST SURFACE — izvršeno u ovom zatvaračkom gateu, 2026-08-16
  pnpm test              17 fajlova / 274 testa   PASS   (src/**/*.spec.ts)
  pnpm test:integration   4 fajla   /  46 testova PASS   (test/**/*.integration.ts, copilot_test @ 5433)
  pnpm test:security     12 fajlova / 278 testova PASS   (test/**/*.security.ts, copilot_gate3b_<suffix>)
  pnpm test:e2e           5 fajlova /  41 test    PASS   (test/**/*.e2e-spec.ts)
  UKUPNO                 38 fajlova / 639 testova, 0 failed
  Nijedna suita nije pokrenuta nad razvojnom bazom copilot @ localhost:5432.

OSTALE PROVJERE — izvršeno u ovom zatvaračkom gateu, 2026-08-16
  git diff --check       clean
  pnpm lint              PASS
  pnpm format:check      PASS
  pnpm typecheck         PASS (packages/contracts, apps/api)
  pnpm db:validate       PASS — schema je validna
  pnpm verify:toolchain  PASS — node 24.19.0, pnpm 11.17.0

OPENAPI
  Nije zahtjev zatvaranja Faze 3. Vlasništvo je Faza 12: `04` §14.2 i §14.3 eksplicitno drže
  OpenAPI 3.1 export i generisanje docs/api/openapi-v1.json, a §13 ove checkliste ima stavku
  „OpenAPI 3.1 generated". Acceptance Faze 3 (`04` §5.4) ne sadrži nijedan OpenAPI kriterij, i ova
  checklista nema OpenAPI stavku u §4. Repozitorij nema @nestjs/swagger, SwaggerModule,
  DocumentBuilder, generation skriptu ni docs/api/openapi-v1.json. Formulacija „DTO i OpenAPI" u
  `04` §5.3, aktivnost 7, je starija i manje precizna od faznog vlasništva iz §14; ostavljena je
  nepromijenjena jer §14 već rješava pitanje. Vidi i „Prenesena zapažanja" niže.

TAKSONOMIJA TESTOVA
  HTTP + PostgreSQL sigurnosni dokazi identity/practice slicea namjerno žive u `test:security`
  suiti, koja se izvršava nad jednokratnim bazama. Formulacija „unit" u `08` §24.14 je
  dokumentaciono/taksonomsko pitanje, a ne rupa u acceptanceu Faze 3: traženo ponašanje je testirano
  na jednakom ili jačem nivou. Taksonomija se u zatvaranju namjerno ne redizajnira.
```

## Status razvojne baze

Ovo **nije** stavka acceptancea Faze 3 i namjerno nema checkbox; to je operativna činjenica koju
zatvaračka evidencija bilježi da bi bila potpuna.

- **Validirano:** migracija `002` je dokazana kroz puni `prisma migrate deploy` lanac `001` → `002`
  na jednokratnim, ispravno bootstrapovanim praznim bazama, ponovljeno pri svakom
  `pnpm test:security`.
- **Nije primijenjena:** `pnpm db:migrate:status` (samo čitanje, izvršeno 2026-08-16) prijavljuje da
  normalna lokalna razvojna baza `copilot` @ `localhost:5432` ima primijenjenu samo migraciju `001`,
  a da `20260814013200_002_identity_and_practices` nije primijenjena.

To **nije bloker zatvaranja Faze 3**: ponašanje migracije je dokazano kroz stvarni `migrate deploy`
put, a razvojna baza nije izvor autoriteta. Primjena na lokalni `copilot` je **operaterski korak**
nakon merge-a, odnosno prije narednog lokalnog rada koji je zahtijeva. **Merge PR #12 taj korak ne
izvršava**: stanje razvojne baze i nakon merge-a ostaje `001` primijenjena, `002` nije. Ovo se
**ne odnosi** ni na kakav produkcijski deployment — produkcijskog okruženja nema.

## Zatvaranje Faze 3

```text
PHASE 3 LIFECYCLE STATUS:          DONE
PHASE 3 TECHNICAL IMPLEMENTATION: COMPLETE (dokazana prije merge-a)
TECHNICAL_IMPLEMENTATION_MISSING:  0
CLOSURE_BLOCKER:                   0
PRE_PHASE_4_FIX:                   0
TEHNIČKA IMPLEMENTACIJA HEAD:      9f60d32c66023c4aad5ac34df267658ddfe5d6b1 (Gate 3E)
ZATVARAČKA DOKUMENTACIJA:          2c7d7778a9ec1dae92fd0a5683d1f4afc7b36950 (checkpoint)
KOREKCIJA REFERENCE KANONSKOG MAIN-a:
                                   5c1699a0ea4d98e2f540c6e8cd9ae84997896a42 (branch head prije merge-a)
PUSHED:                            da — origin/backend/03-identity-practices
PULL REQUEST:                      PR #12 „feat(identity): complete Phase 3 identity and practices"
                                   — MERGED
MERGED AT:                         2026-08-16T00:15:08Z (2026-08-16 02:15:08 +0200)
MERGE U main:                      IZVRŠEN — normalan merge commit, ne squash i ne rebase
MERGE COMMIT:                      5c2786d689b50f73f49bfca52d2335ea50ee52c2
  parent 1:                        251544f0b10abb00ee818f1ff5183c95b0ed0d03 (PR #11, main prije merge-a)
  parent 2:                        5c1699a0ea4d98e2f540c6e8cd9ae84997896a42 (head Faze 3)
  dva parenta:                     VERIFIKOVANO; svih sedam commitova Faze 3 očuvano
KANONSKI MAIN PO MERGE-U (PR #12): 5c2786d689b50f73f49bfca52d2335ea50ee52c2 — VERIFIED (historijski)
HISTORIJSKI MAIN (PR #11):         251544f0b10abb00ee818f1ff5183c95b0ed0d03
HISTORIJSKI MAIN (PR #10):         65e2552e13520ead86092f75ca3cc75d206b9f35
DEV DB copilot @ 5432:             migracija 001 primijenjena, 002 nije — operaterski korak,
                                   merge-om nije izvršen
PHASE 4:                           NOT AUTHORIZED, NOT STARTED
```

Zatvaračka dokumentacija je **pripremljena, nezavisno reviewovana i merged u kanonski `main`**.
Lifecycle sekvenca je izvršena tim redom: nezavisni re-review dokumentacije → commit → push →
PR #12 → nezavisni review PR-a (`READY_FOR_NORMAL_MERGE`, 0 BLOCKER / 0 HIGH / 0 MEDIUM, puna
validacija 639 testova / 0 failed) → normalan merge u kanonski `main` → verifikacija `main` nakon
merge-a — čime je Faza 3 prešla iz `IN_PROGRESS` u `DONE`. Faza 3 je time **i tehnički završena i
zatvorena u kanonskom `main`-u**.

Verifikacija kanonskog `main`-a nakon merge-a — **PASS**: `origin/main` je tada bio
`5c2786d689b50f73f49bfca52d2335ea50ee52c2`; merge commit ima tačno dva parenta
(`251544f`, `5c1699a`); MANIFEST integritet 19/19 bez odstupanja. `DONE` označava lifecycle
zatvaranje faze u repozitoriju, **ne** produkcijsku spremnost: OpenAPI ostaje Faza 12,
produkcijski OIDC/MFA ostaje budući rad, pilot readiness se ne tvrdi.

## Prenesena zapažanja

Nijedno od njih nije bloker zatvaranja i nijedno se ne rješava u ovom gateu.

| Zapažanje | Klasifikacija |
|---|---|
| Nema namjenskog testa za duplikat `X-Practice-ID` headera | `HARDENING_BACKLOG` |
| Preciznost komentara u `recording-identity-database.ts` | `DOCUMENTATION_BACKLOG` |
| Opcioni HTTP fixture za `SYSTEM_ADMIN` bez tenant admin role | `HARDENING_BACKLOG` |
| Ranija hardening zapažanja iz Gatea 3B, 3C i 3D | `HARDENING_BACKLOG` |
| Rezidua starih lokalnih probe baza | `NO_ACTION` |
| Formulacija „DTO i OpenAPI" u `04` §5.3, aktivnost 7 | `DOCUMENTATION_BACKLOG` |

---

# 5. Faza 4 — Tenant/RLS

Status: `DONE` — **zatvorena odlukom D-059** (2026-08-21); vidi
„Zatvaranje Faze 4 — D-059" na kraju ove sekcije. Merged u kanonski `main`:

- **P4-5B** — tenant request/context pipeline, PR #15 (`530295d`, implementacija `fdef469`);
- **P4-5R1** — vezivanje identiteta i hardening tenant pipelinea, PR #17 (`2229724`);
- **P4-5C** — `GET /api/v1/practices/{practiceId}/settings`, PR #18 (`0411ae4`, merge `be675fd`);
- **P4-5D** — `PATCH /api/v1/practices/{practiceId}/settings`, `If-Match` put i atomičan
  optimistički `UPDATE`, **PR #20**, merge commit
  `3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5`, `MERGED` **2026-08-20T15:31:49Z** od
  **NerminFejzicAi**.

**Aplikacijska implementacija Faze 4 je time kompletna i merged u kanonski `main`.** Retrospektivni
evidence gate **P4-013** je **`COMPLETE`** — `UNRESOLVED_REQUIRED = 0` i
`SECURITY_CLOSURE_BLOCKERS = 0` (vidi „Gate zatvaranja Faze 4 — P4-013 — `COMPLETE`" niže).
**Faza je zatvorena.** Prelazak `IN_PROGRESS → DONE` izvršen je **zasebnim, vlasnički pregledanim
gateom zatvaranja Faze 4** — odlukom **D-059** (2026-08-21), nakon `PHASE4_FINAL_CLOSURE_AUDIT_PASS`
nad kanonskim `9b8fcdd21a51935b7cc6cd810e0e91e44ec281e3`. Vidi „Zatvaranje Faze 4 — D-059" na
kraju ove sekcije. **Zatvaranje ne autorizuje Fazu 5**, koja je **u trenutku tog zatvaranja
ostala `NOT_STARTED`** (§6). *(Historijska konstatacija, tačna na dan zatvaranja Faze 4; tekući
status Faze 5 je `IN_PROGRESS`, checklist **49 / 8**, nakon kanonskog `P5-I1` — vidi vrh §6.)*

**Obuhvat `P4-013` je rebaziran na ovu, kanonsku Fazu 4 — D-057 (2026-08-20).** Pokušaj 1 gatea
`P4-013A` zaustavljen je sa `P4_013_SCOPE_RECONCILIATION_FAILURE` jer je D-056, klauzula 20
zamrznula zastarjeli obuhvat od **294** reda; kanonska Faza 4 nosi **398** checklist redova.
Obuhvat je sada definisan **strukturnim pravilom** i pokriva **cijelu** ovu sekciju, a fiksna
podjela `64 / 230` je **povučena kao ne-normativna**. **Nijedan red nije uklonjen iz obuhvata**, a
`UNRESOLVED_REQUIRED = 0` ostaje **nepromijenjen**. Detalji su niže, u „Gate zatvaranja Faze 4
— P4-013 — `COMPLETE`".

**Autoritet za slice P4-5D** je **D-055** (HTTP validatori i optimistička konkurentnost), uz
**D-053** kao bazni settings ugovor. D-055, klauzula 33 zabranjuje označavanje `PATCH` stavki na
osnovu **zamrznutog ugovora**; ono što ih ovdje otključava je **implementacija sa dokazom**, ne
odluka.

**Vlasničke ratifikacije gatea P4-5D**, evidentirane usko i bez izmjene D-055:

- **R1 — domen `If-Match` tokena.** Prihvaćeni aplikacijski token mora biti predstavljiv kolonom
  `practice_settings.version`, koja je PostgreSQL `integer`. Gramatika ostaje `"<N>"` iz D-055,
  klauzule 11; maksimalna prihvaćena vrijednost je **`2147483647`**. Svaki sintaksno decimalan
  token **veći** od te vrijednosti daje **`400 VALIDATION_ERROR`**, i to **prije** nego što
  vrijednost ikada bude vezana ili kastovana u PostgreSQL-u. `"0"` ostaje sintaksno valjan i
  **ne** dobija poseban tretman — pošto je perzistirana verzija `>= 1`, prolazi običnim
  nula-redova putem do `409`.
- **R2 — prelijevanje na `int4` maksimumu.** Ako red već nosi `version = 2147483647`, a pozivalac
  pošalje podudarajući `If-Match: "2147483647"`, `version = version + 1` unutar iskaza podiže
  PostgreSQL `22003`. Prihvaćeno ponašanje je **generičko `500 INTERNAL_ERROR`** sa statičnim,
  neosjetljivim Problem Details tijelom i **`ROLLBACK`**-om. **Ne** pretvara se u `400` ni `409`,
  **nema** pre-reada, clampa, odbijanja `2147483647` u parseru, posebnog schema constrainta ni
  namjenskog `catch`-a.

Normativno: D-033, D-038, **D-049**, **D-051**, **D-052**, **D-053**, **D-054** i **D-055**;
`02` §16.2,
§17.0, §17.3, §18.1, §20.2, §20.2b, §22.13 i §23.4.4a; `03` §3.7, §5, §10 i §28.5; `04` §6.2,
§6.4.1 i §6.4.2; `07` Faza 4.

Vlasnik migration paketa za preostale RLS stavke ove faze: **`013_rls_policies`**. Schema objekti
ostaju u `002_identity_and_practices` (Faza 3). Ne uvodi se novi broj paketa.

**Sužen obuhvat nakon D-051.** `02` §17.2 i §17.4 **više nisu u ovoj fazi** — konačni su u paketu
`002` i Fazi 3. Ova faza zadržava `02` §17.3, `practice_settings` RLS i runtime put (D-049),
`set_request_context`, uspostavu `app.practice_id`, `PracticeContextGuard` i preostale tenant
tabele (`02` §17.0). **Konkretan `TenantDatabaseService` facade je odlukom D-056 izuzet iz obuhvata
zatvaranja ove faze** — vidi „Konkretan `TenantDatabaseService` facade — uslovno odgođen (D-056)"
niže; tenant database granica kao **sigurnosna semantika** ostaje obaveza ove faze i **ne slabi se**.

**Dodatno sužen obuhvat nakon D-052.** RLS i grantovi nad `review_decision_change_links` **nisu u
ovoj fazi** — tabelu kreira paket `009_review_approvals` u Fazi 10, pa u Fazi 4 ne postoji.
Vlasništvo slicea ostaje `013_rls_policies`; odgođeno je isključivo izvršenje. **Preostale tenant
politike ove faze izvršavaju se samo nad tabelama koje u Fazi 4 stvarno postoje.** Ista odluka
**eksplicitno ovlašćuje** proširenje D-048 allowliste na `practice_memberships` i
`practice_settings` (`02` §23.4.4a).

**Tumačenje imena artefakata — D-054.** U ovoj fazi `PracticeContextGuard` je **naziv faze** tenant
admisije i uspostave konteksta, ne obavezno NestJS `Guard`; za tekuću tenant rutu realizovan je
`TenantRequestPipeline`-om. `TenantDatabaseService` ostaje **kanonski facade koncept** za tenant
business module; njegov historijski potpis `run(practiceId, userId, callback)` **nije normativan**.
Pri konfliktu, redoslijed iz `03` §3.7.1 i D-047, klauzule 10 je nadređen imenu artefakta.

**Dopuna — D-056.** Konkretna klasa `TenantDatabaseService` **nije deliverable zatvaranja ove
faze**. Ranije vlasništvo faze 4 nad **konkretnim facadeom** (D-047, klauzula 16; D-051,
klauzula 5) je **nadiđeno**; koncept i njegova sigurnosna svojstva **ostaju nepromijenjeni**, a
D-054, klauzule 6–10 **ostaju binding**.

## Slice P4-5B — tenant request/context pipeline

**Normativno: D-054.** Merged u kanonski `main` kroz PR #15; implementacijski commit `fdef469`.
Ova sekcija bilježi **isključivo** ono što je taj slice mehanički dokazao. Stavke u vlasništvu
drugih slice-eva Faze 4 (paket `013`, settings ruta, preostale tenant tabele) ostaju neoznačene i
usklađuju se u vlastitim gate-ovima.

- [x] **`PracticeContextGuard` je koncept, ne NestJS `Guard`** — realizovan klasom
      `TenantRequestPipeline` (`apps/api/src/identity/application/tenant-request.pipeline.ts`),
      **unutar** autentifikovane interaktivne transakcije (D-054, klauzule 2–3).
- [x] **`CanActivate` varijanta nije uvedena** i ne smije biti uvedena tamo gdje bi validirala
      tenant kontekst prije admisije korisnika (D-054, klauzula 4).
- [x] **Kompletan redoslijed tenant rute do `set_request_context` je implementiran** za
      `GET /api/v1/practices/{practiceId}`: pipeline vlasnik koraka 3–10, servis rute vlasnik
      koraka 11 (`03` §3.7.1).
- [x] **`set_request_context` je jedini put do `app.practice_id`** na toj ruti — bez `set_config`,
      bez druge session metode, bez dodatne database funkcije, bez `SECURITY DEFINER` i bez RLS
      zaobilaznice.
- [x] **Obje membership barijere zadržane** — aplikacijska (D-047, klauzula 10, korak 4) i ona
      unutar funkcije (korak 6); nijedna ne zamjenjuje drugu.
- [x] **Provjera `practices.status` je strogo prije** poziva funkcije; privilegovani prozor je
      dužine nula.
- [x] **Transakcijski lokalan tenant kontekst i izolacija su testirani** — uspostava za tačno
      traženu ordinaciju, nestanak nakon `COMMIT` i nakon `ROLLBACK`, izolacija sekvencijalnih i
      konkurentnih zahtjeva, i nekontaminacija sljedećeg zahtjeva nakon odbijenog.
- [x] **`42501` iz `set_request_context`** se prevodi u zajednički `403 ACCESS_DENIED`, bez
      otkrivanja SQLSTATE-a, iskaza, imena funkcije ni database poruke; **nema** globalnog
      prevođenja `42501`.
- [ ] **Konkretan `TenantDatabaseService` facade** — **`EXPLICITLY_DEFERRED` — D-056.**
      **Nije** implementiran, **ne označava se** završenim i **više nije neriješeni zahtjev ove
      faze**. Koncept ostaje kanonski (D-054, klauzula 5; D-056, klauzula 3), a sigurnosnu semantiku
      koju predstavlja tekući runtime već zadovoljava — jedan `PrismaService`, jedna pinovana
      interaktivna transakcija, tenant kontekst na toj istoj sesiji, kanonski D-047 redoslijed i
      nijedan caller-supplied identitetski seam (D-056, klauzula 2). **Živa obaveza je očuvana u
      §6 („Konkretan `TenantDatabaseService` facade — prenesena obaveza (D-056)"), po precedentu
      D-052.** Trigger je **uslovan**: prvi stvarni tenant business modul koji zatraži tu
      apstrakciju, a ne dolazak broja faze.
- [x] **Uklanjanje `userId` seama** iz `TenantRequestPipeline.admit(...)` — **RIJEŠENO** kroz
      PR #17 (`2229724`). Kanonski potpis je sada `TenantRequestPipeline.admit(session, request)`;
      identitet se izvodi **isključivo** iz `app.user_id` autentifikovane sesije, pa pogrešan
      korisnik **nije izraziv**. Precondition D-054, klauzule 12 je ispoštovan: prva dodatna
      tenant ruta (P4-5C) dodana je **tek nakon** toga (D-055, klauzula 32).

## Slice P4-5C — settings `GET`

**Normativno: D-053 (dio A), D-054 i D-055.** Merged u kanonski `main` kroz PR #18; implementacijski
commit `0411ae4`, merge `be675fd`. Ova sekcija bilježi **isključivo** ono što je taj slice mehanički
dokazao. **Nijedna `PATCH` stavka se ovdje ne označava** — u vrijeme tog slicea `PATCH` nije
postojao na `main`-u. *(Historijski kontekst: `PATCH` je na kanonski `main` došao tek slice-om
P4-5D, PR #20.)*

- [x] **`GET /api/v1/practices/{practiceId}/settings` je registrovan** i odgovara kroz
      `PracticeSettingsController` / `PracticeSettingsReadService`.
- [x] **Ruta koristi prihvaćeni `TenantRequestPipeline`** — bez drugog pipelinea, bez druge
      transakcije, bez drugog `PrismaClient`-a i bez rutno specifične tenant faze.
- [x] **Tražena permisija je `practice.settings.read`**, izvedena kroz jedinstvenu aplikacijsku
      reprezentaciju matrice `15`; **nema** hard-kodirane `PRACTICE_ADMIN` provjere.
- [x] **Nema caller-supplied identiteta** — servis prima verifikovani auth **subject** i dvije
      nepouzdane request vrijednosti; membership se izvodi iz `app.user_id` (D-054, klauzula 12).
- [x] **Reprezentacija je tačno osam polja** iz D-053, klauzule A.1, građena polje po polje
      (bez spreada), pa proširenje database projekcije ne može dodati polje u odgovor.
- [x] **`version` se ne pojavljuje u JSON tijelu** `GET` odgovora.
- [x] **`ETag` na `GET`-u je JAK i postavljen aplikacijski** — `"<version>"`, postavljen prije
      serijalizacije tijela, čime istiskuje slab content-hashed tag koji bi Express inače generisao
      (D-053, klauzula A.2).
- [x] **`ETag` i tijelo potiču iz iste pročitane vrste**, pa header i tijelo ne mogu opisivati dva
      različita čitanja.
- [x] **Čitanje je devetokolonsko i strogo na koraku 11** — nakon `set_request_context` i nakon
      odluke o permisiji.
- [x] **Nedostajući `practice_settings` red nakon autorizacije daje `500 INTERNAL_ERROR`** sa
      statičnim, neosjetljivim tijelom; **nije** `404`, `403`, prazne ni default postavke, i red se
      **ne kreira i ne popravlja** (D-055, klauzule 7–9).
- [x] **`PATCH` ruta NIJE registrovana** — ni kao stub; ostaje `404` (D-053, klauzula B.4).
      **NADIĐENO GATEOM P4-5D.** Ova stavka bilježi ono što je P4-5C dokazao **u svoje vrijeme**
      i ostaje označena kao historijski nalaz tog slicea. Tekuće stanje grane
      `backend/04-practice-settings-patch` je suprotno i namjerno: `PATCH` **jeste** registrovan,
      i tri testa koja su ranije tvrdila `404` **konvertovana su** u pozitivne invarijante
      (autorizovan `PATCH` bez `If-Match`-a daje `428`), a ne obrisana.
- [x] **Autorizovan `304` na `If-None-Match`** — **`SATISFIED_BY_EVIDENCE` (D-056, dio B).**
      Ponašanje **postoji**, **kanonizovano** je u D-055, dijelu B, i **mehanički je dokazano
      trajnim testovima na kanonskom `main`-u**. Ranije obrazloženje ovog reda („namjenski `304`
      testovi nisu uvedeni") bilo je **zastarjelo**: dokaz nije nedostajao, nego nije bio priznat.
      Postojeći trajni dokaz pokriva sva četiri tražena ponašanja — autorizovan `GET` sa
      **podudarajućim** `If-None-Match` daje **`304`** sa praznim tijelom; **nakon `PATCH`-a**
      stari tag daje **`200`**; **novi** tag daje **`304`**; a **odbijen** `GET` **ne može** biti
      pretvoren u `304` (zadržava `403`).
      **D-055, klauzula 6 se ne opoziva** — ona je uskratila ovlaštenje za **novi** `304` rad
      (kod, granu, nove namjenske testove) u svom gateu, a **nije** trajna zabrana prepoznavanja
      **postojećeg** mehaničkog dokaza (D-056, klauzula 9). **Nijedan novi test nije uveden i
      nijedna linija aplikacijskog koda nije promijenjena.**

      Evidence:

      ```text
      Test file:    apps/api/test/phase4-practice-settings-patch.security.ts
      Describe:     non-regression of everything this slice did not own
      Test 1:       keeps the GET conditional 304 behaviour unchanged (D-055 clauses 3 and 6)
                    -> autorizovan GET + podudarajuci If-None-Match => 304, prazno tijelo
                    -> nakon PATCH-a: stari tag => 200; novi tag => 304
      Test 2:       keeps an If-None-Match from turning a REFUSED GET into a 304 (clause 4)
                    -> odbijen pozivalac + If-None-Match => 403, nikada 304
      Novi testovi: 0
      Izmjene aplikacijskog koda: 0
      ```

## Slice P4-5D — settings `PATCH` — **MERGED**

**Autoritet: D-055**, uz D-053 kao bazni ugovor, i vlasničke ratifikacije **R1** i **R2** gatea
P4-5D (vidi uvod Faze 4). Implementirano na grani `backend/04-practice-settings-patch` i **merged u
kanonski `main`** kroz **PR #20**:

```text
PULL REQUEST:  PR #20 „feat(settings): implement practice settings PATCH with optimistic
               concurrency (P4-5D)" — MERGED
MERGE COMMIT:  3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5
MERGED AT:     2026-08-20T15:31:49Z
MERGED BY:     NerminFejzicAi
BASE:          main
HEAD:          backend/04-practice-settings-patch
```

Svaka označena stavka ispod ima **trajni test** koji je dokazuje. Dva komplementarna sloja:

- **`src/identity/application/practice-settings-write.service.spec.ts`** — vlasnik **redoslijeda i
  broja iskaza**: kompletan snimljeni call log svakog ishoda, tačno **jedan** `UPDATE`, **nijedan**
  settings read prije ni poslije njega, i `SET` lista koja sadrži isključivo poslana polja. To su
  pitanja o tome **koji su iskazi izvršeni**, na koja se stvarnoj bazi izvana ne može odgovoriti.
- **`test/phase4-practice-settings-patch.security.ts`** — vlasnik **ponašanja stvarne baze**:
  `02` §17.1 politika, devetokolonski grantovi, `updated_at` koji je upisiv a nečitljiv, stvarna
  konkurentnost dva pisca sa istim `ETag`-om, stvaran `int4` overflow i stvaran `ROLLBACK`.

- [x] `PATCH /api/v1/practices/{practiceId}/settings` **registrovan** — `@Patch(':practiceId/settings')`
      u postojećem `PracticeSettingsController`; `PUT`, `POST`, `DELETE` i svaka dublja ruta ispod
      `settings` ostaju `404`.
- [x] **Ruta koristi prihvaćeni `TenantRequestPipeline`** — bez drugog pipelinea, bez druge
      transakcije, bez drugog `PrismaClient`-a i bez rutno specifične tenant faze (D-055,
      klauzule 28–29).
- [x] **Kanonski D-047 redoslijed je očuvan** — tijelo se validira **tek nakon** cijelog
      `03` §3.7.1, koraka 1–10. Nepoznat/neaktivan korisnik, nedostajući ili neispravan
      `X-Practice-ID`, path/header nesklad, odsutan ili neaktivan membership, neaktivna ordinacija
      i nedovoljna permisija dobijaju **kanonsku refuzaciju bez ijednog `errors[]` polja**, i to sa
      namjerno neispravnim tijelom u zahtjevu.
- [x] **Standardni `@Body()` DTO se NE koristi** na ovoj ruti — globalni Nest parameter pipe se
      izvršava **prije** tijela kontroler metode, dakle prije nego što tenant transakcija uopšte
      postoji; kontroler prosljeđuje **sirovo** tijelo, a validacija se izvršava unutar servisa.
- [x] `If-Match` write put — implementiran, i **prije** validacije tijela (vlasnički prihvaćena
      preferencija).
- [x] Parser prihvaćene gramatike `"<N>"` (D-055, klauzula 11) — `practice-settings-if-match.ts`;
      bez `trim`-a, sa usidrenim regexom, ograničenjem dužine prije `BigInt`-a i `int4` granicom
      (ratifikacija **R1**).
- [x] `428` / `400` / `409` razdvajanje (D-055, klauzula 12) — implementirano, uključujući
      razliku **odsutan** (`428`) naspram **prisutan ali prazan** (`400`) header.
- [x] Jaka i tačna komparacija; `W/"N"` odbijen (D-055, klauzula 13) — `W/"<tekuća verzija>"` je
      `400` i **nikada** ne zadovoljava `If-Match`.
- [x] `400 VALIDATION_ERROR` za prazno tijelo `{}` (D-055, klauzula 14) — bez `errors[]`, bez
      `UPDATE`-a, bez inkrementa `version`-a i **bez promjene `updated_at`** (posljednje dokazano
      privilegovanim fixture čitanjem). Isti put pokrivaju i tijelo koje uopšte nije poslano i
      **`[]`** korijen (vlasnička korekcija **C2**).
- [x] **Tijelo koje nosi samo nepoznata polja daje `422 UNKNOWN_FIELD`**, a **ne** prazan patch —
      schema se izvršava prije brojanja poslanih polja.
- [x] Atomičan optimistic-concurrency `UPDATE` sa predikatom `practice_id` **i** `version`
      (D-055, klauzule 15–18) — jedan `UPDATE ... RETURNING`, `Prisma.sql`/`Prisma.join`, sve
      klijentske vrijednosti vezane kao parametri, imena kolona isključivo iz izvornih literala
      zatvorene unije.
- [x] Zabrana aplikacijskog pre-reada (D-055, klauzula 16) — dokazana snimljenim call logom: ni
      `findPracticeSettings` prije, ni ijedno settings čitanje poslije `UPDATE`-a.
- [x] `409 VERSION_CONFLICT` za nula pogođenih redova iz **oba** uzroka (D-055, klauzule 19–21) —
      zastarjela verzija i **nepostojeći red** daju isti status, isti `code`, isti `title` i isti
      `detail`; nema drugog čitanja i nema diskriminatora.
- [x] `200` sa istom osmopoljnom reprezentacijom i **novim** `ETag`-om iz istog
      `UPDATE ... RETURNING` iskaza (D-055, klauzule 22–23) — reprezentacija i tag su izdvojeni u
      **jedan zajednički modul** koji `GET` i `PATCH` uvoze.
- [x] Tražena permisija `practice.settings.manage` na `PATCH`-u (D-055, klauzula 28) — izvedena
      kroz jedinstvenu aplikacijsku reprezentaciju matrice `15`; **nema** hard-kodirane
      `PRACTICE_ADMIN` provjere. `PRACTICE_ADMIN` prolazi, preostalih pet tenant rola ne.
- [x] **`SYSTEM_ADMIN` sam po sebi nema tenant bypass** — `403`; korisnik sa istom platform rolom
      ali i sa stvarnim `ACTIVE` `PRACTICE_ADMIN` membershipom prolazi, dakle grant dolazi iz
      tenant permisije, a ne iz platform role.
- [x] **Ratifikacija R1 dokazana** — `"2147483647"` je prihvaćen token, `"2147483648"` i svaki
      duži decimalni token daju `400`, i **nijedan** klijentski `If-Match` ne može proizvesti
      PostgreSQL `22003`.
- [x] **Ratifikacija R2 dokazana** — red parkiran na `int4` maksimumu sa podudarajućim `If-Match`
      daje `500 INTERNAL_ERROR` sa statičnim tijelom, potpun `ROLLBACK` (verzija, poslovna polja,
      `updated_at` i `updated_by` nepromijenjeni) i **bez GUC rezidue**.
- [x] **Pre-auth parsiranje JSON-a je nepromijenjeno** — neispravan JSON na sada registrovanoj
      `PATCH` ruti i dalje daje isti **statični** `400` bez `errors[]`, identičan onome na putanji
      koja uopšte nije registrovana. Ponašanje je transport-level i route-independent; `03` §9 ga
      klasifikuje kao `400`, i ovaj slice ga **ne mijenja**.
- [x] **Nema rezidue tenant konteksta** ni nakon jednog ishoda — `200`, `428`, `400` (`If-Match`),
      `422`, `400` (prazan patch), `409` i `500`.
- [x] **`If-None-Match` se na `PATCH`-u ne čita** (D-055, klauzula 24) — ne zamjenjuje `If-Match`
      i ne mijenja nijedan ishod; `GET` `304` ponašanje je non-regression dokazano nepromijenjenim.
- [x] **Nijedna globalna cache politika nije promijenjena** (D-055, klauzule 26–27).

## Schema i funkcije

- [x] `app_security` schema.
- [x] `set_user_context(p_user_id uuid)`.
- [x] `set_request_context(p_practice_id uuid)` — tačno taj potpis.
- [x] `set_request_context` je **SECURITY INVOKER**.
- [x] `set_request_context` ne prima `p_user_id` ni bilo koji caller-provided identifikator korisnika.
- [x] fixed search path na obje funkcije.
- [x] public execute revoked na obje funkcije.
- [x] **SECURITY DEFINER se ne koristi za zaobilaženje `practice_memberships` RLS-a.**

## Autentifikovani user context

- [x] Bearer token validiran prije tenant bootstrapa.
- [x] Autentifikovani aplikacijski korisnik rezolviran iz pouzdanih auth podataka.
- [x] Identitet korisnika uspostavljen u transakciji/sesiji prije poziva `set_request_context`.
- [x] Klijent ne može poslati ni pregaziti identitet korisnika kroz `set_request_context`.
- [x] `set_user_context` je isključivo korak pouzdanog identiteta i nikada se ne puni iz request bodyja, query parametra ni `X-Practice-ID`.
- [x] `set_user_context` se ne uklanja i ne preimenuje samo zato što `set_request_context` ne smije primati `user_id` — to su odvojene odgovornosti.

## Membership validacija

- [x] `X-Practice-ID` se tretira samo kao nepouzdan traženi tenant identifikator.
- [x] Tražena practice se prihvata tek nakon pronađenog aktivnog membershipa.
- [x] Rezolucija membershipa koristi posebnu user-scoped `practice_memberships` bootstrap politiku.
- [x] Bootstrap radi prije nego `app.practice_id` postoji.
- [x] Normalna tenant RLS se ne koristi za bootstrap konteksta koji ta ista RLS zahtijeva.
- [x] Nepostojeći membership mapira se na `403`.
- [x] Neaktivan membership mapira se na `403`.
- [x] Neuspjeh bootstrapa ne ostavlja upotrebljiv tenant context.
- [x] **`practice_membership_roles` NIJE potreban** za provjeru postojanja membershipa (D-038, klauzule 20–21).
- [x] `set_request_context` **ne čita** `practice_membership_roles`.
- [x] `set_request_context` ne prima ni `user_id` ni rolu.
- [x] **Aktivan membership sa nula rola SMIJE uspostaviti tenant context.**
- [x] Takav membership dobija **`403`** na svakoj permission-gated tenant ruti.

## RLS za `practice_membership_roles` i `platform_role_assignments` — premješteno u Fazu 3

**Ažurirano odlukom D-051 (2026-08-14).** Ovi artefakti **više ne pripadaju ovoj fazi**. Paket
`002_identity_and_practices` i Faza 3 su njihov **konačni vlasnik** (`02` §17.0, §17.2, §17.4,
§22.2; §4 ovog dokumenta). Puna verifikaciona lista je u §4.

- [x] Paket `013_rls_policies` **ne sadrži nijedan** `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`
      ni `FORCE ROW LEVEL SECURITY` za `practice_membership_roles` i `platform_role_assignments`.
- [x] Politike iz `02` §17.2 i §17.4 **nisu prepisane, oslabljene ni zamijenjene** u ovoj fazi.
- [x] Faza 4 ih smije **verifikovati i koristiti**, ali ne rekreirati.
- [x] Ove politike **nisu** riješile D-OPEN-011 i ne tumače se tako; access model je riješen
      odlukom **D-047** kroz `02` §17.5 i §17.6, već u Fazi 3.

## RLS i runtime put za `practice_settings` — D-049

Paket: `013_rls_policies`. Normativno: `02` §6.4, §18.1, §20.2b i §22.13; `03` §5 i §10;
D-049, klauzula 5.

- [x] `ENABLE ROW LEVEL SECURITY`.
- [x] `FORCE ROW LEVEL SECURITY`.
- [x] Standardna tenant politika `practice_id = app.practice_id`.
- [x] **Phase gate pada ako `UPDATE` grant postoji bez pripadajuće tenant politike.**
- [x] `GET /api/v1/practices/{practiceId}/settings` registrovan — **P4-5C, PR #18**.
- [x] `PATCH /api/v1/practices/{practiceId}/settings` registrovan — **P4-5D, PR #20**, merged u
      kanonski `main` (`3658c6e`).
- [x] `ETag` vraćen na oba odgovora — jak, aplikacijski postavljen `"<version>"`; na `PATCH`-u je
      to **nova** verzija, izvedena iz reda koji je vratio isti `UPDATE ... RETURNING`.
- [x] `If-Match` obavezan na `PATCH` — **P4-5D** (D-055, klauzula 10).
- [x] `428 PRECONDITION_REQUIRED` bez `If-Match` — **P4-5D**; **prisutan ali prazan** header je
      `400`, ne `428`.
- [x] `400 VALIDATION_ERROR` na sintaksno neprihvaćen `If-Match` — **P4-5D**
      (D-055, klauzule 11–12; ratifikacija R1 za `int4` granicu).
- [x] `409 VERSION_CONFLICT` na stale `If-Match` — **P4-5D**; isti ishod i za nepostojeći red.
- [x] `version` se inkrementira **atomično** — `version = version + 1` unutar jednog iskaza, sa
      predikatom `version = <očekivana>`; dokazano stvarnom konkurentnošću (pet istovremenih
      pisaca sa istim `ETag`-om → tačno jedan `200`, četiri `409`, tačno jedan inkrement).
- [x] `practice.settings.read` i `practice.settings.manage` ostaju **`PRACTICE_ADMIN` only**
      (D-044, nepromijenjeno; `15`) — obje rute vožene kroz svih šest tenant rola, i kroz
      `SYSTEM_ADMIN` bez i sa tenant membershipom. Matrica **nije** mijenjana.
- [x] Izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` je
      **zatvorena** — regresijski test dokazuje da `copilot_app` više ne vidi redove izvan tekućeg
      tenanta.
- [x] `copilot_system` **nema** nijedan grant; `PUBLIC` **nema** nijedan grant.

### Zamrznuta settings reprezentacija — D-053, dio A

Normativno: `03` §10 („Settings reprezentacija"); `02` §20.2b.1.

**Stanje nakon P4-5D.** `GET` polovina svake stavke ispod dokazana je u P4-5C (PR #18); `PATCH`
polovina je dokazana u P4-5D (PR #20, merged u kanonski `main`). Kućice se označavaju
ovdje jer sada **obje** polovine postoje i imaju trajne testove. Projekcija i tag su izdvojeni u
**jedan zajednički modul** (`practice-settings-representation.ts`) koji obje rute uvoze, pa dvije
kopije reprezentacije više nisu izrazive.

- [x] `GET` i **uspješan** `PATCH` vraćaju **istu** reprezentaciju.
- [x] Reprezentacija ima **tačno osam** polja: `practiceId`, `billingReviewRequired`,
      `allowMpaApproval`, `allowBillingSpecialistApproval`, `requireReasonForManualChange`,
      `aiEnabled`, `axenitaExportEnabled`, `retentionPolicyCode`.
- [x] `retentionPolicyCode` je `string|null`; preostalih šest su `boolean`; `practiceId` je `uuid`.
      `null` se **renderuje** kao `null`, a ne izostavlja, pa je skup ključeva istih osam imena i
      kad kolona nosi `NULL`; prazan string ostaje legalan i **ne** stapa se u `null`.
- [x] Oba odgovora nose `ETag: "<version>"`, izveden iz `practice_settings.version`.
- [x] **`version` se ne pojavljuje kao polje JSON tijela** — ni u `GET`, ni u `PATCH` odgovoru, ni
      u `PATCH` zahtjevu (`version` u tijelu zahtjeva je `422 UNKNOWN_FIELD`).
- [x] `updated_at`, `updated_by` i `configuration` se **ne vraćaju** — ni na `GET`-u ni na
      `PATCH`-u; `RETURNING` imenuje isključivo devet `SELECT`-granted kolona.

### Tačna `SELECT` površina — D-053, dio A

- [x] `SELECT` grant obuhvata **tačno devet** kolona: `practice_id`, `billing_review_required`,
      `allow_mpa_approval`, `allow_billing_specialist_approval`,
      `require_reason_for_manual_change`, `ai_enabled`, `axenita_export_enabled`,
      `retention_policy_code`, `version`.
- [x] **Nema table-level `SELECT`.**
- [x] `id`, `configuration`, `updated_at` i `updated_by` ostaju **nečitljivi**.
- [x] Nedozvoljena kolona pada sa `42501` **i kada se koristi samo u `WHERE` ili `ORDER BY`**.
- [x] Trokolonska površina Faze 3 je **strogi podskup**; **nijedan grant nije opozvan**.

### Tačna `UPDATE` površina — D-053, dio B

- [x] `UPDATE` grant obuhvata **tačno devet** kolona: `billing_review_required`,
      `allow_mpa_approval`, `allow_billing_specialist_approval`,
      `require_reason_for_manual_change`, `ai_enabled`, `axenita_export_enabled`,
      `retention_policy_code`, `version`, `updated_at`.
- [x] **Nema table-level `UPDATE`.**
- [x] `practice_id`, `id`, `configuration` i `updated_by` ostaju **bez `UPDATE`-a**.
- [x] **Nema `INSERT` i nema `DELETE`** za runtime role.
- [x] **`updated_by` je nepromijenjen nakon uspješnog `PATCH`-a** i **nije** tretiran kao
      autoritativno audit polje — **P4-5D**. Iskaz kolonu **ne imenuje**, a fixture joj upisuje
      prepoznatljivu ne-`null` vrijednost, pa je tvrdnja stvarna, a ne „i dalje `null`". Čita se
      privilegovano, kroz D-048 maintenance prozor, jer runtime rola nema `SELECT` nad njom.
- [x] **Nijedan novi triger nije uveden**; paket `014_immutability_triggers` je **nepromijenjen**
      — P4-5D ne dira nijedan `prisma/` put.

### Mehanika optimističkog update-a — D-053, dio B

**Autoritet za implementaciju: D-055.** Implementirano u gateu **P4-5D** i merged u kanonski
`main` kroz **PR #20** (`3658c6e`). D-055 dodatno zamrzava ono što D-053 ne navodi:
prihvaćenu gramatiku `"<N>"` (klauzula 11), razdvajanje `428`/`400`/`409` (klauzula 12), jaku i
tačnu komparaciju (klauzula 13), `400` za prazno tijelo (klauzula 14), zabranu pre-reada
(klauzula 16), `409` za nula redova iz **oba** uzroka (klauzule 19–21) i jedan izvor istine za
uspješan odgovor (klauzule 22–23) — sve je implementirano i pokriveno trajnim testovima.

- [x] Očekivana verzija se izvodi **isključivo iz `If-Match`** — nema drugog izvora i nema
      podrazumijevane vrijednosti.
- [x] Izvršava se **jedan atomičan SQL `UPDATE`** — dokazano snimljenim call logom; nijedno
      settings čitanje ne prethodi mu niti ga slijedi.
- [x] `UPDATE` postavlja **samo poslana** poslovna polja — prisutnost se izvodi iz
      `Object.hasOwn` nad sirovim tijelom, pa su `false` i `retentionPolicyCode: null` **poslane
      vrijednosti**, a izostavljeno polje nema nikakvu dodjelu.
- [x] `UPDATE` postavlja `version = version + 1` — tačno jednom po pogođenom redu, izračunato u
      bazi iz reda koji se ažurira.
- [x] `UPDATE` postavlja `updated_at` na **tekuće vrijeme baze** (`now()`), bez učešća
      aplikacijskog sata.
- [x] Predikat je `practice_id = <uspostavljeni tenant> and version = <očekivana verzija>`.
- [x] Nula pogođenih redova zbog zastarjele verzije → **`409 VERSION_CONFLICT`**; isti ishod i
      zbog nepostojećeg reda, bez ijednog diskriminatora.
- [x] Uspjeh vraća reprezentaciju i **novi** `ETag`, oba iz istog `UPDATE ... RETURNING` reda.
- [x] Pozivalac **nikada** ne šalje `version`, `updated_at` ni `updated_by`; poslano se **odbija**
      sa `422 UNKNOWN_FIELD`.
- [x] **Nije uveden**: triger nad `version`, `SECURITY DEFINER`, privilegovana helper funkcija,
      izmjena paketa `014`, novi migration paket, API polje za proizvoljnu verziju. Nijedan
      `prisma/` put nije dodirnut.
- [x] **Isti-vrijednost patch je stvaran patch** — poslana vrijednost jednaka perzistiranoj i
      dalje izvršava `UPDATE`, inkrementira `version` i vraća novi `ETag`. **Nema** no-op
      detekcije i **nema** `IS DISTINCT FROM` predikata.
- [x] **SQL sigurnost** — `Prisma.sql` / `Prisma.join`; sve klijentske vrijednosti su vezani
      parametri; imena kolona dolaze isključivo iz izvornih literala odabranih iscrpnim `switch`-em
      nad zatvorenom unijom. **Nema** `Prisma.raw(clientInput)`, `$queryRawUnsafe`,
      `$executeRawUnsafe`, konkatenacije SQL-a ni `Object.keys(body)` u poziciji identifikatora.
- [x] **Cast `retentionPolicyCode`-a je `::text`, a NE `::varchar(100)`** (vlasnička korekcija
      **C1**) — eksplicitan `varchar(n)` cast u PostgreSQL-u **tiho skraćuje**, čime bi poništio
      `22001` odbranu same kolone. Aplikacijski `@MaxLength(100)` je normalna barijera (`422
      INVALID_LENGTH`), a kolona ostaje backstop; test dokazuje da vrijednost od tačno 100 znakova
      preživi **bajt po bajt**.

### `GET /me` nakon `practice_settings` RLS-a — D-053, dio D

Normativno: `02` §17.1a; `03` §10. Faza 4 **adaptira aplikacijski put**, ne politiku.

- [x] Tenant politika nad `practice_settings` je **doslovno** `practice_id =
      nullif(current_setting('app.practice_id', true), '')::uuid` — **nepromijenjena**.
- [x] **Nije uveden** bootstrap/membership-wide izuzetak ni ijedno drugo slabljenje.
- [x] `GET /me` ostaje **neutralna, autentifikovana** ruta.
- [x] **`X-Practice-ID` nije uveden** na `/me`.
- [x] Zamrznuti `/me` ugovor iz `03` §10 je **nepromijenjen**.
- [x] Svaki `practice_id` za interni read dolazi **isključivo iz razriješenih membership redova**
      za `app.user_id`; **nijedna** vrijednost iz tijela, query parametra, headera ni putanje ne
      učestvuje.
- [x] **Neaktivan membership ne dobija tenant kontekst** i ostaje `permissions = []`.
- [x] Za **aktivan** membership kojem uslovne postavke trebaju, kontekst se uspostavlja **po
      membershipu**, kroz prihvaćeni `set_request_context` put (`02` §16.2.3).
- [x] Read se izvršava **pod istom strogom tenant politikom**.
- [x] **Sva ne-tenant-scoped čitanja — uključujući `practiceName` za sve membershipe — završena su
      prije prvog `set_request_context` poziva** (RESTRICTIVE politika `02` §17.6).
- [x] Postavke ordinacije A **ne doprinose** ordinaciji B; **nema unije** postavki ni rola preko
      ordinacija.
- [x] **Nijedan novi mehanizam čišćenja konteksta nije uveden** — izolaciju daju brisanje unutar
      `set_request_context` i kraj transakcije.
- [x] **Nema `SECURITY DEFINER`, `BYPASSRLS`, superuser puta ni zaobilaznice.**
- [x] Provjera `practices.status` iz koraka 4 §3.7.1 **nije uvedena na `/me`** (D-053, klauzula
      D.10).

### `GET /me` regresijski dokaz — D-053, klauzula D.12

- [x] Iste kanonske `/me` fixture daju **iste** `memberships[].permissions` **prije i nakon**
      uvođenja `practice_settings` RLS-a.
- [x] Uslovno ponašanje `MPA` i `BILLING_SPECIALIST` je tačno za **oba** stanja **oba** flaga.
- [x] Neaktivan membership ostaje `permissions = []`.
- [x] Multi-practice membership koristi postavke **svoje** ordinacije, nezavisno.
- [x] `practiceName` je prisutan za **svaki** membership — dokaz redoslijeda čitanja.
- [x] **Nijedan tenant kontekst ne curi** nakon transakcije.
- [x] **Nijedan klijentski poslan practice identifikator** ne učestvuje u neutralnom `/me`.

## RLS za `review_decision_change_links` — odgođeno u Fazu 10

**Ažurirano odlukom D-052 (2026-08-16).** Ovi artefakti se **ne izvršavaju u ovoj fazi**. Tabelu
`review_decision_change_links` kreira paket `009_review_approvals` u **Fazi 10** (`02` §22.9), pa u
Fazi 4 **ne postoji** — RLS i grantovi nad njom nisu izvodivi. Vlasništvo slicea **ostaje**
`013_rls_policies` (`02` §22.13); odgođena je **isključivo tačka izvršenja**. Puna, nepromijenjena
verifikaciona lista je u §11 („RLS i grants — D-046").

**Nijedan sigurnosni zahtjev nije uklonjen, oslabljen ni označen završenim.**

U ovoj fazi provjerljivo je isključivo sljedeće:

- [x] Faza 4 **ne kreira** tabelu `review_decision_change_links`.
- [x] Paket `013_rls_policies` u Fazi 4 **ne sadrži nijedan** `CREATE POLICY`,
      `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` ni grant za
      `review_decision_change_links`.
- [x] Nijedna migracija, test ni aplikacijski artefakt Faze 4 **ne referencira** tu tabelu kao
      postojeću.
- [x] Generički tenant RLS obrazac i test harness postoje i dokazani su nad `practice_settings`,
      tako da ih odgođeni slice Faze 10 samo proširuje (D-052, klauzula A.8).
- [x] **Ne uvodi se novi broj paketa i nijedan se ne renumeriše.**

## Konkretan `TenantDatabaseService` facade — uslovno odgođen (D-056)

**Ažurirano odlukom D-056 (2026-08-20).** Dispozicija: **`EXPLICITLY_DEFERRED`**.

Konkretna klasa `TenantDatabaseService` **nije deliverable zatvaranja ove faze**. Ranije vlasništvo
faze 4 nad **konkretnim facadeom** (D-047, klauzula 16; D-051, klauzula 5) je **nadiđeno**;
odgođena je **isključivo konkretna klasa**, ne sigurnosna semantika.

**Sigurnosni koncept ostaje kanonski i obavezan** (D-006; D-054, klauzula 5). Sigurnosnu semantiku
koju koncept predstavlja tekući runtime na kanonskom `main`-u **već zadovoljava**, i to je dokazano
trajnim testovima slice-eva P4-5B, P4-5R1, P4-5C i P4-5D:

- jedan `PrismaService` i jedan `copilot_app` klijent;
- **jedna** pinovana interaktivna transakcija po tenant zahtjevu;
- tenant kontekst uspostavljen `set_request_context`-om **na toj istoj sesiji**;
- kanonski D-047 redoslijed (`03` §3.7.1, koraci 1–11);
- **nijedan** caller-supplied identitetski seam — `admit(session, request)`;
- **nijedna** druga, ugniježdena ni paralelna transakcija;
- **nijedan** izlazak iz transakcije;
- tenant poslovne operacije **isključivo nakon** tenant admisije, pod RLS-om.

**Nijedan sigurnosni zahtjev nije uklonjen, oslabljen ni označen završenim.** Živa obaveza za
konkretan facade je **očuvana u §6 (Faza 5)**, po precedentu D-052.

**Trigger je uslovan, ne fazni.** Obaveza se aktivira kada **stvarni tenant business
repozitorij/modul zatraži tu apstrakciju**. Faza 5 je najranija **očekivana** takva faza jer je
repozitorij već tako imenuje, ali dolazak broja faze sam po sebi obavezu **ne** stvara.

U ovoj fazi provjerljivo je isključivo sljedeće:

- [x] Faza 4 **ne uvodi** konkretnu klasu `TenantDatabaseService`, ni kao stub, ni kao dummy.
- [x] Faza 4 **ne uvodi** drugi `PrismaClient`, drugi database sloj ni paralelan database stack.
- [x] Tenant database granica ostaje **jedna** pinovana interaktivna transakcija sa tenant
      kontekstom uspostavljenim u njoj.
- [x] **Nijedan caller-supplied identitet** nije granica povjerenja ni na jednoj tenant ruti.
- [x] D-054, klauzule 6–10 **ostaju binding** i moraju biti ponovo dokazane prije prihvatanja bilo
      kojeg budućeg konkretnog facadea.

## Proširenje D-048 allowliste — D-052, dio B

Paket: `013_rls_policies`. Normativno: `02` §23.4.4a i §23.4.5; `08` §21.8; D-048; D-052, dio B.

Ova faza prvi put uvodi `FORCE RLS` nad `practice_memberships` i `practice_settings`, a pouzdani
seed put upisuje u obje.

- [x] Allowlist je proširen **tačno** sa `practice_memberships` i `practice_settings`.
- [x] Proširenje je **eksplicitno** — tiho proširenje obara phase gate.
- [x] Allowlist faze 3 (`users`, `practices`, `practice_membership_roles`,
      `platform_role_assignments`) je **nepromijenjena**; ukupno **šest** tabela.
- [x] `FORCE RLS` je **obnovljen nakon seeda** za obje tabele.
- [x] **Put neuspjeha obnavlja `FORCE RLS`.**
- [x] **Rollback obnavlja `FORCE RLS`** — prekinut seed nikada ne ostavlja `FORCE` isključenim.
- [x] **Nijedna rola nema `BYPASSRLS`.**
- [x] **Nijedna `SECURITY DEFINER` zaobilaznica** nije uvedena.
- [x] **Nijedan superuser runtime put** nije konfigurisan.
- [x] **`DISABLE ROW LEVEL SECURITY`** se ne pojavljuje u forward migraciji ni seedu.
- [x] **Nijedna trajna owner-write politika** ne postoji.
- [x] Testovi dokazuju steady-state `ENABLE` **i** `FORCE` **prije i nakon** seeda.
- [x] Upis izvan protokola iz `02` §23.4.3 **pada**.

## Database grants

Normativno: `02` §20.2.

- [x] `copilot_migrator` je owner i kreira tabelu kroz migraciju.
- [x] `copilot_app` ima **isključivo** RLS-zaštićeni runtime SELECT.
- [x] `copilot_app` **nema** generički role-assignment mutation pristup.
- [x] `copilot_app` **nema** DELETE za uklanjanje role kroz trenutni runtime put.
- [x] `copilot_system` **nema** nijedan automatski grant nad tenant tabelom.
- [x] `PUBLIC` **nema** nijedan grant.
- [x] **Database role nisu aplikacijske role.**
- [x] **`SYSTEM_ADMIN` nije `copilot_system`** — platform aplikacijska rola naspram database role.

## Redoslijed autorizacije

Normativno: `03` §3.7.1; `04` §6.2.1. Svaka granica se dokazuje **zasebno**.

**Jedanaest koraka** (D-047, klauzula 10; restituirano odlukom D-053, dio C).

Označeno stanje vrijedi za **jedinu postojeću tenant rutu**, `GET /api/v1/practices/{practiceId}`
(slice P4-5B, D-054, klauzula 11). Svaka nova tenant ruta dokazuje isti redoslijed **iznova**.

- [x] 1. bearer token je autentifikovan.
- [x] 2. pouzdani `app.user_id` je izveden iz verifikovanog subjekta.
- [x] 3. `X-Practice-ID` je pročitan i validiran.
- [x] 4. **membership-scoped `status` tražene ordinacije je pročitan prije promjene konteksta** —
      nula redova → `403 ACCESS_DENIED`; `status <> 'ACTIVE'` → `403 ACCESS_DENIED` uz rollback.
- [x] 5. `set_request_context(p_practice_id uuid)` je pozvan.
- [x] 6. aktivan `practice_memberships` red je validiran.
- [x] 7. transakcijski lokalni tenant context je uspostavljen.
- [x] 8. dodijeljene tenant role su učitane.
- [x] 9. efektivne permisije su izvedene.
- [x] 10. tražena permisija i prihvaćeni uslovi su evaluirani.
- [x] 11. komanda je izvršena pod tenant RLS-om.

- [x] Korak 4 se izvršava **prije** koraka 5 — `app.practice_id` ne postoji dok korak 4 ne uspije.
- [x] Korak 4 je **aplikacijski**; tijelo `set_request_context` **nije** promijenjeno (`02`
      §16.2.3).
- [x] Korak 4 dokazuje **postojanje** membershipa, korak 6 dokazuje **aktivan** membership;
      **nijedan ne zamjenjuje drugi**.
- [x] Nijedan drugi korak nije uklonjen ni oslabljen; **nijedna nova sigurnosna semantika nije
      uvedena** (D-053, klauzula C.1).

## Kompozicija efektivnih permisija

Normativno: D-038, klauzule 7–11 i 16–18; `03` §28.5; `04` §6.4.1.

- [x] Efektivne permisije se izvode iz **svih** rola dodijeljenih odabranom aktivnom membershipu.
- [x] Unija je ograničena na **jednu ordinaciju**.
- [x] `DENY` **ne doprinosi** grant.
- [x] `DENY` **ne poništava** `ALLOW` druge dodijeljene tenant role.
- [x] **Nema implicitnog nasljeđivanja rola.**
- [x] **Nema per-user permission overrida.**
- [x] Neaktivan membership doprinosi **nula** permisija.
- [x] Aktivan membership sa nula rola doprinosi **nula** permisija.
- [x] Autorizacija je **deny-by-default**.
- [x] Uslovna permisija zahtijeva podobnu tenant rolu **i** prihvaćenu practice postavku ili runtime uslov.
- [x] `platformRoles` **nikada** ne doprinose tenant permission uniji.
- [x] `SYSTEM_ADMIN` bez aktivnog tenant membershipa dobija **`403`** na tenant rutama.
- [x] **Svaki grant dolazi iz prihvaćene matrice u `15`**; resolver je učitava, a nijedan grant nije hard-kodiran izvan nje.
- [x] Duplirani grantovi iz dvije role **kolabiraju** u jednu efektivnu permisiju.
- [x] Trenutne role se učitavaju iz `practice_membership_roles` za **odabrani aktivni membership**.
- [x] **Caller-supplied rola se nikada ne prihvata.**

## Transaction-local context

Dokazano slice-om P4-5B za tekuću tenant rutu (D-054, klauzula 11).

- [x] `app.user_id` uspostavljen iz pouzdanog auth stanja.
- [x] `app.practice_id` postavljen tek nakon uspješne membership validacije.
- [x] Tenant context je transakcijski lokalan.
- [x] interactive transaction.
- [x] Tenant-scoped upiti se izvršavaju tek nakon uspješnog bootstrapa.
- [x] Context se automatski čisti na kraju transakcije.
- [x] Pooled konekcija ne nasljeđuje context prethodnog requesta.
- [x] Failure i rollback putanje ne propuštaju `app.practice_id`.

## Platform i tenant razdvajanje

- [x] `platformRoles` se obrađuju odvojeno od tenant membershipa.
- [x] `platformRoles` se ne pretvaraju automatski u tenant permisije.
- [x] Tenant membershipi i platform role se ne spajaju unijom.
- [x] Platform/system context se ne uspostavlja kroz `set_request_context`.
- [x] Tenant role dolaze **isključivo** iz `practice_membership_roles`.
- [x] `SYSTEM_ADMIN` sa aktivnim membershipom izvodi tenant permisije **samo** iz dodijeljenih tenant rola.
- [x] `tariff.manage` ostaje platform permisija i platform ruta.
- [x] `integration.read` ostaje tenant-scoped i ograničen na `PRACTICE_ADMIN`.
- [x] **Database grant nikada ne zamjenjuje permisiju endpointa.**

## Access model za `users` i `practices` u Fazi 4 — D-047

- [x] Politike nad `users` i `practices` iz paketa `002` **nisu prepisane, oslabljene ni
      zamijenjene** — Faza 4 ih ne dira.
- [x] RESTRICTIVE politika `practices_context_narrow` **nije** pretvorena u permissive.
- [x] Nakon uvođenja `app.practice_id`, vidljivost `practices` sužava se na **tačno jednu**
      ordinaciju, i kada upit nema `WHERE` klauzulu.
- [x] Nakon §17.3, `copilot_app` **više ne vidi** generičke `practice_memberships` redove — time je
      međustanje Faze 3 zatvoreno.
- [x] Politika nad `practices` daje **identičan** rezultat prije i nakon §17.3.
- [x] `practice_memberships` bootstrap pristup i dalje **nije** opšti runtime pristup nad `users`.
- [x] `practice_memberships` bootstrap pristup i dalje **nije** opšti runtime pristup nad `practices`.
- [x] Phase gate pada ako implementacija tiho uvede neograničen pristup nad bilo kojom od te dvije tabele.
- [x] Self-enumeracija vlastitih membership rola (§17.4) **nije** riješila D-OPEN-011 — to je učinio D-047.

## Role matrica — prihvaćene dodjele

Normativni izvor: `15` §5; izvorne odluke D-023, D-032 i D-039 do D-045.

### Dodjele sa najvećim rizikom

- [x] `integration.read` → `PRACTICE_ADMIN` only.
- [x] `tariff.manage` → `SYSTEM_ADMIN` only (platform).
- [x] `tariff.raw_result.read` → `PRACTICE_ADMIN` only.
- [x] `audit.read` → `PRACTICE_ADMIN` + `AUDITOR`.
- [x] `audit.export` → `PRACTICE_ADMIN` + `AUDITOR`.
- [x] `encounter.close` → `PRACTICE_ADMIN` + `PHYSICIAN` + `BILLING_SPECIALIST`.
- [x] `analysis.review_decision` → `PHYSICIAN` + `BILLING_SPECIALIST`.
- [x] `analysis.export` → `PHYSICIAN` + `BILLING_SPECIALIST`.
- [x] `analysis.export.read` → `PHYSICIAN` + `BILLING_SPECIALIST`.
- [x] `finding.resolve` → `PHYSICIAN` only.
- [x] `encounter.cancel` → `PHYSICIAN` only.
- [x] `analysis.cancel` → `PHYSICIAN` + `MPA`.
- [x] `encounter.document.archive` → `PHYSICIAN` only.

### Negativne provjere

- [x] `PRACTICE_ADMIN` sam po sebi **nema nijednu kliničku ovlast**.
- [x] `AUDITOR` **ne pregleda** encountere, analize ni sirovi tarifni rezultat.
- [x] `READ_ONLY` ima **nula `ALLOW`** i **nula `CONDITIONAL`**.
- [x] `SYSTEM_ADMIN` **nema nijednu tenant permisiju** kroz platform rolu.
- [x] `MPA` **nema** `analysis.review_decision`.
- [x] `PRACTICE_ADMIN` sam po sebi **ne odobrava i ne opoziva** odobrenje.

### Baseline workflow

Vrijednosti se **mehanički porede** sa `15`; ne izvode se iz naziva role.

- [x] `patient_reference.read` odgovara `15`.
- [x] `patient_reference.create` odgovara `15`.
- [x] `encounter.read` odgovara `15`.
- [x] `encounter.create` odgovara `15`.
- [x] `encounter.update` odgovara `15`.
- [x] `encounter.document.list` odgovara `15`.
- [x] `encounter.document.read` odgovara `15`.
- [x] `encounter.document.create` odgovara `15`.
- [x] `analysis.read` odgovara `15`.
- [x] `analysis.run` odgovara `15`.

### Uslovno odobravanje i opoziv

Normativno: D-041; `03` §10 i §20; `15` §6.

- [x] `analysis.approve` — `PHYSICIAN` `ALLOW`.
- [x] `analysis.approve` — `MPA` `CONDITIONAL` uz `allow_mpa_approval = true`.
- [x] `analysis.approve` — `BILLING_SPECIALIST` `CONDITIONAL` uz `allow_billing_specialist_approval = true`.
- [x] `analysis.approve` — sve ostale role `DENY`.
- [x] `analysis.approval.revoke` ima **identične role ćelije** kao `analysis.approve`.
- [x] Flag **bez** odgovarajuće role **ne daje** permisiju.
- [x] Rola **bez** uključenog flaga je **odbijena**.
- [x] **Neaktivan membership je odbijen** i kada je flag uključen.
- [ ] Podobnost se evaluira **u trenutku opoziva**.
- [ ] **Opozivalac ne mora biti originalni odobravatelj.**
- [ ] `reason` je **obavezan**.
- [ ] Dokaz odobrenja se **nikada ne briše**.
- [ ] Approval historija ostaje **immutable**.
- [ ] **Revocation audit event** je emitovan.

**Dispozicija posljednjih šest redova — D-058 (2026-08-20), gate `P4-013F`.** Šest redova iznad
(`R267`–`R272` u ledgeru `P4-013`, od „Podobnost se evaluira **u trenutku opoziva**." do
„**Revocation audit event** je emitovan.") preslikavaju **D-041, klauzule 6–11**, koje opisuju
**ponašanje write puta opoziva**. Faza 4 taj put **ne implementira i nije ovlaštena da ga
implementira**: tabelu `analysis_approvals` kreira paket `009_review_approvals` **u Fazi 10**
(`02` §22.9; `04` §12.2 i §12.3), a `07`, Prompt — Faza 4 izričito zabranjuje kreiranje novog
endpointa. Po **precedentu D-052, A.7** obaveze su **premještene uz doslovno očuvanje teksta**:

| Red | Zahtjev | Dispozicija | Ciljna faza | Ciljni red | Autoritet |
|---|---|---|---|---|---|
| `R267` | Podobnost se evaluira **u trenutku opoziva**. | `FUTURE_SCOPE` | Faza 10 | doslovno preuzet red 1 | D-041, kl. 7; D-058, kl. 4 i 8 |
| `R268` | **Opozivalac ne mora biti originalni odobravatelj.** | `FUTURE_SCOPE` | Faza 10 | doslovno preuzet red 2 | D-041, kl. 6; D-058, kl. 4 i 8 |
| `R269` | `reason` je **obavezan**. | `FUTURE_SCOPE` | Faza 10 | doslovno preuzet red 3 | D-041, kl. 8; D-058, kl. 4 i 8 |
| `R270` | Dokaz odobrenja se **nikada ne briše**. | `FUTURE_SCOPE` | Faza 10 | doslovno preuzet red 4 | D-041, kl. 9; D-058, kl. 4 i 8 |
| `R271` | Approval historija ostaje **immutable**. | `FUTURE_SCOPE` | Faza 10 | doslovno preuzet red 5 | D-041, kl. 10; D-016; D-058, kl. 4 i 8 |
| `R272` | **Revocation audit event** je emitovan. | `FUTURE_SCOPE` | Faza 10 | doslovno preuzet red 6 | D-041, kl. 11; D-058, kl. 4 i 8 |

```text
vlasnicka faza        Faza 10 - Review/approval
ciljna sekcija        "Opoziv odobrenja - preuzeto iz Faze 4 (D-058)" (Faza 10 nize)
preslikavanje         1:1, doslovan tekst, bez sazimanja
SILENT_RETIREMENTS    0
```

**Kućice ostaju neoznačene i tekst se ne mijenja** (D-058, klauzula 7): `[x]` u ovom repozitoriju
znači `SATISFIED_BY_EVIDENCE` uz citiran dokaz (`00` §14), a ovo je **autoritetom potkrijepljena
dispozicija**, ne dokaz. Označavanje pripada gateu **`P4-013B`**.

**Prvih osam redova ove sekcije se NE premješta.** Ćelije matrice, uslovni flagovi, pravilo „flag
bez role ne daje permisiju", pravilo „rola bez flaga je odbijena" i odbijanje **neaktivnog
membershipa** ostaju **obavezni zahtjevi Faze 4** (D-058, klauzula 2). Nijedna sigurnosna semantika
Faze 4 nije oslabljena ni odgođena.

## Profili rola

### AUDITOR

- [x] `audit.read` `ALLOW`.
- [x] `audit.export` `ALLOW`.
- [x] Sve ostale aktivne permisije `DENY`.
- [x] `practice.read` je **`DENY`** (D-047) — `AUDITOR` i dalje ima tačno dvije aktivne permisije.
- [x] **Nema discovery ni listing endpointa.**

### READ_ONLY

- [x] **Nula `ALLOW`.**
- [x] **Nula `CONDITIONAL`.**
- [x] `practice.read` je **`DENY`** (D-047) — invarijanta nula `ALLOW` ostaje na snazi.
- [x] Sve ostale aktivne permisije `DENY`.

### PRACTICE_ADMIN

- [x] `practice.read` — **jedina rola koja ga dobija** (D-047); projekcija bez `zsrNumber`,
      `glnNumber` i `legalName`.
- [x] `practice.settings.read`.
- [x] `practice.settings.manage`.
- [x] `encounter.close`.
- [x] `tariff.raw_result.read`.
- [x] `audit.read`.
- [x] `audit.export`.
- [x] `integration.read`.
- [x] **Nema kliničkog pristupa** osim ako je zasebno dodijeljena druga prihvaćena tenant rola.

## Endpoint authorization guards

- [x] Tražena permisija dolazi iz `03`.
- [x] Podobnost role dolazi iz `15`.
- [x] Guard koristi **centralizovani effective-permission resolver**.
- [x] Kod endpointa **ne hard-koduje** alternativnu listu rola.
- [x] Uslovi se provjeravaju **nakon** rezolucije membershipa i rola.
- [x] **RLS ostaje nezavisan drugi sloj**, ne zamjena za provjeru permisije.

Negativne provjere:

- [x] nedostajuća permisija → `403`.
- [x] neaktivan membership → `403`.
- [x] membership sa nula rola → `403`.
- [x] samo `SYSTEM_ADMIN` na tenant ruti → `403`.
- [x] injekcija role → odbijena.
- [x] rola iz druge ordinacije → ne doprinosi.
- [x] isključen approval flag → `403`.
- [x] cross-user curenje rola → odbijeno.
- [x] cross-practice curenje rola → odbijeno.

**Dispozicija reda „isključen approval flag → `403`" — D-058, klauzula 5.** Taj red (`R303` u
ledgeru `P4-013`) **ostaje u Fazi 4** i nosi dispoziciju **`SATISFIED_BY_EVIDENCE`**, dokazanu
**postojećim trajnim testovima**, bez ijednog novog testa (put dopušten D-056, klauzulom 9):

```text
R303   dispozicija       SATISFIED_BY_EVIDENCE
       EVIDENCE_DOMAIN   PERMISSION (ne-terminalna oznaka, D-057, klauzule 7-11)
       autoritet         D-058, klauzula 5; D-041, klauzule 1-5; D-038, klauzula 18
```

- `apps/api/src/identity/domain/effective-permissions.spec.ts`, blok `F, G, H — conditional
  grants` — resolver **uskraćuje** `analysis.approve` i `analysis.approval.revoke` dok je flag
  isključen, za `MPA` i za `BILLING_SPECIALIST`, uključujući `treats a non-boolean flag value as
  disabled`;
- `apps/api/src/identity/application/tenant-request.pipeline.spec.ts` — `MPA` sa
  `allowMpaApproval = false` na **traženoj** ordinaciji i tražena permisija `analysis.approve` daju
  **`403`** (`never lets another practice's settings contribute`), a ogledalski test
  `grants a CONDITIONAL cell from the requested practice's own flag` dokazuje suprotni smjer.

**Kućica se u gateu `P4-013F` ne označava** (D-058, klauzula 7) — označavanje pripada `P4-013B`.
Konkretne rute odobravanja i opoziva iz `03` §10 i §20 u Fazi 4 **ne postoje**; ta rezidua je
**dodana kao zaseban red u Fazi 10** (D-058, klauzula 6) i **ne mijenja** ovu dispoziciju.

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

**Terminalne dispozicije ove sekcije — `P4-013B` (rekonsilijacija pod D-045 i D-057).** Trinaest
redova iznad nosi **autoritetom potkrijepljenu dispoziciju**, a **ne** implementacijski dokaz.
Kućice zato **ostaju neoznačene**: `[x]` u ovom repozitoriju znači `SATISFIED_BY_EVIDENCE` uz
citiran dokaz (`00` §14; D-058, klauzula 7), pa bi označavanje ovdje bilo **lažan dokaz
implementacije**.

| Red | Dispozicija | Autoritet | Vlasnik / uslov aktivacije |
|---|---|---|---|
| `R306`–`R313` (`OUT OF V1`) | `NOT_APPLICABLE_IN_V1` | D-045 | v1 ih **ne implementira**; nijedan implementacijski zadatak se ne otvara |
| `R314`–`R318` (`REQUIRES NEW PERMISSION AND ADR`) | `FUTURE_SCOPE` | D-045 | aktivira se **tek** uz novu permisiju **i** prihvaćen ADR; do tada nema vlasničke faze |

**Nijedan zahtjev nije tiho penzionisan.** `R306`–`R313` su **granica obuhvata v1**, ne odgođeni
rad. `R314`–`R318` su **uslovno buduće** — njihov trigger je odluka (nova permisija + ADR), ne
dolazak broja faze.

## Guard i servisi

- [x] PracticeContext guard — **kao koncept**, realizovan `TenantRequestPipeline`-om za tekuću
      tenant rutu; **nije** NestJS `CanActivate` i ne smije to postati tamo gdje bi validirao
      tenant kontekst prije admisije korisnika (D-054, klauzule 2–4).
- [ ] TenantDatabaseService — **`EXPLICITLY_DEFERRED` — D-056.** Koncept ostaje kanonski
      (D-054, klauzula 5); **konkretan facade nije implementiran**, **ne označava se** završenim i
      **nije deliverable zatvaranja ove faze**. Uvodi se tek kada ga stvarni tenant business modul
      zatraži, uz ponovni dokaz D-054, klauzula 6–10. Živa obaveza je očuvana u §6.
- [x] RLS enabled.
- [x] FORCE RLS.

## Testovi

- [x] Validan aktivan membership uspostavlja tenant context.
- [x] Nepostojeći membership vraća `403`.
- [x] Neaktivan membership vraća `403`.
- [x] Pozivalac ne može impersonirati drugog korisnika kroz parametar funkcije.
- [x] `X-Practice-ID` sam po sebi ne autorizuje tenant pristup.
- [x] Tenant-scoped upit prije bootstrapa pada.
- [x] SECURITY INVOKER ne zaobilazi membership RLS.
- [x] Neuspjeh bootstrapa ne ostavlja `app.practice_id`.
- [x] Context nestaje nakon završetka transakcije.
- [x] Pooled konekcija ne dobija context prethodnog requesta.
- [x] `platformRoles` ne kreiraju tenant membership.
- [x] Opšti runtime pristup nad `users`/`practices` **ne postoji** — potvrđeno negativnim
      testovima iz `08` §21.5 (D-047).
- [x] no-context default deny.
- [x] pooled connection leakage test.
- [x] inactive membership denied.
- [x] Practice A/B read isolation.
- [x] Practice A/B write isolation.
- [x] runtime role cannot bypass.

## Fixtures — D-038

- [x] membership sa **nula** rola.
- [x] membership sa **jednom** rolom.
- [x] membership sa **više** rola.
- [x] korisnik sa `PRACTICE_ADMIN` **i** `PHYSICIAN` u istoj ordinaciji.
- [x] **isti korisnik sa drugačijim skupom rola** u drugoj ordinaciji.
- [x] neaktivan membership koji **zadržava** svoje role redove.
- [x] pokušaj duplirane dodjele iste role.
- [x] pokušaj cross-practice dodjele koji krši composite FK.
- [x] `SYSTEM_ADMIN` **bez** tenant membershipa.
- [x] `SYSTEM_ADMIN` **sa** zasebnim tenant membershipom.
- [x] korisnik **bez ijednog** membershipa.
- [x] `PRACTICE_ADMIN` **bez** `PHYSICIAN`.
- [x] `AUDITOR`.
- [x] `READ_ONLY`.
- [x] uslovni approval flagovi u oba stanja — uključeni i isključeni.
- [x] Fixture **ne zavise od redoslijeda izvršavanja**.

## Testovi — D-038

- [x] schema constraint testovi.
- [x] RLS self-enumeracija.
- [x] odbijanje pristupa rolama drugog korisnika.
- [x] odbijanje cross-practice pristupa.
- [x] **determinističan redoslijed `roles[]`**.
- [x] **odsustvo polja `memberships[].role`**.
- [x] unija permisija za membership sa više rola.
- [x] `DENY` u jednoj roli **ne poništava** `ALLOW` iz druge.
- [x] zero-role membership — **deny-by-default**.
- [x] neaktivan membership — odbijen na tenant rutama.
- [x] razdvajanje platform i tenant klase rola.
- [x] **odbijanje injekcije role** kroz request body, query parametar, header i argument database funkcije.
- [x] uklanjanje role, pa **uspješna ponovna dodjela** iste role.
- [ ] zahtjevi za audit dokazom budućeg assignment/removal puta (`ASSIGNED` / `REMOVED`).
- [x] **conformance test** — implementacijska matrica se mehanički poredi sa `15` i **odstupanje obara test**.
- [x] testovi tvrde **isključivo prihvaćene ćelije iz `15`** i ništa izvan njih.

**Dokaz redova `R347`, `R348` i `R369` — gate `P4-013V-B`, PR #23.** Ova tri reda i red `R382`
(D-038 gate, niže) bili su posljednji `UNRESOLVED_REQUIRED` redovi obuhvata `P4-013` koji su
tražili **izvršni** dokaz. Trajni testovi su dodani u PR #23 i **merged u kanonski `main`**:

```text
Test file:       apps/api/test/phase4-membership-role-assignment-constraints.security.ts
Evidence commit: 111d91d385b87735772bda0aba8623f7a6a1ad94
Kanonski merge:  58f83d49c524bef0434d0ba1d6d04079ca6ece52   (PR #23)
Targeted run:    9 / 9 PASS
Full security:   16 files | 579 tests | 579 passed | 0 failed | 0 skipped
Typecheck:       PASS
Lint (changed):  PASS
```

| Red | Zahtjev | Dokazano ponašanje | SQLSTATE / constraint |
|---|---|---|---|
| `R347` | pokušaj duplirane dodjele iste role | **stvarno** database odbijanje pri ponovnoj dodjeli iste role istom membershipu | `23505`, `practice_membership_roles_membership_role_key` |
| `R348` | pokušaj cross-practice dodjele koji krši composite FK | **stvarno** database odbijanje dodjele membershipu ordinacije A pod ordinacijom B | `23503`, `practice_membership_roles_membership_fk` |
| `R369` | uklanjanje role, pa **uspješna ponovna dodjela** iste role | `INSERT` → prisutan → `DELETE` → odsutan → ponovni `INSERT` iste logičke trojke → **tačno jedan** red | — (uniqueness slot se oslobađa; soft-delete/parcijalni unique bi pao na `23505`) |

Testovi tvrde i **suprotni smjer** — druga rola istom membershipu je **prihvaćena**, a isti
membership pod **vlastitom** ordinacijom je **prihvaćen** — pa odbijanje dokazano pripada
**trojci** i **ordinaciji**, a ne membershipu kao takvom.

**Dispozicija reda `R370` — `FUTURE_SCOPE` (D-045; D-038, klauzule 25–32).** Red traži audit dokaz
**budućeg** assignment/removal puta (`ASSIGNED` / `REMOVED`). Taj write put Faza 4 **ne
implementira i nije ovlaštena da ga implementira** — generička runtime administracija rola je
`OUT OF V1` (`R309`–`R311`, sekcija „Granice — izvan v1"). Kućica **ostaje neoznačena**: dokaz ne
postoji jer put ne postoji, a dispozicija nije dokaz. **Obaveza nije penzionisana** — aktivira se
zajedno sa samim assignment/removal putem, kada ga prihvaćena odluka uvede.

Gate:

- [x] **ALL RLS TESTS GREEN — required before phase 5.**

D-038 gate — svaka stavka mora biti **dokazano ispunjena** prije nego što se faza smatra
završenom. Nijedan checkbox se ne označava bez izvršene provjere.

- [x] singularna kolona `practice_memberships.role` **ne postoji**;
- [x] tabela `practice_membership_roles` i svi njeni constrainti **postoje**;
- [x] vlasništvo paketa je **identično** onome u `02` i `04`;
- [x] RLS self-enumeracija **ne izlaže** role redove drugog korisnika;
- [x] `GET /me` vraća `roles[]`, **nikada** `role`;
- [x] tenant i platform role se **ne spajaju** unijom;
- [x] membership sa nula rola **ne dobija** nijednu tenant permisiju;
- [x] neaktivan membership **ne autorizuje** nijednu tenant rutu;
- [x] duplirana i cross-practice dodjela role **padaju**;
- [x] injekcija role **nije moguća**;
- [x] generički `users`/`practices` pristup **nije implementiran**; politike i column grantovi iz
      D-047 su prisutni tačno kako su propisani;
- [x] implementacijska matrica **ne odstupa** od `15`;
- [x] broj aktivnih permisija je **32**;
- [x] broj rezervisanih permisija je **3**;
- [x] nijedna rezervisana permisija **nema grant**;
- [x] nijedan `Source` u matrici **ne nedostaje** i svaki je **prihvaćen**;
- [x] nijedna role ćelija nije **prazna ni nepoznata**;
- [x] `DENY` **ne poništava** `ALLOW`;
- [x] `platformRoles` **ne ulaze** u tenant uniju;
- [x] `READ_ONLY` **ne dobija** nijedan grant;
- [x] `AUDITOR` **ne dobija** treću permisiju;
- [x] `PRACTICE_ADMIN` **ne dobija** klinički pristup automatski;
- [x] podobnost za `analysis.approve` i `analysis.approval.revoke` je **identična**;
- [x] `encounter.close` ima **sve tri** prihvaćene role;
- [x] endpoint guardovi **ne odstupaju** od `03` ni od `15`.

Evidence:

```text
Policies:        02 §17.2, §17.4  (paket 002 / Faza 3 — Faza 4 ih verifikuje, ne rekreira)
                 02 §18.1, §20.2b (practice_settings — paket 013_rls_policies, Faza 4)
Tables:          practice_memberships, practice_membership_roles, platform_role_assignments,
                 practice_settings, users, practices
Migration paket: 013_rls_policies
Test command:    pnpm test:security
Test result:     16 files | 579 tests | 579 passed | 0 failed | 0 skipped
                 kanonski merge   58f83d49c524bef0434d0ba1d6d04079ca6ece52 (PR #23)
                 evidence commit  111d91d385b87735772bda0aba8623f7a6a1ad94
                 prethodni kanonski run (P4-013V-A, SHA 4b48a008):
                                  15 files | 570 tests | 570 passed | 0 failed | 0 skipped
Role matrica conformance (vs docs/15):
                 PASS — conformance test mehanicki poredi implementacijsku matricu sa 15;
                 32 aktivne + 3 rezervisane permisije; odstupanje obara test.
Disposable DB safety: dokazana; perzistentna baza mutirana = NE.
```

**Gate red `R373` („ALL RLS TESTS GREEN — required before phase 5") — `SATISFIED_BY_EVIDENCE`
(`P4-013V-A`).** Kanonski run na SHA `4b48a008c8ce78a2f432bb5a7af495f5642a4935` dao je
**15 files / 570 tests / 570 passed / 0 failed / 0 skipped**, uz dokazanu disposable-DB sigurnost i
**bez mutacije perzistentne baze**. Taj rezultat **direktno** zadovoljava zahtjev ovog reda.
`SECURITY_CLOSURE_BLOCKERS` time prelazi `1 → 0`.

**Gate red `R382` („duplirana i cross-practice dodjela role **padaju**") —
`SATISFIED_BY_EVIDENCE` (`P4-013V-B`, PR #23).** Semantiku ovog gate reda u cijelosti dokazuju
`R347` (duplikat → `23505`) i `R348` (cross-practice composite FK → `23503`) iz sekcije
„Testovi — D-038" iznad; oba su **stvarna** database odbijanja, ne simulacija. Identitet reda je
izveden **iz ovog dokumenta**, ne iz audit artefakta.

## Prenesena zapažanja — P4-5BR

Nezavisni review slice-a P4-5B (`0 MERGE_BLOCKERS`) prenio je sljedeća zapažanja. U trenutku
prenošenja nijedno **nije** bilo riješeno i nijedno se **nije rješavalo** u gateu P4-5R1 (D-054,
*Posljedice*).

**Stanje na kanonskom `main`-u (evidentirano u D-055, klauzuli 32):** **O4 je ZATVOREN** — riješen
u PR #17, prije dodavanja prve dodatne tenant rute. **O2/O3, O5, O6 i O7 ostaju otvoreni** i vode
se dalje u svojim klasifikacijama; nijedno od njih **nije** bloker za P4-5D.

| Oznaka | Zapažanje | Klasifikacija |
|---|---|---|
| O2/O3 | Detekcija `42501` se u praksi oslanja na Prisma rendered error tekst; adapter nema namjenski unit spec | `HARDENING_BACKLOG` |
| O4 | `TenantRequestPipeline.admit(session, userId, ...)` nosi budući wrong-user seam (D-054, klauzula 12) | **`CLOSED`** — riješeno u PR #17 (`2229724`); potpis je sada `admit(session, request)` (D-055, klauzula 32) |
| O5 | Citat dokumentacije uz aplikacijsko pooštravanje `ACTIVE` membershipa može biti precizniji | `DOCUMENTATION_BACKLOG` |
| O6 | Recording test double ne modelira kompletno §17.6 membership visibility ponašanje | `HARDENING_BACKLOG` |
| O7 | HTTP anti-enumeration jednakost se može ojačati set-wide | `HARDENING_BACKLOG` |

## Prenesena zapažanja — P4-FC-GOV2

Gate P4-FC-GOV2 (implementacija D-056) prenio je sljedeće zapažanje. **Nije bloker zatvaranja i ne
rješava se u tom gateu** — izmjena `apps/**` nije bila ovlaštena (D-056, klauzula 22).

| Zapažanje | Klasifikacija |
|---|---|
| Zastario komentar o `TenantDatabaseService`-u u `apps/api/src/database/database.module.ts` | `DOCUMENTATION_BACKLOG` |

## Rubrik zatvaranja faze — D-056, dio C

**Ovo je normativno pravilo zatvaranja faze u ovom repozitoriju.** Vrijedi za svaku fazu, a ovdje je
zabilježeno jer ga je gate zatvaranja Faze 4 prvi zatražio. `11` §11 se čita kroz njega.

```text
ZERO_UNCHECKED_IS_NORMATIVE_REQUIREMENT   NO
PHASE_CLOSURE_RULE                        UNRESOLVED_REQUIRED = 0
```

**Doslovno „nula neoznačenih kućica" NIJE pravilo.** Faza se smije zatvoriti kada je
**`UNRESOLVED_REQUIRED = 0`**.

Svaka checklist stavka koja pripada toj fazi mora biti **ili**:

1. **`SATISFIED_BY_EVIDENCE`** — označena, uz **citiranu** komandu/test/dokaz prema `00` §14;

**ili** nositi **eksplicitnu dispoziciju potkrijepljenu prihvaćenim autoritetom**:

2. **`SUPERSEDED`**;
3. **`HISTORICAL`**;
4. **`NOT_APPLICABLE_IN_V1`**;
5. **`EXPLICITLY_DEFERRED`**;
6. **`FUTURE_SCOPE`**.

Za svaku dispoziciju koja ostavlja **živu obavezu za kasniji obuhvat**, ta obaveza mora biti
**očuvana/premještena u sekciju faze koja je posjeduje**, po **precedentu D-052**.

Nijedan zahtjev se ne smije **tiho izbrisati**, **oslabiti**, **implicitno penzionisati** ni
**proglasiti `N/A` samo zato da bi se faza zatvorila**.

Stavka **bez dokaza** i **bez eksplicitne, autoritetom potkrijepljene dispozicije** je
**`UNRESOLVED_REQUIRED`** i **blokira zatvaranje faze**. **Proizvoljna neoznačena rezidua nije
dopuštena.**

## Gate zatvaranja Faze 4 — P4-013 — `COMPLETE`

**Aplikacijska implementacija Faze 4 je kompletna i merged** (P4-5B, P4-5R1, P4-5C, P4-5D — PR #20,
`3658c6e`). **Retrospektivni evidence gate `P4-013` je sada `COMPLETE`** —
`UNRESOLVED_REQUIRED = 0`, `SECURITY_CLOSURE_BLOCKERS = 0` (puno računovodstvo niže, u
„Rekonsilijacija `P4-013B`"). Završetak `P4-013` je bio **nužan, ali ne i dovoljan** uslov
zatvaranja, a sama odluka o zatvaranju pripadala je **zasebnom, vlasnički pregledanom gateu
zatvaranja Faze 4**. **Taj gate je izvršen: Faza 4 je `DONE` odlukom D-059** (2026-08-21) — vidi
„Zatvaranje Faze 4 — D-059" na kraju ove sekcije. Ova sekcija ostaje zapis gatea `P4-013` i
**njegove dispozicije se ovim zatvaranjem ne mijenjaju**.

Ostatak ove sekcije bilježi **kako se do toga došlo** — obuhvat, oba pokušaja `P4-013A`,
dispoziciju `P4-013F`/D-058 i verifikacije `P4-013V`. **Historijski zapisi ostaju historijski i
ne prepisuju se**; tekuće stanje je iskazano odvojeno.

**Obuhvat `P4-013` je rebaziran na kanonsku Fazu 4** odlukom **D-057**:

```text
P4_013_GATE_TYPE                               READ_ONLY_RETROSPECTIVE_EVIDENCE_AUDIT
P4_013_SCOPE_RULE                              STRUCTURAL_EXTRACTION (D-057, klauzula 3)
P4_013_CHECKLIST_ROWS_IN_SCOPE                 398   (baseline commit 890aee2)
P4_013_ROW_PARTITION                           CIJELI UNIVERZUM + EVIDENCE_DOMAIN oznaka
P4_013_NEW_APPLICATION_IMPLEMENTATION_EXPECTED NO
```

**Normativno pravilo obuhvata (D-057, klauzula 3).** Univerzum je **svaka** Markdown checklist
stavka koja odgovara regularnom izrazu `^\s*-\s\[[ xX]\]` unutar ove top-level sekcije
(`# 5. Faza 4 — Tenant/RLS`), omeđene sljedećim top-level naslovom faze
(`# 6. Faza 5 — Encounter/documents`); stavke unutar ograđenih blokova koda se ne broje.
**Pravilo je normativno, a `398` je njegova izmjerena vrijednost** na baseline commitu. Svako
izvršenje bilježi commit koji auditira i broj izmjeren na njemu (D-057, klauzule 5–6).

**Podjela redova (D-057, klauzule 7–11).** Fiksna binarna podjela je **povučena**. Auditira se
**cijeli** univerzum, a svaki red uz terminalnu dispoziciju nosi i **ne-terminalnu**
`EVIDENCE_DOMAIN` oznaku (`DB_MIGRATION`, `APPLICATION`, `PERMISSION`, `FIXTURE`, `TEST`,
`GOVERNANCE`, `MIXED`). Ta oznaka **ne mijenja** zamrznuti rječnik terminalnih dispozicija iz
„Rubrik zatvaranja faze — D-056, dio C" i **nikada** nije razlog za dispoziciju.

**Nadiđeno odlukom D-057 (historijski zapis, ne briše se).** D-056, klauzula 20 je zamrznula
`294 / 64 / 230`. Broj **294** odgovara `docs/05` na commitu **`258f646`** i bio je **zastario već
pri usvajanju D-056** — revizija koja uvodi D-056 (`9b8ebc1`) nosi **398** redova. Podjela
`64 / 230` nije imala zapisano pravilo izvođenja i ne ulazi ni u jednu invarijantu zatvaranja, pa
je povučena kao **ne-normativna auditorska pogodnost**. **Kriterij zatvaranja
`UNRESOLVED_REQUIRED = 0` ostaje nepromijenjen**; rebaziranje ga **pooštrava**, jer obuhvat raste
sa 294 na 398 reda i **nijedan red nije uklonjen**.

**Pokušaj 1 gatea `P4-013A` je zaustavljen** i to se ovdje evidentira **bez izmišljenog rezultata**
(D-057, klauzula 15):

```text
P4_013A_ATTEMPT_1                 HOLD
BLOCKER                           P4_013_SCOPE_RECONCILIATION_FAILURE
očekivano po D-056                294 / 64 / 230
kanonski ukupno pronađeno         398
porijeklo historijskog 294        258f646
izvršena klasifikacija redova     NO
mutacija repozitorija u auditu    NO
mutacija baze u auditu            NO
```

**Taj gate se ovdje ne izvršava.** Ni rubrik iz „Rubrik zatvaranja faze — D-056, dio C" ni D-057
**ne ovlašćuju** klasifikaciju, označavanje ni raspoređivanje tih 398 redova. Blok dokaza ispod se
**ne popunjava** u ovom gateu. Nakon merge-a D-057 u kanonski `main`, `P4-013A` se pokreće
**iznova**, u svježem read-only gateu, protiv tog kanonskog commita; **ne nastavlja se** iz
pokušaja 1 (D-057, klauzula 16).

**Pokušaj 2 gatea `P4-013A` je izvršen** nad obuhvatom rebaziranim odlukom D-057 i evidentira se
**kako se stvarno završio — `COMPLETE_WITH_REQUIRED_GAPS`, a NE `PASS`**:

```text
P4_013A_V2_VERDICT           P4_013A_V2_COMPLETE_WITH_REQUIRED_GAPS
auditirani commit            890aee2 (obuhvat rebaziran D-057)
P4_013_TOTAL_ROWS            398
retrospektivno dokazano      273
UNRESOLVED_REQUIRED          12
SECURITY_CLOSURE_BLOCKERS    1
mutacija repozitorija        NO
mutacija baze                NO
```

**Gate `P4-013F` je dispozicionirao sedam od tih dvanaest redova — D-058 (2026-08-20).** Sedam
governance-osjetljivih redova odobravanja i opoziva (`R267`–`R272` i `R303`) dobilo je
**autoritetom potkrijepljenu dispoziciju**, uz **očuvanje svake žive obaveze**:

```text
R267-R272   FUTURE_SCOPE            -> Faza 10, "Opoziv odobrenja - preuzeto iz Faze 4 (D-058)"
R303        SATISFIED_BY_EVIDENCE   -> ostaje Faza 4 (rezidua nad rutama dodana u Fazi 10)
SILENT_RETIREMENTS = 0
```

Očekivano računovodstvo nakon `P4-013F` (D-058, klauzula 14) — **delta sedam redova, ne novi
audit**:

```text
START_UNRESOLVED_REQUIRED                 12
ROWS_RESOLVED_BY_P4_013F                   7
EXPECTED_UNRESOLVED_REQUIRED_AFTER_GATE    5
EXPECTED_REMAINING_ROWS                    R347, R348, R369, R373, R382
SECURITY_CLOSURE_BLOCKERS                  1   (R373, nepromijenjeno)
```

**`P4-013F` nije izvršio ni rekonsilijaciju kućica ni ponovni audit.** Nijedna kućica nije
promijenjena, `273` retrospektivno dokazana reda nisu dirana, a preostalih **pet** redova
(`R347`, `R348`, `R369`, `R373`, `R382`) **ostaje otvoreno** i pripada gateu **`P4-013V`**;
označavanje pripada gateu **`P4-013B`** (D-058, klauzule 7 i 12).

**Gate `P4-013V-A` je dokazao red `R373` — sigurnosna zapreka zatvaranja je uklonjena.** Nad
kanonskim `main`-om je izvršen puni sigurnosni paket:

```text
P4_013V_A_VERDICT   PASS
kanonski SHA        4b48a008c8ce78a2f432bb5a7af495f5642a4935
komanda             pnpm test:security
rezultat            15 files | 570 tests | 570 passed | 0 failed | 0 skipped
R373                SATISFIED_BY_EVIDENCE  ("ALL RLS TESTS GREEN - required before phase 5")
disposable DB       sigurnost dokazana
perzistentna baza   mutirana = NE
SECURITY_CLOSURE_BLOCKERS   1 -> 0
```

**Gate `P4-013V-B` / PR #23 je dokazao redove `R347`, `R348`, `R369` i `R382`.** Trajni negativni
constraint testovi su **merged u kanonski `main`** — dokaz je stalan, ne jednokratan:

```text
P4_013V_B_VERDICT   PASS
evidence commit     111d91d385b87735772bda0aba8623f7a6a1ad94
kanonski merge      58f83d49c524bef0434d0ba1d6d04079ca6ece52   (PR #23, MERGED)
targeted            9 / 9 PASS
full security       16 files | 579 tests | 579 passed | 0 failed | 0 skipped
typecheck           PASS
lint (changed)      PASS
R347                SATISFIED_BY_EVIDENCE  23505 practice_membership_roles_membership_role_key
R348                SATISFIED_BY_EVIDENCE  23503 practice_membership_roles_membership_fk
R369                SATISFIED_BY_EVIDENCE  INSERT -> DELETE -> re-INSERT => tacno jedan red
R382                SATISFIED_BY_EVIDENCE  D-038 gate red; semantiku nose R347 + R348
```

## Rekonsilijacija `P4-013B` — konačno računovodstvo 398 redova

**Ovaj gate je dokumentaciona rekonsilijacija, ne novi audit.** Ne mijenja nijednu prihvaćenu
dispoziciju (D-057, D-058), ne uvodi novi dokaz i ne pokreće pakete zbog ceremonije. Obuhvat je
**ponovo izmjeren** po D-057, klauzuli 3, a identitet svakog reda **ponovo izveden iz ovog
dokumenta** — ne iz audit artefakta (D-057, klauzula 6).

```text
P4_013B_AUDIT_COMMIT   58f83d49c524bef0434d0ba1d6d04079ca6ece52
P4_013B_ROWS_FOUND     398          (= D-057 baseline; bez drifta)
ROW_IDENTITY           13 / 13 ciljna reda jednoznacno mapirana na kanonski docs/05
```

**Konačne terminalne dispozicije — zbir je tačno 398:**

| Terminalna dispozicija | Redova |
|---|---:|
| `SATISFIED_BY_EVIDENCE` | **375** |
| `SUPERSEDED` | 0 |
| `HISTORICAL` | 1 |
| `NOT_APPLICABLE_IN_V1` | 8 |
| `EXPLICITLY_DEFERRED` | 2 |
| `FUTURE_SCOPE` | 12 |
| **`UNRESOLVED_REQUIRED`** | **0** |
| **UKUPNO** | **398** |

Izvođenje iz `P4-013A v2` — **delta, ne novo mjerenje**:

```text
P4-013A v2:  SBE 369 | HIST 1 | NA_V1 8 | DEFERRED 2 | FUTURE 6  | UNRESOLVED 12   = 398
  D-058:     R267-R272  UNRESOLVED -> FUTURE_SCOPE          (FUTURE  6 -> 12)
  D-058:     R303       UNRESOLVED -> SATISFIED_BY_EVIDENCE (SBE   369 -> 370)
  P4-013V-A: R373       UNRESOLVED -> SATISFIED_BY_EVIDENCE (SBE   370 -> 371)
  P4-013V-B: R347 R348 R369 R382                            (SBE   371 -> 375)
P4-013B:     SBE 375 | HIST 1 | NA_V1 8 | DEFERRED 2 | FUTURE 12 | UNRESOLVED  0   = 398
```

**Rekonsilijacija kućica.** `[x]` znači `SATISFIED_BY_EVIDENCE` uz citiran dokaz (`00` §14;
D-058, klauzula 7). Dispozicija **nije** dokaz, pa se ne-dokazni redovi **ne označavaju**:

```text
CHECKBOXES_BEFORE        97   ([ ] 301)
CHECKBOXES_AFTER        376   ([ ]  22)
CHECKBOXES_FLIPPED_TO_X 279   = 273 retrospektivno dokazanih (P4-013A v2)
                              +   1 R303  (D-058)
                              +   1 R373  (P4-013V-A)
                              +   4 R347 R348 R369 R382 (P4-013V-B)

[x] + SATISFIED_BY_EVIDENCE   375
[x] + NON_EVIDENCE_DISPOSITION  1   (R21 - HISTORICAL, obrazlozeno nize)
[x] + UNRESOLVED_REQUIRED       0
[ ] + SATISFIED_BY_EVIDENCE     0
[ ] + NON_EVIDENCE_DISPOSITION 22
[ ] + UNRESOLVED_REQUIRED       0

FALSE_POSITIVE_CHECKED_ROWS     0
```

**Jedini `[x]` na ne-dokaznom redu je `R21`** (`PATCH` ruta NIJE registrovana, slice P4-5C) i
**nije** lažan dokaz: taj red bilježi ono što je P4-5C **stvarno dokazao u svoje vrijeme**, a
sekcija ga izričito označava kao **NADIĐENO GATEOM P4-5D** i kao historijski nalaz tog slicea.
Živa obaveza nije nestala — nosi je `R23` (`PATCH` registrovan — P4-5D, PR #20), koji je
`SATISFIED_BY_EVIDENCE`. Odznačavanje bi **izbrisalo istinit historijski nalaz**, pa se ne radi.

## Registar dispozicija — svih 23 reda koja nisu `SATISFIED_BY_EVIDENCE`

Registar postoji da bi se moglo provjeriti da **nijedna živa obaveza nije nestala** i da
**nijedna dispozicija ne glumi implementacijski dokaz**.

| Red(ovi) | Zahtjev | Dispozicija | Autoritet | Ciljna faza / red | Obrazloženje |
|---|---|---|---|---|---|
| `R21` | `PATCH` ruta NIJE registrovana (P4-5C) | `HISTORICAL` | P4-5C zapis; nadiđeno P4-5D (D-055; D-053, kl. B.4) | živa obaveza → `R23` (Faza 4, dokazana) | istinit nalaz slicea u svoje vrijeme; `[x]` zadržan kao historijski nalaz, ne kao tekuća tvrdnja |
| `R9`, `R320` | konkretan `TenantDatabaseService` facade | `EXPLICITLY_DEFERRED` | D-056, dio A | §6 (Faza 5) — **uslovni**, ne fazni trigger | koncept ostaje kanonski i **binding**; tenant-database semantika (jedna pinovana transakcija, `set_request_context`, D-047 redoslijed, bez caller-supplied identiteta) ostaje **obavezna i dokazana** u Fazi 4 |
| `R267`–`R272` | ponašanje write puta opoziva odobrenja | `FUTURE_SCOPE` | D-058, kl. 3–4 i 8–9; D-041, kl. 6–11 | Faza 10, sekcija „Opoziv odobrenja — preuzeto iz Faze 4 (D-058)", **1:1 doslovan tekst** | `analysis_approvals` kreira paket `009_review_approvals` u Fazi 10; Faza 4 taj put ne implementira niti je ovlaštena |
| `R306`–`R313` | membership/role administracija, cross-practice support, otkazivanje export joba | `NOT_APPLICABLE_IN_V1` | D-045 | — (granica obuhvata v1) | v1 ih **ne implementira**; implementacijski zadatak se ne otvara |
| `R314`–`R318` | generička platform administracija, `AUDITOR` discovery, podjele permisija | `FUTURE_SCOPE` | D-045 | uslovno — **nova permisija + prihvaćen ADR** | trigger je odluka, ne dolazak broja faze |
| `R370` | audit dokaz **budućeg** assignment/removal puta (`ASSIGNED`/`REMOVED`) | `FUTURE_SCOPE` | D-045 (`R309`–`R311` = `OUT OF V1`); D-038, kl. 25–32 | zajedno sa samim assignment/removal putem | dokaz ne postoji jer **put** ne postoji; obaveza se aktivira sa putem |

`R303` se u ovom registru **ne pojavljuje** — D-058, klauzula 5 ga drži u Fazi 4 kao
`SATISFIED_BY_EVIDENCE`; njegova rezidua na nivou rute je **zaseban** red Faze 10 (D-058,
klauzula 6) i **ne mijenja** tu dispoziciju.

```text
NON_EVIDENCE_DISPOSITION_ROWS   23   (1 HIST + 8 NA_V1 + 2 DEFERRED + 12 FUTURE_SCOPE)
SILENT_RETIREMENTS               0
TARGET_OWNERS_VERIFIED         YES   (R267-R272 -> 6 doslovnih redova u Fazi 10, provjereno 1:1)
```

Evidence:

```text
P4-013 RETROSPECTIVE EVIDENCE AUDIT:  COMPLETE

  obuhvat                 398 redova (D-057, strukturna ekstrakcija; klauzula 3)
  auditirani commit       58f83d49c524bef0434d0ba1d6d04079ca6ece52
  P4-013A pokusaj 1       HOLD  (P4_013_SCOPE_RECONCILIATION_FAILURE)
  P4-013A pokusaj 2 (v2)  COMPLETE_WITH_REQUIRED_GAPS  (nije PASS)
                          pocetni UNRESOLVED_REQUIRED = 12
  P4-013F / D-058         7 redova rijeseno
                            R267-R272 -> FUTURE_SCOPE  (Faza 10, 1:1)
                            R303      -> SATISFIED_BY_EVIDENCE (ostaje Faza 4)
  P4-013V-A               R373 -> SATISFIED_BY_EVIDENCE
                            pnpm test:security  570 / 570 PASS   (SHA 4b48a008)
                            SECURITY_CLOSURE_BLOCKERS 1 -> 0
  P4-013V-B / PR #23      R347 R348 R369 R382 -> SATISFIED_BY_EVIDENCE
                            targeted 9 / 9;  security 579 / 579 PASS
                            evidence commit 111d91d;  kanonski merge 58f83d49
  P4-013B                 rekonsilijacija dokumentacije
                            279 kucica oznaceno;  376 [x] / 22 [ ]
                            FALSE_POSITIVE_CHECKED_ROWS = 0

  UNRESOLVED_REQUIRED         0
  SECURITY_CLOSURE_BLOCKERS   0
  P4_013_STATUS               COMPLETE
```

## Granica zatvaranja — `P4-013 COMPLETE` nije `Faza 4 DONE`

**Historijski zapis stanja na kraju gatea `P4-013B` (2026-08-21). Tekuće stanje je niže, u
„Zatvaranje Faze 4 — D-059".**

**`P4-013` je završen. Faza 4 nije zatvorena.**

```text
P4_013_STATUS               COMPLETE
UNRESOLVED_REQUIRED         0
SECURITY_CLOSURE_BLOCKERS   0

PHASE_4_STATUS              IN_PROGRESS
FINAL_PHASE_4_CLOSURE_GATE  REQUIRED
```

Rubrik zatvaranja faze (D-056, dio C) traži `UNRESOLVED_REQUIRED = 0` kao **nužan** uslov —
**ne** kao samo zatvaranje. `P4-013B` je **dokumentaciona rekonsilijacija** i **nije ovlašten** da
proglasi Fazu 4 `DONE`, da autorizuje Fazu 5 ni da donese odluku o zatvaranju. Prelazak
`IN_PROGRESS → DONE` ostaje **zaseban, vlasnički pregledan gate zatvaranja Faze 4**, koji se
pokreće **tek nakon** što je ova rekonsilijacija pregledana i merged u kanonski `main`.

**Anotacija (D-059, 2026-08-21) — gornji blok se ne prepisuje.** Uslov iz posljednje rečenice je
**ispunjen**: rekonsilijacija `P4-013B` je pregledana i merged u kanonski `main` kroz **PR #24**
(`9b8fcdd21a51935b7cc6cd810e0e91e44ec281e3`), nakon čega je zaseban gate zatvaranja **izvršen**.
`PHASE_4_STATUS` iz ovog bloka je **historijska vrijednost tog trenutka**, a ne tekući status.

## Zatvaranje Faze 4 — D-059

**Faza 4 je zatvorena.** Finalni **read-only** audit zatvaranja izvršen je nad kanonskim
`main`-om i **nije napravio nijednu izmjenu repozitorija**; vlasnik ga je prihvatio i donio odluku
**D-059 — Formalno zatvaranje Faze 4** (`ACCEPTED`, 2026-08-21).

```text
FINAL_CLOSURE_AUDIT                 PASS
FINAL_CLOSURE_AUDIT_CANONICAL_SHA   9b8fcdd21a51935b7cc6cd810e0e91e44ec281e3
PHASE4_READY_FOR_FORMAL_CLOSURE     YES
FORMAL_CLOSURE_DECISION             D-059

P4_013_STATUS                       COMPLETE
P4_013_ROWS                         398
UNRESOLVED_REQUIRED                 0
SECURITY_CLOSURE_BLOCKERS           0
OPEN_PHASE4_BLOCKERS                0
SILENT_RETIREMENTS                  0
TARGET_OWNERS_VERIFIED              YES

PHASE_4_STATUS                      IN_PROGRESS -> DONE
PHASE_5_STATUS                      NOT_STARTED
PHASE_10_STATUS                     NOT_STARTED
```

**Anotacija (`P5-I1-D`, 2026-08-23) — gornji blok se ne prepisuje.** On bilježi stanje **na dan
zatvaranja Faze 4 (D-059)**; `PHASE_5_STATUS` iz njega je **historijska vrijednost tog trenutka**,
a ne tekući status. Tekući status Faze 5 je **`IN_PROGRESS`**, checklist **49 / 8**, nakon
kanonskog slice-a `P5-I1` (§6). `PHASE_10_STATUS` je i dalje `NOT_STARTED`.

**Autoritet zatvaranja:** rubrik **D-056, dio C** (`UNRESOLVED_REQUIRED = 0` kao pravilo
zatvaranja); **D-057** (kanonski strukturni obuhvat `P4-013` — 398 redova); **D-058** (vlasništvo
faza za odobravanje/opoziv i dispozicija sedam redova); **`P4-013B`** (kanonska rekonsilijacija,
PR #24); i **finalni read-only audit zatvaranja**.

**Sigurnosni dokaz (sažeto; puni logovi se ne reprodukuju):**

```text
P4-013V-A         pnpm test:security   570 / 570 PASS   (SHA 4b48a008)
P4-013V-B / PR #23  pnpm test:security 579 / 579 PASS   (evidence commit 111d91d)
```

**`DONE` je rezervisani lifecycle status.** Kao i kod Faze 3 (§0, red **Faza 3**; presedan
`9af070d`), `DONE` u ovom repozitoriju znači **lifecycle zatvaranje merged u kanonski `main`**.
Ovaj zapis nastaje na zatvaračkoj grani i **postaje kanonski merge-om te grane u `origin/main`**.
`DONE` **ne** tvrdi produkcijsku spremnost proizvoda.

**Zatvaranje ne retirira nijednu buduću obavezu.** Sve dispozicije iz registra ostaju
**nepromijenjene i žive u svojim vlasničkim fazama**:

- konkretan **`TenantDatabaseService` facade** (`R9`, `R320`) — `EXPLICITLY_DEFERRED` (D-056, dio
  A), **uslovni** trigger, najranije očekivano Faza 5 (§6);
- **`R267`–`R272`** — `FUTURE_SCOPE`, **Faza 10**, doslovno preuzeti redovi (D-058, kl. 3–4, 8–9);
- **rezidua `R303` na nivou rute** — zaseban red **Faze 10** (D-058, kl. 6); sam `R303` ostaje
  `SATISFIED_BY_EVIDENCE` u Fazi 4 i **ne mijenja dispoziciju**;
- **`R314`–`R318`, `R370`** — `FUTURE_SCOPE`; **`R306`–`R313`** — `NOT_APPLICABLE_IN_V1`.

**Granica prema Fazi 5.** D-059 zatvara **isključivo** Fazu 4. **Faza 5 je u trenutku ovog
zatvaranja ostala `NOT_STARTED`** (§6) i **nije autorizovana** ovom odlukom; nijedna njena kućica
tada nije bila označena. Pokretanje Faze 5 je bilo **zaseban gate**. *(Taj zaseban gate je
naknadno izvršen — tekući status Faze 5 je `IN_PROGRESS`, checklist **49 / 8**, nakon kanonskog
`P5-I1`; vidi vrh §6. Granica koju D-059 postavlja se time ne mijenja.)*

**Konačnost.** Nijedna Faza-4 implementacijska remedijacija nije otvorena. Svaka buduća izmjena
završenog ponašanja Faze 4 traži **novu, eksplicitnu odluku/governance putanju** — ovaj zapis
zatvaranja se **ne otvara tiho**.

---

# 6. Faza 5 — Encounter/documents

Status: `IN_PROGRESS`

**Prelazak `NOT_STARTED` → `IN_PROGRESS` (2026-08-23).** Prvi implementacijski slice faze,
**`P5-I1`**, je implementiran i **nezavisno reviewovan** ishodom
`P5_I1_V_PASS_READY_FOR_PUBLICATION`. Ovo je **implementacijsko stanje**, a **ne** završetak faze:
Faza 5 **nije** `DONE` i ne smije se tako označiti. Slice je **kanonski** — objavljen kroz
**PR #30** i merged u `main` (merge SHA `fcd88fbef6c398ae7f0404eb54edb8f7f8175634`). Dokazni blok je
**`Slice P5-I1`** niže; označene su isključivo osam schema kućica koje on dokazuje, čime brojanje
Faze 5 prelazi sa **49 / 0** na **49 / 8**.

## Objavljen dizajnerski autoritet — D-060 (2026-08-22)

**Ovaj zapis ne mijenja status faze i ne označava nijednu kućicu ispod.** Na dan ovog zapisa
Faza 5 je ostala `NOT_STARTED`, a njeno pokretanje je i dalje bilo **zaseban gate**.
*(Historijska publikaciona konstatacija, tačna na dan tog zapisa; tekući status Faze 5 je
`IN_PROGRESS`, checklist **49 / 8**, nakon kanonskog `P5-I1` — vidi vrh §6.)*

Odlukom **D-060** vlasnički su ratifikovani i objavljeni PHI/sigurnosni ugovori koje implementacija
Faze 5 **mora** poštovati:

- **deterministički lookup token eksternog ID-a** — HMAC-SHA256, **namjenski ključ odvojen od
  AES-GCM ključa**, domenski separisana kanonska poruka, format `h1.<hex64>`, normalizacioni profil
  `MANUAL` v1 verzionisan odvojeno od `h1` (`02` §2.8);
- **pseudonim** — `P-` + 10 velikih Crockford Base32 znakova iz CSPRNG-a, bez izvedenosti iz
  eksternog ID-a, ulazni query kanonizovan u velika slova prije jednakosne pretrage (`02` §2.9);
- **normalizacija kliničkog teksta i `source_text_hash`** — minimalan, semantički lossless pipeline;
  hash normalizovanog teksta prije enkripcije; maksimum **256 KiB**; **nikada truncate**
  (`02` §2.10, `03` §13.1);
- **deterministička redakcija `phase5-basic-v1`** — uska klasa identifikatora, **stroga** posture za
  telefonske brojeve, **bez** uklanjanja imena/adresa/medicinskog sadržaja; `COMPLETED` **ne tvrdi**
  anonimizaciju; redigovani tekst **ostaje Class A** (`02` §2.11, `09` §8.3);
- **statusni rječnici** — `processing_status` ∈ {`READY`, `FAILED`}, `redaction_status` ∈
  {`COMPLETED`, `FAILED`}. *(Sloj sprovođenja je naknadno razriješen odlukom **D-062**, koja uz
  aplikacijsko sprovođenje uvodi i **tri DB `CHECK` constrainta**; vidi blok D-062 niže i
  `02` §2.11.4. Vokabular iz D-060 se **ne mijenja**.)*;
- **API semantika** — `view=original` = dekriptovan neredigovan kanonski normalizovan tekst;
  `view=redacted` **bez fallbacka** pri `FAILED`; `redactBeforeAiProcessing = false` →
  `422 VALIDATION_ERROR` (`03` §11, §12, §13);
- **PHI sigurnost logova i grešaka** — HMAC token, pseudonim, tekst u svakom obliku, ciphertext,
  ključevi, IV/tag i sporna validaciona vrijednost **nikada** ne ulaze u log ni Problem Details
  (`09` §2, §8, §11).

Test obaveze koje iz ovoga slijede dokumentovane su u **`08` §12.0–§12.7** i **još nisu izvršene**;
njihovo postojanje **ne označava nijednu kućicu**.

**Šta D-060 nije.** Nije autorizacija implementacije: nijedan servis, endpoint, tabela, migracija ni
test nisu njome uvedeni. **Ne zatvara** D-OPEN-004a (produkcijski KMS/rotacija/recovery ostaju
otvoreni) i **ne rješava** gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19).

**Redoslijed narednih gateova:** `P5-G1` (co-member `displayName`) → `P5-D2` (schema, referencijalne
akcije, migration paket, state machine, pitanje DB-sprovedenih statusnih rječnika) → tek potom
eventualni implementacijski gate. *(Oba gatea su izvršena i objavljena — kao **D-061** odnosno
**D-062**. Naredni gate je **`P5-I0`**, implementacijska autorizacija.)*

## Objavljen dizajnerski autoritet — D-061 (2026-08-23)

**Ovaj zapis ne mijenja status faze i ne označava nijednu kućicu ispod.** Na dan ovog zapisa
Faza 5 je ostala `NOT_STARTED`, a broj redova i broj označenih **49 / 0**.
*(Historijska publikaciona konstatacija, tačna na dan tog zapisa; tekući status Faze 5 je
`IN_PROGRESS`, checklist **49 / 8**, nakon kanonskog `P5-I1` — vidi vrh §6.)*

Gate **`P5-G1`** je izvršen i objavljen kao odluka **D-061**. Ishod je **opcija G1-A —
izostavljanje**:

- **Faza 5 ne konzumira co-member `display_name`.** Nijedan endpoint Faze 5 ne vraća ime ni bilo
  koji drugi identifikacioni atribut **drugog** korisnika.
- **`GET /encounters` (`03` §12)** vraća `responsiblePhysician` kao **samo `{ "id": "uuid" }`**;
  ključ `displayName` je **odsutan**, ne `null`. Kada odgovorni ljekar ne postoji, cijeli objekat je
  `null`. Query filter `responsiblePhysicianId` **ostaje** nepromijenjen.
- **Nijedno proširenje pristupa nije uvedeno.** `users` i dalje ima **tačno dvije** caller-self
  politike; `practice_memberships` i dalje **tačno jednu** caller-self politiku; grantovi,
  `FORCE RLS` i migracije su **nepromijenjeni**. Treća `users` politika **nije** kreirana.
- **Zabranjeno i dalje, bez izuzetka:** treća `users` politika; proširenje `users` column granta;
  proširenje `practice_memberships` RLS-a ili granta; denormalizacija `display_name`;
  `SECURITY DEFINER` lookup; četvrta database rola; drugi Prisma klijent; zamjenski identifikator
  (inicijali, skraćeno ime, hash imena).

**Trigger imenovanog gatea je repointiran.** Historijska labela
`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` **ostaje doslovno**, ali se gate sada otvara **prije
implementacije prvog endpointa ili toka koji vraća `display_name` drugog korisnika**. Tekući prvi
poznati konzument je `GET /analyses/{analysisId}/workspace` (`03` §15), čija je vlasnička faza
**Faza 8** (§9) — ili bilo koji **raniji** konzument koji stekne takav prihvaćen zahtjev, **šta prije
nastupi**. `approvedBy.displayName` u odgovoru kreiranja odobrenja (Faza 10, §11) **nije** co-member
trigger jer je odobravatelj sam pozivalac; **read-back tuđeg odobrenja jeste**.

**Šta D-061 nije.** Nije autorizacija implementacije i **ne rješava** temeljni problem pristupa
co-member identitetu — taj problem ostaje **OPEN / NOT IMPLEMENTED** (`13` §19). Ne dodiruje
D-OPEN-004a. Ne mijenja D-047, klauzulu 12, koja se njime **potvrđuje**.

Test obaveze koje iz ovoga slijede dokumentovane su u **`08` §12.8** i **još nisu izvršene**;
njihovo postojanje **ne označava nijednu kućicu**.

### Naslijeđena blokirajuća obaveza za `P5-D2` (D-061, klauzule 19–21)

```text
P5-D2 BLOCKING DESIGN OBLIGATION
```

**Kako se `responsiblePhysicianId` domenski validira na `POST /encounters` — i na
`PATCH /encounters/{encounterId}` ako on to polje mijenja — pod caller-self
`practice_memberships` RLS-om, bez proširenja sigurnosne granice Faze 4.**

`P5-G1` je dokazao da prirodan upit za provjeru „referencirani korisnik je član tekuće ordinacije"
ide nad `practice_memberships`, čija je jedina politika `practice_memberships_self_select`
**caller-self**. Naivna cross-member provjera bi vratila **nula redova** i validacija bi tiho pala —
ili bi implementator posegnuo za proširenjem RLS-a, što je zabranjeno.

Obaveza je **blokirajuća prije implementacije encounter jezgra**. `P5-D2` mora odrediti ispravan
dizajn **bez slabljenja sigurnosnih invarijanti Faze 4**. D-061 mehanizam **ne bira** i ishod **ne
prejudicira**; postojeći RLS ostaje **netaknut**.

**Status: RAZRIJEŠENO odlukom D-062, Dio D.** Ratifikovan je **composite FK** prema
`practice_memberships (practice_id, user_id)` — mehanizam koji **ne uvodi nijednu politiku, grant,
`SECURITY DEFINER`, novu rolu ni drugi klijent**, i **ne dira** `practice_memberships_self_select`.
Vidi blok D-062 niže. **Uz razrješenje je uvedena nova, uža blokirajuća obaveza:** `★`
RI-naspram-RLS dokaz mora proći u slice-u `P5-I2` prije encounter jezgra (`04` §7.6a).

## Objavljen dizajnerski autoritet — D-062 (2026-08-23)

**Ovaj zapis ne mijenja status faze i ne označava nijednu kućicu ispod.** Na dan ovog zapisa
Faza 5 je ostala `NOT_STARTED`, a broj redova i broj označenih **49 / 0**.
*(Historijska publikaciona konstatacija, tačna na dan tog zapisa; tekući status Faze 5 je
`IN_PROGRESS`, checklist **49 / 8**, nakon kanonskog `P5-I1` — vidi vrh §6.)*

Gate **`P5-D2`** je izvršen i objavljen kao odluka **D-062**. Vlasnik je ratifikovao **preporučeni
skup od četrnaest odluka** `OD-P5-D2-1` … `OD-P5-D2-14`, uz eksplicitnu potvrdu **`A + A+`** za
`OD-P5-D2-6`.

**Ratifikovani ishodi — sažetak (normativni izvor je D-062, Dio A):**

| OD | Ishod |
|---|---|
| 1 | Tri broja paketa / četiri fajla: `003` (schema, **bez granta i RLS-a**), Faza-5 slice `011` (**samo** `idempotency_keys` + `audit_events`), Faza-5 slice `013` (grant → `ENABLE`/`FORCE` → politike), Faza-5 slice `014` (AAD funkcija + **tri** trigera) |
| 2 | `ON DELETE NO ACTION ON UPDATE NO ACTION` na sva četiri kanonska composite FK-a |
| 3 | Deklarišu se i **tri** ranije nedeklarisane relacije, `NO ACTION`/`NO ACTION` |
| 4 | Odgovorni ljekar = korisnik sa **bilo kojim** membershipom u **istoj** ordinaciji; rola i `active` se **ne traže** |
| 5 | Mehanizam je **composite FK** prema `practice_memberships (practice_id, user_id)`, `MATCH SIMPLE`, uz **eksplicitno odgađanje** validacije role/aktivnosti |
| 6 | **`A + A+`** — dva vokabularna `CHECK`-a **plus** artefakt-konzistencijski `CHECK`; kolone ostaju `varchar(30)`, **bez konverzije u enum** |
| 7 | `DRAFT → READY_FOR_ANALYSIS` postavlja unos dokumenta, **samo iz `DRAFT`**, idempotentno, **bez `version` inkrementa**, uz vlastiti audit; unos se **odbija pri `CANCELLED`** |
| 8 | `PATCH /encounters` mijenja **tačno osam** polja; `status`, `patientReferenceId`, `sourceSystem`, `version`, `diagnoses[]` **nisu** patchable |
| 9 | **Retry se odgađa**; jedini `UPDATE` grant nad `encounter_documents` je `archived_at`; `processing_status = FAILED` je u Fazi 5 **nedosežan** |
| 10 | Lista **isključuje** arhivirane; detaljna ruta ih **vraća**; **nema restore rute**; ponovno arhiviranje je **idempotentan uspjeh** |
| 11 | `review_state = 'UNREVIEWED'`, `source = 'MANUAL'`; šest rječnika ostaju **free-form u v1**, bez DB `CHECK`-a i bez schema izmjene |
| 12 | `latestAnalysis`, approval/export blok i `hasBlockingFindings` — **ključevi odsutni**, filter **neregistrovan**; `sort` = `treatmentDate desc, id desc`; cursor kodira `(treatment_date, id)`, **nikada pseudonim** |
| 13 | Kreiraju se **sva tri** encounter indeksa uz `id desc`, plus `documents_encounter_idx` |
| 14 | **Nijedna PHI tabela se ne seeda**; `FORCE RLS` allowlista ostaje na **šest** tabela |

**Sigurnosni ishod koji se time NE mijenja.** Ratifikovani dizajn uvodi **nula** nove sposobnosti
čitanja identiteta: nema co-member directoryja, nema proširenja `practice_memberships` ni `users`
RLS-a, nema dodatnog identitetskog `SELECT` granta, nema `SECURITY DEFINER` lookupa, nema drugog
Prisma klijenta i nema nove database role. `practice_memberships_self_select` ostaje **bajt-
identična** stanju Faze 4. **Nijedna Faza-4 RLS/grant invarijanta nije oslabljena.**

**Naslijeđena obaveza D-061, klauzule 19–21, je RAZRIJEŠENA** — bazom, ne aplikacijskim upitom.

### Nova blokirajuća obaveza — `★` RI-naspram-RLS dokaz

```text
P5-I2 BLOCKING IMPLEMENTATION PROOF
```

**Dokumentovanje mehanizma u D-062 NE dokazuje njegovo ponašanje.** Prije nego što se implementacija
encounter jezgra (`P5-I5`) smije osloniti na composite FK, slice **`P5-I2` mora empirijski dokazati**
nad **stvarnim PostgreSQL-om** i **stvarnim runtime rolama**, u **istoj transakciji**:

1. `INSERT` u `encounters` koji imenuje `user_id` **co-membera** **uspijeva**;
2. direktan `SELECT` **tog istog** membership reda vraća **nula redova**.

**Neuspjeh je HARD HOLD** — vraća se u dizajn i ponovo otvara `OD-P5-D2-5`. **Ne autorizuje
slabljenje RLS-a.** (`04` §7.6a; `08` §12.9.)

**Šta D-062 nije.** **Nije autorizacija implementacije.** Nijedan servis, endpoint, tabela,
migracija, politika, grant, trigger ni test nisu njome uvedeni. **Ne zatvara** `D-OPEN-004a`
(produkcijski KMS/rotacija/recovery ostaju otvoreni), **ne zatvara** `D-OPEN-007` (retencija) i
**ne rješava** gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19), koji ostaje
**OPEN / NOT IMPLEMENTED** i **consumer-triggered**. **Co-member `displayName` ostaje izostavljen u
Fazi 5.** Obaveza konkretnog `TenantDatabaseService` facadea (D-056) ostaje **nepromijenjena**.

Test obaveze koje iz ovoga slijede dokumentovane su u **`08` §12.9** i **još nisu izvršene**;
njihovo postojanje **ne označava nijednu kućicu**.

**Naredni gate:** **`P5-I0`** — implementacijska autorizacija Faze 5, koja autorizuje **isključivo**
slice `P5-I1`. *(Izvršen. Gate `P5-I0` je prošao vlasnički pregled i otkrio dvije greške u D-062,
objavljene kao **D-063** — vidi blok niže.)*

## Objavljena korekcija implementacijske granice — D-063 (2026-08-23)

**Ovaj zapis ne mijenja status faze i ne označava nijednu kućicu ispod.** Na dan ovog zapisa
Faza 5 je ostala `NOT_STARTED`, a broj redova i broj označenih **49 / 0**. **Nijedan red
implementacijskog checklista se ovom korekcijom ne dodaje, ne uklanja i ne označava.**
*(Historijska publikaciona konstatacija, tačna na dan tog zapisa; tekući status Faze 5 je
`IN_PROGRESS`, checklist **49 / 8**, nakon kanonskog `P5-I1` — vidi vrh §6.)*

Read-only gate **`P5-I0`** je prošao vlasnički pregled i, prije prvog implementacijskog slicea,
otkrio **dvije greške** u objavljenom autoritetu D-062. Vlasnik je obje korekcije ratifikovao;
objavljene su kao odluka **D-063**. **D-063 supersedira isključivo te dvije tačke D-062** — sve
ostalo u D-062, kao i **D-060 i D-061 u cijelosti**, ostaje nepromijenjeno.

**Korekcija A — Faza-5 slice paketa `011` se odgađa iz `P5-I1` u `P5-I2`.**

`P5-I1` je istovremeno nosio obavezu da kreira `idempotency_keys` i `audit_events` **i** zabranu da
im izda **ijedan** grant, `ENABLE`/`FORCE RLS` ili politiku, dok grant disciplina koja štiti pet
PHI tabela (D-062, Dio B.3) za te dvije §15 tabele **nigdje nije bila zapisana**.

| Slice | Obuhvat nakon D-063 |
|---|---|
| **`P5-I1`** | **isključivo:** Prisma schema Faze 5 (5 modela, 5 enuma, `NoAction`/`NoAction` na svakoj relaciji) · paket `003_patient_encounter_documents` · schema/katalog testovi paketa `003` |
| **`P5-I1` NE sadrži** | paket `011` · paket `013` · paket `014` · **ijedan** `GRANT` · **ijedan** `REVOKE` · **ijednu** `ENABLE`/`FORCE RLS` zastavicu · **ijednu** politiku · **ijedan** trigger/funkciju · **ijedan** servis, modul, rutu ni DTO |
| **`P5-I2`** | **Faza-5 slice paketa `011` (odgođen ovdje)** + Faza-5 slice paketa `013` i `014` + trajna negative-privilege regresija + **`★` RI-naspram-RLS dokaz** |

**Obaveza koju `P5-I2` preuzima.** Prije izvršenja mora, za **svaku** od `idempotency_keys` i
`audit_events`, eksplicitno nabrojati: paket koji je kreira · redoslijed izvršenja · `ENABLE ROW
LEVEL SECURITY` · `FORCE ROW LEVEL SECURITY` · tačna tijela politika · tačne runtime grantove ·
**negativne** grantove · tenant predikat · katalog tvrdnje.

**Nijedna runtime rola ne smije dobiti `SELECT`, `INSERT` ni `UPDATE` nad tim tabelama prije nego
što je njena ograničavajuća tenant politika na snazi. Stanje u kojem je `audit_events`
runtime-čitljiv preko granica ordinacija je kategorički zabranjeno.**

**Vlasništvo paketa, redoslijed migracija (`003` → `011`-slice → `013`-slice → `014`-slice) i
zabrana kreiranja `outbox_events` i `async_jobs` u Fazi 5 ostaju nepromijenjeni.**

**Korekcija B — katalog `CHECK` constrainata paketa `003` je 23, ne 18.**

Mehaničko prebrojavanje **eksplicitno nabrojanih tijela constrainata** (`02` §7.1, §7.2, §7.3,
§8.1, §8.2, §2.11.4) daje:

| Tabela | Zamrznuti | Novi (D-062, Dio E) | Ukupno |
|---|---:|---:|---:|
| `patient_references` | **5** | 0 | **5** |
| `encounters` | **6** | 0 | **6** |
| `encounter_diagnoses` | **0** | 0 | **0** |
| `storage_objects` | **1** | 0 | **1** |
| `encounter_documents` | **8** | **3** | **11** |
| **Ukupno** | **20** | **3** | **23** |

Raniji sažetak **`18`**, i podjela koja `encounter_documents` pripisuje **`10`**, superseded su kao
**aritmetička/dokumentaciona greška**. Historijski tekst je **zadržan i anotiran**, ne prepisan —
trag nalaza gatea `P5-I0` je dio revizijskog zapisa. **Nijedno tijelo constrainta se ne mijenja, ne
dodaje i ne uklanja.** Kanonska imena svih 23 objavljena su u `02` §29.7a i D-063, klauzuli 7.

**Ugovor katalog testa (`P5-I1`).** Test mora nabrojati **potpun očekivani skup** i za **svaki**
constraint tvrditi najmanje `conname`, tabelu vlasnika i `pg_get_constraintdef()`, uz **strogu
jednakost punog skupa**. **Tvrdnja tačnog skupa se nikada ne smije oslabiti u `contains`/`subset`
poređenje.** Numerički total `23` je dopunska, **ne primarna** tvrdnja; test koji provjerava
isključivo `count = 23` je **nedovoljan** (`08` §12.9.3, stavka 14a).

**Šta D-063 nije.** **Nije autorizacija implementacije** — `P5-I1` **nije** njome autorizovan, nego
**sužen**. Nijedan servis, endpoint, tabela, migracija, Prisma model, politika, grant, trigger ni
test nisu njome uvedeni. **Ne dira** D-060 ni D-061, **ne mijenja** referencijalne akcije D-062,
**ne slabi** nijednu Faza-4 invarijantu i **ne mijenja** `★` RI-naspram-RLS dokaz, koji ostaje
**tvrdi preduslov za `P5-I5`** uz **HARD HOLD** pri neuspjehu.

**Naredni gate:** **`P5-I1`** — prvi implementacijski slice Faze 5, u **suženom** obuhvatu iz
D-063, klauzula 1 i 2. *(Izvršen i kanonski — vidi blok `Slice P5-I1` niže. Naredni objavljeni
autoritet je **D-064**.)*

## Objavljena vlasnička ratifikacija — D-064 (2026-08-23)

**Ovaj zapis ne mijenja status faze i ne označava, ne dodaje i ne uklanja nijednu kućicu ispod.**
Faza 5 ostaje **`IN_PROGRESS`**, a broj redova i broj označenih ostaje **49 / 8**.

Read-only preflight gate `P5-I2` je zaključen ishodom
`P5_I2_PREFLIGHT_PASS_READY_FOR_OWNER_REVIEW` i vlasniku predao **devet** otvorenih
sigurnosno-dizajnerskih pitanja. Vlasnik ih je sva riješio; rješenja su objavljena kao odluka
**D-064**. **`OWNER_DECISIONS_REQUIRED` za `P5-I2` je time `0`.**

**Ratifikovani ishodi — sažetak (normativni izvor je D-064):**

| `OD` | Ishod |
|---|---|
| 1 | Faza-5 slice paketa `013` je **isključivi vlasnik** granta, `ENABLE`/`FORCE RLS`-a i politika za **svih sedam** tenant tabela `P5-I2`; Faza-5 slice paketa `011` kreira **isključivo strukturne** objekte, i njegovo međustanje ima **nula** sposobnosti |
| 2 | `idempotency_keys`: `SELECT` + `INSERT` + **column-level** `UPDATE` nad `response_status`, `response_body`, `locked_at`, `completed_at`; **bez** `DELETE`/`TRUNCATE`/blanket `UPDATE`-a; **tri** politike |
| 3 | `audit_events`: **samo** `SELECT` + `INSERT`; **bez** `UPDATE`/`DELETE`/`TRUNCATE`; **dvije** politike; cross-practice čitljivost **kategorički zabranjena** |
| 4 | **Tačno dva** nova FK-a: `idempotency_keys_practice_fk`, `audit_events_practice_fk`, oba `NO ACTION`/`NO ACTION`; **nijedan** `→ users` FK |
| 5 | Prisma dobija **tačno dva** modela — `IdempotencyKey`, `AuditEvent`; **bez** `OutboxEvent` i `AsyncJob` u Fazi 5 |
| 6 | Puni post-`P5-I2` katalog = **13 tabela** `true`/`true` i **23 politike** (10 + 8 + 3 + 2); ranije `18 / 11` je **PHI-only podzbir**, ne exit tvrdnja |
| 7 | Creator migracija paketa `011` kreira i `audit_resource_idx` i `audit_actor_idx` |
| 8 | Imenovanje tri buduća direktorija je fiksirano; **konačan tačan broj migracija = 7** |
| 9 | Exact-set ekspektacije smiju evoluirati **stari tačan skup → novi tačan skup**; `exact` → `contains`/`subset`/`partial` ostaje **zabranjeno**; uvodi se novi `phase5-rls-grants.security.ts` |

**Dvije korekcije nađene u vlasničkom pregledu.** (A) Fraza §11 preflight izvještaja
„migration chain (exact set, 6 files)" je **superseded** — tačan broj je **7**. (B) Behavioural
test AAD trigera se **ne smije** tražiti kao `SQLSTATE 23514` od migratora nad produkcijskom
Faza-5 tabelom pod `FORCE RLS`-om; dokaz se dijeli na **atačiranje/katalog**, **runtime prvu
barijeru** i **ponašanje funkcije na privremenom objektu disposable baze** (`02` §25.8a).
**Historijski preflight dokaz se ne prepisuje prećutno.**

**Segmentacija implementacije.** `P5-I2` se izvršava kao **četiri** pod-gatea — **`P5-I2A`**
(paket `011`, strukturno) → **`P5-I2B`** (paket `013`, RLS/grantovi) → **`P5-I2C`** (paket
`014`, AAD trigeri) → **`P5-I2V`** (**`★`** dokaz). **Nijedan ne smije prećutno apsorbovati
naredni**, i **`P5-I5` ostaje blokiran dok `P5-I2V PASS` ne postane kanonski** (`04` §7.5).

**Prognoza checklista.** Nakon što **cijeli** `P5-I2` bude implementiran, verifikovan i kanonski,
**jedini** red koji se prognozira kao novo završen je **`Schema → RLS`** — prognoza **49 / 9**.
**`Tests → cross-tenant FK` se u `P5-I2` NE smije označiti**, jer značenje tog reda uključuje i
kasnije API/`422` ponašanje koje posjeduje `P5-I5`. **Svi Services/API/facade redovi ostaju
netaknuti.**

**Šta D-064 nije.** **Nije autorizacija implementacije.** `P5-I2` ostaje **NOT IMPLEMENTED** i
**NOT AUTHORIZED**; paket `011`, Faza-5 RLS/grantovi i Faza-5 AAD trigeri paketa `014` ostaju
**NOT IMPLEMENTED**; **`★` ostaje NOT EXECUTED**; **`P5-I5` ostaje neautorizovan**. Nijedan
servis, endpoint, tabela, migracija, Prisma model, politika, grant, trigger ni test nije njome
uveden, i **nijedna baza nije kontaktirana**. **Ne dira** D-060, D-061 ni D-063, **ne zatvara**
`D-OPEN-004a`, i **ne mijenja** `★` hard stop.

**Naredni gate:** **`P5-I2A`** — strukturni preduslov `P5-I2`, koji zahtijeva **zasebnu**
vlasničku autorizaciju.

## Konkretan `TenantDatabaseService` facade — prenesena obaveza (D-056)

**Premješteno iz Faze 4 odlukom D-056 (2026-08-20).** Ovo je **živa buduća obaveza**, ne odbačen
zahtjev. Sigurnosni **koncept** tenant database facadea ostaje kanonski (D-006; D-054, klauzula 5),
a njegovi invarijanti se **ne slabe**.

**Trigger je uslovan, ne fazni.** Obaveza se aktivira **kada stvarni tenant business
repozitorij/modul zatraži tu apstrakciju**. Faza 5 je **najranija očekivana** takva faza jer je
repozitorij već tako imenuje, ali **dolazak broja faze sam po sebi obavezu ne stvara**; jednako,
raniji tenant business modul obavezu aktivira **odmah**, u svojoj fazi.

Kada se aktivira, konkretan facade mora **prije prihvatanja** dokazati sve niže navedeno. Lista je
preuzeta iz D-054, klauzula 6–10 i D-056, klauzule 5 — **nijedan zahtjev nije uklonjen, oslabljen
ni označen završenim**.

- [ ] Facade **omotava postojeću** pinovanu sesijsku/transakcijsku granicu (`TenantRequestPipeline`)
      — ne stvara novu.
- [ ] Facade **ne posjeduje vlastiti `PrismaClient`** — runtime i dalje ima tačno jedan
      `PrismaService` i tačno jedan `copilot_app` klijent (D-054, klauzula 7).
- [ ] Facade **ne otvara drugu, ugniježdenu ni paralelnu** aplikacijsku transakciju
      (D-054, klauzula 8).
- [ ] Facade **ne postavlja `app.practice_id` prije** kanonskih provjera `practices.status` i
      aktivnog membershipa (`03` §3.7.1, koraci 3–4; D-047, klauzula 10; D-054, klauzula 9).
- [ ] Facade **ne prima caller-supplied identitet** i **nikada** ga ne tretira kao granicu
      povjerenja — identitet dolazi isključivo iz `app.user_id` autentifikovanog admission/session
      stanja (D-054, klauzula 10).
- [ ] Facade **koristi postojeću** pinovanu transakciju/sesiju autentifikovanog zahtjeva
      (D-054, klauzula 6).
- [ ] `set_request_context` ostaje **unutar te iste** transakcije; tenant business komanda se
      izvršava **tek nakon** uspostavljenog konteksta; bez konteksta vrijedi **default-deny**.
- [ ] Facade ostaje **tanak** — **ne** postaje paralelan database stack (D-054, dio C.2).
- [ ] **D-054, klauzule 6–10 su ponovo dokazane** trajnim testovima prije prihvatanja
      (D-056, klauzula 5).

Evidence:

```text
Trigger (tenant business modul):
Implementacija:
Test command:
Test result:
D-054 klauzule 6-10 ponovo dokazane:
```

## Slice `P5-I1` — schema foundation — **IMPLEMENTIRAN / NEZAVISNO REVIEWOVAN / OBJAVLJEN — KANONSKI**

**Autoritet: D-063, klauzule 1–2**, u suženom obuhvatu koji je gate `P5-I0` autorizovao, uz D-060,
D-061 i D-062 kao bazne ugovore. **Ovo je kanonsko stanje.** Publikacijski gate `P5-I1-P` je
izvršen: grana je gurana, **PR #30** je merged u kanonski `main`, merge SHA
`fcd88fbef6c398ae7f0404eb54edb8f7f8175634`.

```text
STATUS:            IMPLEMENTED / INDEPENDENTLY REVIEWED / NOT YET PUBLISHED
BRANCH:            feat/p5-i1-schema-foundation   (nije gurana; bez PR-a; bez mergea)
BASE:              origin/main 103be9fe68fa203a5553711c80ca250248a7bd6c
IMPLEMENTATION:    7c7bc9d62fe2bed741fcbc2aac142f0a41f8d8d5
                   feat(schema): add Phase 5 schema foundation
TEST:              fcbf4d11d742b7c3544ae9035a6663fb07ca5d67
                   test(schema): verify Phase 5 package 003 catalogue
INDEPENDENT REVIEW: P5_I1_V_PASS_READY_FOR_PUBLICATION
PUBLICATION:       NOT YET CANONICAL until branch merge
```

**Anotacija (`P5-I1-D`, 2026-08-23) — gornji blok se ne prepisuje.** On bilježi stanje slicea **u
trenutku nezavisnog pregleda, prije publikacije**; `STATUS`, `BRANCH` i `PUBLICATION` iz njega su
**historijske vrijednosti tog trenutka**, a ne tekući status. Commit SHA-ovi `7c7bc9d` i `fcbf4d1`
i ishod nezavisnog pregleda ostaju nepromijenjeni. **Tekuće kanonsko stanje:**

```text
STATUS:            IMPLEMENTED / INDEPENDENTLY REVIEWED / PUBLISHED
PUBLICATION:       CANONICAL
PULL REQUEST:      #30   (MERGED)
MERGE COMMIT:      fcd88fbef6c398ae7f0404eb54edb8f7f8175634
```

**Napomena o grani.** `04` §7.1 imenuje faznu granu `backend/05-encounters-documents`. Ovaj slice je
izveden na **slice-skopiranoj** grani `feat/p5-i1-schema-foundation`. To je zapis činjenice, ne
izmjena prescripcije `04` §7.1.

**Dokazan obuhvat — rekonstruisan iz samih commitovanih artefakata, ne iz prethodne proze:**

- **pet enuma** — `integration_provider`, `encounter_status`, `review_state`, `document_type`,
  `document_source` (Prisma i `CREATE TYPE` u paketu `003`);
- **pet modela / pet tabela** — `patient_references`, `encounters`, `encounter_diagnoses`,
  `storage_objects`, `encounter_documents`;
- **migration paket `003`** — `20260823104252_003_patient_encounter_documents/migration.sql`;
- **osam novih FK-ova**, **svaki** sa eksplicitnim `ON DELETE NO ACTION ON UPDATE NO ACTION`;
  nijedan `CASCADE`, `RESTRICT`, `SET NULL` ni `SET DEFAULT` nigdje u paketu;
- **devet unique indeksa/constrainata**, uključujući `(practice_id, id)` tenant ključ na svih pet
  novih tabela;
- **četiri ne-unique indeksa** — `encounters_review_queue_idx`, `encounters_patient_timeline_idx`,
  `encounters_responsible_physician_idx`, `documents_encounter_idx`;
- **23 imenovana `CHECK` constrainta**, svaki kao `ALTER TABLE ... ADD CONSTRAINT "<ime>" CHECK`,
  distribucija **5 / 6 / 0 / 1 / 11** po `patient_references` / `encounters` /
  `encounter_diagnoses` / `storage_objects` / `encounter_documents`. `encounter_diagnoses` bez
  ijednog `CHECK`-a je **ratifikovano odsustvo**, ne propust. Autoritet ostaje **20 + 3 = 23**
  (D-062, Dio E nad zamrznutim katalogom);
- **katalog/regresijski testovi paketa `003`** — novi `phase5-schema-catalogue.security.ts`, uz
  exact-set proširenja `database-migration.integration.ts`, `phase3-schema-catalogue.security.ts` i
  `phase4-package013-seed-force-rls.security.ts`. Nijedna postojeća tvrdnja nije oslabljena.

**Sigurnosna granica — dokazana kao pozitivno odsustvo:**

- **nula runtime grantova** i nula `REVOKE`-a;
- **nula RLS politika**; nijedan `ENABLE`/`FORCE ROW LEVEL SECURITY`;
- `relrowsecurity` i `relforcerowsecurity` su **`false`** na svih pet novih tabela, dok šest
  postojećih tabela zadržava `true`/`true`;
- **nula trigera**, nula funkcija, nula novih rola, nijedan `SECURITY DEFINER`;
- **paket `011` nije implementiran** — `idempotency_keys` i `audit_events` ne postoje;
- **paketi `013` i `014` (Faza-5 slice) nisu dirani**;
- **nula aplikacijskog koda** — izmjene su isključivo `apps/api/prisma/` i `apps/api/test/`;
- **runtime sigurnosnu granicu i dalje posjeduje `P5-I2`** (D-063, korekcija A). Stanje bez grantova
  je namjerno i sigurno: nijedna runtime rola tabele uopšte ne doseže;
- **`★` RI-naspram-RLS dokaz ostaje tvrdi preduslov prije `P5-I5`**, sa `HARD HOLD` pri neuspjehu
  (`04` §7.6a). `P5-I1` ga niti izvršava niti mijenja.

**Izvršni dokaz slicea** (`DB_MUTATED = TEST_DATABASES_ONLY` — korištene su i čuvane potrošne baze i
kanonska dijeljena integraciona test baza; **nijedna** development, staging ni produkcijska baza
nije mutirana):

```text
db:format                                    PASS
db:validate                                  PASS
db:generate                                  PASS
fresh migracija 001 -> 002 -> 013 -> 003     PASS
test:security                                PASS
test:integration                             PASS
unit testovi                                 PASS
e2e                                          PASS
lint                                         PASS
typecheck                                    PASS
build                                        PASS
format:check                                 FAIL — PRE-EXISTING, nije uzrokovan P5-I1
```

**`format:check` — precizna distinkcija.** Jedini neuspjeh je u
`apps/api/test/phase4-membership-role-assignment-constraints.security.ts`. Taj fajl **nije dirnut**
nijednim od dva `P5-I1` commita; posljednji ga je mijenjao commit `111d91d`, koji je predak
kanonskog `main`-a. Nezavisni pregled `P5-I1-V` je potvrdio da uzrok **nije** `P5-I1`. Popravak
**nije** u obuhvatu ni ovog slicea ni ovog gatea i ostaje zaseban zadatak.

**Šta ovaj slice ne tvrdi.** Ne zatvara Fazu 5, ne autorizuje `P5-I2`, ne zatvara `D-OPEN-004a`, ne
mijenja nijednu Faza-4 invarijantu, ne dira izostavljanje co-member `displayName`-a (D-061) i ne
uvodi nijednu novu odluku.

## Schema

- [x] patient_references.
- [x] encounters.
- [x] encounter_diagnoses.
- [x] storage_objects.
- [x] encounter_documents.
- [x] composite FK.
- [ ] RLS.
- [x] indexes.
- [x] checks.

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

**Obavezan gate prije reda „workspace endpoint" (D-061, klauzule 14–16).** Zamrznut kompletan v1
oblik `GET /analyses/{analysisId}/workspace` (`03` §15) sadrži
`encounter.responsiblePhysician.displayName` — dakle `display_name` **drugog** korisnika. To je
tekući **prvi poznati konzument** co-member pristupa, koji je i dalje `DENY / NOT IMPLEMENTED`
(D-047, klauzula 12).

Prije implementacije tog reda **mora** biti ponovo otvoren i prihvaćenom odlukom zatvoren imenovani
gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19). Implementacija **ne smije** tiho
dodati treću `users` politiku, proširiti grant, proširiti `practice_memberships` RLS, denormalizovati
ime, uvesti `SECURITY DEFINER` lookup ni zamjenski identifikator. Označavanje tog reda bez
prethodno zatvorenog gatea je **phase-gate defekt**.

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

**Oba se izvršavaju u ovoj fazi (D-052).** RLS slice paketa `013_rls_policies` nad
`review_decision_change_links` **premješten je iz Faze 4 u ovu fazu** i izvršava se neposredno
nakon što paket `009_review_approvals` kreira tabelu. Vidi „RLS i grants — D-046" niže.

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

## RLS i grants — D-046

**Premješteno iz Faze 4 odlukom D-052 (2026-08-16).** Vlasnik paketa **ostaje**
`013_rls_policies`; izvršava se **u ovoj fazi**, neposredno nakon što paket `009_review_approvals`
kreira tabelu. Lista je preuzeta iz Faze 4 **nepromijenjena** — nijedan zahtjev nije uklonjen,
oslabljen ni označen završenim.

Normativno: `02` §13.2a, §17.0, §18.1 i §22.13; D-046, klauzule 25–33; D-052, dio A.

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
- [ ] RLS slice se izvršava **nakon** paketa `009_review_approvals`, u ovoj fazi.
- [ ] Faza 4 nije izvršila nijedan RLS ni grant objekat nad ovom tabelom.

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

## Opoziv odobrenja — preuzeto iz Faze 4 (D-058)

**Premješteno iz Faze 4 odlukom D-058 (2026-08-20), po precedentu D-052, A.7.** Ovih šest redova
stajalo je u Fazi 4, sekcija „Uslovno odobravanje i opoziv" (`R267`–`R272` u ledgeru `P4-013`), a
opisuju **ponašanje write puta opoziva** koje Faza 4 ne implementira: tabelu `analysis_approvals`
kreira paket `009_review_approvals` **u ovoj fazi**. **Tekst je preuzet doslovno — nijedan zahtjev
nije uklonjen, oslabljen, sažet ni označen završenim.**

Normativno: D-041, klauzule 6–11; D-016; `03` §10 i §20; `15` §6; D-058, klauzule 3–4 i 8–9.

Provenijencija reda po reda — ledger `P4-013` (Faza 4) → ovaj red (Faza 10):

```text
R267 -> red 1   podobnost u trenutku opoziva          (D-041, kl. 7)
R268 -> red 2   opozivalac != originalni odobravatelj (D-041, kl. 6)
R269 -> red 3   reason obavezan                       (D-041, kl. 8)
R270 -> red 4   dokaz odobrenja se ne brise           (D-041, kl. 9)
R271 -> red 5   immutable approval historija          (D-041, kl. 10; D-016)
R272 -> red 6   revocation audit event                (D-041, kl. 11)
R303 -> rezidua nad rutama, nize                      (D-058, kl. 6; ostaje dokazan u Fazi 4)
```

- [ ] Podobnost se evaluira **u trenutku opoziva**.
- [ ] **Opozivalac ne mora biti originalni odobravatelj.**
- [ ] `reason` je **obavezan**.
- [ ] Dokaz odobrenja se **nikada ne briše**.
- [ ] Approval historija ostaje **immutable**.
- [ ] **Revocation audit event** je emitovan.

Rezidua reda `R303` na nivou rute (D-058, klauzula 6) — Faza 4 dokazuje **guard** ishod pri
isključenom flagu, ali konkretne rute odobravanja i opoziva u njoj ne postoje:

- [ ] Ruta odobravanja i ruta opoziva iz `03` §10 i §20 daju **`403`** kada podobna rola nema
      uključen odgovarajući practice flag (`allow_mpa_approval`,
      `allow_billing_specialist_approval`).

Postojeći sažeti redovi ove faze (`revoke`, `revoke history preserved`, `immutable trigger`,
`approvals`) su **djelimična pokrivenost** i **ne zamjenjuju** redove iznad; oni ostaju na snazi
**uz** njih (D-058, klauzula 9). **Matrica podobnosti se ne mijenja** — ona je i dalje obaveza
Faze 4 (D-041, klauzula 12; D-058, klauzula 2), a ova faza je **koristi**, ne redefiniše.

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

- [x] `07_CURSOR_PHASE_PROMPTS.md` — usklađen u D-047 batchu (2026-08-12).
- [x] `08_TEST_STRATEGY_V1.md` — usklađen u D-047 batchu (2026-08-12).
- [x] `MANIFEST.md` — osvježen u D-047 batchu (2026-08-12).

Ranija napomena da `BLOCKED` oznake u ta tri dokumenta ostaju na snazi **više ne važi**: D-047
batch je uskladio model permisija i **normativno povukao** vrijednost `BLOCKED — D-OPEN-011`,
zajedno sa `02`, `03`, `04`, `09`, `13`, `14` i `15`; nijedna matrica je više ne nosi (`15` §3.1).

**Ispravka evidencije (NB-1, 2026-08-13).** Uklanjanje nije bilo potpuno: u `08` §24.14 je nakon
PR #7 **nenamjerno ostala** rezidualna kolona `BLOCKED` sa vrijednošću `1` po roli. D-047 batch je
u toj sekciji ispravio samo prozne tvrdnje — „tačno sedam" → „tačno osam" `ALLOW` i zamjenu reda
`practice.read` = `BLOCKED — D-OPEN-011` dodjelama iz D-047 klauzule 11 — dok je sama tabela
ostala **bajt-identična** stanju prije D-047 (`d6b5efe` → `ec7d100`), pa je §24.14 protivrječio
i vlastitoj prozi i §24.13. Ta rezidualna nesaglasnost test-oraclea otkrivena je pri Faza 3
context restoreu i ispravljena u ovoj post-merge pre-implementacijskoj dokumentacionoj
rekonsilijaciji, 2026-08-13. `15` ostaje produkcijski oracle permisija; ispravka je
**usklađivanje evidencije i ne uvodi nijednu novu odluku o permisijama**.

Ova sekvenca je time zatvorena. Napomena o statusu batcha: rekonsilijacija je izvršena na branchu
`docs/d-047-runtime-access-model` i **merged** u kanonski `main` kroz PR #7, merge commit
`ec7d100` (§3a).

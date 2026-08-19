# 05 — Implementation Checklist

**Uputstvo:** Checkbox se označava samo ako postoji izvršena provjera ili konkretan dokaz.  
**Status vrijednosti:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

---

# 0. Project metadata

| Polje | Vrijednost |
|---|---|
| Current phase | Faza 1 — `DONE`; Ecosystem Compatibility Audit `DONE`; Faza 2 — `DONE`; **D-OPEN-011 decision gate — `DONE` (D-047 prihvaćen 2026-08-12)**; **D-047 dokumentaciona rekonsilijacija — `DONE`, merged u kanonski `main` (PR #7)**; **D-048–D-051 governance gate — `DONE`, merged u kanonski `main` (PR #10)**; **Faza 3 — `DONE`, merged u kanonski `main` (PR #12, merge commit `5c2786d`) (§4)**; Faza 4 — `NOT_STARTED`, nije otvorena (§5) |
| Current branch | Faza 3 je merged u kanonski `main`; implementacijski branch `backend/03-identity-practices` (tehnička implementacija HEAD, Gate 3E = `9f60d32c66023c4aad5ac34df267658ddfe5d6b1`; zatvarački dokumentacioni checkpoint = `2c7d7778a9ec1dae92fd0a5683d1f4afc7b36950`; završni head prije merge-a = `5c1699a0ea4d98e2f540c6e8cd9ae84997896a42`) je time potrošen. **Trenutni kanonski remote `main` = `origin/main` = `5c2786d689b50f73f49bfca52d2335ea50ee52c2`** (PR #12). Historijski: `251544f0b10abb00ee818f1ff5183c95b0ed0d03` (PR #11, kanonski `main` neposredno prije merge-a Faze 3) i `65e2552e13520ead86092f75ca3cc75d206b9f35` (PR #10) |
| Last completed phase | Faza 3 — Identity & Practices, `DONE` (posljednja faza merged u kanonski `main`, PR #12, `5c2786d`). Naredna faza: Faza 4 — `NOT_STARTED` |
| Last commit | `c4b89d0` (Phase 2 implementation), merged via `dae9649`; dokumentarno zatvaranje `98910b3`, merged via `d6b5efe`; D-047 rekonsilijacija `76dbc6d` + `dda7538`, merged via `ec7d100` (PR #7); dokumentaciona usklađivanja merged via `2befadc` i `5d38ba8` (PR #8, PR #9); D-048–D-051 rekonsilijacija `b2a99ce`, merged via `65e2552` (PR #10); dokumentaciono zatvaranje governancea merged via `251544f` (PR #11); **Faza 3 — sedam commitova branča `backend/03-identity-practices` (Gate 3A–3E, tehnička implementacija `HEAD` = `9f60d32`; zatvarački dokumentacioni checkpoint `2c7d777`; korekcija reference kanonskog `main`-a `5c1699a`), merged via `5c2786d` (PR #12) — to je **trenutni** kanonski `main`** (§4, „Gate checkpointi Faze 3") |
| Local environment owner | Nermin Fejzic |
| Test DB | `copilot_test` @ `localhost:5433` (compose profil `test`); dokazi Faze 3 nad realnim PostgreSQL-om rade na **jednokratnim** bazama `copilot_gate3b_<suffix>` @ `localhost` |
| Documentation version | 1.0 |
| Last updated | 2026-08-16 |
| **Faza 3** | **`PHASE 3 STATUS: DONE`** — zatvaranje je merged u kanonski `main`. Tehnička implementacija je bila kompletna **prije** merge-a, `TECHNICAL_IMPLEMENTATION_MISSING = 0`. Gate 3A–3E su commitovani, reviewovani i pushovani na `origin/backend/03-identity-practices`; tehnička implementacija HEAD (Gate 3E) = `9f60d32c66023c4aad5ac34df267658ddfe5d6b1`, zatvarački dokumentacioni checkpoint = `2c7d7778a9ec1dae92fd0a5683d1f4afc7b36950`. **PR #12 `feat(identity): complete Phase 3 identity and practices` — `MERGED` 2026-08-16T00:15:08Z; normalan merge commit `5c2786d689b50f73f49bfca52d2335ea50ee52c2` je trenutni kanonski `main`.** Time je ispunjen uslov da je `DONE` rezervisan za zatvaranje merged u kanonski `main`. Governance bloker D-048–D-051 bio je `RESOLVED` merge-om PR #10 (`65e2552`, 2026-08-15T00:50:43Z) **prije** nastavka implementacije — vidi §3b |

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
      *(Kanonski `origin/main` je otada pomjeren dvaput — na `251544f0b10abb00ee818f1ff5183c95b0ed0d03`
      merge-om PR #11, pa na `5c2786d689b50f73f49bfca52d2335ea50ee52c2` merge-om PR #12 (Faza 3);
      ovaj red bilježi stanje u trenutku merge-a PR #10.)*

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
CURRENT CANONICAL REMOTE MAIN:
                     5c2786d689b50f73f49bfca52d2335ea50ee52c2 (PR #12)
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
dva zatvaračka dokumentaciona commita (`2c7d777`, `5c1699a`) — očuvano je merge-om PR #12; trenutni
kanonski `origin/main` je merge commit `5c2786d689b50f73f49bfca52d2335ea50ee52c2`.

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
CURRENT CANONICAL REMOTE MAIN:     5c2786d689b50f73f49bfca52d2335ea50ee52c2 (PR #12) — VERIFIED
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

Verifikacija kanonskog `main`-a nakon merge-a — **PASS**: `origin/main` =
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

Status: `IN_PROGRESS`. Merged u kanonski `main`:

- **P4-5B** — tenant request/context pipeline, PR #15 (`530295d`, implementacija `fdef469`);
- **P4-5R1** — vezivanje identiteta i hardening tenant pipelinea, PR #17 (`2229724`);
- **P4-5C** — `GET /api/v1/practices/{practiceId}/settings`, PR #18 (`0411ae4`, merge `be675fd`).

Faza **nije** završena. **Settings `PATCH` nije implementiran**: `If-Match` put, optimistički
`UPDATE` i sve `428`/`409`/`400` ponašanje **ne postoje na `main`-u**. Preostale tenant tabele i
slice-evi ostaju otvoreni.

**Ugovor `PATCH`-a je zamrznut, ali nije implementiran.** Autoritet za slice **P4-5D** je
**D-055** (HTTP validatori i optimistička konkurentnost), uz **D-053** kao bazni settings ugovor.
Zamrznut ugovor **ne** dozvoljava označavanje ijedne `PATCH` stavke završenom (D-055, klauzula 33).

Normativno: D-033, D-038, **D-049**, **D-051**, **D-052**, **D-053**, **D-054** i **D-055**;
`02` §16.2,
§17.0, §17.3, §18.1, §20.2, §20.2b, §22.13 i §23.4.4a; `03` §3.7, §5, §10 i §28.5; `04` §6.2,
§6.4.1 i §6.4.2; `07` Faza 4.

Vlasnik migration paketa za preostale RLS stavke ove faze: **`013_rls_policies`**. Schema objekti
ostaju u `002_identity_and_practices` (Faza 3). Ne uvodi se novi broj paketa.

**Sužen obuhvat nakon D-051.** `02` §17.2 i §17.4 **više nisu u ovoj fazi** — konačni su u paketu
`002` i Fazi 3. Ova faza zadržava `02` §17.3, `practice_settings` RLS i runtime put (D-049),
`set_request_context`, uspostavu `app.practice_id`, `PracticeContextGuard`, `TenantDatabaseService`
i preostale tenant tabele (`02` §17.0).

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
- [ ] **Konkretan `TenantDatabaseService` facade** — **NIJE** implementiran i **ne označava se**
      završenim. Koncept ostaje kanonski (D-054, klauzula 5); konkretna klasa se uvodi tek kada je
      stvarni tenant business modul zatraži, i tada mora dokazati klauzule 6–10.
- [x] **Uklanjanje `userId` seama** iz `TenantRequestPipeline.admit(...)` — **RIJEŠENO** kroz
      PR #17 (`2229724`). Kanonski potpis je sada `TenantRequestPipeline.admit(session, request)`;
      identitet se izvodi **isključivo** iz `app.user_id` autentifikovane sesije, pa pogrešan
      korisnik **nije izraziv**. Precondition D-054, klauzule 12 je ispoštovan: prva dodatna
      tenant ruta (P4-5C) dodana je **tek nakon** toga (D-055, klauzula 32).

## Slice P4-5C — settings `GET`

**Normativno: D-053 (dio A), D-054 i D-055.** Merged u kanonski `main` kroz PR #18; implementacijski
commit `0411ae4`, merge `be675fd`. Ova sekcija bilježi **isključivo** ono što je taj slice mehanički
dokazao. **Nijedna `PATCH` stavka se ovdje ne označava** — `PATCH` ne postoji na `main`-u.

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
- [ ] **Autorizovan `304` na `If-None-Match`** — ponašanje **postoji** i **kanonizovano** je u
      D-055, dijelu B, ali **namjenski `304` testovi nisu uvedeni** i ovim gateom **nisu**
      ovlašteni (D-055, klauzula 6).

## Slice P4-5D — settings `PATCH` — **NIJE IMPLEMENTIRAN**

**Autoritet: D-055**, uz D-053 kao bazni ugovor. **Ugovor je zamrznut; implementacije nema.**
Nijedna stavka ispod se **ne smije** označiti završenom na osnovu zamrznutog ugovora
(D-055, klauzula 33).

- [ ] `PATCH /api/v1/practices/{practiceId}/settings` **registrovan** — **NIJE**.
- [ ] `If-Match` write put — **NIJE** implementiran.
- [ ] Parser prihvaćene gramatike `"<N>"` (D-055, klauzula 11) — **NE POSTOJI**.
- [ ] `428` / `400` / `409` razdvajanje (D-055, klauzula 12) — **NIJE** implementirano.
- [ ] Jaka i tačna komparacija; `W/"N"` odbijen (D-055, klauzula 13) — **NIJE** implementirana.
- [ ] `400 VALIDATION_ERROR` za prazno tijelo `{}` (D-055, klauzula 14) — **NIJE** implementirano.
- [ ] Atomičan optimistic-concurrency `UPDATE` sa predikatom `practice_id` **i** `version`
      (D-055, klauzule 15–18) — **NIJE** implementiran.
- [ ] Zabrana aplikacijskog pre-reada (D-055, klauzula 16) — **nema koda koji bi je dokazao**.
- [ ] `409 VERSION_CONFLICT` za nula pogođenih redova iz **oba** uzroka (D-055, klauzule 19–21) —
      **NIJE** implementirano.
- [ ] `200` sa istom osmopoljnom reprezentacijom i **novim** `ETag`-om iz istog
      `UPDATE ... RETURNING` iskaza (D-055, klauzule 22–23) — **NIJE** implementirano.
- [ ] Tražena permisija `practice.settings.manage` na `PATCH`-u (D-055, klauzula 28) — **NIJE**
      implementirana.

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

## RLS za `practice_membership_roles` i `platform_role_assignments` — premješteno u Fazu 3

**Ažurirano odlukom D-051 (2026-08-14).** Ovi artefakti **više ne pripadaju ovoj fazi**. Paket
`002_identity_and_practices` i Faza 3 su njihov **konačni vlasnik** (`02` §17.0, §17.2, §17.4,
§22.2; §4 ovog dokumenta). Puna verifikaciona lista je u §4.

- [ ] Paket `013_rls_policies` **ne sadrži nijedan** `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`
      ni `FORCE ROW LEVEL SECURITY` za `practice_membership_roles` i `platform_role_assignments`.
- [ ] Politike iz `02` §17.2 i §17.4 **nisu prepisane, oslabljene ni zamijenjene** u ovoj fazi.
- [ ] Faza 4 ih smije **verifikovati i koristiti**, ali ne rekreirati.
- [ ] Ove politike **nisu** riješile D-OPEN-011 i ne tumače se tako; access model je riješen
      odlukom **D-047** kroz `02` §17.5 i §17.6, već u Fazi 3.

## RLS i runtime put za `practice_settings` — D-049

Paket: `013_rls_policies`. Normativno: `02` §6.4, §18.1, §20.2b i §22.13; `03` §5 i §10;
D-049, klauzula 5.

- [ ] `ENABLE ROW LEVEL SECURITY`.
- [ ] `FORCE ROW LEVEL SECURITY`.
- [ ] Standardna tenant politika `practice_id = app.practice_id`.
- [ ] **Phase gate pada ako `UPDATE` grant postoji bez pripadajuće tenant politike.**
- [x] `GET /api/v1/practices/{practiceId}/settings` registrovan — **P4-5C, PR #18**.
- [ ] `PATCH /api/v1/practices/{practiceId}/settings` registrovan — **NIJE** (P4-5D).
- [ ] `ETag` vraćen na oba odgovora — **`GET` polovina je gotova** (jak, aplikacijski
      postavljen tag, P4-5C); `PATCH` polovina **ne postoji**.
- [ ] `If-Match` obavezan na `PATCH` — **NIJE** implementiran (D-055, klauzula 10).
- [ ] `428 PRECONDITION_REQUIRED` bez `If-Match` — **NIJE** implementirano.
- [ ] `400 VALIDATION_ERROR` na sintaksno neprihvaćen `If-Match` — **NIJE** implementirano
      (D-055, klauzule 11–12).
- [ ] `409 VERSION_CONFLICT` na stale `If-Match` — **NIJE** implementirano.
- [ ] `version` se inkrementira **atomično** — **NIJE** implementirano.
- [ ] `practice.settings.read` i `practice.settings.manage` ostaju **`PRACTICE_ADMIN` only**
      (D-044, nepromijenjeno; `15`).
- [ ] Izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` je
      **zatvorena** — regresijski test dokazuje da `copilot_app` više ne vidi redove izvan tekućeg
      tenanta.
- [ ] `copilot_system` **nema** nijedan grant; `PUBLIC` **nema** nijedan grant.

### Zamrznuta settings reprezentacija — D-053, dio A

Normativno: `03` §10 („Settings reprezentacija"); `02` §20.2b.1.

**Stanje nakon P4-5C (PR #18).** `GET` polovina svake stavke ispod je **mehanički dokazana** i
evidentirana u „Slice P4-5C" iznad: osmopoljna reprezentacija, jak `ETag: "<version>"`, odsustvo
`version`-a u tijelu i odsustvo `updated_at`/`updated_by`/`configuration`. **Kućice ostaju
neoznačene** jer svaka od njih tvrdi i **`PATCH`** polovinu, koja **ne postoji**. Označavaju se u
gateu **P4-5D** (D-055).

- [ ] `GET` i **uspješan** `PATCH` vraćaju **istu** reprezentaciju.
- [ ] Reprezentacija ima **tačno osam** polja: `practiceId`, `billingReviewRequired`,
      `allowMpaApproval`, `allowBillingSpecialistApproval`, `requireReasonForManualChange`,
      `aiEnabled`, `axenitaExportEnabled`, `retentionPolicyCode`.
- [ ] `retentionPolicyCode` je `string|null`; preostalih šest su `boolean`; `practiceId` je `uuid`.
- [ ] Oba odgovora nose `ETag: "<version>"`, izveden iz `practice_settings.version`.
- [ ] **`version` se ne pojavljuje kao polje JSON tijela** — ni u `GET`, ni u `PATCH` odgovoru, ni
      u `PATCH` zahtjevu.
- [ ] `updated_at`, `updated_by` i `configuration` se **ne vraćaju**.

### Tačna `SELECT` površina — D-053, dio A

- [ ] `SELECT` grant obuhvata **tačno devet** kolona: `practice_id`, `billing_review_required`,
      `allow_mpa_approval`, `allow_billing_specialist_approval`,
      `require_reason_for_manual_change`, `ai_enabled`, `axenita_export_enabled`,
      `retention_policy_code`, `version`.
- [ ] **Nema table-level `SELECT`.**
- [ ] `id`, `configuration`, `updated_at` i `updated_by` ostaju **nečitljivi**.
- [ ] Nedozvoljena kolona pada sa `42501` **i kada se koristi samo u `WHERE` ili `ORDER BY`**.
- [ ] Trokolonska površina Faze 3 je **strogi podskup**; **nijedan grant nije opozvan**.

### Tačna `UPDATE` površina — D-053, dio B

- [ ] `UPDATE` grant obuhvata **tačno devet** kolona: `billing_review_required`,
      `allow_mpa_approval`, `allow_billing_specialist_approval`,
      `require_reason_for_manual_change`, `ai_enabled`, `axenita_export_enabled`,
      `retention_policy_code`, `version`, `updated_at`.
- [ ] **Nema table-level `UPDATE`.**
- [ ] `practice_id`, `id`, `configuration` i `updated_by` ostaju **bez `UPDATE`-a**.
- [ ] **Nema `INSERT` i nema `DELETE`** za runtime role.
- [ ] **`updated_by` je nepromijenjen nakon uspješnog `PATCH`-a** i **nije** tretiran kao
      autoritativno audit polje.
- [ ] **Nijedan novi triger nije uveden**; paket `014_immutability_triggers` je **nepromijenjen**.

### Mehanika optimističkog update-a — D-053, dio B

**Autoritet za implementaciju: D-055.** Stavke ispod su **zamrznut ugovor, ne implementacija** —
nijedna ne postoji na `main`-u. D-055 dodatno zamrzava ono što D-053 ne navodi: prihvaćenu
gramatiku `"<N>"` (klauzula 11), razdvajanje `428`/`400`/`409` (klauzula 12), jaku i tačnu
komparaciju (klauzula 13), `400` za prazno tijelo (klauzula 14), zabranu pre-reada (klauzula 16),
`409` za nula redova iz **oba** uzroka (klauzule 19–21) i jedan izvor istine za uspješan odgovor
(klauzule 22–23).

- [ ] Očekivana verzija se izvodi **isključivo iz `If-Match`**.
- [ ] Izvršava se **jedan atomičan SQL `UPDATE`**.
- [ ] `UPDATE` postavlja **samo poslana** poslovna polja.
- [ ] `UPDATE` postavlja `version = version + 1`.
- [ ] `UPDATE` postavlja `updated_at` na **tekuće vrijeme baze**.
- [ ] Predikat je `practice_id = <uspostavljeni tenant> and version = <očekivana verzija>`.
- [ ] Nula pogođenih redova zbog zastarjele verzije → **`409 VERSION_CONFLICT`**.
- [ ] Uspjeh vraća reprezentaciju i **novi** `ETag`.
- [ ] Pozivalac **nikada** ne šalje `version`, `updated_at` ni `updated_by`; poslano se **odbija**.
- [ ] **Nije uveden**: triger nad `version`, `SECURITY DEFINER`, privilegovana helper funkcija,
      izmjena paketa `014`, novi migration paket, API polje za proizvoljnu verziju.

### `GET /me` nakon `practice_settings` RLS-a — D-053, dio D

Normativno: `02` §17.1a; `03` §10. Faza 4 **adaptira aplikacijski put**, ne politiku.

- [ ] Tenant politika nad `practice_settings` je **doslovno** `practice_id =
      nullif(current_setting('app.practice_id', true), '')::uuid` — **nepromijenjena**.
- [ ] **Nije uveden** bootstrap/membership-wide izuzetak ni ijedno drugo slabljenje.
- [ ] `GET /me` ostaje **neutralna, autentifikovana** ruta.
- [ ] **`X-Practice-ID` nije uveden** na `/me`.
- [ ] Zamrznuti `/me` ugovor iz `03` §10 je **nepromijenjen**.
- [ ] Svaki `practice_id` za interni read dolazi **isključivo iz razriješenih membership redova**
      za `app.user_id`; **nijedna** vrijednost iz tijela, query parametra, headera ni putanje ne
      učestvuje.
- [ ] **Neaktivan membership ne dobija tenant kontekst** i ostaje `permissions = []`.
- [ ] Za **aktivan** membership kojem uslovne postavke trebaju, kontekst se uspostavlja **po
      membershipu**, kroz prihvaćeni `set_request_context` put (`02` §16.2.3).
- [ ] Read se izvršava **pod istom strogom tenant politikom**.
- [ ] **Sva ne-tenant-scoped čitanja — uključujući `practiceName` za sve membershipe — završena su
      prije prvog `set_request_context` poziva** (RESTRICTIVE politika `02` §17.6).
- [ ] Postavke ordinacije A **ne doprinose** ordinaciji B; **nema unije** postavki ni rola preko
      ordinacija.
- [ ] **Nijedan novi mehanizam čišćenja konteksta nije uveden** — izolaciju daju brisanje unutar
      `set_request_context` i kraj transakcije.
- [ ] **Nema `SECURITY DEFINER`, `BYPASSRLS`, superuser puta ni zaobilaznice.**
- [ ] Provjera `practices.status` iz koraka 4 §3.7.1 **nije uvedena na `/me`** (D-053, klauzula
      D.10).

### `GET /me` regresijski dokaz — D-053, klauzula D.12

- [ ] Iste kanonske `/me` fixture daju **iste** `memberships[].permissions` **prije i nakon**
      uvođenja `practice_settings` RLS-a.
- [ ] Uslovno ponašanje `MPA` i `BILLING_SPECIALIST` je tačno za **oba** stanja **oba** flaga.
- [ ] Neaktivan membership ostaje `permissions = []`.
- [ ] Multi-practice membership koristi postavke **svoje** ordinacije, nezavisno.
- [ ] `practiceName` je prisutan za **svaki** membership — dokaz redoslijeda čitanja.
- [ ] **Nijedan tenant kontekst ne curi** nakon transakcije.
- [ ] **Nijedan klijentski poslan practice identifikator** ne učestvuje u neutralnom `/me`.

## RLS za `review_decision_change_links` — odgođeno u Fazu 10

**Ažurirano odlukom D-052 (2026-08-16).** Ovi artefakti se **ne izvršavaju u ovoj fazi**. Tabelu
`review_decision_change_links` kreira paket `009_review_approvals` u **Fazi 10** (`02` §22.9), pa u
Fazi 4 **ne postoji** — RLS i grantovi nad njom nisu izvodivi. Vlasništvo slicea **ostaje**
`013_rls_policies` (`02` §22.13); odgođena je **isključivo tačka izvršenja**. Puna, nepromijenjena
verifikaciona lista je u §11 („RLS i grants — D-046").

**Nijedan sigurnosni zahtjev nije uklonjen, oslabljen ni označen završenim.**

U ovoj fazi provjerljivo je isključivo sljedeće:

- [ ] Faza 4 **ne kreira** tabelu `review_decision_change_links`.
- [ ] Paket `013_rls_policies` u Fazi 4 **ne sadrži nijedan** `CREATE POLICY`,
      `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` ni grant za
      `review_decision_change_links`.
- [ ] Nijedna migracija, test ni aplikacijski artefakt Faze 4 **ne referencira** tu tabelu kao
      postojeću.
- [ ] Generički tenant RLS obrazac i test harness postoje i dokazani su nad `practice_settings`,
      tako da ih odgođeni slice Faze 10 samo proširuje (D-052, klauzula A.8).
- [ ] **Ne uvodi se novi broj paketa i nijedan se ne renumeriše.**

## Proširenje D-048 allowliste — D-052, dio B

Paket: `013_rls_policies`. Normativno: `02` §23.4.4a i §23.4.5; `08` §21.8; D-048; D-052, dio B.

Ova faza prvi put uvodi `FORCE RLS` nad `practice_memberships` i `practice_settings`, a pouzdani
seed put upisuje u obje.

- [ ] Allowlist je proširen **tačno** sa `practice_memberships` i `practice_settings`.
- [ ] Proširenje je **eksplicitno** — tiho proširenje obara phase gate.
- [ ] Allowlist faze 3 (`users`, `practices`, `practice_membership_roles`,
      `platform_role_assignments`) je **nepromijenjena**; ukupno **šest** tabela.
- [ ] `FORCE RLS` je **obnovljen nakon seeda** za obje tabele.
- [ ] **Put neuspjeha obnavlja `FORCE RLS`.**
- [ ] **Rollback obnavlja `FORCE RLS`** — prekinut seed nikada ne ostavlja `FORCE` isključenim.
- [ ] **Nijedna rola nema `BYPASSRLS`.**
- [ ] **Nijedna `SECURITY DEFINER` zaobilaznica** nije uvedena.
- [ ] **Nijedan superuser runtime put** nije konfigurisan.
- [ ] **`DISABLE ROW LEVEL SECURITY`** se ne pojavljuje u forward migraciji ni seedu.
- [ ] **Nijedna trajna owner-write politika** ne postoji.
- [ ] Testovi dokazuju steady-state `ENABLE` **i** `FORCE` **prije i nakon** seeda.
- [ ] Upis izvan protokola iz `02` §23.4.3 **pada**.

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

- [ ] `platformRoles` se obrađuju odvojeno od tenant membershipa.
- [ ] `platformRoles` se ne pretvaraju automatski u tenant permisije.
- [ ] Tenant membershipi i platform role se ne spajaju unijom.
- [ ] Platform/system context se ne uspostavlja kroz `set_request_context`.
- [ ] Tenant role dolaze **isključivo** iz `practice_membership_roles`.
- [ ] `SYSTEM_ADMIN` sa aktivnim membershipom izvodi tenant permisije **samo** iz dodijeljenih tenant rola.
- [ ] `tariff.manage` ostaje platform permisija i platform ruta.
- [ ] `integration.read` ostaje tenant-scoped i ograničen na `PRACTICE_ADMIN`.
- [ ] **Database grant nikada ne zamjenjuje permisiju endpointa.**

## Access model za `users` i `practices` u Fazi 4 — D-047

- [ ] Politike nad `users` i `practices` iz paketa `002` **nisu prepisane, oslabljene ni
      zamijenjene** — Faza 4 ih ne dira.
- [ ] RESTRICTIVE politika `practices_context_narrow` **nije** pretvorena u permissive.
- [ ] Nakon uvođenja `app.practice_id`, vidljivost `practices` sužava se na **tačno jednu**
      ordinaciju, i kada upit nema `WHERE` klauzulu.
- [ ] Nakon §17.3, `copilot_app` **više ne vidi** generičke `practice_memberships` redove — time je
      međustanje Faze 3 zatvoreno.
- [ ] Politika nad `practices` daje **identičan** rezultat prije i nakon §17.3.
- [ ] `practice_memberships` bootstrap pristup i dalje **nije** opšti runtime pristup nad `users`.
- [ ] `practice_memberships` bootstrap pristup i dalje **nije** opšti runtime pristup nad `practices`.
- [ ] Phase gate pada ako implementacija tiho uvede neograničen pristup nad bilo kojom od te dvije tabele.
- [ ] Self-enumeracija vlastitih membership rola (§17.4) **nije** riješila D-OPEN-011 — to je učinio D-047.

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
- [ ] `practice.read` je **`DENY`** (D-047) — `AUDITOR` i dalje ima tačno dvije aktivne permisije.
- [ ] **Nema discovery ni listing endpointa.**

### READ_ONLY

- [ ] **Nula `ALLOW`.**
- [ ] **Nula `CONDITIONAL`.**
- [ ] `practice.read` je **`DENY`** (D-047) — invarijanta nula `ALLOW` ostaje na snazi.
- [ ] Sve ostale aktivne permisije `DENY`.

### PRACTICE_ADMIN

- [ ] `practice.read` — **jedina rola koja ga dobija** (D-047); projekcija bez `zsrNumber`,
      `glnNumber` i `legalName`.
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

- [x] PracticeContext guard — **kao koncept**, realizovan `TenantRequestPipeline`-om za tekuću
      tenant rutu; **nije** NestJS `CanActivate` i ne smije to postati tamo gdje bi validirao
      tenant kontekst prije admisije korisnika (D-054, klauzule 2–4).
- [ ] TenantDatabaseService — **koncept ostaje kanonski, konkretan facade nije implementiran** i
      **ne označava se** završenim dok ga stvarni tenant business modul ne zatraži (D-054,
      klauzule 5–10).
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
- [ ] Opšti runtime pristup nad `users`/`practices` **ne postoji** — potvrđeno negativnim
      testovima iz `08` §21.5 (D-047).
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
- [ ] generički `users`/`practices` pristup **nije implementiran**; politike i column grantovi iz
      D-047 su prisutni tačno kako su propisani;
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

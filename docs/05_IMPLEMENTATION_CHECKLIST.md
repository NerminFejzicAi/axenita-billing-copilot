# 05 — Implementation Checklist

**Uputstvo:** Checkbox se označava samo ako postoji izvršena provjera ili konkretan dokaz.  
**Status vrijednosti:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

---

# 0. Project metadata

| Polje | Vrijednost |
|---|---|
| Current phase | Faza 1 — `DONE`; Ecosystem Compatibility Audit `DONE`; Faza 2 — `DONE`; **D-OPEN-011 decision gate — `DONE` (D-047 prihvaćen 2026-08-12)**; **D-047 dokumentaciona rekonsilijacija — `DONE`, merged u kanonski `main` (PR #7)**; **Faza 3 — `IN_PROGRESS`, trenutno `BLOCKED` (§3b)** |
| Current branch | implementacijski branch `backend/03-identity-practices`; posljednji kanonski `main` = `5d38ba8fe4ee230f602f0cc7ac324b9eb4fadffc` |
| Last completed phase | Faza 2 — Database Foundation |
| Last commit | `c4b89d0` (Phase 2 implementation), merged via `dae9649`; dokumentarno zatvaranje `98910b3`, merged via `d6b5efe`; D-047 rekonsilijacija `76dbc6d` + `dda7538`, merged via `ec7d100` (PR #7); dokumentaciona usklađivanja merged via `2befadc` i `5d38ba8` (PR #8, PR #9). **Faza 3 nema nijedan commit** |
| Local environment owner | Nermin Fejzic |
| Test DB | `copilot_test` @ `localhost:5433` (compose profil `test`) |
| Documentation version | 1.0 |
| Last updated | 2026-08-14 |
| **Faza 3** | **`PHASE 3 IMPLEMENTATION: AUTHORIZED` (od merge-a `ec7d100`); `PHASE 3 STATUS: IN_PROGRESS — BLOCKED`**. Implementacija je započeta na branchu `backend/03-identity-practices` i **zaustavljena na governance blokeru** D-048–D-051 (§3b). Ništa nije commitovano ni pushovano; **nijedna implementacijska stavka §4 nije označena** |

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
historijska: Faza 3 je od tog merge-a **autorizovana**, ali **nije započeta**.)*

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
                                   # SUPERSEDED -> vidi §3b: IN_PROGRESS — BLOCKED
```

**Ovaj blok je historijski zapis stanja na dan zatvaranja D-047 gatea.** Red
`PHASE 3 STATUS: NOT_STARTED` **više ne odražava stvarno stanje**; tekući status je
`IN_PROGRESS — BLOCKED` i vodi se u §3b i §4. Red `PHASE 3 IMPLEMENTATION: AUTHORIZED` ostaje na
snazi.

Uslovi autorizacije su bili: D-047 zabilježen; svi autoritativni dokumenti usklađeni; nezavisan
governance review prošao; rekonsilijacijski commit merged u kanonski `main`; kanonski `main`
verifikovan; D-OPEN-011 formalno superseded. **Svi su ispunjeni**, pa je Faza 3 autorizovana.

**`PHASE 3 AUTHORIZED` nije `PHASE 3 STARTED`.** U trenutku pisanja §3a nijedan Faza 3 artefakt
nije postojao, i nijedan checkbox u §4 nije bio označen. Autorizacija dozvoljava da implementacija
počne u zasebnom, eksplicitnom promptu; ona je ne pokreće. *(Za stvarno stanje implementacije
nakon tog trenutka vidi §3b i §4.)*

---

# 3b. Governance gate — D-048, D-049, D-050, D-051

Status: **odluke `ACCEPTED` (2026-08-14); dokumentaciona rekonsilijacija u toku — `IN_PROGRESS`,
nije commitovana, nije reviewovana, nije merged**

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
- [ ] Nezavisan governance review.
- [ ] Commit, push, PR, normalni merge u `main`.
- [ ] Verifikacija kanonskog `main` nakon merge-a.

## Stanje implementacije Faze 3

- [x] Branch `backend/03-identity-practices` postoji.
- [x] Prisma schema i migracija `002` **djelimično** autorisane lokalno.
- [x] Implementacija **zaustavljena** na governance blokeru.
- [x] **Ništa nije commitovano ni pushovano.**
- [x] **Nijedna tvrdnja o završetku Faze 3 ne postoji.**
- [ ] Faza 3 nastavljena nakon merge-a ove rekonsilijacije.

## Status

```text
D-048 STATUS:        ACCEPTED
D-049 STATUS:        ACCEPTED
D-050 STATUS:        ACCEPTED
D-051 STATUS:        ACCEPTED
D-028 klauzula 4:    fazni dio POVUČEN (D-049)
RECONCILIATION:      IN_PROGRESS — NOT COMMITTED, NOT REVIEWED, NOT MERGED
PHASE 3 IMPLEMENTATION: AUTHORIZED
PHASE 3 STATUS:      IN_PROGRESS — BLOCKED
```

**Lokalni neizvršeni rad nije dokaz.** Nijedan checkbox u §4 se ne smije označiti zbog postojanja
necommitovanog lokalnog rada; za svaku stavku i dalje mora postojati izvršena provjera ili
konkretan dokaz.

---

# 4. Faza 3 — Identity/practices

Status: `IN_PROGRESS — BLOCKED`

**Autorizacija: `AUTHORIZED` od merge-a D-047 rekonsilijacije u kanonski `main` (§3a, `ec7d100`).**
Implementacija je **započeta** na branchu `backend/03-identity-practices` i **zaustavljena na
governance blokeru** D-048–D-051 (§3b). Rad je lokalan i **necommitovan**.

**Nijedan checkbox ispod nije označen.** Postojanje lokalnog necommitovanog rada **nije dokaz** i
ne opravdava označavanje nijedne stavke; svaka i dalje zahtijeva izvršenu provjeru ili konkretan
dokaz. Nastavak implementacije čeka merge rekonsilijacije iz §3b.

Normativno: D-033, D-038, D-047, **D-048**, **D-049**, **D-050** i **D-051**; `02` §6.3, §6.3a,
§17.0, §17.2, §17.4, §20.2b, §22.2, §23.2, §23.4 i §26.3; `03` §10; `04` §5.2, §5.2.1 i §5.4.1.

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
- [ ] practice settings red, uz oba approval flaga na `false`.
- [ ] seed idempotent.
- [ ] **svaki upis u tabelu sa `FORCE RLS` ide kroz maintenance protokol iz `02` §23.4** (D-048).

## API

- [ ] dev auth isolated.
- [ ] user resolution.
- [ ] `/me` vraća `memberships` i `platformRoles` kao dva odvojena bloka.
- [ ] `platformRoles` se ne pretvaraju u tenant membershipe.
- [ ] `practice_memberships` bez RLS-a u ovoj fazi — bootstrap politika pripada Fazi 4 (D-033;
      `02` §17.3). **`practice_membership_roles` i `platform_role_assignments`, međutim, dobijaju
      svoju RLS već u ovoj fazi** (D-051; `02` §17.2, §17.4).
- [ ] **Nijedna settings ruta nije registrovana u ovoj fazi** (D-049).
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

## Access model za `users` i `practices` — D-047

Normativno: D-047; `02` §16.2.1, §16.2.4, §17.5, §17.6, §20.2a, §22.2. Raniji
`BLOCKED — D-OPEN-011` blok više ne važi; umjesto njega vrijede **obavezne verifikacione stavke**.

- [ ] `app_security.set_auth_subject_context(text)` postoji — SECURITY INVOKER, fiksiran
      `search_path`, `42501` na null/prazan ulaz, briše `app.user_id` i `app.practice_id`,
      `EXECUTE` samo `copilot_app`, `PUBLIC` revoked.
- [ ] `app_security.set_user_context(uuid)` je kreiran u paketu **`002`**, sa nepromijenjenim
      potpisom, `SECURITY INVOKER` modom i tijelom iz D-033.
- [ ] `users` ima `ENABLE` **i** `FORCE ROW LEVEL SECURITY`.
- [ ] `users` ima **tačno dvije** PERMISSIVE `SELECT` politike.
- [ ] Bootstrap politika sadrži obavezni uslov `app.user_id IS NULL`.
- [ ] Self politika glasi `id = app.user_id`.
- [ ] `practices` ima `ENABLE` **i** `FORCE ROW LEVEL SECURITY`.
- [ ] `practices` ima PERMISSIVE membership politiku **bez** filtera na `pm.active`.
- [ ] `practices` ima **RESTRICTIVE** `practices_context_narrow` politiku.
- [ ] Column grant `users` = `(id, email, display_name, preferred_language, status)`.
- [ ] Column grant `practices` = `(id, code, name, default_language, timezone, status)`.
- [ ] `auth_subject`, `last_login_at`, `legal_name`, `zsr_number`, `gln_number`, `created_at` i
      `updated_at` **nemaju** grant.
- [ ] Nema `INSERT`, `UPDATE` ni `DELETE` nad `users` i `practices` ni za jednu runtime rolu.
- [ ] `copilot_system` nema nijedan grant nad te dvije tabele; `PUBLIC` nema nijedan.
- [ ] **Nijedna `SECURITY DEFINER` funkcija nije uvedena.**
- [ ] Korisnik čiji `status` nije `ACTIVE` odbijen je **prije** `set_user_context`.
- [ ] Ordinacija čiji `status` nije `ACTIVE` odbijena je **prije** `set_request_context`.
- [ ] Cijeli bootstrap lanac izvršava se u **jednoj** interaktivnoj transakciji.
- [ ] Nema neograničenog ni generičkog runtime pristupa nad `users` i `practices` — zabrana nije
      ukinuta, nego je sprovedena kroz `FORCE RLS` i column grantove.
- [ ] Phase gate pada ako je takav pristup tiho uveden.
- [ ] Self-enumeracija vlastitih membership rola **nije** generički pristup nad `users`.
- [ ] Self-enumeracija vlastitih membership rola **nije** generički pristup nad `practices`.
- [ ] Self-enumeracija **nije** role administration.
- [ ] Self-enumeracija **nije** cross-practice administracija.
- [ ] **Treća `users` politika nije kreirana** — pristup redu drugog korisnika ostaje
      `DENY / NOT IMPLEMENTED`; gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19).
- [ ] Negativni testovi iz `02` §25.1.1 i `08` §21.5 prolaze.

## RLS za `platform_role_assignments` i `practice_membership_roles` — D-051

Paket: **`002_identity_and_practices`**, Faza 3. Normativno: `02` §17.0, §17.2, §17.4, §22.2;
D-051, klauzule 1–6; D-023, klauzula 11.

- [ ] `platform_role_assignments` ima `ENABLE ROW LEVEL SECURITY`.
- [ ] `platform_role_assignments` ima `FORCE ROW LEVEL SECURITY`.
- [ ] Politika `platform_role_assignments_self_select` postoji, **nepromijenjenog imena i tijela**.
- [ ] Politika `platform_role_assignments_system_select` postoji, **nepromijenjenog imena i tijela**.
- [ ] Self politika zavisi **isključivo** od `app.user_id`; **ne koristi** `app.practice_id`,
      `set_request_context`, `PracticeContextGuard` ni `TenantDatabaseService`.
- [ ] `copilot_system` ima `SELECT` + `USING (true)`; `PUBLIC` nema pristup.
- [ ] **`copilot_app` NEMA neograničen `SELECT` nad `platform_role_assignments`** — invarijanta
      D-023, klauzule 11, važi **od ove faze**.
- [ ] `practice_membership_roles` ima `ENABLE ROW LEVEL SECURITY`.
- [ ] `practice_membership_roles` ima `FORCE ROW LEVEL SECURITY`.
- [ ] Politika `practice_membership_roles_self_select` postoji, **nepromijenjenog imena i tijela**.
- [ ] Politika koristi `EXISTS` nad `practice_memberships` uz `pm.user_id = app.user_id`.
- [ ] Politika radi **bez** §17.3 RLS-a nad `practice_memberships`.
- [ ] Podupirući `SELECT` grant nad `practice_memberships` postoji; njegovo ukidanje obara politiku
      sa `42501`.
- [ ] Bez postavljenog `app.user_id` obje tabele vraćaju **nula** redova.
- [ ] `copilot_system` **nema nijedan** pristup `practice_membership_roles`.
- [ ] **Nijedna od tih politika nije kreirana u paketu `013`** — paket `002` je konačni vlasnik.
- [ ] `platformRoles[]` u `GET /me` sadrži isključivo dodjele sa `revoked_at IS NULL`.
- [ ] **Nijedan revoke endpoint, permisija ni write grant nije uveden.**
- [ ] `02` §17.3 **nije** premješten u ovu fazu.

## `practice_settings` u Fazi 3 — D-049

Normativno: `02` §6.4, §20.2b; `03` §5.1 i §10; D-049, klauzule 1–4 i 7.

- [ ] Paket `002` kreira **kompletnu** prihvaćenu `practice_settings` schemu.
- [ ] `version` i `check (version >= 1)` postoje (D-029, nepromijenjeno).
- [ ] `updated_by` postoji.
- [ ] **Oba** approval flaga postoje, sa defaultom `false`.
- [ ] `copilot_app` ima **tačno** `SELECT (practice_id, allow_mpa_approval,
      allow_billing_specialist_approval)`.
- [ ] **Nema table-level `SELECT`** nad `practice_settings`.
- [ ] `SELECT *` pada sa `42501`.
- [ ] Svaka nedozvoljena kolona pada sa `42501`, **i kada se koristi samo u `WHERE`**.
- [ ] Svaka nedozvoljena kolona pada sa `42501`, **i kada se koristi samo u `ORDER BY`**.
- [ ] `INSERT`, `UPDATE` i `DELETE` padaju sa `42501`.
- [ ] `copilot_system` nema nijedan grant; `PUBLIC` nema nijedan grant.
- [ ] **`GET /api/v1/practices/{practiceId}/settings` NIJE registrovan.**
- [ ] **`PATCH /api/v1/practices/{practiceId}/settings` NIJE registrovan.**
- [ ] **Nijedna RLS politika nad `practice_settings`** nije kreirana u paketu `002`.
- [ ] Uslovne permisije u `GET /me` tačne su za **oba** stanja **oba** flaga.
- [ ] Izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` je
      **eksplicitno dokumentovana i testom potvrđena**, ne umanjena.

## `FORCE RLS` maintenance protokol — D-048

Normativno: `02` §20.4, §23.4 i §25.1.2; D-048, klauzule 1–6.

- [ ] Allowlist faze 3 je **tačno**: `users`, `practices`, `practice_membership_roles`,
      `platform_role_assignments`.
- [ ] `practice_memberships` i `practice_settings` **nisu** na allowlisti.
- [ ] Seed DML nad allowlistanom tabelom ide **isključivo** kroz protokol iz `02` §23.4.
- [ ] Protokol se izvršava u **jednoj eksplicitnoj transakciji**; autocommit nije korišten.
- [ ] Koristi se `NO FORCE ROW LEVEL SECURITY`, **nikada** `DISABLE ROW LEVEL SECURITY`.
- [ ] RLS ostaje `ENABLED` kroz cijeli prozor.
- [ ] Asercija prije DML-a: `relrowsecurity = true`, `relforcerowsecurity = false`.
- [ ] Asercija prije `COMMIT`-a: `relrowsecurity = true`, `relforcerowsecurity = true`.
- [ ] Neuspjela restore asercija **podiže izuzetak i abortira transakciju**.
- [ ] **Prekinut ili neuspio seed ne ostavlja `FORCE` isključenim** — dokazano testom.
- [ ] Unutar prozora se ne izvršava nijedan nepovezani sigurnosni DDL.
- [ ] Nijedna rola nema `BYPASSRLS`.
- [ ] Nijedna `SECURITY DEFINER` funkcija nije uvedena.
- [ ] Nijedan superuser seed credential nije uveden.
- [ ] Nijedna trajna `copilot_migrator` RLS politika nije kreirana.
- [ ] Mehanizam **nije dohvatljiv** iz request/runtime aplikacijskih putanja.
- [ ] Steady-state `relrowsecurity = true` i `relforcerowsecurity = true` provjereni **nakon
      migracije i nakon seeda**, kao trajni regresijski test.

## Autorstvo migracije — D-050

Normativno: `02` §26.3; `10` §7; D-050, klauzule 1–4.

- [ ] Migracija `002` autorisana je kroz `prisma migrate diff --from-config-datasource
      --to-schema=prisma/schema.prisma --script -o ...`.
- [ ] **`prisma migrate dev --create-only` nije korišten.**
- [ ] **`prisma db push` nije korišten.**
- [ ] Custom SQL — constrainti, grants, revokes, RLS, politike, funkcije, asercije, komentari — je
      ručno dopunjen.
- [ ] Kompletan generisani **i** ručno napisani SQL je prošao ljudski pregled.
- [ ] Kompletan migration lanac validiran je na **jednokratnoj, ispravno bootstrapovanoj praznoj
      bazi**.
- [ ] Primjena je izvršena kroz `prisma migrate deploy`.
- [ ] Schema, vlasništvo, privilegije i sigurnosni objekti su **mehanički verifikovani**.
- [ ] **Nijedan guard migracije `001` nije oslabljen.**
- [ ] Očekivani `migrate diff` drift iz `02` §26.2 nije "ispravljen".

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
- [ ] Svaka ćelija je jedno od: `ALLOW`, `DENY`, `CONDITIONAL`. Vrijednost `BLOCKED — D-OPEN-011`
      je **povučena** (D-047) i nijedna ćelija je više ne nosi.
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

Normativno: D-033, D-038, **D-049** i **D-051**; `02` §16.2, §17.0, §17.3, §18.1, §20.2, §20.2b i
§22.13; `03` §3.7, §5, §10 i §28.5; `04` §6.2, §6.4.1 i §6.4.2; `07` Faza 4.

Vlasnik migration paketa za preostale RLS stavke ove faze: **`013_rls_policies`**. Schema objekti
ostaju u `002_identity_and_practices` (Faza 3). Ne uvodi se novi broj paketa.

**Sužen obuhvat nakon D-051.** `02` §17.2 i §17.4 **više nisu u ovoj fazi** — konačni su u paketu
`002` i Fazi 3. Ova faza zadržava `02` §17.3, `practice_settings` RLS i runtime put (D-049),
`set_request_context`, uspostavu `app.practice_id`, `PracticeContextGuard`, `TenantDatabaseService`
i preostale tenant tabele (`02` §17.0).

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
- [ ] Proširena čitljiva površina koju settings endpoint zahtijeva.
- [ ] **Ograničen `UPDATE` grant — uveden zajedno sa politikom koja ga ograničava.**
- [ ] **Phase gate pada ako `UPDATE` grant postoji bez pripadajuće tenant politike.**
- [ ] `GET /api/v1/practices/{practiceId}/settings` registrovan.
- [ ] `PATCH /api/v1/practices/{practiceId}/settings` registrovan.
- [ ] `ETag` vraćen na oba odgovora.
- [ ] `If-Match` obavezan na `PATCH`.
- [ ] `428 PRECONDITION_REQUIRED` bez `If-Match`.
- [ ] `409 VERSION_CONFLICT` na stale `If-Match`.
- [ ] `version` se inkrementira **atomično**.
- [ ] `practice.settings.read` i `practice.settings.manage` ostaju **`PRACTICE_ADMIN` only**
      (D-044, nepromijenjeno; `15`).
- [ ] Izloženost `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE` je
      **zatvorena** — regresijski test dokazuje da `copilot_app` više ne vidi redove izvan tekućeg
      tenanta.
- [ ] `copilot_system` **nema** nijedan grant; `PUBLIC` **nema** nijedan grant.

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

# 10 — Local Development Runbook

**Cilj:** Pouzdano pokretanje lokalnog backend okruženja bez preskakanja sigurnosnog database setupa.

---

# 1. Prerequisites

- Git;
- Docker Desktop;
- Node.js LTS zaključan projektom;
- Corepack;
- pnpm zaključan projektom;
- Cursor/VS Code;
- opcionalno DBeaver.

Provjera:

```powershell
git --version
node --version
corepack --version
pnpm --version
docker --version
docker compose version
```

---

# 2. Clone/open

```powershell
git clone <repository-url>
cd axenita-billing-copilot
cursor .
```

Provjeri:

```powershell
git status
```

---

# 3. Environment

Kopirati:

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
```

Ne commitovati `.env`.

Lokalne vrijednosti moraju jasno biti development-only.

Obavezno razdvojiti:

```dotenv
DATABASE_URL=postgresql://copilot_app:...@localhost:5432/copilot
MIGRATION_DATABASE_URL=postgresql://copilot_migrator:...@localhost:5432/copilot
TEST_DATABASE_URL=postgresql://...@localhost:5433/copilot_test
```

---

# 4. Dependencies

```powershell
corepack enable
pnpm install --frozen-lockfile
```

Ako je prvi bootstrap prije lockfilea:

```powershell
pnpm install
```

Nakon toga lockfile commitovati.

---

# 5. Docker

Validacija:

```powershell
docker compose config
```

Pokretanje:

```powershell
docker compose up -d postgres redis minio
docker compose ps
```

Logovi:

```powershell
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f minio
```

MinIO console:

```text
http://localhost:9001
```

---

# 6. Database role bootstrap

Init SQL se izvršava samo na novom volumeu.

Provjera role:

```powershell
docker exec -it copilot-postgres psql -U copilot_migrator -d copilot
```

SQL:

```sql
\du
select rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
from pg_roles
where rolname in ('copilot_migrator','copilot_app');
```

Ako init script nije izvršen zbog postojećeg volumea, ne raditi automatski `down -v`. Prvo provjeriti podatke i koristiti kontrolisani bootstrap script.

---

# 7. Prisma

Iz `apps/api` ili root scripts:

```powershell
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm db:migrate:status
```

## 7.1 Kanonski tok autorstva migracije (D-050)

**Normativno: D-050; `02` §26.3.** `prisma migrate dev --create-only` **nije** kanonski mehanizam
autorstva za ovaj repozitorij: kreira i zahtijeva shadow bazu čije je podrazumijevano vlasništvo i
privilegije nad `public` schemom strukturno nespojivo sa namjernim guardovima migracije `001`.

**Nijedan guard migracije `001` se ne smije oslabiti** da bi shadow baza radila.

Korak 1 — izvorno stanje je **ispravno bootstrapovana tekuća kanonska migration baza**:

```powershell
pnpm db:migrate:status
```

Korak 2 — generisati inkrementalni SQL kandidat.

Kanonska sirova Prisma komanda (D-050):

```powershell
npx prisma migrate diff `
  --from-config-datasource `
  --to-schema=prisma/schema.prisma `
  --script `
  -o prisma/migrations/<timestamp>_<package>/migration.sql
```

Repozitorijska skripta `db:migrate:diff` je isključivo convenience wrapper oko **iste** D-050
semantike — ne uvodi i ne mijenja nijedno pravilo autorstva. Tačne, dokazano radne invokacije:

Iz root-a repozitorija:

```powershell
pnpm db:migrate:diff -o prisma/migrations/<timestamp>_<package>/migration.sql
```

Iz `apps/api`:

```powershell
pnpm run db:migrate:diff -o prisma/migrations/<timestamp>_<package>/migration.sql
```

**NE koristiti** oblik sa literalnim separatorom:

```text
pnpm db:migrate:diff -- -o prisma/migrations/<timestamp>_<package>/migration.sql
pnpm run db:migrate:diff -- -o prisma/migrations/<timestamp>_<package>/migration.sql
```

Razlog: sa pnpm 11 literalni `--` se **prosljeđuje Prismi**; Prisma tada tretira naredni `-o` kao
pozicioni/ignorisani ulaz, ispisuje SQL na stdout, **ne kreira izlazni fajl** i pri tome može
završiti sa exit kodom `0`. Otkaz je dakle **tih** — nema poruke o grešci i nema nenultog exit
koda, pa se postojanje generisanog `migration.sql` fajla mora provjeriti eksplicitno prije
prelaska na Korak 3.

Korak 3 — ručno dopuniti custom SQL koji Prisma ne izražava: constrainti, grants, revokes, RLS,
politike, funkcije, sigurnosne asercije, komentari.

Korak 4 — **ljudski pregled** kompletnog generisanog **i** ručno napisanog SQL-a.

Korak 5 — validirati kompletan lanac na **jednokratnoj, ispravno bootstrapovanoj praznoj bazi**.

Korak 6 — primijeniti:

```powershell
pnpm db:migrate:deploy
```

Korak 7 — mehanički verifikovati schemu, vlasništvo, privilegije i sigurnosne objekte
(`08` §5, §5.1).

Normativno:

- izlaz `migrate diff` je **kandidat, ne istina**;
- primijenjene migracije ostaju **immutable**;
- `prisma migrate deploy` ostaje kanonski put primjene i deploymenta;
- `--from-empty` **nije** normalni izvor inkrementalnog autorstva;
- `--from-migrations` je neprikladan jer zahtijeva shadow bazu.

Zabranjeno:

```text
prisma db push
prisma migrate dev --create-only   # kao mehanizam autorstva (D-050)
```

Usklađivanje `package.json` skripti sa D-050 je izvedeno: ranija skripta `db:migrate:dev`
(`prisma migrate dev`) **više ne postoji** ni u root-u ni u `apps/api`, a zamijenila ju je
`db:migrate:diff` opisana u Koraku 2. `prisma migrate dev` nema skriptu jer nije dozvoljen
mehanizam autorstva.

---

# 8. Seed

```powershell
pnpm db:seed
```

Ponoviti komandu da se dokaže idempotency.

Provjera:

```sql
select code, name from practices;
select auth_subject, display_name from users;
select practice_id, user_id, role, active from practice_memberships;
```

**`FORCE RLS` maintenance (D-048; `02` §23.4).** Seed upisuje i u tabele koje već nose
`FORCE ROW LEVEL SECURITY`, gdje i vlasnik tabele podliježe politikama. Takav upis ide isključivo
kroz jednu eksplicitnu transakciju: `BEGIN` → provjera allowliste → `NO FORCE` → asercija →
pouzdani DML → `FORCE` → asercija → `COMMIT`. Allowlist faze 3 je `users`, `practices`,
`practice_membership_roles`, `platform_role_assignments`.

**`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`, `BYPASSRLS`, `SECURITY DEFINER` i superuser seed
credential su zabranjeni.** Provjera steady statea nakon seeda:

```sql
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'users','practices','practice_membership_roles','platform_role_assignments'
  );
```

Obje zastavice moraju biti `true` za sve četiri tabele.

---

# 9. API

Development:

```powershell
pnpm dev:api
```

Health:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health/live
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
```

Swagger development:

```text
http://localhost:3001/api/docs
```

---

# 10. Worker

Kada se uvede:

```powershell
pnpm dev:worker
```

Ako API i worker rade u istom procesu u ranoj fazi, to mora biti dokumentovano. Prije pilota preporučeno je odvojeno process mode.

---

# 11. Testovi

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:rls
pnpm test:e2e
pnpm build
```

Test infra:

```powershell
docker compose --profile test up -d
```

Nikada ne koristiti development DB za destructive integration test.

---

# 12. OpenAPI

```powershell
pnpm api:openapi:generate
pnpm api:openapi:validate
```

Output:

```text
docs/api/openapi-v1.json
```

---

# 13. Tipičan dnevni workflow

```powershell
git pull
git status
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:migrate:status
pnpm db:migrate:deploy   # samo ako lokalni branch ima nove već kreirane migracije
pnpm dev:api
```

Za vlastitu novu schema promjenu koristiti **kanonski tok autorstva iz §7.1** (D-050):
`prisma migrate diff` → ručna dopuna → ljudski pregled → validacija na jednokratnoj praznoj bazi →
`prisma migrate deploy`. **`prisma migrate dev --create-only` se ne koristi.**

---

# 14. Kreiranje branch faze

```powershell
git switch main
git pull
git switch -c backend/05-encounters-documents
```

Nakon implementacije:

```powershell
git status
git diff --stat
git diff
pnpm lint
pnpm typecheck
pnpm test
git add .
git commit -m "feat(encounters): add patient references encounters and secure documents"
```

---

# 15. Safe local reset

Destruktivno. Samo ako je potvrđeno da nema potrebnih podataka.

Prvo:

```powershell
docker compose ps
docker volume ls
```

Preferred test/dev reset kroz Prisma/test scripts, ne globalno brisanje.

Komanda `docker compose down -v` je zabranjena bez eksplicitne potvrde jer briše volume.

---

# 16. Backup lokalne baze

```powershell
docker exec copilot-postgres pg_dump \
  -U copilot_migrator \
  -d copilot \
  -Fc \
  -f /tmp/copilot.dump

docker cp copilot-postgres:/tmp/copilot.dump ./backups/copilot.dump
```

PowerShell line continuation prilagoditi okruženju.

---

# 17. Restore test

Kreirati novu izolovanu bazu:

```sql
create database copilot_restore_test;
```

Restore:

```powershell
pg_restore --clean --if-exists --no-owner \
  --dbname=<restore-test-url> \
  backups/copilot.dump
```

Zatim:

- migration status;
- count smoke;
- RLS smoke;
- API connection sa test configom.

---

# 18. Troubleshooting

## PostgreSQL port occupied

```powershell
Get-NetTCPConnection -LocalPort 5432
```

Promijeniti lokalni port, ne container internal port.

## Role missing

Provjeriti je li volume već postojao prije init skripte.

## Prisma permission denied

Provjeriti koristi li CLI `MIGRATION_DATABASE_URL`.

## API query returns zero rows

Provjeriti:

- X-Practice-ID;
- active membership;
- TenantDatabaseService;
- context unutar iste transakcije.

## RLS unexpectedly bypassed

Provjeriti:

- current_user;
- table owner;
- BYPASSRLS;
- FORCE RLS;
- test ne koristi migrator.

## Queue ne radi

Provjeriti:

```powershell
docker compose logs redis
```

i outbox unpublished redove.

## MinIO bucket ne postoji

Pokrenuti bucket bootstrap script; ne praviti public bucket.

---

# 19. Sigurnosne provjere prije commit-a

- nema `.env`;
- nema credentiala;
- nema realnog medicinskog teksta u fixtureu;
- nema dump fajla;
- nema upload artefakta;
- nema generated secret;
- nema debug loga sa tokenom.

```powershell
git status --ignored
git diff --check
```

---

# 20. Preporučeni root scripts

```json
{
  "scripts": {
    "dev:api": "...",
    "dev:worker": "...",
    "build": "...",
    "lint": "...",
    "typecheck": "...",
    "test": "...",
    "test:integration": "...",
    "test:rls": "...",
    "test:e2e": "...",
    "db:format": "...",
    "db:validate": "...",
    "db:generate": "...",
    "db:migrate:diff": "...",
    "db:migrate:deploy": "...",
    "db:migrate:status": "...",
    "db:seed": "...",
    "api:openapi:generate": "...",
    "api:openapi:validate": "..."
  }
}
```

# Controlled role bootstrap for an existing database volume

`infra/database/init` is replayed by the PostgreSQL entrypoint **only when the data volume is
empty**. A database created before phase 2 therefore has no `copilot_migrator`, `copilot_app`
or `copilot_system` role.

`10_LOCAL_DEVELOPMENT_RUNBOOK.md` §6 is explicit about the remedy:

> Ako init script nije izvršen zbog postojećeg volumea, ne raditi automatski `down -v`.
> Prvo provjeriti podatke i koristiti kontrolisani bootstrap script.

`docker compose down -v` remains forbidden without explicit owner approval (`AGENTS.md` §12).

---

## 1. Confirm the volume holds nothing you need

```powershell
docker exec copilot-postgres psql -U <current-superuser> -d copilot -tAc `
  "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');"
```

Proceed only when this returns `0`, or when you have separately confirmed that the existing
content is expendable.

## 2. If the legacy cluster superuser is named `copilot_migrator`

Phase 1 created the container with `POSTGRES_USER=copilot_migrator`, which made that name the
cluster **superuser**. `02_DATABASE_SCHEMA_V1.md` §3.1 requires `copilot_migrator` to be
`NOSUPERUSER`, and a superuser bypasses every grant and every RLS policy — so every
privilege-separation test would be meaningless while this holds.

**This state cannot be repaired in place.** Both repair paths were attempted against the local
volume and both are rejected by PostgreSQL 16, because the cluster's only superuser is also the
only role that could perform the change:

```text
ALTER ROLE copilot_migrator RENAME TO postgres;
  ERROR:  session user cannot be renamed

ALTER ROLE copilot_migrator NOSUPERUSER;
  ERROR:  permission denied to alter role
  DETAIL: The bootstrap user must have the SUPERUSER attribute.
```

A second superuser could in principle be created to perform the rename, but that leaves a
permanent extra superuser in the cluster, which `02` §3.1 does not sanction. For a **local
development** volume the supported remedy is therefore to re-initialise that volume so the
entrypoint replays `infra/database/init` with the correct bootstrap identity:

1. complete step 1 above and record the result — proceed only at `0` business tables;
2. `docker compose stop postgres` (or `postgres-test`);
3. remove **only** the named data volume of that service, e.g.
   `docker volume rm arztpraxis_copilot-postgres-data`. Never `docker compose down -v`: that
   would also destroy the Redis and MinIO volumes, and `AGENTS.md` §12 forbids it without
   explicit approval;
4. `docker compose up -d postgres` — the entrypoint now creates the cluster as `postgres` and
   runs `00_apply_roles.sh`.

Steps 3–4 above are a **local-only** procedure. For any shared or non-local database the state
is a change-managed incident: it needs an approved change procedure, not a volume deletion.

## 3. Apply the canonical role SQL

Run the exact same file the entrypoint uses, as the cluster bootstrap superuser:

```powershell
docker exec -e PGPASSWORD=$env:POSTGRES_PASSWORD copilot-postgres `
  psql -U postgres -d copilot --no-password -v ON_ERROR_STOP=1 `
       -v migrator_password=$env:COPILOT_MIGRATOR_PASSWORD `
       -v app_password=$env:COPILOT_APP_PASSWORD `
       -v system_password=$env:COPILOT_SYSTEM_PASSWORD `
       -f /docker-entrypoint-initdb.d/roles_and_privileges.psql
```

The file is idempotent: it creates each missing role, then re-asserts the exact attribute set
and the ownership/grant model on every run.

## 4. Verify

```sql
select rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin, rolbypassrls
from pg_roles
where rolname in ('copilot_migrator','copilot_app','copilot_system')
order by rolname;
```

Expected:

| rolname            | super | createdb | createrole | inherit | canlogin | bypassrls |
| ------------------ | ----- | -------- | ---------- | ------- | -------- | --------- |
| `copilot_app`      | f     | f        | f          | f       | t        | f         |
| `copilot_migrator` | f     | t        | f          | t       | t        | f         |
| `copilot_system`   | f     | f        | f          | f       | t        | f         |

Then run the migration, which re-verifies the same invariants and fails when they do not hold:

```powershell
pnpm db:migrate:deploy
pnpm db:migrate:status
```

## Rules

- never place a password literal in this repository;
- never run this against a non-local database without an approved change procedure;
- no `DROP DATABASE`, no `TRUNCATE`, no volume deletion.

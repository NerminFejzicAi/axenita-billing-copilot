# infra/database/init

SQL executed by the PostgreSQL container entrypoint **only when the data volume is empty**
(`compose.yaml` mounts this directory at `/docker-entrypoint-initdb.d`).

## Contents

| File                        | Role                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `00_apply_roles.sh`         | entrypoint hook; binds the role passwords from the container environment and runs the SQL below as the cluster bootstrap superuser |
| `roles_and_privileges.psql` | the actual statements. `.psql`, not `.sql`, so the entrypoint does not execute it a second time without its variables              |

## What phase 2 provisions here

Migration package `001_extensions_and_roles` (`02_DATABASE_SCHEMA_V1.md` §22.1) owns the
three database roles and the credential mapping of §3.4:

| Role               | Attributes (02 §3.1–§3.3)                                         | Credential               |
| ------------------ | ----------------------------------------------------------------- | ------------------------ |
| `copilot_migrator` | `LOGIN NOSUPERUSER CREATEDB NOCREATEROLE INHERIT`                 | `MIGRATION_DATABASE_URL` |
| `copilot_app`      | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` | `DATABASE_URL`           |
| `copilot_system`   | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` | `SYSTEM_DATABASE_URL`    |

It also sets database and `public` schema ownership to `copilot_migrator`, revokes everything
from `PUBLIC`, and grants only `CONNECT` plus schema `USAGE` to the two runtime roles. No
`DEFAULT PRIVILEGES` are configured: each migration package grants its own tables explicitly
(§20), so a future table cannot become readable merely by existing.

**No PostgreSQL extension is installed.** §22.1 states none is currently required —
application code generates every UUID before `INSERT` (§2.2). The `extensions` part of the
package name is retained as a stable historical label.

## Why role creation is not a Prisma migration

Role creation cannot run inside a Prisma migration:

1. `copilot_migrator` must already exist before any migration runs, because the migration
   tooling connects as that role (§3.4);
2. `copilot_migrator` is `NOCREATEROLE` (§3.1) and therefore cannot create the other roles;
3. `ALTER DATABASE`/`ALTER SCHEMA ... OWNER` requires the bootstrap superuser.

The bootstrap superuser performs the creation — this is the "runtime role init SQL" of
`04_BACKEND_IMPLEMENTATION_PLAN_V1.md` §4.4 step 4 and the "kontrolisani bootstrap script" of
`10_LOCAL_DEVELOPMENT_RUNBOOK.md` §6. The Prisma migration for package `001` then **verifies**
the resulting state and fails the deploy when anything is missing or over-privileged, so the
package still owns the contract. `08_TEST_STRATEGY_V1.md` §5.1 requires exactly that: the
presence check must be explicit rather than inferred from a successful migration.

## Existing volumes

Because this directory is replayed only on an _empty_ volume, a database created before
phase 2 will not have the roles. Do **not** run `docker compose down -v` to work around
that — it is forbidden without explicit owner approval (`AGENTS.md` §12, `10` §15). Use the
controlled procedure in `infra/database/scripts/bootstrap-roles.md` instead.

## Rules

- no credentials committed here — passwords arrive as environment variables;
- no `DROP`/`TRUNCATE` statements;
- every security-relevant statement carries a comment explaining the invariant (`12` §15).

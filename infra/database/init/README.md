# infra/database/init

SQL executed by the PostgreSQL container entrypoint **only when the data volume is empty**
(`compose.yaml` mounts this directory at `/docker-entrypoint-initdb.d`).

## Phase 1 state

Intentionally empty. Phase 1 provisions the container and its owner/migration superuser
(`POSTGRES_USER`, default `copilot_migrator`) and nothing else. No business schema, no roles
beyond the container superuser, no seed data (04 §3.4).

## Phase 2 ownership

Creating the runtime role `copilot_app` (`LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
`NOBYPASSRLS`, not an object owner) and its grants belongs to **phase 2**
(04 §4.4 step 4, 00 §6.1, D-005).

> **Operational warning.** Because this directory is only replayed on an _empty_ volume, a
> volume created during phase 1 will **not** pick up SQL added later. Do not run
> `docker compose down -v` to work around this — that command is forbidden without explicit
> owner approval (AGENTS.md §12, 10 §15). Phase 2 must apply role bootstrap through a
> controlled script executed against the existing database (10 §6).

## Rules

- no credentials committed here — passwords come from environment variables;
- no `DROP`/`TRUNCATE` statements;
- every security-relevant statement carries a comment explaining the invariant (12 §15).

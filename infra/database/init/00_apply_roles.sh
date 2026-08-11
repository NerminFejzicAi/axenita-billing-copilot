#!/bin/sh
# =============================================================================
# PostgreSQL entrypoint hook — applies the phase 2 role bootstrap.
#
# Runs as the cluster bootstrap superuser, and only when the data volume is empty
# (10 §6). The SQL itself lives in `roles_and_privileges.psql` so that the exact same
# statements can be replayed against an existing volume through the controlled script
# described in `infra/database/scripts/bootstrap-roles.md`.
#
# The `.psql` extension is deliberate: the PostgreSQL entrypoint only auto-executes
# `*.sql` and `*.sh`, so the script below is the single execution path and the psql
# variables it needs are always bound.
#
# The passwords are read from the container environment and passed to psql as
# variables. They are never written to a file and never echoed.
# =============================================================================
set -eu

: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${COPILOT_MIGRATOR_PASSWORD:?COPILOT_MIGRATOR_PASSWORD must be set}"
: "${COPILOT_APP_PASSWORD:?COPILOT_APP_PASSWORD must be set}"
: "${COPILOT_SYSTEM_PASSWORD:?COPILOT_SYSTEM_PASSWORD must be set}"

echo "[init] applying phase 2 database roles and privileges to ${POSTGRES_DB}"

psql \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --no-password \
  --quiet \
  --set ON_ERROR_STOP=1 \
  --set "migrator_password=${COPILOT_MIGRATOR_PASSWORD}" \
  --set "app_password=${COPILOT_APP_PASSWORD}" \
  --set "system_password=${COPILOT_SYSTEM_PASSWORD}" \
  --file /docker-entrypoint-initdb.d/roles_and_privileges.psql

echo "[init] phase 2 database roles applied"

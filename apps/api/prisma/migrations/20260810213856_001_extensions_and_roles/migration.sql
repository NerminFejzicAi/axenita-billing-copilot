-- =============================================================================
-- Migration package 001_extensions_and_roles
-- Normative source: 02_DATABASE_SCHEMA_V1.md §22.1, §3.1–§3.5, §20; D-005, D-023.
-- =============================================================================
--
-- EXTENSIONS
--
-- None. §22.1 states that no PostgreSQL extension is currently required: the application
-- generates every UUID before INSERT (§2.2, §26.1), so `gen_random_uuid()` is never used
-- as a column default. The `extensions` part of the package name is retained as a stable
-- historical label; any future extension needs explicit documentation and approval.
--
-- ROLES
--
-- The three roles of §3.1–§3.3 are created by the cluster bootstrap superuser, in
-- `infra/database/init/roles_and_privileges.psql`. They cannot be created here:
--
--   * `copilot_migrator` must already exist for this migration to connect at all, since
--     the CLI authenticates with MIGRATION_DATABASE_URL (§3.4);
--   * `copilot_migrator` is NOCREATEROLE (§3.1) and cannot create the other two;
--   * ALTER DATABASE / ALTER SCHEMA OWNER require the bootstrap superuser.
--
-- This migration therefore OWNS THE CONTRACT by verifying it. 08 §5.1 requires the role
-- presence check to be explicit rather than inferred from a successful migration, and
-- requires assertions on the exact privilege set rather than "at least this". Every check
-- below raises and aborts the migration when the expected state is absent.
--
-- The migration is deliberately side-effect free. It is safe to re-run and it cannot
-- weaken any privilege.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. All three roles exist (D-023 clause 3; 08 §5.1 negative assertion:
--    "a migration that does not create copilot_system must fail the test")
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  missing_role text;
BEGIN
  FOREACH missing_role IN ARRAY ARRAY['copilot_migrator', 'copilot_app', 'copilot_system']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = missing_role) THEN
      RAISE EXCEPTION
        'Database role % is missing. Apply infra/database/init/roles_and_privileges.psql (02 §3, §22.1).',
        missing_role;
    END IF;
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. copilot_migrator attributes — §3.1
--    login, nosuperuser, createdb, nocreaterole, inherit
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'copilot_migrator';

  IF NOT r.rolcanlogin THEN
    RAISE EXCEPTION 'copilot_migrator must be able to log in (02 §3.1).';
  END IF;
  IF r.rolsuper THEN
    RAISE EXCEPTION 'copilot_migrator must be NOSUPERUSER (02 §3.1). A superuser bypasses every grant and every RLS policy.';
  END IF;
  IF NOT r.rolcreatedb THEN
    RAISE EXCEPTION 'copilot_migrator must have CREATEDB (02 §3.1).';
  END IF;
  IF r.rolcreaterole THEN
    RAISE EXCEPTION 'copilot_migrator must be NOCREATEROLE (02 §3.1).';
  END IF;
  IF NOT r.rolinherit THEN
    RAISE EXCEPTION 'copilot_migrator must be INHERIT (02 §3.1).';
  END IF;
  IF r.rolbypassrls THEN
    RAISE EXCEPTION 'copilot_migrator must not have BYPASSRLS (02 §3.5).';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 3. Runtime role attributes — §3.2, §3.3
--    Exact attribute set required by 08 §5.1:
--    canlogin=true, super=false, createdb=false, createrole=false,
--    inherit=false, bypassrls=false
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  runtime_role text;
  r pg_roles%ROWTYPE;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['copilot_app', 'copilot_system']
  LOOP
    SELECT * INTO r FROM pg_roles WHERE rolname = runtime_role;

    IF NOT r.rolcanlogin THEN
      RAISE EXCEPTION '% must be able to log in (02 §3.2, §3.3).', runtime_role;
    END IF;
    IF r.rolsuper THEN
      RAISE EXCEPTION '% must be NOSUPERUSER (02 §3.5).', runtime_role;
    END IF;
    IF r.rolcreatedb THEN
      RAISE EXCEPTION '% must be NOCREATEDB (02 §3.2, §3.3).', runtime_role;
    END IF;
    IF r.rolcreaterole THEN
      RAISE EXCEPTION '% must be NOCREATEROLE (02 §3.2, §3.3).', runtime_role;
    END IF;
    IF r.rolinherit THEN
      RAISE EXCEPTION '% must be NOINHERIT (02 §3.2, §3.3).', runtime_role;
    END IF;
    IF r.rolbypassrls THEN
      RAISE EXCEPTION '% must be NOBYPASSRLS (02 §3.5). Tenant isolation depends on it.', runtime_role;
    END IF;
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- 4. Ownership — §3.5 forbids any runtime role owning anything
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  schema_owner text;
BEGIN
  SELECT pg_get_userbyid(nspowner) INTO schema_owner
  FROM pg_namespace
  WHERE nspname = 'public';

  IF schema_owner <> 'copilot_migrator' THEN
    RAISE EXCEPTION
      'Schema public must be owned by copilot_migrator, found % (02 §3.1, §3.5).',
      schema_owner;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND tableowner IN ('copilot_app', 'copilot_system')
  ) THEN
    RAISE EXCEPTION 'No runtime role may own a table (02 §3.5).';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 5. PUBLIC holds nothing, runtime roles cannot create objects
--    This is what makes the "runtime CREATE TABLE denied" criterion true (05 Faza 2).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF has_schema_privilege('public', 'public', 'CREATE')
     OR has_schema_privilege('public', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'PUBLIC must hold no privilege on schema public (02 §3.5).';
  END IF;

  IF has_schema_privilege('copilot_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'copilot_app must not be able to create objects in schema public (02 §3.5).';
  END IF;

  IF has_schema_privilege('copilot_system', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'copilot_system must not be able to create objects in schema public (02 §3.5).';
  END IF;

  IF NOT has_schema_privilege('copilot_app', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'copilot_app needs USAGE on schema public to resolve granted objects (02 §20).';
  END IF;

  IF NOT has_schema_privilege('copilot_system', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'copilot_system needs USAGE on schema public to resolve granted objects (02 §20).';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 6. No default privileges may pre-grant future tables
--    Every table grant is declared by the package that creates the table (§20), so a
--    future tenant table must never become readable merely by existing.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl acl
    JOIN pg_namespace ns ON ns.oid = acl.defaclnamespace
    WHERE ns.nspname = 'public'
  ) THEN
    RAISE EXCEPTION
      'No DEFAULT PRIVILEGES may exist on schema public: table grants are per package (02 §20).';
  END IF;
END
$$;

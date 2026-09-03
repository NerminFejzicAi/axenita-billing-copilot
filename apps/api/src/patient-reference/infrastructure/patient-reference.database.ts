/**
 * The patient-reference feature adapter — ONE tenant-scoped statement, and nothing else.
 *
 * Normative sources: `03` §11; `09` §4 and §4.2 (`FORCE RLS` is the primary boundary), §18.1
 * threat `T1`; `02` §11 and `013_rls_policies_phase5` (`patient_references_select`); D-054
 * clauses 6–10; D-056 clause 5; D-072 `OD-P5-I4-12` and `OD-P5-I4-13`; D-073.
 *
 * WHERE IT RUNS
 *
 * On the ALREADY-ADMITTED pinned session, through the `TenantDatabaseService` facade. It owns no
 * `PrismaService`, no `PrismaClient` and no connection; it opens no transaction, nests none and
 * starts none in parallel; it establishes no identity and it sets no `app.practice_id`. The only
 * database capability it has is "run this one statement where the authenticated transaction
 * already is".
 *
 * EXACTLY ONE STATEMENT (D-073)
 *
 * There is no existence pre-read, no second query, no cross-tenant discriminator and no
 * count-before-select. Zero rows is ONE outcome with ONE meaning at this layer — "not available
 * to this caller" — and the port deliberately cannot say which of the two causes produced it.
 * A second query that could tell "does not exist" from "belongs to another practice" apart is
 * exactly the existence oracle `09` §18.1 `T1` forbids, and it would be race-prone as well.
 *
 * TWO BARRIERS, AND NEITHER REPLACES THE OTHER
 *
 * The PRIMARY boundary is the database: `patient_references` carries `ENABLE` + `FORCE ROW LEVEL
 * SECURITY`, and `patient_references_select` restricts every row to
 * `practice_id = nullif(current_setting('app.practice_id', true), '')::uuid`. Reached without an
 * established tenant context the predicate is `practice_id = NULL` and the statement returns
 * zero rows for every practice — fail closed. The SECOND barrier is the explicit
 * `practice_id = <admitted>` term written below: the application must be able to STATE which
 * tenant it believes it is reading, exactly as `findConditionalSettings`, `findPracticeSettings`
 * and `updatePracticeSettings` already do. Neither barrier is dropped and neither is weakened.
 *
 * M-1 — THE PROJECTION IS LOAD-BEARING BECAUSE THE GRANT IS NOT
 *
 * `patient_references` carries a TABLE-level `SELECT` grant, so — unlike `users`, `practices`
 * and `practice_settings` — there is no column-level SQLSTATE `42501` backstop against
 * over-projection. `select *` would simply succeed and would hand the caller the external
 * reference hash, the ciphertext, the IV, the authentication tag, every encryption metadata
 * column, the tenant of the row and `updated_at`. The six columns below are therefore named one
 * by one, the row is never spread into a response, and a permanent structural test asserts both.
 */

import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import {
  DuplicateExternalReferenceError,
  EXTERNAL_REFERENCE_UNIQUE_INDEX,
  PATIENT_REFERENCE_EXTERNAL_REFERENCE_LOOKUP_STATEMENT,
  PATIENT_REFERENCE_INSERT_STATEMENT,
  PATIENT_REFERENCE_PSEUDONYM_LOOKUP_STATEMENT,
  PATIENT_REFERENCE_READ_STATEMENT,
  type PatientReferenceInsert,
  type PatientReferenceRow,
} from './patient-reference-database.port.js';

/** `unique_violation` — the ONE SQLSTATE this adapter translates (`04` §7.5a.3). */
const UNIQUE_VIOLATION = '23505';

/**
 * The rendered constraint name of a failed Prisma raw statement.
 *
 * The shipped stack renders a driver failure as, literally:
 *
 *     Raw query failed. Code: `23505`. Message: `duplicate key value violates unique
 *     constraint "patient_references_source_external_ref_key"`
 *
 * The capture group is the constraint name and the quotes are the delimiters, so the pattern
 * matches a POSITION in PostgreSQL's own message format rather than an occurrence of the name
 * anywhere in the text.
 */
const RENDERED_UNIQUE_CONSTRAINT = /duplicate key value violates unique constraint "([^"]*)"/;

/** Narrowing helper: an indexable object, which neither `null` nor a primitive is. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether a driver error is a PostgreSQL `unique_violation` naming a SPECIFIC index.
 *
 * THE SHAPE IS THE ONE THE SHIPPED STACK PRODUCES, re-derived rather than assumed and read at the
 * same positions the accepted `42501` translation already reads. Against Prisma 7.9.1 with
 * `@prisma/adapter-pg` 7.9.1 and `pg` 8.23.0 a raw-statement failure arrives as a
 * `PrismaClientKnownRequestError` whose `code` is Prisma's own `P2010` — never the SQLSTATE — and
 * whose server code sits at `meta.driverAdapterError.cause.originalCode`.
 *
 * BOTH HALVES MUST MATCH. The SQLSTATE is compared for EXACT EQUALITY with `23505`, never
 * pattern-matched as "some five-character code" (Prisma's `P2010` would satisfy such a pattern),
 * and the constraint name is compared for EXACT EQUALITY with the one index this contract maps.
 * A `23505` from `patient_references_pkey`, from `patient_references_tenant_key` or from any
 * future unique index therefore does NOT match and stays an internal failure, exactly as
 * `04` §7.5a.3 requires ("bilo koji drugi `23505` je `500 INTERNAL_ERROR`").
 *
 * A BOUND VALUE CANNOT REACH THE DECISION. Only the FIRST match of the rendered pattern is
 * consulted, and PostgreSQL emits its own `duplicate key value violates unique constraint "..."`
 * segment before any detail; a value crafted to contain that phrase therefore lands strictly
 * after the authoritative one and cannot displace it. The structured position is preferred
 * anyway, and the rendered one exists only so that a driver which stops exposing it still fails
 * CLOSED — into `500`, never into a wrongly reported `409`.
 */
function isDuplicate(error: unknown, constraintName: string): boolean {
  let current: unknown = error;
  let sawUniqueViolation = false;
  let constraint: unknown;

  // The same bounded two-link descent the accepted `42501` translation performs: the adapter's
  // `meta.driverAdapterError.cause`, and a plain `cause` for a driver that reports at the top
  // level. It is bounded so the walk can never become an open-ended search.
  //
  // The SQLSTATE is compared at EVERY level rather than captured once. The outermost error's
  // `code` is Prisma's `P2010`, so remembering the first code seen would remember the wrong one
  // and never look again — the exact mistake the accepted `42501` helper documents.
  for (let depth = 0; depth < 4 && isRecord(current); depth += 1) {
    if (current['originalCode'] === UNIQUE_VIOLATION || current['code'] === UNIQUE_VIOLATION) {
      sawUniqueViolation = true;
    }

    if (typeof current['constraint'] === 'string') {
      constraint = current['constraint'];
    }

    const meta = current['meta'];
    const driverAdapterError = isRecord(meta) ? meta['driverAdapterError'] : undefined;

    current = isRecord(driverAdapterError) ? driverAdapterError['cause'] : current['cause'];
  }

  if (sawUniqueViolation && constraint === constraintName) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return RENDERED_UNIQUE_CONSTRAINT.exec(error.message)?.[1] === constraintName;
}

@Injectable()
export class PatientReferenceDatabase {
  /**
   * The ONE tenant-scoped read of one patient reference.
   *
   * @param tenant the statement surface of an ADMITTED request. `tenant.practiceId` is the value
   *   the pipeline established in `app.practice_id`, so the explicit predicate and the tenant
   *   policy name the same practice by construction; there is no other practice id in scope and
   *   no way for a route input to become one.
   * @param resourceId an ALREADY VALIDATED resource identifier. A malformed one never reaches
   *   this method — the application refuses it first, so that
   *   `MALFORMED_RESOURCE_UUID_DB_READS = 0` holds mechanically rather than by convention.
   * @returns the row, or `undefined` for zero rows — with NO indication of which cause produced
   *   them. At most one row can match: `patient_references` carries `unique (practice_id, id)`
   *   and `id` is the primary key.
   */
  public async findInAdmittedPractice(
    tenant: AdmittedTenantSession,
    resourceId: string,
  ): Promise<PatientReferenceRow | undefined> {
    const rows = await tenant.run<PatientReferenceRow>({
      label: PATIENT_REFERENCE_READ_STATEMENT,
      // SIX COLUMNS, NAMED ONE BY ONE. There is no `select *` here and no widening path: adding
      // a member to this list is a source change a reviewer sees, which is the entire control,
      // because the table grant will not refuse one. `practice_id` appears ONLY in the predicate
      // and is deliberately not projected — the tenant of a row never travels to the caller.
      //
      // `source_system` is an `integration_provider` enum and is cast with an explicit `::text`,
      // exactly as `status`, `role` and `platform_role` already are in the identity adapter. The
      // cast changes no schema and adds no dependency.
      //
      // Both values are BOUND parameters: `Prisma.sql` is the `sql-template-tag` tag, so each
      // interpolation becomes a placeholder and travels out of band. No client string reaches an
      // identifier position, and there is no `Prisma.raw` and no `$queryRawUnsafe` on this path.
      sql: Prisma.sql`
        select
          "id",
          "pseudonym",
          "birth_year"          as "birthYear",
          "sex_code"            as "sexCode",
          "source_system"::text as "sourceSystem",
          "created_at"          as "createdAt"
        from "patient_references"
        where "practice_id" = ${tenant.practiceId}::uuid
          and "id"          = ${resourceId}::uuid
      `,
    });

    return rows[0];
  }

  /**
   * ONE targeted-conflict `INSERT` attempt — the write half of `P5-I4C`.
   *
   * THE CONFLICT TARGET IS THE PSEUDONYM COLUMN LIST, AND NOTHING ELSE
   *
   *     on conflict ("practice_id", "pseudonym") do nothing returning ...
   *
   * Inferred by COLUMN LIST because `patient_references_pseudonym_key` is a named standalone
   * unique INDEX rather than a table-level constraint, so `ON CONFLICT ON CONSTRAINT` is not
   * valid over it (`04` §7.5a.3). An untargeted `ON CONFLICT DO NOTHING` is forbidden and would
   * be actively wrong here: it would swallow a duplicate EXTERNAL REFERENCE as well and report it
   * as a pseudonym collision, so a genuine `409 PATIENT_REFERENCE_ALREADY_EXISTS` would silently
   * become five wasted retries and a `500`.
   *
   * THERE IS NO PRE-READ. Existence is learned from the statement's own outcome and from nothing
   * else (`03` §11, "Nema pre-read oracle-a"): zero rows means the pseudonym collided, a returned
   * row means success, and a duplicate external reference arrives as a driver error. A
   * "does this already exist?" `SELECT` would be both an existence oracle and a race.
   *
   * NO `SAVEPOINT`, NO NESTED TRANSACTION, NO SECOND TRANSACTION. The retry is a fresh candidate
   * for the same statement on the same connection, which is possible precisely because
   * `DO NOTHING` raises nothing and therefore never aborts the transaction (D-054 clause 8).
   *
   * @returns the created row projected to the SAME six public columns the read statement names,
   *   or `undefined` when the candidate pseudonym collided.
   * @throws DuplicateExternalReferenceError for a `23505` naming
   *   `patient_references_source_external_ref_key`. EVERY OTHER ERROR PROPAGATES UNCHANGED,
   *   including every other `23505`, which is how `04` §7.5a.3's "any other 23505 is an internal
   *   failure" is realised: by not catching it.
   */
  public async insertWithCandidatePseudonym(
    tenant: AdmittedTenantSession,
    insert: PatientReferenceInsert,
  ): Promise<PatientReferenceRow | undefined> {
    try {
      const rows = await tenant.run<PatientReferenceRow>({
        label: PATIENT_REFERENCE_INSERT_STATEMENT,
        // NINE COLUMNS WRITTEN, NAMED ONE BY ONE, and the encryption-envelope columns are NOT
        // among them: the envelope write-back is out of `P5-I4C` scope, every one of those
        // columns is nullable, and `patient_references_external_patient_ref_envelope_check`
        // admits the all-absent case — so this is the schema's own supported state and needs no
        // migration.
        //
        // `practice_id` is written from the ADMITTED value, which is also what
        // `patient_references_insert` checks with `WITH CHECK (practice_id = app.practice_id)`.
        // The policy is the primary control and the bound value is the second barrier; a row for
        // another tenant is refused by the database even if this line were ever wrong.
        //
        // The RETURNING list is the SAME six columns as the read, so the `201` body and the
        // `200` body are built from identical material (D-062 part H.1).
        sql: Prisma.sql`
          insert into "patient_references" (
            "id",
            "practice_id",
            "source_system",
            "external_patient_ref_hash",
            "pseudonym",
            "birth_year",
            "sex_code",
            "created_at",
            "updated_at"
          )
          values (
            ${insert.id}::uuid,
            ${insert.practiceId}::uuid,
            ${insert.sourceSystem}::integration_provider,
            ${insert.externalPatientRefHash},
            ${insert.pseudonym},
            ${insert.birthYear},
            ${insert.sexCode},
            ${insert.instant}::timestamptz,
            ${insert.instant}::timestamptz
          )
          on conflict ("practice_id", "pseudonym") do nothing
          returning
            "id",
            "pseudonym",
            "birth_year"          as "birthYear",
            "sex_code"            as "sexCode",
            "source_system"::text as "sourceSystem",
            "created_at"          as "createdAt"
        `,
      });

      return rows[0];
    } catch (error) {
      if (isDuplicate(error, EXTERNAL_REFERENCE_UNIQUE_INDEX)) {
        // Translated into a TYPE, so the application layer can answer `409` without learning the
        // SQLSTATE, the index name or the driver's error shape.
        throw new DuplicateExternalReferenceError();
      }

      throw error;
    }
  }

  /**
   * The SERVICE-LEVEL lookup by canonical pseudonym (`CO-P5-I3-I4-1`; `04` §7.5a.3).
   *
   * PLAIN EQUALITY, and deliberately so: no `LOWER()`, no `citext` and no special collation
   * (`04` §7.5a.3). Case insensitivity is achieved by CANONICALISING THE INPUT to uppercase
   * before it reaches this method, which keeps the comparison index-friendly and keeps the
   * canonicalisation rule in one auditable place instead of inside a database expression.
   *
   * TENANT-SCOPED, exactly like every other statement here: the `patient_references_select`
   * policy is the primary barrier and the explicit `practice_id` term is the second, so a
   * pseudonym belonging to ANOTHER practice is not found — it is not "found and filtered".
   *
   * THERE IS NO HTTP ROUTE FOR THIS. `P5-I4C` implements both lookups at the service level only
   * and registers no route at all (D-072 `OD-P5-I4-14`, D-079 `RULING B`).
   */
  public async findByPseudonymInAdmittedPractice(
    tenant: AdmittedTenantSession,
    canonicalPseudonym: string,
  ): Promise<PatientReferenceRow | undefined> {
    const rows = await tenant.run<PatientReferenceRow>({
      label: PATIENT_REFERENCE_PSEUDONYM_LOOKUP_STATEMENT,
      sql: Prisma.sql`
        select
          "id",
          "pseudonym",
          "birth_year"          as "birthYear",
          "sex_code"            as "sexCode",
          "source_system"::text as "sourceSystem",
          "created_at"          as "createdAt"
        from "patient_references"
        where "practice_id" = ${tenant.practiceId}::uuid
          and "pseudonym"   = ${canonicalPseudonym}
      `,
    });

    // At most one row can match: `patient_references_pseudonym_key` is
    // `unique (practice_id, pseudonym)`.
    return rows[0];
  }

  /**
   * The SERVICE-LEVEL lookup by KEYED external-reference token (`CO-P5-I3-I4-2`; `04` §7.5a.3).
   *
   * IT IS NOT A PLAINTEXT LOOKUP ORACLE. The parameter is the `h1.<64 hex>` token, already
   * derived by the caller from the MANUAL-v1 normalised value, the `patient_external_ref` domain,
   * the ADMITTED practice and `sourceSystem = MANUAL`. The plaintext identifier has no route into
   * this method — there is no parameter for one — so the statement can only ever match a token
   * computed under the current key for the current tenant.
   *
   * The `source_system` predicate is part of the uniqueness key
   * (`unique (practice_id, source_system, external_patient_ref_hash)`) and is bound explicitly, so
   * the lookup and the constraint describe the same identity.
   *
   * THERE IS NO HTTP ROUTE FOR THIS either, for the same reason as above.
   */
  public async findByExternalReferenceInAdmittedPractice(
    tenant: AdmittedTenantSession,
    sourceSystem: string,
    externalPatientRefHash: string,
  ): Promise<PatientReferenceRow | undefined> {
    const rows = await tenant.run<PatientReferenceRow>({
      label: PATIENT_REFERENCE_EXTERNAL_REFERENCE_LOOKUP_STATEMENT,
      sql: Prisma.sql`
        select
          "id",
          "pseudonym",
          "birth_year"          as "birthYear",
          "sex_code"            as "sexCode",
          "source_system"::text as "sourceSystem",
          "created_at"          as "createdAt"
        from "patient_references"
        where "practice_id"               = ${tenant.practiceId}::uuid
          and "source_system"             = ${sourceSystem}::integration_provider
          and "external_patient_ref_hash" = ${externalPatientRefHash}
      `,
    });

    // At most one row can match: `patient_references_source_external_ref_key` is
    // `unique (practice_id, source_system, external_patient_ref_hash)`.
    return rows[0];
  }
}

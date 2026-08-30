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
  PATIENT_REFERENCE_READ_STATEMENT,
  type PatientReferenceRow,
} from './patient-reference-database.port.js';

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
}

/**
 * The encounter-create feature adapter — the only file of the encounter slice holding SQL.
 *
 * Normative sources: `02` §7, §29.2; `03` §12; `09` §4, §18.1 threat `T1`;
 * `013_rls_policies_phase5` (`encounters_insert`, `encounters_select`,
 * `encounter_diagnoses_insert`, `patient_references_select`); D-054 clauses 6–10; D-062 part D.5;
 * D-073; D-085 `OD-D085-9` … `OD-D085-11`.
 *
 * WHERE IT RUNS. On the ALREADY-ADMITTED pinned session, through the `TenantDatabaseService`
 * facade. It owns no client, opens no transaction, nests none, sets no `app.*` value and issues
 * no SAVEPOINT. Every statement below is one `tenant.run` on the one interactive transaction the
 * identity bootstrap opened (`OD-D085-11`).
 *
 * NO EXISTENCE PRE-READ. Neither the patient reference nor the responsible physician is looked up
 * before the INSERT. Both are decided by the composite foreign keys, evaluated by PostgreSQL
 * outside row-level security (the `★` finding of `phase5-responsible-physician-ri.security.ts`),
 * so no session is ever handed a cross-user or cross-tenant read to make that decision.
 *
 * TWO BARRIERS. The tenant policies are the primary boundary; the explicit
 * `practice_id = <admitted>` value written and filtered below is the second. Neither replaces the
 * other.
 */

import { Injectable } from '@nestjs/common';

import {
  Prisma,
  type EncounterStatus as PrismaEncounterStatus,
} from '../../generated/prisma/client.js';

import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { type EncounterStatus } from '../domain/encounter-state-machine.js';
import {
  ENCOUNTER_DIAGNOSIS_INSERT_STATEMENT,
  ENCOUNTER_INSERT_STATEMENT,
  ENCOUNTER_PROJECTION_READ_STATEMENT,
  INITIAL_DIAGNOSIS_REVIEW_STATE,
  INITIAL_DIAGNOSIS_SOURCE,
  RESPONSIBLE_PHYSICIAN_MEMBERSHIP_FK,
  ResponsiblePhysicianNotAssignableError,
  type EncounterDiagnosisInsert,
  type EncounterInsert,
  type EncounterProjectionRow,
} from './encounter-database.port.js';

/**
 * Compile-time equality of two literal unions — `true` only when each is assignable to the other.
 *
 * The tuple wrapping stops the conditional type from distributing over the union, so the check
 * compares the two SETS rather than member by member.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * THE `EncounterStatus` BINDING (D-085 `OD-D085-9`).
 *
 * The domain vocabulary (`encounter-state-machine.ts`, which imports no Prisma) and the generated
 * Prisma `EncounterStatus` (the persisted `encounter_status` enum) must be the SAME set. This
 * declaration only type-checks while that holds: a member added to, removed from or renamed in
 * either side turns the annotation into `false` and fails `tsc` and the build. It lives HERE, at
 * the persistence boundary, so the domain never learns that Prisma exists.
 *
 * The status written by the INSERT below is typed with the domain type and cast to the database
 * enum; this binding is what makes that cast sound.
 */
export const ENCOUNTER_STATUS_BINDING_HOLDS: MutuallyAssignable<
  EncounterStatus,
  PrismaEncounterStatus
> = true;

/** `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * The rendered constraint of a PostgreSQL foreign-key failure. Only the FIRST match is consulted:
 * PostgreSQL's own message precedes any detail, so a bound value cannot displace it.
 */
const RENDERED_FOREIGN_KEY_CONSTRAINT = /violates foreign key constraint "([^"]*)"/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether a driver error is a `23503` naming EXACTLY `constraintName`.
 *
 * The same bounded descent the patient-reference adapter performs for `23505`: Prisma 7.9.1 with
 * `@prisma/adapter-pg` reports a raw-statement failure as `P2010`, with the server code at
 * `meta.driverAdapterError.cause.originalCode`. BOTH halves must match exactly, so the patient
 * reference foreign key, any future foreign key and any other SQLSTATE fail CLOSED into the shared
 * `500` — never into a wrongly reported `422`.
 */
function isForeignKeyViolationOf(error: unknown, constraintName: string): boolean {
  let current: unknown = error;
  let sawForeignKeyViolation = false;
  let constraint: unknown;

  for (let depth = 0; depth < 4 && isRecord(current); depth += 1) {
    if (
      current['originalCode'] === FOREIGN_KEY_VIOLATION ||
      current['code'] === FOREIGN_KEY_VIOLATION
    ) {
      sawForeignKeyViolation = true;
    }

    if (typeof current['constraint'] === 'string') {
      constraint = current['constraint'];
    } else if (constraint === undefined && typeof current['originalMessage'] === 'string') {
      constraint = RENDERED_FOREIGN_KEY_CONSTRAINT.exec(current['originalMessage'])?.[1];
    }

    const meta = current['meta'];
    const driverAdapterError = isRecord(meta) ? meta['driverAdapterError'] : undefined;

    current = isRecord(driverAdapterError) ? driverAdapterError['cause'] : current['cause'];
  }

  if (sawForeignKeyViolation && constraint === constraintName) {
    return true;
  }

  if (!(error instanceof Error) || !error.message.includes(`\`${FOREIGN_KEY_VIOLATION}\``)) {
    return false;
  }

  return RENDERED_FOREIGN_KEY_CONSTRAINT.exec(error.message)?.[1] === constraintName;
}

@Injectable()
export class EncounterDatabase {
  /**
   * The ONE `encounters` INSERT, wrapped in the ONE translating `catch` D-062 part D.5 requires.
   *
   * @throws ResponsiblePhysicianNotAssignableError for a `23503` naming
   *   `encounters_responsible_physician_membership_fk`. EVERY OTHER ERROR PROPAGATES UNCHANGED —
   *   including `encounters_patient_reference_fk`, which therefore becomes the shared static `500`
   *   (D-069 `RULING 2`; `OD-D085-10`).
   */
  public async insertEncounter(
    tenant: AdmittedTenantSession,
    insert: EncounterInsert,
  ): Promise<void> {
    try {
      await tenant.run<{ readonly id: string }>({
        label: ENCOUNTER_INSERT_STATEMENT,
        // SEVENTEEN COLUMNS, NAMED ONE BY ONE. `updated_by` stays NULL (no update has happened),
        // every external-reference and encryption column stays NULL (no field carries one in
        // phase 5, D-062 part H.3), and `version` is bound explicitly rather than left to the
        // column default so the written value is a stated contract.
        sql: Prisma.sql`
          insert into "encounters" (
            "id",
            "practice_id",
            "patient_reference_id",
            "occurred_at",
            "treatment_date",
            "responsible_physician_id",
            "guarantor_type",
            "insurance_context",
            "specialty_code",
            "patient_age_at_encounter",
            "patient_sex_at_encounter",
            "status",
            "source_system",
            "version",
            "created_by",
            "created_at",
            "updated_at"
          )
          values (
            ${insert.id}::uuid,
            ${insert.practiceId}::uuid,
            ${insert.patientReferenceId}::uuid,
            ${insert.occurredAt}::timestamptz,
            ${insert.treatmentDate}::date,
            ${insert.responsiblePhysicianId}::uuid,
            ${insert.guarantorType},
            ${insert.insuranceContext},
            ${insert.specialtyCode},
            ${insert.patientAgeAtEncounter}::smallint,
            ${insert.patientSexAtEncounter},
            ${insert.status}::encounter_status,
            ${insert.sourceSystem}::integration_provider,
            ${insert.version}::integer,
            ${insert.createdBy}::uuid,
            ${insert.instant}::timestamptz,
            ${insert.instant}::timestamptz
          )
          returning "id"
        `,
      });
    } catch (error) {
      if (isForeignKeyViolationOf(error, RESPONSIBLE_PHYSICIAN_MEMBERSHIP_FK)) {
        throw new ResponsiblePhysicianNotAssignableError();
      }

      throw error;
    }
  }

  /**
   * ONE `encounter_diagnoses` INSERT. `review_state = UNREVIEWED`, `source = MANUAL`; neither
   * `description` nor `diagnosis_type` is written (both are refused at the request boundary).
   * No error is translated: a `23505` here would mean the request-level duplicate check failed,
   * which is a defect and therefore the shared `500`.
   */
  public async insertDiagnosis(
    tenant: AdmittedTenantSession,
    insert: EncounterDiagnosisInsert,
  ): Promise<void> {
    await tenant.run<{ readonly id: string }>({
      label: ENCOUNTER_DIAGNOSIS_INSERT_STATEMENT,
      sql: Prisma.sql`
        insert into "encounter_diagnoses" (
          "id",
          "practice_id",
          "encounter_id",
          "coding_system",
          "diagnosis_code",
          "is_primary",
          "source",
          "review_state",
          "created_at"
        )
        values (
          ${insert.id}::uuid,
          ${insert.practiceId}::uuid,
          ${insert.encounterId}::uuid,
          ${insert.codingSystem},
          ${insert.code},
          ${insert.isPrimary},
          ${INITIAL_DIAGNOSIS_SOURCE},
          ${INITIAL_DIAGNOSIS_REVIEW_STATE}::review_state,
          ${insert.instant}::timestamptz
        )
        returning "id"
      `,
    });
  }

  /**
   * The ONE projection read of one encounter and its patient's pseudonym, in the admitted
   * practice. Both the encounter and the patient reference are filtered by the explicit tenant
   * predicate AND by their tenant `SELECT` policies; the join is on the composite
   * `(practice_id, id)` key, so a row of another practice cannot be joined in.
   *
   * @returns the row, or `undefined` for zero rows.
   */
  public async findProjection(
    tenant: AdmittedTenantSession,
    encounterId: string,
  ): Promise<EncounterProjectionRow | undefined> {
    const rows = await tenant.run<EncounterProjectionRow>({
      label: ENCOUNTER_PROJECTION_READ_STATEMENT,
      // EIGHT VALUES, NAMED ONE BY ONE — the closed `201` material and nothing else.
      sql: Prisma.sql`
        select
          e."id",
          e."status"::text                             as "status",
          e."version",
          p."id"                                       as "patientId",
          p."pseudonym"                                as "patientPseudonym",
          e."occurred_at"                              as "occurredAt",
          to_char(e."treatment_date", 'YYYY-MM-DD')    as "treatmentDate",
          e."created_at"                               as "createdAt"
        from "encounters" e
        join "patient_references" p
          on  p."practice_id" = e."practice_id"
          and p."id"          = e."patient_reference_id"
        where e."practice_id" = ${tenant.practiceId}::uuid
          and p."practice_id" = ${tenant.practiceId}::uuid
          and e."id"          = ${encounterId}::uuid
      `,
    });

    return rows[0];
  }
}

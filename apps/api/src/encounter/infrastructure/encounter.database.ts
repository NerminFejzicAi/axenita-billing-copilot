/**
 * The encounter feature adapter (create `P5-I5B`, patch `P5-I5C`) — the only file of the
 * encounter slice holding SQL.
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
  ENCOUNTER_PATCH_STATEMENT,
  ENCOUNTER_PATCHABLE_STATUSES,
  ENCOUNTER_PROJECTION_READ_STATEMENT,
  INITIAL_DIAGNOSIS_REVIEW_STATE,
  INITIAL_DIAGNOSIS_SOURCE,
  RESPONSIBLE_PHYSICIAN_MEMBERSHIP_FK,
  ResponsiblePhysicianNotAssignableError,
  type EncounterDiagnosisInsert,
  type EncounterInsert,
  type EncounterPatchResult,
  type EncounterPatchUpdate,
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

/**
 * The single row of the atomic `PATCH` statement. Every member but `outcome` is `null` unless
 * the statement updated (the `previous*` members are also present for a locked row that was not
 * updated, and are ignored then).
 */
interface EncounterPatchStatementRow {
  readonly outcome: string;
  readonly id: string | null;
  readonly status: string | null;
  readonly version: number | null;
  readonly patientId: string | null;
  readonly patientPseudonym: string | null;
  readonly occurredAt: Date | null;
  readonly treatmentDate: string | null;
  readonly createdAt: Date | null;
  readonly responsiblePhysicianId: string | null;
  readonly guarantorType: string | null;
  readonly insuranceContext: string | null;
  readonly specialtyCode: string | null;
  readonly patientAgeAtEncounter: number | null;
  readonly patientSexAtEncounter: string | null;
  readonly previousOccurredAt: Date | null;
  readonly previousTreatmentDate: string | null;
  readonly previousResponsiblePhysicianId: string | null;
  readonly previousGuarantorType: string | null;
  readonly previousInsuranceContext: string | null;
  readonly previousSpecialtyCode: string | null;
  readonly previousPatientAgeAtEncounter: number | null;
  readonly previousPatientSexAtEncounter: string | null;
  readonly occurredAtChanged: boolean | null;
  readonly treatmentDateChanged: boolean | null;
  readonly responsiblePhysicianIdChanged: boolean | null;
  readonly guarantorTypeChanged: boolean | null;
  readonly insuranceContextChanged: boolean | null;
  readonly specialtyCodeChanged: boolean | null;
  readonly patientAgeAtEncounterChanged: boolean | null;
  readonly patientSexAtEncounterChanged: boolean | null;
}

/**
 * Thrown when the atomic `PATCH` statement returns something its own SQL makes impossible —
 * not exactly one row, an unknown outcome, or an `UPDATED` row missing a NOT NULL member. The
 * message is static and server-side only; the caller receives the shared static `500`.
 */
export class EncounterPatchInvariantError extends Error {
  public constructor() {
    super('The atomic encounter PATCH statement returned an impossible result.');
    this.name = 'EncounterPatchInvariantError';
  }
}

function requireValue<T>(value: T | null): T {
  if (value === null) {
    throw new EncounterPatchInvariantError();
  }

  return value;
}

/** Narrows the statement row into the port result, failing closed on anything impossible. */
function toPatchResult(rows: readonly EncounterPatchStatementRow[]): EncounterPatchResult {
  const [row, ...rest] = rows;

  if (row === undefined || rest.length > 0) {
    throw new EncounterPatchInvariantError();
  }

  switch (row.outcome) {
    case 'VERSION_CONFLICT':
    case 'INVALID_STATE_TRANSITION':
    case 'INCONSISTENT':
      return { outcome: row.outcome };
    case 'UPDATED':
      break;
    default:
      throw new EncounterPatchInvariantError();
  }

  return {
    outcome: 'UPDATED',
    applied: {
      projection: {
        id: requireValue(row.id),
        status: requireValue(row.status),
        version: requireValue(row.version),
        patientId: requireValue(row.patientId),
        patientPseudonym: requireValue(row.patientPseudonym),
        occurredAt: requireValue(row.occurredAt),
        treatmentDate: requireValue(row.treatmentDate),
        createdAt: requireValue(row.createdAt),
      },
      previous: {
        occurredAt: requireValue(row.previousOccurredAt),
        treatmentDate: requireValue(row.previousTreatmentDate),
        responsiblePhysicianId: row.previousResponsiblePhysicianId,
        guarantorType: row.previousGuarantorType,
        insuranceContext: row.previousInsuranceContext,
        specialtyCode: row.previousSpecialtyCode,
        patientAgeAtEncounter: row.previousPatientAgeAtEncounter,
        patientSexAtEncounter: row.previousPatientSexAtEncounter,
      },
      next: {
        occurredAt: requireValue(row.occurredAt),
        treatmentDate: requireValue(row.treatmentDate),
        responsiblePhysicianId: row.responsiblePhysicianId,
        guarantorType: row.guarantorType,
        insuranceContext: row.insuranceContext,
        specialtyCode: row.specialtyCode,
        patientAgeAtEncounter: row.patientAgeAtEncounter,
        patientSexAtEncounter: row.patientSexAtEncounter,
      },
      changed: {
        occurredAt: requireValue(row.occurredAtChanged),
        treatmentDate: requireValue(row.treatmentDateChanged),
        responsiblePhysicianId: requireValue(row.responsiblePhysicianIdChanged),
        guarantorType: requireValue(row.guarantorTypeChanged),
        insuranceContext: requireValue(row.insuranceContextChanged),
        specialtyCode: requireValue(row.specialtyCodeChanged),
        patientAgeAtEncounter: requireValue(row.patientAgeAtEncounterChanged),
        patientSexAtEncounter: requireValue(row.patientSexAtEncounterChanged),
      },
    },
  };
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
   * THE ONE ATOMIC OPTIMISTIC `PATCH` STATEMENT (D-087 `OD-P5-I5C-2`, `-3`, `-4`, `-8`,
   * `RULING I`; D-069 `RULING 2`; D-055 precedent).
   *
   * One SQL statement, three parts, one snapshot and one lock:
   *
   *   `target`   the tenant-visible row, `FOR UPDATE`. Under READ COMMITTED a row changed by a
   *              transaction that committed meanwhile is re-fetched at its LATEST committed
   *              version before it is locked, so every comparison below sees current values. An
   *              invisible (cross-tenant) and a nonexistent row are the same empty set here.
   *   `updated`  the `UPDATE`, joined to `target` and guarded on `version = If-Match` AND
   *              `status IN (DRAFT, READY_FOR_ANALYSIS)`. `version + 1`, the admitted user and the
   *              database clock (`clock_timestamp()`, owner adjudication N-3) are written on EVERY
   *              success, value-no-op included. An absent member keeps its stored value; a
   *              submitted member — `null` included — is written.
   *   outer      the outcome, decided from the LOCKED row and the `UPDATE` result together:
   *                no row, or a different version      -> VERSION_CONFLICT   (stale + CANCELLED too)
   *                updated                              -> UPDATED
   *                matching version, status not patchable -> INVALID_STATE_TRANSITION
   *              plus the old values, the new values, `IS DISTINCT FROM` per member and the closed
   *              projection material — all from this statement, so there is no pre-read and no
   *              post-update read.
   *
   * No CASE ever lets the caller choose a column: the eight assignments are fixed, and each takes
   * a bound "submitted" flag plus a bound value. Columns outside the twelve-column `UPDATE` grant
   * (`patient_reference_id`, `source_system`, the identifiers, `created_*`) are not in the
   * statement at all.
   *
   * @throws ResponsiblePhysicianNotAssignableError for a `23503` naming EXACTLY
   *   `encounters_responsible_physician_membership_fk`. EVERY OTHER ERROR PROPAGATES UNCHANGED —
   *   there is no global `23503 -> 422` rule (`OD-D085-10`).
   */
  public async patchEncounter(
    tenant: AdmittedTenantSession,
    update: EncounterPatchUpdate,
  ): Promise<EncounterPatchResult> {
    const assignments = update.assignments;
    const [firstPatchable, secondPatchable] = ENCOUNTER_PATCHABLE_STATUSES;

    let rows: readonly EncounterPatchStatementRow[];

    try {
      rows = await tenant.run<EncounterPatchStatementRow>({
        label: ENCOUNTER_PATCH_STATEMENT,
        sql: Prisma.sql`
          with "target" as materialized (
            select
              e."id",
              e."status",
              e."version",
              e."occurred_at",
              e."treatment_date",
              e."responsible_physician_id",
              e."guarantor_type",
              e."insurance_context",
              e."specialty_code",
              e."patient_age_at_encounter",
              e."patient_sex_at_encounter"
            from "encounters" e
            where e."practice_id" = ${tenant.practiceId}::uuid
              and e."id"          = ${update.encounterId}::uuid
            for update
          ),
          "updated" as (
            update "encounters" e
            set
              "occurred_at" = case when ${assignments.occurredAt !== undefined}::boolean
                then ${assignments.occurredAt ?? null}::timestamptz
                else e."occurred_at" end,
              "treatment_date" = case when ${assignments.treatmentDate !== undefined}::boolean
                then ${assignments.treatmentDate ?? null}::date
                else e."treatment_date" end,
              "responsible_physician_id" =
                case when ${assignments.responsiblePhysicianId !== undefined}::boolean
                then ${assignments.responsiblePhysicianId ?? null}::uuid
                else e."responsible_physician_id" end,
              "guarantor_type" = case when ${assignments.guarantorType !== undefined}::boolean
                then ${assignments.guarantorType ?? null}::varchar
                else e."guarantor_type" end,
              "insurance_context" = case when ${assignments.insuranceContext !== undefined}::boolean
                then ${assignments.insuranceContext ?? null}::varchar
                else e."insurance_context" end,
              "specialty_code" = case when ${assignments.specialtyCode !== undefined}::boolean
                then ${assignments.specialtyCode ?? null}::varchar
                else e."specialty_code" end,
              "patient_age_at_encounter" =
                case when ${assignments.patientAgeAtEncounter !== undefined}::boolean
                then ${assignments.patientAgeAtEncounter ?? null}::smallint
                else e."patient_age_at_encounter" end,
              "patient_sex_at_encounter" =
                case when ${assignments.patientSexAtEncounter !== undefined}::boolean
                then ${assignments.patientSexAtEncounter ?? null}::varchar
                else e."patient_sex_at_encounter" end,
              "version"    = e."version" + 1,
              "updated_by" = ${update.updatedBy}::uuid,
              "updated_at" = clock_timestamp()
            from "target" t
            where e."practice_id" = ${tenant.practiceId}::uuid
              and e."id"          = t."id"
              and e."version"     = ${update.expectedVersion}::integer
              and e."status" in (
                ${firstPatchable}::encounter_status,
                ${secondPatchable}::encounter_status
              )
            returning
              e."id",
              e."patient_reference_id",
              e."status",
              e."version",
              e."occurred_at",
              e."treatment_date",
              e."responsible_physician_id",
              e."guarantor_type",
              e."insurance_context",
              e."specialty_code",
              e."patient_age_at_encounter",
              e."patient_sex_at_encounter",
              e."created_at"
          )
          select
            case
              when t."id" is null
                or t."version" <> ${update.expectedVersion}::integer then 'VERSION_CONFLICT'
              when u."id" is not null                               then 'UPDATED'
              when t."status" not in (
                ${firstPatchable}::encounter_status,
                ${secondPatchable}::encounter_status
              )                                                     then 'INVALID_STATE_TRANSITION'
              else 'INCONSISTENT'
            end                                                     as "outcome",

            u."id"                                                  as "id",
            u."status"::text                                        as "status",
            u."version"                                             as "version",
            p."id"                                                  as "patientId",
            p."pseudonym"                                           as "patientPseudonym",
            u."occurred_at"                                         as "occurredAt",
            to_char(u."treatment_date", 'YYYY-MM-DD')               as "treatmentDate",
            u."created_at"                                          as "createdAt",
            u."responsible_physician_id"::text                      as "responsiblePhysicianId",
            u."guarantor_type"                                      as "guarantorType",
            u."insurance_context"                                   as "insuranceContext",
            u."specialty_code"                                      as "specialtyCode",
            u."patient_age_at_encounter"::integer                   as "patientAgeAtEncounter",
            u."patient_sex_at_encounter"                            as "patientSexAtEncounter",

            t."occurred_at"                                         as "previousOccurredAt",
            to_char(t."treatment_date", 'YYYY-MM-DD')               as "previousTreatmentDate",
            t."responsible_physician_id"::text                      as "previousResponsiblePhysicianId",
            t."guarantor_type"                                      as "previousGuarantorType",
            t."insurance_context"                                   as "previousInsuranceContext",
            t."specialty_code"                                      as "previousSpecialtyCode",
            t."patient_age_at_encounter"::integer                   as "previousPatientAgeAtEncounter",
            t."patient_sex_at_encounter"                            as "previousPatientSexAtEncounter",

            (t."occurred_at"              is distinct from u."occurred_at")              as "occurredAtChanged",
            (t."treatment_date"           is distinct from u."treatment_date")           as "treatmentDateChanged",
            (t."responsible_physician_id" is distinct from u."responsible_physician_id") as "responsiblePhysicianIdChanged",
            (t."guarantor_type"           is distinct from u."guarantor_type")           as "guarantorTypeChanged",
            (t."insurance_context"        is distinct from u."insurance_context")        as "insuranceContextChanged",
            (t."specialty_code"           is distinct from u."specialty_code")           as "specialtyCodeChanged",
            (t."patient_age_at_encounter" is distinct from u."patient_age_at_encounter") as "patientAgeAtEncounterChanged",
            (t."patient_sex_at_encounter" is distinct from u."patient_sex_at_encounter") as "patientSexAtEncounterChanged"
          from (select 1) as "anchor"
          left join "target" t
            on true
          left join "updated" u
            on u."id" = t."id"
          left join "patient_references" p
            on  p."practice_id" = ${tenant.practiceId}::uuid
            and p."id"          = u."patient_reference_id"
        `,
      });
    } catch (error) {
      if (isForeignKeyViolationOf(error, RESPONSIBLE_PHYSICIAN_MEMBERSHIP_FK)) {
        throw new ResponsiblePhysicianNotAssignableError();
      }

      throw error;
    }

    return toPatchResult(rows);
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

/**
 * The database port of the encounter-create feature — row shapes, statement labels and the one
 * translated constraint.
 *
 * Normative sources: `02` §7 (`encounters`, `encounter_diagnoses`), §29.2; `03` §12; D-062 part D
 * and part H.3; D-073 (feature SQL stays in the feature adapter); D-085 `OD-D085-3`,
 * `OD-D085-10`, `OD-D085-11`.
 *
 * Labels are stable, non-secret source literals. They name WHICH statement ran and never carry a
 * value, so a spec can assert statement ORDER without parsing SQL.
 */

import { type EncounterStatus } from '../domain/encounter-state-machine.js';

export const ENCOUNTER_INSERT_STATEMENT = 'insert encounter';

export const ENCOUNTER_DIAGNOSIS_INSERT_STATEMENT = 'insert encounter_diagnosis';

/**
 * The ONE projection read — used by the original `201` AND by the idempotent replay, so the two
 * bodies are built from identical material and the replay reflects the CURRENT canonical state of
 * the resource (`OD-D085-7`).
 */
export const ENCOUNTER_PROJECTION_READ_STATEMENT = 'select encounter_projection';

/**
 * `encounters_responsible_physician_membership_fk` — the ONLY foreign key whose violation is
 * translated (D-062 part D.5; `OD-D085-10`). Every other `23503`, in particular
 * `encounters_patient_reference_fk`, is NOT translated and stays an internal failure.
 */
export const RESPONSIBLE_PHYSICIAN_MEMBERSHIP_FK = 'encounters_responsible_physician_membership_fk';

/** `encounter_diagnoses.review_state` at creation (D-062 part H.3; `OD-D085-3`). */
export const INITIAL_DIAGNOSIS_REVIEW_STATE = 'UNREVIEWED';

/** `encounter_diagnoses.source` at creation (D-062 part H.3; `OD-D085-3`). */
export const INITIAL_DIAGNOSIS_SOURCE = 'MANUAL';

/** Everything the one `encounters` INSERT writes. */
export interface EncounterInsert {
  /** The application-generated `encounters.id`. */
  readonly id: string;
  /** The ADMITTED practice — the value in `app.practice_id`, never a route input. */
  readonly practiceId: string;
  readonly patientReferenceId: string;
  /** The validated ORIGINAL RFC 3339 string; PostgreSQL resolves the offset. */
  readonly occurredAt: string;
  /** The validated `YYYY-MM-DD` string. */
  readonly treatmentDate: string;
  readonly responsiblePhysicianId: string | null;
  readonly guarantorType: string | null;
  readonly insuranceContext: string | null;
  readonly specialtyCode: string | null;
  readonly patientAgeAtEncounter: number | null;
  readonly patientSexAtEncounter: string | null;
  /** Always `ENCOUNTER_INITIAL_STATUS` — creation is an initialisation, not a transition. */
  readonly status: EncounterStatus;
  readonly sourceSystem: string;
  /** Always `1` (`OD-D085-17`). */
  readonly version: number;
  /** The ADMITTED user — never a caller-supplied identity. */
  readonly createdBy: string;
  /** The single instant of this request: `created_at` AND `updated_at`. */
  readonly instant: Date;
}

/** Everything ONE `encounter_diagnoses` INSERT writes. */
export interface EncounterDiagnosisInsert {
  readonly id: string;
  readonly practiceId: string;
  readonly encounterId: string;
  readonly codingSystem: string;
  readonly code: string;
  readonly isPrimary: boolean;
  readonly instant: Date;
}

/**
 * The projection row — exactly the material of the closed `201` document, and not one column
 * more. `practice_id`, the patient reference's keyed token, every encryption column and every
 * request-only member are absent from the statement as well as from this type.
 */
export interface EncounterProjectionRow {
  readonly id: string;
  readonly status: string;
  readonly version: number;
  readonly patientId: string;
  readonly patientPseudonym: string;
  readonly occurredAt: Date;
  /** Rendered `YYYY-MM-DD` by the statement itself, independent of the session `DateStyle`. */
  readonly treatmentDate: string;
  readonly createdAt: Date;
}

/**
 * The INSERT violated `encounters_responsible_physician_membership_fk`.
 *
 * A TYPE rather than a SQLSTATE, for the reason `DuplicateExternalReferenceError` is one: the
 * application must answer `422` for THIS constraint without learning the SQLSTATE, the driver's
 * error shape or the constraint name, and without a global "23503 means 422" rule. The message is
 * static and server-side only.
 */
export class ResponsiblePhysicianNotAssignableError extends Error {
  public constructor() {
    super(
      'The encounter insert violated encounters_responsible_physician_membership_fk ' +
        '(SQLSTATE 23503).',
    );
    this.name = 'ResponsiblePhysicianNotAssignableError';
  }
}

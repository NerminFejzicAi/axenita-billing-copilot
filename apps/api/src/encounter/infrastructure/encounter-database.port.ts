/**
 * The database port of the encounter feature — create (`P5-I5B`), patch (`P5-I5C`) and cancel
 * (`P5-I5D`): row shapes, statement labels and the one translated constraint.
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
 * The ONE atomic optimistic `PATCH` statement (`P5-I5C`; D-087 `OD-P5-I5C-2`, `RULING I`).
 *
 * It acquires the tenant-visible row under a row lock, evaluates the expected version and the
 * status guard, updates, compares old and new values and returns the projection material — all in
 * one SQL statement. No statement precedes it on the business path and none follows it except the
 * audit insert.
 */
export const ENCOUNTER_PATCH_STATEMENT = 'update encounter';

/**
 * The statuses a `PATCH` may write in (D-087 `OD-P5-I5C-2`). Every other status — `CANCELLED` and
 * `CLOSED` in phase 5 — is refused with `INVALID_STATE_TRANSITION`, but ONLY when the same atomic
 * statement has also seen a tenant-visible row whose version matches `If-Match`.
 *
 * `PATCH` is data-only: it never writes `status`, so this is a guard, not a graph edge, and the
 * `P5-I5A` transition graph is neither consulted nor changed by it.
 */
export const ENCOUNTER_PATCHABLE_STATUSES = [
  'DRAFT',
  'READY_FOR_ANALYSIS',
] as const satisfies readonly EncounterStatus[];

/**
 * The eight `PATCH`-mutable members (D-087 `OD-P5-I5C-5`), each `undefined` when ABSENT —
 * "leave the stored value unchanged". `null` on one of the six nullable members is a submitted
 * request for SQL `NULL`; `occurredAt` and `treatmentDate` are never `null` here.
 */
export interface EncounterPatchAssignments {
  /** The validated ORIGINAL RFC 3339 string; PostgreSQL resolves the offset. */
  readonly occurredAt: string | undefined;
  /** The validated `YYYY-MM-DD` string. */
  readonly treatmentDate: string | undefined;
  readonly responsiblePhysicianId: string | null | undefined;
  readonly guarantorType: string | null | undefined;
  readonly insuranceContext: string | null | undefined;
  readonly specialtyCode: string | null | undefined;
  readonly patientAgeAtEncounter: number | null | undefined;
  readonly patientSexAtEncounter: string | null | undefined;
}

/** Everything the ONE atomic `PATCH` statement is given. */
export interface EncounterPatchUpdate {
  readonly encounterId: string;
  /** The version carried by `If-Match` — the ONLY concurrency precondition. */
  readonly expectedVersion: number;
  /** The ADMITTED user — never a caller-supplied identity. Written to `updated_by`. */
  readonly updatedBy: string;
  readonly assignments: EncounterPatchAssignments;
}

/** The single outcome the atomic statement decided. */
export type EncounterPatchOutcome =
  | 'UPDATED'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  /** Visible, matching and patchable, yet not updated — a broken invariant; fails closed. */
  | 'INCONSISTENT';

/**
 * The stored value of every `PATCH`-mutable member, in its AUDIT representation: `occurredAt` as
 * an instant (rendered UTC `.sssZ` by the application), `treatmentDate` already `YYYY-MM-DD`.
 */
export interface EncounterMutableValues {
  readonly occurredAt: Date;
  readonly treatmentDate: string;
  readonly responsiblePhysicianId: string | null;
  readonly guarantorType: string | null;
  readonly insuranceContext: string | null;
  readonly specialtyCode: string | null;
  readonly patientAgeAtEncounter: number | null;
  readonly patientSexAtEncounter: string | null;
}

/** The names of the eight `PATCH`-mutable members — the API camelCase spelling. */
export type EncounterMutableField = keyof EncounterMutableValues;

/** Everything a SUCCESSFUL `PATCH` statement returns, from the same statement. */
export interface EncounterPatchApplied {
  /** The closed `200` projection material, built from the row the `UPDATE` returned. */
  readonly projection: EncounterProjectionRow;
  /** The values of the locked row BEFORE the update. */
  readonly previous: EncounterMutableValues;
  /** The values the `UPDATE` wrote. */
  readonly next: EncounterMutableValues;
  /** `old IS DISTINCT FROM new`, per member, decided by PostgreSQL in the same statement. */
  readonly changed: Readonly<Record<EncounterMutableField, boolean>>;
}

/** The result of the ONE atomic statement: either the applied update, or why there was none. */
export type EncounterPatchResult =
  | { readonly outcome: 'UPDATED'; readonly applied: EncounterPatchApplied }
  | { readonly outcome: Exclude<EncounterPatchOutcome, 'UPDATED'> };

/**
 * The ONE atomic cancel statement (`P5-I5D`; D-089 `RULING F`).
 *
 * It acquires the tenant-visible row under a row lock, evaluates the source-status guard, writes
 * `CANCELLED` and returns the previous status and version together with the projection material —
 * all in one SQL statement. Apart from the idempotency mechanism, no statement precedes it on the
 * business path and none follows it except the audit insert.
 */
export const ENCOUNTER_CANCEL_STATEMENT = 'update encounter cancel';

/**
 * The phase 5 source statuses of a cancel (D-089 `RULING F`, `RULING H`) — the two currently
 * reachable sources of the canonical `-> CANCELLED` edges. `ANALYSIS_IN_PROGRESS` and
 * `REVIEW_REQUIRED` (and the D-035 cascade they require) stay out of scope until phase 7.
 *
 * A guard over the `P5-I5A` graph, not a change to it: every member is a canonical
 * `-> CANCELLED` edge reachable in phase 5, which the adapter spec proves against the unchanged
 * transition table.
 */
export const ENCOUNTER_CANCELLABLE_STATUSES = [
  'DRAFT',
  'READY_FOR_ANALYSIS',
] as const satisfies readonly EncounterStatus[];

/** The target status of a cancel. */
export const ENCOUNTER_CANCELLED_STATUS = 'CANCELLED' satisfies EncounterStatus;

/** Everything the ONE atomic cancel statement is given. */
export interface EncounterCancelUpdate {
  /** The validated, LOWERCASE-normalised path identifier. */
  readonly encounterId: string;
  /** The ADMITTED user — never a caller-supplied identity. Written to `updated_by`. */
  readonly updatedBy: string;
}

/** The single outcome the atomic cancel statement decided. */
export type EncounterCancelOutcome =
  | 'CANCELLED'
  /** Nonexistent and tenant-invisible — the same empty set to the statement. */
  | 'NOT_FOUND'
  /** Visible, but in a status that is not a phase 5 cancel source. */
  | 'INVALID_STATE_TRANSITION'
  /** Visible and cancellable, yet not updated — a broken invariant; fails closed. */
  | 'INCONSISTENT';

/** Everything a SUCCESSFUL cancel statement returns, from the same statement. */
export interface EncounterCancelApplied {
  /** The closed `200` projection material, built from the row the `UPDATE` returned. */
  readonly projection: EncounterProjectionRow;
  /** The status of the locked row BEFORE the update. */
  readonly previousStatus: string;
  /** The version of the locked row BEFORE the update. */
  readonly previousVersion: number;
}

/** The result of the ONE atomic cancel statement. */
export type EncounterCancelResult =
  | { readonly outcome: 'CANCELLED'; readonly applied: EncounterCancelApplied }
  | { readonly outcome: Exclude<EncounterCancelOutcome, 'CANCELLED'> };

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

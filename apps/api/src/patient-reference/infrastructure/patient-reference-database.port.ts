/**
 * The database port of the patient-reference feature — the row shape and the statement label.
 *
 * WHY THIS IS A SEPARATE PORT AND NOT A METHOD ON THE IDENTITY PORT
 *
 * D-073 is explicit: "feature-specifično patient-reference DB ponašanje ostaje u feature
 * adapteru". `IdentityBootstrapSession` owns the identity/tenant ADMISSION statements and must
 * not acquire a method per business table; the SMALL_ADAPTER seam it exposes
 * (`runTenantStatement`) is deliberately feature-agnostic and names no table at all. The
 * statement below therefore lives here, in the feature, and reaches the pinned connection
 * through the `TenantDatabaseService` facade.
 *
 * COLUMN DISCIPLINE IS THE WHOLE OF THE PROJECTION ARGUMENT (M-1)
 *
 * `patient_references` carries a TABLE-level `SELECT` grant (`013_rls_policies_phase5`), not the
 * column-level grants `users`, `practices` and `practice_settings` carry. There is therefore NO
 * SQLSTATE `42501` backstop here: an over-projecting statement would simply succeed. The six
 * columns below are consequently load-bearing rather than merely tidy, and they are enforced by
 * a permanent structural test over the statement itself, by the explicit member-by-member
 * projection, and by response-surface tests — never by the database.
 */

/**
 * The stable, non-secret label of the ONE patient-reference statement.
 *
 * It is exported so the production adapter, the recording session harness and the behavioural
 * specs all name the same literal, and so a spec asserting the order of executed statements
 * cannot drift from the statement it is asserting about. It carries no value: not the practice,
 * not the resource id, not a fragment of either.
 */
export const PATIENT_REFERENCE_READ_STATEMENT = 'select patient_reference';

/**
 * The row the one tenant-scoped statement projects — exactly the six columns needed to build the
 * six public members of `PatientReferenceResponseDto`, and not one more.
 *
 * ABSENT HERE, AND ABSENT FROM THE STATEMENT: `practice_id`, `updated_at`,
 * `external_patient_ref_hash`, `external_patient_ref_ciphertext`, `external_patient_ref_iv`,
 * `external_patient_ref_auth_tag`, `encryption_algorithm`, `encryption_version`,
 * `encryption_key_ref` and `encryption_key_version`. The tenant column is a PREDICATE of the
 * statement and never a projected member: naming it in the `SELECT` list would put the tenant of
 * the row one careless spread away from the response.
 *
 * `birthYear` and `sexCode` are nullable exactly as their columns are (`02` §11). `createdAt` is
 * a `Date` here and becomes a string only in the projection, where the D-073 wire format is
 * applied.
 */
export interface PatientReferenceRow {
  readonly id: string;
  readonly pseudonym: string;
  readonly birthYear: number | null;
  readonly sexCode: string | null;
  readonly sourceSystem: string;
  readonly createdAt: Date;
}

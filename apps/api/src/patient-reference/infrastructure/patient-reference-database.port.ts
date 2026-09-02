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

/**
 * The stable, non-secret label of the targeted-conflict `INSERT` of `P5-I4C`.
 *
 * It names WHICH statement ran and carries no value — not the candidate pseudonym, not the
 * attempt number, not the keyed external-reference token. The SAME label is recorded for every
 * one of the at-most-five attempts, so a behavioural spec asserts the attempt COUNT by counting
 * occurrences rather than by reading a number the production code would have had to expose
 * (`08` §12.12 obligations 7 and 8: no candidate, attempt number or collision count is
 * observable).
 */
export const PATIENT_REFERENCE_INSERT_STATEMENT = 'insert patient_reference';

/** The service-level lookup by canonical pseudonym (`CO-P5-I3-I4-1`; `04` §7.5a.3). */
export const PATIENT_REFERENCE_PSEUDONYM_LOOKUP_STATEMENT = 'select patient_reference_by_pseudonym';

/** The service-level lookup by keyed external-reference token (`CO-P5-I3-I4-2`; `04` §7.5a.3). */
export const PATIENT_REFERENCE_EXTERNAL_REFERENCE_LOOKUP_STATEMENT =
  'select patient_reference_by_external_reference';

/**
 * `patient_references_pseudonym_key` — `unique (practice_id, pseudonym)`
 * (`003_patient_encounter_documents`).
 *
 * It is a NAMED STANDALONE UNIQUE INDEX and not a table-level constraint, which is precisely why
 * the statement infers the conflict target by COLUMN LIST rather than naming it with
 * `ON CONFLICT ON CONSTRAINT` — that form is not valid over a bare index (`04` §7.5a.3, "Utvrđeno
 * pri vlasničkoj verifikaciji").
 *
 * The name is nevertheless recorded here because the `23505` mapping of `04` §7.5a.3 is stated in
 * terms of it, and because a diagnostic that ever saw this name would mean the conflict target had
 * stopped covering the pseudonym — which is a defect, not a duplicate.
 */
export const PSEUDONYM_UNIQUE_INDEX = 'patient_references_pseudonym_key';

/**
 * `patient_references_source_external_ref_key` —
 * `unique (practice_id, source_system, external_patient_ref_hash)`.
 *
 * The ONLY unique violation this contract maps to `409 PATIENT_REFERENCE_ALREADY_EXISTS`
 * (`03` §11; D-072 `OD-P5-I4-10`). Every other `23505` is `500 INTERNAL_ERROR`.
 */
export const EXTERNAL_REFERENCE_UNIQUE_INDEX = 'patient_references_source_external_ref_key';

/**
 * Everything ONE patient-reference `INSERT` writes.
 *
 * ABSENT HERE, AND ABSENT FROM THE STATEMENT: the RAW external patient reference, and every
 * encryption-envelope column — `external_patient_ref_ciphertext`, `external_patient_ref_iv`,
 * `external_patient_ref_auth_tag`, `encryption_algorithm`, `encryption_version`,
 * `encryption_key_ref` and `encryption_key_version`. The envelope is OUT OF SCOPE for `P5-I4C`
 * (D-079 `RULING B`), the columns are nullable, and
 * `patient_references_external_patient_ref_envelope_check` admits the all-absent case, so leaving
 * them unwritten is the schema's own supported state and requires no migration.
 *
 * There is no member for the plaintext identifier, so it cannot be persisted by accident: only
 * its keyed token travels this far.
 */
export interface PatientReferenceInsert {
  /** The application-generated `patient_references.id`. */
  readonly id: string;
  /** The ADMITTED practice — the value in `app.practice_id`, never a route input. */
  readonly practiceId: string;
  /** `MANUAL` — the only `source_system` `P5-I4` accepts (D-072 `OD-P5-I4-9`). */
  readonly sourceSystem: string;
  /**
   * `external_patient_ref_hash` — the keyed lookup token, `h1.<64 lowercase hex>`.
   *
   * Domain-separated, practice-scoped and `sourceSystem`-scoped by construction (D-060, D-070).
   * It is never rendered into a response, a log or an audit row (D-060 clause 38).
   */
  readonly externalPatientRefHash: string;
  /** ONE candidate pseudonym. A fresh one is drawn for each attempt. */
  readonly pseudonym: string;
  /** `number | null`, already proven to be an integer within `1900 .. 2200` when present. */
  readonly birthYear: number | null;
  /** `string | null`, already proven to be one of the closed v1 vocabulary when present. */
  readonly sexCode: string | null;
  /**
   * The single instant of this request, applied to `created_at` AND `updated_at`.
   *
   * `updated_at` is `NOT NULL` with no column default, so a value is required; `created_at` is
   * bound explicitly rather than left to `CURRENT_TIMESTAMP` so that the response, the row and
   * the audit event all describe the same moment.
   */
  readonly instant: Date;
}

/**
 * The insert violated `patient_references_source_external_ref_key`.
 *
 * WHY A TYPE AND NOT A SQLSTATE STRING — the same reason `TenantContextRejectedError` is one. The
 * knowledge that a duplicate is SQLSTATE `23505`, that the shipped driver reports it in one shape
 * rather than another, and that the offending index has a particular name, all belong to the
 * database adapter. The application layer must be able to answer `409
 * PATIENT_REFERENCE_ALREADY_EXISTS` for THIS operation without acquiring any of it, and without a
 * global "23505 means conflict" rule that would also swallow a primary-key collision or a future
 * unique index nobody has mapped yet.
 *
 * The message is static and server-side only. It names no practice, no identifier, no token and
 * no database message, so it can never carry a tenant fact into a log line (`09` §11), and the
 * one caller that catches it replaces it with the shared refusal before it reaches any filter.
 */
export class DuplicateExternalReferenceError extends Error {
  public constructor() {
    super(
      'The patient-reference insert violated patient_references_source_external_ref_key ' +
        '(SQLSTATE 23505).',
    );
    this.name = 'DuplicateExternalReferenceError';
  }
}

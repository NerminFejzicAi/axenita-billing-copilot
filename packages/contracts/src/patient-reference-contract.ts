/**
 * `GET /api/v1/patient-references/{id}` response contract.
 *
 * Normative source: `03_API_CONTRACT_V1.md` §11, "Javni oblik odgovora — tačno šest polja",
 * reproduced member for member. Supporting decisions: D-060 clause 38 (the external reference
 * hash is absent from EVERY response by design), D-062 part H.1 (the `200` body is identical to
 * the `201` body of `POST /patient-references`), D-072 `OD-P5-I4-13` (this is the `P5-I4A`
 * slice), D-073 `OD-P5-I4A-3` (the `createdAt` wire format).
 *
 * `/patient-references/{id}` is a TENANT route whose PATH CARRIES NO PRACTICE IDENTITY
 * (`PATIENT_REFERENCE_GET_TENANT_SCOPE = HEADER_ONLY`, `03` §11). `X-Practice-ID` is mandatory
 * and is read and validated exactly as on every other tenant route; no path/header comparison is
 * performed, because there is no path practice to compare.
 *
 * WHAT THIS CONTRACT DELIBERATELY DOES NOT CONTAIN
 *
 * Six fields exist and a seventh does not. Explicitly absent, and absent from the database
 * projection as well as from this type:
 *
 * - `practiceId` — the tenant of the row is never echoed to the caller;
 * - `updatedAt` — an internal column; `patient_references` is create-once/read-only in phase 5
 *   (`03` §11: no `PATCH`, no `version`, no `archived_at`, no `status`, no delete route);
 * - the external patient identifier, in plaintext or in any other form;
 * - `external_patient_ref_hash` — absent from every response BY DESIGN (D-060 clause 38);
 * - the ciphertext, the IV and the authentication tag of the encrypted external reference;
 * - every encryption metadata column — algorithm, version, key reference, key version.
 *
 * There is no list route, no lookup-by-pseudonym route and no lookup-by-external-reference route
 * in this slice; the two service-level lookups belong to `P5-I4C` and introduce no HTTP route at
 * all (D-072 `OD-P5-I4-14`).
 */

/**
 * The complete `GET /patient-references/{id}` document — exactly six members.
 *
 * `birthYear` and `sexCode` are nullable because their columns are (`02` §11): a patient
 * reference may carry neither. `sourceSystem` is typed as a plain string rather than as an
 * `integration_provider` vocabulary, for the same reason `PracticeResponseDto.status` is: this
 * package publishes the HTTP shape, not the database enum.
 *
 * `createdAt` is the canonical public wire form of `patient_references.created_at`:
 *
 *     PATIENT_REFERENCE_CREATED_AT_FORMAT     = UTC_ISO8601_MILLISECONDS_Z
 *     PATIENT_REFERENCE_CREATED_AT_SERIALIZER = DATE_TO_ISO_STRING
 *
 * that is `YYYY-MM-DDTHH:mm:ss.sssZ` with `.toISOString()` semantics — UTC, a terminal upper-case
 * `Z`, exactly three fractional digits, milliseconds preserved and `.000` emitted for a whole
 * second. Never `+00:00`, never a locale rendering and never six fractional digits (D-073
 * `OD-P5-I4A-3`). The column stays `timestamptz(6)`; the API promises millisecond precision and
 * does not promise to preserve sub-millisecond precision.
 *
 * This format is NOT the audit self-hash payload format
 * (`AUDIT_OCCURRED_AT_FORMAT = UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO`, D-072
 * `OD-P5-I4-4`). The two govern different surfaces — a public API serialisation and a persistent
 * hash canonicalisation — and are not competing formats.
 */
export interface PatientReferenceResponseDto {
  readonly id: string;
  readonly pseudonym: string;
  readonly birthYear: number | null;
  readonly sexCode: string | null;
  readonly sourceSystem: string;
  readonly createdAt: string;
}

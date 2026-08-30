/**
 * The public patient-reference projection — six members, written out one by one.
 *
 * Normative sources: `03` §11 ("Javni oblik odgovora — tačno šest polja", "`createdAt` — egzaktan
 * javni wire format"); D-060 clause 38; D-062 part H.1; D-073 `OD-P5-I4A-3`; `08` §12.10a points
 * 15-18.
 *
 * THE ROW IS NEVER SPREAD (M-1)
 *
 * `{ ...row }` and `Object.assign({}, row)` appear nowhere below, and must not. `patient_references`
 * carries a TABLE-level `SELECT` grant, so a widened statement would not be refused by the
 * database; building the document member by member is what guarantees that a widened statement, a
 * widened grant or a regenerated Prisma model cannot add a field to the HTTP response by accident.
 * A seventh member is a source change a reviewer sees.
 */

import { type PatientReferenceResponseDto } from '@axenita/contracts';

import { type PatientReferenceRow } from '../infrastructure/patient-reference-database.port.js';

/**
 * The canonical public serialisation of `patient_references.created_at`.
 *
 *     PATIENT_REFERENCE_CREATED_AT_FORMAT     = UTC_ISO8601_MILLISECONDS_Z
 *     PATIENT_REFERENCE_CREATED_AT_SERIALIZER = DATE_TO_ISO_STRING
 *
 * `Date.prototype.toISOString` IS THE CONTRACT, NOT AN IMPLEMENTATION OF IT. Every required
 * property follows deterministically from it rather than from a format string this file would
 * then have to keep correct: UTC, a terminal upper-case `Z`, exactly three fractional digits,
 * milliseconds preserved, and `.000` emitted for a whole second rather than elided.
 *
 *     2026-07-18T10:00:00Z      ->  2026-07-18T10:00:00.000Z
 *     2026-07-18T10:00:00.123Z  ->  2026-07-18T10:00:00.123Z
 *
 * WHAT IS FORBIDDEN AND WHY IT CANNOT HAPPEN HERE. `toLocaleString`, `toString` and every locale
 * rendering are absent; `+00:00` cannot be produced, because `toISOString` never emits a numeric
 * offset; a six-digit fractional public timestamp cannot be produced, because it never emits
 * more than three. The column remains `timestamptz(6)` and no schema, type or migration changes
 * — the API simply does not promise sub-millisecond precision.
 *
 * THIS IS NOT THE AUDIT FORMAT AND MUST NEVER BECOME IT. `AUDIT_OCCURRED_AT_FORMAT =
 * UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO` (D-072 `OD-P5-I4-4`) governs the persistent
 * canonicalisation of an audit hash payload, whose bytes must stay stable because `event_sha256`
 * is retroactively unfixable. They are two surfaces, not two candidates for one surface, and
 * neither is applied to the other (D-073).
 */
function toPublicTimestamp(value: Date): string {
  return value.toISOString();
}

/**
 * Projects one row into the complete public document — exactly six members, and no seventh.
 *
 * Explicitly absent, here and in the statement that produced the row: `practiceId`, `updatedAt`,
 * the external patient identifier, its hash, the ciphertext, the IV, the authentication tag and
 * every encryption metadata field.
 */
export function projectPatientReference(row: PatientReferenceRow): PatientReferenceResponseDto {
  return {
    id: row.id,
    pseudonym: row.pseudonym,
    birthYear: row.birthYear,
    sexCode: row.sexCode,
    sourceSystem: row.sourceSystem,
    createdAt: toPublicTimestamp(row.createdAt),
  };
}

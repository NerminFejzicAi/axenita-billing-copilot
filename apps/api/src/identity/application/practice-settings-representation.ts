/**
 * The ONE rendering of a `practice_settings` row into the frozen HTTP representation, and the
 * ONE rendering of its version into the strong entity tag.
 *
 * Normative sources: D-053 clauses A.1 and A.2; D-055 clauses 1, 2, 22 and 23; `03` §5.2 and §10.
 *
 * WHY THIS MODULE EXISTS
 *
 * `GET` and `PATCH /practices/{practiceId}/settings` share ONE success representation — D-055
 * clause 22 says so literally: a successful `PATCH` returns "the SAME frozen eight-field
 * representation as `GET`" with a new strong validator of the same shape. Two copies of that
 * projection would be free to drift, and the drift is exactly the failure the frozen contract
 * exists to prevent: a field added to one route and not the other, or a weak tag emitted by one
 * and a strong tag by the other. Both functions below were MOVED here unchanged from the read
 * service, and both routes now import this one implementation.
 *
 * The move is behaviour-preserving. The projection is member-by-member and identical to the one
 * the read service carried, and the read service's own security and unit suites are the
 * non-regression proof: they assert the eight keys, the absence of `version` from the body and
 * the exact `"<version>"` header, and they were not modified for this slice.
 */

import { type PracticeSettingsResponseDto } from '@axenita/contracts';

import { type PracticeSettingsRow } from '../infrastructure/identity-database.port.js';

/**
 * The strong entity tag of D-053 clause A.2 — the row's integer `version`, quoted.
 *
 * STRONG, AND SET BY THE APPLICATION. `W/"3"` is not this value: a weak tag asserts only
 * semantic equivalence, while `version` is the exact token the optimistic-locking contract of
 * `03` §5.2 compares an `If-Match` against, and the `PATCH` slice treats a returned tag as an
 * exact version (D-055 clause 13). Express would otherwise generate a WEAK, CONTENT-HASHED tag
 * of its own for this response — a tag that changes when the rendering changes and stays equal
 * when only `version` moved, which is precisely the wrong equality. The canonical tag is
 * therefore always set explicitly, and Express leaves an already-set `ETag` alone.
 *
 * `version` is an `integer` column (`02` §6.4), so the rendering is exact and needs no escaping:
 * the tag can only ever be a quoted run of digits. That is also why the accepted `If-Match`
 * grammar of D-055 clause 11 is exactly the shape this function emits — the token a client sends
 * back is the token this line produced.
 */
export function entityTagOf(version: number): string {
  return `"${String(version)}"`;
}

/**
 * The accepted response projection — exactly eight fields, written out one by one.
 *
 * The row is never spread and never returned as-is. Building the document member by member is
 * what guarantees that a future widening of the database projection, of a column grant or of the
 * Prisma model cannot add a field to the HTTP response by accident.
 *
 * `version` IS DELIBERATELY NOT COPIED. It is present on the row — it is the ninth granted
 * column, `GET` reads it on purpose and `UPDATE ... RETURNING` returns it on purpose — and it
 * stops here, at the one place where a row becomes a document. D-053 clause A.2 and D-055
 * clause 2 allow exactly one channel for the current version, and that channel is the `ETag`.
 * A spread would have published it silently; this projection cannot.
 */
export function projectPracticeSettings(
  settings: PracticeSettingsRow,
): PracticeSettingsResponseDto {
  return {
    practiceId: settings.practiceId,
    billingReviewRequired: settings.billingReviewRequired,
    allowMpaApproval: settings.allowMpaApproval,
    allowBillingSpecialistApproval: settings.allowBillingSpecialistApproval,
    requireReasonForManualChange: settings.requireReasonForManualChange,
    aiEnabled: settings.aiEnabled,
    axenitaExportEnabled: settings.axenitaExportEnabled,
    retentionPolicyCode: settings.retentionPolicyCode,
  };
}
